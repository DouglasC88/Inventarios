import { useState } from 'react';
import { Boxes, Pencil, Plus, ScrollText, Snowflake } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { Btn, Chip, Empty, Errores, Field, Modal, Panel, SearchBox, Tabs } from '../components/ui.jsx';
import { money, num, fecha, INVIMA } from '../format.js';

const VACIO = {
  codigo: '', nombre: '', categoria: 'dispositivo', unidad: 'unidad', stockMin: 0, ubicacion: '',
  fabricante: '', gtin: '', requiereInvima: true, invima: '', invimaVence: '', riesgo: 'I',
  cadenaFrio: false, vnrUnit: '', activo: true
};

export function FormProducto({ inicial, onClose }) {
  const { db, commit, toast } = useStore();
  const [f, setF] = useState(() => Object.assign({}, VACIO, { ubicacion: db.config.ubicaciones[0] || '' }, inicial || {}));
  const [err, setErr] = useState([]);
  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setF((x) => {
      const n = Object.assign({}, x, { [k]: v });
      if (k === 'categoria') n.requiereInvima = v !== 'insumo';
      return n;
    });
  };

  const guardar = () => {
    const e = [];
    if (!f.codigo.trim()) e.push('El código es obligatorio.');
    if (!f.nombre.trim()) e.push('El nombre es obligatorio.');
    if (db.productos.some((p) => p.id !== f.id && p.codigo.trim().toUpperCase() === f.codigo.trim().toUpperCase())) e.push('Ya existe un producto con ese código.');
    if (Number(f.stockMin) < 0) e.push('El stock mínimo no puede ser negativo.');
    if (f.invimaVence && !C.isISODate(f.invimaVence)) e.push('La fecha de vencimiento del registro no es válida.');
    if (f.vnrUnit !== '' && Number(f.vnrUnit) < 0) e.push('El valor neto realizable no puede ser negativo.');
    if (e.length) return setErr(e);
    const p = Object.assign({}, f, { codigo: f.codigo.trim(), nombre: f.nombre.trim(), stockMin: Number(f.stockMin) || 0, vnrUnit: f.vnrUnit === '' ? '' : Number(f.vnrUnit) });
    const nuevo = !p.id;
    if (nuevo) p.id = C.nuevoId();
    commit((d) => {
      const i = d.productos.findIndex((x) => x.id === p.id);
      if (i >= 0) d.productos[i] = p; else d.productos.push(p);
    }, nuevo ? 'Producto creado' : 'Producto modificado', p.codigo + ' · ' + p.nombre);
    toast(nuevo ? 'Producto creado' : 'Producto actualizado');
    onClose();
  };

  return (
    <Modal open title={f.id ? 'Editar producto' : 'Nuevo producto'} icon={Boxes} onClose={onClose} wide
      footer={<><Btn onClick={onClose}>Cancelar</Btn><Btn variant="primary" onClick={guardar}>Guardar</Btn></>}>
      <Errores lista={err} />
      <div className="form-grid">
        <Field label="Código"><input className="input" value={f.codigo} onChange={set('codigo')} autoFocus /></Field>
        <Field label="Nombre" span><input className="input" value={f.nombre} onChange={set('nombre')} /></Field>
        <Field label="Categoría">
          <select className="select input" value={f.categoria} onChange={set('categoria')}>
            {Object.entries(C.CATEGORIAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Unidad de medida"><input className="input" value={f.unidad} onChange={set('unidad')} /></Field>
        <Field label="Stock mínimo" hint="Según frecuencia de uso y esterilización (Res. 3100)"><input className="input" type="number" min="0" value={f.stockMin} onChange={set('stockMin')} /></Field>
        <Field label="Ubicación">
          <select className="select input" value={f.ubicacion} onChange={set('ubicacion')}>
            {db.config.ubicaciones.map((u) => <option key={u}>{u}</option>)}
          </select>
        </Field>
        <Field label="Fabricante"><input className="input" value={f.fabricante} onChange={set('fabricante')} /></Field>
        <Field label="GTIN / código de barras" hint="Permite leer el código GS1 / UDI al recibir"><input className="input mono" value={f.gtin} onChange={set('gtin')} /></Field>
      </div>
      <div className="section-title">Información sanitaria</div>
      <div className="form-grid">
        <Field label="Requiere registro INVIMA">
          <label className="check"><input type="checkbox" checked={!!f.requiereInvima} onChange={set('requiereInvima')} /> Sí, es un producto regulado</label>
        </Field>
        <Field label="Registro sanitario INVIMA"><input className="input mono" value={f.invima} onChange={set('invima')} placeholder="INVIMA 2024DM-0000000" /></Field>
        <Field label="Vence el registro"><input className="input" type="date" value={f.invimaVence} onChange={set('invimaVence')} /></Field>
        <Field label="Clasificación por riesgo">
          <select className="select input" value={f.riesgo} onChange={set('riesgo')}>
            {C.RIESGOS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="Cadena de frío">
          <label className="check"><input type="checkbox" checked={!!f.cadenaFrio} onChange={set('cadenaFrio')} /> Requiere refrigeración</label>
        </Field>
      </div>
      <div className="section-title">Valoración (NIC 2 / Sección 13)</div>
      <div className="form-grid">
        <Field label="Valor neto realizable unitario" hint="Precio estimado de venta o reposición menos costos para vender. Si es menor que el costo, el cierre registra deterioro.">
          <input className="input" type="number" min="0" value={f.vnrUnit} onChange={set('vnrUnit')} placeholder="Opcional" />
        </Field>
        <Field label="Estado">
          <label className="check"><input type="checkbox" checked={f.activo !== false} onChange={set('activo')} /> Producto activo</label>
        </Field>
      </div>
    </Modal>
  );
}

export default function Productos() {
  const { db, state, hoy, go } = useStore();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('todas');
  const [editar, setEditar] = useState(null);
  const lista = db.productos.filter((p) =>
    (cat === 'todas' || p.categoria === cat) &&
    (p.nombre + ' ' + p.codigo + ' ' + (p.invima || '')).toLowerCase().includes(q.toLowerCase()));

  return (
    <Panel title="Maestro de productos" icon={Boxes}
      actions={<Btn variant="primary" icon={Plus} onClick={() => setEditar({})}>Nuevo producto</Btn>}>
      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Buscar por nombre, código o INVIMA" />
        <Tabs value={cat} onChange={setCat} options={[['todas', 'Todas'], ...Object.entries(C.CATEGORIAS)]} />
      </div>
      {lista.length ? (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Código</th><th>Producto</th><th>Categoría</th><th className="num">Existencia</th><th className="num">Costo prom.</th><th className="num">Valor</th><th>INVIMA</th><th>Riesgo</th><th /></tr>
            </thead>
            <tbody>
              {lista.map((p) => {
                const s = state.prods[p.id];
                const qty = s ? s.qty : 0;
                const ei = INVIMA[C.estadoInvima(p, hoy, db.config)];
                const bajo = Number(p.stockMin) > 0 && qty < Number(p.stockMin);
                return (
                  <tr key={p.id} style={p.activo === false ? { opacity: 0.5 } : undefined}>
                    <td className="mono">{p.codigo}</td>
                    <td>
                      <div className="strong">{p.nombre} {p.cadenaFrio && <Snowflake size={13} className="cyan-t" />}</div>
                      <div className="small muted">{p.ubicacion} · mín. {num(p.stockMin)} {p.unidad}</div>
                    </td>
                    <td>{C.CATEGORIAS[p.categoria]}</td>
                    <td className={'num' + (bajo ? ' red-t' : '')}>{num(qty)} <span className="muted small">{p.unidad}</span></td>
                    <td className="num">{money(qty > 0 ? s.value / qty : s?.ultimoCosto || 0)}</td>
                    <td className="num">{money(s ? s.value : 0)}</td>
                    <td><Chip tone={ei.tono} title={p.invima ? p.invima + (p.invimaVence ? ' · vence ' + fecha(p.invimaVence) : '') : ''}>{ei.texto}</Chip></td>
                    <td>{p.riesgo}</td>
                    <td className="acts">
                      <Btn variant="ghost" size="sm" icon={ScrollText} onClick={() => go('kardex', p.id)} title="Ver kardex" />
                      <Btn variant="ghost" size="sm" icon={Pencil} onClick={() => setEditar(p)} title="Editar" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <Empty icon={Boxes} title="Sin productos" text="Cree el primer producto o cambie el filtro." />}
      {editar && <FormProducto inicial={editar} onClose={() => setEditar(null)} />}
    </Panel>
  );
}
