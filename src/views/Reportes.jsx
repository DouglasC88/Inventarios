import { useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, BarChart3, ChevronRight, Download, FileText, Printer } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { Btn, Chip, Empty, Field, Nota, Panel, SearchBox } from '../components/ui.jsx';
import { SelectBodega, SelectGrupo, SelectProducto, SelectTercero } from '../components/Movimientos.jsx';
import { imprimirTabla } from '../components/imprimir.js';
import { CATEGORIAS_REPORTE, REPORTES, filtrosIniciales } from '../core/reportes.js';
import { descargar, fecha, money, num } from '../format.js';

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function formatear(v, tipo) {
  if (v === '' || v === null || v === undefined) return '';
  if (tipo === 'money') return money(v);
  if (tipo === 'num') return num(v);
  if (tipo === 'pct') return Number(v).toFixed(1) + ' %';
  if (tipo === 'date') return fecha(v);
  return String(v);
}

function Catalogo() {
  const { go } = useStore();
  const [q, setQ] = useState('');
  return (
    <div className="stack">
      <Panel title={'Centro de reportes · ' + REPORTES.length + ' reportes'} icon={BarChart3}
        sub="Todos los reportes se pueden filtrar por fechas, bodega, clasificación, producto o tercero, ordenar por cualquier columna, exportar a Excel (CSV) e imprimir o guardar en PDF.">
        <div className="toolbar"><SearchBox value={q} onChange={setQ} placeholder="Buscar reporte: existencias, kardex, compras, vencimientos, ABC…" /></div>
      </Panel>
      <div className="law">
        {CATEGORIAS_REPORTE.map(([cat, titulo]) => {
          const lista = REPORTES.filter((r) => r.cat === cat && norm(r.t + ' ' + r.d).includes(norm(q)));
          if (!lista.length) return null;
          return (
            <Panel key={cat} title={titulo} icon={FileText}>
              <div className="rep-list">
                {lista.map((r) => (
                  <button type="button" key={r.id} className="rep-item" onClick={() => go('reportes', r.id)}>
                    <div><b>{r.t}</b><span>{r.d}</span></div>
                    <ChevronRight size={16} />
                  </button>
                ))}
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

function Filtro({ k, f, set, hoy }) {
  const v = (x) => set(k, x);
  switch (k) {
    case 'desde': return <Field label="Desde"><input className="input" type="date" value={f.desde} max={hoy} onChange={(e) => v(e.target.value)} /></Field>;
    case 'hasta': return <Field label="Hasta"><input className="input" type="date" value={f.hasta} max={hoy} onChange={(e) => v(e.target.value)} /></Field>;
    case 'corte': return <Field label="Fecha de corte"><input className="input" type="date" value={f.corte} max={hoy} onChange={(e) => v(e.target.value)} /></Field>;
    case 'bodega': return <Field label="Bodega"><SelectBodega value={f.bodega} incluirTodas onChange={v} /></Field>;
    case 'grupo': return <Field label="Clasificación"><SelectGrupo value={f.grupo} incluirTodos onChange={v} /></Field>;
    case 'producto': return <Field label="Producto"><div className="with-clear"><SelectProducto value={f.producto} onChange={v} placeholder="Todos los productos (escriba para filtrar)" />{f.producto && <button type="button" onClick={() => v('')} title="Quitar filtro">×</button>}</div></Field>;
    case 'tercero': return <Field label="Tercero"><div className="with-clear"><SelectTercero value={f.tercero} onChange={v} />{f.tercero && <button type="button" onClick={() => v('')} title="Quitar filtro">×</button>}</div></Field>;
    case 'tipoMov': return <Field label="Tipo de movimiento"><select className="select input" value={f.tipoMov} onChange={(e) => v(e.target.value)}><option value="">Todos</option>{Object.entries(C.TIPOS_MOV).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></Field>;
    case 'destinoTipo': return <Field label="Tipo de destino"><select className="select input" value={f.destinoTipo} onChange={(e) => v(e.target.value)}><option value="">Todos</option>{['Paciente', 'Consultorio', 'Servicio', 'Venta'].map((d) => <option key={d}>{d}</option>)}</select></Field>;
    case 'dias': return <Field label="Vencen en los próximos (días)"><input className="input" type="number" min="1" value={f.dias} onChange={(e) => v(e.target.value)} /></Field>;
    case 'diasAnalisis': return <Field label="Periodo de análisis"><select className="select input" value={f.diasAnalisis} onChange={(e) => v(e.target.value)}><option value="90">Últimos 90 días</option><option value="180">Últimos 180 días</option><option value="365">Últimos 12 meses</option></select></Field>;
    case 'nivel': return <Field label="Nivel"><select className="select input" value={f.nivel} onChange={(e) => v(e.target.value)}><option value="1">Línea</option><option value="2">Grupo</option><option value="3">Subgrupo</option></select></Field>;
    case 'anio': return <Field label="Año"><input className="input" type="number" value={f.anio} onChange={(e) => v(e.target.value)} /></Field>;
    case 'texto': return <Field label="Contiene"><input className="input" value={f.texto} onChange={(e) => v(e.target.value)} placeholder="Usuario, acción o detalle" /></Field>;
    default: return null;
  }
}

function Reporte({ rep }) {
  const { db, state, hoy, go } = useStore();
  const [f, setF] = useState(() => filtrosIniciales(hoy));
  const [orden, setOrden] = useState(null);
  const set = (k, v) => setF((x) => Object.assign({}, x, { [k]: v }));
  const faltan = (rep.requiere || []).filter((k) => !f[k]);
  let filas = faltan.length ? [] : rep.filas({ db, state, hoy }, f);
  if (orden) {
    const [k, dir] = orden;
    filas = filas.slice().sort((a, b) => {
      const x = a[k], y = b[k];
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'es', { numeric: true });
      return dir === 'asc' ? r : -r;
    });
  }
  const totales = (rep.total || []).reduce((o, k) => Object.assign(o, { [k]: filas.reduce((s, r) => s + (Number(r[k]) || 0), 0) }), {});
  const describir = () => rep.filtros.filter((k) => f[k] !== '' && f[k] !== 'todas' && f[k] !== 'todos').map((k) => {
    const etiquetas = { desde: 'Desde', hasta: 'Hasta', corte: 'Corte', bodega: 'Bodega', grupo: 'Clasificación', producto: 'Producto', tercero: 'Tercero', tipoMov: 'Tipo', destinoTipo: 'Destino', dias: 'Días', diasAnalisis: 'Periodo (días)', nivel: 'Nivel', anio: 'Año', texto: 'Texto' };
    let val = f[k];
    if (k === 'grupo') val = C.rutaGrupo(db, f[k]);
    if (k === 'producto') val = (db.productos.find((p) => p.id === f[k]) || {}).nombre;
    if (k === 'tercero') val = (db.proveedores.find((t) => t.id === f[k]) || {}).nombre;
    if (k === 'tipoMov') val = C.TIPOS_MOV[f[k]];
    if (['desde', 'hasta', 'corte'].includes(k)) val = fecha(f[k]);
    return etiquetas[k] + ': ' + val;
  }).join(' · ');
  const exportar = () => {
    const rows = [rep.cols.map((c) => c[1])];
    filas.forEach((r) => rows.push(rep.cols.map(([k, , t]) => (t === 'pct' && r[k] !== '' ? C.r2(r[k]) : r[k]))));
    if (rep.total) rows.push(rep.cols.map(([k], i) => (i === 0 ? 'TOTAL' : k in totales ? C.r2(totales[k]) : '')));
    descargar(rep.id + '-' + hoy + '.csv', C.csv(rows));
  };
  const imprimir = () => imprimirTabla(db, rep.t, describir(), rep.cols.map(([k, t, tipo]) => ({ t, num: ['num', 'money', 'pct'].includes(tipo) })),
    filas.map((r) => rep.cols.map(([k, , tipo]) => formatear(r[k], tipo))),
    rep.total ? rep.cols.map(([k, , tipo], i) => (i === 0 ? 'TOTAL' : k in totales ? formatear(totales[k], tipo) : '')) : null);

  return (
    <div className="stack">
      <Panel title={rep.t} icon={BarChart3} sub={rep.d}
        actions={<><Btn icon={ArrowLeft} onClick={() => go('reportes')}>Todos los reportes</Btn><Btn icon={Download} onClick={exportar} disabled={!filas.length}>Excel (CSV)</Btn><Btn variant="primary" icon={Printer} onClick={imprimir} disabled={!filas.length}>Imprimir / PDF</Btn></>}>
        {rep.filtros.length > 0 && <div className="form-grid rep-filtros">{rep.filtros.map((k) => <Filtro key={k} k={k} f={f} set={set} hoy={hoy} />)}</div>}
      </Panel>
      <Panel>
        {faltan.length ? <Empty icon={BarChart3} title="Elija un producto" text="Este reporte se genera para un producto: escríbalo en el filtro." /> : filas.length ? (
          <>
            <div className="small muted" style={{ marginBottom: 8 }}>{num(filas.length)} filas · clic en un encabezado para ordenar</div>
            <div className="tbl-wrap" style={{ maxHeight: '70vh' }}>
              <table className="tbl">
                <thead><tr>{rep.cols.map(([k, t, tipo]) => (
                  <th key={k} className={['num', 'money', 'pct'].includes(tipo) ? 'num' : ''} style={{ cursor: 'pointer' }}
                    onClick={() => setOrden((o) => (o && o[0] === k ? [k, o[1] === 'asc' ? 'desc' : 'asc'] : [k, ['num', 'money', 'pct'].includes(tipo) ? 'desc' : 'asc']))}>
                    {t} {orden && orden[0] === k ? (orden[1] === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />) : null}
                  </th>
                ))}</tr></thead>
                <tbody>
                  {filas.map((r, i) => (
                    <tr key={i}>{rep.cols.map(([k, , tipo]) => (
                      <td key={k} className={['num', 'money', 'pct'].includes(tipo) ? 'num' : ''}>
                        {tipo === 'chip' ? (r[k] ? <Chip tone={r[k + 'Tono'] || 'muted'}>{r[k]}</Chip> : '') : formatear(r[k], tipo)}
                      </td>
                    ))}</tr>
                  ))}
                </tbody>
                {rep.total && (
                  <tfoot><tr>{rep.cols.map(([k, , tipo], i) => <td key={k} className={['num', 'money', 'pct'].includes(tipo) ? 'num' : ''}>{i === 0 ? 'Total' : k in totales ? formatear(totales[k], tipo) : ''}</td>)}</tr></tfoot>
                )}
              </table>
            </div>
          </>
        ) : <Empty icon={BarChart3} title="Sin datos" text="No hay información con estos filtros. Amplíe el rango de fechas o quite filtros." />}
      </Panel>
      {rep.id === 'faltantes' && <Nota>El límite del 3 % aplica a mercancía de fácil destrucción o pérdida (ET art. 64). Confirme con su contador el texto vigente tras la Ley 1819 de 2016.</Nota>}
    </div>
  );
}

export default function Reportes({ arg }) {
  const rep = REPORTES.find((r) => r.id === arg);
  return rep ? <Reporte key={rep.id} rep={rep} /> : <Catalogo />;
}
