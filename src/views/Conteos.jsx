import { useState } from 'react';
import { Ban, Check, ClipboardCheck, Eye, Plus, Save } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { Btn, Chip, Empty, Errores, Field, Modal, Nota, Panel } from '../components/ui.jsx';
import { nombreProducto, useRegistrar } from '../components/Movimientos.jsx';
import { fecha, num } from '../format.js';

function NuevoConteo({ onClose }) {
  const { db, state, hoy, commit, toast } = useStore();
  const { nombreUsuario } = useStore();
  const [f, setF] = useState({ fecha: hoy, categoria: 'todas', bodega: 'todas', anual: true, responsable: nombreUsuario });
  const [err, setErr] = useState([]);
  const set = (k) => (e) => setF((x) => Object.assign({}, x, { [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const crear = () => {
    const e = [];
    if (C.conteoAbierto(db)) e.push('Ya hay un conteo abierto.');
    const uc = C.ultimoCierre(db);
    if (uc && f.fecha <= uc.fecha) e.push('La fecha pertenece a un periodo cerrado.');
    if (f.fecha > hoy) e.push('La fecha no puede ser futura.');
    const lineas = C.crearConteo(db, state, f, hoy);
    if (!lineas.length) e.push('No hay lotes con existencia para contar.');
    if (f.anual && (f.categoria !== 'todas' || f.bodega !== 'todas')) e.push('El conteo anual debe incluir todas las categorías y bodegas.');
    if (e.length) return setErr(e);
    const numero = 'CF-' + String((db.seq.CF || 0) + 1).padStart(5, '0');
    commit((d) => {
      d.conteos.push(Object.assign({ id: C.nuevoId(), num: C.siguienteNumero(d, 'conteo'), estado: 'abierto', lineas, creado: new Date().toISOString() }, f));
    }, 'Conteo abierto', numero);
    toast(numero + ' abierto: los movimientos quedan bloqueados hasta aplicarlo');
    onClose();
  };
  return (
    <Modal open title="Nuevo conteo físico" icon={ClipboardCheck} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancelar</Btn><Btn variant="primary" onClick={crear}>Abrir conteo</Btn></>}>
      <Errores lista={err} />
      <div className="form-grid">
        <Field label="Fecha de corte"><input className="input" type="date" value={f.fecha} max={hoy} onChange={set('fecha')} /></Field>
        <Field label="Alcance">
          <select className="select input" value={f.categoria} onChange={set('categoria')}>
            <option value="todas">Todo el inventario</option>
            {Object.entries(C.CATEGORIAS).map(([k, v]) => <option key={k} value={k}>Solo {v.toLowerCase()}s</option>)}
          </select>
        </Field>
        <Field label="Bodega">
          <select className="select input" value={f.bodega} onChange={set('bodega')}>
            <option value="todas">Todas las bodegas</option>
            {db.config.ubicaciones.map((b) => <option key={b}>{b}</option>)}
          </select>
        </Field>
        <Field label="Responsable"><input className="input" value={f.responsable} onChange={set('responsable')} /></Field>
        <Field label="Tipo"><label className="check"><input type="checkbox" checked={f.anual} onChange={set('anual')} /> Conteo anual completo (C. de Co. art. 52)</label></Field>
      </div>
      <Nota>Mientras el conteo esté abierto no se pueden registrar entradas, salidas ni ajustes.</Nota>
    </Modal>
  );
}

function DetalleConteo({ conteo, onClose }) {
  const { db, state, commit, toast, puede } = useStore();
  const registrar = useRegistrar();
  const [cont, setCont] = useState(() => conteo.lineas.map((l) => (l.contado === '' || l.contado === null || l.contado === undefined ? '' : String(l.contado))));
  const [acta, setActa] = useState('');
  const [autoriza, setAutoriza] = useState('');
  const [err, setErr] = useState([]);
  const abierto = conteo.estado === 'abierto';
  const filas = C.diferenciasConteo(Object.assign({}, conteo, { lineas: conteo.lineas.map((l, i) => Object.assign({}, l, { contado: cont[i] })) }), state);
  const pendientes = filas.filter((f) => f.contado === null).length;
  const conDif = filas.filter((f) => f.diferencia);

  const guardarAvance = () => {
    commit((d) => {
      const c = d.conteos.find((x) => x.id === conteo.id);
      c.lineas.forEach((l, i) => { l.contado = cont[i]; });
    }, 'Conteo guardado', conteo.num);
    toast('Avance guardado');
  };
  const anular = () => {
    commit((d) => { const c = d.conteos.find((x) => x.id === conteo.id); c.estado = 'anulado'; }, 'Conteo anulado', conteo.num);
    toast(conteo.num + ' anulado');
    onClose();
  };
  const aplicar = () => {
    if (pendientes) return setErr(['Faltan ' + pendientes + ' líneas por contar.']);
    if (!conDif.length) {
      commit((d) => {
        const c = d.conteos.find((x) => x.id === conteo.id);
        c.lineas.forEach((l, i) => { l.contado = cont[i]; });
        c.estado = 'aplicado'; c.aplicado = new Date().toISOString();
      }, 'Conteo aplicado sin diferencias', conteo.num);
      toast(conteo.num + ' aplicado sin diferencias');
      return onClose();
    }
    commit((d) => { const c = d.conteos.find((x) => x.id === conteo.id); c.lineas.forEach((l, i) => { l.contado = cont[i]; }); }, 'Conteo guardado', conteo.num);
    const e = registrar({
      tipo: 'ajuste', fecha: conteo.fecha, acta, autoriza, conteoId: conteo.id, conteoNum: conteo.num,
      nota: 'Ajuste por conteo físico ' + conteo.num,
      lineas: conDif.map((f) => ({ productoId: f.productoId, bodega: f.bodega, lote: f.lote, vence: f.vence, cantidad: f.diferencia, causa: f.diferencia < 0 ? 'faltante' : 'sobrante' }))
    }, 'Conteo aplicado');
    if (e.length) return setErr(e);
    onClose();
  };

  return (
    <Modal open wide title={'Conteo ' + conteo.num} icon={ClipboardCheck} onClose={onClose}
      footer={abierto ? <>{puede('conteoAplicar') && <Btn variant="danger" icon={Ban} onClick={anular}>Anular conteo</Btn>}<span style={{ flex: 1 }} />{puede('conteoContar') && <Btn icon={Save} onClick={guardarAvance}>Guardar avance</Btn>}{puede('conteoAplicar') && <Btn variant="primary" icon={Check} onClick={aplicar}>Aplicar conteo</Btn>}</> : <Btn onClick={onClose}>Cerrar</Btn>}>
      <Errores lista={err} />
      <div className="kv">
        <div><span>Fecha de corte</span><b>{fecha(conteo.fecha)}</b></div>
        <div><span>Estado</span><b>{conteo.estado}</b></div>
        <div><span>Lotes</span><b>{filas.length}</b></div>
        <div><span>Pendientes</span><b>{pendientes}</b></div>
        <div><span>Con diferencia</span><b>{conDif.length}</b></div>
        {conteo.ajusteNum && <div><span>Ajuste generado</span><b>{conteo.ajusteNum}</b></div>}
      </div>
      <div className="tbl-wrap lines">
        <table className="tbl">
          <thead><tr><th>Producto</th><th>Bodega</th><th>Lote</th><th>Vence</th><th className="num">Sistema</th><th className="num">Contado</th><th className="num">Diferencia</th></tr></thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i}>
                <td>{nombreProducto(db, f.productoId)}</td>
                <td>{f.bodega}</td>
                <td className="mono">{f.lote}</td>
                <td>{fecha(f.vence)}</td>
                <td className="num">{num(abierto ? f.sistema : conteo.lineas[i].sistema)}</td>
                <td>{abierto
                  ? <input className="input num" type="number" min="0" value={cont[i]} onChange={(e) => setCont((c) => c.map((x, j) => (j === i ? e.target.value : x)))} style={{ width: 110, marginLeft: 'auto' }} />
                  : <div className="num">{num(conteo.lineas[i].contado)}</div>}
                </td>
                <td className={'num ' + (f.diferencia < 0 ? 'red-t' : f.diferencia > 0 ? 'green-t' : '')}>{f.diferencia === null ? '—' : num(f.diferencia)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {abierto && conDif.length > 0 && (
        <>
          <div className="section-title">Soporte del ajuste</div>
          <div className="form-grid">
            <Field label="Número de acta"><input className="input mono" value={acta} onChange={(e) => setActa(e.target.value)} /></Field>
            <Field label="Autoriza"><input className="input" value={autoriza} onChange={(e) => setAutoriza(e.target.value)} /></Field>
          </div>
        </>
      )}
    </Modal>
  );
}

export default function Conteos() {
  const { db, puede } = useStore();
  const [nuevo, setNuevo] = useState(false);
  const [ver, setVer] = useState(null);
  const lista = db.conteos.slice().reverse();
  const tono = { abierto: 'amber', aplicado: 'green', anulado: 'muted' };
  const actual = ver && db.conteos.find((c) => c.id === ver);
  return (
    <Panel title="Conteos físicos" icon={ClipboardCheck}
      sub="Inventario anual obligatorio y conteos cíclicos. Las diferencias generan un ajuste con su causa."
      actions={puede('conteoAbrir') && <Btn variant="primary" icon={Plus} onClick={() => setNuevo(true)}>Nuevo conteo</Btn>}>
      {lista.length ? (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Conteo</th><th>Fecha</th><th>Alcance</th><th>Tipo</th><th>Responsable</th><th>Estado</th><th className="num">Lotes</th><th /></tr></thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.id}>
                  <td className="mono">{c.num}</td>
                  <td>{fecha(c.fecha)}</td>
                  <td>{c.categoria === 'todas' ? 'Todas las categorías' : C.CATEGORIAS[c.categoria]}<div className="small muted">{!c.bodega || c.bodega === 'todas' ? 'Todas las bodegas' : c.bodega}</div></td>
                  <td>{c.anual ? <Chip tone="violet">Anual</Chip> : <Chip tone="cyan">Cíclico</Chip>}</td>
                  <td>{c.responsable}</td>
                  <td><Chip tone={tono[c.estado]} dot>{c.estado}</Chip></td>
                  <td className="num">{c.lineas.length}</td>
                  <td className="acts"><Btn variant="ghost" size="sm" icon={Eye} onClick={() => setVer(c.id)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty icon={ClipboardCheck} title="Sin conteos" text="Abra el conteo anual o un conteo cíclico." />}
      {nuevo && <NuevoConteo onClose={() => setNuevo(false)} />}
      {actual && <DetalleConteo key={actual.id + actual.estado} conteo={actual} onClose={() => setVer(null)} />}
    </Panel>
  );
}
