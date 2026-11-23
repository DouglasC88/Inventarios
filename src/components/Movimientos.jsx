import { useState } from 'react';
import { Ban, Eye, FileText } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { Btn, Chip, Empty, Errores, Field, Modal, SearchBox } from './ui.jsx';
import { money, money2, num, fecha, fechaHora, TONO_MOV } from '../format.js';

/** Valida y registra un movimiento. Devuelve la lista de errores (vacía si se registró). */
export function useRegistrar() {
  const { db, hoy, commit, toast } = useStore();
  return (mov, accion) => {
    const m = Object.assign({ id: C.nuevoId(), creado: new Date().toISOString(), usuario: db.config.usuario }, mov);
    const e = C.validarMovimiento(db, m, hoy);
    if (e.length) return e;
    const pref = { entrada: 'EN', salida: 'SA', ajuste: 'AJ', baja: 'BA' }[m.tipo];
    const numero = pref + '-' + String((db.seq[pref] || 0) + 1).padStart(5, '0');
    commit((d) => {
      d.movimientos.push(Object.assign({}, m, { num: C.siguienteNumero(d, m.tipo), orden: C.siguienteOrden(d) }));
      if (m.conteoId) {
        const c = d.conteos.find((x) => x.id === m.conteoId);
        if (c) { c.estado = 'aplicado'; c.ajusteNum = numero; c.aplicado = new Date().toISOString(); }
      }
    }, (accion || C.TIPOS_MOV[m.tipo] + ' registrada'), numero);
    toast(numero + ' registrado');
    return [];
  };
}

export function nombreProducto(db, id) {
  const p = db.productos.find((x) => x.id === id);
  return p ? p.nombre : 'Producto eliminado';
}

