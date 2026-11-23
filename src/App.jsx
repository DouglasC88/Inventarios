import { useEffect, useState } from 'react';
import {
  ArrowRightLeft, BarChart3, Receipt, ListTree, Download, House, Stethoscope, Calculator, BookOpen, Landmark, LifeBuoy, Bell, Contact, PackageSearch, Boxes, CalendarClock, ClipboardCheck, ClipboardList, Compass, FileSpreadsheet, FolderTree, Hexagon, Layers, Tags, Warehouse,
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
import Guia, { PrimerosPasos } from './views/Guia.jsx';
import Inicio from './views/Inicio.jsx';
import { Facturas, Comprobantes, LibroDiario, MayorBalances, Auxiliar, EstadoCosto, Conciliacion, PlanCuentas, CuentasContables, Interfaz } from './views/Contabilidad.jsx';
import Existencias from './views/Existencias.jsx';
import BuscadorGeneral from './components/BuscadorGeneral.jsx';

// [clave, título, ícono, vista, permiso requerido para verla (opcional)]
// Menú por módulos: cada módulo agrupa varias pantallas que se muestran como pestañas.
// Pestaña: [ruta, título, ícono, vista, permiso requerido (opcional)]
const MODULOS = [
  ['inicio', 'Inicio', House, [
    ['inicio', 'Inicio', House, Inicio],
    ['panel', 'Centro de control', LayoutDashboard, Dashboard]
  ]],
  ['compras', 'Compras y entradas', PackagePlus, [
    ['entradas', 'Entradas de inventario', PackagePlus, Entradas],
    ['ordenes', 'Órdenes de compra', ShoppingCart, Ordenes],
    ['reabastecimiento', 'Reabastecimiento', RefreshCcw, Reabastecimiento],
    ['devoluciones', 'Devoluciones', Undo2, Devoluciones]
  ]],
  ['salidas', 'Salidas y movimientos', PackageMinus, [
    ['salidas', 'Salidas y consumos', PackageMinus, Salidas],
    ['traslados', 'Traslados', ArrowRightLeft, Traslados],
    ['requisiciones', 'Requisiciones', ClipboardList, Requisiciones],
    ['ajustes', 'Ajustes y bajas', SlidersHorizontal, Ajustes]
  ]],
  ['kardex', 'Kardex e inventario', ScrollText, [
    ['existencias', 'Existencias', PackageSearch, Existencias],
    ['kardex', 'Kardex', ScrollText, Kardex],
    ['vencimientos', 'Vencimientos', CalendarClock, Lotes],
    ['conteos', 'Inventario físico', ClipboardCheck, Conteos],
    ['trazabilidad', 'Trazabilidad', ScanSearch, Trazabilidad],
    ['frio', 'Cadena de frío', Thermometer, Frio],
    ['cierres', 'Cierres', Lock, Cierres]
  ]],
  ['productos', 'Productos y servicios', Boxes, [
    ['productos', 'Productos e insumos', Boxes, Productos],
    ['kits', 'Servicios', Stethoscope, Kits],
    ['lotes', 'Lotes', Tags, LotesMaestro],
    ['grupos', 'Clasificación', FolderTree, Grupos],
    ['importar', 'Carga desde Excel', FileSpreadsheet, Importar, 'importar']
  ]],
  ['terceros', 'Terceros', Contact, [
    ['terceros', 'Terceros (NIT)', Contact, Proveedores]
  ]],
  ['contabilidad', 'Contabilidad', Calculator, [
    ['facturasp', 'Facturas de proveedor', Receipt, Facturas],
    ['comprobantes', 'Comprobantes', BookOpen, Comprobantes],
    ['diario', 'Libro diario', BookOpen, LibroDiario],
    ['mayor', 'Mayor y balances', Scale, MayorBalances],
    ['auxiliar', 'Auxiliares', ListTree, Auxiliar],
    ['costo', 'Estado de costo', Calculator, EstadoCosto],
    ['conciliacion', 'Conciliación', Landmark, Conciliacion],
    ['plan', 'Plan de cuentas', ListTree, PlanCuentas],
    ['ccuentas', 'Parametrización', Settings, CuentasContables],
    ['interfaz', 'Interfaz contable', Download, Interfaz]
  ]],
  ['reportes', 'Reportes', BarChart3, [
    ['reportes', 'Centro de reportes', BarChart3, Reportes]
  ]],
  ['config', 'Configuración', Settings, [
    ['config', 'General', Settings, Configuracion, 'config'],
    ['bodegas', 'Bodegas', Warehouse, Bodegas, 'config'],
    ['usuarios', 'Usuarios y roles', UsersRound, Usuarios, 'usuarios']
  ]],
  ['normatividad', 'Normatividad', Scale, [
    ['normativa', 'Normatividad', Scale, Normativa]
  ]],
  ['ayuda', 'Portal de ayuda', LifeBuoy, [
    ['ayuda', 'Portal de ayuda', LifeBuoy, Guia],
    ['guia', 'Primeros pasos', Compass, PrimerosPasos]
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
  const modulos = MODULOS.map(([k, l, I, tabs]) => [k, l, I, tabs.filter((t) => !t[4] || puede(t[4]))]).filter((m) => m[3].length);
  const vistaRuta = ruta.vista === 'proveedores' ? 'terceros' : ruta.vista;
  const modulo = modulos.find((m) => m[3].some((t) => t[0] === vistaRuta)) || modulos[0];
  const actual = modulo[3].find((t) => t[0] === vistaRuta) || modulo[3][0];
  const Vista = actual[3];
  const enInicio = actual[0] === 'inicio';
  const ModIcon = modulo[2];
  const criticas = requiereLogin ? 0 : C.alertas(db, state, hoy).filter((a) => a.nivel === 'critico').length;
  const rqPend = db.requisiciones.filter((r) => ['pendiente', 'parcial'].includes(C.estadoRequisicion(db, r).estado)).length;

  useEffect(() => { document.title = actual[1] + ' · NOVA Inventario'; }, [actual]);

  if (requiereLogin) return <><Login /><Toasts items={toasts} /></>;

  return (
    <>
      <div className="cosmos" aria-hidden="true"><div className="aurora" /><div className="stars" /><div className="floor" /></div>
      <div className="app sin-lateral">
        <main className="main">
          <header className="topbar">
            <a className="brand" href="#/inicio" title="Ir al inicio">
              <div className="brand-mark"><Hexagon size={20} /></div>
              <div>
                <div className="brand-name">NOV<span>A</span></div>
                <div className="brand-sub">Inventario</div>
              </div>
            </a>
            {!enInicio && <a className="btn home-btn" href="#/inicio" title="Volver al menú principal"><House size={16} /> Inicio</a>}
            {!enInicio && (
              <div className="seccion">
                <span className="sec-ico"><ModIcon size={18} /></span>
                <div>
                  <div className="crumb">{modulo[0] === 'inicio' ? 'Inicio' : modulo[1]}</div>
                  <h1>{actual[1]}</h1>
                </div>
              </div>
            )}
            <BuscadorGeneral />
            <div className="spacer" />
            <Reloj />
            <a className="btn icon-btn bell" href="#/panel" title={criticas + ' alertas críticas'} aria-label="Alertas"><Bell size={17} />{criticas > 0 && <span className="count">{criticas}</span>}</a>
            <a className="btn sm" href="#/ayuda" title="Portal de ayuda"><LifeBuoy size={15} /> Ayuda</a>
            {usuario && (
              <div className="userchip">
                <div className="who"><b>{usuario.nombre}</b><span>{C.ROLES[usuario.rol]}{usuario.bodega ? ' · ' + usuario.bodega : ''}</span></div>
                <button type="button" className="btn ghost icon-btn" onClick={salir} title="Cerrar sesión" aria-label="Cerrar sesión"><LogOut size={16} /></button>
              </div>
            )}
          </header>
          {!enInicio && modulo[0] !== 'inicio' && modulo[3].length > 1 && (
            <div className="modtabs">
              {modulo[3].map(([k, label, Icon]) => (
                <a key={k} href={'#/' + k} className={actual[0] === k ? 'on' : ''}><Icon size={15} />{label}
                  {k === 'requisiciones' && rqPend > 0 && <span className="count">{rqPend}</span>}
                </a>
              ))}
            </div>
          )}
          <Vista key={ruta.vista + '/' + ruta.arg} arg={ruta.arg} modulos={modulos} />
        </main>
      </div>
      <Toasts items={toasts} />
    </>
  );
}
