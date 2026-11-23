import { useRef, useState } from 'react';
import { Contact, Download, FileSpreadsheet, ListTree, Upload } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { Btn, Chip, Empty, Errores, Field, Nota, Panel, Tabs } from '../components/ui.jsx';
import { descargar, fecha, money, num } from '../format.js';

export const PLANTILLA = [
  ['Código', 'Código alterno', 'Nombre', 'Categoría', 'Tipo de material', 'Clasificación', 'Grupo', 'Marca', 'Referencia', 'Fabricante', 'Presentación', 'Unidad', 'Unidad de compra', 'Factor', 'Stock mínimo', 'Stock máximo', 'Proveedor', 'Días de entrega', 'Tarifa IVA', 'Precio de venta', 'Ubicación física', 'Registro INVIMA', 'Vence INVIMA', 'Riesgo', 'GTIN', 'Principio activo', 'Concentración', 'Forma farmacéutica', 'CUM', 'Cadena de frío', 'Implantable', 'Bodega', 'Lote', 'Vencimiento', 'Cantidad', 'Costo unitario'],
  ['GUA-NIT-M', '', 'Guantes de nitrilo talla M, caja x100', 'Dispositivo médico', 'Insumo consumible', 'Insumo', 'Guantes', 'Marca B', 'NIT-M-100', 'Fabricante de ejemplo', 'Caja x100', 'caja', 'caja', '1', '15', '60', '900123456', '3', '19', '', 'Estante B-2', 'INVIMA 2019DM-0004567', '2028-01-31', 'I', '', '', '', '', '', 'No', 'No', 'Bodega principal', 'GN-7781', '2027-12-31', '20', '21000'],
  ['LID-2E', '', 'Lidocaína 2 % con epinefrina, cartucho 1,8 mL', 'Medicamento', 'Medicamento', 'Medicamentos', 'Anestésicos locales', 'Marca C', '', '', 'Caja x50 cartuchos', 'cartucho', 'caja x50', '50', '60', '600', '', '10', 'Excluido', '', 'Gabinete medicamentos', 'INVIMA 2020M-0011223', '2028-06-30', 'N/A', '', 'Lidocaína clorhidrato + epinefrina', '2 % + 1:80.000', 'Cartucho anestésico', '19900000-01', 'No', 'No', 'Bodega principal', 'LD-2201', '2027-09-30', '100', '1900']
];

async function leerArchivo(file) {
  if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import('read-excel-file/browser');
    const data = await readSheet(file);
    return Array.isArray(data) ? data : data.rows || [];
  }
  return C.parseCSV(await file.text());
}

