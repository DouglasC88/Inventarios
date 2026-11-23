import { useState } from 'react';
import { Ban, Eye, FileText, Printer } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { Btn, Chip, Empty, Errores, Field, Modal, SearchBox } from './ui.jsx';
import { imprimirMovimiento } from './imprimir.js';
import Combo from './Combo.jsx';
import { money, money2, num, fecha, fechaHora, TONO_MOV } from '../format.js';

/** Valida y registra un movimiento. Devuelve la lista de errores (vacía si se registró). */
export function useRegistrar() {
  const { db, hoy, commit, toast, nombreUsuario } = useStore();
  return (mov, accion, extra) => {
    const m = Object.assign({ id: C.nuevoId(), creado: new Date().toISOString(), usuario: nombreUsuario }, mov);
    if (!m.bodega) m.bodega = C.bodegaPrincipal(db.config);
    const e = C.validarMovimiento(db, m, hoy);
    if (e.length) return e;
    const numero = C.verNumero(db, m.tipo);
    commit((d) => {
      const nuevo = Object.assign({}, m, { num: C.siguienteNumero(d, m.tipo), orden: C.siguienteOrden(d) });
      d.movimientos.push(nuevo);
      C.asegurarLotes(d, nuevo);
      if (m.conteoId) {
        const c = d.conteos.find((x) => x.id === m.conteoId);
        if (c) { c.estado = 'aplicado'; c.ajusteNum = numero; c.aplicado = new Date().toISOString(); }
      }
      if (extra) extra(d, numero);
    }, (accion || C.TIPOS_MOV[m.tipo] + ' registrada'), numero);
    toast(numero + ' registrado');
    return [];
  };
}

export function nombreProducto(db, id) {
  const p = db.productos.find((x) => x.id === id);
  return p ? p.nombre : 'Producto eliminado';
}

export function SelectBodega({ value, onChange, soloPropia, incluirTodas, excluir }) {
  const { db, usuario } = useStore();
  let lista = db.config.ubicaciones;
  if (soloPropia && usuario && usuario.rol === 'consultorio' && usuario.bodega) lista = [usuario.bodega];
  if (excluir) lista = lista.filter((b) => b !== excluir);
  const info = (n) => db.bodegas.find((b) => b.nombre === n) || {};
  const options = [
    ...(incluirTodas ? [{ value: 'todas', label: 'Todas las bodegas', sub: 'Vista general' }] : []),
    ...lista.map((b) => ({ value: b, label: b, sub: [info(b).codigo, C.TIPOS_BODEGA[info(b).tipo], info(b).principal ? 'Principal' : ''].filter(Boolean).join(' · '), search: info(b).responsable || '' }))
  ];
  return <Combo value={value} onChange={onChange} options={options} placeholder="Escriba la bodega…" />;
}

/** Buscador de grupos de la clasificación (muestra la ruta Línea › Grupo › Subgrupo). */
/** Buscador de grupos. clasificaciones: solo los grupos de esas clasificaciones (por ejemplo, los de insumos). */
export function SelectGrupo({ value, onChange, incluirTodos, incluirSin, placeholder, clasificaciones }) {
  const { db } = useStore();
  const options = [
    ...(incluirTodos ? [{ value: 'todos', label: 'Todos los grupos', sub: 'Sin filtro' }] : []),
    ...(incluirSin ? [{ value: 'sin', label: 'Sin clasificar', sub: 'Sin grupo' }] : []),
    ...C.arbolGrupos(db)
      .filter((g) => g.id === value || ((g.activo !== false) && (!clasificaciones || clasificaciones.includes(C.clasificacionGrupo(db, g.id)))))
      .map((g) => ({ value: g.id, label: '\u2003'.repeat(g.nivel - 1) + g.codigo + ' · ' + g.nombre, sub: (C.CLASIFICACIONES[C.clasificacionGrupo(db, g.id)] || 'Sin clasificación') + ' · ' + g.ruta, search: g.ruta + ' ' + (C.CLASIFICACIONES[C.clasificacionGrupo(db, g.id)] || '') }))
  ];
  return <Combo value={value} onChange={onChange} options={options} placeholder={placeholder || 'Escriba línea, grupo o subgrupo…'} />;
}

