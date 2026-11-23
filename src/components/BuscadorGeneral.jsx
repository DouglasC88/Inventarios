import { useStore, C } from '../store.jsx';
import Combo from './Combo.jsx';

/** Buscador de la barra superior: insumos (por nombre, código, código de barras) y lotes. */
export default function BuscadorGeneral() {
  const { db, state, go } = useStore();
  const nombre = (id) => (db.productos.find((p) => p.id === id) || {}).nombre || '';
  const options = [
    ...db.productos.filter((p) => p.activo !== false).map((p) => ({
      value: 'p:' + p.id,
      label: p.codigo + ' · ' + p.nombre,
      sub: 'Insumo · existencia ' + C.r2(state.prods[p.id] ? state.prods[p.id].qty : 0) + ' ' + (p.unidad || ''),
      search: [p.gtin, (db.grupos.find((g) => g.id === p.grupoId) || {}).nombre].join(' ')
    })),
    ...db.lotes.map((l) => ({ value: 'l:' + l.lote, label: 'Lote ' + l.lote, sub: nombre(l.productoId) + ' · vence ' + l.vence, search: nombre(l.productoId) }))
  ];
  const elegir = (v) => {
    if (v.startsWith('p:')) { const p = db.productos.find((x) => x.id === v.slice(2)); if (p) go('existencias', 'q:' + p.codigo); }
    else if (v.startsWith('l:')) go('trazabilidad', v.slice(2));
  };
  return <div className="gsearch"><Combo value="" onChange={elegir} options={options} placeholder="Buscar insumo por nombre, código o lote…" /></div>;
}
