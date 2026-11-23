import { Activity, Boxes, CalendarClock, Layers, ShieldCheck, TrendingDown, TriangleAlert, Wallet } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { Chip, Gauge, Kpi, Panel, Empty } from '../components/ui.jsx';
import { money, num, pct, fecha, TONO_MOV } from '../format.js';

const DESTINO_ALERTA = { stock: 'productos', invima: 'productos', vencimiento: 'lotes', faltantes: 'ajustes', conteo: 'conteos', frio: 'frio' };

export default function Dashboard() {
  const { db, state, hoy, go } = useStore();
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

  const porCat = Object.keys(C.CATEGORIAS).map((k) => ({
    k, label: C.CATEGORIAS[k],
    valor: db.productos.filter((p) => p.categoria === k).reduce((s, p) => s + (state.prods[p.id]?.value || 0), 0)
  }));
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

      <div className="grid g-kpi">
        <Kpi label="Valor del inventario" value={money(valor)} sub={activos.length + ' referencias activas'} icon={Wallet} tone="cyan" onClick={() => go('kardex')} />
        <Kpi label="Lotes por vencer" value={porVencer} sub={'Rojo ≤ ' + db.config.semaforo.rojo + ' d · amarillo ≤ ' + db.config.semaforo.amarillo + ' d'} icon={CalendarClock} tone="amber" onClick={() => go('lotes')} />
        <Kpi label="Lotes vencidos" value={vencidos} sub="Con existencia: requieren baja" icon={TriangleAlert} tone={vencidos ? 'magenta' : 'green'} onClick={() => go('lotes')} />
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
        <Panel title="Valor por categoría" icon={Layers}>
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