/** Buscador de lotes con existencia. keyFn arma el valor de cada opción. */
export function SelectLote({ value, onChange, keyFn, filtro, todos, bodega, extra }) {
  const { db, state, hoy } = useStore();
  const options = [
    ...C.lotes(db, state, hoy, { todos, bodega }).filter((l) => !filtro || filtro(l)).map((l) => ({
      value: keyFn(l),
      label: l.producto.codigo + ' · ' + l.producto.nombre + ' · lote ' + l.lote,
      sub: l.bodega + ' · vence ' + (l.vence || '—') + ' · existencia ' + C.r2(l.qty) + ' ' + (l.producto.unidad || '') + (l.estado === 'vencido' ? ' · VENCIDO' : '') + ((C.buscarLote(db, l.productoId, l.lote) || {}).estado && C.buscarLote(db, l.productoId, l.lote).estado !== 'liberado' ? ' · ' + C.ESTADOS_LOTE[C.buscarLote(db, l.productoId, l.lote).estado] : ''),
      search: l.producto.gtin || ''
    })),
    ...(extra || [])
  ];
  return <Combo value={value} onChange={onChange} options={options} placeholder="Escriba el lote o el producto…" />;
}

export function SelectKit({ value, onChange }) {
  const { db } = useStore();
  const options = db.servicios.filter((k) => k.activo !== false).map((k) => ({ value: k.id, label: k.codigo + ' · ' + k.nombre, sub: [k.categoria, k.cups ? 'CUPS ' + k.cups : '', k.lineas.length + ' insumos'].filter(Boolean).join(' · ') }));
  return <Combo value={value} onChange={onChange} options={options} placeholder="Escriba el servicio o procedimiento…" />;
}

export function encabezadoMov(db, mov, costos) {
  const prov = db.proveedores.find((p) => p.id === mov.proveedorId);
  const kv = [['Documento', mov.num], ['Fecha', fecha(mov.fecha)], ['Tipo', C.TIPOS_MOV[mov.tipo]], ['Valor', money(costos ? costos.total : 0)]];
  if (mov.tipo === 'traslado') kv.push(['Origen', C.bodegaDe(mov, db.config)], ['Destino', mov.bodegaDestino]);
  else kv.push(['Bodega', C.bodegaDe(mov, db.config)]);
  if (mov.tipo === 'entrada') kv.push(['Proveedor', prov ? prov.nombre : '—'], ['Documento', prov ? C.documentoTercero(prov) : '—'], ['Soporte', mov.docTipo + ' ' + mov.docNum], ['Costos adicionales', money(mov.costosAdic || 0)]);
  if (mov.ordenNum) kv.push(['Orden de compra', mov.ordenNum]);
  if (mov.tipo === 'devolucion') kv.push(['Proveedor', prov ? prov.nombre : '—'], ['Causa', C.CAUSAS_DEVOLUCION[mov.causa]], ['Documento', mov.docNum]);
  if (mov.tipo === 'salida') kv.push(['Destino', (mov.destinoTipo || '') + ' ' + (mov.destino || '')], ['Procedimiento', mov.procedimiento || '—'], ['Responsable', mov.responsable || '—']);
  if (mov.tipo === 'baja') kv.push(['Causa', C.CAUSAS_BAJA[mov.causa]], ['Acta', mov.acta], ['Autoriza', mov.autoriza]);
  if (mov.tipo === 'ajuste' || mov.tipo === 'inicial') kv.push(['Acta / soporte', mov.acta], ['Autoriza', mov.autoriza || '—']);
  if (mov.requisicionNum) kv.push(['Requisición', mov.requisicionNum]);
  if (mov.conteoNum) kv.push(['Conteo', mov.conteoNum]);
  if (mov.responsable && mov.tipo !== 'salida') kv.push(['Responsable', mov.responsable]);
  kv.push(['Registrado por', mov.usuario || '—'], ['Registrado', fechaHora(mov.creado)]);
  return kv;
}

