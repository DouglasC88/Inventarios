import { useState } from 'react';
import { Plus, Trash2, Undo2 } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { Btn, Errores, Field, Modal, Nota, Panel } from '../components/ui.jsx';
import { MovTabla, SelectBodega, useRegistrar } from '../components/Movimientos.jsx';
import { fecha, num } from '../format.js';

function NuevaDevolucion({ onClose }) {
  const { db, state, hoy } = useStore();
  const registrar = useRegistrar();
  const [h, setH] = useState({ fecha: hoy, bodega: C.bodegaPrincipal(db.config), proveedorId: '', causa: '', docNum: '', nota: '' });
  const [lineas, setLineas] = useState([{ clave: '', cantidad: '' }]);
  const [err, setErr] = useState([]);
  const setHk = (k) => (e) => setH((x) => Object.assign({}, x, { [k]: e.target.value }));
  const setL = (i, k, v) => setLineas((ls) => ls.map((l, j) => (j === i ? Object.assign({}, l, { [k]: v }) : l)));
  // Lotes de la bodega recibidos de ese proveedor (o todos si no se ha elegido).
  const lotesProv = new Set(db.movimientos.filter((m) => !m.anulado && m.tipo === 'entrada' && (!h.proveedorId || m.proveedorId === h.proveedorId))
    .flatMap((m) => m.lineas.map((l) => l.productoId + '||' + String(l.lote).toUpperCase())));
  const opciones = C.lotes(db, state, hoy, { bodega: h.bodega }).filter((l) => lotesProv.has(l.productoId + '||' + l.lote.toUpperCase()));
  const guardar = () => {
    const ls = lineas.filter((l) => l.clave || l.cantidad).map((l) => {
      const [productoId, lote, vence] = l.clave.split('||');
      return { productoId: productoId || '', lote: lote || '', vence: vence || '', cantidad: Number(l.cantidad) };
    });
    const e = registrar(Object.assign({ tipo: 'devolucion', lineas: ls }, h, { docNum: h.docNum.trim() }), 'Devolución registrada');
    if (e.length) return setErr(e);
    onClose();
  };
  return (
    <Modal open wide title="Devolución a proveedor" icon={Undo2} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancelar</Btn><Btn variant="primary" onClick={guardar}>Registrar devolución</Btn></>}>
      <Errores lista={err} />
      <div className="form-grid">
        <Field label="Fecha"><input className="input" type="date" value={h.fecha} max={hoy} onChange={setHk('fecha')} /></Field>
        <Field label="Proveedor">
          <select className="select input" value={h.proveedorId} onChange={setHk('proveedorId')}>
            <option value="">Seleccione…</option>
            {db.proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </Field>
        <Field label="Bodega de donde sale"><SelectBodega value={h.bodega} onChange={(v) => setH((x) => Object.assign({}, x, { bodega: v }))} /></Field>
        <Field label="Causa">
          <select className="select input" value={h.causa} onChange={setHk('causa')}>
            <option value="">Seleccione…</option>
            {Object.entries(C.CAUSAS_DEVOLUCION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Nota crédito o documento de devolución"><input className="input mono" value={h.docNum} onChange={setHk('docNum')} /></Field>
        <Field label="Observaciones"><input className="input" value={h.nota} onChange={setHk('nota')} /></Field>
      </div>
      <div className="section-title">Lotes que se devuelven</div>
      <div className="tbl-wrap lines">
        <table className="tbl">
          <thead><tr><th>Lote</th><th className="num">Cantidad</th><th /></tr></thead>
          <tbody>
            {lineas.map((l, i) => (
              <tr key={i}>
                <td>
                  <select className="select input" value={l.clave} onChange={(e) => setL(i, 'clave', e.target.value)}>
                    <option value="">Seleccione…</option>
                    {opciones.map((o) => <option key={o.productoId + o.lote + o.vence} value={o.productoId + '||' + o.lote + '||' + o.vence}>{o.producto.codigo} · {o.producto.nombre} · lote {o.lote} · vence {fecha(o.vence)} · {num(o.qty)}</option>)}
                  </select>
                </td>
                <td><input className="input num" type="number" min="0" value={l.cantidad} onChange={(e) => setL(i, 'cantidad', e.target.value)} style={{ width: 110 }} /></td>
                <td><Btn variant="ghost" size="sm" icon={Trash2} onClick={() => setLineas((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : [{ clave: '', cantidad: '' }]))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="toolbar" style={{ marginTop: 10 }}><Btn size="sm" icon={Plus} onClick={() => setLineas((ls) => [...ls, { clave: '', cantidad: '' }])}>Agregar lote</Btn></div>
      <Nota>La devolución sale al costo del inventario y descuenta las compras del año en el cálculo del límite de faltantes. Si es por retiro de mercado o defecto, repórtelo también al INVIMA (Res. 4816 de 2008).</Nota>
    </Modal>
  );
}

export default function Devoluciones({ arg }) {
  const { puede } = useStore();
  const [nueva, setNueva] = useState(arg === 'nuevo');
  return (
    <Panel title="Devoluciones a proveedor" icon={Undo2} sub="Salida de lotes hacia el proveedor por defecto, vencimiento, error de pedido o retiro de mercado."
      actions={puede('devoluciones') && <Btn variant="primary" icon={Plus} onClick={() => setNueva(true)}>Nueva devolución</Btn>}>
      <MovTabla tipos={['devolucion']} vacio="Aún no hay devoluciones." />
      {nueva && <NuevaDevolucion onClose={() => setNueva(false)} />}
    </Panel>
  );
}
