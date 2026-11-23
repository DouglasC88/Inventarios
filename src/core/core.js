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
import { PAISES } from './paises.js';
import { MUNICIPIOS } from './divipola.js';

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
  conteo: 'CF', cierre: 'CI', orden: 'OC', requisicion: 'RQ', factura: 'FP', manual: 'CM'
};
const ENTRAN = ['inicial', 'entrada'];
const SALEN = ['salida', 'baja', 'devolucion'];

// ---------- Usuarios y permisos ----------
const ROLES = {
  admin: 'Administrador',
  supervisor: 'Supervisor',
  almacenista: 'Almacenista',
  consultorio: 'Consultorio',
  contador: 'Contador',
  consulta: 'Consulta (auditor o revisor fiscal)'
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
  importar: ['admin', 'contador'],
  config: ['admin'],
  usuarios: ['admin'],
  contabilidad: ['admin', 'supervisor', 'contador']
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
    reabastecimiento: { consumoDias: 90, seguridadDias: 7, coberturaDias: 30 },
    contabilidad: cuentasBase()
  };
}

function dbVacia() {
  return {
    version: 1,
    config: configBase(),
    productos: [], proveedores: [], movimientos: [], conteos: [], cierres: [],
    temperaturas: [], auditoria: [], ordenes: [], requisiciones: [], kits: [], usuarios: [],
    servicios: [], facturasProveedor: [], comprobantesManuales: [], planCuentas: planCuentasBase(),
    bodegas: [{ id: 'b-principal', codigo: 'BP', nombre: 'Bodega principal', tipo: 'bodega', responsable: '', sede: '', activa: true }],
    grupos: [], lotes: [],
    seq: { orden: 0 }
  };
}

// ---------- Contabilidad (PUC colombiano, cuentas configurables) ----------
// Plan de cuentas base (subconjunto del PUC, Decreto 2650 de 1993). El cliente puede editarlo o cargar el suyo.
// [código, nombre, naturaleza D/C, maneja tercero]
const PUC_BASE = [
  ['1', 'ACTIVO', 'D'], ['11', 'DISPONIBLE', 'D'], ['1105', 'Caja', 'D'], ['1110', 'Bancos', 'D', true],
  ['14', 'INVENTARIOS', 'D'], ['1435', 'Mercancías no fabricadas por la empresa', 'D'], ['1455', 'Materiales, repuestos y accesorios', 'D'], ['1499', 'Provisiones', 'C'],
  ['2', 'PASIVO', 'C'], ['22', 'PROVEEDORES', 'C'], ['2205', 'Nacionales', 'C', true],
  ['23', 'CUENTAS POR PAGAR', 'C'], ['2335', 'Costos y gastos por pagar', 'C', true], ['233595', 'Otros (mercancía recibida por facturar)', 'C', true],
  ['2365', 'Retención en la fuente', 'C', true], ['236505', 'Salarios y pagos laborales', 'C', true], ['236515', 'Honorarios', 'C', true], ['236525', 'Servicios', 'C', true], ['236540', 'Compras', 'C', true], ['2367', 'Impuesto a las ventas retenido', 'C', true], ['2368', 'Impuesto de industria y comercio retenido', 'C', true],
  ['24', 'IMPUESTOS, GRAVÁMENES Y TASAS', 'C'], ['2408', 'Impuesto sobre las ventas por pagar', 'C', true],
  ['3', 'PATRIMONIO', 'C'], ['37', 'RESULTADOS DE EJERCICIOS ANTERIORES', 'C'], ['3705', 'Utilidades acumuladas', 'C'],
  ['4', 'INGRESOS', 'C'], ['41', 'OPERACIONALES', 'C'], ['4135', 'Comercio al por mayor y al por menor', 'C'], ['4165', 'Servicios sociales y de salud', 'C'], ['42', 'NO OPERACIONALES', 'C'], ['4250', 'Recuperaciones', 'C'], ['4295', 'Diversos', 'C'],
  ['5', 'GASTOS', 'D'], ['51', 'OPERACIONALES DE ADMINISTRACIÓN', 'D'], ['5199', 'Provisiones', 'D'], ['53', 'NO OPERACIONALES', 'D'], ['5315', 'Gastos extraordinarios', 'D'],
  ['6', 'COSTOS DE VENTAS', 'D'], ['61', 'COSTO DE VENTAS Y DE PRESTACIÓN DE SERVICIOS', 'D'], ['6135', 'Comercio al por mayor y al por menor', 'D'], ['6155', 'Servicios sociales y de salud', 'D']
];
const NIVELES_CUENTA = { 1: 'Clase', 2: 'Grupo', 3: 'Cuenta', 4: 'Subcuenta', 5: 'Auxiliar' };
function nivelCuenta(codigo) {
  const n = String(codigo || '').length;
  return n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 3 : n <= 6 ? 4 : 5;
}
/** Plan base: las cuentas de 4 o más dígitos reciben movimiento; las demás solo agrupan. */
function planCuentasBase() {
  return PUC_BASE.map(([codigo, nombre, naturaleza, terceros]) => ({ codigo, nombre, naturaleza, terceros: !!terceros, movimiento: codigo.length >= 4, activa: true }));
}
function cuentaPlan(db, codigo) { return (db.planCuentas || []).find((c) => c.codigo === String(codigo)) || null; }
/** Una cuenta solo recibe movimiento si no tiene subcuentas activas. */
function esDeMovimiento(db, codigo) {
  const c = cuentaPlan(db, codigo);
  if (!c || c.activa === false) return false;
  return !(db.planCuentas || []).some((x) => x.codigo !== c.codigo && x.activa !== false && x.codigo.startsWith(c.codigo));
}

const CONCEPTOS_CONTABLES = {
  inventario: 'Inventario de materiales e insumos',
  ingreso: 'Ingresos por servicios o ventas',
  puente: 'Mercancía recibida por facturar (cuenta puente)',
  proveedores: 'Proveedores nacionales',
  ivaDescontable: 'IVA descontable en compras',
  retefuente: 'Retención en la fuente por compras',
  reteiva: 'Retención de IVA (ReteIVA)',
  reteica: 'Retención de industria y comercio (ReteICA)',
  difPrecio: 'Diferencias en precio de compra',
  costosAdic: 'Fletes y costos adicionales por pagar',
  costoConsumo: 'Costo por consumo en servicios de salud',
  costoVenta: 'Costo de venta de insumos',
  faltantes: 'Pérdida por faltantes y bajas',
  sobrantes: 'Ingreso por sobrantes de inventario',
  deterioroGasto: 'Gasto por deterioro de inventario (VNR)',
  deterioroInv: 'Deterioro acumulado del inventario (menor valor)',
  recuperacion: 'Recuperación de deterioro',
  apertura: 'Contrapartida de saldos iniciales'
};
function cuentasBase() {
  const c = (cuenta, nombre) => ({ cuenta, nombre });
  return {
    inventario: c('1455', 'Materiales, repuestos y accesorios'),
    ingreso: c('4165', 'Servicios sociales y de salud'),
    puente: c('233595', 'Otros (mercancía recibida por facturar)'),
    proveedores: c('2205', 'Nacionales'),
    ivaDescontable: c('2408', 'Impuesto sobre las ventas por pagar'),
    retefuente: c('236540', 'Compras'),
    reteiva: c('2367', 'Impuesto a las ventas retenido'),
    reteica: c('2368', 'Impuesto de industria y comercio retenido'),
    difPrecio: c('6155', 'Servicios sociales y de salud'),
    costosAdic: c('2335', 'Costos y gastos por pagar'),
    costoConsumo: c('6155', 'Servicios sociales y de salud'),
    costoVenta: c('6135', 'Comercio al por mayor y al por menor'),
    faltantes: c('5315', 'Gastos extraordinarios'),
    sobrantes: c('4295', 'Diversos'),
    deterioroGasto: c('5199', 'Provisiones'),
    deterioroInv: c('1499', 'Provisiones'),
    recuperacion: c('4250', 'Recuperaciones'),
    apertura: c('3705', 'Utilidades acumuladas'),
    centroCostoPorBodega: true,
    usarPuente: true,
    retenciones: { retefuentePct: 2.5, reteivaPct: 15, reteicaPct: 0, porConcepto: retencionesPorConceptoBase() }
  };
}
// ---------- Grupos (clasificación de procedimientos, productos, insumos y servicios) ----------
/** Clasificación de cada grupo. Las de productos tienen existencias; las de servicios no. */
const CLASIFICACIONES = { insumo: 'Insumo', producto: 'Producto', medicamento: 'Medicamentos', dispositivo: 'Dispositivos médicos', equipo: 'Equipos biomédicos', procedimiento: 'Procedimiento', servicio: 'Servicio' };
const CLASIF_PRODUCTO = ['insumo', 'producto', 'medicamento', 'dispositivo', 'equipo'];
const CLASIF_SERVICIO = ['procedimiento', 'servicio'];
/** Tipo de concepto del grupo: define la retención en la fuente que se practica (subcuentas 2365 del PUC). */
const CONCEPTOS_RETENCION = { general: 'General', compras: 'Compras generales', servicios: 'Servicios', honorarios: 'Honorarios', costos: 'Costos', legales: 'Legales', empleados: 'Empleados' };
/** Tarifas y cuentas sugeridas por concepto. Vacío = la retención general. Valídelas con su contador cada año. */
function retencionesPorConceptoBase() {
  return {
    general: { pct: '', cuenta: '' }, compras: { pct: 2.5, cuenta: '236540' }, servicios: { pct: 4, cuenta: '236525' }, honorarios: { pct: 11, cuenta: '236515' },
    costos: { pct: '', cuenta: '' }, legales: { pct: '', cuenta: '' }, empleados: { pct: '', cuenta: '236505' }
  };
}
const grupoPorId = (db, id) => (id ? db.grupos.find((g) => g.id === id) : null);
/** Grupo de primer nivel (línea) de un grupo. */
function grupoRaiz(db, id) {
  let g = grupoPorId(db, id), guard = 0;
  while (g && g.parentId && guard++ < 10) { const p = grupoPorId(db, g.parentId); if (!p) break; g = p; }
  return g;
}
/** Dato de un grupo heredado de su grupo padre o de su línea cuando está vacío. */
function datoGrupo(db, id, campo) {
  let g = grupoPorId(db, id), guard = 0;
  while (g && guard++ < 10) {
    const v = g[campo];
    if (v !== undefined && v !== null && v !== '' && v !== false) return v;
    g = grupoPorId(db, g.parentId);
  }
  return '';
}
/** La clasificación la define la línea: sus grupos y subgrupos la heredan. */
function clasificacionGrupo(db, id) { const r = grupoRaiz(db, id); return r ? r.clasificacion || '' : ''; }
/** Clasificación de un producto: la propia, la de su grupo o la que corresponde a su tipo de material. */
function clasificacionProducto(db, p) {
  if (!p) return '';
  if (p.clasificacion) return p.clasificacion;
  const g = clasificacionGrupo(db, p.grupoId);
  if (g && CLASIF_PRODUCTO.includes(g)) return g;
  if (p.categoria === 'medicamento' || p.tipoMaterial === 'medicamento') return 'medicamento';
  if (p.tipoMaterial === 'equipo' || p.tipoMaterial === 'activo') return 'equipo';
  if (p.tipoMaterial === 'producto') return 'producto';
  if (p.categoria === 'dispositivo' || ['dispositivo', 'instrumental'].includes(p.tipoMaterial)) return 'dispositivo';
  return 'insumo';
}
/** Valida un grupo antes de guardarlo. */
function validarGrupo(db, g) {
  const e = [];
  const codigo = String(g.codigo || '').trim().toUpperCase();
  if (!codigo) e.push('El código es obligatorio.');
  else if (db.grupos.some((x) => x.id !== g.id && String(x.codigo).toUpperCase() === codigo)) e.push('Ya existe un grupo con ese código.');
  if (!String(g.nombre || '').trim()) e.push('La descripción es obligatoria.');
  const padre = grupoPorId(db, g.parentId);
  if (g.parentId && !padre) e.push('El grupo padre no existe.');
  if (g.id && g.parentId && gruposDescendientes(db, g.id).has(g.parentId)) e.push('Un grupo no puede quedar dentro de sí mismo.');
  const clas = padre ? clasificacionGrupo(db, padre.id) : g.clasificacion;
  if (!padre && !CLASIFICACIONES[g.clasificacion]) e.push('Elija la clasificación (insumo, producto, medicamento, servicio…).');
  if (db.grupos.some((x) => x.id !== g.id && (x.parentId || '') === (g.parentId || '') && norm(x.nombre) === norm(g.nombre) && (padre || x.clasificacion === g.clasificacion))) e.push('Ya existe un grupo "' + g.nombre + '" con esa clasificación.');
  if (g.conceptoRetencion && !CONCEPTOS_RETENCION[g.conceptoRetencion]) e.push('El tipo de concepto no es válido.');
  ['tarifaIvaCompra', 'tarifaIvaVenta'].forEach((k) => { if (g[k] && !TARIFAS_IVA[g[k]]) e.push('Elija una tarifa de IVA válida.'); });
  Object.entries(g.cuentas || {}).forEach(([k, c]) => {
    if (!c) return;
    if (!cuentaPlan(db, c)) e.push('La cuenta ' + c + ' (' + (CONCEPTOS_CONTABLES[k] || k) + ') no existe en el plan de cuentas.');
    else if (!esDeMovimiento(db, c)) e.push('La cuenta ' + c + ' tiene subcuentas; elija una cuenta de movimiento.');
  });
  if (g.id && !padre && g.clasificacion) {
    const usados = gruposDescendientes(db, g.id);
    const esServ = CLASIF_SERVICIO.includes(g.clasificacion);
    if (!esServ && (db.servicios || []).some((x) => usados.has(x.grupoId))) e.push('Tiene servicios asignados: su clasificación debe ser procedimiento o servicio.');
    if (esServ && db.productos.some((x) => usados.has(x.grupoId))) e.push('Tiene productos asignados: su clasificación no puede ser procedimiento ni servicio.');
  }
  if (g.orden !== '' && g.orden !== undefined && g.orden !== null && !(Number(g.orden) >= 0)) e.push('La posición en informes debe ser un número.');
  void clas;
  return e;
}
/** Valida un servicio o procedimiento. */
function validarServicio(db, sv) {
  const e = [];
  const cod = String(sv.codigo || '').trim();
  if (!cod) e.push('El código es obligatorio.');
  else if ((db.servicios || []).some((k) => k.id !== sv.id && String(k.codigo).toUpperCase() === cod.toUpperCase())) e.push('Ya existe un servicio con ese código.');
  if (!String(sv.nombre || '').trim()) e.push('El nombre del servicio es obligatorio.');
  if (!sv.grupoId) e.push('Elija el grupo del servicio.');
  else if (!CLASIF_SERVICIO.includes(clasificacionGrupo(db, sv.grupoId))) e.push('El grupo elegido no es de procedimientos ni de servicios.');
  if (sv.precio !== '' && sv.precio !== undefined && Number(sv.precio) < 0) e.push('El precio no puede ser negativo.');
  if (sv.tarifaIvaVenta && !TARIFAS_IVA[sv.tarifaIvaVenta]) e.push('Elija la tarifa de IVA.');
  return e;
}
/**
 * Datos anteriores: asigna la clasificación a las líneas según sus productos y convierte la categoría
 * escrita de cada servicio en un grupo de clasificación "procedimiento".
 */
