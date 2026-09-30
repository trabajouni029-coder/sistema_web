/* ============================================================
   LogiTrace — api.js
   ------------------------------------------------------------
   Única puerta de acceso a datos.

   · MODO CONECTADO  → Google Apps Script Web App → Google Sheets.
                       No se usan datos simulados en ningún caso.
   · MODO LOCAL      → se activa SOLO cuando APPS_SCRIPT_URL no está
                       configurada o cuando DEMO_MODE es true. Replica
                       las mismas reglas de Code.gs sobre localStorage
                       para poder demostrar el sistema sin backend.

   Expone: window.LT.API
   ============================================================ */
(function (global) {
  'use strict';

  var LT = global.LT = global.LT || {};
  var U = LT.U;
  var CAT = LT.CAT;

  var REQUEST_TIMEOUT_MS = 20000;

  var state = {
    mode: 'local',          // 'online' | 'local' | 'error'
    online: navigator.onLine !== false,
    lastSync: null,
    lastError: null,
    health: null
  };

  var listeners = [];
  function onStateChange(fn) { listeners.push(fn); }
  function emit() { listeners.forEach(function (fn) { try { fn(getState()); } catch (e) { /* aislado */ } }); }
  function getState() {
    return {
      mode: state.mode, online: state.online, lastSync: state.lastSync,
      lastError: state.lastError, health: state.health,
      backendConfigured: U.backendConfigured()
    };
  }

  function setMode(mode, error) {
    state.mode = mode;
    state.lastError = error || null;
    emit();
  }

  function touchSync() { state.lastSync = new Date().toISOString(); emit(); }

  function ApiError(message, code, detail) {
    var e = new Error(message);
    e.name = 'ApiError';
    e.errorCode = code || 'UNKNOWN';
    e.detail = detail;
    return e;
  }

  /* ============================================================
     TRANSPORTE HTTP
     ============================================================ */
  function withTimeout(promise, controller) {
    var timer;
    var timeout = new Promise(function (_, reject) {
      timer = setTimeout(function () {
        if (controller) { try { controller.abort(); } catch (e) { /* ignorado */ } }
        reject(ApiError('La solicitud superó el tiempo de espera.', 'TIMEOUT'));
      }, REQUEST_TIMEOUT_MS);
    });
    return Promise.race([promise, timeout]).then(
      function (v) { clearTimeout(timer); return v; },
      function (e) { clearTimeout(timer); throw e; }
    );
  }

  function parseResponse(text) {
    var payload;
    try { payload = JSON.parse(text); }
    catch (err) {
      throw ApiError(
        'El backend no devolvió JSON. Verifique que la Web App esté implementada con acceso "Cualquier persona" y que la URL termine en /exec.',
        'BAD_RESPONSE', String(text).slice(0, 300));
    }
    if (!payload || typeof payload !== 'object') throw ApiError('Respuesta vacía del backend.', 'BAD_RESPONSE');
    if (payload.success === false) throw ApiError(payload.message || 'Operación rechazada.', payload.errorCode || 'BACKEND_ERROR', payload);
    return payload;
  }

  function httpGet(action, params) {
    if (!navigator.onLine) throw ApiError('Sin conexión a Internet.', 'OFFLINE');
    var url = U.cfg().APPS_SCRIPT_URL + '?action=' + encodeURIComponent(action);
    Object.keys(params || {}).forEach(function (k) {
      var v = params[k];
      if (v !== undefined && v !== null && v !== '') url += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(v);
    });
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    return withTimeout(
      fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller ? controller.signal : undefined
      }).then(function (res) {
        if (!res.ok) throw ApiError('El backend respondió HTTP ' + res.status + '.', 'HTTP_' + res.status);
        return res.text();
      }).then(parseResponse),
      controller);
  }

  function httpPost(action, data) {
    if (!navigator.onLine) throw ApiError('Sin conexión a Internet.', 'OFFLINE');
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    return withTimeout(
      fetch(U.cfg().APPS_SCRIPT_URL, {
        method: 'POST',
        redirect: 'follow',
        // text/plain evita la petición preflight CORS que Apps Script no atiende.
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: action, data: data || {} }),
        signal: controller ? controller.signal : undefined
      }).then(function (res) {
        if (!res.ok) throw ApiError('El backend respondió HTTP ' + res.status + '.', 'HTTP_' + res.status);
        return res.text();
      }).then(parseResponse),
      controller);
  }

  /* ============================================================
     MOTOR LOCAL DE DEMOSTRACIÓN
     Réplica fiel de las reglas implementadas en apps-script/Code.gs.
     Nunca se activa si existe backend configurado y DEMO_MODE=false.
     ============================================================ */
  var STORE_KEY = 'lt.localstore.v1';

  var Local = (function () {
    var db = null;

    function seedLocations() {
      return [
        { ID_UBICACION: 'CD-001',      NOMBRE: 'Centro de Distribución Tulcán', TIPO: 'Centro de distribución', DIRECCION: 'Av. Veintimilla y Panamericana Norte, Tulcán', LAT: 0.81234,  LON: -77.71782, RADIO_GEOCERCA_M: 150, PADRE_ID: '',         ACTIVO: 'SI' },
        { ID_UBICACION: 'CD-001-M1',   NOMBRE: 'Muelle 1',                      TIPO: 'Muelle',                 DIRECCION: 'Andén norte, CD Tulcán',                        LAT: 0.81250,  LON: -77.71765, RADIO_GEOCERCA_M: 40,  PADRE_ID: 'CD-001',   ACTIVO: 'SI' },
        { ID_UBICACION: 'CD-001-RA01', NOMBRE: 'Rack A01',                      TIPO: 'Rack',                   DIRECCION: 'Zona A, nivel 1, CD Tulcán',                    LAT: '',       LON: '',        RADIO_GEOCERCA_M: '',  PADRE_ID: 'CD-001',   ACTIVO: 'SI' },
        { ID_UBICACION: 'PAT-001',     NOMBRE: 'Patio de Maniobras',            TIPO: 'Patio',                  DIRECCION: 'Exterior CD Tulcán',                            LAT: 0.81190,  LON: -77.71880, RADIO_GEOCERCA_M: 80,  PADRE_ID: 'CD-001',   ACTIVO: 'SI' },
        { ID_UBICACION: 'ALM-UPEC',    NOMBRE: 'Almacén UPEC',                  TIPO: 'Almacén',                DIRECCION: 'Campus UPEC, Tulcán',                           LAT: 0.80987,  LON: -77.71234, RADIO_GEOCERCA_M: 120, PADRE_ID: '',         ACTIVO: 'SI' },
        { ID_UBICACION: 'LAB-001',     NOMBRE: 'Laboratorio de Calidad',        TIPO: 'Laboratorio',            DIRECCION: 'Campus UPEC, bloque B',                         LAT: '',       LON: '',        RADIO_GEOCERCA_M: 50,  PADRE_ID: 'ALM-UPEC', ACTIVO: 'SI' },
        { ID_UBICACION: 'PL-001',      NOMBRE: 'Planta de Procesamiento Carchi',TIPO: 'Planta',                 DIRECCION: 'Vía a Julio Andrade, km 7',                     LAT: 0.85120,  LON: -77.68450, RADIO_GEOCERCA_M: 200, PADRE_ID: '',         ACTIVO: 'SI' },
        { ID_UBICACION: 'PROV-001',    NOMBRE: 'Proveedor AndeanTech',          TIPO: 'Proveedor',              DIRECCION: 'Av. 10 de Agosto N24, Quito',                   LAT: -0.18065, LON: -78.46784, RADIO_GEOCERCA_M: 150, PADRE_ID: '',         ACTIVO: 'SI' },
        { ID_UBICACION: 'CLI-001',     NOMBRE: 'Supermercado Norte',            TIPO: 'Cliente',                DIRECCION: 'Calle Bolívar y Oviedo, Ibarra',                LAT: 0.34970,  LON: -78.12250, RADIO_GEOCERCA_M: 100, PADRE_ID: '',         ACTIVO: 'SI' },
        { ID_UBICACION: 'CLI-002',     NOMBRE: 'Farmacia Central',              TIPO: 'Cliente',                DIRECCION: 'Av. Coral y Bolívar, Tulcán',                   LAT: 0.81590,  LON: -77.72010, RADIO_GEOCERCA_M: 100, PADRE_ID: '',         ACTIVO: 'SI' }
      ];
    }

    function ean(base12) {
      return base12 + U.ean13Checksum(base12);
    }

    function seedProducts() {
      var base = [
        ['UPEC-ALM-P001-L03-0001', 'Teclado mecánico retroiluminado', 'Teclado USB-C, switches azules, 87 teclas', 'Tecnología',             'L03', 24, '',           'PROV-001', 'CLI-001', 'ALM-UPEC',    'MIXTO',   'CODE128'],
        ['UPEC-CD-P002-L07-0002',  'Monitor LED 24 pulgadas',        'Panel IPS 1920x1080, 75 Hz',               'Tecnología',             'L07', 12, '',           'PROV-001', 'CLI-001', 'CD-001',      'MIXTO',   'CODE128'],
        ['UPEC-CD-P003-L01-0003',  'Leche entera 1 L (caja x12)',    'UHT, cadena seca, caja de 12 unidades',    'Alimentos',              'L01', 3,  '2026-11-20', 'PL-001',   'CLI-001', 'CD-001-M1',   'EAN13',   'EAN13'],
        ['UPEC-CD-P004-L02-0004',  'Arroz flor saco 50 kg',         'Grano largo, saco de polipropileno',       'Alimentos',              'L02', 0,  '2027-03-15', 'PL-001',   'CLI-001', 'CD-001-RA01', 'EAN13',   'EAN13'],
        ['UPEC-ALM-P005-L05-0005', 'Guantes de nitrilo caja x100',  'Talla M, sin polvo, uso sanitario',        'Farmacéutico',           'L05', 40, '2027-06-30', 'PROV-001', 'CLI-002', 'ALM-UPEC',    'MIXTO',   'CODE128'],
        ['UPEC-LAB-P006-L09-0006', 'Reactivo de calibración pH',    'Solución buffer pH 7.00, frasco 500 ml',   'Insumos de laboratorio', 'L09', 6,  '2026-12-31', 'PROV-001', 'LAB-001', 'LAB-001',     'QR',      'CODE128'],
        ['UPEC-CD-P007-L04-0007',  'Aceite vegetal 1 L (caja x12)', 'Aceite de palma refinado',                 'Alimentos',              'L04', 18, '2027-01-31', 'PL-001',   'CLI-001', 'CD-001',      'EAN13',   'EAN13'],
        ['UPEC-PAT-P008-L06-0008', 'Neumático 195/65 R15',          'Radial, uso urbano',                       'Repuestos',              'L06', 9,  '',           'PROV-001', 'CLI-001', 'PAT-001',     'RFID',    'CODE128'],
        ['UPEC-ALM-P009-L08-0009', 'Camiseta algodón talla M',      'Algodón 100%, cuello redondo',             'Textil',                 'L08', 55, '',           'PROV-001', 'CLI-001', 'ALM-UPEC',    'CODE128', 'CODE128'],
        ['UPEC-CD-P010-L10-0010',  'Fertilizante NPK 25 kg',        'Mezcla 15-15-15, saco de 25 kg',           'Agrícola',               'L10', 4,  '2028-05-10', 'PL-001',   'CLI-001', 'CD-001-RA01', 'MIXTO',   'CODE128']
      ];
      return base.map(function (r, i) {
        var n = i + 1;
        var useEan = r[11] === 'EAN13';
        return {
          ID_PRODUCTO: r[0], NOMBRE: r[1], DESCRIPCION: r[2], CATEGORIA: r[3], LOTE: r[4],
          CANTIDAD: r[5], FECHA_VENCIMIENTO: r[6], ORIGEN: r[7], DESTINO: r[8], UBICACION_ACTUAL: r[9],
          TIPO_IDENTIFICACION: r[10], CODIGO_GENERADO: r[0],
          TIPO_CODIGO_1D: useEan ? 'EAN13' : 'CODE128',
          CODIGO_1D: useEan ? ean('78601' + U.pad(n, 7)) : r[0],
          CODIGO_QR: r[0],
          RFID_UID_EPC: '3034257BF7194E40000' + U.pad(n * 7, 5).slice(-5),
          // Marcas de tiempo en hora local, igual que las que escribe Code.gs.
          FECHA_REGISTRO: '2026-09-' + U.pad(10 + i, 2) + 'T13:' + U.pad(10 + i, 2) + ':00',
          ULTIMA_ACTUALIZACION: '2026-09-' + U.pad(20 + (i % 8), 2) + 'T15:00:00',
          ESTADO: 'ACTIVO'
        };
      });
    }

    /* Eventos de demostración: 20 registros, 16 georreferenciados,
       2 fuera de geocerca, 1 de baja precisión, 4 sin GPS.
       La distancia y la validación se recalculan con las mismas
       reglas del backend al sembrar los datos.                     */
    function seedEvents(products) {
      var byIndex = function (i) { return products[i].ID_PRODUCTO; };
      var raw = [
        // [prodIdx, evento, cant, antes, despues, ubic, origen, destino, actor, obs, fecha, lat, lon, prec, fuente]
        [0, 'RECEPCIÓN',             10, 20, 30, 'ALM-UPEC',    'PROV-001',   'ALM-UPEC',    'M. Chalán',   'Ingreso de lote completo',            '2026-09-20T13:05:00', 0.80990, -77.71240, 8,   'GPS_NAVEGADOR'],
        [0, 'DESPACHO',               6, 30, 24, 'ALM-UPEC',    'ALM-UPEC',   'CLI-001',     'J. Pozo',     'Pedido SUP-4412',                     '2026-09-24T09:40:00', 0.80982, -77.71229, 11,  'GPS_NAVEGADOR'],
        [1, 'INGRESO AL ALMACÉN',     0, 12, 12, 'CD-001',      'PROV-001',   'CD-001',      'M. Chalán',   'Verificación física conforme',         '2026-09-21T10:15:00', 0.81240, -77.71790, 9,   'GPS_NAVEGADOR'],
        [1, 'UBICACIÓN',              0, 12, 12, 'CD-001-M1',   'CD-001',     'CD-001-M1',   'M. Chalán',   'Asignado a muelle 1',                 '2026-09-21T10:35:00', 0.81252, -77.71760, 12,  'GPS_NAVEGADOR'],
        [2, 'RECEPCIÓN',              5, 15, 20, 'CD-001-M1',   'PL-001',     'CD-001-M1',   'A. Cuasapaz', 'Cadena seca verificada',              '2026-09-22T08:20:00', 0.81248, -77.71770, 7,   'GPS_NAVEGADOR'],
        [2, 'DESPACHO',              12, 20,  8, 'CD-001-M1',   'CD-001-M1',  'CLI-001',     'J. Pozo',     'Carga realizada fuera del andén',     '2026-09-25T11:10:00', 0.81950, -77.72400, 10,  'GPS_NAVEGADOR'],
        [2, 'DESPACHO',               5,  8,  3, 'CD-001',      'CD-001',     'CLI-001',     'J. Pozo',     'Pedido complementario',               '2026-09-27T14:05:00', 0.81230, -77.71775, 9,   'GPS_NAVEGADOR'],
        [3, 'DESPACHO',              10, 10,  0, 'CD-001-RA01', 'CD-001-RA01','CLI-001',     'L. Erazo',    'Salida total del lote',               '2026-09-26T15:30:00', 0.81238, -77.71786, 14,  'GPS_NAVEGADOR'],
        [4, 'RECEPCIÓN',             20, 30, 50, 'ALM-UPEC',    'PROV-001',   'ALM-UPEC',    'M. Chalán',   'Compra trimestral',                   '2026-09-23T09:00:00', 0.80991, -77.71238, 6,   'GPS_NAVEGADOR'],
        [4, 'DESPACHO',              10, 50, 40, 'ALM-UPEC',    'ALM-UPEC',   'CLI-002',     'J. Pozo',     'Lectura GPS en interior del edificio','2026-09-26T16:45:00', 0.81020, -77.71300, 600, 'GPS_NAVEGADOR'],
        [5, 'MOVIMIENTO INTERNO',     0,  8,  8, 'LAB-001',     'ALM-UPEC',   'LAB-001',     'D. Ruano',    'Traslado a laboratorio',              '2026-09-24T11:20:00', 0.80979, -77.71255, 13,  'GPS_NAVEGADOR'],
        [5, 'DESPACHO',              2,   8,  6, 'LAB-001',     'LAB-001',    'LAB-001',     'D. Ruano',    'Consumo en ensayo de calidad',        '2026-09-27T10:05:00', 0.80973, -77.71263, 15,  'GPS_NAVEGADOR'],
        [6, 'DESPACHO',              8,  24, 16, 'CD-001',      'CD-001',     'CLI-001',     'J. Pozo',     'Pedido SUP-4418',                     '2026-09-25T08:50:00', 0.81236, -77.71779, 8,   'GPS_NAVEGADOR'],
        [6, 'DEVOLUCIÓN',            2,  16, 18, 'CD-001',      'CLI-001',    'CD-001',      'A. Cuasapaz', 'Envases con sello dañado',            '2026-09-28T09:15:00', 0.81231, -77.71784, 10,  'GPS_NAVEGADOR'],
        [7, 'UBICACIÓN',             0,   9,  9, 'PAT-001',     'CD-001',     'PAT-001',     'L. Erazo',    'Estibado en patio',                   '2026-09-22T16:00:00', 0.81195, -77.71875, 12,  'GPS_NAVEGADOR'],
        [7, 'INCIDENCIA',            0,   9,  9, 'PAT-001',     'PAT-001',    'PAT-001',     'L. Erazo',    'Unidad hallada fuera del perímetro',  '2026-09-28T17:20:00', 0.82100, -77.72550, 12,  'GPS_NAVEGADOR'],
        [8, 'DESPACHO',              5,  60, 55, 'ALM-UPEC',    'ALM-UPEC',   'CLI-001',     'J. Pozo',     'GPS no disponible en bodega',         '2026-09-24T14:10:00', '',      '',        '',  'SIN_GPS'],
        [8, 'ENTREGA',               0,  55, 55, 'CLI-001',     'ALM-UPEC',   'CLI-001',     'J. Pozo',     'Recibido por el cliente',             '2026-09-25T17:30:00', '',      '',        '',  'SIN_GPS'],
        [9, 'PREPARACIÓN DE PEDIDO', 0,   4,  4, 'CD-001-RA01', 'CD-001-RA01','CD-001-RA01', 'A. Cuasapaz', 'Picking preparado',                   '2026-09-27T08:05:00', '',      '',        '',  'SIN_GPS'],
        [9, 'UBICACIÓN',             0,   4,  4, 'CD-001-RA01', 'CD-001-RA01','CD-001-RA01', 'A. Cuasapaz', 'Reubicación en rack',                 '2026-09-28T08:40:00', '',      '',        '',  'SIN_GPS']
      ];

      return raw.map(function (r, i) {
        var product = products[r[0]];
        return {
          ID_EVENTO: 'EVT-DEMO-' + U.pad(i + 1, 3),
          CLIENT_REQUEST_ID: 'seed-' + U.pad(i + 1, 3),
          FECHA_HORA: r[10],
          ID_PRODUCTO: byIndex(r[0]),
          TIPO_IDENTIFICACION: product.TIPO_CODIGO_1D === 'EAN13' ? 'EAN13' : 'CODE128',
          CODIGO_LEIDO: product.CODIGO_1D,
          EVENTO: r[1],
          CANTIDAD_MOVIMIENTO: r[2],
          STOCK_ANTES: r[3],
          STOCK_DESPUES: r[4],
          UBICACION: r[5],
          UBICACION_ORIGEN: r[6],
          UBICACION_DESTINO: r[7],
          ACTOR: r[8],
          OBSERVACION: r[9],
          ESTADO: 'REGISTRADO',
          ID_UBICACION_DECLARADA: r[5],
          LAT_CAPTURADA: r[11],
          LON_CAPTURADA: r[12],
          PRECISION_M: r[13],
          FUENTE_UBICACION: r[14],
          DISTANCIA_DECLARADA_M: '',
          VALIDACION_GEO: ''
        };
      });
    }

    function freshDb() {
      var locations = seedLocations();
      var products = seedProducts();
      var events = seedEvents(products);
      var db0 = { products: products, locations: locations, events: events, seeded: true, createdAt: U.nowIso() };
      // Recalcula distancia y validación con las mismas reglas del backend.
      db0.events.forEach(function (ev) {
        var geo = validateGeo(db0, ev.ID_UBICACION_DECLARADA, ev.LAT_CAPTURADA, ev.LON_CAPTURADA, ev.PRECISION_M);
        ev.DISTANCIA_DECLARADA_M = geo.distanceMeters === null ? '' : Math.round(geo.distanceMeters * 10) / 10;
        ev.VALIDACION_GEO = geo.status;
      });
      return db0;
    }

    function load() {
      if (db) return db;
      db = U.readJson(STORE_KEY, null);
      if (!db || !db.products) { db = freshDb(); save(); }
      return db;
    }

    function save() { U.writeJson(STORE_KEY, db); }

    function reset() { db = freshDb(); save(); return db; }

    function clearDemo() {
      db = { products: [], locations: [], events: [], seeded: false, createdAt: U.nowIso() };
      save();
      return db;
    }

    /* ---------- Resolución jerárquica de coordenadas ---------- */
    function findLocation(d, id) {
      if (!id) return null;
      var key = String(id).trim().toUpperCase();
      return d.locations.filter(function (l) { return String(l.ID_UBICACION).trim().toUpperCase() === key; })[0] || null;
    }

    function resolveLocationCoordinates(d, id) {
      var visited = {};
      var current = findLocation(d, id);
      var requested = current;
      var radius = null;
      while (current) {
        var key = String(current.ID_UBICACION).toUpperCase();
        if (visited[key]) break;               // protección contra ciclos
        visited[key] = true;
        if (radius === null) {
          var r = U.toNumber(current.RADIO_GEOCERCA_M, null);
          if (r !== null && r > 0) radius = r;
        }
        if (U.isValidLat(current.LAT) && U.isValidLon(current.LON)) {
          return {
            found: true,
            lat: U.toNumber(current.LAT),
            lon: U.toNumber(current.LON),
            radiusMeters: radius,
            effectiveLocationId: current.ID_UBICACION,
            effectiveLocationName: current.NOMBRE,
            inherited: !requested || current.ID_UBICACION !== requested.ID_UBICACION,
            requestedLocationId: requested ? requested.ID_UBICACION : id,
            requestedLocationName: requested ? requested.NOMBRE : ''
          };
        }
        current = findLocation(d, current.PADRE_ID);
      }
      return {
        found: false, lat: null, lon: null, radiusMeters: radius,
        effectiveLocationId: requested ? requested.ID_UBICACION : '',
        effectiveLocationName: requested ? requested.NOMBRE : '',
        inherited: false,
        requestedLocationId: requested ? requested.ID_UBICACION : id,
        requestedLocationName: requested ? requested.NOMBRE : ''
      };
    }

    /* ---------- Validación geográfica (misma regla que Code.gs) ---------- */
    function validateGeo(d, declaredId, lat, lon, accuracy) {
      var maxAcc = U.toNumber(U.cfg().MAX_ACCEPTABLE_ACCURACY_M, 100) || 100;
      var resolved = declaredId ? resolveLocationCoordinates(d, declaredId) : null;
      var out = {
        status: 'SIN_GPS',
        distanceMeters: null,
        geofenceRadiusMeters: resolved ? resolved.radiusMeters : null,
        accuracyMeters: U.toNumber(accuracy, null),
        declaredLocation: resolved ? (resolved.requestedLocationName || resolved.requestedLocationId) : '',
        effectiveLocation: resolved ? resolved.effectiveLocationName : '',
        inheritedCoordinates: !!(resolved && resolved.inherited)
      };
      if (!U.isValidLat(lat) || !U.isValidLon(lon)) return out;      // SIN_GPS
      if (out.accuracyMeters !== null && out.accuracyMeters > maxAcc) {
        out.status = 'BAJA_PRECISION';
        if (resolved && resolved.found) {
          out.distanceMeters = U.haversine(lat, lon, resolved.lat, resolved.lon);
        }
        return out;
      }
      if (!resolved || !resolved.found) { out.status = 'OK'; return out; }
      out.distanceMeters = U.haversine(lat, lon, resolved.lat, resolved.lon);
      var radius = resolved.radiusMeters;
      if (radius === null || radius <= 0) { out.status = 'OK'; return out; }
      out.status = out.distanceMeters <= radius ? 'OK' : 'FUERA_GEOCERCA';
      return out;
    }

    /* ---------- Consultas ---------- */
    function products() { return load().products.slice(); }
    function locations() { return load().locations.slice(); }
    function events() { return load().events.slice(); }

    function findProductById(id) {
      var key = String(id || '').trim().toUpperCase();
      return load().products.filter(function (p) { return String(p.ID_PRODUCTO).trim().toUpperCase() === key; })[0] || null;
    }

    function findProductByCode(code) {
      var key = String(code || '').trim().toUpperCase();
      if (!key) return null;
      var fields = ['ID_PRODUCTO', 'CODIGO_GENERADO', 'CODIGO_1D', 'CODIGO_QR', 'RFID_UID_EPC'];
      var found = null;
      load().products.some(function (p) {
        return fields.some(function (f) {
          if (String(p[f] || '').trim().toUpperCase() === key) { found = p; return true; }
          return false;
        });
      });
      return found;
    }

    function eventsOf(productId) {
      var key = String(productId || '').trim().toUpperCase();
      return load().events.filter(function (e) { return String(e.ID_PRODUCTO).trim().toUpperCase() === key; });
    }

    /* ---------- Escritura ---------- */
    function createProduct(data) {
      var d = load();
      if (findProductById(data.ID_PRODUCTO)) throw ApiError('Ya existe un producto con el ID ' + data.ID_PRODUCTO + '.', 'DUPLICATE_ID');
      ['CODIGO_1D', 'CODIGO_QR', 'RFID_UID_EPC'].forEach(function (f) {
        if (!data[f]) return;
        var dup = d.products.filter(function (p) { return String(p[f] || '').toUpperCase() === String(data[f]).toUpperCase(); })[0];
        if (dup) throw ApiError('El código ' + data[f] + ' ya está asignado a ' + dup.ID_PRODUCTO + '.', 'DUPLICATE_CODE');
      });
      var row = Object.assign({
        ESTADO: 'ACTIVO',
        FECHA_REGISTRO: U.nowIso(),
        ULTIMA_ACTUALIZACION: U.nowIso()
      }, data);
      row.CANTIDAD = U.toNumber(data.CANTIDAD, 0) || 0;
      d.products.push(row);
      save();
      return { product: row };
    }

    function updateProduct(data) {
      var d = load();
      var p = findProductById(data.ID_PRODUCTO);
      if (!p) throw ApiError('Producto inexistente: ' + data.ID_PRODUCTO, 'PRODUCT_NOT_FOUND');
      Object.keys(data).forEach(function (k) {
        if (k === 'ID_PRODUCTO' || k === 'CANTIDAD' || k === 'FECHA_REGISTRO') return;
        p[k] = data[k];
      });
      p.ULTIMA_ACTUALIZACION = U.nowIso();
      save();
      return { product: p };
    }

    function createLocation(data) {
      var d = load();
      if (findLocation(d, data.ID_UBICACION)) throw ApiError('Ya existe la ubicación ' + data.ID_UBICACION + '.', 'DUPLICATE_ID');
      assertNoCycle(d, data.ID_UBICACION, data.PADRE_ID);
      var row = Object.assign({ ACTIVO: 'SI' }, data);
      d.locations.push(row);
      save();
      return { location: row };
    }

    function updateLocation(data) {
      var d = load();
      var loc = findLocation(d, data.ID_UBICACION);
      if (!loc) throw ApiError('Ubicación inexistente: ' + data.ID_UBICACION, 'LOCATION_NOT_FOUND');
      assertNoCycle(d, data.ID_UBICACION, data.PADRE_ID);
      Object.keys(data).forEach(function (k) { if (k !== 'ID_UBICACION') loc[k] = data[k]; });
      save();
      return { location: loc };
    }

    function assertNoCycle(d, id, parentId) {
      if (!parentId) return;
      if (String(parentId).toUpperCase() === String(id).toUpperCase()) {
        throw ApiError('Una ubicación no puede ser su propio padre.', 'CIRCULAR_PARENT');
      }
      var guard = 0;
      var current = findLocation(d, parentId);
      while (current && guard++ < 50) {
        if (String(current.ID_UBICACION).toUpperCase() === String(id).toUpperCase()) {
          throw ApiError('La jerarquía de ubicaciones formaría un ciclo.', 'CIRCULAR_PARENT');
        }
        current = findLocation(d, current.PADRE_ID);
      }
    }

    /* ---------- Transacción de evento (orden idéntico al backend) ---------- */
    function createEvent(data) {
      var d = load();

      // 1. Localizar producto
      var product = findProductById(data.ID_PRODUCTO) || findProductByCode(data.CODIGO_LEIDO);
      if (!product) throw ApiError('Producto inexistente para el código indicado.', 'PRODUCT_NOT_FOUND');

      // Idempotencia por CLIENT_REQUEST_ID
      if (data.CLIENT_REQUEST_ID) {
        var prev = d.events.filter(function (e) { return e.CLIENT_REQUEST_ID === data.CLIENT_REQUEST_ID; })[0];
        if (prev) return { event: prev, product: product, geoValidation: { status: prev.VALIDACION_GEO }, duplicated: true };
      }

      // 2. Validar evento
      var evDef = U.eventByAny(data.EVENTO);
      if (!evDef) throw ApiError('Tipo de evento no reconocido: ' + data.EVENTO, 'INVALID_EVENT');
      if (!String(data.ACTOR || '').trim()) throw ApiError('El actor es obligatorio.', 'MISSING_ACTOR');

      // 3. Leer stock
      var before = U.toNumber(product.CANTIDAD, 0) || 0;

      // 4. Validar cantidad
      var qty = U.toNumber(data.CANTIDAD_MOVIMIENTO, 0) || 0;
      if (evDef.qty) {
        if (qty <= 0) throw ApiError('El evento ' + evDef.label + ' requiere una cantidad mayor que cero.', 'INVALID_QUANTITY');
      } else {
        qty = evDef.stock === 0 ? (qty || 0) : qty;
      }

      // 5. Calcular stock
      var after = before;
      if (evDef.stock === 1) after = before + qty;
      else if (evDef.stock === -1) {
        if (qty > before) {
          throw ApiError('Stock insuficiente: disponible ' + before + ', solicitado ' + qty + '.', 'INSUFFICIENT_STOCK');
        }
        after = before - qty;
      }
      if (after < 0) throw ApiError('La operación produciría stock negativo.', 'NEGATIVE_STOCK');

      // 6-7. Geolocalización y geocerca
      var geo = validateGeo(d, data.ID_UBICACION_DECLARADA, data.LAT_CAPTURADA, data.LON_CAPTURADA, data.PRECISION_M);

      // 8. Crear evento
      var ev = {
        ID_EVENTO: U.uuid(),
        CLIENT_REQUEST_ID: data.CLIENT_REQUEST_ID || U.uuid(),
        FECHA_HORA: U.nowIso(),
        ID_PRODUCTO: product.ID_PRODUCTO,
        TIPO_IDENTIFICACION: data.TIPO_IDENTIFICACION || '',
        CODIGO_LEIDO: data.CODIGO_LEIDO || '',
        EVENTO: evDef.label,
        CANTIDAD_MOVIMIENTO: evDef.stock === 0 ? (qty || 0) : qty,
        STOCK_ANTES: before,
        STOCK_DESPUES: after,
        UBICACION: data.UBICACION || data.ID_UBICACION_DECLARADA || product.UBICACION_ACTUAL || '',
        UBICACION_ORIGEN: data.UBICACION_ORIGEN || '',
        UBICACION_DESTINO: data.UBICACION_DESTINO || '',
        ACTOR: String(data.ACTOR).trim(),
        OBSERVACION: data.OBSERVACION || '',
        ESTADO: 'REGISTRADO',
        ID_UBICACION_DECLARADA: data.ID_UBICACION_DECLARADA || '',
        LAT_CAPTURADA: U.isValidLat(data.LAT_CAPTURADA) ? U.toNumber(data.LAT_CAPTURADA) : '',
        LON_CAPTURADA: U.isValidLon(data.LON_CAPTURADA) ? U.toNumber(data.LON_CAPTURADA) : '',
        PRECISION_M: U.toNumber(data.PRECISION_M, null) === null ? '' : U.toNumber(data.PRECISION_M),
        FUENTE_UBICACION: data.FUENTE_UBICACION || (geo.status === 'SIN_GPS' ? 'SIN_GPS' : 'GPS_NAVEGADOR'),
        DISTANCIA_DECLARADA_M: geo.distanceMeters === null ? '' : Math.round(geo.distanceMeters * 10) / 10,
        VALIDACION_GEO: geo.status
      };
      d.events.push(ev);

      // 9. Actualizar producto
      product.CANTIDAD = after;
      if (evDef.stock !== 0 || ['UBICACION', 'MOVIMIENTO_INTERNO', 'INGRESO_ALMACEN'].indexOf(evDef.code) !== -1) {
        if (ev.UBICACION_DESTINO) product.UBICACION_ACTUAL = ev.UBICACION_DESTINO;
      }
      product.ULTIMA_ACTUALIZACION = U.nowIso();
      save();

      // 10. Respuesta
      return { event: ev, product: product, geoValidation: geo };
    }

    return {
      load: load, reset: reset, clearDemo: clearDemo, save: save,
      products: products, locations: locations, events: events,
      findProductById: findProductById, findProductByCode: findProductByCode, eventsOf: eventsOf,
      findLocation: function (id) { return findLocation(load(), id); },
      resolveLocationCoordinates: function (id) { return resolveLocationCoordinates(load(), id); },
      validateGeo: function (declaredId, lat, lon, acc) { return validateGeo(load(), declaredId, lat, lon, acc); },
      createProduct: createProduct, updateProduct: updateProduct,
      createLocation: createLocation, updateLocation: updateLocation,
      createEvent: createEvent
    };
  })();

  /* ============================================================
     AGREGADOS (se calculan en el cliente en modo local; en modo
     conectado los entrega Apps Script)
     ============================================================ */
  function buildInventory(products) {
    var threshold = U.toNumber(U.cfg().LOW_STOCK_THRESHOLD, 5) || 0;
    var units = U.sum(products, function (p) { return p.CANTIDAD; });
    var low = products.filter(function (p) { var q = U.toNumber(p.CANTIDAD, 0) || 0; return q > 0 && q <= threshold; });
    var out = products.filter(function (p) { return (U.toNumber(p.CANTIDAD, 0) || 0) <= 0; });
    var byCat = U.groupBy(products, function (p) { return p.CATEGORIA || 'Sin categoría'; });
    var categories = Object.keys(byCat).sort().map(function (name) {
      var list = byCat[name];
      var updates = list.map(function (p) { return U.parseDate(p.ULTIMA_ACTUALIZACION); }).filter(Boolean);
      return {
        categoria: name,
        productos: list.length,
        unidades: U.sum(list, function (p) { return p.CANTIDAD; }),
        ultimaActualizacion: updates.length ? new Date(Math.max.apply(null, updates)).toISOString() : ''
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

  function buildDashboard(products, events) {
    var inv = buildInventory(products);
    var today = events.filter(function (e) { return U.sameDay(e.FECHA_HORA, new Date()); });
    var count = function (code) {
      return events.filter(function (e) { var d = U.eventByAny(e.EVENTO); return d && d.code === code; }).length;
    };
    var geoEvents = events.filter(function (e) { return U.isValidLat(e.LAT_CAPTURADA) && U.isValidLon(e.LON_CAPTURADA); });
    var geoCount = function (status) {
      return events.filter(function (e) { return String(e.VALIDACION_GEO || 'SIN_GPS').toUpperCase() === status; }).length;
    };
    var techCount = function (kind) {
      return products.filter(function (p) {
        if (kind === 'CODE128') return p.TIPO_CODIGO_1D === 'CODE128' && p.CODIGO_1D;
        if (kind === 'EAN13') return p.TIPO_CODIGO_1D === 'EAN13' && p.CODIGO_1D;
        if (kind === 'QR') return !!p.CODIGO_QR;
        if (kind === 'RFID') return !!p.RFID_UID_EPC;
        return false;
      }).length;
    };

    var byLocation = {};
    events.forEach(function (e) {
      var st = String(e.VALIDACION_GEO || '').toUpperCase();
      if (st !== 'FUERA_GEOCERCA' && st !== 'BAJA_PRECISION') return;
      var key = e.ID_UBICACION_DECLARADA || e.UBICACION || 'Sin declarar';
      byLocation[key] = (byLocation[key] || 0) + 1;
    });

    return {
      logistics: {
        productos: inv.totals.productos,
        unidades: inv.totals.unidades,
        categorias: inv.totals.categorias,
        stockBajo: inv.totals.stockBajo,
        agotados: inv.totals.agotados,
        eventos: events.length,
        eventosHoy: today.length,
        recepciones: count('RECEPCION'),
        despachos: count('DESPACHO'),
        devoluciones: count('DEVOLUCION'),
        incidencias: count('INCIDENCIA')
      },
      geo: {
        georreferenciados: geoEvents.length,
        ok: geoCount('OK'),
        fueraGeocerca: geoCount('FUERA_GEOCERCA'),
        bajaPrecision: geoCount('BAJA_PRECISION'),
        sinGps: geoCount('SIN_GPS'),
        pctOk: U.pct(geoCount('OK'), events.length),
        pctFuera: U.pct(geoCount('FUERA_GEOCERCA'), events.length),
        pctBaja: U.pct(geoCount('BAJA_PRECISION'), events.length),
        pctSinGps: U.pct(geoCount('SIN_GPS'), events.length)
      },
      charts: {
        inventoryByCategory: inv.categories.map(function (c) { return { label: c.categoria, productos: c.productos, unidades: c.unidades }; }),
        technologies: [
          { label: 'Code 128', value: techCount('CODE128') },
          { label: 'EAN-13', value: techCount('EAN13') },
          { label: 'QR', value: techCount('QR') },
          { label: 'RFID simulado', value: techCount('RFID') }
        ],
        eventsByType: CAT.EVENTS.map(function (e) { return { label: e.label, value: count(e.code) }; }).filter(function (x) { return x.value > 0; }),
        geoValidation: [
          { label: 'OK', value: geoCount('OK') },
          { label: 'Fuera de geocerca', value: geoCount('FUERA_GEOCERCA') },
          { label: 'Baja precisión', value: geoCount('BAJA_PRECISION') },
          { label: 'Sin GPS', value: geoCount('SIN_GPS') }
        ],
        exceptionsByLocation: Object.keys(byLocation).map(function (k) { return { label: k, value: byLocation[k] }; })
          .sort(function (a, b) { return b.value - a.value; }).slice(0, 8),
        recentActivity: buildRecentActivity(events)
      },
      inventory: inv
    };
  }

  function buildRecentActivity(events) {
    var days = [];
    for (var i = 6; i >= 0; i--) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      days.push({
        label: U.pad(d.getDate(), 2) + '/' + U.pad(d.getMonth() + 1, 2),
        date: d,
        value: 0
      });
    }
    events.forEach(function (e) {
      days.forEach(function (day) { if (U.sameDay(e.FECHA_HORA, day.date)) day.value++; });
    });
    return days.map(function (d) { return { label: d.label, value: d.value }; });
  }

  function buildTrace(product, events) {
    var ordered = U.sortBy(events, function (e) {
      var d = U.parseDate(e.FECHA_HORA);
      return d ? d.getTime() : 0;
    }, 'asc');
    var count = function (code) {
      return ordered.filter(function (e) { var d = U.eventByAny(e.EVENTO); return d && d.code === code; });
    };
    var received = count('RECEPCION'), dispatched = count('DESPACHO'), returned = count('DEVOLUCION');
    var geoEvents = ordered.filter(function (e) { return U.isValidLat(e.LAT_CAPTURADA) && U.isValidLon(e.LON_CAPTURADA); });
    var geoStatus = function (s) { return ordered.filter(function (e) { return String(e.VALIDACION_GEO || 'SIN_GPS').toUpperCase() === s; }).length; };

    var pathMeters = 0;
    for (var i = 1; i < geoEvents.length; i++) {
      var d0 = U.haversine(geoEvents[i - 1].LAT_CAPTURADA, geoEvents[i - 1].LON_CAPTURADA,
                           geoEvents[i].LAT_CAPTURADA, geoEvents[i].LON_CAPTURADA);
      if (d0 !== null) pathMeters += d0;
    }

    return {
      product: product,
      events: ordered,
      summary: {
        eventos: ordered.length,
        unidadesRecibidas: U.sum(received, function (e) { return e.CANTIDAD_MOVIMIENTO; }),
        unidadesDespachadas: U.sum(dispatched, function (e) { return e.CANTIDAD_MOVIMIENTO; }),
        devoluciones: U.sum(returned, function (e) { return e.CANTIDAD_MOVIMIENTO; }),
        incidencias: count('INCIDENCIA').length
      },
      geoSummary: {
        georreferenciados: geoEvents.length,
        ok: geoStatus('OK'),
        fueraGeocerca: geoStatus('FUERA_GEOCERCA'),
        bajaPrecision: geoStatus('BAJA_PRECISION'),
        sinGps: geoStatus('SIN_GPS'),
        distanciaGeodesicaM: Math.round(pathMeters)
      },
      trajectory: geoEvents
    };
  }

  /* ============================================================
     FACHADA PÚBLICA
     ============================================================ */
  var cache = { products: null, locations: null, events: null };

  function invalidate(keys) {
    (keys || ['products', 'locations', 'events']).forEach(function (k) { cache[k] = null; });
  }

  function useLocal() {
    var c = U.cfg();
    return !U.backendConfigured() || c.DEMO_MODE === true;
  }

  function init() {
    if (useLocal()) {
      Local.load();
      setMode('local');
      state.health = {
        status: 'LOCAL',
        spreadsheetId: '(no configurado)',
        spreadsheetName: 'Almacenamiento local del navegador',
        timezone: U.cfg().TIMEZONE
      };
      touchSync();
      return Promise.resolve(getState());
    }
    return httpGet('health').then(function (res) {
      state.health = res.data || {};
      setMode('online');
      touchSync();
      return getState();
    }).catch(function (err) {
      state.health = null;
      setMode('error', err.message);
      throw err;
    });
  }

  function health() {
    if (useLocal()) return Promise.resolve(state.health);
    return httpGet('health').then(function (r) { state.health = r.data; setMode('online'); touchSync(); return r.data; });
  }

  /* ---------- Lecturas ---------- */
  function getProducts(force) {
    if (cache.products && !force) return Promise.resolve(cache.products);
    var p = useLocal()
      ? Promise.resolve(Local.products())
      : httpGet('products').then(function (r) { touchSync(); return r.data.items || []; });
    return p.then(function (items) { cache.products = items; return items; });
  }

  function getLocations(force) {
    if (cache.locations && !force) return Promise.resolve(cache.locations);
    var p = useLocal()
      ? Promise.resolve(Local.locations())
      : httpGet('locations').then(function (r) { touchSync(); return r.data.items || []; });
    return p.then(function (items) { cache.locations = items; return items; });
  }

  function getEvents(productId, force) {
    if (productId) {
      return useLocal()
        ? Promise.resolve(Local.eventsOf(productId))
        : httpGet('events', { productId: productId }).then(function (r) { touchSync(); return r.data.items || []; });
    }
    if (cache.events && !force) return Promise.resolve(cache.events);
    var p = useLocal()
      ? Promise.resolve(Local.events())
      : httpGet('events').then(function (r) { touchSync(); return r.data.items || []; });
    return p.then(function (items) { cache.events = items; return items; });
  }

  function getProduct(id) {
    if (useLocal()) {
      var p = Local.findProductById(id);
      if (!p) return Promise.reject(ApiError('Producto inexistente: ' + id, 'PRODUCT_NOT_FOUND'));
      return Promise.resolve(p);
    }
    return httpGet('product', { id: id }).then(function (r) { return r.data.product; });
  }

  function findProductByCode(code) {
    if (useLocal()) {
      var p = Local.findProductByCode(code);
      return Promise.resolve(p ? { product: p, events: Local.eventsOf(p.ID_PRODUCTO) } : { product: null, events: [] });
    }
    return httpGet('findProductByCode', { code: code }).then(function (r) {
      touchSync();
      return { product: r.data.product || null, events: r.data.events || [] };
    });
  }

  function getInventory() {
    if (useLocal()) return Promise.resolve(buildInventory(Local.products()));
    return httpGet('inventory').then(function (r) { touchSync(); return r.data; });
  }

  function getDashboard() {
    if (useLocal()) return Promise.resolve(buildDashboard(Local.products(), Local.events()));
    return httpGet('dashboard').then(function (r) { touchSync(); return r.data; });
  }

  function getTrace(productId) {
    if (useLocal()) {
      var p = Local.findProductById(productId);
      if (!p) return Promise.reject(ApiError('Producto inexistente: ' + productId, 'PRODUCT_NOT_FOUND'));
      return Promise.resolve(buildTrace(p, Local.eventsOf(productId)));
    }
    return httpGet('trace', { productId: productId }).then(function (r) { touchSync(); return r.data; });
  }

  function getLocation(id) {
    if (useLocal()) {
      var l = Local.findLocation(id);
      if (!l) return Promise.reject(ApiError('Ubicación inexistente: ' + id, 'LOCATION_NOT_FOUND'));
      return Promise.resolve(l);
    }
    return httpGet('location', { id: id }).then(function (r) { return r.data.location; });
  }

  function getGeoEvents(filters) {
    if (useLocal()) {
      return Promise.resolve(Local.events().filter(function (e) { return applyGeoFilters(e, filters); }));
    }
    return httpGet('geoEvents', filters || {}).then(function (r) {
      touchSync();
      return (r.data.items || []).filter(function (e) { return applyGeoFilters(e, filters); });
    });
  }

  function applyGeoFilters(ev, filters) {
    var f = filters || {};
    if (f.productId && String(ev.ID_PRODUCTO).toUpperCase() !== String(f.productId).toUpperCase()) return false;
    if (f.event) {
      var def = U.eventByAny(ev.EVENTO), want = U.eventByAny(f.event);
      if (!def || !want || def.code !== want.code) return false;
    }
    if (f.geoStatus && String(ev.VALIDACION_GEO || 'SIN_GPS').toUpperCase() !== String(f.geoStatus).toUpperCase()) return false;
    if (f.locationId) {
      var loc = String(f.locationId).toUpperCase();
      var match = [ev.ID_UBICACION_DECLARADA, ev.UBICACION, ev.UBICACION_ORIGEN, ev.UBICACION_DESTINO]
        .some(function (v) { return String(v || '').toUpperCase() === loc; });
      if (!match) return false;
    }
    if (f.dateFrom) {
      var from = U.parseDate(f.dateFrom + 'T00:00:00'), d1 = U.parseDate(ev.FECHA_HORA);
      if (from && d1 && d1 < from) return false;
    }
    if (f.dateTo) {
      var to = U.parseDate(f.dateTo + 'T23:59:59'), d2 = U.parseDate(ev.FECHA_HORA);
      if (to && d2 && d2 > to) return false;
    }
    return true;
  }

  /* ---------- Escrituras ---------- */
  function createProduct(data) {
    var op = useLocal()
      ? Promise.resolve().then(function () { return Local.createProduct(data); })
      : httpPost('createProduct', data).then(function (r) { touchSync(); return r.data; });
    return op.then(function (res) { invalidate(['products']); return res; });
  }

  function updateProduct(data) {
    var op = useLocal()
      ? Promise.resolve().then(function () { return Local.updateProduct(data); })
      : httpPost('updateProduct', data).then(function (r) { touchSync(); return r.data; });
    return op.then(function (res) { invalidate(['products']); return res; });
  }

  function createEvent(data) {
    var op = useLocal()
      ? Promise.resolve().then(function () { return Local.createEvent(data); })
      : httpPost('createEvent', data).then(function (r) { touchSync(); return r.data; });
    return op.then(function (res) { invalidate(['products', 'events']); return res; });
  }

  function createLocation(data) {
    var op = useLocal()
      ? Promise.resolve().then(function () { return Local.createLocation(data); })
      : httpPost('createLocation', data).then(function (r) { touchSync(); return r.data; });
    return op.then(function (res) { invalidate(['locations']); return res; });
  }

  function updateLocation(data) {
    var op = useLocal()
      ? Promise.resolve().then(function () { return Local.updateLocation(data); })
      : httpPost('updateLocation', data).then(function (r) { touchSync(); return r.data; });
    return op.then(function (res) { invalidate(['locations']); return res; });
  }

  /* ---------- Resolución de coordenadas (vista previa cliente) ---------- */
  function resolveLocationCoordinates(locationId) {
    if (useLocal()) return Promise.resolve(Local.resolveLocationCoordinates(locationId));
    return getLocations().then(function (list) {
      // Reutiliza la misma lógica jerárquica sobre los datos ya cargados.
      var byId = {};
      list.forEach(function (l) { byId[String(l.ID_UBICACION).toUpperCase()] = l; });
      var visited = {}, radius = null;
      var requested = byId[String(locationId || '').toUpperCase()] || null;
      var current = requested;
      while (current) {
        var key = String(current.ID_UBICACION).toUpperCase();
        if (visited[key]) break;
        visited[key] = true;
        if (radius === null) {
          var r = U.toNumber(current.RADIO_GEOCERCA_M, null);
          if (r !== null && r > 0) radius = r;
        }
        if (U.isValidLat(current.LAT) && U.isValidLon(current.LON)) {
          return {
            found: true, lat: U.toNumber(current.LAT), lon: U.toNumber(current.LON),
            radiusMeters: radius, effectiveLocationId: current.ID_UBICACION,
            effectiveLocationName: current.NOMBRE,
            inherited: current.ID_UBICACION !== (requested && requested.ID_UBICACION),
            requestedLocationId: requested ? requested.ID_UBICACION : locationId,
            requestedLocationName: requested ? requested.NOMBRE : ''
          };
        }
        current = byId[String(current.PADRE_ID || '').toUpperCase()] || null;
      }
      return {
        found: false, lat: null, lon: null, radiusMeters: radius,
        effectiveLocationId: '', effectiveLocationName: '', inherited: false,
        requestedLocationId: requested ? requested.ID_UBICACION : locationId,
        requestedLocationName: requested ? requested.NOMBRE : ''
      };
    });
  }

  /** Vista previa de validación geográfica. El servidor decide al guardar. */
  function previewGeoValidation(declaredId, lat, lon, accuracy) {
    var maxAcc = U.toNumber(U.cfg().MAX_ACCEPTABLE_ACCURACY_M, 100) || 100;
    return resolveLocationCoordinates(declaredId).then(function (res) {
      var out = {
        status: 'SIN_GPS', distanceMeters: null,
        geofenceRadiusMeters: res ? res.radiusMeters : null,
        accuracyMeters: U.toNumber(accuracy, null),
        declaredLocation: res ? (res.requestedLocationName || res.requestedLocationId) : '',
        effectiveLocation: res ? res.effectiveLocationName : '',
        inheritedCoordinates: !!(res && res.inherited),
        preview: true
      };
      if (!U.isValidLat(lat) || !U.isValidLon(lon)) return out;
      if (out.accuracyMeters !== null && out.accuracyMeters > maxAcc) {
        out.status = 'BAJA_PRECISION';
        if (res && res.found) out.distanceMeters = U.haversine(lat, lon, res.lat, res.lon);
        return out;
      }
      if (!res || !res.found) { out.status = 'OK'; return out; }
      out.distanceMeters = U.haversine(lat, lon, res.lat, res.lon);
      if (out.geofenceRadiusMeters === null || out.geofenceRadiusMeters <= 0) { out.status = 'OK'; return out; }
      out.status = out.distanceMeters <= out.geofenceRadiusMeters ? 'OK' : 'FUERA_GEOCERCA';
      return out;
    });
  }

  /* ---------- GeoJSON del backend (cuando está disponible) ---------- */
  function backendGeoJSON(kind) {
    if (useLocal()) return Promise.reject(ApiError('Modo local: el GeoJSON se genera en el navegador.', 'LOCAL_MODE'));
    return httpGet(kind === 'locations' ? 'locationsGeoJSON' : 'eventsGeoJSON').then(function (r) { return r.data; });
  }

  /* ---------- Utilidades de demostración ---------- */
  function resetDemoData() {
    if (!useLocal()) throw ApiError('Los datos de demostración sólo existen en modo local.', 'NOT_LOCAL');
    Local.reset(); invalidate(); return getState();
  }

  function clearDemoData() {
    if (!useLocal()) throw ApiError('Los datos de demostración sólo existen en modo local.', 'NOT_LOCAL');
    Local.clearDemo(); invalidate(); return getState();
  }

  function saveConfigOverride(values) {
    U.writeJson('lt.config.override', values || {});
  }

  function clearConfigOverride() { U.removeKey('lt.config.override'); }

  /* ---------- Conectividad del navegador ---------- */
  global.addEventListener('online', function () { state.online = true; emit(); });
  global.addEventListener('offline', function () { state.online = false; emit(); });

  LT.API = {
    init: init, health: health, getState: getState, onStateChange: onStateChange,
    useLocal: useLocal, invalidate: invalidate,

    getProducts: getProducts, getProduct: getProduct, findProductByCode: findProductByCode,
    getEvents: getEvents, getTrace: getTrace,
    getInventory: getInventory, getDashboard: getDashboard,
    getLocations: getLocations, getLocation: getLocation, getGeoEvents: getGeoEvents,

    createProduct: createProduct, updateProduct: updateProduct,
    createEvent: createEvent, createLocation: createLocation, updateLocation: updateLocation,

    resolveLocationCoordinates: resolveLocationCoordinates,
    previewGeoValidation: previewGeoValidation,
    backendGeoJSON: backendGeoJSON,

    buildInventory: buildInventory, buildDashboard: buildDashboard, buildTrace: buildTrace,

    resetDemoData: resetDemoData, clearDemoData: clearDemoData,
    saveConfigOverride: saveConfigOverride, clearConfigOverride: clearConfigOverride
  };
})(window);
