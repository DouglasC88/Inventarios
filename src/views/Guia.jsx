import { useState } from 'react';
import { ArrowRight, Circle, CircleCheck, Compass, LifeBuoy } from 'lucide-react';
import { useStore } from '../store.jsx';
import { Btn, Panel, SearchBox, Tabs } from '../components/ui.jsx';

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Portal de ayuda: artículos "cómo hacer", agrupados por sección del menú.
const ARTICULOS = [
  ['terceros', 'Cómo crear un tercero (proveedor, cliente o paciente)', ['terceros', 'nuevo'], [
    'Menú Terceros › "Nuevo tercero".',
    'Elija tipo de persona y tipo de documento. Para NIT escriba el número sin el dígito de verificación: el sistema lo calcula.',
    'Escriba la razón social o el nombre, y marque si es proveedor, cliente, paciente o empleado.',
    'Complete dirección, ciudad, correo de facturación, si es responsable de IVA y si factura electrónicamente.',
    'También puede crearlo desde cualquier buscador de tercero: escriba el NIT y elija "Crear tercero".'
  ]],
  ['productos', 'Cómo crear un producto o insumo con sus lotes', ['productos', 'nuevo'], [
    'Menú Productos y servicios › Productos › "Nuevo": elija qué va a crear (insumo, dispositivo médico, medicamento, instrumental o equipo, o servicio).',
    'Identificación: código, nombre, clasificación (escriba la línea o grupo), tipo de material, marca, presentación y código de barras.',
    'Almacenamiento: unidad, mínimo, máximo, bodega habitual y ubicación física. Marque si maneja lote y vencimiento.',
    'Compras: unidad de compra (por ejemplo, caja x50), proveedor preferido y días de entrega.',
    'Sanitaria: registro INVIMA, vencimiento del registro, clase de riesgo y cadena de frío.',
    'Lotes y existencia inicial: "Agregar lote" con número, fabricación y vencimiento; si ya lo tiene en bodega, escriba la cantidad y el costo.'
  ]],
  ['productos', 'Cómo crear un servicio y los insumos que consume', ['kits', 'nuevo'], [
    'Menú Productos y servicios › Servicios › "Nuevo servicio".',
    'Escriba código, nombre, categoría, código CUPS, precio e IVA.',
    'Agregue cada insumo y la cantidad que consume por servicio (se admiten fracciones, como 0,25 de jeringa).',
    'El sistema muestra el costo de insumos y el margen frente al precio.',
    'En Salidas elija el servicio y cuántas veces se hizo: se descuentan todos sus insumos por lote.'
  ]],
  ['productos', 'Cómo crear la clasificación (línea, grupo y subgrupo)', ['grupos', 'nuevo'], [
    'Menú Productos y servicios › Clasificación › "Nueva línea" (por ejemplo, Operatoria).',
    'En la fila de la línea pulse "+ Grupo" (Resinas y adhesivos) y en el grupo "+ Subgrupo" (Resinas compuestas).',
    'Asigne a cada producto el nivel más específico. Los filtros y reportes por línea incluyen sus grupos y subgrupos.'
  ]],
  ['productos', 'Cómo crear un lote y registrar su vencimiento', ['lotes', 'nuevo'], [
    'Desde la ficha del producto (sección Lotes y existencia inicial) o en Productos y servicios › Lotes › "Nuevo lote".',
    'También se crea solo al registrar una entrada: número de lote y fecha de vencimiento en la línea.',
    'Desde Lotes puede poner un lote en cuarentena o bloquearlo (alerta sanitaria, excursión de temperatura) y liberarlo después.'
  ]],
  ['productos', 'Cómo cargar productos y existencias desde Excel', ['importar', ''], [
    'Menú Productos y servicios › Carga desde Excel › pestaña Productos › "Plantilla".',
    'Llene una fila por lote: código, nombre, clasificación, unidad, lote, vencimiento, cantidad y costo.',
    'Suba el archivo: verá la vista previa con errores por fila. Pulse "Aplicar importación".'
  ]],
  ['terceros', 'Cómo cargar terceros de forma masiva', ['importar', 'terceros'], [
    'Menú Productos y servicios › Carga desde Excel › pestaña Terceros › "Plantilla".',
    'Una fila por tercero: tipo de documento, número (sin dígito de verificación), razón social, tipo (proveedor, cliente, paciente, empleado), ciudad, correo y teléfono.',
    'Suba el archivo: el sistema calcula el DV, marca los que ya existen (se actualizan) y los que tienen errores.',
    'Pulse "Cargar terceros".'
  ]],
  ['compras', 'Cómo hacer una orden de compra', ['ordenes', 'nuevo'], [
    'Menú Compras y entradas › Órdenes de compra › "Nueva orden".',
    'Escriba el NIT o nombre del proveedor, la fecha de entrega y la bodega que recibe.',
    'Agregue productos con cantidad y costo pactado. Imprímala y envíela al proveedor.',
    'Atajo: Compras y entradas › Reabastecimiento sugiere qué pedir y arma la orden por proveedor.'
  ]],
  ['compras', 'Cómo hacer una entrada de inventario', ['entradas', 'nuevo'], [
    'Menú Compras y entradas › Entradas › "Nueva entrada" (o desde la orden: "Recibir mercancía").',
    'Documento: bodega que recibe, proveedor, factura electrónica o documento soporte y su número; fletes en "Costos adicionales".',
    'Productos: una línea por lote con número de lote, vencimiento, cantidad y costo sin IVA descontable.',
    'Si compra por caja, elija la unidad de compra: el sistema convierte a unidades. Puede escanear el código GS1 / UDI.'
  ]],
  ['compras', 'Cómo devolver mercancía al proveedor', ['devoluciones', 'nuevo'], [
    'Menú Compras y entradas › Devoluciones › "Nueva devolución".',
    'Proveedor, bodega, causa y número de la nota crédito; elija los lotes (solo aparecen los recibidos de ese proveedor).'
  ]],
  ['salidas', 'Cómo registrar el consumo de un paciente o servicio', ['salidas', 'nuevo'], [
    'Menú Salidas y movimientos › Salidas › "Nueva salida".',
    'Bodega de donde sale, tipo de destino (paciente, consultorio, servicio o venta) e historia clínica.',
    'Elija el servicio realizado y "Agregar insumos del servicio", o escriba los productos uno a uno.',
    'Los lotes se asignan solos por fecha de vencimiento; los vencidos o en cuarentena nunca se entregan.'
  ]],
  ['salidas', 'Cómo surtir un consultorio (traslado o requisición)', ['traslados', 'nuevo'], [
    'Traslado directo: Salidas y movimientos › Traslados › "Nuevo traslado", de la bodega principal al consultorio.',
    'Con requisición: el consultorio crea la requisición; la bodega la abre y pulsa "Atender con traslado".'
  ]],
  ['salidas', 'Cómo registrar faltantes, sobrantes o bajas', ['ajustes', ''], [
    'Menú Salidas y movimientos › Ajustes y bajas.',
    'Ajuste: lote, causa (faltante, sobrante, corrección), cantidad, acta y quién autoriza.',
    'Baja: vencidos, dañados, retiro de mercado o ruptura de cadena de frío, con acta y autorización.'
  ]],
  ['kardex', 'Cómo cargar el inventario físico desde Excel', ['conteos', 'excel'], [
    'Menú Kardex e inventario › Inventario físico › "Cargar desde Excel".',
    'Descargue la plantilla con sus existencias por bodega y lote; escriba la "Cantidad contada".',
    'Suba el archivo: verá faltantes, sobrantes y lotes nuevos. Cree el conteo, escriba el acta y "Aplicar conteo".'
  ]],
  ['kardex', 'Cómo consultar existencias y kardex', ['existencias', ''], [
    'Kardex e inventario › Existencias: tarjeta General y una por bodega; toque una para filtrar.',
    'Busque por nombre, código o lote. Desde cada insumo abra su kardex o la trazabilidad del lote.'
  ]],
  ['kardex', 'Cómo cerrar el periodo', ['cierres', ''], [
    'Kardex e inventario › Cierres › "Nuevo cierre". Revise el deterioro por valor neto realizable.',
    'Al cerrar, nadie puede registrar ni anular movimientos con fecha igual o anterior.'
  ]],
  ['contabilidad', 'Cómo cargar o ajustar el plan de cuentas', ['plan', ''], [
    'El sistema trae el PUC (Dec. 2650/1993) con las cuentas que usa el inventario.',
    'Para usar el plan de su empresa: Contabilidad › Plan de cuentas › "Cargar desde Excel" (o Carga desde Excel › Plan de cuentas). Columnas: código, nombre, naturaleza (D o C) y si exige tercero.',
    'Elija "Combinar" (agrega y actualiza) o "Reemplazar" (no deja borrar cuentas que ya tienen movimiento).',
    'Solo las cuentas sin subcuentas reciben movimiento. Si crea subcuentas (por ejemplo 145505), actualice la parametrización.'
  ]],
  ['contabilidad', 'Cómo configurar las cuentas contables', ['ccuentas', ''], [
    'Menú Contabilidad › Parametrización: revise la cuenta de cada concepto (inventario 1455, puente 233595, proveedores 2205, IVA 2408, retenciones 236540, 2367 y 2368, costo 6155…).',
    'Opcional: asigne cuentas propias a una línea o grupo de la clasificación; los niveles inferiores las heredan.',
    'Defina si usa cuenta puente (mercancía recibida por facturar), centro de costo por bodega y los porcentajes de retención.',
    'Valide la parametrización con su contador.'
  ]],
  ['contabilidad', 'Cómo registrar la factura del proveedor', ['facturasp', 'nuevo'], [
    'Primero se registra la entrada (lo que llegó). Contablemente queda en la cuenta puente "mercancía recibida por facturar".',
    'Cuando llegue la factura: Contabilidad › Facturas de proveedor › "Registrar factura". Elija el proveedor y marque las líneas recibidas que cubre.',
    'Escriba el valor facturado por línea: si difiere de lo recibido, la diferencia de precio se contabiliza aparte.',
    'El sistema calcula IVA descontable, retención en la fuente, reteIVA y reteICA, y el total a pagar.',
    'La puente queda en cero cuando todo lo recibido está facturado (Contabilidad › Conciliación).'
  ]],
  ['contabilidad', 'Cómo pasar el inventario a la contabilidad', ['comprobantes', ''], [
    'Menú Contabilidad › Comprobantes: cada movimiento, factura y cierre genera su comprobante automáticamente; los anulados generan su reversión.',
    'Para reclasificaciones o ajustes use "Comprobante manual" (debe cuadrar y usar cuentas de movimiento).',
    'Consulte Libro diario, Mayor y balances, Auxiliares (por cuenta y tercero) y Estado de costo.',
    'Contabilidad › Interfaz contable: diseñe el archivo (columnas, separador, formato de fecha) para su software contable y descárguelo.',
    'Contabilidad › Conciliación compara el saldo contable del inventario con el kardex y la cuenta puente con lo pendiente por facturar.'
  ]],
  ['reportes', 'Cómo sacar un reporte', ['reportes', ''], [
    'Menú Reportes: elija uno de los 32 reportes.',
    'Use los filtros (fechas, bodega, clasificación, producto, tercero), ordene con un clic en la columna.',
    'Exporte a Excel o imprima / guarde en PDF.'
  ]],
  ['config', 'Cómo crear usuarios y bodegas', ['usuarios', ''], [
    'Configuración › Usuarios: usuario, nombre, rol y PIN. El rol define qué puede hacer cada persona.',
    'Configuración › Bodegas: código, nombre, tipo (bodega, consultorio, nevera, cuarentena), responsable y si es la principal.'
  ]]
];
const SECCIONES = [['todas', 'Todas'], ['terceros', 'Terceros'], ['productos', 'Productos y servicios'], ['compras', 'Compras y entradas'], ['salidas', 'Salidas'], ['kardex', 'Kardex e inventario'], ['contabilidad', 'Contabilidad'], ['reportes', 'Reportes'], ['config', 'Configuración']];

