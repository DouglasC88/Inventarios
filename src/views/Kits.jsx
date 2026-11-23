import { useState } from 'react';
import { Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { Btn, Empty, Errores, Field, Modal, Nota, Panel } from '../components/ui.jsx';
import { SelectProducto, nombreProducto } from '../components/Movimientos.jsx';
import { money, num } from '../format.js';

function FormKit({ inicial, onClose }) {
  const { db, commit, toast } = useStore();
  const [f, setF] = useState(() => Object.assign({ codigo: '', nombre: '', lineas: [{ productoId: '', cantidad: '' }] }, inicial || {}));
  const [err, setErr] = useState([]);
  const setL = (i, k, v) => setF((x) => Object.assign({}, x, { lineas: x.lineas.map((l, j) => (j === i ? Object.assign({}, l, { [k]: v }) : l)) }));
  const guardar = () => {
    const lineas = f.lineas.filter((l) => l.productoId && Number(l.cantidad) > 0).map((l) => ({ productoId: l.productoId, cantidad: Number(l.cantidad) }));
    const e = [];
    if (!f.codigo.trim()) e.push('El código es obligatorio.');
    if (!f.nombre.trim()) e.push('El nombre del procedimiento es obligatorio.');
    if (!lineas.length) e.push('Agregue al menos un insumo.');
    if (db.kits.some((k) => k.id !== f.id && k.codigo.toUpperCase() === f.codigo.trim().toUpperCase())) e.push('Ya existe un kit con ese código.');
    if (e.length) return setErr(e);
    const k = Object.assign({}, f, { codigo: f.codigo.trim(), nombre: f.nombre.trim(), lineas });
    const nuevo = !k.id;
    if (nuevo) k.id = C.nuevoId();
    commit((d) => { const i = d.kits.findIndex((x) => x.id === k.id); if (i >= 0) d.kits[i] = k; else d.kits.push(k); }, nuevo ? 'Kit creado' : 'Kit modificado', k.codigo);
    toast('Kit guardado');
    onClose();
  };
  const eliminar = () => {
    commit((d) => { d.kits = d.kits.filter((x) => x.id !== f.id); }, 'Kit eliminado', f.codigo);
    toast('Kit eliminado');
    onClose();
  };
  return (
    <Modal open wide title={f.id ? 'Editar kit' : 'Nuevo kit por procedimiento'} icon={Layers} onClose={onClose}
      footer={<>{f.id && <Btn variant="danger" icon={Trash2} onClick={eliminar}>Eliminar</Btn>}<span style={{ flex: 1 }} /><Btn onClick={onClose}>Cancelar</Btn><Btn variant="primary" onClick={guardar}>Guardar</Btn></>}>
      <Errores lista={err} />
      <div className="form-grid">
        <Field label="Código"><input className="input mono" value={f.codigo} onChange={(e) => setF((x) => Object.assign({}, x, { codigo: e.target.value }))} /></Field>
        <Field label="Procedimiento" span><input className="input" value={f.nombre} onChange={(e) => setF((x) => Object.assign({}, x, { nombre: e.target.value }))} placeholder="Ej.: Endodoncia unirradicular" /></Field>
      </div>
      <div className="section-title">Insumos por procedimiento (unidad de consumo)</div>
      <div className="tbl-wrap lines">
        <table className="tbl">
          <thead><tr><th style={{ minWidth: 280 }}>Producto</th><th className="num">Cantidad</th><th /></tr></thead>
          <tbody>
            {f.lineas.map((l, i) => (
              <tr key={i}>
                <td><SelectProducto value={l.productoId} onChange={(v) => setL(i, 'productoId', v)} /></td>
                <td><input className="input num" type="number" min="0" step="0.01" value={l.cantidad} onChange={(e) => setL(i, 'cantidad', e.target.value)} style={{ width: 110 }} /></td>
                <td><Btn variant="ghost" size="sm" icon={Trash2} onClick={() => setF((x) => Object.assign({}, x, { lineas: x.lineas.length > 1 ? x.lineas.filter((_, j) => j !== i) : [{ productoId: '', cantidad: '' }] }))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="toolbar" style={{ marginTop: 10 }}><Btn size="sm" icon={Plus} onClick={() => setF((x) => Object.assign({}, x, { lineas: [...x.lineas, { productoId: '', cantidad: '' }] }))}>Agregar insumo</Btn></div>
      <Nota>Se admiten fracciones (por ejemplo 0,25 de jeringa de resina o 0,02 de caja de guantes): el kardex descuenta la fracción exacta.</Nota>
    </Modal>
  );
}

export default function Kits() {
  const { db, state, puede } = useStore();
  const [editar, setEditar] = useState(null);
  const costo = (k) => k.lineas.reduce((s, l) => {
    const p = state.prods[l.productoId];
    return s + Number(l.cantidad) * (p && p.qty ? p.value / p.qty : (p ? p.ultimoCosto : 0));
  }, 0);
  return (
    <Panel title="Kits por procedimiento" icon={Layers} sub="Insumos que consume cada procedimiento. En Salidas, un kit descuenta todos sus insumos a la vez y deja el procedimiento registrado."
      actions={puede('maestros') && <Btn variant="primary" icon={Plus} onClick={() => setEditar({})}>Nuevo kit</Btn>}>
      {db.kits.length ? (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Código</th><th>Procedimiento</th><th>Insumos</th><th className="num">Costo estimado</th><th /></tr></thead>
            <tbody>
              {db.kits.map((k) => (
                <tr key={k.id}>
                  <td className="mono">{k.codigo}</td><td className="strong">{k.nombre}</td>
                  <td className="small">{k.lineas.map((l) => num(l.cantidad) + ' × ' + nombreProducto(db, l.productoId)).join(' · ')}</td>
                  <td className="num">{money(costo(k))}</td>
                  <td className="acts">{puede('maestros') && <Btn variant="ghost" size="sm" icon={Pencil} onClick={() => setEditar(k)} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty icon={Layers} title="Sin kits" text="Cree el primer kit por procedimiento." />}
      {editar && <FormKit inicial={editar} onClose={() => setEditar(null)} />}
    </Panel>
  );
}
