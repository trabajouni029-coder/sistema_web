# LogiTrace — Pruebas y matriz de requisitos

## 0. Alcance y honestidad de esta verificación

Las pruebas que se marcan como **verificadas** se ejecutaron realmente el **29/09/2026** sobre la
aplicación servida en `http://localhost:8801` (contexto seguro) en un navegador Chromium, con los
datos de demostración cargados. Cada resultado de este documento es una salida real, no una
expectativa.

Esa ejecución se realizó en **modo local**, donde el motor de reglas del cliente
(`assets/js/api.js`) aplica exactamente las mismas reglas de inventario, geocercas y validación
que `apps-script/Code.gs`. Eso permite verificar la lógica y toda la interfaz, pero **no**
sustituye a la comprobación del backend real.

Lo que **no** se ha podido verificar aquí, porque exige una cuenta de Google y un dispositivo
físico, queda marcado como **pendiente de verificación en su entorno**, con el procedimiento
exacto para comprobarlo:

| No verificado aquí | Cómo lo verifica usted |
|---|---|
| Ejecución de `Code.gs` sobre Google Sheets | `initializeSheets()` y `runAllTests()` en el editor de Apps Script |
| Escritura real en la hoja | Crear un producto y un evento con el backend configurado |
| Idempotencia de `initializeSheets()` en la hoja real | Ejecutarla dos veces y comparar la hoja |
| `LockService` con operarios simultáneos | Dos dispositivos registrando eventos a la vez |
| Cámara física (Code 128 / EAN-13 / QR) | Escáner en un smartphone sobre HTTPS |
| GPS real y su precisión | Registrar un evento con *Obtener posición actual* |
| Carga en QGIS | Añadir las dos capas GeoJSON exportadas |
| Publicación en GitHub Pages | Seguir `INICIO_RAPIDO.md` pasos 11–13 |

Una coherencia adicional que sí quedó comprobada: la base `LogiTrace_Base.xlsx` se generó con una
implementación independiente de las mismas fórmulas (Haversine, herencia por `PADRE_ID`, umbral de
precisión) y produjo **exactamente** la misma distribución que el motor de la aplicación
—16 eventos georreferenciados, 13 `OK`, 2 `FUERA_GEOCERCA`, 1 `BAJA_PRECISION`, 4 `SIN_GPS`—, lo
que valida las reglas por dos caminos separados.

---

## 1. Pruebas de inventario

Producto `UPEC-CD-P002-L07-0002` (stock inicial 12) y `UPEC-CD-P003-L01-0003` (stock 3).

| # | Caso | Entrada | Esperado | Obtenido | Resultado |
|---|---|---|---|---|---|
| A | Recepción suma | stock 1, RECEPCIÓN +4 | 5 | `1→5` | ✅ |
| B | Despacho resta | stock 12, DESPACHO −4 | 8 | `12→8` | ✅ |
| C | **Despacho mayor al stock** | stock 3, DESPACHO 5 | Rechazo y stock 3 | Error `INSUFFICIENT_STOCK`: «Stock insuficiente: disponible 3.» Stock final 3 | ✅ |
| D | Movimiento interno no altera stock | stock 12, MOVIMIENTO INTERNO 5 | 12 | `12→12` | ✅ |
| E | **Entrega tras despacho no descuenta dos veces** | DESPACHO −4 (12→8), luego ENTREGA 4 | 8 | `8→8` | ✅ |
| F | Devolución suma | stock 8, DEVOLUCIÓN +2 | 10 | `8→10` | ✅ |
| G | Incidencia no modifica inventario | stock 5, INCIDENCIA | 5 | `5→5` | ✅ |
| H | Preparación de pedido no altera stock | stock 8, PREPARACIÓN 3 | 8 | `8→8` | ✅ |
| I | Ingreso al almacén no altera stock | stock 8, INGRESO AL ALMACÉN | 8 | `8→8` | ✅ |
| J | Ubicación no altera stock | stock 10, UBICACIÓN | 10 | `10→10` | ✅ |
| K | **Stock inicial no genera recepción** | Crear producto con cantidad 7 | 7 unidades, 0 eventos | Stock 7, eventos del producto: 0 | ✅ |
| L | Historial no se elimina | 9 eventos sobre el mismo producto | 9 conservados | 9 | ✅ |
| M | Stock nunca negativo | Ningún caso lo produjo; el rechazo actúa antes | — | Invariante mantenido | ✅ |

Las mismas comprobaciones están automatizadas en el servidor: ejecute `runAllTests()` en Apps
Script (casos A–G de `testInventoryRules_`). No escribe en la hoja.

---

## 2. Pruebas de geolocalización y geocercas

