import { useState } from 'react';
import { BookOpen, Calculator, ChevronDown, ChevronRight, Download, Landmark, Printer, Save, Scale } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { Btn, Chip, Empty, Errores, Field, Kpi, Nota, Panel, SearchBox } from '../components/ui.jsx';
import Combo from '../components/Combo.jsx';
import { imprimirTabla } from '../components/imprimir.js';
import { descargar, fecha, money, num } from '../format.js';

function Rango({ f, setF }) {
  const { hoy } = useStore();
  return (
    <>
      <Field label="Desde"><input className="input" type="date" value={f.desde} max={hoy} onChange={(e) => setF((x) => Object.assign({}, x, { desde: e.target.value }))} /></Field>
      <Field label="Hasta"><input className="input" type="date" value={f.hasta} max={hoy} onChange={(e) => setF((x) => Object.assign({}, x, { hasta: e.target.value }))} /></Field>
    </>
  );
}
const inicioMes = (hoy) => hoy.slice(0, 8) + '01';

/** Archivo plano para importar en el software contable (una fila por línea de comprobante). */
function exportarContable(db, cps, nombre) {
  const rows = [['Fecha', 'Comprobante', 'Documento origen', 'Tipo', 'Cuenta', 'Nombre de la cuenta', 'NIT tercero', 'Centro de costo', 'Débito', 'Crédito', 'Detalle']];
  cps.forEach((cp) => cp.lineas.forEach((l) => rows.push([cp.fecha, cp.num, cp.documento, cp.tipo, l.cuenta, l.nombre, l.tercero, l.centro, l.debito, l.credito, l.detalle])));
  descargar(nombre, C.csv(rows));
}

