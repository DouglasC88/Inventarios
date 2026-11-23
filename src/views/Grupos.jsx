import { useState } from 'react';
import { FolderTree, Pencil, Plus, Trash2 } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { Btn, Chip, Empty, Errores, Field, Modal, Nota, Panel, SearchBox, Tabs } from '../components/ui.jsx';
import Combo from '../components/Combo.jsx';
import { SelectCuenta } from './Contabilidad.jsx';
import { money, num } from '../format.js';

const TONO = { insumo: 'cyan', producto: 'amber', medicamento: 'green', dispositivo: 'violet', equipo: 'muted', procedimiento: 'magenta', servicio: 'magenta' };
// Cuentas de cada grupo: las tres de Dentos (ingreso, gasto, cuenta por pagar) y la de inventario.
const CUENTAS_GRUPO = [
  ['ingreso', 'Cuenta contable para el ingreso'],
  ['costoConsumo', 'Cuenta contable para el gasto (costo)'],
  ['proveedores', 'Cuenta contable para la cuenta por pagar'],
  ['inventario', 'Cuenta de inventario']
];

function FormGrupo({ inicial, onClose }) {
  const { db, commit, toast } = useStore();
  const [f, setF] = useState(() => Object.assign({ codigo: '', nombre: '', descripcion: '', parentId: '', clasificacion: '', conceptoRetencion: '', tarifaIvaCompra: '', tarifaIvaVenta: '', manejaEsterilizacion: false, orden: '', activo: true, cuentas: {} }, inicial || {}, { cuentas: Object.assign({}, (inicial || {}).cuentas || {}) }));
  const [err, setErr] = useState([]);
  const set = (k) => (e) => setF((x) => Object.assign({}, x, { [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const setCta = (k) => (v) => setF((x) => Object.assign({}, x, { cuentas: Object.assign({}, x.cuentas, { [k]: v }) }));
  const prohibidos = f.id ? C.gruposDescendientes(db, f.id) : new Set();
  const padres = [{ value: '', label: 'Ninguno: es un grupo principal', sub: 'Primer nivel: aquí se elige la clasificación' },
    ...C.arbolGrupos(db).filter((g) => !prohibidos.has(g.id) && g.nivel < 3).map((g) => ({ value: g.id, label: ' '.repeat(g.nivel - 1) + g.codigo + ' · ' + g.nombre, sub: (C.CLASIFICACIONES[C.clasificacionGrupo(db, g.id)] || '') + ' · será ' + (g.nivel === 1 ? 'grupo' : 'subgrupo') + ' de ' + g.ruta, search: g.ruta }))];
  const padre = f.parentId ? db.grupos.find((g) => g.id === f.parentId) : null;
  const nivel = padre ? Math.min(3, C.nivelGrupo(db, padre) + 1) : 1;
  const clas = padre ? C.clasificacionGrupo(db, padre.id) : f.clasificacion;
  const esServ = C.CLASIF_SERVICIO.includes(clas);
  // Lo que deja vacío lo toma del grupo padre.
  const her = (campo) => (padre ? C.datoGrupo(db, padre.id, campo) : '');
  const herCta = (k) => C.cuentaDe(db, k, padre ? { grupoId: padre.id } : null);
  const usados = f.id ? db.productos.filter((p) => p.grupoId === f.id).length + db.servicios.filter((s) => s.grupoId === f.id).length : 0;
  const hijos = f.id ? db.grupos.filter((g) => g.parentId === f.id).length : 0;
  const guardar = () => {
    const g = Object.assign({}, f, {
      codigo: f.codigo.trim().toUpperCase(), nombre: f.nombre.trim(), descripcion: f.descripcion.trim(),
      clasificacion: padre ? '' : f.clasificacion, orden: f.orden === '' ? '' : Number(f.orden),
      cuentas: Object.fromEntries(Object.entries(f.cuentas || {}).filter(([, v]) => v))
    });
    if (!Object.keys(g.cuentas).length) delete g.cuentas;
    const e = C.validarGrupo(db, g);
    if (e.length) return setErr(e);
    const nuevo = !g.id;
    if (nuevo) g.id = C.nuevoId();
    commit((d) => { const i = d.grupos.findIndex((x) => x.id === g.id); if (i >= 0) d.grupos[i] = g; else d.grupos.push(g); }, nuevo ? 'Grupo creado' : 'Grupo modificado', g.codigo + ' · ' + g.nombre + ' · ' + (C.CLASIFICACIONES[clas] || ''));
    toast((nuevo ? 'Grupo creado: ' : 'Grupo actualizado: ') + g.nombre);
    onClose();
  };
  const eliminar = () => {
    if (usados || hijos) return setErr(['No se puede eliminar: tiene ' + [hijos ? hijos + ' subgrupo(s)' : '', usados ? usados + ' producto(s) o servicio(s)' : ''].filter(Boolean).join(' y ') + '. Puede desactivarlo.']);
    commit((d) => { d.grupos = d.grupos.filter((x) => x.id !== f.id); }, 'Grupo eliminado', f.codigo);
    toast('Grupo eliminado');
    onClose();
  };
  const tarifa = (k) => (
    <select className="select input" value={f[k]} onChange={set(k)}>
      <option value="">{padre && her(k) ? 'Igual al grupo padre: ' + C.TARIFAS_IVA[her(k)] : 'Sin definir'}</option>
      {Object.entries(C.TARIFAS_IVA).map(([a, b]) => <option key={a} value={a}>{b}</option>)}
    </select>
  );
  return (
    <Modal open wide title={(f.id ? 'Editar ' : 'Nuevo ') + (nivel === 1 ? 'grupo' : nivel === 2 ? 'subgrupo' : 'subgrupo de 3.er nivel')} icon={FolderTree} onClose={onClose}
      footer={<>{f.id && <Btn variant="danger" icon={Trash2} onClick={eliminar}>Eliminar</Btn>}<span style={{ flex: 1 }} /><Btn onClick={onClose}>Cancelar</Btn><Btn variant="primary" onClick={guardar}>Guardar</Btn></>}>
      <Errores lista={err} />
      <div className="form-grid">
        <Field label="Clasificación *" hint={padre ? 'La define el grupo principal' : 'Qué agrupa: insumos, productos, medicamentos, procedimientos…'}>
          {padre
            ? <div className="input"><Chip tone={TONO[clas] || 'muted'}>{C.CLASIFICACIONES[clas] || 'Sin clasificación'}</Chip></div>
            : <select className="select input" value={f.clasificacion} onChange={set('clasificacion')} autoFocus={!f.id}><option value="">Elija…</option>{Object.entries(C.CLASIFICACIONES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}
        </Field>
        <Field label="Tipo de concepto" hint="Define la retención en la fuente de sus compras">
          <select className="select input" value={f.conceptoRetencion} onChange={set('conceptoRetencion')}>
            <option value="">{padre && her('conceptoRetencion') ? 'Igual al grupo padre: ' + C.CONCEPTOS_RETENCION[her('conceptoRetencion')] : 'Sin definir'}</option>
            {Object.entries(C.CONCEPTOS_RETENCION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Tarifa IVA compra" hint={esServ ? 'Para servicios que compra (por ejemplo, laboratorio externo)' : 'Se usa en la factura del proveedor si el producto no tiene la suya'}>{tarifa('tarifaIvaCompra')}</Field>
        <Field label="Tarifa IVA venta" hint="Se usa en el precio de productos y servicios">{tarifa('tarifaIvaVenta')}</Field>
        <Field label="Código *"><input className="input mono" value={f.codigo} onChange={set('codigo')} placeholder={nivel === 1 ? 'Ej.: 08' : nivel === 2 ? 'Ej.: 0801' : 'Ej.: 080101'} /></Field>
        <Field label="Descripción *" span><input className="input" value={f.nombre} onChange={set('nombre')} placeholder="Ej.: Endodoncia" /></Field>
        <Field label="Pertenece a (opcional)" span hint="Vacío para un grupo principal. Elija un grupo para crear un subgrupo: hereda la clasificación y lo que deje vacío.">
          <Combo value={f.parentId || ''} onChange={(v) => setF((x) => Object.assign({}, x, { parentId: v }))} options={padres} placeholder="Escriba el grupo padre…" />
        </Field>
      </div>
      <div className="section-title">Cuentas contables</div>
      <div className="form-grid">
        {CUENTAS_GRUPO.filter(([k]) => !(esServ && k === 'inventario')).map(([k, label]) => (
          <Field key={k} label={label} span hint={'Vacío = ' + herCta(k).cuenta + ' · ' + herCta(k).nombre}>
            <SelectCuenta value={f.cuentas[k] || ''} onChange={setCta(k)} placeholder="Escriba los primeros caracteres…" />
          </Field>
        ))}
      </div>
      <div className="section-title">Otros datos</div>
      <div className="form-grid">
        <Field label="Esterilización"><label className="check"><input type="checkbox" checked={!!f.manejaEsterilizacion} onChange={set('manejaEsterilizacion')} /> Maneja esterilización</label></Field>
        <Field label="Posición en el informe" hint="Orden en listas y reportes (vacío = por código)"><input className="input" type="number" min="0" value={f.orden} onChange={set('orden')} placeholder="Ninguna" /></Field>
        <Field label="Estado"><label className="check"><input type="checkbox" checked={f.activo !== false} onChange={set('activo')} /> Activo</label></Field>
        <Field label="Detalle" span><input className="input" value={f.descripcion} onChange={set('descripcion')} placeholder="Opcional" /></Field>
      </div>
    </Modal>
  );
}

export default function Grupos({ arg }) {
  const { db, state, puede, go } = useStore();
  const [editar, setEditar] = useState(arg === 'nuevo' ? {} : null);
  const [q, setQ] = useState('');
  const [clas, setClas] = useState('todas');
  const [ivaC, setIvaC] = useState('');
  const [ivaV, setIvaV] = useState('');
  const [inactivos, setInactivos] = useState(false);
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const arbol = C.arbolGrupos(db);
  const datos = (id) => {
    const set = C.gruposDescendientes(db, id);
    const prods = db.productos.filter((p) => set.has(p.grupoId));
    return { prods: prods.length, servs: db.servicios.filter((s) => set.has(s.grupoId)).length, valor: prods.reduce((s, p) => s + (state.prods[p.id] ? state.prods[p.id].value : 0), 0) };
  };
  const cuenta = (g, k) => { const c = C.cuentaDe(db, k, { grupoId: g.id }); const propia = g.cuentas && g.cuentas[k]; return <span className={'mono small' + (propia ? '' : ' muted')} title={c.nombre + (propia ? '' : ' (heredada)')}>{c.cuenta}</span>; };
  const tarifaTxt = (g, k) => { const t = C.datoGrupo(db, g.id, k); return t ? <span className={g[k] ? '' : 'muted'}>{({ '19': '19 %', '5': '5 %', '19nd': '19 % no desc.', exento: 'Exento', excluido: 'Excluido' })[t]}</span> : '—'; };
  const filas = arbol.filter((g) => {
    const c = C.clasificacionGrupo(db, g.id);
    return (inactivos || g.activo !== false) && (clas === 'todas' || c === clas)
      && (!ivaC || C.datoGrupo(db, g.id, 'tarifaIvaCompra') === ivaC) && (!ivaV || C.datoGrupo(db, g.id, 'tarifaIvaVenta') === ivaV)
      && (!q || norm(g.ruta + ' ' + g.codigo).includes(norm(q)));
  });
  const cuentaClas = (k) => arbol.filter((g) => g.nivel === 1 && g.activo !== false && (k === 'todas' || C.clasificacionGrupo(db, g.id) === k)).length;
  return (
    <Panel title="Grupos de procedimientos, productos, insumos y servicios" icon={FolderTree}
      sub="Cada grupo tiene su clasificación, el tipo de concepto para la retención, las tarifas de IVA de compra y venta y sus cuentas contables. Los subgrupos (opcionales) heredan lo que dejen vacío."
      actions={puede('maestros') && <Btn variant="primary" icon={Plus} onClick={() => setEditar({})}>Nuevo grupo</Btn>}>
      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Descripción o código" />
        <select className="select input" value={ivaC} onChange={(e) => setIvaC(e.target.value)} style={{ maxWidth: 220 }}><option value="">Tarifa IVA compra: todas</option>{Object.entries(C.TARIFAS_IVA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select className="select input" value={ivaV} onChange={(e) => setIvaV(e.target.value)} style={{ maxWidth: 220 }}><option value="">Tarifa IVA venta: todas</option>{Object.entries(C.TARIFAS_IVA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <label className="check"><input type="checkbox" checked={inactivos} onChange={(e) => setInactivos(e.target.checked)} /> Mostrar inactivos</label>
      </div>
      <Tabs value={clas} onChange={setClas} options={[['todas', 'Todas (' + cuentaClas('todas') + ')'], ...Object.entries(C.CLASIFICACIONES).map(([k, v]) => [k, v + ' (' + cuentaClas(k) + ')'])]} />
      {filas.length ? (
        <div className="tbl-wrap" style={{ marginTop: 12 }}>
          <table className="tbl">
            <thead><tr><th>Código</th><th>Descripción</th><th>Clasificación</th><th>Concepto</th><th>IVA compra</th><th>IVA venta</th><th>Cta. ingreso</th><th>Cta. gasto</th><th>Cta. por pagar</th><th className="num">Usos</th><th className="num">Valor en inventario</th><th>Activo</th><th /></tr></thead>
            <tbody>
              {filas.map((g) => {
                const d = datos(g.id);
                const c = C.clasificacionGrupo(db, g.id);
                const esServ = C.CLASIF_SERVICIO.includes(c);
                const concepto = C.datoGrupo(db, g.id, 'conceptoRetencion');
                return (
                  <tr key={g.id} className={'arbol n' + g.nivel} style={g.activo === false ? { opacity: 0.5 } : undefined}>
                    <td className="mono">{g.codigo}</td>
                    <td style={{ paddingLeft: 12 + (g.nivel - 1) * 24 }}>
                      <a href="#" className={g.nivel === 1 ? 'strong' : ''} onClick={(e) => { e.preventDefault(); go(esServ ? 'kits' : 'productos', 'grupo:' + g.id); }}>{g.nivel > 1 ? '└ ' : ''}{g.nombre}</a>
                      {(g.descripcion || C.datoGrupo(db, g.id, 'manejaEsterilizacion')) && <div className="small muted">{[g.descripcion, C.datoGrupo(db, g.id, 'manejaEsterilizacion') ? 'Maneja esterilización' : ''].filter(Boolean).join(' · ')}</div>}
                    </td>
                    <td>{g.nivel === 1 ? <Chip tone={TONO[c] || 'muted'}>{C.CLASIFICACIONES[c] || 'Sin clasificación'}</Chip> : <span className="small muted">{C.CLASIFICACIONES[c]}</span>}</td>
                    <td className="small">{concepto ? <span className={g.conceptoRetencion ? '' : 'muted'}>{C.CONCEPTOS_RETENCION[concepto]}</span> : '—'}</td>
                    <td className="small">{tarifaTxt(g, 'tarifaIvaCompra')}</td>
                    <td className="small">{tarifaTxt(g, 'tarifaIvaVenta')}</td>
                    <td>{cuenta(g, 'ingreso')}</td>
                    <td>{cuenta(g, 'costoConsumo')}</td>
                    <td>{cuenta(g, 'proveedores')}</td>
                    <td className="num">{esServ ? num(d.servs) + ' serv.' : num(d.prods) + ' prod.'}</td>
                    <td className="num">{esServ ? '—' : money(d.valor)}</td>
                    <td>{g.activo !== false ? <Chip tone="green" dot>Sí</Chip> : <Chip tone="muted">No</Chip>}</td>
                    <td className="acts">
                      {puede('maestros') && g.nivel < 3 && <Btn variant="ghost" size="sm" icon={Plus} onClick={() => setEditar({ parentId: g.id })} title="Agregar un subgrupo">Subgrupo</Btn>}
                      {puede('maestros') && <Btn variant="ghost" size="sm" icon={Pencil} onClick={() => setEditar(db.grupos.find((x) => x.id === g.id))} title="Modificar" />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <Empty icon={FolderTree} title="Sin grupos" text={q || clas !== 'todas' || ivaC || ivaV ? 'Ningún grupo coincide con los filtros.' : 'Cree el primer grupo.'} />}
      <div style={{ marginTop: 14 }}><Nota>Ejemplos: "Endodoncia" como <b>procedimiento</b> (agrupa los servicios de conductos) y "Endodoncia" como <b>insumo</b> (limas, conos, irrigantes). Las cuentas y tarifas en gris son heredadas: vienen del grupo padre o de Contabilidad › Parametrización.</Nota></div>
      {editar && <FormGrupo inicial={editar} onClose={() => setEditar(null)} />}
    </Panel>
  );
}
