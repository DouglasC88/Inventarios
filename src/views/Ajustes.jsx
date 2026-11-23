import { useState } from 'react';
import { Ban, Plus, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { Btn, Errores, Field, Kpi, Modal, Nota, Panel, Tabs } from '../components/ui.jsx';
import { MovTabla, SelectProducto, useRegistrar } from '../components/Movimientos.jsx';
import { fecha, money, num, pct } from '../format.js';

const claveLote = (l) => l.productoId + '||' + l.lote + '||' + l.vence;

function OpcionesLotes({ todos }) {
  const { db, state, hoy } = useStore();
  return C.lotes(db, state, hoy, { todos }).map((l) => (
    <option key={claveLote(l)} value={claveLote(l)}>
      {l.producto.codigo} · {l.producto.nombre} · lote {l.lote} · vence {fecha(l.vence)} · {num(l.qty)} {l.producto.unidad}
    </option>
  ));
}

export function NuevaBaja({ onClose, inicial }) {
  const { hoy } = useStore();
  const registrar = useRegistrar();
  const [h, setH] = useState({ fecha: hoy, causa: inicial ? 'vencido' : '', acta: '', autoriza: '', nota: '' });
  const [lineas, setLineas] = useState([{ clave: inicial ? claveLote(inicial) : '', cantidad: inicial ? inicial.qty : '' }]);
  const [err, setErr] = useState([]);
  const setHk = (k) => (e) => setH((x) => Object.assign({}, x, { [k]: e.target.value }));
  const setL = (i, k, v) => setLineas((ls) => ls.map((l, j) => (j === i ? Object.assign({}, l, { [k]: v }) : l)));
  const guardar = () => {
    const ls = lineas.filter((l) => l.clave || l.cantidad).map((l) => {
      const [productoId, lote, vence] = l.clave.split('||');
      return { productoId: productoId || '', lote: lote || '', vence: vence || '', cantidad: Number(l.cantidad) };
    });
    const e = registrar(Object.assign({ tipo: 'baja', lineas: ls }, h), 'Baja registrada');
    if (e.length) return setErr(e);
    onClose();
  };
  return (
    <Modal open wide title="Baja de inventario" icon={Ban} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancelar</Btn><Btn variant="danger" icon={Ban} onClick={guardar}>Registrar baja</Btn></>}>
      <Errores lista={err} />
      <div className="form-grid">
        <Field label="Fecha"><input className="input" type="date" value={h.fecha} max={hoy} onChange={setHk('fecha')} /></Field>
        <Field label="Causa">
          <select className="select input" value={h.causa} onChange={setHk('causa')}>
            <option value="">Seleccione…</option>
            {Object.entries(C.CAUSAS_BAJA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Número de acta"><input className="input mono" value={h.acta} onChange={setHk('acta')} /></Field>
        <Field label="Autoriza"><input className="input" value={h.autoriza} onChange={setHk('autoriza')} /></Field>
        <Field label="Observaciones" full><input className="input" value={h.nota} onChange={setHk('nota')} placeholder="Disposición final, gestor de residuos, reporte INVIMA…" /></Field>
      </div>
      <div className="section-title">Lotes que salen</div>
      <div className="tbl-wrap lines">
        <table className="tbl">
          <thead><tr><th>Lote</th><th className="num">Cantidad</th><th /></tr></thead>
          <tbody>
            {lineas.map((l, i) => (
              <tr key={i}>
                <td><select className="select input" value={l.clave} onChange={(e) => setL(i, 'clave', e.target.value)}><option value="">Seleccione…</option><OpcionesLotes /></select></td>
                <td><input className="input num" type="number" min="0" value={l.cantidad} onChange={(e) => setL(i, 'cantidad', e.target.value)} style={{ width: 110 }} /></td>
                <td><Btn variant="ghost" size="sm" icon={Trash2} onClick={() => setLineas((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : [{ clave: '', cantidad: '' }]))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="toolbar" style={{ marginTop: 10 }}><Btn size="sm" icon={Plus} onClick={() => setLineas((ls) => [...ls, { clave: '', cantidad: '' }])}>Agregar lote</Btn></div>
      <Nota>Una baja por retiro de mercado o por ruptura de cadena de frío debe acompañarse del reporte al INVIMA (Res. 4816 de 2008).</Nota>
    </Modal>
  );
}

function NuevoAjuste({ onClose }) {
  const { hoy } = useStore();
  const registrar = useRegistrar();
  const [h, setH] = useState({ fecha: hoy, acta: '', autoriza: '', nota: '' });
  const vacia = () => ({ clave: '', productoId: '', lote: '', vence: '', cantidad: '', causa: 'faltante', costoUnit: '' });
  const [lineas, setLineas] = useState([vacia()]);
  const [err, setErr] = useState([]);
  const setHk = (k) => (e) => setH((x) => Object.assign({}, x, { [k]: e.target.value }));
  const setL = (i, k, v) => setLineas((ls) => ls.map((l, j) => (j === i ? Object.assign({}, l, { [k]: v }) : l)));
  const guardar = () => {
    const ls = lineas.filter((l) => l.clave || l.cantidad).map((l) => {
      let productoId = l.productoId, lote = l.lote, vence = l.vence;
      if (l.clave && l.clave !== 'nuevo') [productoId, lote, vence] = l.clave.split('||');
      let cantidad = Math.abs(Number(l.cantidad));
      if (l.causa === 'faltante') cantidad = -cantidad;
      if (l.causa !== 'faltante' && l.causa !== 'sobrante' && Number(l.cantidad) < 0) cantidad = -cantidad;
      return { productoId, lote: String(lote || '').trim(), vence, cantidad, causa: l.causa, costoUnit: l.costoUnit === '' ? undefined : Number(l.costoUnit) };
    });
    const e = registrar(Object.assign({ tipo: 'ajuste', lineas: ls }, h), 'Ajuste registrado');
    if (e.length) return setErr(e);
    onClose();
  };
  return (
    <Modal open wide title="Ajuste de inventario" icon={SlidersHorizontal} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancelar</Btn><Btn variant="primary" onClick={guardar}>Registrar ajuste</Btn></>}>
      <Errores lista={err} />
      <div className="form-grid">
        <Field label="Fecha"><input className="input" type="date" value={h.fecha} max={hoy} onChange={setHk('fecha')} /></Field>
        <Field label="Acta o soporte"><input className="input mono" value={h.acta} onChange={setHk('acta')} /></Field>
        <Field label="Autoriza"><input className="input" value={h.autoriza} onChange={setHk('autoriza')} /></Field>
        <Field label="Observaciones"><input className="input" value={h.nota} onChange={setHk('nota')} /></Field>
      </div>
      <div className="section-title">Líneas</div>
      <div className="tbl-wrap lines">
        <table className="tbl">
          <thead><tr><th style={{ minWidth: 300 }}>Lote</th><th>Causa</th><th className="num">Cantidad</th><th className="num">Costo unit.</th><th /></tr></thead>
          <tbody>
            {lineas.map((l, i) => (
              <tr key={i}>
                <td>
                  <select className="select input" value={l.clave} onChange={(e) => setL(i, 'clave', e.target.value)}>
                    <option value="">Seleccione…</option>
                    <OpcionesLotes todos />
                    <option value="nuevo">+ Lote que no está en el sistema (sobrante)</option>
                  </select>
                  {l.clave === 'nuevo' && (
                    <div className="form-grid" style={{ marginTop: 8 }}>
                      <SelectProducto value={l.productoId} onChange={(v) => setL(i, 'productoId', v)} />
                      <input className="input mono" placeholder="Lote" value={l.lote} onChange={(e) => setL(i, 'lote', e.target.value)} />
                      <input className="input" type="date" value={l.vence} onChange={(e) => setL(i, 'vence', e.target.value)} />
                    </div>
                  )}
                </td>
                <td>
                  <select className="select input" value={l.causa} onChange={(e) => setL(i, 'causa', e.target.value)}>
                    {Object.entries(C.CAUSAS_AJUSTE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </td>
                <td><input className="input num" type="number" value={l.cantidad} onChange={(e) => setL(i, 'cantidad', e.target.value)} style={{ width: 100 }} title="Faltante resta, sobrante suma. En corrección use signo." /></td>
                <td><input className="input num" type="number" min="0" value={l.costoUnit} onChange={(e) => setL(i, 'costoUnit', e.target.value)} placeholder="Auto" style={{ width: 120 }} disabled={l.causa === 'faltante'} /></td>
                <td><Btn variant="ghost" size="sm" icon={Trash2} onClick={() => setLineas((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : [vacia()]))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="toolbar" style={{ marginTop: 10 }}><Btn size="sm" icon={Plus} onClick={() => setLineas((ls) => [...ls, vacia()])}>Agregar línea</Btn></div>
      <Nota>Faltante resta y sobrante suma; en "Corrección" u "Otro", escriba la cantidad con signo. Si el sobrante no trae costo, se valora al costo actual del producto.</Nota>
    </Modal>
  );
}

export default function Ajustes() {
  const { db, hoy } = useStore();
  const [modal, setModal] = useState(null);
  const [tab, setTab] = useState('todos');
  const year = C.yearOf(hoy);
  const f = C.faltantesAnio(db, year);
  const lim = db.config.limiteFaltantes;
  return (
    <div className="stack">
      <div className="grid g-kpi">
        <Kpi label={'Faltantes ' + year} value={money(f.faltantes)} sub="Valor de faltantes en conteos y ajustes" tone="magenta" />
        <Kpi label="Base del límite" value={money(f.base)} sub={'Inventario inicial ' + money(f.inicial) + ' + compras ' + money(f.compras)} tone="cyan" />
        <Kpi label="Porcentaje usado" value={pct(f.pct, 2)} sub={'Límite ' + lim + ' % (ET art. 64)'} tone={f.pct > lim ? 'red' : 'green'} />
      </div>
      <Panel title="Ajustes y bajas" icon={SlidersHorizontal}
        sub="Toda diferencia queda con causa, acta y responsable. Los documentos no se borran; se anulan con motivo."
        actions={<><Btn icon={Plus} onClick={() => setModal('ajuste')}>Nuevo ajuste</Btn><Btn variant="danger" icon={Ban} onClick={() => setModal('baja')}>Nueva baja</Btn></>}>
        <div className="toolbar"><Tabs value={tab} onChange={setTab} options={[['todos', 'Todos'], ['ajuste', 'Ajustes'], ['baja', 'Bajas']]} /></div>
        <MovTabla key={tab} tipos={tab === 'todos' ? ['ajuste', 'baja'] : [tab]} vacio="No hay ajustes ni bajas." />
      </Panel>
      {modal === 'ajuste' && <NuevoAjuste onClose={() => setModal(null)} />}
      {modal === 'baja' && <NuevaBaja onClose={() => setModal(null)} />}
    </div>
  );
}
