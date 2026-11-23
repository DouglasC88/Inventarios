import { useState } from 'react';
import { Plus, Snowflake, Thermometer } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { Btn, Chip, Empty, Errores, Field, Kpi, Modal, Nota, Panel } from '../components/ui.jsx';
import { fechaHora, num } from '../format.js';

function NuevaLectura({ onClose }) {
  const { db, commit, toast } = useStore();
  const ahora = new Date();
  const local = new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [f, setF] = useState({ fecha: local, ubicacion: db.config.ubicaciones.find((u) => /nevera|frío|frio/i.test(u)) || db.config.ubicaciones[0], temp: '', responsable: db.config.usuario, nota: '' });
  const [err, setErr] = useState([]);
  const set = (k) => (e) => setF((x) => Object.assign({}, x, { [k]: e.target.value }));
  const guardar = () => {
    const e = [];
    if (f.temp === '' || !isFinite(Number(f.temp))) e.push('Escriba la temperatura.');
    if (!f.fecha) e.push('Indique fecha y hora.');
    if (e.length) return setErr(e);
    const t = Object.assign({ id: C.nuevoId() }, f, { temp: Number(f.temp) });
    commit((d) => { d.temperaturas.push(t); }, 'Lectura de temperatura', t.ubicacion + ' · ' + t.temp + ' °C');
    toast(C.tempEnRango(t, db.config) ? 'Lectura registrada' : 'Lectura fuera de rango: evalúe el producto y notifique si aplica', C.tempEnRango(t, db.config) ? 'ok' : 'error');
    onClose();
  };
  return (
    <Modal open title="Registrar temperatura" icon={Thermometer} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancelar</Btn><Btn variant="primary" onClick={guardar}>Registrar</Btn></>}>
      <Errores lista={err} />
      <div className="form-grid">
        <Field label="Fecha y hora"><input className="input" type="datetime-local" value={f.fecha} onChange={set('fecha')} /></Field>
        <Field label="Ubicación"><select className="select input" value={f.ubicacion} onChange={set('ubicacion')}>{db.config.ubicaciones.map((u) => <option key={u}>{u}</option>)}</select></Field>
        <Field label="Temperatura (°C)" hint={'Rango permitido ' + db.config.frio.min + ' a ' + db.config.frio.max + ' °C'}><input className="input" type="number" step="0.1" value={f.temp} onChange={set('temp')} autoFocus /></Field>
        <Field label="Responsable"><input className="input" value={f.responsable} onChange={set('responsable')} /></Field>
        <Field label="Observaciones" full><input className="input" value={f.nota} onChange={set('nota')} /></Field>
      </div>
    </Modal>
  );
}

export default function Frio() {
  const { db, hoy } = useStore();
  const [nueva, setNueva] = useState(false);
  const lista = db.temperaturas.slice().sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  const ult30 = lista.filter((t) => t.fecha.slice(0, 10) >= C.addDays(hoy, -30));
  const fuera = ult30.filter((t) => !C.tempEnRango(t, db.config));
  const productos = db.productos.filter((p) => p.cadenaFrio && p.activo !== false);
  const temps = ult30.slice(0, 30).reverse();
  const min = Math.min(db.config.frio.min - 2, ...temps.map((t) => t.temp));
  const max = Math.max(db.config.frio.max + 2, ...temps.map((t) => t.temp));
  const W = 640, H = 160, X = (i) => 30 + (i * (W - 50)) / Math.max(1, temps.length - 1), Y = (v) => 14 + ((max - v) * (H - 34)) / (max - min || 1);

  return (
    <div className="stack">
      <div className="grid g-kpi">
        <Kpi label="Productos con cadena de frío" value={productos.length} sub={productos.map((p) => p.codigo).join(', ') || 'Ninguno'} tone="cyan" icon={Snowflake} />
        <Kpi label="Lecturas 30 días" value={ult30.length} sub={'Rango ' + db.config.frio.min + ' a ' + db.config.frio.max + ' °C'} tone="violet" />
        <Kpi label="Fuera de rango" value={fuera.length} sub="Requieren evaluación" tone={fuera.length ? 'magenta' : 'green'} />
      </div>
      <Panel title="Cadena de frío" icon={Thermometer} sub="Registro de temperaturas. Si se rompe la cadena de frío, el prestador notifica al INVIMA (Res. 3100 de 2019)."
        actions={<Btn variant="primary" icon={Plus} onClick={() => setNueva(true)}>Registrar lectura</Btn>}>
        {temps.length > 1 && (
          <div className="tbl-wrap" style={{ padding: 12, marginBottom: 14 }}>
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Temperaturas de los últimos 30 días">
              <rect x="30" y={Y(db.config.frio.max)} width={W - 50} height={Y(db.config.frio.min) - Y(db.config.frio.max)} fill="rgba(43,245,160,0.08)" stroke="rgba(43,245,160,0.35)" strokeDasharray="4 4" />
              <text x="4" y={Y(db.config.frio.max) + 4} fill="#8aa2c8" fontSize="10">{db.config.frio.max}°</text>
              <text x="4" y={Y(db.config.frio.min) + 4} fill="#8aa2c8" fontSize="10">{db.config.frio.min}°</text>
              <polyline fill="none" stroke="#22e3ff" strokeWidth="2" points={temps.map((t, i) => X(i) + ',' + Y(t.temp)).join(' ')} style={{ filter: 'drop-shadow(0 0 6px rgba(34,227,255,0.8))' }} />
              {temps.map((t, i) => <circle key={t.id} cx={X(i)} cy={Y(t.temp)} r="4" fill={C.tempEnRango(t, db.config) ? '#22e3ff' : '#ff3d9a'}><title>{fechaHora(t.fecha)} · {t.temp} °C</title></circle>)}
            </svg>
          </div>
        )}
        {lista.length ? (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Fecha y hora</th><th>Ubicación</th><th className="num">Temperatura</th><th>Estado</th><th>Responsable</th><th>Observaciones</th></tr></thead>
              <tbody>
                {lista.map((t) => (
                  <tr key={t.id}>
                    <td>{fechaHora(t.fecha)}</td><td>{t.ubicacion}</td><td className="num">{num(t.temp)} °C</td>
                    <td>{C.tempEnRango(t, db.config) ? <Chip tone="green" dot>En rango</Chip> : <Chip tone="magenta" dot>Fuera de rango</Chip>}</td>
                    <td>{t.responsable}</td><td className="small muted">{t.nota}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty icon={Thermometer} title="Sin lecturas" text="Registre la primera lectura de temperatura." />}
      </Panel>
      <Nota>Una ruptura de cadena de frío puede obligar a dar de baja el producto afectado (causa "Ruptura de cadena de frío" en Ajustes y bajas).</Nota>
      {nueva && <NuevaLectura onClose={() => setNueva(false)} />}
    </div>
  );
}