Umbral configurado: `MAX_ACCEPTABLE_ACCURACY_M = 100`.
Ubicación declarada `CD-001-M1` (Muelle 1, radio 40 m) y `CD-001-RA01` (Rack A01, sin
coordenadas propias, hijo de `CD-001` con radio 150 m).

| # | Caso | Entrada | Esperado | Obtenido | Resultado |
|---|---|---|---|---|---|
| 1 | Posición válida | dist ≈ 2,5 m · radio 40 m · precisión 9 m | `OK` | `OK`, distancia 2,5 m, radio 40 m | ✅ |
| 2 | **Fuera de geocerca** | dist ≈ 1 093 m · radio 40 m · precisión 10 m | `FUERA_GEOCERCA` y evento **guardado** | `FUERA_GEOCERCA`, 1 093 m, evento guardado con ID | ✅ |
| 3 | Baja precisión | precisión 600 m | `BAJA_PRECISION` | `BAJA_PRECISION` | ✅ |
| 4 | Sin GPS | sin `LAT`/`LON` | `SIN_GPS`, evento guardado | `SIN_GPS`, evento guardado, sin coordenadas inventadas | ✅ |
| 5 | **Herencia de coordenadas** | Evento declarado en `CD-001-RA01` | Hereda LAT/LON y radio 150 m de `CD-001` | `OK`, 6,3 m, radio heredado 150 m, ubicación efectiva «Centro de Distribución Tulcán», `inherited: true` | ✅ |
| 6 | Excepción geo no altera inventario | INCIDENCIA `FUERA_GEOCERCA` | Stock sin cambios | `5→5` | ✅ |
| 7 | Haversine | (0.81234, −77.71782) → (0.81252, −77.71782) | ≈ 20 m | 20 m | ✅ |
| 8 | Rango de coordenadas | LAT 95 / LON −200 | Rechazo | Validado en cliente y servidor (`INVALID_COORDINATE`) | ✅ |
| 9 | Precisión ≠ distancia | Caso 3 (600 m de precisión, 2 m de distancia) | Campos separados | Se muestran e informan por separado | ✅ |
| 10 | Ciclo en la jerarquía | `CD-001.PADRE_ID = CD-001-M1` | Rechazo | `CIRCULAR_PARENT` | ✅ |
| 11 | Ubicación duplicada | Crear `CD-001` existente | Rechazo | `DUPLICATE_ID` | ✅ |
| 12 | Ubicación hija nueva sin coordenadas | `QA-001`, padre `CD-001` | Hereda 0.81234 / −77.71782 y radio 150 | Heredado correctamente | ✅ |

Equivalentes en el servidor: `testGeoRules_()` dentro de `runAllTests()`.

---

## 3. Pruebas de identificación

| # | Caso | Entrada | Esperado | Obtenido | Resultado |
|---|---|---|---|---|---|
| 1 | Code 128 | `UPEC-ALM-P001-L03-0001` | Barras renderizadas | SVG generado; metadatos «Code 128, 22 caracteres» | ✅ |
| 2 | **EAN-13 con 12 dígitos** | `786010000003` | Calcula dígito 13 | `7860100000033`, dígito de control 3 (calculado) | ✅ |
| 3 | EAN-13 con 13 dígitos válidos | `7860100000033` | Acepta | Aceptado | ✅ |
| 4 | **EAN-13 con checksum erróneo** | `7860100000039` | Rechazo con mensaje | Rechazado, sin render | ✅ |
| 5 | EAN-13 alfanumérico | `ABC123456789` | Rechazo | Rechazado: «EAN-13 acepta únicamente dígitos numéricos» | ✅ |
| 6 | Aviso GS1 | Cualquier EAN-13 | Aviso visible | «EAN-13 demostrativo / uso interno…» presente en generador, galería y etiqueta | ✅ |
| 7 | QR simple | `UPEC-ALM-P001-L03-0001` | Canvas QR | Canvas generado | ✅ |
| 8 | QR estructurado | `{type,id,version}` | Canvas + JSON | `{"type":"PRODUCT","id":"UPEC-ALM-P001-L03-0001","version":1}` | ✅ |
| 9 | **El escáner reconoce ambos QR** | Ambas cargas | Extrae el mismo ID | `structured:true → id` y `structured:false → id`, ambos `UPEC-ALM-P001-L03-0001` | ✅ |
| 10 | RFID simulado | Generar | UID + EPC 96 bits + aviso | UID `B4:C0:DB:D1:A2:84:9E:D4`, EPC de 24 hex, «RFID SIMULADO» visible | ✅ |
| 11 | ID automático | Secuencia 11, ubicación `ALM-UPEC`, lote `L11` | Formato legible | `UPEC-ALM-P011-L11-0011` | ✅ |
| 12 | Unicidad de ID | Crear un `ID_PRODUCTO` existente | Rechazo | `DUPLICATE_ID` | ✅ |
| 13 | Unicidad de códigos | Reutilizar un `CODIGO_1D` | Rechazo | `DUPLICATE_CODE` | ✅ |
| 14 | Búsqueda por cada tecnología | ID / EAN / RFID | Encuentra el producto | ID ✓ · `7860100000071` → P007 ✓ · EPC → P008 ✓ | ✅ |
| 15 | Etiqueta logística | Abrir etiqueta de P003 | Producto, ID, lote, categoría, barras, QR, RFID | Todos presentes; barras en SVG y QR en canvas | ✅ |
| 16 | Lectura por cámara | Enfocar un código | Decodificación | **Pendiente**: requiere cámara física sobre HTTPS | ⏳ |
| 17 | Lectura desde imagen | Cargar una foto del código | Decodificación | **Pendiente**: requiere archivo de imagen real | ⏳ |

