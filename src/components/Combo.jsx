import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Plus, Search } from 'lucide-react';

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Campo de búsqueda con lista: se puede escribir (código, nombre, NIT…) o desplegar.
 * options: [{ value, label, sub, search }]
 */
export default function Combo({ value, onChange, options, placeholder = 'Escriba para buscar…', autoFocus, onCreate, createLabel = 'Crear nuevo', disabled, width }) {
  const ref = useRef(null);
  const listRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [act, setAct] = useState(0);
  const [pos, setPos] = useState(null);
  const sel = options.find((o) => o.value === value) || null;

  const palabras = norm(q).split(/\s+/).filter(Boolean);
  const filtradas = (palabras.length
    ? options.filter((o) => { const t = norm(o.label + ' ' + (o.sub || '') + ' ' + (o.search || '')); return palabras.every((w) => t.includes(w) || t.replace(/[.\-\s]/g, '').includes(w.replace(/[.\-\s]/g, ''))); })
    : options).slice(0, 80);

  const medir = () => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const abajo = window.innerHeight - r.bottom;
    const alto = Math.min(320, Math.max(160, abajo - 16));
    const arriba = abajo < 200 && r.top > abajo;
    setPos({ left: r.left, width: Math.max(r.width, 300), top: arriba ? undefined : r.bottom + 4, bottom: arriba ? window.innerHeight - r.top + 4 : undefined, maxHeight: arriba ? Math.min(320, r.top - 16) : alto });
  };
  useLayoutEffect(() => { if (open) medir(); }, [open, q]);
  useEffect(() => {
    if (!open) return undefined;
    const f = () => medir();
    const fuera = (e) => { if (!ref.current?.contains(e.target) && !listRef.current?.contains(e.target)) { setOpen(false); setQ(''); } };
    window.addEventListener('resize', f);
    window.addEventListener('scroll', f, true);
    document.addEventListener('mousedown', fuera);
    return () => { window.removeEventListener('resize', f); window.removeEventListener('scroll', f, true); document.removeEventListener('mousedown', fuera); };
  }, [open]);
  useEffect(() => { setAct(0); }, [q]);

  const elegir = (o) => { onChange(o.value); setOpen(false); setQ(''); };
  const tecla = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setAct((a) => Math.min(a + 1, filtradas.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAct((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { if (open && filtradas[act]) { e.preventDefault(); elegir(filtradas[act]); } }
    else if (e.key === 'Escape') { if (open) { e.stopPropagation(); setOpen(false); setQ(''); } }
  };

  return (
    <div className="combo" ref={ref} style={width ? { width } : undefined}>
      <Search size={14} className="combo-ico" />
      <input
        className="input combo-input"
        value={open ? q : sel ? sel.label : ''}
        placeholder={sel && open ? sel.label : placeholder}
        onFocus={() => { setOpen(true); }}
        onClick={() => setOpen(true)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onKeyDown={tecla}
        autoFocus={autoFocus}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
      />
      <ChevronDown size={14} className="combo-chev" onMouseDown={(e) => { e.preventDefault(); if (!disabled) setOpen((o) => !o); }} />
      {open && pos && createPortal(
        <div className="combo-list" ref={listRef} style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }} role="listbox">
          {filtradas.map((o, i) => (
            <div key={o.value} className={'combo-opt' + (i === act ? ' act' : '') + (o.value === value ? ' sel' : '')}
              onMouseDown={(e) => { e.preventDefault(); elegir(o); }} onMouseEnter={() => setAct(i)} role="option" aria-selected={o.value === value}>
              <div className="l">{o.label}</div>
              {o.sub && <div className="s">{o.sub}</div>}
            </div>
          ))}
          {!filtradas.length && <div className="combo-empty">Sin resultados para "{q}"</div>}
          {onCreate && (
            <div className="combo-opt create" onMouseDown={(e) => { e.preventDefault(); setOpen(false); onCreate(q); setQ(''); }}>
              <Plus size={14} /> {createLabel}{q ? ': "' + q + '"' : ''}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
