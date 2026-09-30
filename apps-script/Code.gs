/*  ============================================================
    LogiTrace — Code.gs
    Backend único del sistema: Google Apps Script Web App sobre
    Google Sheets. Es la AUTORIDAD sobre inventario y geocercas.

    PUESTA EN MARCHA
    1. Pegue este archivo completo en el editor de Apps Script.
    2. Si el proyecto NO está vinculado a la hoja, escriba el ID en
       CONFIG.SPREADSHEET_ID. Si está vinculado, déjelo vacío.
    3. Ejecute initializeSheets() una vez y autorice los permisos.
    4. Implementar → Nueva implementación → Aplicación web:
         Ejecutar como: Yo
         Quién tiene acceso: Cualquier persona
    5. Copie la URL /exec en assets/js/config.runtime.js.

    Nunca escriba aquí contraseñas, claves privadas ni tokens.
    ============================================================ */

var CONFIG = {
  SPREADSHEET_ID: '',                  // vacío = hoja vinculada al proyecto
  TIMEZONE: 'America/Guayaquil',
  LOW_STOCK_THRESHOLD: 5,
  MAX_ACCEPTABLE_ACCURACY_M: 100,
  LOCK_TIMEOUT_MS: 25000,
  EARTH_RADIUS_M: 6371000
};

var SHEETS = {
  PRODUCTS: 'Productos',
  EVENTS: 'Eventos',
  LOCATIONS: 'Ubicaciones',
  CATALOGS: 'Catalogos',
  HOME: 'Inicio'
};

/* Encabezados exactos exigidos por el modelo de datos. El acceso a
   los datos se hace SIEMPRE por nombre de encabezado, nunca por
   posición: el orden de las columnas puede variar sin romper nada. */
var HEADERS = {
  PRODUCTS: [
    'ID_PRODUCTO', 'NOMBRE', 'DESCRIPCION', 'CATEGORIA', 'LOTE', 'CANTIDAD',
    'FECHA_VENCIMIENTO', 'ORIGEN', 'DESTINO', 'UBICACION_ACTUAL',
    'TIPO_IDENTIFICACION', 'CODIGO_GENERADO', 'TIPO_CODIGO_1D', 'CODIGO_1D',
    'CODIGO_QR', 'RFID_UID_EPC', 'FECHA_REGISTRO', 'ULTIMA_ACTUALIZACION', 'ESTADO'
  ],
  EVENTS: [
    'ID_EVENTO', 'CLIENT_REQUEST_ID', 'FECHA_HORA', 'ID_PRODUCTO', 'TIPO_IDENTIFICACION',
    'CODIGO_LEIDO', 'EVENTO', 'CANTIDAD_MOVIMIENTO', 'STOCK_ANTES', 'STOCK_DESPUES',
    'UBICACION', 'UBICACION_ORIGEN', 'UBICACION_DESTINO', 'ACTOR', 'OBSERVACION', 'ESTADO',
    'ID_UBICACION_DECLARADA', 'LAT_CAPTURADA', 'LON_CAPTURADA', 'PRECISION_M',
    'FUENTE_UBICACION', 'DISTANCIA_DECLARADA_M', 'VALIDACION_GEO'
  ],
  LOCATIONS: [
    'ID_UBICACION', 'NOMBRE', 'TIPO', 'DIRECCION', 'LAT', 'LON',
    'RADIO_GEOCERCA_M', 'PADRE_ID', 'ACTIVO'
  ],
  CATALOGS: ['TIPO', 'CODIGO', 'VALOR', 'DETALLE']
};

/* Catálogo de eventos: efecto sobre el inventario.
   stock:  1 suma · -1 resta · 0 no modifica
   qty:    true si exige cantidad > 0                                */
var EVENT_TYPES = [
  { code: 'RECEPCION',          label: 'RECEPCIÓN',             stock: 1,  qty: true },
  { code: 'INGRESO_ALMACEN',    label: 'INGRESO AL ALMACÉN',    stock: 0,  qty: false },
  { code: 'UBICACION',          label: 'UBICACIÓN',             stock: 0,  qty: false },
  { code: 'MOVIMIENTO_INTERNO', label: 'MOVIMIENTO INTERNO',    stock: 0,  qty: false },
  { code: 'PREPARACION_PEDIDO', label: 'PREPARACIÓN DE PEDIDO', stock: 0,  qty: false },
  { code: 'DESPACHO',           label: 'DESPACHO',              stock: -1, qty: true },
  { code: 'ENTREGA',            label: 'ENTREGA',               stock: 0,  qty: false },
  { code: 'DEVOLUCION',         label: 'DEVOLUCIÓN',            stock: 1,  qty: true },
  { code: 'INCIDENCIA',         label: 'INCIDENCIA',            stock: 0,  qty: false }
];

var LOCATION_TYPES = [
  { code: 'PLANTA', label: 'Planta', radius: 200 },
  { code: 'CENTRO_PRODUCCION', label: 'Centro de producción', radius: 200 },
  { code: 'CENTRO_DISTRIBUCION', label: 'Centro de distribución', radius: 150 },
  { code: 'PROVEEDOR', label: 'Proveedor', radius: 150 },
  { code: 'CLIENTE', label: 'Cliente', radius: 100 },
  { code: 'ALMACEN', label: 'Almacén', radius: 150 },
  { code: 'PATIO', label: 'Patio', radius: 100 },
  { code: 'MUELLE', label: 'Muelle', radius: 50 },
  { code: 'RACK', label: 'Rack', radius: 0 },
  { code: 'LABORATORIO', label: 'Laboratorio', radius: 50 },
  { code: 'OTRO', label: 'Otro', radius: 100 }
];

var GEO_STATUS = {
  OK: 'OK',
  OUT: 'FUERA_GEOCERCA',
  LOW: 'BAJA_PRECISION',
  NONE: 'SIN_GPS'
};

/* ============================================================
   1. PUNTOS DE ENTRADA HTTP
   ============================================================ */
function doGet(e) {
  var params = (e && e.parameter) || {};
  var action = params.action || 'health';
  try {
    switch (action) {
      case 'health':            return jsonOk('Backend operativo', health());
      case 'products':          return jsonOk('Productos obtenidos', { items: getProducts() });
      case 'product':           return jsonOk('Producto obtenido', { product: getProduct(params.id) });
      case 'findProductByCode': return jsonOk('Búsqueda realizada', findProductByCode(params.code));
      case 'events':            return jsonOk('Eventos obtenidos', { items: getEvents(params.productId) });
      case 'trace':             return jsonOk('Trazabilidad obtenida', getTrace(params.productId));
      case 'inventory':         return jsonOk('Inventario calculado', getInventory());
      case 'dashboard':         return jsonOk('Indicadores calculados', getDashboard());
      case 'locations':         return jsonOk('Ubicaciones obtenidas', { items: getLocations() });
      case 'location':          return jsonOk('Ubicación obtenida', { location: getLocation(params.id) });
      case 'geoEvents':         return jsonOk('Eventos georreferenciados', { items: getGeoEvents(params) });
      case 'locationsGeoJSON':  return jsonOk('GeoJSON de ubicaciones', buildLocationsGeoJSON());
      case 'eventsGeoJSON':     return jsonOk('GeoJSON de eventos', buildEventsGeoJSON(params));
      case 'catalogs':          return jsonOk('Catálogos', getCatalogs());
      case 'initialize':        return jsonOk('Estructura verificada', initializeSheets());
      default:
        return jsonError('Acción GET no reconocida: ' + action, 'UNKNOWN_ACTION');
    }
  } catch (err) {
    return jsonError(errMessage_(err), errCode_(err));
  }
}

function doPost(e) {
  var payload;
  try {
    payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (parseErr) {
    return jsonError('El cuerpo de la petición no es JSON válido.', 'BAD_REQUEST');
  }
  var action = payload.action || '';
  var data = payload.data || {};
  try {
    switch (action) {
      case 'createProduct':  return jsonOk('Producto creado correctamente', createProduct(data));
      case 'updateProduct':  return jsonOk('Producto actualizado correctamente', updateProduct(data));
      case 'createEvent':    return jsonOk('Evento registrado', createEvent(data));
      case 'createLocation': return jsonOk('Ubicación creada correctamente', createLocation(data));
      case 'updateLocation': return jsonOk('Ubicación actualizada correctamente', updateLocation(data));
      case 'initialize':     return jsonOk('Estructura verificada', initializeSheets());
      default:
        return jsonError('Acción POST no reconocida: ' + action, 'UNKNOWN_ACTION');
    }
  } catch (err) {
    return jsonError(errMessage_(err), errCode_(err));
  }
}

function jsonOk(message, data) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: true, message: message, data: data === undefined ? {} : data }))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonError(message, errorCode) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: false, message: message, errorCode: errorCode || 'UNKNOWN' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function fail_(message, code) {
  var e = new Error(message);
  e.errorCode = code || 'UNKNOWN';
  throw e;
}

function errMessage_(err) {
  return (err && err.message) ? String(err.message) : String(err);
}

function errCode_(err) {
  return (err && err.errorCode) ? err.errorCode : 'SERVER_ERROR';
}

