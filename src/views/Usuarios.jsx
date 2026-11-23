import { useState } from 'react';
import { KeyRound, Pencil, Plus, UsersRound } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { Btn, Chip, Empty, Errores, Field, Modal, Nota, Panel } from '../components/ui.jsx';

const PERM_TEXTO = {
  admin: 'Todo, incluidos usuarios, configuración e importación.',
  supervisor: 'Operación completa, ajustes, bajas, conteos, cierres y anulaciones.',
  almacenista: 'Entradas, salidas, traslados, devoluciones, órdenes, requisiciones y maestros. No ajusta ni cierra.',
  consultorio: 'Salidas desde su bodega, requisiciones y cadena de frío.',
  consulta: 'Solo lectura y reportes (contador, revisor fiscal o auditor).'
};

function FormUsuario({ inicial, onClose }) {
  const { db, commit, toast, usuario: actual, ingresar } = useStore();
  const [f, setF] = useState(() => Object.assign({ usuario: '', nombre: '', rol: 'almacenista', bodega: '', activo: true, pin: '', pin2: '' }, inicial || {}, { pin: '', pin2: '' }));
  const [err, setErr] = useState([]);
  const set = (k) => (e) => setF((x) => Object.assign({}, x, { [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const guardar = () => {
    const e = [];
    const usuario = f.usuario.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,30}$/.test(usuario)) e.push('El usuario debe tener de 3 a 30 letras, números, punto o guion, sin espacios.');
    if (!f.nombre.trim()) e.push('Escriba el nombre.');
    if (db.usuarios.some((u) => u.id !== f.id && u.usuario === usuario)) e.push('Ese usuario ya existe.');
    if (!f.id && !f.pin) e.push('Asigne un PIN.');
    if (f.pin && !/^\d{4,8}$/.test(f.pin)) e.push('El PIN debe tener de 4 a 8 dígitos.');
    if (f.pin !== f.pin2) e.push('Los PIN no coinciden.');
    if (f.rol === 'consultorio' && !f.bodega) e.push('Asigne la bodega o consultorio del usuario.');
    if (!db.usuarios.length && f.rol !== 'admin') e.push('El primer usuario debe ser administrador.');
    const otrosAdmin = db.usuarios.filter((u) => u.id !== f.id && u.rol === 'admin' && u.activo !== false).length;
    if ((f.rol !== 'admin' || !f.activo) && inicial && inicial.rol === 'admin' && !otrosAdmin) e.push('Debe quedar al menos un administrador activo.');
    if (e.length) return setErr(e);
    const u = { id: f.id || C.nuevoId(), usuario, nombre: f.nombre.trim(), rol: f.rol, bodega: f.rol === 'consultorio' ? f.bodega : '', activo: !!f.activo, pinHash: f.pin ? C.hashPin(usuario, f.pin) : f.pinHash };
    if (!f.pin && inicial && inicial.usuario !== usuario) return setErr(['Si cambia el nombre de usuario, asigne de nuevo el PIN.']);
    commit((d) => { const i = d.usuarios.findIndex((x) => x.id === u.id); if (i >= 0) d.usuarios[i] = u; else d.usuarios.push(u); }, f.id ? 'Usuario modificado' : 'Usuario creado', u.usuario + ' · ' + C.ROLES[u.rol]);
    toast('Usuario guardado');
    if (!actual && !db.usuarios.some((x) => x.activo !== false)) {
      ingresar(u);
      toast('Desde ahora el sistema pide ingreso con usuario y PIN');
    }
    onClose();
  };
  return (
    <Modal open title={f.id ? 'Editar usuario' : 'Nuevo usuario'} icon={UsersRound} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancelar</Btn><Btn variant="primary" onClick={guardar}>Guardar</Btn></>}>
      <Errores lista={err} />
      <div className="form-grid">
        <Field label="Usuario"><input className="input mono" value={f.usuario} onChange={set('usuario')} autoFocus autoComplete="off" /></Field>
        <Field label="Nombre completo"><input className="input" value={f.nombre} onChange={set('nombre')} /></Field>
        <Field label="Rol" hint={PERM_TEXTO[f.rol]}>
          <select className="select input" value={f.rol} onChange={set('rol')}>{Object.entries(C.ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Field>
        {f.rol === 'consultorio' && (
          <Field label="Bodega o consultorio">
            <select className="select input" value={f.bodega} onChange={set('bodega')}><option value="">Seleccione…</option>{db.config.ubicaciones.map((b) => <option key={b}>{b}</option>)}</select>
          </Field>
        )}
        <Field label={f.id ? 'Nuevo PIN (opcional)' : 'PIN'}><input className="input mono" type="password" inputMode="numeric" value={f.pin} onChange={set('pin')} autoComplete="new-password" /></Field>
        <Field label="Confirmar PIN"><input className="input mono" type="password" inputMode="numeric" value={f.pin2} onChange={set('pin2')} autoComplete="new-password" /></Field>
        <Field label="Estado"><label className="check"><input type="checkbox" checked={!!f.activo} onChange={set('activo')} /> Usuario activo</label></Field>
      </div>
    </Modal>
  );
}

export default function Usuarios() {
  const { db, usuario } = useStore();
  const [editar, setEditar] = useState(null);
  return (
    <div className="stack">
      <Panel title="Usuarios y roles" icon={UsersRound} actions={<Btn variant="primary" icon={Plus} onClick={() => setEditar({})}>Nuevo usuario</Btn>}
        sub="Cada documento y cada acción de la auditoría queda con el nombre del usuario que la hizo.">
        {db.usuarios.length ? (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Bodega</th><th>Estado</th><th /></tr></thead>
              <tbody>
                {db.usuarios.map((u) => (
                  <tr key={u.id}>
                    <td className="mono">{u.usuario}{usuario && usuario.id === u.id ? ' (usted)' : ''}</td><td>{u.nombre}</td>
                    <td><Chip tone={u.rol === 'admin' ? 'magenta' : u.rol === 'supervisor' ? 'violet' : u.rol === 'consulta' ? 'muted' : 'cyan'}>{C.ROLES[u.rol]}</Chip></td>
                    <td>{u.bodega || '—'}</td>
                    <td>{u.activo !== false ? <Chip tone="green" dot>Activo</Chip> : <Chip tone="muted">Inactivo</Chip>}</td>
                    <td className="acts"><Btn variant="ghost" size="sm" icon={Pencil} onClick={() => setEditar(u)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty icon={KeyRound} title="Sin usuarios" text="Mientras no haya usuarios, el sistema abre sin pedir ingreso. Cree un administrador para activar el control de acceso." />}
      </Panel>
      <Panel title="Permisos por rol" icon={KeyRound}>
        <div className="tbl-wrap">
          <table className="tbl"><tbody>{Object.entries(C.ROLES).map(([k, v]) => <tr key={k}><td className="strong">{v}</td><td>{PERM_TEXTO[k]}</td></tr>)}</tbody></table>
        </div>
        <div style={{ marginTop: 14 }}>
          <Nota>En esta versión los datos y los usuarios viven en el navegador del equipo. El control de acceso evita errores de operación, pero la seguridad completa (contraseñas en servidor, varios equipos) llega con la versión con base de datos.</Nota>
        </div>
      </Panel>
      {editar && <FormUsuario inicial={editar} onClose={() => setEditar(null)} />}
    </div>
  );
}
