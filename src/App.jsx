import { useEffect, useState } from 'react';
import {
  Boxes, CalendarClock, ClipboardCheck, Hexagon, LayoutDashboard, Lock, Menu, PackageMinus, PackagePlus,
  Scale, ScanSearch, ScrollText, Settings, SlidersHorizontal, Thermometer, Truck
} from 'lucide-react';
import { useStore, C } from './store.jsx';
import { Toasts } from './components/ui.jsx';
import Dashboard from './views/Dashboard.jsx';
import Productos from './views/Productos.jsx';
import Proveedores from './views/Proveedores.jsx';
import Entradas from './views/Entradas.jsx';
import Salidas from './views/Salidas.jsx';
import Ajustes from './views/Ajustes.jsx';
import Conteos from './views/Conteos.jsx';
import Kardex from './views/Kardex.jsx';
import Lotes from './views/Lotes.jsx';
import Trazabilidad from './views/Trazabilidad.jsx';
import Frio from './views/Frio.jsx';
import Cierres from './views/Cierres.jsx';
import Normativa from './views/Normativa.jsx';
import Configuracion from './views/Configuracion.jsx';

const NAV = [
  ['Operación', [
    ['panel', 'Centro de control', LayoutDashboard, Dashboard],
    ['entradas', 'Entradas', PackagePlus, Entradas],
    ['salidas', 'Salidas', PackageMinus, Salidas],
    ['ajustes', 'Ajustes y bajas', SlidersHorizontal, Ajustes],
    ['conteos', 'Conteos físicos', ClipboardCheck, Conteos]
  ]],
  ['Control', [
    ['kardex', 'Kardex', ScrollText, Kardex],
    ['lotes', 'Lotes y vencimientos', CalendarClock, Lotes],
    ['trazabilidad', 'Trazabilidad', ScanSearch, Trazabilidad],
    ['frio', 'Cadena de frío', Thermometer, Frio],
    ['cierres', 'Cierres de periodo', Lock, Cierres]
  ]],
  ['Maestros', [
    ['productos', 'Productos', Boxes, Productos],
    ['proveedores', 'Proveedores', Truck, Proveedores]
  ]],
  ['Sistema', [
    ['normativa', 'Normativa', Scale, Normativa],
    ['config', 'Configuración', Settings, Configuracion]
  ]]
];
const PLANO = NAV.flatMap(([, items]) => items);

function Reloj() {
  const [t, setT] = useState(() => new Date());
  useEffect(() => {
    const i = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(i);
  }, []);
  const f = t.toLocaleDateString('es-CO', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  return <div className="clock">{f} · <b>{t.toLocaleTimeString('es-CO', { hour12: false })}</b></div>;
}

export default function App() {
  const { db, state, hoy, ruta, toasts } = useStore();
  const [menu, setMenu] = useState(false);
  const actual = PLANO.find((x) => x[0] === ruta.vista) || PLANO[0];
  const Vista = actual[3];
  const criticas = C.alertas(db, state, hoy).filter((a) => a.nivel === 'critico').length;

  useEffect(() => { setMenu(false); }, [ruta]);
  useEffect(() => { document.title = actual[1] + ' · NOVA Inventario'; }, [actual]);

  return (
    <>
      <div className="cosmos" aria-hidden="true"><div className="aurora" /><div className="stars" /><div className="floor" /></div>
      <div className="app">
        <aside className={'sidebar' + (menu ? ' open' : '')}>
          <div className="brand">
            <div className="brand-mark"><Hexagon size={20} /></div>
            <div>
              <div className="brand-name">NOV<span>A</span></div>
              <div className="brand-sub">Inventario</div>
            </div>
          </div>
          <nav className="nav">
            {NAV.map(([grupo, items]) => (
              <div key={grupo}>
                <div className="nav-group">{grupo}</div>
                {items.map(([k, label, Icon]) => (
                  <a key={k} href={'#/' + k} className={actual[0] === k ? 'active' : ''}>
                    <Icon size={18} />{label}
                    {k === 'panel' && criticas > 0 && <span className="count">{criticas}</span>}
                  </a>
                ))}
              </div>
            ))}
          </nav>
          <div className="sidebar-foot">
            <div><b>{db.config.empresa.nombre}</b></div>
            <div>NIT {db.config.empresa.nit || '—'} · Grupo {db.config.empresa.grupo}</div>
            <div style={{ marginTop: 6 }}><span className="pulse" /> &nbsp;{C.METODOS[C.metodoDe(db.config, hoy)]}</div>
          </div>
        </aside>
        <main className="main">
          <header className="topbar">
            <button type="button" className="btn menu-btn icon-btn" onClick={() => setMenu((m) => !m)} aria-label="Abrir menú"><Menu size={18} /></button>
            <div>
              <div className="crumb">NOVA · {NAV.find(([, items]) => items.includes(actual))[0]}</div>
              <h1>{actual[1]}</h1>
            </div>
            <div className="spacer" />
            <Reloj />
          </header>
          <Vista arg={ruta.arg} />
        </main>
      </div>
      <Toasts items={toasts} />
    </>
  );
}