function ImportarProductos() {
  const { db, hoy, commit, toast, nombreUsuario, go } = useStore();
  const archivo = useRef(null);
  const [nombre, setNombre] = useState('');
  const [res, setRes] = useState(null);
  const [opc, setOpc] = useState({ productos: true, saldos: true, fecha: hoy, acta: 'Inventario de apertura' });
  const [err, setErr] = useState([]);

  const cargar = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setErr([]);
    try {
      const filas = await leerArchivo(file);
      setNombre(file.name);
      setRes(C.interpretarImportacion(filas, db));
    } catch {
      toast('No se pudo leer el archivo. Use Excel (.xlsx) o CSV.', 'error');
    }
  };

  const aplicar = () => {
    if (!res) return;
    const e = [...res.errores];
    const conProblema = res.saldos.filter((s) => s.problema);
    if (opc.saldos && conProblema.length) e.push(conProblema.length + ' saldo(s) tienen datos incompletos (ver la tabla). Corríjalos en el archivo o desmarque la carga de saldos.');
    const bodegasFaltantes = [...new Set(res.saldos.map((s) => s.bodega).filter((b) => !db.config.ubicaciones.includes(b)))];
    if (e.length) return setErr(e);

    // Proyección de la base con los productos importados, para validar el saldo inicial.
    const proy = structuredClone(db);
    if (bodegasFaltantes.length) proy.config.ubicaciones = [...proy.config.ubicaciones, ...bodegasFaltantes];
    const ids = {};
    if (opc.productos || opc.saldos) {
      res.productos.forEach((p) => {
        if (p.existente) {
          ids[p.codigo.toUpperCase()] = p.id;
          if (!opc.productos) return;
          const x = proy.productos.find((y) => y.id === p.id);
          Object.assign(x, { nombre: p.nombre || x.nombre, unidad: p.unidad || x.unidad, stockMin: p.stockMin, invima: p.invima || x.invima, invimaVence: p.invimaVence || x.invimaVence, riesgo: p.riesgo || x.riesgo, gtin: p.gtin || x.gtin }, p.datos || {});
        } else {
          const id = C.nuevoId() + Math.random().toString(36).slice(2, 5);
          ids[p.codigo.toUpperCase()] = id;
          proy.productos.push(Object.assign({
            id, codigo: p.codigo, nombre: p.nombre, categoria: p.categoria, unidad: p.unidad, stockMin: p.stockMin, ubicacion: C.bodegaPrincipal(proy.config),
            fabricante: '', gtin: p.gtin, requiereInvima: p.categoria !== 'insumo', invima: p.invima, invimaVence: p.invimaVence, riesgo: p.riesgo,
            cadenaFrio: false, vnrUnit: '', activo: true, unidadCompra: '', factorCompra: 1, leadTime: 7, proveedorId: '',
            tipoMaterial: p.categoria === 'medicamento' ? 'medicamento' : 'consumible', controlaLote: true, controlaVence: true
          }, p.datos || {}));
        }
      });
    }
    let mov = null;
    if (opc.saldos && res.saldos.length) {
      mov = {
        id: C.nuevoId(), tipo: 'inicial', fecha: opc.fecha, bodega: C.bodegaPrincipal(proy.config), acta: opc.acta, autoriza: nombreUsuario,
        usuario: nombreUsuario, creado: new Date().toISOString(), nota: 'Importado desde ' + nombre,
        lineas: res.saldos.map((s) => ({ productoId: ids[s.codigo.toUpperCase()], bodega: s.bodega, lote: s.lote, vence: s.vence, cantidad: s.cantidad, costoUnit: s.costoUnit }))
      };
      const ev = C.validarMovimiento(proy, mov, hoy);
      if (ev.length) return setErr(ev);
    }
    const numero = mov ? C.verNumero(db, 'inicial') : '';
    commit((d) => {
      d.productos = proy.productos;
      d.bodegas = d.bodegas.concat(bodegasFaltantes.map((nombre, i) => ({ id: C.nuevoId() + i, codigo: 'B' + (d.bodegas.length + i + 1), nombre, tipo: 'bodega', responsable: '', sede: '', activa: true })));
      C.sincronizarBodegas(d);
      if (mov) { const nm = Object.assign({}, mov, { num: C.siguienteNumero(d, 'inicial'), orden: C.siguienteOrden(d) }); d.movimientos.push(nm); C.asegurarLotes(d, nm); }
    }, 'Importación', nombre + ' · ' + res.productos.length + ' productos' + (mov ? ' · ' + numero : ''));
    toast('Importación aplicada' + (mov ? ': ' + numero : ''));
    setRes(null);
    setNombre('');
  };

  const nuevos = res ? res.productos.filter((p) => !p.existente).length : 0;
  const valorSaldos = res ? res.saldos.reduce((s, x) => s + (Number(x.cantidad) || 0) * (Number(x.costoUnit) || 0), 0) : 0;

  return (
    <div className="stack">
      <Panel title="Importar desde Excel o CSV" icon={FileSpreadsheet}
        sub="Cree productos y su existencia inicial por lote desde un Excel (migración desde A2, SAP u otro sistema). Para productos que ya tienen movimientos, cargue el conteo en Inventario físico."
        actions={<><Btn icon={Download} onClick={() => descargar('plantilla-nova-inventario.csv', C.csv(PLANTILLA))}>Descargar plantilla</Btn><Btn variant="primary" icon={Upload} onClick={() => archivo.current && archivo.current.click()}>Elegir archivo</Btn></>}>
        <input ref={archivo} type="file" accept=".xlsx,.csv,.txt,text/csv" hidden onChange={cargar} />
        <Nota>
          Columnas reconocidas: código, nombre, categoría, unidad, stock mínimo, registro INVIMA, vence INVIMA, riesgo, GTIN, bodega, lote, vencimiento, cantidad y costo unitario.
          Los nombres pueden variar (por ejemplo "Descripción" o "Existencia"). Si un código ya existe, se actualiza la ficha.
        </Nota>
      </Panel>
      <div className="law">
        <Panel>
          <h3>1 · Productos nuevos con su existencia</h3>
          <p>Para empezar a usar NOVA o agregar productos en bloque: código, nombre, clasificación, lote, vencimiento, cantidad y costo. Crea las fichas, los lotes y el saldo inicial.</p>
          <div className="toolbar"><Btn icon={Download} onClick={() => descargar('plantilla-nova-inventario.csv', C.csv(PLANTILLA))}>Plantilla</Btn><Btn variant="primary" icon={Upload} onClick={() => archivo.current && archivo.current.click()}>Subir archivo</Btn></div>
        </Panel>
        <Panel>
          <h3>2 · Inventario físico (conteo) desde Excel</h3>
          <p>Descargue sus existencias actuales por bodega y lote, cuente, escriba lo contado y súbalo: el sistema compara, muestra las diferencias y genera el ajuste al aplicar.</p>
          <div className="toolbar"><Btn variant="primary" icon={Upload} onClick={() => go('conteos', 'excel')}>Ir a inventario físico</Btn></div>
        </Panel>
      </div>
      {res ? (
        <Panel title={'Vista previa: ' + nombre} icon={FileSpreadsheet}>
          <Errores lista={[...res.errores, ...err]} />
          <div className="kv">
            <div><span>Productos nuevos</span><b>{nuevos}</b></div>
            <div><span>Productos existentes</span><b>{res.productos.length - nuevos}</b></div>
            <div><span>Saldos por lote</span><b>{res.saldos.length}</b></div>
            <div><span>Valor del saldo</span><b>{money(valorSaldos)}</b></div>
          </div>
          <div className="form-grid">
            <Field label="Productos"><label className="check"><input type="checkbox" checked={opc.productos} onChange={(e) => setOpc((o) => Object.assign({}, o, { productos: e.target.checked }))} /> Crear y actualizar fichas</label></Field>
            <Field label="Saldos"><label className="check"><input type="checkbox" checked={opc.saldos} onChange={(e) => setOpc((o) => Object.assign({}, o, { saldos: e.target.checked }))} /> Cargar como saldo inicial</label></Field>
            <Field label="Fecha del saldo inicial" hint="Debe ser anterior a cualquier otro movimiento"><input className="input" type="date" value={opc.fecha} max={hoy} onChange={(e) => setOpc((o) => Object.assign({}, o, { fecha: e.target.value }))} /></Field>
            <Field label="Soporte"><input className="input" value={opc.acta} onChange={(e) => setOpc((o) => Object.assign({}, o, { acta: e.target.value }))} /></Field>
          </div>
          {res.saldos.length > 0 && (
            <>
              <div className="section-title">Saldos</div>
              <div className="tbl-wrap" style={{ maxHeight: 360 }}>
                <table className="tbl">
                  <thead><tr><th>Fila</th><th>Código</th><th>Bodega</th><th>Lote</th><th>Vence</th><th className="num">Cantidad</th><th className="num">Costo</th><th>Estado</th></tr></thead>
                  <tbody>{res.saldos.map((s, i) => <tr key={i}><td>{s.fila}</td><td className="mono">{s.codigo}</td><td>{s.bodega}</td><td className="mono">{s.lote}</td><td>{fecha(s.vence)}</td><td className="num">{num(s.cantidad)}</td><td className="num">{s.costoUnit === '' ? '—' : money(s.costoUnit)}</td><td>{s.problema ? <Chip tone="red">{s.problema}</Chip> : <Chip tone="green">OK</Chip>}</td></tr>)}</tbody>
                </table>
              </div>
            </>
          )}
          <div className="toolbar" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
            <Btn onClick={() => { setRes(null); setErr([]); }}>Descartar</Btn>
            <Btn variant="primary" icon={Upload} onClick={aplicar}>Aplicar importación</Btn>
          </div>
        </Panel>
      ) : <Panel><Empty icon={FileSpreadsheet} title="Ningún archivo cargado" text="Descargue la plantilla, llénela y súbala aquí." /></Panel>}
    </div>
  );
}

