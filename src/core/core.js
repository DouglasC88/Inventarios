/*
 * NOVA Inventario · motor de inventario (sin interfaz).
 *
 * Reglas implementadas (ver la pantalla "Normativa"):
 *  - Kardex permanente (ET art. 62) por promedio ponderado o PEPS. Sin UEPS:
 *    lo prohíben la NIC 2, la NIIF para Pymes Secc. 13 y el ET art. 65.
 *  - Costo = precio + costos adicionales no recuperables prorrateados (NIC 2).
 *  - Menor entre costo y valor neto realizable al cierre, con reversión (NIC 2).
 *  - Faltantes del año frente al 3 % de inventario inicial + compras (ET art. 64).
 *  - Lote, vencimiento y registro INVIMA (Res. 3100/2019, Dec. 4725/2005,
 *    Res. 4816/2008, Res. 1403/2007).
 *  - Toda compra con factura electrónica o documento soporte (ET art. 771-2).
 *  - Existencias por bodega y lote; el costo es único por producto.
 */

const EPS = 1e-9;
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// ---------- Fechas (ISO yyyy-mm-dd, sin zona horaria) ----------
function toUTC(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}
function daysBetween(a, b) { return Math.round((toUTC(b) - toUTC(a)) / 864e5); }
function addDays(iso, n) { return new Date(toUTC(iso) + n * 864e5).toISOString().slice(0, 10); }
function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function yearOf(iso) { return Number(String(iso).slice(0, 4)); }
function isISODate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(toUTC(s)); }

// ---------- Catálogos ----------
const CATEGORIAS = { insumo: 'Insumo', dispositivo: 'Dispositivo médico', medicamento: 'Medicamento' };
const RIESGOS = ['I', 'IIa', 'IIb', 'III', 'N/A'];
const METODOS = { promedio: 'Promedio ponderado', peps: 'PEPS (primeras en entrar, primeras en salir)' };
const CAUSAS_AJUSTE = { faltante: 'Faltante', sobrante: 'Sobrante', error: 'Corrección de error', otro: 'Otro' };
const CAUSAS_BAJA = {
  vencido: 'Vencido', danado: 'Dañado o deteriorado', obsoleto: 'Obsoleto',
  retiro: 'Retiro de mercado (INVIMA o fabricante)', cadena_frio: 'Ruptura de cadena de frío'
};
const CAUSAS_DEVOLUCION = {
  calidad: 'Defecto de calidad', vencimiento: 'Vencimiento corto o vencido', error_pedido: 'Error en el pedido',
  averia: 'Avería en transporte', retiro: 'Retiro de mercado'
};
const DOC_TIPOS = { FE: 'Factura electrónica', DS: 'Documento soporte (proveedor no obligado a facturar)' };
const TIPOS_MOV = {
  inicial: 'Saldo inicial', entrada: 'Entrada', salida: 'Salida', traslado: 'Traslado',
  devolucion: 'Devolución a proveedor', ajuste: 'Ajuste', baja: 'Baja'
};
const PREFIJOS = {
  inicial: 'SI', entrada: 'EN', salida: 'SA', traslado: 'TR', devolucion: 'DV', ajuste: 'AJ', baja: 'BA',
  conteo: 'CF', cierre: 'CI', orden: 'OC', requisicion: 'RQ'
};
const ENTRAN = ['inicial', 'entrada'];
const SALEN = ['salida', 'baja', 'devolucion'];

// ---------- Usuarios y permisos ----------
const ROLES = {
  admin: 'Administrador',
  supervisor: 'Supervisor',
  almacenista: 'Almacenista',
  consultorio: 'Consultorio',
  consulta: 'Consulta (contador o auditor)'
};
const PERMISOS = {
  entradas: ['admin', 'supervisor', 'almacenista'],
  salidas: ['admin', 'supervisor', 'almacenista', 'consultorio'],
  traslados: ['admin', 'supervisor', 'almacenista'],
  devoluciones: ['admin', 'supervisor', 'almacenista'],
  ordenes: ['admin', 'supervisor', 'almacenista'],
  requisicionCrear: ['admin', 'supervisor', 'almacenista', 'consultorio'],
  requisicionAtender: ['admin', 'supervisor', 'almacenista'],
  ajustes: ['admin', 'supervisor'],
  bajas: ['admin', 'supervisor'],
  conteoAbrir: ['admin', 'supervisor'],
  conteoContar: ['admin', 'supervisor', 'almacenista'],
  conteoAplicar: ['admin', 'supervisor'],
  cierres: ['admin', 'supervisor'],
  anular: ['admin', 'supervisor'],
  maestros: ['admin', 'supervisor', 'almacenista'],
  frio: ['admin', 'supervisor', 'almacenista', 'consultorio'],
  importar: ['admin'],
  config: ['admin'],
  usuarios: ['admin']
};
function puede(usuario, accion) {
  if (!usuario) return true; // sin usuarios configurados: acceso total
  const r = PERMISOS[accion];
  return !!r && r.includes(usuario.rol);
}

// SHA-256 puro (para no guardar el PIN en texto plano).
function sha256(ascii) {
  const rr = (v, a) => (v >>> a) | (v << (32 - a));
  const bytes = unescape(encodeURIComponent(ascii));
  const K = [];
  const H = [];
  let primo = 2;
  for (let n = 0; n < 64; primo++) {
    let es = true;
    for (let d = 2; d * d <= primo; d++) if (primo % d === 0) { es = false; break; }
    if (!es) continue;
    if (n < 8) H[n] = (Math.pow(primo, 1 / 2) * 4294967296) | 0;
    K[n++] = (Math.pow(primo, 1 / 3) * 4294967296) | 0;
  }
  const words = [];
  const len = bytes.length * 8;
  let s = bytes + '\x80';
  while (s.length % 64 !== 56) s += '\x00';
  for (let i = 0; i < s.length; i++) words[i >> 2] |= s.charCodeAt(i) << ((3 - i) % 4) * 8;
  words[words.length] = (len / 4294967296) | 0;
  words[words.length] = len;
  let hash = H.slice(0);
  for (let j = 0; j < words.length;) {
    const w = words.slice(j, (j += 16));
    const old = hash.slice(0);
    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const a = hash[0], e = hash[4];
      const t1 = hash[7] + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & hash[5]) ^ (~e & hash[6])) + K[i] +
        (w[i] = i < 16 ? w[i] : (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
      const t2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash = [(t1 + t2) | 0].concat(hash);
      hash[4] = (hash[4] + t1) | 0;
      hash.length = 8;
    }
    for (let i = 0; i < 8; i++) hash[i] = (hash[i] + old[i]) | 0;
  }
  let out = '';
  for (let i = 0; i < 8; i++) for (let j = 3; j + 1; j--) { const b = (hash[i] >> (j * 8)) & 255; out += (b < 16 ? '0' : '') + b.toString(16); }
  return out;
}
const hashPin = (usuario, pin) => sha256('nova|' + String(usuario).trim().toLowerCase() + '|' + String(pin));

// ---------- Base ----------
function configBase() {
  return {
    empresa: { nombre: 'Mi empresa', nit: '', grupo: '2' },
    usuario: 'Administrador',
    metodoDefault: 'promedio',
    metodos: {},
    semaforo: { rojo: 90, amarillo: 180 },
    invimaAviso: 90,
    limiteFaltantes: 3,
    frio: { min: 2, max: 8 },
    ubicaciones: ['Bodega principal'],
    reabastecimiento: { consumoDias: 90, seguridadDias: 7, coberturaDias: 30 }
  };
}

