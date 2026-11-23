// Prueba de regresión en navegador real (Playwright): recorre las pantallas y los flujos principales.
// Uso: npm run build && npx vite preview --port 4173 & node tests/e2e/regresion.cjs [url]
const { chromium } = require('playwright');
(async () => {
  const URL = process.argv[2] || 'http://localhost:4173/';
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const err = []; p.on('pageerror', e => err.push(e.message)); p.on('console', m => { if (m.type() === 'error') err.push('console: ' + m.text()); });
  const res = async (n) => { await p.waitForTimeout(450); console.log(n.padEnd(28), '|', (await p.locator('.toast').allTextContents()).slice(-1)[0] || '-', '|', (await p.locator('.modal .errors').allTextContents()).join(' / ').slice(0, 200) || '-'); };
  const combo = async (loc, txt) => { const h = await loc.elementHandle(); await h.click(); await h.fill(txt); await p.waitForTimeout(150); await p.keyboard.press('Enter'); await p.waitForTimeout(100); };
  await p.goto(URL); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.fill('input[autocomplete=username]', 'admin'); await p.fill('input[type=password]', '1234'); await p.click('button[type=submit]'); await p.waitForTimeout(600);
  const vistas = ['panel','guia','entradas','salidas','traslados','requisiciones','devoluciones','ajustes','conteos','ordenes','reabastecimiento','existencias','kardex','kardex/p1','vencimientos','trazabilidad','frio','reportes/abc','reportes/libro','cierres','bodegas','grupos','productos','lotes','kits','terceros','normativa','importar','usuarios','config'];
  for (const v of vistas) { await p.goto(URL + '#/' + v); await p.waitForTimeout(150); }
  console.log('pantallas recorridas'.padEnd(28), '|', vistas.length);
  // Lote previo + entrada con ese lote
  await p.goto(URL + '#/lotes/nuevo'); await p.waitForTimeout(250);
  await combo(p.locator('.modal .combo input').first(), 'IMP-410');
  await p.locator('.modal input.mono').first().fill('IM-PRE-01');
  await p.locator('.modal input[type=date]').nth(0).fill('2026-06-01'); await p.locator('.modal input[type=date]').nth(1).fill('2031-05-31');
  await p.click('.modal-foot >> text=Guardar'); await res('lote nuevo');
  const TERCERO = '.modal input[placeholder^="Escriba el NIT"]';
  await p.goto(URL + '#/entradas/nuevo'); await p.waitForTimeout(250);
  await combo(p.locator(TERCERO), '830987');
  await p.locator('.modal input.mono').first().fill('OS-123456');
  let f = p.locator('.modal .lines tbody tr').first();
  await combo(f.locator('.combo input'), 'IMP-410'); await f.locator('input.mono').fill('IM-PRE-01');
  console.log('vence autocompletado'.padEnd(28), '|', await f.locator('input[type=date]').inputValue());
  await f.locator('input[type=number]').nth(0).fill('3'); await f.locator('input[type=number]').nth(1).fill('420000');
  await p.click('text=Registrar entrada'); await res('entrada');
  // Orden + recepción
  await p.goto(URL + '#/ordenes/nuevo'); await p.waitForTimeout(250);
  await combo(p.locator(TERCERO), 'Andina');
  f = p.locator('.modal .lines tbody tr').first();
  await combo(f.locator('.combo input'), 'guantes'); await f.locator('input[type=number]').nth(0).fill('10'); await f.locator('input[type=number]').nth(1).fill('21000');
  await p.click('text=Crear orden'); await res('orden de compra');
  // Salida con kit
  await p.goto(URL + '#/salidas/nuevo'); await p.waitForTimeout(250);
  await p.locator('.modal input[placeholder="HC o documento del paciente"]').fill('HC-55555');
  await combo(p.locator('.modal input[placeholder^="Escriba el servicio"]'), 'Resina');
  await p.click('text=Agregar insumos del servicio'); await p.waitForTimeout(150);
  await p.click('text=Registrar salida'); await res('salida con kit');
  // Traslado
  await p.goto(URL + '#/traslados/nuevo'); await p.waitForTimeout(250);
  f = p.locator('.modal .lines tbody tr').first();
  await combo(f.locator('.combo input'), 'guantes'); await f.locator('input[type=number]').first().fill('2');
  await p.click('text=Registrar traslado'); await res('traslado');
  // Requisición atendida
  await p.goto(URL + '#/requisiciones'); await p.waitForTimeout(250);
  await p.locator('.tbl tbody tr').first().locator('button').click(); await p.waitForTimeout(150);
  await p.click('text=Atender con traslado'); await p.waitForTimeout(250);
  await p.click('.modal-foot >> text=Registrar traslado'); await res('atender requisición');
  // Devolución
  await p.goto(URL + '#/devoluciones/nuevo'); await p.waitForTimeout(250);
  await combo(p.locator(TERCERO), 'Andina');
  await p.locator('.modal select:has(option[value="calidad"])').selectOption('calidad');
  await p.locator('.modal input.mono').first().fill('NC-777');
  await combo(p.locator('.modal .lines input[placeholder^="Escriba el lote"]'), 'IV-5520');
  await p.locator('.modal .lines input[type=number]').first().fill('1');
  await p.click('text=Registrar devolución'); await res('devolución');
  // Cuarentena bloquea salida
  await p.goto(URL + '#/salidas/nuevo'); await p.waitForTimeout(250);
  await combo(p.locator('.modal .form-grid input[placeholder^="Escriba la bodega"]').first(), 'Nevera');
  await p.locator('.modal input[placeholder="HC o documento del paciente"]').fill('HC-1');
  await combo(p.locator('.modal .lines .combo input').first(), 'ADH-UNI'); await p.locator('.modal .lines input[type=number]').first().fill('1');
  await p.click('text=Registrar salida'); await res('cuarentena (debe fallar)');
  await p.keyboard.press('Escape');
  // Bodega y grupo
  await p.goto(URL + '#/bodegas/nuevo'); await p.waitForTimeout(250);
  await p.locator('.modal input').nth(0).fill('C3'); await p.locator('.modal input').nth(1).fill('Consultorio 3');
  await p.click('.modal-foot >> text=Guardar'); await res('bodega');
  await p.goto(URL + '#/grupos/nuevo'); await p.waitForTimeout(250);
  await p.locator('.modal input.mono').fill('08'); await p.locator('.modal input[placeholder="Ej.: Endodoncia"]').fill('Endodoncia');
  await p.click('.modal-foot >> text=Guardar'); await res('línea de clasificación');
  await p.goto(URL + '#/grupos'); await p.waitForTimeout(250);
  await p.locator('.tbl tbody tr', { hasText: 'Endodoncia' }).locator('button', { hasText: 'Grupo' }).click(); await p.waitForTimeout(200);
  await p.locator('.modal input.mono').fill('0801'); await p.locator('.modal input[placeholder="Ej.: Endodoncia"]').fill('Limas');
  await p.click('.modal-foot >> text=Guardar'); await res('grupo dentro de la línea');
  await p.goto(URL + '#/productos'); await p.waitForTimeout(250);
  await combo(p.locator('.toolbar .combo input').first(), 'Anestesia');
  console.log('productos de línea Anestesia'.padEnd(28), '|', await p.locator('.tbl tbody tr').count());
  // Reportes
  await p.goto(URL + '#/reportes'); await p.waitForTimeout(300);
  console.log('reportes en catálogo'.padEnd(28), '|', await p.locator('.rep-item').count());
  for (const r of ['existencias-bodega', 'valorizado-clasificacion', 'existencias-lote', 'libro', 'compras-proveedor', 'consumo-producto', 'consumo-procedimiento', 'por-vencer', 'abc', 'auditoria']) {
    await p.goto(URL + '#/reportes/' + r); await p.waitForTimeout(300);
    console.log(('reporte ' + r).padEnd(28), '|', await p.locator('.tbl tbody tr').count(), 'filas');
  }
  await p.goto(URL + '#/reportes/kardex'); await p.waitForTimeout(300);
  await combo(p.locator('.rep-filtros .combo input').first(), 'RES-A3'); await p.waitForTimeout(300);
  console.log('reporte kardex RES-A3'.padEnd(28), '|', await p.locator('.tbl tbody tr').count(), 'filas');
  // Menú por módulos
  console.log('módulos en el menú'.padEnd(28), '|', await p.locator('.nav a').count(), '| pestañas en Operaciones:', (await (async () => { await p.goto(URL + '#/entradas'); await p.waitForTimeout(200); return p.locator('.modtabs a').count(); })()));
  // Producto nuevo con lotes y existencia inicial
  await p.goto(URL + '#/productos/nuevo'); await p.waitForTimeout(300);
  await p.locator('.modal input.mono').first().fill('GAS-10');
  await p.locator('.modal .field:has(label:text-is("Nombre o descripción")) input').fill('Gasas estériles x10');
  await p.click('.modal >> text=Agregar lote'); await p.waitForTimeout(100);
  await p.click('.modal >> text=Agregar lote'); await p.waitForTimeout(100);
  const fl = p.locator('.modal .lines tbody tr');
  for (const [i, lote, vence, cant] of [[0, 'GZ-01', '2028-01-31', '20'], [1, 'GZ-02', '2028-06-30', '10']]) {
    await fl.nth(i).locator('input.mono').fill(lote); await fl.nth(i).locator('input[type=date]').nth(1).fill(vence);
    await fl.nth(i).locator('input[type=number]').nth(0).fill(cant); await fl.nth(i).locator('input[type=number]').nth(1).fill('1500');
  }
  await p.click('.modal-foot >> text=Guardar'); await res('producto con 2 lotes');
  await p.goto(URL + '#/existencias/q:GAS-10'); await p.waitForTimeout(300);
  console.log('existencia GAS-10'.padEnd(28), '|', await p.locator('.prod-card .pc-stock b').first().textContent());
  // Inventario físico desde Excel
  const fs = require('fs'); const os = require('os'); const path = require('path');
  const csv = path.join(os.tmpdir(), 'conteo-prueba.csv');
  fs.writeFileSync(csv, 'Código;Bodega;Lote;Vencimiento;Cantidad contada;Costo unitario (solo lotes nuevos)\nGAS-10;Bodega principal;GZ-01;;18\nGAS-10;Bodega principal;GZ-02;;10\nGAS-10;Bodega principal;GZ-03;2029-03-31;5;1600\n');
  await p.goto(URL + '#/conteos/excel'); await p.waitForTimeout(300);
  await p.setInputFiles('.modal input[type=file]', csv); await p.waitForTimeout(500);
  console.log('excel: diferencias'.padEnd(28), '|', await p.locator('.modal .kv div:has(span:text-is("Con diferencia")) b').textContent(), '| nuevos', await p.locator('.modal .kv div:has(span:text-is("Lotes nuevos")) b').textContent());
  await p.click('text=Crear conteo con estas cantidades'); await p.waitForTimeout(500);
  await p.locator('.modal .form-grid input').nth(0).fill('ACTA-FIS-1'); await p.locator('.modal .form-grid input').nth(1).fill('Gerencia');
  await p.click('text=Aplicar conteo'); await res('aplicar conteo de Excel');
  await p.goto(URL + '#/existencias/q:GAS-10'); await p.waitForTimeout(300);
  console.log('GAS-10 tras conteo'.padEnd(28), '|', await p.locator('.prod-card .pc-stock b').first().textContent(), '(esperado 33)');
  // Inicio, contabilidad y ayuda
  await p.goto(URL + '#/inicio'); await p.waitForTimeout(300);
  console.log('íconos en inicio'.padEnd(28), '|', await p.locator('.tile').count());
  await p.goto(URL + '#/comprobantes'); await p.waitForTimeout(300);
  console.log('comprobantes del mes'.padEnd(28), '|', await p.locator('.tbl tbody tr').count(), '| descuadrados', await p.locator('.kpi', { hasText: 'Descuadrados' }).locator('.value').textContent());
  await p.goto(URL + '#/conciliacion'); await p.waitForTimeout(300);
  console.log('conciliación kardex vs PUC'.padEnd(28), '|', await p.locator('.kpi', { hasText: 'Diferencia' }).locator('.value').textContent());
  await p.goto(URL + '#/ayuda'); await p.waitForTimeout(300);
  await p.locator('.search input').fill('tercero'); await p.waitForTimeout(200);
  console.log('ayuda "tercero"'.padEnd(28), '|', await p.locator('.law .panel h3').allTextContents());
  // Conteo + cierre
  await p.goto(URL + '#/conteos'); await p.waitForTimeout(250);
  await p.click('text=Nuevo conteo'); await p.click('text=Abrir conteo'); await p.waitForTimeout(300);
  await p.locator('.tbl tbody tr').first().locator('button').click(); await p.waitForTimeout(250);
  const ins = p.locator('.modal .lines input[type=number]'); const n = await ins.count();
  const sis = await p.locator('.modal .lines tbody tr td:nth-child(5)').allTextContents();
  for (let i = 0; i < n; i++) await ins.nth(i).fill(String(Number(sis[i].replace(/\./g, '').replace(',', '.'))));
  await p.click('text=Aplicar conteo'); await res('conteo sin diferencias');
  await p.goto(URL + '#/cierres'); await p.waitForTimeout(250);
  await p.click('text=Nuevo cierre'); await p.waitForTimeout(250); await p.click('.modal-foot >> text=Cerrar periodo'); await res('cierre');
  // Roles
  await p.click('button[title="Cerrar sesión"]'); await p.waitForTimeout(250);
  await p.fill('input[autocomplete=username]', 'consultorio1'); await p.fill('input[type=password]', '3333'); await p.click('button[type=submit]'); await p.waitForTimeout(400);
  console.log('consultorio sin config'.padEnd(28), '|', !(await p.locator('.nav a').allTextContents()).some((t) => /Configuración|Usuarios/.test(t)));
  console.log('ERRORES'.padEnd(28), '|', err);
  await b.close();
})();
