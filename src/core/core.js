/*
 * NOVA Inventario · núcleo de lógica (sin DOM).
 *
 * Reglas implementadas (ver pestaña "Normativa" de la app):
 *  - Kardex permanente (ET art. 62) valorado por promedio ponderado o PEPS.
 *    UEPS no existe: lo prohíben NIC 2, NIIF para Pymes Secc. 13 y ET art. 65.
 *  - Costo de adquisición = precio + costos adicionales no recuperables
 *    prorrateados (NIC 2 / Secc. 13). El IVA descontable no se suma.
 *  - Menor entre costo y valor neto realizable al cierre, con reversión (NIC 2).
 *  - Faltantes del año frente al 3 % de inventario inicial + compras (ET art. 64).
 *  - Lote, vencimiento y registro INVIMA por producto (Res. 3100/2019,
 *    Dec. 4725/2005, Res. 4816/2008, Res. 1403/2007).
 *  - Toda compra exige factura electrónica o documento soporte (ET art. 771-2).
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
const DOC_TIPOS = { FE: 'Factura electrónica', DS: 'Documento soporte (proveedor no obligado a facturar)' };
const TIPOS_MOV = { entrada: 'Entrada', salida: 'Salida', ajuste: 'Ajuste', baja: 'Baja' };
const PREFIJOS = { entrada: 'EN', salida: 'SA', ajuste: 'AJ', baja: 'BA', conteo: 'CF', cierre: 'CI' };

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
    ubicaciones: ['Bodega principal']
  };
}

function dbVacia() {
  return {
    version: 1,
    config: configBase(),
    productos: [], proveedores: [], movimientos: [], conteos: [], cierres: [],
    temperaturas: [], auditoria: [],
    seq: { EN: 0, SA: 0, AJ: 0, BA: 0, CF: 0, CI: 0, orden: 0 }
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

// ---------- Motor de kardex ----------
const lotKey = (lote, vence) => String(lote || '').trim().toUpperCase() + '|' + (vence || '');

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
  if (resta > EPS) valor += resta * (p.ultimoCosto || 0); // existencia negativa: se registra el error aparte
  return r2(valor);
}

function costoActual(p, metodo) {
  if (metodo === 'peps') return p.layers.length ? p.layers[p.layers.length - 1].cost : (p.ultimoCosto || 0);
  return p.qty > EPS ? p.value / p.qty : (p.ultimoCosto || 0);
}

function detalleMov(db, m, l) {
  if (m.tipo === 'entrada') {
    const prov = db.proveedores.find((x) => x.id === m.proveedorId);
    return (prov ? prov.nombre : 'Proveedor') + ' · ' + m.docTipo + ' ' + m.docNum;
  }
  if (m.tipo === 'salida') return (m.destinoTipo || 'Destino') + (m.destino ? ': ' + m.destino : '');
  if (m.tipo === 'ajuste') return (CAUSAS_AJUSTE[l.causa] || 'Ajuste') + (m.conteoNum ? ' · ' + m.conteoNum : '');
  if (m.tipo === 'baja') return 'Baja: ' + (CAUSAS_BAJA[m.causa] || m.causa);
  return '';
}

/**
 * Reconstruye existencias, costos y kardex desde los movimientos.
 * @returns {{prods, movCost, errors, metodo}}
 */
