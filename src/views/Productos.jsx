import { useState } from 'react';
import { Ban, Boxes, Download, FileSpreadsheet, ImagePlus, Pencil, Pill, Plus, ScrollText, Snowflake, Stethoscope, Syringe, Trash2, Wrench, Package, ShoppingBag } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { SelectBodega, SelectGrupo, SelectTercero } from '../components/Movimientos.jsx';
import { Btn, Chip, Empty, Errores, Field, Modal, Nota, Panel, SearchBox, Tabs } from '../components/ui.jsx';
import { descargar, money, num, fecha, INVIMA } from '../format.js';
import { SelectCuenta } from './Contabilidad.jsx';

const VACIO = {
  codigo: '', codigoAlterno: '', nombre: '', nombreComercial: '', descripcion: '', foto: '', categoria: 'dispositivo', tipoMaterial: 'consumible', grupoId: '', marca: '', referencia: '', presentacion: '',
  unidad: 'unidad', stockMin: 0, stockMax: '', stockSeguridad: '', puntoReorden: '', cantidadMinPedido: '', politica: 'consumo', ubicacion: '', ubicacionFisica: '', fabricante: '', gtin: '', cum: '', ium: '', atc: '',
  principioActivo: '', concentracion: '', formaFarmaceutica: '', viaAdministracion: '', controlEspecial: false,
  usoUnico: true, esteril: false, metodoEsterilizacion: '', implantable: false, ciclosVida: '',
  requiereInvima: true, invima: '', invimaVence: '', riesgo: 'I', cadenaFrio: false, tempMin: '', tempMax: '', fotosensible: false, condiciones: '', controlaLote: true, controlaVence: true,
  vidaUtilMeses: '', vidaMinRecepcion: '', diasAlertaVence: '',
  vnrUnit: '', ivaPct: '', tarifaIva: '', precioVenta: '', activo: true, bloqueoCompras: false, unidadCompra: '', factorCompra: 1, leadTime: 7, proveedorId: '', proveedores: [], cuentas: {}
};
// Qué se puede crear: las clasificaciones de los grupos (como en Dentos). Cada una trae sus valores iniciales.
const DATOS_CLASIF = {
  insumo: { clasificacion: 'insumo', categoria: 'insumo', tipoMaterial: 'consumible', requiereInvima: false, riesgo: 'N/A' },
  producto: { clasificacion: 'producto', categoria: 'insumo', tipoMaterial: 'producto', requiereInvima: false, riesgo: 'N/A' },
  medicamento: { clasificacion: 'medicamento', categoria: 'medicamento', tipoMaterial: 'medicamento', requiereInvima: true, riesgo: 'N/A' },
  dispositivo: { clasificacion: 'dispositivo', categoria: 'dispositivo', tipoMaterial: 'dispositivo', requiereInvima: true, riesgo: 'I' },
  equipo: { clasificacion: 'equipo', categoria: 'dispositivo', tipoMaterial: 'equipo', requiereInvima: true, riesgo: 'IIa', controlaVence: false }
};
const TIPOS_CREAR = [
  ['insumo', 'Insumo', 'Material de consumo (gasas, guantes, resinas…)', Package, '#22d3ee', '#0ea5e9'],
  ['producto', 'Producto', 'Para la venta al paciente (cepillos, cremas…)', ShoppingBag, '#fbbf24', '#f97316'],
  ['medicamento', 'Medicamento', 'Con registro INVIMA y código CUM', Pill, '#34d399', '#059669'],
  ['dispositivo', 'Dispositivo médico', 'Con registro INVIMA y clase de riesgo', Syringe, '#a78bfa', '#7c3aed'],
  ['equipo', 'Equipo biomédico', 'Equipos e instrumental de la clínica', Wrench, '#94a3b8', '#475569'],
  ['servicio', 'Procedimiento o servicio', 'Con precio, CUPS e insumos que consume', Stethoscope, '#f472b6', '#db2777']
];
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const SECCIONES = [['ident', 'Identificación'], ['sanitaria', 'Sanitaria'], ['almac', 'Almacenamiento'], ['repos', 'Reposición'], ['provs', 'Proveedores'], ['ventas', 'Precio e IVA'], ['conta', 'Contabilidad'], ['lotes', 'Lotes']];

