import { useEffect, useMemo, useState } from 'react';
import { C } from '../store.jsx';
import Combo from './Combo.jsx';
import { Field } from './ui.jsx';

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

// Estados y ciudades de cada país: se descargan solo cuando se elige el país (public/geo/XX.json).
const cache = {};
export function cargarGeo(pais) {
  if (!pais) return Promise.resolve(null);
  if (!cache[pais]) {
    cache[pais] = fetch(import.meta.env.BASE_URL + 'geo/' + pais + '.json')
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => { delete cache[pais]; return null; });
  }
  return cache[pais];
}
function useGeo(pais) {
  const [d, setD] = useState({ pais: null, datos: null });
  useEffect(() => {
    let vivo = true;
    cargarGeo(pais).then((x) => { if (vivo) setD({ pais, datos: x }); });
    return () => { vivo = false; };
  }, [pais]);
  return d.pais === pais ? d.datos : null;
}

const PAIS_OPC = C.PAISES.map(([c, n]) => ({ value: c, label: n, search: c }));

/**
 * País › departamento o estado › ciudad, con búsqueda. En Colombia guarda los códigos DANE (DIVIPOLA),
 * que piden la factura electrónica y los RIPS.
 * v: { pais, paisCodigo, departamento, departamentoCodigo, ciudad, ciudadCodigo }
 */
export default function Ubicacion({ v, onChange, obligatorio = true }) {
  const paisCodigo = v.paisCodigo || (C.PAISES.find(([, n]) => norm(n) === norm(v.pais)) || [])[0] || '';
  const geo = useGeo(paisCodigo);
  const co = paisCodigo === 'CO';
  const estados = geo ? geo.estados : [];
  const depCod = v.departamentoCodigo || (estados.find(([, n]) => norm(n) === norm(v.departamento)) || [])[0] || '';
  const ciudades = geo ? geo.ciudades : [];
  // Clave de cada ciudad: en Colombia el código DANE del municipio; en otros países nombre + estado.
  const clave = (c) => (co ? c[2] : c[0] + '|' + c[1]);
  const ciuOpc = useMemo(() => {
    const nombreEstado = Object.fromEntries(estados);
    return ciudades.filter((c) => !depCod || c[1] === depCod)
      .map((c) => ({ value: clave(c), label: c[0], sub: [nombreEstado[c[1]], co ? 'DANE ' + c[2] : ''].filter(Boolean).join(' · ') }));
  }, [geo, depCod]);
  const porNombre = v.ciudad ? ciudades.find((c) => norm(c[0]) === norm(v.ciudad) && (!depCod || c[1] === depCod)) : null;
  const ciuCod = co && v.ciudadCodigo ? v.ciudadCodigo : porNombre ? clave(porNombre) : '';
  const estOpc = estados.map(([c, n]) => ({ value: c, label: n, sub: co ? 'Código DANE ' + c : '' }));

  const elegirPais = (c) => {
    const n = (C.PAISES.find((x) => x[0] === c) || [])[1] || c;
    onChange({ pais: n, paisCodigo: c, departamento: '', departamentoCodigo: '', ciudad: '', ciudadCodigo: '', extranjero: c !== 'CO' });
  };
  const elegirEstado = (c) => {
    const n = (estados.find((x) => x[0] === c) || [])[1] || '';
    onChange({ departamento: n, departamentoCodigo: c, ciudad: '', ciudadCodigo: '' });
  };
  const elegirCiudad = (k) => {
    const c = ciudades.find((x) => clave(x) === k);
    if (!c) return;
    const est = estados.find((x) => x[0] === c[1]);
    onChange({ ciudad: c[0], ciudadCodigo: co ? c[2] : '', departamento: est ? est[1] : v.departamento, departamentoCodigo: est ? est[0] : v.departamentoCodigo });
  };
  const req = obligatorio ? ' *' : '';
  const grande = ciuOpc.length > 300;
  return (
    <>
      <Field label="País">
        <Combo value={paisCodigo} onChange={elegirPais} options={PAIS_OPC} placeholder="Escriba el país…" textoLibre={v.pais} />
      </Field>
      <Field label={(co ? 'Departamento' : 'Estado o provincia') + (co ? req : '')}>
        {estados.length
          ? <Combo value={depCod} onChange={elegirEstado} options={estOpc} placeholder={co ? 'Escriba el departamento…' : 'Escriba el estado…'} textoLibre={v.departamento}
              onCreate={co ? undefined : (q) => onChange({ departamento: q, departamentoCodigo: '' })} createLabel="Usar lo escrito" />
          : <input className="input" value={v.departamento || ''} onChange={(e) => onChange({ departamento: e.target.value, departamentoCodigo: '' })} placeholder={paisCodigo && !geo ? 'Cargando…' : ''} />}
      </Field>
      <Field label={(co ? 'Ciudad o municipio' : 'Ciudad') + req} hint={co ? (v.ciudadCodigo ? 'Código DANE ' + v.ciudadCodigo : 'Municipios DIVIPOLA del DANE') : (grande ? 'Escriba al menos 3 letras · ' : '') + 'Fuente: GeoNames (CC BY 4.0)'}>
        {ciudades.length
          ? <Combo value={ciuCod} onChange={elegirCiudad} options={ciuOpc} minimo={grande ? 3 : 0} placeholder={depCod || !co ? 'Escriba la ciudad…' : 'Escriba el municipio…'} textoLibre={v.ciudad}
              onCreate={co ? undefined : (q) => onChange({ ciudad: q, ciudadCodigo: '' })} createLabel="Usar lo escrito" />
          : <input className="input" value={v.ciudad || ''} onChange={(e) => onChange({ ciudad: e.target.value, ciudadCodigo: '' })} />}
      </Field>
    </>
  );
}