export const PLANTILLA_TERCEROS = [
  ['Tipo documento', 'NIT', 'DV', 'Razón social', 'Primer nombre', 'Segundo nombre', 'Primer apellido', 'Segundo apellido', 'Sexo', 'Tipo', 'Régimen', 'Actividad económica', 'País', 'Departamento', 'Ciudad', 'Código DANE', 'Dirección', 'Teléfono', 'Celular', 'Correo', 'Contacto', 'Plazo de pago', 'Medio de pago', 'Banco', 'Tipo de cuenta', 'Número de cuenta', 'Retención', 'ReteICA'],
  ['NIT', '900123456', '8', 'Proveedor de ejemplo S.A.S.', '', '', '', '', '', 'Proveedor', 'Responsable de IVA', '4645', 'Colombia', 'Bogotá D.C.', 'Bogotá D.C.', '11001', 'Cra. 1 # 2-3', '6015550000', '3005550000', 'facturas@ejemplo.co', 'Ana Gómez', '30', 'Transferencia', 'Banco de ejemplo', 'Corriente', '0001234567', '2.5', '0.966'],
  ['CC', '1020304050', '', '', 'María', 'Fernanda', 'López', 'Gil', 'F', 'Paciente', 'No responsable de IVA', '', 'Colombia', 'Antioquia', 'Medellín', '', '', '', '3000000000', '', '', '', '', '', '', '', '', '']
];
export const PLANTILLA_PLAN = [
  ['Código', 'Nombre', 'Naturaleza', 'Tercero'],
  ['14', 'INVENTARIOS', 'D', ''], ['1455', 'Materiales, repuestos y accesorios', 'D', ''], ['145505', 'Insumos odontológicos', 'D', ''],
  ['22', 'PROVEEDORES', 'C', ''], ['2205', 'Nacionales', 'C', 'Sí']
];