function migrarClasificacion(db) {
  db.grupos.forEach((g) => { if (g.activo === undefined) g.activo = true; });
  db.grupos.filter((g) => !g.parentId && !g.clasificacion).forEach((g) => {
    const ids = gruposDescendientes(db, g.id);
    const cuenta = {};
    db.productos.filter((p) => ids.has(p.grupoId)).forEach((p) => { const c = clasificacionProducto(db, Object.assign({}, p, { grupoId: '' })); cuenta[c] = (cuenta[c] || 0) + 1; });
    if ((db.servicios || []).some((x) => ids.has(x.grupoId))) cuenta.procedimiento = 1e6;
    g.clasificacion = Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a])[0] || 'insumo';
  });
  (db.servicios || []).forEach((sv) => {
    if (sv.grupoId || !String(sv.categoria || '').trim()) return;
    let g = db.grupos.find((x) => !x.parentId && x.clasificacion === 'procedimiento' && norm(x.nombre) === norm(sv.categoria));
    if (!g) {
      let n = db.grupos.length + 1, cod;
      do { cod = 'SV' + String(n++).padStart(2, '0'); } while (db.grupos.some((x) => x.codigo === cod));
      g = { id: 'gs-' + nuevoId(), codigo: cod, nombre: String(sv.categoria).trim(), clasificacion: 'procedimiento', activo: true };
      db.grupos.push(g);
    }
    sv.grupoId = g.id;
  });
  return db;
}

/** Cuenta de un concepto; la clasificación del producto (o su línea/grupo padre) puede tener su propia cuenta. */
function cuentaDe(db, concepto, producto) {
  const base = Object.assign(cuentasBase(), (db.config && db.config.contabilidad) || {});
  const nombrePlan = (cod, def) => { const c = cuentaPlan(db, cod); return c ? c.nombre : def; };
  if (producto && producto.cuentas && producto.cuentas[concepto]) return { cuenta: producto.cuentas[concepto], nombre: nombrePlan(producto.cuentas[concepto], (base[concepto] || {}).nombre + ' · ' + producto.codigo) };
  let g = producto ? db.grupos.find((x) => x.id === producto.grupoId) : null, guard = 0;
  while (g && guard++ < 10) {
    if (g.cuentas && g.cuentas[concepto]) return { cuenta: g.cuentas[concepto], nombre: nombrePlan(g.cuentas[concepto], (base[concepto] || {}).nombre + ' · ' + g.nombre) };
    g = g.parentId ? db.grupos.find((x) => x.id === g.parentId) : null;
  }
  const b = base[concepto] || { cuenta: '', nombre: concepto };
  return { cuenta: b.cuenta, nombre: nombrePlan(b.cuenta, b.nombre) };
}

// ---------- Facturas de proveedor (verificación de facturas: orden de compra · entrada · factura) ----------
/** Base de cada línea de entrada (cantidad × costo unitario, sin costos adicionales). */
function baseLinea(l) { return r2(Number(l.cantidad) * Number(l.costoUnit || 0)); }
function lineasFacturadas(db, exceptoId) {
  const s = new Set();
  (db.facturasProveedor || []).forEach((f) => { if (!f.anulado && f.id !== exceptoId) f.lineas.forEach((l) => s.add(l.movId + '#' + l.idx)); });
  return s;
}
/** Entradas (o líneas) recibidas que aún no tienen factura del proveedor. Es el análisis de la cuenta puente. */
function pendientesPorFacturar(db, proveedorId) {
  const fact = lineasFacturadas(db);
  const out = [];
  ordenar(db.movimientos).forEach((m) => {
    if (m.anulado || m.tipo !== 'entrada' || (proveedorId && m.proveedorId !== proveedorId)) return;
    m.lineas.forEach((l, idx) => {
      if (fact.has(m.id + '#' + idx)) return;
      out.push({ movId: m.id, idx, num: m.num, fecha: m.fecha, proveedorId: m.proveedorId, docNum: m.docNum, ordenNum: m.ordenNum || '', productoId: l.productoId, lote: l.lote, cantidad: Number(l.cantidad), costoUnit: Number(l.costoUnit || 0), valor: baseLinea(l) });
    });
  });
  return out;
}
/** Totales de una factura: diferencia de precio frente a lo recibido, IVA y retenciones. */
function calcularFactura(f) {
  const recibido = r2(f.lineas.reduce((s, l) => s + Number(l.valorRecibido || 0), 0));
  const subtotal = r2(f.lineas.reduce((s, l) => s + Number(l.valorFacturado || 0), 0));
  // Si cada línea trae su tarifa (tomada del producto), el IVA se calcula línea por línea.
  const porLinea = f.lineas.length > 0 && f.lineas.every((l) => l.ivaPct !== undefined && l.ivaPct !== '' && l.ivaPct !== null);
  const iva = f.iva !== undefined && f.iva !== '' ? r2(f.iva)
    : porLinea ? r2(f.lineas.reduce((s, l) => s + Number(l.valorFacturado || 0) * Number(l.ivaPct) / 100, 0))
    : r2(subtotal * (Number(f.ivaPct) || 0) / 100);
  // IVA que no se puede descontar (mayor valor del gasto): va al gasto del producto y no a la 2408.
  const ivaNoDescontable = porLinea && !(f.iva !== undefined && f.iva !== '') ? r2(f.lineas.filter((l) => l.ivaNoDescontable).reduce((s, l) => s + Number(l.valorFacturado || 0) * Number(l.ivaPct) / 100, 0)) : 0;
  const retefuente = r2(subtotal * (Number(f.retefuentePct) || 0) / 100);
  const reteiva = r2(iva * (Number(f.reteivaPct) || 0) / 100);
  const reteica = r2(subtotal * (Number(f.reteicaPct) || 0) / 100);
  return { recibido, subtotal, difPrecio: r2(subtotal - recibido), iva, ivaNoDescontable, retefuente, reteiva, reteica, total: r2(subtotal + iva - retefuente - reteiva - reteica) };
}
function validarFactura(db, f, hoy) {
  const e = [];
  hoy = hoy || todayISO();
  if (!isISODate(f.fecha)) e.push('La fecha de la factura no es válida.');
  else if (f.fecha > hoy) e.push('La fecha no puede ser futura.');
  const uc = ultimoCierre(db);
  if (uc && f.fecha <= uc.fecha) e.push('El periodo está cerrado hasta ' + uc.fecha + '.');
  if (!f.proveedorId || !db.proveedores.some((t) => t.id === f.proveedorId)) e.push('Seleccione el proveedor.');
  if (!DOC_TIPOS[f.docTipo]) e.push('Indique si es factura electrónica o documento soporte.');
  if (!String(f.docNum || '').trim()) e.push('Escriba el número de la factura o documento soporte.');
  else if ((db.facturasProveedor || []).some((x) => !x.anulado && x.id !== f.id && x.proveedorId === f.proveedorId && String(x.docNum).trim().toUpperCase() === String(f.docNum).trim().toUpperCase())) e.push('Esa factura ya está registrada para este proveedor.');
  if (!f.lineas || !f.lineas.length) e.push('Seleccione al menos una línea recibida para facturar.');
  const fact = lineasFacturadas(db, f.id);
  (f.lineas || []).forEach((l) => {
    const m = db.movimientos.find((x) => x.id === l.movId);
    if (!m || m.anulado || m.tipo !== 'entrada') e.push('Una línea no corresponde a una entrada vigente.');
    else if (m.proveedorId !== f.proveedorId) e.push(m.num + ' es de otro proveedor.');
    else if (fact.has(l.movId + '#' + l.idx)) e.push(m.num + ': la línea ya fue facturada.');
    if (Number(l.valorFacturado) < 0) e.push('El valor facturado no puede ser negativo.');
  });
  ['ivaPct', 'retefuentePct', 'reteivaPct', 'reteicaPct'].forEach((k) => { if (f[k] !== '' && f[k] !== undefined && !(Number(f[k]) >= 0 && Number(f[k]) <= 100)) e.push('Los porcentajes deben estar entre 0 y 100.'); });
  return e;
}

// ---------- Comprobantes manuales ----------
function validarComprobanteManual(db, cp, hoy) {
  const e = [];
  hoy = hoy || todayISO();
  if (!isISODate(cp.fecha)) e.push('La fecha no es válida.');
  else if (cp.fecha > hoy) e.push('La fecha no puede ser futura.');
  const uc = ultimoCierre(db);
  if (uc && cp.fecha <= uc.fecha) e.push('El periodo está cerrado hasta ' + uc.fecha + '.');
  if (!String(cp.descripcion || '').trim()) e.push('Escriba la descripción del comprobante.');
  const ls = (cp.lineas || []).filter((l) => l.cuenta || Number(l.debito) || Number(l.credito));
  if (ls.length < 2) e.push('Un comprobante necesita al menos dos líneas.');
  ls.forEach((l, i) => {
    const n = 'Línea ' + (i + 1) + ': ';
    const c = cuentaPlan(db, l.cuenta);
    if (!c) e.push(n + 'la cuenta ' + (l.cuenta || '') + ' no existe en el plan de cuentas.');
    else if (!esDeMovimiento(db, l.cuenta)) e.push(n + 'la cuenta ' + l.cuenta + ' es de agrupación; use una subcuenta de movimiento.');
    else if (c.terceros && !String(l.tercero || '').trim()) e.push(n + 'la cuenta ' + l.cuenta + ' exige tercero (NIT).');
    const d = Number(l.debito) || 0, cr = Number(l.credito) || 0;
    if (d < 0 || cr < 0) e.push(n + 'los valores no pueden ser negativos.');
    if ((d > 0) === (cr > 0)) e.push(n + 'escriba un valor en débito o en crédito, no en ambos.');
  });
  const td = r2(ls.reduce((s, l) => s + (Number(l.debito) || 0), 0)), tc = r2(ls.reduce((s, l) => s + (Number(l.credito) || 0), 0));
  if (Math.abs(td - tc) >= 0.01) e.push('El comprobante no cuadra: débitos ' + td + ' y créditos ' + tc + '.');
  return e;
}

