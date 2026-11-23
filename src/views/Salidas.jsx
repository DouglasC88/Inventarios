import { useState } from 'react';
import { Layers, PackageMinus, Plus, Trash2 } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { Btn, Errores, Field, Modal, Nota, Panel } from '../components/ui.jsx';
import { MovTabla, SelectBodega, SelectProducto, TablaFEFO, asignarFEFO, explicarFaltante, nombreProducto, useRegistrar, SelectKit } from '../components/Movimientos.jsx';
import { num } from '../format.js';

const DESTINOS = ['Paciente', 'Consultorio', 'Servicio', 'Venta'];

function NuevaSalida({ onClose }) {
  const { db, state, hoy, usuario } = useStore();
  const registrar = useRegistrar();
  const bodegaInicial = usuario && usuario.rol === 'consultorio' && usuario.bodega ? usuario.bodega : C.bodegaPrincipal(db.config);
  const [h, setH] = useState({ fecha: hoy, bodega: bodegaInicial, destinoTipo: 'Paciente', destino: '', procedimiento: '', responsable: usuario ? usuario.nombre : '', nota: '' });
  const [lineas, setLineas] = useState([{ productoId: '', cantidad: '' }]);
  const [kit, setKit] = useState({ id: '', veces: 1 });
  const [err, setErr] = useState([]);
  const setHk = (k) => (e) => setH((x) => Object.assign({}, x, { [k]: e.target.value }));
  const setL = (i, k, v) => setLineas((ls) => ls.map((l, j) => (j === i ? Object.assign({}, l, { [k]: v }) : l)));
  const asignaciones = asignarFEFO(state, lineas, h.fecha || hoy, h.bodega);

  const aplicarKit = () => {
    const k = db.kits.find((x) => x.id === kit.id);
    if (!k) return;
    const nuevas = C.expandirKit(k, kit.veces);
    setLineas((ls) => [...ls.filter((l) => l.productoId || l.cantidad), ...nuevas]);
    if (!h.procedimiento) setH((x) => Object.assign({}, x, { procedimiento: k.nombre }));
  };

  const guardar = () => {
    const e = [];
    asignaciones.forEach((a) => { if (a.faltante > 0) e.push(explicarFaltante(db, state, a.productoId, a.cantidad, h.fecha || hoy, h.bodega)); });
    if (!asignaciones.length) e.push('Agregue al menos un producto con cantidad.');
    if (e.length) return setErr(e);
    const ls = asignaciones.flatMap((a) => a.asignacion.map((x) => ({ productoId: a.productoId, lote: x.lote, vence: x.vence, cantidad: x.cantidad })));
    const r = registrar(Object.assign({ tipo: 'salida', lineas: ls }, h, { destino: h.destino.trim(), procedimiento: h.procedimiento.trim() }));
    if (r.length) return setErr(r);
    onClose();
  };

  return (
    <Modal open wide title="Nueva salida o consumo" icon={PackageMinus} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancelar</Btn><Btn variant="primary" onClick={guardar}>Registrar salida</Btn></>}>
      <Errores lista={err} />
      <div className="form-grid">
        <Field label="Fecha"><input className="input" type="date" value={h.fecha} max={hoy} onChange={setHk('fecha')} /></Field>
        <Field label="Bodega de donde sale"><SelectBodega value={h.bodega} onChange={(v) => setH((x) => Object.assign({}, x, { bodega: v }))} soloPropia /></Field>
        <Field label="Tipo de destino">
          <select className="select input" value={h.destinoTipo} onChange={setHk('destinoTipo')}>{DESTINOS.map((d) => <option key={d}>{d}</option>)}</select>
        </Field>
        <Field label={h.destinoTipo === 'Paciente' ? 'Historia clínica o código del paciente' : 'Destino'} hint="Permite rastrear el lote en tecnovigilancia o retiros">
          <input className="input" value={h.destino} onChange={setHk('destino')} list="destinos-terceros" placeholder={h.destinoTipo === 'Paciente' ? 'HC o documento del paciente' : ''} />
          <datalist id="destinos-terceros">
            {db.proveedores.filter((t) => (t.tipos || []).some((x) => x === 'paciente' || x === 'cliente')).map((t) => <option key={t.id} value={C.documentoTercero(t) + ' · ' + t.nombre} />)}
          </datalist>
        </Field>
        <Field label="Procedimiento"><input className="input" value={h.procedimiento} onChange={setHk('procedimiento')} placeholder="Ej.: Resina clase II" /></Field>
        <Field label="Responsable"><input className="input" value={h.responsable} onChange={setHk('responsable')} /></Field>
      </div>

      {db.kits.length > 0 && (
        <>
          <div className="section-title">Kit por procedimiento</div>
          <div className="toolbar">
            <div style={{ width: 340, maxWidth: '100%' }}><SelectKit value={kit.id} onChange={(v) => setKit((k) => Object.assign({}, k, { id: v }))} /></div>
            <input className="input num" type="number" min="1" value={kit.veces} onChange={(e) => setKit((k) => Object.assign({}, k, { veces: e.target.value }))} style={{ width: 90 }} title="Número de procedimientos" />
            <Btn icon={Layers} onClick={aplicarKit} disabled={!kit.id}>Agregar insumos del kit</Btn>
          </div>
        </>
      )}

      <div className="section-title">Productos</div>
      <div className="tbl-wrap lines">
        <table className="tbl">
          <thead><tr><th style={{ minWidth: 260 }}>Producto</th><th className="num">Disponible en bodega</th><th className="num">Cantidad</th><th /></tr></thead>
          <tbody>
            {lineas.map((l, i) => {
              const p = db.productos.find((x) => x.id === l.productoId);
              return (
                <tr key={i}>
                  <td><SelectProducto value={l.productoId} onChange={(v) => setL(i, 'productoId', v)} /></td>
                  <td className="num">{l.productoId ? num(C.sugerirFEFO(state, l.productoId, Infinity, h.fecha || hoy, h.bodega).asignacion.reduce((s, x) => s + x.cantidad, 0)) + ' ' + (p ? p.unidad : '') : '—'}</td>
                  <td><input className="input num" type="number" min="0" value={l.cantidad} onChange={(e) => setL(i, 'cantidad', e.target.value)} style={{ width: 110 }} /></td>
                  <td><Btn variant="ghost" size="sm" icon={Trash2} onClick={() => setLineas((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : [{ productoId: '', cantidad: '' }]))} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="toolbar" style={{ marginTop: 10 }}>
        <Btn size="sm" icon={Plus} onClick={() => setLineas((ls) => [...ls, { productoId: '', cantidad: '' }])}>Agregar producto</Btn>
      </div>
      {asignaciones.length > 0 && (<><div className="section-title">Lotes asignados automáticamente (FEFO)</div><TablaFEFO asignaciones={asignaciones} /></>)}
      <div style={{ marginTop: 14 }}>
        <Nota>Los lotes vencidos nunca se entregan: deben salir como baja. El costo se calcula con el método del año ({C.METODOS[C.metodoDe(db.config, h.fecha || hoy)]}).</Nota>
      </div>
    </Modal>
  );
}

export default function Salidas({ arg }) {
  const { puede, usuario } = useStore();
  const [nueva, setNueva] = useState(arg === 'nuevo');
  const propia = usuario && usuario.rol === 'consultorio' && usuario.bodega ? usuario.bodega : null;
  return (
    <Panel title="Salidas y consumos" icon={PackageMinus}
      sub="Consumos por paciente, consultorio, procedimiento o servicio. Los lotes se asignan por fecha de vencimiento dentro de la bodega."
      actions={puede('salidas') && <Btn variant="primary" icon={Plus} onClick={() => setNueva(true)}>Nueva salida</Btn>}>
      <MovTabla tipos={['salida']} vacio="Registre el primer consumo." filtro={propia ? (m) => m.bodega === propia : null} />
      {nueva && <NuevaSalida onClose={() => setNueva(false)} />}
    </Panel>
  );
}
