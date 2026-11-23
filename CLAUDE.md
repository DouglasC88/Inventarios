# NOVA Inventario

Sistema de inventario (React + Vite, JavaScript) que cumple normas contables,
tributarias y sanitarias de Colombia: NIC 2 / NIIF para Pymes Secc. 13,
Estatuto Tributario arts. 62, 64, 65 y 771-2, Código de Comercio art. 52,
Res. 3100/2019, Dec. 4725/2005, Res. 4816/2008 y Res. 1403/2007.
Ver `README.md` para módulos y arquitectura.

## Preferencias del proyecto (respetar siempre)

- **Actualizar directo en producción.** Hacer `commit` y `push` de cada avance
  funcional sin abrir Pull Request ni pedir confirmación para cada cambio
  (salvo que el usuario indique lo contrario).
- **Producción = Vercel, conectado a la rama `main`.** Cada avance se publica
  llevando los cambios a `main` (merge + push), lo que dispara el deploy
  automático. `vercel.json` define la compilación (`npm run build` → `dist`).
- Interfaz en español, estilo futurista (HUD, vidrio, neón). No copiar el
  diseño ni la marca de otros sistemas (Dentos, A2, SAP); solo ideas de
  funcionalidad.
- Toda regla de negocio va en `src/core/core.js` (sin DOM) con su prueba en
  `tests/core.test.js`.

## Comandos

```bash
npm test        # pruebas del motor
npm run build   # debe compilar sin errores antes de publicar
```