/** Comprobantes contables: movimientos de inventario, facturas de proveedor, cierres y comprobantes manuales. Los anulados generan su reversión. */
function comprobantesContables(db, state, f) {
  f = f || {};
  const cfg = Object.assign(cuentasBase(), db.config.contabilidad || {});
  const out = [];
  const nit = (id) => { const t = db.proveedores.find((x) => x.id === id); return t ? String(t.nit || '') : ''; };
  // Cuenta por pagar propia del tercero (ficha del tercero › cuenta crédito), si existe y recibe movimiento.
  const ctaProv = (id) => { const t = db.proveedores.find((x) => x.id === id); return t && t.cuentaCredito && esDeMovimiento(db, t.cuentaCredito) ? t.cuentaCredito : ''; };
  const cc = (b) => (cfg.centroCostoPorBodega ? ((db.bodegas.find((x) => x.nombre === b) || {}).codigo || b) : '');
  const nuevo = () => {
    const lineas = [];
    const add = (concepto, producto, debito, credito, tercero, centro, detalle, cuentaFija) => {
      debito = r2(debito); credito = r2(credito);
      if (!debito && !credito) return;
      const fija = cuentaFija && cuentaPlan(db, cuentaFija);
      const cu = fija ? { cuenta: fija.codigo, nombre: fija.nombre } : cuentaDe(db, concepto, producto);
      const ex = lineas.find((x) => x.cuenta === cu.cuenta && x.tercero === (tercero || '') && x.centro === (centro || '') && (debito > 0) === (x.debito > 0) && x.detalle === detalle);
      if (ex) { ex.debito = r2(ex.debito + debito); ex.credito = r2(ex.credito + credito); return; }
      lineas.push({ cuenta: cu.cuenta, nombre: cu.nombre, concepto, debito, credito, tercero: tercero || '', centro: centro || '', detalle });
    };
    return { lineas, add };
  };
  const emitir = (base, lineas, anulacion) => {
    if (!lineas.length) return;
    out.push(Object.assign({}, base, { lineas }));
    if (anulacion) {
      out.push(Object.assign({}, base, {
        id: base.id + '-R', num: base.num + '-R', fecha: String(anulacion.fecha || base.fecha).slice(0, 10), tipo: 'Reversión ' + base.tipo.toLowerCase(),
        descripcion: 'Anulación de ' + base.documento + (anulacion.motivo ? ': ' + anulacion.motivo : ''), reversion: true,
        lineas: lineas.map((l) => Object.assign({}, l, { debito: l.credito, credito: l.debito, detalle: 'Reversión · ' + l.detalle }))
      }));
    }
  };
  const replayConAnulados = replay(Object.assign({}, db, { movimientos: db.movimientos.map((m) => (m.anulado ? Object.assign({}, m, { anulado: false }) : m)) }));
  for (const m of ordenar(db.movimientos)) {
    if (m.tipo === 'traslado') continue;
    const c = m.anulado ? replayConAnulados.movCost[m.id] : state.movCost[m.id];
    if (!c) continue;
    const { lineas, add } = nuevo();
    m.lineas.forEach((l, i) => {
      const p = db.productos.find((x) => x.id === l.productoId);
      const v = c.lineas[i].valor;
      if (!v) return;
      const b = l.bodega || bodegaDe(m, db.config);
      const q = Number(l.cantidad);
      if (m.tipo === 'entrada') {
        const base = baseLinea(l);
        add('inventario', p, v, 0, '', cc(b), 'Entrada ' + m.num);
        if (cfg.usarPuente) add('puente', p, 0, base, nit(m.proveedorId), '', 'Recibido por facturar ' + m.docTipo + ' ' + m.docNum);
        else add('proveedores', p, 0, base, nit(m.proveedorId), '', 'Compra ' + m.docTipo + ' ' + m.docNum, ctaProv(m.proveedorId));
        if (r2(v - base) > 0) add('costosAdic', p, 0, r2(v - base), '', '', 'Costos adicionales de la compra');
      } else if (m.tipo === 'inicial') {
        add('inventario', p, v, 0, '', cc(b), 'Saldo inicial'); add('apertura', p, 0, v, '', '', 'Saldo inicial');
      } else if (m.tipo === 'salida') {
        add(m.destinoTipo === 'Venta' ? 'costoVenta' : 'costoConsumo', p, v, 0, '', cc(b), (m.destinoTipo || 'Salida') + (m.procedimiento ? ' · ' + m.procedimiento : ''));
        add('inventario', p, 0, v, '', cc(b), 'Salida de inventario');
      } else if (m.tipo === 'devolucion') {
        // La devolución queda a cargo del proveedor (nota crédito por recibir); la cuenta puente solo cruza entradas y facturas.
        add('proveedores', p, v, 0, nit(m.proveedorId), '', 'Devolución ' + (m.docNum || '') + ' · nota crédito por recibir', ctaProv(m.proveedorId));
        add('inventario', p, 0, v, '', cc(b), 'Devolución a proveedor');
      } else if (m.tipo === 'baja' || (m.tipo === 'ajuste' && q < 0)) {
        add('faltantes', p, v, 0, '', cc(b), m.tipo === 'baja' ? 'Baja: ' + (CAUSAS_BAJA[m.causa] || '') : 'Ajuste: ' + (CAUSAS_AJUSTE[l.causa] || ''));
        add('inventario', p, 0, v, '', cc(b), 'Salida por ' + (m.tipo === 'baja' ? 'baja' : 'ajuste'));
      } else if (m.tipo === 'ajuste' && q > 0) {
        add('inventario', p, v, 0, '', cc(b), 'Ajuste: ' + (CAUSAS_AJUSTE[l.causa] || ''));
        add('sobrantes', p, 0, v, '', cc(b), 'Ajuste: ' + (CAUSAS_AJUSTE[l.causa] || ''));
      }
    });
    emitir({ id: m.id, fecha: m.fecha, num: 'CT-' + m.num, documento: m.num, tipo: TIPOS_MOV[m.tipo], origen: 'inventario', descripcion: detalleMov(db, m, m.lineas[0]) }, lineas, m.anulado ? m.anulacion || {} : null);
  }
  (db.facturasProveedor || []).forEach((fp) => {
    const { lineas, add } = nuevo();
    const t = calcularFactura(fp);
    const n = nit(fp.proveedorId);
    const ref = fp.docTipo + ' ' + fp.docNum;
    fp.lineas.forEach((l) => {
      const p = db.productos.find((x) => x.id === l.productoId);
      add(cfg.usarPuente ? 'puente' : 'inventario', p, Number(l.valorRecibido) || 0, 0, cfg.usarPuente ? n : '', '', 'Recibido ' + (l.num || ''));
      const dif = r2(Number(l.valorFacturado || 0) - Number(l.valorRecibido || 0));
      if (dif > 0) add('difPrecio', p, dif, 0, '', '', 'Diferencia de precio ' + ref);
      if (dif < 0) add('difPrecio', p, 0, -dif, '', '', 'Diferencia de precio ' + ref);
    });
    add('ivaDescontable', null, r2(t.iva - t.ivaNoDescontable), 0, n, '', 'IVA ' + ref);
    fp.lineas.filter((l) => l.ivaNoDescontable).forEach((l) => {
      const p = db.productos.find((x) => x.id === l.productoId);
      add('costoConsumo', p, r2(Number(l.valorFacturado || 0) * Number(l.ivaPct) / 100), 0, '', '', 'IVA mayor valor del gasto ' + ref);
    });
    const rc = (cfg.retenciones && cfg.retenciones.porConcepto && cfg.retenciones.porConcepto[fp.conceptoRetencion]) || {};
    add('retefuente', null, 0, t.retefuente, n, '', 'Retención en la fuente' + (fp.conceptoRetencion ? ' (' + (CONCEPTOS_RETENCION[fp.conceptoRetencion] || '') + ')' : '') + ' ' + ref, rc.cuenta && esDeMovimiento(db, rc.cuenta) ? rc.cuenta : '');
    add('reteiva', null, 0, t.reteiva, n, '', 'ReteIVA ' + ref);
    add('reteica', null, 0, t.reteica, n, '', 'ReteICA ' + ref);
    // Cuenta por pagar: la del tercero; si no tiene, la del grupo de los productos (si todos coinciden); si no, la general.
    const cxpGrupos = [...new Set(fp.lineas.map((l) => cuentaDe(db, 'proveedores', db.productos.find((x) => x.id === l.productoId)).cuenta))];
    add('proveedores', null, 0, t.total, n, '', 'Factura ' + ref, ctaProv(fp.proveedorId) || (cxpGrupos.length === 1 ? cxpGrupos[0] : ''));
    emitir({ id: fp.id, fecha: fp.fecha, num: 'CT-' + fp.num, documento: fp.num, tipo: 'Factura de proveedor', origen: 'compras', descripcion: (db.proveedores.find((x) => x.id === fp.proveedorId) || {}).nombre + ' · ' + ref }, lineas, fp.anulado ? fp.anulacion || {} : null);
  });
  db.cierres.forEach((ci) => {
    const { lineas, add } = nuevo();
    if (ci.nuevoDeterioro > 0) { add('deterioroGasto', null, ci.nuevoDeterioro, 0, '', '', 'Deterioro por VNR (NIC 2)'); add('deterioroInv', null, 0, ci.nuevoDeterioro, '', '', 'Deterioro por VNR (NIC 2)'); }
    if (ci.reversion > 0) { add('deterioroInv', null, ci.reversion, 0, '', '', 'Reversión de deterioro'); add('recuperacion', null, 0, ci.reversion, '', '', 'Reversión de deterioro'); }
    emitir({ id: ci.id || ci.num, fecha: ci.fecha, num: 'CT-' + ci.num, documento: ci.num, tipo: 'Cierre', origen: 'cierre', descripcion: 'Ajuste por valor neto realizable' }, lineas, null);
  });
  (db.comprobantesManuales || []).forEach((cm) => {
    const lineas = cm.lineas.filter((l) => Number(l.debito) || Number(l.credito)).map((l) => {
      const c = cuentaPlan(db, l.cuenta);
      return { cuenta: l.cuenta, nombre: c ? c.nombre : '', concepto: 'manual', debito: r2(Number(l.debito) || 0), credito: r2(Number(l.credito) || 0), tercero: l.tercero || '', centro: l.centro || '', detalle: l.detalle || cm.descripcion };
    });
    emitir({ id: cm.id, fecha: cm.fecha, num: cm.num, documento: cm.num, tipo: 'Comprobante manual', origen: 'manual', descripcion: cm.descripcion }, lineas, cm.anulado ? cm.anulacion || {} : null);
  });
  const sel = out.filter((cp) => (!f.desde || cp.fecha >= f.desde) && (!f.hasta || cp.fecha <= f.hasta) && (!f.origenes || f.origenes.includes(cp.origen)));
  sel.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  sel.forEach((cp) => { cp.debito = r2(cp.lineas.reduce((a, x) => a + x.debito, 0)); cp.credito = r2(cp.lineas.reduce((a, x) => a + x.credito, 0)); cp.cuadra = Math.abs(cp.debito - cp.credito) < 0.01; });
  return sel;
}

/** Saldo de cada cuenta en los comprobantes (para auxiliares y conciliación). */
function saldosContables(comprobantes) {
  const s = {};
  comprobantes.forEach((cp) => cp.lineas.forEach((l) => {
    const x = s[l.cuenta] || (s[l.cuenta] = { cuenta: l.cuenta, nombre: l.nombre, debito: 0, credito: 0 });
    x.debito = r2(x.debito + l.debito); x.credito = r2(x.credito + l.credito);
  }));
  return Object.values(s).map((x) => Object.assign(x, { saldo: r2(x.debito - x.credito) })).sort((a, b) => a.cuenta.localeCompare(b.cuenta));
}

/** Libro mayor y balances: saldo anterior, débitos, créditos y saldo final por cuenta, consolidado al nivel pedido. */
function balanceComprobacion(db, comprobantes, desde, hasta, nivel) {
  nivel = Number(nivel) || 5;
  const largo = { 1: 1, 2: 2, 3: 4, 4: 6, 5: 99 }[nivel];
  const filas = {};
  const nombre = (cod) => { const c = cuentaPlan(db, cod); return c ? c.nombre : ''; };
  comprobantes.forEach((cp) => cp.lineas.forEach((l) => {
    const cod = String(l.cuenta).slice(0, largo);
    const x = filas[cod] || (filas[cod] = { cuenta: cod, nombre: nombre(cod) || l.nombre, anterior: 0, debito: 0, credito: 0 });
    if (cp.fecha < desde) x.anterior = r2(x.anterior + l.debito - l.credito);
    else if (cp.fecha <= hasta) { x.debito = r2(x.debito + l.debito); x.credito = r2(x.credito + l.credito); }
  }));
  return Object.values(filas).map((x) => Object.assign(x, { final: r2(x.anterior + x.debito - x.credito), nivel: nivelCuenta(x.cuenta) }))
    .filter((x) => x.anterior || x.debito || x.credito).sort((a, b) => a.cuenta.localeCompare(b.cuenta));
}

/** Estado de costo de los insumos consumidos (juego de inventarios) para el periodo. */
function estadoCosto(db, desde, hasta) {
  const ini = replay(db, { hasta: addDays(desde, -1) });
  const fin = replay(db, { hasta });
  const suma = (tipos, signo) => db.movimientos.filter((m) => !m.anulado && m.fecha >= desde && m.fecha <= hasta && tipos.includes(m.tipo))
    .reduce((s, m) => s + m.lineas.reduce((a, l, i) => a + ((signo === undefined || Math.sign(Number(l.cantidad)) === signo) ? fin.movCost[m.id].lineas[i].valor : 0), 0), 0);
  const inventarioInicial = valorInventario(ini);
  const compras = r2(suma(['entrada']));
  const saldosIniciales = r2(suma(['inicial']));
  const devoluciones = r2(suma(['devolucion']));
  const sobrantes = r2(suma(['ajuste'], 1));
  const faltantes = r2(suma(['ajuste'], -1) + suma(['baja']));
  const inventarioFinal = valorInventario(fin);
  const disponible = r2(inventarioInicial + compras + saldosIniciales - devoluciones + sobrantes - faltantes);
  const consumo = r2(suma(['salida']));
  return { inventarioInicial, compras, saldosIniciales, devoluciones, sobrantes, faltantes, disponible, inventarioFinal, costoConsumido: r2(disponible - inventarioFinal), consumoRegistrado: consumo };
}

