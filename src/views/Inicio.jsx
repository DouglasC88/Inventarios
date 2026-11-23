import { useStore, C } from '../store.jsx';
import { money, num } from '../format.js';

// Color de cada sección (degradado del ícono en relieve).
const TONOS = {
  inicio: ['#00c2ff', '#3b82f6'], compras: ['#22d3ee', '#0ea5e9'], salidas: ['#a78bfa', '#7c3aed'], kardex: ['#34d399', '#059669'],
  productos: ['#fbbf24', '#f97316'], terceros: ['#f472b6', '#db2777'], contabilidad: ['#60a5fa', '#1d4ed8'], reportes: ['#2dd4bf', '#0d9488'],
  config: ['#94a3b8', '#475569'], normatividad: ['#c084fc', '#9333ea'], ayuda: ['#38bdf8', '#0284c7']
};

export default function Inicio({ modulos }) {
  const { db, state, hoy, go, nombreUsuario } = useStore();
  const al = C.alertas(db, state, hoy);
  const dato = {
    inicio: al.filter((a) => a.nivel === 'critico').length + ' alertas críticas',
    compras: db.ordenes.filter((o) => ['abierta', 'parcial'].includes(C.estadoOrden(db, o).estado)).length + ' órdenes abiertas',
    salidas: db.requisiciones.filter((r) => ['pendiente', 'parcial'].includes(C.estadoRequisicion(db, r).estado)).length + ' requisiciones por atender',
    kardex: money(C.valorInventario(state)) + ' en inventario',
    productos: num(db.productos.length) + ' productos · ' + num(db.servicios.length) + ' servicios',
    terceros: num(db.proveedores.length) + ' terceros',
    contabilidad: num(C.pendientesPorFacturar(db).length) + ' líneas por facturar',
    reportes: '32 reportes',
    config: num(db.config.ubicaciones.length) + ' bodegas · ' + num(db.usuarios.length) + ' usuarios',
    normatividad: 'NIIF · Estatuto Tributario · INVIMA',
    ayuda: 'Cómo hacer cada proceso'
  };
  const hora = new Date().getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
  return (
    <div className="stack">
      <div className="panel hero scan">
        <div>
          <h2>{saludo}, {nombreUsuario}</h2>
          <p>Elija una sección para trabajar. Desde cualquier pantalla vuelve aquí con el botón <b>Inicio</b> o el logo.</p>
        </div>
        <div className="meta">
          <span className="chip violet">{db.config.empresa.nombre}</span>
          <span className="chip muted">NIT {db.config.empresa.nit || '—'} · NIIF Grupo {db.config.empresa.grupo}</span>
          <span className="chip cyan"><span className="dot" />{C.METODOS[C.metodoDe(db.config, hoy)]}</span>
        </div>
      </div>
      <div className="launcher">
        {modulos.map(([k, label, Icon, tabs]) => {
          const [a, b] = TONOS[k] || TONOS.inicio;
          const destino = k === 'inicio' ? 'panel' : tabs[0][0];
          return (
            <button key={k} type="button" className="tile" onClick={() => go(destino)} style={{ '--c1': a, '--c2': b }}>
              <span className="orb"><Icon size={44} strokeWidth={1.6} /></span>
              <span className="tile-t">{k === 'inicio' ? 'Centro de control' : label}</span>
              <span className="tile-s">{dato[k]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
