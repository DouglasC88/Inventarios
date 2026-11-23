import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/core/core.js';
import { crearDemo } from '../src/core/demo.js';

const HOY = '2026-11-23';

function base() {
  const db = C.dbVacia();
  db.proveedores.push({ id: 'pv', nit: '1', nombre: 'Proveedor' });
  db.productos.push({ id: 'a', codigo: 'A', nombre: 'Guantes', categoria: 'dispositivo', unidad: 'caja', stockMin: 0, invima: 'INVIMA X', invimaVence: '2030-01-01' });
  return db;
}
function add(db, m) {
  m.id = m.id || C.nuevoId();
  m.num = C.siguienteNumero(db, m.tipo);
  m.orden = C.siguienteOrden(db);
  db.movimientos.push(m);
  return m;
}
const ent = (fecha, lineas, extra) => Object.assign({ tipo: 'entrada', fecha, proveedorId: 'pv', docTipo: 'FE', docNum: 'F-' + Math.random(), lineas }, extra || {});

test('promedio ponderado con costos adicionales prorrateados', () => {
  const db = base();
  add(db, ent('2026-01-10', [{ productoId: 'a', lote: 'L1', vence: '2027-01-01', cantidad: 10, costoUnit: 100 }], { costosAdic: 100 }));
  add(db, ent('2026-02-10', [{ productoId: 'a', lote: 'L2', vence: '2027-06-01', cantidad: 10, costoUnit: 130 }]));
  add(db, { tipo: 'salida', fecha: '2026-03-01', destino: 'X', lineas: [{ productoId: 'a', lote: 'L1', vence: '2027-01-01', cantidad: 5 }] });
  const st = C.replay(db);
  const p = st.prods.a;
  // (10*110 + 10*130) / 20 = 120; salen 5 → 600; quedan 15 → 1800
  assert.equal(p.qty, 15);
  assert.equal(p.value, 1800);
  assert.equal(st.errors.length, 0);
});

test('PEPS consume primero las capas más antiguas', () => {
  const db = base();
  db.config.metodos = { 2026: 'peps' };
  add(db, ent('2026-01-10', [{ productoId: 'a', lote: 'L1', vence: '2027-01-01', cantidad: 10, costoUnit: 100 }]));
  add(db, ent('2026-02-10', [{ productoId: 'a', lote: 'L2', vence: '2027-06-01', cantidad: 10, costoUnit: 130 }]));
  const s = add(db, { tipo: 'salida', fecha: '2026-03-01', destino: 'X', lineas: [{ productoId: 'a', lote: 'L2', vence: '2027-06-01', cantidad: 12 }] });
  const st = C.replay(db);
  assert.equal(st.movCost[s.id].total, 10 * 100 + 2 * 130);
  assert.equal(st.prods.a.value, 8 * 130);
});

test('rechaza compras sin soporte, INVIMA vencido o producto vencido', () => {
  const db = base();
  const sinDoc = ent('2026-05-01', [{ productoId: 'a', lote: 'L', vence: '2027-01-01', cantidad: 1, costoUnit: 1 }], { docNum: '' });
  assert.ok(C.validarMovimiento(db, sinDoc, HOY).some((e) => e.includes('771-2')));
  db.productos[0].invimaVence = '2026-01-01';
  const inv = ent('2026-05-01', [{ productoId: 'a', lote: 'L', vence: '2027-01-01', cantidad: 1, costoUnit: 1 }]);
  assert.ok(C.validarMovimiento(db, inv, HOY).some((e) => e.includes('INVIMA')));
  db.productos[0].invimaVence = '2030-01-01';
  const venc = ent('2026-05-01', [{ productoId: 'a', lote: 'L', vence: '2026-04-01', cantidad: 1, costoUnit: 1 }]);
  assert.ok(C.validarMovimiento(db, venc, HOY).some((e) => e.includes('vencido')));
});

