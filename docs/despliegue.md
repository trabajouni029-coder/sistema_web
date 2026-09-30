# LogiTrace — Despliegue

Referencia técnica del despliegue. Para la primera puesta en marcha guiada, use
[../INICIO_RAPIDO.md](../INICIO_RAPIDO.md).

---

## 1. Piezas y responsabilidades

| Pieza | Aloja | Responsabilidad |
|---|---|---|
| GitHub Pages | `index.html`, `assets/` | Servir el frontend estático por HTTPS |
| Apps Script Web App | `apps-script/Code.gs` | Única autoridad de inventario y geocercas |
| Google Sheets | la hoja | Persistencia |
| OpenStreetMap | — | Teselas de los mapas (Leaflet) |
| CDN (cdnjs, jsDelivr) | — | JsBarcode, QRCode.js, html5-qrcode, Chart.js, Leaflet, Lucide |

El frontend **no** habla con Google Sheets directamente: siempre pasa por Apps Script.

---

## 2. Backend: Apps Script

### 2.1 Proyecto vinculado o independiente

* **Vinculado** (recomendado): se abre con *Extensiones → Apps Script* desde la hoja.
  `CONFIG.SPREADSHEET_ID` queda vacío y el script usa la hoja contenedora.
* **Independiente**: se crea en [script.google.com](https://script.google.com) y hay que
  escribir el ID en `CONFIG.SPREADSHEET_ID`.

### 2.2 Implementación

*Implementar → Nueva implementación → Aplicación web*

| Campo | Valor | Motivo |
|---|---|---|
| Ejecutar como | **Yo** | El script escribe en la hoja del propietario sin pedir cuenta a cada usuario |
| Quién tiene acceso | **Cualquier persona** | Permite que el frontend público consuma la API sin autenticación |

Consecuencia que debe conocerse: con *Cualquier persona*, quien conozca la URL `/exec` puede
leer y escribir datos. Alternativa más restrictiva: *Cualquier usuario con cuenta de Google*; a
cambio, los usuarios deberán iniciar sesión y el `fetch` desde la página puede requerir que ya
tengan sesión activa en el navegador.

### 2.3 Actualizar el backend

Editar y guardar `Code.gs` **no** actualiza la Web App publicada:

*Implementar → Gestionar implementaciones → (editar, icono de lápiz) → Versión: Nueva versión →
Implementar*

La URL `/exec` se mantiene. Si crea una implementación nueva en lugar de una versión nueva,
obtendrá otra URL y tendrá que actualizar `config.runtime.js`.

### 2.4 CORS

Apps Script no responde a las peticiones `OPTIONS` de preflight. Por eso el cliente:

* usa **GET** con parámetros en la query para las lecturas;
* usa **POST** con `Content-Type: text/plain;charset=utf-8` para las escrituras, lo que
  convierte la petición en «simple» y evita el preflight. El cuerpo sigue siendo JSON y el
  servidor lo interpreta con `JSON.parse(e.postData.contents)`.

No añada encabezados personalizados (`Authorization`, `X-…`) a estas peticiones: provocarían un
preflight y el navegador bloquearía la llamada.

### 2.5 Cuotas relevantes de Apps Script

| Límite (cuenta gratuita) | Valor aproximado |
|---|---|
| Tiempo máximo por ejecución | 6 minutos |
| Llamadas `UrlFetch` por día | 20 000 |
| Tiempo total de ejecución al día | 90 minutos |

`getDashboard()` y `getInventory()` recorren las tablas completas. Con decenas de miles de
eventos conviene archivar periódicamente los más antiguos en otra hoja.

### 2.6 Funciones de mantenimiento

| Función | Uso |
|---|---|
| `initializeSheets()` | Crear/completar pestañas y encabezados. Idempotente |
| `runAllTests()` | Pruebas de inventario, geocercas y EAN-13. No escribe en la hoja |
| `loadDemoData()` | Cargar 10 ubicaciones de ejemplo en una hoja vacía |
| `recalculateGeoValidation()` | Recalcular distancia y validación de todos los eventos tras corregir coordenadas o radios |

---

## 3. Frontend: GitHub Pages

### 3.1 Rutas relativas

`index.html` referencia `assets/css/...` y `assets/js/...` sin barra inicial, de modo que la
aplicación funciona igual en:

```
https://usuario.github.io/logitrace/
https://usuario.github.io/otro-nombre/subcarpeta/
http://localhost:8000/
file:///C:/ruta/LogiTrace/index.html   (con las limitaciones del punto 3.4)
```

No se asume la raíz `/` en ningún punto.

### 3.2 Publicación

*Settings → Pages → Source: Deploy from a branch → Branch: `main` → `/ (root)` → Save.*

El despliegue tarda 1–2 minutos. Los cambios posteriores se publican con cada `push`.

Si prefiere no publicar la raíz del repositorio, mueva el frontend a `docs/` y seleccione la
carpeta `/docs` en la configuración de Pages.

### 3.3 Enrutado por hash

La navegación usa `#/vista?param=valor` (por ejemplo `#/traceability?productId=UPEC-…`). Al ser
fragmentos, GitHub Pages no necesita reescritura de rutas y los enlaces profundos funcionan
directamente.

### 3.4 Apertura local (`file://`)

Funciona: los scripts son clásicos (no módulos ES), de modo que no hay restricciones de CORS
entre archivos. Dos limitaciones propias del protocolo:

* la **cámara** y el **GPS** no están disponibles (no es contexto seguro);
* algunos navegadores restringen `localStorage` en `file://`, por lo que el modo local de
  demostración puede no conservar datos entre recargas.

Para probar en el equipo con todas las funciones:

```bash
python -m http.server 8000
```

y abrir `http://localhost:8000` (localhost **sí** es contexto seguro).

### 3.5 Bundle opcional

El proyecto no necesita empaquetado. Si por política interna requiere un solo archivo JS,
genérelo **sin eliminar el código fuente modular**, concatenando en el mismo orden en el que
`index.html` carga los scripts:

```bash
cat assets/js/config.runtime.js \
    assets/js/utils.js \
    assets/js/ui.js \
    assets/js/api.js \
    assets/js/geolocation.js \
    assets/js/locations.js \
    assets/js/maps.js \
    assets/js/rfid.js \
    assets/js/barcode.js \
    assets/js/traceability.js \
    assets/js/events.js \
    assets/js/scanner.js \
    assets/js/products.js \
    assets/js/inventory.js \
    assets/js/geojson.js \
    assets/js/dashboard.js \
    assets/js/app.js > assets/js/app.bundle.js
```

En PowerShell:

```powershell
$orden = 'config.runtime','utils','ui','api','geolocation','locations','maps','rfid','barcode','traceability','events','scanner','products','inventory','geojson','dashboard','app'
$orden | ForEach-Object { Get-Content "assets/js/$_.js" -Raw } | Set-Content assets/js/app.bundle.js -Encoding utf8
```

Después sustituya en `index.html` los 17 `<script>` propios por uno solo a `app.bundle.js`.
El orden importa: `app.js` debe ir al final y `config.runtime.js` primero.
`app.bundle.js` está en `.gitignore` porque es un artefacto derivado.

---

## 4. Requisitos de contexto seguro

| Función | Requiere HTTPS o localhost |
|---|---|
| Cámara (`getUserMedia`) | Sí |
| Geolocalización | Sí |
| Resto de la aplicación | No |

La interfaz lo advierte explícitamente cuando el contexto no es seguro: *«Esta función requiere
HTTPS o localhost. GitHub Pages cumple HTTPS.»* Nunca se oculta el problema ni se simula una
lectura.

---

## 5. Configuración por entorno

`assets/js/config.runtime.js` es el único punto de configuración del frontend.

| Clave | Ejemplo | Efecto |
|---|---|---|
| `APPS_SCRIPT_URL` | `https://script.google.com/macros/s/…/exec` | Sin valor real ⇒ modo local de demostración |
| `SPREADSHEET_ID` | `1AbC…` | Informativo en el frontend; el backend usa su propio `CONFIG` |
| `TIMEZONE` | `America/Guayaquil` | Formato de fechas |
| `LOW_STOCK_THRESHOLD` | `5` | Umbral de «stock bajo» |
| `MAX_ACCEPTABLE_ACCURACY_M` | `100` | Umbral de `BAJA_PRECISION` |
| `DEMO_MODE` | `false` | `true` fuerza el modo local aunque haya backend |

`LOW_STOCK_THRESHOLD` y `MAX_ACCEPTABLE_ACCURACY_M` existen **también** en `CONFIG` de
`Code.gs`. El servidor usa los suyos para decidir; el cliente usa los suyos para mostrar. Si los
cambia, cámbielos en los dos sitios para evitar discrepancias entre lo que se anuncia y lo que
se valida.

La vista *Ayuda / Configuración* permite sobrescribir estos valores **sólo en el navegador
actual** (se guardan en `localStorage`). Es útil para pruebas; no sustituye al archivo.

---

## 6. Seguridad operativa

* No coloque nunca en `config.runtime.js` contraseñas, claves privadas, OAuth secrets ni tokens:
  el archivo es público.
* `.gitignore` excluye `.clasp.json`, `.clasprc.json`, `client_secret*.json` y
  `*.credentials.json`.
* Si publicó por error una URL `/exec` que desea invalidar: *Gestionar implementaciones →
  Archivar*, y cree una implementación nueva.
* La hoja de cálculo no necesita compartirse con nadie: el acceso lo realiza el script con la
  identidad del propietario.
* Este prototipo no implementa autenticación de usuarios ni control de roles; no debe presentarse
  como un sistema con seguridad de nivel productivo.

---

## 7. Verificación posterior al despliegue

| Comprobación | Cómo | Esperado |
|---|---|---|
| Backend vivo | `…/exec?action=health` | `success: true`, `status: OK`, `missingSheets: []` |
| Estructura | Abrir la hoja | Cinco pestañas con encabezados en negrita |
| Modo conectado | Encabezado de la aplicación | *Conectado a Google Sheets* y hora de sincronización |
| Lectura | Vista Productos | Datos provenientes de la hoja |
| Escritura | Crear un producto de prueba | Aparece una fila nueva en `Productos` |
| Transacción | Registrar un despacho | `Eventos` con `STOCK_ANTES`/`STOCK_DESPUES` y `CANTIDAD` actualizada en `Productos` |
| Geo | Registrar con GPS | `LAT_CAPTURADA`, `PRECISION_M`, `DISTANCIA_DECLARADA_M`, `VALIDACION_GEO` rellenos |
| Cámara | Escáner en móvil sobre HTTPS | Lectura y ficha completa |
| Exportación | Vista Exportar | `ubicaciones.geojson` y `eventos.geojson` con `[lon, lat]` |
| QGIS | Añadir capa vectorial | Puntos en Tulcán/Carchi, no en el océano |

---

## 8. Diagnóstico

| Síntoma | Causa | Acción |
|---|---|---|
| *El backend no devolvió JSON* | Web App no pública, o URL `/dev` en vez de `/exec` | Reimplementar con acceso *Cualquier persona* |
| HTTP 401/403 | Acceso restringido a cuentas de Google | Iniciar sesión o cambiar el acceso de la implementación |
| *La pestaña "Productos" no existe* | Falta `initializeSheets()` | Ejecutarla en el editor |
| *No fue posible abrir la hoja con el ID configurado* | `CONFIG.SPREADSHEET_ID` erróneo o sin permiso | Corregir el ID; reautorizar |
| Cambios de `Code.gs` sin efecto | Falta publicar versión nueva | Gestionar implementaciones → Nueva versión |
| Escrituras que se pierden con varios operarios | — | Ya resuelto con `LockService`; si persiste, revise que no haya dos implementaciones distintas apuntando a hojas distintas |
| Todo `BAJA_PRECISION` | Umbral muy estricto | Subir `MAX_ACCEPTABLE_ACCURACY_M` en ambos lados |
| Todo `FUERA_GEOCERCA` | Radio pequeño o coordenadas mal capturadas | Corregir el maestro y ejecutar `recalculateGeoValidation()` |
| Horas desplazadas varias horas en `FECHA_HORA` o `ULTIMA_ACTUALIZACION` | La zona horaria de la hoja no coincide con `CONFIG.TIMEZONE` | Ejecutar `initializeSheets()` (la alinea e informa en el registro) y comprobar `timezoneAligned` en `?action=health`. Requiere `Code.gs` actualizado, que escribe `Date` en lugar de cadenas |
| Mapas o gráficos vacíos | CDN o teselas inaccesibles | Revisar la red; cada componente lo informa en pantalla |
| Timeline vacío tras registrar | Consulta en caché | Botón *Actualizar* de la vista |
