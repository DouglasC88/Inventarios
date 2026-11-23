import { useState } from 'react';
import { Ban, CalendarClock, Download } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { Btn, Chip, Empty, Kpi, Panel, SearchBox, Tabs } from '../components/ui.jsx';
import { NuevaBaja } from './Ajustes.jsx';
import { descargar, fecha, num, SEMAFORO } from '../format.js';

export default function Lotes() {
  const { db, state, hoy } = useStore();
  const [filtro, setFiltro] = useState('todos');
  const [q, setQ] = useState('');
  const [baja, setBaja] = useState(null);
  const [bodega, setBodega] = useState('todas');
  const { puede } = useStore();
  const todos = C.lotes(db, state, hoy, bodega === 'todas' ? {} : { bodega });
  const cuenta = (e) => todos.filter((l) => l.estado === e).length;
  const lista = todos.filter((l) => (filtro === 'todos' || l.estado === filtro) &&
    (l.producto.nombre + ' ' + l.producto.codigo + ' ' + l.lote).toLowerCase().includes(q.toLowerCase()));
  const exportar = () => {
    const rows = [['Código', 'Producto', 'Bodega', 'Lote', 'Vence', 'Días', 'Semáforo', 'Existencia', 'Unidad']];
    lista.forEach((l) => rows.push([l.producto.codigo, l.producto.nombre, l.bodega, l.lote, l.vence, l.dias, SEMAFORO[l.estado].texto, l.qty, l.producto.unidad]));
    descargar('lotes-vencimientos-' + hoy + '.csv', C.csv(rows));
  };
  return (
    <div className="stack">
      <div className="grid g-kpi">
        <Kpi label="Vencidos" value={cuenta('vencido')} sub="Con existencia: dar de baja" tone="magenta" onClick={() => setFiltro('vencido')} />
        <Kpi label="Rojo" value={cuenta('rojo')} sub={'Vencen en ≤ ' + db.config.semaforo.rojo + ' días'} tone="red" onClick={() => setFiltro('rojo')} />
        <Kpi label="Amarillo" value={cuenta('amarillo')} sub={'Vencen en ≤ ' + db.config.semaforo.amarillo + ' días'} tone="amber" onClick={() => setFiltro('amarillo')} />
        <Kpi label="Verde" value={cuenta('verde')} sub="Vida útil amplia" tone="green" onClick={() => setFiltro('verde')} />
      </div>
      <Panel title="Lotes y vencimientos" icon={CalendarClock} sub="Semaforización de fechas de vencimiento (Res. 1403 de 2007). Las salidas usan primero lo que vence primero."
        actions={<Btn icon={Download} onClick={exportar}>Exportar</Btn>}>
        <div className="toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Buscar producto o lote" />
          <select className="select input" value={bodega} onChange={(e) => setBodega(e.target.value)} style={{ maxWidth: 220 }}>
            <option value="todas">Todas las bodegas</option>{db.config.ubicaciones.map((b) => <option key={b}>{b}</option>)}
          </select>
          <Tabs value={filtro} onChange={setFiltro} options={[['todos', 'Todos'], ['vencido', 'Vencidos'], ['rojo', 'Rojo'], ['amarillo', 'Amarillo'], ['verde', 'Verde']]} />
        </div>
        {lista.length ? (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Producto</th><th>Bodega</th><th>Lote</th><th>Vence</th><th className="num">Días</th><th>Semáforo</th><th className="num">Existencia</th><th /></tr></thead>
              <tbody>
                {lista.map((l, i) => {
                  const s = SEMAFORO[l.estado];
                  return (
                    <tr key={i}>
                      <td><div className="strong">{l.producto.nombre}</div><div className="small muted mono">{l.producto.codigo}</div></td>
                      <td>{l.bodega}</td>
                      <td className="mono">{l.lote}</td>
                      <td>{fecha(l.vence)}</td>
                      <td className="num">{l.dias === null ? '—' : num(l.dias)}</td>
                      <td><Chip tone={s.tono} dot>{s.texto}</Chip></td>
                      <td className="num">{num(l.qty)} <span className="small muted">{l.producto.unidad}</span></td>
                      <td className="acts">{l.estado === 'vencido' && puede('bajas') && <Btn size="sm" variant="danger" icon={Ban} onClick={() => setBaja(l)}>Dar de baja</Btn>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <Empty icon={CalendarClock} title="Sin lotes" text="No hay lotes con existencia para este filtro." />}
      </Panel>
      {baja && <NuevaBaja inicial={baja} onClose={() => setBaja(null)} />}
    </div>
  );
}
