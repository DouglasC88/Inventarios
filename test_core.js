const Core = require('/home/user/Inventarios/core.js');
let ok = 0, fail = 0;
function check(nombre, cond, extra) {
  if (cond) { ok++; console.log('  ✓', nombre); }
  else { fail++; console.log('  ✗', nombre, extra != null ? '→ ' + JSON.stringify(extra) : ''); }
}

console.log('1) Detección de delimitador y parseo CSV con comillas');
const csv = 'Producto,Cant,Precio\n"Guantes, talla M",12,5.50\nLidocaína 2%,45,12.00';
const delim = Core.detectarDelimitador(csv);
check('delimitador detectado = ","', delim === ',', delim);
const aoa = Core.parsearDelimitado(csv, delim);
const cols = Core.obtenerColumnas(aoa, true);
check('columnas = [Producto,Cant,Precio]', JSON.stringify(cols) === JSON.stringify(['Producto','Cant','Precio']), cols);
check('coma dentro de comillas respetada', aoa[1][0] === 'Guantes, talla M', aoa[1][0]);

console.log('2) Generación TXT tab-delimitado SIN encabezado');
const formato = ['descripcion','cantidad','costo'];
const mapeo = {
  descripcion: {tipo:'columna', valor:'Producto'},
  cantidad:    {tipo:'columna', valor:'Cant'},
  costo:       {tipo:'columna', valor:'Precio'}
};
const r = Core.generarSalida(aoa, cols, true, formato, mapeo, {});
const lineas = r.texto.split('\r\n');
check('2 filas de datos', r.filas === 2, r.filas);
check('sin encabezado (1ª línea son datos)', lineas[0] === 'Guantes, talla M\t12\t5.50', lineas[0]);
check('separado por TAB', lineas[1] === 'Lidocaína 2%\t45\t12.00', lineas[1]);

console.log('3) Valor fijo en una columna (ej. unidad constante)');
const r2 = Core.generarSalida(aoa, cols, true, ['descripcion','unidad'], {
  descripcion: {tipo:'columna', valor:'Producto'},
  unidad:      {tipo:'fijo', valor:'PIEZA'}
}, {});
check('valor fijo aplicado a todas las filas', r2.texto.split('\r\n').every(l => l.endsWith('\tPIEZA')), r2.texto);

console.log('4) Limpieza: tabs/saltos dentro de una celda no rompen el formato');
const sucio = [['desc'],['Algo\tcon\ttabs\ny saltos']];
const r3 = Core.generarSalida(sucio, ['desc'], true, ['descripcion'], {descripcion:{tipo:'columna',valor:'desc'}}, {});
check('celda saneada sin TAB ni saltos', r3.texto === 'Algo con tabs y saltos', r3.texto);

console.log('5) Filas totalmente vacías se omiten');
const conVacias = [['a'],['x'],[''],['  '],['y']];
const r4 = Core.generarSalida(conVacias, ['a'], true, ['c'], {c:{tipo:'columna',valor:'a'}}, {});
check('2 filas con dato, 2 vacías omitidas', r4.filas === 2 && r4.vacias === 2, {filas:r4.filas, vacias:r4.vacias});

console.log('6) Codificación Windows-1252 (acentos y ñ)');
const bytes = Core.codificar('ñáé', 'windows-1252');
check('ñ=0xF1, á=0xE1, é=0xE9', bytes[0]===0xF1 && bytes[1]===0xE1 && bytes[2]===0xE9, Array.from(bytes));
const u8 = Core.codificar('ñ', 'utf-8');
check('UTF-8 de ñ = [0xC3,0xB1]', u8[0]===0xC3 && u8[1]===0xB1, Array.from(u8));

console.log('7) Detección de TAB y ; en archivos TXT/CSV europeos');
check('detecta TAB', Core.detectarDelimitador('a\tb\tc\n1\t2\t3') === '\t');
check('detecta ;',   Core.detectarDelimitador('a;b;c\n1;2;3') === ';');

console.log('\nRESULTADO:', ok, 'OK,', fail, 'fallos');
process.exit(fail === 0 ? 0 : 1);