export function PrimerosPasos() {
  const { db, go, puede } = useStore();
  const pasos = [
    ['Datos de la empresa y método de valoración', db.config.empresa.nombre && db.config.empresa.nombre !== 'Mi empresa', 'config', '', 'config'],
    ['Crear las bodegas (principal, consultorios, nevera)', db.bodegas.length > 1, 'bodegas', 'nuevo', 'config'],
    ['Crear la clasificación: líneas, grupos y subgrupos', db.grupos.length > 0, 'grupos', 'nuevo', 'maestros'],
    ['Registrar los terceros (proveedores con NIT)', db.proveedores.length > 0, 'terceros', 'nuevo', 'maestros'],
    ['Crear los productos con sus lotes (o cargarlos desde Excel)', db.productos.length > 0, 'productos', 'nuevo', 'maestros'],
    ['Crear los servicios y los insumos que consumen', db.servicios.length > 0, 'kits', 'nuevo', 'maestros'],
    ['Revisar las cuentas contables', !!(db.config.contabilidad && db.config.contabilidad.inventario), 'ccuentas', '', 'config'],
    ['Hacer órdenes de compra y recibir mercancía', db.ordenes.length > 0, 'ordenes', 'nuevo', 'ordenes'],
    ['Registrar traslados y consumos', db.movimientos.some((m) => m.tipo === 'salida' || m.tipo === 'traslado'), 'salidas', 'nuevo', 'salidas'],
    ['Crear usuarios para cada persona', db.usuarios.length > 1, 'usuarios', '', 'usuarios'],
    ['Hacer el inventario físico y el cierre del periodo', db.cierres.length > 0, 'conteos', '', 'conteoAbrir']
  ];
  const hechos = pasos.filter((p) => p[1]).length;
  return (
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
  );
}

