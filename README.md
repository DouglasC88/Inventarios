# NOVA Inventario

Sistema de inventario para consultorios, clínicas odontológicas e IPS, diseñado
para cumplir desde el inicio las normas contables, tributarias y sanitarias de
Colombia, con referencia a las normas internacionales.

Aplicación JavaScript (React + Vite) con interfaz futurista tipo HUD en blanco con acentos neón.

**Producción:** https://fluxstock-indol.vercel.app/ (despliegue automático de Vercel desde `main`).

## Módulos

| Área | Módulo | Qué hace | Norma o referencia |
| --- | --- | --- | --- |
| Operación | Centro de control | Acciones rápidas, valor del inventario por grupo, alertas e indicador de cumplimiento | — |
| | Guía de uso | Primeros pasos y cómo hacer una orden de compra, una entrada, un lote | — |
| | Entradas | Compras con factura electrónica o documento soporte, con o sin orden de compra; lote, vencimiento, lectura GS1/UDI, unidad de compra y prorrateo de costos adicionales | ET art. 771-2, NIC 2 |
| | Salidas y consumos | Consumo por paciente, consultorio, servicio o procedimiento; kits; lotes por FEFO dentro de la bodega | Res. 1403/2007 |
| | Traslados | Movimiento entre bodegas, consultorios y neveras conservando lote | — |
| | Requisiciones | El consultorio pide, la bodega atiende con traslado; control de pendientes | Flujo tipo Dentos |
| | Devoluciones | Devolución a proveedor por calidad, vencimiento, error o retiro | Res. 4816/2008 |
| | Ajustes y bajas | Faltantes, sobrantes y bajas con causa, acta y autorización; control del 3 % | ET art. 64 |
| | Conteos físicos | Anual y cíclico, por bodega o categoría; las diferencias generan el ajuste | C. de Co. art. 52 |
| Compras | Órdenes de compra | Pedido, recepción parcial o total, cierre de saldo, impresión | Flujo tipo SAP |
| | Reabastecimiento | Punto de reorden por consumo real, stock de seguridad y pedido sugerido por proveedor | MRP tipo SAP |
| Control | Existencias | Tarjeta General (todas las bodegas) y una tarjeta por bodega; insumos con stock, lotes, vencimientos y valor; buscador por nombre, código o lote | — |
| | Kardex | Kardex permanente por promedio ponderado o PEPS (sin UEPS), existencias por bodega | ET arts. 62 y 65, NIC 2 |
| | Lotes y vencimientos | Semáforo por bodega y baja de vencidos | Res. 1403/2007 |
| | Trazabilidad | Proveedor, factura, bodega y paciente de cada lote | Res. 4816/2008 |
| | Cadena de frío | Registro de temperaturas y alertas fuera de rango | Res. 3100/2019 |
| Reportes | Centro de reportes | 32 reportes en 7 categorías (inventario, movimientos, compras, consumos, vencimientos y calidad, análisis, control), con filtros, totales, orden por columna, Excel e impresión/PDF | A2 / SAP |
| | Cierres | Bloqueo del periodo y deterioro por valor neto realizable con reversión | NIC 2 / Secc. 13 |
| Maestros | Bodegas | Bodega principal, consultorios, neveras, cuarentena y sedes: código, tipo, responsable; cambio de nombre en cascada | Res. 3100/2019 (almacenamiento) |
| | Clasificación | Árbol Línea › Grupo › Subgrupo; filtros y reportes incluyen los niveles inferiores | Clasificación tipo A2 / SAP |
| | Lotes | Maestro de lotes con fabricación, vencimiento y estado (liberado, cuarentena, bloqueado) | Res. 1403/2007, Res. 4816/2008 |
| | Productos | Ficha completa: clasificación, tipo de material, marca, referencia, presentación, código alterno, ubicación física, mínimo y máximo, IVA, precio, CUM, control de lote y vencimiento; ficha sanitaria (INVIMA, riesgo, GTIN, cadena de frío), unidad de compra, proveedor preferido | Res. 3100/2019, Dec. 4725/2005 |
| | Kits por procedimiento | Insumos por procedimiento odontológico | — |
| | Terceros | Proveedores, clientes, pacientes y empleados con NIT o documento y dígito de verificación DIAN; régimen de IVA y facturación | ET art. 771-2, Res. DIAN |
| Sistema | Importar | Productos y saldo inicial desde Excel (.xlsx) o CSV | Migración desde A2 u otros |
| | Usuarios y roles | Administrador, supervisor, almacenista, consultorio y consulta, con PIN | Control interno |

En todas las pantallas hay un buscador general (insumo por nombre, código, código de
barras o lote) y los campos de producto y tercero permiten escribir para buscar
(NIT, nombre, código).

Los documentos no se borran: se anulan con motivo. Todo queda en la auditoría
con el usuario que lo hizo, y cada documento se puede imprimir.

Usuarios de la demostración: `admin` / 1234, `supervisor` / 1111,
`bodega` / 2222, `consultorio1` / 3333, `contador` / 4444.

## Desarrollo

```bash
npm install
npm run dev     # servidor local
npm test        # pruebas del motor de inventario
node tests/e2e/regresion.cjs   # prueba en navegador (con vite preview en el puerto 4173)
npm run build   # compilación para producción (carpeta dist)
```

## Arquitectura

- `src/core/core.js`: motor de inventario sin interfaz (kardex, costeo, validaciones, alertas, cierres, GS1). Probado en `tests/core.test.js`.
- `src/core/demo.js`: datos de demostración de un consultorio ficticio.
- `src/store.jsx`: estado de la aplicación, guardado en el navegador y auditoría.
- `src/views/`: pantallas. `src/components/`: componentes reutilizables.

## Limitaciones de esta versión

- Los datos y usuarios se guardan en el navegador (`localStorage`). Hay respaldo e importación en JSON. Para que varios equipos trabajen sobre los mismos datos se necesita la base de datos en servidor (siguiente fase).
- El control de acceso por PIN evita errores de operación, pero la seguridad completa llega con el servidor.
- No emite factura electrónica; registra el soporte de cada compra.
