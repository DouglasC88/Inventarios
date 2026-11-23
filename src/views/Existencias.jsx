import { useState } from 'react';
import { Boxes, Download, LayoutGrid, List, PackageSearch, ScanSearch, ScrollText, Warehouse } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { Btn, Chip, Empty, Panel, SearchBox, Tabs } from '../components/ui.jsx';
import { descargar, fecha, money, num, SEMAFORO } from '../format.js';
import { SelectGrupo } from '../components/Movimientos.jsx';

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Productos con su existencia en el alcance elegido (todas las bodegas o una). */
export function calcularExistencias(db, state, hoy, bodega) {
  return db.productos.filter((p) => p.activo !== false).map((p) => {
    const s = state.prods[p.id];
    const lots = s ? Object.values(s.lots).filter((l) => l.qty > 0 && (bodega === 'todas' || l.bodega === bodega)) : [];
    const qty = C.r2(lots.reduce((a, l) => a + l.qty, 0));
    const unit = s && s.qty ? s.value / s.qty : (s ? s.ultimoCosto : 0);
    const porBodega = {};
    lots.forEach((l) => { porBodega[l.bodega] = C.r2((porBodega[l.bodega] || 0) + l.qty); });
    const lotes = lots.map((l) => Object.assign({}, l, { sem: C.semaforo(l.vence, hoy, db.config) }))
      .sort((a, b) => ((a.vence || '9999') < (b.vence || '9999') ? -1 : 1));
    return { p, qty, valor: C.r2(qty * unit), unit, porBodega, lotes, grupo: C.rutaGrupo(db, p.grupoId) };
  });
}

function TarjetaBodega({ titulo, sub, refs, valor, lotes, activa, onClick, icon: Icon }) {
  return (
    <button type="button" className={'panel bodega-card' + (activa ? ' on' : '')} onClick={onClick}>
      <div className="bc-top"><Icon size={16} /> <span>{titulo}</span></div>
      <div className="bc-val">{money(valor)}</div>
      <div className="bc-sub">{num(refs)} insumos · {num(lotes)} lotes{sub ? ' · ' + sub : ''}</div>
    </button>
  );
}

