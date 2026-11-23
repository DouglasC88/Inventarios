# NOVA Inventario

Sistema de inventario (React + Vite, JavaScript) que cumple normas contables,
tributarias y sanitarias de Colombia: NIC 2 / NIIF para Pymes Secc. 13,
Estatuto Tributario arts. 62, 64, 65 y 771-2, Código de Comercio art. 52,
Res. 3100/2019, Dec. 4725/2005, Res. 4816/2008 y Res. 1403/2007.
Ver `README.md` para módulos y arquitectura.

## Despliegue automático (autorizado por el usuario, respetar siempre)

El usuario autorizó de forma permanente que **todo cambio se despliegue a
producción automáticamente**, sin pedir confirmación ni abrir Pull Request.
Al terminar cada avance funcional, desplegar de inmediato:

1. `npm test` y `npm run build` deben pasar (si fallan, corregir antes).
2. `git commit` en la rama de trabajo de la sesión y `git push` de esa rama.
3. Llevar a `main`: `git checkout main && git pull origin main &&
   git merge --ff-only <rama>` (o merge normal si no es fast-forward) y
   `git push origin main`; volver a la rama de trabajo.
4. Vercel (proyecto **Inventarios**, cuenta `douglasc88`, importado desde
   GitHub `DouglasC88/Inventarios`) despliega `main` a producción
   automáticamente con cada push. `vercel.json` fija la compilación
   (preset Vite, `npm run build` → `dist`); no hace falta tocar Vercel.
5. Producción: **https://fluxstock-indol.vercel.app/** (la app abre en `#/panel`).
6. Informar al usuario el commit publicado. Si la compilación de Vercel
   falla, el usuario lo ve en su panel de Vercel; corregir y volver a subir.

## Preferencias del proyecto (respetar siempre)
- Interfaz en español, estilo futurista (HUD, vidrio, neón). No copiar el
  diseño ni la marca de otros sistemas (Dentos, A2, SAP); solo ideas de
  funcionalidad.
- Toda regla de negocio va en `src/core/core.js` (sin DOM) con su prueba en
  `tests/core.test.js`.

## Comandos

```bash
npm test        # pruebas del motor
npm run build   # debe compilar sin errores antes de publicar
npx vite preview --port 4173 &  # y luego:
node tests/e2e/regresion.cjs    # regresión en navegador (actualizarla si cambian pantallas)
```