export function MovDetalle({ mov, onClose }) {
  const { db, state, commit, toast, puede, nombreUsuario } = useStore();
  const [anular, setAnular] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [err, setErr] = useState([]);
  const costos = state.movCost[mov.id];

  const confirmarAnulacion = () => {
    const e = C.validarAnulacion(db, mov);
    if (!motivo.trim()) e.push('Escriba el motivo de la anulación.');
    if (e.length) return setErr(e);
    commit((d) => {
      const m = d.movimientos.find((x) => x.id === mov.id);
      m.anulado = true;
      m.anulacion = { motivo: motivo.trim(), fecha: new Date().toISOString(), usuario: nombreUsuario };
    }, 'Movimiento anulado', mov.num + ' · ' + motivo.trim());
    toast(mov.num + ' anulado');
    onClose();
  };

  const kv = encabezadoMov(db, mov, costos);
  return (
    <Modal open wide title={'Documento ' + mov.num} icon={FileText} onClose={onClose}
      footer={<>
        <Btn icon={Printer} onClick={() => imprimirMovimiento(db, mov, costos)}>Imprimir</Btn>
        <span style={{ flex: 1 }} />
        <Btn onClick={onClose}>Cerrar</Btn>
        {!mov.anulado && !anular && puede('anular') && <Btn variant="danger" icon={Ban} onClick={() => setAnular(true)}>Anular</Btn>}
      </>}>
      {mov.anulado && <Errores lista={['Anulado el ' + fechaHora(mov.anulacion?.fecha) + ' por ' + (mov.anulacion?.usuario || '—') + ': ' + (mov.anulacion?.motivo || '')]} />}
      <div className="kv">{kv.map(([k, v], i) => <div key={k + i}><span>{k}</span><b>{v}</b></div>)}</div>
      {mov.nota && <p className="muted">Nota: {mov.nota}</p>}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Producto</th>{mov.lineas.some((l) => l.bodega) && <th>Bodega</th>}<th>Lote</th><th>Vence</th>{mov.tipo === 'ajuste' && <th>Causa</th>}<th className="num">Cantidad</th><th className="num">Costo unit.</th><th className="num">Valor</th></tr></thead>
          <tbody>
            {mov.lineas.map((l, i) => (
              <tr key={i}>
                <td>{nombreProducto(db, l.productoId)}</td>
                {mov.lineas.some((x) => x.bodega) && <td>{l.bodega || C.bodegaDe(mov, db.config)}</td>}
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

export function MovTabla({ tipos, vacio, filtro }) {
  const { db, state } = useStore();
  const [q, setQ] = useState('');
  const [ver, setVer] = useState(null);
  const lista = C.ordenar(db.movimientos).reverse().filter((m) => tipos.includes(m.tipo) && (!filtro || filtro(m))).filter((m) => {
    if (!q) return true;
    const prov = db.proveedores.find((p) => p.id === m.proveedorId);
    const txt = [m.num, m.docNum, m.destino, m.acta, m.bodega, m.bodegaDestino, m.procedimiento, m.ordenNum, prov && prov.nombre, ...m.lineas.map((l) => l.lote + ' ' + nombreProducto(db, l.productoId))].join(' ');
    return txt.toLowerCase().includes(q.toLowerCase());
  });
  const detalle = (m) => {
    const prov = db.proveedores.find((p) => p.id === m.proveedorId);
    const b = C.bodegaDe(m, db.config);
    if (m.tipo === 'entrada') return <>{prov ? prov.nombre : '—'}<div className="small muted mono">{prov ? C.documentoTercero(prov) + ' · ' : ''}{m.docTipo} {m.docNum}{m.ordenNum ? ' · ' + m.ordenNum : ''} · {b}</div></>;
    if (m.tipo === 'inicial') return <>Saldo inicial<div className="small muted">{m.acta} · {b}</div></>;
    if (m.tipo === 'salida') return <>{m.destinoTipo}: {m.destino}{m.procedimiento ? ' · ' + m.procedimiento : ''}<div className="small muted">{b} · {m.responsable}</div></>;
    if (m.tipo === 'traslado') return <>{b} → {m.bodegaDestino}<div className="small muted">{m.requisicionNum || m.responsable || ''}</div></>;
    if (m.tipo === 'devolucion') return <>{prov ? prov.nombre : '—'}<div className="small muted">{C.CAUSAS_DEVOLUCION[m.causa]} · {m.docNum}</div></>;
    if (m.tipo === 'baja') return <>{C.CAUSAS_BAJA[m.causa]}<div className="small muted">Acta {m.acta}</div></>;
    return <>{[...new Set(m.lineas.map((l) => C.CAUSAS_AJUSTE[l.causa]))].join(', ')}<div className="small muted">Acta {m.acta}{m.conteoNum ? ' · ' + m.conteoNum : ''}</div></>;
  };
  return (
    <>
      <div className="toolbar"><SearchBox value={q} onChange={setQ} placeholder="Buscar documento, lote, producto, bodega…" /></div>
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

export function SelectProducto({ value, onChange, autoFocus, placeholder }) {
  const { db, state } = useStore();
  const grupo = (id) => (db.grupos.find((g) => g.id === id) || {}).nombre || '';
  const options = db.productos.filter((p) => p.activo !== false).slice().sort((a, b) => a.nombre.localeCompare(b.nombre)).map((p) => ({
    value: p.id,
    label: p.codigo + ' · ' + p.nombre,
    sub: [grupo(p.grupoId), 'Existencia ' + C.r2(state.prods[p.id] ? state.prods[p.id].qty : 0) + ' ' + (p.unidad || '')].filter(Boolean).join(' · '),
    search: [p.gtin, p.invima, p.fabricante].join(' ')
  }));
  return <Combo value={value} onChange={onChange} options={options} autoFocus={autoFocus} placeholder={placeholder || 'Escriba código, nombre o código de barras…'} />;
}

/** Buscador de terceros por NIT, documento o nombre. tipo: filtra por proveedor, cliente, paciente… */
export function SelectTercero({ value, onChange, tipo, autoFocus, onCreate, disabled }) {
  const { db } = useStore();
  const options = db.proveedores.filter((t) => t.activo !== false && (!tipo || (t.tipos || ['proveedor']).includes(tipo)))
    .slice().sort((a, b) => a.nombre.localeCompare(b.nombre)).map((t) => ({
      value: t.id,
      label: t.nombre,
      sub: C.documentoTercero(t) + (t.ciudad ? ' · ' + t.ciudad : ''),
      search: String(t.nit || '') + ' ' + (t.contacto || '')
    }));
  return <Combo value={value} onChange={onChange} options={options} autoFocus={autoFocus} disabled={disabled}
    placeholder="Escriba el NIT o el nombre del tercero…" onCreate={onCreate} createLabel="Crear tercero" />;
}

/** Tabla de lotes asignados por FEFO. */
export function TablaFEFO({ asignaciones }) {
  const { db, hoy } = useStore();
  if (!asignaciones.length) return null;
  const SEM = { vencido: ['magenta', 'Vencido'], rojo: ['red', 'Rojo'], amarillo: ['amber', 'Amarillo'], verde: ['green', 'Verde'], na: ['muted', 'Sin fecha'] };
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr><th>Producto</th><th>Bodega</th><th>Lote</th><th>Vence</th><th>Semáforo</th><th className="num">Cantidad</th></tr></thead>
        <tbody>
          {asignaciones.flatMap((a) => [
            ...a.asignacion.map((x, j) => {
              const s = SEM[C.semaforo(x.vence, hoy, db.config)];
              return (
                <tr key={a.productoId + j}>
                  <td>{nombreProducto(db, a.productoId)}</td><td>{x.bodega}</td><td className="mono">{x.lote}</td><td>{fecha(x.vence)}</td>
                  <td><Chip tone={s[0]} dot>{s[1]}</Chip></td><td className="num">{num(x.cantidad)}</td>
                </tr>
              );
            }),
            a.faltante > 0 && <tr key={a.productoId + 'f'}><td>{nombreProducto(db, a.productoId)}</td><td colSpan={4} className="red-t">Sin existencia disponible (liberada y sin vencer) en la bodega</td><td className="num red-t">{num(a.faltante)}</td></tr>
          ])}
        </tbody>
      </table>
    </div>
  );
}

/** Agrupa cantidades por producto y asigna lotes por FEFO en una bodega. */
export function asignarFEFO(state, lineas, hoy, bodega) {
  const totales = {};
  lineas.forEach((l) => { if (l.productoId && Number(l.cantidad) > 0) totales[l.productoId] = (totales[l.productoId] || 0) + Number(l.cantidad); });
  return Object.entries(totales).map(([id, q]) => Object.assign({ productoId: id, cantidad: q }, C.sugerirFEFO(state, id, q, hoy, bodega)));
}

/** Explica por qué no alcanza la existencia: lotes vencidos, en cuarentena o bloqueados. */
export function explicarFaltante(db, state, productoId, cantidad, hoy, bodega) {
  const ok = C.sugerirFEFO(state, productoId, Infinity, hoy, bodega).asignacion.reduce((s, x) => s + x.cantidad, 0);
  const todo = C.sugerirFEFO(state, productoId, Infinity, hoy, bodega, { incluirVencidos: true, incluirNoLiberados: true }).asignacion;
  const venc = todo.filter((x) => x.vence && x.vence < hoy).reduce((s, x) => s + x.cantidad, 0);
  const lot = (x) => { const m = C.buscarLote(db, productoId, x.lote); return m && m.estado && m.estado !== 'liberado' ? m.estado : null; };
  const ret = todo.filter((x) => !(x.vence && x.vence < hoy) && lot(x));
  const partes = [];
  if (ret.length) partes.push(C.r2(ret.reduce((s, x) => s + x.cantidad, 0)) + ' en lotes en cuarentena o bloqueados (' + ret.map((x) => x.lote).join(', ') + ')');
  if (venc > 0) partes.push(C.r2(venc) + ' vencidas');
  return nombreProducto(db, productoId) + ': se piden ' + C.r2(cantidad) + ' y hay ' + C.r2(ok) + ' disponibles en ' + bodega + '.' + (partes.length ? ' No disponibles: ' + partes.join('; ') + '.' : '');
}
