# Lepas Status

Panel de matriculaciones, mercado y cuota de la red Lepas (L8 PHEV) por área de influencia y código postal, 2026.

**Abrir la web:** https://victoralonsogarciallamas-ctrl.github.io/lepas-status/

Pide la contraseña de acceso al responsable del panel.

- `index.html`: el panel, cifrado; se abre con la contraseña.
- `mapa-cp-*.js`, `mapa-cp.css`: mapa de códigos postales de España.
- `manifest.webmanifest`, `sw.js`, `icons/`: para instalarlo como app en el móvil o el ordenador. El service worker pide siempre la última versión publicada y solo usa la copia guardada sin conexión.

Para actualizar los datos basta con sustituir `index.html` y subir el cambio: quien lo tenga abierto o instalado verá la versión nueva al volver a abrirlo.
