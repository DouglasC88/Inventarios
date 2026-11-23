import { useState } from 'react';
import { Pencil, Plus, Star, Warehouse } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { Btn, Chip, Empty, Errores, Field, Modal, Nota, Panel } from '../components/ui.jsx';
import { money, num } from '../format.js';

function FormBodega({ inicial, onClose }) {
  const { db, state, commit, toast } = useStore();
  const [f, setF] = useState(() => Object.assign({ codigo: '', nombre: '', tipo: 'bodega', responsable: '', sede: '', activa: true, principal: false }, inicial || {}));
  const [err, setErr] = useState([]);
  const set = (k) => (e) => setF((x) => Object.assign({}, x, { [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const guardar = () => {
    const e = [];
    const nombre = f.nombre.trim();
    const codigo = f.codigo.trim().toUpperCase();
    if (!codigo) e.push('El código es obligatorio.');
    if (!nombre) e.push('El nombre es obligatorio.');
    if (db.bodegas.some((b) => b.id !== f.id && b.nombre.toLowerCase() === nombre.toLowerCase())) e.push('Ya existe una bodega con ese nombre.');
    if (db.bodegas.some((b) => b.id !== f.id && String(b.codigo).toUpperCase() === codigo)) e.push('Ya existe una bodega con ese código.');
    if (f.id && !f.activa && inicial.activa !== false) {
      const enStock = db.productos.some((p) => C.existencia(state, p.id, inicial.nombre) > 0);
      if (enStock) e.push('No se puede desactivar: la bodega tiene existencias. Trasládelas primero.');
      if (db.usuarios.some((u) => u.bodega === inicial.nombre && u.activo !== false)) e.push('No se puede desactivar: hay usuarios asignados a esta bodega.');
      if (f.principal) e.push('La bodega principal no se puede desactivar. Marque otra como principal primero.');
    }
    if (!f.id && !f.activa) e.push('Una bodega nueva debe crearse activa.');
    if (e.length) return setErr(e);
    const b = Object.assign({}, f, { codigo, nombre });
    const nuevo = !b.id;
    if (nuevo) b.id = C.nuevoId();
    commit((d) => {
      if (!nuevo && inicial.nombre !== nombre) C.renombrarBodega(d, inicial.nombre, nombre);
      if (b.principal) d.bodegas.forEach((x) => { x.principal = false; });
      const i = d.bodegas.findIndex((x) => x.id === b.id);
      if (i >= 0) d.bodegas[i] = b; else d.bodegas.push(b);
      C.sincronizarBodegas(d);
    }, nuevo ? 'Bodega creada' : 'Bodega modificada', codigo + ' · ' + nombre);
    toast(nuevo ? 'Bodega creada' : 'Bodega actualizada');
    onClose();
  };
  return (
    <Modal open title={f.id ? 'Editar bodega' : 'Nueva bodega'} icon={Warehouse} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancelar</Btn><Btn variant="primary" onClick={guardar}>Guardar</Btn></>}>
      <Errores lista={err} />
      <div className="form-grid">
        <Field label="Código"><input className="input mono" value={f.codigo} onChange={set('codigo')} autoFocus placeholder="Ej.: C3" /></Field>
        <Field label="Nombre" span><input className="input" value={f.nombre} onChange={set('nombre')} placeholder="Ej.: Consultorio 3" /></Field>
        <Field label="Tipo">
          <select className="select input" value={f.tipo} onChange={set('tipo')}>{Object.entries(C.TIPOS_BODEGA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Field>
        <Field label="Responsable"><input className="input" value={f.responsable} onChange={set('responsable')} /></Field>
        <Field label="Sede o dirección"><input className="input" value={f.sede} onChange={set('sede')} /></Field>
        <Field label="Principal"><label className="check"><input type="checkbox" checked={!!f.principal} onChange={set('principal')} /> Bodega principal (recibe compras por defecto)</label></Field>
        <Field label="Estado"><label className="check"><input type="checkbox" checked={f.activa !== false} onChange={set('activa')} /> Activa</label></Field>
      </div>
      {f.id && inicial.nombre !== f.nombre.trim() && f.nombre.trim() && <Nota>Al cambiar el nombre se actualiza en todos los documentos, usuarios y productos que usan esta bodega.</Nota>}
    </Modal>
  );
}

export default function Bodegas({ arg }) {
  const { db, state, puede } = useStore();
  const [editar, setEditar] = useState(arg === 'nuevo' ? {} : null);
  const valor = (nombre) => db.productos.reduce((s, p) => {
    const x = state.prods[p.id];
    return s + (x && x.qty ? C.existencia(state, p.id, nombre) * (x.value / x.qty) : 0);
  }, 0);
  const lotesEn = (nombre) => C.lotes(db, state, C.todayISO(), { bodega: nombre }).length;
  return (
    <Panel title="Bodegas y ubicaciones" icon={Warehouse}
      sub="Cree aquí cada lugar donde se guarda inventario: bodega principal, consultorios, neveras, cuarentena o sedes. Cada entrada, salida y traslado indica su bodega."
      actions={puede('config') && <Btn variant="primary" icon={Plus} onClick={() => setEditar({})}>Nueva bodega</Btn>}>
      {db.bodegas.length ? (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Código</th><th>Nombre</th><th>Tipo</th><th>Responsable</th><th>Sede</th><th className="num">Lotes con existencia</th><th className="num">Valor</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {db.bodegas.map((b) => (
                <tr key={b.id} style={b.activa === false ? { opacity: 0.55 } : undefined}>
                  <td className="mono">{b.codigo}</td>
                  <td className="strong">{b.nombre} {b.principal && <Chip tone="violet"><Star size={11} /> Principal</Chip>}</td>
                  <td>{C.TIPOS_BODEGA[b.tipo] || b.tipo}</td>
                  <td>{b.responsable || '—'}</td>
                  <td>{b.sede || '—'}</td>
                  <td className="num">{num(lotesEn(b.nombre))}</td>
                  <td className="num">{money(valor(b.nombre))}</td>
                  <td>{b.activa !== false ? <Chip tone="green" dot>Activa</Chip> : <Chip tone="muted">Inactiva</Chip>}</td>
                  <td className="acts">{puede('config') && <Btn variant="ghost" size="sm" icon={Pencil} onClick={() => setEditar(b)} title="Editar" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty icon={Warehouse} title="Sin bodegas" text="Cree la bodega principal." />}
      {editar && <FormBodega inicial={editar} onClose={() => setEditar(null)} />}
    </Panel>
  );
}
