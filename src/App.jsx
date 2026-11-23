import { useEffect, useState } from 'react';
import {
  ArrowRightLeft, BarChart3, Contact, PackageSearch, Boxes, CalendarClock, ClipboardCheck, ClipboardList, Compass, FileSpreadsheet, FolderTree, Hexagon, Layers, Tags, Warehouse,
  LayoutDashboard, Lock, LogOut, Menu, PackageMinus, PackagePlus, RefreshCcw, Scale, ScanSearch, ScrollText,
  Settings, ShoppingCart, SlidersHorizontal, Thermometer, Undo2, UsersRound
} from 'lucide-react';
import { useStore, C } from './store.jsx';
import { Toasts } from './components/ui.jsx';
import Dashboard from './views/Dashboard.jsx';
import Productos from './views/Productos.jsx';
import Proveedores from './views/Proveedores.jsx';
import Entradas from './views/Entradas.jsx';
import Salidas from './views/Salidas.jsx';
import Traslados from './views/Traslados.jsx';
import Requisiciones from './views/Requisiciones.jsx';
import Ordenes from './views/Ordenes.jsx';
import Devoluciones from './views/Devoluciones.jsx';
import Ajustes from './views/Ajustes.jsx';
import Conteos from './views/Conteos.jsx';
import Kardex from './views/Kardex.jsx';
import Lotes from './views/Lotes.jsx';
import Trazabilidad from './views/Trazabilidad.jsx';
import Frio from './views/Frio.jsx';
import Cierres from './views/Cierres.jsx';
import Reabastecimiento from './views/Reabastecimiento.jsx';
import Reportes from './views/Reportes.jsx';
import Kits from './views/Kits.jsx';
import Normativa from './views/Normativa.jsx';
import Configuracion from './views/Configuracion.jsx';
import Usuarios from './views/Usuarios.jsx';
import Importar from './views/Importar.jsx';
import Login from './views/Login.jsx';
import Bodegas from './views/Bodegas.jsx';
import Grupos from './views/Grupos.jsx';
import LotesMaestro from './views/LotesMaestro.jsx';
import Guia from './views/Guia.jsx';
import Existencias from './views/Existencias.jsx';
import BuscadorGeneral from './components/BuscadorGeneral.jsx';

// [clave, título, ícono, vista, permiso requerido para verla (opcional)]
const NAV = [
  ['Operación', [
    ['panel', 'Centro de control', LayoutDashboard, Dashboard],
    ['guia', 'Guía de uso', Compass, Guia],
    ['entradas', 'Entradas', PackagePlus, Entradas],
    ['salidas', 'Salidas y consumos', PackageMinus, Salidas],
    ['traslados', 'Traslados', ArrowRightLeft, Traslados],
    ['requisiciones', 'Requisiciones', ClipboardList, Requisiciones],
    ['devoluciones', 'Devoluciones', Undo2, Devoluciones],
    ['ajustes', 'Ajustes y bajas', SlidersHorizontal, Ajustes],
    ['conteos', 'Conteos físicos', ClipboardCheck, Conteos]
  ]],
  ['Reportes', [
    ['reportes', 'Centro de reportes', BarChart3, Reportes]
  ]],
  ['Compras', [
    ['ordenes', 'Órdenes de compra', ShoppingCart, Ordenes],
    ['reabastecimiento', 'Reabastecimiento', RefreshCcw, Reabastecimiento]
  ]],
  ['Control', [
    ['existencias', 'Existencias', PackageSearch, Existencias],
    ['kardex', 'Kardex', ScrollText, Kardex],
    ['vencimientos', 'Vencimientos', CalendarClock, Lotes],
    ['trazabilidad', 'Trazabilidad', ScanSearch, Trazabilidad],
    ['frio', 'Cadena de frío', Thermometer, Frio],
    ['cierres', 'Cierres de periodo', Lock, Cierres]
  ]],
  ['Maestros', [
    ['bodegas', 'Bodegas', Warehouse, Bodegas],
    ['grupos', 'Clasificación', FolderTree, Grupos],
    ['productos', 'Productos', Boxes, Productos],
    ['lotes', 'Lotes', Tags, LotesMaestro],
    ['kits', 'Kits por procedimiento', Layers, Kits],
    ['terceros', 'Terceros (NIT)', Contact, Proveedores]
  ]],
  ['Sistema', [
    ['normativa', 'Normativa', Scale, Normativa],
    ['importar', 'Importar datos', FileSpreadsheet, Importar, 'importar'],
    ['usuarios', 'Usuarios y roles', UsersRound, Usuarios, 'usuarios'],
    ['config', 'Configuración', Settings, Configuracion, 'config']
  ]]
];

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
  const { db, state, hoy, ruta, toasts, usuario, requiereLogin, salir, puede } = useStore();
  const [menu, setMenu] = useState(false);
  const nav = NAV.map(([g, items]) => [g, items.filter((x) => !x[4] || puede(x[4]))]).filter(([, items]) => items.length);
  const plano = nav.flatMap(([, items]) => items);
  const vistaRuta = ruta.vista === 'proveedores' ? 'terceros' : ruta.vista;
  const actual = plano.find((x) => x[0] === vistaRuta) || plano[0];
  const Vista = actual[3];
  const criticas = requiereLogin ? 0 : C.alertas(db, state, hoy).filter((a) => a.nivel === 'critico').length;
  const rqPend = db.requisiciones.filter((r) => ['pendiente', 'parcial'].includes(C.estadoRequisicion(db, r).estado)).length;

  useEffect(() => { setMenu(false); }, [ruta]);
  useEffect(() => { document.title = actual[1] + ' · NOVA Inventario'; }, [actual]);

  if (requiereLogin) return <><Login /><Toasts items={toasts} /></>;

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
            {nav.map(([grupo, items]) => (
              <div key={grupo}>
                <div className="nav-group">{grupo}</div>
                {items.map(([k, label, Icon]) => (
                  <a key={k} href={'#/' + k} className={actual[0] === k ? 'active' : ''}>
                    <Icon size={18} />{label}
                    {k === 'panel' && criticas > 0 && <span className="count">{criticas}</span>}
                    {k === 'requisiciones' && rqPend > 0 && <span className="count">{rqPend}</span>}
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
              <div className="crumb">NOVA · {(nav.find(([, items]) => items.includes(actual)) || ['Inicio'])[0]}</div>
              <h1>{actual[1]}</h1>
            </div>
            <BuscadorGeneral />
            <div className="spacer" />
            <Reloj />
            {usuario && (
              <div className="userchip">
                <div className="who"><b>{usuario.nombre}</b><span>{C.ROLES[usuario.rol]}{usuario.bodega ? ' · ' + usuario.bodega : ''}</span></div>
                <button type="button" className="btn ghost icon-btn" onClick={salir} title="Cerrar sesión" aria-label="Cerrar sesión"><LogOut size={16} /></button>
              </div>
            )}
          </header>
          <Vista key={ruta.vista + '/' + ruta.arg} arg={ruta.arg} />
        </main>
      </div>
      <Toasts items={toasts} />
    </>
  );
}
