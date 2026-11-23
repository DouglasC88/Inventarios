import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CircleAlert, CircleCheck, Info, Search, X } from 'lucide-react';

export function Panel({ title, icon: Icon, actions, sub, children, className = '', ...rest }) {
  return (
    <section className={'panel ' + className} {...rest}>
      {(title || actions) && (
        <div className="panel-head">
          {Icon && <span className="ico"><Icon size={18} /></span>}
          {title && <h2>{title}</h2>}
          {actions && <div className="actions">{actions}</div>}
        </div>
      )}
      {sub && <p className="panel-sub">{sub}</p>}
      {children}
    </section>
  );
}

export function Kpi({ label, value, sub, tone = 'cyan', icon: Icon, onClick }) {
  return (
    <div className={'panel kpi tone-' + tone} onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
      <div className="label">{Icon && <Icon size={14} />}{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
      <div className="bar" />
    </div>
  );
}

export function Chip({ tone = 'muted', dot, children, title }) {
  return <span className={'chip ' + tone} title={title}>{dot && <span className="dot" />}{children}</span>;
}

export function Btn({ variant = '', icon: Icon, children, size, className = '', ...props }) {
  return (
    <button type="button" className={['btn', variant, size, className].filter(Boolean).join(' ')} {...props}>
      {Icon && <Icon size={size === 'sm' ? 14 : 16} />}
      {children}
    </button>
  );
}

export function Modal({ open, title, icon: Icon, onClose, children, footer, wide }) {
  useEffect(() => {
    if (!open) return undefined;
    const f = (e) => e.key === 'Escape' && onClose && onClose();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose && onClose()}>
      <div className={'panel modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          {Icon && <Icon size={18} className="cyan-t" />}
          <h3>{title}</h3>
          <span style={{ flex: 1 }} />
          <Btn variant="ghost" className="icon-btn" icon={X} onClick={onClose} aria-label="Cerrar" />
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

export function Field({ label, hint, children, span, full }) {
  return (
    <div className={'field' + (span ? ' span-2' : '') + (full ? ' full' : '')}>
      {label && <label>{label}</label>}
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Errores({ lista }) {
  if (!lista || !lista.length) return null;
  return (
    <div className="errors" role="alert">
      <CircleAlert size={18} />
      <ul>{lista.map((e, i) => <li key={i}>{e}</li>)}</ul>
    </div>
  );
}

export function Nota({ children }) {
  return <div className="note"><Info size={16} /><div>{children}</div></div>;
}

export function Empty({ icon: Icon, title, text, children }) {
  return (
    <div className="empty">
      {Icon && <Icon size={38} />}
      <h4>{title}</h4>
      {text && <div>{text}</div>}
      {children && <div style={{ marginTop: 14 }}>{children}</div>}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Buscar…' }) {
  return (
    <div className="search">
      <Search size={16} />
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

export function Tabs({ value, onChange, options }) {
  return (
    <div className="tabs">
      {options.map(([k, label]) => (
        <button key={k} type="button" className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{label}</button>
      ))}
    </div>
  );
}

export function Gauge({ value, label = 'Cumplimiento' }) {
  const r = 70, c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  const color = v >= 85 ? 'var(--green)' : v >= 60 ? 'var(--amber)' : 'var(--magenta)';
  return (
    <div className="gauge">
      <svg width="170" height="170" viewBox="0 0 170 170" aria-hidden="true">
        <defs>
          <linearGradient id="gauge-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#00c2ff" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
        <circle cx="85" cy="85" r={r + 10} fill="none" stroke="rgba(34,227,255,0.12)" strokeDasharray="2 6" />
        <circle cx="85" cy="85" r={r} fill="none" stroke="rgba(14,60,120,0.08)" strokeWidth="12" />
        <circle cx="85" cy="85" r={r} fill="none" stroke="url(#gauge-grad)" strokeWidth="12" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} style={{ transition: 'stroke-dashoffset 1s ease', filter: 'drop-shadow(0 0 8px rgba(34,227,255,0.6))' }} />
      </svg>
      <div className="center"><div><b style={{ color }}>{Math.round(v)}</b><span>{label}</span></div></div>
    </div>
  );
}

export function Toasts({ items }) {
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={'toast ' + (t.tipo === 'error' ? 'error' : '')}>
          {t.tipo === 'error' ? <CircleAlert size={18} /> : <CircleCheck size={18} />}
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}