function dbVacia() {
  return {
    version: 1,
    config: configBase(),
    productos: [], proveedores: [], movimientos: [], conteos: [], cierres: [],
    temperaturas: [], auditoria: [], ordenes: [], requisiciones: [], kits: [], usuarios: [],
    seq: { orden: 0 }
  };
}

function nuevoId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function siguienteNumero(db, tipo) {
  const p = PREFIJOS[tipo];
  db.seq[p] = (db.seq[p] || 0) + 1;
  return p + '-' + String(db.seq[p]).padStart(5, '0');
}
function verNumero(db, tipo) {
  const p = PREFIJOS[tipo];
  return p + '-' + String((db.seq[p] || 0) + 1).padStart(5, '0');
}
function siguienteOrden(db) {
  db.seq.orden = (db.seq.orden || 0) + 1;
  return db.seq.orden;
}

// ---------- Estados ----------
function semaforo(vence, hoy, cfg) {
  if (!vence) return 'na';
  const d = daysBetween(hoy, vence);
  if (d < 0) return 'vencido';
  if (d <= cfg.semaforo.rojo) return 'rojo';
  if (d <= cfg.semaforo.amarillo) return 'amarillo';
  return 'verde';
}
function requiereInvima(p) {
  return p.requiereInvima !== undefined ? !!p.requiereInvima : p.categoria !== 'insumo';
}
function estadoInvima(p, hoy, cfg) {
  if (!requiereInvima(p)) return 'na';
  if (!p.invima) return 'sin';
  if (!p.invimaVence) return 'vigente';
  const d = daysBetween(hoy, p.invimaVence);
  if (d < 0) return 'vencido';
  if (d <= cfg.invimaAviso) return 'porVencer';
  return 'vigente';
}
function metodoDe(cfg, fecha) {
  return (cfg.metodos && cfg.metodos[String(yearOf(fecha))]) || cfg.metodoDefault || 'promedio';
}
function ultimoCierre(db) {
  return db.cierres.length ? db.cierres.reduce((a, c) => (c.fecha > a.fecha ? c : a)) : null;
}
function conteoAbierto(db) { return db.conteos.find((c) => c.estado === 'abierto') || null; }
function bodegaPrincipal(cfg) { return cfg.ubicaciones[0] || 'Bodega principal'; }
function bodegaDe(m, cfg) { return m.bodega || bodegaPrincipal(cfg); }

// ---------- Unidades ----------
/** Convierte una cantidad y costo de la unidad de compra a la unidad de consumo. */
function aUnidadBase(producto, cantidad, costoUnit, enCompra) {
  const f = enCompra && Number(producto.factorCompra) > 0 ? Number(producto.factorCompra) : 1;
  return {
    cantidad: Number(cantidad) * f,
    costoUnit: costoUnit === '' || costoUnit === undefined || costoUnit === null ? costoUnit : Number(costoUnit) / f
  };
}

// ---------- Motor de kardex ----------
const lotKey = (bodega, lote, vence) => String(bodega || '') + '|' + String(lote || '').trim().toUpperCase() + '|' + (vence || '');

function ordenar(movs) {
  return movs.slice().sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : (a.orden || 0) - (b.orden || 0)));
}

function consumirCapas(p, q) {
  let resta = q, valor = 0;
  while (resta > EPS && p.layers.length) {
    const c = p.layers[0];
    const t = Math.min(c.qty, resta);
    valor += t * c.cost;
    c.qty -= t; resta -= t;
    if (c.qty <= EPS) p.layers.shift();
  }
  if (resta > EPS) valor += resta * (p.ultimoCosto || 0);
  return r2(valor);
}

function costoActual(p, metodo) {
  if (metodo === 'peps') return p.layers.length ? p.layers[0].cost : (p.ultimoCosto || 0);
  return p.qty > EPS ? p.value / p.qty : (p.ultimoCosto || 0);
}

function detalleMov(db, m, l) {
  const prov = () => { const x = db.proveedores.find((p) => p.id === m.proveedorId); return x ? x.nombre : 'Proveedor'; };
  if (m.tipo === 'entrada') return prov() + ' · ' + m.docTipo + ' ' + m.docNum + (m.ordenNum ? ' · ' + m.ordenNum : '');
  if (m.tipo === 'inicial') return 'Saldo inicial · ' + (m.acta || '');
  if (m.tipo === 'salida') return (m.destinoTipo || 'Destino') + (m.destino ? ': ' + m.destino : '') + (m.procedimiento ? ' · ' + m.procedimiento : '');
  if (m.tipo === 'traslado') return bodegaDe(m, db.config) + ' → ' + m.bodegaDestino + (m.requisicionNum ? ' · ' + m.requisicionNum : '');
  if (m.tipo === 'devolucion') return 'Devolución a ' + prov() + ' · ' + (CAUSAS_DEVOLUCION[m.causa] || m.causa || '');
  if (m.tipo === 'ajuste') return (CAUSAS_AJUSTE[l.causa] || 'Ajuste') + (m.conteoNum ? ' · ' + m.conteoNum : '');
  if (m.tipo === 'baja') return 'Baja: ' + (CAUSAS_BAJA[m.causa] || m.causa);
  return '';
}

function ensureLot(p, bodega, lote, vence) {
  const key = lotKey(bodega, lote, vence);
  return p.lots[key] || (p.lots[key] = { bodega, lote: String(lote || '').trim(), vence: vence || '', qty: 0 });
}

/**
 * Reconstruye existencias (por bodega y lote), costos y kardex desde los movimientos.
 * @returns {{prods, movCost, errors, metodo}}
 */
