import { useRef, useState } from 'react';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { Btn, Chip, Empty, Errores, Field, Nota, Panel } from '../components/ui.jsx';
import { descargar, fecha, money, num } from '../format.js';

const PLANTILLA = [
  ['Código', 'Nombre', 'Categoría', 'Unidad', 'Stock mínimo', 'Registro INVIMA', 'Vence INVIMA', 'Riesgo', 'GTIN', 'Bodega', 'Lote', 'Vencimiento', 'Cantidad', 'Costo unitario'],
  ['GUA-NIT-M', 'Guantes de nitrilo talla M, caja x100', 'Dispositivo médico', 'caja', '15', 'INVIMA 2019DM-0004567', '2028-01-31', 'I', '', 'Bodega principal', 'GN-7781', '2027-12-31', '20', '21000'],
  ['HIP-525', 'Hipoclorito de sodio 5,25 %, frasco 1 L', 'Insumo', 'frasco', '6', '', '', 'N/A', '', 'Bodega principal', 'HS-0525', '2027-06-30', '12', '9500']
];

async function leerArchivo(file) {
  if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import('read-excel-file/browser');
    const data = await readSheet(file);
    return Array.isArray(data) ? data : data.rows || [];
  }
  return C.parseCSV(await file.text());
}

export default function Importar() {
  const { db, hoy, commit, toast, nombreUsuario } = useStore();
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
          Object.assign(x, { nombre: p.nombre || x.nombre, unidad: p.unidad || x.unidad, stockMin: p.stockMin, invima: p.invima || x.invima, invimaVence: p.invimaVence || x.invimaVence, riesgo: p.riesgo || x.riesgo, gtin: p.gtin || x.gtin });
        } else {
          const id = C.nuevoId() + Math.random().toString(36).slice(2, 5);
          ids[p.codigo.toUpperCase()] = id;
          proy.productos.push({
            id, codigo: p.codigo, nombre: p.nombre, categoria: p.categoria, unidad: p.unidad, stockMin: p.stockMin, ubicacion: C.bodegaPrincipal(proy.config),
            fabricante: '', gtin: p.gtin, requiereInvima: p.categoria !== 'insumo', invima: p.invima, invimaVence: p.invimaVence, riesgo: p.riesgo,
            cadenaFrio: false, vnrUnit: '', activo: true, unidadCompra: '', factorCompra: 1, leadTime: 7, proveedorId: ''
          });
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
      d.config.ubicaciones = proy.config.ubicaciones;
      d.productos = proy.productos;
      if (mov) d.movimientos.push(Object.assign({}, mov, { num: C.siguienteNumero(d, 'inicial'), orden: C.siguienteOrden(d) }));
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
        sub="Migre su maestro de productos y el saldo inicial por lote desde otro sistema (A2, SAP, Excel)."
        actions={<><Btn icon={Download} onClick={() => descargar('plantilla-nova-inventario.csv', C.csv(PLANTILLA))}>Descargar plantilla</Btn><Btn variant="primary" icon={Upload} onClick={() => archivo.current && archivo.current.click()}>Elegir archivo</Btn></>}>
        <input ref={archivo} type="file" accept=".xlsx,.csv,.txt,text/csv" hidden onChange={cargar} />
        <Nota>
          Columnas reconocidas: código, nombre, categoría, unidad, stock mínimo, registro INVIMA, vence INVIMA, riesgo, GTIN, bodega, lote, vencimiento, cantidad y costo unitario.
          Los nombres pueden variar (por ejemplo "Descripción" o "Existencia"). Si un código ya existe, se actualiza la ficha.
        </Nota>
      </Panel>
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
