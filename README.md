# NOVA Inventario

Sistema de inventario para consultorios, clínicas odontológicas e IPS, diseñado
para cumplir desde el inicio las normas contables, tributarias y sanitarias de
Colombia, con referencia a las normas internacionales.

Aplicación JavaScript (React + Vite) con interfaz futurista tipo HUD en blanco con acentos neón.

**Producción:** https://fluxstock-indol.vercel.app/ (despliegue automático de Vercel desde `main`).

## Menú (11 secciones, cada una con sus pestañas)

La pantalla de **Inicio** es el menú principal: un ícono en relieve por sección (al pasar el mouse sube y se agranda). No hay menú lateral; desde cualquier pantalla se vuelve con el botón Inicio o el logo, y cada sección muestra sus pestañas arriba.

| Sección | Pestañas | Norma o referencia |
| --- | --- | --- |
| Inicio | Inicio (íconos) · Centro de control (alertas, cumplimiento, acciones rápidas) | — |
| Compras y entradas | Entradas (factura electrónica o documento soporte, lote, vencimiento, GS1/UDI, unidad de compra) · Órdenes de compra · Reabastecimiento (punto de reorden) · Devoluciones | ET art. 771-2, NIC 2 |
| Salidas y movimientos | Salidas y consumos (por paciente y servicio, FEFO) · Traslados · Requisiciones · Ajustes y bajas | Res. 1403/2007, ET art. 64 |
| Kardex e inventario | Existencias (tarjeta general y por bodega) · Kardex · Vencimientos · Inventario físico (en pantalla o desde Excel) · Trazabilidad · Cadena de frío · Cierres (VNR) | ET arts. 62 y 65, C. de Co. art. 52, Res. 4816/2008 |
| Productos y servicios | Productos e insumos (al crear se elige: insumo, dispositivo médico, medicamento, instrumental o servicio; ficha por secciones: identificación con foto y GTIN validado, sanitaria con datos de medicamento o dispositivo, almacenamiento y vida útil, reposición, proveedores con precio pactado, IVA y precio de venta, cuentas propias, lotes y existencia inicial) · Servicios (CUPS, precio e insumos que consume) · Lotes · Clasificación (línea › grupo › subgrupo) · Carga desde Excel (productos, terceros, plan de cuentas e inventario físico) | Res. 3100/2019, Dec. 4725/2005 |
| Terceros | Persona natural (nombres y apellidos por separado) o jurídica, NIT con dígito de verificación DIAN, tipos (proveedor, cliente, paciente, empleado, asesor, laboratorio, extranjero), ubicación, régimen y responsabilidades del RUT, retenciones propias, plazo y medio de pago, cuenta bancaria, cuentas contables propias y datos del empleado con códigos de nómina electrónica | Res. DIAN 000042/2020 y 000013/2021 |
| Contabilidad | Facturas de proveedor (cruce orden · entrada · factura, diferencia de precio, IVA y retenciones) · Comprobantes automáticos y manuales (con reversión de anulados) · Libro diario · Mayor y balances · Auxiliares por cuenta y tercero · Estado de costo · Conciliación (kardex y cuenta puente) · Plan de cuentas (PUC, carga desde Excel) · Parametrización por concepto y por clasificación · Interfaz contable configurable | Dec. 2650/1993, NIC 2, ET arts. 771-2 |
| Reportes | 32 reportes con filtros, totales, Excel e impresión/PDF | — |
| Configuración | General · Bodegas · Usuarios y roles | — |
| Normatividad | Mapa de cada norma y cómo la aplica el sistema | — |
| Portal de ayuda | Artículos "cómo hacer" con buscador · Primeros pasos | — |

Los documentos no se borran: se anulan con motivo. Todo queda en la auditoría
con el usuario que lo hizo, y cada documento se puede imprimir.

Usuarios de la demostración: `admin` / 1234, `supervisor` / 1111,
`bodega` / 2222, `consultorio1` / 3333, `contador` / 4444 (contabilidad),
`auditor` / 5555 (solo consulta).

## Desarrollo

```bash
npm install
npm run dev     # servidor local
npm test        # pruebas del motor de inventario
node tests/e2e/regresion.cjs   # prueba en navegador (con vite preview en el puerto 4173)
npm run build   # compilación para producción (carpeta dist)
```

## Enlace contable

1. **Entrada**: débito inventario (1455) contra la cuenta puente 233595 "mercancía recibida por facturar".
2. **Factura del proveedor**: débito puente por lo recibido, diferencia de precio aparte, IVA descontable (2408); crédito proveedores (2205) y retenciones (236540, 2367, 2368).
3. **Salidas**: débito costo (6155 consumo, 6135 venta) contra inventario, con centro de costo por bodega.
4. **Ajustes, bajas y cierre**: faltantes, sobrantes y deterioro por VNR con su recuperación.
5. **Devoluciones a proveedor**: crédito inventario contra proveedores (nota crédito por recibir).

La conciliación compara la 1455 con el kardex y la puente con lo recibido sin factura.

## Datos geográficos

País, departamento o estado y ciudad se eligen con buscador (se escribe y filtra; en listas grandes desde 3 letras).

- **Colombia:** 33 departamentos y 1.121 municipios de la DIVIPOLA del DANE, con su código (lo piden la factura electrónica y los RIPS). Fuente: paquete npm `divipola` (MIT).
- **Resto del mundo:** 247 países (nombres en español) con sus estados y ciudades de [GeoNames](https://www.geonames.org), licencia [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), tomados del paquete npm `cities.json`.

Los archivos están en `public/geo/` (uno por país, se descargan solo al elegir el país). Para regenerarlos: `node scripts/geo.mjs <divipola/index.js> <cities.json/admin1.json> <cities.json/cities.json>`.

## Arquitectura

- `src/core/core.js`: motor de inventario sin interfaz (kardex, costeo, validaciones, alertas, cierres, GS1). Probado en `tests/core.test.js`.
- `src/core/demo.js`: datos de demostración de un consultorio ficticio.
- `src/store.jsx`: estado de la aplicación, guardado en el navegador y auditoría.
- `src/views/`: pantallas. `src/components/`: componentes reutilizables.

## Limitaciones de esta versión

- Los datos y usuarios se guardan en el navegador (`localStorage`). Hay respaldo e importación en JSON. Para que varios equipos trabajen sobre los mismos datos se necesita la base de datos en servidor (siguiente fase).
- El control de acceso por PIN evita errores de operación, pero la seguridad completa llega con el servidor.
- No emite factura electrónica; registra el soporte de cada compra.
