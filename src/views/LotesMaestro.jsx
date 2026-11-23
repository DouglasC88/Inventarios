import { useState } from 'react';
import { Lock, Pencil, Plus, ShieldCheck, ShieldAlert, Tags } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { Btn, Chip, Empty, Errores, Field, Modal, Nota, Panel, SearchBox, Tabs } from '../components/ui.jsx';
import { SelectProducto, nombreProducto } from '../components/Movimientos.jsx';
import { fecha, num, SEMAFORO } from '../format.js';

const TONO_ESTADO = { liberado: 'green', cuarentena: 'amber', bloqueado: 'magenta' };

function usadoEnMovimientos(db, productoId, lote) {
  const k = C.claveLote(productoId, lote);
  return db.movimientos.some((m) => !m.anulado && m.lineas.some((l) => C.claveLote(l.productoId, l.lote) === k));
}

function FormLote({ inicial, onClose }) {
  const { db, hoy, commit, toast } = useStore();
  const [f, setF] = useState(() => Object.assign({ productoId: '', lote: '', fabricado: '', vence: '', estado: 'liberado', nota: '' }, inicial || {}));
  const [err, setErr] = useState([]);
  const set = (k) => (e) => setF((x) => Object.assign({}, x, { [k]: e.target.value }));
  const usado = f.id ? usadoEnMovimientos(db, inicial.productoId, inicial.lote) : false;
  const guardar = () => {
    const e = [];
    if (!f.productoId) e.push('Seleccione el producto.');
    if (!String(f.lote).trim()) e.push('Escriba el número de lote tal como aparece en el empaque.');
    if (!C.isISODate(f.vence)) e.push('Indique la fecha de vencimiento.');
    if (f.fabricado && !C.isISODate(f.fabricado)) e.push('La fecha de fabricación no es válida.');
    if (f.fabricado && f.vence && f.fabricado >= f.vence) e.push('La fecha de fabricación debe ser anterior al vencimiento.');
    if (f.fabricado && f.fabricado > hoy) e.push('La fecha de fabricación no puede ser futura.');
    const otro = C.buscarLote(db, f.productoId, f.lote);
    if (otro && otro.id !== f.id) e.push('Ese lote ya está registrado para este producto.');
    if (e.length) return setErr(e);
    const l = Object.assign({}, f, { lote: String(f.lote).trim() });
    const nuevo = !l.id;
    if (nuevo) { l.id = C.nuevoId(); l.creado = new Date().toISOString(); l.origen = 'Registro manual'; }
    commit((d) => { const i = d.lotes.findIndex((x) => x.id === l.id); if (i >= 0) d.lotes[i] = l; else d.lotes.push(l); }, nuevo ? 'Lote creado' : 'Lote modificado', nombreProducto(db, l.productoId) + ' · ' + l.lote);
    toast(nuevo ? 'Lote ' + l.lote + ' creado' : 'Lote actualizado');
    onClose();
  };
  return (
    <Modal open title={f.id ? 'Editar lote ' + inicial.lote : 'Nuevo lote'} icon={Tags} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancelar</Btn><Btn variant="primary" onClick={guardar}>Guardar</Btn></>}>
      <Errores lista={err} />
      <div className="form-grid">
        <Field label="Producto" full>{usado ? <div className="input">{nombreProducto(db, f.productoId)}</div> : <SelectProducto value={f.productoId} onChange={(v) => setF((x) => Object.assign({}, x, { productoId: v }))} />}</Field>
        <Field label="Número de lote" hint="Tal como aparece en el empaque">{usado ? <div className="input mono">{f.lote}</div> : <input className="input mono" value={f.lote} onChange={set('lote')} />}</Field>
        <Field label="Fecha de fabricación"><input className="input" type="date" value={f.fabricado} max={hoy} onChange={set('fabricado')} /></Field>
        <Field label="Fecha de vencimiento" hint={usado ? 'El lote ya tiene movimientos: el vencimiento no se puede cambiar.' : 'Día, mes y año del empaque'}>
          <input className="input" type="date" value={f.vence} onChange={set('vence')} disabled={usado} />
        </Field>
        <Field label="Estado">
          <select className="select input" value={f.estado} onChange={set('estado')}>{Object.entries(C.ESTADOS_LOTE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Field>
        <Field label="Observación o motivo" full><input className="input" value={f.nota || f.motivo || ''} onChange={(e) => setF((x) => Object.assign({}, x, { nota: e.target.value, motivo: e.target.value }))} /></Field>
      </div>
      <Nota>Puede crear el lote antes de que llegue la mercancía (por ejemplo, con la información del proveedor). Si no lo crea aquí, el sistema lo registra solo al hacer la entrada.</Nota>
    </Modal>
  );
}

function CambiarEstado({ lote, onClose }) {
  const { db, commit, toast } = useStore();
  const [estado, setEstado] = useState(lote.estado === 'liberado' ? 'cuarentena' : 'liberado');
  const [motivo, setMotivo] = useState('');
  const [err, setErr] = useState([]);
  const guardar = () => {
    if (!motivo.trim()) return setErr(['Escriba el motivo del cambio de estado.']);
    commit((d) => { const l = d.lotes.find((x) => x.id === lote.id); l.estado = estado; l.motivo = motivo.trim(); l.nota = motivo.trim(); }, 'Estado de lote: ' + C.ESTADOS_LOTE[estado], nombreProducto(db, lote.productoId) + ' · ' + lote.lote + ' · ' + motivo.trim());
    toast('Lote ' + lote.lote + ': ' + C.ESTADOS_LOTE[estado].toLowerCase());
    onClose();
  };
  return (
    <Modal open title={'Estado del lote ' + lote.lote} icon={ShieldAlert} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancelar</Btn><Btn variant="primary" onClick={guardar}>Cambiar estado</Btn></>}>
      <Errores lista={err} />
      <div className="form-grid">
        <Field label="Nuevo estado">
          <select className="select input" value={estado} onChange={(e) => setEstado(e.target.value)}>{Object.entries(C.ESTADOS_LOTE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Field>
        <Field label="Motivo" span><input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus placeholder="Ej.: alerta sanitaria INVIMA, excursión de temperatura, liberado por calidad" /></Field>
      </div>
      <Nota>Un lote en cuarentena o bloqueado no se entrega en salidas ni se asigna por FEFO, pero se puede trasladar, devolver al proveedor o dar de baja.</Nota>
    </Modal>
  );
}

export default function LotesMaestro({ arg }) {
  const { db, state, hoy, puede } = useStore();
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [editar, setEditar] = useState(arg === 'nuevo' ? {} : null);
  const [estado, setEstado] = useState(null);
  const filas = db.lotes.map((l) => {
    const s = state.prods[l.productoId];
    const k = String(l.lote).toUpperCase();
    const porBodega = s ? Object.values(s.lots).filter((x) => x.lote.toUpperCase() === k && x.qty > 0) : [];
    return Object.assign({}, l, { existencia: porBodega.reduce((a, x) => a + x.qty, 0), bodegas: porBodega.map((x) => x.bodega + ': ' + num(x.qty)), sem: C.semaforo(l.vence, hoy, db.config) });
  }).filter((l) => (filtro === 'todos' || (filtro === 'existencia' ? l.existencia > 0 : l.estado === filtro)) &&
    (l.lote + ' ' + nombreProducto(db, l.productoId)).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => ((a.vence || '9999') < (b.vence || '9999') ? -1 : 1));
  const cuenta = (e) => db.lotes.filter((l) => l.estado === e).length;
  return (
    <Panel title="Maestro de lotes" icon={Tags}
      sub="Cada lote tiene número, fecha de fabricación, fecha de vencimiento y estado. Los lotes se crean aquí o automáticamente al registrar una entrada."
      actions={puede('maestros') && <Btn variant="primary" icon={Plus} onClick={() => setEditar({})}>Nuevo lote</Btn>}>
      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Buscar lote o producto" />
        <Tabs value={filtro} onChange={setFiltro} options={[['todos', 'Todos (' + db.lotes.length + ')'], ['existencia', 'Con existencia'], ['liberado', 'Liberados (' + cuenta('liberado') + ')'], ['cuarentena', 'Cuarentena (' + cuenta('cuarentena') + ')'], ['bloqueado', 'Bloqueados (' + cuenta('bloqueado') + ')']]} />
      </div>
      {filas.length ? (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Producto</th><th>Lote</th><th>Fabricación</th><th>Vencimiento</th><th>Semáforo</th><th>Estado</th><th className="num">Existencia</th><th>Bodegas</th><th /></tr></thead>
            <tbody>
              {filas.map((l) => (
                <tr key={l.id}>
                  <td className="strong">{nombreProducto(db, l.productoId)}</td>
                  <td className="mono">{l.lote}</td>
                  <td>{fecha(l.fabricado)}</td>
                  <td>{fecha(l.vence)}</td>
                  <td><Chip tone={SEMAFORO[l.sem].tono} dot>{SEMAFORO[l.sem].texto}</Chip></td>
                  <td><Chip tone={TONO_ESTADO[l.estado] || 'muted'} title={l.motivo || ''}>{C.ESTADOS_LOTE[l.estado] || l.estado}</Chip>{l.motivo && <div className="small muted">{l.motivo}</div>}</td>
                  <td className="num">{num(l.existencia)}</td>
                  <td className="small">{l.bodegas.join(' · ') || '—'}</td>
                  <td className="acts">
                    {puede('ajustes') && <Btn variant="ghost" size="sm" icon={l.estado === 'liberado' ? Lock : ShieldCheck} onClick={() => setEstado(l)} title="Cambiar estado" />}
                    {puede('maestros') && <Btn variant="ghost" size="sm" icon={Pencil} onClick={() => setEditar(db.lotes.find((x) => x.id === l.id))} title="Editar" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty icon={Tags} title="Sin lotes" text="Cree un lote o registre una entrada." />}
      {editar && <FormLote inicial={editar} onClose={() => setEditar(null)} />}
      {estado && <CambiarEstado lote={estado} onClose={() => setEstado(null)} />}
    </Panel>
  );
}