function replay(db, opts) {
  opts = opts || {};
  const cfg = db.config;
  const prods = {};
  const movCost = {};
  const errors = [];
  const ensure = (id) => prods[id] || (prods[id] = { qty: 0, value: 0, layers: [], lots: {}, kardex: [], ultimoCosto: 0 });
  let metodoActual = null;
  const movs = ordenar(db.movimientos).filter((m) => !m.anulado && (!opts.hasta || m.fecha <= opts.hasta));

  for (const m of movs) {
    const metodo = metodoDe(cfg, m.fecha);
    if (metodoActual && metodo !== metodoActual) {
      for (const id in prods) {
        const p = prods[id];
        p.layers = metodo === 'peps' && p.qty > EPS ? [{ qty: p.qty, cost: p.value / p.qty }] : [];
      }
    }
    metodoActual = metodo;
    const bodega = bodegaDe(m, cfg);
    const base = m.tipo === 'entrada'
      ? m.lineas.reduce((s, l) => s + Number(l.cantidad) * Number(l.costoUnit || 0), 0) : 0;
    const costos = [];

    for (const l of m.lineas) {
      const p = ensure(l.productoId);
      const bodegaL = m.tipo === 'traslado' ? bodega : (l.bodega || bodega);
      const lot = ensureLot(p, bodegaL, l.lote, l.vence);
      let q = Number(l.cantidad);
      let unit = 0, valor = 0, entra = 0, sale = 0;
      const falta = (lt, cant) => {
        if (lt.qty + EPS < cant) errors.push({ movId: m.id, num: m.num, msg: 'El lote ' + lt.lote + ' no tiene existencia suficiente en ' + lt.bodega + ' (' + r2(lt.qty) + ' disponibles).' });
      };

      if (m.tipo === 'traslado') {
        falta(lot, q);
        unit = costoActual(p, metodo);
        valor = r2(q * unit);
        lot.qty -= q;
        if (Math.abs(lot.qty) < EPS) lot.qty = 0;
        ensureLot(p, m.bodegaDestino, l.lote, l.vence).qty += q;
        sale = q; entra = q;
      } else if (ENTRAN.includes(m.tipo) || (m.tipo === 'ajuste' && q > 0)) {
        if (m.tipo === 'entrada') {
          const linea = q * Number(l.costoUnit || 0);
          const extra = base > 0 ? Number(m.costosAdic || 0) * (linea / base) : 0;
          unit = q > 0 ? (linea + extra) / q : 0;
          p.ultimoCosto = unit;
        } else if (m.tipo === 'inicial') {
          unit = Number(l.costoUnit || 0);
          p.ultimoCosto = unit;
        } else {
          unit = l.costoUnit !== undefined && l.costoUnit !== null && l.costoUnit !== '' ? Number(l.costoUnit) : costoActual(p, metodo);
        }
        valor = r2(q * unit);
        p.qty += q;
        p.value = r2(p.value + valor);
        if (metodo === 'peps') p.layers.push({ qty: q, cost: unit });
        lot.qty += q;
        entra = q;
      } else {
        q = Math.abs(q);
        falta(lot, q);
        if (metodo === 'promedio') {
          valor = Math.abs(p.qty - q) < EPS ? p.value : r2((p.qty > EPS ? p.value / p.qty : p.ultimoCosto) * q);
        } else {
          valor = Math.abs(p.qty - q) < EPS && p.layers.length ? r2(p.value) : consumirCapas(p, q);
          if (Math.abs(p.qty - q) < EPS) p.layers = [];
        }
        unit = q > 0 ? valor / q : 0;
        p.qty -= q;
        p.value = r2(p.value - valor);
        if (Math.abs(p.qty) < EPS) { p.qty = 0; p.value = 0; p.layers = []; }
        lot.qty -= q;
        if (Math.abs(lot.qty) < EPS) lot.qty = 0;
        sale = q;
      }
      costos.push({ unit, valor });
      p.kardex.push({
        movId: m.id, num: m.num, fecha: m.fecha, tipo: m.tipo, detalle: detalleMov(db, m, l), bodega: bodegaL,
        lote: lot.lote, vence: lot.vence, entra: m.tipo === 'traslado' ? 0 : entra, sale: m.tipo === 'traslado' ? 0 : sale,
        traslado: m.tipo === 'traslado' ? q : 0, unit, valor,
        saldoQty: p.qty, saldoValor: p.value, promedio: p.qty > EPS ? p.value / p.qty : 0
      });
    }
    movCost[m.id] = { lineas: costos, total: r2(costos.reduce((s, c) => s + c.valor, 0)) };
  }
  return { prods, movCost, errors, metodo: metodoActual };
}

function valorInventario(state) {
  let v = 0;
  for (const id in state.prods) v += state.prods[id].value;
  return r2(v);
}

function existencia(state, productoId, bodega) {
  const s = state.prods[productoId];
  if (!s) return 0;
  if (!bodega) return s.qty;
  let q = 0;
  for (const k in s.lots) if (s.lots[k].bodega === bodega) q += s.lots[k].qty;
  return r2(q);
}

function existenciasPorBodega(db, state, productoId) {
  const out = {};
  db.config.ubicaciones.forEach((b) => { out[b] = 0; });
  const s = state.prods[productoId];
  if (s) for (const k in s.lots) out[s.lots[k].bodega] = r2((out[s.lots[k].bodega] || 0) + s.lots[k].qty);
  return out;
}