/* ============================================================
   2. ACCESO A LA HOJA (siempre por nombre de encabezado)
   ============================================================ */
function getSpreadsheet_() {
  if (CONFIG.SPREADSHEET_ID) {
    try {
      return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    } catch (err) {
      fail_('No fue posible abrir la hoja con el ID configurado. Verifique CONFIG.SPREADSHEET_ID y los permisos.', 'SPREADSHEET_UNAVAILABLE');
    }
  }
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) {
    fail_('No hay hoja vinculada. Escriba el ID en CONFIG.SPREADSHEET_ID.', 'SPREADSHEET_UNAVAILABLE');
  }
  return active;
}

function getSheet_(name, createIfMissing) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(name);
  if (!sheet && createIfMissing) sheet = ss.insertSheet(name);
  if (!sheet) fail_('La pestaña "' + name + '" no existe. Ejecute initializeSheets().', 'SHEET_MISSING');
  return sheet;
}

/** Índice {ENCABEZADO: columna 1-based} de la primera fila. */
function headerIndex_(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return {};
  var row = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var map = {};
  for (var i = 0; i < row.length; i++) {
    var key = String(row[i] || '').trim();
    if (key) map[key] = i + 1;
  }
  return map;
}

/** Lee toda la pestaña como objetos {ENCABEZADO: valor}. */
function readTable_(sheetName) {
  var sheet = getSheet_(sheetName, false);
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];
  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = values[0].map(function (h) { return String(h || '').trim(); });
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var obj = {};
    var empty = true;
    for (var c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      var value = normalizeCell_(row[c]);
      obj[headers[c]] = value;
      if (value !== '' && value !== null) empty = false;
    }
    if (!empty) {
      obj.__row = r + 1;              // fila real en la hoja
      out.push(obj);
    }
  }
  return out;
}

function normalizeCell_(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    return Utilities.formatDate(value, CONFIG.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss");
  }
  return value;
}

/** Añade una fila respetando el orden real de los encabezados. */
function appendRow_(sheetName, obj) {
  var sheet = getSheet_(sheetName, false);
  var index = headerIndex_(sheet);
  var lastCol = sheet.getLastColumn();
  var row = [];
  for (var i = 0; i < lastCol; i++) row.push('');
  Object.keys(obj).forEach(function (key) {
    var col = index[key];
    if (col) row[col - 1] = obj[key];
  });
  sheet.appendRow(row);
  return sheet.getLastRow();
}

/** Actualiza celdas concretas de una fila por nombre de encabezado. */
function updateCells_(sheetName, rowNumber, changes) {
  var sheet = getSheet_(sheetName, false);
  var index = headerIndex_(sheet);
  Object.keys(changes).forEach(function (key) {
    var col = index[key];
    if (col) sheet.getRange(rowNumber, col).setValue(changes[key]);
  });
}

/* ---------- Marcas de tiempo ----------
   IMPORTANTE: a la hoja se escriben objetos Date, NUNCA cadenas.
   Una cadena como "2026-09-29T18:58:22" la interpreta Sheets en la zona
   horaria DE LA HOJA; si esa zona no coincide con CONFIG.TIMEZONE, al
   releerla y reformatearla aparece desplazada varias horas. Un Date es
   un instante absoluto: el viaje de ida y vuelta no pierde información
   sea cual sea la zona configurada en la hoja.                          */
function nowDate_() {
  return new Date();
}

function formatStamp_(date) {
  return Utilities.formatDate(date, CONFIG.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss");
}

function nowStamp_() {
  return formatStamp_(new Date());
}

function uuid_() {
  return Utilities.getUuid();
}

/* ============================================================
   3. INICIALIZACIÓN IDEMPOTENTE
   Crea pestañas y encabezados faltantes. No borra datos, no
   duplica columnas y puede ejecutarse muchas veces sin efecto.
   ============================================================ */
function initializeSheets() {
  var ss = getSpreadsheet_();
  var report = { spreadsheetId: ss.getId(), spreadsheetName: ss.getName(), sheets: {} };

  report.sheets[SHEETS.PRODUCTS] = ensureSheet_(ss, SHEETS.PRODUCTS, HEADERS.PRODUCTS);
  report.sheets[SHEETS.EVENTS] = ensureSheet_(ss, SHEETS.EVENTS, HEADERS.EVENTS);
  report.sheets[SHEETS.LOCATIONS] = ensureSheet_(ss, SHEETS.LOCATIONS, HEADERS.LOCATIONS);
  report.sheets[SHEETS.CATALOGS] = ensureSheet_(ss, SHEETS.CATALOGS, HEADERS.CATALOGS);
  report.sheets[SHEETS.HOME] = ensureHomeSheet_(ss);

  seedCatalogsIfEmpty_();

  // Se alinea la zona horaria de la hoja con la configurada y se informa del
  // resultado: un desajuste desplaza las fechas que se ven en la propia hoja.
  report.timezoneBefore = ss.getSpreadsheetTimeZone();
  try {
    ss.setSpreadsheetTimeZone(CONFIG.TIMEZONE);
    report.timezoneAfter = ss.getSpreadsheetTimeZone();
  } catch (e) {
    report.timezoneAfter = report.timezoneBefore;
    report.timezoneWarning = 'No fue posible cambiar la zona horaria de la hoja: ' + e.message;
  }
  Logger.log('Zona horaria de la hoja: ' + report.timezoneBefore + ' -> ' + report.timezoneAfter);

  return report;
}

function ensureSheet_(ss, name, headers) {
  var created = false;
  var sheet = ss.getSheetByName(name);
  if (!sheet) { sheet = ss.insertSheet(name); created = true; }

  var lastCol = Math.max(1, sheet.getLastColumn());
  var existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(function (h) { return String(h || '').trim(); })
    .filter(function (h) { return h !== ''; });

  var added = [];
  headers.forEach(function (h) {
    if (existing.indexOf(h) === -1) {
      existing.push(h);
      added.push(h);
    }
  });

  if (added.length || created) {
    sheet.getRange(1, 1, 1, existing.length).setValues([existing]);
  }

  var head = sheet.getRange(1, 1, 1, Math.max(existing.length, 1));
  head.setFontWeight('bold').setBackground('#0f3f6b').setFontColor('#ffffff');
  sheet.setFrozenRows(1);

  return { created: created, headersAdded: added, headerCount: existing.length, rows: Math.max(0, sheet.getLastRow() - 1) };
}

function ensureHomeSheet_(ss) {
  var created = false;
  var sheet = ss.getSheetByName(SHEETS.HOME);
  if (!sheet) { sheet = ss.insertSheet(SHEETS.HOME, 0); created = true; }
  if (sheet.getRange('A1').getValue() === '') {
    sheet.getRange('A1').setValue('LogiTrace — base de datos').setFontSize(16).setFontWeight('bold');
    sheet.getRange('A3').setValue('Pestañas operativas críticas: Productos, Eventos, Ubicaciones.');
    sheet.getRange('A4').setValue('El acceso se realiza por nombre de encabezado: el orden de las columnas puede variar.');
    sheet.getRange('A5').setValue('No elimine ni renombre los encabezados. Ejecute initializeSheets() tras cualquier cambio.');
    sheet.getRange('A7').setValue('ID de la hoja:');
    sheet.getRange('B7').setValue(ss.getId());
    sheet.getRange('A8').setValue('Zona horaria configurada:');
    sheet.getRange('B8').setValue(CONFIG.TIMEZONE);
    sheet.setColumnWidth(1, 260);
    sheet.setColumnWidth(2, 420);
  }
  return { created: created };
}

function seedCatalogsIfEmpty_() {
  var sheet = getSheet_(SHEETS.CATALOGS, true);
  if (sheet.getLastRow() > 1) return;
  var rows = [];
  EVENT_TYPES.forEach(function (e) {
    rows.push(['EVENTO', e.code, e.label,
      e.stock === 1 ? 'Suma al stock' : e.stock === -1 ? 'Resta del stock' : 'No modifica el stock']);
  });
  LOCATION_TYPES.forEach(function (t) {
    rows.push(['TIPO_UBICACION', t.code, t.label, t.radius ? 'Radio sugerido ' + t.radius + ' m' : 'Hereda el radio del padre']);
  });
  Object.keys(GEO_STATUS).forEach(function (k) {
    rows.push(['VALIDACION_GEO', GEO_STATUS[k], GEO_STATUS[k], 'Estado de validación geográfica']);
  });
  ['CODE128', 'EAN13', 'QR', 'RFID', 'MIXTO'].forEach(function (c) {
    rows.push(['TIPO_IDENTIFICACION', c, c, 'Tecnología de identificación']);
  });
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, 4).setValues(rows);
  }
}

