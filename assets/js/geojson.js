/* ============================================================
   LogiTrace — geojson.js
   Exportación GeoJSON para consumo en QGIS.

   REGLA CRÍTICA: GeoJSON usa [LONGITUD, LATITUD].
   Nunca [LATITUD, LONGITUD]. Toda coordenada pasa por
   coordPair() para evitar inversiones.

   LogiTrace es la fuente de datos; QGIS sólo consume los
   archivos exportados. QGIS no se integra dentro de la app.
   Expone: window.LT.GeoJSON
   ============================================================ */
(function (global) {
  'use strict';

  var LT = global.LT = global.LT || {};
  var U = LT.U;
  var UI = LT.UI;

  /** Único punto del sistema donde se construye un par de coordenadas. */
  function coordPair(lat, lon) {
    var la = U.toNumber(lat, null);
    var lo = U.toNumber(lon, null);
    if (la === null || lo === null) return null;
    if (!U.isValidLat(la) || !U.isValidLon(lo)) return null;
    return [lo, la];                 // [LONGITUD, LATITUD]
  }

  function featureCollection(features, meta) {
    return {
      type: 'FeatureCollection',
      name: (meta && meta.name) || 'logitrace',
      crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
      metadata: {
        generator: 'LogiTrace',
        generatedAt: new Date().toISOString(),
        timezone: U.cfg().TIMEZONE,
        coordinateOrder: '[longitude, latitude]',
        count: features.length
      },
      features: features
    };
  }

  /* ============================================================
     UBICACIONES
     ============================================================ */
  function buildLocations(locations, opts) {
    var o = opts || {};
    var idx = LT.Locations.buildIndex(locations);
    var features = [];

    locations.forEach(function (loc) {
      if (o.onlyActive !== false && !LT.Locations.isActive(loc)) return;
      var resolved = LT.Locations.resolveCoords(idx, loc.ID_UBICACION);
      if (!resolved.found) return;                      // sin coordenadas: no se exporta
      var coords = coordPair(resolved.lat, resolved.lon);
      if (!coords) return;
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: coords },
        properties: {
          id_ubicacion: loc.ID_UBICACION,
          nombre: loc.NOMBRE,
          tipo: loc.TIPO || '',
          direccion: loc.DIRECCION || '',
          radio_geocerca_m: resolved.radiusMeters === null ? '' : resolved.radiusMeters,
          padre_id: loc.PADRE_ID || '',
          activo: LT.Locations.isActive(loc) ? 'SI' : 'NO',
          coordenadas_heredadas: resolved.inherited ? 'SI' : 'NO',
          ubicacion_efectiva: resolved.effectiveLocationId
        }
      });
    });

    return featureCollection(features, { name: 'logitrace_ubicaciones' });
  }

  /* ============================================================
     EVENTOS
     ============================================================ */
  function buildEvents(events, opts) {
    var o = opts || {};
    var features = [];
    var skipped = 0;

    (events || []).forEach(function (ev) {
      var coords = coordPair(ev.LAT_CAPTURADA, ev.LON_CAPTURADA);
      if (!coords) { skipped++; return; }               // SIN_GPS: no se inventan coordenadas
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: coords },
        properties: {
          id_evento: ev.ID_EVENTO,
          fecha_hora: ev.FECHA_HORA,
          id_producto: ev.ID_PRODUCTO,
          evento: ev.EVENTO,
          cantidad_movimiento: U.toNumber(ev.CANTIDAD_MOVIMIENTO, 0),
          stock_antes: U.toNumber(ev.STOCK_ANTES, null),
          stock_despues: U.toNumber(ev.STOCK_DESPUES, null),
          actor: ev.ACTOR || '',
          id_ubicacion_declarada: ev.ID_UBICACION_DECLARADA || '',
          ubicacion_origen: ev.UBICACION_ORIGEN || '',
          ubicacion_destino: ev.UBICACION_DESTINO || '',
          precision_m: U.toNumber(ev.PRECISION_M, null),
          distancia_declarada_m: U.toNumber(ev.DISTANCIA_DECLARADA_M, null),
          validacion_geo: ev.VALIDACION_GEO || 'SIN_GPS',
          fuente_ubicacion: ev.FUENTE_UBICACION || '',
          tipo_identificacion: ev.TIPO_IDENTIFICACION || '',
          codigo_leido: ev.CODIGO_LEIDO || '',
          observacion: ev.OBSERVACION || ''
        }
      });
    });

    var fc = featureCollection(features, { name: o.name || 'logitrace_eventos' });
    fc.metadata.eventosSinCoordenadas = skipped;
    return fc;
  }

  /** Trayectoria de un producto como LineString (opcional para QGIS). */
  function buildTrajectory(events, productId) {
    var ordered = U.sortBy((events || []).filter(function (e) {
      return coordPair(e.LAT_CAPTURADA, e.LON_CAPTURADA) !== null;
    }), function (e) {
      var d = U.parseDate(e.FECHA_HORA);
      return d ? d.getTime() : 0;
    }, 'asc');

    if (ordered.length < 2) return featureCollection([], { name: 'logitrace_trayectoria' });

    var coords = ordered.map(function (e) { return coordPair(e.LAT_CAPTURADA, e.LON_CAPTURADA); });
    var meters = 0;
    for (var i = 1; i < ordered.length; i++) {
      var d = U.haversine(ordered[i - 1].LAT_CAPTURADA, ordered[i - 1].LON_CAPTURADA,
                          ordered[i].LAT_CAPTURADA, ordered[i].LON_CAPTURADA);
      if (d !== null) meters += d;
    }

    return featureCollection([{
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords },
      properties: {
        id_producto: productId || (ordered[0] && ordered[0].ID_PRODUCTO) || '',
        puntos: ordered.length,
        distancia_geodesica_m: Math.round(meters),
        desde: ordered[0].FECHA_HORA,
        hasta: ordered[ordered.length - 1].FECHA_HORA,
        nota: 'Distancia geodésica aproximada (Haversine); no equivale a distancia vial.'
      }
    }], { name: 'logitrace_trayectoria' });
  }

  /* ============================================================
     DESCARGAS
     ============================================================ */
  function exportLocations() {
    return LT.API.getLocations().then(function (list) {
      var fc = buildLocations(list);
      if (!fc.features.length) {
        UI.warn('Nada que exportar', 'Ninguna ubicación tiene coordenadas resolubles.');
        return fc;
      }
      U.downloadJson('ubicaciones.geojson', fc);
      UI.ok('ubicaciones.geojson exportado', fc.features.length + ' ubicaciones · orden [lon, lat]');
      return fc;
    }).catch(function (err) {
      UI.error('No fue posible exportar', err.message);
    });
  }

  function exportEvents(filters) {
    return LT.API.getGeoEvents(filters || {}).then(function (list) {
      var fc = buildEvents(list);
      if (!fc.features.length) {
        UI.warn('Nada que exportar', 'Ningún evento del filtro tiene coordenadas.');
        return fc;
      }
      U.downloadJson('eventos.geojson', fc);
      UI.ok('eventos.geojson exportado', fc.features.length + ' eventos · ' +
        fc.metadata.eventosSinCoordenadas + ' sin coordenadas omitidos');
      return fc;
    }).catch(function (err) {
      UI.error('No fue posible exportar', err.message);
    });
  }

  function exportTrajectory(productId) {
    return LT.API.getEvents(productId).then(function (list) {
      var fc = buildTrajectory(list, productId);
      if (!fc.features.length) {
        UI.warn('Trayectoria no exportable', 'Se requieren al menos dos eventos con coordenadas.');
        return fc;
      }
      U.downloadJson('trayectoria-' + U.codeToken(productId, 'producto') + '.geojson', fc);
      UI.ok('Trayectoria exportada', fc.features[0].properties.puntos + ' puntos');
      return fc;
    }).catch(function (err) {
      UI.error('No fue posible exportar', err.message);
    });
  }

  /** Exporta el inventario como CSV plano (útil como tabla auxiliar en QGIS). */
  function exportInventoryCsv() {
    return LT.API.getProducts().then(function (products) {
      var cols = ['ID_PRODUCTO', 'NOMBRE', 'CATEGORIA', 'LOTE', 'CANTIDAD', 'UBICACION_ACTUAL',
                  'TIPO_CODIGO_1D', 'CODIGO_1D', 'CODIGO_QR', 'RFID_UID_EPC', 'ESTADO', 'ULTIMA_ACTUALIZACION'];
      var esc = function (v) {
        var s = v === null || v === undefined ? '' : String(v);
        return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      var csv = cols.join(',') + '\n' + products.map(function (p) {
        return cols.map(function (c) { return esc(p[c]); }).join(',');
      }).join('\n');
      U.downloadText('inventario.csv', csv, 'text/csv');
      UI.ok('inventario.csv exportado', products.length + ' productos');
    }).catch(function (err) { UI.error('No fue posible exportar', err.message); });
  }

  /* ============================================================
     VISTA EXPORTAR
     ============================================================ */
  function initView() {
    var root = document.getElementById('view-export');
    if (!root || root.__ready) return;
    root.__ready = true;

    U.$('[data-export="locations"]', root).addEventListener('click', function (ev) {
      var btn = ev.currentTarget;
      UI.setBusy(btn, true, 'Generando…');
      exportLocations().then(function () { UI.setBusy(btn, false); refreshStats(); });
    });
    U.$('[data-export="events"]', root).addEventListener('click', function (ev) {
      var btn = ev.currentTarget;
      UI.setBusy(btn, true, 'Generando…');
      exportEvents({}).then(function () { UI.setBusy(btn, false); refreshStats(); });
    });
    U.$('[data-export="trajectory"]', root).addEventListener('click', function () {
      var sel = U.$('[name="expProduct"]', root);
      if (!sel.value) { UI.warn('Seleccione un producto', 'La trayectoria se exporta por producto.'); return; }
      exportTrajectory(sel.value);
    });
    U.$('[data-export="csv"]', root).addEventListener('click', function () { exportInventoryCsv(); });
    U.$('[data-export="preview"]', root).addEventListener('click', function () { openPreview(); });

    LT.API.getProducts().then(function (products) {
      UI.fillSelect(U.$('[name="expProduct"]', root), U.sortBy(products, function (p) { return p.NOMBRE; }).map(function (p) {
        return { value: p.ID_PRODUCTO, label: p.NOMBRE + ' — ' + p.ID_PRODUCTO };
      }), { placeholder: '— Producto para la trayectoria —' });
    });

    refreshStats();
  }

  function refreshStats() {
    var root = document.getElementById('view-export');
    if (!root) return;
    var box = U.$('[data-export="stats"]', root);
    Promise.all([LT.API.getLocations(), LT.API.getEvents()]).then(function (res) {
      var locFc = buildLocations(res[0]);
      var evFc = buildEvents(res[1]);
      box.innerHTML =
        '<div class="kpi kpi--info"><div class="kpi__label">Ubicaciones exportables</div>' +
          '<div class="kpi__value">' + locFc.features.length + '</div>' +
          '<div class="kpi__hint">de ' + res[0].length + ' en el maestro</div></div>' +
        '<div class="kpi kpi--accent"><div class="kpi__label">Eventos exportables</div>' +
          '<div class="kpi__value">' + evFc.features.length + '</div>' +
          '<div class="kpi__hint">' + evFc.metadata.eventosSinCoordenadas + ' sin coordenadas</div></div>';
    }).catch(function () {
      box.innerHTML = '<div class="banner banner--warn txt-xs">No fue posible calcular el resumen de exportación.</div>';
    });
  }

  function openPreview() {
    var body = U.el('div', { class: 'stack' });
    UI.loading(body, 'Generando muestra…');
    UI.openModal({ title: 'Vista previa del GeoJSON', size: 'wide', body: body });
    Promise.all([LT.API.getLocations(), LT.API.getEvents()]).then(function (res) {
      var loc = buildLocations(res[0]);
      var evs = buildEvents(res[1]);
      var sample = function (fc) {
        return JSON.stringify({
          type: fc.type, name: fc.name, crs: fc.crs, metadata: fc.metadata,
          features: fc.features.slice(0, 2)
        }, null, 2);
      };
      body.innerHTML =
        '<div class="banner banner--info txt-xs mb-3">El orden de coordenadas es <b>[longitud, latitud]</b>, ' +
        'conforme a la especificación GeoJSON (RFC 7946). QGIS lo interpreta directamente.</div>' +
        '<div class="card mb-3"><div class="card__head"><div class="card__title">ubicaciones.geojson (2 primeros registros)</div></div>' +
        '<div class="card__body"><pre class="mono txt-xs break" style="white-space:pre-wrap;margin:0">' + U.esc(sample(loc)) + '</pre></div></div>' +
        '<div class="card"><div class="card__head"><div class="card__title">eventos.geojson (2 primeros registros)</div></div>' +
        '<div class="card__body"><pre class="mono txt-xs break" style="white-space:pre-wrap;margin:0">' + U.esc(sample(evs)) + '</pre></div></div>';
    }).catch(function (err) { UI.errorState(body, err.message); });
  }

  LT.GeoJSON = {
    coordPair: coordPair,
    buildLocations: buildLocations,
    buildEvents: buildEvents,
    buildTrajectory: buildTrajectory,
    exportLocations: exportLocations,
    exportEvents: exportEvents,
    exportTrajectory: exportTrajectory,
    exportInventoryCsv: exportInventoryCsv,
    initView: initView
  };
})(window);
