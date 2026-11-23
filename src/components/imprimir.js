import * as C from '../core/core.js';
import { fecha, money, money2, num } from '../format.js';
import { encabezadoMov, nombreProducto } from './Movimientos.jsx';

const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function ventana(titulo, cuerpo) {
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) { alert('Permita las ventanas emergentes para imprimir.'); return; }
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(titulo)}</title>
<style>
  body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#111;margin:32px;font-size:12px}
  h1{font-size:18px;margin:0 0 4px} .emp{color:#555;margin-bottom:18px}
  .kv{display:grid;grid-template-columns:repeat(3,1fr);gap:6px 18px;margin:14px 0 18px}
  .kv span{display:block;color:#666;font-size:10px;text-transform:uppercase;letter-spacing:.06em}
  table{width:100%;border-collapse:collapse} th,td{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left}
  th{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#555} .n{text-align:right;font-variant-numeric:tabular-nums}
  .firmas{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:60px} .firmas div{border-top:1px solid #333;padding-top:6px}
  .anulado{color:#b00020;font-weight:700;font-size:16px;margin:8px 0}
  @media print{body{margin:12mm}}
</style></head><body>${cuerpo}<script>window.onload=()=>{window.print()}<\/script></body></html>`);
  w.document.close();
}

export function imprimirMovimiento(db, mov, costos) {
  const kv = encabezadoMov(db, mov, costos);
  const filas = mov.lineas.map((l, i) => `<tr><td>${esc(nombreProducto(db, l.productoId))}</td><td>${esc(l.bodega || '')}</td><td>${esc(l.lote)}</td><td>${esc(fecha(l.vence))}</td><td class="n">${esc(num(l.cantidad))}</td><td class="n">${costos ? esc(money2(costos.lineas[i].unit)) : ''}</td><td class="n">${costos ? esc(money(costos.lineas[i].valor)) : ''}</td></tr>`).join('');
  ventana(mov.num, `
    <h1>${esc(C.TIPOS_MOV[mov.tipo])} ${esc(mov.num)}</h1>
    <div class="emp">${esc(db.config.empresa.nombre)} · NIT ${esc(db.config.empresa.nit)}</div>
    ${mov.anulado ? `<div class="anulado">ANULADO: ${esc(mov.anulacion && mov.anulacion.motivo)}</div>` : ''}
    <div class="kv">${kv.map(([k, v]) => `<div><span>${esc(k)}</span>${esc(v)}</div>`).join('')}</div>
    ${mov.nota ? `<p>Nota: ${esc(mov.nota)}</p>` : ''}
    <table><thead><tr><th>Producto</th><th>Bodega</th><th>Lote</th><th>Vence</th><th class="n">Cantidad</th><th class="n">Costo unit.</th><th class="n">Valor</th></tr></thead><tbody>${filas}</tbody>
    <tfoot><tr><td colspan="6"><b>Total</b></td><td class="n"><b>${esc(money(costos ? costos.total : 0))}</b></td></tr></tfoot></table>
    <div class="firmas"><div>Elaboró</div><div>Recibió / autorizó</div></div>`);
}

export function imprimirOrden(db, orden, estado) {
  const prov = db.proveedores.find((p) => p.id === orden.proveedorId);
  const filas = estado.lineas.map((l) => `<tr><td>${esc(nombreProducto(db, l.productoId))}</td><td class="n">${esc(num(l.cantidad))}</td><td class="n">${esc(money2(l.costoUnit))}</td><td class="n">${esc(money(Number(l.cantidad) * Number(l.costoUnit || 0)))}</td><td class="n">${esc(num(l.recibido))}</td></tr>`).join('');
  ventana(orden.num, `
    <h1>Orden de compra ${esc(orden.num)}</h1>
    <div class="emp">${esc(db.config.empresa.nombre)} · NIT ${esc(db.config.empresa.nit)}</div>
    <div class="kv"><div><span>Proveedor</span>${esc(prov ? prov.nombre : '')}</div><div><span>NIT</span>${esc(prov ? prov.nit : '')}</div><div><span>Fecha</span>${esc(fecha(orden.fecha))}</div>
    <div><span>Entrega prevista</span>${esc(fecha(orden.fechaEntrega))}</div><div><span>Entregar en</span>${esc(orden.bodega || C.bodegaPrincipal(db.config))}</div><div><span>Estado</span>${esc(estado.estado)}</div></div>
    ${orden.nota ? `<p>Nota: ${esc(orden.nota)}</p>` : ''}
    <table><thead><tr><th>Producto</th><th class="n">Cantidad</th><th class="n">Costo unit.</th><th class="n">Total</th><th class="n">Recibido</th></tr></thead><tbody>${filas}</tbody>
    <tfoot><tr><td colspan="3"><b>Total</b></td><td class="n"><b>${esc(money(estado.valor))}</b></td><td></td></tr></tfoot></table>
    <p>Todo despacho debe acompañarse de factura electrónica, lote y fecha de vencimiento de cada producto, y registro sanitario INVIMA vigente.</p>
    <div class="firmas"><div>Elaboró</div><div>Aprobó</div></div>`);
}