function health() {
  var ss = getSpreadsheet_();
  var missing = [];
  [SHEETS.PRODUCTS, SHEETS.EVENTS, SHEETS.LOCATIONS].forEach(function (name) {
    if (!ss.getSheetByName(name)) missing.push(name);
  });
  var sheetTz = ss.getSpreadsheetTimeZone();
  return {
    status: missing.length ? 'INCOMPLETO' : 'OK',
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    timezone: CONFIG.TIMEZONE,
    spreadsheetTimezone: sheetTz,
    timezoneAligned: sheetTz === CONFIG.TIMEZONE,
    missingSheets: missing,
    lowStockThreshold: CONFIG.LOW_STOCK_THRESHOLD,
    maxAcceptableAccuracyM: CONFIG.MAX_ACCEPTABLE_ACCURACY_M,
    serverTime: nowStamp_()
  };
}

function getCatalogs() {
  return {
    events: EVENT_TYPES,
    locationTypes: LOCATION_TYPES,
    geoStatus: GEO_STATUS,
    rows: readTable_(SHEETS.CATALOGS).map(stripMeta_)
  };
}

function stripMeta_(obj) {
  var out = {};
  Object.keys(obj).forEach(function (k) { if (k !== '__row') out[k] = obj[k]; });
  return out;
}

/* ============================================================
   4. UTILIDADES DE VALOR
   ============================================================ */
function num_(value, fallback) {
  if (value === '' || value === null || value === undefined) {
    return fallback === undefined ? null : fallback;
  }
  var n = Number(String(value).replace(',', '.'));
  return isNaN(n) ? (fallback === undefined ? null : fallback) : n;
}

function str_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function upper_(value) {
  return str_(value).toUpperCase();
}

/** Quita acentos y no alfanuméricos para comparar nombres de evento. */
function fold_(value) {
  var s = str_(value).toUpperCase();
  var from = 'ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ';
  var to = 'AAAAAEEEEIIIIOOOOOUUUUNC';
  var out = '';
  for (var i = 0; i < s.length; i++) {
    var idx = from.indexOf(s.charAt(i));
    out += idx === -1 ? s.charAt(i) : to.charAt(idx);
  }
  return out.replace(/[^A-Z0-9]/g, '');
}

function eventDef_(value) {
  var key = fold_(value);
  for (var i = 0; i < EVENT_TYPES.length; i++) {
    if (fold_(EVENT_TYPES[i].code) === key || fold_(EVENT_TYPES[i].label) === key) return EVENT_TYPES[i];
  }
  return null;
}

function locationTypeDef_(value) {
  var key = fold_(value);
  for (var i = 0; i < LOCATION_TYPES.length; i++) {
    if (fold_(LOCATION_TYPES[i].code) === key || fold_(LOCATION_TYPES[i].label) === key) return LOCATION_TYPES[i];
  }
  return null;
}

function isValidLat_(v) { var n = num_(v, null); return n !== null && n >= -90 && n <= 90; }
function isValidLon_(v) { var n = num_(v, null); return n !== null && n >= -180 && n <= 180; }

function isActiveLocation_(loc) {
  var v = upper_(loc.ACTIVO === '' || loc.ACTIVO === undefined ? 'SI' : loc.ACTIVO);
  return v !== 'NO' && v !== 'FALSE' && v !== '0';
}

/** Checksum EAN-13. Devuelve null si la entrada no tiene 12 dígitos. */
function ean13Checksum_(first12) {
  var s = str_(first12).replace(/\D/g, '');
  if (s.length !== 12) return null;
  var total = 0;
  for (var i = 0; i < 12; i++) total += Number(s.charAt(i)) * (i % 2 === 0 ? 1 : 3);
  return (10 - (total % 10)) % 10;
}

function validateEan13_(code) {
  var s = str_(code).replace(/[\s-]/g, '');
  if (!/^\d+$/.test(s)) return { ok: false, error: 'EAN-13 admite únicamente dígitos numéricos.' };
  if (s.length === 12) {
    var c = ean13Checksum_(s);
    return { ok: true, code: s + c, computed: true };
  }
  if (s.length === 13) {
    var expected = ean13Checksum_(s.substring(0, 12));
    if (String(expected) !== s.charAt(12)) {
      return { ok: false, error: 'Checksum EAN-13 inválido: el dígito 13 debería ser ' + expected + '.' };
    }
    return { ok: true, code: s, computed: false };
  }
  return { ok: false, error: 'Longitud EAN-13 inválida: use 12 o 13 dígitos.' };
}

/* ============================================================
   5. GEOMETRÍA Y GEOCERCAS
   ============================================================ */
