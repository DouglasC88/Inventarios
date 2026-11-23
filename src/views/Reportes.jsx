import { useState } from 'react';
import { BarChart3, Download } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { Btn, Chip, Empty, Field, Panel, Tabs } from '../components/ui.jsx';
import { descargar, fecha, money, money2, num, pct, TONO_MOV } from '../format.js';

function Valorizado() {
  const { db, hoy } = useStore();
  const [corte, setCorte] = useState(hoy);
  const [bodega, setBodega] = useState('todas');
  const st = C.replay(db, { hasta: corte });
  const filas = db.productos.map((p) => {
    const s = st.prods[p.id];
    const qty = bodega === 'todas' ? (s ? s.qty : 0) : C.existencia(st, p.id, bodega);
    const unit = s && s.qty ? s.value / s.qty : 0;
    return { p, qty, unit, valor: C.r2(qty * unit) };
  }).filter((f) => f.qty > 0);
  const total = filas.reduce((s, f) => s + f.valor, 0);
  const exportar = () => {
    const rows = [['Código', 'Producto', 'Categoría', 'Unidad', 'Existencia', 'Costo unitario', 'Valor']];
    filas.forEach((f) => rows.push([f.p.codigo, f.p.nombre, C.CATEGORIAS[f.p.categoria], f.p.unidad, f.qty, C.r2(f.unit), f.valor]));
    rows.push(['', 'TOTAL', '', '', '', '', C.r2(total)]);
    descargar('inventario-valorado-' + corte + '-' + bodega + '.csv', C.csv(rows));
  };
  return (
    <>
      <div className="toolbar">
        <Field label="Fecha de corte"><input className="input" type="date" value={corte} max={hoy} onChange={(e) => setCorte(e.target.value)} /></Field>
        <Field label="Bodega">
          <select className="select input" value={bodega} onChange={(e) => setBodega(e.target.value)}>
            <option value="todas">Todas</option>{db.config.ubicaciones.map((b) => <option key={b}>{b}</option>)}
          </select>
        </Field>
        <span style={{ flex: 1 }} /><Btn icon={Download} onClick={exportar}>Exportar</Btn>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Código</th><th>Producto</th><th>Categoría</th><th className="num">Existencia</th><th className="num">Costo unit.</th><th className="num">Valor</th></tr></thead>
          <tbody>{filas.map((f) => <tr key={f.p.id}><td className="mono">{f.p.codigo}</td><td>{f.p.nombre}</td><td>{C.CATEGORIAS[f.p.categoria]}</td><td className="num">{num(f.qty)} {f.p.unidad}</td><td className="num">{money2(f.unit)}</td><td className="num">{money(f.valor)}</td></tr>)}</tbody>
          <tfoot><tr><td colSpan={5}>Total al {fecha(corte)}</td><td className="num">{money(total)}</td></tr></tfoot>
        </table>
      </div>
    </>
  );
}

function ABC() {
  const { db, state, hoy } = useStore();
  const [dias, setDias] = useState(365);
  const r = C.analisisABC(db, state, hoy, dias);
  const tono = { A: 'magenta', B: 'amber', C: 'cyan' };
  const cuenta = (k) => r.filas.filter((f) => f.clase === k).length;
  const exportar = () => {
    const rows = [['Clase', 'Código', 'Producto', 'Cantidad consumida', 'Valor consumido', 'Participación %', 'Acumulado %']];
    r.filas.forEach((f) => rows.push([f.clase, f.producto.codigo, f.producto.nombre, f.cantidad, f.valor, C.r2(f.participacion), C.r2(f.acumulado)]));
    descargar('analisis-abc-' + hoy + '.csv', C.csv(rows));
  };
  return (
    <>
      <div className="toolbar">
        <Tabs value={String(dias)} onChange={(v) => setDias(Number(v))} options={[['90', '90 días'], ['180', '180 días'], ['365', '12 meses']]} />
        <Chip tone="magenta">A: {cuenta('A')}</Chip><Chip tone="amber">B: {cuenta('B')}</Chip><Chip tone="cyan">C: {cuenta('C')}</Chip>
        <span style={{ flex: 1 }} /><Btn icon={Download} onClick={exportar}>Exportar</Btn>
      </div>
      <p className="muted small">Clase A: productos que suman el 80 % del valor consumido (control estricto y conteo frecuente). B: siguiente 15 %. C: el resto.</p>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Clase</th><th>Producto</th><th className="num">Cantidad</th><th className="num">Valor consumido</th><th className="num">Participación</th><th className="num">Acumulado</th></tr></thead>
          <tbody>{r.filas.map((f) => <tr key={f.producto.id}><td><Chip tone={tono[f.clase]}>{f.clase}</Chip></td><td>{f.producto.nombre}</td><td className="num">{num(f.cantidad)}</td><td className="num">{money(f.valor)}</td><td className="num">{pct(f.participacion)}</td><td className="num">{pct(f.acumulado)}</td></tr>)}</tbody>
          <tfoot><tr><td colSpan={3}>Total</td><td className="num">{money(r.total)}</td><td colSpan={2} /></tr></tfoot>
        </table>
      </div>
    </>
  );
}

