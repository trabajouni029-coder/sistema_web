# LogiTrace

**Identificación, trazabilidad, inventario y geolocalización logística.**

Sistema web que responde de forma integrada a la cadena de preguntas de una operación
logística auditable:

```
¿Qué producto es? → ¿Cómo está identificado? → ¿Cuánto inventario existe? →
¿Qué ocurrió? → ¿Cuándo? → ¿Quién? → ¿Dónde debía ocurrir? → ¿Dónde ocurrió realmente? →
¿La posición fue válida? → ¿Cuál fue el recorrido del producto?
```

No es un maquetado ni un prototipo visual: registra productos, genera y lee identificadores,
mueve inventario con reglas verificadas en el servidor, construye trazabilidad histórica,
captura posición GPS, valida geocercas con Haversine, dibuja trayectorias en mapas y exporta
GeoJSON listo para QGIS.

---

## 1. Arquitectura

```
 Navegador (GitHub Pages, HTTPS)
 ┌──────────────────────────────────────────┐
 │  HTML + CSS + JavaScript (sin framework) │
 │  JsBarcode · QRCode.js · html5-qrcode    │
 │  Chart.js · Leaflet + OpenStreetMap      │
 └───────────────┬──────────────────────────┘
                 │  fetch (GET con query · POST text/plain)
                 ▼
 ┌──────────────────────────────────────────┐
 │  Google Apps Script — Web App (/exec)    │
 │  AUTORIDAD de inventario y geocercas     │
 │  LockService · Haversine · validaciones  │
 └───────────────┬──────────────────────────┘
                 ▼
 ┌──────────────────────────────────────────┐
 │  Google Sheets                            │
 │  Productos · Eventos · Ubicaciones        │
 │  Catalogos · Inicio                       │
 └──────────────────────────────────────────┘
                 │  exportación
                 ▼
        ubicaciones.geojson · eventos.geojson  →  QGIS
```

No se usa Node.js, PHP, Django, Laravel, Firebase, Supabase ni bases SQL. El frontend es
estático y se publica en GitHub Pages; el único backend es Apps Script sobre Sheets.

**QGIS no se integra en la aplicación**: LogiTrace es la fuente de datos y QGIS consume
únicamente los archivos exportados.

---

## 2. Requisitos

| Elemento | Requisito |
|---|---|
| Navegador | Chrome, Edge, Firefox o Safari recientes |
| Cámara | Requiere **HTTPS o localhost** (GitHub Pages cumple HTTPS) |
| GPS | Requiere HTTPS y permiso del usuario; si falla, se selecciona en mapa |
| Cuenta | Una cuenta de Google para la hoja y la Web App |
| Servidor propio | Ninguno |
| Coste | Ninguno |

---

## 3. Estructura del proyecto

```
/
├── index.html                 Shell de la aplicación y las 12 vistas
├── README.md
├── INICIO_RAPIDO.md           Puesta en marcha paso a paso
├── .gitignore
│
├── assets/
│   ├── css/
│   │   ├── variables.css      Tokens de color, tipografía, espaciado (+ tema oscuro)
│   │   ├── components.css     Tarjetas, KPI, botones, tablas, timeline, modales, toasts
│   │   ├── layout.css         Shell, sidebar, header, grids
│   │   ├── maps.css           Contenedores Leaflet, marcadores, leyenda, precisión
│   │   ├── responsive.css     Desktop → tablet → smartphone
│   │   └── print.css          Impresión de etiquetas (sin sidebar ni header)
│   │
│   └── js/
│       ├── config.runtime.js  ÚNICO archivo a editar por cada usuario
│       ├── utils.js           Utilidades puras, catálogos, Haversine, EAN-13
│       ├── ui.js              Toasts, modales, tablas ordenables, estados
│       ├── api.js             Transporte a Apps Script + motor local de demostración
│       ├── geolocation.js     Captura GPS, precisión, componente de captura
│       ├── locations.js       Maestro de ubicaciones, jerarquía, herencia
│       ├── maps.js            Leaflet: ubicaciones, geocercas, eventos, trayectorias
│       ├── rfid.js            RFID SIMULADO (UID y EPC 96 bits)
│       ├── barcode.js         Code 128, EAN-13, QR, etiqueta logística
│       ├── traceability.js    Timeline y vista de trazabilidad
│       ├── events.js          Registro de eventos con confirmación explícita
│       ├── scanner.js         Cámara/imagen/manual + ficha completa del producto
│       ├── products.js        Alta, edición y listado de productos
│       ├── inventory.js       KPIs, existencias y tarjetas por categoría
│       ├── geojson.js         Exportación GeoJSON y CSV
│       ├── dashboard.js       KPIs logísticos y geográficos + gráficos
│       └── app.js             Arranque, enrutado, búsqueda global, configuración
│
├── apps-script/
│   └── Code.gs                Backend completo + pruebas ejecutables
│
├── base-datos/
│   └── LogiTrace_Base.xlsx    Base lista para importar, con datos de demostración
│
└── docs/
    ├── modelo-datos.md        Encabezados, tipos, reglas y diccionario de datos
    ├── despliegue.md          Apps Script, Sheets, GitHub Pages, permisos
    └── pruebas.md             Casos de prueba y MATRIZ DE REQUISITOS
```