---

## 4. Prueba de escaneo completa (sección 79 del requerimiento)

Ejecutada con entrada manual del código EAN-13 `7860100000033` (la rama posterior al decodificado
es idéntica a la de la cámara: ambas llaman a `handleCode()`).

| Paso | Esperado | Obtenido | Resultado |
|---|---|---|---|
| 1 | Leer el código | Valor leído `7860100000033` | ✅ |
| 2 | Identificar el producto | `UPEC-CD-P003-L01-0003` — Leche entera 1 L | ✅ |
| 3 | Mostrar ficha completa | Identificación, producto, stock, ubicaciones, vencimiento, estado | ✅ |
| 4 | Mostrar el código de barras | SVG EAN-13 renderizado | ✅ |
| 5 | Mostrar el QR | Canvas QR renderizado | ✅ |
| 6 | Mostrar el RFID | `3034257BF7194E4000000021` con aviso de simulación | ✅ |
| 7 | Mostrar el timeline | 3 eventos con todos los campos exigidos | ✅ |
| 8 | Mostrar el último estado geográfico | `OK`, 9 m de distancia, ±9 m de precisión, mapa | ✅ |
| 9 | Elegir el evento | Formulario con los nueve eventos y su efecto en el stock | ✅ |
| 10 | Capturar GPS | Botón presente; **pendiente** de dispositivo real | ⏳ |
| 11 | Mostrar precisión | Barra de precisión y umbral; vista previa de distancia | ✅ |
| 12 | Confirmar | **Nunca** se registra automáticamente: exige confirmación | ✅ |
| 13 | El servidor valida | En modo local lo hace el motor equivalente; en producción, `Code.gs` | ✅ / ⏳ |
| 14 | Actualizar stock | `3→1` | ✅ |
| 15 | Registrar el historial | Evento con UUID `5f591801-…` | ✅ |
| 16 | Refrescar la trazabilidad | Ficha y timeline recargados | ✅ |
| 17 | Mostrar el evento en el mapa | Punto visible en la trayectoria | ✅ |

---

## 5. Pruebas de trazabilidad y cartografía

| # | Caso | Esperado | Obtenido | Resultado |
|---|---|---|---|---|
| 1 | Timeline completo | Un elemento por evento con fecha, evento, cantidad, stock antes/después, actor, origen, destino, código leído, tecnología, observación, estado y bloque geográfico | 7 elementos con los 14 campos | ✅ |
| 2 | **Identificadores visibles en trazabilidad** | Barras, QR y RFID dibujados, no sólo al imprimir | SVG + canvas + chip presentes en la vista | ✅ |
| 3 | Trayectoria numerada | Marcadores 1 → 2 → 3 … unidos por polilínea | Marcadores `1,2,3,4,5,6` y polilíneas dibujadas | ✅ |
| 4 | KPIs geográficos | Georreferenciados, OK, fuera, baja precisión, sin GPS, distancia geodésica | Todos presentes con la aclaración de que no es distancia vial | ✅ |
| 5 | Mapa general | Ubicaciones, geocercas, eventos diferenciados, atribución OSM | 30 marcadores, círculos de geocerca, «© Colaboradores de OpenStreetMap» | ✅ |
| 6 | Leyenda | Símbolo + texto, no sólo color | ✓ OK · ⚠ Fuera · ◉ Baja precisión · — Sin GPS · ▣ Ubicación · ◯ Geocerca | ✅ |
| 7 | **Eventos sin GPS** | Contados y listados, nunca con coordenadas inventadas | «Eventos sin coordenadas (5)» en tabla aparte | ✅ |
| 8 | Filtros del mapa | Producto, evento, estado geo, ubicación, fechas + Aplicar/Limpiar/Ajustar | Operativos; contadores coherentes (25 eventos: 15 OK, 3 fuera, 2 baja, 5 sin GPS) | ✅ |
| 9 | Mapa en ficha de escaneo | Mapa pequeño si hay coordenadas | Presente | ✅ |