export function MovDetalle({ mov, onClose }) {
  const { db, state, commit, toast } = useStore();
  const [anular, setAnular] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [err, setErr] = useState([]);
  const costos = state.movCost[mov.id];
  const prov = db.proveedores.find((p) => p.id === mov.proveedorId);

  const confirmarAnulacion = () => {
    const e = C.validarAnulacion(db, mov);
    if (!motivo.trim()) e.push('Escriba el motivo de la anulación.');
    if (e.length) return setErr(e);
    commit((d) => {
      const m = d.movimientos.find((x) => x.id === mov.id);
      m.anulado = true;
      m.anulacion = { motivo: motivo.trim(), fecha: new Date().toISOString(), usuario: d.config.usuario };
    }, 'Movimiento anulado', mov.num + ' · ' + motivo.trim());
    toast(mov.num + ' anulado');
    onClose();
  };

  const kv = [
    ['Documento', mov.num], ['Fecha', fecha(mov.fecha)], ['Tipo', C.TIPOS_MOV[mov.tipo]],
    ['Valor', money(costos ? costos.total : 0)]
  ];
  if (mov.tipo === 'entrada') kv.push(['Proveedor', prov ? prov.nombre : '—'], ['Soporte', mov.docTipo + ' ' + mov.docNum], ['Costos adicionales', money(mov.costosAdic || 0)]);
  if (mov.tipo === 'salida') kv.push(['Destino', (mov.destinoTipo || '') + ' ' + (mov.destino || '')], ['Responsable', mov.responsable || '—']);
  if (mov.tipo === 'baja') kv.push(['Causa', C.CAUSAS_BAJA[mov.causa]], ['Acta', mov.acta], ['Autoriza', mov.autoriza]);
  if (mov.tipo === 'ajuste') kv.push(['Acta / soporte', mov.acta], ['Autoriza', mov.autoriza || '—']);
  if (mov.conteoNum) kv.push(['Conteo', mov.conteoNum]);
  kv.push(['Registrado por', mov.usuario || '—'], ['Registrado', fechaHora(mov.creado)]);

  return (
    <Modal open wide title={'Documento ' + mov.num} icon={FileText} onClose={onClose}
      footer={!mov.anulado && !anular ? <><Btn onClick={onClose}>Cerrar</Btn><Btn variant="danger" icon={Ban} onClick={() => setAnular(true)}>Anular</Btn></> : <Btn onClick={onClose}>Cerrar</Btn>}>
      {mov.anulado && <Errores lista={['Anulado el ' + fechaHora(mov.anulacion?.fecha) + ' por ' + (mov.anulacion?.usuario || '—') + ': ' + (mov.anulacion?.motivo || '')]} />}
      <div className="kv">{kv.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>
      {mov.nota && <p className="muted">Nota: {mov.nota}</p>}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Producto</th><th>Lote</th><th>Vence</th>{mov.tipo === 'ajuste' && <th>Causa</th>}<th className="num">Cantidad</th><th className="num">Costo unit.</th><th className="num">Valor</th></tr></thead>
          <tbody>
            {mov.lineas.map((l, i) => (
              <tr key={i}>
                <td>{nombreProducto(db, l.productoId)}</td>
                <td className="mono">{l.lote}</td>
                <td>{fecha(l.vence)}</td>
                {mov.tipo === 'ajuste' && <td>{C.CAUSAS_AJUSTE[l.causa]}</td>}
                <td className="num">{num(l.cantidad)}</td>
                <td className="num">{costos ? money2(costos.lineas[i].unit) : '—'}</td>
                <td className="num">{costos ? money(costos.lineas[i].valor) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {anular && (
        <div style={{ marginTop: 16 }}>
          <Errores lista={err} />
          <Field label="Motivo de la anulación" hint="La anulación queda registrada; el documento no se borra.">
            <input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
          </Field>
          <div className="toolbar" style={{ marginTop: 12 }}>
            <Btn onClick={() => { setAnular(false); setErr([]); }}>Cancelar</Btn>
            <Btn variant="danger" icon={Ban} onClick={confirmarAnulacion}>Confirmar anulación</Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function MovTabla({ tipos, vacio }) {
  const { db, state } = useStore();
  const [q, setQ] = useState('');
  const [ver, setVer] = useState(null);
  const lista = C.ordenar(db.movimientos).reverse().filter((m) => tipos.includes(m.tipo)).filter((m) => {
    if (!q) return true;
    const prov = db.proveedores.find((p) => p.id === m.proveedorId);
    const txt = [m.num, m.docNum, m.destino, m.acta, prov && prov.nombre, ...m.lineas.map((l) => l.lote + ' ' + nombreProducto(db, l.productoId))].join(' ');
    return txt.toLowerCase().includes(q.toLowerCase());
  });
  const detalle = (m) => {
    if (m.tipo === 'entrada') {
      const prov = db.proveedores.find((p) => p.id === m.proveedorId);
      return <>{prov ? prov.nombre : '—'}<div className="small muted mono">{m.docTipo} {m.docNum}</div></>;
    }
    if (m.tipo === 'salida') return <>{m.destinoTipo}: {m.destino}<div className="small muted">{m.responsable}</div></>;
    if (m.tipo === 'baja') return <>{C.CAUSAS_BAJA[m.causa]}<div className="small muted">Acta {m.acta}</div></>;
    return <>{[...new Set(m.lineas.map((l) => C.CAUSAS_AJUSTE[l.causa]))].join(', ')}<div className="small muted">Acta {m.acta}{m.conteoNum ? ' · ' + m.conteoNum : ''}</div></>;
  };
  return (
    <>
      <div className="toolbar"><SearchBox value={q} onChange={setQ} placeholder="Buscar documento, lote, producto…" /></div>
      {lista.length ? (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Documento</th><th>Fecha</th>{tipos.length > 1 && <th>Tipo</th>}<th>Detalle</th><th className="num">Líneas</th><th className="num">Valor</th><th /></tr></thead>
            <tbody>
              {lista.map((m) => (
                <tr key={m.id} className={m.anulado ? 'anulado' : ''}>
                  <td className="mono">{m.num}</td>
                  <td>{fecha(m.fecha)}</td>
                  {tipos.length > 1 && <td><Chip tone={TONO_MOV[m.tipo]}>{C.TIPOS_MOV[m.tipo]}</Chip></td>}
                  <td>{detalle(m)}</td>
                  <td className="num">{m.lineas.length}</td>
                  <td className="num">{money(state.movCost[m.id]?.total || 0)}</td>
                  <td className="acts"><Btn variant="ghost" size="sm" icon={Eye} onClick={() => setVer(m)} title="Ver documento" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty icon={FileText} title="Sin documentos" text={vacio} />}
      {ver && <MovDetalle mov={ver} onClose={() => setVer(null)} />}
    </>
  );
}

export function SelectProducto({ value, onChange, autoFocus }) {
  const { db } = useStore();
  const lista = db.productos.filter((p) => p.activo !== false).slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
  return (
    <select className="select input" value={value} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus}>
      <option value="">Seleccione…</option>
      {lista.map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.nombre}</option>)}
    </select>
  );
}