El código fuente es modular a propósito: nada se concentra en `index.html`. Si necesita un
único archivo por compatibilidad de apertura local, en `docs/despliegue.md` se documenta cómo
generar `assets/js/app.bundle.js` conservando el código fuente modular.

---

## 4. Configuración

Edite **sólo** `assets/js/config.runtime.js`:

```js
window.LOGITRACE_CONFIG = Object.freeze({
  APPS_SCRIPT_URL: 'PEGAR_AQUI_URL_WEB_APP',
  SPREADSHEET_ID: 'PEGAR_AQUI_SPREADSHEET_ID',
  TIMEZONE: 'America/Guayaquil',
  LOW_STOCK_THRESHOLD: 5,
  MAX_ACCEPTABLE_ACCURACY_M: 100,
  DEMO_MODE: false
});
```

No hay IDs codificados en ninguna otra parte. **Nunca** añada contraseñas, claves privadas,
OAuth secrets ni tokens: el archivo es público en GitHub Pages.

Mientras `APPS_SCRIPT_URL` conserve el valor de ejemplo, la aplicación arranca en
**modo local de demostración** (datos en el navegador) y lo advierte en el encabezado. En
cuanto hay backend configurado, **todos los datos provienen de Google Sheets**: no se usan
datos simulados.

La vista *Ayuda / Configuración* permite además guardar una configuración sólo para el
navegador actual, útil para pruebas sin tocar el repositorio.

---

## 5. Google Sheets

Cinco pestañas: `Productos`, `Eventos`, `Ubicaciones`, `Catalogos`, `Inicio`. Las tres
primeras son las operativas críticas.

`initializeSheets()` crea lo que falte y añade encabezados ausentes. Es **idempotente**:
ejecutarla dos veces no altera datos ni duplica columnas.

Apps Script **nunca depende del orden de las columnas**: todo el acceso se realiza por nombre
de encabezado.

El detalle de cada campo está en [docs/modelo-datos.md](docs/modelo-datos.md).

---

## 6. Apps Script

`apps-script/Code.gs` implementa:

`doGet` · `doPost` · `initializeSheets` · `getProducts` · `getProduct` · `createProduct` ·
`updateProduct` · `findProductByCode` · `getEvents` · `createEvent` · `getTrace` ·
`getInventory` · `getDashboard` · `getLocations` · `getLocation` · `createLocation` ·
`updateLocation` · `resolveLocationCoordinates` · `haversineDistance` · `validateGeoEvent` ·
`getGeoEvents` · `buildLocationsGeoJSON` · `buildEventsGeoJSON`

Y además: `runAllTests()` (pruebas de inventario, geocercas y EAN-13),
`loadDemoData()` y `recalculateGeoValidation()`.

### API

**GET**

```
?action=health
?action=products
?action=product&id=...
?action=findProductByCode&code=...
?action=events&productId=...
?action=trace&productId=...
?action=inventory
?action=dashboard
?action=locations
?action=location&id=...
?action=geoEvents
?action=locationsGeoJSON
?action=eventsGeoJSON
```

**POST** (cuerpo JSON; `Content-Type: text/plain` para evitar el preflight CORS que Apps
Script no atiende)

```json
{ "action": "createProduct",  "data": {} }
{ "action": "createEvent",    "data": {} }
{ "action": "createLocation", "data": {} }
```

**Respuestas**

```json
{ "success": true,  "message": "Operación realizada correctamente", "data": {} }
{ "success": false, "message": "Stock insuficiente", "errorCode": "INSUFFICIENT_STOCK" }
```

---

## 7. Reglas de inventario

