import { useState } from 'react';
import { PackagePlus, Plus, ScanBarcode, Trash2 } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { Btn, Errores, Field, Modal, Nota, Panel } from '../components/ui.jsx';
import { MovTabla, SelectBodega, SelectProducto, SelectTercero, useRegistrar } from '../components/Movimientos.jsx';
import { FormProveedor } from './Proveedores.jsx';
import { money, num } from '../format.js';

const lineaVacia = () => ({ productoId: '', lote: '', vence: '', cantidad: '', costoUnit: '', enCompra: false });

export function SelectUnidad({ producto, value, onChange }) {
  if (!producto || !(Number(producto.factorCompra) > 1)) return <span className="muted small">{producto ? producto.unidad : ''}</span>;
  return (
    <select className="select input" value={value ? '1' : '0'} onChange={(e) => onChange(e.target.value === '1')} style={{ width: 150 }}>
      <option value="0">{producto.unidad}</option>
      <option value="1">{producto.unidadCompra || 'empaque'} (×{producto.factorCompra})</option>
    </select>
  );
}

export function NuevaEntrada({ onClose, ordenInicial }) {
  const { db, hoy, toast } = useStore();
  const registrar = useRegistrar();
  const pendientes = (o) => C.estadoOrden(db, o).lineas.filter((l) => l.pendiente > 0)
    .map((l) => ({ productoId: l.productoId, lote: '', vence: '', cantidad: l.pendiente, costoUnit: l.costoUnit, enCompra: false }));
  const ordenesAbiertas = db.ordenes.filter((o) => ['abierta', 'parcial'].includes(C.estadoOrden(db, o).estado));
  const [h, setH] = useState(() => {
    const o = ordenInicial;
    return { fecha: hoy, proveedorId: o ? o.proveedorId : '', docTipo: 'FE', docNum: '', costosAdic: '', nota: '', bodega: o ? (o.bodega || C.bodegaPrincipal(db.config)) : C.bodegaPrincipal(db.config), ordenId: o ? o.id : '' };
  });
  const [lineas, setLineas] = useState(() => (ordenInicial ? pendientes(ordenInicial) : [lineaVacia()]));
  const [scan, setScan] = useState('');
  const [err, setErr] = useState([]);
  const [nuevoProv, setNuevoProv] = useState(false);
  const setHk = (k) => (e) => setH((x) => Object.assign({}, x, { [k]: e.target.value }));
  const setL = (i, k, v) => setLineas((ls) => ls.map((l, j) => (j === i ? Object.assign({}, l, { [k]: v }) : l)));
  const prod = (id) => db.productos.find((p) => p.id === id);
  const lotesDe = (id) => db.lotes.filter((x) => x.productoId === id);
  const setLote = (i, v) => setLineas((ls) => ls.map((l, j) => {
    if (j !== i) return l;
    const ex = l.productoId ? C.buscarLote(db, l.productoId, v) : null;
    return Object.assign({}, l, { lote: v }, ex && ex.vence ? { vence: ex.vence } : {});
  }));

  const elegirProveedor = (id) => {
    const p = db.proveedores.find((x) => x.id === id);
    setH((x) => Object.assign({}, x, { proveedorId: id, docTipo: p && p.obligadoFacturar === false ? 'DS' : 'FE' }));
  };
  const elegirOrden = (id) => {
    const o = db.ordenes.find((x) => x.id === id);
    if (!o) { setH((x) => Object.assign({}, x, { ordenId: '' })); return; }
    const p = db.proveedores.find((x) => x.id === o.proveedorId);
    setH((x) => Object.assign({}, x, { ordenId: id, proveedorId: o.proveedorId, docTipo: p && p.obligadoFacturar === false ? 'DS' : 'FE', bodega: o.bodega || x.bodega }));
    setLineas(pendientes(o));
  };

  const leer = () => {
    const r = C.parseGS1(scan);
    if (!r) return toast('No se reconoció el código GS1 / UDI', 'error');
    const sinCeros = (s) => String(s || '').replace(/^0+/, '');
    const p = r.gtin ? db.productos.find((x) => x.gtin && sinCeros(x.gtin) === sinCeros(r.gtin)) : null;
    if (!p) return toast('Ningún producto tiene el GTIN ' + (r.gtin || '—') + '. Regístrelo en la ficha del producto.', 'error');
    setLineas((ls) => {
      const i = ls.findIndex((l) => l.productoId === p.id && !l.lote);
      if (i >= 0) return ls.map((l, j) => (j === i ? Object.assign({}, l, { lote: r.lote || '', vence: r.vence || '' }) : l));
      const base = ls.filter((l) => l.productoId || l.lote || l.cantidad);
      return [...base, { productoId: p.id, lote: r.lote || '', vence: r.vence || '', cantidad: 1, costoUnit: '', enCompra: false }];
    });
    setScan('');
    toast('Leído: ' + p.nombre + (r.lote ? ' · lote ' + r.lote : ''));
  };

  const subtotal = lineas.reduce((s, l) => s + (Number(l.cantidad) || 0) * (Number(l.costoUnit) || 0), 0);
  const guardar = () => {
    const ls = lineas.filter((l) => l.productoId || l.lote || l.cantidad).map((l) => {
      const p = prod(l.productoId) || {};
      const b = C.aUnidadBase(p, l.cantidad, l.costoUnit, l.enCompra);
      return { productoId: l.productoId, lote: String(l.lote).trim(), vence: l.vence, cantidad: b.cantidad, costoUnit: b.costoUnit };
    });
    const o = db.ordenes.find((x) => x.id === h.ordenId);
    const e = registrar(Object.assign({ tipo: 'entrada', lineas: ls }, h, { docNum: h.docNum.trim(), costosAdic: Number(h.costosAdic) || 0, ordenNum: o ? o.num : '' }));
    if (e.length) return setErr(e);
    onClose();
  };

  return (
    <Modal open wide title="Nueva entrada de mercancía" icon={PackagePlus} onClose={onClose}
      footer={<><span className="muted" style={{ marginRight: 'auto' }}>Subtotal {money(subtotal)} + costos adicionales {money(h.costosAdic)}</span><Btn onClick={onClose}>Cancelar</Btn><Btn variant="primary" onClick={guardar}>Registrar entrada</Btn></>}>
      <Errores lista={err} />
      <div className="section-title" style={{ marginTop: 0 }}>1 · Documento de compra</div>
      <div className="form-grid">
        <Field label="Orden de compra" hint="Opcional: trae las cantidades pendientes">
          <select className="select input" value={h.ordenId} onChange={(e) => elegirOrden(e.target.value)}>
            <option value="">Sin orden</option>
            {ordenesAbiertas.map((o) => <option key={o.id} value={o.id}>{o.num} · {(db.proveedores.find((p) => p.id === o.proveedorId) || {}).nombre}</option>)}
          </select>
        </Field>
        <Field label="Fecha"><input className="input" type="date" value={h.fecha} max={hoy} onChange={setHk('fecha')} /></Field>
        <Field label="Bodega que recibe"><SelectBodega value={h.bodega} onChange={(v) => setH((x) => Object.assign({}, x, { bodega: v }))} /></Field>
        <Field label="Proveedor (NIT o nombre)" span>
          <SelectTercero tipo="proveedor" value={h.proveedorId} onChange={elegirProveedor} disabled={!!h.ordenId} onCreate={(q) => setNuevoProv({ buscar: q, tipos: ['proveedor'] })} />
        </Field>
        <Field label="Tipo de soporte">
          <select className="select input" value={h.docTipo} onChange={setHk('docTipo')}>
            {Object.entries(C.DOC_TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Número del soporte" hint="Prefijo y consecutivo DIAN"><input className="input mono" value={h.docNum} onChange={setHk('docNum')} /></Field>
        <Field label="Costos adicionales" hint="Fletes, seguros y aranceles no recuperables"><input className="input" type="number" min="0" value={h.costosAdic} onChange={setHk('costosAdic')} /></Field>
        <Field label="Nota"><input className="input" value={h.nota} onChange={setHk('nota')} /></Field>
      </div>

      <div className="section-title">2 · Productos recibidos (uno por lote)</div>
      <div className="scanbox" style={{ marginBottom: 12 }}>
        <ScanBarcode size={20} />
        <input className="input mono" value={scan} onChange={(e) => setScan(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); leer(); } }}
          placeholder="Escanee o pegue el código GS1 / UDI, por ejemplo (01)07701234500018(17)291231(10)LOTE1" />
        <Btn size="sm" onClick={leer}>Leer</Btn>
      </div>
      <div className="tbl-wrap lines">
        <table className="tbl">
          <thead><tr><th style={{ minWidth: 230 }}>Producto</th><th>Número de lote</th><th>Fecha de vencimiento</th><th className="num">Cantidad</th><th>Unidad</th><th className="num">Costo unit. (sin IVA descontable)</th><th className="num">Total</th><th /></tr></thead>
          <tbody>
            {lineas.map((l, i) => {
              const p = prod(l.productoId);
              return (
                <tr key={i}>
                  <td><SelectProducto value={l.productoId} onChange={(v) => setL(i, 'productoId', v)} /></td>
                  <td>
                    <input className="input mono" value={l.lote} onChange={(e) => setLote(i, e.target.value)} style={{ minWidth: 120 }} list={'lotes-ent-' + i} placeholder="Ej.: L2409A" />
                    <datalist id={'lotes-ent-' + i}>{lotesDe(l.productoId).map((x) => <option key={x.id} value={x.lote}>{'vence ' + x.vence + ' · ' + (C.ESTADOS_LOTE[x.estado] || '')}</option>)}</datalist>
                    {l.productoId && l.lote && C.buscarLote(db, l.productoId, l.lote) && <div className="small cyan-t">Lote existente</div>}
                  </td>
                  <td><input className="input" type="date" value={l.vence} onChange={(e) => setL(i, 'vence', e.target.value)} /></td>
                  <td><input className="input num" type="number" min="0" value={l.cantidad} onChange={(e) => setL(i, 'cantidad', e.target.value)} style={{ width: 96 }} /></td>
                  <td><SelectUnidad producto={p} value={l.enCompra} onChange={(v) => setL(i, 'enCompra', v)} /></td>
                  <td><input className="input num" type="number" min="0" value={l.costoUnit} onChange={(e) => setL(i, 'costoUnit', e.target.value)} style={{ width: 130 }} /></td>
                  <td className="num">{money((Number(l.cantidad) || 0) * (Number(l.costoUnit) || 0))}{l.enCompra && p ? <div className="small muted">{num(Number(l.cantidad) * Number(p.factorCompra))} {p.unidad}</div> : null}</td>
                  <td><Btn variant="ghost" size="sm" icon={Trash2} onClick={() => setLineas((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : [lineaVacia()]))} title="Quitar" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="toolbar" style={{ marginTop: 10 }}>
        <Btn size="sm" icon={Plus} onClick={() => setLineas((ls) => [...ls, lineaVacia()])}>Agregar línea</Btn>
      </div>
      <Nota>
        <b>Cómo llenar:</b> elija el producto, escriba el número de lote del empaque (si ya existe, se completa la fecha de vencimiento) y la fecha de vencimiento del empaque.
        Si el mismo producto llega en dos lotes, use una línea por lote. Se bloquea la entrada si falta la factura electrónica o el documento soporte, si el producto no tiene registro INVIMA vigente o si el lote ya está vencido.
        Si compra por empaque (caja, bolsa), elija esa unidad: el sistema convierte la cantidad y el costo a la unidad de consumo. El IVA descontable no hace parte del costo.
      </Nota>
      {nuevoProv && <FormProveedor inicial={nuevoProv === true ? {} : nuevoProv} onClose={() => setNuevoProv(false)} onGuardado={(p) => setH((x) => Object.assign({}, x, { proveedorId: p.id, docTipo: p.obligadoFacturar ? 'FE' : 'DS' }))} />}
    </Modal>
  );
}

export default function Entradas({ arg }) {
  const { puede } = useStore();
  const [nueva, setNueva] = useState(arg === 'nuevo');
  return (
    <Panel title="Entradas de mercancía" icon={PackagePlus}
      sub="Compras soportadas con factura electrónica o documento soporte, con o sin orden de compra. Cada línea registra lote y vencimiento."
      actions={puede('entradas') && <Btn variant="primary" icon={Plus} onClick={() => setNueva(true)}>Nueva entrada</Btn>}>
      <MovTabla tipos={['entrada', 'inicial']} vacio="Registre la primera compra." />
      {nueva && <NuevaEntrada onClose={() => setNueva(false)} />}
    </Panel>
  );
}