/** Distancia geodésica en metros (fórmula de Haversine). */
function haversineDistance(lat1, lon1, lat2, lon2) {
  var a1 = num_(lat1, null), o1 = num_(lon1, null);
  var a2 = num_(lat2, null), o2 = num_(lon2, null);
  if (a1 === null || o1 === null || a2 === null || o2 === null) return null;
  var rad = Math.PI / 180;
  var dLat = (a2 - a1) * rad;
  var dLon = (o2 - o1) * rad;
  var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(a1 * rad) * Math.cos(a2 * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * CONFIG.EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Resuelve las coordenadas efectivas de una ubicación subiendo por
 * PADRE_ID cuando la ubicación carece de LAT/LON. El radio se toma
 * del primer ancestro (o de ella misma) que lo defina.
 * Protegido contra ciclos.
 */
function resolveLocationCoordinates(idUbicacion, locationList) {
  var list = locationList || getLocations();
  var byId = {};
  list.forEach(function (l) { byId[upper_(l.ID_UBICACION)] = l; });

  var requested = byId[upper_(idUbicacion)] || null;
  var current = requested;
  var visited = {};
  var radius = null;

  while (current) {
    var key = upper_(current.ID_UBICACION);
    if (visited[key]) break;                       // ciclo detectado: se detiene
    visited[key] = true;

    if (radius === null) {
      var r = num_(current.RADIO_GEOCERCA_M, null);
      if (r !== null && r > 0) radius = r;
    }
    if (isValidLat_(current.LAT) && isValidLon_(current.LON)) {
      return {
        found: true,
        lat: num_(current.LAT),
        lon: num_(current.LON),
        radiusMeters: radius,
        effectiveLocationId: current.ID_UBICACION,
        effectiveLocationName: current.NOMBRE,
        inherited: !!(requested && upper_(current.ID_UBICACION) !== upper_(requested.ID_UBICACION)),
        requestedLocationId: requested ? requested.ID_UBICACION : str_(idUbicacion),
        requestedLocationName: requested ? requested.NOMBRE : ''
      };
    }
    current = byId[upper_(current.PADRE_ID)] || null;
  }

  return {
    found: false, lat: null, lon: null, radiusMeters: radius,
    effectiveLocationId: '', effectiveLocationName: '', inherited: false,
    requestedLocationId: requested ? requested.ID_UBICACION : str_(idUbicacion),
    requestedLocationName: requested ? requested.NOMBRE : ''
  };
}

/**
 * Validación geográfica de un evento. ÚNICA autoridad del sistema.
 *   SIN_GPS         → no hay latitud/longitud
 *   BAJA_PRECISION  → PRECISION_M > MAX_ACCEPTABLE_ACCURACY_M
 *   FUERA_GEOCERCA  → precisión aceptable y distancia > radio
 *   OK              → precisión aceptable y distancia <= radio
 * Nunca rechaza el evento: sólo lo clasifica.
 */
function validateGeoEvent(declaredLocationId, lat, lon, accuracyM, locationList) {
  var resolved = declaredLocationId ? resolveLocationCoordinates(declaredLocationId, locationList) : null;
  var out = {
    status: GEO_STATUS.NONE,
    distanceMeters: null,
    geofenceRadiusMeters: resolved ? resolved.radiusMeters : null,
    accuracyMeters: num_(accuracyM, null),
    declaredLocation: resolved ? (resolved.requestedLocationName || resolved.requestedLocationId) : '',
    effectiveLocation: resolved ? resolved.effectiveLocationName : '',
    inheritedCoordinates: !!(resolved && resolved.inherited)
  };

  if (!isValidLat_(lat) || !isValidLon_(lon)) return out;              // SIN_GPS

  if (out.accuracyMeters !== null && out.accuracyMeters > CONFIG.MAX_ACCEPTABLE_ACCURACY_M) {
    out.status = GEO_STATUS.LOW;
    if (resolved && resolved.found) {
      out.distanceMeters = haversineDistance(lat, lon, resolved.lat, resolved.lon);
    }
    return out;
  }

  if (!resolved || !resolved.found) { out.status = GEO_STATUS.OK; return out; }

  out.distanceMeters = haversineDistance(lat, lon, resolved.lat, resolved.lon);
  if (out.geofenceRadiusMeters === null || out.geofenceRadiusMeters <= 0) {
    out.status = GEO_STATUS.OK;
    return out;
  }
  out.status = out.distanceMeters <= out.geofenceRadiusMeters ? GEO_STATUS.OK : GEO_STATUS.OUT;
  return out;
}

/* ============================================================
   6. PRODUCTOS
   ============================================================ */
function getProducts() {
  return readTable_(SHEETS.PRODUCTS).map(function (p) {
    p.CANTIDAD = num_(p.CANTIDAD, 0);
    return stripMeta_(p);
  });
}

function getProductRow_(id) {
  var key = upper_(id);
  if (!key) fail_('Debe indicar el ID del producto.', 'MISSING_ID');
  var rows = readTable_(SHEETS.PRODUCTS);
  for (var i = 0; i < rows.length; i++) {
    if (upper_(rows[i].ID_PRODUCTO) === key) return rows[i];
  }
  return null;
}

function getProduct(id) {
  var row = getProductRow_(id);
  if (!row) fail_('Producto inexistente: ' + id, 'PRODUCT_NOT_FOUND');
  row.CANTIDAD = num_(row.CANTIDAD, 0);
  return stripMeta_(row);
}

/** Busca por ID, código generado, código 1D, QR o RFID. */
function findProductByCode(code) {
  var key = upper_(code);
  if (!key) fail_('Debe indicar el código a buscar.', 'MISSING_CODE');
  var fields = ['ID_PRODUCTO', 'CODIGO_GENERADO', 'CODIGO_1D', 'CODIGO_QR', 'RFID_UID_EPC'];
  var rows = readTable_(SHEETS.PRODUCTS);
  var found = null;
  for (var i = 0; i < rows.length && !found; i++) {
    for (var f = 0; f < fields.length; f++) {
      if (upper_(rows[i][fields[f]]) === key) { found = rows[i]; break; }
    }
  }
  if (!found) return { product: null, events: [] };
  found.CANTIDAD = num_(found.CANTIDAD, 0);
  return { product: stripMeta_(found), events: getEvents(found.ID_PRODUCTO) };
}

function createProduct(data) {
  var id = str_(data.ID_PRODUCTO);
  if (!id) fail_('ID_PRODUCTO es obligatorio.', 'VALIDATION');
  if (!/^[A-Za-z0-9._-]+$/.test(id)) {
    fail_('ID_PRODUCTO admite sólo letras, números, punto, guion y guion bajo (compatibilidad Code 128).', 'VALIDATION');
  }
  if (!str_(data.NOMBRE)) fail_('NOMBRE es obligatorio.', 'VALIDATION');
  if (!str_(data.CATEGORIA)) fail_('CATEGORIA es obligatoria.', 'VALIDATION');
  if (!str_(data.LOTE)) fail_('LOTE es obligatorio.', 'VALIDATION');

  var qty = num_(data.CANTIDAD, null);
  if (qty === null || qty < 0) fail_('CANTIDAD debe ser un número mayor o igual que cero.', 'VALIDATION');

  var lock = LockService.getScriptLock();
  lock.waitLock(CONFIG.LOCK_TIMEOUT_MS);
  try {
    var existing = readTable_(SHEETS.PRODUCTS);
    for (var i = 0; i < existing.length; i++) {
      if (upper_(existing[i].ID_PRODUCTO) === upper_(id)) {
        fail_('Ya existe un producto con el ID ' + id + '.', 'DUPLICATE_ID');
      }
    }

    var type1d = upper_(data.TIPO_CODIGO_1D) || 'CODE128';
    var code1d = str_(data.CODIGO_1D) || id;
    if (type1d === 'EAN13') {
      var ean = validateEan13_(code1d);
      if (!ean.ok) fail_(ean.error, 'INVALID_EAN');
      code1d = ean.code;
    }

    // Unicidad de códigos
    var codeFields = { CODIGO_1D: code1d, CODIGO_QR: str_(data.CODIGO_QR) || id, RFID_UID_EPC: str_(data.RFID_UID_EPC) };
    Object.keys(codeFields).forEach(function (field) {
      if (!codeFields[field]) return;
      for (var j = 0; j < existing.length; j++) {
        if (upper_(existing[j][field]) === upper_(codeFields[field])) {
          fail_('El código ' + codeFields[field] + ' ya está asignado a ' + existing[j].ID_PRODUCTO + '.', 'DUPLICATE_CODE');
        }
      }
    });

    validateLocationRef_(data.UBICACION_ACTUAL, 'UBICACION_ACTUAL', true);
    validateLocationRef_(data.ORIGEN, 'ORIGEN', false);
    validateLocationRef_(data.DESTINO, 'DESTINO', false);

    var record = {
      ID_PRODUCTO: id,
      NOMBRE: str_(data.NOMBRE),
      DESCRIPCION: str_(data.DESCRIPCION),
      CATEGORIA: str_(data.CATEGORIA),
      LOTE: str_(data.LOTE),
      CANTIDAD: qty,
      FECHA_VENCIMIENTO: str_(data.FECHA_VENCIMIENTO),
      ORIGEN: str_(data.ORIGEN),
      DESTINO: str_(data.DESTINO),
      UBICACION_ACTUAL: str_(data.UBICACION_ACTUAL),
      TIPO_IDENTIFICACION: str_(data.TIPO_IDENTIFICACION) || 'MIXTO',
      CODIGO_GENERADO: str_(data.CODIGO_GENERADO) || id,
      TIPO_CODIGO_1D: type1d,
      CODIGO_1D: code1d,
      CODIGO_QR: codeFields.CODIGO_QR,
      RFID_UID_EPC: codeFields.RFID_UID_EPC,
      FECHA_REGISTRO: nowDate_(),
      ULTIMA_ACTUALIZACION: nowDate_(),
      ESTADO: str_(data.ESTADO) || 'ACTIVO'
    };

    appendRow_(SHEETS.PRODUCTS, record);

    // A la hoja fueron Date; a la respuesta van ya formateados.
    record.FECHA_REGISTRO = formatStamp_(record.FECHA_REGISTRO);
    record.ULTIMA_ACTUALIZACION = formatStamp_(record.ULTIMA_ACTUALIZACION);
    return { product: record };
  } finally {
    lock.releaseLock();
  }
}

/** Actualiza campos descriptivos. El stock NO se modifica aquí. */
function updateProduct(data) {
  var id = str_(data.ID_PRODUCTO);
  var lock = LockService.getScriptLock();
  lock.waitLock(CONFIG.LOCK_TIMEOUT_MS);
  try {
    var row = getProductRow_(id);
    if (!row) fail_('Producto inexistente: ' + id, 'PRODUCT_NOT_FOUND');

    var editable = ['NOMBRE', 'DESCRIPCION', 'CATEGORIA', 'LOTE', 'FECHA_VENCIMIENTO',
                    'ORIGEN', 'DESTINO', 'UBICACION_ACTUAL', 'TIPO_IDENTIFICACION',
                    'CODIGO_GENERADO', 'TIPO_CODIGO_1D', 'CODIGO_1D', 'CODIGO_QR',
                    'RFID_UID_EPC', 'ESTADO'];
    var changes = {};
    editable.forEach(function (field) {
      if (data[field] !== undefined) changes[field] = str_(data[field]);
    });

    if (changes.TIPO_CODIGO_1D === 'EAN13' && changes.CODIGO_1D) {
      var ean = validateEan13_(changes.CODIGO_1D);
      if (!ean.ok) fail_(ean.error, 'INVALID_EAN');
      changes.CODIGO_1D = ean.code;
    }

    if (changes.UBICACION_ACTUAL !== undefined) validateLocationRef_(changes.UBICACION_ACTUAL, 'UBICACION_ACTUAL', true);
    if (changes.ORIGEN !== undefined) validateLocationRef_(changes.ORIGEN, 'ORIGEN', false);
    if (changes.DESTINO !== undefined) validateLocationRef_(changes.DESTINO, 'DESTINO', false);

    // Unicidad de códigos frente a otros productos
    var others = readTable_(SHEETS.PRODUCTS).filter(function (p) { return upper_(p.ID_PRODUCTO) !== upper_(id); });
    ['CODIGO_1D', 'CODIGO_QR', 'RFID_UID_EPC'].forEach(function (field) {
      if (!changes[field]) return;
      for (var i = 0; i < others.length; i++) {
        if (upper_(others[i][field]) === upper_(changes[field])) {
          fail_('El código ' + changes[field] + ' ya está asignado a ' + others[i].ID_PRODUCTO + '.', 'DUPLICATE_CODE');
        }
      }
    });

    changes.ULTIMA_ACTUALIZACION = nowDate_();
    updateCells_(SHEETS.PRODUCTS, row.__row, changes);

    return { product: getProduct(id) };
  } finally {
    lock.releaseLock();
  }
}

function validateLocationRef_(value, fieldName, required) {
  var id = str_(value);
  if (!id) {
    if (required) fail_(fieldName + ' es obligatorio y debe existir en el maestro de ubicaciones.', 'VALIDATION');
    return;
  }
  var list = getLocations();
  for (var i = 0; i < list.length; i++) {
    if (upper_(list[i].ID_UBICACION) === upper_(id)) return;
  }
  fail_(fieldName + ' hace referencia a una ubicación inexistente: ' + id, 'LOCATION_NOT_FOUND');
}

/* ============================================================
   7. UBICACIONES
   ============================================================ */
function getLocations() {
  return readTable_(SHEETS.LOCATIONS).map(stripMeta_);
}

function getLocationRow_(id) {
  var key = upper_(id);
  var rows = readTable_(SHEETS.LOCATIONS);
  for (var i = 0; i < rows.length; i++) {
    if (upper_(rows[i].ID_UBICACION) === key) return rows[i];
  }
  return null;
}

function getLocation(id) {
  var row = getLocationRow_(id);
  if (!row) fail_('Ubicación inexistente: ' + id, 'LOCATION_NOT_FOUND');
  return stripMeta_(row);
}

function createLocation(data) {
  var id = str_(data.ID_UBICACION);
  if (!id) fail_('ID_UBICACION es obligatorio.', 'VALIDATION');
  if (!/^[A-Za-z0-9._-]+$/.test(id)) fail_('ID_UBICACION admite sólo letras, números, punto, guion y guion bajo.', 'VALIDATION');
  if (!str_(data.NOMBRE)) fail_('NOMBRE es obligatorio.', 'VALIDATION');
  if (!str_(data.TIPO)) fail_('TIPO es obligatorio.', 'VALIDATION');

  validateCoordinates_(data);

  var lock = LockService.getScriptLock();
  lock.waitLock(CONFIG.LOCK_TIMEOUT_MS);
  try {
    if (getLocationRow_(id)) fail_('Ya existe la ubicación ' + id + '.', 'DUPLICATE_ID');
    assertNoCycle_(id, data.PADRE_ID);

    var record = {
      ID_UBICACION: id.toUpperCase(),
      NOMBRE: str_(data.NOMBRE),
      TIPO: str_(data.TIPO),
      DIRECCION: str_(data.DIRECCION),
      LAT: data.LAT === '' || data.LAT === null || data.LAT === undefined ? '' : num_(data.LAT),
      LON: data.LON === '' || data.LON === null || data.LON === undefined ? '' : num_(data.LON),
      RADIO_GEOCERCA_M: data.RADIO_GEOCERCA_M === '' || data.RADIO_GEOCERCA_M === null || data.RADIO_GEOCERCA_M === undefined
        ? '' : num_(data.RADIO_GEOCERCA_M),
      PADRE_ID: upper_(data.PADRE_ID),
      ACTIVO: str_(data.ACTIVO) || 'SI'
    };
    appendRow_(SHEETS.LOCATIONS, record);
    return { location: record };
  } finally {
    lock.releaseLock();
  }
}

function updateLocation(data) {
  var id = str_(data.ID_UBICACION);
  validateCoordinates_(data);

  var lock = LockService.getScriptLock();
  lock.waitLock(CONFIG.LOCK_TIMEOUT_MS);
  try {
    var row = getLocationRow_(id);
    if (!row) fail_('Ubicación inexistente: ' + id, 'LOCATION_NOT_FOUND');
    if (data.PADRE_ID !== undefined) assertNoCycle_(id, data.PADRE_ID);

    var changes = {};
    ['NOMBRE', 'TIPO', 'DIRECCION', 'PADRE_ID', 'ACTIVO'].forEach(function (f) {
      if (data[f] !== undefined) changes[f] = f === 'PADRE_ID' ? upper_(data[f]) : str_(data[f]);
    });
    ['LAT', 'LON', 'RADIO_GEOCERCA_M'].forEach(function (f) {
      if (data[f] === undefined) return;
      changes[f] = (data[f] === '' || data[f] === null) ? '' : num_(data[f]);
    });

    updateCells_(SHEETS.LOCATIONS, row.__row, changes);
    return { location: getLocation(id) };
  } finally {
    lock.releaseLock();
  }
}

function validateCoordinates_(data) {
  var hasLat = !(data.LAT === '' || data.LAT === null || data.LAT === undefined);
  var hasLon = !(data.LON === '' || data.LON === null || data.LON === undefined);
  if (hasLat !== hasLon) fail_('Indique ambas coordenadas (LAT y LON) o ninguna.', 'VALIDATION');
  if (hasLat && !isValidLat_(data.LAT)) fail_('LAT fuera de rango: debe estar entre -90 y 90.', 'INVALID_COORDINATE');
  if (hasLon && !isValidLon_(data.LON)) fail_('LON fuera de rango: debe estar entre -180 y 180.', 'INVALID_COORDINATE');
  if (!(data.RADIO_GEOCERCA_M === '' || data.RADIO_GEOCERCA_M === null || data.RADIO_GEOCERCA_M === undefined)) {
    var r = num_(data.RADIO_GEOCERCA_M, null);
    if (r === null || r <= 0) fail_('RADIO_GEOCERCA_M debe ser mayor que cero.', 'VALIDATION');
  }
}

function assertNoCycle_(id, parentId) {
  var parent = str_(parentId);
  if (!parent) return;
  if (upper_(parent) === upper_(id)) fail_('Una ubicación no puede ser su propio padre.', 'CIRCULAR_PARENT');
  var list = getLocations();
  var byId = {};
  list.forEach(function (l) { byId[upper_(l.ID_UBICACION)] = l; });
  var current = byId[upper_(parent)];
  var guard = 0;
  while (current && guard++ < 100) {
    if (upper_(current.ID_UBICACION) === upper_(id)) {
      fail_('La jerarquía de ubicaciones formaría un ciclo.', 'CIRCULAR_PARENT');
    }
    current = byId[upper_(current.PADRE_ID)];
  }
}

/* ============================================================
   8. EVENTOS — TRANSACCIÓN COMPLETA
   Orden: localizar producto → validar evento → leer stock →
   validar cantidad → calcular stock → geolocalización →
   geocerca → crear evento → actualizar producto → responder.
   Protegida con LockService.
   ============================================================ */
function getEvents(productId) {
  var rows = readTable_(SHEETS.EVENTS);
  if (productId) {
    var key = upper_(productId);
    rows = rows.filter(function (e) { return upper_(e.ID_PRODUCTO) === key; });
  }
  rows.sort(function (a, b) { return String(a.FECHA_HORA).localeCompare(String(b.FECHA_HORA)); });
  return rows.map(function (e) {
    e.CANTIDAD_MOVIMIENTO = num_(e.CANTIDAD_MOVIMIENTO, 0);
    e.STOCK_ANTES = num_(e.STOCK_ANTES, null);
    e.STOCK_DESPUES = num_(e.STOCK_DESPUES, null);
    return stripMeta_(e);
  });
}

function createEvent(data) {
  var lock = LockService.getScriptLock();
  lock.waitLock(CONFIG.LOCK_TIMEOUT_MS);
  try {
    /* 1. Localizar producto */
    var productRow = null;
    if (str_(data.ID_PRODUCTO)) productRow = getProductRow_(data.ID_PRODUCTO);
    if (!productRow && str_(data.CODIGO_LEIDO)) {
      var byCode = findProductByCode(data.CODIGO_LEIDO);
      if (byCode.product) productRow = getProductRow_(byCode.product.ID_PRODUCTO);
    }
    if (!productRow) fail_('Producto inexistente para el identificador indicado.', 'PRODUCT_NOT_FOUND');

    /* Idempotencia: el mismo CLIENT_REQUEST_ID no se registra dos veces */
    var requestId = str_(data.CLIENT_REQUEST_ID);
    if (requestId) {
      var previous = readTable_(SHEETS.EVENTS).filter(function (e) {
        return str_(e.CLIENT_REQUEST_ID) === requestId;
      })[0];
      if (previous) {
        return {
          event: stripMeta_(previous),
          product: getProduct(productRow.ID_PRODUCTO),
          geoValidation: { status: previous.VALIDACION_GEO, distanceMeters: num_(previous.DISTANCIA_DECLARADA_M, null) },
          duplicated: true
        };
      }
    }

    /* 2. Validar evento */
    var def = eventDef_(data.EVENTO);
    if (!def) fail_('Tipo de evento no reconocido: ' + str_(data.EVENTO), 'INVALID_EVENT');
    var actor = str_(data.ACTOR);
    if (!actor) fail_('ACTOR es obligatorio.', 'MISSING_ACTOR');

    /* 3. Leer stock */
    var before = num_(productRow.CANTIDAD, 0) || 0;

    /* 4. Validar cantidad */
    var qty = num_(data.CANTIDAD_MOVIMIENTO, 0) || 0;
    if (def.qty && qty <= 0) {
      fail_('El evento ' + def.label + ' requiere una cantidad mayor que cero.', 'INVALID_QUANTITY');
    }
    if (!def.qty && def.stock === 0 && qty < 0) qty = 0;

    /* 5. Calcular stock */
    var after = before;
    if (def.stock === 1) {
      after = before + qty;
    } else if (def.stock === -1) {
      if (qty > before) {
        fail_('Stock insuficiente: disponible ' + before + ', solicitado ' + qty + '.', 'INSUFFICIENT_STOCK');
      }
      after = before - qty;
    }
    if (after < 0) fail_('La operación produciría stock negativo.', 'NEGATIVE_STOCK');

    /* 6-7. Geolocalización y validación de geocerca */
    var locations = getLocations();
    var declared = str_(data.ID_UBICACION_DECLARADA);
    if (declared) {
      var exists = locations.filter(function (l) { return upper_(l.ID_UBICACION) === upper_(declared); })[0];
      if (!exists) fail_('La ubicación declarada no existe: ' + declared, 'LOCATION_NOT_FOUND');
    }
    var lat = data.LAT_CAPTURADA, lon = data.LON_CAPTURADA;
    if (str_(lat) !== '' && !isValidLat_(lat)) fail_('LAT_CAPTURADA fuera de rango.', 'INVALID_COORDINATE');
    if (str_(lon) !== '' && !isValidLon_(lon)) fail_('LON_CAPTURADA fuera de rango.', 'INVALID_COORDINATE');
    var accuracy = num_(data.PRECISION_M, null);
    if (accuracy !== null && accuracy < 0) fail_('PRECISION_M no puede ser negativa.', 'VALIDATION');

    var geo = validateGeoEvent(declared, lat, lon, accuracy, locations);

    /* 8. Crear evento — se guarda SIEMPRE, incluso FUERA_GEOCERCA */
    var stamp = nowDate_();
    var record = {
      ID_EVENTO: uuid_(),
      CLIENT_REQUEST_ID: requestId || uuid_(),
      FECHA_HORA: stamp,
      ID_PRODUCTO: productRow.ID_PRODUCTO,
      TIPO_IDENTIFICACION: str_(data.TIPO_IDENTIFICACION),
      CODIGO_LEIDO: str_(data.CODIGO_LEIDO),
      EVENTO: def.label,
      CANTIDAD_MOVIMIENTO: def.stock === 0 ? qty : qty,
      STOCK_ANTES: before,
      STOCK_DESPUES: after,
      UBICACION: str_(data.UBICACION) || declared || str_(productRow.UBICACION_ACTUAL),
      UBICACION_ORIGEN: str_(data.UBICACION_ORIGEN),
      UBICACION_DESTINO: str_(data.UBICACION_DESTINO),
      ACTOR: actor,
      OBSERVACION: str_(data.OBSERVACION),
      ESTADO: 'REGISTRADO',
      ID_UBICACION_DECLARADA: declared,
      LAT_CAPTURADA: isValidLat_(lat) ? num_(lat) : '',
      LON_CAPTURADA: isValidLon_(lon) ? num_(lon) : '',
      PRECISION_M: accuracy === null ? '' : accuracy,
      FUENTE_UBICACION: str_(data.FUENTE_UBICACION) || (geo.status === GEO_STATUS.NONE ? 'SIN_GPS' : 'GPS_NAVEGADOR'),
      DISTANCIA_DECLARADA_M: geo.distanceMeters === null ? '' : Math.round(geo.distanceMeters * 10) / 10,
      VALIDACION_GEO: geo.status
    };
    appendRow_(SHEETS.EVENTS, record);

    /* 9. Actualizar producto */
    var productChanges = { CANTIDAD: after, ULTIMA_ACTUALIZACION: stamp };
    if (record.UBICACION_DESTINO) productChanges.UBICACION_ACTUAL = record.UBICACION_DESTINO;
    updateCells_(SHEETS.PRODUCTS, productRow.__row, productChanges);

    /* 10. Respuesta */
    record.FECHA_HORA = formatStamp_(stamp);
    return {
      event: record,
      product: getProduct(productRow.ID_PRODUCTO),
      geoValidation: geo
    };
  } finally {
    lock.releaseLock();
  }
}

/* ============================================================
   9. TRAZABILIDAD
   ============================================================ */
function getTrace(productId) {
  var product = getProduct(productId);
  var events = getEvents(productId);

  var sumBy = function (code) {
    return events.filter(function (e) { var d = eventDef_(e.EVENTO); return d && d.code === code; });
  };
  var totalOf = function (list) {
    return list.reduce(function (acc, e) { return acc + (num_(e.CANTIDAD_MOVIMIENTO, 0) || 0); }, 0);
  };

  var geoEvents = events.filter(function (e) { return isValidLat_(e.LAT_CAPTURADA) && isValidLon_(e.LON_CAPTURADA); });
  var geoCount = function (status) {
    return events.filter(function (e) { return upper_(e.VALIDACION_GEO || GEO_STATUS.NONE) === status; }).length;
  };

  var pathMeters = 0;
  for (var i = 1; i < geoEvents.length; i++) {
    var d = haversineDistance(geoEvents[i - 1].LAT_CAPTURADA, geoEvents[i - 1].LON_CAPTURADA,
                              geoEvents[i].LAT_CAPTURADA, geoEvents[i].LON_CAPTURADA);
    if (d !== null) pathMeters += d;
  }

  return {
    product: product,
    events: events,
    summary: {
      eventos: events.length,
      unidadesRecibidas: totalOf(sumBy('RECEPCION')),
      unidadesDespachadas: totalOf(sumBy('DESPACHO')),
      devoluciones: totalOf(sumBy('DEVOLUCION')),
      incidencias: sumBy('INCIDENCIA').length
    },
    geoSummary: {
      georreferenciados: geoEvents.length,
      ok: geoCount(GEO_STATUS.OK),
      fueraGeocerca: geoCount(GEO_STATUS.OUT),
      bajaPrecision: geoCount(GEO_STATUS.LOW),
      sinGps: geoCount(GEO_STATUS.NONE),
      distanciaGeodesicaM: Math.round(pathMeters)
    },
    trajectory: geoEvents
  };
}

/* ============================================================
   10. INVENTARIO Y DASHBOARD
   ============================================================ */
function getInventory() {
  var products = getProducts();
  var threshold = CONFIG.LOW_STOCK_THRESHOLD;

  var units = products.reduce(function (acc, p) { return acc + (num_(p.CANTIDAD, 0) || 0); }, 0);
  var low = products.filter(function (p) { var q = num_(p.CANTIDAD, 0) || 0; return q > 0 && q <= threshold; });
  var out = products.filter(function (p) { return (num_(p.CANTIDAD, 0) || 0) <= 0; });

  var byCat = {};
  products.forEach(function (p) {
    var key = str_(p.CATEGORIA) || 'Sin categoría';
    if (!byCat[key]) byCat[key] = [];
    byCat[key].push(p);
  });

  var categories = Object.keys(byCat).sort().map(function (name) {
    var list = byCat[name];
    var last = '';
    list.forEach(function (p) {
      var v = str_(p.ULTIMA_ACTUALIZACION);
      if (v > last) last = v;
    });
    return {
      categoria: name,
      productos: list.length,
      unidades: list.reduce(function (acc, p) { return acc + (num_(p.CANTIDAD, 0) || 0); }, 0),
      ultimaActualizacion: last
    };
  });

  return {
    totals: {
      productos: products.length,
      unidades: units,
      categorias: categories.length,
      stockBajo: low.length,
      agotados: out.length,
      umbralStockBajo: threshold
    },
    categories: categories,
    items: products
  };
}

function getDashboard() {
  var inv = getInventory();
  var products = inv.items;
  var events = getEvents();
  var today = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd');

  var countEvent = function (code) {
    return events.filter(function (e) { var d = eventDef_(e.EVENTO); return d && d.code === code; }).length;
  };
  var geoCount = function (status) {
    return events.filter(function (e) { return upper_(e.VALIDACION_GEO || GEO_STATUS.NONE) === status; }).length;
  };
  var pct = function (part) {
    return events.length ? Math.round((part / events.length) * 1000) / 10 : 0;
  };
  var techCount = function (kind) {
    return products.filter(function (p) {
      if (kind === 'CODE128') return upper_(p.TIPO_CODIGO_1D) === 'CODE128' && str_(p.CODIGO_1D);
      if (kind === 'EAN13') return upper_(p.TIPO_CODIGO_1D) === 'EAN13' && str_(p.CODIGO_1D);
      if (kind === 'QR') return !!str_(p.CODIGO_QR);
      if (kind === 'RFID') return !!str_(p.RFID_UID_EPC);
      return false;
    }).length;
  };

  var geoEvents = events.filter(function (e) { return isValidLat_(e.LAT_CAPTURADA) && isValidLon_(e.LON_CAPTURADA); });

  var exceptions = {};
  events.forEach(function (e) {
    var st = upper_(e.VALIDACION_GEO);
    if (st !== GEO_STATUS.OUT && st !== GEO_STATUS.LOW) return;
    var key = str_(e.ID_UBICACION_DECLARADA) || str_(e.UBICACION) || 'Sin declarar';
    exceptions[key] = (exceptions[key] || 0) + 1;
  });

  var activity = [];
  for (var i = 6; i >= 0; i--) {
    var d = new Date();
    d.setDate(d.getDate() - i);
    var stamp = Utilities.formatDate(d, CONFIG.TIMEZONE, 'yyyy-MM-dd');
    activity.push({
      label: Utilities.formatDate(d, CONFIG.TIMEZONE, 'dd/MM'),
      value: events.filter(function (e) { return String(e.FECHA_HORA).indexOf(stamp) === 0; }).length
    });
  }

  return {
    logistics: {
      productos: inv.totals.productos,
      unidades: inv.totals.unidades,
      categorias: inv.totals.categorias,
      stockBajo: inv.totals.stockBajo,
      agotados: inv.totals.agotados,
      eventos: events.length,
      eventosHoy: events.filter(function (e) { return String(e.FECHA_HORA).indexOf(today) === 0; }).length,
      recepciones: countEvent('RECEPCION'),
      despachos: countEvent('DESPACHO'),
      devoluciones: countEvent('DEVOLUCION'),
      incidencias: countEvent('INCIDENCIA')
    },
    geo: {
      georreferenciados: geoEvents.length,
      ok: geoCount(GEO_STATUS.OK),
      fueraGeocerca: geoCount(GEO_STATUS.OUT),
      bajaPrecision: geoCount(GEO_STATUS.LOW),
      sinGps: geoCount(GEO_STATUS.NONE),
      pctOk: pct(geoCount(GEO_STATUS.OK)),
      pctFuera: pct(geoCount(GEO_STATUS.OUT)),
      pctBaja: pct(geoCount(GEO_STATUS.LOW)),
      pctSinGps: pct(geoCount(GEO_STATUS.NONE))
    },
    charts: {
      inventoryByCategory: inv.categories.map(function (c) {
        return { label: c.categoria, productos: c.productos, unidades: c.unidades };
      }),
      technologies: [
        { label: 'Code 128', value: techCount('CODE128') },
        { label: 'EAN-13', value: techCount('EAN13') },
        { label: 'QR', value: techCount('QR') },
        { label: 'RFID simulado', value: techCount('RFID') }
      ],
      eventsByType: EVENT_TYPES.map(function (e) {
        return { label: e.label, value: countEvent(e.code) };
      }).filter(function (x) { return x.value > 0; }),
      geoValidation: [
        { label: 'OK', value: geoCount(GEO_STATUS.OK) },
        { label: 'Fuera de geocerca', value: geoCount(GEO_STATUS.OUT) },
        { label: 'Baja precisión', value: geoCount(GEO_STATUS.LOW) },
        { label: 'Sin GPS', value: geoCount(GEO_STATUS.NONE) }
      ],
      exceptionsByLocation: Object.keys(exceptions).map(function (k) {
        return { label: k, value: exceptions[k] };
      }).sort(function (a, b) { return b.value - a.value; }).slice(0, 8),
      recentActivity: activity
    },
    inventory: inv
  };
}

/* ============================================================
   11. EVENTOS GEORREFERENCIADOS Y FILTROS
   ============================================================ */
function getGeoEvents(filters) {
  var f = filters || {};
  var events = getEvents(f.productId);
  return events.filter(function (e) {
    if (f.event) {
      var d1 = eventDef_(e.EVENTO), d2 = eventDef_(f.event);
      if (!d1 || !d2 || d1.code !== d2.code) return false;
    }
    if (f.geoStatus && upper_(e.VALIDACION_GEO || GEO_STATUS.NONE) !== upper_(f.geoStatus)) return false;
    if (f.locationId) {
      var key = upper_(f.locationId);
      var match = [e.ID_UBICACION_DECLARADA, e.UBICACION, e.UBICACION_ORIGEN, e.UBICACION_DESTINO]
        .some(function (v) { return upper_(v) === key; });
      if (!match) return false;
    }
    if (f.dateFrom && String(e.FECHA_HORA) < String(f.dateFrom)) return false;
    if (f.dateTo && String(e.FECHA_HORA) > String(f.dateTo) + 'T23:59:59') return false;
    return true;
  });
}

/* ============================================================
   12. GEOJSON — SIEMPRE [LONGITUD, LATITUD]
   ============================================================ */
function coordPair_(lat, lon) {
  if (!isValidLat_(lat) || !isValidLon_(lon)) return null;
  return [num_(lon), num_(lat)];          // [LONGITUD, LATITUD]
}

function featureCollection_(name, features, extra) {
  var meta = {
    generator: 'LogiTrace (Apps Script)',
    generatedAt: nowStamp_(),
    timezone: CONFIG.TIMEZONE,
    coordinateOrder: '[longitude, latitude]',
    count: features.length
  };
  if (extra) Object.keys(extra).forEach(function (k) { meta[k] = extra[k]; });
  return {
    type: 'FeatureCollection',
    name: name,
    crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
    metadata: meta,
    features: features
  };
}

function buildLocationsGeoJSON() {
  var locations = getLocations();
  var features = [];
  locations.forEach(function (loc) {
    if (!isActiveLocation_(loc)) return;
    var resolved = resolveLocationCoordinates(loc.ID_UBICACION, locations);
    if (!resolved.found) return;
    var coords = coordPair_(resolved.lat, resolved.lon);
    if (!coords) return;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: coords },
      properties: {
        id_ubicacion: loc.ID_UBICACION,
        nombre: loc.NOMBRE,
        tipo: loc.TIPO,
        direccion: loc.DIRECCION,
        radio_geocerca_m: resolved.radiusMeters === null ? '' : resolved.radiusMeters,
        padre_id: loc.PADRE_ID,
        activo: isActiveLocation_(loc) ? 'SI' : 'NO',
        coordenadas_heredadas: resolved.inherited ? 'SI' : 'NO',
        ubicacion_efectiva: resolved.effectiveLocationId
      }
    });
  });
  return featureCollection_('logitrace_ubicaciones', features,
    { ubicacionesSinCoordenadas: locations.length - features.length });
}