| Evento | Efecto | Cantidad |
|---|---|---|
| RECEPCIÓN | `stock + cantidad` | obligatoria |
| DEVOLUCIÓN | `stock + cantidad` | obligatoria |
| DESPACHO | `stock − cantidad` | obligatoria |
| INGRESO AL ALMACÉN | sin efecto | — |
| UBICACIÓN | sin efecto | — |
| MOVIMIENTO INTERNO | sin efecto | — |
| PREPARACIÓN DE PEDIDO | sin efecto | — |
| ENTREGA | sin efecto (no descuenta de nuevo) | — |
| INCIDENCIA | sin efecto automático | — |

* La cantidad de creación de un producto es **stock inicial**: no genera una recepción
  adicional.
* **Nunca** se permite stock negativo.
* El orden de la transacción en el servidor es: localizar producto → validar evento → leer
  stock → validar cantidad → calcular stock → procesar geolocalización → validar geocerca →
  crear evento → actualizar producto → responder. Todo bajo `LockService`.
* Cada intento lleva un `CLIENT_REQUEST_ID`: si se reenvía, el evento **no se duplica**.

---

## 8. Geolocalización y geocercas

**Estados exactos:** `OK` · `FUERA_GEOCERCA` · `BAJA_PRECISION` · `SIN_GPS`

| Condición | Resultado |
|---|---|
| Sin latitud/longitud | `SIN_GPS` |
| `PRECISION_M > MAX_ACCEPTABLE_ACCURACY_M` | `BAJA_PRECISION` |
| Precisión aceptable y `distancia > radio` | `FUERA_GEOCERCA` |
| Precisión aceptable y `distancia ≤ radio` | `OK` |

* La distancia se calcula con **Haversine** (radio terrestre 6 371 000 m) y la validación
  definitiva se ejecuta **siempre en Apps Script**. El cliente sólo muestra una vista previa.
* Un evento `FUERA_GEOCERCA` **se guarda**: es evidencia de una anomalía, nunca un motivo de
  rechazo.
* La validación geográfica **no modifica** ninguna regla de inventario.
* Si el GPS falla, el flujo no se interrumpe: se ofrece selección en mapa y, en último caso,
  el evento se registra con `SIN_GPS`. **No se inventan coordenadas.**
* **Precisión ≠ distancia**: la precisión es la incertidumbre del sensor; la distancia es la
  separación respecto a la ubicación declarada. Se muestran siempre por separado.

### Jerarquía de ubicaciones

`PADRE_ID` construye la jerarquía. Una ubicación sin coordenadas propias **hereda** LAT/LON
del primer ancestro que las tenga, y el radio del primero que lo defina:

```
Centro de Distribución (coordenadas propias, radio 150 m)
 ├── Muelle 1        (coordenadas propias, radio 40 m)
 ├── Rack A01        (sin coordenadas → hereda del centro)
 └── Patio           (coordenadas propias, radio 80 m)
```

No se colocan coordenadas ficticias a los racks: heredan las del padre y se indica en la
interfaz y en el GeoJSON (`coordenadas_heredadas`). Los ciclos se detectan y se rechazan.

Radios sugeridos iniciales, **editables** y no universales: planta/producción 200 m, centro de
distribución 150 m, proveedor 150 m, cliente 100 m, almacén 150 m, patio 100 m, muelle 50 m,
laboratorio 50 m, ubicaciones internas heredan.

---

## 9. Identificación

| Tecnología | Uso | Notas |
|---|---|---|
| **Code 128** | Identificadores alfanuméricos internos | `UPEC-ALM-P001-L03-0001` |
| **EAN-13** | Sólo dígitos | Con 12 calcula el dígito 13; con 13 valida el checksum |
| **QR** | Simple (`ID_PRODUCTO`) o estructurado `{type,id,version}` | El escáner reconoce ambos |
| **RFID** | **SIMULADO** | UID de 8 bytes y EPC-like de 96 bits generados por software |

* Aviso permanente en EAN-13: *«EAN-13 demostrativo / uso interno. No representa
  necesariamente un GTIN oficialmente asignado por GS1.»*
* Aviso permanente en RFID: **RFID SIMULADO**. LogiTrace no realiza lectura de etiquetas
  físicas; no existe API web estándar para ello.
* Los códigos se generan **en el navegador**. Se usó el flujo de generadores comerciales
  (seleccionar tipo → introducir → configurar → generar → visualizar → descargar) únicamente
  como referencia conceptual: no se copió código, marca, logotipo, diseño ni componentes, y la
  aplicación no depende de ningún servicio comercial.

