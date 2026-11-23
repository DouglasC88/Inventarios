import { useState } from 'react';
import { Download, RefreshCcw, ShoppingCart } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { Btn, Chip, Empty, Kpi, Nota, Panel, Tabs } from '../components/ui.jsx';
import { NuevaOrden } from './Ordenes.jsx';
import { descargar, money, num } from '../format.js';

export default function Reabastecimiento() {
  const { db, state, hoy, puede } = useStore();
  const [tab, setTab] = useState('comprar');
  const [orden, setOrden] = useState(null);
  const filas = C.reabastecimiento(db, state, hoy);
  const comprar = filas.filter((f) => f.sugerido > 0);
  const lista = tab === 'comprar' ? comprar : filas;
  const cfg = db.config.reabastecimiento;
  const valorSugerido = comprar.reduce((s, f) => s + f.sugerido * (f.ultimoCosto || 0), 0);
  const porProveedor = {};
  comprar.forEach((f) => { const k = f.producto.proveedorId || ''; (porProveedor[k] = porProveedor[k] || []).push(f); });

  const generar = (provId) => {
    setOrden({
      encabezado: { proveedorId: provId, nota: 'Generada desde reabastecimiento' },
      lineas: porProveedor[provId].map((f) => ({ productoId: f.producto.id, cantidad: f.sugerido, costoUnit: Math.round(f.ultimoCosto || 0) }))
    });
  };
  const exportar = () => {
    const rows = [['Código', 'Producto', 'Consumo diario', 'Días de entrega', 'Existencia', 'En órdenes', 'Punto de reorden', 'Máximo', 'Sugerido', 'Cobertura (días)']];
    lista.forEach((f) => rows.push([f.producto.codigo, f.producto.nombre, C.r2(f.diario), f.lead, f.existencia, f.pedido, f.puntoReorden, f.maximo, f.sugerido, f.cobertura === null ? '' : f.cobertura]));
    descargar('reabastecimiento-' + hoy + '.csv', C.csv(rows));
  };

  return (
    <div className="stack">
      <div className="grid g-kpi">
        <Kpi label="Productos por pedir" value={comprar.length} sub="En o bajo el punto de reorden" tone={comprar.length ? 'amber' : 'green'} />
        <Kpi label="Valor estimado" value={money(valorSugerido)} sub="Al último costo de compra" tone="cyan" />
        <Kpi label="Proveedores" value={Object.keys(porProveedor).length} sub="Con productos por pedir" tone="violet" />
      </div>
      <Panel title="Reabastecimiento" icon={RefreshCcw}
        sub={'Consumo promedio de los últimos ' + cfg.consumoDias + ' días, ' + cfg.seguridadDias + ' días de seguridad y ' + cfg.coberturaDias + ' días de cobertura. Se descuenta lo que ya está pedido en órdenes abiertas.'}
        actions={<Btn icon={Download} onClick={exportar}>Exportar</Btn>}>
        <div className="toolbar"><Tabs value={tab} onChange={setTab} options={[['comprar', 'Por pedir (' + comprar.length + ')'], ['todos', 'Todos los productos']]} /></div>
        {lista.length ? (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Producto</th><th>Proveedor</th><th className="num">Consumo/día</th><th className="num">Entrega (días)</th><th className="num">Existencia</th><th className="num">En órdenes</th><th className="num">Reorden</th><th className="num">Máximo</th><th className="num">Cobertura</th><th className="num">Sugerido</th></tr></thead>
              <tbody>
                {lista.map((f) => (
                  <tr key={f.producto.id}>
                    <td><div className="strong">{f.producto.nombre}</div><div className="small muted mono">{f.producto.codigo}</div></td>
                    <td className="small">{(db.proveedores.find((p) => p.id === f.producto.proveedorId) || {}).nombre || <span className="muted">Sin proveedor</span>}</td>
                    <td className="num">{num(f.diario)}</td><td className="num">{f.lead}</td>
                    <td className={'num' + (f.existencia <= f.puntoReorden ? ' red-t' : '')}>{num(f.existencia)}</td>
                    <td className="num">{num(f.pedido)}</td><td className="num">{num(f.puntoReorden)}</td><td className="num">{num(f.maximo)}</td>
                    <td className="num">{f.cobertura === null ? '—' : f.cobertura + ' d'}</td>
                    <td className="num">{f.sugerido > 0 ? <Chip tone="amber">{num(f.sugerido)} {f.producto.unidad}</Chip> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty icon={RefreshCcw} title="Nada por pedir" text="Ningún producto está en el punto de reorden." />}
      </Panel>
      {comprar.length > 0 && puede('ordenes') && (
        <Panel title="Generar órdenes de compra" icon={ShoppingCart}>
          <div className="toolbar">
            {Object.entries(porProveedor).map(([prov, fs]) => (
              <Btn key={prov} icon={ShoppingCart} onClick={() => generar(prov)}>
                {(db.proveedores.find((p) => p.id === prov) || {}).nombre || 'Sin proveedor'} · {fs.length} producto(s)
              </Btn>
            ))}
          </div>
          <Nota>Asigne el proveedor preferido y los días de entrega en la ficha de cada producto para que las sugerencias sean precisas.</Nota>
        </Panel>
      )}
      {orden && <NuevaOrden inicial={orden} onClose={() => setOrden(null)} />}
    </div>
  );
}