function Rotacion() {
  const { db, hoy } = useStore();
  const [dias, setDias] = useState(365);
  const filas = C.rotacion(db, hoy, dias).sort((a, b) => b.rotacion - a.rotacion);
  const exportar = () => {
    const rows = [['Código', 'Producto', 'Inventario inicial', 'Inventario final', 'Inventario promedio', 'Costo consumido', 'Rotación', 'Días de inventario']];
    filas.forEach((f) => rows.push([f.producto.codigo, f.producto.nombre, f.inicial, f.final, f.promedio, f.costo, C.r2(f.rotacion), f.dias === null ? '' : f.dias]));
    descargar('rotacion-' + hoy + '.csv', C.csv(rows));
  };
  return (
    <>
      <div className="toolbar">
        <Tabs value={String(dias)} onChange={(v) => setDias(Number(v))} options={[['90', '90 días'], ['180', '180 días'], ['365', '12 meses']]} />
        <span style={{ flex: 1 }} /><Btn icon={Download} onClick={exportar}>Exportar</Btn>
      </div>
      <p className="muted small">Rotación = costo consumido ÷ inventario promedio. Días de inventario = días del periodo ÷ rotación.</p>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Producto</th><th className="num">Inv. promedio</th><th className="num">Costo consumido</th><th className="num">Rotación</th><th className="num">Días de inventario</th></tr></thead>
          <tbody>{filas.map((f) => <tr key={f.producto.id}><td>{f.producto.nombre}</td><td className="num">{money(f.promedio)}</td><td className="num">{money(f.costo)}</td><td className="num">{f.rotacion.toFixed(2)}</td><td className="num">{f.dias === null ? '—' : num(f.dias)}</td></tr>)}</tbody>
        </table>
      </div>
    </>
  );
}

function Consumos() {
  const { db, state, hoy } = useStore();
  const [desde, setDesde] = useState(C.addDays(hoy, -90));
  const [hasta, setHasta] = useState(hoy);
  const [tipo, setTipo] = useState('todos');
  const grupos = C.consumoPorDestino(db, state, desde, hasta).filter((g) => tipo === 'todos' || g.destinoTipo === tipo);
  const total = grupos.reduce((s, g) => s + g.valor, 0);
  const exportar = () => {
    const rows = [['Tipo', 'Destino', 'Salidas', 'Procedimientos', 'Valor']];
    grupos.forEach((g) => rows.push([g.destinoTipo, g.destino, g.salidas, Object.entries(g.procedimientos).map(([k, v]) => k + ' (' + v + ')').join(', '), g.valor]));
    descargar('consumos-' + desde + '-' + hasta + '.csv', C.csv(rows));
  };
  return (
    <>
      <div className="toolbar">
        <Field label="Desde"><input className="input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></Field>
        <Field label="Hasta"><input className="input" type="date" value={hasta} max={hoy} onChange={(e) => setHasta(e.target.value)} /></Field>
        <Tabs value={tipo} onChange={setTipo} options={[['todos', 'Todos'], ['Paciente', 'Pacientes'], ['Consultorio', 'Consultorios'], ['Servicio', 'Servicios']]} />
        <span style={{ flex: 1 }} /><Btn icon={Download} onClick={exportar}>Exportar</Btn>
      </div>
      {grupos.length ? (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Tipo</th><th>Destino</th><th>Procedimientos</th><th className="num">Salidas</th><th className="num">Valor consumido</th></tr></thead>
            <tbody>{grupos.map((g, i) => <tr key={i}><td>{g.destinoTipo}</td><td className="strong">{g.destino}</td><td className="small">{Object.entries(g.procedimientos).map(([k, v]) => k + ' (' + v + ')').join(', ') || '—'}</td><td className="num">{g.salidas}</td><td className="num">{money(g.valor)}</td></tr>)}</tbody>
            <tfoot><tr><td colSpan={4}>Total</td><td className="num">{money(total)}</td></tr></tfoot>
          </table>
        </div>
      ) : <Empty icon={BarChart3} title="Sin consumos" text="No hay salidas en el periodo." />}
    </>
  );
}

