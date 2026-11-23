import { useState } from 'react';
import { ScanSearch } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { Btn, Chip, Empty, Nota, Panel } from '../components/ui.jsx';
import { fecha, money, num, TONO_MOV } from '../format.js';

export default function Trazabilidad() {
  const { db, state } = useStore();
  const [texto, setTexto] = useState('');
  const [buscado, setBuscado] = useState('');
  const buscar = () => {
    const g = C.parseGS1(texto);
    setBuscado(g && g.lote ? g.lote : texto.trim());
  };
  const res = C.trazabilidad(db, state, buscado);
  const recibido = res.filter((r) => !r.anulado && (r.tipo === 'entrada' || (r.tipo === 'ajuste' && r.cantidad > 0))).reduce((s, r) => s + r.cantidad, 0);
  const usado = res.filter((r) => !r.anulado && (r.tipo === 'salida' || r.tipo === 'baja' || (r.tipo === 'ajuste' && r.cantidad < 0))).reduce((s, r) => s + Math.abs(r.cantidad), 0);
  const pacientes = new Set(res.filter((r) => !r.anulado && r.tipo === 'salida' && r.mov.destinoTipo === 'Paciente').map((r) => r.mov.destino));

  return (
    <div className="stack">
      <Panel title="Trazabilidad por lote" icon={ScanSearch} sub="Encuentre de qué proveedor llegó un lote, con qué factura y dónde se usó. Sirve para tecnovigilancia (Res. 4816 de 2008) y retiros de producto.">
        <div className="scanbox">
          <ScanSearch size={20} />
          <input className="input mono" value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar()} placeholder="Número de lote o código GS1 / UDI" autoFocus />
          <Btn variant="primary" onClick={buscar}>Rastrear</Btn>
        </div>
      </Panel>
      {buscado && (
        <Panel title={'Resultado: ' + buscado} icon={ScanSearch}>
          {res.length ? (
            <>
              <div className="kv">
                <div><span>Recibido</span><b>{num(recibido)}</b></div>
                <div><span>Usado o dado de baja</span><b>{num(usado)}</b></div>
                <div><span>Pacientes con este lote</span><b>{pacientes.size}</b></div>
                <div><span>Movimientos</span><b>{res.length}</b></div>
              </div>
              <div className="timeline">
                {res.map((r, i) => (
                  <div key={i} className="tl-item" style={r.anulado ? { opacity: 0.45 } : undefined}>
                    <div><Chip tone={TONO_MOV[r.tipo]} dot>{C.TIPOS_MOV[r.tipo]}</Chip><div className="small muted" style={{ marginTop: 6 }}>{fecha(r.fecha)}</div></div>
                    <div>
                      <div className="strong">{r.producto ? r.producto.nombre : '—'} · lote <span className="mono">{r.linea.lote}</span></div>
                      <div className="small muted">{r.num} · {r.detalle}{r.anulado ? ' · ANULADO' : ''}</div>
                    </div>
                    <div className="num"><div className="strong">{num(r.cantidad)}</div><div className="small muted">{r.valor !== null ? money(r.valor) : ''}</div></div>
                  </div>
                ))}
              </div>
            </>
          ) : <Empty icon={ScanSearch} title="Sin resultados" text="Ningún movimiento tiene ese lote." />}
        </Panel>
      )}
      {!buscado && <Nota>Pruebe con un lote de la demostración, por ejemplo IM-77120 (implantes) o GN-7781 (guantes).</Nota>}
    </div>
  );
}