function buildEventsGeoJSON(filters) {
  var events = getGeoEvents(filters || {});
  var features = [];
  var skipped = 0;
  events.forEach(function (e) {
    var coords = coordPair_(e.LAT_CAPTURADA, e.LON_CAPTURADA);
    if (!coords) { skipped++; return; }
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: coords },
      properties: {
        id_evento: e.ID_EVENTO,
        fecha_hora: e.FECHA_HORA,
        id_producto: e.ID_PRODUCTO,
        evento: e.EVENTO,
        cantidad_movimiento: num_(e.CANTIDAD_MOVIMIENTO, 0),
        stock_antes: num_(e.STOCK_ANTES, null),
        stock_despues: num_(e.STOCK_DESPUES, null),
        actor: e.ACTOR,
        id_ubicacion_declarada: e.ID_UBICACION_DECLARADA,
        ubicacion_origen: e.UBICACION_ORIGEN,
        ubicacion_destino: e.UBICACION_DESTINO,
        precision_m: num_(e.PRECISION_M, null),
        distancia_declarada_m: num_(e.DISTANCIA_DECLARADA_M, null),
        validacion_geo: e.VALIDACION_GEO || GEO_STATUS.NONE,
        fuente_ubicacion: e.FUENTE_UBICACION,
        tipo_identificacion: e.TIPO_IDENTIFICACION,
        codigo_leido: e.CODIGO_LEIDO,
        observacion: e.OBSERVACION
      }
    });
  });
  return featureCollection_('logitrace_eventos', features, { eventosSinCoordenadas: skipped });
}

