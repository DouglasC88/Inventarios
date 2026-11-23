import { useEffect, useState } from 'react';
import {
  Ban, BookOpen, Calculator, ChevronDown, ChevronRight, Download, FileText, Landmark, ListTree, Plus, Printer, Receipt,
  RotateCcw, Save, Scale, Trash2, Upload
} from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { Btn, Chip, Empty, Errores, Field, Kpi, Modal, Nota, Panel, SearchBox, Tabs } from '../components/ui.jsx';
import Combo from '../components/Combo.jsx';
import { SelectTercero, nombreProducto } from '../components/Movimientos.jsx';
import { imprimirTabla } from '../components/imprimir.js';
import { descargar, fecha, money, num } from '../format.js';

const inicioMes = (hoy) => hoy.slice(0, 8) + '01';
const inicioAnio = (hoy) => hoy.slice(0, 5) + '01-01';

function Rango({ f, setF }) {
  const { hoy } = useStore();
  return (
    <>
      <Field label="Desde"><input className="input" type="date" value={f.desde} max={hoy} onChange={(e) => setF((x) => Object.assign({}, x, { desde: e.target.value }))} /></Field>
      <Field label="Hasta"><input className="input" type="date" value={f.hasta} max={hoy} onChange={(e) => setF((x) => Object.assign({}, x, { hasta: e.target.value }))} /></Field>
    </>
  );
}

/** Buscador de cuentas del plan (solo cuentas de movimiento si se pide). */
export function SelectCuenta({ value, onChange, soloMovimiento = true, placeholder }) {
  const { db } = useStore();
  const options = db.planCuentas.filter((c) => c.activa !== false && (!soloMovimiento || C.esDeMovimiento(db, c.codigo)))
    .map((c) => ({ value: c.codigo, label: c.codigo + ' · ' + c.nombre, sub: C.NIVELES_CUENTA[C.nivelCuenta(c.codigo)] + (c.terceros ? ' · exige tercero' : '') + ' · naturaleza ' + (c.naturaleza === 'C' ? 'crédito' : 'débito') }));
  return <Combo value={value} onChange={onChange} options={options} placeholder={placeholder || 'Escriba la cuenta o su nombre…'} />;
}

function TablaLineas({ lineas }) {
  return (
    <table className="tbl"><thead><tr><th>Cuenta</th><th>Nombre</th><th>Tercero</th><th>C. costo</th><th>Detalle</th><th className="num">Débito</th><th className="num">Crédito</th></tr></thead>
      <tbody>{lineas.map((l, i) => <tr key={i}><td className="mono">{l.cuenta}</td><td>{l.nombre}</td><td className="mono">{l.tercero}</td><td>{l.centro}</td><td className="small">{l.detalle}</td><td className="num">{l.debito ? money(l.debito) : ''}</td><td className="num">{l.credito ? money(l.credito) : ''}</td></tr>)}</tbody>
      <tfoot><tr><td colSpan={5}>Totales</td><td className="num">{money(lineas.reduce((a, l) => a + l.debito, 0))}</td><td className="num">{money(lineas.reduce((a, l) => a + l.credito, 0))}</td></tr></tfoot>
    </table>
  );
}

