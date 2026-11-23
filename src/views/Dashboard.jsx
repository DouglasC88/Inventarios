import { Activity, ArrowRightLeft, BarChart3, ClipboardCheck, Boxes, CalendarClock, Compass, Layers, PackageMinus, PackagePlus, ShieldCheck, ShoppingCart, Tags, TrendingDown, TriangleAlert, Wallet, Warehouse } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { Btn, Chip, Gauge, Kpi, Panel, Empty } from '../components/ui.jsx';
import { money, num, pct, fecha, TONO_MOV } from '../format.js';

const DESTINO_ALERTA = { stock: 'reabastecimiento', invima: 'productos', vencimiento: 'vencimientos', faltantes: 'ajustes', conteo: 'conteos', frio: 'frio', reorden: 'reabastecimiento', orden: 'ordenes', requisicion: 'requisiciones' };

export default function Dashboard() {
  const { db, state, hoy, go, puede } = useStore();
  const acciones = [
    ['Nueva entrada', PackagePlus, 'entradas', 'entradas'],
    ['Orden de compra', ShoppingCart, 'ordenes', 'ordenes'],
    ['Nueva salida', PackageMinus, 'salidas', 'salidas'],
    ['Traslado', ArrowRightLeft, 'traslados', 'traslados'],
    ['Nuevo producto', Boxes, 'productos', 'maestros'],
    ['Nuevo lote', Tags, 'lotes', 'maestros'],
    ['Inventario físico (Excel)', ClipboardCheck, 'conteos', 'conteoAbrir', 'excel'],
    ['Nueva bodega', Warehouse, 'bodegas', 'config']
  ].filter((a) => puede(a[3]));
  const lineas = C.arbolGrupos(db).filter((g) => g.nivel === 1);
  const year = C.yearOf(hoy);
  const valor = C.valorInventario(state);
  const ls = C.lotes(db, state, hoy);
  const porVencer = ls.filter((l) => l.estado === 'rojo' || l.estado === 'amarillo').length;
  const vencidos = ls.filter((l) => l.estado === 'vencido').length;
  const activos = db.productos.filter((p) => p.activo !== false);
  const bajo = activos.filter((p) => Number(p.stockMin) > 0 && (state.prods[p.id]?.qty || 0) < Number(p.stockMin)).length;
  const f = C.faltantesAnio(db, year);
  const al = C.alertas(db, state, hoy);
  const cump = C.cumplimiento(db, state, hoy);
  const uc = C.ultimoCierre(db);

  const porCat = [...lineas.map((g) => ({ k: g.id, label: g.nombre, set: C.gruposDescendientes(db, g.id) })), { k: '', label: 'Sin clasificar' }].map((g) => ({
    k: g.k || 'sin', label: g.label,
    valor: db.productos.filter((p) => (g.k ? g.set.has(p.grupoId) : !C.rutaGrupo(db, p.grupoId))).reduce((s, p) => s + (state.prods[p.id]?.value || 0), 0)
  })).filter((g) => g.valor > 0).sort((a, b) => b.valor - a.valor);
  const maxCat = Math.max(1, ...porCat.map((x) => x.valor));
  const ultimos = C.ordenar(db.movimientos).reverse().slice(0, 7);

  return (
    <div className="stack">
      <Panel className="hero scan">
        <div>
          <h2>{db.config.empresa.nombre}</h2>
          <p>Inventario permanente al {fecha(hoy)} · {C.METODOS[C.metodoDe(db.config, hoy)]}</p>
        </div>
        <div className="meta">
          <Chip tone="cyan" dot>Kardex en línea</Chip>
          <Chip tone="violet">NIIF Grupo {db.config.empresa.grupo}</Chip>
          <Chip tone={uc ? 'green' : 'amber'}>{uc ? 'Cerrado al ' + fecha(uc.fecha) : 'Sin cierres'}</Chip>
        </div>
      </Panel>

      {acciones.length > 0 && (
        <div className="quick">
          {acciones.map(([t, Icon, ruta, , arg]) => <Btn key={t} icon={Icon} onClick={() => go(ruta, arg || 'nuevo')}>{t}</Btn>)}
          <Btn icon={BarChart3} onClick={() => go('reportes')}>Reportes</Btn>
          <Btn variant="ghost" icon={Compass} onClick={() => go('guia')}>Guía de uso</Btn>
        </div>
      )}

      <div className="grid g-kpi">
        <Kpi label="Valor del inventario" value={money(valor)} sub={activos.length + ' referencias activas'} icon={Wallet} tone="cyan" onClick={() => go('kardex')} />
        <Kpi label="Lotes por vencer" value={porVencer} sub={'Rojo ≤ ' + db.config.semaforo.rojo + ' d · amarillo ≤ ' + db.config.semaforo.amarillo + ' d'} icon={CalendarClock} tone="amber" onClick={() => go('vencimientos')} />
        <Kpi label="Lotes vencidos" value={vencidos} sub="Con existencia: requieren baja" icon={TriangleAlert} tone={vencidos ? 'magenta' : 'green'} onClick={() => go('vencimientos')} />
        <Kpi label="Bajo stock mínimo" value={bajo} sub="Referencias por reponer" icon={Boxes} tone={bajo ? 'red' : 'green'} onClick={() => go('productos')} />
        <Kpi label={'Faltantes ' + year} value={pct(f.pct, 2)} sub={'Límite fiscal ' + db.config.limiteFaltantes + ' % (ET art. 64)'} icon={TrendingDown} tone={f.pct > db.config.limiteFaltantes ? 'magenta' : 'violet'} onClick={() => go('ajustes')} />
      </div>

      <div className="grid g-2">
        <Panel title="Cumplimiento normativo" icon={ShieldCheck}>
          <div className="gauge-wrap">
            <Gauge value={cump.total} />
            <div className="meters">
              {cump.indicadores.map((i) => {
                const color = i.valor >= 85 ? 'var(--green)' : i.valor >= 60 ? 'var(--amber)' : 'var(--magenta)';
                return (
                  <div className="meter" key={i.nombre}>
                    <div className="top"><span>{i.nombre}</span><span>{i.detalle}</span></div>
                    <div className="track"><div className="fill" style={{ width: i.valor + '%', background: color, boxShadow: '0 0 10px ' + color }} /></div>
                  </div>
                );
              })}
            </div>
          </div>
        </Panel>
        <Panel title={'Alertas (' + al.length + ')'} icon={TriangleAlert}>
          {al.length ? (
            <div className="alerts">
              {al.map((a, i) => (
                <div key={i} className={'alert ' + a.nivel} onClick={() => go(DESTINO_ALERTA[a.tipo] || 'panel')} role="button" tabIndex={0}>
                  <span className="lvl" />
                  <div><div className="t">{a.titulo}</div><div className="d">{a.detalle}</div></div>
                </div>
              ))}
            </div>
          ) : <Empty icon={ShieldCheck} title="Todo en orden" text="No hay alertas activas." />}
        </Panel>
      </div>

      <div className="grid g-2b">
        <Panel title="Valor por línea" icon={Layers} actions={<Btn size="sm" variant="ghost" onClick={() => go('reportes', 'valorizado-clasificacion')}>Ver reporte</Btn>}>
          <div className="bars">
            {porCat.map((c) => (
              <div className="bar-row" key={c.k}>
                <div className="top"><span>{c.label}</span><span className="mono">{money(c.valor)}</span></div>
                <div className="track"><div className="fill" style={{ width: (c.valor / maxCat) * 100 + '%' }} /></div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Últimos movimientos" icon={Activity}>
          {ultimos.length ? (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Documento</th><th>Fecha</th><th>Tipo</th><th className="num">Valor</th></tr></thead>
                <tbody>
                  {ultimos.map((m) => (
                    <tr key={m.id} className={m.anulado ? 'anulado' : ''}>
                      <td className="mono">{m.num}</td>
                      <td>{fecha(m.fecha)}</td>
                      <td><Chip tone={TONO_MOV[m.tipo]}>{C.TIPOS_MOV[m.tipo]}</Chip></td>
                      <td className="num">{money(state.movCost[m.id]?.total || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty icon={Activity} title="Sin movimientos" text={'Registre la primera entrada.'} />}
          <div className="small muted" style={{ marginTop: 10 }}>{num(db.movimientos.length)} movimientos registrados</div>
        </Panel>
      </div>
    </div>
  );
}
