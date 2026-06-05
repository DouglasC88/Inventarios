# Inventarios · Conversor para Dentos

App web (sin instalación) que toma los archivos de inventario que envía el
cliente (Excel/CSV/TXT) y los **organiza y exporta** en los formatos de carga
que reconoce **Dentos**: **TXT delimitado por tabulación, sin encabezado**.

## Preferencias del proyecto (respetar siempre)

- **Actualizar directo en producción.** Aplicar los cambios de forma directa:
  hacer `commit` y `push` de cada avance funcional sin abrir Pull Request ni
  pedir confirmación para cada cambio (salvo que el usuario indique lo
  contrario). No usar ramas/staging intermedios como paso obligatorio.
  > **Producción = Vercel, conectado a la rama `main`.** Cada avance se publica
  > llevando los cambios a `main` (merge + push), lo que dispara el deploy
  > automático de Vercel. Se desarrolla en `claude/sweet-sagan-Zohan` y se
  > sincroniza `main` para que producción quede al día.

## Cómo funciona

1. **Carga de archivo del cliente** (compartido entre módulos): Excel/CSV/TXT.
2. **Dos módulos** que reutilizan ese mismo archivo cargado:
   - 📦 **Carga de insumos**
   - 📑 **Kardex / Stock**
3. En cada módulo se **mapean** las columnas del cliente a los campos de Dentos
   (o valores fijos). El mapeo se puede guardar como **plantilla por cliente**.
4. Se **genera y descarga** el TXT para Dentos.

## Arquitectura

- `index.html` — interfaz (zona de archivo compartida + módulos + config).
- `core.js` — **lógica pura** sin DOM (parseo, mapeo, generación TXT,
  codificación UTF-8/Windows-1252). Probado con `test_core.js`.
- `app.js` — interfaz/DOM; usa `Core` y `XLSX`.
- `vendor/xlsx.full.min.js` — SheetJS (lectura de Excel), incluido para que
  funcione **sin internet**.

## Formato de salida de Dentos

- Los **campos y su orden** son editables desde la pestaña "Formato Dentos" y
  se guardan en el navegador (`localStorage`).
- Pendiente: cargar las **2 plantillas reales** que recibe Dentos para dejar
  precargadas las columnas exactas (insumos y kardex).
- Configurable: delimitador (TAB por defecto), encabezado (no, por defecto),
  fin de línea (CRLF/LF) y codificación (UTF-8 / ANSI Windows-1252).

## Pruebas

```bash
node test_core.js   # tests de la lógica de conversión (sin navegador)
```

## Uso

Abrir `index.html` en el navegador (doble clic). No requiere servidor.
