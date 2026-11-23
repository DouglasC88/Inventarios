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
