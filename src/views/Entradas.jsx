import { useState } from 'react';
import { PackagePlus, Plus, ScanBarcode, Trash2 } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { Btn, Errores, Field, Modal, Nota, Panel } from '../components/ui.jsx';
import { MovTabla, SelectProducto, useRegistrar } from '../components/Movimientos.jsx';
import { FormProveedor } from './Proveedores.jsx';
import { money } from '../format.js';

const lineaVacia = () => ({ productoId: '', lote: '', vence: '', cantidad: '', costoUnit: '' });

function NuevaEntrada({ onClose }) {
  const { db, hoy, toast } = useStore();
  const registrar = useRegistrar();
  const [h, setH] = useState({ fecha: hoy, proveedorId: '', docTipo: 'FE', docNum: '', costosAdic: '', nota: '' });
  const [lineas, setLineas] = useState([lineaVacia()]);
  const [scan, setScan] = useState('');
  const [err, setErr] = useState([]);
  const [nuevoProv, setNuevoProv] = useState(false);
  const setHk = (k) => (e) => setH((x) => Object.assign({}, x, { [k]: e.target.value }));
  const setL = (i, k, v) => setLineas((ls) => ls.map((l, j) => (j === i ? Object.assign({}, l, { [k]: v }) : l)));

  const elegirProveedor = (id) => {
    const p = db.proveedores.find((x) => x.id === id);
    setH((x) => Object.assign({}, x, { proveedorId: id, docTipo: p && p.obligadoFacturar === false ? 'DS' : 'FE' }));
  };

  const leer = () => {
    const r = C.parseGS1(scan);
    if (!r) return toast('No se reconoció el código GS1 / UDI', 'error');
    const sinCeros = (s) => String(s || '').replace(/^0+/, '');
    const p = r.gtin ? db.productos.find((x) => x.gtin && sinCeros(x.gtin) === sinCeros(r.gtin)) : null;
    if (!p) return toast('Ningún producto tiene el GTIN ' + (r.gtin || '—') + '. Regístrelo en la ficha del producto.', 'error');
    setLineas((ls) => {
      const base = ls.filter((l) => l.productoId || l.lote || l.cantidad);
      return [...base, { productoId: p.id, lote: r.lote || '', vence: r.vence || '', cantidad: 1, costoUnit: '' }];
    });
    setScan('');
    toast('Leído: ' + p.nombre + (r.lote ? ' · lote ' + r.lote : ''));
  };

  const subtotal = lineas.reduce((s, l) => s + (Number(l.cantidad) || 0) * (Number(l.costoUnit) || 0), 0);
  const guardar = () => {
    const ls = lineas.filter((l) => l.productoId || l.lote || l.cantidad).map((l) => ({
      productoId: l.productoId, lote: l.lote.trim(), vence: l.vence, cantidad: Number(l.cantidad), costoUnit: l.costoUnit === '' ? '' : Number(l.costoUnit)
    }));
    const e = registrar(Object.assign({ tipo: 'entrada', lineas: ls }, h, { docNum: h.docNum.trim(), costosAdic: Number(h.costosAdic) || 0 }));
    if (e.length) return setErr(e);
    onClose();
  };

  return (
    <Modal open wide title="Nueva entrada de mercancía" icon={PackagePlus} onClose={onClose}
      footer={<><span className="muted" style={{ marginRight: 'auto' }}>Subtotal {money(subtotal)} + costos adicionales {money(h.costosAdic)}</span><Btn onClick={onClose}>Cancelar</Btn><Btn variant="primary" onClick={guardar}>Registrar entrada</Btn></>}>
      <Errores lista={err} />
      <div className="form-grid">
        <Field label="Fecha"><input className="input" type="date" value={h.fecha} max={hoy} onChange={setHk('fecha')} /></Field>
        <Field label="Proveedor" span>
          <div style={{ display: 'flex', gap: 8 }}>
            <select className="select input" value={h.proveedorId} onChange={(e) => elegirProveedor(e.target.value)}>
              <option value="">Seleccione…</option>
              {db.proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre} · {p.nit}</option>)}
            </select>
            <Btn icon={Plus} onClick={() => setNuevoProv(true)} title="Nuevo proveedor" />
          </div>
        </Field>
        <Field label="Tipo de soporte">
          <select className="select input" value={h.docTipo} onChange={setHk('docTipo')}>
            {Object.entries(C.DOC_TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Número del soporte" hint="Prefijo y consecutivo DIAN"><input className="input mono" value={h.docNum} onChange={setHk('docNum')} /></Field>
        <Field label="Costos adicionales" hint="Fletes, seguros y aranceles no recuperables. Se prorratean al costo."><input className="input" type="number" min="0" value={h.costosAdic} onChange={setHk('costosAdic')} /></Field>
        <Field label="Nota" span><input className="input" value={h.nota} onChange={setHk('nota')} /></Field>
      </div>

      <div className="section-title">Líneas</div>
      <div className="scanbox" style={{ marginBottom: 12 }}>
        <ScanBarcode size={20} />
        <input className="input mono" value={scan} onChange={(e) => setScan(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); leer(); } }}
          placeholder="Escanee o pegue el código GS1 / UDI, por ejemplo (01)07701234500018(17)291231(10)LOTE1" />
        <Btn size="sm" onClick={leer}>Leer</Btn>
      </div>
      <div className="tbl-wrap lines">
        <table className="tbl">
          <thead><tr><th style={{ minWidth: 240 }}>Producto</th><th>Lote</th><th>Vence</th><th className="num">Cantidad</th><th className="num">Costo unit. (sin IVA descontable)</th><th className="num">Total</th><th /></tr></thead>
          <tbody>
            {lineas.map((l, i) => (
              <tr key={i}>
                <td><SelectProducto value={l.productoId} onChange={(v) => setL(i, 'productoId', v)} /></td>
                <td><input className="input mono" value={l.lote} onChange={(e) => setL(i, 'lote', e.target.value)} /></td>
                <td><input className="input" type="date" value={l.vence} onChange={(e) => setL(i, 'vence', e.target.value)} /></td>
                <td><input className="input num" type="number" min="0" value={l.cantidad} onChange={(e) => setL(i, 'cantidad', e.target.value)} style={{ width: 100 }} /></td>
                <td><input className="input num" type="number" min="0" value={l.costoUnit} onChange={(e) => setL(i, 'costoUnit', e.target.value)} style={{ width: 140 }} /></td>
                <td className="num">{money((Number(l.cantidad) || 0) * (Number(l.costoUnit) || 0))}</td>
                <td><Btn variant="ghost" size="sm" icon={Trash2} onClick={() => setLineas((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : [lineaVacia()]))} title="Quitar" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="toolbar" style={{ marginTop: 10 }}>
        <Btn size="sm" icon={Plus} onClick={() => setLineas((ls) => [...ls, lineaVacia()])}>Agregar línea</Btn>
      </div>
      <Nota>
        El sistema bloquea la entrada si falta el número de factura electrónica o documento soporte, si el producto no tiene registro INVIMA vigente o si el lote ya está vencido.
        El IVA descontable no hace parte del costo.
      </Nota>
      {nuevoProv && <FormProveedor onClose={() => setNuevoProv(false)} onGuardado={(p) => setH((x) => Object.assign({}, x, { proveedorId: p.id, docTipo: p.obligadoFacturar ? 'FE' : 'DS' }))} />}
    </Modal>
  );
}

export default function Entradas() {
  const [nueva, setNueva] = useState(false);
  return (
    <Panel title="Entradas de mercancía" icon={PackagePlus}
      sub="Compras soportadas con factura electrónica o documento soporte. Cada línea registra lote y vencimiento."
      actions={<Btn variant="primary" icon={Plus} onClick={() => setNueva(true)}>Nueva entrada</Btn>}>
      <MovTabla tipos={['entrada']} vacio="Registre la primera compra." />
      {nueva && <NuevaEntrada onClose={() => setNueva(false)} />}
    </Panel>
  );
}