// ======================= Facturas de proveedor =======================
function NuevaFactura({ onClose }) {
  const { db, state, hoy, commit, toast, nombreUsuario } = useStore();
  const ret = (db.config.contabilidad || {}).retenciones || {};
  const [h, setH] = useState({ fecha: hoy, proveedorId: '', docTipo: 'FE', docNum: '', ivaPct: 19, retefuentePct: ret.retefuentePct ?? 0, reteivaPct: ret.reteivaPct ?? 0, reteicaPct: ret.reteicaPct ?? 0 });
  const [sel, setSel] = useState({});
  const [err, setErr] = useState([]);
  const setHk = (k, v) => setH((x) => Object.assign({}, x, { [k]: v }));
  const pend = h.proveedorId ? C.pendientesPorFacturar(db, h.proveedorId) : [];
  const key = (p) => p.movId + '#' + p.idx;
  const provSel = db.proveedores.find((x) => x.id === h.proveedorId);
  // IVA de cada línea: la tarifa del producto (excluido, exento, 5 % o 19 %) o, si no la tiene, el IVA general de la factura.
  // La tarifa viene de la ficha del producto o de su grupo (IVA compra); "mayor valor del gasto" no se descuenta.
  const tarifaLinea = (productoId) => C.tarifaCompra(db, db.productos.find((x) => x.id === productoId));
  const ivaLinea = (productoId) => {
    if (provSel && C.normalizarTercero(provSel).responsableIva === false) return 0;
    const t = C.pctIva(tarifaLinea(productoId));
    return t === null ? Number(h.ivaPct) || 0 : t;
  };
  const lineas = pend.filter((p) => sel[key(p)]).map((p) => ({ movId: p.movId, idx: p.idx, num: p.num, productoId: p.productoId, valorRecibido: p.valor, valorFacturado: Number(sel[key(p)].valor), ivaPct: ivaLinea(p.productoId), ivaNoDescontable: tarifaLinea(p.productoId) === '19nd' && ivaLinea(p.productoId) > 0 }));
  // Tipo de concepto: el común a los grupos de las líneas marcadas; define el % y la cuenta de retención.
  const conceptoAuto = C.conceptoRetencionLineas(db, lineas.map((l) => l.productoId));
  const [retManual, setRetManual] = useState(false);
  useEffect(() => {
    if (retManual || !h.proveedorId) return;
    const sug = C.impuestosSugeridos(db, provSel, conceptoAuto);
    setH((x) => (x.conceptoRetencion === conceptoAuto && x.retefuentePct === sug.retefuentePct ? x : Object.assign({}, x, { conceptoRetencion: conceptoAuto, retefuentePct: sug.retefuentePct })));
  }, [conceptoAuto, h.proveedorId, retManual]);
  const fac = Object.assign({}, h, { lineas });
  const t = C.calcularFactura(fac);
  const prov = db.proveedores.find((x) => x.id === h.proveedorId);
  const marcarTodo = () => setSel(Object.fromEntries(pend.map((p) => [key(p), { valor: p.valor }])));
  // Al elegir el proveedor se traen de su ficha el tipo de soporte, el IVA, las retenciones y el plazo de pago.
  const elegirProveedor = (v) => { const pv = db.proveedores.find((x) => x.id === v); setH((x) => Object.assign({}, x, { proveedorId: v, docTipo: pv && pv.obligadoFacturar === false ? 'DS' : 'FE' }, C.impuestosSugeridos(db, pv))); setSel({}); setRetManual(false); };
  const plazo = prov ? Number(C.normalizarTercero(prov).plazoPago) || 0 : 0;
  const preview = lineas.length ? C.comprobantesContables(Object.assign({}, db, { movimientos: [], cierres: [], comprobantesManuales: [], facturasProveedor: [Object.assign({ id: 'prev', num: 'FP-?' }, fac)] }), state)[0] : null;
  const guardar = () => {
    const f = Object.assign({ id: C.nuevoId() }, fac, { docNum: h.docNum.trim(), vence: C.isISODate(h.fecha) ? C.addDays(h.fecha, plazo) : '', usuario: nombreUsuario, creado: new Date().toISOString() });
    const e = C.validarFactura(db, f, hoy);
    if (e.length) return setErr(e);
    const numero = C.verNumero(db, 'factura');
    commit((d) => { d.facturasProveedor.push(Object.assign({}, f, { num: C.siguienteNumero(d, 'factura') })); }, 'Factura de proveedor registrada', numero + ' · ' + (prov ? prov.nombre : '') + ' · ' + h.docTipo + ' ' + h.docNum);
    toast(numero + ' registrada: total a pagar ' + money(t.total));
    onClose();
  };
  return (
    <Modal open wide title="Registrar factura de proveedor" icon={Receipt} onClose={onClose}
      footer={<><span className="muted" style={{ marginRight: 'auto' }}>Total a pagar <b>{money(t.total)}</b></span><Btn onClick={onClose}>Cancelar</Btn><Btn variant="primary" onClick={guardar}>Registrar factura</Btn></>}>
      <Errores lista={err} />
      <div className="section-title" style={{ marginTop: 0 }}>1 · Documento</div>
      <div className="form-grid">
        <Field label="Proveedor (NIT o nombre)" span><SelectTercero tipo="proveedor" value={h.proveedorId} onChange={elegirProveedor} /></Field>
        <Field label="Fecha de la factura"><input className="input" type="date" value={h.fecha} max={hoy} onChange={(e) => setHk('fecha', e.target.value)} /></Field>
        <Field label="Tipo"><select className="select input" value={h.docTipo} onChange={(e) => setHk('docTipo', e.target.value)}>{Object.entries(C.DOC_TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Número (prefijo y consecutivo DIAN)"><input className="input mono" value={h.docNum} onChange={(e) => setHk('docNum', e.target.value)} /></Field>
        {prov && <Field label="Vencimiento" hint={'Plazo de la ficha del tercero: ' + (plazo ? plazo + ' días' : 'contado')}><input className="input" value={C.isISODate(h.fecha) ? fecha(C.addDays(h.fecha, plazo)) : ''} readOnly /></Field>}
      </div>
      <div className="section-title">2 · Mercancía recibida que cubre esta factura (cruce con la entrada)</div>
      {!h.proveedorId ? <p className="muted">Elija el proveedor para ver lo recibido pendiente de facturar.</p> : pend.length ? (
        <>
          <div className="toolbar"><Btn size="sm" onClick={marcarTodo}>Marcar todo</Btn><Btn size="sm" variant="ghost" onClick={() => setSel({})}>Quitar todo</Btn></div>
          <div className="tbl-wrap lines">
            <table className="tbl">
              <thead><tr><th /><th>Entrada</th><th>Fecha</th><th>Soporte recibido</th><th>Producto</th><th className="num">Cantidad</th><th className="num">Valor recibido</th><th className="num">Valor facturado</th><th className="num">Diferencia</th><th className="num">IVA</th></tr></thead>
              <tbody>
                {pend.map((p) => {
                  const k = key(p); const s = sel[k];
                  const dif = s ? C.r2(Number(s.valor) - p.valor) : 0;
                  return (
                    <tr key={k}>
                      <td><input type="checkbox" checked={!!s} onChange={(e) => setSel((x) => { const n = Object.assign({}, x); if (e.target.checked) n[k] = { valor: p.valor }; else delete n[k]; return n; })} /></td>
                      <td className="mono">{p.num}{p.ordenNum ? <div className="small muted">{p.ordenNum}</div> : null}</td><td>{fecha(p.fecha)}</td><td className="mono small">{p.docNum}</td>
                      <td>{nombreProducto(db, p.productoId)}<div className="small muted">Lote {p.lote}</div></td><td className="num">{num(p.cantidad)}</td><td className="num">{money(p.valor)}</td>
                      <td>{s ? <input className="input num" type="number" min="0" value={s.valor} onChange={(e) => setSel((x) => Object.assign({}, x, { [k]: { valor: e.target.value } }))} style={{ width: 130 }} /> : ''}</td>
                      <td className={'num ' + (dif > 0 ? 'red-t' : dif < 0 ? 'green-t' : '')}>{s ? money(dif) : ''}</td>
                      <td className="num small">{s ? (() => { const t = tarifaLinea(p.productoId); return t === 'excluido' ? 'Excluido' : ivaLinea(p.productoId) + ' %' + (t === '19nd' ? ' no desc.' : ''); })() : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : <Nota>Este proveedor no tiene mercancía recibida pendiente de facturar.</Nota>}
      <div className="section-title">3 · Impuestos y retenciones</div>
      <div className="form-grid">
        <Field label="IVA general (%)" hint="Para productos sin tarifa en su ficha"><input className="input" type="number" min="0" max="100" value={h.ivaPct} onChange={(e) => setHk('ivaPct', e.target.value)} /></Field>
        <Field label="Tipo de concepto" hint={conceptoAuto ? 'Tomado del grupo de los productos' : 'Los productos no tienen un concepto común'}>
          <select className="select input" value={h.conceptoRetencion || ''} onChange={(e) => { setRetManual(true); const c = e.target.value; setH((x) => Object.assign({}, x, { conceptoRetencion: c, retefuentePct: C.impuestosSugeridos(db, provSel, c).retefuentePct })); }}>
            <option value="">General</option>{Object.entries(C.CONCEPTOS_RETENCION).filter(([k]) => k !== 'general').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Retención en la fuente (%)"><input className="input" type="number" min="0" max="100" step="0.01" value={h.retefuentePct} onChange={(e) => { setRetManual(true); setHk('retefuentePct', e.target.value); }} /></Field>
        <Field label="ReteIVA (% del IVA)"><input className="input" type="number" min="0" max="100" value={h.reteivaPct} onChange={(e) => setHk('reteivaPct', e.target.value)} /></Field>
        <Field label="ReteICA (%)"><input className="input" type="number" min="0" max="100" step="0.001" value={h.reteicaPct} onChange={(e) => setHk('reteicaPct', e.target.value)} /></Field>
      </div>
      <div className="kv" style={{ marginTop: 12 }}>
        <div><span>Recibido</span><b>{money(t.recibido)}</b></div><div><span>Facturado (subtotal)</span><b>{money(t.subtotal)}</b></div>
        <div><span>Diferencia de precio</span><b className={t.difPrecio ? 'red-t' : ''}>{money(t.difPrecio)}</b></div><div><span>IVA</span><b>{money(t.iva)}</b></div>
        <div><span>Retenciones</span><b>{money(t.retefuente + t.reteiva + t.reteica)}</b></div><div><span>Total a pagar</span><b>{money(t.total)}</b></div>
      </div>
      {preview && <><div className="section-title">Comprobante que se generará</div><div className="tbl-wrap"><TablaLineas lineas={preview.lineas} /></div></>}
      <div style={{ marginTop: 12 }}><Nota>Las tarifas de retención dependen de la calidad del proveedor, la base mínima vigente (en UVT) y el municipio. Valídelas con su contador. La diferencia de precio va a la cuenta configurada en Parametrización.</Nota></div>
    </Modal>
  );
}

export function Facturas({ arg }) {
  const { db, state, hoy, puede, commit, toast, nombreUsuario } = useStore();
  const [nueva, setNueva] = useState(arg === 'nuevo');
  const [ver, setVer] = useState(null);
  const [motivo, setMotivo] = useState('');
  const [err, setErr] = useState([]);
  const pend = C.pendientesPorFacturar(db);
  const porProv = {};
  pend.forEach((p) => { const x = porProv[p.proveedorId] || (porProv[p.proveedorId] = { valor: 0, lineas: 0, desde: p.fecha }); x.valor += p.valor; x.lineas++; if (p.fecha < x.desde) x.desde = p.fecha; });
  const lista = (db.facturasProveedor || []).slice().reverse();
  const actual = ver && db.facturasProveedor.find((f) => f.id === ver);
  const cp = actual ? C.comprobantesContables(db, state).find((c) => c.id === actual.id) : null;
  const anular = () => {
    const uc = C.ultimoCierre(db);
    if (!motivo.trim()) return setErr(['Escriba el motivo de la anulación.']);
    if (uc && actual.fecha <= uc.fecha) return setErr(['La factura pertenece a un periodo cerrado.']);
    commit((d) => { const f = d.facturasProveedor.find((x) => x.id === actual.id); f.anulado = true; f.anulacion = { motivo: motivo.trim(), fecha: new Date().toISOString(), usuario: nombreUsuario }; }, 'Factura de proveedor anulada', actual.num + ' · ' + motivo.trim());
    toast(actual.num + ' anulada: se generó el comprobante de reversión');
    setVer(null); setMotivo(''); setErr([]);
  };
  return (
    <div className="stack">
      <div className="grid g-kpi">
        <Kpi label="Mercancía recibida por facturar" value={money(pend.reduce((a, p) => a + p.valor, 0))} sub={pend.length + ' líneas · saldo de la cuenta puente'} tone={pend.length ? 'amber' : 'green'} icon={Receipt} />
        <Kpi label="Facturas registradas" value={num(lista.filter((f) => !f.anulado).length)} tone="cyan" />
        <Kpi label="Total facturado" value={money(lista.filter((f) => !f.anulado).reduce((a, f) => a + C.calcularFactura(f).total, 0))} sub="A pagar (neto de retenciones)" tone="violet" />
      </div>
      <Panel title="Facturas de proveedor" icon={Receipt}
        sub="Verificación de facturas: cruce de la orden de compra, la entrada de mercancía y la factura. La entrada deja el valor en la cuenta puente; la factura la cancela y registra IVA, retenciones, diferencias de precio y la cuenta por pagar al proveedor."
        actions={puede('contabilidad') && <Btn variant="primary" icon={Plus} onClick={() => setNueva(true)}>Registrar factura</Btn>}>
        {lista.length ? (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Número</th><th>Fecha</th><th>Proveedor</th><th>Factura</th><th className="num">Subtotal</th><th className="num">IVA</th><th className="num">Retenciones</th><th className="num">Dif. precio</th><th className="num">A pagar</th><th /></tr></thead>
              <tbody>
                {lista.map((f) => { const t = C.calcularFactura(f); return (
                  <tr key={f.id} className={f.anulado ? 'anulado' : ''}>
                    <td className="mono">{f.num}</td><td>{fecha(f.fecha)}{f.vence ? <div className={'small ' + (!f.anulado && f.vence < hoy ? 'red-t' : 'muted')}>Vence {fecha(f.vence)}</div> : null}</td><td>{(db.proveedores.find((x) => x.id === f.proveedorId) || {}).nombre}<div className="small muted mono">{C.documentoTercero(db.proveedores.find((x) => x.id === f.proveedorId))}</div></td>
                    <td className="mono small">{f.docTipo} {f.docNum}</td><td className="num">{money(t.subtotal)}</td><td className="num">{money(t.iva)}</td><td className="num">{money(t.retefuente + t.reteiva + t.reteica)}</td>
                    <td className={'num' + (t.difPrecio ? ' red-t' : '')}>{money(t.difPrecio)}</td><td className="num strong">{money(t.total)}</td>
                    <td className="acts"><Btn variant="ghost" size="sm" icon={FileText} onClick={() => setVer(f.id)} /></td>
                  </tr>); })}
              </tbody>
            </table>
          </div>
        ) : <Empty icon={Receipt} title="Sin facturas" text="Registre la primera factura de proveedor." />}
      </Panel>
      <Panel title="Pendientes por facturar (análisis de la cuenta puente)" icon={Scale} sub="Mercancía que ya entró al inventario y cuya factura no se ha registrado.">
        {Object.keys(porProv).length ? (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Proveedor</th><th>NIT</th><th className="num">Líneas</th><th>Desde</th><th className="num">Valor recibido</th></tr></thead>
            <tbody>{Object.entries(porProv).map(([id, x]) => { const t = db.proveedores.find((p) => p.id === id); return <tr key={id}><td>{t ? t.nombre : '—'}</td><td className="mono">{C.documentoTercero(t)}</td><td className="num">{x.lineas}</td><td>{fecha(x.desde)}</td><td className="num">{money(x.valor)}</td></tr>; })}</tbody>
          </table></div>
        ) : <Empty icon={Scale} title="Todo facturado" text="No hay mercancía recibida pendiente de factura." />}
      </Panel>
      {nueva && <NuevaFactura onClose={() => setNueva(false)} />}
      {actual && (
        <Modal open wide title={'Factura ' + actual.num} icon={Receipt} onClose={() => { setVer(null); setErr([]); }}
          footer={<>{!actual.anulado && puede('contabilidad') && <><input className="input" placeholder="Motivo de anulación" value={motivo} onChange={(e) => setMotivo(e.target.value)} style={{ maxWidth: 320 }} /><Btn variant="danger" icon={Ban} onClick={anular}>Anular</Btn></>}<span style={{ flex: 1 }} /><Btn onClick={() => setVer(null)}>Cerrar</Btn></>}>
          <Errores lista={err} />
          {actual.anulado && <Errores lista={['Anulada: ' + (actual.anulacion || {}).motivo]} />}
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Entrada</th><th>Producto</th><th className="num">Recibido</th><th className="num">Facturado</th></tr></thead>
            <tbody>{actual.lineas.map((l, i) => <tr key={i}><td className="mono">{l.num}</td><td>{nombreProducto(db, l.productoId)}</td><td className="num">{money(l.valorRecibido)}</td><td className="num">{money(l.valorFacturado)}</td></tr>)}</tbody></table></div>
          {cp && <><div className="section-title">Comprobante {cp.num}</div><div className="tbl-wrap"><TablaLineas lineas={cp.lineas} /></div></>}
        </Modal>
      )}
    </div>
  );
}

// ======================= Comprobantes =======================
function NuevoManual({ onClose }) {
  const { db, hoy, commit, toast, nombreUsuario } = useStore();
  const vacia = () => ({ cuenta: '', tercero: '', centro: '', detalle: '', debito: '', credito: '' });
  const [h, setH] = useState({ fecha: hoy, descripcion: '' });
  const [lineas, setLineas] = useState([vacia(), vacia()]);
  const [err, setErr] = useState([]);
  const setL = (i, k, v) => setLineas((ls) => ls.map((l, j) => (j === i ? Object.assign({}, l, { [k]: v }) : l)));
  const td = lineas.reduce((s, l) => s + (Number(l.debito) || 0), 0), tc = lineas.reduce((s, l) => s + (Number(l.credito) || 0), 0);
  const guardar = () => {
    const cp = Object.assign({}, h, { lineas: lineas.filter((l) => l.cuenta || Number(l.debito) || Number(l.credito)).map((l) => Object.assign({}, l, { debito: Number(l.debito) || 0, credito: Number(l.credito) || 0 })) });
    const e = C.validarComprobanteManual(db, cp, hoy);
    if (e.length) return setErr(e);
    const numero = C.verNumero(db, 'manual');
    commit((d) => { d.comprobantesManuales.push(Object.assign({ id: C.nuevoId(), num: C.siguienteNumero(d, 'manual'), usuario: nombreUsuario, creado: new Date().toISOString() }, cp)); }, 'Comprobante manual', numero + ' · ' + h.descripcion);
    toast(numero + ' registrado');
    onClose();
  };
  return (
    <Modal open wide title="Comprobante manual (nota de contabilidad)" icon={BookOpen} onClose={onClose}
      footer={<><span className={'muted' + (Math.abs(td - tc) >= 0.01 ? ' red-t' : '')} style={{ marginRight: 'auto' }}>Débitos {money(td)} · Créditos {money(tc)} · Diferencia {money(td - tc)}</span><Btn onClick={onClose}>Cancelar</Btn><Btn variant="primary" onClick={guardar}>Registrar</Btn></>}>
      <Errores lista={err} />
      <div className="form-grid">
        <Field label="Fecha"><input className="input" type="date" value={h.fecha} max={hoy} onChange={(e) => setH((x) => Object.assign({}, x, { fecha: e.target.value }))} /></Field>
        <Field label="Descripción" span><input className="input" value={h.descripcion} onChange={(e) => setH((x) => Object.assign({}, x, { descripcion: e.target.value }))} placeholder="Ej.: Reclasificación de insumos a gasto" /></Field>
      </div>
      <div className="section-title">Movimientos</div>
      <div className="tbl-wrap lines"><table className="tbl">
        <thead><tr><th style={{ minWidth: 260 }}>Cuenta</th><th>NIT tercero</th><th>C. costo</th><th>Detalle</th><th className="num">Débito</th><th className="num">Crédito</th><th /></tr></thead>
        <tbody>{lineas.map((l, i) => (
          <tr key={i}>
            <td><SelectCuenta value={l.cuenta} onChange={(v) => setL(i, 'cuenta', v)} /></td>
            <td><input className="input mono" value={l.tercero} onChange={(e) => setL(i, 'tercero', e.target.value.replace(/\D/g, ''))} style={{ width: 130 }} list="nits-terceros" /></td>
            <td><input className="input" value={l.centro} onChange={(e) => setL(i, 'centro', e.target.value)} style={{ width: 90 }} list="centros-costo" /></td>
            <td><input className="input" value={l.detalle} onChange={(e) => setL(i, 'detalle', e.target.value)} /></td>
            <td><input className="input num" type="number" min="0" value={l.debito} onChange={(e) => setL(i, 'debito', e.target.value)} style={{ width: 120 }} /></td>
            <td><input className="input num" type="number" min="0" value={l.credito} onChange={(e) => setL(i, 'credito', e.target.value)} style={{ width: 120 }} /></td>
            <td><Btn variant="ghost" size="sm" icon={Trash2} onClick={() => setLineas((ls) => (ls.length > 2 ? ls.filter((_, j) => j !== i) : ls))} /></td>
          </tr>))}</tbody>
      </table></div>
      <datalist id="nits-terceros">{db.proveedores.map((t) => <option key={t.id} value={t.nit}>{t.nombre}</option>)}</datalist>
      <datalist id="centros-costo">{db.bodegas.map((b) => <option key={b.id} value={b.codigo}>{b.nombre}</option>)}</datalist>
      <div className="toolbar" style={{ marginTop: 10 }}><Btn size="sm" icon={Plus} onClick={() => setLineas((ls) => [...ls, vacia()])}>Agregar línea</Btn></div>
      <Nota>Solo se aceptan cuentas de movimiento del plan de cuentas. Las cuentas marcadas "exige tercero" necesitan el NIT. Los comprobantes manuales no cambian el kardex: úselos para reclasificaciones y ajustes contables.</Nota>
    </Modal>
  );
}

export function Comprobantes() {
  const { db, state, hoy, puede, commit, toast, nombreUsuario } = useStore();
  const [f, setF] = useState({ desde: inicioMes(hoy), hasta: hoy });
  const [origen, setOrigen] = useState('todos');
  const [q, setQ] = useState('');
  const [abiertos, setAbiertos] = useState({});
  const [manual, setManual] = useState(false);
  const cps = C.comprobantesContables(db, state, Object.assign({}, f, origen === 'todos' ? {} : { origenes: [origen] }))
    .filter((cp) => !q || (cp.num + ' ' + cp.tipo + ' ' + cp.descripcion + ' ' + cp.lineas.map((l) => l.cuenta + ' ' + l.tercero).join(' ')).toLowerCase().includes(q.toLowerCase()));
  const deb = cps.reduce((a, c) => a + c.debito, 0), cre = cps.reduce((a, c) => a + c.credito, 0);
  const descuadrados = cps.filter((c) => !c.cuadra).length;
  const anularManual = (cp) => {
    const m = db.comprobantesManuales.find((x) => x.id === cp.id);
    const uc = C.ultimoCierre(db);
    if (!m || m.anulado) return;
    if (uc && m.fecha <= uc.fecha) return toast('El comprobante pertenece a un periodo cerrado', 'error');
    commit((d) => { const x = d.comprobantesManuales.find((y) => y.id === cp.id); x.anulado = true; x.anulacion = { fecha: new Date().toISOString(), usuario: nombreUsuario, motivo: 'Anulado por el usuario' }; }, 'Comprobante manual anulado', m.num);
    toast(m.num + ' anulado con su reversión');
  };
  return (
    <div className="stack">
      <div className="grid g-kpi">
        <Kpi label="Comprobantes" value={num(cps.length)} sub="Automáticos y manuales" tone="cyan" icon={BookOpen} />
        <Kpi label="Débitos" value={money(deb)} tone="violet" />
        <Kpi label="Créditos" value={money(cre)} tone="violet" />
        <Kpi label="Descuadrados" value={descuadrados} sub={descuadrados ? 'Revise las cuentas' : 'Todo cuadra'} tone={descuadrados ? 'red' : 'green'} />
      </div>
      <Panel title="Comprobantes contables" icon={BookOpen}
        sub="Se generan solos con cada movimiento de inventario, factura de proveedor y cierre; los anulados generan su comprobante de reversión. Los traslados no generan asiento (misma cuenta); se reflejan en el centro de costo."
        actions={puede('contabilidad') && <Btn variant="primary" icon={Plus} onClick={() => setManual(true)}>Comprobante manual</Btn>}>
        <div className="toolbar"><Rango f={f} setF={setF} /><SearchBox value={q} onChange={setQ} placeholder="Buscar comprobante, cuenta o NIT" /></div>
        <div className="toolbar"><Tabs value={origen} onChange={setOrigen} options={[['todos', 'Todos'], ['inventario', 'Inventario'], ['compras', 'Facturas de proveedor'], ['cierre', 'Cierres'], ['manual', 'Manuales']]} /></div>
        {cps.length ? (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th /><th>Fecha</th><th>Comprobante</th><th>Tipo</th><th>Descripción</th><th className="num">Débito</th><th className="num">Crédito</th><th /></tr></thead>
              <tbody>
                {cps.map((cp) => [
                  <tr key={cp.id} style={{ cursor: 'pointer' }} onClick={() => setAbiertos((a) => Object.assign({}, a, { [cp.id]: !a[cp.id] }))}>
                    <td>{abiertos[cp.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                    <td>{fecha(cp.fecha)}</td><td className="mono">{cp.num}</td><td>{cp.reversion ? <Chip tone="magenta">{cp.tipo}</Chip> : cp.tipo}</td><td className="small">{cp.descripcion}</td>
                    <td className="num">{money(cp.debito)}</td><td className="num">{money(cp.credito)}</td>
                    <td>{cp.cuadra ? <Chip tone="green" dot>Cuadra</Chip> : <Chip tone="red">Descuadre</Chip>}</td>
                  </tr>,
                  abiertos[cp.id] && (
                    <tr key={cp.id + 'd'}><td /><td colSpan={7} style={{ background: '#f8fbff' }}>
                      <TablaLineas lineas={cp.lineas} />
                      {cp.origen === 'manual' && !cp.reversion && puede('contabilidad') && !db.comprobantesManuales.find((x) => x.id === cp.id)?.anulado && <div className="toolbar" style={{ marginTop: 8 }}><Btn size="sm" variant="danger" icon={RotateCcw} onClick={() => anularManual(cp)}>Anular con reversión</Btn></div>}
                    </td></tr>
                  )
                ])}
              </tbody>
              <tfoot><tr><td colSpan={5}>Totales</td><td className="num">{money(deb)}</td><td className="num">{money(cre)}</td><td /></tr></tfoot>
            </table>
          </div>
        ) : <Empty icon={BookOpen} title="Sin comprobantes" text="No hay comprobantes en el rango de fechas." />}
      </Panel>
      {manual && <NuevoManual onClose={() => setManual(false)} />}
    </div>
  );
}

// ======================= Libros =======================
export function LibroDiario() {
  const { db, state, hoy } = useStore();
  const [f, setF] = useState({ desde: inicioMes(hoy), hasta: hoy });
  const cps = C.comprobantesContables(db, state, f);
  const filas = cps.flatMap((cp) => cp.lineas.map((l) => [fecha(cp.fecha), cp.num, l.cuenta, l.nombre, l.tercero, l.centro, l.detalle, l.debito ? money(l.debito) : '', l.credito ? money(l.credito) : '']));
  const cols = [{ t: 'Fecha' }, { t: 'Comprobante' }, { t: 'Cuenta' }, { t: 'Nombre' }, { t: 'Tercero' }, { t: 'C. costo' }, { t: 'Detalle' }, { t: 'Débito', num: true }, { t: 'Crédito', num: true }];
  const td = cps.reduce((a, c) => a + c.debito, 0), tc = cps.reduce((a, c) => a + c.credito, 0);
  return (
    <Panel title="Libro diario" icon={BookOpen} sub="Todos los comprobantes en orden cronológico, línea por línea."
      actions={<Btn icon={Printer} onClick={() => imprimirTabla(db, 'Libro diario', 'Del ' + fecha(f.desde) + ' al ' + fecha(f.hasta), cols, filas, ['Totales', '', '', '', '', '', '', money(td), money(tc)])}>Imprimir / PDF</Btn>}>
      <div className="toolbar"><Rango f={f} setF={setF} /></div>
      <div className="tbl-wrap" style={{ maxHeight: '70vh' }}>
        <table className="tbl"><thead><tr>{cols.map((c) => <th key={c.t} className={c.num ? 'num' : ''}>{c.t}</th>)}</tr></thead>
          <tbody>{filas.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className={cols[j].num ? 'num' : j === 1 || j === 2 || j === 4 ? 'mono' : j === 6 ? 'small' : ''}>{v}</td>)}</tr>)}</tbody>
          <tfoot><tr><td colSpan={7}>Totales</td><td className="num">{money(td)}</td><td className="num">{money(tc)}</td></tr></tfoot>
        </table>
      </div>
    </Panel>
  );
}

export function MayorBalances() {
  const { db, state, hoy } = useStore();
  const [f, setF] = useState({ desde: inicioAnio(hoy), hasta: hoy });
  const [nivel, setNivel] = useState('3');
  const filas = C.balanceComprobacion(db, C.comprobantesContables(db, state), f.desde, f.hasta, nivel);
  const tot = (k) => filas.reduce((a, x) => a + x[k], 0);
  const cols = [{ t: 'Cuenta' }, { t: 'Nombre' }, { t: 'Saldo anterior', num: true }, { t: 'Débitos', num: true }, { t: 'Créditos', num: true }, { t: 'Nuevo saldo', num: true }];
  const imprimir = () => imprimirTabla(db, 'Libro mayor y balances', 'Nivel ' + C.NIVELES_CUENTA[nivel] + ' · del ' + fecha(f.desde) + ' al ' + fecha(f.hasta), cols,
    filas.map((x) => [x.cuenta, x.nombre, money(x.anterior), money(x.debito), money(x.credito), money(x.final)]), ['Totales', '', money(tot('anterior')), money(tot('debito')), money(tot('credito')), money(tot('final'))]);
  return (
    <Panel title="Libro mayor y balance de comprobación" icon={Scale} sub="Saldo anterior, movimiento del periodo y nuevo saldo por cuenta, consolidado al nivel que elija. Débitos y créditos deben ser iguales."
      actions={<Btn icon={Printer} onClick={imprimir}>Imprimir / PDF</Btn>}>
      <div className="toolbar"><Rango f={f} setF={setF} /><Tabs value={nivel} onChange={setNivel} options={[['1', 'Clase'], ['2', 'Grupo'], ['3', 'Cuenta'], ['4', 'Subcuenta'], ['5', 'Auxiliar']]} /></div>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr>{cols.map((c) => <th key={c.t} className={c.num ? 'num' : ''}>{c.t}</th>)}</tr></thead>
        <tbody>{filas.map((x) => <tr key={x.cuenta}><td className="mono" style={{ paddingLeft: 12 + (x.nivel - 1) * 10 }}>{x.cuenta}</td><td className={x.nivel <= 2 ? 'strong' : ''}>{x.nombre}</td><td className="num">{money(x.anterior)}</td><td className="num">{money(x.debito)}</td><td className="num">{money(x.credito)}</td><td className="num strong">{money(x.final)}</td></tr>)}</tbody>
        <tfoot><tr><td colSpan={2}>Totales {Math.abs(tot('debito') - tot('credito')) < 0.01 ? '· cuadrado' : '· DESCUADRE'}</td><td className="num">{money(tot('anterior'))}</td><td className="num">{money(tot('debito'))}</td><td className="num">{money(tot('credito'))}</td><td className="num">{money(tot('final'))}</td></tr></tfoot>
      </table></div>
    </Panel>
  );
}

export function Auxiliar() {
  const { db, state, hoy } = useStore();
  const [f, setF] = useState({ desde: inicioAnio(hoy), hasta: hoy });
  const todos = C.comprobantesContables(db, state);
  const saldos = C.saldosContables(todos);
  const [cuenta, setCuenta] = useState(() => (saldos[0] || {}).cuenta || '');
  const [nit, setNit] = useState('');
  const coincide = (l) => l.cuenta === cuenta && (!nit || l.tercero === nit);
  const saldoIni = todos.filter((cp) => cp.fecha < f.desde).flatMap((cp) => cp.lineas).filter(coincide).reduce((a, l) => a + l.debito - l.credito, 0);
  let saldo = saldoIni;
  const movs = todos.filter((cp) => cp.fecha >= f.desde && cp.fecha <= f.hasta).flatMap((cp) => cp.lineas.filter(coincide).map((l) => { saldo += l.debito - l.credito; return Object.assign({ fecha: cp.fecha, num: cp.num, saldo }, l); }));
  const nombre = (C.cuentaPlan(db, cuenta) || saldos.find((s) => s.cuenta === cuenta) || {}).nombre || '';
  const terceros = [...new Set(todos.flatMap((cp) => cp.lineas).filter((l) => l.cuenta === cuenta && l.tercero).map((l) => l.tercero))];
  const cols = [{ t: 'Fecha' }, { t: 'Comprobante' }, { t: 'Detalle' }, { t: 'Tercero' }, { t: 'C. costo' }, { t: 'Débito', num: true }, { t: 'Crédito', num: true }, { t: 'Saldo', num: true }];
  const filas = [[fecha(f.desde), '', 'Saldo inicial', '', '', '', '', money(saldoIni)], ...movs.map((m) => [fecha(m.fecha), m.num, m.detalle, m.tercero, m.centro, m.debito ? money(m.debito) : '', m.credito ? money(m.credito) : '', money(m.saldo)])];
  return (
    <Panel title="Libro auxiliar por cuenta y tercero" icon={ListTree} sub="Movimientos de una cuenta (y opcionalmente de un tercero) con saldo inicial y saldo acumulado."
      actions={<Btn icon={Printer} onClick={() => imprimirTabla(db, 'Auxiliar ' + cuenta + ' ' + nombre + (nit ? ' · NIT ' + nit : ''), 'Del ' + fecha(f.desde) + ' al ' + fecha(f.hasta), cols, filas, null)}>Imprimir / PDF</Btn>}>
      <div className="toolbar">
        <Field label="Cuenta"><div style={{ width: 320 }}><Combo value={cuenta} onChange={(v) => { setCuenta(v); setNit(''); }} options={saldos.map((s) => ({ value: s.cuenta, label: s.cuenta + ' · ' + s.nombre, sub: 'Saldo ' + money(s.saldo) }))} placeholder="Escriba la cuenta…" /></div></Field>
        <Field label="Tercero"><div style={{ width: 280 }}><Combo value={nit} onChange={setNit} options={[{ value: '', label: 'Todos los terceros' }, ...terceros.map((n) => ({ value: n, label: n + ' · ' + ((db.proveedores.find((t) => String(t.nit) === n) || {}).nombre || '') }))]} placeholder="Todos los terceros" /></div></Field>
        <Rango f={f} setF={setF} />
      </div>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr>{cols.map((c) => <th key={c.t} className={c.num ? 'num' : ''}>{c.t}</th>)}</tr></thead>
        <tbody>{filas.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className={cols[j].num ? 'num' : j === 1 || j === 3 ? 'mono' : ''}>{v}</td>)}</tr>)}</tbody>
        <tfoot><tr><td colSpan={7}>Saldo final</td><td className="num">{money(saldo)}</td></tr></tfoot>
      </table></div>
    </Panel>
  );
}

export function EstadoCosto() {
  const { db, hoy } = useStore();
  const [f, setF] = useState({ desde: inicioAnio(hoy), hasta: hoy });
  const e = C.estadoCosto(db, f.desde, f.hasta);
  const filas = [
    ['Inventario inicial', e.inventarioInicial], ['(+) Compras netas recibidas', e.compras], ['(+) Saldos iniciales cargados', e.saldosIniciales],
    ['(−) Devoluciones a proveedores', -e.devoluciones], ['(+) Sobrantes', e.sobrantes], ['(−) Faltantes y bajas', -e.faltantes],
    ['= Inventario disponible', e.disponible], ['(−) Inventario final', -e.inventarioFinal], ['= Costo de los insumos consumidos', e.costoConsumido]
  ];
  return (
    <Panel title="Estado de costo de los insumos consumidos" icon={Calculator} sub="Juego de inventarios del periodo: cuánto costaron los insumos usados en la prestación de servicios. Debe coincidir con las salidas registradas."
      actions={<Btn icon={Printer} onClick={() => imprimirTabla(db, 'Estado de costo de insumos consumidos', 'Del ' + fecha(f.desde) + ' al ' + fecha(f.hasta), [{ t: 'Concepto' }, { t: 'Valor', num: true }], filas.map(([a, b]) => [a, money(b)]), null)}>Imprimir / PDF</Btn>}>
      <div className="toolbar"><Rango f={f} setF={setF} /></div>
      <div className="tbl-wrap" style={{ maxWidth: 720 }}><table className="tbl"><tbody>
        {filas.map(([a, b]) => <tr key={a}><td className={a.startsWith('=') ? 'strong' : ''}>{a}</td><td className={'num' + (a.startsWith('=') ? ' strong' : '')}>{money(b)}</td></tr>)}
      </tbody></table></div>
      <div className="kv" style={{ marginTop: 14, maxWidth: 720 }}>
        <div><span>Consumo registrado en salidas</span><b>{money(e.consumoRegistrado)}</b></div>
        <div><span>Diferencia</span><b className={Math.abs(e.costoConsumido - e.consumoRegistrado) < 1 ? 'green-t' : 'red-t'}>{money(e.costoConsumido - e.consumoRegistrado)}</b></div>
      </div>
    </Panel>
  );
}

export function Conciliacion() {
  const { db, state } = useStore();
  const saldos = C.saldosContables(C.comprobantesContables(db, state));
  const cfg = Object.assign(C.cuentasBase(), db.config.contabilidad || {});
  const ctasInv = new Set([cfg.inventario.cuenta, ...db.grupos.map((g) => g.cuentas && g.cuentas.inventario).filter(Boolean)]);
  const contable = saldos.filter((s) => ctasInv.has(s.cuenta)).reduce((a, s) => a + s.saldo, 0);
  const kardex = C.valorInventario(state);
  const dif = C.r2(contable - kardex);
  const puente = -(saldos.find((s) => s.cuenta === cfg.puente.cuenta) || { saldo: 0 }).saldo;
  const pend = C.pendientesPorFacturar(db).reduce((a, p) => a + p.valor, 0);
  return (
    <div className="stack">
      <div className="grid g-kpi">
        <Kpi label="Saldo contable inventario" value={money(contable)} sub={[...ctasInv].join(', ')} tone="cyan" icon={Landmark} />
        <Kpi label="Valor según kardex" value={money(kardex)} sub="Costo de las existencias" tone="violet" icon={Calculator} />
        <Kpi label="Diferencia inventario" value={money(dif)} sub={Math.abs(dif) < 1 ? 'Conciliado' : 'Revise'} tone={Math.abs(dif) < 1 ? 'green' : 'red'} />
        {cfg.usarPuente && <Kpi label="Cuenta puente vs pendientes" value={money(C.r2(puente - pend))} sub={'Puente ' + money(puente) + ' · pendiente ' + money(pend)} tone={Math.abs(puente - pend) < 1 ? 'green' : 'red'} />}
      </div>
      <Panel title="Saldos de las cuentas del inventario" icon={Scale} sub="Desde el primer movimiento.">
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Cuenta</th><th>Nombre</th><th className="num">Débitos</th><th className="num">Créditos</th><th className="num">Saldo</th></tr></thead>
          <tbody>{saldos.map((s) => <tr key={s.cuenta}><td className="mono">{s.cuenta}</td><td>{s.nombre}</td><td className="num">{money(s.debito)}</td><td className="num">{money(s.credito)}</td><td className="num strong">{money(s.saldo)}</td></tr>)}</tbody>
          <tfoot><tr><td colSpan={2}>Totales</td><td className="num">{money(saldos.reduce((a, s) => a + s.debito, 0))}</td><td className="num">{money(saldos.reduce((a, s) => a + s.credito, 0))}</td><td className="num">{money(saldos.reduce((a, s) => a + s.saldo, 0))}</td></tr></tfoot>
        </table></div>
      </Panel>
    </div>
  );
}

// ======================= Plan de cuentas =======================
export function PlanCuentas() {
  const { db, commit, toast, puede, go } = useStore();
  const [q, setQ] = useState('');
  const [f, setF] = useState(null);
  const [err, setErr] = useState([]);
  const lista = db.planCuentas.filter((c) => !q || (c.codigo + ' ' + c.nombre).toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.codigo.localeCompare(b.codigo));
  const usada = (cod) => C.comprobantesContables(db, C.replay(db)).some((cp) => cp.lineas.some((l) => l.cuenta === cod));
  const guardar = () => {
    const e = [];
    const codigo = String(f.codigo || '').replace(/\D/g, '');
    if (!codigo) e.push('Escriba el código.');
    if (!f.nombre.trim()) e.push('Escriba el nombre.');
    if (!f.original && db.planCuentas.some((c) => c.codigo === codigo)) e.push('Esa cuenta ya existe.');
    if (codigo.length > 1 && !db.planCuentas.some((c) => codigo.startsWith(c.codigo) && c.codigo !== codigo)) e.push('No existe la cuenta superior de ' + codigo + '. Créela primero.');
    if (e.length) return setErr(e);
    commit((d) => {
      const c = { codigo, nombre: f.nombre.trim(), naturaleza: f.naturaleza, terceros: !!f.terceros, activa: f.activa !== false, movimiento: true };
      const i = d.planCuentas.findIndex((x) => x.codigo === (f.original || codigo));
      if (i >= 0) d.planCuentas[i] = c; else d.planCuentas.push(c);
    }, f.original ? 'Cuenta modificada' : 'Cuenta creada', codigo + ' · ' + f.nombre);
    toast('Cuenta ' + codigo + ' guardada');
    setF(null); setErr([]);
  };
  const restaurar = () => { commit((d) => { const base = C.planCuentasBase(); base.forEach((b) => { if (!d.planCuentas.some((c) => c.codigo === b.codigo)) d.planCuentas.push(b); }); }, 'Plan de cuentas: se agregaron las cuentas del PUC base', ''); toast('Se agregaron las cuentas faltantes del PUC base'); };
  return (
    <Panel title={'Plan de cuentas · ' + db.planCuentas.length + ' cuentas'} icon={ListTree}
      sub="Jerarquía del PUC: clase (1 dígito) › grupo (2) › cuenta (4) › subcuenta (6) › auxiliar (8 o más). Solo las cuentas sin subcuentas reciben movimiento. Puede crear sus propias subcuentas o cargar el plan completo desde Excel."
      actions={puede('contabilidad') && <><Btn icon={Upload} onClick={() => go('importar', 'plan')}>Cargar desde Excel</Btn><Btn icon={RotateCcw} onClick={restaurar}>Completar con PUC base</Btn><Btn variant="primary" icon={Plus} onClick={() => setF({ codigo: '', nombre: '', naturaleza: 'D', terceros: false, activa: true })}>Nueva cuenta</Btn></>}>
      <div className="toolbar"><SearchBox value={q} onChange={setQ} placeholder="Buscar código o nombre de cuenta" /></div>
      <div className="tbl-wrap" style={{ maxHeight: '65vh' }}><table className="tbl">
        <thead><tr><th>Código</th><th>Nombre</th><th>Nivel</th><th>Naturaleza</th><th>Tercero</th><th>Tipo</th><th /></tr></thead>
        <tbody>{lista.map((c) => { const n = C.nivelCuenta(c.codigo); const mov = C.esDeMovimiento(db, c.codigo); return (
          <tr key={c.codigo} style={c.activa === false ? { opacity: 0.5 } : undefined}>
            <td className="mono" style={{ paddingLeft: 12 + (n - 1) * 14 }}>{c.codigo}</td><td className={n <= 2 ? 'strong' : ''}>{c.nombre}</td><td>{C.NIVELES_CUENTA[n]}</td>
            <td>{c.naturaleza === 'C' ? 'Crédito' : 'Débito'}</td><td>{c.terceros ? <Chip tone="violet">Exige NIT</Chip> : ''}</td>
            <td>{mov ? <Chip tone="green">Movimiento</Chip> : <Chip tone="muted">Agrupa</Chip>}</td>
            <td className="acts">{puede('contabilidad') && <Btn variant="ghost" size="sm" icon={FileText} onClick={() => setF(Object.assign({ original: c.codigo }, c))} />}</td>
          </tr>); })}</tbody>
      </table></div>
      {f && (
        <Modal open title={f.original ? 'Cuenta ' + f.original : 'Nueva cuenta'} icon={ListTree} onClose={() => { setF(null); setErr([]); }}
          footer={<><Btn onClick={() => setF(null)}>Cancelar</Btn><Btn variant="primary" icon={Save} onClick={guardar}>Guardar</Btn></>}>
          <Errores lista={err} />
          <div className="form-grid">
            <Field label="Código" hint="Ej.: 145505 para una subcuenta de 1455"><input className="input mono" value={f.codigo} disabled={!!f.original && usada(f.original)} onChange={(e) => setF((x) => Object.assign({}, x, { codigo: e.target.value }))} autoFocus /></Field>
            <Field label="Nombre" span><input className="input" value={f.nombre} onChange={(e) => setF((x) => Object.assign({}, x, { nombre: e.target.value }))} /></Field>
            <Field label="Naturaleza"><select className="select input" value={f.naturaleza} onChange={(e) => setF((x) => Object.assign({}, x, { naturaleza: e.target.value }))}><option value="D">Débito</option><option value="C">Crédito</option></select></Field>
            <Field label="Controles"><label className="check"><input type="checkbox" checked={!!f.terceros} onChange={(e) => setF((x) => Object.assign({}, x, { terceros: e.target.checked }))} /> Exige tercero (NIT)</label><label className="check"><input type="checkbox" checked={f.activa !== false} onChange={(e) => setF((x) => Object.assign({}, x, { activa: e.target.checked }))} /> Activa</label></Field>
          </div>
        </Modal>
      )}
    </Panel>
  );
}

// ======================= Parametrización =======================
export function CuentasContables() {
  const { db, commit, toast, puede } = useStore();
  const [c, setC] = useState(() => Object.assign(C.cuentasBase(), db.config.contabilidad || {}));
  const [err, setErr] = useState([]);
  const editar = puede('contabilidad');
  const setCta = (k, v) => setC((x) => Object.assign({}, x, { [k]: Object.assign({}, x[k], { cuenta: v, nombre: (C.cuentaPlan(db, v) || {}).nombre || '' }) }));
  const setRet = (k, v) => setC((x) => Object.assign({}, x, { retenciones: Object.assign({}, x.retenciones, { [k]: v === '' ? '' : Number(v) }) }));
  const guardar = () => {
    const e = [];
    Object.keys(C.CONCEPTOS_CONTABLES).forEach((k) => { if (!C.esDeMovimiento(db, c[k].cuenta)) e.push(C.CONCEPTOS_CONTABLES[k] + ': elija una cuenta de movimiento del plan (' + (c[k].cuenta || 'vacía') + ').'); });
    Object.entries(c.retenciones.porConcepto || {}).forEach(([k, v]) => {
      if (v.cuenta && !C.esDeMovimiento(db, v.cuenta)) e.push('Retención ' + C.CONCEPTOS_RETENCION[k] + ': la cuenta ' + v.cuenta + ' no es de movimiento.');
      if (v.pct !== '' && v.pct !== undefined && !(Number(v.pct) >= 0 && Number(v.pct) <= 100)) e.push('Retención ' + C.CONCEPTOS_RETENCION[k] + ': el porcentaje no es válido.');
    });
    if (e.length) return setErr(e);
    commit((d) => {
      d.config.contabilidad = c;
    }, 'Parametrización contable', '');
    setErr([]); toast('Parametrización guardada');
  };
  return (
    <div className="stack">
      <Panel title="Determinación automática de cuentas" icon={Landmark}
        sub="Qué cuenta usa cada evento del inventario (como la transacción OBYC de SAP). Solo se permiten cuentas de movimiento del plan de cuentas."
        actions={editar && <Btn variant="primary" icon={Save} onClick={guardar}>Guardar</Btn>}>
        <Errores lista={err} />
        <div className="tbl-wrap"><table className="tbl lines">
          <thead><tr><th>Concepto</th><th style={{ minWidth: 340 }}>Cuenta</th></tr></thead>
          <tbody>{Object.entries(C.CONCEPTOS_CONTABLES).map(([k, t]) => (
            <tr key={k}><td className="strong">{t}</td><td>{editar ? <SelectCuenta value={c[k].cuenta} onChange={(v) => setCta(k, v)} /> : <span className="mono">{c[k].cuenta} · {c[k].nombre}</span>}</td></tr>
          ))}</tbody>
        </table></div>
        <div className="section-title">Opciones</div>
        <div className="form-grid">
          <Field label="Cuenta puente" hint="Recomendado si las facturas de compra se registran aparte de la entrada (evita contabilizar dos veces)">
            <label className="check"><input type="checkbox" checked={!!c.usarPuente} disabled={!editar} onChange={(e) => setC((x) => Object.assign({}, x, { usarPuente: e.target.checked }))} /> La entrada abona "mercancía recibida por facturar" y la factura la cancela</label>
          </Field>
          <Field label="Centro de costo"><label className="check"><input type="checkbox" checked={!!c.centroCostoPorBodega} disabled={!editar} onChange={(e) => setC((x) => Object.assign({}, x, { centroCostoPorBodega: e.target.checked }))} /> Usar el código de la bodega como centro de costo</label></Field>
          <Field label="Retención en la fuente sugerida (%)"><input className="input" type="number" step="0.01" value={c.retenciones.retefuentePct} disabled={!editar} onChange={(e) => setRet('retefuentePct', e.target.value)} /></Field>
          <Field label="ReteIVA sugerida (% del IVA)"><input className="input" type="number" value={c.retenciones.reteivaPct} disabled={!editar} onChange={(e) => setRet('reteivaPct', e.target.value)} /></Field>
          <Field label="ReteICA sugerida (%)"><input className="input" type="number" step="0.001" value={c.retenciones.reteicaPct} disabled={!editar} onChange={(e) => setRet('reteicaPct', e.target.value)} /></Field>
        </div>
      </Panel>
      <Panel title="Retención en la fuente por tipo de concepto" icon={Landmark} sub="Cada grupo de Clasificación tiene un tipo de concepto. Al registrar la factura del proveedor se sugieren este porcentaje y esta cuenta. Vacío = la retención general.">
        <div className="tbl-wrap"><table className="tbl lines">
          <thead><tr><th>Tipo de concepto</th><th className="num">Retención (%)</th><th style={{ minWidth: 320 }}>Cuenta de retención</th></tr></thead>
          <tbody>{Object.entries(C.CONCEPTOS_RETENCION).map(([k, nombre]) => {
            const v = (c.retenciones.porConcepto || {})[k] || { pct: '', cuenta: '' };
            const setV = (campo, x) => setC((y) => Object.assign({}, y, { retenciones: Object.assign({}, y.retenciones, { porConcepto: Object.assign({}, y.retenciones.porConcepto, { [k]: Object.assign({}, v, { [campo]: x }) }) }) }));
            return (
              <tr key={k}><td className="strong">{nombre}</td>
                <td><input className="input num" type="number" min="0" max="100" step="0.01" value={v.pct ?? ''} disabled={!editar} placeholder={String(c.retenciones.retefuentePct)} onChange={(e) => setV('pct', e.target.value === '' ? '' : Number(e.target.value))} style={{ width: 110 }} /></td>
                <td>{editar ? <SelectCuenta value={v.cuenta || ''} onChange={(x) => setV('cuenta', x)} placeholder={'Vacío = ' + c.retefuente.cuenta} /> : <span className="mono">{v.cuenta || c.retefuente.cuenta}</span>}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
        <div style={{ marginTop: 12 }}><Nota>Las cuentas de ingreso, gasto, cuenta por pagar e inventario de cada grupo se asignan en Productos y servicios › Grupos. Los porcentajes sugeridos (compras 2,5 %, servicios 4 %, honorarios 11 %) cambian según la base y el tipo de contribuyente: confírmelos con su contador.</Nota></div>
      </Panel>
      <Nota>Cuentas sugeridas del PUC (Decreto 2650 de 1993) para un prestador de servicios de salud. Si su empresa usa un catálogo propio bajo NIIF, cárguelo en Plan de cuentas y elija aquí sus subcuentas. Valide la parametrización y las tarifas de retención con su contador.</Nota>
    </div>
  );
}

// ======================= Interfaz con el software contable =======================
export function Interfaz() {
  const { db, state, hoy, commit, toast, puede } = useStore();
  const guardado = (db.config.contabilidad || {}).interfaz || {};
  const [d, setD] = useState(() => Object.assign({ columnas: Object.keys(C.COLUMNAS_INTERFAZ), separador: ';', formatoFecha: 'aaaa-mm-dd', decimal: ',', encabezado: true, resumirPorDia: false, origenes: ['inventario', 'compras', 'cierre', 'manual'] }, guardado));
  const [f, setF] = useState({ desde: inicioMes(hoy), hasta: hoy });
  const set = (k, v) => setD((x) => Object.assign({}, x, { [k]: v }));
  const toggleCol = (c) => set('columnas', d.columnas.includes(c) ? d.columnas.filter((x) => x !== c) : [...d.columnas, c]);
  const mover = (c, dir) => { const a = d.columnas.slice(); const i = a.indexOf(c); const j = i + dir; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; set('columnas', a); };
  const cps = C.comprobantesContables(db, state, Object.assign({}, f, { origenes: d.origenes }));
  const texto = C.archivoInterfaz(cps, d);
  const muestra = texto.replace('﻿', '').split('\r\n').slice(0, 8).join('\n');
  const guardar = () => { commit((x) => { x.config.contabilidad = Object.assign({}, x.config.contabilidad, { interfaz: d }); }, 'Diseño de interfaz contable', ''); toast('Diseño de interfaz guardado'); };
  const ORIG = [['inventario', 'Movimientos de inventario'], ['compras', 'Facturas de proveedor'], ['cierre', 'Cierres (deterioro)'], ['manual', 'Comprobantes manuales']];
  return (
    <div className="stack">
      <Panel title="Interfaz con el software contable" icon={Download}
        sub="Diseñe el archivo con las columnas, el orden y el formato que pide su software contable. Elija qué comprobantes enviar para no registrar dos veces lo que su contador ya digita."
        actions={<>{puede('contabilidad') && <Btn icon={Save} onClick={guardar}>Guardar diseño</Btn>}<Btn variant="primary" icon={Download} onClick={() => descargar('interfaz-contable-' + f.desde + '-' + f.hasta + (d.separador === '\t' ? '.txt' : '.csv'), texto, 'text/plain;charset=utf-8')} disabled={!cps.length}>Generar archivo</Btn></>}>
        <div className="toolbar"><Rango f={f} setF={setF} /></div>
        <div className="section-title">Qué enviar</div>
        <div className="toolbar">{ORIG.map(([k, t]) => <label key={k} className="check" style={{ marginRight: 14 }}><input type="checkbox" checked={d.origenes.includes(k)} onChange={() => set('origenes', d.origenes.includes(k) ? d.origenes.filter((x) => x !== k) : [...d.origenes, k])} /> {t}</label>)}</div>
        <div className="section-title">Columnas (marque y ordene)</div>
        <div className="toolbar">
          {[...d.columnas, ...Object.keys(C.COLUMNAS_INTERFAZ).filter((c) => !d.columnas.includes(c))].map((c) => (
            <span key={c} className={'chip ' + (d.columnas.includes(c) ? 'cyan' : 'muted')} style={{ gap: 4 }}>
              <input type="checkbox" checked={d.columnas.includes(c)} onChange={() => toggleCol(c)} /> {C.COLUMNAS_INTERFAZ[c]}
              {d.columnas.includes(c) && <><button type="button" className="btn ghost sm" style={{ padding: '0 4px' }} onClick={() => mover(c, -1)}>◀</button><button type="button" className="btn ghost sm" style={{ padding: '0 4px' }} onClick={() => mover(c, 1)}>▶</button></>}
            </span>
          ))}
        </div>
        <div className="form-grid">
          <Field label="Separador"><select className="select input" value={d.separador} onChange={(e) => set('separador', e.target.value)}><option value=";">Punto y coma (;)</option><option value=",">Coma (,)</option><option value={'\t'}>Tabulación (TXT)</option><option value="|">Barra (|)</option></select></Field>
          <Field label="Formato de fecha"><select className="select input" value={d.formatoFecha} onChange={(e) => set('formatoFecha', e.target.value)}><option>aaaa-mm-dd</option><option>dd/mm/aaaa</option><option>aaaammdd</option></select></Field>
          <Field label="Separador decimal"><select className="select input" value={d.decimal} onChange={(e) => set('decimal', e.target.value)}><option value=",">Coma (1234,50)</option><option value=".">Punto (1234.50)</option></select></Field>
          <Field label="Opciones"><label className="check"><input type="checkbox" checked={d.encabezado} onChange={(e) => set('encabezado', e.target.checked)} /> Incluir encabezado</label><label className="check"><input type="checkbox" checked={d.resumirPorDia} onChange={(e) => set('resumirPorDia', e.target.checked)} /> Resumir por día, cuenta, tercero y centro</label></Field>
        </div>
        <div className="section-title">Vista previa ({num(cps.length)} comprobantes)</div>
        <pre className="preview-file">{muestra || 'Sin datos en el rango.'}</pre>
      </Panel>
    </div>
  );
}

export default Comprobantes;
