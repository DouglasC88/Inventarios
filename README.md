# NOVA Inventario

Sistema de inventario para consultorios, clínicas odontológicas e IPS, diseñado
para cumplir desde el inicio las normas contables, tributarias y sanitarias de
Colombia, con referencia a las normas internacionales.

Aplicación JavaScript (React + Vite) con interfaz futurista tipo HUD.

## Módulos

| Área | Módulo | Qué hace | Norma o referencia |
| --- | --- | --- | --- |
| Operación | Centro de control | Valor del inventario, alertas e indicador de cumplimiento | — |
| | Entradas | Compras con factura electrónica o documento soporte, con o sin orden de compra; lote, vencimiento, lectura GS1/UDI, unidad de compra y prorrateo de costos adicionales | ET art. 771-2, NIC 2 |
| | Salidas y consumos | Consumo por paciente, consultorio, servicio o procedimiento; kits; lotes por FEFO dentro de la bodega | Res. 1403/2007 |
| | Traslados | Movimiento entre bodegas, consultorios y neveras conservando lote | — |
| | Requisiciones | El consultorio pide, la bodega atiende con traslado; control de pendientes | Flujo tipo Dentos |
| | Devoluciones | Devolución a proveedor por calidad, vencimiento, error o retiro | Res. 4816/2008 |
| | Ajustes y bajas | Faltantes, sobrantes y bajas con causa, acta y autorización; control del 3 % | ET art. 64 |
| | Conteos físicos | Anual y cíclico, por bodega o categoría; las diferencias generan el ajuste | C. de Co. art. 52 |
| Compras | Órdenes de compra | Pedido, recepción parcial o total, cierre de saldo, impresión | Flujo tipo SAP |
| | Reabastecimiento | Punto de reorden por consumo real, stock de seguridad y pedido sugerido por proveedor | MRP tipo SAP |
| Control | Kardex | Kardex permanente por promedio ponderado o PEPS (sin UEPS), existencias por bodega | ET arts. 62 y 65, NIC 2 |
| | Lotes y vencimientos | Semáforo por bodega y baja de vencidos | Res. 1403/2007 |
| | Trazabilidad | Proveedor, factura, bodega y paciente de cada lote | Res. 4816/2008 |
| | Cadena de frío | Registro de temperaturas y alertas fuera de rango | Res. 3100/2019 |
| | Reportes | Inventario valorado a cualquier fecha, ABC, rotación, consumos por destino, sin movimiento, libro de movimientos | Kardex tipo A2 |
| | Cierres | Bloqueo del periodo y deterioro por valor neto realizable con reversión | NIC 2 / Secc. 13 |
| Maestros | Productos | Ficha sanitaria (INVIMA, riesgo, GTIN, cadena de frío), unidad de compra, proveedor preferido | Res. 3100/2019, Dec. 4725/2005 |
| | Kits por procedimiento | Insumos por procedimiento odontológico | — |
| | Proveedores | Factura electrónica o documento soporte | ET art. 771-2 |
| Sistema | Importar | Productos y saldo inicial desde Excel (.xlsx) o CSV | Migración desde A2 u otros |
| | Usuarios y roles | Administrador, supervisor, almacenista, consultorio y consulta, con PIN | Control interno |

Los documentos no se borran: se anulan con motivo. Todo queda en la auditoría
con el usuario que lo hizo, y cada documento se puede imprimir.

Usuarios de la demostración: `admin` / 1234, `supervisor` / 1111,
`bodega` / 2222, `consultorio1` / 3333, `contador` / 4444.

## Desarrollo

```bash
npm install
npm run dev     # servidor local
npm test        # pruebas del motor de inventario
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
