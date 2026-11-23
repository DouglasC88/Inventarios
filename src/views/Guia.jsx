import { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, Circle, CircleCheck, Compass, Download, FileSpreadsheet, Hexagon, KeyRound, LifeBuoy, MessageCircleQuestion, Scale, SpellCheck } from 'lucide-react';
import { useStore, C } from '../store.jsx';
import { Btn, Nota, Panel, SearchBox, Tabs } from '../components/ui.jsx';
import { descargar } from '../format.js';
import Normativa from './Normativa.jsx';
import { PERM_TEXTO } from './Usuarios.jsx';
import { PLANTILLA, PLANTILLA_TERCEROS, PLANTILLA_PLAN } from './Importar.jsx';

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Portal de ayuda: artículos "cómo hacer", agrupados por sección del menú.
const ARTICULOS = [
  ['terceros', 'Cómo crear un tercero (proveedor, cliente, paciente o empleado)', ['terceros', 'nuevo'], [
    'Menú Terceros › "Nuevo tercero". Elija persona natural (nombres y apellidos por separado, sexo) o persona jurídica (razón social y nombre comercial).',
    'Tipo y número de documento. Para NIT escriba el número sin el dígito de verificación: el sistema lo calcula.',
    'Marque qué es: proveedor, cliente, paciente, empleado, asesor, laboratorio o extranjero (puede ser varios).',
    'Contacto y ubicación: correo, celular y teléfono. País, departamento y ciudad se buscan escribiendo: en Colombia salen los 1.121 municipios con su código DANE; en otros países, sus estados y ciudades.',
    'Tributario: régimen, responsabilidades del RUT (gran contribuyente, autorretenedor…), actividad CIIU, factura electrónica y retenciones propias. Las facturas de ese proveedor las toman solas.',
    'Pagos: plazo (calcula el vencimiento de sus facturas), medio de pago, cuenta bancaria y cuentas contables propias.',
    'Si es empleado: cargo, tipo de trabajador, contrato, periodicidad, salario y fecha de inicio (códigos de la nómina electrónica).',
    'También puede crearlo desde cualquier buscador de tercero: escriba el NIT y elija "Crear tercero".'
  ]],
  ['productos', 'Cómo crear un producto o insumo con sus lotes', ['productos', 'nuevo'], [
    'Menú Productos y servicios › Productos › "Nuevo": elija qué va a crear (insumo, dispositivo médico, medicamento, instrumental o equipo, o servicio).',
    'Los botones de arriba de la ficha llevan a cada sección. Los campos con * son obligatorios.',
    'Identificación: código, nombre, nombre comercial, clasificación, marca, referencia, fabricante, presentación, código de barras (se valida el dígito GS1) y foto.',
    'Sanitaria: registro INVIMA y su vencimiento. Medicamento: principio activo, concentración, forma farmacéutica, vía, CUM, ATC y control especial. Dispositivo: uso único o reutilizable, esterilidad e implantable (exige salida a un paciente).',
    'Almacenamiento: unidad, bodega, ubicación física, lote y vencimiento, temperatura, luz, vida útil, vida útil mínima al recibir (las entradas con menos días se rechazan) y días de alerta propios.',
    'Reposición: política (según consumo, mínimo y máximo, o manual), mínimo, seguridad, punto de reorden, máximo, cantidad mínima de pedido y unidad de compra.',
    'Proveedores: preferido y otros proveedores con su referencia y precio pactado (se propone en la orden de compra).',
    'Precio e IVA: tratamiento de IVA (gravado, exento o excluido; la factura del proveedor lo calcula por línea) y precio de venta con su margen.',
    'Contabilidad: cuentas propias de inventario y costo (si no, se heredan de la clasificación o de la parametrización) y valor neto realizable.',
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
    'Productos › "Cargar desde Excel" (o Productos y servicios › Carga desde Excel) › "Descargar plantilla".',
    'Llene una fila por lote: código, nombre, categoría y unidad son lo básico; puede agregar clasificación, marca, proveedor (NIT), tarifa de IVA, principio activo, INVIMA y las demás columnas de la plantilla.',
    'Para corregir fichas masivamente: "Exportar" en Productos trae las mismas columnas; edítelas y vuelva a cargar el archivo.',
    'Suba el archivo: verá la vista previa con errores por fila. Pulse "Aplicar importación".'
  ]],
  ['terceros', 'Cómo cargar terceros de forma masiva', ['importar', 'terceros'], [
    'Menú Terceros › "Cargar desde Excel" (o Productos y servicios › Carga desde Excel › Terceros) › "Plantilla".',
    'Una fila por tercero: tipo de documento, número (sin dígito de verificación), razón social, tipo (proveedor, cliente, paciente, empleado), ciudad, correo y teléfono.',
    'Suba el archivo: el sistema calcula el DV, marca los que ya existen (se actualizan) y los que tienen errores.',
    'En Colombia asigna solo el código DANE del municipio a partir del departamento y la ciudad, aunque vengan sin tildes o abreviados ("Cúcuta", "Bogota"). También puede traer la columna Código DANE. Si un municipio no se reconoce o existe en varios departamentos, se avisa y el tercero se carga sin código.',
    'Pulse "Cargar terceros".'
  ]],
  ['inventario', 'Cómo hacer una orden de compra', ['ordenes', 'nuevo'], [
    'Menú Inventario › Órdenes de compra › "Nueva orden".',
    'Escriba el NIT o nombre del proveedor, la fecha de entrega y la bodega que recibe.',
    'Agregue productos con cantidad y costo pactado. Imprímala y envíela al proveedor.',
    'Atajo: Inventario › Reabastecimiento sugiere qué pedir y arma la orden por proveedor.'
  ]],
  ['inventario', 'Cómo hacer una entrada de inventario', ['entradas', 'nuevo'], [
    'Menú Inventario › Entradas › "Nueva entrada" (o desde la orden: "Recibir mercancía").',
    'Documento: bodega que recibe, proveedor, factura electrónica o documento soporte y su número; fletes en "Costos adicionales".',
    'Productos: una línea por lote con número de lote, vencimiento, cantidad y costo sin IVA descontable.',
    'Si compra por caja, elija la unidad de compra: el sistema convierte a unidades. Puede escanear el código GS1 / UDI.'
  ]],
  ['inventario', 'Cómo devolver mercancía al proveedor', ['devoluciones', 'nuevo'], [
    'Menú Inventario › Devoluciones › "Nueva devolución".',
    'Proveedor, bodega, causa y número de la nota crédito; elija los lotes (solo aparecen los recibidos de ese proveedor).'
  ]],
  ['inventario', 'Cómo registrar el consumo de un paciente o servicio', ['salidas', 'nuevo'], [
    'Menú Inventario › Salidas › "Nueva salida".',
    'Bodega de donde sale, tipo de destino (paciente, consultorio, servicio o venta) e historia clínica.',
    'Elija el servicio realizado y "Agregar insumos del servicio", o escriba los productos uno a uno.',
    'Los lotes se asignan solos por fecha de vencimiento; los vencidos o en cuarentena nunca se entregan.'
  ]],
  ['inventario', 'Cómo surtir un consultorio (traslado o requisición)', ['traslados', 'nuevo'], [
    'Traslado directo: Inventario › Traslados › "Nuevo traslado", de la bodega principal al consultorio.',
    'Con requisición: el consultorio crea la requisición; la bodega la abre y pulsa "Atender con traslado".'
  ]],
  ['inventario', 'Cómo registrar faltantes, sobrantes o bajas', ['ajustes', ''], [
    'Menú Inventario › Ajustes y bajas.',
    'Ajuste: lote, causa (faltante, sobrante, corrección), cantidad, acta y quién autoriza.',
    'Baja: vencidos, dañados, retiro de mercado o ruptura de cadena de frío, con acta y autorización.'
  ]],
  ['inventario', 'Cómo cargar el inventario físico desde Excel', ['conteos', 'excel'], [
    'Menú Inventario › Inventario físico › "Cargar desde Excel".',
    'Descargue la plantilla con sus existencias por bodega y lote; escriba la "Cantidad contada".',
    'Suba el archivo: verá faltantes, sobrantes y lotes nuevos. Cree el conteo, escriba el acta y "Aplicar conteo".'
  ]],
  ['inventario', 'Cómo consultar existencias y kardex', ['existencias', ''], [
    'Inventario › Existencias: tarjeta General y una por bodega; toque una para filtrar.',
    'Busque por nombre, código o lote. Desde cada insumo abra su kardex o la trazabilidad del lote.'
  ]],
  ['inventario', 'Cómo cerrar el periodo', ['cierres', ''], [
    'Inventario › Cierres › "Nuevo cierre". Revise el deterioro por valor neto realizable.',
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
const SECCIONES = [['todas', 'Todas'], ['inventario', 'Inventario'], ['productos', 'Productos y servicios'], ['terceros', 'Terceros'], ['contabilidad', 'Contabilidad'], ['reportes', 'Reportes'], ['config', 'Configuración']];
const enlace = (ruta, arg) => '#/' + ruta + (arg ? '/' + encodeURIComponent(arg) : '');

const PREGUNTAS = [
  ['¿Por qué no me deja registrar un movimiento con fecha anterior?', 'Porque ese periodo ya está cerrado (Inventario › Cierres). Después del cierre nadie puede registrar ni anular con fecha igual o anterior, para que los saldos reportados no cambien (C. de Co. art. 52). Registre el movimiento con la fecha de hoy.'],
  ['¿Cómo corrijo un documento mal hecho?', 'Los documentos no se borran: se anulan con motivo desde su detalle (botón Anular) y se hace uno nuevo. Queda todo en la auditoría y, en contabilidad, se genera el comprobante de reversión.'],
  ['¿Por qué me pide lote y fecha de vencimiento?', 'Porque el producto está marcado con "Maneja lote" y "Maneja fecha de vencimiento" en su ficha. Es obligatorio para dispositivos médicos y medicamentos (trazabilidad y tecnovigilancia). Si un insumo no lo requiere, desmárquelo en la ficha.'],
  ['El sistema dice que no hay existencia suficiente, pero sí hay.', 'Revise el lote: si está en cuarentena o bloqueado (Productos y servicios › Lotes) no se puede despachar. También revise la bodega: la existencia es por bodega y por lote.'],
  ['¿Qué es la cuenta puente "mercancía recibida por facturar"?', 'Cuando llega la mercancía se registra la entrada contra esa cuenta. Cuando llega la factura del proveedor se cruza y pasa a proveedores. Así la compra no se contabiliza dos veces y se ve qué está recibido y sin factura (Contabilidad › Conciliación).'],
  ['¿Cuándo uso documento soporte y no factura electrónica?', 'Cuando el proveedor no está obligado a facturar (por ejemplo, una persona natural no responsable de IVA). Sin factura ni documento soporte la compra no es deducible (ET art. 771-2).'],
  ['¿Cómo cargo mi inventario desde Excel?', 'Productos y servicios › Productos › "Cargar desde Excel": descargue la plantilla, llénela con una fila por lote y súbala. Verá una vista previa con los errores antes de aplicar.'],
  ['¿Dónde quedan guardados mis datos?', 'En esta versión, en el navegador de este equipo. Haga respaldos frecuentes en Configuración › General › Respaldo (archivo JSON). Para trabajar en varios equipos con los mismos datos se requiere la versión con base de datos en servidor.'],
  ['¿Por qué un producto sale en rojo en vencimientos?', 'Porque vence dentro de los días de alerta (generales en Configuración, o propios en la ficha del producto). Use primero esos lotes: las salidas sugieren el que vence primero (FEFO).'],
  ['¿Cómo sé cuánto pedir?', 'Inventario › Reabastecimiento calcula el punto de reorden con el consumo, los días de entrega y la política de cada producto, y arma las órdenes de compra por proveedor.'],
  ['Olvidé mi PIN.', 'Pídale al administrador que lo cambie en Configuración › Usuarios y roles.']
];

const GLOSARIO = [
  ['Kardex', 'Registro de cada entrada y salida de un producto con cantidades, costo unitario y saldo. Es obligatorio llevarlo de forma permanente (ET art. 62).'],
  ['Promedio ponderado', 'Método de costeo: cada entrada recalcula el costo unitario promediando lo que había con lo que llega.'],
  ['PEPS', 'Primeras en entrar, primeras en salir: las salidas se costean con el costo de las unidades más antiguas. UEPS no está permitido (NIC 2).'],
  ['FEFO', 'Primero en vencer, primero en salir: regla para despachar primero el lote que vence antes.'],
  ['Lote', 'Grupo de unidades fabricadas juntas, con la misma fecha de vencimiento. Permite rastrear a qué paciente llegó cada unidad.'],
  ['Cuarentena', 'Estado de un lote que no se puede usar mientras se verifica (alerta sanitaria, daño, temperatura).'],
  ['Valor neto realizable (VNR)', 'Precio estimado de venta o de uso menos los costos para venderlo. Si es menor que el costo, se registra deterioro (NIC 2).'],
  ['Deterioro', 'Rebaja del valor del inventario cuando el VNR es menor que el costo. Se revierte si el valor se recupera.'],
  ['Punto de reorden', 'Existencia a la que conviene pedir: consumo diario × días de entrega + stock de seguridad.'],
  ['Stock de seguridad', 'Cantidad que se guarda para cubrir demoras del proveedor o consumos mayores a lo normal.'],
  ['Cuenta puente', 'Cuenta 233595 "mercancía recibida por facturar": une la entrada con la factura del proveedor.'],
  ['Documento soporte', 'Documento electrónico que se hace al comprar a quien no está obligado a facturar (Res. DIAN 167 de 2021).'],
  ['Registro INVIMA', 'Autorización sanitaria para comercializar un medicamento o dispositivo médico en Colombia.'],
  ['CUM', 'Código único de medicamentos asignado por el INVIMA.'],
  ['Tecnovigilancia', 'Vigilancia de los eventos adversos con dispositivos médicos (Res. 4816 de 2008). Exige saber qué lote recibió cada paciente.'],
  ['Cadena de frío', 'Control de la temperatura (normalmente 2 a 8 °C) de los productos que requieren refrigeración.'],
  ['DIVIPOLA', 'Codificación del DANE de departamentos y municipios de Colombia. La piden la factura electrónica y los RIPS.'],
  ['GTIN / GS1', 'Código de barras estándar del producto. El código GS1 / UDI también trae lote y vencimiento.'],
  ['Requisición', 'Solicitud de insumos que hace un consultorio a la bodega principal.'],
  ['Traslado', 'Movimiento de existencias entre bodegas. No cambia el costo.']
];

/** Lista de pasos para dejar el sistema funcionando. */
export function PrimerosPasos({ enlaces }) {
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
            {enlaces ? <a className="btn sm" href={enlace(ruta, arg)}><ArrowRight size={14} /> Ir</a> : puede(perm) && <Btn size="sm" icon={ArrowRight} onClick={() => go(ruta, arg)}>Ir</Btn>}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Articulos({ lista }) {
  return (
    <div className="law">
      {lista.map(([, t, ruta, pasos]) => (
        <Panel key={t}>
          <h3>{t}</h3>
          <ol className="howto">{pasos.map((x, i) => <li key={i}>{x}</li>)}</ol>
          <a className="btn primary sm" href={enlace(ruta[0], ruta[1])}><ArrowRight size={14} /> Ir a la pantalla</a>
        </Panel>
      ))}
    </div>
  );
}
function Preguntas({ lista }) {
  return <div className="faq">{lista.map(([p, r]) => <details key={p} className="panel"><summary>{p}</summary><p>{r}</p></details>)}</div>;
}
function Glosario({ lista }) {
  return <div className="glosario">{lista.map(([t, d]) => <div key={t} className="panel"><b>{t}</b><p>{d}</p></div>)}</div>;
}

const PESTANAS = [['guias', 'Guías paso a paso', BookOpen], ['pasos', 'Primeros pasos', Compass], ['faq', 'Preguntas frecuentes', MessageCircleQuestion], ['glosario', 'Glosario', SpellCheck], ['plantillas', 'Plantillas de Excel', FileSpreadsheet], ['roles', 'Roles y permisos', KeyRound], ['normas', 'Normatividad', Scale]];

/** Centro de ayuda: página aparte (se abre en otra pestaña del navegador) con todo el material de apoyo. */
export default function CentroAyuda({ arg }) {
  const { db, state, hoy, requiereLogin } = useStore();
  const [tab, setTab] = useState(PESTANAS.some((x) => x[0] === arg) ? arg : 'guias');
  const [q, setQ] = useState('');
  const [sec, setSec] = useState('todas');
  useEffect(() => { document.title = 'Centro de ayuda · NOVA Inventario'; }, []);
  const n = norm(q);
  const arts = ARTICULOS.filter(([s, t, , pasos]) => (sec === 'todas' || s === sec) && norm(t + ' ' + pasos.join(' ')).includes(n));
  const faq = PREGUNTAS.filter(([p, r]) => norm(p + ' ' + r).includes(n));
  const glo = GLOSARIO.filter(([t, d]) => norm(t + ' ' + d).includes(n));
  const plantillas = [
    ['Productos, insumos y existencias', 'plantilla-productos.csv', PLANTILLA, 'Una fila por lote: ficha del producto y saldo inicial.'],
    ['Terceros', 'plantilla-terceros.csv', PLANTILLA_TERCEROS, 'Proveedores, clientes, pacientes y empleados con NIT, ubicación y datos tributarios.'],
    ['Plan de cuentas', 'plantilla-plan-de-cuentas.csv', PLANTILLA_PLAN, 'Código, nombre, naturaleza y si exige tercero.']
  ];
  return (
    <>
      <div className="cosmos" aria-hidden="true"><div className="aurora" /><div className="stars" /><div className="floor" /></div>
      <div className="ayuda-app">
        <header className="ayuda-top">
          <div className="brand"><div className="brand-mark"><Hexagon size={20} /></div><div><div className="brand-name">NOV<span>A</span></div><div className="brand-sub">Centro de ayuda</div></div></div>
          <div className="spacer" />
          <a className="btn sm" href="#/inicio">Ir al sistema <ArrowRight size={14} /></a>
        </header>
        <div className="panel hero scan ayuda-hero">
          <div>
            <h2><LifeBuoy size={22} /> ¿En qué le ayudamos?</h2>
            <p>Guías paso a paso, preguntas frecuentes, glosario, plantillas y normatividad del sistema de inventario.</p>
            <SearchBox value={q} onChange={setQ} placeholder="Escriba lo que necesita: crear tercero, lote, orden de compra, Excel, cierre…" />
          </div>
        </div>
        {q.trim() ? (
          <div className="stack">
            <div className="section-title">Guías ({arts.length})</div>
            {arts.length ? <Articulos lista={arts} /> : <p className="muted">Sin guías para esa búsqueda.</p>}
            <div className="section-title">Preguntas frecuentes ({faq.length})</div>
            {faq.length ? <Preguntas lista={faq} /> : <p className="muted">Sin preguntas para esa búsqueda.</p>}
            <div className="section-title">Glosario ({glo.length})</div>
            {glo.length ? <Glosario lista={glo} /> : <p className="muted">Sin términos para esa búsqueda.</p>}
          </div>
        ) : (
          <div className="stack">
            <div className="modtabs">
              {PESTANAS.map(([k, t, I]) => <a key={k} href={'#/ayuda/' + k} className={tab === k ? 'on' : ''} onClick={(e) => { e.preventDefault(); setTab(k); }}><I size={15} />{t}</a>)}
            </div>
            {tab === 'guias' && (<>
              <Tabs value={sec} onChange={setSec} options={SECCIONES} />
              <Articulos lista={arts} />
            </>)}
            {tab === 'pasos' && (requiereLogin ? <Panel><Nota>Ingrese al sistema para ver su avance de primeros pasos.</Nota><div style={{ marginTop: 12 }}><a className="btn primary sm" href="#/inicio">Ingresar</a></div></Panel> : <PrimerosPasos enlaces />)}
            {tab === 'faq' && <Preguntas lista={PREGUNTAS} />}
            {tab === 'glosario' && <Glosario lista={GLOSARIO} />}
            {tab === 'plantillas' && (
              <Panel title="Plantillas para cargar datos" icon={FileSpreadsheet} sub="Descárguelas, llénelas en Excel (guárdelas como CSV o déjelas en .xlsx) y súbalas en la pantalla de carga correspondiente.">
                <div className="tbl-wrap"><table className="tbl"><tbody>
                  {plantillas.map(([t, archivo, filas, d]) => (
                    <tr key={t}><td className="strong">{t}</td><td className="small">{d}</td><td className="acts"><Btn size="sm" icon={Download} onClick={() => descargar(archivo, C.csv(filas))}>Descargar</Btn></td></tr>
                  ))}
                  <tr><td className="strong">Inventario físico (conteo)</td><td className="small">Sale con las existencias actuales por bodega y lote; usted escribe lo contado.</td>
                    <td className="acts">{requiereLogin ? <span className="muted small">Ingrese al sistema</span> : <Btn size="sm" icon={Download} onClick={() => descargar('inventario-fisico-' + hoy + '.csv', C.csv(C.plantillaInventarioFisico(db, state, hoy)))}>Descargar</Btn>}</td></tr>
                </tbody></table></div>
              </Panel>
            )}
            {tab === 'roles' && (
              <Panel title="Roles y permisos" icon={KeyRound} sub="Cada usuario tiene un rol; el administrador los asigna en Configuración › Usuarios y roles.">
                <div className="tbl-wrap"><table className="tbl"><tbody>{Object.entries(C.ROLES).map(([k, v]) => <tr key={k}><td className="strong">{v}</td><td>{PERM_TEXTO[k]}</td></tr>)}</tbody></table></div>
              </Panel>
            )}
            {tab === 'normas' && <Normativa />}
          </div>
        )}
      </div>
    </>
  );
}