---

## 6. Pruebas de inventario, dashboard y exportación

| # | Caso | Esperado | Obtenido | Resultado |
|---|---|---|---|---|
| 1 | KPIs de inventario | Productos, unidades, categorías, stock bajo, agotados | 10 · 171 · 7 · 2 · 1 | ✅ |
| 2 | Tarjetas por categoría | Productos, unidades y última actualización por categoría | 7 tarjetas | ✅ |
| 3 | Estados de stock | Disponible / Stock bajo / Agotado | Los tres presentes en la tabla | ✅ |
| 4 | KPIs del dashboard | 10 logísticos + 5 geográficos | Todos calculados (65 % OK, 10 % fuera, 5 % baja, 20 % sin GPS) | ✅ |
| 5 | Gráficos | Inventario, tecnologías, actividad, validación geo, excepciones por ubicación, eventos por tipo | Los 6 instanciados en Chart.js | ✅ |
| 6 | Alertas operativas | Agotados, stock bajo, fuera de geocerca, baja precisión, incidencias | 5 alertas con acceso directo a la vista correspondiente | ✅ |
| 7 | **`ubicaciones.geojson`** | `Point` por ubicación, con radio y jerarquía | 10 features; `coordenadas_heredadas: SI` en `CD-001-RA01` y `LAB-001` | ✅ |
| 8 | **`eventos.geojson`** | `Point` por evento con coordenadas; los `SIN_GPS` se omiten y se cuentan | 20 features, 5 omitidos e informados | ✅ |
| 9 | **Orden de coordenadas** | `[longitud, latitud]` | `[-77.71782, 0.81234]` — longitud primero | ✅ |
| 10 | CRS | EPSG:4326 / CRS84 | `urn:ogc:def:crs:OGC:1.3:CRS84` | ✅ |
| 11 | Trayectoria GeoJSON | `LineString` con distancia geodésica | 6 puntos, 4 318 m | ✅ |
| 12 | Carga en QGIS | Capas legibles y bien situadas | **Pendiente**: requiere QGIS instalado | ⏳ |

---

## 7. Pruebas de interfaz, accesibilidad y robustez

| # | Caso | Esperado | Obtenido | Resultado |
|---|---|---|---|---|
| 1 | Errores de consola | Ninguno | 0 errores en todo el recorrido | ✅ |
| 2 | Botones sin función | Ninguno | Todos los controles de las 12 vistas responden | ✅ |
| 3 | Móvil (≤ 600 px) | Sidebar colapsable, tablas en tarjetas, sin scroll horizontal | Sidebar oculto con botón de menú, celdas en `grid` con etiqueta, sin scroll horizontal | ✅ |
| 4 | Botones táctiles | ≥ 44 px de alto | `min-height: 44px` | ✅ |
| 5 | Mapa en móvil | ≥ 350 px de alto | 350–360 px | ✅ |
| 6 | Sin `alert()` | Toasts, modales y errores en línea | No se usa `alert()` en ningún archivo | ✅ |
| 7 | Estados vacíos y cargando | Presentes | Loaders, estados vacíos y de error con reintento | ✅ |
| 8 | Modo local advertido | Aviso explícito | Banner «Modo local de demostración» con acceso a Configuración | ✅ |
| 9 | Backend caído | Error visible, sin datos falsos | Banner rojo con reintento; no se sustituye por datos simulados | ✅ |
| 10 | Sin conexión | No mostrar confirmación falsa; conservar el formulario | Se bloquea el envío, se guarda el borrador y se avisa | ✅ |
| 11 | Idempotencia de escritura | Reenviar el mismo intento no duplica | Mismo `CLIENT_REQUEST_ID` → mismo `ID_EVENTO`, `duplicated: true` | ✅ |
| 12 | Escapado de datos | Sin HTML sin sanear | Todo pasa por `U.esc()` | ✅ |
| 13 | Sin secretos | Ninguno en el repositorio | Verificado; `.gitignore` cubre credenciales | ✅ |
| 14 | Teclado y foco | Navegación y anillo de foco visibles | Tabs con flechas, `focus-visible`, `aria-*`, región `aria-live` | ✅ |
| 15 | Estado no sólo por color | Símbolo + texto | Badges y leyenda con ✓ ⚠ ◉ — | ✅ |
| 16 | Tema oscuro | Legible | Tokens redefinidos; conmutador en el encabezado | ✅ |
| 17 | Impresión | Sólo la etiqueta | `@media print` oculta sidebar, header, botones y mapas | ✅ |
| 18 | Aviso de HTTPS | Visible donde se usan cámara y GPS | Presente cuando el contexto no es seguro | ✅ |
| 19 | Datos demo eliminables | Sin afectar al sistema | *Eliminar datos demo* deja el sistema vacío y operativo; *Restaurar* devuelve 10/20/10 | ✅ |
| 20 | Rutas relativas | Funciona en subcarpeta | Sin rutas absolutas en `index.html` | ✅ |

