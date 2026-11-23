import { Scale } from 'lucide-react';
import { Chip, Nota, Panel } from '../components/ui.jsx';

const NORMAS = [
  { n: 'NIC 2 · Inventarios', a: 'Contable · Grupo 1 e internacional', t: 'cyan',
    d: 'Mide los inventarios al menor entre costo y valor neto realizable. Permite PEPS, promedio ponderado o identificación específica; prohíbe UEPS. La rebaja de valor se revierte si se recupera.',
    s: 'Kardex por promedio o PEPS (sin UEPS), costo con cargos no recuperables y deterioro por VNR con reversión en Cierres.' },
  { n: 'NIIF para Pymes · Sección 13', a: 'Contable · Grupo 2 (Decreto 2420 de 2015, Anexo 2)', t: 'cyan',
    d: 'Mismas reglas de la NIC 2, simplificadas. La 3.ª edición rige desde 2027 en el mundo; en Colombia el CTCP propuso el 1 de enero de 2028.',
    s: 'El grupo NIIF de la empresa se elige en Configuración; las reglas de valoración son las mismas.' },
  { n: 'Decreto 2420 de 2015 · Anexo 3', a: 'Contable · Grupo 3 (microempresas)', t: 'cyan',
    d: 'Contabilidad simplificada; los inventarios se miden al costo.',
    s: 'Use promedio ponderado y no registre VNR en los productos.' },
  { n: 'Estatuto Tributario art. 62', a: 'Tributario', t: 'violet',
    d: 'Sistemas para establecer el costo: juego de inventarios (periódico) o inventarios permanentes.',
    s: 'El sistema es siempre permanente: cada movimiento actualiza cantidad y costo al instante.' },
  { n: 'Estatuto Tributario art. 64', a: 'Tributario', t: 'violet',
    d: 'Los faltantes de mercancía de fácil destrucción o pérdida se aceptan hasta el 3 % del inventario inicial más las compras.',
    s: 'Calcula el porcentaje del año en Ajustes y bajas y alerta si se supera el límite configurado.' },
  { n: 'Estatuto Tributario art. 65 (Ley 1819 de 2016)', a: 'Tributario', t: 'violet',
    d: 'Los métodos de valoración son los de la técnica contable. El método se aplica de forma uniforme en el año.',
    s: 'El método se fija por año en Configuración y queda bloqueado cuando el año ya tiene movimientos.' },
  { n: 'Estatuto Tributario art. 771-2 · Resolución DIAN 000227', a: 'Tributario · soportes', t: 'violet',
    d: 'Los costos se soportan con factura electrónica; si el proveedor no está obligado a facturar, con documento soporte.',
    s: 'Ninguna entrada se registra sin tipo y número de soporte; se bloquean documentos repetidos.' },
  { n: 'Código de Comercio art. 52', a: 'Comercial', t: 'green',
    d: 'El comerciante elabora inventario al iniciar actividades y al menos una vez al año.',
    s: 'Conteo físico anual con alerta mientras esté pendiente; las diferencias generan un ajuste con acta.' },
  { n: 'Resolución 3100 de 2019', a: 'Salud · habilitación', t: 'amber',
    d: 'Dispositivos con registro INVIMA vigente y clasificación por riesgo; área de almacenamiento; suficiencia según uso; notificación si se rompe la cadena de frío.',
    s: 'Ficha sanitaria del producto, bloqueo de compras sin INVIMA vigente, stock mínimo, ubicaciones y registro de temperaturas.' },
  { n: 'Decreto 4725 de 2005', a: 'Salud · dispositivos médicos', t: 'amber',
    d: 'Régimen de registro sanitario y vigilancia de los dispositivos médicos.',
    s: 'Registro INVIMA, fabricante y GTIN por producto.' },
  { n: 'Resolución 4816 de 2008', a: 'Salud · tecnovigilancia', t: 'amber',
    d: 'Reporte de eventos adversos y defectos de calidad de dispositivos médicos.',
    s: 'Trazabilidad por lote: proveedor, factura y pacientes o consultorios donde se usó.' },
  { n: 'Decreto 2200 de 2005 · Resolución 1403 de 2007', a: 'Salud · medicamentos', t: 'amber',
    d: 'Control de fechas de vencimiento y almacenamiento de medicamentos.',
    s: 'Semáforo de vencimientos, salidas por FEFO y bloqueo de lotes vencidos.' },
  { n: 'US GAAP ASC 330 · IRC 471 y 472', a: 'Referencia · Estados Unidos', t: 'muted',
    d: 'Permite UEPS (LIFO) con la regla de conformidad fiscal; la rebaja de valor no se revierte.',
    s: 'No aplica en Colombia; NOVA no ofrece UEPS.' },
  { n: 'Reglamento europeo MDR art. 27', a: 'Referencia · Unión Europea', t: 'muted',
    d: 'Las instituciones de salud guardan el UDI de los implantables clase III.',
    s: 'Lectura de códigos GS1 / UDI al recibir y rastrear.' }
];

export default function Normativa() {
  return (
    <div className="stack">
      <Panel title="Mapa normativo" icon={Scale} sub="Qué exige cada norma y cómo lo cumple NOVA. Revise los puntos marcados con su contador antes de usar el sistema en producción.">
        <Nota>
          Puntos pendientes de confirmar en el texto oficial: vigencia del parágrafo del art. 65 y del límite del 3 % del art. 64 del Estatuto Tributario tras la Ley 1819 de 2016,
          el texto del art. 52 del Código de Comercio, el tratamiento del Anexo 3 y la fecha de adopción en Colombia de la 3.ª edición de la NIIF para Pymes.
        </Nota>
      </Panel>
      <div className="law">
        {NORMAS.map((x) => (
          <Panel key={x.n}>
            <Chip tone={x.t}>{x.a}</Chip>
            <h3>{x.n}</h3>
            <p>{x.d}</p>
            <div className="apply"><b>En NOVA:</b> {x.s}</div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
