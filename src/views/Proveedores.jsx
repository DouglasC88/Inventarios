import { useState } from 'react';
import { Pencil, Plus, Truck } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { Btn, Chip, Empty, Errores, Field, Modal, Panel, SearchBox } from '../components/ui.jsx';

export function FormProveedor({ inicial, onClose, onGuardado }) {
  const { db, commit, toast } = useStore();
  const [f, setF] = useState(() => Object.assign({ nit: '', nombre: '', contacto: '', telefono: '', correo: '', obligadoFacturar: true }, inicial || {}));
  const [err, setErr] = useState([]);
  const set = (k) => (e) => setF((x) => Object.assign({}, x, { [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const guardar = () => {
    const e = [];
    if (!f.nit.trim()) e.push('El NIT o documento es obligatorio.');
    if (!f.nombre.trim()) e.push('La razón social es obligatoria.');
    if (db.proveedores.some((p) => p.id !== f.id && p.nit.replace(/\D/g, '') === f.nit.replace(/\D/g, ''))) e.push('Ya existe un proveedor con ese NIT.');
    if (e.length) return setErr(e);
    const p = Object.assign({}, f, { nit: f.nit.trim(), nombre: f.nombre.trim() });
    const nuevo = !p.id;
    if (nuevo) p.id = C.nuevoId();
    commit((d) => {
      const i = d.proveedores.findIndex((x) => x.id === p.id);
      if (i >= 0) d.proveedores[i] = p; else d.proveedores.push(p);
    }, nuevo ? 'Proveedor creado' : 'Proveedor modificado', p.nit + ' · ' + p.nombre);
    toast(nuevo ? 'Proveedor creado' : 'Proveedor actualizado');
    if (onGuardado) onGuardado(p);
    onClose();
  };
  return (
    <Modal open title={f.id ? 'Editar proveedor' : 'Nuevo proveedor'} icon={Truck} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancelar</Btn><Btn variant="primary" onClick={guardar}>Guardar</Btn></>}>
      <Errores lista={err} />
      <div className="form-grid">
        <Field label="NIT / documento"><input className="input mono" value={f.nit} onChange={set('nit')} autoFocus /></Field>
        <Field label="Razón social" span><input className="input" value={f.nombre} onChange={set('nombre')} /></Field>
        <Field label="Contacto"><input className="input" value={f.contacto} onChange={set('contacto')} /></Field>
        <Field label="Teléfono"><input className="input" value={f.telefono} onChange={set('telefono')} /></Field>
        <Field label="Correo"><input className="input" type="email" value={f.correo} onChange={set('correo')} /></Field>
        <Field label="Facturación" full hint="Si no está obligado a facturar, sus compras se soportan con documento soporte emitido por usted (ET art. 771-2).">
          <label className="check"><input type="checkbox" checked={!!f.obligadoFacturar} onChange={set('obligadoFacturar')} /> Obligado a expedir factura electrónica</label>
        </Field>
      </div>
    </Modal>
  );
}

export default function Proveedores() {
  const { db, state, puede } = useStore();
  const [q, setQ] = useState('');
  const [editar, setEditar] = useState(null);
  const lista = db.proveedores.filter((p) => (p.nombre + ' ' + p.nit).toLowerCase().includes(q.toLowerCase()));
  const compras = (id) => db.movimientos.filter((m) => !m.anulado && m.tipo === 'entrada' && m.proveedorId === id)
    .reduce((s, m) => s + (state.movCost[m.id]?.total || 0), 0);
  return (
    <Panel title="Proveedores" icon={Truck} actions={puede('maestros') && <Btn variant="primary" icon={Plus} onClick={() => setEditar({})}>Nuevo proveedor</Btn>}>
      <div className="toolbar"><SearchBox value={q} onChange={setQ} placeholder="Buscar por nombre o NIT" /></div>
      {lista.length ? (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>NIT</th><th>Razón social</th><th>Contacto</th><th>Soporte de compras</th><th className="num">Compras</th><th /></tr></thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id}>
                  <td className="mono">{p.nit}</td>
                  <td className="strong">{p.nombre}</td>
                  <td>{p.contacto}<div className="small muted">{[p.telefono, p.correo].filter(Boolean).join(' · ')}</div></td>
                  <td>{p.obligadoFacturar ? <Chip tone="cyan">Factura electrónica</Chip> : <Chip tone="violet">Documento soporte</Chip>}</td>
                  <td className="num">{new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(compras(p.id))}</td>
                  <td className="acts">{puede('maestros') && <Btn variant="ghost" size="sm" icon={Pencil} onClick={() => setEditar(p)} title="Editar" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty icon={Truck} title="Sin proveedores" text="Registre el primer proveedor." />}
      {editar && <FormProveedor inicial={editar} onClose={() => setEditar(null)} />}
    </Panel>
  );
}