// ---------- Validación de movimientos ----------
function validarMovimiento(db, mov, hoy) {
  const e = [];
  const cfg = db.config;
  hoy = hoy || todayISO();
  if (!isISODate(mov.fecha)) e.push('La fecha no es válida.');
  else if (mov.fecha > hoy) e.push('No se registran movimientos con fecha futura.');
  const uc = ultimoCierre(db);
  if (uc && mov.fecha <= uc.fecha) e.push('El periodo está cerrado hasta ' + uc.fecha + '. Registre el movimiento en el periodo abierto.');
  const ca = conteoAbierto(db);
  if (ca && !mov.conteoId) e.push('Hay un conteo físico abierto (' + ca.num + '). Aplíquelo o anúlelo antes de registrar movimientos.');
  if (!mov.lineas || !mov.lineas.length) e.push('Agregue al menos una línea.');
  if (mov.bodega && !cfg.ubicaciones.includes(mov.bodega)) e.push('La bodega ' + mov.bodega + ' no existe.');

  if (mov.tipo === 'entrada' || mov.tipo === 'devolucion') {
    if (!mov.proveedorId || !db.proveedores.some((p) => p.id === mov.proveedorId)) e.push('Seleccione el proveedor.');
  }
  if (mov.tipo === 'entrada') {
    if (!DOC_TIPOS[mov.docTipo]) e.push('Indique si el soporte es factura electrónica o documento soporte.');
    if (!String(mov.docNum || '').trim()) e.push('El número de la factura electrónica o del documento soporte es obligatorio (ET art. 771-2).');
    else if (db.movimientos.some((m) => !m.anulado && m.tipo === 'entrada' && m.id !== mov.id &&
      m.proveedorId === mov.proveedorId && m.docTipo === mov.docTipo &&
      String(m.docNum).trim().toUpperCase() === String(mov.docNum).trim().toUpperCase())) {
      e.push('Ese documento ya fue registrado para este proveedor.');
    }
    if (Number(mov.costosAdic || 0) < 0) e.push('Los costos adicionales no pueden ser negativos.');
  }
  if (mov.tipo === 'inicial') {
    if (!String(mov.acta || '').trim()) e.push('Indique el soporte del saldo inicial (acta o inventario de apertura).');
    if (db.movimientos.some((m) => !m.anulado && m.tipo !== 'inicial' && m.fecha < mov.fecha)) e.push('El saldo inicial debe tener fecha anterior a los demás movimientos.');
  }
  if (mov.tipo === 'salida' && !String(mov.destino || '').trim()) e.push('Indique el destino de la salida (paciente, consultorio o servicio).');
  if (mov.tipo === 'traslado') {
    if (!mov.bodegaDestino || !cfg.ubicaciones.includes(mov.bodegaDestino)) e.push('Seleccione la bodega de destino.');
    else if (mov.bodegaDestino === bodegaDe(mov, cfg)) e.push('La bodega de origen y la de destino deben ser distintas.');
  }
  if (mov.tipo === 'devolucion') {
    if (!CAUSAS_DEVOLUCION[mov.causa]) e.push('Seleccione la causa de la devolución.');
    if (!String(mov.docNum || '').trim()) e.push('Indique el número de la nota o documento de devolución.');
  }
  if (mov.tipo === 'baja') {
    if (!CAUSAS_BAJA[mov.causa]) e.push('Seleccione la causa de la baja.');
    if (!String(mov.acta || '').trim()) e.push('El número de acta es obligatorio para una baja.');
    if (!String(mov.autoriza || '').trim()) e.push('Indique quién autoriza la baja.');
  }
  if (mov.tipo === 'ajuste') {
    if ((mov.lineas || []).some((l) => Number(l.cantidad) < 0) && !String(mov.autoriza || '').trim()) e.push('Indique quién autoriza el ajuste.');
    if (!String(mov.acta || '').trim()) e.push('El número de acta o soporte del ajuste es obligatorio.');
  }

  (mov.lineas || []).forEach((l, i) => {
    const n = 'Línea ' + (i + 1) + ': ';
    const p = db.productos.find((x) => x.id === l.productoId);
    if (!p) { e.push(n + 'seleccione un producto.'); return; }
    if (l.bodega && !cfg.ubicaciones.includes(l.bodega)) e.push(n + 'la bodega ' + l.bodega + ' no existe.');
    const q = Number(l.cantidad);
    if (!isFinite(q) || q === 0) e.push(n + 'la cantidad debe ser distinta de cero.');
    if (mov.tipo !== 'ajuste' && q < 0) e.push(n + 'la cantidad debe ser positiva.');
    if (!String(l.lote || '').trim()) e.push(n + 'el lote es obligatorio (trazabilidad y tecnovigilancia).');
    if (l.vence && !isISODate(l.vence)) e.push(n + 'la fecha de vencimiento no es válida.');
    const entra = ENTRAN.includes(mov.tipo) || (mov.tipo === 'ajuste' && q > 0);
    if (entra) {
      if (!l.vence) e.push(n + 'la fecha de vencimiento es obligatoria.');
      if (mov.tipo === 'entrada' && l.vence && isISODate(mov.fecha) && l.vence <= mov.fecha) e.push(n + p.nombre + ' viene vencido; no se puede recibir.');
      if (l.costoUnit !== undefined && l.costoUnit !== '' && Number(l.costoUnit) < 0) e.push(n + 'el costo no puede ser negativo.');
      if (ENTRAN.includes(mov.tipo) && (l.costoUnit === undefined || l.costoUnit === '' || !isFinite(Number(l.costoUnit)))) e.push(n + 'indique el costo unitario.');
    }
    if (mov.tipo === 'entrada' && requiereInvima(p) && isISODate(mov.fecha)) {
      if (!p.invima) e.push(n + p.nombre + ' no tiene registro sanitario INVIMA. Regístrelo en la ficha del producto.');
      else if (p.invimaVence && p.invimaVence < mov.fecha) e.push(n + 'el registro INVIMA de ' + p.nombre + ' está vencido (' + p.invimaVence + ').');
    }
    if (mov.tipo === 'salida' && l.vence && isISODate(mov.fecha) && l.vence < mov.fecha) {
      e.push(n + 'el lote ' + l.lote + ' está vencido; no se puede usar. Regístrelo como baja.');
    }
    if (mov.tipo === 'ajuste' && !CAUSAS_AJUSTE[l.causa]) e.push(n + 'seleccione la causa del ajuste.');
  });

  if (!e.length) {
    // Prueba de existencias: se reconstruye el kardex con el movimiento incluido.
    const antes = replay(db).errors.length;
    const prueba = Object.assign({}, db, { movimientos: db.movimientos.concat([Object.assign({ orden: Infinity }, mov)]) });
    const r = replay(prueba);
    if (r.errors.length > antes) {
      const propios = r.errors.filter((x) => x.movId === mov.id);
      (propios.length ? propios : r.errors.slice(antes)).slice(0, 4).forEach((x) => e.push((x.num ? x.num + ': ' : '') + x.msg));
      if (!e.length) e.push('El movimiento deja existencias negativas.');
    }
  }
  return e;
}

function validarAnulacion(db, mov) {
  const e = [];
  const uc = ultimoCierre(db);
  if (mov.anulado) e.push('El movimiento ya está anulado.');
  if (uc && mov.fecha <= uc.fecha) e.push('El movimiento pertenece a un periodo cerrado; no se puede anular.');
  if (!e.length) {
    const antes = replay(db).errors.length;
    const sin = Object.assign({}, db, { movimientos: db.movimientos.map((m) => (m.id === mov.id ? Object.assign({}, m, { anulado: true }) : m)) });
    if (replay(sin).errors.length > antes) e.push('No se puede anular: hay movimientos posteriores que usan esas existencias.');
  }
  return e;
}

// ---------- Lotes y FEFO ----------
function lotes(db, state, hoy, opts) {
  opts = opts || {};
  const out = [];
  for (const p of db.productos) {
    const s = state.prods[p.id];
    if (!s) continue;
    for (const k in s.lots) {
      const l = s.lots[k];
      if (!opts.todos && l.qty <= EPS) continue;
      if (opts.bodega && l.bodega !== opts.bodega) continue;
      out.push({
        producto: p, productoId: p.id, bodega: l.bodega, lote: l.lote, vence: l.vence, qty: l.qty,
        estado: semaforo(l.vence, hoy, db.config), dias: l.vence ? daysBetween(hoy, l.vence) : null
      });
    }
  }
  return out.sort((a, b) => ((a.vence || '9999') < (b.vence || '9999') ? -1 : (a.vence || '9999') > (b.vence || '9999') ? 1 : a.bodega < b.bodega ? -1 : 1));
}

/** Asigna lotes de una bodega por FEFO: lo que vence primero sale primero; nunca lotes vencidos. */
function sugerirFEFO(state, productoId, cantidad, hoy, bodega, opts) {
  opts = opts || {};
  const s = state.prods[productoId];
  const asignacion = [];
  let resta = Number(cantidad) || 0;
  if (s) {
    const disponibles = Object.values(s.lots)
      .filter((l) => l.qty > EPS && (!bodega || l.bodega === bodega) && (opts.incluirVencidos || !l.vence || l.vence >= hoy))
      .sort((a, b) => ((a.vence || '9999') < (b.vence || '9999') ? -1 : 1));
    for (const l of disponibles) {
      if (resta <= EPS) break;
      const t = Math.min(l.qty, resta);
      asignacion.push({ bodega: l.bodega, lote: l.lote, vence: l.vence, cantidad: r2(t) });
      resta -= t;
    }
  }
  return { asignacion, faltante: resta > EPS ? r2(resta) : 0 };
}

function expandirKit(kit, veces) {
  const n = Number(veces) || 1;
  return kit.lineas.map((l) => ({ productoId: l.productoId, cantidad: r2(Number(l.cantidad) * n) }));
}

// ---------- Órdenes de compra y requisiciones ----------
function estadoOrden(db, orden) {
  const recibido = {};
  db.movimientos.forEach((m) => {
    if (m.anulado || m.tipo !== 'entrada' || m.ordenId !== orden.id) return;
    m.lineas.forEach((l) => { recibido[l.productoId] = r2((recibido[l.productoId] || 0) + Number(l.cantidad)); });
  });
  const lineas = orden.lineas.map((l) => {
    const rec = Math.min(recibido[l.productoId] || 0, Number(l.cantidad));
    return Object.assign({}, l, { recibido: rec, pendiente: r2(Math.max(0, Number(l.cantidad) - rec)) });
  });
  let estado = orden.estado;
  if (estado !== 'anulada' && estado !== 'cerrada') {
    const totalRec = lineas.reduce((s, l) => s + l.recibido, 0);
    const pend = lineas.reduce((s, l) => s + l.pendiente, 0);
    estado = pend <= EPS ? 'recibida' : totalRec > EPS ? 'parcial' : 'abierta';
  }
  const valor = r2(orden.lineas.reduce((s, l) => s + Number(l.cantidad) * Number(l.costoUnit || 0), 0));
  return { estado, lineas, valor };
}