test('no permite sacar más de lo que tiene el lote', () => {
  const db = base();
  add(db, ent('2026-01-10', [{ productoId: 'a', lote: 'L1', vence: '2027-01-01', cantidad: 3, costoUnit: 10 }]));
  const e = C.validarMovimiento(db, { id: 'x', tipo: 'salida', fecha: '2026-02-01', destino: 'X', lineas: [{ productoId: 'a', lote: 'L1', vence: '2027-01-01', cantidad: 5 }] }, HOY);
  assert.ok(e.some((x) => x.includes('existencia')));
});

test('periodo cerrado bloquea movimientos', () => {
  const db = base();
  add(db, ent('2026-01-10', [{ productoId: 'a', lote: 'L1', vence: '2027-01-01', cantidad: 3, costoUnit: 10 }]));
  db.cierres.push(C.prepararCierre(db, '2026-06-30').cierre);
  const e = C.validarMovimiento(db, ent('2026-06-01', [{ productoId: 'a', lote: 'L2', vence: '2027-01-01', cantidad: 1, costoUnit: 1 }]), HOY);
  assert.ok(e.some((x) => x.includes('cerrado')));
});

test('FEFO asigna primero lo que vence antes y omite vencidos', () => {
  const db = base();
  add(db, ent('2026-01-10', [
    { productoId: 'a', lote: 'TARDE', vence: '2027-12-01', cantidad: 5, costoUnit: 10 },
    { productoId: 'a', lote: 'PRONTO', vence: '2026-12-15', cantidad: 2, costoUnit: 10 },
    { productoId: 'a', lote: 'VIEJO', vence: '2026-02-01', cantidad: 9, costoUnit: 10 }
  ]));
  const r = C.sugerirFEFO(C.replay(db), 'a', 4, HOY);
  assert.deepEqual(r.asignacion.map((x) => [x.lote, x.cantidad]), [['PRONTO', 2], ['TARDE', 2]]);
  assert.equal(r.faltante, 0);
});

test('faltantes frente al 3 % de inventario inicial + compras', () => {
  const db = base();
  add(db, ent('2026-01-10', [{ productoId: 'a', lote: 'L1', vence: '2027-01-01', cantidad: 100, costoUnit: 10 }]));
  add(db, { tipo: 'ajuste', fecha: '2026-03-01', acta: 'A', autoriza: 'G', lineas: [{ productoId: 'a', lote: 'L1', vence: '2027-01-01', cantidad: -5, causa: 'faltante' }] });
  const f = C.faltantesAnio(db, 2026);
  assert.equal(f.base, 1000);
  assert.equal(f.faltantes, 50);
  assert.equal(f.pct, 5);
});

test('cierre aplica el menor entre costo y valor neto realizable', () => {
  const db = base();
  db.productos[0].vnrUnit = 8;
  add(db, ent('2026-01-10', [{ productoId: 'a', lote: 'L1', vence: '2027-01-01', cantidad: 10, costoUnit: 10 }]));
  const c = C.prepararCierre(db, '2026-06-30').cierre;
  assert.equal(c.valorBruto, 100);
  assert.equal(c.deterioro, 20);
  assert.equal(c.valorNeto, 80);
});

test('lee códigos GS1 / UDI con y sin paréntesis', () => {
  assert.deepEqual(C.parseGS1('(01)07701234500018(17)271231(10)IM-77120'), { gtin: '07701234500018', vence: '2027-12-31', lote: 'IM-77120' });
  assert.deepEqual(C.parseGS1('010770123450001817280100' + '10AB1\u001d21S99'), { gtin: '07701234500018', vence: '2028-01-31', lote: 'AB1', serie: 'S99' });
});

test('los datos de demostración no tienen errores de existencias', () => {
  const db = crearDemo(HOY);
  const st = C.replay(db);
  assert.equal(st.errors.length, 0);
  assert.ok(C.valorInventario(st) > 0);
  const al = C.alertas(db, st, HOY);
  assert.ok(al.some((a) => a.tipo === 'vencimiento'));
  assert.ok(al.some((a) => a.tipo === 'frio'));
});

