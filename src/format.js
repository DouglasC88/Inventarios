const fmtCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const fmtCOP2 = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNum = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });

export const money = (n) => fmtCOP.format(Math.round(Number(n) || 0));
export const money2 = (n) => fmtCOP2.format(Number(n) || 0);
export const num = (n) => fmtNum.format(Number(n) || 0);
export const pct = (n, d = 1) => (Number(n) || 0).toFixed(d) + ' %';
export const fecha = (iso) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '—');
export const fechaHora = (iso) => (iso ? fecha(iso) + ' ' + String(iso).slice(11, 16) : '—');

export function descargar(nombre, contenido, tipo = 'text/csv;charset=utf-8') {
  const blob = new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const SEMAFORO = {
  vencido: { tono: 'magenta', texto: 'Vencido' },
  rojo: { tono: 'red', texto: 'Rojo' },
  amarillo: { tono: 'amber', texto: 'Amarillo' },
  verde: { tono: 'green', texto: 'Verde' },
  na: { tono: 'muted', texto: 'Sin fecha' }
};
export const INVIMA = {
  vigente: { tono: 'green', texto: 'Vigente' },
  porVencer: { tono: 'amber', texto: 'Por vencer' },
  vencido: { tono: 'magenta', texto: 'Vencido' },
  sin: { tono: 'red', texto: 'Sin registro' },
  na: { tono: 'muted', texto: 'No aplica' }
};
export const TONO_MOV = { entrada: 'green', salida: 'cyan', ajuste: 'violet', baja: 'magenta' };
