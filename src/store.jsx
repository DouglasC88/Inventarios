import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as C from './core/core.js';
import { crearDemo } from './core/demo.js';

const KEY = 'nova-inventario:db:v1';
const KEY_SESION = 'nova-inventario:sesion';
const Ctx = createContext(null);

function normalizar(d) {
  const base = C.dbVacia();
  const db = Object.assign(base, d);
  ['productos', 'proveedores', 'movimientos', 'conteos', 'cierres', 'temperaturas', 'auditoria', 'ordenes', 'requisiciones', 'kits', 'usuarios', 'bodegas', 'grupos', 'lotes']
    .forEach((k) => { if (!Array.isArray(db[k])) db[k] = []; });
  db.config = Object.assign(C.configBase(), d.config || {});
  db.config.empresa = Object.assign(C.configBase().empresa, (d.config || {}).empresa || {});
  db.config.reabastecimiento = Object.assign(C.configBase().reabastecimiento, (d.config || {}).reabastecimiento || {});
  db.seq = Object.assign(base.seq, d.seq || {});
  const bp = C.bodegaPrincipal(db.config);
  db.conteos.forEach((c) => c.lineas.forEach((l) => { if (!l.bodega) l.bodega = bp; }));
  db.movimientos.forEach((m) => { if (!m.bodega) m.bodega = bp; });
  // Datos anteriores: las bodegas eran solo nombres en la configuración.
  if (!Array.isArray(d.bodegas) || !d.bodegas.length) {
    db.bodegas = db.config.ubicaciones.map((nombre, i) => ({ id: 'b-' + i + '-' + C.nuevoId(), codigo: 'B' + (i + 1), nombre, tipo: /nevera|fr[ií]o/i.test(nombre) ? 'nevera' : /consultorio/i.test(nombre) ? 'consultorio' : 'bodega', responsable: '', sede: '', activa: true, principal: i === 0 }));
  }
  C.sincronizarBodegas(db);
  db.proveedores = db.proveedores.map(C.normalizarTercero);
  if (!Array.isArray(d.lotes)) C.ordenar(db.movimientos).forEach((m) => { if (!m.anulado) C.asegurarLotes(db, m); });
  return db;
}

function cargar() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && d.version === 1) return normalizar(d);
    }
  } catch { /* almacenamiento no disponible: se usa la demo en memoria */ }
  return crearDemo(C.todayISO());
}

function leerRuta() {
  const h = (window.location.hash || '').replace(/^#\/?/, '');
  const [vista, ...resto] = h.split('/');
  return { vista: vista || 'panel', arg: resto.join('/') ? decodeURIComponent(resto.join('/')) : '' };
}

function leerSesion() {
  try { return sessionStorage.getItem(KEY_SESION) || ''; } catch { return ''; }
}

export function StoreProvider({ children }) {
  const [db, setDb] = useState(cargar);
  const [toasts, setToasts] = useState([]);
  const [ruta, setRuta] = useState(leerRuta);
  const [sesionId, setSesionId] = useState(leerSesion);
  const hoy = C.todayISO();
  const state = useMemo(() => C.replay(db), [db]);
  const usuario = db.usuarios.length ? db.usuarios.find((u) => u.id === sesionId && u.activo !== false) || null : null;
  const requiereLogin = db.usuarios.some((u) => u.activo !== false) && !usuario;
  const nombreUsuario = usuario ? usuario.nombre : db.config.usuario || 'Usuario';

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* sin almacenamiento */ }
  }, [db]);

  useEffect(() => {
    const f = () => { setRuta(leerRuta()); window.scrollTo({ top: 0 }); };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);

  const toast = useCallback((msg, tipo = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, msg, tipo }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  /** Aplica un cambio sobre una copia de la base y deja rastro en la auditoría. */
  const commit = useCallback((mutar, accion, detalle) => {
    setDb((prev) => {
      const next = structuredClone(prev);
      mutar(next);
      next.auditoria.unshift({ ts: new Date().toISOString(), usuario: nombreUsuario, accion, detalle: detalle || '' });
      if (next.auditoria.length > 2000) next.auditoria.length = 2000;
      return next;
    });
  }, [nombreUsuario]);

  const reemplazar = useCallback((nueva, accion) => {
    const n = normalizar(nueva);
    n.auditoria.unshift({ ts: new Date().toISOString(), usuario: nombreUsuario, accion, detalle: '' });
    setDb(n);
  }, [nombreUsuario]);

  const go = useCallback((vista, arg) => {
    window.location.hash = '#/' + vista + (arg ? '/' + encodeURIComponent(arg) : '');
  }, []);

  const ingresar = useCallback((u) => {
    try { sessionStorage.setItem(KEY_SESION, u.id); } catch { /* sin almacenamiento */ }
    setSesionId(u.id);
    setDb((prev) => {
      const next = structuredClone(prev);
      next.auditoria.unshift({ ts: new Date().toISOString(), usuario: u.nombre, accion: 'Inicio de sesión', detalle: C.ROLES[u.rol] });
      return next;
    });
  }, []);
  const salir = useCallback(() => {
    try { sessionStorage.removeItem(KEY_SESION); } catch { /* sin almacenamiento */ }
    setSesionId('');
  }, []);

  const puede = useCallback((accion) => C.puede(usuario, accion), [usuario]);

  const value = { db, state, hoy, commit, reemplazar, toast, toasts, ruta, go, usuario, nombreUsuario, requiereLogin, ingresar, salir, puede };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);
export { C };