test('anular una entrada ya consumida no está permitido', () => {
  const db = base();
  const e1 = add(db, ent('2026-01-10', [{ productoId: 'a', lote: 'L1', vence: '2027-01-01', cantidad: 3, costoUnit: 10 }]));
  add(db, { tipo: 'salida', fecha: '2026-02-01', destino: 'X', lineas: [{ productoId: 'a', lote: 'L1', vence: '2027-01-01', cantidad: 2 }] });
  assert.ok(C.validarAnulacion(db, e1).length > 0);
});

test('traslado mueve existencias entre bodegas sin cambiar el valor', () => {
  const db = base();
  db.config.ubicaciones = ['Principal', 'Consultorio'];
  add(db, ent('2026-01-10', [{ productoId: 'a', lote: 'L1', vence: '2027-01-01', cantidad: 10, costoUnit: 100 }]));
  const t = { id: 't', tipo: 'traslado', fecha: '2026-02-01', bodega: 'Principal', bodegaDestino: 'Consultorio', lineas: [{ productoId: 'a', lote: 'L1', vence: '2027-01-01', cantidad: 4 }] };
  assert.deepEqual(C.validarMovimiento(db, t, HOY), []);
  add(db, t);
  const st = C.replay(db);
  assert.equal(C.existencia(st, 'a', 'Principal'), 6);
  assert.equal(C.existencia(st, 'a', 'Consultorio'), 4);
  assert.equal(st.prods.a.value, 1000);
  // No se puede sacar del consultorio más de lo que tiene.
  const e = C.validarMovimiento(db, { id: 's', tipo: 'salida', fecha: '2026-03-01', bodega: 'Consultorio', destino: 'HC-1', lineas: [{ productoId: 'a', lote: 'L1', vence: '2027-01-01', cantidad: 5 }] }, HOY);
  assert.ok(e.some((x) => x.includes('Consultorio')));
  const mismo = C.validarMovimiento(db, Object.assign({}, t, { id: 't2', bodegaDestino: 'Principal' }), HOY);
  assert.ok(mismo.some((x) => x.includes('distintas')));
});

test('devolución a proveedor descuenta existencias y compras del año', () => {
  const db = base();
  add(db, ent('2026-01-10', [{ productoId: 'a', lote: 'L1', vence: '2027-01-01', cantidad: 10, costoUnit: 100 }]));
  const dv = { id: 'd', tipo: 'devolucion', fecha: '2026-01-15', proveedorId: 'pv', causa: 'calidad', docNum: 'NC-1', lineas: [{ productoId: 'a', lote: 'L1', vence: '2027-01-01', cantidad: 2 }] };
  assert.deepEqual(C.validarMovimiento(db, dv, HOY), []);
  add(db, dv);
  assert.equal(C.replay(db).prods.a.qty, 8);
  assert.equal(C.faltantesAnio(db, 2026).compras, 800);
});

test('orden de compra: recepción parcial y total', () => {
  const db = base();
  db.ordenes.push({ id: 'o1', num: 'OC-1', proveedorId: 'pv', estado: 'abierta', lineas: [{ productoId: 'a', cantidad: 10, costoUnit: 5 }] });
  assert.equal(C.estadoOrden(db, db.ordenes[0]).estado, 'abierta');
  add(db, ent('2026-01-10', [{ productoId: 'a', lote: 'L1', vence: '2027-01-01', cantidad: 4, costoUnit: 5 }], { ordenId: 'o1' }));
  let st = C.estadoOrden(db, db.ordenes[0]);
  assert.equal(st.estado, 'parcial');
  assert.equal(st.lineas[0].pendiente, 6);
  assert.equal(C.pendienteEnOrdenes(db).a, 6);
  add(db, ent('2026-01-12', [{ productoId: 'a', lote: 'L2', vence: '2027-01-01', cantidad: 6, costoUnit: 5 }], { ordenId: 'o1' }));
  st = C.estadoOrden(db, db.ordenes[0]);
  assert.equal(st.estado, 'recibida');
});

test('unidad de compra se convierte a unidad de consumo', () => {
  const r = C.aUnidadBase({ factorCompra: 50 }, 2, 100000, true);
  assert.equal(r.cantidad, 100);
  assert.equal(r.costoUnit, 2000);
});