function pendienteEnOrdenes(db) {
  const out = {};
  db.ordenes.forEach((o) => {
    const st = estadoOrden(db, o);
    if (st.estado === 'abierta' || st.estado === 'parcial') st.lineas.forEach((l) => { out[l.productoId] = r2((out[l.productoId] || 0) + l.pendiente); });
  });
  return out;
}

function estadoRequisicion(db, rq) {
  if (rq.estado === 'rechazada' || rq.estado === 'anulada') return { estado: rq.estado, lineas: rq.lineas.map((l) => Object.assign({}, l, { entregado: 0, pendiente: Number(l.cantidad) })) };
  const entregado = {};
  db.movimientos.forEach((m) => {
    if (m.anulado || m.requisicionId !== rq.id) return;
    m.lineas.forEach((l) => { entregado[l.productoId] = r2((entregado[l.productoId] || 0) + Number(l.cantidad)); });
  });
  const lineas = rq.lineas.map((l) => {
    const ent = Math.min(entregado[l.productoId] || 0, Number(l.cantidad));
    return Object.assign({}, l, { entregado: ent, pendiente: r2(Math.max(0, Number(l.cantidad) - ent)) });
  });
  const pend = lineas.reduce((s, l) => s + l.pendiente, 0);
  const ent = lineas.reduce((s, l) => s + l.entregado, 0);
  return { estado: pend <= EPS ? 'atendida' : ent > EPS ? 'parcial' : 'pendiente', lineas };
}

// ---------- Reabastecimiento (punto de reorden) ----------
function consumoPorProducto(db, state, desde, hasta) {
  const out = {};
  db.movimientos.forEach((m) => {
    if (m.anulado || m.tipo !== 'salida' || m.fecha < desde || m.fecha > hasta) return;
    const c = state.movCost[m.id];
    m.lineas.forEach((l, i) => {
      const x = out[l.productoId] || (out[l.productoId] = { cantidad: 0, valor: 0 });
      x.cantidad += Number(l.cantidad);
      x.valor += c ? c.lineas[i].valor : 0;
    });
  });
  return out;
}

function reabastecimiento(db, state, hoy) {
  const r = db.config.reabastecimiento || configBase().reabastecimiento;
  const dias = Number(r.consumoDias) || 90;
  const consumo = consumoPorProducto(db, state, addDays(hoy, -dias), hoy);
  const enOrden = pendienteEnOrdenes(db);
  return db.productos.filter((p) => p.activo !== false).map((p) => {
    const diario = (consumo[p.id] ? consumo[p.id].cantidad : 0) / dias;
    const lead = Number(p.leadTime) || 7;
    const exist = existencia(state, p.id);
    const pedido = enOrden[p.id] || 0;
    const seguridad = Math.max(Number(p.stockMin) || 0, diario * (Number(r.seguridadDias) || 0));
    const puntoReorden = r2(diario * lead + seguridad);
    const maximo = r2(puntoReorden + diario * (Number(r.coberturaDias) || 30));
    const posicion = exist + pedido;
    let sugerido = posicion <= puntoReorden ? Math.ceil(Math.max(0, maximo - posicion)) : 0;
    if (sugerido > 0 && Number(p.factorCompra) > 1) sugerido = Math.ceil(sugerido / Number(p.factorCompra)) * Number(p.factorCompra);
    const cobertura = diario > 0 ? Math.floor(exist / diario) : null;
    return { producto: p, diario, lead, existencia: exist, pedido, puntoReorden, maximo, sugerido, cobertura, ultimoCosto: state.prods[p.id] ? state.prods[p.id].ultimoCosto : 0 };
  });
}

// ---------- Análisis ----------
function analisisABC(db, state, hoy, dias) {
  const c = consumoPorProducto(db, state, addDays(hoy, -(dias || 365)), hoy);
  const filas = db.productos.map((p) => ({ producto: p, cantidad: c[p.id] ? c[p.id].cantidad : 0, valor: c[p.id] ? r2(c[p.id].valor) : 0 }))
    .sort((a, b) => b.valor - a.valor);
  const total = filas.reduce((s, f) => s + f.valor, 0);
  let acum = 0;
  filas.forEach((f) => {
    const antes = total > 0 ? (acum / total) * 100 : 100;
    acum += f.valor;
    f.participacion = total > 0 ? (f.valor / total) * 100 : 0;
    f.acumulado = total > 0 ? (acum / total) * 100 : 0;
    f.clase = f.valor <= 0 ? 'C' : antes < 80 ? 'A' : antes < 95 ? 'B' : 'C';
  });
  return { filas, total: r2(total) };
}

function rotacion(db, hoy, dias) {
  dias = dias || 365;
  const desde = addDays(hoy, -dias);
  const ini = replay(db, { hasta: addDays(desde, -1) });
  const fin = replay(db, { hasta: hoy });
  const cons = consumoPorProducto(db, fin, desde, hoy);
  return db.productos.map((p) => {
    const vi = ini.prods[p.id] ? ini.prods[p.id].value : 0;
    const vf = fin.prods[p.id] ? fin.prods[p.id].value : 0;
    const promedio = (vi + vf) / 2;
    const costo = cons[p.id] ? cons[p.id].valor : 0;
    const rot = promedio > 0 ? costo / promedio : 0;
    return { producto: p, inicial: vi, final: vf, promedio: r2(promedio), costo: r2(costo), rotacion: rot, dias: rot > 0 ? Math.round(dias / rot) : null };
  });
}

function consumoPorDestino(db, state, desde, hasta) {
  const grupos = {};
  db.movimientos.forEach((m) => {
    if (m.anulado || m.tipo !== 'salida' || m.fecha < desde || m.fecha > hasta) return;
    const k = (m.destinoTipo || 'Otro') + ' · ' + (m.destino || '—');
    const g = grupos[k] || (grupos[k] = { destinoTipo: m.destinoTipo || 'Otro', destino: m.destino || '—', valor: 0, salidas: 0, procedimientos: {} });
    g.valor += state.movCost[m.id] ? state.movCost[m.id].total : 0;
    g.salidas += 1;
    if (m.procedimiento) g.procedimientos[m.procedimiento] = (g.procedimientos[m.procedimiento] || 0) + 1;
  });
  return Object.values(grupos).map((g) => Object.assign(g, { valor: r2(g.valor) })).sort((a, b) => b.valor - a.valor);
}

function sinMovimiento(db, state, hoy, dias) {
  const limite = addDays(hoy, -(dias || 180));
  return db.productos.map((p) => {
    const k = state.prods[p.id] ? state.prods[p.id].kardex : [];
    const ult = k.filter((x) => x.tipo === 'salida').map((x) => x.fecha).sort().pop() || null;
    return { producto: p, ultimaSalida: ult, existencia: state.prods[p.id] ? state.prods[p.id].qty : 0, valor: state.prods[p.id] ? state.prods[p.id].value : 0 };
  }).filter((x) => x.existencia > EPS && (!x.ultimaSalida || x.ultimaSalida < limite));
}

