import { useState } from 'react';
import { PackageMinus, Plus, Trash2 } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { Btn, Chip, Errores, Field, Modal, Nota, Panel } from '../components/ui.jsx';
import { MovTabla, SelectProducto, nombreProducto, useRegistrar } from '../components/Movimientos.jsx';
import { fecha, num, SEMAFORO } from '../format.js';

const DESTINOS = ['Paciente', 'Consultorio', 'Servicio', 'Venta'];

function NuevaSalida({ onClose }) {
  const { db, state, hoy } = useStore();
  const registrar = useRegistrar();
  const [h, setH] = useState({ fecha: hoy, destinoTipo: 'Consultorio', destino: '', responsable: '', nota: '' });
  const [lineas, setLineas] = useState([{ productoId: '', cantidad: '' }]);
  const [err, setErr] = useState([]);
  const setHk = (k) => (e) => setH((x) => Object.assign({}, x, { [k]: e.target.value }));
  const setL = (i, k, v) => setLineas((ls) => ls.map((l, j) => (j === i ? Object.assign({}, l, { [k]: v }) : l)));

  // Agrupa por producto y asigna lotes por FEFO (lo que vence primero sale primero).
  const totales = {};
  lineas.forEach((l) => { if (l.productoId && Number(l.cantidad) > 0) totales[l.productoId] = (totales[l.productoId] || 0) + Number(l.cantidad); });
  const asignaciones = Object.entries(totales).map(([id, q]) => Object.assign({ productoId: id, cantidad: q }, C.sugerirFEFO(state, id, q, h.fecha || hoy)));

  const guardar = () => {
    const e = [];
    asignaciones.forEach((a) => { if (a.faltante > 0) e.push(nombreProducto(db, a.productoId) + ': faltan ' + num(a.faltante) + ' unidades sin vencer.'); });
    if (!asignaciones.length) e.push('Agregue al menos un producto con cantidad.');
    if (e.length) return setErr(e);
    const ls = asignaciones.flatMap((a) => a.asignacion.map((x) => ({ productoId: a.productoId, lote: x.lote, vence: x.vence, cantidad: x.cantidad })));
    const r = registrar(Object.assign({ tipo: 'salida', lineas: ls }, h, { destino: h.destino.trim() }));
    if (r.length) return setErr(r);
    onClose();
  };

  return (
    <Modal open wide title="Nueva salida" icon={PackageMinus} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancelar</Btn><Btn variant="primary" onClick={guardar}>Registrar salida</Btn></>}>
      <Errores lista={err} />
      <div className="form-grid">
        <Field label="Fecha"><input className="input" type="date" value={h.fecha} max={hoy} onChange={setHk('fecha')} /></Field>
        <Field label="Tipo de destino">
          <select className="select input" value={h.destinoTipo} onChange={setHk('destinoTipo')}>{DESTINOS.map((d) => <option key={d}>{d}</option>)}</select>
        </Field>
        <Field label={h.destinoTipo === 'Paciente' ? 'Historia clínica o código del paciente' : 'Destino'} hint="Permite rastrear el lote en caso de tecnovigilancia o retiro">
          <input className="input" value={h.destino} onChange={setHk('destino')} />
        </Field>
        <Field label="Responsable"><input className="input" value={h.responsable} onChange={setHk('responsable')} /></Field>
      </div>
      <div className="section-title">Productos</div>
      <div className="tbl-wrap lines">
        <table className="tbl">
          <thead><tr><th style={{ minWidth: 260 }}>Producto</th><th className="num">Disponible</th><th className="num">Cantidad</th><th /></tr></thead>
          <tbody>
            {lineas.map((l, i) => (
              <tr key={i}>
                <td><SelectProducto value={l.productoId} onChange={(v) => setL(i, 'productoId', v)} /></td>
                <td className="num">{l.productoId ? num(C.sugerirFEFO(state, l.productoId, Infinity, h.fecha || hoy).asignacion.reduce((s, x) => s + x.cantidad, 0)) : '—'}</td>
                <td><input className="input num" type="number" min="0" value={l.cantidad} onChange={(e) => setL(i, 'cantidad', e.target.value)} style={{ width: 110 }} /></td>
                <td><Btn variant="ghost" size="sm" icon={Trash2} onClick={() => setLineas((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : [{ productoId: '', cantidad: '' }]))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="toolbar" style={{ marginTop: 10 }}>
        <Btn size="sm" icon={Plus} onClick={() => setLineas((ls) => [...ls, { productoId: '', cantidad: '' }])}>Agregar producto</Btn>
      </div>
      {asignaciones.length > 0 && (
        <>
          <div className="section-title">Lotes asignados automáticamente (FEFO)</div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Producto</th><th>Lote</th><th>Vence</th><th>Semáforo</th><th className="num">Cantidad</th></tr></thead>
              <tbody>
                {asignaciones.flatMap((a) => [
                  ...a.asignacion.map((x, j) => {
                    const s = SEMAFORO[C.semaforo(x.vence, hoy, db.config)];
                    return (
                      <tr key={a.productoId + j}>
                        <td>{nombreProducto(db, a.productoId)}</td><td className="mono">{x.lote}</td><td>{fecha(x.vence)}</td>
                        <td><Chip tone={s.tono} dot>{s.texto}</Chip></td><td className="num">{num(x.cantidad)}</td>
                      </tr>
                    );
                  }),
                  a.faltante > 0 && <tr key={a.productoId + 'f'}><td>{nombreProducto(db, a.productoId)}</td><td colSpan={3} className="red-t">Sin existencia suficiente sin vencer</td><td className="num red-t">{num(a.faltante)}</td></tr>
                ])}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div style={{ marginTop: 14 }}>
        <Nota>Los lotes vencidos nunca se entregan: deben salir como baja. El costo de la salida se calcula con el método de valoración del año ({C.METODOS[C.metodoDe(db.config, h.fecha || hoy)]}).</Nota>
      </div>
    </Modal>
  );
}

export default function Salidas() {
  const [nueva, setNueva] = useState(false);
  return (
    <Panel title="Salidas y consumos" icon={PackageMinus}
      sub="Consumos por paciente, consultorio o servicio. Los lotes se asignan por fecha de vencimiento."
      actions={<Btn variant="primary" icon={Plus} onClick={() => setNueva(true)}>Nueva salida</Btn>}>
      <MovTabla tipos={['salida']} vacio="Registre el primer consumo." />
      {nueva && <NuevaSalida onClose={() => setNueva(false)} />}
    </Panel>
  );
}
