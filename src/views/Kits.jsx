import { useState } from 'react';
import { Pencil, Plus, Stethoscope, Trash2 } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { Btn, Chip, Empty, Errores, Field, Modal, Nota, Panel, SearchBox } from '../components/ui.jsx';
import { SelectProducto, nombreProducto } from '../components/Movimientos.jsx';
import { money, num } from '../format.js';

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function useCosto() {
  const { state } = useStore();
  return (lineas) => lineas.reduce((s, l) => {
    const p = state.prods[l.productoId];
    return s + (Number(l.cantidad) || 0) * (p && p.qty ? p.value / p.qty : (p ? p.ultimoCosto : 0));
  }, 0);
}

function FormServicio({ inicial, onClose }) {
  const { db, commit, toast } = useStore();
  const costo = useCosto();
  const [f, setF] = useState(() => Object.assign({ codigo: '', nombre: '', categoria: '', cups: '', precio: '', ivaPct: '', duracion: '', activo: true, lineas: [{ productoId: '', cantidad: '' }] }, inicial || {}));
  const [err, setErr] = useState([]);
  const set = (k) => (e) => setF((x) => Object.assign({}, x, { [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const setL = (i, k, v) => setF((x) => Object.assign({}, x, { lineas: x.lineas.map((l, j) => (j === i ? Object.assign({}, l, { [k]: v }) : l)) }));
  const categorias = [...new Set(db.servicios.map((x) => x.categoria).filter(Boolean))].sort();
  const lineasOk = f.lineas.filter((l) => l.productoId && Number(l.cantidad) > 0);
  const costoInsumos = costo(lineasOk);
  const guardar = () => {
    const lineas = lineasOk.map((l) => ({ productoId: l.productoId, cantidad: Number(l.cantidad) }));
    const e = [];
    if (!f.codigo.trim()) e.push('El código es obligatorio.');
    if (!f.nombre.trim()) e.push('El nombre del servicio es obligatorio.');
    if (db.servicios.some((k) => k.id !== f.id && k.codigo.toUpperCase() === f.codigo.trim().toUpperCase())) e.push('Ya existe un servicio con ese código.');
    if (f.precio !== '' && Number(f.precio) < 0) e.push('El precio no puede ser negativo.');
    if (e.length) return setErr(e);
    const n = (v) => (v === '' ? '' : Number(v));
    const k = Object.assign({}, f, { codigo: f.codigo.trim(), nombre: f.nombre.trim(), lineas, precio: n(f.precio), ivaPct: n(f.ivaPct), duracion: n(f.duracion) });
    const nuevo = !k.id;
    if (nuevo) k.id = C.nuevoId();
    commit((d) => { const i = d.servicios.findIndex((x) => x.id === k.id); if (i >= 0) d.servicios[i] = k; else d.servicios.push(k); }, nuevo ? 'Servicio creado' : 'Servicio modificado', k.codigo + ' · ' + k.nombre);
    toast('Servicio guardado');
    onClose();
  };
  const eliminar = () => {
    commit((d) => { d.servicios = d.servicios.filter((x) => x.id !== f.id); }, 'Servicio eliminado', f.codigo);
    toast('Servicio eliminado');
    onClose();
  };
  return (
    <Modal open wide title={f.id ? 'Servicio ' + f.codigo : 'Nuevo servicio'} icon={Stethoscope} onClose={onClose}
      footer={<>{f.id && <Btn variant="danger" icon={Trash2} onClick={eliminar}>Eliminar</Btn>}<span style={{ flex: 1 }} /><Btn onClick={onClose}>Cancelar</Btn><Btn variant="primary" onClick={guardar}>Guardar</Btn></>}>
      <Errores lista={err} />
      <div className="form-grid">
        <Field label="Código"><input className="input mono" value={f.codigo} onChange={set('codigo')} autoFocus placeholder="Ej.: SRV-END1" /></Field>
        <Field label="Nombre del servicio" span><input className="input" value={f.nombre} onChange={set('nombre')} placeholder="Ej.: Endodoncia unirradicular" /></Field>
        <Field label="Categoría">
          <input className="input" value={f.categoria} onChange={set('categoria')} list="cat-servicios" placeholder="Ej.: Endodoncia" />
          <datalist id="cat-servicios">{categorias.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Código CUPS" hint="Clasificación Única de Procedimientos en Salud"><input className="input mono" value={f.cups} onChange={set('cups')} /></Field>
        <Field label="Precio o tarifa"><input className="input" type="number" min="0" value={f.precio} onChange={set('precio')} /></Field>
        <Field label="IVA (%)"><input className="input" type="number" min="0" max="100" value={f.ivaPct} onChange={set('ivaPct')} placeholder="Opcional" /></Field>
        <Field label="Duración (minutos)"><input className="input" type="number" min="0" value={f.duracion} onChange={set('duracion')} /></Field>
        <Field label="Estado"><label className="check"><input type="checkbox" checked={f.activo !== false} onChange={set('activo')} /> Activo</label></Field>
      </div>
      <div className="section-title">Insumos que consume cada vez que se realiza</div>
      <div className="tbl-wrap lines">
        <table className="tbl">
          <thead><tr><th style={{ minWidth: 300 }}>Insumo</th><th className="num">Cantidad por servicio</th><th className="num">Costo estimado</th><th /></tr></thead>
          <tbody>
            {f.lineas.map((l, i) => (
              <tr key={i}>
                <td><SelectProducto value={l.productoId} onChange={(v) => setL(i, 'productoId', v)} /></td>
                <td><input className="input num" type="number" min="0" step="0.01" value={l.cantidad} onChange={(e) => setL(i, 'cantidad', e.target.value)} style={{ width: 120 }} /></td>
                <td className="num">{money(costo(l.productoId && Number(l.cantidad) > 0 ? [l] : []))}</td>
                <td><Btn variant="ghost" size="sm" icon={Trash2} onClick={() => setF((x) => Object.assign({}, x, { lineas: x.lineas.length > 1 ? x.lineas.filter((_, j) => j !== i) : [{ productoId: '', cantidad: '' }] }))} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={2}>Costo de insumos por servicio</td><td className="num">{money(costoInsumos)}</td><td /></tr></tfoot>
        </table>
      </div>
      <div className="toolbar" style={{ marginTop: 10 }}><Btn size="sm" icon={Plus} onClick={() => setF((x) => Object.assign({}, x, { lineas: [...x.lineas, { productoId: '', cantidad: '' }] }))}>Agregar insumo</Btn></div>
      {f.precio !== '' && Number(f.precio) > 0 && <div className="kv"><div><span>Precio</span><b>{money(f.precio)}</b></div><div><span>Costo de insumos</span><b>{money(costoInsumos)}</b></div><div><span>Margen sobre insumos</span><b>{money(Number(f.precio) - costoInsumos)} ({((1 - costoInsumos / Number(f.precio)) * 100).toFixed(1)} %)</b></div></div>}
      <Nota>Se admiten fracciones (0,25 de jeringa de resina, 0,02 de caja de guantes). En Salidas, al elegir el servicio y cuántas veces se hizo, el sistema descuenta todos sus insumos por lote (FEFO) y deja registrado el procedimiento.</Nota>
    </Modal>
  );
}

export default function Servicios({ arg }) {
  const { db, puede } = useStore();
  const costo = useCosto();
  const [q, setQ] = useState('');
  const [editar, setEditar] = useState(arg === 'nuevo' ? {} : null);
  const lista = db.servicios.filter((k) => norm([k.codigo, k.nombre, k.categoria, k.cups].join(' ')).includes(norm(q)));
  return (
    <Panel title="Servicios y procedimientos" icon={Stethoscope}
      sub="Catálogo de servicios con su precio, código CUPS y los insumos que consume. Al registrar un servicio en Salidas se descuentan sus insumos automáticamente."
      actions={puede('maestros') && <Btn variant="primary" icon={Plus} onClick={() => setEditar({})}>Nuevo servicio</Btn>}>
      <div className="toolbar"><SearchBox value={q} onChange={setQ} placeholder="Buscar servicio, categoría o CUPS" /></div>
      {lista.length ? (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Código</th><th>Servicio</th><th>Categoría</th><th>Insumos</th><th className="num">Precio</th><th className="num">Costo insumos</th><th className="num">Margen</th><th /></tr></thead>
            <tbody>
              {lista.map((k) => {
                const c = costo(k.lineas);
                return (
                  <tr key={k.id} style={k.activo === false ? { opacity: 0.5 } : undefined}>
                    <td className="mono">{k.codigo}{k.cups ? <div className="small muted">CUPS {k.cups}</div> : null}</td>
                    <td className="strong">{k.nombre}{k.duracion ? <div className="small muted">{k.duracion} min</div> : null}</td>
                    <td>{k.categoria || '—'}</td>
                    <td className="small">{k.lineas.map((l) => num(l.cantidad) + ' × ' + nombreProducto(db, l.productoId)).join(' · ') || '—'}</td>
                    <td className="num">{k.precio !== '' && k.precio !== undefined ? money(k.precio) : '—'}</td>
                    <td className="num">{money(c)}</td>
                    <td className="num">{Number(k.precio) > 0 ? <Chip tone={c / Number(k.precio) > 0.5 ? 'amber' : 'green'}>{((1 - c / Number(k.precio)) * 100).toFixed(0)} %</Chip> : '—'}</td>
                    <td className="acts">{puede('maestros') && <Btn variant="ghost" size="sm" icon={Pencil} onClick={() => setEditar(k)} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <Empty icon={Stethoscope} title="Sin servicios" text="Cree el primer servicio con los insumos que consume." />}
      {editar && <FormServicio inicial={editar} onClose={() => setEditar(null)} />}
    </Panel>
  );
}
