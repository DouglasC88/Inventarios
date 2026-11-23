import { useState } from 'react';
import { FolderTree, Pencil, Plus, Trash2 } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { Btn, Chip, Empty, Errores, Field, Modal, Nota, Panel, SearchBox } from '../components/ui.jsx';
import Combo from '../components/Combo.jsx';
import { money, num } from '../format.js';

function FormGrupo({ inicial, onClose }) {
  const { db, commit, toast } = useStore();
  const [f, setF] = useState(() => Object.assign({ codigo: '', nombre: '', descripcion: '', parentId: '' }, inicial || {}));
  const [err, setErr] = useState([]);
  const set = (k) => (e) => setF((x) => Object.assign({}, x, { [k]: e.target.value }));
  const prohibidos = f.id ? C.gruposDescendientes(db, f.id) : new Set();
  const padres = [{ value: '', label: 'Ninguno: es una LÍNEA (primer nivel)', sub: 'Nivel 1' },
    ...C.arbolGrupos(db).filter((g) => !prohibidos.has(g.id) && g.nivel < 3).map((g) => ({ value: g.id, label: ' '.repeat(g.nivel - 1) + g.codigo + ' · ' + g.nombre, sub: 'El nuevo será ' + (g.nivel === 1 ? 'GRUPO' : 'SUBGRUPO') + ' de ' + g.ruta, search: g.ruta }))];
  const nivel = f.parentId ? Math.min(3, C.nivelGrupo(db, db.grupos.find((g) => g.id === f.parentId)) + 1) : 1;
  const usados = f.id ? db.productos.filter((p) => p.grupoId === f.id).length : 0;
  const hijos = f.id ? db.grupos.filter((g) => g.parentId === f.id).length : 0;
  const guardar = () => {
    const e = [];
    const codigo = f.codigo.trim().toUpperCase();
    if (!codigo) e.push('El código es obligatorio.');
    if (!f.nombre.trim()) e.push('El nombre es obligatorio.');
    if (db.grupos.some((g) => g.id !== f.id && String(g.codigo).toUpperCase() === codigo)) e.push('Ya existe una clasificación con ese código.');
    if (e.length) return setErr(e);
    const g = Object.assign({}, f, { codigo, nombre: f.nombre.trim(), descripcion: f.descripcion.trim() });
    const nuevo = !g.id;
    if (nuevo) g.id = C.nuevoId();
    commit((d) => { const i = d.grupos.findIndex((x) => x.id === g.id); if (i >= 0) d.grupos[i] = g; else d.grupos.push(g); }, nuevo ? 'Clasificación creada' : 'Clasificación modificada', g.codigo + ' · ' + g.nombre);
    const fem = nivel === 1;
    toast(C.NIVELES_GRUPO[nivel] + (nuevo ? (fem ? ' creada' : ' creado') : (fem ? ' actualizada' : ' actualizado')) + ': ' + g.nombre);
    onClose();
  };
  const eliminar = () => {
    if (usados || hijos) return setErr(['No se puede eliminar: tiene ' + (hijos ? hijos + ' subclasificación(es)' : '') + (hijos && usados ? ' y ' : '') + (usados ? usados + ' producto(s)' : '') + '.']);
    commit((d) => { d.grupos = d.grupos.filter((x) => x.id !== f.id); }, 'Clasificación eliminada', f.codigo);
    toast('Eliminado');
    onClose();
  };
  return (
    <Modal open title={(f.id ? 'Editar ' : 'Nueva ') + C.NIVELES_GRUPO[nivel].toLowerCase()} icon={FolderTree} onClose={onClose}
      footer={<>{f.id && <Btn variant="danger" icon={Trash2} onClick={eliminar}>Eliminar</Btn>}<span style={{ flex: 1 }} /><Btn onClick={onClose}>Cancelar</Btn><Btn variant="primary" onClick={guardar}>Guardar</Btn></>}>
      <Errores lista={err} />
      <div className="form-grid">
        <Field label="Pertenece a" full hint="Deje vacío para crear una línea. Elija una línea para crear un grupo, o un grupo para crear un subgrupo.">
          <Combo value={f.parentId || ''} onChange={(v) => setF((x) => Object.assign({}, x, { parentId: v }))} options={padres} placeholder="Escriba la línea o grupo padre…" />
        </Field>
        <Field label="Nivel"><div className="input"><Chip tone={nivel === 1 ? 'violet' : nivel === 2 ? 'cyan' : 'green'}>{C.NIVELES_GRUPO[nivel]}</Chip></div></Field>
        <Field label="Código"><input className="input mono" value={f.codigo} onChange={set('codigo')} autoFocus placeholder={nivel === 1 ? 'Ej.: 08' : nivel === 2 ? 'Ej.: 0801' : 'Ej.: 080101'} /></Field>
        <Field label="Nombre" span><input className="input" value={f.nombre} onChange={set('nombre')} placeholder="Ej.: Endodoncia" /></Field>
        <Field label="Descripción" full><input className="input" value={f.descripcion} onChange={set('descripcion')} /></Field>
      </div>
    </Modal>
  );
}

