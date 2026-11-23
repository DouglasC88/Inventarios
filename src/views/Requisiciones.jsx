import { useState } from 'react';
import { ArrowRightLeft, ClipboardList, Eye, Plus, Trash2, X } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { Btn, Chip, Empty, Errores, Field, Modal, Panel, Tabs } from '../components/ui.jsx';
import { SelectBodega, SelectProducto, nombreProducto } from '../components/Movimientos.jsx';
import { NuevoTraslado } from './Traslados.jsx';
import { fecha, num } from '../format.js';

const TONO = { pendiente: 'amber', parcial: 'cyan', atendida: 'green', rechazada: 'muted', anulada: 'muted' };

function NuevaRequisicion({ onClose }) {
  const { db, hoy, commit, toast, usuario, nombreUsuario } = useStore();
  const bp = C.bodegaPrincipal(db.config);
  const [h, setH] = useState({
    fecha: hoy,
    bodegaSolicita: usuario && usuario.bodega ? usuario.bodega : (db.config.ubicaciones.find((b) => b !== bp) || bp),
    bodegaAtiende: bp, solicita: nombreUsuario, nota: ''
  });
  const [lineas, setLineas] = useState([{ productoId: '', cantidad: '' }]);
  const [err, setErr] = useState([]);
  const setL = (i, k, v) => setLineas((ls) => ls.map((l, j) => (j === i ? Object.assign({}, l, { [k]: v }) : l)));
  const guardar = () => {
    const ls = lineas.filter((l) => l.productoId && Number(l.cantidad) > 0).map((l) => ({ productoId: l.productoId, cantidad: Number(l.cantidad) }));
    const e = [];
    if (!ls.length) e.push('Agregue al menos un producto con cantidad.');
    if (h.bodegaSolicita === h.bodegaAtiende) e.push('La bodega que solicita y la que atiende deben ser distintas.');
    if (e.length) return setErr(e);
    const numero = C.verNumero(db, 'requisicion');
    commit((d) => {
      d.requisiciones.push(Object.assign({ id: C.nuevoId(), num: C.siguienteNumero(d, 'requisicion'), estado: 'pendiente', lineas: ls, creado: new Date().toISOString() }, h));
    }, 'Requisición creada', numero + ' · ' + h.bodegaSolicita);
    toast(numero + ' enviada a ' + h.bodegaAtiende);
    onClose();
  };
  return (
    <Modal open wide title="Nueva requisición interna" icon={ClipboardList} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancelar</Btn><Btn variant="primary" onClick={guardar}>Enviar requisición</Btn></>}>
      <Errores lista={err} />
      <div className="form-grid">
        <Field label="Fecha"><input className="input" type="date" value={h.fecha} max={hoy} onChange={(e) => setH((x) => Object.assign({}, x, { fecha: e.target.value }))} /></Field>
        <Field label="Solicita (bodega o consultorio)"><SelectBodega value={h.bodegaSolicita} soloPropia onChange={(v) => setH((x) => Object.assign({}, x, { bodegaSolicita: v }))} /></Field>
        <Field label="Atiende"><SelectBodega value={h.bodegaAtiende} onChange={(v) => setH((x) => Object.assign({}, x, { bodegaAtiende: v }))} /></Field>
        <Field label="Solicitante"><input className="input" value={h.solicita} onChange={(e) => setH((x) => Object.assign({}, x, { solicita: e.target.value }))} /></Field>
        <Field label="Motivo o nota" full><input className="input" value={h.nota} onChange={(e) => setH((x) => Object.assign({}, x, { nota: e.target.value }))} /></Field>
      </div>
      <div className="section-title">Productos solicitados</div>
      <div className="tbl-wrap lines">
        <table className="tbl">
          <thead><tr><th style={{ minWidth: 280 }}>Producto</th><th className="num">Cantidad</th><th /></tr></thead>
          <tbody>
            {lineas.map((l, i) => (
              <tr key={i}>
                <td><SelectProducto value={l.productoId} onChange={(v) => setL(i, 'productoId', v)} /></td>
                <td><input className="input num" type="number" min="0" value={l.cantidad} onChange={(e) => setL(i, 'cantidad', e.target.value)} style={{ width: 110 }} /></td>
                <td><Btn variant="ghost" size="sm" icon={Trash2} onClick={() => setLineas((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : [{ productoId: '', cantidad: '' }]))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="toolbar" style={{ marginTop: 10 }}><Btn size="sm" icon={Plus} onClick={() => setLineas((ls) => [...ls, { productoId: '', cantidad: '' }])}>Agregar producto</Btn></div>
    </Modal>
  );
}

function DetalleRequisicion({ rq, onClose, onAtender }) {
  const { db, state, commit, toast, puede } = useStore();
  const st = C.estadoRequisicion(db, rq);
  const abierta = ['pendiente', 'parcial'].includes(st.estado);
  const rechazar = () => {
    commit((d) => { const r = d.requisiciones.find((x) => x.id === rq.id); r.estado = 'rechazada'; }, 'Requisición rechazada', rq.num);
    toast(rq.num + ' rechazada');
    onClose();
  };
  return (
    <Modal open wide title={'Requisición ' + rq.num} icon={ClipboardList} onClose={onClose}
      footer={<>
        {abierta && puede('requisicionAtender') && <Btn variant="danger" icon={X} onClick={rechazar}>Rechazar</Btn>}
        <span style={{ flex: 1 }} />
        <Btn onClick={onClose}>Cerrar</Btn>
        {abierta && puede('requisicionAtender') && <Btn variant="primary" icon={ArrowRightLeft} onClick={onAtender}>Atender con traslado</Btn>}
      </>}>
      <div className="kv">
        <div><span>Fecha</span><b>{fecha(rq.fecha)}</b></div>
        <div><span>Solicita</span><b>{rq.bodegaSolicita}</b></div>
        <div><span>Atiende</span><b>{rq.bodegaAtiende}</b></div>
        <div><span>Solicitante</span><b>{rq.solicita}</b></div>
        <div><span>Estado</span><b>{st.estado}</b></div>
      </div>
      {rq.nota && <p className="muted">Nota: {rq.nota}</p>}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Producto</th><th className="num">Solicitado</th><th className="num">Entregado</th><th className="num">Pendiente</th><th className="num">Disponible en {rq.bodegaAtiende}</th></tr></thead>
          <tbody>
            {st.lineas.map((l, i) => (
              <tr key={i}>
                <td>{nombreProducto(db, l.productoId)}</td><td className="num">{num(l.cantidad)}</td><td className="num green-t">{num(l.entregado)}</td>
                <td className="num">{num(l.pendiente)}</td><td className="num">{num(C.existencia(state, l.productoId, rq.bodegaAtiende))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

export default function Requisiciones() {
  const { db, puede, usuario } = useStore();
  const [nueva, setNueva] = useState(false);
  const [ver, setVer] = useState(null);
  const [atender, setAtender] = useState(null);
  const [tab, setTab] = useState('abiertas');
  const propia = usuario && usuario.rol === 'consultorio' && usuario.bodega ? usuario.bodega : null;
  const lista = db.requisiciones.slice().reverse()
    .map((r) => Object.assign({ st: C.estadoRequisicion(db, r) }, { r }))
    .filter((x) => (!propia || x.r.bodegaSolicita === propia) && (tab === 'todas' || ['pendiente', 'parcial'].includes(x.st.estado)));
  const actual = ver && db.requisiciones.find((r) => r.id === ver);
  return (
    <Panel title="Requisiciones internas" icon={ClipboardList}
      sub="Los consultorios piden insumos a la bodega; la bodega los atiende con un traslado y el sistema controla lo pendiente."
      actions={puede('requisicionCrear') && <Btn variant="primary" icon={Plus} onClick={() => setNueva(true)}>Nueva requisición</Btn>}>
      <div className="toolbar"><Tabs value={tab} onChange={setTab} options={[['abiertas', 'Por atender'], ['todas', 'Todas']]} /></div>
      {lista.length ? (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Requisición</th><th>Fecha</th><th>Solicita</th><th>Atiende</th><th>Solicitante</th><th>Estado</th><th className="num">Productos</th><th /></tr></thead>
            <tbody>
              {lista.map(({ r, st }) => (
                <tr key={r.id}>
                  <td className="mono">{r.num}</td><td>{fecha(r.fecha)}</td><td>{r.bodegaSolicita}</td><td>{r.bodegaAtiende}</td><td>{r.solicita}</td>
                  <td><Chip tone={TONO[st.estado]} dot>{st.estado}</Chip></td><td className="num">{r.lineas.length}</td>
                  <td className="acts"><Btn variant="ghost" size="sm" icon={Eye} onClick={() => setVer(r.id)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty icon={ClipboardList} title="Sin requisiciones" text={tab === 'abiertas' ? 'No hay requisiciones por atender.' : 'Aún no hay requisiciones.'} />}
      {nueva && <NuevaRequisicion onClose={() => setNueva(false)} />}
      {actual && !atender && <DetalleRequisicion rq={actual} onClose={() => setVer(null)} onAtender={() => setAtender(actual)} />}
      {atender && <NuevoTraslado requisicion={atender} onClose={() => { setAtender(null); setVer(null); }} />}
    </Panel>
  );
}