function CargaArchivo({ onFilas, plantilla, nombrePlantilla, titulo, texto }) {
  const ref = useRef(null);
  const { toast } = useStore();
  const leer = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try { onFilas(await leerArchivo(file), file.name); } catch { toast('No se pudo leer el archivo. Use Excel (.xlsx) o CSV.', 'error'); }
  };
  return (
    <Panel title={titulo} icon={FileSpreadsheet} sub={texto}
      actions={<><Btn icon={Download} onClick={() => descargar(nombrePlantilla, C.csv(plantilla))}>Plantilla</Btn><Btn variant="primary" icon={Upload} onClick={() => ref.current && ref.current.click()}>Subir archivo</Btn></>}>
      <input ref={ref} type="file" accept=".xlsx,.csv,.txt" hidden onChange={leer} />
    </Panel>
  );
}

function CargaTerceros() {
  const { db, commit, toast } = useStore();
  const [res, setRes] = useState(null);
  const [nombre, setNombre] = useState('');
  const aplicar = () => {
    const ok = res.terceros;
    commit((d) => {
      ok.forEach((t) => {
        const x = Object.assign({}, t); delete x.fila; delete x.existente;
        if (t.existente) { const i = d.proveedores.findIndex((p) => p.id === t.id); d.proveedores[i] = C.normalizarTercero(Object.assign({}, d.proveedores[i], Object.fromEntries(Object.entries(x).filter(([, v]) => v !== '' && v !== null)))); }
        else d.proveedores.push(C.normalizarTercero(Object.assign(x, { id: C.nuevoId() + Math.random().toString(36).slice(2, 5) })));
      });
    }, 'Carga masiva de terceros', nombre + ' · ' + ok.length + ' terceros');
    toast(ok.length + ' terceros cargados');
    setRes(null);
  };
  const nuevos = res ? res.terceros.filter((t) => !t.existente).length : 0;
  return (
    <div className="stack">
      <CargaArchivo titulo="Terceros desde Excel" nombrePlantilla="plantilla-terceros.csv" plantilla={PLANTILLA_TERCEROS}
        texto="Proveedores, clientes, pacientes, empleados y laboratorios: documento, razón social o nombres y apellidos, tipo, régimen, ubicación, contacto, plazo y medio de pago, cuenta bancaria y retenciones. Solo son obligatorios el documento y el nombre; el dígito de verificación se calcula y se valida. En Colombia el código DANE del municipio se asigna solo a partir del departamento y la ciudad (o use la columna Código DANE)."
        onFilas={(f, n) => { setNombre(n); setRes(C.interpretarTerceros(f, db)); }} />
      {res && (
        <Panel title={'Vista previa: ' + nombre} icon={Contact}>
          <Errores lista={res.errores} />
          {res.avisos && res.avisos.length > 0 && (
            <div style={{ marginBottom: 12 }}><Nota>
              <b>{res.avisos.length} aviso(s) de ubicación</b> (estos terceros se cargan, pero sin código DANE; puede corregir el archivo o elegir el municipio después en la ficha):
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{res.avisos.slice(0, 15).map((a, i) => <li key={i}>{a}</li>)}</ul>
              {res.avisos.length > 15 && <div>… y {res.avisos.length - 15} más.</div>}
            </Nota></div>
          )}
          <div className="kv"><div><span>Nuevos</span><b>{nuevos}</b></div><div><span>Se actualizan</span><b>{res.terceros.length - nuevos}</b></div><div><span>Con código DANE</span><b>{res.terceros.filter((t) => t.ciudadCodigo).length}</b></div></div>
          <div className="tbl-wrap" style={{ maxHeight: 380 }}><table className="tbl">
            <thead><tr><th>Fila</th><th>Documento</th><th>Nombre</th><th>Tipo</th><th>Ubicación</th><th>Código DANE</th><th>Estado</th></tr></thead>
            <tbody>{res.terceros.map((t) => <tr key={t.fila}><td>{t.fila}</td><td className="mono">{C.documentoTercero(t)}</td><td>{t.nombre}</td><td>{t.tipos.map((x) => C.TIPOS_TERCERO[x]).join(', ')}</td><td>{t.ciudad}<div className="small muted">{[t.departamento, t.paisCodigo && t.paisCodigo !== 'CO' ? t.pais : ''].filter(Boolean).join(' · ')}</div></td><td className="mono">{t.ciudadCodigo || (t.paisCodigo === 'CO' && t.ciudad ? <Chip tone="amber">Sin código</Chip> : '—')}</td><td>{t.existente ? <Chip tone="amber">Actualiza</Chip> : <Chip tone="green">Nuevo</Chip>}</td></tr>)}</tbody>
          </table></div>
          <div className="toolbar" style={{ marginTop: 12, justifyContent: 'flex-end' }}><Btn onClick={() => setRes(null)}>Descartar</Btn><Btn variant="primary" icon={Upload} onClick={aplicar} disabled={!res.terceros.length}>Cargar {res.terceros.length} terceros</Btn></div>
        </Panel>
      )}
    </div>
  );
}