/** Archivo para el software contable según el diseño configurado (columnas, separador, formato de fecha, resumen). */
const COLUMNAS_INTERFAZ = {
  fecha: 'Fecha', comprobante: 'Comprobante', documento: 'Documento origen', tipo: 'Tipo', cuenta: 'Cuenta', nombreCuenta: 'Nombre de la cuenta',
  nit: 'NIT tercero', centro: 'Centro de costo', debito: 'Débito', credito: 'Crédito', detalle: 'Detalle'
};
function archivoInterfaz(comprobantes, d) {
  d = Object.assign({ columnas: Object.keys(COLUMNAS_INTERFAZ), separador: ';', formatoFecha: 'aaaa-mm-dd', decimal: ',', encabezado: true, resumirPorDia: false }, d || {});
  const fmtF = (iso) => (d.formatoFecha === 'dd/mm/aaaa' ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : d.formatoFecha === 'aaaammdd' ? iso.replace(/-/g, '') : iso);
  const fmtN = (n) => { const s = Number(n || 0).toFixed(2); return d.decimal === ',' ? s.replace('.', ',') : s; };
  let lineas = comprobantes.flatMap((cp) => cp.lineas.map((l) => ({ fecha: cp.fecha, comprobante: cp.num, documento: cp.documento, tipo: cp.tipo, cuenta: l.cuenta, nombreCuenta: l.nombre, nit: l.tercero, centro: l.centro, debito: l.debito, credito: l.credito, detalle: l.detalle })));
  if (d.resumirPorDia) {
    const g = {};
    lineas.forEach((l) => {
      const k = [l.fecha, l.cuenta, l.nit, l.centro, l.debito > 0 ? 'D' : 'C'].join('|');
      const x = g[k] || (g[k] = Object.assign({}, l, { comprobante: 'RES-' + l.fecha.replace(/-/g, ''), documento: 'Resumen diario', tipo: 'Resumen', detalle: 'Resumen de inventario del día', debito: 0, credito: 0 }));
      x.debito = r2(x.debito + l.debito); x.credito = r2(x.credito + l.credito);
    });
    lineas = Object.values(g);
  }
  const esc = (v) => { const s = String(v === null || v === undefined ? '' : v); return s.includes(d.separador) || /["\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const filas = lineas.map((l) => d.columnas.map((c) => (c === 'fecha' ? fmtF(l.fecha) : c === 'debito' || c === 'credito' ? fmtN(l[c]) : l[c])).map(esc).join(d.separador));
  if (d.encabezado) filas.unshift(d.columnas.map((c) => COLUMNAS_INTERFAZ[c]).map(esc).join(d.separador));
  return '﻿' + filas.join('\r\n');
}

// ---------- Carga masiva: plan de cuentas y terceros ----------
function interpretarPlanCuentas(filas) {
  if (!filas || filas.length < 2) return { errores: ['El archivo no tiene datos.'], cuentas: [] };
  const enc = filas[0].map(norm);
  const col = (alias) => enc.findIndex((h) => alias.map(norm).includes(h));
  const ic = col(['codigo', 'código', 'cuenta', 'codigo cuenta', 'código cuenta']);
  const inom = col(['nombre', 'descripcion', 'descripción', 'nombre cuenta', 'nombre de la cuenta']);
  const inat = col(['naturaleza', 'nat']);
  const iter = col(['tercero', 'terceros', 'maneja tercero', 'nit']);
  const errores = [];
  if (ic < 0) errores.push('Falta la columna "Código".');
  if (inom < 0) errores.push('Falta la columna "Nombre".');
  if (errores.length) return { errores, cuentas: [] };
  const vistos = new Set();
  const cuentas = [];
  filas.slice(1).forEach((f, i) => {
    const codigo = String(f[ic] === undefined || f[ic] === null ? '' : f[ic]).replace(/\D/g, '');
    const nombre = String(f[inom] || '').trim();
    if (!codigo && !nombre) return;
    if (!codigo) { errores.push('Fila ' + (i + 2) + ': falta el código.'); return; }
    if (!nombre) { errores.push('Fila ' + (i + 2) + ': falta el nombre de la cuenta ' + codigo + '.'); return; }
    if (vistos.has(codigo)) { errores.push('Fila ' + (i + 2) + ': la cuenta ' + codigo + ' está repetida.'); return; }
    vistos.add(codigo);
    const natTxt = norm(inat >= 0 ? f[inat] : '');
    const naturaleza = natTxt.startsWith('c') ? 'C' : natTxt.startsWith('d') ? 'D' : (['2', '3', '4'].includes(codigo[0]) ? 'C' : 'D');
    const ter = norm(iter >= 0 ? f[iter] : '');
    cuentas.push({ codigo, nombre, naturaleza, terceros: ['si', 'sí', 's', 'x', '1', 'true'].includes(ter), movimiento: true, activa: true });
  });
  cuentas.forEach((c) => { c.movimiento = !cuentas.some((x) => x.codigo !== c.codigo && x.codigo.startsWith(c.codigo)); });
  return { errores, cuentas: cuentas.sort((a, b) => a.codigo.localeCompare(b.codigo)) };
}

function interpretarTerceros(filas, db) {
  if (!filas || filas.length < 2) return { errores: ['El archivo no tiene datos.'], terceros: [] };
  const enc = filas[0].map(norm);
  const col = (alias) => enc.findIndex((h) => alias.map(norm).includes(h));
  const idx = {
    tipoDoc: col(['tipo documento', 'tipo de documento', 'tipo doc', 'tipodoc']), nit: col(['nit', 'documento', 'numero', 'número', 'identificacion', 'identificación', 'nit o documento']),
    dv: col(['dv', 'digito', 'dígito', 'digito de verificacion', 'dígito de verificación']), nombre: col(['nombre', 'razon social', 'razón social', 'nombre o razon social', 'nombre o razón social']),
    tipos: col(['tipo', 'tipo tercero', 'tipo de tercero', 'clase']), direccion: col(['direccion', 'dirección']), ciudad: col(['ciudad', 'municipio']),
    telefono: col(['telefono', 'teléfono']), celular: col(['celular', 'movil', 'móvil']), correo: col(['correo', 'email', 'e-mail', 'correo electronico', 'correo electrónico']), contacto: col(['contacto']),
    primerNombre: col(['primer nombre']), segundoNombre: col(['segundo nombre']), primerApellido: col(['primer apellido']), segundoApellido: col(['segundo apellido']),
    sexo: col(['sexo', 'genero', 'género']), pais: col(['pais', 'país']), departamento: col(['departamento', 'estado', 'provincia', 'estado o provincia']), regimen: col(['regimen', 'régimen']),
    codigoDane: col(['codigo dane', 'código dane', 'dane', 'divipola', 'codigo municipio', 'código municipio', 'cod municipio', 'codigo ciudad', 'código ciudad']),
    actividad: col(['actividad', 'actividad economica', 'actividad económica', 'ciiu']), plazo: col(['plazo', 'plazo de pago', 'plazos de pago', 'dias de pago', 'días de pago']),
    medioPago: col(['medio de pago', 'forma de pago']), banco: col(['banco']), tipoCuenta: col(['tipo de cuenta', 'tipo cuenta']), numeroCuenta: col(['numero de cuenta', 'número de cuenta', 'no cuenta', 'no. cuenta', 'cuenta bancaria']),
    retefuente: col(['retencion', 'retención', 'porcentaje de retencion', 'porcentaje de retención', 'retefuente']), reteica: col(['reteica', 'porcentaje reteica'])
  };
  const errores = [];
  if (idx.nit < 0) errores.push('Falta la columna "NIT" o "Documento".');
  if (idx.nombre < 0 && (idx.primerNombre < 0 || idx.primerApellido < 0)) errores.push('Falta la columna "Nombre" o "Razón social" (o "Primer nombre" y "Primer apellido").');
  if (errores.length) return { errores, terceros: [] };
  const v = (f, k) => (idx[k] < 0 ? '' : String(f[idx[k]] === undefined || f[idx[k]] === null ? '' : f[idx[k]]).trim());
  const terceros = [];
  const avisos = [];
  const vistos = new Set();
  filas.slice(1).forEach((f, i) => {
    const fila = i + 2;
    const crudo = v(f, 'nit');
    const partes = { primerNombre: v(f, 'primerNombre'), segundoNombre: v(f, 'segundoNombre'), primerApellido: v(f, 'primerApellido'), segundoApellido: v(f, 'segundoApellido') };
    const nombre = v(f, 'nombre') || nombreTercero(Object.assign({ persona: 'natural' }, partes));
    if (!crudo && !nombre) return;
    const tdTxt = norm(v(f, 'tipoDoc')).toUpperCase().replace(/\./g, '');
    const tipoDoc = TIPOS_DOC[tdTxt] ? tdTxt : tdTxt.startsWith('CED') || tdTxt === 'CEDULA' ? 'CC' : 'NIT';
    const m = crudo.match(/^([\d.\s]+)-(\d)$/);
    const nit = (m ? m[1] : crudo).replace(/\D/g, '');
    if (!nit) { errores.push('Fila ' + fila + ': falta el número de documento.'); return; }
    if (!nombre) { errores.push('Fila ' + fila + ': falta el nombre.'); return; }
    if (vistos.has(tipoDoc + nit)) { errores.push('Fila ' + fila + ': el documento ' + nit + ' está repetido en el archivo.'); return; }
    vistos.add(tipoDoc + nit);
    const dvArch = v(f, 'dv') || (m ? m[2] : '');
    const dv = tipoDoc === 'NIT' ? calcularDV(nit) : '';
    if (tipoDoc === 'NIT' && dvArch && dvArch !== dv) errores.push('Fila ' + fila + ': el dígito de verificación de ' + nit + ' debería ser ' + dv + ' (el archivo trae ' + dvArch + ').');
    const tt = norm(v(f, 'tipos'));
    const tipos = Object.keys(TIPOS_TERCERO).filter((k) => tt.includes(k) || tt.includes(norm(TIPOS_TERCERO[k])));
    const existente = db.proveedores.find((x) => (x.tipoDoc || 'NIT') === tipoDoc && String(x.nit) === nit);
    const persona = tipoDoc === 'NIT' && !partes.primerNombre ? 'juridica' : 'natural';
    const rg = norm(v(f, 'regimen'));
    const regimen = !rg ? (existente ? '' : tipoDoc === 'NIT' ? 'responsable' : 'noResponsable') : rg.includes('simple') ? 'simple' : rg.includes('especial') ? 'especial' : rg.includes('no contrib') ? 'noContribuyente' : rg.includes('no ') || rg.includes('simplificado') ? 'noResponsable' : 'responsable';
    const sx = v(f, 'sexo').toUpperCase().charAt(0);
    const plazo = v(f, 'plazo') === '' ? '' : Number(String(v(f, 'plazo')).replace(/\D/g, '')) || 0;
    const mp = norm(v(f, 'medioPago'));
    const tc = norm(v(f, 'tipoCuenta'));
    const pct = (k) => { const x = v(f, k).replace('%', '').replace(',', '.'); return x === '' ? '' : Number(x); };
    const banco = v(f, 'banco');
    // Ubicación: en Colombia se asigna el código DANE del departamento y del municipio (DIVIPOLA).
    const paisTxt = v(f, 'pais');
    const paisCodigo = paisTxt ? paisIso(paisTxt) : (existente && (existente.paisCodigo || paisIso(existente.pais))) || 'CO';
    if (paisTxt && !paisCodigo) avisos.push('Fila ' + fila + ': el país "' + paisTxt + '" no se reconoce.');
    let lugar = { departamento: v(f, 'departamento'), ciudad: v(f, 'ciudad') };
    if (paisCodigo === 'CO' && (lugar.departamento || lugar.ciudad || v(f, 'codigoDane'))) {
      const u = ubicarColombia(lugar.departamento, lugar.ciudad, v(f, 'codigoDane'));
      if (u.aviso) avisos.push('Fila ' + fila + ' (' + nit + '): ' + u.aviso + '. Se carga sin código DANE.');
      lugar = Object.assign({ departamentoCodigo: '', ciudadCodigo: '' }, lugar, u); delete lugar.aviso;
    }
    const dep = lugar.departamento;
    const t = {
      fila, existente: !!existente, id: existente ? existente.id : null, tipoDoc, nit, dv, nombre, persona, tipos: tipos.length ? tipos : existente ? existente.tipos || ['proveedor'] : ['proveedor'],
      direccion: v(f, 'direccion'), ciudad: lugar.ciudad, departamento: DEPARTAMENTOS.find((d) => norm(d) === norm(dep)) || dep,
      departamentoCodigo: lugar.departamentoCodigo || '', ciudadCodigo: lugar.ciudadCodigo || '',
      pais: paisCodigo ? (PAISES.find((x) => x[0] === paisCodigo) || [])[1] : paisTxt || (existente ? '' : 'Colombia'), paisCodigo: paisCodigo || '', extranjero: paisCodigo && paisCodigo !== 'CO' ? true : '',
      telefono: v(f, 'telefono'), celular: v(f, 'celular'), correo: v(f, 'correo'), contacto: v(f, 'contacto'),
      sexo: persona === 'natural' && SEXOS[sx] ? sx : '', regimen, responsableIva: regimen ? !['noResponsable', 'noContribuyente'].includes(regimen) : '', obligadoFacturar: existente ? '' : tipoDoc === 'NIT',
      actividad: v(f, 'actividad'), plazoPago: plazo, medioPago: Object.keys(MEDIOS_PAGO).find((k) => mp && (mp.includes(k) || mp.includes(norm(MEDIOS_PAGO[k])))) || '',
      conBanco: banco ? true : '', banco, tipoCuenta: tc.includes('corr') ? 'corriente' : tc.includes('ahor') ? 'ahorros' : tc ? 'deposito' : '', numeroCuenta: v(f, 'numeroCuenta'),
      retefuentePct: pct('retefuente'), reteicaPct: pct('reteica'), activo: true
    };
    if (persona === 'natural') Object.assign(t, partes.primerNombre ? partes : partirNombre(nombre)); else t.razonSocial = nombre;
    if (t.retefuentePct !== '' && !(t.retefuentePct >= 0 && t.retefuentePct <= 100)) errores.push('Fila ' + fila + ': el porcentaje de retención no es válido.');
    terceros.push(t);
  });
  return { errores, avisos, terceros };
}

// ---------- Terceros ----------
const TIPOS_DOC = {
  CC: 'Cédula de ciudadanía', NIT: 'NIT', CE: 'Cédula de extranjería', TI: 'Tarjeta de identidad', RC: 'Registro civil', PA: 'Pasaporte',
  PPT: 'Permiso por protección temporal', PEP: 'Permiso especial de permanencia', TE: 'Tarjeta de extranjería', NITE: 'NIT de otro país', DIE: 'Documento de identificación extranjero'
};
const TIPOS_TERCERO = { proveedor: 'Proveedor', cliente: 'Cliente', paciente: 'Paciente', empleado: 'Empleado', asesor: 'Asesor o contratista', laboratorio: 'Laboratorio', otro: 'Otro' };
const SEXOS = { F: 'Femenino', M: 'Masculino', I: 'Indeterminado' };
/** Régimen tributario del tercero. Define si cobra IVA en sus facturas. */
const REGIMENES = { responsable: 'Responsable de IVA', noResponsable: 'No responsable de IVA', simple: 'Régimen Simple de Tributación', especial: 'Régimen tributario especial (ESAL)', noContribuyente: 'No contribuyente' };
/** Responsabilidades fiscales del RUT (códigos DIAN de la factura electrónica). */
const RESPONSABILIDADES = { 'O-13': 'Gran contribuyente', 'O-15': 'Autorretenedor', 'O-23': 'Agente de retención de IVA', 'O-47': 'Régimen simple de tributación', 'R-99-PN': 'No aplica (otros)' };
const MEDIOS_PAGO = { transferencia: 'Transferencia bancaria', efectivo: 'Efectivo', consignacion: 'Consignación', cheque: 'Cheque', tarjeta: 'Tarjeta débito o crédito', otro: 'Otro' };
const PLAZOS_PAGO = { 0: 'Contado', 8: '8 días', 15: '15 días', 30: '30 días', 45: '45 días', 60: '60 días', 90: '90 días' };
const TIPOS_CUENTA_BANCO = { ahorros: 'Ahorros', corriente: 'Corriente', deposito: 'Depósito electrónico' };
// Datos laborales con los códigos de la nómina electrónica (DIAN, Res. 000013 de 2021).
const TIPOS_TRABAJADOR = { '01': 'Dependiente', '02': 'Servicio doméstico', '04': 'Madre comunitaria', '12': 'Aprendiz SENA en etapa lectiva', '19': 'Aprendiz SENA en etapa productiva', '20': 'Estudiante (Ley 789 de 2002)', '21': 'Estudiante de posgrado en salud', '23': 'Estudiante (solo riesgos laborales)', '51': 'Trabajador de tiempo parcial' };
const SUBTIPOS_TRABAJADOR = { '00': 'No aplica', '01': 'Dependiente pensionado por vejez activo' };
const TIPOS_CONTRATO = { '1': 'Término fijo', '2': 'Término indefinido', '3': 'Obra o labor', '4': 'Aprendizaje', '5': 'Prácticas o pasantías' };
const PERIODICIDADES = { '5': 'Mensual', '4': 'Quincenal', '2': 'Decenal', '3': 'Catorcenal', '1': 'Semanal', '6': 'Otra' };
/** Departamentos de Colombia con su código DANE (DIVIPOLA). */
const DEPARTAMENTOS_CO = {
  '05': 'Antioquia', '08': 'Atlántico', '11': 'Bogotá D.C.', '13': 'Bolívar', '15': 'Boyacá', '17': 'Caldas', '18': 'Caquetá', '19': 'Cauca', '20': 'Cesar',
  '23': 'Córdoba', '25': 'Cundinamarca', '27': 'Chocó', '41': 'Huila', '44': 'La Guajira', '47': 'Magdalena', '50': 'Meta', '52': 'Nariño', '54': 'Norte de Santander',
  '63': 'Quindío', '66': 'Risaralda', '68': 'Santander', '70': 'Sucre', '73': 'Tolima', '76': 'Valle del Cauca', '81': 'Arauca', '85': 'Casanare', '86': 'Putumayo',
  '88': 'San Andrés y Providencia', '91': 'Amazonas', '94': 'Guainía', '95': 'Guaviare', '97': 'Vaupés', '99': 'Vichada'
};
const DEPARTAMENTOS = Object.values(DEPARTAMENTOS_CO).sort((a, b) => a.localeCompare(b, 'es'));
const normLugar = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/d\.\s*c\.?/g, 'dc').replace(/[.,;()]/g, ' ').replace(/\s+/g, ' ').trim();
const ALIAS_DEPTO = { bogota: '11', 'bogota dc': '11', 'distrito capital': '11', 'santa fe de bogota': '11', valle: '76', guajira: '44', 'norte santander': '54', 'san andres': '88', 'archipielago de san andres providencia y santa catalina': '88', 'san andres providencia y santa catalina': '88' };
/** Código DANE del departamento a partir de su nombre o su código. */
function departamentoDane(txt) {
  const t = normLugar(txt);
  if (!t) return '';
  if (/^\d{1,2}$/.test(t)) { const c = t.padStart(2, '0'); return DEPARTAMENTOS_CO[c] ? c : ''; }
  return Object.keys(DEPARTAMENTOS_CO).find((c) => normLugar(DEPARTAMENTOS_CO[c]) === t) || ALIAS_DEPTO[t] || '';
}
/**
 * Ubica un municipio de Colombia (DIVIPOLA) por su código DANE o por su nombre, aunque venga sin tildes
 * o abreviado ("Cúcuta" → San José de Cúcuta). Devuelve los nombres oficiales y los códigos, o un aviso.
 */
function ubicarColombia(departamento, ciudad, codigo) {
  const cod = String(codigo || '').replace(/\D/g, '');
  if (cod) {
    const m = MUNICIPIOS.find((x) => x[0] === cod.padStart(5, '0'));
    if (!m) return { aviso: 'el código DANE ' + codigo + ' no existe' };
    return { departamentoCodigo: m[0].slice(0, 2), departamento: DEPARTAMENTOS_CO[m[0].slice(0, 2)], ciudadCodigo: m[0], ciudad: m[1] };
  }
  const dep = departamentoDane(departamento);
  if (departamento && !dep) return { aviso: 'el departamento "' + departamento + '" no existe en Colombia' };
  const base = dep ? { departamentoCodigo: dep, departamento: DEPARTAMENTOS_CO[dep] } : {};
  const q = normLugar(ciudad);
  if (!q) return base;
  const cand = MUNICIPIOS.filter((x) => !dep || x[0].slice(0, 2) === dep);
  let hall = cand.filter((x) => normLugar(x[1]) === q);
  if (!hall.length) {
    hall = cand.filter((x) => { const n = normLugar(x[1]); return n.startsWith(q + ' ') || n.endsWith(' ' + q); });
    // Nombre abreviado con varias opciones: si una es capital de departamento (código terminado en 001), es esa ("Cartagena").
    const capitales = hall.filter((x) => x[0].endsWith('001'));
    if (hall.length > 1 && capitales.length === 1) hall = capitales;
  }
  if (!hall.length && !dep && ALIAS_DEPTO[q]) hall = MUNICIPIOS.filter((x) => x[0] === ALIAS_DEPTO[q] + '001');
  if (hall.length === 1) return { departamentoCodigo: hall[0][0].slice(0, 2), departamento: DEPARTAMENTOS_CO[hall[0][0].slice(0, 2)], ciudadCodigo: hall[0][0], ciudad: hall[0][1] };
  if (hall.length > 1) return Object.assign(base, { aviso: '"' + ciudad + '" existe en varios departamentos (' + [...new Set(hall.map((x) => DEPARTAMENTOS_CO[x[0].slice(0, 2)]))].join(', ') + '); indique el departamento' });
  return Object.assign(base, { aviso: 'no se encontró el municipio "' + ciudad + '"' + (dep ? ' en ' + DEPARTAMENTOS_CO[dep] : '') });
}
/** Código ISO del país a partir de su nombre (en español) o su código. */
function paisIso(txt) {
  const t = normLugar(txt);
  if (!t) return '';
  const up = String(txt).trim().toUpperCase();
  return (PAISES.find(([c, n]) => c === up || normLugar(n) === t) || [])[0] || '';
}

/** ¿La ubicación del tercero es en Colombia? */
function enColombia(t) { return t.paisCodigo ? t.paisCodigo === 'CO' : !t.pais || /^colombia$/i.test(String(t.pais).trim()); }

/** Nombre del tercero: nombres y apellidos (persona natural) o razón social. */
function nombreTercero(t) {
  if (t.persona === 'natural') {
    const n = [t.primerNombre, t.segundoNombre, t.primerApellido, t.segundoApellido].map((x) => String(x || '').trim()).filter(Boolean).join(' ');
    if (n) return n;
  }
  return String(t.razonSocial || t.nombre || '').trim();
}

/** Separa "Nombres Apellidos" en sus partes (1 nombre y 1 apellido, 1 y 2, o 2 y 2). */
function partirNombre(nombre) {
  const w = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  if (w.length <= 1) return { primerNombre: w[0] || '', segundoNombre: '', primerApellido: '', segundoApellido: '' };
  if (w.length === 2) return { primerNombre: w[0], segundoNombre: '', primerApellido: w[1], segundoApellido: '' };
  if (w.length === 3) return { primerNombre: w[0], segundoNombre: '', primerApellido: w[1], segundoApellido: w[2] };
  return { primerNombre: w[0], segundoNombre: w.slice(1, w.length - 2).join(' '), primerApellido: w[w.length - 2], segundoApellido: w[w.length - 1] };
}

/** Valida la ficha de un tercero. Devuelve la lista de errores (vacía si está bien). */
function validarTercero(db, t) {
  const e = [];
  const esNit = t.tipoDoc === 'NIT';
  const numerico = ['NIT', 'CC', 'TI', 'RC'].includes(t.tipoDoc);
  const nit = String(t.nit || '').replace(numerico ? /\D/g : /\s/g, '');
  if (!TIPOS_DOC[t.tipoDoc]) e.push('Elija el tipo de documento.');
  if (!nit) e.push('Escriba el número de documento.');
  else if ((esNit || t.tipoDoc === 'CC') && !/^\d{5,15}$/.test(nit)) e.push('El número debe tener entre 5 y 15 dígitos, sin puntos ni dígito de verificación.');
  if (esNit && t.dv !== '' && t.dv !== undefined && String(t.dv) !== calcularDV(nit)) e.push('El dígito de verificación no corresponde al NIT (debería ser ' + calcularDV(nit) + ').');
  if (t.persona === 'natural') {
    if (!String(t.primerNombre || '').trim()) e.push('Escriba el primer nombre.');
    if (!String(t.primerApellido || '').trim()) e.push('Escriba el primer apellido.');
  } else if (!String(t.razonSocial || t.nombre || '').trim()) e.push('Escriba la razón social.');
  if (t.persona === 'juridica' && !esNit && !['NITE', 'DIE'].includes(t.tipoDoc)) e.push('Una persona jurídica se identifica con NIT.');
  if (!t.tipos || !t.tipos.length) e.push('Marque al menos un tipo de tercero.');
  if (db.proveedores.some((x) => x.id !== t.id && (x.tipoDoc || 'NIT') === t.tipoDoc && String(normalizarTercero(x).nit) === nit)) e.push('Ya existe un tercero con ese documento.');
  const correo = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  if (t.correo && !correo.test(t.correo)) e.push('El correo no es válido.');
  if (t.correoFE && !correo.test(t.correoFE)) e.push('El correo de factura electrónica no es válido.');
  if (t.sitioWeb && /\s/.test(t.sitioWeb)) e.push('El sitio web no es válido.');
  if (enColombia(t)) {
    if (!String(t.departamento || '').trim() || !String(t.ciudad || '').trim()) e.push('Indique departamento y ciudad.');
    if (t.departamentoCodigo && !DEPARTAMENTOS_CO[t.departamentoCodigo]) e.push('El código de departamento ' + t.departamentoCodigo + ' no existe.');
    if (t.ciudadCodigo && !/^\d{5}$/.test(t.ciudadCodigo)) e.push('El código DANE del municipio debe tener 5 dígitos.');
    else if (t.ciudadCodigo && t.departamentoCodigo && t.ciudadCodigo.slice(0, 2) !== t.departamentoCodigo) e.push('El municipio no pertenece al departamento elegido.');
  } else if (!String(t.ciudad || '').trim()) e.push('Indique la ciudad.');
  ['retefuentePct', 'reteicaPct'].forEach((k) => { if (t[k] !== '' && t[k] !== undefined && t[k] !== null && !(Number(t[k]) >= 0 && Number(t[k]) <= 100)) e.push('El porcentaje de ' + (k === 'retefuentePct' ? 'retención en la fuente' : 'reteICA') + ' debe estar entre 0 y 100.'); });
  if (t.conBanco) {
    if (!String(t.banco || '').trim()) e.push('Escriba el banco.');
    if (!TIPOS_CUENTA_BANCO[t.tipoCuenta]) e.push('Elija el tipo de cuenta bancaria.');
    if (!/^[\d-]{4,20}$/.test(String(t.numeroCuenta || '').trim())) e.push('El número de cuenta bancaria debe tener de 4 a 20 dígitos.');
  }
  ['cuentaCredito', 'cuentaDebito'].forEach((k) => {
    if (!t[k]) return;
    if (!cuentaPlan(db, t[k])) e.push('La cuenta ' + t[k] + ' no existe en el plan de cuentas.');
    else if (!esDeMovimiento(db, t[k])) e.push('La cuenta ' + t[k] + ' tiene subcuentas; elija una cuenta de movimiento.');
  });
  if ((t.tipos || []).includes('empleado')) {
    const em = t.empleado || {};
    if (!TIPOS_TRABAJADOR[em.tipoTrabajador]) e.push('Empleado: elija el tipo de trabajador.');
    if (!TIPOS_CONTRATO[em.tipoContrato]) e.push('Empleado: elija el tipo de contrato.');
    if (!PERIODICIDADES[em.periodicidad]) e.push('Empleado: elija la periodicidad de pago.');
    if (!(Number(em.salario) > 0)) e.push('Empleado: escriba el salario.');
    if (!isISODate(em.fechaInicio)) e.push('Empleado: indique la fecha de inicio del contrato.');
    if (em.tipoContrato === '1' && em.fechaFin && em.fechaFin <= em.fechaInicio) e.push('Empleado: la fecha de terminación debe ser posterior al inicio.');
  }
  return e;
}

/** Tipo de concepto de retención común a los productos de una factura ('' si son de conceptos distintos o no tienen). */
function conceptoRetencionLineas(db, productoIds) {
  const c = [...new Set(productoIds.map((id) => conceptoRetencionDe(db, db.productos.find((p) => p.id === id))))];
  return c.length === 1 ? c[0] : '';
}
/** Retenciones e IVA sugeridos para una factura de este proveedor (ficha del tercero › tipo de concepto del grupo › configuración general). */
function impuestosSugeridos(db, t, concepto) {
  const ret = Object.assign({ retefuentePct: 0, reteivaPct: 0, reteicaPct: 0 }, ((db.config || {}).contabilidad || {}).retenciones || {});
  const x = t ? normalizarTercero(t) : {};
  const resp = x.responsabilidades || [];
  const num = (v, d) => (v === '' || v === undefined || v === null ? d : Number(v));
  return {
    ivaPct: x.responsableIva === false ? 0 : 19,
    retefuentePct: resp.includes('O-15') ? 0 : num(x.retefuentePct, num(((ret.porConcepto || {})[concepto] || {}).pct, Number(ret.retefuentePct) || 0)),
    reteivaPct: x.responsableIva === false ? 0 : Number(ret.reteivaPct) || 0,
    reteicaPct: num(x.reteicaPct, Number(ret.reteicaPct) || 0)
  };
}

/** Dígito de verificación del NIT según el método de la DIAN (módulo 11). */
function calcularDV(nit) {
  const d = String(nit || '').replace(/\D/g, '');
  if (!d) return '';
  const pesos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  let suma = 0;
  for (let i = 0; i < d.length && i < pesos.length; i++) suma += Number(d[d.length - 1 - i]) * pesos[i];
  const r = suma % 11;
  return String(r > 1 ? 11 - r : r);
}
function documentoTercero(t) {
  if (!t) return '';
  const n = String(t.nit || '');
  return (t.tipoDoc || 'NIT') + ' ' + n.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (t.tipoDoc === 'NIT' || !t.tipoDoc ? '-' + (t.dv !== undefined && t.dv !== '' ? t.dv : calcularDV(n)) : '');
}
/** Convierte el formato anterior ("900.123.456-7") al de terceros. */
function normalizarTercero(t) {
  const x = Object.assign({ tipoDoc: 'NIT', tipos: ['proveedor'], persona: 'juridica', direccion: '', ciudad: '', responsableIva: true, obligadoFacturar: true }, t);
  if (!Array.isArray(x.tipos) || !x.tipos.length) x.tipos = ['proveedor'];
  const raw = String(x.nit || '');
  if (/[.\-\s]/.test(raw)) {
    const m = raw.match(/^([\d.\s]+)-(\d)$/);
    x.nit = (m ? m[1] : raw).replace(/\D/g, '');
    if (m && (x.dv === undefined || x.dv === '')) x.dv = m[2];
  }
  if ((x.tipoDoc === 'NIT') && (x.dv === undefined || x.dv === '')) x.dv = calcularDV(x.nit);
  if (x.regimen) x.responsableIva = !['noResponsable', 'noContribuyente'].includes(x.regimen);
  else x.regimen = x.responsableIva === false ? 'noResponsable' : 'responsable';
  if (!x.pais) x.pais = 'Colombia';
  if (!x.paisCodigo && /^colombia$/i.test(String(x.pais).trim())) x.paisCodigo = 'CO';
  if (x.paisCodigo === 'CO' && !x.departamentoCodigo && x.departamento) { const k = Object.keys(DEPARTAMENTOS_CO).find((c) => norm(DEPARTAMENTOS_CO[c]) === norm(x.departamento)); if (k) x.departamentoCodigo = k; }
  const nom = nombreTercero(x);
  if (nom) x.nombre = nom;
  if (x.persona !== 'natural' && !x.razonSocial) x.razonSocial = x.nombre || '';
  return x;
}

// ---------- Bodegas ----------
const TIPOS_BODEGA = { bodega: 'Bodega / almacén', consultorio: 'Consultorio', nevera: 'Nevera / cadena de frío', cuarentena: 'Cuarentena', sede: 'Sede externa' };

/** Deja config.ubicaciones (nombres usados por los movimientos) igual a las bodegas activas; la primera es la principal. */
function sincronizarBodegas(db) {
  const act = db.bodegas.filter((b) => b.activa !== false);
  const ppal = act.find((b) => b.principal) || act[0];
  db.bodegas.forEach((b) => { b.principal = !!ppal && b.id === ppal.id; });
  db.config.ubicaciones = ppal ? [ppal.nombre, ...act.filter((b) => b !== ppal).map((b) => b.nombre)] : [];
  return db;
}

/** Cambia el nombre de una bodega en todos los registros que la usan. */
function renombrarBodega(db, viejo, nuevo) {
  if (!viejo || viejo === nuevo) return db;
  const r = (v) => (v === viejo ? nuevo : v);
  db.movimientos.forEach((m) => { m.bodega = r(m.bodega); m.bodegaDestino = r(m.bodegaDestino); m.lineas.forEach((l) => { if (l.bodega) l.bodega = r(l.bodega); }); });
  db.ordenes.forEach((o) => { o.bodega = r(o.bodega); });
  db.requisiciones.forEach((q) => { q.bodegaSolicita = r(q.bodegaSolicita); q.bodegaAtiende = r(q.bodegaAtiende); });
  db.usuarios.forEach((u) => { u.bodega = r(u.bodega); });
  db.productos.forEach((p) => { p.ubicacion = r(p.ubicacion); });
  db.temperaturas.forEach((t) => { t.ubicacion = r(t.ubicacion); });
  db.conteos.forEach((c) => { c.bodega = r(c.bodega); c.lineas.forEach((l) => { l.bodega = r(l.bodega); }); });
  return db;
}

function bodegaEnUso(db, nombre) {
  return db.movimientos.some((m) => m.bodega === nombre || m.bodegaDestino === nombre || m.lineas.some((l) => l.bodega === nombre)) ||
    db.usuarios.some((u) => u.bodega === nombre) ||
    db.ordenes.some((o) => o.bodega === nombre) ||
    db.requisiciones.some((q) => q.bodegaSolicita === nombre || q.bodegaAtiende === nombre);
}

// ---------- Clasificación (Línea › Grupo › Subgrupo) ----------
const NIVELES_GRUPO = { 1: 'Línea', 2: 'Grupo', 3: 'Subgrupo' };
const TIPOS_MATERIAL = {
  consumible: 'Insumo consumible', dispositivo: 'Dispositivo médico', medicamento: 'Medicamento',
  instrumental: 'Instrumental reutilizable', producto: 'Producto para la venta', equipo: 'Equipo biomédico', repuesto: 'Repuesto o accesorio de equipo', activo: 'Activo menor / dotación'
};
// ---------- Ficha del producto ----------
const UNIDADES = ['unidad', 'caja', 'paquete', 'frasco', 'tubo', 'jeringa', 'cartucho', 'ampolla', 'sobre', 'bolsa', 'rollo', 'par', 'kit', 'blíster', 'galón', 'litro', 'mililitro', 'gramo', 'kilogramo', 'metro'];
/** Tratamiento de IVA del producto (ET arts. 424, 468-1 y 477). */
const TARIFAS_IVA = { '19': 'Gravado 19 %', '5': 'Gravado 5 %', '19nd': 'IVA 19 % mayor valor del gasto (no descontable)', exento: 'Exento (0 %)', excluido: 'Excluido de IVA' };
function pctIva(tarifa) { return tarifa === '19' || tarifa === '19nd' ? 19 : tarifa === '5' ? 5 : tarifa === 'exento' || tarifa === 'excluido' ? 0 : null; }
/** Tarifa de IVA de compra de un producto: la de su ficha o la de su grupo. */
function tarifaCompra(db, p) { return (p && p.tarifaIva) || (p && datoGrupo(db, p.grupoId, 'tarifaIvaCompra')) || ''; }
function tarifaVenta(db, p) { return (p && p.tarifaIvaVenta) || (p && datoGrupo(db, p.grupoId, 'tarifaIvaVenta')) || ''; }
/** Tipo de concepto de retención de un producto (por su grupo). */
function conceptoRetencionDe(db, p) { return (p && datoGrupo(db, p.grupoId, 'conceptoRetencion')) || ''; }
const FORMAS_FARMACEUTICAS = { cartucho: 'Cartucho anestésico', solucionIny: 'Solución inyectable', tableta: 'Tableta', capsula: 'Cápsula', solucionOral: 'Solución oral', suspension: 'Suspensión', enjuague: 'Enjuague bucal', gel: 'Gel', crema: 'Crema o ungüento', aerosol: 'Aerosol o spray', polvo: 'Polvo', otra: 'Otra' };
const VIAS_ADMIN = { infiltrativa: 'Infiltrativa (anestesia local)', oral: 'Oral', topica: 'Tópica', intravenosa: 'Intravenosa', intramuscular: 'Intramuscular', subcutanea: 'Subcutánea', otra: 'Otra' };
const ESTERILIZACION = { vapor: 'Vapor (autoclave)', calorSeco: 'Calor seco', oxidoEtileno: 'Óxido de etileno', radiacion: 'Radiación', peroxido: 'Peróxido de hidrógeno (plasma)', noAplica: 'No aplica' };
/** Cómo se repone el producto (vista de planificación de SAP). */
const POLITICAS_REPOSICION = { consumo: 'Punto de reorden según el consumo', minmax: 'Mínimo y máximo fijos', manual: 'Manual (sin sugerencia de compra)' };

/** Dígito de control GS1 (GTIN-8, 12, 13 o 14). */
function gtinValido(g) {
  const d = String(g || '').replace(/\s/g, '');
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(d)) return false;
  let s = 0;
  for (let i = d.length - 2, k = 0; i >= 0; i--, k++) s += Number(d[i]) * (k % 2 === 0 ? 3 : 1);
  return (10 - (s % 10)) % 10 === Number(d[d.length - 1]);
}