/* ============================================================
   13. PRUEBAS EJECUTABLES DESDE EL EDITOR
   Ejecute runAllTests() y revise el registro (Ver → Registros).
   Las pruebas de inventario y geocerca no escriben en la hoja.
   ============================================================ */
function runAllTests() {
  var results = [];
  results = results.concat(testInventoryRules_());
  results = results.concat(testGeoRules_());
  results = results.concat(testEan13_());

  var failed = results.filter(function (r) { return !r.pass; });
  Logger.log('LogiTrace — resultados de pruebas');
  results.forEach(function (r) {
    Logger.log((r.pass ? '✓ ' : '✗ ') + r.name + ' → esperado: ' + r.expected + ' · obtenido: ' + r.actual);
  });
  Logger.log('Total: ' + results.length + ' · Correctas: ' + (results.length - failed.length) + ' · Fallidas: ' + failed.length);
  return { total: results.length, passed: results.length - failed.length, failed: failed.length, results: results };
}

/** Simula el cálculo de stock sin tocar la hoja. */
function simulateStock_(eventName, before, qty) {
  var def = eventDef_(eventName);
  if (!def) return { error: 'INVALID_EVENT' };
  if (def.qty && qty <= 0) return { error: 'INVALID_QUANTITY' };
  if (def.stock === 1) return { after: before + qty };
  if (def.stock === -1) {
    if (qty > before) return { error: 'INSUFFICIENT_STOCK', after: before };
    return { after: before - qty };
  }
  return { after: before };
}