---

## 8. MATRIZ FINAL DE REQUISITOS

Leyenda: **✅ Verificado** (probado en ejecución, con el resultado registrado arriba) ·
**⏳ Implementado, pendiente de verificación en su entorno** (requiere cuenta de Google,
dispositivo físico o QGIS).

| Requisito | Estado | Archivo(s) | Prueba realizada |
|---|---|---|---|
| Aplicación web ejecutable de extremo a extremo | ✅ Verificado | `index.html` + `assets/**` | Recorrido completo de las 12 vistas sin errores de consola |
| Frontend estático HTML + CSS + JS, sin framework | ✅ Verificado | `index.html`, `assets/**` | Servido por `http.server`; sin build |
| Backend Apps Script + Google Sheets | ⏳ Implementado | `apps-script/Code.gs` | 23 funciones exigidas presentes; ejecutar `initializeSheets()` y `runAllTests()` |
| Sin Node/PHP/Django/Laravel/Firebase/SQL | ✅ Verificado | todo el proyecto | Sin dependencias de servidor |
| Configuración sin IDs codificados | ✅ Verificado | `assets/js/config.runtime.js` | Único punto de configuración; formulario en *Configuración* |
| Sin secretos ni credenciales | ✅ Verificado | `.gitignore`, todo el proyecto | Revisión del repositorio |
| Estructura modular (nada concentrado en el HTML) | ✅ Verificado | `assets/js/*` (17 archivos) | Estructura entregada; bundle opcional documentado |
| Sidebar con las 12 secciones | ✅ Verificado | `index.html`, `app.js` | Navegación por hash a las 12 vistas |
| Header: estado, modo, sincronización, búsqueda, escaneo rápido | ✅ Verificado | `index.html`, `app.js` | Estado local/conectado, hora de sincronización, búsqueda y escaneo |
| Componentes: KPI, tablas, filtros, badges, gráficos, timeline, mapas, modales, toasts, vacíos, loaders | ✅ Verificado | `components.css`, `ui.js` | Todos en uso |
| 5 pestañas en Sheets con encabezados exactos | ⏳ Implementado | `Code.gs`, `LogiTrace_Base.xlsx` | Encabezados exactos en `HEADERS` y en la base; verificar tras `initializeSheets()` |
| Acceso por nombre de encabezado (no por posición) | ⏳ Implementado | `Code.gs` (`headerIndex_`, `readTable_`) | Mapeo por título de columna en todas las lecturas y escrituras |
| `initializeSheets()` idempotente | ⏳ Implementado | `Code.gs` | Añade sólo lo ausente; no borra ni duplica. Verificar ejecutándola dos veces |
| Hoja `Productos` (19 columnas) | ✅ Verificado | `LogiTrace_Base.xlsx` | Encabezados exactos; 10 productos |
| Hoja `Eventos` (23 columnas, 7 geográficas) | ✅ Verificado | `LogiTrace_Base.xlsx` | Encabezados exactos; 20 eventos |
| Hoja `Ubicaciones` (9 columnas) | ✅ Verificado | `LogiTrace_Base.xlsx` | Encabezados exactos; 10 ubicaciones |
| Alta de productos con validaciones | ✅ Verificado | `products.js`, `Code.gs` | Obligatorios, cantidad ≥ 0, ID único, códigos únicos |
| ID automático legible y compatible | ✅ Verificado | `barcode.js` | `UPEC-ALM-P011-L11-0011` |
| Origen/destino/ubicación desde el maestro | ✅ Verificado | `locations.js`, `products.js` | Selectores que muestran NOMBRE y guardan ID |
| Tabla de productos con búsqueda, filtro, orden, paginación y acciones | ✅ Verificado | `products.js`, `ui.js` | 10 registros, 13 columnas, 5 acciones por fila |
| Code 128 | ✅ Verificado | `barcode.js` | SVG generado, descargable |
| EAN-13 con checksum y aviso GS1 | ✅ Verificado | `barcode.js`, `utils.js`, `Code.gs` | Cálculo, validación, rechazo y aviso |
| QR simple y estructurado | ✅ Verificado | `barcode.js` | Ambas modalidades generadas y reconocidas |
| RFID simulado (UID + EPC 96 bits) con aviso | ✅ Verificado | `rfid.js` | UID de 8 bytes, EPC de 24 hex, aviso siempre visible |
| Generador con flujo configurar → generar → visualizar → descargar/imprimir | ✅ Verificado | `barcode.js`, `index.html` | Los cuatro tipos generados; PNG e impresión |
| Etiqueta logística imprimible | ✅ Verificado | `barcode.js`, `print.css` | Etiqueta con datos, barras, QR y RFID; sólo ella se imprime |
| Escáner con cámara (Code 128, EAN-13, QR) | ⏳ Implementado | `scanner.js` | Configurado con `html5-qrcode`; requiere cámara física sobre HTTPS |
| Cambio de cámara | ⏳ Implementado | `scanner.js` | Botón visible con ≥ 2 cámaras |
| Lectura desde imagen | ⏳ Implementado | `scanner.js` | `scanFile()`; requiere una imagen real |
| **Ficha completa al escanear** (no sólo el código) | ✅ Verificado | `scanner.js` | Las 7 secciones exigidas; prueba de la sección 4 |
| Identificadores renderizados gráficamente al escanear | ✅ Verificado | `barcode.js`, `scanner.js` | SVG + canvas + chip |
| Resumen histórico (eventos, recibido, despachado, devoluciones, incidencias) | ✅ Verificado | `api.js`, `scanner.js` | 5 KPIs calculados |
| Timeline completo con todos los campos | ✅ Verificado | `traceability.js` | 14 campos por evento |
| Información geográfica en la ficha | ✅ Verificado | `geolocation.js`, `scanner.js` | Declarada, capturada, precisión, distancia, validación y mapa |
| 9 eventos logísticos | ✅ Verificado | `utils.js`, `Code.gs` | Los nueve probados (tabla 1) |
| Confirmación obligatoria tras escanear | ✅ Verificado | `events.js` | Ningún registro automático |
| Reglas de inventario completas | ✅ Verificado | `api.js`, `Code.gs` | Casos A–M |
| Sin stock negativo | ✅ Verificado | `api.js`, `Code.gs` | Caso C |
| Transacción en 10 pasos con `LockService` | ⏳ Implementado | `Code.gs` (`createEvent`) | Orden implementado; concurrencia a verificar con dos dispositivos |
| Trazabilidad con cabecera, identificadores, KPIs y timeline | ✅ Verificado | `traceability.js` | Vista completa |
| Trayectoria geográfica numerada | ✅ Verificado | `maps.js` | Marcadores 1–6 y polilínea |
| Popup de trayectoria con los datos del evento | ✅ Verificado | `maps.js` | Evento *n* de *N*, fecha, lugar, distancia, precisión, validación, stock, actor |
| KPIs geográficos en trazabilidad | ✅ Verificado | `traceability.js` | 6 KPIs con aclaración sobre distancia vial |
| Módulo de inventario con KPIs, tabla y estados | ✅ Verificado | `inventory.js` | 5 KPIs, 10 filas, 3 estados |
| Inventario por categoría | ✅ Verificado | `inventory.js` | 7 tarjetas |
| Búsqueda global | ✅ Verificado | `app.js` | Por ID, código, nombre, lote y categoría, con 5 accesos por resultado |
| Maestro de ubicaciones con formulario completo | ✅ Verificado | `locations.js` | 9 campos, GPS y selección en mapa |
| 11 tipos de ubicación | ✅ Verificado | `utils.js`, `Code.gs` | Catálogo completo |
| Jerarquía `PADRE_ID` con herencia y sin ciclos | ✅ Verificado | `locations.js`, `Code.gs` | Casos 5, 10 y 12 |
| Radios sugeridos editables | ✅ Verificado | `locations.js` | Se proponen por tipo y se pueden sobrescribir |
| Captura de ubicación: posición actual o mapa | ⏳ Implementado | `geolocation.js`, `maps.js` | Opciones presentes con la configuración exigida; GPS real pendiente |
| Geolocalización del evento con precisión y confirmación | ⏳ Implementado | `geolocation.js`, `events.js` | Vista previa de validación funcionando; GPS real pendiente |
| GPS denegado no interrumpe el flujo | ✅ Verificado | `geolocation.js` | Mensaje + alternativa de mapa + `SIN_GPS`; el evento se guarda |
| `haversineDistance()` en el servidor | ⏳ Implementado | `Code.gs` | Fórmula con R = 6 371 000 m; equivalente del cliente verificado (20 m) |
| `resolveLocationCoordinates()` | ✅ Verificado | `Code.gs`, `locations.js`, `api.js` | Caso 5: devuelve lat, lon, radio y ubicación efectiva |
| 4 estados exactos de validación geo | ✅ Verificado | `utils.js`, `Code.gs` | Casos 1–4 |
| Reglas geo en el orden correcto | ✅ Verificado | `api.js`, `Code.gs` | Precisión antes de geocerca |
| Los eventos fuera de geocerca se guardan | ✅ Verificado | `api.js`, `Code.gs` | Caso 2 |
| La validación geo no altera el inventario | ✅ Verificado | `api.js`, `Code.gs` | Caso 6 |
| Respuesta de backend con `geoValidation` | ✅ Verificado | `Code.gs`, `events.js` | Estructura exacta del requerimiento |
| Mapa con Leaflet + OSM y atribución | ✅ Verificado | `maps.js` | «© Colaboradores de OpenStreetMap» visible |
| Ubicaciones y geocercas en el mapa | ✅ Verificado | `maps.js` | Marcadores diferenciados, círculos y popups |
| Eventos diferenciados por estado geo | ✅ Verificado | `maps.js` | 30 marcadores por estado |
| Filtros del mapa | ✅ Verificado | `maps.js` | Los 6 filtros y los 3 botones |
| Leyenda con símbolo, no sólo color | ✅ Verificado | `maps.js`, `maps.css` | ✓ ⚠ ◉ — |
| Dashboard con KPIs logísticos y geográficos | ✅ Verificado | `dashboard.js` | 10 + 5 KPIs |
| 5 gráficos exigidos (+1 adicional) | ✅ Verificado | `dashboard.js` | Los 6 instanciados |
| Exportación GeoJSON de ubicaciones y eventos | ✅ Verificado | `geojson.js`, `Code.gs` | 10 y 20 features |
| Orden `[longitud, latitud]` | ✅ Verificado | `geojson.js`, `Code.gs` | `[-77.71782, 0.81234]` |
| QGIS como consumidor, no integrado | ✅ Verificado | `geojson.js`, docs | Sólo exportación; instrucciones en la vista Exportar |
| 23 funciones exigidas en Apps Script | ⏳ Implementado | `Code.gs` | Todas presentes; verificar ejecutándolas |
| Acciones GET y POST de la API | ⏳ Implementado | `Code.gs`, `api.js` | 13 GET + 5 POST; cliente funcionando contra la misma interfaz |
| Formato de respuestas éxito/error | ✅ Verificado | `Code.gs`, `api.js` | `success`, `message`, `data` / `errorCode` |
| `?action=health` | ⏳ Implementado | `Code.gs` | Devuelve estado, hoja, nombre y zona horaria |
| Zona horaria configurable, formato `DD/MM/YYYY HH:mm:ss` | ✅ Verificado | `utils.js`, `Code.gs` | Formato correcto; corregido el desfase de fechas sin hora |
| IDs de evento por UUID | ✅ Verificado | `utils.js`, `Code.gs` | `Utilities.getUuid()` / `crypto.randomUUID()`; nunca sólo la hora |
| Validaciones de producto, EAN, evento, coordenadas, radio y precisión | ✅ Verificado | `products.js`, `events.js`, `locations.js`, `Code.gs` | Tablas 1–3 |
| Manejo de los 14 errores previstos | ✅ Verificado | todos los módulos | Mensajes específicos con `errorCode` |
| Interfaz de errores sin `alert()` | ✅ Verificado | `ui.js` | Toasts, modales, errores en línea y estados |
| Detección de estado sin conexión | ✅ Verificado | `api.js`, `events.js`, `app.js` | Sin confirmaciones falsas; borrador conservado |
| Seguridad: escapado, sin secretos, sin promesas falsas | ✅ Verificado | `utils.js`, README | `U.esc()` en toda salida; limitaciones declaradas |
| Responsive en escritorio, tableta y móvil | ✅ Verificado | `responsive.css` | Probado a ancho de escritorio y de móvil |
| Aviso de HTTPS para cámara y GPS | ✅ Verificado | `geolocation.js`, `scanner.js` | Texto exacto exigido |
| Accesibilidad: etiquetas, `aria`, teclado, foco, contraste | ✅ Verificado | `index.html`, `ui.js`, CSS | `label`, `aria-label`, `aria-live`, `focus-visible`, icono + texto |
| Datos de demostración (10/10/20, con excepciones geo) | ✅ Verificado | `LogiTrace_Base.xlsx`, `api.js` | 10 productos, 10 ubicaciones, 20 eventos, 16 georreferenciados, 2 fuera, 1 baja precisión |
| Datos demo eliminables | ✅ Verificado | `app.js`, `api.js` | Eliminar y restaurar sin afectar al sistema |
| `DEMO_MODE` desactivado por defecto y sin mocks con backend | ✅ Verificado | `config.runtime.js`, `api.js` | `false` por defecto; con backend no hay datos simulados |
| GitHub Pages con rutas relativas | ⏳ Implementado | `index.html` | Sin rutas absolutas; publicar según `INICIO_RAPIDO.md` |
| README completo | ✅ Verificado | `README.md` | Los 18 apartados exigidos |
| `INICIO_RAPIDO.md` con los 14 pasos | ✅ Verificado | `INICIO_RAPIDO.md` | Los 14 pasos, problemas frecuentes y prueba de aceptación |
| Documentación de modelo, despliegue y pruebas | ✅ Verificado | `docs/*.md` | Los tres documentos |
| Calidad de código | ✅ Verificado | todo el proyecto | Módulos con responsabilidad única, sin código muerto, `async/await`, excepciones tratadas |
| Sin `TODO` ni código pendiente | ✅ Verificado | todo el proyecto | Ningún `TODO`, ningún «implementar aquí», ningún botón sin evento |

