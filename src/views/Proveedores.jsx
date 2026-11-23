import { useState } from 'react';
import { Contact, FileSpreadsheet, Pencil, Plus } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { Btn, Chip, Empty, Errores, Field, Modal, Panel, SearchBox, Tabs } from '../components/ui.jsx';
import Ubicacion from '../components/Ubicacion.jsx';
import { SelectCuenta } from './Contabilidad.jsx';
import { money } from '../format.js';

/** Formulario de tercero (proveedor, cliente, paciente, empleado, asesor, laboratorio). */
export function FormTercero({ inicial, onClose, onGuardado, tipoInicial }) {
  const { db, commit, toast, go } = useStore();
  const [f, setF] = useState(() => {
    const base = {
      tipoDoc: 'NIT', nit: '', dv: '', persona: 'juridica', nombre: '', razonSocial: '', nombreComercial: '', primerNombre: '', segundoNombre: '', primerApellido: '', segundoApellido: '', sexo: '',
      tipos: [tipoInicial || 'proveedor'], extranjero: false, contacto: '', telefono: '', celular: '', correo: '', pais: 'Colombia', paisCodigo: 'CO', departamento: '', departamentoCodigo: '', ciudad: '', ciudadCodigo: '', direccion: '', sitioWeb: '', sucursal: '',
      regimen: 'responsable', responsabilidades: [], actividad: '', obligadoFacturar: true, correoFE: '', retefuentePct: '', reteicaPct: '',
      plazoPago: 30, medioPago: 'transferencia', conBanco: false, banco: '', tipoCuenta: '', numeroCuenta: '', cuentaCredito: '', cuentaDebito: '',
      empleado: { tipoTrabajador: '01', subtipo: '00', tipoContrato: '', periodicidad: '5', salario: '', fechaInicio: '', fechaFin: '', cargo: '', altoRiesgo: false, salarioIntegral: false, sinAuxilioTransporte: false },
      activo: true
    };
    const x = Object.assign(base, inicial && inicial.id ? C.normalizarTercero(inicial) : inicial || {});
    x.empleado = Object.assign({}, base.empleado, x.empleado || {});
    if (inicial && inicial.buscar) {
      const soloDig = /^[\d.\s-]+$/.test(inicial.buscar);
      if (soloDig) x.nit = inicial.buscar.replace(/\D/g, ''); else { x.nombre = inicial.buscar; x.razonSocial = inicial.buscar; }
      delete x.buscar;
    }
    if (x.persona === 'natural' && !x.primerNombre && x.nombre) Object.assign(x, C.partirNombre(x.nombre));
    return x;
  });
  const [err, setErr] = useState([]);
  const upd = (o) => setF((x) => Object.assign({}, x, o));
  const set = (k) => (e) => upd({ [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const setEm = (k) => (e) => setF((x) => Object.assign({}, x, { empleado: Object.assign({}, x.empleado, { [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }) }));
  const esNit = f.tipoDoc === 'NIT';
  const natural = f.persona === 'natural';
  const dvCalc = esNit ? C.calcularDV(f.nit) : '';
  const lista = (k, v) => setF((x) => Object.assign({}, x, { [k]: x[k].includes(v) ? x[k].filter((y) => y !== v) : [...x[k], v] }));
  const esEmpleado = f.tipos.includes('empleado');
  const sug = C.impuestosSugeridos(db, f);
  const cambiarPersona = (p) => upd(p === 'juridica'
    ? { persona: p, tipoDoc: 'NIT', razonSocial: f.razonSocial || C.nombreTercero(f) }
    : Object.assign({ persona: p, tipoDoc: f.tipoDoc === 'NIT' ? 'CC' : f.tipoDoc, regimen: f.regimen === 'responsable' ? 'noResponsable' : f.regimen, obligadoFacturar: false }, f.primerNombre ? {} : C.partirNombre(f.razonSocial || f.nombre)));

  const guardar = () => {
    const numerico = ['NIT', 'CC', 'TI', 'RC'].includes(f.tipoDoc);
    const nit = String(f.nit).replace(numerico ? /\D/g : /\s/g, '');
    const t = C.normalizarTercero(Object.assign({}, f, { nit, dv: esNit ? dvCalc : '', razonSocial: natural ? '' : String(f.razonSocial || '').trim(), nombre: natural ? '' : String(f.razonSocial || '').trim() }));
    if (!esEmpleado) delete t.empleado;
    else t.empleado = Object.assign({}, t.empleado, { salario: Number(t.empleado.salario) || 0, fechaFin: t.empleado.tipoContrato === '1' ? t.empleado.fechaFin : '' });
    if (!t.conBanco) Object.assign(t, { banco: '', tipoCuenta: '', numeroCuenta: '' });
    ['retefuentePct', 'reteicaPct'].forEach((k) => { t[k] = t[k] === '' || t[k] === null || t[k] === undefined ? '' : Number(t[k]); });
    t.plazoPago = Number(t.plazoPago) || 0;
    const e = C.validarTercero(db, t);
    if (e.length) return setErr(e);
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
  const sel = (k, obj, vacio) => (
    <select className="select input" value={f[k]} onChange={set(k)}>{vacio !== undefined && <option value="">{vacio}</option>}{Object.entries(obj).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select>
  );
  const selEm = (k, obj, vacio, conCodigo) => (
    <select className="select input" value={f.empleado[k]} onChange={setEm(k)}>{vacio !== undefined && <option value="">{vacio}</option>}{Object.entries(obj).map(([a, b]) => <option key={a} value={a}>{conCodigo ? a + ' · ' + b : b}</option>)}</select>
  );
  return (
    <Modal open wide title={f.id ? 'Editar tercero' : 'Nuevo tercero'} icon={Contact} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancelar</Btn><Btn variant="primary" onClick={guardar}>Guardar</Btn></>}>
      <Errores lista={err} />
      <div className="section-title" style={{ marginTop: 0 }}>Identificación</div>
      <div className="toolbar" style={{ marginBottom: 10 }}>
        <Tabs value={f.persona} onChange={cambiarPersona} options={[['natural', 'Persona natural'], ['juridica', 'Persona jurídica']]} />
      </div>
      <div className="form-grid">
        <Field label="Tipo de documento *">{sel('tipoDoc', C.TIPOS_DOC)}</Field>
        <Field label={esNit ? 'NIT (sin dígito de verificación) *' : 'Número de documento *'}>
          <input className="input mono" value={f.nit} onChange={set('nit')} autoFocus inputMode={esNit || f.tipoDoc === 'CC' ? 'numeric' : 'text'} placeholder={esNit ? '900123456' : ''} />
        </Field>
        {esNit && <Field label="DV" hint="Calculado con el método de la DIAN"><input className="input mono" value={dvCalc} readOnly /></Field>}
        {natural ? (<>
          <Field label="Primer nombre *"><input className="input" value={f.primerNombre} onChange={set('primerNombre')} /></Field>
          <Field label="Segundo nombre"><input className="input" value={f.segundoNombre} onChange={set('segundoNombre')} /></Field>
          <Field label="Primer apellido *"><input className="input" value={f.primerApellido} onChange={set('primerApellido')} /></Field>
          <Field label="Segundo apellido"><input className="input" value={f.segundoApellido} onChange={set('segundoApellido')} /></Field>
          <Field label="Sexo">{sel('sexo', C.SEXOS, '—')}</Field>
        </>) : (<>
          <Field label="Razón social *" full><input className="input" value={f.razonSocial} onChange={set('razonSocial')} /></Field>
          <Field label="Nombre comercial"><input className="input" value={f.nombreComercial} onChange={set('nombreComercial')} /></Field>
          <Field label="Representante o contacto"><input className="input" value={f.contacto} onChange={set('contacto')} /></Field>
        </>)}
      </div>
      <div className="section-title">Tipo de tercero</div>
      <div className="toolbar">
        {Object.entries(C.TIPOS_TERCERO).map(([k, v]) => (
          <label key={k} className="check" style={{ marginRight: 14 }}><input type="checkbox" checked={f.tipos.includes(k)} onChange={() => lista('tipos', k)} /> {v}</label>
        ))}
        <label className="check" style={{ marginRight: 14 }}><input type="checkbox" checked={!!f.extranjero} onChange={set('extranjero')} /> Extranjero</label>
      </div>

      <div className="section-title">Contacto y ubicación</div>
      <div className="form-grid">
        <Field label="Correo"><input className="input" type="email" value={f.correo} onChange={set('correo')} /></Field>
        <Field label="Celular"><input className="input" inputMode="tel" value={f.celular} onChange={set('celular')} /></Field>
        <Field label="Teléfono"><input className="input" inputMode="tel" value={f.telefono} onChange={set('telefono')} /></Field>
        {natural && <Field label="Persona de contacto"><input className="input" value={f.contacto} onChange={set('contacto')} /></Field>}
        <Ubicacion v={f} onChange={upd} />
        <Field label="Dirección"><input className="input" value={f.direccion} onChange={set('direccion')} /></Field>
        <Field label="Sitio web"><input className="input" value={f.sitioWeb} onChange={set('sitioWeb')} placeholder="www.ejemplo.co" /></Field>
        <Field label="Sede o sucursal" hint="Sede de la empresa con la que se relaciona">
          <select className="select input" value={f.sucursal} onChange={set('sucursal')}><option value="">Todas</option>{db.bodegas.filter((b) => b.activa !== false).map((b) => <option key={b.id} value={b.nombre}>{b.nombre}</option>)}</select>
        </Field>
      </div>

      <div className="section-title">Información tributaria</div>
      <div className="form-grid">
        <Field label="Régimen" hint={f.regimen && ['noResponsable', 'noContribuyente'].includes(f.regimen) ? 'Sus facturas no traen IVA' : 'Cobra IVA en sus facturas'}>{sel('regimen', C.REGIMENES)}</Field>
        <Field label="Actividad económica (CIIU)"><input className="input mono" value={f.actividad} onChange={set('actividad')} placeholder="4645" /></Field>
        <Field label="Facturación" hint="Si no factura, sus compras se soportan con documento soporte (ET art. 771-2)">
          <label className="check"><input type="checkbox" checked={!!f.obligadoFacturar} onChange={set('obligadoFacturar')} /> Obligado a factura electrónica</label>
        </Field>
        <Field label="Correo para factura electrónica"><input className="input" type="email" value={f.correoFE} onChange={set('correoFE')} /></Field>
        <Field label="Retención en la fuente (%)" hint={'Vacío = la general (' + sug.retefuentePct + ' %)'}><input className="input" type="number" min="0" max="100" step="0.01" value={f.retefuentePct} onChange={set('retefuentePct')} /></Field>
        <Field label="ReteICA (%)" hint={'Vacío = la general (' + sug.reteicaPct + ' %)'}><input className="input" type="number" min="0" max="100" step="0.001" value={f.reteicaPct} onChange={set('reteicaPct')} /></Field>
        <Field label="Responsabilidades fiscales (RUT)" full>
          <div className="toolbar">{Object.entries(C.RESPONSABILIDADES).map(([k, v]) => (
            <label key={k} className="check" style={{ marginRight: 14 }}><input type="checkbox" checked={(f.responsabilidades || []).includes(k)} onChange={() => lista('responsabilidades', k)} /> <span className="mono">{k}</span> {v}</label>
          ))}</div>
        </Field>
      </div>

      <div className="section-title">Pagos y cuentas contables</div>
      <div className="form-grid">
        <Field label="Plazo de pago">{sel('plazoPago', C.PLAZOS_PAGO)}</Field>
        <Field label="Medio de pago">{sel('medioPago', C.MEDIOS_PAGO, '—')}</Field>
        <Field label="Cuenta bancaria"><label className="check"><input type="checkbox" checked={!!f.conBanco} onChange={set('conBanco')} /> Con información bancaria</label></Field>
        {f.conBanco && (<>
          <Field label="Banco *"><input className="input" value={f.banco} onChange={set('banco')} /></Field>
          <Field label="Tipo de cuenta *">{sel('tipoCuenta', C.TIPOS_CUENTA_BANCO, '—')}</Field>
          <Field label="Número de cuenta *"><input className="input mono" value={f.numeroCuenta} onChange={set('numeroCuenta')} /></Field>
        </>)}
        <Field label="Cuenta crédito (por pagar)" hint="Vacío = la de proveedores de la parametrización. Se usa en sus facturas y devoluciones.">
          <SelectCuenta value={f.cuentaCredito} onChange={(v) => upd({ cuentaCredito: v })} placeholder="Ej.: 220505" />
        </Field>
        <Field label="Cuenta débito (por cobrar o anticipos)">
          <SelectCuenta value={f.cuentaDebito} onChange={(v) => upd({ cuentaDebito: v })} placeholder="Ej.: 133005" />
        </Field>
        <Field label="Plan de cuentas"><button type="button" className="btn sm" onClick={() => { onClose(); go('plan'); }}>Ir al plan de cuentas</button></Field>
      </div>

      {esEmpleado && (<>
        <div className="section-title">Datos del empleado <span className="muted small">(códigos de la nómina electrónica DIAN)</span></div>
        <div className="form-grid">
          <Field label="Cargo"><input className="input" value={f.empleado.cargo} onChange={setEm('cargo')} /></Field>
          <Field label="Tipo de trabajador *">{selEm('tipoTrabajador', C.TIPOS_TRABAJADOR, '—', true)}</Field>
          <Field label="Subtipo de trabajador">{selEm('subtipo', C.SUBTIPOS_TRABAJADOR, undefined, true)}</Field>
          <Field label="Tipo de contrato *">{selEm('tipoContrato', C.TIPOS_CONTRATO, '—')}</Field>
          <Field label="Periodicidad de pago *">{selEm('periodicidad', C.PERIODICIDADES, '—')}</Field>
          <Field label="Salario *"><input className="input" type="number" min="0" step="1000" value={f.empleado.salario} onChange={setEm('salario')} /></Field>
          <Field label="Fecha de inicio del contrato *"><input className="input" type="date" value={f.empleado.fechaInicio} onChange={setEm('fechaInicio')} /></Field>
          {f.empleado.tipoContrato === '1' && <Field label="Fecha de terminación"><input className="input" type="date" value={f.empleado.fechaFin} onChange={setEm('fechaFin')} /></Field>}
          <Field label="Condiciones" full>
            <div className="toolbar">
              <label className="check" style={{ marginRight: 14 }}><input type="checkbox" checked={!!f.empleado.altoRiesgo} onChange={setEm('altoRiesgo')} /> Actividad de alto riesgo</label>
              <label className="check" style={{ marginRight: 14 }}><input type="checkbox" checked={!!f.empleado.salarioIntegral} onChange={setEm('salarioIntegral')} /> Salario integral</label>
              <label className="check" style={{ marginRight: 14 }}><input type="checkbox" checked={!!f.empleado.sinAuxilioTransporte} onChange={setEm('sinAuxilioTransporte')} /> Sin auxilio de transporte</label>
            </div>
          </Field>
        </div>
      </>)}

      <div className="section-title">Estado</div>
      <label className="check"><input type="checkbox" checked={f.activo !== false} onChange={set('activo')} /> Tercero activo</label>
    </Modal>
  );
}
export const FormProveedor = FormTercero;

export default function Terceros({ arg }) {
  const { db, state, puede, go } = useStore();
  const [q, setQ] = useState('');
  const [tipo, setTipo] = useState('todos');
  const [editar, setEditar] = useState(arg === 'nuevo' ? {} : null);
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const coincide = (t) => {
    if (!q.trim()) return true;
    const texto = norm([t.nombre, t.nombreComercial, C.documentoTercero(t), t.ciudad, t.departamento, t.contacto, t.correo, t.celular].join(' '));
    const digitos = q.replace(/[.\-\s]/g, '');
    return texto.includes(norm(q.trim())) || (/^\d+$/.test(digitos) && String(t.nit).includes(digitos));
  };
  const lista = db.proveedores.map(C.normalizarTercero).filter((t) => (tipo === 'todos' || t.tipos.includes(tipo)) && coincide(t));
  const compras = (id) => db.movimientos.filter((m) => !m.anulado && m.tipo === 'entrada' && m.proveedorId === id).reduce((s, m) => s + (state.movCost[m.id]?.total || 0), 0);
  const cuenta = (k) => db.proveedores.filter((t) => (t.tipos || ['proveedor']).includes(k)).length;
  return (
    <Panel title="Terceros" icon={Contact} sub="Proveedores, clientes, pacientes y empleados identificados con NIT o documento. Busque por número de documento o por nombre."
      actions={<>{puede('importar') && <Btn icon={FileSpreadsheet} onClick={() => go('importar', 'terceros')} title="Crear o actualizar muchos terceros con un archivo Excel o CSV">Cargar desde Excel</Btn>}{puede('maestros') && <Btn variant="primary" icon={Plus} onClick={() => setEditar({})}>Nuevo tercero</Btn>}</>}>
      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Buscar por NIT, cédula o nombre" />
        <Tabs value={tipo} onChange={setTipo} options={[['todos', 'Todos (' + db.proveedores.length + ')'], ...Object.entries(C.TIPOS_TERCERO).map(([k, v]) => [k, v + ' (' + cuenta(k) + ')'])]} />
      </div>
      {lista.length ? (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Documento</th><th>Nombre o razón social</th><th>Tipo</th><th>Ciudad</th><th>Contacto</th><th>Tributario</th><th className="num">Compras</th><th /></tr></thead>
            <tbody>
              {lista.map((t) => (
                <tr key={t.id} style={t.activo === false ? { opacity: 0.5 } : undefined}>
                  <td className="mono">{C.documentoTercero(t)}</td>
                  <td className="strong">{t.nombre}</td>
                  <td><div className="stockbod">{t.tipos.map((x) => <span key={x}>{C.TIPOS_TERCERO[x]}</span>)}</div></td>
                  <td>{t.ciudad || '—'}<div className="small muted">{[t.departamento !== t.ciudad ? t.departamento : '', C.enColombia(t) ? '' : t.pais].filter(Boolean).join(' · ')}</div></td>
                  <td>{t.contacto}<div className="small muted">{[t.celular, t.telefono, t.correo].filter(Boolean).join(' · ')}</div></td>
                  <td><div className="small">{C.REGIMENES[t.regimen]}</div>{t.tipos.includes('proveedor') ? (t.obligadoFacturar ? <Chip tone="cyan">Factura electrónica</Chip> : <Chip tone="violet">Documento soporte</Chip>) : null}{t.plazoPago ? <div className="small muted">Plazo {t.plazoPago} días</div> : null}</td>
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