function testInventoryRules_() {
  var t = [];
  var caseA = simulateStock_('RECEPCIÓN', 20, 10);
  t.push({ name: 'Caso A · stock 20 + recepción 10', expected: 30, actual: caseA.after, pass: caseA.after === 30 });

  var caseB = simulateStock_('DESPACHO', 30, 8);
  t.push({ name: 'Caso B · stock 30 - despacho 8', expected: 22, actual: caseB.after, pass: caseB.after === 22 });

  var caseC = simulateStock_('DESPACHO', 5, 8);
  t.push({
    name: 'Caso C · despacho 8 sobre stock 5 (rechazo)',
    expected: 'INSUFFICIENT_STOCK y stock 5',
    actual: caseC.error + ' y stock ' + caseC.after,
    pass: caseC.error === 'INSUFFICIENT_STOCK' && caseC.after === 5
  });

  var caseD = simulateStock_('MOVIMIENTO INTERNO', 20, 5);
  t.push({ name: 'Caso D · movimiento interno no altera stock', expected: 20, actual: caseD.after, pass: caseD.after === 20 });

  var caseE = simulateStock_('ENTREGA', 22, 8);
  t.push({ name: 'Caso E · entrega posterior no descuenta de nuevo', expected: 22, actual: caseE.after, pass: caseE.after === 22 });

  var caseF = simulateStock_('DEVOLUCIÓN', 22, 2);
  t.push({ name: 'Caso F · devolución 2 suma al stock', expected: 24, actual: caseF.after, pass: caseF.after === 24 });

  var caseG = simulateStock_('INCIDENCIA', 24, 3);
  t.push({ name: 'Caso G · incidencia no modifica inventario', expected: 24, actual: caseG.after, pass: caseG.after === 24 });

  return t;
}

