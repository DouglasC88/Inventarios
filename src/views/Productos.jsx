import { useState } from 'react';
import { Boxes, Download, Pencil, Pill, Plus, ScrollText, Snowflake, Stethoscope, Syringe, Trash2, Wrench, Package } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { SelectBodega, SelectGrupo, SelectTercero } from '../components/Movimientos.jsx';
import { Btn, Chip, Empty, Errores, Field, Modal, Nota, Panel, SearchBox, Tabs } from '../components/ui.jsx';
import { descargar, money, num, fecha, INVIMA } from '../format.js';

const VACIO = {
  codigo: '', codigoAlterno: '', nombre: '', categoria: 'dispositivo', tipoMaterial: 'consumible', grupoId: '', marca: '', referencia: '', presentacion: '',
  unidad: 'unidad', stockMin: 0, stockMax: '', ubicacion: '', ubicacionFisica: '', fabricante: '', gtin: '', cum: '',
  requiereInvima: true, invima: '', invimaVence: '', riesgo: 'I', cadenaFrio: false, controlaLote: true, controlaVence: true,
  vnrUnit: '', ivaPct: '', precioVenta: '', activo: true, unidadCompra: '', factorCompra: 1, leadTime: 7, proveedorId: ''
};
const TIPOS_CREAR = [
  ['insumo', 'Insumo', 'Material de consumo (gasas, guantes, cepillos…)', Package, '#22d3ee', '#0ea5e9', { categoria: 'insumo', tipoMaterial: 'consumible', requiereInvima: false, riesgo: 'N/A' }],
  ['dispositivo', 'Dispositivo médico', 'Con registro INVIMA y clase de riesgo', Syringe, '#a78bfa', '#7c3aed', { categoria: 'dispositivo', tipoMaterial: 'dispositivo', requiereInvima: true, riesgo: 'I' }],
  ['medicamento', 'Medicamento', 'Con registro INVIMA y código CUM', Pill, '#34d399', '#059669', { categoria: 'medicamento', tipoMaterial: 'medicamento', requiereInvima: true, riesgo: 'N/A' }],
  ['instrumental', 'Instrumental o equipo', 'Reutilizable, sin vencimiento', Wrench, '#fbbf24', '#f97316', { categoria: 'dispositivo', tipoMaterial: 'instrumental', requiereInvima: true, controlaVence: false }],
  ['servicio', 'Servicio', 'Procedimiento con precio, CUPS e insumos que consume', Stethoscope, '#f472b6', '#db2777', null]
];
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function FormProducto({ inicial, onClose }) {
  const { db, state, hoy, commit, toast, nombreUsuario } = useStore();
  const [f, setF] = useState(() => Object.assign({}, VACIO, { ubicacion: db.config.ubicaciones[0] || '' }, inicial || {}));
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
      if (k === 'categoria') n.requiereInvima = v !== 'insumo';
      return n;
    });
  };
  const setV = (k) => (v) => setF((x) => Object.assign({}, x, { [k]: v }));
  const marcas = [...new Set(db.productos.map((p) => p.marca).filter(Boolean))].sort();

  const guardar = () => {
    const e = [];
    if (!f.codigo.trim()) e.push('El código es obligatorio.');
    if (!f.nombre.trim()) e.push('El nombre es obligatorio.');
    if (db.productos.some((p) => p.id !== f.id && p.codigo.trim().toUpperCase() === f.codigo.trim().toUpperCase())) e.push('Ya existe un producto con ese código.');
    if (f.gtin && db.productos.some((p) => p.id !== f.id && p.gtin && p.gtin.replace(/^0+/, '') === f.gtin.replace(/^0+/, ''))) e.push('Otro producto ya tiene ese código de barras.');
    if (Number(f.stockMin) < 0) e.push('El stock mínimo no puede ser negativo.');
    if (f.stockMax !== '' && Number(f.stockMax) < Number(f.stockMin)) e.push('El stock máximo debe ser mayor o igual al mínimo.');
    if (f.invimaVence && !C.isISODate(f.invimaVence)) e.push('La fecha de vencimiento del registro no es válida.');
    if (f.vnrUnit !== '' && Number(f.vnrUnit) < 0) e.push('El valor neto realizable no puede ser negativo.');
    if (f.ivaPct !== '' && !(Number(f.ivaPct) >= 0 && Number(f.ivaPct) <= 100)) e.push('El IVA debe estar entre 0 y 100 %.');
    if (!(Number(f.factorCompra) >= 1)) e.push('El factor de la unidad de compra debe ser 1 o mayor.');
    if (Number(f.leadTime) < 0) e.push('Los días de entrega no pueden ser negativos.');
    const filasLote = nuevosLotes.filter((l) => l.lote || l.vence || l.cantidad);
    filasLote.forEach((l, i) => {
      const n = 'Lote ' + (i + 1) + ': ';
      if (f.controlaLote !== false && !String(l.lote).trim()) e.push(n + 'escriba el número de lote.');
      if (f.controlaVence !== false && !C.isISODate(l.vence)) e.push(n + 'indique la fecha de vencimiento.');
      if (l.fabricado && l.vence && l.fabricado >= l.vence) e.push(n + 'la fabricación debe ser anterior al vencimiento.');
      if (f.id && C.buscarLote(db, f.id, l.lote)) e.push(n + 'el lote ' + l.lote + ' ya existe para este producto.');
      if (filasLote.some((x, j) => j !== i && x.lote.trim().toUpperCase() === l.lote.trim().toUpperCase() && x.bodega === l.bodega)) e.push(n + 'está repetido.');
      if (Number(l.cantidad) > 0 && (l.costoUnit === '' || Number(l.costoUnit) < 0)) e.push(n + 'indique el costo unitario de la existencia inicial.');
      if (Number(l.cantidad) < 0) e.push(n + 'la cantidad no puede ser negativa.');
    });
    if (e.length) return setErr(e);
    const n = (v) => (v === '' || v === null || v === undefined ? '' : Number(v));
    const p = Object.assign({}, f, {
      codigo: f.codigo.trim(), nombre: f.nombre.trim(), stockMin: Number(f.stockMin) || 0, stockMax: n(f.stockMax),
      factorCompra: Number(f.factorCompra) || 1, leadTime: Number(f.leadTime) || 0, vnrUnit: n(f.vnrUnit), ivaPct: n(f.ivaPct), precioVenta: n(f.precioVenta)
    });
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

  return (
    <Modal open title={f.id ? 'Ficha del producto ' + f.codigo : 'Nuevo ' + ({ consumible: 'insumo', dispositivo: 'dispositivo médico', medicamento: 'medicamento', instrumental: 'instrumental o equipo' }[f.tipoMaterial] || 'producto')} icon={Boxes} onClose={onClose} wide
      footer={<><Btn onClick={onClose}>Cancelar</Btn><Btn variant="primary" onClick={guardar}>Guardar</Btn></>}>
      <Errores lista={err} />
      <div className="section-title" style={{ marginTop: 0 }}>Identificación</div>
      <div className="form-grid">
        <Field label="Código"><input className="input mono" value={f.codigo} onChange={set('codigo')} autoFocus /></Field>
        <Field label="Código alterno" hint="Código del sistema anterior o del proveedor"><input className="input mono" value={f.codigoAlterno} onChange={set('codigoAlterno')} /></Field>
        <Field label="Nombre o descripción" span><input className="input" value={f.nombre} onChange={set('nombre')} /></Field>
        <Field label="Clasificación (línea › grupo › subgrupo)" span hint={db.grupos.length ? '' : 'Cree la clasificación en Maestros › Clasificación'}>
          <SelectGrupo value={f.grupoId} onChange={setV('grupoId')} placeholder="Escriba la línea, grupo o subgrupo…" />
        </Field>
        <Field label="Tipo de material">
          <select className="select input" value={f.tipoMaterial} onChange={set('tipoMaterial')}>{Object.entries(C.TIPOS_MATERIAL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Field>
        <Field label="Categoría sanitaria">
          <select className="select input" value={f.categoria} onChange={set('categoria')}>{Object.entries(C.CATEGORIAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Field>
        <Field label="Marca">
          <input className="input" value={f.marca} onChange={set('marca')} list="marcas-lista" />
          <datalist id="marcas-lista">{marcas.map((m) => <option key={m} value={m} />)}</datalist>
        </Field>
        <Field label="Referencia del fabricante"><input className="input mono" value={f.referencia} onChange={set('referencia')} /></Field>
        <Field label="Fabricante"><input className="input" value={f.fabricante} onChange={set('fabricante')} /></Field>
        <Field label="Presentación"><input className="input" value={f.presentacion} onChange={set('presentacion')} placeholder="Ej.: Jeringa 4 g" /></Field>
        <Field label="GTIN / código de barras" hint="Para leer el código GS1 / UDI al recibir"><input className="input mono" value={f.gtin} onChange={set('gtin')} /></Field>
      </div>

      <div className="section-title">Almacenamiento y existencias</div>
      <div className="form-grid">
        <Field label="Unidad de medida (consumo)"><input className="input" value={f.unidad} onChange={set('unidad')} /></Field>
        <Field label="Stock mínimo" hint="Según uso y esterilización (Res. 3100)"><input className="input" type="number" min="0" value={f.stockMin} onChange={set('stockMin')} /></Field>
        <Field label="Stock máximo"><input className="input" type="number" min="0" value={f.stockMax} onChange={set('stockMax')} placeholder="Opcional" /></Field>
        <Field label="Bodega habitual"><SelectBodega value={f.ubicacion} onChange={setV('ubicacion')} /></Field>
        <Field label="Ubicación física" hint="Estante, gaveta o posición"><input className="input" value={f.ubicacionFisica} onChange={set('ubicacionFisica')} placeholder="Ej.: Estante A-3" /></Field>
        <Field label="Controles">
          <label className="check"><input type="checkbox" checked={f.controlaLote !== false} onChange={set('controlaLote')} /> Maneja lote</label>
          <label className="check"><input type="checkbox" checked={f.controlaVence !== false} onChange={set('controlaVence')} /> Maneja fecha de vencimiento</label>
        </Field>
      </div>

      <div className="section-title">Compras y reabastecimiento</div>
      <div className="form-grid">
        <Field label="Unidad de compra" hint="Ej.: caja x50. Vacío si se compra igual que se consume"><input className="input" value={f.unidadCompra} onChange={set('unidadCompra')} /></Field>
        <Field label="Unidades de consumo por unidad de compra"><input className="input" type="number" min="1" value={f.factorCompra} onChange={set('factorCompra')} /></Field>
        <Field label="Proveedor preferido" span><SelectTercero tipo="proveedor" value={f.proveedorId} onChange={setV('proveedorId')} /></Field>
        <Field label="Días de entrega del proveedor" hint="Para el punto de reorden"><input className="input" type="number" min="0" value={f.leadTime} onChange={set('leadTime')} /></Field>
        <Field label="IVA (%)" hint="Informativo; el IVA descontable no se suma al costo"><input className="input" type="number" min="0" max="100" value={f.ivaPct} onChange={set('ivaPct')} placeholder="Opcional" /></Field>
        <Field label="Precio de venta o tarifa" hint="Si el insumo se factura al paciente o se vende"><input className="input" type="number" min="0" value={f.precioVenta} onChange={set('precioVenta')} placeholder="Opcional" /></Field>
      </div>

      <div className="section-title">Información sanitaria</div>
      <div className="form-grid">
        <Field label="Requiere registro INVIMA"><label className="check"><input type="checkbox" checked={!!f.requiereInvima} onChange={set('requiereInvima')} /> Sí, es un producto regulado</label></Field>
        <Field label="Registro sanitario INVIMA"><input className="input mono" value={f.invima} onChange={set('invima')} placeholder="INVIMA 2024DM-0000000" /></Field>
        <Field label="Vence el registro"><input className="input" type="date" value={f.invimaVence} onChange={set('invimaVence')} /></Field>
        <Field label="Clasificación por riesgo">
          <select className="select input" value={f.riesgo} onChange={set('riesgo')}>{C.RIESGOS.map((r) => <option key={r}>{r}</option>)}</select>
        </Field>
        {f.categoria === 'medicamento' && <Field label="CUM" hint="Código único de medicamentos"><input className="input mono" value={f.cum} onChange={set('cum')} /></Field>}
        <Field label="Cadena de frío"><label className="check"><input type="checkbox" checked={!!f.cadenaFrio} onChange={set('cadenaFrio')} /> Requiere refrigeración</label></Field>
      </div>

      <div className="section-title">Lotes y existencia inicial</div>
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

      <div className="section-title">Valoración (NIC 2 / Sección 13)</div>
      <div className="form-grid">
        <Field label="Valor neto realizable unitario" hint="Si es menor que el costo, el cierre registra deterioro">
          <input className="input" type="number" min="0" value={f.vnrUnit} onChange={set('vnrUnit')} placeholder="Opcional" />
        </Field>
        <Field label="Estado"><label className="check"><input type="checkbox" checked={f.activo !== false} onChange={set('activo')} /> Producto activo</label></Field>
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
    (tipo === 'todos' || (p.tipoMaterial || 'consumible') === tipo) &&
    (grupo === 'todos' || (grupo === 'sin' ? !C.rutaGrupo(db, p.grupoId) : enGrupo.has(p.grupoId))) &&
    norm([p.nombre, p.codigo, p.codigoAlterno, p.invima, p.gtin, p.marca, p.referencia, p.cum, C.rutaGrupo(db, p.grupoId)].join(' ')).includes(norm(q)))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  const exportar = () => {
    const rows = [['Código', 'Código alterno', 'Nombre', 'Clasificación', 'Tipo de material', 'Categoría', 'Marca', 'Referencia', 'Presentación', 'Unidad', 'Unidad de compra', 'Factor', 'Mínimo', 'Máximo', 'Ubicación física', 'GTIN', 'INVIMA', 'Vence INVIMA', 'Riesgo', 'CUM', 'Existencia', 'Costo unitario', 'Valor', 'Activo']];
    lista.forEach((p) => {
      const s = state.prods[p.id];
      rows.push([p.codigo, p.codigoAlterno || '', p.nombre, C.rutaGrupo(db, p.grupoId), C.TIPOS_MATERIAL[p.tipoMaterial] || '', C.CATEGORIAS[p.categoria], p.marca || '', p.referencia || '', p.presentacion || '', p.unidad, p.unidadCompra || '', p.factorCompra || 1, p.stockMin, p.stockMax || '', p.ubicacionFisica || '', p.gtin || '', p.invima || '', p.invimaVence || '', p.riesgo, p.cum || '', s ? s.qty : 0, s && s.qty ? C.r2(s.value / s.qty) : 0, s ? s.value : 0, p.activo !== false ? 'Sí' : 'No']);
    });
    descargar('productos-' + hoy + '.csv', C.csv(rows));
  };

  return (
    <Panel title="Maestro de productos" icon={Boxes} sub={num(lista.length) + ' productos'}
      actions={<><Btn icon={Download} onClick={exportar}>Exportar</Btn>{puede('maestros') && <Btn variant="primary" icon={Plus} onClick={() => setElegir(true)}>Nuevo</Btn>}</>}>
      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Nombre, código, marca, referencia, código de barras, INVIMA" />
        <div style={{ width: 300, maxWidth: '100%' }}><SelectGrupo value={grupo} onChange={setGrupo} incluirTodos incluirSin /></div>
        <select className="select input" value={tipo} onChange={(e) => setTipo(e.target.value)} style={{ maxWidth: 230 }}>
          <option value="todos">Todos los tipos de material</option>
          {Object.entries(C.TIPOS_MATERIAL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
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
                    <td>
                      <div className="strong">{p.nombre} {p.cadenaFrio && <Snowflake size={13} className="cyan-t" />}</div>
                      <div className="small muted">{[p.marca, p.referencia, p.presentacion].filter(Boolean).join(' · ') || C.TIPOS_MATERIAL[p.tipoMaterial] || ''}</div>
                      <div className="stockbod">{Object.entries(C.existenciasPorBodega(db, state, p.id)).filter(([, v]) => v > 0).map(([b, v]) => <span key={b}>{b}: {num(v)}</span>)}</div>
                    </td>
                    <td className="small">{C.rutaGrupo(db, p.grupoId) || <span className="muted">Sin clasificar</span>}<div className="muted">{C.TIPOS_MATERIAL[p.tipoMaterial] || C.CATEGORIAS[p.categoria]}</div></td>
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
            {TIPOS_CREAR.map(([k, t, s, Icon, c1, c2, datos]) => (
              <button key={k} type="button" className="tile" style={{ '--c1': c1, '--c2': c2 }}
                onClick={() => { setElegir(false); if (k === 'servicio') go('kits', 'nuevo'); else setEditar(datos); }}>
                <span className="orb"><Icon size={34} strokeWidth={1.7} /></span>
                <span className="tile-t">{t}</span>
                <span className="tile-s">{s}</span>
              </button>
            ))}
          </div>
          <div style={{ marginTop: 16 }}><Nota>Los insumos, dispositivos, medicamentos e instrumental tienen existencias, lotes y kardex. Los servicios no tienen existencia: tienen precio, código CUPS y los insumos que consumen.</Nota></div>
        </Modal>
      )}
    </Panel>
  );
}
