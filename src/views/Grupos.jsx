import { useState } from 'react';
import { FolderTree, Pencil, Plus, Trash2 } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { Btn, Empty, Errores, Field, Modal, Panel } from '../components/ui.jsx';
import { money, num } from '../format.js';

function FormGrupo({ inicial, onClose }) {
  const { db, commit, toast } = useStore();
  const [f, setF] = useState(() => Object.assign({ codigo: '', nombre: '', descripcion: '' }, inicial || {}));
  const [err, setErr] = useState([]);
  const set = (k) => (e) => setF((x) => Object.assign({}, x, { [k]: e.target.value }));
  const usados = f.id ? db.productos.filter((p) => p.grupoId === f.id).length : 0;
  const guardar = () => {
    const e = [];
    const codigo = f.codigo.trim().toUpperCase();
    if (!codigo) e.push('El código es obligatorio.');
    if (!f.nombre.trim()) e.push('El nombre es obligatorio.');
    if (db.grupos.some((g) => g.id !== f.id && g.codigo.toUpperCase() === codigo)) e.push('Ya existe un grupo con ese código.');
    if (e.length) return setErr(e);
    const g = Object.assign({}, f, { codigo, nombre: f.nombre.trim(), descripcion: f.descripcion.trim() });
    const nuevo = !g.id;
    if (nuevo) g.id = C.nuevoId();
    commit((d) => { const i = d.grupos.findIndex((x) => x.id === g.id); if (i >= 0) d.grupos[i] = g; else d.grupos.push(g); }, nuevo ? 'Grupo creado' : 'Grupo modificado', g.codigo + ' · ' + g.nombre);
    toast(nuevo ? 'Grupo creado' : 'Grupo actualizado');
    onClose();
  };
  const eliminar = () => {
    if (usados) return setErr(['El grupo tiene ' + usados + ' producto(s). Cámbielos de grupo antes de eliminarlo.']);
    commit((d) => { d.grupos = d.grupos.filter((x) => x.id !== f.id); }, 'Grupo eliminado', f.codigo);
    toast('Grupo eliminado');
    onClose();
  };
  return (
    <Modal open title={f.id ? 'Editar grupo' : 'Nuevo grupo de productos'} icon={FolderTree} onClose={onClose}
      footer={<>{f.id && <Btn variant="danger" icon={Trash2} onClick={eliminar}>Eliminar</Btn>}<span style={{ flex: 1 }} /><Btn onClick={onClose}>Cancelar</Btn><Btn variant="primary" onClick={guardar}>Guardar</Btn></>}>
      <Errores lista={err} />
      <div className="form-grid">
        <Field label="Código"><input className="input mono" value={f.codigo} onChange={set('codigo')} autoFocus placeholder="Ej.: END" /></Field>
        <Field label="Nombre" span><input className="input" value={f.nombre} onChange={set('nombre')} placeholder="Ej.: Endodoncia" /></Field>
        <Field label="Descripción" full><input className="input" value={f.descripcion} onChange={set('descripcion')} /></Field>
      </div>
    </Modal>
  );
}

export default function Grupos({ arg }) {
  const { db, state, puede, go } = useStore();
  const [editar, setEditar] = useState(arg === 'nuevo' ? {} : null);
  const sinGrupo = db.productos.filter((p) => !p.grupoId || !db.grupos.some((g) => g.id === p.grupoId));
  const filas = [...db.grupos.map((g) => ({ g, prods: db.productos.filter((p) => p.grupoId === g.id) })), ...(sinGrupo.length ? [{ g: { id: '', codigo: '—', nombre: 'Sin grupo' }, prods: sinGrupo }] : [])];
  const valor = (ps) => ps.reduce((s, p) => s + (state.prods[p.id] ? state.prods[p.id].value : 0), 0);
  return (
    <Panel title="Grupos de productos" icon={FolderTree}
      sub="Organice el inventario por líneas o familias (resinas, anestésicos, bioseguridad…). Los grupos sirven para filtrar productos y analizar valor y consumo."
      actions={puede('maestros') && <Btn variant="primary" icon={Plus} onClick={() => setEditar({})}>Nuevo grupo</Btn>}>
      {filas.length ? (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Código</th><th>Grupo</th><th>Descripción</th><th className="num">Productos</th><th className="num">Valor en inventario</th><th /></tr></thead>
            <tbody>
              {filas.map(({ g, prods }) => (
                <tr key={g.id || 'sin'}>
                  <td className="mono">{g.codigo}</td>
                  <td className="strong"><a href={'#/productos/grupo:' + (g.id || 'sin')} onClick={(e) => { e.preventDefault(); go('productos', 'grupo:' + (g.id || 'sin')); }}>{g.nombre}</a></td>
                  <td className="small muted">{g.descripcion || ''}</td>
                  <td className="num">{num(prods.length)}</td>
                  <td className="num">{money(valor(prods))}</td>
                  <td className="acts">{g.id && puede('maestros') && <Btn variant="ghost" size="sm" icon={Pencil} onClick={() => setEditar(g)} title="Editar" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty icon={FolderTree} title="Sin grupos" text="Cree el primer grupo de productos." />}
      {editar && <FormGrupo inicial={editar} onClose={() => setEditar(null)} />}
    </Panel>
  );
}
