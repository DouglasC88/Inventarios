import { useRef, useState } from 'react';
import { Database, Download, History, RotateCcw, Save, Settings, Upload } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { crearDemo } from '../core/demo.js';
import { Btn, Errores, Field, Modal, Nota, Panel } from '../components/ui.jsx';
import { descargar, fechaHora } from '../format.js';

export default function Configuracion() {
  const { db, hoy, commit, reemplazar, toast } = useStore();
  const cfg = db.config;
  const year = C.yearOf(hoy);
  const [f, setF] = useState(() => ({
    nombre: cfg.empresa.nombre, nit: cfg.empresa.nit, grupo: cfg.empresa.grupo, usuario: cfg.usuario,
    rojo: cfg.semaforo.rojo, amarillo: cfg.semaforo.amarillo, invimaAviso: cfg.invimaAviso,
    limiteFaltantes: cfg.limiteFaltantes, frioMin: cfg.frio.min, frioMax: cfg.frio.max,
    ubicaciones: cfg.ubicaciones.join(', '),
    metodoActual: C.metodoDe(cfg, hoy + ''), metodoSiguiente: (cfg.metodos || {})[String(year + 1)] || C.metodoDe(cfg, hoy)
  }));
  const [err, setErr] = useState([]);
  const [confirmar, setConfirmar] = useState(null);
  const archivo = useRef(null);
  const set = (k) => (e) => setF((x) => Object.assign({}, x, { [k]: e.target.value }));
  const movsAnio = db.movimientos.some((m) => !m.anulado && C.yearOf(m.fecha) === year);

  const guardar = () => {
    const e = [];
    if (!f.nombre.trim()) e.push('El nombre de la empresa es obligatorio.');
    if (!(Number(f.rojo) > 0) || !(Number(f.amarillo) > Number(f.rojo))) e.push('El umbral amarillo debe ser mayor que el rojo y ambos positivos.');
    if (!(Number(f.frioMax) > Number(f.frioMin))) e.push('El máximo de temperatura debe ser mayor que el mínimo.');
    const ubic = f.ubicaciones.split(',').map((s) => s.trim()).filter(Boolean);
    if (!ubic.length) e.push('Defina al menos una ubicación.');
    if (movsAnio && f.metodoActual !== C.metodoDe(cfg, hoy)) e.push('El año ' + year + ' ya tiene movimientos: el método debe ser uniforme todo el año. Programe el cambio para ' + (year + 1) + '.');
    if (e.length) return setErr(e);
    commit((d) => {
      d.config.empresa = { nombre: f.nombre.trim(), nit: f.nit.trim(), grupo: f.grupo };
      d.config.usuario = f.usuario.trim() || 'Usuario';
      d.config.semaforo = { rojo: Number(f.rojo), amarillo: Number(f.amarillo) };
      d.config.invimaAviso = Number(f.invimaAviso) || 0;
      d.config.limiteFaltantes = Number(f.limiteFaltantes) || 0;
      d.config.frio = { min: Number(f.frioMin), max: Number(f.frioMax) };
      d.config.ubicaciones = ubic;
      d.config.metodos = Object.assign({}, d.config.metodos);
      // Los años anteriores con movimientos conservan el método con el que se valoraron.
      const anios = new Set(d.movimientos.map((m) => C.yearOf(m.fecha)));
      anios.forEach((y) => { if (y < year && !d.config.metodos[String(y)]) d.config.metodos[String(y)] = d.config.metodoDefault; });
      d.config.metodos[String(year)] = f.metodoActual;
      d.config.metodos[String(year + 1)] = f.metodoSiguiente;
      d.config.metodoDefault = f.metodoSiguiente;
    }, 'Configuración actualizada');
    setErr([]);
    toast('Configuración guardada');
  };

  const exportar = () => descargar('nova-respaldo-' + hoy + '.json', JSON.stringify(db, null, 2), 'application/json');
  const importar = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    file.text().then((txt) => {
      const d = JSON.parse(txt);
      if (!d || d.version !== 1 || !Array.isArray(d.movimientos)) throw new Error('formato');
      reemplazar(d, 'Respaldo importado');
      toast('Respaldo importado');
    }).catch(() => toast('El archivo no es un respaldo válido de NOVA', 'error'));
    e.target.value = '';
  };
  const ejecutar = () => {
    if (confirmar === 'demo') { reemplazar(crearDemo(hoy), 'Datos de demostración restablecidos'); toast('Demostración restablecida'); }
    if (confirmar === 'vacio') {
      const v = C.dbVacia();
      v.config = Object.assign(v.config, { empresa: db.config.empresa, usuario: db.config.usuario });
      reemplazar(v, 'Base reiniciada en blanco');
      toast('Base en blanco lista');
    }
    setConfirmar(null);
  };

  return (
    <div className="stack">
      <Panel title="Empresa y reglas" icon={Settings} actions={<Btn variant="primary" icon={Save} onClick={guardar}>Guardar</Btn>}>
        <Errores lista={err} />
        <div className="form-grid">
          <Field label="Razón social"><input className="input" value={f.nombre} onChange={set('nombre')} /></Field>
          <Field label="NIT"><input className="input mono" value={f.nit} onChange={set('nit')} /></Field>
          <Field label="Grupo NIIF" hint="Decreto 2420 de 2015">
            <select className="select input" value={f.grupo} onChange={set('grupo')}>
              <option value="1">Grupo 1 · NIIF plenas (NIC 2)</option>
              <option value="2">Grupo 2 · NIIF para Pymes (Sección 13)</option>
              <option value="3">Grupo 3 · Microempresas (contabilidad simplificada)</option>
            </select>
          </Field>
          <Field label="Usuario actual" hint="Queda en cada documento y en la auditoría"><input className="input" value={f.usuario} onChange={set('usuario')} /></Field>
        </div>
        <div className="section-title">Método de valoración (ET art. 65)</div>
        <div className="form-grid">
          <Field label={'Año ' + year} hint={movsAnio ? 'Bloqueado: el año ya tiene movimientos.' : 'Puede cambiarse mientras el año no tenga movimientos.'}>
            <select className="select input" value={f.metodoActual} onChange={set('metodoActual')} disabled={movsAnio}>
              {Object.entries(C.METODOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label={'Año ' + (year + 1) + ' en adelante'}>
            <select className="select input" value={f.metodoSiguiente} onChange={set('metodoSiguiente')}>
              {Object.entries(C.METODOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
        </div>
        <div className="section-title">Alertas y controles</div>
        <div className="form-grid">
          <Field label="Semáforo rojo (días)"><input className="input" type="number" min="1" value={f.rojo} onChange={set('rojo')} /></Field>
          <Field label="Semáforo amarillo (días)"><input className="input" type="number" min="1" value={f.amarillo} onChange={set('amarillo')} /></Field>
          <Field label="Aviso de registro INVIMA (días)"><input className="input" type="number" min="0" value={f.invimaAviso} onChange={set('invimaAviso')} /></Field>
          <Field label="Límite de faltantes (%)" hint="ET art. 64"><input className="input" type="number" min="0" step="0.1" value={f.limiteFaltantes} onChange={set('limiteFaltantes')} /></Field>
          <Field label="Cadena de frío mínimo (°C)"><input className="input" type="number" step="0.1" value={f.frioMin} onChange={set('frioMin')} /></Field>
          <Field label="Cadena de frío máximo (°C)"><input className="input" type="number" step="0.1" value={f.frioMax} onChange={set('frioMax')} /></Field>
          <Field label="Ubicaciones" full hint="Separadas por coma"><input className="input" value={f.ubicaciones} onChange={set('ubicaciones')} /></Field>
        </div>
      </Panel>

      <Panel title="Datos" icon={Database}>
        <Nota>Los datos se guardan en este navegador. Descargue un respaldo con frecuencia; para trabajar en varios equipos a la vez se necesita la versión con servidor.</Nota>
        <div className="toolbar" style={{ marginTop: 14 }}>
          <Btn icon={Download} onClick={exportar}>Descargar respaldo</Btn>
          <Btn icon={Upload} onClick={() => archivo.current && archivo.current.click()}>Importar respaldo</Btn>
          <input ref={archivo} type="file" accept="application/json,.json" hidden onChange={importar} />
          <Btn icon={RotateCcw} onClick={() => setConfirmar('demo')}>Restablecer demostración</Btn>
          <Btn variant="danger" icon={Database} onClick={() => setConfirmar('vacio')}>Empezar en blanco</Btn>
        </div>
      </Panel>

      <Panel title="Auditoría" icon={History} sub="Últimas 200 acciones registradas.">
        <div className="tbl-wrap" style={{ maxHeight: 420 }}>
          <table className="tbl">
            <thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr></thead>
            <tbody>
              {db.auditoria.slice(0, 200).map((a, i) => (
                <tr key={i}><td className="small">{fechaHora(a.ts)}</td><td>{a.usuario}</td><td className="strong">{a.accion}</td><td className="small muted">{a.detalle}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {confirmar && (
        <Modal open title="Confirmar" icon={RotateCcw} onClose={() => setConfirmar(null)}
          footer={<><Btn onClick={() => setConfirmar(null)}>Cancelar</Btn><Btn variant="danger" onClick={ejecutar}>Sí, reemplazar los datos</Btn></>}>
          <p>{confirmar === 'demo' ? 'Se reemplazarán todos los datos de este navegador por la demostración.' : 'Se borrarán productos, proveedores y movimientos de este navegador. La configuración de la empresa se conserva.'}</p>
          <p className="muted">Descargue un respaldo antes si necesita conservar la información.</p>
        </Modal>
      )}
    </div>
  );
}