// ---------- Indicadores ----------
function faltantesAnio(db, year) {
  const ini = replay(db, { hasta: (year - 1) + '-12-31' });
  const fin = replay(db, { hasta: year + '-12-31' });
  const inicial = valorInventario(ini);
  let compras = 0, faltantes = 0;
  for (const m of db.movimientos) {
    if (m.anulado || yearOf(m.fecha) !== year) continue;
    const c = fin.movCost[m.id];
    if (!c) continue;
    if (m.tipo === 'entrada' || m.tipo === 'inicial') compras += c.total;
    if (m.tipo === 'devolucion') compras -= c.total;
    if (m.tipo === 'ajuste') {
      m.lineas.forEach((l, i) => {
        if (Number(l.cantidad) < 0 && l.causa === 'faltante') faltantes += c.lineas[i].valor;
      });
    }
  }
  const base = r2(inicial + compras);
  return { inicial, compras: r2(compras), faltantes: r2(faltantes), base, pct: base > 0 ? (faltantes / base) * 100 : 0 };
}

function tempEnRango(t, cfg) {
  const v = Number(t.temp);
  return v >= Number(cfg.frio.min) && v <= Number(cfg.frio.max);
}

function alertas(db, state, hoy) {
  const cfg = db.config;
  const out = [];
  for (const p of db.productos) {
    if (p.activo === false) continue;
    const qty = state.prods[p.id] ? state.prods[p.id].qty : 0;
    if (Number(p.stockMin) > 0 && qty < Number(p.stockMin)) {
      out.push({ nivel: qty <= 0 ? 'critico' : 'alerta', tipo: 'stock', titulo: p.nombre + ' bajo el mínimo', detalle: 'Existencia ' + r2(qty) + ' ' + (p.unidad || '') + ' · mínimo ' + p.stockMin, productoId: p.id });
    }
    const ei = estadoInvima(p, hoy, cfg);
    if (ei === 'sin') out.push({ nivel: 'critico', tipo: 'invima', titulo: p.nombre + ' sin registro INVIMA', detalle: 'No se podrán recibir compras de este producto.', productoId: p.id });
    if (ei === 'vencido') out.push({ nivel: 'critico', tipo: 'invima', titulo: 'Registro INVIMA vencido: ' + p.nombre, detalle: p.invima + ' venció el ' + p.invimaVence, productoId: p.id });
    if (ei === 'porVencer') out.push({ nivel: 'alerta', tipo: 'invima', titulo: 'Registro INVIMA por vencer: ' + p.nombre, detalle: p.invima + ' vence el ' + p.invimaVence, productoId: p.id });
  }
  for (const l of lotes(db, state, hoy)) {
    if (l.estado === 'vencido') out.push({ nivel: 'critico', tipo: 'vencimiento', titulo: 'Lote vencido con existencia: ' + l.producto.nombre, detalle: 'Lote ' + l.lote + ' en ' + l.bodega + ' venció el ' + l.vence + ' · ' + r2(l.qty) + ' ' + (l.producto.unidad || '') + '. Registre la baja.', productoId: l.productoId, lote: l.lote });
    else if (l.estado === 'rojo') out.push({ nivel: 'alerta', tipo: 'vencimiento', titulo: 'Lote por vencer: ' + l.producto.nombre, detalle: 'Lote ' + l.lote + ' en ' + l.bodega + ' vence en ' + l.dias + ' días (' + l.vence + ').', productoId: l.productoId, lote: l.lote });
  }
  const reab = reabastecimiento(db, state, hoy).filter((x) => x.sugerido > 0);
  if (reab.length) out.push({ nivel: 'alerta', tipo: 'reorden', titulo: reab.length + ' producto(s) en punto de reorden', detalle: 'Revise la compra sugerida en Reabastecimiento.' });
  db.ordenes.forEach((o) => {
    const st = estadoOrden(db, o);
    if ((st.estado === 'abierta' || st.estado === 'parcial') && o.fechaEntrega && o.fechaEntrega < hoy) {
      out.push({ nivel: 'alerta', tipo: 'orden', titulo: 'Orden ' + o.num + ' atrasada', detalle: 'Entrega prevista el ' + o.fechaEntrega + ' · estado ' + st.estado + '.' });
    }
  });
  const rqp = db.requisiciones.filter((r) => ['pendiente', 'parcial'].includes(estadoRequisicion(db, r).estado));
  if (rqp.length) out.push({ nivel: 'info', tipo: 'requisicion', titulo: rqp.length + ' requisición(es) por atender', detalle: rqp.map((r) => r.num + ' de ' + r.bodegaSolicita).join(', ') });
  const year = yearOf(hoy);
  const f = faltantesAnio(db, year);
  if (f.pct > cfg.limiteFaltantes) out.push({ nivel: 'critico', tipo: 'faltantes', titulo: 'Faltantes del año sobre el ' + cfg.limiteFaltantes + ' %', detalle: 'Van ' + f.pct.toFixed(2) + ' % del inventario inicial más compras (ET art. 64). El exceso requiere prueba de la pérdida.' });
  if (!db.conteos.some((c) => c.estado === 'aplicado' && c.anual && yearOf(c.fecha) === year)) {
    out.push({ nivel: 'info', tipo: 'conteo', titulo: 'Conteo físico anual ' + year + ' pendiente', detalle: 'El comerciante debe hacer inventario al menos una vez al año (C. de Co. art. 52).' });
  }
  const desde = addDays(hoy, -30);
  const fuera = db.temperaturas.filter((t) => t.fecha.slice(0, 10) >= desde && !tempEnRango(t, cfg));
  if (fuera.length) out.push({ nivel: 'critico', tipo: 'frio', titulo: fuera.length + ' registro(s) de temperatura fuera de rango', detalle: 'En los últimos 30 días. Evalúe el producto y notifique al INVIMA si se rompió la cadena de frío.' });
  const ca = conteoAbierto(db);
  if (ca) out.push({ nivel: 'info', tipo: 'conteo', titulo: 'Conteo ' + ca.num + ' abierto', detalle: 'Los movimientos están bloqueados hasta aplicarlo o anularlo.' });
  const orden = { critico: 0, alerta: 1, info: 2 };
  return out.sort((a, b) => orden[a.nivel] - orden[b.nivel]);
}

