// Catálogo de reportes de inventario. Cada reporte define sus filtros, columnas y cómo calcular las filas.
// Las filas se calculan con el motor (core.js); la interfaz solo las muestra, ordena, exporta e imprime.
import * as C from './core.js';

export const CATEGORIAS_REPORTE = [
  ['inventario', 'Inventario y existencias'],
  ['movimientos', 'Movimientos y kardex'],
  ['compras', 'Compras y proveedores'],
  ['consumos', 'Consumos'],
  ['calidad', 'Vencimientos y calidad'],
  ['analisis', 'Análisis de inventario'],
  ['control', 'Control, conteos y auditoría']
];

const nombreTercero = (db, id) => (db.proveedores.find((t) => t.id === id) || {}).nombre || '';
const docTercero = (db, id) => C.documentoTercero(db.proveedores.find((t) => t.id === id));
const prodDe = (db, id) => db.productos.find((p) => p.id === id) || {};
const filtraProd = (db, f) => {
  const set = f.grupo && f.grupo !== 'todos' ? C.gruposDescendientes(db, f.grupo) : null;
  return (p) => (!f.producto || p.id === f.producto) && (!set || set.has(p.grupoId));
};
const bod = (f) => (f.bodega && f.bodega !== 'todas' ? f.bodega : '');
const lin = (ctx, f, extra) => C.lineasMovimiento(ctx.db, ctx.state, Object.assign({
  desde: f.desde, hasta: f.hasta, bodega: bod(f), productoId: f.producto || '', terceroId: f.tercero || '',
  grupoId: f.grupo && f.grupo !== 'todos' ? f.grupo : ''
}, extra || {}));
const SEM = { vencido: 'Vencido', rojo: 'Rojo', amarillo: 'Amarillo', verde: 'Verde', na: 'Sin fecha' };
const TONO_SEM = { vencido: 'magenta', rojo: 'red', amarillo: 'amber', verde: 'green', na: 'muted' };