function SinMovimiento() {
  const { db, state, hoy } = useStore();
  const [dias, setDias] = useState(180);
  const filas = C.sinMovimiento(db, state, hoy, dias);
  return (
    <>
      <div className="toolbar"><Tabs value={String(dias)} onChange={(v) => setDias(Number(v))} options={[['90', '90 días'], ['180', '180 días'], ['365', '12 meses']]} /></div>
      <p className="muted small">Productos con existencia y sin consumo en el periodo: candidatos a obsolescencia y a revisión del valor neto realizable.</p>
      {filas.length ? (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Producto</th><th>Última salida</th><th className="num">Existencia</th><th className="num">Valor inmovilizado</th></tr></thead>
            <tbody>{filas.map((f) => <tr key={f.producto.id}><td>{f.producto.nombre}</td><td>{f.ultimaSalida ? fecha(f.ultimaSalida) : 'Nunca'}</td><td className="num">{num(f.existencia)}</td><td className="num">{money(f.valor)}</td></tr>)}</tbody>
          </table>
        </div>
      ) : <Empty icon={BarChart3} title="Sin productos inmovilizados" text="Todos los productos tuvieron consumo en el periodo." />}
    </>
  );
}

function Libro() {
  const { db, state, hoy } = useStore();
  const [desde, setDesde] = useState(C.addDays(hoy, -30));
  const [hasta, setHasta] = useState(hoy);
  const movs = C.ordenar(db.movimientos).filter((m) => m.fecha >= desde && m.fecha <= hasta);
  const exportar = () => {
    const rows = [['Fecha', 'Documento', 'Tipo', 'Bodega', 'Producto', 'Lote', 'Vence', 'Cantidad', 'Costo unitario', 'Valor', 'Estado', 'Usuario']];
    movs.forEach((m) => m.lineas.forEach((l, i) => {
      const c = state.movCost[m.id];
      const p = db.productos.find((x) => x.id === l.productoId);
      rows.push([m.fecha, m.num, C.TIPOS_MOV[m.tipo], l.bodega || C.bodegaDe(m, db.config) + (m.tipo === 'traslado' ? ' → ' + m.bodegaDestino : ''), p ? p.nombre : '', l.lote, l.vence, l.cantidad, c ? C.r2(c.lineas[i].unit) : '', c ? c.lineas[i].valor : '', m.anulado ? 'Anulado' : 'Vigente', m.usuario || '']);
    }));
    descargar('libro-movimientos-' + desde + '-' + hasta + '.csv', C.csv(rows));
  };
  return (
    <>
      <div className="toolbar">
        <Field label="Desde"><input className="input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></Field>
        <Field label="Hasta"><input className="input" type="date" value={hasta} max={hoy} onChange={(e) => setHasta(e.target.value)} /></Field>
        <span style={{ flex: 1 }} /><Btn icon={Download} onClick={exportar}>Exportar</Btn>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Fecha</th><th>Documento</th><th>Tipo</th><th>Bodega</th><th className="num">Líneas</th><th className="num">Valor</th><th>Usuario</th></tr></thead>
          <tbody>{movs.map((m) => <tr key={m.id} className={m.anulado ? 'anulado' : ''}><td>{fecha(m.fecha)}</td><td className="mono">{m.num}</td><td><Chip tone={TONO_MOV[m.tipo]}>{C.TIPOS_MOV[m.tipo]}</Chip></td><td>{C.bodegaDe(m, db.config)}{m.tipo === 'traslado' ? ' → ' + m.bodegaDestino : ''}</td><td className="num">{m.lineas.length}</td><td className="num">{money(state.movCost[m.id]?.total || 0)}</td><td className="small">{m.usuario}</td></tr>)}</tbody>
        </table>
      </div>
    </>
  );
}

const TABS = [['valorizado', 'Inventario valorado'], ['abc', 'Análisis ABC'], ['rotacion', 'Rotación'], ['consumos', 'Consumos por destino'], ['inmovilizado', 'Sin movimiento'], ['libro', 'Libro de movimientos']];
const VISTAS = { valorizado: Valorizado, abc: ABC, rotacion: Rotacion, consumos: Consumos, inmovilizado: SinMovimiento, libro: Libro };

export default function Reportes({ arg }) {
  const { go } = useStore();
  const tab = VISTAS[arg] ? arg : 'valorizado';
  const V = VISTAS[tab];
  return (
    <Panel title="Reportes y análisis" icon={BarChart3}>
      <div className="toolbar"><Tabs value={tab} onChange={(v) => go('reportes', v)} options={TABS} /></div>
      <V />
    </Panel>
  );
}