### Al escanear

La lectura **nunca** muestra sólo el código. Se consulta el producto y su historial y se
presenta: identificación de la lectura, datos completos del producto, identificadores
renderizados gráficamente, resumen histórico, timeline íntegro, información geográfica con
mapa, y acciones (trazabilidad, mapa, etiqueta, registrar evento). **El evento no se registra
automáticamente**: requiere confirmación explícita.

---

## 10. Exportación a QGIS

Dos capas: `ubicaciones.geojson` y `eventos.geojson` (más, opcionalmente, la trayectoria de un
producto como `LineString` y el inventario en CSV como tabla auxiliar).

> **Orden de coordenadas:** GeoJSON usa `[LONGITUD, LATITUD]`, nunca `[LATITUD, LONGITUD]`.
> Todos los pares se construyen en una única función (`coordPair`) para impedir inversiones.

SRC: EPSG:4326 (CRS84), detectado automáticamente por QGIS. Los eventos `SIN_GPS` **no** se
exportan como puntos: se cuentan en los metadatos (`eventosSinCoordenadas`) y se listan en la
interfaz.

---

## 11. Despliegue en GitHub Pages

Todas las rutas son relativas: la aplicación funciona en
`https://usuario.github.io/repositorio/` sin asumir la raíz `/`.

Pasos detallados en [INICIO_RAPIDO.md](INICIO_RAPIDO.md) y
[docs/despliegue.md](docs/despliegue.md).

---

## 12. Permisos que solicita

| Permiso | Para qué | Quién lo concede |
|---|---|---|
| Google Sheets (Apps Script) | Leer y escribir la hoja | El propietario, una vez, al autorizar el script |
| Cámara | Leer códigos de barras y QR | El usuario en el navegador, sobre HTTPS |
| Ubicación | Georreferenciar eventos | El usuario en el navegador, sobre HTTPS |

Si la cámara o el GPS se deniegan, la aplicación sigue funcionando: lectura desde imagen o
entrada manual, y posición seleccionada en mapa o `SIN_GPS`.

---

## 13. Pruebas

* **En el navegador:** [docs/pruebas.md](docs/pruebas.md) contiene los casos ejecutados y la
  matriz de requisitos con el resultado real de cada comprobación.
* **En Apps Script:** ejecute `runAllTests()` y consulte el registro. Cubre los casos de
  inventario (A–G), los cuatro estados geográficos, la herencia de coordenadas y el checksum
  EAN-13. No escribe en la hoja.

---

## 14. Limitaciones declaradas

* Prototipo académico. **No** incorpora autenticación de usuarios, roles, cifrado de datos ni
  auditoría de seguridad de nivel productivo, y no debe presentarse como sistema empresarial.
* El RFID es simulado.
* Los EAN-13 generados son de uso interno; no son GTIN asignados por GS1.
* La distancia geodésica (Haversine) **no** equivale a distancia vial.
* Cámara y geolocalización requieren HTTPS o localhost.
* Sin conexión no se sincronizan escrituras: el formulario se conserva para reintentar, sin
  mostrar falsas confirmaciones.
* Quien pueda abrir la URL de la Web App puede leer y escribir en la hoja: la Web App debe
  publicarse con el acceso mínimo compatible con el uso previsto.

---

## 15. Seguridad aplicada

* Todo dato mostrado se escapa antes de insertarse en el DOM (`U.esc`); no se inserta entrada
  del usuario sin sanear.
* No se almacenan secretos en el repositorio ni en `localStorage`.
* El backend valida de nuevo **todo**: existencia del producto, tipo de evento, cantidades,
  stock, unicidad de códigos, checksum EAN-13, rangos de coordenadas, radios, existencia de la
  ubicación declarada y ciclos de jerarquía. Ninguna validación de cliente se considera
  suficiente.
* `.gitignore` excluye credenciales de `clasp` y archivos de secretos.

---

## 16. Créditos y datos de terceros

* Cartografía: **OpenStreetMap** (© colaboradores de OpenStreetMap), con atribución visible en
  todos los mapas.
* Bibliotecas de terceros cargadas desde CDN: JsBarcode, QRCode.js, html5-qrcode, Chart.js,
  Leaflet, Lucide. Cada una conserva su propia licencia.
* Los datos de demostración (productos, ubicaciones de Tulcán/Carchi y eventos) son ficticios
  y pueden eliminarse sin afectar al funcionamiento del sistema.