export default function Grupos({ arg }) {
  const { db, state, puede, go } = useStore();
  const [editar, setEditar] = useState(arg === 'nuevo' ? {} : null);
  const [q, setQ] = useState('');
  const arbol = C.arbolGrupos(db);
  const datos = (id) => {
    const set = C.gruposDescendientes(db, id);
    const prods = db.productos.filter((p) => set.has(p.grupoId));
    return { prods: prods.length, valor: prods.reduce((s, p) => s + (state.prods[p.id] ? state.prods[p.id].value : 0), 0) };
  };
  const sinGrupo = db.productos.filter((p) => !C.rutaGrupo(db, p.grupoId));
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const filas = arbol.filter((g) => !q || norm(g.ruta + ' ' + g.codigo).includes(norm(q)));
  const total = db.productos.reduce((s, p) => s + (state.prods[p.id] ? state.prods[p.id].value : 0), 0);
  return (
    <Panel title="Clasificación de productos" icon={FolderTree}
      sub="Organice el inventario en tres niveles, como en A2 y SAP: Línea › Grupo › Subgrupo. Los reportes y filtros por una línea incluyen todos sus grupos y subgrupos."
      actions={puede('maestros') && <Btn variant="primary" icon={Plus} onClick={() => setEditar({})}>Nueva línea</Btn>}>
      <div className="toolbar"><SearchBox value={q} onChange={setQ} placeholder="Buscar línea, grupo o subgrupo" /></div>
      {filas.length ? (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Código</th><th>Clasificación</th><th>Nivel</th><th className="num">Productos</th><th className="num">Valor en inventario</th><th className="num">% del total</th><th /></tr></thead>
            <tbody>
              {filas.map((g) => {
                const d = datos(g.id);
                return (
                  <tr key={g.id} className={'arbol n' + g.nivel}>
                    <td className="mono">{g.codigo}</td>
                    <td style={{ paddingLeft: 12 + (g.nivel - 1) * 26 }}>
                      <a href="#" className={g.nivel === 1 ? 'strong' : ''} onClick={(e) => { e.preventDefault(); go('productos', 'grupo:' + g.id); }}>{g.nivel > 1 ? '└ ' : ''}{g.nombre}</a>
                      {g.descripcion && <div className="small muted">{g.descripcion}</div>}
                    </td>
                    <td><Chip tone={g.nivel === 1 ? 'violet' : g.nivel === 2 ? 'cyan' : 'green'}>{C.NIVELES_GRUPO[Math.min(g.nivel, 3)]}</Chip></td>
                    <td className="num">{num(d.prods)}</td>
                    <td className="num">{money(d.valor)}</td>
                    <td className="num">{total ? (d.valor / total * 100).toFixed(1) + ' %' : '—'}</td>
                    <td className="acts">
                      {puede('maestros') && g.nivel < 3 && <Btn variant="ghost" size="sm" icon={Plus} onClick={() => setEditar({ parentId: g.id })}>{g.nivel === 1 ? 'Grupo' : 'Subgrupo'}</Btn>}
                      {puede('maestros') && <Btn variant="ghost" size="sm" icon={Pencil} onClick={() => setEditar(db.grupos.find((x) => x.id === g.id))} title="Editar" />}
                    </td>
                  </tr>
                );
              })}
              {sinGrupo.length > 0 && !q && (
                <tr><td className="mono">—</td><td><a href="#" onClick={(e) => { e.preventDefault(); go('productos', 'grupo:sin'); }}>Sin clasificar</a></td><td /><td className="num">{num(sinGrupo.length)}</td><td className="num">{money(sinGrupo.reduce((s, p) => s + (state.prods[p.id] ? state.prods[p.id].value : 0), 0))}</td><td /><td /></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : <Empty icon={FolderTree} title="Sin clasificación" text="Cree la primera línea de productos." />}
      <div style={{ marginTop: 14 }}><Nota>Ejemplo: Línea "Operatoria y restauración" › Grupo "Resinas y adhesivos" › Subgrupo "Resinas compuestas". Asigne a cada producto el nivel más específico.</Nota></div>
      {editar && <FormGrupo inicial={editar} onClose={() => setEditar(null)} />}
    </Panel>
  );
}