function CargaPlan() {
  const { db, state, commit, toast } = useStore();
  const [res, setRes] = useState(null);
  const [nombre, setNombre] = useState('');
  const [modo, setModo] = useState('combinar');
  const aplicar = () => {
    if (modo === 'reemplazar') {
      const usadas = new Set(C.comprobantesContables(db, state).flatMap((cp) => cp.lineas.map((l) => l.cuenta)));
      const faltan = [...usadas].filter((c) => !res.cuentas.some((x) => x.codigo === c));
      if (faltan.length) return toast('No se puede reemplazar: el archivo no trae cuentas ya usadas (' + faltan.slice(0, 5).join(', ') + '). Use "Combinar".', 'error');
    }
    commit((d) => {
      if (modo === 'reemplazar') d.planCuentas = res.cuentas;
      else res.cuentas.forEach((c) => { const i = d.planCuentas.findIndex((x) => x.codigo === c.codigo); if (i >= 0) d.planCuentas[i] = Object.assign({}, d.planCuentas[i], c); else d.planCuentas.push(c); });
    }, 'Carga del plan de cuentas', nombre + ' · ' + res.cuentas.length + ' cuentas · ' + modo);
    toast(res.cuentas.length + ' cuentas cargadas. Revise la parametrización contable.');
    setRes(null);
  };
  return (
    <div className="stack">
      <CargaArchivo titulo="Plan de cuentas desde Excel" nombrePlantilla="plantilla-plan-de-cuentas.csv" plantilla={PLANTILLA_PLAN}
        texto="Cargue el plan de cuentas de su empresa (PUC o catálogo propio bajo NIIF): código, nombre, naturaleza (D o C) y si exige tercero. Las cuentas que no tienen subcuentas quedan como cuentas de movimiento."
        onFilas={(f, n) => { setNombre(n); setRes(C.interpretarPlanCuentas(f)); }} />
      {res && (
        <Panel title={'Vista previa: ' + nombre} icon={ListTree}>
          <Errores lista={res.errores} />
          <div className="form-grid" style={{ marginBottom: 12 }}>
            <Field label="Cómo cargar"><select className="select input" value={modo} onChange={(e) => setModo(e.target.value)}><option value="combinar">Combinar: agrega las nuevas y actualiza las existentes</option><option value="reemplazar">Reemplazar todo el plan por el del archivo</option></select></Field>
          </div>
          <div className="tbl-wrap" style={{ maxHeight: 380 }}><table className="tbl">
            <thead><tr><th>Código</th><th>Nombre</th><th>Nivel</th><th>Naturaleza</th><th>Tercero</th><th>Tipo</th></tr></thead>
            <tbody>{res.cuentas.map((c) => <tr key={c.codigo}><td className="mono" style={{ paddingLeft: 12 + (C.nivelCuenta(c.codigo) - 1) * 12 }}>{c.codigo}</td><td>{c.nombre}</td><td>{C.NIVELES_CUENTA[C.nivelCuenta(c.codigo)]}</td><td>{c.naturaleza === 'C' ? 'Crédito' : 'Débito'}</td><td>{c.terceros ? 'Sí' : ''}</td><td>{c.movimiento ? <Chip tone="green">Movimiento</Chip> : <Chip tone="muted">Agrupa</Chip>}</td></tr>)}</tbody>
          </table></div>
          <div className="toolbar" style={{ marginTop: 12, justifyContent: 'flex-end' }}><Btn onClick={() => setRes(null)}>Descartar</Btn><Btn variant="primary" icon={Upload} onClick={aplicar} disabled={!res.cuentas.length || res.errores.length > 0}>Cargar {res.cuentas.length} cuentas</Btn></div>
        </Panel>
      )}
    </div>
  );
}

export default function Importar({ arg }) {
  const { go } = useStore();
  const [tipo, setTipo] = useState(['plan', 'terceros'].includes(arg) ? arg : 'productos');
  return (
    <div className="stack">
      <Panel title="Carga masiva desde Excel" icon={FileSpreadsheet} sub="Migre sus datos desde otro sistema o desde Excel. Cada carga muestra una vista previa con los errores por fila antes de aplicar.">
        <Tabs value={tipo} onChange={(v) => (v === 'fisico' ? go('conteos', 'excel') : setTipo(v))} options={[['productos', 'Productos, insumos y existencias'], ['terceros', 'Terceros'], ['plan', 'Plan de cuentas'], ['fisico', 'Inventario físico (conteo)']]} />
      </Panel>
      {tipo === 'productos' && <ImportarProductos />}
      {tipo === 'terceros' && <CargaTerceros />}
      {tipo === 'plan' && <CargaPlan />}
    </div>
  );
}