export function Comprobantes() {
  const { db, state, hoy } = useStore();
  const [f, setF] = useState({ desde: inicioMes(hoy), hasta: hoy });
  const [q, setQ] = useState('');
  const [abiertos, setAbiertos] = useState({});
  const cps = C.comprobantesContables(db, state, f).filter((cp) => !q || (cp.num + ' ' + cp.tipo + ' ' + cp.descripcion + ' ' + cp.lineas.map((l) => l.cuenta + ' ' + l.tercero).join(' ')).toLowerCase().includes(q.toLowerCase()));
  const deb = cps.reduce((a, c) => a + c.debito, 0), cre = cps.reduce((a, c) => a + c.credito, 0);
  const descuadrados = cps.filter((c) => !c.cuadra).length;
  return (
    <div className="stack">
      <div className="grid g-kpi">
        <Kpi label="Comprobantes" value={num(cps.length)} sub="Generados automáticamente" tone="cyan" icon={BookOpen} />
        <Kpi label="Débitos" value={money(deb)} tone="violet" />
        <Kpi label="Créditos" value={money(cre)} tone="violet" />
        <Kpi label="Descuadrados" value={descuadrados} sub={descuadrados ? 'Revise las cuentas' : 'Todo cuadra'} tone={descuadrados ? 'red' : 'green'} />
      </div>
      <Panel title="Comprobantes contables de inventario" icon={BookOpen}
        sub="Cada entrada, salida, devolución, ajuste, baja, saldo inicial y cierre genera su comprobante con las cuentas configuradas. Los traslados no generan asiento (misma cuenta); se reflejan en el centro de costo."
        actions={<Btn variant="primary" icon={Download} onClick={() => exportarContable(db, cps, 'comprobantes-inventario-' + f.desde + '-' + f.hasta + '.csv')} disabled={!cps.length}>Exportar al software contable</Btn>}>
        <div className="toolbar"><Rango f={f} setF={setF} /><SearchBox value={q} onChange={setQ} placeholder="Buscar comprobante, cuenta o NIT" /></div>
        {cps.length ? (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th /><th>Fecha</th><th>Comprobante</th><th>Tipo</th><th>Descripción</th><th className="num">Débito</th><th className="num">Crédito</th><th /></tr></thead>
              <tbody>
                {cps.map((cp) => [
                  <tr key={cp.id} style={{ cursor: 'pointer' }} onClick={() => setAbiertos((a) => Object.assign({}, a, { [cp.id]: !a[cp.id] }))}>
                    <td>{abiertos[cp.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                    <td>{fecha(cp.fecha)}</td><td className="mono">{cp.num}</td><td>{cp.tipo}</td><td className="small">{cp.descripcion}</td>
                    <td className="num">{money(cp.debito)}</td><td className="num">{money(cp.credito)}</td>
                    <td>{cp.cuadra ? <Chip tone="green" dot>Cuadra</Chip> : <Chip tone="red">Descuadre</Chip>}</td>
                  </tr>,
                  abiertos[cp.id] && (
                    <tr key={cp.id + 'd'}><td /><td colSpan={7} style={{ background: '#f8fbff' }}>
                      <table className="tbl"><thead><tr><th>Cuenta</th><th>Nombre</th><th>Tercero</th><th>C. costo</th><th>Detalle</th><th className="num">Débito</th><th className="num">Crédito</th></tr></thead>
                        <tbody>{cp.lineas.map((l, i) => <tr key={i}><td className="mono">{l.cuenta}</td><td>{l.nombre}</td><td className="mono">{l.tercero}</td><td>{l.centro}</td><td className="small">{l.detalle}</td><td className="num">{l.debito ? money(l.debito) : ''}</td><td className="num">{l.credito ? money(l.credito) : ''}</td></tr>)}</tbody>
                      </table>
                    </td></tr>
                  )
                ])}
              </tbody>
              <tfoot><tr><td colSpan={5}>Totales</td><td className="num">{money(deb)}</td><td className="num">{money(cre)}</td><td /></tr></tfoot>
            </table>
          </div>
        ) : <Empty icon={BookOpen} title="Sin comprobantes" text="No hay movimientos en el rango de fechas." />}
      </Panel>
    </div>
  );
}

export function Auxiliar() {
  const { db, state, hoy } = useStore();
  const [f, setF] = useState({ desde: C.addDays(hoy, -180), hasta: hoy });
  const todos = C.comprobantesContables(db, state);
  const saldos = C.saldosContables(todos);
  const [cuenta, setCuenta] = useState(() => (saldos[0] || {}).cuenta || '');
  const previos = todos.filter((cp) => cp.fecha < f.desde);
  const periodo = todos.filter((cp) => cp.fecha >= f.desde && cp.fecha <= f.hasta);
  const saldoIni = previos.flatMap((cp) => cp.lineas).filter((l) => l.cuenta === cuenta).reduce((a, l) => a + l.debito - l.credito, 0);
  let saldo = saldoIni;
  const movs = periodo.flatMap((cp) => cp.lineas.filter((l) => l.cuenta === cuenta).map((l) => { saldo += l.debito - l.credito; return Object.assign({ fecha: cp.fecha, num: cp.num, saldo }, l); }));
  const nombre = (saldos.find((s) => s.cuenta === cuenta) || {}).nombre || '';
  const cols = [{ t: 'Fecha' }, { t: 'Comprobante' }, { t: 'Detalle' }, { t: 'Tercero' }, { t: 'C. costo' }, { t: 'Débito', num: true }, { t: 'Crédito', num: true }, { t: 'Saldo', num: true }];
  const filas = [[fecha(f.desde), '', 'Saldo inicial', '', '', '', '', money(saldoIni)], ...movs.map((m) => [fecha(m.fecha), m.num, m.detalle, m.tercero, m.centro, m.debito ? money(m.debito) : '', m.credito ? money(m.credito) : '', money(m.saldo)])];
  return (
    <Panel title="Libro auxiliar por cuenta" icon={Scale} sub="Movimientos de una cuenta contable con saldo inicial y saldo acumulado."
      actions={<Btn icon={Printer} onClick={() => imprimirTabla(db, 'Auxiliar ' + cuenta + ' ' + nombre, 'Del ' + fecha(f.desde) + ' al ' + fecha(f.hasta), cols, filas, null)}>Imprimir / PDF</Btn>}>
      <div className="toolbar">
        <Field label="Cuenta"><div style={{ width: 340 }}><Combo value={cuenta} onChange={setCuenta} options={saldos.map((s) => ({ value: s.cuenta, label: s.cuenta + ' · ' + s.nombre, sub: 'Saldo ' + money(s.saldo) }))} placeholder="Escriba la cuenta…" /></div></Field>
        <Rango f={f} setF={setF} />
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr>{cols.map((c) => <th key={c.t} className={c.num ? 'num' : ''}>{c.t}</th>)}</tr></thead>
          <tbody>{filas.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className={cols[j].num ? 'num' : j === 1 || j === 3 ? 'mono' : ''}>{v}</td>)}</tr>)}</tbody>
          <tfoot><tr><td colSpan={7}>Saldo final</td><td className="num">{money(saldo)}</td></tr></tfoot>
        </table>
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
  const deterioro = saldos.filter((s) => s.cuenta === cfg.deterioroInv.cuenta).reduce((a, s) => a + s.saldo, 0);
  const kardex = C.valorInventario(state);
  const dif = C.r2(contable - kardex);
  return (
    <div className="stack">
      <div className="grid g-kpi">
        <Kpi label="Saldo contable inventario" value={money(contable)} sub={[...ctasInv].join(', ')} tone="cyan" icon={Landmark} />
        <Kpi label="Valor según kardex" value={money(kardex)} sub="Costo de las existencias" tone="violet" icon={Calculator} />
        <Kpi label="Diferencia" value={money(dif)} sub={Math.abs(dif) < 1 ? 'Conciliado' : 'Revise los movimientos'} tone={Math.abs(dif) < 1 ? 'green' : 'red'} />
        <Kpi label="Deterioro acumulado" value={money(deterioro)} sub={'Cuenta ' + cfg.deterioroInv.cuenta + ' (NIC 2)'} tone="amber" />
      </div>
      <Panel title="Balance de comprobación de inventario" icon={Scale} sub="Saldos de todas las cuentas afectadas por el inventario, desde el primer movimiento.">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Cuenta</th><th>Nombre</th><th className="num">Débitos</th><th className="num">Créditos</th><th className="num">Saldo</th></tr></thead>
            <tbody>{saldos.map((s) => <tr key={s.cuenta}><td className="mono">{s.cuenta}</td><td>{s.nombre}</td><td className="num">{money(s.debito)}</td><td className="num">{money(s.credito)}</td><td className="num strong">{money(s.saldo)}</td></tr>)}</tbody>
            <tfoot><tr><td colSpan={2}>Totales</td><td className="num">{money(saldos.reduce((a, s) => a + s.debito, 0))}</td><td className="num">{money(saldos.reduce((a, s) => a + s.credito, 0))}</td><td className="num">{money(saldos.reduce((a, s) => a + s.saldo, 0))}</td></tr></tfoot>
          </table>
        </div>
      </Panel>
    </div>
  );
}

