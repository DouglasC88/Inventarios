# Conversor de Inventarios · Dentos

App web (sin instalación) que toma los archivos de inventario que envía el
**cliente** (Excel / CSV / TXT) y los **organiza y exporta** en los formatos de
carga que reconoce **Dentos**: **TXT delimitado por tabulación, sin encabezado**.

> No hay captura manual: cargas el archivo del cliente, mapeas las columnas y
> descargas el archivo listo para importar en Dentos.

## Cómo se usa

1. Abre **`index.html`** en el navegador (doble clic — no requiere internet ni servidor).
2. **Carga el archivo del cliente** (Excel/CSV/TXT). Se reutiliza para los dos módulos.
3. Entra a **📦 Carga de insumos** o **📑 Kardex / Stock**.
4. Para cada campo que pide Dentos, elige **de qué columna** del cliente sale
   (o un **valor fijo** igual para todas las filas). La app auto-sugiere por nombre.
5. Pulsa **Generar y descargar**: obtienes `insumos.txt` o `kardex.txt`.

### Plantillas por cliente
Como cada cliente manda columnas distintas, puedes **guardar el mapeo como
plantilla** y reaplicarlo la próxima vez con un clic.

## Formato de salida (editable)

En la pestaña **⚙️ Formato Dentos** defines el **orden y los nombres** de las
columnas de cada archivo, y las opciones de salida:

- **Delimitador:** Tabulación (lo que pide Dentos) · `;` · `,` · `|`
- **Encabezado:** sin encabezado (por defecto) o con encabezado
- **Fin de línea:** Windows (CRLF) o Unix (LF)
- **Codificación:** UTF-8 o **ANSI (Windows-1252)**
  > Si en Dentos los acentos o la ñ salen corruptos, cambia a **ANSI**.

Todo se guarda en el navegador (`localStorage`). Puedes respaldar/restaurar la
configuración en JSON.

> ⏳ **Pendiente:** cargar las **2 plantillas reales** que recibe Dentos para
> dejar precargadas las columnas exactas (insumos y kardex).

## Estructura

| Archivo | Rol |
|---|---|
| `index.html` | Interfaz (zona de archivo compartida + módulos + configuración) |
| `core.js` | Lógica pura sin DOM: parseo, mapeo, generación TXT, codificación |
| `app.js` | Interfaz/DOM; usa `Core` y `XLSX` |
| `vendor/xlsx.full.min.js` | SheetJS (lectura de Excel), incluido para uso sin internet |
| `test_core.js` | Tests de la lógica de conversión |

## Pruebas

```bash
node test_core.js   # 13 pruebas del motor de conversión (no requiere navegador)
```

(La prueba de integración con `jsdom` se ejecuta fuera del repo para no añadir
dependencias al proyecto.)
