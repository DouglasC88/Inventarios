import { useState } from 'react';
import { Ban, Eye, PackagePlus, Plus, Printer, ShoppingCart, Trash2 } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { Btn, Chip, Empty, Errores, Field, Modal, Panel, Tabs } from '../components/ui.jsx';
import { SelectBodega, SelectProducto, nombreProducto } from '../components/Movimientos.jsx';
import { imprimirOrden } from '../components/imprimir.js';
import { NuevaEntrada } from './Entradas.jsx';
import { fecha, money, money2, num } from '../format.js';

const TONO = { abierta: 'amber', parcial: 'cyan', recibida: 'green', anulada: 'muted', cerrada: 'violet' };

export function NuevaOrden({ onClose, inicial }) {
  const { db, hoy, commit, toast, nombreUsuario } = useStore();
  const [h, setH] = useState(() => Object.assign({ fecha: hoy, proveedorId: '', fechaEntrega: C.addDays(hoy, 7), bodega: C.bodegaPrincipal(db.config), nota: '' }, inicial ? inicial.encabezado : {}));
  const [lineas, setLineas] = useState(() => (inicial && inicial.lineas.length ? inicial.lineas : [{ productoId: '', cantidad: '', costoUnit: '' }]));
  const [err, setErr] = useState([]);
  const setL = (i, k, v) => setLineas((ls) => ls.map((l, j) => (j === i ? Object.assign({}, l, { [k]: v }) : l)));
  const total = lineas.reduce((s, l) => s + (Number(l.cantidad) || 0) * (Number(l.costoUnit) || 0), 0);
  const guardar = () => {
    const ls = lineas.filter((l) => l.productoId && Number(l.cantidad) > 0).map((l) => ({ productoId: l.productoId, cantidad: Number(l.cantidad), costoUnit: Number(l.costoUnit) || 0 }));
    const e = [];
    if (!h.proveedorId) e.push('Seleccione el proveedor.');
    if (!ls.length) e.push('Agregue al menos un producto con cantidad.');
    if (h.fechaEntrega && h.fechaEntrega < h.fecha) e.push('La fecha de entrega no puede ser anterior a la orden.');
    if (e.length) return setErr(e);
    const numero = C.verNumero(db, 'orden');
    commit((d) => {
      d.ordenes.push(Object.assign({ id: C.nuevoId(), num: C.siguienteNumero(d, 'orden'), estado: 'abierta', lineas: ls, usuario: nombreUsuario, creado: new Date().toISOString() }, h));
    }, 'Orden de compra creada', numero);
    toast(numero + ' creada');
    onClose();
  };
  return (
    <Modal open wide title="Nueva orden de compra" icon={ShoppingCart} onClose={onClose}
      footer={<><span className="muted" style={{ marginRight: 'auto' }}>Total {money(total)}</span><Btn onClick={onClose}>Cancelar</Btn><Btn variant="primary" onClick={guardar}>Crear orden</Btn></>}>
      <Errores lista={err} />
      <div className="form-grid">
        <Field label="Proveedor" span>
          <select className="select input" value={h.proveedorId} onChange={(e) => setH((x) => Object.assign({}, x, { proveedorId: e.target.value }))}>
            <option value="">Seleccione…</option>
            {db.proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre} · {p.nit}</option>)}
          </select>
        </Field>
        <Field label="Fecha"><input className="input" type="date" value={h.fecha} onChange={(e) => setH((x) => Object.assign({}, x, { fecha: e.target.value }))} /></Field>
        <Field label="Entrega prevista"><input className="input" type="date" value={h.fechaEntrega} onChange={(e) => setH((x) => Object.assign({}, x, { fechaEntrega: e.target.value }))} /></Field>
        <Field label="Entregar en"><SelectBodega value={h.bodega} onChange={(v) => setH((x) => Object.assign({}, x, { bodega: v }))} /></Field>
        <Field label="Nota" span><input className="input" value={h.nota} onChange={(e) => setH((x) => Object.assign({}, x, { nota: e.target.value }))} /></Field>
      </div>
      <div className="section-title">Productos (en unidad de consumo)</div>
      <div className="tbl-wrap lines">
        <table className="tbl">
          <thead><tr><th style={{ minWidth: 260 }}>Producto</th><th className="num">Cantidad</th><th className="num">Costo unit. pactado</th><th className="num">Total</th><th /></tr></thead>
          <tbody>
            {lineas.map((l, i) => (
              <tr key={i}>
                <td><SelectProducto value={l.productoId} onChange={(v) => setL(i, 'productoId', v)} /></td>
                <td><input className="input num" type="number" min="0" value={l.cantidad} onChange={(e) => setL(i, 'cantidad', e.target.value)} style={{ width: 110 }} /></td>
                <td><input className="input num" type="number" min="0" value={l.costoUnit} onChange={(e) => setL(i, 'costoUnit', e.target.value)} style={{ width: 140 }} /></td>
                <td className="num">{money((Number(l.cantidad) || 0) * (Number(l.costoUnit) || 0))}</td>
                <td><Btn variant="ghost" size="sm" icon={Trash2} onClick={() => setLineas((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : [{ productoId: '', cantidad: '', costoUnit: '' }]))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="toolbar" style={{ marginTop: 10 }}><Btn size="sm" icon={Plus} onClick={() => setLineas((ls) => [...ls, { productoId: '', cantidad: '', costoUnit: '' }])}>Agregar producto</Btn></div>
    </Modal>
  );
}

function DetalleOrden({ orden, onClose, onRecibir }) {
  const { db, commit, toast, puede } = useStore();
  const st = C.estadoOrden(db, orden);
  const prov = db.proveedores.find((p) => p.id === orden.proveedorId);
  const abierta = ['abierta', 'parcial'].includes(st.estado);
  const cambiar = (estado, accion) => {
    commit((d) => { const o = d.ordenes.find((x) => x.id === orden.id); o.estado = estado; }, accion, orden.num);
    toast(orden.num + ': ' + accion.toLowerCase());
    onClose();
  };
  const recepciones = db.movimientos.filter((m) => m.ordenId === orden.id && !m.anulado);
  return (
    <Modal open wide title={'Orden de compra ' + orden.num} icon={ShoppingCart} onClose={onClose}
      footer={<>
        <Btn icon={Printer} onClick={() => imprimirOrden(db, orden, st)}>Imprimir</Btn>
        {abierta && puede('ordenes') && st.estado === 'abierta' && <Btn variant="danger" icon={Ban} onClick={() => cambiar('anulada', 'Orden anulada')}>Anular</Btn>}
        {abierta && puede('ordenes') && st.estado === 'parcial' && <Btn onClick={() => cambiar('cerrada', 'Orden cerrada con saldo')}>Cerrar saldo pendiente</Btn>}
        <span style={{ flex: 1 }} />
        <Btn onClick={onClose}>Cerrar</Btn>
        {abierta && puede('entradas') && <Btn variant="primary" icon={PackagePlus} onClick={onRecibir}>Recibir mercancía</Btn>}
      </>}>
      <div className="kv">
        <div><span>Proveedor</span><b>{prov ? prov.nombre : '—'}</b></div>
        <div><span>Fecha</span><b>{fecha(orden.fecha)}</b></div>
        <div><span>Entrega prevista</span><b>{fecha(orden.fechaEntrega)}</b></div>
        <div><span>Entregar en</span><b>{orden.bodega || C.bodegaPrincipal(db.config)}</b></div>
        <div><span>Estado</span><b>{st.estado}</b></div>
        <div><span>Valor</span><b>{money(st.valor)}</b></div>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Producto</th><th className="num">Pedido</th><th className="num">Recibido</th><th className="num">Pendiente</th><th className="num">Costo pactado</th></tr></thead>
          <tbody>
            {st.lineas.map((l, i) => (
              <tr key={i}><td>{nombreProducto(db, l.productoId)}</td><td className="num">{num(l.cantidad)}</td><td className="num green-t">{num(l.recibido)}</td><td className="num">{num(l.pendiente)}</td><td className="num">{money2(l.costoUnit)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      {recepciones.length > 0 && <p className="muted small" style={{ marginTop: 12 }}>Recepciones: {recepciones.map((m) => m.num + ' (' + m.docTipo + ' ' + m.docNum + ')').join(', ')}</p>}
    </Modal>
  );
}

export default function Ordenes() {
  const { db, puede } = useStore();
  const [nueva, setNueva] = useState(false);
  const [ver, setVer] = useState(null);
  const [recibir, setRecibir] = useState(null);
  const [tab, setTab] = useState('abiertas');
  const lista = db.ordenes.slice().reverse().map((o) => ({ o, st: C.estadoOrden(db, o) }))
    .filter((x) => tab === 'todas' || ['abierta', 'parcial'].includes(x.st.estado));
  const actual = ver && db.ordenes.find((o) => o.id === ver);
  return (
    <Panel title="Órdenes de compra" icon={ShoppingCart} sub="Pedido al proveedor, recepción parcial o total contra la orden y control de lo pendiente."
      actions={puede('ordenes') && <Btn variant="primary" icon={Plus} onClick={() => setNueva(true)}>Nueva orden</Btn>}>
      <div className="toolbar"><Tabs value={tab} onChange={setTab} options={[['abiertas', 'Abiertas'], ['todas', 'Todas']]} /></div>
      {lista.length ? (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Orden</th><th>Fecha</th><th>Proveedor</th><th>Entrega</th><th>Estado</th><th className="num">Valor</th><th /></tr></thead>
            <tbody>
              {lista.map(({ o, st }) => (
                <tr key={o.id}>
                  <td className="mono">{o.num}</td><td>{fecha(o.fecha)}</td>
                  <td>{(db.proveedores.find((p) => p.id === o.proveedorId) || {}).nombre}</td>
                  <td>{fecha(o.fechaEntrega)}</td>
                  <td><Chip tone={TONO[st.estado]} dot>{st.estado}</Chip></td>
                  <td className="num">{money(st.valor)}</td>
                  <td className="acts"><Btn variant="ghost" size="sm" icon={Eye} onClick={() => setVer(o.id)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty icon={ShoppingCart} title="Sin órdenes" text={tab === 'abiertas' ? 'No hay órdenes abiertas.' : 'Aún no hay órdenes de compra.'} />}
      {nueva && <NuevaOrden onClose={() => setNueva(false)} />}
      {actual && !recibir && <DetalleOrden orden={actual} onClose={() => setVer(null)} onRecibir={() => setRecibir(actual)} />}
      {recibir && <NuevaEntrada ordenInicial={recibir} onClose={() => { setRecibir(null); setVer(null); }} />}
    </Panel>
  );
}