/** Reduce la foto a un tamaño liviano (máx. 320 px) para guardarla con el producto. */
function reducirFoto(file) {
  return new Promise((ok, mal) => {
    const r = new FileReader();
    r.onerror = mal;
    r.onload = () => {
      const img = new Image();
      img.onerror = mal;
      img.onload = () => {
        const k = Math.min(1, 320 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        ok(c.toDataURL('image/jpeg', 0.78));
      };
      img.src = r.result;
    };
    r.readAsDataURL(file);
  });
}

export function FormProducto({ inicial, onClose }) {
  const { db, state, hoy, commit, toast, nombreUsuario, go } = useStore();
  const [f, setF] = useState(() => {
    const x = Object.assign({}, VACIO, { ubicacion: db.config.ubicaciones[0] || '' }, inicial || {});
    x.proveedores = (x.proveedores || []).map((y) => Object.assign({}, y));
    x.cuentas = Object.assign({}, x.cuentas || {});
    if (x.tarifaIva === '' && x.ivaPct !== '' && x.ivaPct !== undefined && x.id) x.tarifaIva = Number(x.ivaPct) === 19 ? '19' : Number(x.ivaPct) === 5 ? '5' : '';
    if (!x.clasificacion) x.clasificacion = C.clasificacionProducto(db, x);
    if (x.tarifaIvaVenta === undefined) x.tarifaIvaVenta = '';
    return x;
  });
  const [err, setErr] = useState([]);
  const loteVacio = () => ({ lote: '', fabricado: '', vence: '', bodega: f.ubicacion || C.bodegaPrincipal(db.config), cantidad: '', costoUnit: '' });
  const [nuevosLotes, setNuevosLotes] = useState([]);
  const setLote = (i, k, v) => setNuevosLotes((ls) => ls.map((l, j) => (j === i ? Object.assign({}, l, { [k]: v }) : l)));
  const conMovimientos = !!f.id && db.movimientos.some((m) => !m.anulado && m.lineas.some((l) => l.productoId === f.id));
  const lotesExistentes = f.id ? db.lotes.filter((l) => l.productoId === f.id) : [];
  const stockLote = (lote) => { const s = state.prods[f.id]; return s ? Object.values(s.lots).filter((x) => x.lote.toUpperCase() === String(lote).toUpperCase()).reduce((a, x) => a + x.qty, 0) : 0; };
  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setF((x) => {
      const n = Object.assign({}, x, { [k]: v });
      if (k === 'categoria') { n.requiereInvima = v !== 'insumo'; if (v === 'medicamento') { n.tipoMaterial = 'medicamento'; n.riesgo = 'N/A'; } }
      if (k === 'clasificacion') {
        Object.assign(n, DATOS_CLASIF[v] || {});
        if (n.grupoId && C.clasificacionGrupo(db, n.grupoId) !== v) n.grupoId = '';
      }
      if (k === 'cadenaFrio' && v && n.tempMin === '' && n.tempMax === '') { n.tempMin = 2; n.tempMax = 8; }
      if (k === 'implantable' && v) { n.controlaLote = true; n.esteril = true; n.usoUnico = true; }
      if (k === 'controlaLote' && !v) n.controlaVence = false;
      return n;
    });
  };
  const setV = (k) => (v) => setF((x) => Object.assign({}, x, { [k]: v }));
  const setCta = (k) => (v) => setF((x) => Object.assign({}, x, { cuentas: Object.assign({}, x.cuentas, { [k]: v }) }));
  const setProv = (i, k, v) => setF((x) => Object.assign({}, x, { proveedores: x.proveedores.map((y, j) => (j === i ? Object.assign({}, y, { [k]: v }) : y)) }));
  const marcas = [...new Set(db.productos.map((p) => p.marca).filter(Boolean))].sort();
  const fabricantes = [...new Set(db.productos.map((p) => p.fabricante).filter(Boolean))].sort();
  const esMed = f.categoria === 'medicamento';
  const esDisp = f.categoria === 'dispositivo';
  const sp = f.id ? state.prods[f.id] : null;
  const costoProm = sp && sp.qty > 0 ? sp.value / sp.qty : sp ? sp.ultimoCosto || 0 : 0;
  const margen = Number(f.precioVenta) > 0 && costoProm > 0 ? C.r2((1 - costoProm / Number(f.precioVenta)) * 100) : null;
  const gtinOk = !f.gtin || C.gtinValido(f.gtin);
  const sinCuentas = Object.assign({}, f, { cuentas: {} });
  const heredada = (k) => { const c = C.cuentaDe(db, k, sinCuentas); return c.cuenta + ' · ' + c.nombre; };
  const ir = (id) => { const el = document.getElementById('fp-' + id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const subirFoto = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try { const url = await reducirFoto(file); setF((x) => Object.assign({}, x, { foto: url })); } catch { toast('No se pudo leer la imagen'); }
  };

  const guardar = () => {
    const nn = (v) => (v === '' || v === null || v === undefined ? '' : Number(v));
    const p = Object.assign({}, f, {
      codigo: f.codigo.trim(), nombre: f.nombre.trim(), unidad: String(f.unidad || '').trim(), gtin: String(f.gtin || '').replace(/\s/g, ''),
      stockMin: Number(f.stockMin) || 0, stockMax: nn(f.stockMax), stockSeguridad: nn(f.stockSeguridad), puntoReorden: nn(f.puntoReorden), cantidadMinPedido: nn(f.cantidadMinPedido),
      factorCompra: Number(f.factorCompra) || 1, leadTime: Number(f.leadTime) || 0, vnrUnit: nn(f.vnrUnit), precioVenta: nn(f.precioVenta),
      tempMin: nn(f.tempMin), tempMax: nn(f.tempMax), vidaUtilMeses: nn(f.vidaUtilMeses), vidaMinRecepcion: nn(f.vidaMinRecepcion), diasAlertaVence: nn(f.diasAlertaVence), ciclosVida: nn(f.ciclosVida),
      ivaPct: C.pctIva(f.tarifaIva) === null ? '' : C.pctIva(f.tarifaIva),
      tarifaIvaVenta: f.tarifaIvaVenta || '',
      proveedores: f.proveedores.filter((y) => y.proveedorId).map((y) => ({ proveedorId: y.proveedorId, referencia: String(y.referencia || '').trim(), precio: nn(y.precio), leadTime: nn(y.leadTime) })),
      cuentas: Object.fromEntries(Object.entries(f.cuentas || {}).filter(([, v]) => v))
    });
    if (!esMed) Object.assign(p, { principioActivo: '', concentracion: '', formaFarmaceutica: '', viaAdministracion: '', controlEspecial: false, ium: '', atc: '' });
    if (!esDisp) Object.assign(p, { implantable: false });
    const e = C.validarProducto(db, p);
    const filasLote = nuevosLotes.filter((l) => l.lote || l.vence || l.cantidad);
    filasLote.forEach((l, i) => {
      const n = 'Lote ' + (i + 1) + ': ';
      if (p.controlaLote !== false && !String(l.lote).trim()) e.push(n + 'escriba el número de lote.');
      if (p.controlaVence !== false && !C.isISODate(l.vence)) e.push(n + 'indique la fecha de vencimiento.');
      if (l.fabricado && l.vence && l.fabricado >= l.vence) e.push(n + 'la fabricación debe ser anterior al vencimiento.');
      if (p.id && C.buscarLote(db, p.id, l.lote)) e.push(n + 'el lote ' + l.lote + ' ya existe para este producto.');
      if (filasLote.some((x, j) => j !== i && x.lote.trim().toUpperCase() === l.lote.trim().toUpperCase() && x.bodega === l.bodega)) e.push(n + 'está repetido.');
      if (Number(l.cantidad) > 0 && (l.costoUnit === '' || Number(l.costoUnit) < 0)) e.push(n + 'indique el costo unitario de la existencia inicial.');
      if (Number(l.cantidad) < 0) e.push(n + 'la cantidad no puede ser negativa.');
    });
    if (e.length) { setErr(e); const m = document.querySelector('.modal-body'); if (m) m.scrollTop = 0; return; }
    const nuevo = !p.id;
    if (nuevo) p.id = C.nuevoId();
    const lotesMaestro = filasLote.map((l) => ({ id: C.nuevoId() + Math.random().toString(36).slice(2, 5), productoId: p.id, lote: l.lote.trim(), fabricado: l.fabricado, vence: l.vence, estado: 'liberado', origen: 'Ficha del producto', creado: new Date().toISOString() }));
    const conStock = filasLote.filter((l) => Number(l.cantidad) > 0);
    let mov = null;
    if (conStock.length) {
      mov = { id: C.nuevoId(), tipo: 'inicial', fecha: hoy, bodega: C.bodegaPrincipal(db.config), acta: 'Existencia inicial al crear el producto', autoriza: nombreUsuario, usuario: nombreUsuario, creado: new Date().toISOString(),
        lineas: conStock.map((l) => ({ productoId: p.id, bodega: l.bodega, lote: l.lote.trim(), vence: l.vence, cantidad: Number(l.cantidad), costoUnit: Number(l.costoUnit) })) };
      const proy = Object.assign({}, db, { productos: db.productos.filter((x) => x.id !== p.id).concat([p]), lotes: db.lotes.concat(lotesMaestro) });
      const ev = C.validarMovimiento(proy, mov, hoy);
      if (ev.length) return setErr(ev);
    }
    const numero = mov ? C.verNumero(db, 'inicial') : '';
    commit((d) => {
      const i = d.productos.findIndex((x) => x.id === p.id);
      if (i >= 0) d.productos[i] = p; else d.productos.push(p);
      d.lotes.push(...lotesMaestro);
      if (mov) d.movimientos.push(Object.assign({}, mov, { num: C.siguienteNumero(d, 'inicial'), orden: C.siguienteOrden(d) }));
    }, nuevo ? 'Producto creado' : 'Producto modificado', p.codigo + ' · ' + p.nombre + (lotesMaestro.length ? ' · ' + lotesMaestro.length + ' lote(s)' : '') + (numero ? ' · ' + numero : ''));
    toast((nuevo ? 'Producto creado' : 'Producto actualizado') + (lotesMaestro.length ? ' con ' + lotesMaestro.length + ' lote(s)' : '') + (numero ? ' y existencia inicial ' + numero : ''));
    onClose();
  };

  const opt = (obj, vacio) => <>{vacio !== undefined && <option value="">{vacio}</option>}{Object.entries(obj).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</>;
  const tituloNuevo = { insumo: 'insumo', producto: 'producto', medicamento: 'medicamento', dispositivo: 'dispositivo médico', equipo: 'equipo biomédico' }[f.clasificacion] || 'producto';
  const tarifaGrupoC = f.grupoId ? C.datoGrupo(db, f.grupoId, 'tarifaIvaCompra') : '';
  const tarifaGrupoV = f.grupoId ? C.datoGrupo(db, f.grupoId, 'tarifaIvaVenta') : '';
  const Sec = ({ id, children, extra }) => <div className="section-title" id={'fp-' + id} style={id === 'ident' ? { marginTop: 0 } : undefined}>{children}{extra}</div>;

  return (
    <Modal open title={f.id ? 'Ficha del producto ' + f.codigo : 'Nuevo ' + tituloNuevo} icon={Boxes} onClose={onClose} wide
      footer={<><span className="muted small" style={{ marginRight: 'auto' }}>Los campos con * son obligatorios</span><Btn onClick={onClose}>Cancelar</Btn><Btn variant="primary" onClick={guardar}>Guardar</Btn></>}>
      <div className="fp-nav">{SECCIONES.map(([k, t]) => <button key={k} type="button" className="chip cyan" onClick={() => ir(k)}>{t}</button>)}</div>
      <Errores lista={err} />

      <Sec id="ident">Identificación</Sec>
      <div className="fp-ident">
        <div className="fp-foto">
          {f.foto ? <img src={f.foto} alt="Foto del producto" /> : <span className="muted small">Sin foto</span>}
          <label className="btn sm"><ImagePlus size={14} /> {f.foto ? 'Cambiar' : 'Agregar foto'}<input type="file" accept="image/*" hidden onChange={subirFoto} /></label>
          {f.foto && <button type="button" className="btn ghost sm" onClick={() => setF((x) => Object.assign({}, x, { foto: '' }))}>Quitar</button>}
        </div>
        <div className="form-grid">
          <Field label="Código *"><input className="input mono" value={f.codigo} onChange={set('codigo')} autoFocus /></Field>
          <Field label="Código alterno" hint="Del sistema anterior o del proveedor"><input className="input mono" value={f.codigoAlterno} onChange={set('codigoAlterno')} /></Field>
          <Field label="Nombre o descripción" span><input className="input" value={f.nombre} onChange={set('nombre')} placeholder="Nombre genérico, presentación y tamaño" /></Field>
          <Field label="Nombre comercial"><input className="input" value={f.nombreComercial} onChange={set('nombreComercial')} /></Field>
          <Field label="Clasificación *"><select className="select input" value={f.clasificacion} onChange={set('clasificacion')}>{C.CLASIF_PRODUCTO.map((k) => <option key={k} value={k}>{C.CLASIFICACIONES[k]}</option>)}</select></Field>
          <Field label="Grupo" span hint={db.grupos.some((g) => C.clasificacionGrupo(db, g.id) === f.clasificacion) ? (f.grupoId && C.datoGrupo(db, f.grupoId, 'manejaEsterilizacion') ? 'Este grupo maneja esterilización' : 'Solo aparecen los grupos de ' + C.CLASIFICACIONES[f.clasificacion].toLowerCase()) : 'No hay grupos de ' + C.CLASIFICACIONES[f.clasificacion].toLowerCase() + ': créelos en Productos y servicios › Grupos'}>
            <SelectGrupo value={f.grupoId} onChange={setV('grupoId')} clasificaciones={[f.clasificacion]} placeholder="Escriba el grupo…" />
          </Field>
          <Field label="Tipo de material"><select className="select input" value={f.tipoMaterial} onChange={set('tipoMaterial')}>{opt(C.TIPOS_MATERIAL)}</select></Field>
          <Field label="Categoría sanitaria"><select className="select input" value={f.categoria} onChange={set('categoria')}>{opt(C.CATEGORIAS)}</select></Field>
          <Field label="Marca">
            <input className="input" value={f.marca} onChange={set('marca')} list="marcas-lista" />
            <datalist id="marcas-lista">{marcas.map((m) => <option key={m} value={m} />)}</datalist>
          </Field>
          <Field label="Referencia del fabricante"><input className="input mono" value={f.referencia} onChange={set('referencia')} /></Field>
          <Field label="Fabricante">
            <input className="input" value={f.fabricante} onChange={set('fabricante')} list="fabricantes-lista" />
            <datalist id="fabricantes-lista">{fabricantes.map((m) => <option key={m} value={m} />)}</datalist>
          </Field>
          <Field label="Presentación"><input className="input" value={f.presentacion} onChange={set('presentacion')} placeholder="Ej.: Jeringa 4 g" /></Field>
          <Field label="GTIN / código de barras" hint={f.gtin ? (gtinOk ? 'Código GS1 válido' : 'El dígito de control no corresponde') : 'Para leer el código GS1 / UDI al recibir'}>
            <input className={'input mono' + (gtinOk ? '' : ' invalid')} value={f.gtin} onChange={set('gtin')} inputMode="numeric" />
          </Field>
          <Field label="Descripción u observaciones" full><textarea className="input" rows={2} value={f.descripcion} onChange={set('descripcion')} placeholder="Indicaciones de uso, cuidados, sustitutos…" /></Field>
        </div>
      </div>

      <Sec id="sanitaria">Información sanitaria</Sec>
      <div className="form-grid">
        <Field label="Requiere registro INVIMA"><label className="check"><input type="checkbox" checked={!!f.requiereInvima} onChange={set('requiereInvima')} /> Sí, es un producto regulado</label></Field>
        <Field label="Registro sanitario INVIMA"><input className="input mono" value={f.invima} onChange={set('invima')} placeholder={esMed ? 'INVIMA 2024M-0000000' : 'INVIMA 2024DM-0000000'} /></Field>
        <Field label="Vence el registro"><input className="input" type="date" value={f.invimaVence} onChange={set('invimaVence')} /></Field>
        {!esMed && <Field label="Clasificación por riesgo" hint="Dec. 4725/2005"><select className="select input" value={f.riesgo} onChange={set('riesgo')}>{C.RIESGOS.map((r) => <option key={r}>{r}</option>)}</select></Field>}
      </div>
      {esMed && (<>
        <div className="sub-title">Medicamento (Res. 1403/2007)</div>
        <div className="form-grid">
          <Field label="Principio activo *" span><input className="input" value={f.principioActivo} onChange={set('principioActivo')} placeholder="Ej.: Lidocaína clorhidrato + epinefrina" /></Field>
          <Field label="Concentración *"><input className="input" value={f.concentracion} onChange={set('concentracion')} placeholder="Ej.: 2 % + 1:80.000" /></Field>
          <Field label="Forma farmacéutica *"><select className="select input" value={f.formaFarmaceutica} onChange={set('formaFarmaceutica')}>{opt(C.FORMAS_FARMACEUTICAS, '—')}</select></Field>
          <Field label="Vía de administración"><select className="select input" value={f.viaAdministracion} onChange={set('viaAdministracion')}>{opt(C.VIAS_ADMIN, '—')}</select></Field>
          <Field label="CUM" hint="Código único de medicamentos (INVIMA)"><input className="input mono" value={f.cum} onChange={set('cum')} placeholder="19900000-01" /></Field>
          <Field label="IUM" hint="Identificador único de medicamentos"><input className="input mono" value={f.ium} onChange={set('ium')} /></Field>
          <Field label="Código ATC"><input className="input mono" value={f.atc} onChange={set('atc')} placeholder="N01BB52" /></Field>
          <Field label="Control especial"><label className="check"><input type="checkbox" checked={!!f.controlEspecial} onChange={set('controlEspecial')} /> Medicamento de control especial (FNE)</label></Field>
        </div>
      </>)}
      {esDisp && (<>
        <div className="sub-title">Dispositivo médico e instrumental</div>
        <div className="form-grid">
          <Field label="Uso"><select className="select input" value={f.usoUnico ? 'unico' : 'reutilizable'} onChange={(e) => setF((x) => Object.assign({}, x, { usoUnico: e.target.value === 'unico' }))}><option value="unico">Uso único (desechable)</option><option value="reutilizable">Reutilizable</option></select></Field>
          <Field label="Esterilidad"><label className="check"><input type="checkbox" checked={!!f.esteril} onChange={set('esteril')} /> Viene estéril</label></Field>
          <Field label="Método de esterilización"><select className="select input" value={f.metodoEsterilizacion} onChange={set('metodoEsterilizacion')}>{opt(C.ESTERILIZACION, '—')}</select></Field>
          {!f.usoUnico && <Field label="Vida útil en ciclos" hint="Ciclos de esterilización antes de dar de baja"><input className="input" type="number" min="0" value={f.ciclosVida} onChange={set('ciclosVida')} /></Field>}
          <Field label="Implantable" hint="Exige lote y salida a un paciente identificado (Res. 4816/2008)"><label className="check"><input type="checkbox" checked={!!f.implantable} onChange={set('implantable')} /> Es un dispositivo implantable</label></Field>
        </div>
      </>)}

      <Sec id="almac">Almacenamiento y vencimiento</Sec>
      <div className="form-grid">
        <Field label="Unidad de medida (consumo) *">
          <input className="input" value={f.unidad} onChange={set('unidad')} list="unidades-lista" />
          <datalist id="unidades-lista">{C.UNIDADES.map((u) => <option key={u} value={u} />)}</datalist>
        </Field>
        <Field label="Bodega habitual"><SelectBodega value={f.ubicacion} onChange={setV('ubicacion')} /></Field>
        <Field label="Ubicación física" hint="Estante, gaveta o posición"><input className="input" value={f.ubicacionFisica} onChange={set('ubicacionFisica')} placeholder="Ej.: Estante A-3" /></Field>
        <Field label="Controles">
          <label className="check"><input type="checkbox" checked={f.controlaLote !== false} onChange={set('controlaLote')} /> Maneja lote</label>
          <label className="check"><input type="checkbox" checked={f.controlaVence !== false} onChange={set('controlaVence')} disabled={f.controlaLote === false} /> Maneja fecha de vencimiento</label>
        </Field>
        <Field label="Cadena de frío"><label className="check"><input type="checkbox" checked={!!f.cadenaFrio} onChange={set('cadenaFrio')} /> Requiere refrigeración</label></Field>
        <Field label="Temperatura mínima (°C)"><input className="input" type="number" value={f.tempMin} onChange={set('tempMin')} placeholder="Opcional" /></Field>
        <Field label="Temperatura máxima (°C)"><input className="input" type="number" value={f.tempMax} onChange={set('tempMax')} placeholder="Ej.: 25" /></Field>
        <Field label="Luz"><label className="check"><input type="checkbox" checked={!!f.fotosensible} onChange={set('fotosensible')} /> Proteger de la luz</label></Field>
        <Field label="Condiciones especiales" span><input className="input" value={f.condiciones} onChange={set('condiciones')} placeholder="Ej.: mantener cerrado, lejos de fuentes de calor" /></Field>
        {f.controlaVence !== false && (<>
          <Field label="Vida útil total (meses)" hint="Desde la fabricación"><input className="input" type="number" min="0" value={f.vidaUtilMeses} onChange={set('vidaUtilMeses')} placeholder="Opcional" /></Field>
          <Field label="Vida útil mínima al recibir (días)" hint="Entradas con menos días se rechazan (recepción técnica)"><input className="input" type="number" min="0" value={f.vidaMinRecepcion} onChange={set('vidaMinRecepcion')} placeholder="Opcional" /></Field>
          <Field label="Alerta de vencimiento (días)" hint={'Vacío = la general (' + db.config.semaforo.rojo + ' días)'}><input className="input" type="number" min="0" value={f.diasAlertaVence} onChange={set('diasAlertaVence')} /></Field>
        </>)}
      </div>

      <Sec id="repos">Reposición</Sec>
      <div className="form-grid">
        <Field label="Política de reposición" span><select className="select input" value={f.politica} onChange={set('politica')}>{opt(C.POLITICAS_REPOSICION)}</select></Field>
        <Field label="Stock mínimo" hint="Según uso y esterilización (Res. 3100)"><input className="input" type="number" min="0" value={f.stockMin} onChange={set('stockMin')} /></Field>
        <Field label="Stock de seguridad"><input className="input" type="number" min="0" value={f.stockSeguridad} onChange={set('stockSeguridad')} placeholder="Opcional" /></Field>
        <Field label="Punto de reorden" hint={f.politica === 'consumo' ? 'Vacío = calculado con el consumo y los días de entrega' : 'Vacío = el stock mínimo'}><input className="input" type="number" min="0" value={f.puntoReorden} onChange={set('puntoReorden')} placeholder="Automático" /></Field>
        <Field label={'Stock máximo' + (f.politica === 'minmax' ? ' *' : '')}><input className="input" type="number" min="0" value={f.stockMax} onChange={set('stockMax')} placeholder="Opcional" /></Field>
        <Field label="Cantidad mínima de pedido" hint="En unidad de consumo"><input className="input" type="number" min="0" value={f.cantidadMinPedido} onChange={set('cantidadMinPedido')} placeholder="Opcional" /></Field>
        <Field label="Unidad de compra" hint="Ej.: caja x50. Vacío si se compra igual que se consume"><input className="input" value={f.unidadCompra} onChange={set('unidadCompra')} /></Field>
        <Field label="Unidades de consumo por unidad de compra"><input className="input" type="number" min="1" value={f.factorCompra} onChange={set('factorCompra')} /></Field>
      </div>

      <Sec id="provs">Proveedores y precios pactados</Sec>
      <div className="form-grid">
        <Field label="Proveedor preferido" span><SelectTercero tipo="proveedor" value={f.proveedorId} onChange={setV('proveedorId')} /></Field>
        <Field label="Días de entrega del proveedor" hint="Para el punto de reorden"><input className="input" type="number" min="0" value={f.leadTime} onChange={set('leadTime')} /></Field>
        {sp && <Field label="Último costo de compra"><input className="input" value={money(sp.ultimoCosto || 0)} readOnly /></Field>}
      </div>
      {f.proveedores.length > 0 && (
        <div className="tbl-wrap fp-provs">
          <table className="tbl">
            <thead><tr><th style={{ minWidth: 240 }}>Proveedor</th><th>Referencia del proveedor</th><th className="num">Precio pactado</th><th className="num">Días de entrega</th><th /></tr></thead>
            <tbody>{f.proveedores.map((y, i) => (
              <tr key={i}>
                <td><SelectTercero tipo="proveedor" value={y.proveedorId} onChange={(v) => setProv(i, 'proveedorId', v)} /></td>
                <td><input className="input mono" value={y.referencia || ''} onChange={(e) => setProv(i, 'referencia', e.target.value)} /></td>
                <td><input className="input num" type="number" min="0" value={y.precio ?? ''} onChange={(e) => setProv(i, 'precio', e.target.value)} style={{ width: 130 }} /></td>
                <td><input className="input num" type="number" min="0" value={y.leadTime ?? ''} onChange={(e) => setProv(i, 'leadTime', e.target.value)} style={{ width: 90 }} /></td>
                <td><Btn variant="ghost" size="sm" icon={Trash2} onClick={() => setF((x) => Object.assign({}, x, { proveedores: x.proveedores.filter((_, j) => j !== i) }))} /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <div className="toolbar" style={{ marginTop: 8 }}><Btn size="sm" icon={Plus} onClick={() => setF((x) => Object.assign({}, x, { proveedores: [...x.proveedores, { proveedorId: '', referencia: '', precio: '', leadTime: '' }] }))}>Agregar proveedor y precio</Btn></div>
      <Nota>El precio pactado se propone solo al hacer la orden de compra a ese proveedor. Sin precio pactado se propone el último costo de compra.</Nota>

      <Sec id="ventas">Precio de venta e IVA</Sec>
      <div className="form-grid">
        <Field label="IVA en compras" hint="Medicamentos y varios dispositivos médicos están excluidos (ET art. 424). Confírmelo con su contador.">
          <select className="select input" value={f.tarifaIva} onChange={set('tarifaIva')}>{opt(C.TARIFAS_IVA, tarifaGrupoC ? 'La del grupo: ' + C.TARIFAS_IVA[tarifaGrupoC] : 'Sin definir (usa el IVA general de la factura)')}</select>
        </Field>
        <Field label="IVA en ventas">
          <select className="select input" value={f.tarifaIvaVenta} onChange={set('tarifaIvaVenta')}>{opt(Object.fromEntries(Object.entries(C.TARIFAS_IVA).filter(([k]) => k !== '19nd')), tarifaGrupoV ? 'La del grupo: ' + C.TARIFAS_IVA[tarifaGrupoV] : 'Sin definir')}</select>
        </Field>
        <Field label="Precio de venta o tarifa" hint="Si el insumo se factura al paciente o se vende"><input className="input" type="number" min="0" value={f.precioVenta} onChange={set('precioVenta')} placeholder="Opcional" /></Field>
        <Field label="Costo promedio actual"><input className="input" value={money(costoProm)} readOnly /></Field>
        <Field label="Margen sobre el precio"><input className={'input' + (margen !== null && margen < 0 ? ' invalid' : '')} value={margen === null ? '—' : margen + ' %'} readOnly /></Field>
      </div>

      <Sec id="conta">Contabilidad y valoración (NIC 2 / Sección 13)</Sec>
      <div className="form-grid">
        <Field label="Cuenta de inventario" hint={'Vacío = ' + heredada('inventario')}><SelectCuenta value={f.cuentas.inventario || ''} onChange={setCta('inventario')} placeholder="Heredada" /></Field>
        <Field label="Cuenta de costo por consumo" hint={'Vacío = ' + heredada('costoConsumo')}><SelectCuenta value={f.cuentas.costoConsumo || ''} onChange={setCta('costoConsumo')} placeholder="Heredada" /></Field>
        <Field label="Cuenta de costo de venta" hint={'Vacío = ' + heredada('costoVenta')}><SelectCuenta value={f.cuentas.costoVenta || ''} onChange={setCta('costoVenta')} placeholder="Heredada" /></Field>
        <Field label="Valor neto realizable unitario" hint="Si es menor que el costo, el cierre registra deterioro">
          <input className="input" type="number" min="0" value={f.vnrUnit} onChange={set('vnrUnit')} placeholder="Opcional" />
        </Field>
        <Field label="Plan de cuentas"><button type="button" className="btn sm" onClick={() => { onClose(); go('plan'); }}>Ir al plan de cuentas</button></Field>
      </div>

      <Sec id="lotes">Lotes y existencia inicial</Sec>
      {lotesExistentes.length > 0 && (
        <div className="tbl-wrap" style={{ marginBottom: 10 }}>
          <table className="tbl">
            <thead><tr><th>Lote</th><th>Fabricación</th><th>Vencimiento</th><th>Estado</th><th className="num">Existencia</th></tr></thead>
            <tbody>{lotesExistentes.map((l) => <tr key={l.id}><td className="mono">{l.lote}</td><td>{fecha(l.fabricado)}</td><td>{fecha(l.vence)}</td><td>{C.ESTADOS_LOTE[l.estado] || l.estado}</td><td className="num">{num(stockLote(l.lote))}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      {nuevosLotes.length > 0 && (
        <div className="tbl-wrap lines">
          <table className="tbl">
            <thead><tr><th>Número de lote</th><th>Fabricación</th><th>Vencimiento</th>{!conMovimientos && <><th>Bodega</th><th className="num">Cantidad inicial</th><th className="num">Costo unitario</th></>}<th /></tr></thead>
            <tbody>
              {nuevosLotes.map((l, i) => (
                <tr key={i}>
                  <td><input className="input mono" value={l.lote} onChange={(e) => setLote(i, 'lote', e.target.value)} placeholder="Ej.: L2409A" style={{ minWidth: 120 }} /></td>
                  <td><input className="input" type="date" value={l.fabricado} max={hoy} onChange={(e) => setLote(i, 'fabricado', e.target.value)} /></td>
                  <td><input className="input" type="date" value={l.vence} onChange={(e) => setLote(i, 'vence', e.target.value)} /></td>
                  {!conMovimientos && <>
                    <td style={{ minWidth: 190 }}><SelectBodega value={l.bodega} onChange={(v) => setLote(i, 'bodega', v)} /></td>
                    <td><input className="input num" type="number" min="0" value={l.cantidad} onChange={(e) => setLote(i, 'cantidad', e.target.value)} placeholder="0" style={{ width: 100 }} /></td>
                    <td><input className="input num" type="number" min="0" value={l.costoUnit} onChange={(e) => setLote(i, 'costoUnit', e.target.value)} style={{ width: 120 }} /></td>
                  </>}
                  <td><Btn variant="ghost" size="sm" icon={Trash2} onClick={() => setNuevosLotes((ls) => ls.filter((_, j) => j !== i))} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="toolbar" style={{ marginTop: 10 }}>
        <Btn size="sm" icon={Plus} onClick={() => setNuevosLotes((ls) => [...ls, loteVacio()])}>Agregar lote</Btn>
      </div>
      <Nota>{conMovimientos
        ? 'Este producto ya tiene movimientos: aquí puede registrar lotes nuevos (por ejemplo, antes de que llegue el pedido). Las cantidades entran por Entradas o por el inventario físico.'
        : 'Si ya tiene este producto en bodega, escriba la cantidad y el costo de cada lote: el sistema registra la existencia inicial con fecha de hoy. Si la deja vacía, el lote queda creado y la existencia entra con la primera compra.'}</Nota>

      <div className="section-title">Estado</div>
      <div className="toolbar">
        <label className="check" style={{ marginRight: 18 }}><input type="checkbox" checked={f.activo !== false} onChange={set('activo')} /> Producto activo</label>
        <label className="check"><input type="checkbox" checked={!!f.bloqueoCompras} onChange={set('bloqueoCompras')} /> Bloqueado para compras (no entra en órdenes, entradas ni sugerencias)</label>
      </div>
    </Modal>
  );
}

export default function Productos({ arg }) {
  const { db, state, hoy, go, puede } = useStore();
  const [q, setQ] = useState('');
  const [tipo, setTipo] = useState('todos');
  const [grupo, setGrupo] = useState(arg && arg.startsWith('grupo:') ? arg.slice(6) : 'todos');
  const [estado, setEstado] = useState('activos');
  const [editar, setEditar] = useState(null);
  const [elegir, setElegir] = useState(arg === 'nuevo');
  const enGrupo = grupo !== 'todos' && grupo !== 'sin' ? C.gruposDescendientes(db, grupo) : null;
  const lista = db.productos.filter((p) =>
    (estado === 'todos' || (estado === 'activos' ? p.activo !== false : p.activo === false)) &&
    (tipo === 'todos' || C.clasificacionProducto(db, p) === tipo) &&
    (grupo === 'todos' || (grupo === 'sin' ? !C.rutaGrupo(db, p.grupoId) : enGrupo.has(p.grupoId))) &&
    norm([p.nombre, p.nombreComercial, p.codigo, p.codigoAlterno, p.invima, p.gtin, p.marca, p.referencia, p.cum, p.principioActivo, p.fabricante, C.rutaGrupo(db, p.grupoId)].join(' ')).includes(norm(q)))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  const exportar = () => {
    // Mismas columnas que la plantilla de carga: el archivo exportado se puede corregir y volver a cargar.
    const rows = [['Código', 'Código alterno', 'Nombre', 'Categoría', 'Tipo de material', 'Clasificación', 'Grupo', 'Marca', 'Referencia', 'Fabricante', 'Presentación', 'Unidad', 'Unidad de compra', 'Factor', 'Stock mínimo', 'Stock máximo', 'Proveedor', 'Días de entrega', 'Tarifa IVA', 'Precio de venta', 'Ubicación física', 'Registro INVIMA', 'Vence INVIMA', 'Riesgo', 'GTIN', 'Principio activo', 'Concentración', 'Forma farmacéutica', 'CUM', 'Cadena de frío', 'Implantable', 'Existencia', 'Costo promedio', 'Valor', 'Activo']];
    lista.forEach((p) => {
      const s = state.prods[p.id];
      const pv = db.proveedores.find((t) => t.id === p.proveedorId);
      rows.push([p.codigo, p.codigoAlterno || '', p.nombre, C.CATEGORIAS[p.categoria], C.TIPOS_MATERIAL[p.tipoMaterial] || '', C.CLASIFICACIONES[C.clasificacionProducto(db, p)], (db.grupos.find((g) => g.id === p.grupoId) || {}).nombre || '', p.marca || '', p.referencia || '', p.fabricante || '', p.presentacion || '', p.unidad, p.unidadCompra || '', p.factorCompra || 1, p.stockMin, p.stockMax || '', pv ? pv.nit : '', p.leadTime || '', p.tarifaIva ? C.TARIFAS_IVA[p.tarifaIva] : '', p.precioVenta || '', p.ubicacionFisica || '', p.invima || '', p.invimaVence || '', p.riesgo, p.gtin || '', p.principioActivo || '', p.concentracion || '', p.formaFarmaceutica ? C.FORMAS_FARMACEUTICAS[p.formaFarmaceutica] : '', p.cum || '', p.cadenaFrio ? 'Sí' : 'No', p.implantable ? 'Sí' : 'No', s ? s.qty : 0, s && s.qty ? C.r2(s.value / s.qty) : 0, s ? s.value : 0, p.activo !== false ? 'Sí' : 'No']);
    });
    descargar('productos-' + hoy + '.csv', C.csv(rows));
  };

  return (
    <Panel title="Maestro de productos" icon={Boxes} sub={num(lista.length) + ' productos'}
      actions={<><Btn icon={Download} onClick={exportar}>Exportar</Btn>{puede('importar') && <Btn icon={FileSpreadsheet} onClick={() => go('importar', 'productos')} title="Crear o actualizar muchos productos y sus existencias con un archivo Excel o CSV">Cargar desde Excel</Btn>}{puede('maestros') && <Btn variant="primary" icon={Plus} onClick={() => setElegir(true)}>Nuevo</Btn>}</>}>
      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Nombre, código, marca, referencia, principio activo, código de barras, INVIMA" />
        <div style={{ width: 300, maxWidth: '100%' }}><SelectGrupo value={grupo} onChange={setGrupo} incluirTodos incluirSin clasificaciones={C.CLASIF_PRODUCTO} /></div>
        <select className="select input" value={tipo} onChange={(e) => setTipo(e.target.value)} style={{ maxWidth: 230 }}>
          <option value="todos">Todas las clasificaciones</option>
          {C.CLASIF_PRODUCTO.map((k) => <option key={k} value={k}>{C.CLASIFICACIONES[k]}</option>)}
        </select>
        <Tabs value={estado} onChange={setEstado} options={[['activos', 'Activos'], ['inactivos', 'Inactivos'], ['todos', 'Todos']]} />
      </div>
      {lista.length ? (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Código</th><th>Producto</th><th>Clasificación</th><th className="num">Existencia</th><th className="num">Costo prom.</th><th className="num">Valor</th><th>INVIMA</th><th /></tr>
            </thead>
            <tbody>
              {lista.map((p) => {
                const s = state.prods[p.id];
                const qty = s ? s.qty : 0;
                const ei = INVIMA[C.estadoInvima(p, hoy, db.config)];
                const bajo = Number(p.stockMin) > 0 && qty < Number(p.stockMin);
                return (
                  <tr key={p.id} style={p.activo === false ? { opacity: 0.5 } : undefined}>
                    <td className="mono">{p.codigo}{p.codigoAlterno ? <div className="small muted">{p.codigoAlterno}</div> : null}</td>
                    <td><div className="prod-cell">
                      {p.foto && <img className="prod-thumb" src={p.foto} alt="" />}
                      <div>
                        <div className="strong">{p.nombre} {p.cadenaFrio && <Snowflake size={13} className="cyan-t" />}</div>
                        <div className="small muted">{[p.marca, p.referencia, p.presentacion, p.principioActivo && p.principioActivo + (p.concentracion ? ' ' + p.concentracion : '')].filter(Boolean).join(' · ') || C.TIPOS_MATERIAL[p.tipoMaterial] || ''}</div>
                        <div className="stockbod">{Object.entries(C.existenciasPorBodega(db, state, p.id)).filter(([, v]) => v > 0).map(([b, v]) => <span key={b}>{b}: {num(v)}</span>)}</div>
                        {(p.implantable || p.controlEspecial || p.bloqueoCompras || p.tarifaIva === 'excluido') && (
                          <div className="toolbar" style={{ gap: 4, marginTop: 4 }}>
                            {p.implantable && <Chip tone="violet">Implantable</Chip>}
                            {p.controlEspecial && <Chip tone="magenta">Control especial</Chip>}
                            {p.tarifaIva === 'excluido' && <Chip tone="muted">Excluido de IVA</Chip>}
                            {p.bloqueoCompras && <Chip tone="red"><Ban size={11} /> Bloqueado para compras</Chip>}
                          </div>
                        )}
                      </div>
                    </div></td>
                    <td className="small">{C.rutaGrupo(db, p.grupoId) || <span className="muted">Sin grupo</span>}<div className="muted">{C.CLASIFICACIONES[C.clasificacionProducto(db, p)]}</div></td>
                    <td className={'num' + (bajo ? ' red-t' : '')}>{num(qty)} <span className="muted small">{p.unidad}</span><div className="small muted">mín. {num(p.stockMin)}{p.stockMax ? ' · máx. ' + num(p.stockMax) : ''}</div></td>
                    <td className="num">{money(qty > 0 ? s.value / qty : s?.ultimoCosto || 0)}</td>
                    <td className="num">{money(s ? s.value : 0)}</td>
                    <td><Chip tone={ei.tono} title={p.invima ? p.invima + (p.invimaVence ? ' · vence ' + fecha(p.invimaVence) : '') : ''}>{ei.texto}</Chip><div className="small muted">Riesgo {p.riesgo}</div></td>
                    <td className="acts">
                      <Btn variant="ghost" size="sm" icon={ScrollText} onClick={() => go('kardex', p.id)} title="Ver kardex" />
                      {puede('maestros') && <Btn variant="ghost" size="sm" icon={Pencil} onClick={() => setEditar(p)} title="Editar" />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <Empty icon={Boxes} title="Sin productos" text="Cree el primer producto o cambie el filtro." />}
      {editar && <FormProducto inicial={editar} onClose={() => setEditar(null)} />}
      {elegir && (
        <Modal open title="¿Qué desea crear?" icon={Plus} onClose={() => setElegir(false)}>
          <div className="choose">
            {TIPOS_CREAR.map(([k, t, s, Icon, c1, c2]) => (
              <button key={k} type="button" className="tile" style={{ '--c1': c1, '--c2': c2 }}
                onClick={() => { setElegir(false); if (k === 'servicio') go('kits', 'nuevo'); else setEditar(Object.assign({}, DATOS_CLASIF[k])); }}>
                <span className="orb"><Icon size={34} strokeWidth={1.7} /></span>
                <span className="tile-t">{t}</span>
                <span className="tile-s">{s}</span>
              </button>
            ))}
          </div>
          <div style={{ marginTop: 16 }}><Nota>Son las mismas clasificaciones de los grupos. Insumos, productos, medicamentos, dispositivos y equipos tienen existencias, lotes y kardex; los procedimientos y servicios no tienen existencia: tienen precio, código CUPS y los insumos que consumen.</Nota></div>
        </Modal>
      )}
    </Panel>
  );
}