test('reabastecimiento sugiere comprar cuando se llega al punto de reorden', () => {
  const db = base();
  db.productos[0].leadTime = 10;
  db.config.reabastecimiento = { consumoDias: 30, seguridadDias: 5, coberturaDias: 30 };
  add(db, ent('2026-10-01', [{ productoId: 'a', lote: 'L1', vence: '2027-12-01', cantidad: 40, costoUnit: 1 }]));
  add(db, { tipo: 'salida', fecha: '2026-11-10', destino: 'X', lineas: [{ productoId: 'a', lote: 'L1', vence: '2027-12-01', cantidad: 30 }] });
  const r = C.reabastecimiento(db, C.replay(db), HOY)[0];
  // consumo 1/día → punto de reorden 10 + 5 = 15; existencia 10 → comprar hasta 45
  assert.equal(r.puntoReorden, 15);
  assert.equal(r.sugerido, 35);
});

test('clasificación ABC por valor de consumo', () => {
  const db = base();
  db.productos.push({ id: 'b', codigo: 'B', nombre: 'B', categoria: 'insumo', unidad: 'u' });
  add(db, ent('2026-10-01', [{ productoId: 'a', lote: 'L1', vence: '2027-12-01', cantidad: 100, costoUnit: 100 }, { productoId: 'b', lote: 'L2', vence: '2027-12-01', cantidad: 100, costoUnit: 1 }]));
  add(db, { tipo: 'salida', fecha: '2026-11-10', destino: 'X', lineas: [{ productoId: 'a', lote: 'L1', vence: '2027-12-01', cantidad: 50 }, { productoId: 'b', lote: 'L2', vence: '2027-12-01', cantidad: 50 }] });
  const r = C.analisisABC(db, C.replay(db), HOY);
  assert.equal(r.filas[0].producto.id, 'a');
  assert.equal(r.filas[0].clase, 'A');
  assert.equal(r.filas[1].clase, 'C');
});

test('importación desde CSV con encabezados en español', () => {
  const db = base();
  const filas = C.parseCSV('Código;Descripción;Categoría;Unidad;Lote;Vencimiento;Cantidad;Costo unitario\nA;Guantes;Dispositivo médico;caja;L9;31/12/2027;5;"1.250,50"\nZ;Gasas;Insumo;paquete;G1;2027-06-30;10;800\n');
  const r = C.interpretarImportacion(filas, db);
  assert.deepEqual(r.errores, []);
  assert.equal(r.productos.length, 2);
  assert.ok(r.productos.find((p) => p.codigo === 'A').existente);
  assert.equal(r.saldos[0].vence, '2027-12-31');
  assert.equal(r.saldos[0].costoUnit, 1250.5);
});

test('PIN cifrado y permisos por rol', () => {
  assert.equal(C.sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.notEqual(C.hashPin('admin', '1234'), C.hashPin('admin', '1235'));
  assert.ok(C.puede({ rol: 'admin' }, 'config'));
  assert.ok(!C.puede({ rol: 'consultorio' }, 'ajustes'));
  assert.ok(C.puede({ rol: 'consultorio' }, 'salidas'));
  assert.ok(!C.puede({ rol: 'consulta' }, 'entradas'));
});

test('requisición queda atendida cuando el traslado cubre lo pedido', () => {
  const db = base();
  db.config.ubicaciones = ['Principal', 'C1'];
  add(db, ent('2026-01-10', [{ productoId: 'a', lote: 'L1', vence: '2027-01-01', cantidad: 10, costoUnit: 1 }]));
  db.requisiciones.push({ id: 'r1', num: 'RQ-1', bodegaSolicita: 'C1', estado: 'pendiente', lineas: [{ productoId: 'a', cantidad: 3 }] });
  assert.equal(C.estadoRequisicion(db, db.requisiciones[0]).estado, 'pendiente');
  add(db, { tipo: 'traslado', fecha: '2026-02-01', bodega: 'Principal', bodegaDestino: 'C1', requisicionId: 'r1', lineas: [{ productoId: 'a', lote: 'L1', vence: '2027-01-01', cantidad: 3 }] });
  assert.equal(C.estadoRequisicion(db, db.requisiciones[0]).estado, 'atendida');
});