/** Valida la ficha de un producto. Devuelve la lista de errores. */
function validarProducto(db, p) {
  const e = [];
  const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
  const cod = String(p.codigo || '').trim();
  if (!cod) e.push('El código es obligatorio.');
  else if (db.productos.some((x) => x.id !== p.id && String(x.codigo).trim().toUpperCase() === cod.toUpperCase())) e.push('Ya existe un producto con ese código.');
  if (p.codigoAlterno && db.productos.some((x) => x.id !== p.id && String(x.codigo).trim().toUpperCase() === String(p.codigoAlterno).trim().toUpperCase())) e.push('El código alterno es el código de otro producto.');
  if (!String(p.nombre || '').trim()) e.push('El nombre es obligatorio.');
  if (!String(p.unidad || '').trim()) e.push('La unidad de medida es obligatoria.');
  if (p.gtin) {
    if (!gtinValido(p.gtin)) e.push('El código de barras no es un GTIN válido (8, 12, 13 o 14 dígitos con dígito de control GS1).');
    else if (db.productos.some((x) => x.id !== p.id && x.gtin && x.gtin.replace(/^0+/, '') === p.gtin.replace(/^0+/, ''))) e.push('Otro producto ya tiene ese código de barras.');
  }
  if (num(p.stockMin) < 0) e.push('El stock mínimo no puede ser negativo.');
  if (num(p.stockMax) !== null && num(p.stockMax) < (num(p.stockMin) || 0)) e.push('El stock máximo debe ser mayor o igual al mínimo.');
  if (num(p.stockSeguridad) !== null && num(p.stockSeguridad) < 0) e.push('El stock de seguridad no puede ser negativo.');
  if (p.politica === 'minmax' && !(num(p.stockMax) > 0)) e.push('Con la política de mínimo y máximo indique el stock máximo.');
  if (num(p.puntoReorden) !== null && (num(p.puntoReorden) < 0 || (num(p.stockMax) && num(p.puntoReorden) > num(p.stockMax)))) e.push('El punto de reorden debe estar entre 0 y el stock máximo.');
  if (num(p.cantidadMinPedido) !== null && num(p.cantidadMinPedido) < 0) e.push('La cantidad mínima de pedido no puede ser negativa.');
  if (!(Number(p.factorCompra || 1) >= 1)) e.push('El factor de la unidad de compra debe ser 1 o mayor.');
  if (Number(p.leadTime) < 0) e.push('Los días de entrega no pueden ser negativos.');
  if (p.invimaVence && !isISODate(p.invimaVence)) e.push('La fecha de vencimiento del registro no es válida.');
  if (p.requiereInvima && p.invima && !/\d{4}/.test(p.invima)) e.push('El registro INVIMA no parece válido (ej.: INVIMA 2024DM-0001234).');
  if (num(p.vnrUnit) !== null && num(p.vnrUnit) < 0) e.push('El valor neto realizable no puede ser negativo.');
  if (num(p.precioVenta) !== null && num(p.precioVenta) < 0) e.push('El precio de venta no puede ser negativo.');
  if (p.tarifaIva && !TARIFAS_IVA[p.tarifaIva]) e.push('Elija el tratamiento de IVA.');
  if (num(p.tempMin) !== null && num(p.tempMax) !== null && num(p.tempMin) >= num(p.tempMax)) e.push('La temperatura mínima debe ser menor que la máxima.');
  if (num(p.diasAlertaVence) !== null && num(p.diasAlertaVence) < 0) e.push('Los días de alerta de vencimiento no pueden ser negativos.');
  if (num(p.vidaMinRecepcion) !== null && num(p.vidaMinRecepcion) < 0) e.push('La vida útil mínima al recibir no puede ser negativa.');
  if (num(p.vidaUtilMeses) && num(p.vidaMinRecepcion) && num(p.vidaMinRecepcion) >= num(p.vidaUtilMeses) * 30) e.push('La vida útil mínima al recibir debe ser menor que la vida útil total.');
  if (p.categoria === 'medicamento') {
    if (!String(p.principioActivo || '').trim()) e.push('Medicamento: escriba el principio activo (Res. 1403/2007).');
    if (!String(p.concentracion || '').trim()) e.push('Medicamento: escriba la concentración.');
    if (!FORMAS_FARMACEUTICAS[p.formaFarmaceutica]) e.push('Medicamento: elija la forma farmacéutica.');
  }
  if (p.grupoId) {
    const cg = clasificacionGrupo(db, p.grupoId);
    if (cg && CLASIF_SERVICIO.includes(cg)) e.push('El grupo elegido es de ' + CLASIFICACIONES[cg].toLowerCase() + 's; elija un grupo de productos.');
    else if (cg && p.clasificacion && cg !== p.clasificacion) e.push('El grupo elegido es de clasificación "' + CLASIFICACIONES[cg] + '" y el producto es "' + CLASIFICACIONES[p.clasificacion] + '".');
  }
  if (p.tarifaIvaVenta && !TARIFAS_IVA[p.tarifaIvaVenta]) e.push('Elija el IVA en ventas.');
  if (p.implantable && p.controlaLote === false) e.push('Un dispositivo implantable debe manejar lote (trazabilidad, Res. 4816/2008).');
  if (p.controlaVence !== false && p.controlaLote === false) e.push('Si maneja fecha de vencimiento debe manejar lote.');
  const provs = (p.proveedores || []).filter((x) => x.proveedorId);
  provs.forEach((x, i) => {
    if (!db.proveedores.some((t) => t.id === x.proveedorId)) e.push('Proveedor ' + (i + 1) + ': no existe.');
    if (provs.some((y, j) => j !== i && y.proveedorId === x.proveedorId)) e.push('Proveedor ' + (i + 1) + ': está repetido.');
    if (num(x.precio) !== null && num(x.precio) < 0) e.push('Proveedor ' + (i + 1) + ': el precio no puede ser negativo.');
  });
  Object.entries(p.cuentas || {}).forEach(([k, c]) => {
    if (!c) return;
    if (!cuentaPlan(db, c)) e.push('La cuenta ' + c + ' (' + (CONCEPTOS_CONTABLES[k] || k) + ') no existe en el plan de cuentas.');
    else if (!esDeMovimiento(db, c)) e.push('La cuenta ' + c + ' tiene subcuentas; elija una cuenta de movimiento.');
  });
  return e;
}