/** Indicador de cumplimiento normativo (0–100). */
function cumplimiento(db, state, hoy) {
  const cfg = db.config;
  const year = yearOf(hoy);
  const activos = db.productos.filter((p) => p.activo !== false);
  const regulados = activos.filter(requiereInvima);
  const vigentes = regulados.filter((p) => ['vigente', 'porVencer'].includes(estadoInvima(p, hoy, cfg)));
  const ls = lotes(db, state, hoy);
  const sanos = ls.filter((l) => l.estado !== 'vencido');
  const conMin = activos.filter((p) => Number(p.stockMin) > 0);
  const okMin = conMin.filter((p) => (state.prods[p.id] ? state.prods[p.id].qty : 0) >= Number(p.stockMin));
  const f = faltantesAnio(db, year);
  const temps = db.temperaturas.filter((t) => t.fecha.slice(0, 10) >= addDays(hoy, -30));
  const pct = (a, b) => (b ? (a / b) * 100 : 100);
  const ind = [
    { nombre: 'Registro INVIMA vigente', valor: pct(vigentes.length, regulados.length), detalle: vigentes.length + ' de ' + regulados.length + ' productos regulados' },
    { nombre: 'Lotes sin vencer', valor: pct(sanos.length, ls.length), detalle: sanos.length + ' de ' + ls.length + ' lotes con existencia' },
    { nombre: 'Stock sobre el mínimo', valor: pct(okMin.length, conMin.length), detalle: okMin.length + ' de ' + conMin.length + ' referencias' },
    { nombre: 'Faltantes ≤ ' + cfg.limiteFaltantes + ' %', valor: f.pct <= cfg.limiteFaltantes ? 100 : Math.max(0, 100 - (f.pct - cfg.limiteFaltantes) * 20), detalle: f.pct.toFixed(2) + ' % en ' + year },
    { nombre: 'Conteo anual ' + year, valor: db.conteos.some((c) => c.estado === 'aplicado' && c.anual && yearOf(c.fecha) === year) ? 100 : 0, detalle: 'Inventario físico completo' },
    { nombre: 'Cadena de frío en rango', valor: pct(temps.filter((t) => tempEnRango(t, cfg)).length, temps.length), detalle: temps.length + ' lecturas en 30 días' }
  ];
  const total = ind.reduce((s, i) => s + i.valor, 0) / ind.length;
  return { total, indicadores: ind };
}

// ---------- Cierre de periodo (NIC 2: menor entre costo y VNR) ----------
function prepararCierre(db, fecha) {
  const e = [];
  if (!isISODate(fecha)) e.push('La fecha de cierre no es válida.');
  const uc = ultimoCierre(db);
  if (uc && fecha <= uc.fecha) e.push('Ya existe un cierre al ' + uc.fecha + '. La nueva fecha debe ser posterior.');
  if (conteoAbierto(db)) e.push('Aplique o anule el conteo abierto antes de cerrar.');
  if (e.length) return { errores: e };
  const st = replay(db, { hasta: fecha });
  const lineas = [];
  for (const p of db.productos) {
    const s = st.prods[p.id];
    if (!s || s.qty <= EPS) continue;
    const costoUnit = s.value / s.qty;
    const vnr = p.vnrUnit === '' || p.vnrUnit === null || p.vnrUnit === undefined ? null : Number(p.vnrUnit);
    const deterioro = vnr !== null && vnr < costoUnit ? r2((costoUnit - vnr) * s.qty) : 0;
    lineas.push({ productoId: p.id, codigo: p.codigo, nombre: p.nombre, qty: s.qty, costoUnit, valor: s.value, vnrUnit: vnr, deterioro });
  }
  const valorBruto = r2(lineas.reduce((a, l) => a + l.valor, 0));
  const deterioro = r2(lineas.reduce((a, l) => a + l.deterioro, 0));
  const previo = uc ? uc.deterioro : 0;
  return {
    errores: [],
    cierre: {
      fecha, metodo: metodoDe(db.config, fecha), lineas, valorBruto, deterioro,
      valorNeto: r2(valorBruto - deterioro),
      deterioroAnterior: previo,
      reversion: previo > deterioro ? r2(previo - deterioro) : 0,
      nuevoDeterioro: deterioro > previo ? r2(deterioro - previo) : 0
    }
  };
}

// ---------- Conteo físico ----------
function crearConteo(db, state, datos, hoy) {
  const lineas = [];
  for (const l of lotes(db, state, hoy)) {
    if (datos.categoria && datos.categoria !== 'todas' && l.producto.categoria !== datos.categoria) continue;
    if (datos.bodega && datos.bodega !== 'todas' && l.bodega !== datos.bodega) continue;
    lineas.push({ productoId: l.productoId, bodega: l.bodega, lote: l.lote, vence: l.vence, sistema: l.qty, contado: '' });
  }
  return lineas;
}

function diferenciasConteo(conteo, state) {
  return conteo.lineas.map((l) => {
    const s = state.prods[l.productoId];
    const lot = s ? s.lots[lotKey(l.bodega, l.lote, l.vence)] : null;
    const sistema = lot ? lot.qty : 0;
    const contado = l.contado === '' || l.contado === null || l.contado === undefined ? null : Number(l.contado);
    return Object.assign({}, l, { sistema, contado, diferencia: contado === null ? null : r2(contado - sistema) });
  });
}

// ---------- Trazabilidad ----------
function trazabilidad(db, state, texto) {
  const t = String(texto || '').trim().toUpperCase();
  if (!t) return [];
  const out = [];
  for (const m of ordenar(db.movimientos)) {
    m.lineas.forEach((l, i) => {
      if (!String(l.lote || '').toUpperCase().includes(t)) return;
      const p = db.productos.find((x) => x.id === l.productoId);
      const c = state.movCost[m.id];
      out.push({
        mov: m, linea: l, producto: p, fecha: m.fecha, tipo: m.tipo, num: m.num, bodega: l.bodega || bodegaDe(m, db.config),
        cantidad: Number(l.cantidad), valor: c ? c.lineas[i].valor : null,
        detalle: detalleMov(db, m, l), anulado: !!m.anulado
      });
    });
  }
  return out;
}