export default function Existencias({ arg }) {
  const { db, state, hoy, go } = useStore();
  const [bodega, setBodega] = useState(arg && arg.startsWith('bodega:') ? arg.slice(7) : 'todas');
  const [q, setQ] = useState(arg && arg.startsWith('q:') ? arg.slice(2) : '');
  const [grupo, setGrupo] = useState('todos');
  const [vista, setVista] = useState('tarjetas');
  const [ver, setVer] = useState('existencia');

  const resumen = (b) => {
    const ex = calcularExistencias(db, state, hoy, b).filter((x) => x.qty > 0);
    return { refs: ex.length, valor: ex.reduce((a, x) => a + x.valor, 0), lotes: ex.reduce((a, x) => a + x.lotes.length, 0) };
  };
  const general = resumen('todas');
  const lista = calcularExistencias(db, state, hoy, bodega).filter((x) => {
    if (ver === 'existencia' && x.qty <= 0) return false;
    if (ver === 'bajo' && !(Number(x.p.stockMin) > 0 && x.qty < Number(x.p.stockMin))) return false;
    if (grupo !== 'todos' && !C.gruposDescendientes(db, grupo).has(x.p.grupoId)) return false;
    if (!q) return true;
    const t = norm([x.p.codigo, x.p.nombre, x.p.gtin, x.grupo, ...x.lotes.map((l) => l.lote)].join(' '));
    return norm(q).split(/\s+/).every((w) => t.includes(w));
  }).sort((a, b) => a.p.nombre.localeCompare(b.p.nombre));
  const total = lista.reduce((a, x) => a + x.valor, 0);

  const exportar = () => {
    const rows = [['Código', 'Producto', 'Grupo', 'Unidad', 'Bodega', 'Existencia', 'Mínimo', 'Costo unitario', 'Valor', 'Lotes']];
    lista.forEach((x) => rows.push([x.p.codigo, x.p.nombre, x.grupo, x.p.unidad, bodega === 'todas' ? 'Todas' : bodega, x.qty, x.p.stockMin, C.r2(x.unit), x.valor, x.lotes.map((l) => l.lote + ' (' + l.vence + '): ' + l.qty).join(' | ')]));
    descargar('existencias-' + (bodega === 'todas' ? 'general' : bodega) + '-' + hoy + '.csv', C.csv(rows));
  };

  return (
    <div className="stack">
      <div className="bodega-cards">
        <TarjetaBodega titulo="General" sub="todas las bodegas" icon={Boxes} refs={general.refs} valor={general.valor} lotes={general.lotes} activa={bodega === 'todas'} onClick={() => setBodega('todas')} />
        {db.bodegas.filter((b) => b.activa !== false).map((b) => {
          const r = resumen(b.nombre);
          return <TarjetaBodega key={b.id} titulo={b.nombre} sub={C.TIPOS_BODEGA[b.tipo]} icon={Warehouse} refs={r.refs} valor={r.valor} lotes={r.lotes} activa={bodega === b.nombre} onClick={() => setBodega(b.nombre)} />;
        })}
      </div>

      <Panel title={bodega === 'todas' ? 'Existencias · General (todas las bodegas)' : 'Existencias · ' + bodega} icon={PackageSearch}
        sub={num(lista.length) + ' insumos · valor ' + money(total)}
        actions={<><Btn icon={Download} onClick={exportar}>Exportar</Btn></>}>
        <div className="toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Buscar por nombre, código, código de barras o lote" />
          <div style={{ width: 280, maxWidth: '100%' }}><SelectGrupo value={grupo} onChange={setGrupo} incluirTodos /></div>
          <Tabs value={ver} onChange={setVer} options={[['existencia', 'Con existencia'], ['bajo', 'Bajo mínimo'], ['todos', 'Todos']]} />
          <span style={{ flex: 1 }} />
          <Tabs value={vista} onChange={setVista} options={[['tarjetas', <><LayoutGrid size={13} /> Tarjetas</>], ['tabla', <><List size={13} /> Tabla</>]]} />
        </div>

        {!lista.length ? <Empty icon={PackageSearch} title="Sin insumos" text={q ? 'Ningún insumo coincide con la búsqueda.' : 'No hay insumos con existencia en esta bodega.'} /> : vista === 'tarjetas' ? (
          <div className="prod-cards">
            {lista.map((x) => {
              const bajo = Number(x.p.stockMin) > 0 && x.qty < Number(x.p.stockMin);
              const prox = x.lotes[0];
              const usable = x.lotes.filter((l) => l.sem !== 'vencido' && (!l.estado || l.estado === 'liberado')).reduce((a, l) => a + l.qty, 0);
              const retenido = C.r2(x.qty - usable);
              return (
                <div key={x.p.id} className={'panel prod-card' + (bajo ? ' bajo' : '')}>
                  <div className="pc-head">
                    <div>
                      <div className="pc-name">{x.p.nombre}</div>
                      <div className="pc-code">{x.p.codigo}{x.grupo ? ' · ' + x.grupo : ''}</div>
                    </div>
                    {bajo ? <Chip tone="red">Bajo mínimo</Chip> : x.qty <= 0 ? <Chip tone="muted">Agotado</Chip> : usable <= 0 ? <Chip tone="amber">No disponible</Chip> : <Chip tone="green" dot>Disponible</Chip>}
                  </div>
                  <div className="pc-stock"><b>{num(x.qty)}</b> <span>{x.p.unidad}</span><em>mín. {num(x.p.stockMin)}</em></div>
                  <div className="pc-val">{money(x.valor)} <span className="muted">· {money(x.unit)} c/u</span></div>
                  {retenido > 0 && <div className="small" style={{ color: '#b45309' }}>{num(retenido)} {x.p.unidad} retenidas (vencidas, en cuarentena o bloqueadas)</div>}
                  {bodega === 'todas' && Object.keys(x.porBodega).length > 0 && (
                    <div className="stockbod">{Object.entries(x.porBodega).map(([b, v]) => <span key={b}>{b}: {num(v)}</span>)}</div>
                  )}
                  {x.lotes.length > 0 && (
                    <div className="pc-lots">
                      {x.lotes.slice(0, 3).map((l, i) => (
                        <div key={i} className="pc-lot">
                          <span className={'dot-sem ' + SEMAFORO[l.sem].tono} title={SEMAFORO[l.sem].texto} />
                          <span className="mono">{l.lote}</span>
                          <span className="muted">vence {fecha(l.vence)}{bodega === 'todas' ? ' · ' + l.bodega : ''}{l.estado && l.estado !== 'liberado' ? ' · ' + C.ESTADOS_LOTE[l.estado] : ''}</span>
                          <b>{num(l.qty)}</b>
                        </div>
                      ))}
                      {x.lotes.length > 3 && <div className="small muted">y {x.lotes.length - 3} lote(s) más</div>}
                    </div>
                  )}
                  <div className="pc-acts">
                    <Btn size="sm" icon={ScrollText} onClick={() => go('kardex', x.p.id)}>Kardex</Btn>
                    {prox && <Btn size="sm" variant="ghost" icon={ScanSearch} onClick={() => go('trazabilidad', prox.lote)}>Lote {prox.lote}</Btn>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Código</th><th>Insumo</th><th>Grupo</th><th className="num">Existencia</th><th className="num">Mínimo</th><th className="num">Costo unit.</th><th className="num">Valor</th><th>Lotes (vencimiento)</th>{bodega === 'todas' && <th>Por bodega</th>}<th /></tr></thead>
              <tbody>
                {lista.map((x) => (
                  <tr key={x.p.id}>
                    <td className="mono">{x.p.codigo}</td>
                    <td className="strong">{x.p.nombre}</td>
                    <td>{x.grupo || '—'}</td>
                    <td className={'num' + (Number(x.p.stockMin) > 0 && x.qty < Number(x.p.stockMin) ? ' red-t' : '')}>{num(x.qty)} <span className="small muted">{x.p.unidad}</span></td>
                    <td className="num">{num(x.p.stockMin)}</td>
                    <td className="num">{money(x.unit)}</td>
                    <td className="num">{money(x.valor)}</td>
                    <td className="small">{x.lotes.map((l) => l.lote + ' (' + fecha(l.vence) + '): ' + num(l.qty)).join(' · ') || '—'}</td>
                    {bodega === 'todas' && <td className="small">{Object.entries(x.porBodega).map(([b, v]) => b + ': ' + num(v)).join(' · ') || '—'}</td>}
                    <td className="acts"><Btn variant="ghost" size="sm" icon={ScrollText} onClick={() => go('kardex', x.p.id)} title="Kardex" /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={6}>Total</td><td className="num">{money(total)}</td><td colSpan={bodega === 'todas' ? 3 : 2} /></tr></tfoot>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