/** Precio pactado con el proveedor (ficha del producto) o, si no hay, el último costo de compra. */
function precioPactado(db, state, productoId, proveedorId) {
  const p = db.productos.find((x) => x.id === productoId);
  const x = p && (p.proveedores || []).find((y) => y.proveedorId === proveedorId && y.precio !== '' && y.precio !== undefined && y.precio !== null);
  if (x) return Number(x.precio);
  return state && state.prods[productoId] ? state.prods[productoId].ultimoCosto || 0 : 0;
}

/** Valida una orden de compra antes de crearla. */
function validarOrdenCompra(db, h, lineas) {
  const e = [];
  if (!h.proveedorId) e.push('Seleccione el proveedor.');
  if (!lineas.length) e.push('Agregue al menos un producto con cantidad.');
  if (h.fechaEntrega && h.fechaEntrega < h.fecha) e.push('La fecha de entrega no puede ser anterior a la orden.');
  lineas.forEach((l) => {
    const p = db.productos.find((x) => x.id === l.productoId);
    if (!p) return;
    if (p.bloqueoCompras) e.push(p.codigo + ' está bloqueado para compras (ficha del producto).');
    if (Number(p.cantidadMinPedido) > 0 && Number(l.cantidad) < Number(p.cantidadMinPedido)) e.push(p.codigo + ': la cantidad mínima de pedido es ' + p.cantidadMinPedido + ' ' + p.unidad + '.');
  });
  return e;
}

