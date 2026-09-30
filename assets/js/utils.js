/* ============================================================
   LogiTrace — utils.js
   Utilidades puras y catálogos compartidos. Sin dependencias.
   Expone: window.LT.U  y  window.LT.CAT
   ============================================================ */
(function (global) {
  'use strict';

  var LT = global.LT = global.LT || {};

  /* ---------- Configuración efectiva ---------- */
  var DEFAULTS = {
    APPS_SCRIPT_URL: '',
    SPREADSHEET_ID: '',
    TIMEZONE: 'America/Guayaquil',
    LOW_STOCK_THRESHOLD: 5,
    MAX_ACCEPTABLE_ACCURACY_M: 100,
    DEMO_MODE: false
  };

  var PLACEHOLDERS = ['PEGAR_AQUI_URL_WEB_APP', 'PEGAR_AQUI_SPREADSHEET_ID', ''];

  function cfg() {
    var raw = global.LOGITRACE_CONFIG || {};
    var out = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      out[k] = (raw[k] === undefined || raw[k] === null) ? DEFAULTS[k] : raw[k];
    });
    // Overrides locales guardados por el usuario desde la vista Configuración.
    var over = readJson('lt.config.override', null);
    if (over) {
      Object.keys(over).forEach(function (k) {
        if (over[k] !== undefined && over[k] !== null && over[k] !== '') out[k] = over[k];
      });
    }
    return out;
  }

  function backendConfigured() {
    var url = String(cfg().APPS_SCRIPT_URL || '').trim();
    return PLACEHOLDERS.indexOf(url) === -1 && /^https:\/\//i.test(url);
  }

  /* ---------- DOM ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function el(tag, attrs, html) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'dataset') Object.keys(attrs[k]).forEach(function (d) { node.dataset[d] = attrs[k][d]; });
      else node.setAttribute(k, attrs[k]);
    });
    if (html !== undefined) node.innerHTML = html;
    return node;
  }

  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }

  /* ---------- Seguridad de salida ---------- */
  function esc(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ---------- Identificadores ---------- */
  function uuid() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return global.crypto.randomUUID();
    }
    if (global.crypto && global.crypto.getRandomValues) {
      var b = new Uint8Array(16);
      global.crypto.getRandomValues(b);
      b[6] = (b[6] & 0x0f) | 0x40;
      b[8] = (b[8] & 0x3f) | 0x80;
      var hex = [];
      for (var i = 0; i < 16; i++) hex.push(('0' + b[i].toString(16)).slice(-2));
      return hex.slice(0, 4).join('') + '-' + hex.slice(4, 6).join('') + '-' +
             hex.slice(6, 8).join('') + '-' + hex.slice(8, 10).join('') + '-' + hex.slice(10, 16).join('');
    }
    // Último recurso: aleatorio + tiempo (nunca sólo Date.now()).
    var r = function () { return Math.floor(Math.random() * 0x10000).toString(16); };
    return [r() + r(), r(), '4' + r().slice(1), r(), r() + r() + Date.now().toString(16).slice(-6)].join('-');
  }

  function pad(n, size) {
    var s = String(Math.abs(Math.floor(Number(n) || 0)));
    while (s.length < (size || 3)) s = '0' + s;
    return s;
  }

  /** Sanea un fragmento para que sea seguro en Code 128 y legible. */
  function codeToken(value, fallback) {
    var s = String(value === undefined || value === null ? '' : value).toUpperCase();
    if (s.normalize) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    s = s.replace(/[^A-Z0-9]/g, '');
    return s || (fallback || '');
  }

  /* ---------- Números ---------- */
  function toNumber(value, fallback) {
    if (value === '' || value === null || value === undefined) return (fallback === undefined ? null : fallback);
    var n = Number(String(value).replace(',', '.'));
    return isFinite(n) ? n : (fallback === undefined ? null : fallback);
  }

  function intOr(value, fallback) {
    var n = toNumber(value, null);
    if (n === null) return fallback;
    return Math.round(n);
  }

  function fmtNum(value, decimals) {
    var n = toNumber(value, null);
    if (n === null) return '—';
    var d = decimals === undefined ? 0 : decimals;
    return n.toLocaleString('es-EC', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function fmtMeters(value) {
    var n = toNumber(value, null);
    if (n === null) return '—';
    if (n >= 1000) return fmtNum(n / 1000, 2) + ' km';
    return fmtNum(n, n < 10 ? 1 : 0) + ' m';
  }

  function pct(part, total) {
    var p = toNumber(part, 0), t = toNumber(total, 0);
    if (!t) return 0;
    return Math.round((p / t) * 1000) / 10;
  }

  /* ---------- Fechas ---------- */
  function parseDate(value) {
    if (!value) return null;
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
    var s = String(value).trim();
    // Sólo fecha (YYYY-MM-DD): se interpreta en hora LOCAL.
    // new Date('2026-11-20') la tomaría como UTC y restaría un día en América.
    var only = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (only) return new Date(Number(only[1]), Number(only[2]) - 1, Number(only[3]));
    // ISO con hora
    var d = new Date(s);
    if (!isNaN(d.getTime())) return d;
    // DD/MM/YYYY HH:mm:ss
    var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (m) {
      return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]),
        Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0));
    }
    return null;
  }

  function fmtDate(value) {
    var d = parseDate(value);
    if (!d) return '—';
    return pad(d.getDate(), 2) + '/' + pad(d.getMonth() + 1, 2) + '/' + d.getFullYear() + ' ' +
           pad(d.getHours(), 2) + ':' + pad(d.getMinutes(), 2) + ':' + pad(d.getSeconds(), 2);
  }

  function fmtDateOnly(value) {
    var d = parseDate(value);
    if (!d) return '—';
    return pad(d.getDate(), 2) + '/' + pad(d.getMonth() + 1, 2) + '/' + d.getFullYear();
  }

  function isoDateInput(value) {
    var d = parseDate(value);
    if (!d) return '';
    return d.getFullYear() + '-' + pad(d.getMonth() + 1, 2) + '-' + pad(d.getDate(), 2);
  }

  /** Marca de tiempo local "yyyy-MM-ddTHH:mm:ss", el mismo formato que escribe Code.gs. */
  function nowIso() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1, 2) + '-' + pad(d.getDate(), 2) + 'T' +
           pad(d.getHours(), 2) + ':' + pad(d.getMinutes(), 2) + ':' + pad(d.getSeconds(), 2);
  }

  function daysUntil(value) {
    var d = parseDate(value);
    if (!d) return null;
    return Math.ceil((d.getTime() - Date.now()) / 86400000);
  }

  function relTime(value) {
    var d = parseDate(value);
    if (!d) return '—';
    var diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return 'hace instantes';
    if (diff < 3600) return 'hace ' + Math.floor(diff / 60) + ' min';
    if (diff < 86400) return 'hace ' + Math.floor(diff / 3600) + ' h';
    return fmtDateOnly(d);
  }

  function sameDay(a, b) {
    var x = parseDate(a), y = parseDate(b);
    if (!x || !y) return false;
    return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
  }

  /* ---------- Colecciones ---------- */
  function sortBy(arr, keyFn, dir) {
    var sign = dir === 'desc' ? -1 : 1;
    return arr.slice().sort(function (a, b) {
      var x = keyFn(a), y = keyFn(b);
      if (x === null || x === undefined) x = '';
      if (y === null || y === undefined) y = '';
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * sign;
      return String(x).localeCompare(String(y), 'es', { numeric: true }) * sign;
    });
  }

  function groupBy(arr, keyFn) {
    var out = {};
    arr.forEach(function (item) {
      var k = keyFn(item);
      (out[k] = out[k] || []).push(item);
    });
    return out;
  }

  function unique(arr) {
    var seen = {}, out = [];
    arr.forEach(function (v) {
      var k = String(v);
      if (v !== '' && v !== null && v !== undefined && !seen[k]) { seen[k] = 1; out.push(v); }
    });
    return out;
  }

  function sum(arr, fn) {
    return arr.reduce(function (acc, item) { return acc + (toNumber(fn ? fn(item) : item, 0) || 0); }, 0);
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms || 250);
    };
  }

  /** Normaliza para búsquedas: minúsculas y sin acentos. */
  function norm(value) {
    var s = String(value === null || value === undefined ? '' : value).toLowerCase();
    return s.normalize ? s.normalize('NFD').replace(/[̀-ͯ]/g, '') : s;
  }

  function includesText(haystack, needle) {
    if (!needle) return true;
    return norm(haystack).indexOf(norm(needle)) !== -1;
  }

  /* ---------- Geometría: Haversine (vista previa en cliente) ----------
     La validación DEFINITIVA se ejecuta siempre en Apps Script.
     Radio terrestre medio: 6 371 000 m.                                */
  var EARTH_RADIUS_M = 6371000;

  function haversine(lat1, lon1, lat2, lon2) {
    var a1 = toNumber(lat1, null), o1 = toNumber(lon1, null);
    var a2 = toNumber(lat2, null), o2 = toNumber(lon2, null);
    if (a1 === null || o1 === null || a2 === null || o2 === null) return null;
    var toRad = Math.PI / 180;
    var dLat = (a2 - a1) * toRad;
    var dLon = (o2 - o1) * toRad;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(a1 * toRad) * Math.cos(a2 * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  function isValidLat(v) { var n = toNumber(v, null); return n !== null && n >= -90 && n <= 90; }
  function isValidLon(v) { var n = toNumber(v, null); return n !== null && n >= -180 && n <= 180; }
  function hasCoords(obj) {
    if (!obj) return false;
    return isValidLat(obj.LAT_CAPTURADA !== undefined ? obj.LAT_CAPTURADA : obj.lat) &&
           isValidLon(obj.LON_CAPTURADA !== undefined ? obj.LON_CAPTURADA : obj.lon);
  }
  function fmtCoord(lat, lon) {
    if (!isValidLat(lat) || !isValidLon(lon)) return '—';
    return Number(lat).toFixed(6) + ', ' + Number(lon).toFixed(6);
  }

  /* ---------- EAN-13 ---------- */
  function ean13Checksum(first12) {
    var s = String(first12).replace(/\D/g, '');
    if (s.length !== 12) return null;
    var total = 0;
    for (var i = 0; i < 12; i++) {
      total += Number(s.charAt(i)) * (i % 2 === 0 ? 1 : 3);
    }
    return (10 - (total % 10)) % 10;
  }

  /** Acepta 12 (calcula) o 13 (valida) dígitos. */
  function ean13Resolve(input) {
    var s = String(input === null || input === undefined ? '' : input).replace(/\s|-/g, '');
    if (!/^\d+$/.test(s)) {
      return { ok: false, error: 'EAN-13 acepta únicamente dígitos numéricos.' };
    }
    if (s.length === 12) {
      var c = ean13Checksum(s);
      return { ok: true, code: s + c, computed: true, checkDigit: c };
    }
    if (s.length === 13) {
      var expected = ean13Checksum(s.slice(0, 12));
      if (String(expected) !== s.charAt(12)) {
        return { ok: false, error: 'Checksum inválido: el dígito 13 debería ser ' + expected + '.' };
      }
      return { ok: true, code: s, computed: false, checkDigit: expected };
    }
    return { ok: false, error: 'Longitud inválida: introduzca 12 dígitos (se calcula el 13.º) o 13 dígitos completos.' };
  }

  /* ---------- Descargas ---------- */
  function downloadBlob(filename, blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function downloadText(filename, text, mime) {
    downloadBlob(filename, new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' }));
  }

  function downloadJson(filename, obj) {
    downloadText(filename, JSON.stringify(obj, null, 2), 'application/geo+json');
  }

  /** Convierte un <canvas> o un <svg> en PNG y lo descarga. */
  function downloadNodeAsPng(node, filename, scale) {
    if (!node) return Promise.reject(new Error('Nada para exportar.'));
    var factor = scale || 3;
    if (node.tagName === 'CANVAS') {
      return Promise.resolve(node.toDataURL('image/png')).then(function (data) {
        var a = document.createElement('a');
        a.href = data; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      });
    }
    if (node.tagName && node.tagName.toLowerCase() === 'img') {
      var a2 = document.createElement('a');
      a2.href = node.src; a2.download = filename;
      document.body.appendChild(a2); a2.click(); document.body.removeChild(a2);
      return Promise.resolve();
    }
    if (node.tagName && node.tagName.toLowerCase() === 'svg') {
      var rect = node.getBoundingClientRect();
      var w = Math.max(1, Math.round(rect.width || node.viewBox.baseVal.width || 300));
      var h = Math.max(1, Math.round(rect.height || node.viewBox.baseVal.height || 120));
      var clone = node.cloneNode(true);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('width', w);
      clone.setAttribute('height', h);
      var svgText = new XMLSerializer().serializeToString(clone);
      var svgUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
      return new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () {
          var canvas = document.createElement('canvas');
          canvas.width = w * factor; canvas.height = h * factor;
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          var a3 = document.createElement('a');
          a3.href = canvas.toDataURL('image/png'); a3.download = filename;
          document.body.appendChild(a3); a3.click(); document.body.removeChild(a3);
          resolve();
        };
        img.onerror = function () { reject(new Error('No fue posible convertir la imagen.')); };
        img.src = svgUrl;
      });
    }
    // Contenedor: busca el primer hijo exportable.
    var inner = node.querySelector('canvas, svg, img');
    if (inner) return downloadNodeAsPng(inner, filename, factor);
    return Promise.reject(new Error('El elemento no contiene una imagen exportable.'));
  }

  function copyToClipboard(text) {
    if (global.navigator && navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', 'readonly');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        resolve();
      } catch (err) { reject(err); }
    });
  }

  /* ---------- Almacenamiento tolerante a fallos ---------- */
  function readJson(key, fallback) {
    try {
      var raw = global.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) { return fallback; }
  }

  function writeJson(key, value) {
    try { global.localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (err) { return false; }
  }

  function removeKey(key) {
    try { global.localStorage.removeItem(key); return true; } catch (err) { return false; }
  }

  /* ---------- Estado de stock ---------- */
  function stockState(quantity) {
    var q = toNumber(quantity, 0) || 0;
    var threshold = toNumber(cfg().LOW_STOCK_THRESHOLD, 5) || 0;
    if (q <= 0) return { key: 'AGOTADO', label: 'Agotado', kind: 'danger' };
    if (q <= threshold) return { key: 'STOCK_BAJO', label: 'Stock bajo', kind: 'warn' };
    return { key: 'DISPONIBLE', label: 'Disponible', kind: 'ok' };
  }

  /* ---------- Catálogos ---------- */
  var CAT = {
    /* Eventos logísticos. stock: efecto sobre inventario.
       +1 suma, -1 resta, 0 no modifica.                     */
    EVENTS: [
      { code: 'RECEPCION',           label: 'RECEPCIÓN',             stock: 1,  qty: true,  tl: 'in',    hint: 'Ingreso de mercadería al sistema.' },
      { code: 'INGRESO_ALMACEN',     label: 'INGRESO AL ALMACÉN',    stock: 0,  qty: false, tl: 'in',    hint: 'Confirmación física de ingreso. No modifica stock.' },
      { code: 'UBICACION',           label: 'UBICACIÓN',             stock: 0,  qty: false, tl: 'plain', hint: 'Asignación de posición. No modifica stock.' },
      { code: 'MOVIMIENTO_INTERNO',  label: 'MOVIMIENTO INTERNO',    stock: 0,  qty: false, tl: 'plain', hint: 'Traslado entre ubicaciones internas. No modifica stock.' },
      { code: 'PREPARACION_PEDIDO',  label: 'PREPARACIÓN DE PEDIDO', stock: 0,  qty: false, tl: 'plain', hint: 'Picking. No modifica stock.' },
      { code: 'DESPACHO',            label: 'DESPACHO',              stock: -1, qty: true,  tl: 'out',   hint: 'Salida de mercadería. Descuenta stock.' },
      { code: 'ENTREGA',             label: 'ENTREGA',               stock: 0,  qty: false, tl: 'out',   hint: 'Confirmación al cliente. No descuenta de nuevo.' },
      { code: 'DEVOLUCION',          label: 'DEVOLUCIÓN',            stock: 1,  qty: true,  tl: 'in',    hint: 'Retorno de mercadería. Suma stock.' },
      { code: 'INCIDENCIA',          label: 'INCIDENCIA',            stock: 0,  qty: false, tl: 'alert', hint: 'Anomalía registrada. No modifica inventario automáticamente.' }
    ],

    LOCATION_TYPES: [
      { code: 'PLANTA',               label: 'Planta',                   radius: 200 },
      { code: 'CENTRO_PRODUCCION',    label: 'Centro de producción',     radius: 200 },
      { code: 'CENTRO_DISTRIBUCION',  label: 'Centro de distribución',   radius: 150 },
      { code: 'PROVEEDOR',            label: 'Proveedor',                radius: 150 },
      { code: 'CLIENTE',              label: 'Cliente',                  radius: 100 },
      { code: 'ALMACEN',              label: 'Almacén',                  radius: 150 },
      { code: 'PATIO',                label: 'Patio',                    radius: 100 },
      { code: 'MUELLE',               label: 'Muelle',                   radius: 50  },
      { code: 'RACK',                 label: 'Rack',                     radius: 0   },
      { code: 'LABORATORIO',          label: 'Laboratorio',              radius: 50  },
      { code: 'OTRO',                 label: 'Otro',                     radius: 100 }
    ],

    GEO: {
      OK:             { label: 'Posición válida',   short: 'OK',              sym: '✓', kind: 'ok',     cls: 'ok'   },
      FUERA_GEOCERCA: { label: 'Fuera de geocerca', short: 'Fuera geocerca',  sym: '⚠', kind: 'danger', cls: 'out'  },
      BAJA_PRECISION: { label: 'Baja precisión',    short: 'Baja precisión',  sym: '◉', kind: 'warn',   cls: 'low'  },
      SIN_GPS:        { label: 'Sin GPS',           short: 'Sin GPS',         sym: '—', kind: 'default',cls: 'none' }
    },

    GEO_SOURCES: [
      { code: 'GPS_NAVEGADOR', label: 'GPS del navegador' },
      { code: 'MAPA_MANUAL',   label: 'Selección manual en mapa' },
      { code: 'SIN_GPS',       label: 'Sin posición' }
    ],

    ID_TYPES: [
      { code: 'CODE128', label: 'Código de barras Code 128' },
      { code: 'EAN13',   label: 'Código de barras EAN-13' },
      { code: 'QR',      label: 'Código QR' },
      { code: 'RFID',    label: 'RFID simulado' },
      { code: 'MIXTO',   label: 'Mixto (varias tecnologías)' }
    ],

    CATEGORIES: [
      'Tecnología', 'Alimentos', 'Bebidas', 'Farmacéutico', 'Textil',
      'Ferretería', 'Agrícola', 'Repuestos', 'Insumos de laboratorio', 'Otro'
    ]
  };

  function eventByAny(value) {
    var n = norm(value).replace(/[^a-z]/g, '');
    for (var i = 0; i < CAT.EVENTS.length; i++) {
      var e = CAT.EVENTS[i];
      if (norm(e.code).replace(/[^a-z]/g, '') === n || norm(e.label).replace(/[^a-z]/g, '') === n) return e;
    }
    return null;
  }

  function locationTypeByAny(value) {
    var n = norm(value).replace(/[^a-z]/g, '');
    for (var i = 0; i < CAT.LOCATION_TYPES.length; i++) {
      var t = CAT.LOCATION_TYPES[i];
      if (norm(t.code).replace(/[^a-z]/g, '') === n || norm(t.label).replace(/[^a-z]/g, '') === n) return t;
    }
    return null;
  }

  function geoInfo(status) {
    return CAT.GEO[String(status || 'SIN_GPS').toUpperCase()] || CAT.GEO.SIN_GPS;
  }

  /* ---------- Exportación ---------- */
  LT.CAT = CAT;
  LT.U = {
    cfg: cfg,
    backendConfigured: backendConfigured,
    $: $, $$: $$, el: el, clear: clear,
    esc: esc,
    uuid: uuid, pad: pad, codeToken: codeToken,
    toNumber: toNumber, intOr: intOr, fmtNum: fmtNum, fmtMeters: fmtMeters, pct: pct,
    parseDate: parseDate, fmtDate: fmtDate, fmtDateOnly: fmtDateOnly, isoDateInput: isoDateInput,
    nowIso: nowIso, daysUntil: daysUntil, relTime: relTime, sameDay: sameDay,
    sortBy: sortBy, groupBy: groupBy, unique: unique, sum: sum, debounce: debounce,
    norm: norm, includesText: includesText,
    EARTH_RADIUS_M: EARTH_RADIUS_M, haversine: haversine,
    isValidLat: isValidLat, isValidLon: isValidLon, hasCoords: hasCoords, fmtCoord: fmtCoord,
    ean13Checksum: ean13Checksum, ean13Resolve: ean13Resolve,
    downloadBlob: downloadBlob, downloadText: downloadText, downloadJson: downloadJson,
    downloadNodeAsPng: downloadNodeAsPng, copyToClipboard: copyToClipboard,
    readJson: readJson, writeJson: writeJson, removeKey: removeKey,
    stockState: stockState,
    eventByAny: eventByAny, locationTypeByAny: locationTypeByAny, geoInfo: geoInfo
  };
})(window);