export function CuentasContables() {
  const { db, commit, toast, puede } = useStore();
  const [c, setC] = useState(() => Object.assign(C.cuentasBase(), db.config.contabilidad || {}));
  const [porGrupo, setPorGrupo] = useState(() => Object.fromEntries(db.grupos.map((g) => [g.id, Object.assign({ inventario: '', costoConsumo: '' }, g.cuentas || {})])));
  const [err, setErr] = useState([]);
  const setCta = (k, campo, v) => setC((x) => Object.assign({}, x, { [k]: Object.assign({}, x[k], { [campo]: v }) }));
  const guardar = () => {
    const e = [];
    Object.keys(C.CONCEPTOS_CONTABLES).forEach((k) => { if (!/^\d{4,10}$/.test(String(c[k].cuenta || ''))) e.push(C.CONCEPTOS_CONTABLES[k] + ': la cuenta debe tener de 4 a 10 dígitos.'); });
    Object.entries(porGrupo).forEach(([id, v]) => Object.entries(v).forEach(([k, cta]) => { if (cta && !/^\d{4,10}$/.test(cta)) e.push('Clasificación ' + C.rutaGrupo(db, id) + ': cuenta "' + cta + '" no válida.'); }));
    if (e.length) return setErr(e);
    commit((d) => {
      d.config.contabilidad = c;
      d.grupos.forEach((g) => { const v = porGrupo[g.id]; if (v) { const limpio = Object.fromEntries(Object.entries(v).filter(([, x]) => x)); if (Object.keys(limpio).length) g.cuentas = limpio; else delete g.cuentas; } });
    }, 'Parametrización contable', '');
    setErr([]);
    toast('Cuentas contables guardadas');
  };
  return (
    <div className="stack">
      <Panel title="Parametrización contable" icon={Landmark}
        sub="Cuentas del PUC para cada concepto de inventario. Puede usar sus propias subcuentas (6 a 10 dígitos). Valide la parametrización con su contador."
        actions={puede('config') && <Btn variant="primary" icon={Save} onClick={guardar}>Guardar</Btn>}>
        <Errores lista={err} />
        <div className="tbl-wrap">
          <table className="tbl lines">
            <thead><tr><th>Concepto</th><th>Cuenta</th><th>Nombre de la cuenta</th></tr></thead>
            <tbody>
              {Object.entries(C.CONCEPTOS_CONTABLES).map(([k, t]) => (
                <tr key={k}><td className="strong">{t}</td>
                  <td><input className="input mono" value={c[k].cuenta} onChange={(e) => setCta(k, 'cuenta', e.target.value.trim())} style={{ width: 140 }} disabled={!puede('config')} /></td>
                  <td><input className="input" value={c[k].nombre} onChange={(e) => setCta(k, 'nombre', e.target.value)} disabled={!puede('config')} /></td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <label className="check" style={{ marginTop: 10 }}><input type="checkbox" checked={!!c.centroCostoPorBodega} onChange={(e) => setC((x) => Object.assign({}, x, { centroCostoPorBodega: e.target.checked }))} disabled={!puede('config')} /> Usar el código de la bodega como centro de costo</label>
      </Panel>
      <Panel title="Cuentas por clasificación (opcional)" icon={Landmark} sub="Como la clase de valoración de SAP: una línea o grupo puede llevar su propia cuenta de inventario y de costo. Los niveles inferiores la heredan.">
        <div className="tbl-wrap">
          <table className="tbl lines">
            <thead><tr><th>Clasificación</th><th>Cuenta de inventario</th><th>Cuenta de costo por consumo</th></tr></thead>
            <tbody>
              {C.arbolGrupos(db).map((g) => (
                <tr key={g.id}><td style={{ paddingLeft: 12 + (g.nivel - 1) * 22 }}>{g.codigo} · {g.nombre}</td>
                  {['inventario', 'costoConsumo'].map((k) => (
                    <td key={k}><input className="input mono" value={(porGrupo[g.id] || {})[k] || ''} placeholder={'Hereda ' + C.cuentaDe(Object.assign({}, db, { grupos: db.grupos.map((x) => (x.id === g.id ? Object.assign({}, x, { cuentas: undefined }) : x)) }), k, { grupoId: g.id }).cuenta}
                      onChange={(e) => setPorGrupo((x) => Object.assign({}, x, { [g.id]: Object.assign({}, x[g.id], { [k]: e.target.value.trim() }) }))} style={{ width: 170 }} disabled={!puede('config')} /></td>
                  ))}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Nota>Cuentas sugeridas del PUC (Decreto 2650 de 1993) para un prestador de servicios de salud: inventario 1455, proveedores 2205, costo de prestación de servicios de salud 6155, deterioro 5199 / 1499. Si su empresa usa un catálogo propio bajo NIIF, reemplácelas aquí; los comprobantes se recalculan con la nueva parametrización.</Nota>
    </div>
  );
}

export default Comprobantes;
