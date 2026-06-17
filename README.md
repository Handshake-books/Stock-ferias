# Stock Ferias — Calculadora de Stock para Ferias

Herramienta web para editores: estima peso y valor del stock antes de una feria, gestiona contenedores (maletas/cajas) y exporta packing lists.

## Archivos
- `index.html` — estructura de la app
- `style.css` — estilos
- `app.js` — lógica completa

## Despliegue en GitHub Pages

1. Crear un repositorio en GitHub (ej: `handshake-books/stock-ferias`)
2. Subir los tres archivos (`index.html`, `style.css`, `app.js`)
3. Ir a Settings → Pages → Branch: main → Save
4. La app estará en `https://handshake-books.github.io/stock-ferias/`

## Datos
Los datos se guardan automáticamente en el `localStorage` del navegador.
Para hacer copia de seguridad: exportar catálogo y ferias en JSON desde la app.

## Estructura de datos (JSON)
### Catálogo
```json
[{"id":"abc","nombre":"Nombre libro","precio":25,"peso":0.38,"gbp":22}]
```
### Feria
```json
{"id":"xyz","nombre":"Cairo","fecha":"2024-03-15","objetivo":3000,
 "productos":[{"id":"...","catalogoId":"abc","qty":6,"contenedorId":"..."}],
 "contenedores":[{"id":"...","nombre":"Maleta 1"}]}
```