/** Pruebas de geocerca con un maestro ficticio en memoria. */
function testGeoRules_() {
  var fake = [
    { ID_UBICACION: 'CD-001', NOMBRE: 'CD', TIPO: 'Centro de distribución', LAT: 0.81234, LON: -77.71782, RADIO_GEOCERCA_M: 150, PADRE_ID: '', ACTIVO: 'SI' },
    { ID_UBICACION: 'RACK-A01', NOMBRE: 'Rack A01', TIPO: 'Rack', LAT: '', LON: '', RADIO_GEOCERCA_M: '', PADRE_ID: 'CD-001', ACTIVO: 'SI' }
  ];
  var t = [];

  // ~20 m al norte del centro declarado, precisión 8 m
  var okPoint = { lat: 0.81252, lon: -77.71782, acc: 8 };
  var r1 = validateGeoEvent('CD-001', okPoint.lat, okPoint.lon, okPoint.acc, fake);
  t.push({
    name: 'Geo OK · distancia ≈20 m, radio 150 m, precisión 8 m',
    expected: GEO_STATUS.OK,
    actual: r1.status + ' (' + Math.round(r1.distanceMeters) + ' m)',
    pass: r1.status === GEO_STATUS.OK
  });

  // ~850 m de distancia
  var r2 = validateGeoEvent('CD-001', 0.81998, -77.71782, 10, fake);
  t.push({
    name: 'Geo fuera · distancia ≈850 m, radio 150 m',
    expected: GEO_STATUS.OUT,
    actual: r2.status + ' (' + Math.round(r2.distanceMeters) + ' m)',
    pass: r2.status === GEO_STATUS.OUT
  });

  var r3 = validateGeoEvent('CD-001', 0.81240, -77.71780, 600, fake);
  t.push({
    name: 'Geo baja precisión · precisión 600 m',
    expected: GEO_STATUS.LOW,
    actual: r3.status,
    pass: r3.status === GEO_STATUS.LOW
  });

  var r4 = validateGeoEvent('CD-001', '', '', '', fake);
  t.push({ name: 'Geo sin GPS · sin latitud/longitud', expected: GEO_STATUS.NONE, actual: r4.status, pass: r4.status === GEO_STATUS.NONE });

  var res = resolveLocationCoordinates('RACK-A01', fake);
  t.push({
    name: 'Herencia · RACK-A01 hereda coordenadas y radio de CD-001',
    expected: '0.81234 / -77.71782 / 150',
    actual: res.lat + ' / ' + res.lon + ' / ' + res.radiusMeters,
    pass: res.found === true && res.lat === 0.81234 && res.radiusMeters === 150 && res.inherited === true
  });

  var r5 = validateGeoEvent('RACK-A01', 0.81240, -77.71786, 12, fake);
  t.push({
    name: 'Geo con herencia · evento en rack dentro de la geocerca del padre',
    expected: GEO_STATUS.OK,
    actual: r5.status + ' (' + Math.round(r5.distanceMeters) + ' m)',
    pass: r5.status === GEO_STATUS.OK
  });

  return t;
}

function testEan13_() {
  var t = [];
  var a = validateEan13_('786010000003');
  t.push({ name: 'EAN-13 · cálculo del dígito 13 desde 12 dígitos', expected: '13 dígitos válidos', actual: a.ok ? a.code : a.error, pass: a.ok && a.code.length === 13 });

  var b = validateEan13_(a.ok ? a.code : '0000000000000');
  t.push({ name: 'EAN-13 · validación de checksum correcto', expected: 'válido', actual: b.ok ? 'válido' : b.error, pass: b.ok === true });

  var wrong = (a.ok ? a.code.substring(0, 12) : '786010000003') + ((Number(a.ok ? a.code.charAt(12) : 0) + 1) % 10);
  var c = validateEan13_(wrong);
  t.push({ name: 'EAN-13 · rechazo de checksum incorrecto', expected: 'inválido', actual: c.ok ? 'aceptado' : 'inválido', pass: c.ok === false });

  var d = validateEan13_('ABC123456789');
  t.push({ name: 'EAN-13 · rechazo de caracteres alfabéticos', expected: 'inválido', actual: d.ok ? 'aceptado' : 'inválido', pass: d.ok === false });

  return t;
}

/* ============================================================
   14. CARGA OPCIONAL DE DATOS DE DEMOSTRACIÓN
   Ejecútela sólo si desea poblar una hoja vacía. Es segura:
   no sobrescribe filas existentes.
   ============================================================ */
function loadDemoData() {
  initializeSheets();
  var locations = getLocations();
  if (locations.length) {
    Logger.log('La hoja Ubicaciones ya contiene datos: no se carga la demostración.');
    return { skipped: true };
  }

  var demoLocations = [
    ['CD-001', 'Centro de Distribución Tulcán', 'Centro de distribución', 'Av. Veintimilla y Panamericana Norte, Tulcán', 0.81234, -77.71782, 150, '', 'SI'],
    ['CD-001-M1', 'Muelle 1', 'Muelle', 'Andén norte, CD Tulcán', 0.81250, -77.71765, 40, 'CD-001', 'SI'],
    ['CD-001-RA01', 'Rack A01', 'Rack', 'Zona A, nivel 1, CD Tulcán', '', '', '', 'CD-001', 'SI'],
    ['PAT-001', 'Patio de Maniobras', 'Patio', 'Exterior CD Tulcán', 0.81190, -77.71880, 80, 'CD-001', 'SI'],
    ['ALM-UPEC', 'Almacén UPEC', 'Almacén', 'Campus UPEC, Tulcán', 0.80987, -77.71234, 120, '', 'SI'],
    ['LAB-001', 'Laboratorio de Calidad', 'Laboratorio', 'Campus UPEC, bloque B', '', '', 50, 'ALM-UPEC', 'SI'],
    ['PL-001', 'Planta de Procesamiento Carchi', 'Planta', 'Vía a Julio Andrade, km 7', 0.85120, -77.68450, 200, '', 'SI'],
    ['PROV-001', 'Proveedor AndeanTech', 'Proveedor', 'Av. 10 de Agosto N24, Quito', -0.18065, -78.46784, 150, '', 'SI'],
    ['CLI-001', 'Supermercado Norte', 'Cliente', 'Calle Bolívar y Oviedo, Ibarra', 0.34970, -78.12250, 100, '', 'SI'],
    ['CLI-002', 'Farmacia Central', 'Cliente', 'Av. Coral y Bolívar, Tulcán', 0.81590, -77.72010, 100, '', 'SI']
  ];
  demoLocations.forEach(function (r) {
    appendRow_(SHEETS.LOCATIONS, {
      ID_UBICACION: r[0], NOMBRE: r[1], TIPO: r[2], DIRECCION: r[3],
      LAT: r[4], LON: r[5], RADIO_GEOCERCA_M: r[6], PADRE_ID: r[7], ACTIVO: r[8]
    });
  });

  Logger.log('Ubicaciones de demostración cargadas: ' + demoLocations.length);
  Logger.log('Para productos y eventos, importe base-datos/LogiTrace_Base.xlsx o regístrelos desde la aplicación.');
  return { locations: demoLocations.length };
}

/* ============================================================
   15. UTILIDAD DE MANTENIMIENTO
   Recalcula DISTANCIA_DECLARADA_M y VALIDACION_GEO de todos los
   eventos con las reglas vigentes (por ejemplo, tras corregir las
   coordenadas o los radios del maestro). No altera el inventario.
   ============================================================ */
function recalculateGeoValidation() {
  var lock = LockService.getScriptLock();
  lock.waitLock(CONFIG.LOCK_TIMEOUT_MS);
  try {
    var locations = getLocations();
    var rows = readTable_(SHEETS.EVENTS);
    var updated = 0;
    rows.forEach(function (e) {
      var geo = validateGeoEvent(e.ID_UBICACION_DECLARADA, e.LAT_CAPTURADA, e.LON_CAPTURADA, e.PRECISION_M, locations);
      var newDistance = geo.distanceMeters === null ? '' : Math.round(geo.distanceMeters * 10) / 10;
      if (str_(e.VALIDACION_GEO) !== geo.status || String(e.DISTANCIA_DECLARADA_M) !== String(newDistance)) {
        updateCells_(SHEETS.EVENTS, e.__row, {
          DISTANCIA_DECLARADA_M: newDistance,
          VALIDACION_GEO: geo.status
        });
        updated++;
      }
    });
    Logger.log('Eventos recalculados: ' + updated + ' de ' + rows.length);
    return { total: rows.length, updated: updated };
  } finally {
    lock.releaseLock();
  }
}
