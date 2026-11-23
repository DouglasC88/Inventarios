import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as C from './core/core.js';
import { crearDemo } from './core/demo.js';

const KEY = 'nova-inventario:db:v1';
const Ctx = createContext(null);

function normalizar(d) {
  const base = C.dbVacia();
  const db = Object.assign(base, d);
  db.config = Object.assign(C.configBase(), d.config || {});
  db.config.empresa = Object.assign(C.configBase().empresa, (d.config || {}).empresa || {});
  db.seq = Object.assign(base.seq, d.seq || {});
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

export function StoreProvider({ children }) {
  const [db, setDb] = useState(cargar);
  const [toasts, setToasts] = useState([]);
  const [ruta, setRuta] = useState(leerRuta);
  const hoy = C.todayISO();
  const state = useMemo(() => C.replay(db), [db]);

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
      next.auditoria.unshift({ ts: new Date().toISOString(), usuario: next.config.usuario || 'Usuario', accion, detalle: detalle || '' });
      if (next.auditoria.length > 1500) next.auditoria.length = 1500;
      return next;
    });
  }, []);

  const reemplazar = useCallback((nueva, accion) => {
    const n = normalizar(nueva);
    n.auditoria.unshift({ ts: new Date().toISOString(), usuario: n.config.usuario || 'Usuario', accion, detalle: '' });
    setDb(n);
  }, []);

  const go = useCallback((vista, arg) => {
    window.location.hash = '#/' + vista + (arg ? '/' + encodeURIComponent(arg) : '');
  }, []);

  const value = { db, state, hoy, commit, reemplazar, toast, toasts, ruta, go };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);
export { C };