export default function Ayuda() {
  const { go } = useStore();
  const [q, setQ] = useState('');
  const [sec, setSec] = useState('todas');
  const lista = ARTICULOS.filter(([s, t, , pasos]) => (sec === 'todas' || s === sec) && norm(t + ' ' + pasos.join(' ')).includes(norm(q)));
  return (
    <div className="stack">
      <Panel title="Portal de ayuda" icon={LifeBuoy} sub="Busque cómo hacer cualquier proceso. Cada artículo tiene los pasos y un botón que lo lleva directo a la pantalla.">
        <div className="toolbar"><SearchBox value={q} onChange={setQ} placeholder="¿Qué necesita hacer? Ej.: crear tercero, lote, orden de compra, Excel…" /></div>
        <Tabs value={sec} onChange={setSec} options={SECCIONES} />
      </Panel>
      <div className="law">
        {lista.map(([, t, ruta, pasos]) => (
          <Panel key={t}>
            <h3>{t}</h3>
            <ol className="howto">{pasos.map((x, i) => <li key={i}>{x}</li>)}</ol>
            <Btn variant="primary" size="sm" icon={ArrowRight} onClick={() => go(ruta[0], ruta[1])}>Ir a la pantalla</Btn>
          </Panel>
        ))}
      </div>
      {!lista.length && <Panel><p className="muted">No hay artículos con esa búsqueda.</p></Panel>}
    </div>
  );
}
