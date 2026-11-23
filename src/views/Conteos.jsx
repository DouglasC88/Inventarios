import { useState } from 'react';
import { Ban, Check, ClipboardCheck, Download, Eye, FileSpreadsheet, Plus, Save, Upload } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { Btn, Chip, Empty, Errores, Field, Modal, Nota, Panel } from '../components/ui.jsx';
import { SelectBodega, nombreProducto, useRegistrar } from '../components/Movimientos.jsx';
import { descargar, fecha, money, num } from '../format.js';

function NuevoConteo({ onClose }) {
  const { db, state, hoy, commit, toast } = useStore();
  const { nombreUsuario } = useStore();
  const [f, setF] = useState({ fecha: hoy, categoria: 'todas', bodega: 'todas', anual: true, responsable: nombreUsuario });
  const [err, setErr] = useState([]);
  const set = (k) => (e) => setF((x) => Object.assign({}, x, { [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const crear = () => {
    const e = [];
    if (C.conteoAbierto(db)) e.push('Ya hay un conteo abierto.');
    const uc = C.ultimoCierre(db);
    if (uc && f.fecha <= uc.fecha) e.push('La fecha pertenece a un periodo cerrado.');
    if (f.fecha > hoy) e.push('La fecha no puede ser futura.');
    const lineas = C.crearConteo(db, state, f, hoy);
    if (!lineas.length) e.push('No hay lotes con existencia para contar.');
    if (f.anual && (f.categoria !== 'todas' || f.bodega !== 'todas')) e.push('El conteo anual debe incluir todas las categorías y bodegas.');
    if (e.length) return setErr(e);
    const numero = 'CF-' + String((db.seq.CF || 0) + 1).padStart(5, '0');
    commit((d) => {
      d.conteos.push(Object.assign({ id: C.nuevoId(), num: C.siguienteNumero(d, 'conteo'), estado: 'abierto', lineas, creado: new Date().toISOString() }, f));
    }, 'Conteo abierto', numero);
    toast(numero + ' abierto: los movimientos quedan bloqueados hasta aplicarlo');
    onClose();
  };
  return (
    <Modal open title="Nuevo conteo físico" icon={ClipboardCheck} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancelar</Btn><Btn variant="primary" onClick={crear}>Abrir conteo</Btn></>}>
      <Errores lista={err} />
      <div className="form-grid">
        <Field label="Fecha de corte"><input className="input" type="date" value={f.fecha} max={hoy} onChange={set('fecha')} /></Field>
        <Field label="Alcance">
          <select className="select input" value={f.categoria} onChange={set('categoria')}>
            <option value="todas">Todo el inventario</option>
            {Object.entries(C.CATEGORIAS).map(([k, v]) => <option key={k} value={k}>Solo {v.toLowerCase()}s</option>)}
          </select>
        </Field>
        <Field label="Bodega">
          <SelectBodega value={f.bodega} incluirTodas onChange={(v) => setF((x) => Object.assign({}, x, { bodega: v }))} />
        </Field>
        <Field label="Responsable"><input className="input" value={f.responsable} onChange={set('responsable')} /></Field>
        <Field label="Tipo"><label className="check"><input type="checkbox" checked={f.anual} onChange={set('anual')} /> Conteo anual completo (C. de Co. art. 52)</label></Field>
      </div>
      <Nota>Mientras el conteo esté abierto no se pueden registrar entradas, salidas ni ajustes.</Nota>
    </Modal>
  );
}

function DetalleConteo({ conteo, onClose }) {
  const { db, state, commit, toast, puede } = useStore();
  const registrar = useRegistrar();
  const [cont, setCont] = useState(() => conteo.lineas.map((l) => (l.contado === '' || l.contado === null || l.contado === undefined ? '' : String(l.contado))));
  const [acta, setActa] = useState('');
  const [autoriza, setAutoriza] = useState('');
  const [err, setErr] = useState([]);
  const abierto = conteo.estado === 'abierto';
  const filas = C.diferenciasConteo(Object.assign({}, conteo, { lineas: conteo.lineas.map((l, i) => Object.assign({}, l, { contado: cont[i] })) }), state);
  const pendientes = filas.filter((f) => f.contado === null).length;
  const conDif = filas.filter((f) => f.diferencia);

  const guardarAvance = () => {
    commit((d) => {
      const c = d.conteos.find((x) => x.id === conteo.id);
      c.lineas.forEach((l, i) => { l.contado = cont[i]; });
    }, 'Conteo guardado', conteo.num);
    toast('Avance guardado');
  };
  const anular = () => {
    commit((d) => { const c = d.conteos.find((x) => x.id === conteo.id); c.estado = 'anulado'; }, 'Conteo anulado', conteo.num);
    toast(conteo.num + ' anulado');
    onClose();
  };
  const aplicar = () => {
    if (pendientes) return setErr(['Faltan ' + pendientes + ' líneas por contar.']);
    if (!conDif.length) {
      commit((d) => {
        const c = d.conteos.find((x) => x.id === conteo.id);
        c.lineas.forEach((l, i) => { l.contado = cont[i]; });
        c.estado = 'aplicado'; c.aplicado = new Date().toISOString();
      }, 'Conteo aplicado sin diferencias', conteo.num);
      toast(conteo.num + ' aplicado sin diferencias');
      return onClose();
    }
    commit((d) => { const c = d.conteos.find((x) => x.id === conteo.id); c.lineas.forEach((l, i) => { l.contado = cont[i]; }); }, 'Conteo guardado', conteo.num);
    const e = registrar({
      tipo: 'ajuste', fecha: conteo.fecha, acta, autoriza, conteoId: conteo.id, conteoNum: conteo.num,
      nota: 'Ajuste por conteo físico ' + conteo.num,
      lineas: conDif.map((f) => ({ productoId: f.productoId, bodega: f.bodega, lote: f.lote, vence: f.vence, cantidad: f.diferencia, causa: f.diferencia < 0 ? 'faltante' : 'sobrante', costoUnit: f.diferencia > 0 && f.costoUnit !== undefined ? f.costoUnit : undefined }))
    }, 'Conteo aplicado');
    if (e.length) return setErr(e);
    onClose();
  };

  return (
    <Modal open wide title={'Conteo ' + conteo.num} icon={ClipboardCheck} onClose={onClose}
      footer={abierto ? <>{puede('conteoAplicar') && <Btn variant="danger" icon={Ban} onClick={anular}>Anular conteo</Btn>}<span style={{ flex: 1 }} />{puede('conteoContar') && <Btn icon={Save} onClick={guardarAvance}>Guardar avance</Btn>}{puede('conteoAplicar') && <Btn variant="primary" icon={Check} onClick={aplicar}>Aplicar conteo</Btn>}</> : <Btn onClick={onClose}>Cerrar</Btn>}>
      <Errores lista={err} />
      <div className="kv">
        <div><span>Fecha de corte</span><b>{fecha(conteo.fecha)}</b></div>
        <div><span>Estado</span><b>{conteo.estado}</b></div>
        <div><span>Lotes</span><b>{filas.length}</b></div>
        <div><span>Pendientes</span><b>{pendientes}</b></div>
        <div><span>Con diferencia</span><b>{conDif.length}</b></div>
        {conteo.ajusteNum && <div><span>Ajuste generado</span><b>{conteo.ajusteNum}</b></div>}
      </div>
      <div className="tbl-wrap lines">
        <table className="tbl">
          <thead><tr><th>Producto</th><th>Bodega</th><th>Lote</th><th>Vence</th><th className="num">Sistema</th><th className="num">Contado</th><th className="num">Diferencia</th></tr></thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i}>
                <td>{nombreProducto(db, f.productoId)}</td>
                <td>{f.bodega}</td>
                <td className="mono">{f.lote}{f.nuevo && <> <Chip tone="violet">Nuevo</Chip></>}</td>
                <td>{fecha(f.vence)}</td>
                <td className="num">{num(abierto ? f.sistema : conteo.lineas[i].sistema)}</td>
                <td>{abierto
                  ? <input className="input num" type="number" min="0" value={cont[i]} onChange={(e) => setCont((c) => c.map((x, j) => (j === i ? e.target.value : x)))} style={{ width: 110, marginLeft: 'auto' }} />
                  : <div className="num">{num(conteo.lineas[i].contado)}</div>}
                </td>
                <td className={'num ' + (f.diferencia < 0 ? 'red-t' : f.diferencia > 0 ? 'green-t' : '')}>{f.diferencia === null ? '—' : num(f.diferencia)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {abierto && conDif.length > 0 && (
        <>
          <div className="section-title">Soporte del ajuste</div>
          <div className="form-grid">
            <Field label="Número de acta"><input className="input mono" value={acta} onChange={(e) => setActa(e.target.value)} /></Field>
            <Field label="Autoriza"><input className="input" value={autoriza} onChange={(e) => setAutoriza(e.target.value)} /></Field>
          </div>
        </>
      )}
    </Modal>
  );
}

async function leerFilas(file) {
  if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import('read-excel-file/browser');
    const data = await readSheet(file);
    return Array.isArray(data) ? data : data.rows || [];
  }
  return C.parseCSV(await file.text());
}

/** Inventario físico desde Excel: plantilla con existencias, carga del conteo y comparación con el sistema. */
function CargaFisica({ onClose, onCreado }) {
  const { db, state, hoy, commit, toast, nombreUsuario } = useStore();
  const [o, setO] = useState({ fecha: hoy, bodega: 'todas', alcance: 'archivo', anual: false });
  const [res, setRes] = useState(null);
  const [nombre, setNombre] = useState('');
  const [err, setErr] = useState([]);
  const set = (k, v) => setO((x) => Object.assign({}, x, { [k]: v }));
  const bodegaDef = o.bodega === 'todas' ? C.bodegaPrincipal(db.config) : o.bodega;
  const [filas, setFilas] = useState(null);
  const procesar = (fs, opts) => setRes(C.conteoDesdeFilas(db, state, fs, { bodega: bodegaDef, alcance: opts.alcance, hoy }));
  const plantilla = () => descargar('inventario-fisico-' + (o.bodega === 'todas' ? 'todas' : o.bodega) + '-' + hoy + '.csv', C.csv(C.plantillaInventarioFisico(db, state, hoy, o.bodega)));
  const archivo = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try { const fs = await leerFilas(file); setNombre(file.name); setFilas(fs); procesar(fs, o); }
    catch { toast('No se pudo leer el archivo. Use Excel (.xlsx) o CSV.', 'error'); }
  };
  const cambiarAlcance = (v) => { set('alcance', v); if (filas) procesar(filas, Object.assign({}, o, { alcance: v })); };
  const crear = () => {
    const e = [];
    if (!res || !res.lineas.length) e.push('Cargue un archivo con cantidades contadas.');
    if (res && res.errores.length) e.push('Corrija los errores del archivo antes de crear el conteo.');
    if (C.conteoAbierto(db)) e.push('Ya hay un conteo abierto. Aplíquelo o anúlelo primero.');
    const uc = C.ultimoCierre(db);
    if (uc && o.fecha <= uc.fecha) e.push('La fecha pertenece a un periodo cerrado.');
    if (o.anual && (o.alcance !== 'todo')) e.push('Un conteo anual debe cubrir todo el inventario (alcance "Todo el inventario").');
    if (e.length) return setErr(e);
    const numero = C.verNumero(db, 'conteo');
    commit((d) => {
      d.conteos.push({ id: C.nuevoId(), num: C.siguienteNumero(d, 'conteo'), estado: 'abierto', fecha: o.fecha, categoria: 'todas', bodega: o.alcance === 'bodega' ? bodegaDef : 'todas', anual: o.anual, responsable: nombreUsuario, origen: 'Excel: ' + nombre, creado: new Date().toISOString(),
        lineas: res.lineas.map((l) => ({ productoId: l.productoId, bodega: l.bodega, lote: l.lote, vence: l.vence, sistema: l.sistema, contado: String(l.contado), nuevo: l.nuevo || undefined, costoUnit: l.costoUnit })) });
    }, 'Inventario físico cargado desde Excel', numero + ' · ' + nombre);
    toast(numero + ' creado desde ' + nombre + '. Revise las diferencias y aplíquelo.');
    onCreado(numero);
  };
  const conDif = res ? res.lineas.filter((l) => l.diferencia) : [];
  const valorDif = conDif.reduce((a, l) => { const s = state.prods[l.productoId]; const u = l.costoUnit !== undefined ? l.costoUnit : s && s.qty ? s.value / s.qty : 0; return a + l.diferencia * u; }, 0);
  return (
    <Modal open wide title="Inventario físico desde Excel" icon={FileSpreadsheet} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancelar</Btn><Btn variant="primary" icon={Check} onClick={crear} disabled={!res || !res.lineas.length}>Crear conteo con estas cantidades</Btn></>}>
      <Errores lista={err} />
      <div className="steps" style={{ marginBottom: 14 }}>
        <div className="step"><span className="n"><b>1</b></span><span className="t">Descargue la plantilla: trae sus existencias actuales por bodega y lote.</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><div style={{ width: 220 }}><SelectBodega value={o.bodega} incluirTodas onChange={(v) => set('bodega', v)} /></div><Btn size="sm" icon={Download} onClick={plantilla}>Plantilla</Btn></div></div>
        <div className="step"><span className="n"><b>2</b></span><span className="t">Cuente y escriba la columna "Cantidad contada". Si encuentra un lote que no está, agregue una fila con código, bodega, lote, vencimiento y costo.</span><span /></div>
        <div className="step"><span className="n"><b>3</b></span><span className="t">Suba el archivo (Excel .xlsx o CSV). También sirve un Excel propio con columnas Código, Lote, Bodega y Cantidad.</span>
          <label className="btn sm"><Upload size={14} /> Subir archivo<input type="file" accept=".xlsx,.csv,.txt" hidden onChange={archivo} /></label></div>
      </div>
      <div className="form-grid">
        <Field label="Fecha del conteo"><input className="input" type="date" value={o.fecha} max={hoy} onChange={(e) => set('fecha', e.target.value)} /></Field>
        <Field label="Lo que no esté en el archivo" hint="Para un conteo completo, lo no listado se toma como cero">
          <select className="select input" value={o.alcance} onChange={(e) => cambiarAlcance(e.target.value)}>
            <option value="archivo">Ignorarlo (solo comparar lo del archivo)</option>
            <option value="bodega">Contarlo en cero en la bodega elegida</option>
            <option value="todo">Contarlo en cero en todo el inventario</option>
          </select>
        </Field>
        <Field label="Tipo"><label className="check"><input type="checkbox" checked={o.anual} onChange={(e) => set('anual', e.target.checked)} /> Es el inventario anual (C. de Co. art. 52)</label></Field>
      </div>
      {res && (
        <>
          <div className="section-title">Resultado de {nombre}</div>
          <Errores lista={res.errores} />
          {res.avisos.length > 0 && <Nota>{res.avisos.join(' ')}</Nota>}
          <div className="kv" style={{ marginTop: 12 }}>
            <div><span>Lotes leídos</span><b>{num(res.lineas.length)}</b></div>
            <div><span>Sin diferencia</span><b>{num(res.lineas.length - conDif.length)}</b></div>
            <div><span>Con diferencia</span><b>{num(conDif.length)}</b></div>
            <div><span>Lotes nuevos</span><b>{num(res.lineas.filter((l) => l.nuevo).length)}</b></div>
            <div><span>Valor de la diferencia</span><b>{money(valorDif)}</b></div>
          </div>
          {conDif.length > 0 && (
            <div className="tbl-wrap" style={{ maxHeight: 320 }}>
              <table className="tbl">
                <thead><tr><th>Producto</th><th>Bodega</th><th>Lote</th><th>Vence</th><th className="num">Sistema</th><th className="num">Contado</th><th className="num">Diferencia</th></tr></thead>
                <tbody>{conDif.map((l, i) => (
                  <tr key={i}><td>{nombreProducto(db, l.productoId)}</td><td>{l.bodega}</td><td className="mono">{l.lote}{l.nuevo && <> <Chip tone="violet">Nuevo</Chip></>}{l.noContado && <> <Chip tone="muted">No contado</Chip></>}</td><td>{fecha(l.vence)}</td>
                    <td className="num">{num(l.sistema)}</td><td className="num">{num(l.contado)}</td><td className={'num ' + (l.diferencia < 0 ? 'red-t' : 'green-t')}>{num(l.diferencia)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

export default function Conteos({ arg }) {
  const { db, puede } = useStore();
  const [nuevo, setNuevo] = useState(false);
  const [carga, setCarga] = useState(arg === 'excel');
  const [ver, setVer] = useState(null);
  const lista = db.conteos.slice().reverse();
  const tono = { abierto: 'amber', aplicado: 'green', anulado: 'muted' };
  const actual = ver === '__ultimo' ? db.conteos[db.conteos.length - 1] : ver && db.conteos.find((c) => c.id === ver);
  return (
    <Panel title="Inventario físico" icon={ClipboardCheck}
      sub="Inventario anual obligatorio y conteos cíclicos, en pantalla o desde Excel. Las diferencias generan un ajuste con su causa al aplicar el conteo."
      actions={puede('conteoAbrir') && <><Btn icon={FileSpreadsheet} onClick={() => setCarga(true)}>Cargar desde Excel</Btn><Btn variant="primary" icon={Plus} onClick={() => setNuevo(true)}>Nuevo conteo en pantalla</Btn></>}>
      {lista.length ? (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Conteo</th><th>Fecha</th><th>Alcance</th><th>Tipo</th><th>Responsable</th><th>Estado</th><th className="num">Lotes</th><th /></tr></thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.id}>
                  <td className="mono">{c.num}</td>
                  <td>{fecha(c.fecha)}</td>
                  <td>{c.categoria === 'todas' ? 'Todas las categorías' : C.CATEGORIAS[c.categoria]}<div className="small muted">{!c.bodega || c.bodega === 'todas' ? 'Todas las bodegas' : c.bodega}</div></td>
                  <td>{c.anual ? <Chip tone="violet">Anual</Chip> : <Chip tone="cyan">Cíclico</Chip>}</td>
                  <td>{c.responsable}</td>
                  <td><Chip tone={tono[c.estado]} dot>{c.estado}</Chip></td>
                  <td className="num">{c.lineas.length}</td>
                  <td className="acts"><Btn variant="ghost" size="sm" icon={Eye} onClick={() => setVer(c.id)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty icon={ClipboardCheck} title="Sin conteos" text="Abra el conteo anual o un conteo cíclico." />}
      {nuevo && <NuevoConteo onClose={() => setNuevo(false)} />}
      {carga && <CargaFisica onClose={() => setCarga(false)} onCreado={(numero) => { setCarga(false); const c = db.conteos.find((x) => x.num === numero); if (c) setVer(c.id); else setTimeout(() => setVer('__ultimo'), 0); }} />}
      {actual && <DetalleConteo key={actual.id + actual.estado} conteo={actual} onClose={() => setVer(null)} />}
    </Panel>
  );
}
