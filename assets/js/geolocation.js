/* ============================================================
   LogiTrace — geolocation.js
   Captura de posición del navegador, control de precisión y
   componente reutilizable de captura geográfica para eventos y
   para el maestro de ubicaciones.

   Regla firme: si el GPS falla NUNCA se interrumpe el flujo.
   Siempre queda la opción de seleccionar en el mapa o continuar
   con FUENTE_UBICACION = SIN_GPS.
   Expone: window.LT.Geo
   ============================================================ */
(function (global) {
  'use strict';

  var LT = global.LT = global.LT || {};
  var U = LT.U;
  var UI = LT.UI;

  var GEO_OPTIONS = {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 0
  };

  var HTTPS_NOTICE = 'Esta función requiere HTTPS o localhost. GitHub Pages cumple HTTPS.';

  function isSecureOk() {
    if (global.isSecureContext) return true;
    var h = location.hostname;
    return location.protocol === 'https:' || h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
  }

  function isSupported() {
    return !!(global.navigator && navigator.geolocation);
  }

  function reasonText(err) {
    if (!err) return 'Error desconocido de geolocalización.';
    switch (err.code) {
      case 1: return 'Permiso de ubicación denegado por el usuario o el navegador.';
      case 2: return 'Posición no disponible: el dispositivo no pudo determinar la ubicación.';
      case 3: return 'Tiempo de espera agotado al obtener la posición.';
      default: return err.message || 'Error de geolocalización.';
    }
  }

  /** Devuelve una promesa con la posición. Rechaza con un error legible. */
  function getCurrentPosition(options) {
    return new Promise(function (resolve, reject) {
      if (!isSupported()) {
        reject(new Error('El navegador no expone la API de geolocalización.'));
        return;
      }
      if (!isSecureOk()) {
        reject(new Error(HTTPS_NOTICE));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          resolve({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracy: pos.coords.accuracy === null || pos.coords.accuracy === undefined
              ? null : Math.round(pos.coords.accuracy * 10) / 10,
            altitude: pos.coords.altitude,
            source: 'GPS_NAVEGADOR',
            timestamp: new Date(pos.timestamp || Date.now()).toISOString()
          });
        },
        function (err) { reject(new Error(reasonText(err))); },
        Object.assign({}, GEO_OPTIONS, options || {})
      );
    });
  }

  function accuracyKind(accuracy) {
    var max = U.toNumber(U.cfg().MAX_ACCEPTABLE_ACCURACY_M, 100) || 100;
    var a = U.toNumber(accuracy, null);
    if (a === null) return 'none';
    if (a <= max / 3) return 'good';
    if (a <= max) return 'fair';
    return 'bad';
  }

  /** Barra de precisión: nunca comunica el estado sólo con color. */
  function accuracyHtml(accuracy) {
    var a = U.toNumber(accuracy, null);
    var max = U.toNumber(U.cfg().MAX_ACCEPTABLE_ACCURACY_M, 100) || 100;
    if (a === null) {
      return '<div class="txt-xs txt-muted">Precisión no disponible.</div>';
    }
    var kind = accuracyKind(a);
    var cls = kind === 'good' ? '' : kind === 'fair' ? ' accuracy-bar__fill--warn' : ' accuracy-bar__fill--bad';
    var width = Math.max(6, Math.min(100, Math.round((1 - Math.min(a, max * 2) / (max * 2)) * 100)));
    var label = kind === 'good' ? 'Precisión buena' : kind === 'fair' ? 'Precisión aceptable' : 'Precisión insuficiente';
    return '<div class="accuracy-bar"><div class="accuracy-bar__fill' + cls + '" style="width:' + width + '%"></div></div>' +
      '<div class="txt-xs txt-soft mt-2">' + U.esc(label) + ': ±' + U.fmtMeters(a) +
      ' · umbral configurado ' + U.fmtMeters(max) + '</div>' +
      (kind === 'bad' ? '<div class="txt-xs" style="color:var(--danger-600)">El servidor marcará este evento como BAJA_PRECISION. Se guardará igualmente.</div>' : '');
  }

  /** Aviso persistente de HTTPS donde se usan cámara o GPS. */
  function httpsBannerHtml() {
    if (isSecureOk()) return '';
    return '<div class="banner banner--warn mb-3"><div><div class="banner__title">Contexto no seguro</div>' +
      '<div class="txt-xs">' + U.esc(HTTPS_NOTICE) + '</div></div></div>';
  }

  /* ============================================================
     COMPONENTE DE CAPTURA GEOGRÁFICA
     create(container, { getDeclaredLocationId, compact, onChange })
     Estado devuelto por getValue():
       { lat, lon, accuracy, source }  · source ∈ GPS_NAVEGADOR|MAPA_MANUAL|SIN_GPS
     ============================================================ */
  function create(container, opts) {
    var o = opts || {};
    var value = { lat: null, lon: null, accuracy: null, source: 'SIN_GPS' };

    container.innerHTML =
      httpsBannerHtml() +
      '<div class="stack">' +
        '<div class="row">' +
          '<button class="btn btn--primary btn--sm" type="button" data-geo="current">Obtener posición actual</button>' +
          '<button class="btn btn--ghost btn--sm" type="button" data-geo="map">Seleccionar en mapa</button>' +
          '<button class="btn btn--subtle btn--sm" type="button" data-geo="clear">Sin GPS</button>' +
        '</div>' +
        '<div data-geo="readout" class="coord-picker__readout">Sin posición capturada · FUENTE_UBICACION = SIN_GPS</div>' +
        '<div data-geo="accuracy"></div>' +
        '<div data-geo="validation"></div>' +
        (o.compact ? '' : '<div data-geo="map-preview" class="hidden"><div class="map-canvas map-canvas--sm" data-geo="map-canvas"></div></div>') +
      '</div>';

    var readout = U.$('[data-geo="readout"]', container);
    var accBox = U.$('[data-geo="accuracy"]', container);
    var valBox = U.$('[data-geo="validation"]', container);
    var mapWrap = U.$('[data-geo="map-preview"]', container);
    var mapCanvas = U.$('[data-geo="map-canvas"]', container);
    var previewMap = null;

    function paint() {
      if (value.lat === null || value.lon === null) {
        readout.textContent = 'Sin posición capturada · FUENTE_UBICACION = SIN_GPS';
        accBox.innerHTML = '';
        valBox.innerHTML = '<div class="banner banner--warn txt-xs">' +
          'El evento se guardará con VALIDACION_GEO = SIN_GPS. No se inventan coordenadas.</div>';
        if (mapWrap) mapWrap.classList.add('hidden');
      } else {
        readout.textContent = U.fmtCoord(value.lat, value.lon) +
          ' · ±' + (value.accuracy === null ? 'n/d' : U.fmtMeters(value.accuracy)) +
          ' · ' + value.source;
        accBox.innerHTML = accuracyHtml(value.accuracy);
        if (mapWrap && LT.Maps && LT.Maps.available()) {
          mapWrap.classList.remove('hidden');
          previewMap = LT.Maps.showSinglePoint(mapCanvas, previewMap, value.lat, value.lon, {
            label: 'Posición capturada', accuracy: value.accuracy
          });
        }
        refreshPreview();
      }
      if (o.onChange) o.onChange(getValue());
    }

    function refreshPreview() {
      var declared = o.getDeclaredLocationId ? o.getDeclaredLocationId() : '';
      if (!declared || value.lat === null) { valBox.innerHTML = ''; return; }
      valBox.innerHTML = '<div class="loader"><span class="spinner"></span>Calculando distancia a la ubicación declarada…</div>';
      LT.API.previewGeoValidation(declared, value.lat, value.lon, value.accuracy)
        .then(function (geo) {
          var g = U.geoInfo(geo.status);
          valBox.innerHTML =
            '<div class="banner banner--' + (g.kind === 'default' ? 'info' : g.kind) + '">' +
              '<div><div class="banner__title">Vista previa: ' + g.sym + ' ' + U.esc(g.label) + '</div>' +
              '<div class="txt-xs">' +
                'Distancia a ' + U.esc(geo.declaredLocation || declared) + ': <b>' + U.fmtMeters(geo.distanceMeters) + '</b>' +
                ' · Radio de geocerca: <b>' + (geo.geofenceRadiusMeters ? U.fmtMeters(geo.geofenceRadiusMeters) : 'no definido') + '</b>' +
                (geo.inheritedCoordinates ? ' · Coordenadas heredadas de ' + U.esc(geo.effectiveLocation) : '') +
              '</div>' +
              '<div class="txt-xs txt-muted">La validación definitiva la ejecuta Apps Script al guardar.</div></div></div>';
        })
        .catch(function (err) {
          valBox.innerHTML = '<div class="banner banner--warn txt-xs">No fue posible calcular la vista previa: ' + U.esc(err.message) + '</div>';
        });
    }

    U.$('[data-geo="current"]', container).addEventListener('click', function (ev) {
      var btn = ev.currentTarget;
      UI.setBusy(btn, true, 'Localizando…');
      getCurrentPosition()
        .then(function (pos) {
          UI.setBusy(btn, false);
          value = { lat: pos.lat, lon: pos.lon, accuracy: pos.accuracy, source: 'GPS_NAVEGADOR' };
          paint();
          UI.ok('Posición capturada', U.fmtCoord(pos.lat, pos.lon) + ' ±' + U.fmtMeters(pos.accuracy));
        })
        .catch(function (err) {
          UI.setBusy(btn, false);
          // El flujo NO se interrumpe: se ofrece el mapa como alternativa.
          valBox.innerHTML =
            '<div class="banner banner--warn"><div>' +
              '<div class="banner__title">No fue posible obtener la posición automáticamente</div>' +
              '<div class="txt-xs">' + U.esc(err.message) + ' Seleccione una posición en el mapa o continúe sin GPS.</div>' +
            '</div></div>';
          UI.warn('GPS no disponible', err.message);
        });
    });

    U.$('[data-geo="map"]', container).addEventListener('click', function () {
      var declared = o.getDeclaredLocationId ? o.getDeclaredLocationId() : '';
      LT.Maps.pickCoordinates({
        lat: value.lat, lon: value.lon,
        declaredLocationId: declared,
        title: 'Seleccionar posición en el mapa'
      }).then(function (picked) {
        if (!picked) return;
        value = { lat: picked.lat, lon: picked.lon, accuracy: picked.accuracy === undefined ? null : picked.accuracy, source: 'MAPA_MANUAL' };
        paint();
        UI.ok('Posición seleccionada', U.fmtCoord(value.lat, value.lon));
      });
    });

    U.$('[data-geo="clear"]', container).addEventListener('click', function () {
      value = { lat: null, lon: null, accuracy: null, source: 'SIN_GPS' };
      paint();
    });

    function getValue() {
      return {
        lat: value.lat, lon: value.lon,
        accuracy: value.accuracy,
        source: value.lat === null ? 'SIN_GPS' : value.source
      };
    }

    function setValue(next) {
      value = {
        lat: U.isValidLat(next.lat) ? U.toNumber(next.lat) : null,
        lon: U.isValidLon(next.lon) ? U.toNumber(next.lon) : null,
        accuracy: U.toNumber(next.accuracy, null),
        source: next.source || (next.lat ? 'MAPA_MANUAL' : 'SIN_GPS')
      };
      paint();
    }

    paint();
    return { getValue: getValue, setValue: setValue, refreshPreview: refreshPreview };
  }

  /* ---------- Resumen geográfico de un evento (ficha/timeline) ---------- */
  function eventGeoHtml(ev) {
    if (!ev) return '';
    var g = U.geoInfo(ev.VALIDACION_GEO);
    var hasCoords = U.isValidLat(ev.LAT_CAPTURADA) && U.isValidLon(ev.LON_CAPTURADA);
    return '<dl class="tl-grid">' +
      '<div><dt>Ubicación declarada</dt><dd>' + U.esc(ev.ID_UBICACION_DECLARADA || '—') + '</dd></div>' +
      '<div><dt>Posición capturada</dt><dd class="mono">' + (hasCoords ? U.fmtCoord(ev.LAT_CAPTURADA, ev.LON_CAPTURADA) : '—') + '</dd></div>' +
      '<div><dt>Precisión</dt><dd>' + (ev.PRECISION_M === '' || ev.PRECISION_M === null || ev.PRECISION_M === undefined ? '—' : '±' + U.fmtMeters(ev.PRECISION_M)) + '</dd></div>' +
      '<div><dt>Distancia a lo declarado</dt><dd>' + U.fmtMeters(ev.DISTANCIA_DECLARADA_M) + '</dd></div>' +
      '<div><dt>Fuente</dt><dd>' + U.esc(ev.FUENTE_UBICACION || '—') + '</dd></div>' +
      '<div><dt>Validación</dt><dd>' + UI.badge(g.short, g.kind, g.sym) + '</dd></div>' +
      '</dl>';
  }

  LT.Geo = {
    GEO_OPTIONS: GEO_OPTIONS,
    HTTPS_NOTICE: HTTPS_NOTICE,
    isSecureOk: isSecureOk,
    isSupported: isSupported,
    getCurrentPosition: getCurrentPosition,
    accuracyKind: accuracyKind,
    accuracyHtml: accuracyHtml,
    httpsBannerHtml: httpsBannerHtml,
    create: create,
    eventGeoHtml: eventGeoHtml
  };
})(window);