// ---------- GS1 / UDI ----------
function finDeMes(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
function fechaGS1(yymmdd) {
  if (!/^\d{6}$/.test(yymmdd)) return '';
  const y = 2000 + Number(yymmdd.slice(0, 2));
  const m = Number(yymmdd.slice(2, 4));
  let d = Number(yymmdd.slice(4, 6));
  if (m < 1 || m > 12) return '';
  if (d === 0) d = finDeMes(y, m);
  return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}
function asignarAI(out, ai, v) {
  if (ai === '01' || ai === '02') out.gtin = v;
  else if (ai === '17') out.vence = fechaGS1(v);
  else if (ai === '11') out.fabricado = fechaGS1(v);
  else if (ai === '10') out.lote = v;
  else if (ai === '21') out.serie = v;
}
/** Lee un código GS1-128 / DataMatrix (UDI): (01) GTIN, (17) vence, (10) lote, (21) serie. */
function parseGS1(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  const out = {};
  if (s.includes('(')) {
    const re = /\((\d{2,4})\)([^(]*)/g;
    let m;
    while ((m = re.exec(s))) asignarAI(out, m[1], m[2].trim());
  } else {
    s = s.replace(/^\][A-Za-z]\d/, '');
    const GS = '\u001d';
    let i = 0;
    while (i < s.length) {
      const ai = s.substr(i, 2); i += 2;
      if (ai === '01' || ai === '02') { asignarAI(out, ai, s.substr(i, 14)); i += 14; }
      else if (['11', '13', '15', '17'].includes(ai)) { asignarAI(out, ai, s.substr(i, 6)); i += 6; }
      else if (ai === '10' || ai === '21') {
        let j = s.indexOf(GS, i);
        if (j < 0) j = s.length;
        asignarAI(out, ai, s.slice(i, j)); i = j + 1;
      } else break;
    }
  }
  return Object.keys(out).length ? out : null;
}

// ---------- Importación (Excel / CSV) ----------
const norm = (s) => String(s === null || s === undefined ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

function parseCSV(texto) {
  const t = String(texto).replace(/^﻿/, '');
  const primera = t.split(/\r?\n/)[0] || '';
  const sep = (primera.match(/;/g) || []).length >= (primera.match(/,/g) || []).length ? (primera.includes('\t') ? '\t' : ';') : ',';
  const filas = [];
  let fila = [], campo = '', comillas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (comillas) {
      if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      fila.push(campo); filas.push(fila); fila = []; campo = '';
    } else campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter((f) => f.some((x) => String(x).trim() !== ''));
}

function aNumero(v) {
  if (typeof v === 'number') return v;
  let s = String(v === null || v === undefined ? '' : v).replace(/[$\s]/g, '');
  if (!s) return NaN;
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = s.replace(',', '.');
  return Number(s);
}
function aFecha(v) {
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + v * 864e5).toISOString().slice(0, 10);
  const s = String(v === null || v === undefined ? '' : v).trim();
  if (isISODate(s.slice(0, 10))) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  return '';
}

const COLUMNAS_IMPORT = {
  codigo: ['codigo', 'código', 'referencia', 'ref', 'sku', 'item'],
  nombre: ['nombre', 'descripcion', 'descripción', 'producto', 'articulo', 'artículo'],
  categoria: ['categoria', 'categoría', 'tipo', 'clase'],
  unidad: ['unidad', 'um', 'unidad de medida', 'presentacion', 'presentación'],
  stockMin: ['stock minimo', 'stock mínimo', 'minimo', 'mínimo', 'stockmin'],
  invima: ['invima', 'registro invima', 'registro sanitario'],
  invimaVence: ['vence invima', 'vencimiento invima', 'vigencia invima'],
  riesgo: ['riesgo', 'clasificacion', 'clasificación', 'clase de riesgo'],
  gtin: ['gtin', 'codigo de barras', 'código de barras', 'ean', 'barras'],
  bodega: ['bodega', 'ubicacion', 'ubicación', 'almacen', 'almacén'],
  lote: ['lote'],
  vence: ['vence', 'vencimiento', 'fecha de vencimiento', 'fecha vencimiento', 'caducidad'],
  cantidad: ['cantidad', 'existencia', 'saldo', 'stock', 'cant'],
  costoUnit: ['costo', 'costo unitario', 'costo unit', 'valor unitario', 'precio']
};

/** Interpreta filas (primera = encabezados) en productos y saldos. */
function interpretarImportacion(filas, db) {
  if (!filas || filas.length < 2) return { errores: ['El archivo no tiene datos.'], productos: [], saldos: [] };
  const enc = filas[0].map(norm);
  const idx = {};
  Object.entries(COLUMNAS_IMPORT).forEach(([k, alias]) => {
    const i = enc.findIndex((h) => alias.map(norm).includes(h));
    if (i >= 0) idx[k] = i;
  });
  const errores = [];
  if (idx.codigo === undefined) errores.push('Falta la columna "código".');
  if (idx.nombre === undefined) errores.push('Falta la columna "nombre".');
  if (errores.length) return { errores, productos: [], saldos: [], columnas: idx };
  const v = (f, k) => (idx[k] === undefined ? '' : f[idx[k]]);
  const productos = {};
  const saldos = [];
  const cats = Object.entries(CATEGORIAS);
  filas.slice(1).forEach((f, i) => {
    const fila = i + 2;
    const codigo = String(v(f, 'codigo') || '').trim();
    if (!codigo) return;
    const catTxt = norm(v(f, 'categoria'));
    const cat = (cats.find(([k, t]) => norm(t) === catTxt || k === catTxt || catTxt.startsWith(k.slice(0, 5))) || [])[0] || 'insumo';
    const existente = db.productos.find((p) => p.codigo.toUpperCase() === codigo.toUpperCase());
    if (!productos[codigo.toUpperCase()]) {
      productos[codigo.toUpperCase()] = {
        existente: !!existente, id: existente ? existente.id : null, codigo,
        nombre: String(v(f, 'nombre') || (existente && existente.nombre) || '').trim(),
        categoria: existente ? existente.categoria : cat, unidad: String(v(f, 'unidad') || (existente && existente.unidad) || 'unidad').trim(),
        stockMin: isFinite(aNumero(v(f, 'stockMin'))) ? aNumero(v(f, 'stockMin')) : (existente ? existente.stockMin : 0),
        invima: String(v(f, 'invima') || (existente && existente.invima) || '').trim(),
        invimaVence: aFecha(v(f, 'invimaVence')) || (existente && existente.invimaVence) || '',
        riesgo: String(v(f, 'riesgo') || (existente && existente.riesgo) || 'N/A').trim(),
        gtin: String(v(f, 'gtin') || (existente && existente.gtin) || '').trim(),
        fila
      };
    }
    const cant = aNumero(v(f, 'cantidad'));
    if (isFinite(cant) && cant > 0) {
      const lote = String(v(f, 'lote') || '').trim();
      const vence = aFecha(v(f, 'vence'));
      const costo = aNumero(v(f, 'costoUnit'));
      const bodega = String(v(f, 'bodega') || '').trim() || bodegaPrincipal(db.config);
      const prob = [];
      if (!lote) prob.push('sin lote');
      if (!vence) prob.push('sin fecha de vencimiento válida');
      if (!isFinite(costo) || costo < 0) prob.push('sin costo unitario');
      saldos.push({ codigo, bodega, lote, vence, cantidad: cant, costoUnit: isFinite(costo) ? costo : '', fila, problema: prob.join(', ') });
    }
  });
  Object.values(productos).forEach((p) => { if (!p.nombre) errores.push('Fila ' + p.fila + ': el producto ' + p.codigo + ' no tiene nombre.'); });
  return { errores, productos: Object.values(productos), saldos, columnas: idx };
}

// ---------- CSV ----------
function csv(filas) {
  const celda = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return '﻿' + filas.map((f) => f.map(celda).join(';')).join('\r\n');
}

export {
  r2, daysBetween, addDays, todayISO, yearOf, isISODate,
  CATEGORIAS, RIESGOS, METODOS, CAUSAS_AJUSTE, CAUSAS_BAJA, CAUSAS_DEVOLUCION, DOC_TIPOS, TIPOS_MOV, PREFIJOS,
  ROLES, PERMISOS, puede, sha256, hashPin,
  configBase, dbVacia, nuevoId, siguienteNumero, verNumero, siguienteOrden,
  semaforo, requiereInvima, estadoInvima, metodoDe, ultimoCierre, conteoAbierto, bodegaPrincipal, bodegaDe,
  aUnidadBase, lotKey, ordenar, replay, valorInventario, existencia, existenciasPorBodega,
  validarMovimiento, validarAnulacion, lotes, sugerirFEFO, expandirKit,
  estadoOrden, pendienteEnOrdenes, estadoRequisicion,
  consumoPorProducto, reabastecimiento, analisisABC, rotacion, consumoPorDestino, sinMovimiento,
  faltantesAnio, alertas, tempEnRango, cumplimiento,
  prepararCierre, crearConteo, diferenciasConteo, trazabilidad, parseGS1,
  parseCSV, aNumero, aFecha, interpretarImportacion, csv
};
