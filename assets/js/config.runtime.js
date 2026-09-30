/* ============================================================
   LogiTrace — config.runtime.js
   ------------------------------------------------------------
   ÚNICO archivo que debe editar cada usuario tras desplegar su
   propia Web App de Google Apps Script.

   1. Pegue en APPS_SCRIPT_URL la URL /exec de su implementación.
   2. Pegue en SPREADSHEET_ID el ID de su Google Sheet.
   3. No coloque aquí contraseñas, claves privadas, OAuth secrets
      ni tokens: este archivo es público en GitHub Pages.

   Mientras APPS_SCRIPT_URL conserve el valor de ejemplo, LogiTrace
   arranca en MODO LOCAL (datos de demostración en el navegador)
   y lo indica de forma explícita en el encabezado.
   ============================================================ */

window.LOGITRACE_CONFIG = Object.freeze({
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxjkL2raDWPZfT5pzTiJFWK-4OT9D69SfSVZiDFSEWCM0TdADZmn_hBDve3MMGCI-w6/exec',
  SPREADSHEET_ID: '1qQ5s9f6nFTY35lc0icVNZBKGbJzJvNi6ydFfW10wIE8',
  TIMEZONE: 'America/Guayaquil',
  LOW_STOCK_THRESHOLD: 5,
  MAX_ACCEPTABLE_ACCURACY_M: 100,
  DEMO_MODE: false
});