export const REPORTES = [
  // ---------------- Inventario ----------------
  {
    id: 'existencias-bodega', cat: 'inventario', t: 'Existencias por bodega', d: 'Cantidad, costo y valor de cada producto en cada bodega a una fecha de corte.',
    filtros: ['corte', 'bodega', 'grupo', 'producto'],
    cols: [['codigo', 'Código'], ['producto', 'Producto'], ['clasificacion', 'Clasificación'], ['bodega', 'Bodega'], ['unidad', 'Unidad'], ['cantidad', 'Existencia', 'num'], ['costo', 'Costo unitario', 'money'], ['valor', 'Valor', 'money']],
    total: ['valor'],
    filas: ({ db }, f) => {
      const st = C.replay(db, { hasta: f.corte });
      const out = [];
      db.productos.filter(filtraProd(db, f)).forEach((p) => {
        const s = st.prods[p.id];
        if (!s) return;
        const unit = s.qty ? s.value / s.qty : 0;
        const porB = {};
        Object.values(s.lots).forEach((l) => { if (l.qty > 0 && (!bod(f) || l.bodega === bod(f))) porB[l.bodega] = (porB[l.bodega] || 0) + l.qty; });
        Object.entries(porB).forEach(([b, q]) => out.push({ codigo: p.codigo, producto: p.nombre, clasificacion: C.rutaGrupo(db, p.grupoId), bodega: b, unidad: p.unidad, cantidad: C.r2(q), costo: unit, valor: C.r2(q * unit) }));
      });
      return out;
    }
  },
  {
    id: 'valorizado-clasificacion', cat: 'inventario', t: 'Inventario valorizado por clasificación', d: 'Valor del inventario por línea, grupo o subgrupo, con su participación.',
    filtros: ['corte', 'nivel', 'bodega'],
    cols: [['codigo', 'Código'], ['clasificacion', 'Clasificación'], ['productos', 'Productos', 'num'], ['valor', 'Valor', 'money'], ['participacion', '% del total', 'pct']],
    total: ['productos', 'valor', 'participacion'],
    filas: ({ db }, f) => {
      const st = C.replay(db, { hasta: f.corte });
      const valorP = (p) => {
        const s = st.prods[p.id];
        if (!s || !s.qty) return 0;
        const q = bod(f) ? C.existencia(st, p.id, bod(f)) : s.qty;
        return q * (s.value / s.qty);
      };
      const nivel = Number(f.nivel || 1);
      const grupos = C.arbolGrupos(db).filter((g) => g.nivel === nivel);
      const total = db.productos.reduce((a, p) => a + valorP(p), 0);
      const out = grupos.map((g) => {
        const set = C.gruposDescendientes(db, g.id);
        const ps = db.productos.filter((p) => set.has(p.grupoId));
        const v = ps.reduce((a, p) => a + valorP(p), 0);
        return { codigo: g.codigo, clasificacion: g.ruta, productos: ps.length, valor: C.r2(v), participacion: total ? (v / total) * 100 : 0 };
      });
      const cubiertos = new Set(grupos.flatMap((g) => [...C.gruposDescendientes(db, g.id)]));
      const resto = db.productos.filter((p) => !cubiertos.has(p.grupoId));
      if (resto.length) { const v = resto.reduce((a, p) => a + valorP(p), 0); out.push({ codigo: '—', clasificacion: 'Sin clasificar en este nivel', productos: resto.length, valor: C.r2(v), participacion: total ? (v / total) * 100 : 0 }); }
      return out;
    }
  },
  {
    id: 'existencias-lote', cat: 'inventario', t: 'Existencias por lote y vencimiento', d: 'Cada lote con existencia: bodega, fechas de fabricación y vencimiento, semáforo y estado.',
    filtros: ['bodega', 'grupo', 'producto'],
    cols: [['codigo', 'Código'], ['producto', 'Producto'], ['bodega', 'Bodega'], ['lote', 'Lote'], ['fabricado', 'Fabricación', 'date'], ['vence', 'Vencimiento', 'date'], ['dias', 'Días', 'num'], ['semaforo', 'Semáforo', 'chip'], ['estado', 'Estado del lote'], ['cantidad', 'Cantidad', 'num'], ['valor', 'Valor', 'money']],
    total: ['valor'],
    filas: ({ db, state, hoy }, f) => C.lotes(db, state, hoy, { bodega: bod(f) }).filter((l) => filtraProd(db, f)(l.producto)).map((l) => {
      const s = state.prods[l.productoId];
      const m = C.buscarLote(db, l.productoId, l.lote) || {};
      return { codigo: l.producto.codigo, producto: l.producto.nombre, bodega: l.bodega, lote: l.lote, fabricado: m.fabricado || '', vence: l.vence, dias: l.dias, semaforo: SEM[l.estado], semaforoTono: TONO_SEM[l.estado], estado: C.ESTADOS_LOTE[m.estado || 'liberado'], cantidad: l.qty, valor: C.r2(l.qty * (s && s.qty ? s.value / s.qty : 0)) };
    })
  },
  {
    id: 'minimos-maximos', cat: 'inventario', t: 'Productos bajo mínimo o sobre máximo', d: 'Compara la existencia total con el stock mínimo y máximo de cada producto.',
    filtros: ['grupo'],
    cols: [['codigo', 'Código'], ['producto', 'Producto'], ['existencia', 'Existencia', 'num'], ['minimo', 'Mínimo', 'num'], ['maximo', 'Máximo', 'num'], ['situacion', 'Situación', 'chip'], ['diferencia', 'Faltan / sobran', 'num']],
    filas: ({ db, state }, f) => db.productos.filter((p) => p.activo !== false && filtraProd(db, f)(p)).map((p) => {
      const q = state.prods[p.id] ? state.prods[p.id].qty : 0;
      const min = Number(p.stockMin) || 0, max = p.stockMax === '' || p.stockMax === undefined ? null : Number(p.stockMax);
      const bajo = min > 0 && q < min, sobre = max !== null && q > max;
      return { codigo: p.codigo, producto: p.nombre, existencia: q, minimo: min, maximo: max === null ? '' : max, situacion: bajo ? 'Bajo mínimo' : sobre ? 'Sobre máximo' : 'Normal', situacionTono: bajo ? 'red' : sobre ? 'amber' : 'green', diferencia: bajo ? C.r2(min - q) : sobre ? C.r2(q - max) : 0 };
    }).filter((x) => x.situacion !== 'Normal')
  },
  {
    id: 'maestro-productos', cat: 'inventario', t: 'Listado maestro de productos', d: 'Ficha resumida de todos los productos: clasificación, marca, unidad, registro INVIMA y proveedor.',
    filtros: ['grupo'],
    cols: [['codigo', 'Código'], ['producto', 'Producto'], ['clasificacion', 'Clasificación'], ['tipo', 'Tipo de material'], ['marca', 'Marca'], ['presentacion', 'Presentación'], ['unidad', 'Unidad'], ['invima', 'Registro INVIMA'], ['venceInvima', 'Vence INVIMA', 'date'], ['riesgo', 'Riesgo'], ['proveedor', 'Proveedor preferido']],
    filas: ({ db }, f) => db.productos.filter(filtraProd(db, f)).map((p) => ({ codigo: p.codigo, producto: p.nombre, clasificacion: C.rutaGrupo(db, p.grupoId), tipo: C.TIPOS_MATERIAL[p.tipoMaterial] || '', marca: p.marca || '', presentacion: p.presentacion || '', unidad: p.unidad, invima: p.invima || '', venceInvima: p.invimaVence || '', riesgo: p.riesgo, proveedor: nombreTercero(db, p.proveedorId) }))
  },

  // ---------------- Movimientos ----------------
  {
    id: 'kardex', cat: 'movimientos', t: 'Kardex por producto y periodo', d: 'Saldo inicial, entradas, salidas y saldo final en cantidad y valor de un producto.',
    filtros: ['producto', 'desde', 'hasta'], requiere: ['producto'],
    cols: [['fecha', 'Fecha', 'date'], ['num', 'Documento'], ['tipo', 'Tipo'], ['detalle', 'Detalle'], ['bodega', 'Bodega'], ['lote', 'Lote'], ['entra', 'Entrada', 'num'], ['sale', 'Salida', 'num'], ['unit', 'Costo unit.', 'money'], ['valor', 'Valor mov.', 'money'], ['saldo', 'Saldo', 'num'], ['saldoValor', 'Saldo valor', 'money']],
    total: ['entra', 'sale'],
    filas: ({ state }, f) => {
      const s = state.prods[f.producto];
      if (!s) return [];
      const antes = s.kardex.filter((k) => k.fecha < f.desde);
      const ult = antes[antes.length - 1];
      const out = [{ fecha: f.desde, num: '', tipo: 'Saldo inicial', detalle: '', bodega: '', lote: '', entra: '', sale: '', unit: ult ? ult.promedio : 0, valor: '', saldo: ult ? ult.saldoQty : 0, saldoValor: ult ? ult.saldoValor : 0 }];
      s.kardex.filter((k) => k.fecha >= f.desde && k.fecha <= f.hasta).forEach((k) => out.push({ fecha: k.fecha, num: k.num, tipo: C.TIPOS_MOV[k.tipo], detalle: k.detalle, bodega: k.bodega, lote: k.lote, entra: k.entra || '', sale: k.sale || (k.traslado ? '' : ''), unit: k.unit, valor: k.valor, saldo: k.saldoQty, saldoValor: k.saldoValor }));
      return out;
    }
  },
  {
    id: 'libro', cat: 'movimientos', t: 'Libro de movimientos detallado', d: 'Todas las líneas de todos los documentos con lote, cantidad, costo y valor.',
    filtros: ['desde', 'hasta', 'tipoMov', 'bodega', 'grupo', 'producto', 'tercero'],
    cols: [['fecha', 'Fecha', 'date'], ['num', 'Documento'], ['tipo', 'Tipo'], ['bodega', 'Bodega'], ['codigo', 'Código'], ['producto', 'Producto'], ['lote', 'Lote'], ['efecto', 'Cantidad (+/−)', 'num'], ['unit', 'Costo unit.', 'money'], ['valor', 'Valor', 'money'], ['tercero', 'Tercero / destino'], ['usuario', 'Usuario']],
    total: ['valor'],
    filas: (ctx, f) => lin(ctx, f, { tipos: f.tipoMov ? [f.tipoMov] : null }).map((x) => Object.assign({}, x, { tipo: C.TIPOS_MOV[x.tipo], bodega: x.bodega + (x.bodegaDestino ? ' → ' + x.bodegaDestino : ''), efecto: x.tipo === 'traslado' ? x.cantidad : x.efecto, tercero: x.terceroId ? nombreTercero(ctx.db, x.terceroId) : [x.destinoTipo, x.destino].filter(Boolean).join(': ') }))
  },
  {
    id: 'resumen-tipo', cat: 'movimientos', t: 'Resumen por tipo de movimiento', d: 'Número de documentos, líneas y valor por cada tipo de movimiento.',
    filtros: ['desde', 'hasta', 'bodega'],
    cols: [['tipo', 'Tipo de movimiento'], ['documentos', 'Documentos', 'num'], ['lineas', 'Líneas', 'num'], ['valor', 'Valor', 'money']],
    filas: (ctx, f) => {
      const g = {};
      lin(ctx, f).forEach((x) => { const r = g[x.tipo] || (g[x.tipo] = { tipo: C.TIPOS_MOV[x.tipo], docs: new Set(), lineas: 0, valor: 0 }); r.docs.add(x.num); r.lineas++; r.valor += x.valor; });
      return Object.values(g).map((r) => ({ tipo: r.tipo, documentos: r.docs.size, lineas: r.lineas, valor: C.r2(r.valor) }));
    }
  },
  {
    id: 'traslados', cat: 'movimientos', t: 'Traslados entre bodegas', d: 'Qué se movió de qué bodega a cuál, con lote y valor.',
    filtros: ['desde', 'hasta', 'bodega', 'producto'],
    cols: [['fecha', 'Fecha', 'date'], ['num', 'Documento'], ['origen', 'Origen'], ['destino', 'Destino'], ['producto', 'Producto'], ['lote', 'Lote'], ['cantidad', 'Cantidad', 'num'], ['valor', 'Valor', 'money']],
    total: ['valor'],
    filas: (ctx, f) => lin(ctx, f, { tipos: ['traslado'] }).map((x) => ({ fecha: x.fecha, num: x.num, origen: x.bodega, destino: x.bodegaDestino, producto: x.producto, lote: x.lote, cantidad: x.cantidad, valor: x.valor }))
  },
  {
    id: 'ajustes-bajas', cat: 'movimientos', t: 'Ajustes y bajas por causa', d: 'Faltantes, sobrantes, vencidos, dañados y retiros agrupados por causa.',
    filtros: ['desde', 'hasta', 'bodega'],
    cols: [['tipo', 'Tipo'], ['causa', 'Causa'], ['lineas', 'Líneas', 'num'], ['cantidad', 'Cantidad (+/−)', 'num'], ['valor', 'Valor (+/−)', 'money']],
    total: ['valor'],
    filas: (ctx, f) => {
      const g = {};
      lin(ctx, f, { tipos: ['ajuste', 'baja'] }).forEach((x) => {
        const causa = x.tipo === 'ajuste' ? C.CAUSAS_AJUSTE[x.causa] : C.CAUSAS_BAJA[x.causa];
        const k = x.tipo + '|' + causa;
        const r = g[k] || (g[k] = { tipo: C.TIPOS_MOV[x.tipo], causa: causa || '—', lineas: 0, cantidad: 0, valor: 0 });
        r.lineas++; r.cantidad += x.efecto; r.valor += Math.sign(x.efecto) * x.valor;
      });
      return Object.values(g).map((r) => Object.assign(r, { cantidad: C.r2(r.cantidad), valor: C.r2(r.valor) }));
    }
  },
  {
    id: 'anulados', cat: 'movimientos', t: 'Documentos anulados', d: 'Documentos anulados con su motivo, quién y cuándo.',
    filtros: ['desde', 'hasta'],
    cols: [['fecha', 'Fecha del documento', 'date'], ['num', 'Documento'], ['tipo', 'Tipo'], ['motivo', 'Motivo'], ['usuario', 'Anulado por'], ['cuando', 'Fecha de anulación']],
    filas: ({ db }, f) => db.movimientos.filter((m) => m.anulado && m.fecha >= f.desde && m.fecha <= f.hasta).map((m) => ({ fecha: m.fecha, num: m.num, tipo: C.TIPOS_MOV[m.tipo], motivo: (m.anulacion || {}).motivo || '', usuario: (m.anulacion || {}).usuario || '', cuando: String((m.anulacion || {}).fecha || '').slice(0, 16).replace('T', ' ') }))
  },

  // ---------------- Compras ----------------
  {
    id: 'compras-proveedor', cat: 'compras', t: 'Compras por proveedor', d: 'Total comprado, devuelto y neto por proveedor en el periodo.',
    filtros: ['desde', 'hasta', 'tercero'],
    cols: [['documento', 'NIT / documento'], ['proveedor', 'Proveedor'], ['facturas', 'Documentos', 'num'], ['comprado', 'Comprado', 'money'], ['devuelto', 'Devuelto', 'money'], ['neto', 'Neto', 'money']],
    total: ['facturas', 'comprado', 'devuelto', 'neto'],
    filas: (ctx, f) => {
      const g = {};
      lin(ctx, f, { tipos: ['entrada', 'devolucion'] }).forEach((x) => {
        const r = g[x.terceroId] || (g[x.terceroId] = { documento: docTercero(ctx.db, x.terceroId), proveedor: nombreTercero(ctx.db, x.terceroId), docs: new Set(), comprado: 0, devuelto: 0 });
        if (x.tipo === 'entrada') { r.docs.add(x.num); r.comprado += x.valor; } else r.devuelto += x.valor;
      });
      return Object.values(g).map((r) => ({ documento: r.documento, proveedor: r.proveedor, facturas: r.docs.size, comprado: C.r2(r.comprado), devuelto: C.r2(r.devuelto), neto: C.r2(r.comprado - r.devuelto) }));
    }
  },
  {
    id: 'compras-detalle', cat: 'compras', t: 'Compras por factura y producto', d: 'Detalle de cada factura o documento soporte: productos, lotes, cantidades y costos.',
    filtros: ['desde', 'hasta', 'tercero', 'grupo', 'producto'],
    cols: [['fecha', 'Fecha', 'date'], ['num', 'Entrada'], ['proveedor', 'Proveedor'], ['soporte', 'Soporte'], ['orden', 'Orden de compra'], ['producto', 'Producto'], ['lote', 'Lote'], ['vence', 'Vence', 'date'], ['cantidad', 'Cantidad', 'num'], ['unit', 'Costo unit.', 'money'], ['valor', 'Valor', 'money']],
    total: ['valor'],
    filas: (ctx, f) => lin(ctx, f, { tipos: ['entrada'] }).map((x) => ({ fecha: x.fecha, num: x.num, proveedor: nombreTercero(ctx.db, x.terceroId), soporte: x.docTipo + ' ' + x.docNum, orden: x.ordenNum, producto: x.producto, lote: x.lote, vence: x.vence, cantidad: x.cantidad, unit: x.unit, valor: x.valor }))
  },
  {
    id: 'ordenes-pendientes', cat: 'compras', t: 'Órdenes de compra pendientes', d: 'Lo pedido que aún no llega, con días de atraso frente a la fecha de entrega.',
    filtros: ['tercero'],
    cols: [['orden', 'Orden'], ['fecha', 'Fecha', 'date'], ['proveedor', 'Proveedor'], ['entrega', 'Entrega prevista', 'date'], ['atraso', 'Días de atraso', 'num'], ['producto', 'Producto'], ['pedido', 'Pedido', 'num'], ['recibido', 'Recibido', 'num'], ['pendiente', 'Pendiente', 'num'], ['valor', 'Valor pendiente', 'money']],
    total: ['valor'],
    filas: ({ db, hoy }, f) => db.ordenes.filter((o) => !f.tercero || o.proveedorId === f.tercero).flatMap((o) => {
      const st = C.estadoOrden(db, o);
      if (!['abierta', 'parcial'].includes(st.estado)) return [];
      return st.lineas.filter((l) => l.pendiente > 0).map((l) => ({ orden: o.num, fecha: o.fecha, proveedor: nombreTercero(db, o.proveedorId), entrega: o.fechaEntrega, atraso: o.fechaEntrega && o.fechaEntrega < hoy ? C.daysBetween(o.fechaEntrega, hoy) : 0, producto: prodDe(db, l.productoId).nombre, pedido: l.cantidad, recibido: l.recibido, pendiente: l.pendiente, valor: C.r2(l.pendiente * Number(l.costoUnit || 0)) }));
    })
  },
  {
    id: 'devoluciones', cat: 'compras', t: 'Devoluciones a proveedor', d: 'Lotes devueltos, causa, documento y valor.',
    filtros: ['desde', 'hasta', 'tercero'],
    cols: [['fecha', 'Fecha', 'date'], ['num', 'Documento'], ['proveedor', 'Proveedor'], ['causa', 'Causa'], ['nota', 'Nota crédito'], ['producto', 'Producto'], ['lote', 'Lote'], ['cantidad', 'Cantidad', 'num'], ['valor', 'Valor', 'money']],
    total: ['valor'],
    filas: (ctx, f) => lin(ctx, f, { tipos: ['devolucion'] }).map((x) => ({ fecha: x.fecha, num: x.num, proveedor: nombreTercero(ctx.db, x.terceroId), causa: C.CAUSAS_DEVOLUCION[x.causa] || '', nota: x.docNum, producto: x.producto, lote: x.lote, cantidad: x.cantidad, valor: x.valor }))
  },
  {
    id: 'historico-costos', cat: 'compras', t: 'Histórico de costos de compra', d: 'Evolución del costo unitario de compra de un producto y variación frente a la compra anterior.',
    filtros: ['producto', 'desde', 'hasta'], requiere: ['producto'],
    cols: [['fecha', 'Fecha', 'date'], ['num', 'Entrada'], ['proveedor', 'Proveedor'], ['soporte', 'Soporte'], ['cantidad', 'Cantidad', 'num'], ['unit', 'Costo unit. (con cargos)', 'money'], ['variacion', 'Variación', 'pct']],
    filas: (ctx, f) => {
      let ant = null;
      return lin(ctx, Object.assign({}, f, { desde: '', hasta: f.hasta }), { tipos: ['entrada'] }).map((x) => {
        const v = ant ? ((x.unit - ant) / ant) * 100 : '';
        ant = x.unit;
        return { fecha: x.fecha, num: x.num, proveedor: nombreTercero(ctx.db, x.terceroId), soporte: x.docTipo + ' ' + x.docNum, cantidad: x.cantidad, unit: x.unit, variacion: v };
      }).filter((x) => x.fecha >= f.desde);
    }
  },

  // ---------------- Consumos ----------------
  {
    id: 'consumo-producto', cat: 'consumos', t: 'Consumo por producto', d: 'Cantidad y valor consumido por producto, consumo diario promedio y participación.',
    filtros: ['desde', 'hasta', 'bodega', 'grupo'],
    cols: [['codigo', 'Código'], ['producto', 'Producto'], ['clasificacion', 'Clasificación'], ['cantidad', 'Cantidad', 'num'], ['unidad', 'Unidad'], ['diario', 'Consumo diario', 'num'], ['valor', 'Valor', 'money'], ['participacion', '% del consumo', 'pct']],
    total: ['valor', 'participacion'],
    filas: (ctx, f) => {
      const g = {};
      lin(ctx, f, { tipos: ['salida'] }).forEach((x) => { const r = g[x.productoId] || (g[x.productoId] = { codigo: x.codigo, producto: x.producto, clasificacion: C.rutaGrupo(ctx.db, x.grupoId), cantidad: 0, unidad: x.unidad, valor: 0 }); r.cantidad += x.cantidad; r.valor += x.valor; });
      const dias = Math.max(1, C.daysBetween(f.desde, f.hasta) + 1);
      const total = Object.values(g).reduce((a, r) => a + r.valor, 0);
      return Object.values(g).map((r) => Object.assign(r, { cantidad: C.r2(r.cantidad), diario: C.r2(r.cantidad / dias), valor: C.r2(r.valor), participacion: total ? (r.valor / total) * 100 : 0 }));
    }
  },
  {
    id: 'consumo-destino', cat: 'consumos', t: 'Consumo por paciente, consultorio o servicio', d: 'Valor consumido por cada destino y procedimientos realizados.',
    filtros: ['desde', 'hasta', 'destinoTipo', 'bodega'],
    cols: [['destinoTipo', 'Tipo'], ['destino', 'Destino'], ['salidas', 'Salidas', 'num'], ['procedimientos', 'Procedimientos'], ['valor', 'Valor', 'money']],
    total: ['salidas', 'valor'],
    filas: (ctx, f) => {
      const g = {};
      lin(ctx, f, { tipos: ['salida'] }).filter((x) => !f.destinoTipo || x.destinoTipo === f.destinoTipo).forEach((x) => {
        const k = x.destinoTipo + '|' + x.destino;
        const r = g[k] || (g[k] = { destinoTipo: x.destinoTipo, destino: x.destino, docs: new Set(), procs: {}, valor: 0 });
        r.valor += x.valor;
        if (!r.docs.has(x.num)) { r.docs.add(x.num); if (x.procedimiento) r.procs[x.procedimiento] = (r.procs[x.procedimiento] || 0) + 1; }
      });
      return Object.values(g).map((r) => ({ destinoTipo: r.destinoTipo, destino: r.destino, salidas: r.docs.size, procedimientos: Object.entries(r.procs).map(([k, v]) => k + ' (' + v + ')').join(', '), valor: C.r2(r.valor) }));
    }
  },
  {
    id: 'consumo-procedimiento', cat: 'consumos', t: 'Costo de insumos por procedimiento', d: 'Cuántas veces se hizo cada procedimiento y cuánto costaron en promedio sus insumos.',
    filtros: ['desde', 'hasta'],
    cols: [['procedimiento', 'Procedimiento'], ['veces', 'Veces realizado', 'num'], ['valor', 'Costo total insumos', 'money'], ['promedio', 'Costo promedio', 'money']],
    total: ['veces', 'valor'],
    filas: (ctx, f) => {
      const g = {};
      lin(ctx, f, { tipos: ['salida'] }).forEach((x) => { const k = x.procedimiento || 'Sin procedimiento'; const r = g[k] || (g[k] = { procedimiento: k, docs: new Set(), valor: 0 }); r.docs.add(x.num); r.valor += x.valor; });
      return Object.values(g).map((r) => ({ procedimiento: r.procedimiento, veces: r.docs.size, valor: C.r2(r.valor), promedio: C.r2(r.valor / r.docs.size) }));
    }
  },
  {
    id: 'consumo-bodega', cat: 'consumos', t: 'Consumo por bodega y línea', d: 'Qué consume cada bodega o consultorio, agrupado por línea de productos.',
    filtros: ['desde', 'hasta'],
    cols: [['bodega', 'Bodega'], ['linea', 'Línea'], ['lineas', 'Líneas', 'num'], ['valor', 'Valor', 'money']],
    total: ['valor'],
    filas: (ctx, f) => {
      const g = {};
      const lineaDe = (gid) => { const r = C.rutaGrupo(ctx.db, gid); return r ? r.split(' › ')[0] : 'Sin clasificar'; };
      lin(ctx, f, { tipos: ['salida'] }).forEach((x) => { const k = x.bodega + '|' + lineaDe(x.grupoId); const r = g[k] || (g[k] = { bodega: x.bodega, linea: lineaDe(x.grupoId), lineas: 0, valor: 0 }); r.lineas++; r.valor += x.valor; });
      return Object.values(g).map((r) => Object.assign(r, { valor: C.r2(r.valor) }));
    }
  },

  // ---------------- Vencimientos y calidad ----------------
  {
    id: 'por-vencer', cat: 'calidad', t: 'Lotes por vencer', d: 'Lotes con existencia que vencen dentro de los próximos días indicados.',
    filtros: ['dias', 'bodega', 'grupo'],
    cols: [['vence', 'Vencimiento', 'date'], ['dias', 'Días', 'num'], ['semaforo', 'Semáforo', 'chip'], ['producto', 'Producto'], ['bodega', 'Bodega'], ['lote', 'Lote'], ['cantidad', 'Cantidad', 'num'], ['valor', 'Valor', 'money']],
    total: ['valor'],
    filas: ({ db, state, hoy }, f) => C.lotes(db, state, hoy, { bodega: bod(f) }).filter((l) => l.dias !== null && l.dias >= 0 && l.dias <= Number(f.dias || 90) && filtraProd(db, f)(l.producto)).map((l) => {
      const s = state.prods[l.productoId];
      return { vence: l.vence, dias: l.dias, semaforo: SEM[l.estado], semaforoTono: TONO_SEM[l.estado], producto: l.producto.nombre, bodega: l.bodega, lote: l.lote, cantidad: l.qty, valor: C.r2(l.qty * (s && s.qty ? s.value / s.qty : 0)) };
    })
  },
  {
    id: 'retenidos', cat: 'calidad', t: 'Lotes vencidos, en cuarentena o bloqueados', d: 'Existencias que no se pueden usar y su valor (candidatas a baja o devolución).',
    filtros: ['bodega'],
    cols: [['producto', 'Producto'], ['bodega', 'Bodega'], ['lote', 'Lote'], ['vence', 'Vencimiento', 'date'], ['condicion', 'Condición', 'chip'], ['motivo', 'Motivo'], ['cantidad', 'Cantidad', 'num'], ['valor', 'Valor', 'money']],
    total: ['valor'],
    filas: ({ db, state, hoy }, f) => C.lotes(db, state, hoy, { bodega: bod(f) }).map((l) => {
      const m = C.buscarLote(db, l.productoId, l.lote) || {};
      const ret = l.estado === 'vencido' ? 'Vencido' : m.estado && m.estado !== 'liberado' ? C.ESTADOS_LOTE[m.estado] : '';
      if (!ret) return null;
      const s = state.prods[l.productoId];
      return { producto: l.producto.nombre, bodega: l.bodega, lote: l.lote, vence: l.vence, condicion: ret, condicionTono: ret === 'Vencido' ? 'magenta' : 'amber', motivo: m.motivo || '', cantidad: l.qty, valor: C.r2(l.qty * (s && s.qty ? s.value / s.qty : 0)) };
    }).filter(Boolean)
  },
  {
    id: 'invima', cat: 'calidad', t: 'Registros sanitarios INVIMA', d: 'Productos regulados sin registro, con registro vencido o por vencer.',
    filtros: ['grupo'],
    cols: [['codigo', 'Código'], ['producto', 'Producto'], ['registro', 'Registro INVIMA'], ['vence', 'Vence', 'date'], ['dias', 'Días', 'num'], ['estado', 'Estado', 'chip'], ['riesgo', 'Riesgo']],
    filas: ({ db, hoy }, f) => {
      const T = { vigente: ['Vigente', 'green'], porVencer: ['Por vencer', 'amber'], vencido: ['Vencido', 'magenta'], sin: ['Sin registro', 'red'], na: ['No aplica', 'muted'] };
      return db.productos.filter((p) => p.activo !== false && C.requiereInvima(p) && filtraProd(db, f)(p)).map((p) => {
        const e = C.estadoInvima(p, hoy, db.config);
        return { codigo: p.codigo, producto: p.nombre, registro: p.invima || '', vence: p.invimaVence || '', dias: p.invimaVence ? C.daysBetween(hoy, p.invimaVence) : '', estado: T[e][0], estadoTono: T[e][1], riesgo: p.riesgo };
      });
    }
  },
  {
    id: 'temperaturas', cat: 'calidad', t: 'Registro de temperaturas', d: 'Lecturas de cadena de frío en el periodo, señalando las que están fuera de rango.',
    filtros: ['desde', 'hasta', 'bodega'],
    cols: [['fecha', 'Fecha y hora'], ['ubicacion', 'Ubicación'], ['temp', 'Temperatura °C', 'num'], ['estado', 'Estado', 'chip'], ['responsable', 'Responsable'], ['nota', 'Observaciones']],
    filas: ({ db }, f) => db.temperaturas.filter((t) => t.fecha.slice(0, 10) >= f.desde && t.fecha.slice(0, 10) <= f.hasta && (!bod(f) || t.ubicacion === bod(f)))
      .sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
      .map((t) => { const ok = C.tempEnRango(t, db.config); return { fecha: t.fecha.replace('T', ' '), ubicacion: t.ubicacion, temp: t.temp, estado: ok ? 'En rango' : 'Fuera de rango', estadoTono: ok ? 'green' : 'magenta', responsable: t.responsable, nota: t.nota || '' }; })
  },

  // ---------------- Análisis ----------------
  {
    id: 'abc', cat: 'analisis', t: 'Clasificación ABC', d: 'Productos que concentran el 80 % (A), 15 % (B) y 5 % (C) del valor consumido.',
    filtros: ['diasAnalisis'],
    cols: [['clase', 'Clase', 'chip'], ['codigo', 'Código'], ['producto', 'Producto'], ['cantidad', 'Cantidad consumida', 'num'], ['valor', 'Valor consumido', 'money'], ['participacion', 'Participación', 'pct'], ['acumulado', 'Acumulado', 'pct']],
    total: ['valor'],
    filas: ({ db, state, hoy }, f) => C.analisisABC(db, state, hoy, Number(f.diasAnalisis || 365)).filas.map((x) => ({ clase: x.clase, claseTono: { A: 'magenta', B: 'amber', C: 'cyan' }[x.clase], codigo: x.producto.codigo, producto: x.producto.nombre, cantidad: x.cantidad, valor: x.valor, participacion: x.participacion, acumulado: x.acumulado }))
  },
  {
    id: 'rotacion', cat: 'analisis', t: 'Rotación y días de inventario', d: 'Cuántas veces rota el inventario de cada producto y cuántos días de consumo cubre.',
    filtros: ['diasAnalisis'],
    cols: [['codigo', 'Código'], ['producto', 'Producto'], ['promedio', 'Inventario promedio', 'money'], ['costo', 'Costo consumido', 'money'], ['rotacion', 'Rotación', 'num'], ['dias', 'Días de inventario', 'num']],
    filas: ({ db, hoy }, f) => C.rotacion(db, hoy, Number(f.diasAnalisis || 365)).map((x) => ({ codigo: x.producto.codigo, producto: x.producto.nombre, promedio: x.promedio, costo: x.costo, rotacion: C.r2(x.rotacion), dias: x.dias === null ? '' : x.dias }))
  },
  {
    id: 'sin-movimiento', cat: 'analisis', t: 'Productos sin movimiento (inmovilizados)', d: 'Existencias sin consumo en el periodo: posible obsolescencia y revisión del valor neto realizable.',
    filtros: ['diasAnalisis'],
    cols: [['codigo', 'Código'], ['producto', 'Producto'], ['ultima', 'Última salida', 'date'], ['existencia', 'Existencia', 'num'], ['valor', 'Valor inmovilizado', 'money']],
    total: ['valor'],
    filas: ({ db, state, hoy }, f) => C.sinMovimiento(db, state, hoy, Number(f.diasAnalisis || 180)).map((x) => ({ codigo: x.producto.codigo, producto: x.producto.nombre, ultima: x.ultimaSalida || '', existencia: x.existencia, valor: x.valor }))
  },
  {
    id: 'sugerido-compra', cat: 'analisis', t: 'Sugerido de compra (punto de reorden)', d: 'Qué comprar según consumo real, días de entrega, stock de seguridad y órdenes abiertas.',
    filtros: ['grupo'],
    cols: [['codigo', 'Código'], ['producto', 'Producto'], ['proveedor', 'Proveedor preferido'], ['diario', 'Consumo diario', 'num'], ['existencia', 'Existencia', 'num'], ['pedido', 'En órdenes', 'num'], ['reorden', 'Punto de reorden', 'num'], ['sugerido', 'Sugerido', 'num'], ['valor', 'Valor estimado', 'money']],
    total: ['valor'],
    filas: ({ db, state, hoy }, f) => C.reabastecimiento(db, state, hoy).filter((x) => x.sugerido > 0 && filtraProd(db, f)(x.producto)).map((x) => ({ codigo: x.producto.codigo, producto: x.producto.nombre, proveedor: nombreTercero(db, x.producto.proveedorId), diario: C.r2(x.diario), existencia: x.existencia, pedido: x.pedido, reorden: x.puntoReorden, sugerido: x.sugerido, valor: C.r2(x.sugerido * (x.ultimoCosto || 0)) }))
  },

  // ---------------- Control ----------------
  {
    id: 'conteos', cat: 'control', t: 'Diferencias de conteos físicos', d: 'Resultado de cada conteo: sistema contra contado, diferencia en cantidad y valor estimado.',
    filtros: ['desde', 'hasta'],
    cols: [['conteo', 'Conteo'], ['fecha', 'Fecha', 'date'], ['estado', 'Estado'], ['producto', 'Producto'], ['bodega', 'Bodega'], ['lote', 'Lote'], ['sistema', 'Sistema', 'num'], ['contado', 'Contado', 'num'], ['diferencia', 'Diferencia', 'num'], ['valor', 'Valor diferencia', 'money']],
    total: ['valor'],
    filas: ({ db, state }, f) => db.conteos.filter((c) => c.fecha >= f.desde && c.fecha <= f.hasta).flatMap((c) => c.lineas.map((l) => {
      const contado = l.contado === '' || l.contado === null || l.contado === undefined ? null : Number(l.contado);
      const dif = contado === null ? '' : C.r2(contado - Number(l.sistema));
      const s = state.prods[l.productoId];
      return { conteo: c.num, fecha: c.fecha, estado: c.estado, producto: prodDe(db, l.productoId).nombre, bodega: l.bodega, lote: l.lote, sistema: l.sistema, contado: contado === null ? '' : contado, diferencia: dif, valor: dif === '' ? '' : C.r2(dif * (s && s.qty ? s.value / s.qty : 0)) };
    }).filter((x) => x.diferencia !== 0))
  },
  {
    id: 'faltantes', cat: 'control', t: 'Control de faltantes (ET art. 64)', d: 'Faltantes del año frente al límite fiscal sobre inventario inicial más compras.',
    filtros: ['anio'],
    cols: [['concepto', 'Concepto'], ['valor', 'Valor', 'money']],
    filas: ({ db }, f) => {
      const r = C.faltantesAnio(db, Number(f.anio));
      const lim = db.config.limiteFaltantes;
      return [
        { concepto: 'Inventario inicial del año', valor: r.inicial },
        { concepto: 'Compras netas del año', valor: r.compras },
        { concepto: 'Base (inicial + compras)', valor: r.base },
        { concepto: 'Límite fiscal (' + lim + ' %)', valor: C.r2(r.base * lim / 100) },
        { concepto: 'Faltantes registrados (' + r.pct.toFixed(2) + ' %)', valor: r.faltantes },
        { concepto: r.pct > lim ? 'Exceso que requiere prueba de la pérdida' : 'Margen disponible', valor: C.r2(Math.abs(r.base * lim / 100 - r.faltantes)) }
      ];
    }
  },
  {
    id: 'cierres', cat: 'control', t: 'Histórico de cierres', d: 'Cada cierre con valor al costo, deterioro por VNR y valor neto.',
    filtros: [],
    cols: [['num', 'Cierre'], ['fecha', 'Fecha de corte', 'date'], ['metodo', 'Método'], ['bruto', 'Valor al costo', 'money'], ['deterioro', 'Deterioro', 'money'], ['neto', 'Valor neto', 'money'], ['reversion', 'Reversión', 'money'], ['usuario', 'Usuario']],
    filas: ({ db }) => db.cierres.slice().sort((a, b) => (a.fecha < b.fecha ? -1 : 1)).map((c) => ({ num: c.num, fecha: c.fecha, metodo: C.METODOS[c.metodo], bruto: c.valorBruto, deterioro: c.deterioro, neto: c.valorNeto, reversion: c.reversion, usuario: c.usuario }))
  },
  {
    id: 'auditoria', cat: 'control', t: 'Auditoría de acciones', d: 'Quién hizo qué y cuándo: documentos, cambios de maestros, ingresos y anulaciones.',
    filtros: ['desde', 'hasta', 'texto'],
    cols: [['ts', 'Fecha y hora'], ['usuario', 'Usuario'], ['accion', 'Acción'], ['detalle', 'Detalle']],
    filas: ({ db }, f) => db.auditoria.filter((a) => a.ts.slice(0, 10) >= f.desde && a.ts.slice(0, 10) <= f.hasta && (!f.texto || (a.usuario + ' ' + a.accion + ' ' + a.detalle).toLowerCase().includes(f.texto.toLowerCase())))
      .map((a) => ({ ts: a.ts.slice(0, 16).replace('T', ' '), usuario: a.usuario, accion: a.accion, detalle: a.detalle }))
  }
];

export function filtrosIniciales(hoy) {
  return { desde: C.addDays(hoy, -90), hasta: hoy, corte: hoy, bodega: 'todas', grupo: 'todos', producto: '', tercero: '', tipoMov: '', destinoTipo: '', dias: 90, diasAnalisis: 365, nivel: 1, anio: C.yearOf(hoy), texto: '' };
}