function nivelGrupo(db, g) {
  let n = 1, x = g, guard = 0;
  while (x && x.parentId && guard++ < 10) { x = db.grupos.find((y) => y.id === x.parentId); if (x) n++; }
  return n;
}
function rutaGrupo(db, id) {
  const partes = [];
  let x = db.grupos.find((g) => g.id === id), guard = 0;
  while (x && guard++ < 10) { partes.unshift(x.nombre); x = x.parentId ? db.grupos.find((g) => g.id === x.parentId) : null; }
  return partes.join(' › ');
}
function gruposDescendientes(db, id) {
  const out = new Set([id]);
  let cambio = true;
  while (cambio) {
    cambio = false;
    db.grupos.forEach((g) => { if (g.parentId && out.has(g.parentId) && !out.has(g.id)) { out.add(g.id); cambio = true; } });
  }
  return out;
}
/** Grupos ordenados como árbol (padre antes que hijos). */
function arbolGrupos(db) {
  const out = [];
  const visitar = (padre, nivel) => db.grupos.filter((g) => (g.parentId || '') === padre)
    .sort((a, b) => (Number(a.orden) || 9999) - (Number(b.orden) || 9999) || String(a.codigo).localeCompare(String(b.codigo)))
    .forEach((g) => { out.push(Object.assign({}, g, { nivel, ruta: rutaGrupo(db, g.id) })); visitar(g.id, nivel + 1); });
  visitar('', 1);
  db.grupos.filter((g) => !out.some((x) => x.id === g.id)).forEach((g) => out.push(Object.assign({}, g, { nivel: 1, ruta: g.nombre })));
  return out;
}

// ---------- Movimientos línea a línea (base de los reportes) ----------
function lineasMovimiento(db, state, f) {
  f = f || {};
  const out = [];
  const grupos = f.grupoId ? gruposDescendientes(db, f.grupoId) : null;
  for (const m of ordenar(db.movimientos)) {
    if (!f.incluirAnulados && m.anulado) continue;
    if (f.desde && m.fecha < f.desde) continue;
    if (f.hasta && m.fecha > f.hasta) continue;
    if (f.tipos && !f.tipos.includes(m.tipo)) continue;
    if (f.terceroId && m.proveedorId !== f.terceroId) continue;
    const c = state.movCost[m.id];
    m.lineas.forEach((l, i) => {
      const p = db.productos.find((x) => x.id === l.productoId);
      if (f.productoId && l.productoId !== f.productoId) return;
      if (grupos && (!p || !grupos.has(p.grupoId))) return;
      const bodega = m.tipo === 'traslado' ? bodegaDe(m, db.config) : (l.bodega || bodegaDe(m, db.config));
      if (f.bodega && bodega !== f.bodega && m.bodegaDestino !== f.bodega) return;
      const q = Number(l.cantidad);
      const signo = m.tipo === 'traslado' ? 0 : (ENTRAN.includes(m.tipo) || (m.tipo === 'ajuste' && q > 0)) ? 1 : -1;
      out.push({
        movId: m.id, num: m.num, fecha: m.fecha, tipo: m.tipo, anulado: !!m.anulado, bodega, bodegaDestino: m.bodegaDestino || '',
        productoId: l.productoId, codigo: p ? p.codigo : '', producto: p ? p.nombre : '', grupoId: p ? p.grupoId : '', unidad: p ? p.unidad : '',
        lote: l.lote, vence: l.vence, cantidad: Math.abs(q), efecto: signo * Math.abs(q),
        unit: c ? c.lineas[i].unit : 0, valor: c ? c.lineas[i].valor : 0,
        terceroId: m.proveedorId || '', docTipo: m.docTipo || '', docNum: m.docNum || '', ordenNum: m.ordenNum || '',
        destinoTipo: m.destinoTipo || '', destino: m.destino || '', procedimiento: m.procedimiento || '',
        causa: m.tipo === 'ajuste' ? l.causa : (m.causa || ''), acta: m.acta || '', usuario: m.usuario || ''
      });
    });
  }
  return out;
}

