// Prueba de regresión en navegador real (Playwright): recorre las pantallas y los flujos principales.
// Uso: npm run build && npx vite preview --port 4173 & node tests/e2e/regresion.cjs [url]
const { chromium } = require('playwright');
(async () => {
  const URL = process.argv[2] || 'http://localhost:4173/';
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const err = []; p.on('pageerror', e => err.push(e.message)); p.on('console', m => { if (m.type() === 'error') err.push('console: ' + m.text()); });
  const res = async (n) => { await p.waitForTimeout(450); console.log(n.padEnd(28), '|', (await p.locator('.toast').allTextContents()).slice(-1)[0] || '-', '|', (await p.locator('.modal .errors').allTextContents()).join(' / ').slice(0, 200) || '-'); };
  const combo = async (loc, txt) => { await loc.click(); await loc.fill(txt); await p.waitForTimeout(150); await p.keyboard.press('Enter'); await p.waitForTimeout(100); };
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
  await p.goto(URL + '#/entradas/nuevo'); await p.waitForTimeout(250);
  await combo(p.locator('.modal .combo input').first(), '830987');
  await p.locator('.modal input.mono').first().fill('OS-123456');
  let f = p.locator('.modal .lines tbody tr').first();
  await combo(f.locator('.combo input'), 'IMP-410'); await f.locator('input.mono').fill('IM-PRE-01');
  console.log('vence autocompletado'.padEnd(28), '|', await f.locator('input[type=date]').inputValue());
  await f.locator('input[type=number]').nth(0).fill('3'); await f.locator('input[type=number]').nth(1).fill('420000');
  await p.click('text=Registrar entrada'); await res('entrada');
  // Orden + recepción
  await p.goto(URL + '#/ordenes/nuevo'); await p.waitForTimeout(250);
  await combo(p.locator('.modal .combo input').first(), 'Andina');
  f = p.locator('.modal .lines tbody tr').first();
  await combo(f.locator('.combo input'), 'guantes'); await f.locator('input[type=number]').nth(0).fill('10'); await f.locator('input[type=number]').nth(1).fill('21000');
  await p.click('text=Crear orden'); await res('orden de compra');
  // Salida con kit
  await p.goto(URL + '#/salidas/nuevo'); await p.waitForTimeout(250);
  await p.locator('.modal .form-grid input').nth(1).fill('HC-55555');
  await p.locator('.modal .toolbar select').first().selectOption({ index: 1 });
  await p.click('text=Agregar insumos del kit'); await p.waitForTimeout(150);
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
  await combo(p.locator('.modal .combo input').first(), 'Andina');
  await p.locator('.modal .form-grid select').nth(1).selectOption('calidad');
  await p.locator('.modal input.mono').first().fill('NC-777');
  await p.locator('.modal .lines select').first().selectOption({ index: 1 });
  await p.locator('.modal .lines input[type=number]').first().fill('1');
  await p.click('text=Registrar devolución'); await res('devolución');
  // Cuarentena bloquea salida
  await p.goto(URL + '#/salidas/nuevo'); await p.waitForTimeout(250);
  await p.locator('.modal .form-grid select').first().selectOption('Nevera de insumos');
  await p.locator('.modal .form-grid input').nth(1).fill('HC-1');
  await combo(p.locator('.modal .lines .combo input').first(), 'ADH-UNI'); await p.locator('.modal .lines input[type=number]').first().fill('1');
  await p.click('text=Registrar salida'); await res('cuarentena (debe fallar)');
  await p.keyboard.press('Escape');
  // Bodega y grupo
  await p.goto(URL + '#/bodegas/nuevo'); await p.waitForTimeout(250);
  await p.locator('.modal input').nth(0).fill('C3'); await p.locator('.modal input').nth(1).fill('Consultorio 3');
  await p.click('.modal-foot >> text=Guardar'); await res('bodega');
  await p.goto(URL + '#/grupos/nuevo'); await p.waitForTimeout(250);
  await p.locator('.modal input').nth(0).fill('END'); await p.locator('.modal input').nth(1).fill('Endodoncia');
  await p.click('.modal-foot >> text=Guardar'); await res('grupo');
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
