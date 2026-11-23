import { CircleCheck, Circle, Compass, ArrowRight } from 'lucide-react';
import { useStore } from '../store.jsx';
import { Btn, Panel } from '../components/ui.jsx';

const PROCESOS = [
  {
    t: 'Cómo hacer una orden de compra', ruta: ['ordenes', 'nuevo'], boton: 'Nueva orden de compra',
    pasos: [
      'Menú Compras › Órdenes de compra › "Nueva orden".',
      'Elija el proveedor, la fecha de entrega prevista y la bodega donde se recibirá.',
      'Agregue cada producto con la cantidad (en unidad de consumo) y el costo pactado.',
      'Pulse "Crear orden". Puede imprimirla y enviarla al proveedor.',
      'Atajo: en Reabastecimiento el sistema sugiere qué pedir y arma la orden por proveedor.'
    ]
  },
  {
    t: 'Cómo hacer una entrada de inventario (recibir mercancía)', ruta: ['entradas', 'nuevo'], boton: 'Nueva entrada',
    pasos: [
      'Menú Operación › Entradas › "Nueva entrada". Si hay orden de compra, ábrala y pulse "Recibir mercancía": se cargan los productos pendientes.',
      'Paso 1, documento: bodega que recibe, proveedor, tipo de soporte (factura electrónica o documento soporte) y su número. Agregue fletes o seguros en "Costos adicionales".',
      'Paso 2, productos: una línea por lote. Elija el producto, escriba el número de lote del empaque y la fecha de vencimiento (si el lote ya existe, la fecha se completa sola).',
      'Escriba cantidad y costo unitario sin IVA descontable. Si compra por caja, elija la unidad de compra y el sistema convierte a unidades.',
      'Pulse "Registrar entrada". El lote queda creado en el maestro de lotes y el kardex se actualiza.',
      'Atajo: escanee el código GS1 / UDI del empaque y se llenan producto, lote y vencimiento.'
    ]
  },
  {
    t: 'Cómo crear un lote y registrar su vencimiento', ruta: ['lotes', 'nuevo'], boton: 'Nuevo lote',
    pasos: [
      'Normalmente el lote se crea solo al registrar la entrada (número de lote + fecha de vencimiento en la línea).',
      'Para crearlo antes: Maestros › Lotes › "Nuevo lote". Indique producto, número de lote, fecha de fabricación y fecha de vencimiento.',
      'Desde el maestro de lotes puede poner un lote en cuarentena o bloquearlo (por alerta sanitaria o excursión de temperatura) y liberarlo después.',
      'El semáforo de vencimientos (Control › Vencimientos) avisa en rojo y amarillo según los días configurados.'
    ]
  },
  {
    t: 'Cómo crear bodegas y grupos', ruta: ['bodegas', 'nuevo'], boton: 'Nueva bodega',
    pasos: [
      'Maestros › Bodegas › "Nueva bodega": código, nombre, tipo (bodega, consultorio, nevera, cuarentena), responsable y sede. Marque cuál es la principal.',
      'Maestros › Grupos de productos › "Nuevo grupo": por ejemplo Resinas, Anestésicos, Bioseguridad.',
      'En la ficha de cada producto elija su grupo y su bodega habitual.'
    ]
  },
  {
    t: 'Cómo entregar insumos a un consultorio o paciente', ruta: ['salidas', 'nuevo'], boton: 'Nueva salida',
    pasos: [
      'Para surtir un consultorio: Traslados › "Nuevo traslado" de la bodega principal al consultorio (o atienda su requisición).',
      'Para registrar el consumo: Salidas › "Nueva salida", bodega de donde sale, paciente (historia clínica) y procedimiento.',
      'Use un kit por procedimiento para descontar todos los insumos de una vez. Los lotes se asignan solos por fecha de vencimiento.'
    ]
  }
];

export default function Guia() {
  const { db, go, puede } = useStore();
  const pasos = [
    ['Datos de la empresa y método de valoración', db.config.empresa.nombre && db.config.empresa.nombre !== 'Mi empresa', 'config', '', 'config'],
    ['Crear las bodegas (principal, consultorios, nevera)', db.bodegas.length > 1, 'bodegas', 'nuevo', 'config'],
    ['Crear los grupos de productos', db.grupos.length > 0, 'grupos', 'nuevo', 'maestros'],
    ['Registrar los terceros (proveedores con NIT)', db.proveedores.length > 0, 'terceros', 'nuevo', 'maestros'],
    ['Crear los productos (o importarlos desde Excel)', db.productos.length > 0, 'productos', 'nuevo', 'maestros'],
    ['Cargar el saldo inicial (importación) o la primera compra', db.movimientos.some((m) => m.tipo === 'inicial' || m.tipo === 'entrada'), 'importar', '', 'importar'],
    ['Hacer órdenes de compra y recibir mercancía', db.ordenes.length > 0, 'ordenes', 'nuevo', 'ordenes'],
    ['Registrar traslados y consumos', db.movimientos.some((m) => m.tipo === 'salida' || m.tipo === 'traslado'), 'salidas', 'nuevo', 'salidas'],
    ['Crear usuarios para cada persona', db.usuarios.length > 1, 'usuarios', '', 'usuarios'],
    ['Hacer el conteo físico y el cierre del periodo', db.cierres.length > 0, 'conteos', '', 'conteoAbrir']
  ];
  const hechos = pasos.filter((p) => p[1]).length;
  return (
    <div className="stack">
      <Panel title={'Primeros pasos · ' + hechos + ' de ' + pasos.length} icon={Compass} sub="Siga este orden para dejar el inventario funcionando. Cada paso abre la pantalla correspondiente.">
        <div className="steps">
          {pasos.map(([t, ok, ruta, arg, perm], i) => (
            <div key={t} className={'step' + (ok ? ' ok' : '')}>
              <span className="n">{ok ? <CircleCheck size={20} /> : <Circle size={20} />}</span>
              <span className="t"><b>{i + 1}.</b> {t}</span>
              {puede(perm) && <Btn size="sm" icon={ArrowRight} onClick={() => go(ruta, arg)}>Ir</Btn>}
            </div>
          ))}
        </div>
      </Panel>
      <div className="law">
        {PROCESOS.map((p) => (
          <Panel key={p.t}>
            <h3>{p.t}</h3>
            <ol className="howto">{p.pasos.map((x, i) => <li key={i}>{x}</li>)}</ol>
            <Btn variant="primary" size="sm" icon={ArrowRight} onClick={() => go(p.ruta[0], p.ruta[1])}>{p.boton}</Btn>
          </Panel>
        ))}
      </div>
    </div>
  );
}