function replay(db, opts) {
  opts = opts || {};
  const prods = {};
  const movCost = {};
  const errors = [];
  const ensure = (id) => prods[id] || (prods[id] = { qty: 0, value: 0, layers: [], lots: {}, kardex: [], ultimoCosto: 0 });
  let metodoActual = null;
  const movs = ordenar(db.movimientos).filter((m) => !m.anulado && (!opts.hasta || m.fecha <= opts.hasta));

  for (const m of movs) {
    const metodo = metodoDe(db.config, m.fecha);
    if (metodoActual && metodo !== metodoActual) {
      // Cambio de método al iniciar un nuevo año gravable.
      for (const id in prods) {
        const p = prods[id];
        p.layers = metodo === 'peps' && p.qty > EPS ? [{ qty: p.qty, cost: p.value / p.qty }] : [];
      }
    }
    metodoActual = metodo;
    const base = m.tipo === 'entrada'
      ? m.lineas.reduce((s, l) => s + Number(l.cantidad) * Number(l.costoUnit || 0), 0) : 0;
    const costos = [];

    for (const l of m.lineas) {
      const p = ensure(l.productoId);
      const key = lotKey(l.lote, l.vence);
      const lot = p.lots[key] || (p.lots[key] = { lote: String(l.lote || '').trim(), vence: l.vence || '', qty: 0 });
      let q = Number(l.cantidad);
      let unit = 0, valor = 0, entra = 0, sale = 0;
      const esEntrada = m.tipo === 'entrada' || (m.tipo === 'ajuste' && q > 0);

      if (esEntrada) {
        if (m.tipo === 'entrada') {
          const linea = q * Number(l.costoUnit || 0);
          const extra = base > 0 ? Number(m.costosAdic || 0) * (linea / base) : 0;
          unit = q > 0 ? (linea + extra) / q : 0;
          p.ultimoCosto = unit;
        } else {
          unit = l.costoUnit !== undefined && l.costoUnit !== null && l.costoUnit !== ''
            ? Number(l.costoUnit) : costoActual(p, metodo);
        }
        valor = r2(q * unit);
        p.qty += q;
        p.value = r2(p.value + valor);
        if (metodo === 'peps') p.layers.push({ qty: q, cost: unit });
        lot.qty += q;
        entra = q;
      } else {
        q = Math.abs(q);
        if (lot.qty + EPS < q) {
          errors.push({ movId: m.id, num: m.num, msg: 'El lote ' + lot.lote + ' no tiene existencia suficiente (' + r2(lot.qty) + ' disponibles).' });
        }
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
        movId: m.id, num: m.num, fecha: m.fecha, tipo: m.tipo, detalle: detalleMov(db, m, l),
        lote: lot.lote, vence: lot.vence, entra, sale, unit, valor,
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

// ---------- Validación de movimientos ----------
function validarMovimiento(db, mov, hoy) {
  const e = [];
  hoy = hoy || todayISO();
  if (!isISODate(mov.fecha)) e.push('La fecha no es válida.');
  else if (mov.fecha > hoy) e.push('No se registran movimientos con fecha futura.');
  const uc = ultimoCierre(db);
  if (uc && mov.fecha <= uc.fecha) e.push('El periodo está cerrado hasta ' + uc.fecha + '. Registre el movimiento en el periodo abierto.');
  const ca = conteoAbierto(db);
  if (ca && !mov.conteoId) e.push('Hay un conteo físico abierto (' + ca.num + '). Aplíquelo o anúlelo antes de registrar movimientos.');
  if (!mov.lineas || !mov.lineas.length) e.push('Agregue al menos una línea.');

  if (mov.tipo === 'entrada') {
    if (!mov.proveedorId || !db.proveedores.some((p) => p.id === mov.proveedorId)) e.push('Seleccione el proveedor.');
    if (!DOC_TIPOS[mov.docTipo]) e.push('Indique si el soporte es factura electrónica o documento soporte.');
    if (!String(mov.docNum || '').trim()) e.push('El número de la factura electrónica o del documento soporte es obligatorio (ET art. 771-2).');
    else if (db.movimientos.some((m) => !m.anulado && m.tipo === 'entrada' && m.id !== mov.id &&
      m.proveedorId === mov.proveedorId && m.docTipo === mov.docTipo &&
      String(m.docNum).trim().toUpperCase() === String(mov.docNum).trim().toUpperCase())) {
      e.push('Ese documento ya fue registrado para este proveedor.');
    }
    if (Number(mov.costosAdic || 0) < 0) e.push('Los costos adicionales no pueden ser negativos.');
  }
  if (mov.tipo === 'salida' && !String(mov.destino || '').trim() && !mov.destinoTipo) e.push('Indique el destino de la salida.');
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
    const q = Number(l.cantidad);
    if (!isFinite(q) || q === 0) e.push(n + 'la cantidad debe ser distinta de cero.');
    if (mov.tipo !== 'ajuste' && q < 0) e.push(n + 'la cantidad debe ser positiva.');
    if (!String(l.lote || '').trim()) e.push(n + 'el lote es obligatorio (trazabilidad y tecnovigilancia).');
    if (l.vence && !isISODate(l.vence)) e.push(n + 'la fecha de vencimiento no es válida.');
    if (mov.tipo === 'entrada' || (mov.tipo === 'ajuste' && q > 0)) {
      if (!l.vence) e.push(n + 'la fecha de vencimiento es obligatoria.');
      if (mov.tipo === 'entrada' && l.vence && isISODate(mov.fecha) && l.vence <= mov.fecha) e.push(n + p.nombre + ' viene vencido; no se puede recibir.');
      if (l.costoUnit !== undefined && l.costoUnit !== '' && Number(l.costoUnit) < 0) e.push(n + 'el costo no puede ser negativo.');
      if (mov.tipo === 'entrada' && (l.costoUnit === undefined || l.costoUnit === '' || !isFinite(Number(l.costoUnit)))) e.push(n + 'indique el costo unitario.');
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
      r.errors.filter((x) => x.movId === mov.id || r.errors.length > antes).slice(0, 3).forEach((x) => e.push(x.num ? x.num + ': ' + x.msg : x.msg));
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
    if (replay(sin).errors.length > antes) e.push('No se puede anular: hay salidas posteriores que usan esas existencias.');
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
      out.push({
        producto: p, productoId: p.id, lote: l.lote, vence: l.vence, qty: l.qty,
        estado: semaforo(l.vence, hoy, db.config), dias: l.vence ? daysBetween(hoy, l.vence) : null
      });
    }
  }
  return out.sort((a, b) => (a.vence || '9999') < (b.vence || '9999') ? -1 : 1);
}

/** Asigna lotes por FEFO: lo que vence primero sale primero; nunca lotes vencidos. */
function sugerirFEFO(state, productoId, cantidad, hoy) {
  const s = state.prods[productoId];
  const asignacion = [];
  let resta = Number(cantidad) || 0;
  if (s) {
    const disponibles = Object.values(s.lots)
      .filter((l) => l.qty > EPS && (!l.vence || l.vence >= hoy))
      .sort((a, b) => (a.vence || '9999') < (b.vence || '9999') ? -1 : 1);
    for (const l of disponibles) {
      if (resta <= EPS) break;
      const t = Math.min(l.qty, resta);
      asignacion.push({ lote: l.lote, vence: l.vence, cantidad: t });
      resta -= t;
    }
  }
  return { asignacion, faltante: resta > EPS ? resta : 0 };
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
    if (m.tipo === 'entrada') compras += c.total;
    if (m.tipo === 'ajuste') {
      m.lineas.forEach((l, i) => {
        if (Number(l.cantidad) < 0 && l.causa === 'faltante') faltantes += c.lineas[i].valor;
      });
    }
  }
  const base = r2(inicial + compras);
  return { inicial, compras: r2(compras), faltantes: r2(faltantes), base, pct: base > 0 ? (faltantes / base) * 100 : 0 };
}

function alertas(db, state, hoy) {
  const cfg = db.config;
  const out = [];
  for (const p of db.productos) {
    if (p.activo === false) continue;
    const s = state.prods[p.id];
    const qty = s ? s.qty : 0;
    if (Number(p.stockMin) > 0 && qty < Number(p.stockMin)) {
      out.push({ nivel: qty <= 0 ? 'critico' : 'alerta', tipo: 'stock', titulo: p.nombre + ' bajo el mínimo', detalle: 'Existencia ' + r2(qty) + ' ' + (p.unidad || '') + ' · mínimo ' + p.stockMin, productoId: p.id });
    }
    const ei = estadoInvima(p, hoy, cfg);
    if (ei === 'sin') out.push({ nivel: 'critico', tipo: 'invima', titulo: p.nombre + ' sin registro INVIMA', detalle: 'No se podrán recibir compras de este producto.', productoId: p.id });
    if (ei === 'vencido') out.push({ nivel: 'critico', tipo: 'invima', titulo: 'Registro INVIMA vencido: ' + p.nombre, detalle: p.invima + ' venció el ' + p.invimaVence, productoId: p.id });
    if (ei === 'porVencer') out.push({ nivel: 'alerta', tipo: 'invima', titulo: 'Registro INVIMA por vencer: ' + p.nombre, detalle: p.invima + ' vence el ' + p.invimaVence, productoId: p.id });
  }
  for (const l of lotes(db, state, hoy)) {
    if (l.estado === 'vencido') out.push({ nivel: 'critico', tipo: 'vencimiento', titulo: 'Lote vencido con existencia: ' + l.producto.nombre, detalle: 'Lote ' + l.lote + ' venció el ' + l.vence + ' · ' + r2(l.qty) + ' ' + (l.producto.unidad || '') + '. Registre la baja.', productoId: l.productoId, lote: l.lote });
    else if (l.estado === 'rojo') out.push({ nivel: 'alerta', tipo: 'vencimiento', titulo: 'Lote por vencer: ' + l.producto.nombre, detalle: 'Lote ' + l.lote + ' vence en ' + l.dias + ' días (' + l.vence + ').', productoId: l.productoId, lote: l.lote });
  }
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

function tempEnRango(t, cfg) {
  const v = Number(t.temp);
  return v >= Number(cfg.frio.min) && v <= Number(cfg.frio.max);
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
    lineas.push({ productoId: l.productoId, lote: l.lote, vence: l.vence, sistema: l.qty, contado: '' });
  }
  return lineas;
}

function diferenciasConteo(conteo, state) {
  return conteo.lineas.map((l) => {
    const s = state.prods[l.productoId];
    const lot = s ? s.lots[lotKey(l.lote, l.vence)] : null;
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
        mov: m, linea: l, producto: p, fecha: m.fecha, tipo: m.tipo, num: m.num,
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
  CATEGORIAS, RIESGOS, METODOS, CAUSAS_AJUSTE, CAUSAS_BAJA, DOC_TIPOS, TIPOS_MOV,
  configBase, dbVacia, nuevoId, siguienteNumero, siguienteOrden,
  semaforo, requiereInvima, estadoInvima, metodoDe, ultimoCierre, conteoAbierto,
  lotKey, ordenar, replay, valorInventario,
  validarMovimiento, validarAnulacion, lotes, sugerirFEFO,
  faltantesAnio, alertas, tempEnRango, cumplimiento,
  prepararCierre, crearConteo, diferenciasConteo, trazabilidad, parseGS1, csv
};
