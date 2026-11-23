# NOVA Inventario

Sistema de inventario para consultorios, clínicas odontológicas e IPS, diseñado
para cumplir desde el inicio las normas contables, tributarias y sanitarias de
Colombia, con referencia a las normas internacionales.

Aplicación JavaScript (React + Vite) con interfaz futurista tipo HUD.

## Módulos

| Módulo | Qué hace | Norma |
| --- | --- | --- |
| Centro de control | Valor del inventario, alertas e indicador de cumplimiento | — |
| Entradas | Compras con factura electrónica o documento soporte, lote, vencimiento, lectura GS1/UDI, prorrateo de costos adicionales | ET art. 771-2, NIC 2 |
| Salidas | Consumos por paciente, consultorio o servicio; asignación de lotes por FEFO | Res. 1403/2007 |
| Ajustes y bajas | Faltantes, sobrantes y bajas con causa, acta y autorización; control del 3 % | ET art. 64 |
| Conteos físicos | Conteo anual y cíclico; las diferencias generan el ajuste | C. de Co. art. 52 |
| Kardex | Kardex permanente por promedio ponderado o PEPS (sin UEPS); exportación CSV | ET arts. 62 y 65, NIC 2 |
| Lotes y vencimientos | Semáforo de vencimientos y baja de vencidos | Res. 1403/2007 |
| Trazabilidad | Proveedor, factura y destino de cada lote | Res. 4816/2008 |
| Cadena de frío | Registro de temperaturas y alertas fuera de rango | Res. 3100/2019 |
| Cierres de periodo | Bloqueo del periodo y deterioro por valor neto realizable con reversión | NIC 2 / Secc. 13 |
| Productos y proveedores | Ficha sanitaria (INVIMA, riesgo, GTIN, cadena de frío) | Res. 3100/2019, Dec. 4725/2005 |
| Normativa | Mapa de cada norma y cómo la aplica el sistema | — |

Los documentos no se borran: se anulan con motivo y todo queda en la auditoría.

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

- Los datos se guardan en el navegador (`localStorage`). Hay respaldo e importación en JSON. Para varios usuarios y equipos se necesita una base de datos en servidor.
- Una sola existencia por lote (las ubicaciones son informativas; no hay traslados entre bodegas).
- Sin usuarios ni permisos: el nombre del usuario se toma de Configuración.
- No emite factura electrónica; solo registra el soporte de cada compra.
