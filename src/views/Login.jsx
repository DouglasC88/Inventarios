import { useState } from 'react';
import { Hexagon, KeyRound, LogIn } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { USUARIOS_DEMO } from '../core/demo.js';
import { Btn, Errores } from '../components/ui.jsx';

export default function Login() {
  const { db, ingresar } = useStore();
  const [usuario, setUsuario] = useState('');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState([]);
  const [intentos, setIntentos] = useState(0);
  const demo = USUARIOS_DEMO.filter(([u, , , p]) => db.usuarios.some((x) => x.usuario === u && x.pinHash === C.hashPin(u, p)));

  const entrar = (e) => {
    e.preventDefault();
    if (intentos >= 5) return setErr(['Demasiados intentos. Recargue la página para intentar de nuevo.']);
    const u = db.usuarios.find((x) => x.usuario === usuario.trim().toLowerCase() && x.activo !== false);
    if (!u || u.pinHash !== C.hashPin(u.usuario, pin)) {
      setIntentos((n) => n + 1);
      setPin('');
      return setErr(['Usuario o PIN incorrecto.']);
    }
    ingresar(u);
  };

  return (
    <>
      <div className="cosmos" aria-hidden="true"><div className="aurora" /><div className="stars" /><div className="floor" /></div>
      <div className="login-wrap">
        <form className="panel login scan" onSubmit={entrar}>
          <div className="brand" style={{ justifyContent: 'center', padding: '4px 0 10px' }}>
            <div className="brand-mark"><Hexagon size={20} /></div>
            <div><div className="brand-name">NOV<span>A</span></div><div className="brand-sub">Inventario</div></div>
          </div>
          <p className="muted" style={{ textAlign: 'center', marginTop: 0 }}>{db.config.empresa.nombre}</p>
          <Errores lista={err} />
          <div className="field"><label>Usuario</label><input className="input mono" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoFocus autoComplete="username" /></div>
          <div className="field" style={{ marginTop: 12 }}><label>PIN</label><input className="input mono" type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} autoComplete="current-password" /></div>
          <Btn variant="primary" icon={LogIn} type="submit" className="login-btn">Ingresar</Btn>
          {demo.length > 0 && (
            <div className="login-demo">
              <div className="small muted" style={{ marginBottom: 6 }}><KeyRound size={12} /> Usuarios de demostración</div>
              {demo.map(([u, nombre, rol, p]) => (
                <button type="button" key={u} onClick={() => { setUsuario(u); setPin(p); }}>
                  <span className="mono">{u}</span> · {C.ROLES[rol]} · PIN {p}
                </button>
              ))}
            </div>
          )}
        </form>
      </div>
    </>
  );
}
