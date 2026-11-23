import { Download, ScrollText } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { Btn, Chip, Empty, Panel } from '../components/ui.jsx';
import { SelectProducto } from '../components/Movimientos.jsx';
import { descargar, fecha, money, money2, num, TONO_MOV } from '../format.js';

export default function Kardex({ arg }) {
  const { db, state, hoy, go } = useStore();
  const p = db.productos.find((x) => x.id === arg);
  const s = p ? state.prods[p.id] : null;
  const filas = s ? s.kardex : [];

  const exportarProducto = () => {
    const rows = [['Fecha', 'Documento', 'Tipo', 'Detalle', 'Bodega', 'Lote', 'Vence', 'Entrada', 'Salida', 'Traslado', 'Costo unitario', 'Valor movimiento', 'Saldo cantidad', 'Saldo valor', 'Costo promedio']];
    filas.forEach((k) => rows.push([k.fecha, k.num, C.TIPOS_MOV[k.tipo], k.detalle, k.bodega, k.lote, k.vence, k.entra || '', k.sale || '', k.traslado || '', C.r2(k.unit), k.valor, k.saldoQty, k.saldoValor, C.r2(k.promedio)]));
    descargar('kardex-' + p.codigo + '-' + hoy + '.csv', C.csv(rows));
  };
  const exportarValorado = () => {
    const rows = [['Código', 'Producto', 'Categoría', 'Unidad', 'Existencia', 'Costo unitario', 'Valor']];
    db.productos.forEach((x) => {
      const e = state.prods[x.id];
      rows.push([x.codigo, x.nombre, C.CATEGORIAS[x.categoria], x.unidad, e ? e.qty : 0, e && e.qty ? C.r2(e.value / e.qty) : 0, e ? e.value : 0]);
    });
    rows.push(['', 'TOTAL', '', '', '', '', C.valorInventario(state)]);
    descargar('inventario-valorado-' + hoy + '.csv', C.csv(rows));
  };

  return (
    <Panel title="Kardex permanente" icon={ScrollText}
      sub={'Entradas, salidas y saldos en cantidad y valor. Método: ' + C.METODOS[C.metodoDe(db.config, hoy)] + '.'}
      actions={<><Btn icon={Download} onClick={exportarValorado}>Inventario valorado</Btn>{p && <Btn icon={Download} onClick={exportarProducto}>Exportar kardex</Btn>}</>}>
      <div className="toolbar" style={{ maxWidth: 520 }}>
        <SelectProducto value={arg || ''} onChange={(v) => go('kardex', v)} />
      </div>
      {!p ? <Empty icon={ScrollText} title="Seleccione un producto" text="Elija un producto para ver su kardex." /> : (
        <>
          <div className="kv">
            <div><span>Existencia</span><b>{num(s ? s.qty : 0)} {p.unidad}</b></div>
            <div><span>Valor</span><b>{money(s ? s.value : 0)}</b></div>
            <div><span>Costo unitario</span><b>{money2(s && s.qty ? s.value / s.qty : 0)}</b></div>
            <div><span>Movimientos</span><b>{filas.length}</b></div>
            {Object.entries(C.existenciasPorBodega(db, state, p.id)).map(([b, q]) => <div key={b}><span>{b}</span><b>{num(q)}</b></div>)}
          </div>
          {filas.length ? (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr><th>Fecha</th><th>Documento</th><th>Detalle</th><th>Bodega</th><th>Lote</th><th className="num">Entrada</th><th className="num">Salida</th><th className="num">Costo unit.</th><th className="num">Valor mov.</th><th className="num">Saldo</th><th className="num">Saldo valor</th></tr>
                </thead>
                <tbody>
                  {filas.map((k, i) => (
                    <tr key={i}>
                      <td>{fecha(k.fecha)}</td>
                      <td><Chip tone={TONO_MOV[k.tipo]}>{k.num}</Chip></td>
                      <td className="small">{k.detalle}</td>
                      <td className="small">{k.bodega}</td>
                      <td className="mono">{k.lote}</td>
                      <td className="num green-t">{k.entra ? num(k.entra) : ''}</td>
                      <td className="num red-t">{k.sale ? num(k.sale) : k.traslado ? <span className="cyan-t" title="Traslado entre bodegas">⇄ {num(k.traslado)}</span> : ''}</td>
                      <td className="num">{money2(k.unit)}</td>
                      <td className="num">{money(k.valor)}</td>
                      <td className="num strong">{num(k.saldoQty)}</td>
                      <td className="num">{money(k.saldoValor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty icon={ScrollText} title="Sin movimientos" text="Este producto aún no tiene movimientos." />}
        </>
      )}
    </Panel>
  );
}