// ---------- Maestro de lotes ----------
const ESTADOS_LOTE = { liberado: 'Liberado', cuarentena: 'En cuarentena', bloqueado: 'Bloqueado' };
const claveLote = (productoId, lote) => productoId + '|' + String(lote || '').trim().toUpperCase();
function buscarLote(db, productoId, lote) {
  const k = claveLote(productoId, lote);
  return (db.lotes || []).find((x) => claveLote(x.productoId, x.lote) === k) || null;
}
/** Registra en el maestro los lotes nuevos que trae un movimiento de entrada. */
function asegurarLotes(db, mov) {
  if (!db.lotes) db.lotes = [];
  const entra = (l) => ENTRAN.includes(mov.tipo) || (mov.tipo === 'ajuste' && Number(l.cantidad) > 0);
  mov.lineas.forEach((l) => {
    if (!entra(l) || !l.productoId || !String(l.lote || '').trim() || buscarLote(db, l.productoId, l.lote)) return;
    db.lotes.push({ id: nuevoId() + Math.random().toString(36).slice(2, 5), productoId: l.productoId, lote: String(l.lote).trim(), vence: l.vence || '', fabricado: l.fabricado || '', estado: 'liberado', origen: mov.num || '', creado: mov.creado || mov.fecha });
  });
  return db;
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
/** Semáforo de vencimiento. Si el producto tiene días de alerta propios, se usan en lugar de los generales. */
function semaforo(vence, hoy, cfg, producto) {
  if (!vence) return 'na';
  const d = daysBetween(hoy, vence);
  const propio = producto && Number(producto.diasAlertaVence) > 0 ? Number(producto.diasAlertaVence) : 0;
  const rojo = propio || cfg.semaforo.rojo;
  const amarillo = propio ? propio * 2 : cfg.semaforo.amarillo;
  if (d < 0) return 'vencido';
  if (d <= rojo) return 'rojo';
  if (d <= amarillo) return 'amarillo';
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
  // Estado del lote (liberado, cuarentena, bloqueado) desde el maestro.
  (db.lotes || []).forEach((x) => {
    const p = prods[x.productoId];
    if (!p) return;
    const k = String(x.lote || '').trim().toUpperCase();
    for (const key in p.lots) if (p.lots[key].lote.toUpperCase() === k) p.lots[key].estado = x.estado || 'liberado';
  });
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
    const prodsMov = new Set((mov.lineas || []).map((l) => l.productoId));
    const previos = db.movimientos.filter((m) => !m.anulado && m.tipo !== 'inicial' && m.fecha < mov.fecha && m.lineas.some((l) => prodsMov.has(l.productoId)));
    if (previos.length) e.push('El saldo inicial de un producto debe tener fecha anterior a sus demás movimientos (' + previos[0].num + '). Para productos que ya tienen movimientos use el inventario físico.');
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
    if (mov.tipo === 'entrada') {
      if (p.bloqueoCompras) e.push(n + p.codigo + ' está bloqueado para compras (ficha del producto).');
      const min = Number(p.vidaMinRecepcion) || 0;
      if (min > 0 && l.vence && isISODate(l.vence) && isISODate(mov.fecha) && daysBetween(mov.fecha, l.vence) < min) {
        e.push(n + 'el lote ' + (l.lote || '') + ' llega con ' + daysBetween(mov.fecha, l.vence) + ' días de vida útil; el mínimo para recibir ' + p.codigo + ' es ' + min + ' días (recepción técnica, Res. 1403/2007).');
      }
    }
    if (mov.tipo === 'salida' && p.implantable && mov.destinoTipo && mov.destinoTipo !== 'Paciente') e.push(n + p.codigo + ' es implantable: la salida debe ser a un paciente identificado (tecnovigilancia, Res. 4816/2008).');
    if (l.bodega && !cfg.ubicaciones.includes(l.bodega)) e.push(n + 'la bodega ' + l.bodega + ' no existe.');
    const q = Number(l.cantidad);
    if (!isFinite(q) || q === 0) e.push(n + 'la cantidad debe ser distinta de cero.');
    if (mov.tipo !== 'ajuste' && q < 0) e.push(n + 'la cantidad debe ser positiva.');
    const conLote = p.controlaLote !== false;
    const conVence = p.controlaVence !== false;
    if (conLote && !String(l.lote || '').trim()) e.push(n + 'el lote es obligatorio (trazabilidad y tecnovigilancia).');
    if (l.vence && !isISODate(l.vence)) e.push(n + 'la fecha de vencimiento no es válida.');
    const entra = ENTRAN.includes(mov.tipo) || (mov.tipo === 'ajuste' && q > 0);
    if (entra) {
      if (conVence && !l.vence) e.push(n + 'la fecha de vencimiento es obligatoria.');
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
    const ml = buscarLote(db, l.productoId, l.lote);
    if (ml && mov.tipo === 'salida' && ml.estado && ml.estado !== 'liberado') e.push(n + 'el lote ' + l.lote + ' está ' + ESTADOS_LOTE[ml.estado].toLowerCase() + '; no se puede entregar.');
    if (ml && entra && ml.vence && l.vence && ml.vence !== l.vence) e.push(n + 'el lote ' + l.lote + ' ya existe con vencimiento ' + ml.vence + '. Verifique la fecha o use otro número de lote.');
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
        estado: semaforo(l.vence, hoy, db.config, p), dias: l.vence ? daysBetween(hoy, l.vence) : null
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
      .filter((l) => l.qty > EPS && (!bodega || l.bodega === bodega) && (opts.incluirVencidos || !l.vence || l.vence >= hoy) &&
        (opts.incluirNoLiberados || !l.estado || l.estado === 'liberado'))
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
    const politica = p.politica || 'consumo';
    const seguridad = Math.max(Number(p.stockMin) || 0, Number(p.stockSeguridad) || 0, diario * (Number(r.seguridadDias) || 0));
    let puntoReorden = r2(diario * lead + seguridad);
    let maximo = r2(puntoReorden + diario * (Number(r.coberturaDias) || 30));
    if (Number(p.puntoReorden) > 0) puntoReorden = Number(p.puntoReorden);
    if (politica === 'minmax') {
      puntoReorden = Number(p.puntoReorden) > 0 ? Number(p.puntoReorden) : Math.max(Number(p.stockMin) || 0, Number(p.stockSeguridad) || 0);
      maximo = Number(p.stockMax) || puntoReorden;
    }
    if (Number(p.stockMax) > 0 && politica === 'consumo') maximo = Math.max(puntoReorden, Math.min(maximo, Number(p.stockMax)));
    const posicion = exist + pedido;
    let sugerido = politica !== 'manual' && !p.bloqueoCompras && posicion <= puntoReorden ? Math.ceil(Math.max(0, maximo - posicion)) : 0;
    if (sugerido > 0 && Number(p.cantidadMinPedido) > sugerido) sugerido = Number(p.cantidadMinPedido);
    if (sugerido > 0 && Number(p.factorCompra) > 1) sugerido = Math.ceil(sugerido / Number(p.factorCompra)) * Number(p.factorCompra);
    const cobertura = diario > 0 ? Math.floor(exist / diario) : null;
    return { producto: p, politica, diario, lead, existencia: exist, pedido, puntoReorden, maximo, sugerido, cobertura, ultimoCosto: precioPactado(db, state, p.id, p.proveedorId) };
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
  codigo: ['codigo', 'código', 'ref', 'sku', 'item', 'codigo interno', 'código interno'],
  nombre: ['nombre', 'descripcion', 'descripción', 'producto', 'articulo', 'artículo'],
  categoria: ['categoria', 'categoría', 'tipo', 'clase', 'categoria sanitaria', 'categoría sanitaria'],
  unidad: ['unidad', 'um', 'unidad de medida'],
  stockMin: ['stock minimo', 'stock mínimo', 'minimo', 'mínimo', 'stockmin'],
  invima: ['invima', 'registro invima', 'registro sanitario'],
  invimaVence: ['vence invima', 'vencimiento invima', 'vigencia invima'],
  riesgo: ['riesgo', 'clase de riesgo', 'clasificacion de riesgo', 'clasificación de riesgo'],
  gtin: ['gtin', 'codigo de barras', 'código de barras', 'ean', 'barras'],
  bodega: ['bodega', 'ubicacion', 'ubicación', 'almacen', 'almacén'],
  lote: ['lote'],
  vence: ['vence', 'vencimiento', 'fecha de vencimiento', 'fecha vencimiento', 'caducidad'],
  cantidad: ['cantidad', 'existencia', 'saldo', 'stock', 'cant', 'cantidad contada', 'contado', 'conteo', 'fisico', 'físico', 'cantidad fisica', 'cantidad física'],
  costoUnit: ['costo', 'costo unitario', 'costo unit', 'valor unitario', 'precio'],
  // Datos opcionales de la ficha
  codigoAlterno: ['codigo alterno', 'código alterno', 'codigo anterior', 'código anterior'],
  clasificacion: ['clasificacion', 'clasificación'],
  grupo: ['linea', 'línea', 'grupo', 'subgrupo'],
  tipoMaterial: ['tipo de material', 'tipo material'],
  marca: ['marca'],
  referencia: ['referencia', 'referencia del fabricante', 'ref fabricante'],
  fabricante: ['fabricante', 'laboratorio fabricante'],
  presentacion: ['presentacion', 'presentación'],
  stockMax: ['stock maximo', 'stock máximo', 'maximo', 'máximo'],
  unidadCompra: ['unidad de compra'],
  factorCompra: ['factor', 'factor de compra', 'unidades por unidad de compra'],
  proveedor: ['proveedor', 'nit proveedor', 'proveedor preferido'],
  leadTime: ['dias de entrega', 'días de entrega', 'tiempo de entrega'],
  tarifaIva: ['iva', 'tarifa iva', 'tarifa de iva'],
  precioVenta: ['precio de venta', 'precio venta', 'tarifa'],
  ubicacionFisica: ['ubicacion fisica', 'ubicación física', 'estante', 'posicion', 'posición'],
  principioActivo: ['principio activo'],
  concentracion: ['concentracion', 'concentración'],
  formaFarmaceutica: ['forma farmaceutica', 'forma farmacéutica'],
  cum: ['cum'],
  cadenaFrio: ['cadena de frio', 'cadena de frío', 'refrigerado'],
  implantable: ['implantable']
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
  const txt = (f, k) => String(v(f, k) === undefined || v(f, k) === null ? '' : v(f, k)).trim();
  const si = (x) => /^(s|si|sí|x|1|true|verdadero)$/i.test(String(x).trim());
  const buscarEn = (obj, x) => { const n = norm(x); return n ? Object.keys(obj).find((k) => norm(k) === n || norm(obj[k]) === n || norm(obj[k]).startsWith(n)) || '' : ''; };
  /** Solo trae los campos de las columnas que vienen en el archivo, para no borrar datos de productos existentes. */
  const datosFicha = (f) => {
    const d = {};
    const has = (k) => idx[k] !== undefined && txt(f, k) !== '';
    ['codigoAlterno', 'marca', 'referencia', 'fabricante', 'presentacion', 'unidadCompra', 'ubicacionFisica', 'principioActivo', 'concentracion', 'cum'].forEach((k) => { if (has(k)) d[k] = txt(f, k); });
    ['stockMax', 'factorCompra', 'leadTime', 'precioVenta'].forEach((k) => { if (has(k) && isFinite(aNumero(v(f, k)))) d[k] = aNumero(v(f, k)); });
    if (has('tipoMaterial')) d.tipoMaterial = buscarEn(TIPOS_MATERIAL, txt(f, 'tipoMaterial')) || 'consumible';
    if (has('formaFarmaceutica')) d.formaFarmaceutica = buscarEn(FORMAS_FARMACEUTICAS, txt(f, 'formaFarmaceutica')) || 'otra';
    if (has('tarifaIva')) { const t = norm(txt(f, 'tarifaIva')); const n = (t.match(/\d+/) || [''])[0]; d.tarifaIva = t.includes('excl') ? 'excluido' : t.includes('exen') || n === '0' ? 'exento' : n === '5' ? '5' : '19'; }
    if (idx.cadenaFrio !== undefined) d.cadenaFrio = si(txt(f, 'cadenaFrio'));
    if (idx.implantable !== undefined) d.implantable = si(txt(f, 'implantable'));
    if (has('clasificacion')) { const c = buscarEn(CLASIFICACIONES, txt(f, 'clasificacion').replace(/s$/i, '')) || buscarEn(CLASIFICACIONES, txt(f, 'clasificacion')); if (c && CLASIF_PRODUCTO.includes(c)) d.clasificacion = c; }
    if (has('grupo')) {
      const n = norm(txt(f, 'grupo'));
      const g = db.grupos.find((x) => norm(x.nombre) === n || norm(rutaGrupo(db, x.id)) === n || norm(x.codigo) === n);
      d.grupoId = g ? g.id : '';
      if (g && !d.clasificacion) { const c = clasificacionGrupo(db, g.id); if (CLASIF_PRODUCTO.includes(c)) d.clasificacion = c; }
    }
    if (has('proveedor')) {
      const q = txt(f, 'proveedor'); const dig = q.split('-')[0].replace(/\D/g, '');
      const t = db.proveedores.find((x) => (dig && String(x.nit) === dig) || norm(x.nombre) === norm(q));
      d.proveedorId = t ? t.id : '';
    }
    return d;
  };
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
        datos: datosFicha(f),
        fila
      };
      const pr = productos[codigo.toUpperCase()];
      if (pr.gtin && !gtinValido(pr.gtin)) errores.push('Fila ' + fila + ': el código de barras ' + pr.gtin + ' de ' + codigo + ' no es un GTIN válido.');
      if (idx.grupo !== undefined && v(f, 'grupo') && !pr.datos.grupoId) errores.push('Fila ' + fila + ': la clasificación "' + v(f, 'grupo') + '" no existe. Créela en Clasificación o corrija el nombre.');
      if (idx.proveedor !== undefined && v(f, 'proveedor') && !pr.datos.proveedorId) errores.push('Fila ' + fila + ': el proveedor "' + v(f, 'proveedor') + '" no está en Terceros.');
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

// ---------- Inventario físico desde Excel ----------
/** Plantilla de conteo con las existencias actuales (la columna "Cantidad contada" va vacía). */
function plantillaInventarioFisico(db, state, hoy, bodega) {
  const filas = [['Código', 'Descripción', 'Bodega', 'Lote', 'Vencimiento', 'Cantidad en sistema', 'Cantidad contada', 'Costo unitario (solo lotes nuevos)']];
  lotes(db, state, hoy, { bodega: bodega && bodega !== 'todas' ? bodega : undefined })
    .sort((a, b) => (a.bodega + a.producto.nombre).localeCompare(b.bodega + b.producto.nombre))
    .forEach((l) => filas.push([l.producto.codigo, l.producto.nombre, l.bodega, l.lote, l.vence, r2(l.qty), '', '']));
  return filas;
}

/**
 * Convierte un archivo de inventario físico en líneas de conteo comparadas con el sistema.
 * opts: { bodega: bodega por defecto, alcance: 'archivo' | 'bodega' | 'todo' }
 */
function conteoDesdeFilas(db, state, filas, opts) {
  opts = opts || {};
  const errores = [], avisos = [];
  if (!filas || filas.length < 2) return { errores: ['El archivo no tiene datos.'], avisos, lineas: [] };
  const enc = filas[0].map(norm);
  const col = (alias) => enc.findIndex((h) => alias.map(norm).includes(h));
  const idx = {
    codigo: col(COLUMNAS_IMPORT.codigo), bodega: col(COLUMNAS_IMPORT.bodega), lote: col(COLUMNAS_IMPORT.lote),
    vence: col(COLUMNAS_IMPORT.vence), costo: col(['costo unitario (solo lotes nuevos)', ...COLUMNAS_IMPORT.costoUnit]),
    contado: col(['cantidad contada', 'contado', 'conteo', 'fisico', 'físico', 'cantidad fisica', 'cantidad física'])
  };
  if (idx.contado < 0) idx.contado = col(['cantidad', 'existencia', 'saldo', 'stock', 'cant']);
  if (idx.codigo < 0) errores.push('Falta la columna "Código".');
  if (idx.contado < 0) errores.push('Falta la columna "Cantidad contada".');
  if (errores.length) return { errores, avisos, lineas: [] };
  const v = (f, k) => (idx[k] < 0 ? '' : f[idx[k]]);
  const porClave = {};
  const sinDig = (s) => String(s || '').replace(/^0+/, '');
  filas.slice(1).forEach((f, i) => {
    const fila = i + 2;
    const codigo = String(v(f, 'codigo') || '').trim();
    const crudo = v(f, 'contado');
    if (!codigo) return;
    if (crudo === '' || crudo === null || crudo === undefined) { avisos.push('Fila ' + fila + ': ' + codigo + ' sin cantidad contada; se omite.'); return; }
    const contado = aNumero(crudo);
    if (!isFinite(contado) || contado < 0) { errores.push('Fila ' + fila + ': la cantidad contada no es válida.'); return; }
    const p = db.productos.find((x) => x.codigo.toUpperCase() === codigo.toUpperCase() || (x.codigoAlterno && x.codigoAlterno.toUpperCase() === codigo.toUpperCase()) || (x.gtin && sinDig(x.gtin) === sinDig(codigo)));
    if (!p) { errores.push('Fila ' + fila + ': el código ' + codigo + ' no existe. Créelo en Productos o use "Carga desde Excel".'); return; }
    const bodega = String(v(f, 'bodega') || '').trim() || opts.bodega || bodegaPrincipal(db.config);
    if (!db.config.ubicaciones.includes(bodega)) { errores.push('Fila ' + fila + ': la bodega "' + bodega + '" no existe.'); return; }
    const lote = String(v(f, 'lote') || '').trim();
    if (!lote && p.controlaLote !== false) { errores.push('Fila ' + fila + ': ' + p.codigo + ' maneja lote y la fila no lo trae.'); return; }
    const s = state.prods[p.id];
    const enSistema = s ? Object.values(s.lots).find((l) => l.bodega === bodega && l.lote.toUpperCase() === lote.toUpperCase()) : null;
    const maestro = buscarLote(db, p.id, lote);
    const vence = enSistema ? enSistema.vence : (aFecha(v(f, 'vence')) || (maestro ? maestro.vence : ''));
    if (!enSistema && !vence && p.controlaVence !== false && contado > 0) { errores.push('Fila ' + fila + ': el lote ' + lote + ' de ' + p.codigo + ' no está en el sistema; indique su fecha de vencimiento.'); return; }
    const k = lotKey(bodega, lote, vence) + '|' + p.id;
    const costo = aNumero(v(f, 'costo'));
    const x = porClave[k] || (porClave[k] = { productoId: p.id, bodega, lote: enSistema ? enSistema.lote : lote, vence, sistema: enSistema ? enSistema.qty : 0, contado: 0, nuevo: !enSistema, filas: [] });
    x.contado = r2(x.contado + contado);
    x.filas.push(fila);
    if (!enSistema && isFinite(costo) && costo >= 0) x.costoUnit = costo;
  });
  const lineas = Object.values(porClave);
  if (opts.alcance === 'bodega' || opts.alcance === 'todo') {
    lotes(db, state, opts.hoy || todayISO()).forEach((l) => {
      if (opts.alcance === 'bodega' && l.bodega !== (opts.bodega || bodegaPrincipal(db.config))) return;
      if (lineas.some((x) => x.productoId === l.productoId && x.bodega === l.bodega && x.lote.toUpperCase() === l.lote.toUpperCase())) return;
      lineas.push({ productoId: l.productoId, bodega: l.bodega, lote: l.lote, vence: l.vence, sistema: l.qty, contado: 0, nuevo: false, noContado: true, filas: [] });
    });
  }
  const dup = lineas.filter((x) => x.filas.length > 1);
  if (dup.length) avisos.push(dup.length + ' lote(s) aparecen en varias filas; se sumaron las cantidades.');
  return { errores, avisos, lineas: lineas.map((x) => Object.assign(x, { diferencia: r2(x.contado - x.sistema) })) };
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
  CONCEPTOS_CONTABLES, cuentasBase, cuentaDe, comprobantesContables, saldosContables,
  PUC_BASE, NIVELES_CUENTA, nivelCuenta, planCuentasBase, cuentaPlan, esDeMovimiento,
  baseLinea, pendientesPorFacturar, calcularFactura, validarFactura, validarComprobanteManual,
  balanceComprobacion, estadoCosto, COLUMNAS_INTERFAZ, archivoInterfaz, interpretarPlanCuentas, interpretarTerceros,
  NIVELES_GRUPO, TIPOS_MATERIAL, nivelGrupo, rutaGrupo, gruposDescendientes, arbolGrupos, lineasMovimiento,
  CLASIFICACIONES, CLASIF_PRODUCTO, CLASIF_SERVICIO, CONCEPTOS_RETENCION, retencionesPorConceptoBase, grupoRaiz, datoGrupo, clasificacionGrupo, clasificacionProducto, validarGrupo, validarServicio, migrarClasificacion, tarifaCompra, tarifaVenta, conceptoRetencionDe, conceptoRetencionLineas,
  UNIDADES, TARIFAS_IVA, pctIva, FORMAS_FARMACEUTICAS, VIAS_ADMIN, ESTERILIZACION, POLITICAS_REPOSICION, gtinValido, validarProducto, precioPactado, validarOrdenCompra,
  TIPOS_DOC, TIPOS_TERCERO, SEXOS, REGIMENES, RESPONSABILIDADES, MEDIOS_PAGO, PLAZOS_PAGO, TIPOS_CUENTA_BANCO, TIPOS_TRABAJADOR, SUBTIPOS_TRABAJADOR, TIPOS_CONTRATO, PERIODICIDADES, DEPARTAMENTOS, DEPARTAMENTOS_CO, PAISES, MUNICIPIOS, enColombia, ubicarColombia, departamentoDane, paisIso, nombreTercero, partirNombre, validarTercero, impuestosSugeridos, calcularDV, documentoTercero, normalizarTercero,
  TIPOS_BODEGA, sincronizarBodegas, renombrarBodega, bodegaEnUso,
  ESTADOS_LOTE, claveLote, buscarLote, asegurarLotes,
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
  parseCSV, aNumero, aFecha, interpretarImportacion, plantillaInventarioFisico, conteoDesdeFilas, csv
};
