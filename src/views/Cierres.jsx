import { useState } from 'react';
import { Download, Eye, Lock, Plus } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { Btn, Empty, Errores, Field, Modal, Nota, Panel } from '../components/ui.jsx';
import { descargar, fecha, fechaHora, money, money2, num } from '../format.js';

function TablaCierre({ c }) {
  return (
    <>
      <div className="kv">
        <div><span>Valor al costo</span><b>{money(c.valorBruto)}</b></div>
        <div><span>Deterioro por VNR</span><b>{money(c.deterioro)}</b></div>
        <div><span>Valor neto</span><b>{money(c.valorNeto)}</b></div>
        <div><span>Reversión del periodo</span><b>{money(c.reversion)}</b></div>
        <div><span>Nuevo deterioro</span><b>{money(c.nuevoDeterioro)}</b></div>
        <div><span>Método</span><b>{C.METODOS[c.metodo]}</b></div>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Código</th><th>Producto</th><th className="num">Existencia</th><th className="num">Costo unit.</th><th className="num">VNR unit.</th><th className="num">Valor costo</th><th className="num">Deterioro</th></tr></thead>
          <tbody>
            {c.lineas.map((l) => (
              <tr key={l.productoId}>
                <td className="mono">{l.codigo}</td><td>{l.nombre}</td><td className="num">{num(l.qty)}</td>
                <td className="num">{money2(l.costoUnit)}</td><td className="num">{l.vnrUnit === null ? '—' : money2(l.vnrUnit)}</td>
                <td className="num">{money(l.valor)}</td><td className={'num' + (l.deterioro ? ' red-t' : '')}>{money(l.deterioro)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={5}>Total</td><td className="num">{money(c.valorBruto)}</td><td className="num">{money(c.deterioro)}</td></tr></tfoot>
        </table>
      </div>
    </>
  );
}

function NuevoCierre({ onClose }) {
  const { db, hoy, commit, toast } = useStore();
  const [f, setF] = useState(hoy);
  const prep = C.prepararCierre(db, f);
  const [err, setErr] = useState([]);
  const cerrar = () => {
    if (prep.errores.length) return setErr(prep.errores);
    if (f > hoy) return setErr(['La fecha de cierre no puede ser futura.']);
    const numero = 'CI-' + String((db.seq.CI || 0) + 1).padStart(5, '0');
    commit((d) => {
      d.cierres.push(Object.assign({ id: C.nuevoId(), num: C.siguienteNumero(d, 'cierre'), usuario: d.config.usuario, creado: new Date().toISOString() }, prep.cierre));
    }, 'Cierre de periodo', numero + ' al ' + f);
    toast('Periodo cerrado al ' + fecha(f));
    onClose();
  };
  return (
    <Modal open wide title="Cierre de periodo" icon={Lock} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancelar</Btn><Btn variant="primary" icon={Lock} onClick={cerrar} disabled={prep.errores.length > 0}>Cerrar periodo</Btn></>}>
      <Errores lista={err.length ? err : prep.errores} />
      <div className="form-grid" style={{ marginBottom: 16 }}>
        <Field label="Fecha de cierre"><input className="input" type="date" value={f} max={hoy} onChange={(e) => { setF(e.target.value); setErr([]); }} /></Field>
      </div>
      {prep.cierre && <TablaCierre c={prep.cierre} />}
      <div style={{ marginTop: 14 }}>
        <Nota>Al cerrar, ningún movimiento con fecha igual o anterior se puede registrar ni anular. El inventario se mide al menor entre costo y valor neto realizable (NIC 2 / Sección 13); si el VNR se recupera, el deterioro se revierte en el siguiente cierre.</Nota>
      </div>
    </Modal>
  );
}

export default function Cierres() {
  const { db } = useStore();
  const [nuevo, setNuevo] = useState(false);
  const [ver, setVer] = useState(null);
  const lista = db.cierres.slice().sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  const exportar = (c) => {
    const rows = [['Código', 'Producto', 'Existencia', 'Costo unitario', 'VNR unitario', 'Valor costo', 'Deterioro']];
    c.lineas.forEach((l) => rows.push([l.codigo, l.nombre, l.qty, C.r2(l.costoUnit), l.vnrUnit === null ? '' : l.vnrUnit, l.valor, l.deterioro]));
    rows.push(['', 'TOTAL', '', '', '', c.valorBruto, c.deterioro]);
    descargar('cierre-' + c.fecha + '.csv', C.csv(rows));
  };
  return (
    <Panel title="Cierres de periodo" icon={Lock} sub="Congela el periodo y calcula el deterioro por valor neto realizable."
      actions={<Btn variant="primary" icon={Plus} onClick={() => setNuevo(true)}>Nuevo cierre</Btn>}>
      {lista.length ? (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Cierre</th><th>Fecha de corte</th><th>Método</th><th className="num">Valor costo</th><th className="num">Deterioro</th><th className="num">Valor neto</th><th>Registrado</th><th /></tr></thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.id || c.fecha}>
                  <td className="mono">{c.num}</td><td>{fecha(c.fecha)}</td><td>{C.METODOS[c.metodo]}</td>
                  <td className="num">{money(c.valorBruto)}</td><td className="num">{money(c.deterioro)}</td><td className="num strong">{money(c.valorNeto)}</td>
                  <td className="small muted">{c.usuario} · {fechaHora(c.creado)}</td>
                  <td className="acts"><Btn variant="ghost" size="sm" icon={Eye} onClick={() => setVer(c)} /><Btn variant="ghost" size="sm" icon={Download} onClick={() => exportar(c)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty icon={Lock} title="Sin cierres" text="Haga el primer cierre de periodo." />}
      {nuevo && <NuevoCierre onClose={() => setNuevo(false)} />}
      {ver && <Modal open wide title={'Cierre ' + ver.num + ' al ' + fecha(ver.fecha)} icon={Lock} onClose={() => setVer(null)} footer={<Btn onClick={() => setVer(null)}>Cerrar</Btn>}><TablaCierre c={ver} /></Modal>}
    </Panel>
  );
}
