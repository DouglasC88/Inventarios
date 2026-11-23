import { useState } from 'react';
import { ArrowRightLeft, Plus, Trash2 } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { Btn, Errores, Field, Modal, Nota, Panel } from '../components/ui.jsx';
import { MovTabla, SelectBodega, SelectProducto, TablaFEFO, asignarFEFO, explicarFaltante, nombreProducto, useRegistrar } from '../components/Movimientos.jsx';
import { num } from '../format.js';

export function NuevoTraslado({ onClose, requisicion }) {
  const { db, state, hoy, nombreUsuario } = useStore();
  const registrar = useRegistrar();
  const bp = C.bodegaPrincipal(db.config);
  const pendientes = requisicion ? C.estadoRequisicion(db, requisicion).lineas.filter((l) => l.pendiente > 0).map((l) => ({ productoId: l.productoId, cantidad: l.pendiente })) : null;
  const [h, setH] = useState({
    fecha: hoy, bodega: requisicion ? (requisicion.bodegaAtiende || bp) : bp,
    bodegaDestino: requisicion ? requisicion.bodegaSolicita : (db.config.ubicaciones.find((b) => b !== bp) || ''),
    responsable: nombreUsuario, nota: requisicion ? 'Atiende ' + requisicion.num : ''
  });
  const [lineas, setLineas] = useState(pendientes || [{ productoId: '', cantidad: '' }]);
  const [err, setErr] = useState([]);
  const setL = (i, k, v) => setLineas((ls) => ls.map((l, j) => (j === i ? Object.assign({}, l, { [k]: v }) : l)));
  const asignaciones = asignarFEFO(state, lineas, h.fecha || hoy, h.bodega);

  const guardar = (parcial) => {
    const e = [];
    if (!parcial) asignaciones.forEach((a) => { if (a.faltante > 0) e.push(explicarFaltante(db, state, a.productoId, a.cantidad, h.fecha || hoy, h.bodega)); });
    const ls = asignaciones.flatMap((a) => a.asignacion.map((x) => ({ productoId: a.productoId, lote: x.lote, vence: x.vence, cantidad: x.cantidad })));
    if (!ls.length) e.push('No hay existencias para trasladar.');
    if (e.length) return setErr(e);
    const r = registrar(Object.assign({ tipo: 'traslado', lineas: ls }, h, requisicion ? { requisicionId: requisicion.id, requisicionNum: requisicion.num } : {}), 'Traslado registrado');
    if (r.length) return setErr(r);
    onClose();
  };
  const hayFaltante = asignaciones.some((a) => a.faltante > 0);

  return (
    <Modal open wide title={requisicion ? 'Atender requisición ' + requisicion.num : 'Nuevo traslado entre bodegas'} icon={ArrowRightLeft} onClose={onClose}
      footer={<>
        <Btn onClick={onClose}>Cancelar</Btn>
        {requisicion && hayFaltante && <Btn onClick={() => guardar(true)}>Entregar lo disponible</Btn>}
        <Btn variant="primary" onClick={() => guardar(false)}>Registrar traslado</Btn>
      </>}>
      <Errores lista={err} />
      <div className="form-grid">
        <Field label="Fecha"><input className="input" type="date" value={h.fecha} max={hoy} onChange={(e) => setH((x) => Object.assign({}, x, { fecha: e.target.value }))} /></Field>
        <Field label="Bodega de origen"><SelectBodega value={h.bodega} onChange={(v) => setH((x) => Object.assign({}, x, { bodega: v }))} /></Field>
        <Field label="Bodega de destino"><SelectBodega value={h.bodegaDestino} excluir={h.bodega} onChange={(v) => setH((x) => Object.assign({}, x, { bodegaDestino: v }))} /></Field>
        <Field label="Responsable"><input className="input" value={h.responsable} onChange={(e) => setH((x) => Object.assign({}, x, { responsable: e.target.value }))} /></Field>
        <Field label="Nota" full><input className="input" value={h.nota} onChange={(e) => setH((x) => Object.assign({}, x, { nota: e.target.value }))} /></Field>
      </div>
      <div className="section-title">Productos</div>
      <div className="tbl-wrap lines">
        <table className="tbl">
          <thead><tr><th style={{ minWidth: 260 }}>Producto</th><th className="num">Disponible en origen</th><th className="num">Cantidad</th><th /></tr></thead>
          <tbody>
            {lineas.map((l, i) => (
              <tr key={i}>
                <td><SelectProducto value={l.productoId} onChange={(v) => setL(i, 'productoId', v)} /></td>
                <td className="num">{l.productoId ? num(C.sugerirFEFO(state, l.productoId, Infinity, h.fecha || hoy, h.bodega).asignacion.reduce((s, x) => s + x.cantidad, 0)) : '—'}</td>
                <td><input className="input num" type="number" min="0" value={l.cantidad} onChange={(e) => setL(i, 'cantidad', e.target.value)} style={{ width: 110 }} /></td>
                <td><Btn variant="ghost" size="sm" icon={Trash2} onClick={() => setLineas((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : [{ productoId: '', cantidad: '' }]))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="toolbar" style={{ marginTop: 10 }}><Btn size="sm" icon={Plus} onClick={() => setLineas((ls) => [...ls, { productoId: '', cantidad: '' }])}>Agregar producto</Btn></div>
      {asignaciones.length > 0 && (<><div className="section-title">Lotes que se mueven (FEFO)</div><TablaFEFO asignaciones={asignaciones} /></>)}
      <div style={{ marginTop: 14 }}><Nota>El traslado no cambia el valor del inventario: solo mueve existencias de una bodega a otra conservando lote y vencimiento.</Nota></div>
    </Modal>
  );
}

export default function Traslados({ arg }) {
  const { puede } = useStore();
  const [nuevo, setNuevo] = useState(arg === 'nuevo');
  return (
    <Panel title="Traslados entre bodegas" icon={ArrowRightLeft} sub="Movimiento de existencias entre bodegas, consultorios y neveras, con lote y vencimiento."
      actions={puede('traslados') && <Btn variant="primary" icon={Plus} onClick={() => setNuevo(true)}>Nuevo traslado</Btn>}>
      <MovTabla tipos={['traslado']} vacio="Aún no hay traslados." />
      {nuevo && <NuevoTraslado onClose={() => setNuevo(false)} />}
    </Panel>
  );
}
