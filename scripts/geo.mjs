// Genera los catálogos geográficos (país › departamento o estado › ciudad) que usan los formularios.
// Fuentes (se leen como datos, sin ejecutar su código):
//   - Colombia: DIVIPOLA del DANE (paquete npm "divipola", MIT): departamentos y municipios con su código.
//   - Resto del mundo: GeoNames (paquete npm "cities.json", CC BY 4.0): estados (admin1) y ciudades.
// Uso: node scripts/geo.mjs <ruta divipola/index.js> <ruta cities.json/admin1.json> <ruta cities.json/cities.json>
import fs from 'node:fs';
import path from 'node:path';

const [dvPath, a1Path, cPath] = process.argv.slice(2);
if (!dvPath || !a1Path || !cPath) { console.error('Faltan las rutas de los datos.'); process.exit(1); }
const salida = path.resolve('public/geo');
fs.mkdirSync(salida, { recursive: true });

// Departamentos de Colombia con su código DANE y el nombre que usa el sistema.
const DEPTOS = {
  '05': 'Antioquia', '08': 'Atlántico', '11': 'Bogotá D.C.', '13': 'Bolívar', '15': 'Boyacá', '17': 'Caldas', '18': 'Caquetá', '19': 'Cauca', '20': 'Cesar',
  '23': 'Córdoba', '25': 'Cundinamarca', '27': 'Chocó', '41': 'Huila', '44': 'La Guajira', '47': 'Magdalena', '50': 'Meta', '52': 'Nariño', '54': 'Norte de Santander',
  '63': 'Quindío', '66': 'Risaralda', '68': 'Santander', '70': 'Sucre', '73': 'Tolima', '76': 'Valle del Cauca', '81': 'Arauca', '85': 'Casanare', '86': 'Putumayo',
  '88': 'San Andrés y Providencia', '91': 'Amazonas', '94': 'Guainía', '95': 'Guaviare', '97': 'Vaupés', '99': 'Vichada'
};
const MENORES = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'en']);
const titulo = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim().split(' ')
  .map((w, i) => (i > 0 && MENORES.has(w) ? w : w.replace(/^(\(?)(\p{L})/u, (m, a, b) => a + b.toUpperCase()))).join(' ');

// --- Colombia (DIVIPOLA)
const txt = fs.readFileSync(dvPath, 'utf8');
const re = /\{\s*mpioCode:\s*'(\d{5})',\s*mpioName:\s*'([^']*)',\s*deptoName:\s*'([^']*)'\s*\}/g;
const munis = [];
let m;
while ((m = re.exec(txt))) munis.push([m[1], m[2]]);
if (munis.length < 1100) throw new Error('DIVIPOLA incompleto: ' + munis.length);
const nombreMuni = (cod, n) => (cod === '11001' ? 'Bogotá D.C.' : titulo(n.replace(/\.\s*D\.C\.?$/i, '').replace(/\s*\.\s*/g, ', ')));
const co = {
  fuente: 'DIVIPOLA - DANE',
  estados: Object.entries(DEPTOS).sort((a, b) => a[1].localeCompare(b[1], 'es')),
  ciudades: munis.map(([cod, n]) => [nombreMuni(cod, n), cod.slice(0, 2), cod]).sort((a, b) => a[0].localeCompare(b[0], 'es'))
};
fs.writeFileSync(path.join(salida, 'CO.json'), JSON.stringify(co));

// --- Resto del mundo (GeoNames)
const admin1 = JSON.parse(fs.readFileSync(a1Path, 'utf8'));
const ciudades = JSON.parse(fs.readFileSync(cPath, 'utf8'));
const porPais = {};
const pais = (c) => (porPais[c] = porPais[c] || { estados: new Map(), ciudades: new Map() });
admin1.forEach((a) => { const [c, cod] = a.code.split('.'); pais(c).estados.set(cod, a.name); });
ciudades.forEach((x) => { const p = pais(x.country); const k = x.name + '|' + (x.admin1 || ''); if (!p.ciudades.has(k)) p.ciudades.set(k, [x.name, x.admin1 || '']); });
const nombres = new Intl.DisplayNames(['es'], { type: 'region' });
const paises = [];
Object.entries(porPais).forEach(([c, p]) => {
  let n; try { n = nombres.of(c); } catch { n = c; }
  if (!n || n === c) return;
  paises.push([c, n]);
  if (c === 'CO') return;
  fs.writeFileSync(path.join(salida, c + '.json'), JSON.stringify({
    fuente: 'GeoNames (CC BY 4.0)',
    estados: [...p.estados.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es')),
    ciudades: [...p.ciudades.values()].sort((a, b) => a[0].localeCompare(b[0], 'es'))
  }));
});
if (!paises.some((x) => x[0] === 'CO')) paises.push(['CO', 'Colombia']);
paises.sort((a, b) => a[1].localeCompare(b[1], 'es'));
fs.writeFileSync(path.resolve('src/core/paises.js'),
  '// Generado por scripts/geo.mjs. Países (ISO 3166-1 alfa-2) con su nombre en español.\nexport const PAISES = ' + JSON.stringify(paises) + ';\n');
console.log('Países', paises.length, '· municipios de Colombia', co.ciudades.length);
