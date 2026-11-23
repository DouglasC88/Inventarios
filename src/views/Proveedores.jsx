import { useState } from 'react';
import { Contact, Pencil, Plus } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { Btn, Chip, Empty, Errores, Field, Modal, Panel, SearchBox, Tabs } from '../components/ui.jsx';
import { money } from '../format.js';

/** Formulario de tercero (proveedor, cliente, paciente, empleado). */
export function FormTercero({ inicial, onClose, onGuardado, tipoInicial }) {
  const { db, commit, toast } = useStore();
  const [f, setF] = useState(() => {
    const base = { tipoDoc: 'NIT', nit: '', dv: '', persona: 'juridica', nombre: '', tipos: [tipoInicial || 'proveedor'], contacto: '', telefono: '', correo: '', direccion: '', ciudad: '', responsableIva: true, obligadoFacturar: true, activo: true };
    const x = Object.assign(base, inicial && inicial.id ? C.normalizarTercero(inicial) : inicial || {});
    if (inicial && inicial.buscar) { const soloDig = /^[\d.\s-]+$/.test(inicial.buscar); if (soloDig) x.nit = inicial.buscar.replace(/\D/g, ''); else x.nombre = inicial.buscar; delete x.buscar; }
    return x;
  });
  const [err, setErr] = useState([]);
  const set = (k) => (e) => setF((x) => Object.assign({}, x, { [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const esNit = f.tipoDoc === 'NIT';
  const dvCalc = esNit ? C.calcularDV(f.nit) : '';
  const toggleTipo = (t) => setF((x) => Object.assign({}, x, { tipos: x.tipos.includes(t) ? x.tipos.filter((y) => y !== t) : [...x.tipos, t] }));

  const guardar = () => {
    const e = [];
    const nit = String(f.nit).replace(esNit || f.tipoDoc === 'CC' || f.tipoDoc === 'TI' ? /\D/g : /\s/g, '');
    if (!nit) e.push('Escriba el número de documento.');
    if ((esNit || f.tipoDoc === 'CC') && nit && !/^\d{5,15}$/.test(nit)) e.push('El número debe tener entre 5 y 15 dígitos, sin puntos ni dígito de verificación.');
    if (esNit && f.dv !== '' && f.dv !== undefined && String(f.dv) !== dvCalc) e.push('El dígito de verificación no corresponde al NIT (debería ser ' + dvCalc + ').');
    if (!f.nombre.trim()) e.push('Escriba la razón social o el nombre completo.');
    if (!f.tipos.length) e.push('Marque al menos un tipo de tercero.');
    if (db.proveedores.some((t) => t.id !== f.id && (t.tipoDoc || 'NIT') === f.tipoDoc && String(C.normalizarTercero(t).nit) === nit)) e.push('Ya existe un tercero con ese documento.');
    if (f.correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.correo)) e.push('El correo no es válido.');
    if (e.length) return setErr(e);
    const t = Object.assign({}, f, { nit, dv: esNit ? dvCalc : '', nombre: f.nombre.trim() });
    const nuevo = !t.id;
    if (nuevo) t.id = C.nuevoId();
    commit((d) => {
      const i = d.proveedores.findIndex((x) => x.id === t.id);
      if (i >= 0) d.proveedores[i] = t; else d.proveedores.push(t);
    }, nuevo ? 'Tercero creado' : 'Tercero modificado', C.documentoTercero(t) + ' · ' + t.nombre);
    toast(nuevo ? 'Tercero creado' : 'Tercero actualizado');
    if (onGuardado) onGuardado(t);
    onClose();
  };
  return (
    <Modal open wide title={f.id ? 'Editar tercero' : 'Nuevo tercero'} icon={Contact} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancelar</Btn><Btn variant="primary" onClick={guardar}>Guardar</Btn></>}>
      <Errores lista={err} />
      <div className="section-title" style={{ marginTop: 0 }}>Identificación</div>
      <div className="form-grid">
        <Field label="Tipo de persona">
          <select className="select input" value={f.persona} onChange={set('persona')}>
            <option value="juridica">Persona jurídica</option><option value="natural">Persona natural</option>
          </select>
        </Field>
        <Field label="Tipo de documento">
          <select className="select input" value={f.tipoDoc} onChange={set('tipoDoc')}>{Object.entries(C.TIPOS_DOC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Field>
        <Field label={esNit ? 'NIT (sin dígito de verificación)' : 'Número de documento'}>
          <input className="input mono" value={f.nit} onChange={set('nit')} autoFocus inputMode={esNit || f.tipoDoc === 'CC' ? 'numeric' : 'text'} placeholder={esNit ? '900123456' : ''} />
        </Field>
        {esNit && (
          <Field label="Dígito de verificación" hint="Se calcula con el método de la DIAN">
            <input className="input mono" value={dvCalc} readOnly />
          </Field>
        )}
        <Field label={f.persona === 'natural' ? 'Nombres y apellidos' : 'Razón social'} full><input className="input" value={f.nombre} onChange={set('nombre')} /></Field>
      </div>
      <div className="section-title">Tipo de tercero</div>
      <div className="toolbar">
        {Object.entries(C.TIPOS_TERCERO).map(([k, v]) => (
          <label key={k} className="check" style={{ marginRight: 14 }}><input type="checkbox" checked={f.tipos.includes(k)} onChange={() => toggleTipo(k)} /> {v}</label>
        ))}
      </div>
      <div className="section-title">Contacto y tributario</div>
      <div className="form-grid">
        <Field label="Dirección"><input className="input" value={f.direccion} onChange={set('direccion')} /></Field>
        <Field label="Ciudad o municipio"><input className="input" value={f.ciudad} onChange={set('ciudad')} /></Field>
        <Field label="Teléfono"><input className="input" value={f.telefono} onChange={set('telefono')} /></Field>
        <Field label="Correo (facturación)"><input className="input" type="email" value={f.correo} onChange={set('correo')} /></Field>
        <Field label="Persona de contacto"><input className="input" value={f.contacto} onChange={set('contacto')} /></Field>
        <Field label="IVA"><label className="check"><input type="checkbox" checked={!!f.responsableIva} onChange={set('responsableIva')} /> Responsable de IVA</label></Field>
        <Field label="Facturación" hint="Si no factura, sus compras se soportan con documento soporte (ET art. 771-2)">
          <label className="check"><input type="checkbox" checked={!!f.obligadoFacturar} onChange={set('obligadoFacturar')} /> Obligado a factura electrónica</label>
        </Field>
        <Field label="Estado"><label className="check"><input type="checkbox" checked={f.activo !== false} onChange={set('activo')} /> Activo</label></Field>
      </div>
    </Modal>
  );
}
export const FormProveedor = FormTercero;

export default function Terceros({ arg }) {
  const { db, state, puede } = useStore();
  const [q, setQ] = useState('');
  const [tipo, setTipo] = useState('todos');
  const [editar, setEditar] = useState(arg === 'nuevo' ? {} : null);
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const coincide = (t) => {
    if (!q.trim()) return true;
    const texto = norm([t.nombre, C.documentoTercero(t), t.ciudad, t.contacto, t.correo].join(' '));
    const digitos = q.replace(/[.\-\s]/g, '');
    return texto.includes(norm(q.trim())) || (/^\d+$/.test(digitos) && String(t.nit).includes(digitos));
  };
  const lista = db.proveedores.map(C.normalizarTercero).filter((t) => (tipo === 'todos' || t.tipos.includes(tipo)) && coincide(t));
  const compras = (id) => db.movimientos.filter((m) => !m.anulado && m.tipo === 'entrada' && m.proveedorId === id).reduce((s, m) => s + (state.movCost[m.id]?.total || 0), 0);
  const cuenta = (k) => db.proveedores.filter((t) => (t.tipos || ['proveedor']).includes(k)).length;
  return (
    <Panel title="Terceros" icon={Contact} sub="Proveedores, clientes, pacientes y empleados identificados con NIT o documento. Busque por número de documento o por nombre."
      actions={puede('maestros') && <Btn variant="primary" icon={Plus} onClick={() => setEditar({})}>Nuevo tercero</Btn>}>
      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Buscar por NIT, cédula o nombre" />
        <Tabs value={tipo} onChange={setTipo} options={[['todos', 'Todos (' + db.proveedores.length + ')'], ...Object.entries(C.TIPOS_TERCERO).map(([k, v]) => [k, v + ' (' + cuenta(k) + ')'])]} />
      </div>
      {lista.length ? (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Documento</th><th>Nombre o razón social</th><th>Tipo</th><th>Ciudad</th><th>Contacto</th><th>Soporte de compras</th><th className="num">Compras</th><th /></tr></thead>
            <tbody>
              {lista.map((t) => (
                <tr key={t.id} style={t.activo === false ? { opacity: 0.5 } : undefined}>
                  <td className="mono">{C.documentoTercero(t)}</td>
                  <td className="strong">{t.nombre}</td>
                  <td><div className="stockbod">{t.tipos.map((x) => <span key={x}>{C.TIPOS_TERCERO[x]}</span>)}</div></td>
                  <td>{t.ciudad || '—'}</td>
                  <td>{t.contacto}<div className="small muted">{[t.telefono, t.correo].filter(Boolean).join(' · ')}</div></td>
                  <td>{t.tipos.includes('proveedor') ? (t.obligadoFacturar ? <Chip tone="cyan">Factura electrónica</Chip> : <Chip tone="violet">Documento soporte</Chip>) : '—'}</td>
                  <td className="num">{money(compras(t.id))}</td>
                  <td className="acts">{puede('maestros') && <Btn variant="ghost" size="sm" icon={Pencil} onClick={() => setEditar(db.proveedores.find((x) => x.id === t.id))} title="Editar" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty icon={Contact} title="Sin terceros" text={q ? 'Ningún tercero coincide. Puede crearlo con "Nuevo tercero".' : 'Registre el primer tercero.'} />}
      {editar && <FormTercero inicial={editar} onClose={() => setEditar(null)} />}
    </Panel>
  );
}
