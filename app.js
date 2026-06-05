/* ============================================================================
 * app.js — Interfaz del conversor (usa Core y XLSX/SheetJS).
 *
 * Flujo: se carga UN archivo del cliente (compartido) y dos módulos
 * (Insumos y Kardex) lo reutilizan, cada uno con su mapeo y plantillas.
 * ==========================================================================*/
(function () {
  'use strict';

  var LS_KEY = 'dentos_conv_v1';
  var TIPOS = ['insumos', 'kardex'];

  // Estado persistente (formato editable, opciones de salida, plantillas).
  var ESTADO = {
    formato: { insumos: Core.FORMATO_DEFAULT.insumos.slice(), kardex: Core.FORMATO_DEFAULT.kardex.slice() },
    opciones: { delim: '\\t', encabezado: 'no', eol: 'crlf', encode: 'utf-8' },
    plantillas: { insumos: {}, kardex: {} }
  };

  // Archivo cargado en memoria (NO se persiste).
  var ARCHIVO = null; // {nombre, tipo:'excel'|'texto', workbook, hojas, hojaActiva, buffer, aoa, columnas, tieneEncabezado}

  // Referencias a los elementos .modulo ya clonados, por tipo.
  var MODULOS = {};

  /* ---- Utilidades cortas ---- */
  function q(sel, ctx) { return (ctx || document).querySelector(sel); }
  function qa(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function decodeDelim(v) { return v === '\\t' ? '\t' : v; }
  function norm(s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  }

  function toast(msg, tipo) {
    var t = q('#toast');
    t.textContent = msg;
    t.className = 'toast' + (tipo ? ' ' + tipo : '');
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 3200);
  }

  /* ---- Persistencia ---- */
  function guardar() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(ESTADO)); }
    catch (e) { toast('No se pudo guardar la configuración', 'err'); }
  }
  function cargarEstado() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      var d = JSON.parse(raw);
      if (d.formato) {
        if (Array.isArray(d.formato.insumos)) ESTADO.formato.insumos = d.formato.insumos;
        if (Array.isArray(d.formato.kardex)) ESTADO.formato.kardex = d.formato.kardex;
      }
      if (d.opciones) Object.assign(ESTADO.opciones, d.opciones);
      if (d.plantillas) {
        ESTADO.plantillas.insumos = d.plantillas.insumos || {};
        ESTADO.plantillas.kardex = d.plantillas.kardex || {};
      }
    } catch (e) { /* configuración corrupta: se ignora */ }
  }

  function opcionesSalida() {
    return {
      delimitadorSalida: decodeDelim(ESTADO.opciones.delim),
      incluirEncabezado: ESTADO.opciones.encabezado === 'si',
      finDeLinea: ESTADO.opciones.eol === 'crlf' ? '\r\n' : '\n',
      codificacion: ESTADO.opciones.encode
    };
  }

  /* =========================================================================
   * CARGA DE ARCHIVO
   * =======================================================================*/
  function decodificar(buffer, modo) {
    var bytes = new Uint8Array(buffer);
    if (modo === 'windows-1252') return new TextDecoder('windows-1252').decode(bytes);
    if (modo === 'utf-8') return new TextDecoder('utf-8').decode(bytes);
    // auto: intenta UTF-8; si aparecen caracteres de reemplazo, usa Windows-1252
    var t = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    return t.indexOf('\uFFFD') >= 0 ? new TextDecoder('windows-1252').decode(bytes) : t;
  }

  function cargarArchivo(file) {
    var nombre = file.name || 'archivo';
    var ext = nombre.indexOf('.') >= 0 ? nombre.split('.').pop().toLowerCase() : '';
    var reader = new FileReader();
    reader.onerror = function () { toast('No se pudo leer el archivo', 'err'); };
    reader.onload = function (e) {
      try {
        if (ext === 'xlsx' || ext === 'xls') {
          if (typeof XLSX === 'undefined') { toast('No cargó la librería de Excel', 'err'); return; }
          var wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
          ARCHIVO = { nombre: nombre, tipo: 'excel', workbook: wb, hojas: wb.SheetNames.slice(), hojaActiva: wb.SheetNames[0] };
        } else {
          ARCHIVO = { nombre: nombre, tipo: 'texto', buffer: e.target.result };
        }
        trasCargar();
      } catch (err) {
        toast('Error al procesar el archivo: ' + err.message, 'err');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function trasCargar() {
    var badge = q('#archivo-badge');
    badge.textContent = ARCHIVO.nombre + ' · ' + (ARCHIVO.tipo === 'excel' ? 'Excel' : 'Texto');
    badge.hidden = false;
    q('#archivo-opciones').hidden = false;
    document.body.classList.add('hay-archivo');

    var esExcel = ARCHIVO.tipo === 'excel';
    // Selector de hoja sólo si Excel con más de una hoja
    var lblHoja = q('#lbl-hoja'), selHoja = q('#sel-hoja');
    if (esExcel && ARCHIVO.hojas.length > 1) {
      selHoja.innerHTML = ARCHIVO.hojas.map(function (h) { return '<option>' + escapeHtml(h) + '</option>'; }).join('');
      selHoja.value = ARCHIVO.hojaActiva;
      lblHoja.hidden = false;
    } else {
      lblHoja.hidden = true;
    }
    // Delimitador y codificación sólo aplican a texto
    q('#lbl-delim').hidden = esExcel;
    q('#lbl-encode').hidden = esExcel;

    recomputar();
  }

  // Recalcula la matriz (aoa) y las columnas según los controles actuales.
  function recomputar() {
    if (!ARCHIVO) return;
    var tieneEnc = q('#sel-encabezado').value === 'si';
    if (ARCHIVO.tipo === 'excel') {
      ARCHIVO.hojaActiva = q('#sel-hoja').value || ARCHIVO.hojas[0];
      var ws = ARCHIVO.workbook.Sheets[ARCHIVO.hojaActiva];
      ARCHIVO.aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false, blankrows: false });
    } else {
      var texto = decodificar(ARCHIVO.buffer, q('#sel-encode-in').value);
      var dv = q('#sel-delim').value;
      var delim = dv === 'auto' ? Core.detectarDelimitador(texto) : decodeDelim(dv);
      ARCHIVO.delim = delim;
      ARCHIVO.aoa = Core.parsearDelimitado(texto, delim);
    }
    ARCHIVO.aoa = Core.rectangular(ARCHIVO.aoa);
    ARCHIVO.tieneEncabezado = tieneEnc;
    ARCHIVO.columnas = Core.obtenerColumnas(ARCHIVO.aoa, tieneEnc);

    renderPreview();
    TIPOS.forEach(function (tipo) { renderMapeo(tipo, true); });
  }

  function quitarArchivo() {
    ARCHIVO = null;
    document.body.classList.remove('hay-archivo');
    q('#archivo-opciones').hidden = true;
    q('#archivo-badge').hidden = true;
    q('#input-archivo').value = '';
    q('#tabla-preview').querySelector('thead').innerHTML = '';
    q('#tabla-preview').querySelector('tbody').innerHTML = '';
    q('#preview-resumen').textContent = '';
  }

  function renderPreview() {
    var thead = q('#tabla-preview thead'), tbody = q('#tabla-preview tbody');
    thead.innerHTML = '<tr>' + ARCHIVO.columnas.map(function (c) { return '<th>' + escapeHtml(c) + '</th>'; }).join('') + '</tr>';
    var datos = Core.filasDatos(ARCHIVO.aoa, ARCHIVO.tieneEncabezado);
    var muestra = datos.slice(0, 8);
    tbody.innerHTML = muestra.map(function (fila) {
      return '<tr>' + ARCHIVO.columnas.map(function (_, i) { return '<td>' + escapeHtml(fila[i] == null ? '' : fila[i]) + '</td>'; }).join('') + '</tr>';
    }).join('');
    q('#preview-resumen').textContent = datos.length + ' fila(s) de datos · ' + ARCHIVO.columnas.length + ' columna(s)'
      + (muestra.length < datos.length ? ' · mostrando ' + muestra.length : '');
  }

  /* =========================================================================
   * MAPEO (por módulo)
   * =======================================================================*/
  function autoSugerir(tipo) {
    var m = {};
    var cols = ARCHIVO ? ARCHIVO.columnas : [];
    var colsNorm = cols.map(norm);
    ESTADO.formato[tipo].forEach(function (campo) {
      var cn = norm(campo);
      var idx = colsNorm.indexOf(cn);
      if (idx < 0) idx = colsNorm.findIndex(function (c) { return c && (c.indexOf(cn) >= 0 || cn.indexOf(c) >= 0); });
      m[campo] = idx >= 0 ? { tipo: 'columna', valor: cols[idx] } : { tipo: 'vacio' };
    });
    return m;
  }

  function leerMapeo(mod) {
    var m = {};
    qa('.map-origen', mod).forEach(function (sel) {
      var campo = sel.dataset.campo, v = sel.value;
      if (v === '__vacio__') m[campo] = { tipo: 'vacio' };
      else if (v === '__fijo__') {
        var inp = qa('.map-fijo', mod).filter(function (i) { return i.dataset.campo === campo; })[0];
        m[campo] = { tipo: 'fijo', valor: inp ? inp.value : '' };
      } else m[campo] = { tipo: 'columna', valor: v.slice(5) };
    });
    return m;
  }

  function renderMapeo(tipo, preservar) {
    var mod = MODULOS[tipo];
    if (!mod) return;
    var prev = (preservar && qa('.map-origen', mod).length) ? leerMapeo(mod) : null;
    var auto = autoSugerir(tipo);
    var cols = ARCHIVO ? ARCHIVO.columnas : [];
    var body = q('.mapeo-body', mod);

    body.innerHTML = ESTADO.formato[tipo].map(function (campo) {
      var opciones = '<option value="__vacio__">— (vacío) —</option>' +
        '<option value="__fijo__">✏️ Valor fijo…</option>';
      if (cols.length) {
        opciones += '<optgroup label="Columnas del archivo">' +
          cols.map(function (c) { return '<option value="col::' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>'; }).join('') +
          '</optgroup>';
      }
      return '<tr>' +
        '<td>' + escapeHtml(campo) + '</td>' +
        '<td><select class="map-origen" data-campo="' + escapeHtml(campo) + '">' + opciones + '</select></td>' +
        '<td><input class="map-fijo" data-campo="' + escapeHtml(campo) + '" placeholder="valor fijo" hidden /></td>' +
        '</tr>';
    }).join('');

    // Base: autosugerencia. Se preserva lo anterior SOLO si era un valor fijo o
    // una columna que sigue existiendo (un "vacío" previo no debe bloquear la
    // sugerencia, p. ej. al cargar el archivo por primera vez).
    qa('.map-origen', mod).forEach(function (sel) {
      var campo = sel.dataset.campo;
      var deseado = auto[campo];
      if (prev && prev[campo]) {
        var p = prev[campo];
        if (p.tipo === 'fijo' || (p.tipo === 'columna' && cols.indexOf(p.valor) >= 0)) deseado = p;
      }
      aplicarSeleccion(sel, mod, campo, deseado, cols);
      sel.addEventListener('change', function () { sincronizarFijo(sel, mod); });
    });
  }

  function aplicarSeleccion(sel, mod, campo, m, cols) {
    var inp = qa('.map-fijo', mod).filter(function (i) { return i.dataset.campo === campo; })[0];
    if (m && m.tipo === 'fijo') {
      sel.value = '__fijo__';
      if (inp) { inp.hidden = false; inp.value = m.valor || ''; }
    } else if (m && m.tipo === 'columna' && cols.indexOf(m.valor) >= 0) {
      sel.value = 'col::' + m.valor;
      if (inp) inp.hidden = true;
    } else {
      sel.value = '__vacio__';
      if (inp) inp.hidden = true;
    }
  }

  function sincronizarFijo(sel, mod) {
    var campo = sel.dataset.campo;
    var inp = qa('.map-fijo', mod).filter(function (i) { return i.dataset.campo === campo; })[0];
    if (inp) inp.hidden = sel.value !== '__fijo__';
  }

  /* =========================================================================
   * GENERAR Y DESCARGAR
   * =======================================================================*/
  function generarYDescargar(tipo) {
    if (!ARCHIVO) { toast('Primero carga un archivo del cliente', 'err'); return; }
    var mod = MODULOS[tipo];
    var op = opcionesSalida();
    var r = Core.generarSalida(ARCHIVO.aoa, ARCHIVO.columnas, ARCHIVO.tieneEncabezado, ESTADO.formato[tipo], leerMapeo(mod), op);

    // Vista previa (tabulaciones visibles como →)
    var lineas = r.texto === '' ? [] : r.texto.split(op.finDeLinea);
    var vista = lineas.slice(0, 15).map(function (l) { return l.split(op.delimitadorSalida).join(' → '); }).join('\n');
    q('.salida-preview', mod).textContent = vista + (lineas.length > 15 ? '\n… (' + lineas.length + ' líneas en total)' : '');
    q('.resumen-salida', mod).textContent = r.filas + ' fila(s) generada(s) · ' + r.vacias + ' vacía(s) omitida(s) · ' + ESTADO.formato[tipo].length + ' columna(s)';

    if (r.filas === 0) { toast('No hay filas para exportar', 'err'); return; }

    var bytes = Core.codificar(r.texto, op.codificacion);
    var blob = new Blob([bytes], { type: 'text/plain;charset=' + op.codificacion });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = tipo + '.txt';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    toast('Generado: ' + tipo + '.txt (' + r.filas + ' filas)', 'ok');
  }

  /* =========================================================================
   * PLANTILLAS (por módulo)
   * =======================================================================*/
  function refrescarPlantillas(tipo) {
    var mod = MODULOS[tipo];
    var sel = q('.sel-plantilla', mod);
    var nombres = Object.keys(ESTADO.plantillas[tipo]);
    sel.innerHTML = '<option value="">— Aplicar plantilla —</option>' +
      nombres.map(function (n) { return '<option value="' + escapeHtml(n) + '">' + escapeHtml(n) + '</option>'; }).join('');
  }

  function guardarPlantilla(tipo) {
    var mod = MODULOS[tipo];
    var nombre = (prompt('Nombre de la plantilla (ej. cliente "Sonrisa Sana"):') || '').trim();
    if (!nombre) return;
    if (ESTADO.plantillas[tipo][nombre] && !confirm('Ya existe "' + nombre + '". ¿Reemplazar?')) return;
    ESTADO.plantillas[tipo][nombre] = {
      mapeo: leerMapeo(mod),
      entrada: { encabezado: q('#sel-encabezado').value, delim: q('#sel-delim').value, encode: q('#sel-encode-in').value }
    };
    guardar();
    refrescarPlantillas(tipo);
    q('.sel-plantilla', mod).value = nombre;
    toast('Plantilla "' + nombre + '" guardada', 'ok');
  }

  function aplicarPlantilla(tipo, nombre) {
    if (!nombre) return;
    var pl = ESTADO.plantillas[tipo][nombre];
    if (!pl) return;
    // Restaura opciones de entrada y recalcula el archivo (si hay uno cargado).
    if (pl.entrada) {
      if (pl.entrada.encabezado) q('#sel-encabezado').value = pl.entrada.encabezado;
      if (pl.entrada.delim) q('#sel-delim').value = pl.entrada.delim;
      if (pl.entrada.encode) q('#sel-encode-in').value = pl.entrada.encode;
      if (ARCHIVO) recomputar();
    }
    // Aplica el mapeo guardado al módulo.
    var mod = MODULOS[tipo];
    var cols = ARCHIVO ? ARCHIVO.columnas : [];
    var faltan = 0;
    qa('.map-origen', mod).forEach(function (sel) {
      var campo = sel.dataset.campo;
      var m = pl.mapeo[campo];
      if (m && m.tipo === 'columna' && cols.indexOf(m.valor) < 0) { faltan++; m = { tipo: 'vacio' }; }
      aplicarSeleccion(sel, mod, campo, m || { tipo: 'vacio' }, cols);
    });
    toast('Plantilla "' + nombre + '" aplicada' + (faltan ? ' (' + faltan + ' columna(s) no estaban en el archivo)' : ''), faltan ? '' : 'ok');
  }

  function borrarPlantilla(tipo) {
    var mod = MODULOS[tipo];
    var nombre = q('.sel-plantilla', mod).value;
    if (!nombre) { toast('Selecciona una plantilla para borrar', 'err'); return; }
    if (!confirm('¿Borrar la plantilla "' + nombre + '"?')) return;
    delete ESTADO.plantillas[tipo][nombre];
    guardar();
    refrescarPlantillas(tipo);
    toast('Plantilla borrada', 'ok');
  }

  /* =========================================================================
   * FORMATO DENTOS (editor de campos de salida)
   * =======================================================================*/
  function renderCampos(tipo) {
    var ul = q('#campos-' + tipo);
    ul.innerHTML = ESTADO.formato[tipo].map(function (campo, i) {
      return '<li data-i="' + i + '">' +
        '<span class="orden-num">' + (i + 1) + '.</span>' +
        '<span class="campo-nombre">' + escapeHtml(campo) + '</span>' +
        '<button data-act="up" title="Subir">▲</button>' +
        '<button data-act="down" title="Bajar">▼</button>' +
        '<button data-act="ren" title="Renombrar">✏️</button>' +
        '<button data-act="del" title="Eliminar">✖</button>' +
        '</li>';
    }).join('');
  }

  function accionCampo(tipo, i, act) {
    var arr = ESTADO.formato[tipo];
    if (act === 'up' && i > 0) { var a = arr[i - 1]; arr[i - 1] = arr[i]; arr[i] = a; }
    else if (act === 'down' && i < arr.length - 1) { var b = arr[i + 1]; arr[i + 1] = arr[i]; arr[i] = b; }
    else if (act === 'del') {
      if (arr.length <= 1) { toast('Debe quedar al menos un campo', 'err'); return; }
      if (!confirm('¿Eliminar el campo "' + arr[i] + '"?')) return;
      arr.splice(i, 1);
    } else if (act === 'ren') {
      var nuevo = (prompt('Nuevo nombre del campo:', arr[i]) || '').trim();
      if (!nuevo) return;
      arr[i] = nuevo;
    } else return;
    guardar();
    renderCampos(tipo);
    renderMapeo(tipo, true);
  }

  function agregarCampo(tipo) {
    var inp = q('#nuevo-campo-' + tipo);
    var nombre = (inp.value || '').trim();
    if (!nombre) { toast('Escribe el nombre del campo', 'err'); return; }
    ESTADO.formato[tipo].push(nombre);
    inp.value = '';
    guardar();
    renderCampos(tipo);
    renderMapeo(tipo, true);
    toast('Campo "' + nombre + '" agregado', 'ok');
  }

  /* =========================================================================
   * RESPALDO / RESTAURAR / RESET
   * =======================================================================*/
  function descargarRespaldo() {
    var blob = new Blob([JSON.stringify(ESTADO, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'config-dentos.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    toast('Respaldo descargado', 'ok');
  }

  function restaurarRespaldo(file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var d = JSON.parse(e.target.result);
        if (d.formato) ESTADO.formato = { insumos: d.formato.insumos || ESTADO.formato.insumos, kardex: d.formato.kardex || ESTADO.formato.kardex };
        if (d.opciones) Object.assign(ESTADO.opciones, d.opciones);
        if (d.plantillas) ESTADO.plantillas = { insumos: d.plantillas.insumos || {}, kardex: d.plantillas.kardex || {} };
        guardar();
        sincronizarUI();
        toast('Configuración restaurada', 'ok');
      } catch (err) { toast('Archivo de respaldo inválido', 'err'); }
    };
    reader.readAsText(file);
  }

  function resetConfig() {
    if (!confirm('¿Restaurar el formato y opciones por defecto? (Las plantillas guardadas no se borran.)')) return;
    ESTADO.formato = { insumos: Core.FORMATO_DEFAULT.insumos.slice(), kardex: Core.FORMATO_DEFAULT.kardex.slice() };
    ESTADO.opciones = { delim: '\\t', encabezado: 'no', eol: 'crlf', encode: 'utf-8' };
    guardar();
    sincronizarUI();
    toast('Valores por defecto restaurados', 'ok');
  }

  // Refleja ESTADO en todos los controles y vistas.
  function sincronizarUI() {
    q('#op-delim').value = ESTADO.opciones.delim;
    q('#op-encabezado').value = ESTADO.opciones.encabezado;
    q('#op-eol').value = ESTADO.opciones.eol;
    q('#op-encode').value = ESTADO.opciones.encode;
    TIPOS.forEach(function (tipo) {
      renderCampos(tipo);
      refrescarPlantillas(tipo);
      renderMapeo(tipo, false);
    });
  }

  /* =========================================================================
   * INICIALIZACIÓN
   * =======================================================================*/
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function montarModulos() {
    var tpl = q('#tpl-modulo');
    TIPOS.forEach(function (tipo) {
      var host = q('#tab-' + tipo);
      host.appendChild(tpl.content.cloneNode(true));
      var mod = q('.modulo', host);
      mod.dataset.tipo = tipo;
      MODULOS[tipo] = mod;
      q('.btn-generar', mod).addEventListener('click', function () { generarYDescargar(tipo); });
      q('.btn-guardar-plantilla', mod).addEventListener('click', function () { guardarPlantilla(tipo); });
      q('.btn-borrar-plantilla', mod).addEventListener('click', function () { borrarPlantilla(tipo); });
      q('.sel-plantilla', mod).addEventListener('change', function (e) { aplicarPlantilla(tipo, e.target.value); });
    });
  }

  function wireEventos() {
    // Tabs
    qa('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        qa('.tab').forEach(function (t) { t.classList.remove('active'); });
        qa('.panel-host').forEach(function (p) { p.classList.remove('active'); });
        tab.classList.add('active');
        q('#tab-' + tab.dataset.tab).classList.add('active');
      });
    });

    // Carga de archivo
    var dz = q('#dropzone'), input = q('#input-archivo');
    q('#btn-elegir').addEventListener('click', function () { input.click(); });
    dz.addEventListener('click', function (e) { if (e.target === dz || e.target.classList.contains('dz-icono')) input.click(); });
    input.addEventListener('change', function () { if (input.files[0]) cargarArchivo(input.files[0]); });
    ['dragenter', 'dragover'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('drag'); });
    });
    dz.addEventListener('drop', function (e) {
      if (e.dataTransfer.files && e.dataTransfer.files[0]) cargarArchivo(e.dataTransfer.files[0]);
    });
    q('#btn-quitar-archivo').addEventListener('click', quitarArchivo);

    // Controles del archivo → recalcular
    ['#sel-hoja', '#sel-encabezado', '#sel-delim', '#sel-encode-in'].forEach(function (sel) {
      q(sel).addEventListener('change', recomputar);
    });

    // Opciones de salida
    q('#op-delim').addEventListener('change', function (e) { ESTADO.opciones.delim = e.target.value; guardar(); });
    q('#op-encabezado').addEventListener('change', function (e) { ESTADO.opciones.encabezado = e.target.value; guardar(); });
    q('#op-eol').addEventListener('change', function (e) { ESTADO.opciones.eol = e.target.value; guardar(); });
    q('#op-encode').addEventListener('change', function (e) { ESTADO.opciones.encode = e.target.value; guardar(); });

    // Editor de formato
    TIPOS.forEach(function (tipo) {
      q('#btn-add-' + tipo).addEventListener('click', function () { agregarCampo(tipo); });
      q('#nuevo-campo-' + tipo).addEventListener('keydown', function (e) { if (e.key === 'Enter') agregarCampo(tipo); });
      q('#campos-' + tipo).addEventListener('click', function (e) {
        var btn = e.target.closest('button'); if (!btn) return;
        var li = e.target.closest('li');
        accionCampo(tipo, parseInt(li.dataset.i, 10), btn.dataset.act);
      });
    });

    // Respaldo / restaurar / reset
    q('#btn-respaldo').addEventListener('click', descargarRespaldo);
    q('#input-restaurar').addEventListener('change', function (e) { if (e.target.files[0]) restaurarRespaldo(e.target.files[0]); e.target.value = ''; });
    q('#btn-reset').addEventListener('click', resetConfig);
  }

  function init() {
    if (typeof Core === 'undefined') { alert('No se cargó core.js'); return; }
    cargarEstado();
    montarModulos();
    wireEventos();
    sincronizarUI();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