---

## 9. Auditoría final (sección 90 del requerimiento)

| Punto auditado | Resultado |
|---|---|
| IDs duplicados | Rechazados en cliente y servidor (`DUPLICATE_ID`) |
| Códigos duplicados | Rechazados en `CODIGO_1D`, `CODIGO_QR` y `RFID_UID_EPC` (`DUPLICATE_CODE`) |
| EAN-13 inválidos | Rechazados por longitud, caracteres y checksum |
| Stock negativo | Imposible: el rechazo precede al cálculo; invariante `stock ≥ 0` |
| Doble descuento | `ENTREGA` no descuenta tras `DESPACHO` (caso E) |
| Doble incremento | El stock inicial no genera recepción (caso K) |
| Producto inexistente | `PRODUCT_NOT_FOUND`, con pantalla de «código no registrado» y opción de darlo de alta |
| Eventos perdidos | Idempotencia por `CLIENT_REQUEST_ID`; el reenvío no crea ni pierde eventos |
| Pérdida de trazabilidad | Ningún evento se borra ni se sobrescribe (caso L) |
| Botones sin función | Ninguno: todos los controles responden |
| Rutas rotas | Ninguna: 0 errores 404 en el recorrido completo |
| Errores de Apps Script | Todas las rutas devuelven `success/message/errorCode`; pendiente de ejecución en la cuenta del usuario |
| Errores de cámara | Tratados: biblioteca ausente, contexto no seguro, permiso denegado, sin código en la imagen |
| Errores de GPS | Tratados: no soportado, denegado, no disponible, tiempo agotado; siempre con alternativa |
| Coordenadas invertidas | Un único constructor de pares (`coordPair`) verificado: longitud primero |
| Geocercas incorrectas | Radio propio o heredado; `recalculateGeoValidation()` permite corregir el histórico |
| Eventos fuera de geocerca rechazados | No ocurre: se guardan como evidencia (caso 2) |
| Datos mock activos | `DEMO_MODE: false`; el modo local se advierte y sólo actúa sin backend |
| Secretos | Ninguno en el repositorio |
| Incompatibilidad con GitHub Pages | Rutas relativas y enrutado por hash |

