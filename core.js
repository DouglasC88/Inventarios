/* ============================================================================
 * core.js — Lógica pura del conversor (sin DOM).
 * Convierte archivos del cliente (Excel/CSV/TXT) al formato de carga de Dentos
 * (TXT delimitado por tabulación, sin encabezado).
 *
 * Se escribe de forma que funcione tanto en el navegador (window.Core) como
 * en Node (module.exports) para poder probarlo con tests.
 * ==========================================================================*/
(function (root) {
  'use strict';

  /* ---- Formato de salida por defecto que pide Dentos -----------------------
   * AJUSTA AQUÍ cuando tengas el formato exacto: orden y nombre de cada campo.
   * Son los valores que se cargan la primera vez; luego son editables desde la
   * interfaz (pestaña "Formato Dentos") y quedan guardados en el navegador.
   * -------------------------------------------------------------------------*/
  var FORMATO_DEFAULT = {
    insumos: ['codigo', 'descripcion', 'unidad', 'categoria', 'stock', 'costo'],
    kardex: ['fecha', 'codigo', 'descripcion', 'tipo', 'cantidad', 'costo', 'referencia']
  };

  var OPCIONES_DEFAULT = {
    delimitadorSalida: '\t', // TAB
    incluirEncabezado: false,
    finDeLinea: '\r\n',      // CRLF, lo más compatible con sistemas Windows
    codificacion: 'utf-8'    // 'utf-8' | 'windows-1252'
  };

  /* ---- Detección y parseo de texto delimitado (CSV / TXT) ------------------*/

  // Adivina el delimitador comparando cuál produce columnas más consistentes.
  function detectarDelimitador(texto) {
    var candidatos = ['\t', ';', ',', '|'];
    var muestra = texto.split(/\r\n|\r|\n/).filter(function (l) { return l.trim() !== ''; }).slice(0, 10);
    if (muestra.length === 0) return ',';
    var mejor = ',', mejorPuntaje = -1;
    candidatos.forEach(function (d) {
      var conteos = muestra.map(function (l) { return contarFuera(l, d); });
      var max = Math.max.apply(null, conteos);
      if (max === 0) return; // ese delimitador no aparece
      // puntaje: muchas columnas y consistentes entre filas
      var consistentes = conteos.filter(function (c) { return c === max; }).length;
      var puntaje = max * 10 + consistentes;
      if (puntaje > mejorPuntaje) { mejorPuntaje = puntaje; mejor = d; }
    });
    return mejor;
  }

  // Cuenta delimitadores que NO están dentro de comillas.
  function contarFuera(linea, delim) {
    var n = 0, enComillas = false;
    for (var i = 0; i < linea.length; i++) {
      var c = linea[i];
      if (c === '"') enComillas = !enComillas;
      else if (c === delim && !enComillas) n++;
    }
    return n;
  }

  // Parser CSV/TXT con soporte de comillas dobles y saltos de línea internos.
  // Devuelve un arreglo de arreglos (filas de celdas string).
  function parsearDelimitado(texto, delim) {
    var filas = [], fila = [], campo = '', i = 0, enComillas = false;
    // quita BOM si existe
    if (texto.charCodeAt(0) === 0xFEFF) texto = texto.slice(1);
    while (i < texto.length) {
      var c = texto[i];
      if (enComillas) {
        if (c === '"') {
          if (texto[i + 1] === '"') { campo += '"'; i += 2; continue; }
          enComillas = false; i++; continue;
        }
        campo += c; i++; continue;
      }
      if (c === '"') { enComillas = true; i++; continue; }
      if (c === delim) { fila.push(campo); campo = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; i++; continue; }
      campo += c; i++;
    }
    // último campo/fila si el archivo no termina en salto de línea
    if (campo !== '' || fila.length > 0) { fila.push(campo); filas.push(fila); }
    return filas;
  }

  // Asegura que todas las filas tengan la misma cantidad de columnas.
  function rectangular(aoa) {
    var ancho = aoa.reduce(function (m, f) { return Math.max(m, f.length); }, 0);
    return aoa.map(function (f) {
      var copia = f.slice();
      while (copia.length < ancho) copia.push('');
      return copia.map(function (v) { return v == null ? '' : String(v); });
    });
  }

  // Nombres de columnas: desde la 1ª fila (encabezado) o "Columna 1, 2, ...".
  function obtenerColumnas(aoa, tieneEncabezado) {
    if (aoa.length === 0) return [];
    var ancho = aoa[0].length;
    if (tieneEncabezado) {
      return aoa[0].map(function (v, idx) {
        var nombre = String(v == null ? '' : v).trim();
        return nombre === '' ? 'Columna ' + (idx + 1) : nombre;
      });
    }
    var cols = [];
    for (var i = 0; i < ancho; i++) cols.push('Columna ' + (i + 1));
    return cols;
  }

  // Filas de datos (sin el encabezado si corresponde).
  function filasDatos(aoa, tieneEncabezado) {
    return tieneEncabezado ? aoa.slice(1) : aoa.slice();
  }

  /* ---- Limpieza de valores --------------------------------------------------
   * Quita tabuladores y saltos de línea de las celdas para no romper el TXT
   * delimitado por tabulación.
   * -------------------------------------------------------------------------*/
  function limpiarCelda(valor) {
    if (valor == null) return '';
    return String(valor).replace(/[\t\r\n]+/g, ' ').trim();
  }

  /* ---- Generación de la salida ---------------------------------------------
   * @param aoa         matriz completa del archivo (incluye encabezado si hay)
   * @param columnas    nombres de columnas del archivo
   * @param tieneEnc    bool: la 1ª fila es encabezado
   * @param formato     arreglo ordenado de campos destino de Dentos
   * @param mapeo       { campoDestino: {tipo:'columna'|'fijo'|'vacio', valor} }
   * @param opciones    OPCIONES_DEFAULT (delimitador, encabezado, eol)
   * Devuelve { texto, filas, vacias } (vacias = filas totalmente en blanco que
   * se omitieron).
   * -------------------------------------------------------------------------*/
  function generarSalida(aoa, columnas, tieneEnc, formato, mapeo, opciones) {
    var op = Object.assign({}, OPCIONES_DEFAULT, opciones || {});
    var datos = filasDatos(rectangular(aoa), tieneEnc);
    var indicePorColumna = {};
    columnas.forEach(function (nombre, idx) { indicePorColumna[nombre] = idx; });

    var lineas = [], vacias = 0;
    datos.forEach(function (fila) {
      var todaVacia = fila.every(function (c) { return limpiarCelda(c) === ''; });
      if (todaVacia) { vacias++; return; }
      var celdas = formato.map(function (campo) {
        var m = mapeo[campo] || { tipo: 'vacio' };
        if (m.tipo === 'fijo') return limpiarCelda(m.valor);
        if (m.tipo === 'columna') {
          var idx = indicePorColumna[m.valor];
          return idx == null ? '' : limpiarCelda(fila[idx]);
        }
        return '';
      });
      lineas.push(celdas.join(op.delimitadorSalida));
    });

    var partes = [];
    if (op.incluirEncabezado) partes.push(formato.join(op.delimitadorSalida));
    partes = partes.concat(lineas);
    return { texto: partes.join(op.finDeLinea), filas: lineas.length, vacias: vacias };
  }

  /* ---- Codificación a bytes para la descarga -------------------------------*/

  // Mapa inverso para los caracteres especiales 0x80–0x9F de Windows-1252.
  var WIN1252_ESPECIALES = {
    0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85,
    0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A,
    0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92,
    0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
    0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C,
    0x017E: 0x9E, 0x0178: 0x9F
  };

  function aWindows1252(texto) {
    var out = new Uint8Array(texto.length);
    for (var i = 0; i < texto.length; i++) {
      var cp = texto.charCodeAt(i);
      if (cp <= 0xFF) out[i] = cp;                  // ASCII + Latin-1 (incluye áéíóúñü¿¡)
      else if (WIN1252_ESPECIALES[cp] != null) out[i] = WIN1252_ESPECIALES[cp];
      else out[i] = 0x3F;                            // '?' para lo no representable
    }
    return out;
  }

  // Devuelve un Uint8Array con el texto codificado.
  function codificar(texto, codificacion) {
    if (codificacion === 'windows-1252') return aWindows1252(texto);
    // UTF-8
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(texto);
    return aWindows1252(texto); // respaldo en entornos sin TextEncoder
  }

  var Core = {
    FORMATO_DEFAULT: FORMATO_DEFAULT,
    OPCIONES_DEFAULT: OPCIONES_DEFAULT,
    detectarDelimitador: detectarDelimitador,
    parsearDelimitado: parsearDelimitado,
    rectangular: rectangular,
    obtenerColumnas: obtenerColumnas,
    filasDatos: filasDatos,
    limpiarCelda: limpiarCelda,
    generarSalida: generarSalida,
    codificar: codificar,
    aWindows1252: aWindows1252
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
  root.Core = Core;
})(typeof window !== 'undefined' ? window : this);