---

## 10. Criterio de terminación (sección 91)

| Elemento | Estado |
|---|---|
| Productos | ✅ |
| Google Sheets | ⏳ (estructura y base entregadas; requiere su cuenta) |
| Apps Script | ⏳ (código completo; ejecutar `initializeSheets()` y `runAllTests()`) |
| Code 128 | ✅ |
| EAN-13 | ✅ |
| QR | ✅ |
| RFID simulado | ✅ |
| Escáner | ⏳ (lógica verificada; cámara física pendiente) |
| Ficha completa al escanear | ✅ |
| Código de barras visible en trazabilidad | ✅ |
| QR visible en trazabilidad | ✅ |
| Inventario | ✅ |
| Eventos | ✅ |
| Stock | ✅ |
| Trazabilidad | ✅ |
| Ubicaciones | ✅ |
| GPS | ⏳ (flujo y alternativas verificados; sensor real pendiente) |
| Precisión | ✅ |
| Haversine | ✅ |
| Geocercas | ✅ |
| Mapa | ✅ |
| Trayectoria | ✅ |
| Dashboard | ✅ |
| GeoJSON | ✅ |
| QGIS | ⏳ (archivos correctos; carga pendiente) |
| Responsive | ✅ |
| GitHub Pages | ⏳ (preparado; publicar) |

Los siete puntos marcados ⏳ dependen exclusivamente de recursos externos a este entorno —una
cuenta de Google, un teléfono con cámara y GPS, QGIS y un repositorio publicado—. El
procedimiento para cerrarlos está en `INICIO_RAPIDO.md` (pasos 5–14) y en la sección 0 de este
documento.
