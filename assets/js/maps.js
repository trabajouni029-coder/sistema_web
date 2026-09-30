/* ============================================================
   LogiTrace — maps.js
   Cartografía con Leaflet + OpenStreetMap (con atribución).
   · Ubicaciones y geocercas
   · Eventos diferenciados por validación geográfica
   · Trayectorias numeradas de trazabilidad
   · Selector de coordenadas por clic / arrastre
   Expone: window.LT.Maps
   ============================================================ */
(function (global) {
  'use strict';

  var LT = global.LT = global.LT || {};
  var U = LT.U;
  var UI = LT.UI;
  var CAT = LT.CAT;

  var DEFAULT_CENTER = [0.81234, -77.71782];   // Tulcán, Carchi, Ecuador
  var DEFAULT_ZOOM = 14;
  var OSM_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  var OSM_ATTR = '&copy; Colaboradores de <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

  function available() { return typeof global.L !== 'undefined'; }

  function libMissing(container) {
    if (container) {
      container.innerHTML = '<div class="banner banner--warn">No se pudo cargar Leaflet. ' +
        'Verifique la conexión a Internet: los mapas se descargan desde CDN y los tiles desde OpenStreetMap.</div>';
    }
    return null;
  }

  /* ---------- Creación / reutilización ---------- */
  function createMap(container, opts) {
    if (!available()) return libMissing(container);
    if (!container) return null;
    var o = opts || {};
    if (container.__ltMap) {
      setTimeout(function () { container.__ltMap.invalidateSize(); }, 60);
      return container.__ltMap;
    }
    var map = global.L.map(container, {
      center: o.center || DEFAULT_CENTER,
      zoom: o.zoom || DEFAULT_ZOOM,
      scrollWheelZoom: o.scrollWheelZoom !== false,
      zoomControl: true
    });
    global.L.tileLayer(OSM_URL, {
      maxZoom: 19,
      attribution: OSM_ATTR
    }).addTo(map);
    container.__ltMap = map;
    setTimeout(function () { map.invalidateSize(); }, 80);
    return map;
  }

  function clearLayers(map, store) {
    if (!map || !store) return;
    store.forEach(function (layer) { try { map.removeLayer(layer); } catch (e) { /* ya retirada */ } });
    store.length = 0;
  }

  function icon(cls, text) {
    return global.L.divIcon({
      className: '',
      html: '<div class="lt-marker ' + cls + '">' + (text || '') + '</div>',
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });
  }

  function geoCls(status) {
    return 'lt-marker--' + U.geoInfo(status).cls;
  }

  function geoColor(status) {
    var cls = U.geoInfo(status).cls;
    return cls === 'ok' ? '#1c9d5c' : cls === 'out' ? '#c62f2f' : cls === 'low' ? '#c07c00' : '#78899b';
  }

  /* ---------- Leyenda: símbolo + texto, nunca sólo color ---------- */
  function legendHtml() {
    return '<div class="map-legend">' +
      '<span class="map-legend__item"><span class="map-legend__sym map-legend__sym--ok">✓</span> OK (dentro de geocerca)</span>' +
      '<span class="map-legend__item"><span class="map-legend__sym map-legend__sym--out">⚠</span> Fuera de geocerca</span>' +
      '<span class="map-legend__item"><span class="map-legend__sym map-legend__sym--low">◉</span> Baja precisión</span>' +
      '<span class="map-legend__item"><span class="map-legend__sym map-legend__sym--none">—</span> Sin GPS (no se dibuja en el mapa)</span>' +
      '<span class="map-legend__item"><span class="map-legend__sym" style="color:var(--brand-700)">▣</span> Ubicación del maestro</span>' +
      '<span class="map-legend__item"><span class="map-legend__sym" style="color:var(--brand-700)">◯</span> Geocerca</span>' +
      '</div>';
  }

  /* ---------- Popups ---------- */
  function locationPopup(loc, resolved) {
    var own = U.isValidLat(loc.LAT) && U.isValidLon(loc.LON);
    return '<div class="pop-title">' + U.esc(loc.NOMBRE) + '</div>' +
      '<div class="pop-sub">' + U.esc(loc.TIPO || '') + '</div>' +
      '<div class="pop-grid">' +
        '<b>ID</b><span>' + U.esc(loc.ID_UBICACION) + '</span>' +
        '<b>Dirección</b><span>' + U.esc(loc.DIRECCION || '—') + '</span>' +
        '<b>Coordenadas</b><span>' + U.fmtCoord(resolved.lat, resolved.lon) + (own ? '' : ' (heredadas)') + '</span>' +
        '<b>Radio</b><span>' + (resolved.radiusMeters ? U.fmtMeters(resolved.radiusMeters) : 'no definido') + '</span>' +
        '<b>Padre</b><span>' + U.esc(loc.PADRE_ID || 'raíz') + '</span>' +
      '</div>';
  }

  function eventPopup(ev, seq, total) {
    var g = U.geoInfo(ev.VALIDACION_GEO);
    var def = U.eventByAny(ev.EVENTO);
    return '<div class="pop-title">' + (seq ? 'Evento ' + seq + ' de ' + total + ' — ' : '') + U.esc(def ? def.label : ev.EVENTO) + '</div>' +
      '<div class="pop-sub">' + U.esc(U.fmtDate(ev.FECHA_HORA)) + '</div>' +
      '<div class="pop-grid">' +
        '<b>Producto</b><span>' + U.esc(ev.ID_PRODUCTO) + '</span>' +
        '<b>Lugar declarado</b><span>' + U.esc(ev.ID_UBICACION_DECLARADA || ev.UBICACION || '—') + '</span>' +
        '<b>Distancia</b><span>' + U.fmtMeters(ev.DISTANCIA_DECLARADA_M) + '</span>' +
        '<b>Precisión</b><span>' + (ev.PRECISION_M === '' || ev.PRECISION_M === null ? '—' : '±' + U.fmtMeters(ev.PRECISION_M)) + '</span>' +
        '<b>Validación</b><span>' + g.sym + ' ' + U.esc(g.short) + '</span>' +
        '<b>Stock</b><span>' + U.esc(ev.STOCK_ANTES) + ' &rarr; ' + U.esc(ev.STOCK_DESPUES) + '</span>' +
        '<b>Actor</b><span>' + U.esc(ev.ACTOR || '—') + '</span>' +
      '</div>' +
      '<div class="pop-actions">' +
        '<button class="btn btn--sm btn--primary" type="button" onclick="window.LT.Router.go(\'traceability\',{productId:\'' +
          U.esc(String(ev.ID_PRODUCTO).replace(/'/g, '')) + '\'})">Ver trazabilidad</button>' +
      '</div>';
  }

  /* ---------- Un solo punto (vista previa de captura) ---------- */
  function showSinglePoint(container, existing, lat, lon, opts) {
    if (!available()) return libMissing(container);
    var o = opts || {};
    var map = existing || createMap(container, { center: [lat, lon], zoom: 16, scrollWheelZoom: false });
    if (!map) return null;
    map.__single = map.__single || [];
    clearLayers(map, map.__single);
    var marker = global.L.marker([lat, lon], { icon: icon('lt-marker--ok', '●') }).addTo(map);
    if (o.label) marker.bindPopup('<div class="pop-title">' + U.esc(o.label) + '</div>' +
      '<div class="pop-sub">' + U.fmtCoord(lat, lon) + '</div>');
    map.__single.push(marker);
    if (o.accuracy) {
      var circle = global.L.circle([lat, lon], {
        radius: U.toNumber(o.accuracy, 0) || 0,
        color: '#2585cc', weight: 1, fillColor: '#2585cc', fillOpacity: 0.12, dashArray: '4 3'
      }).addTo(map);
      map.__single.push(circle);
    }
    map.setView([lat, lon], 16);
    setTimeout(function () { map.invalidateSize(); }, 80);
    return map;
  }

  /* ============================================================
     SELECTOR DE COORDENADAS (clic o arrastre del marcador)
     ============================================================ */
  function pickCoordinates(opts) {
    var o = opts || {};
    return new Promise(function (resolve) {
      if (!available()) { UI.error('Leaflet no disponible', 'No es posible abrir el selector de mapa.'); resolve(null); return; }

      var body = U.el('div', { class: 'coord-picker' });
      body.innerHTML =
        '<div class="banner banner--info txt-xs">Haga clic en el mapa o arrastre el marcador. También puede escribir las coordenadas.</div>' +
        '<div class="map-canvas map-canvas--md" data-pick="map"></div>' +
        '<div class="grid grid--form">' +
          '<div class="field"><label class="field__label" for="pickLat">Latitud</label>' +
            '<input id="pickLat" name="pickLat" inputmode="decimal"></div>' +
          '<div class="field"><label class="field__label" for="pickLon">Longitud</label>' +
            '<input id="pickLon" name="pickLon" inputmode="decimal"></div>' +
        '</div>' +
        '<div class="row"><button class="btn btn--sm btn--ghost" type="button" data-pick="gps">Centrar en mi posición</button></div>' +
        '<div data-pick="readout" class="coord-picker__readout">Sin selección</div>';

      var settled = false;
      UI.openModal({
        title: o.title || 'Seleccionar posición',
        size: 'wide',
        body: body,
        actions: [
          { label: 'Cancelar', kind: 'ghost', onClick: function () { settled = true; resolve(null); } },
          {
            label: 'Usar esta posición', kind: 'primary', close: false, onClick: function () {
              var lat = U.toNumber(latInput.value, null), lon = U.toNumber(lonInput.value, null);
              if (!U.isValidLat(lat) || !U.isValidLon(lon)) {
                UI.warn('Coordenadas inválidas', 'Seleccione un punto en el mapa.');
                return false;
              }
              settled = true;
              UI.closeModal();
              resolve({ lat: lat, lon: lon, accuracy: null, source: 'MAPA_MANUAL' });
              return true;
            }
          }
        ],
        onClose: function () { if (!settled) resolve(null); }
      });

      var mapEl = U.$('[data-pick="map"]', body);
      var latInput = U.$('#pickLat', body);
      var lonInput = U.$('#pickLon', body);
      var readout = U.$('[data-pick="readout"]', body);

      var startLat = U.isValidLat(o.lat) ? U.toNumber(o.lat) : DEFAULT_CENTER[0];
      var startLon = U.isValidLon(o.lon) ? U.toNumber(o.lon) : DEFAULT_CENTER[1];
      var hasInitial = U.isValidLat(o.lat) && U.isValidLon(o.lon);

      var map = global.L.map(mapEl, { center: [startLat, startLon], zoom: hasInitial ? 17 : 14 });
      global.L.tileLayer(OSM_URL, { maxZoom: 19, attribution: OSM_ATTR }).addTo(map);

      var marker = global.L.marker([startLat, startLon], {
        draggable: true,
        icon: icon('lt-marker--loc', '◎')
      }).addTo(map);

      var fence = null;
      function drawFence(lat, lon) {
        if (fence) { try { map.removeLayer(fence); } catch (e) { /* ignorado */ } fence = null; }
        var r = U.toNumber(o.radiusMeters, null);
        if (r && r > 0) {
          fence = global.L.circle([lat, lon], {
            radius: r, color: '#14548c', weight: 1.5, fillColor: '#2585cc', fillOpacity: 0.08
          }).addTo(map);
        }
      }

      function update(lat, lon) {
        latInput.value = Number(lat).toFixed(6);
        lonInput.value = Number(lon).toFixed(6);
        readout.textContent = 'Seleccionado: ' + U.fmtCoord(lat, lon);
        marker.setLatLng([lat, lon]);
        drawFence(lat, lon);
      }

      if (hasInitial) update(startLat, startLon);
      else readout.textContent = 'Sin selección — haga clic en el mapa';

      // Referencia visual de la ubicación declarada, si existe.
      if (o.declaredLocationId) {
        LT.API.resolveLocationCoordinates(o.declaredLocationId).then(function (res) {
          if (!res || !res.found) return;
          global.L.marker([res.lat, res.lon], { icon: icon('lt-marker--loc', '▣') })
            .addTo(map)
            .bindPopup('<div class="pop-title">Ubicación declarada</div><div class="pop-sub">' +
              U.esc(res.effectiveLocationName) + '</div>');
          if (res.radiusMeters) {
            global.L.circle([res.lat, res.lon], {
              radius: res.radiusMeters, color: '#14548c', weight: 1.5, dashArray: '5 4',
              fillColor: '#2585cc', fillOpacity: 0.06
            }).addTo(map);
          }
          if (!hasInitial) map.setView([res.lat, res.lon], 16);
        }).catch(function () { /* referencia opcional */ });
      }

      map.on('click', function (ev) { update(ev.latlng.lat, ev.latlng.lng); });
      marker.on('dragend', function () {
        var ll = marker.getLatLng();
        update(ll.lat, ll.lng);
      });

      function fromInputs() {
        var lat = U.toNumber(latInput.value, null), lon = U.toNumber(lonInput.value, null);
        if (U.isValidLat(lat) && U.isValidLon(lon)) { update(lat, lon); map.setView([lat, lon]); }
      }
      latInput.addEventListener('change', fromInputs);
      lonInput.addEventListener('change', fromInputs);

      U.$('[data-pick="gps"]', body).addEventListener('click', function (ev) {
        var btn = ev.currentTarget;
        UI.setBusy(btn, true, 'Localizando…');
        LT.Geo.getCurrentPosition().then(function (pos) {
          UI.setBusy(btn, false);
          update(pos.lat, pos.lon);
          map.setView([pos.lat, pos.lon], 17);
        }).catch(function (e) {
          UI.setBusy(btn, false);
          UI.warn('GPS no disponible', e.message + ' Seleccione el punto manualmente.');
        });
      });

      setTimeout(function () { map.invalidateSize(); }, 150);
    });
  }

  /* ============================================================
     TRAYECTORIA GEOGRÁFICA (trazabilidad)
     Eventos con coordenadas ordenados por FECHA_HORA ASC:
     marcadores numerados 1 → 2 → 3 unidos por L.polyline().
     ============================================================ */
  function drawTrajectory(container, events, opts) {
    if (!available()) return libMissing(container);
    var o = opts || {};
    var geoEvents = (events || []).filter(function (e) {
      return U.isValidLat(e.LAT_CAPTURADA) && U.isValidLon(e.LON_CAPTURADA);
    });
    geoEvents = U.sortBy(geoEvents, function (e) {
      var d = U.parseDate(e.FECHA_HORA);
      return d ? d.getTime() : 0;
    }, 'asc');

    var map = createMap(container, { zoom: 15 });
    if (!map) return null;
    map.__traj = map.__traj || [];
    clearLayers(map, map.__traj);

    if (!geoEvents.length) return map;

    var points = geoEvents.map(function (e) { return [U.toNumber(e.LAT_CAPTURADA), U.toNumber(e.LON_CAPTURADA)]; });

    if (points.length > 1) {
      var line = global.L.polyline(points, {
        color: '#14548c', weight: 3, opacity: 0.85, dashArray: '1 0'
      }).addTo(map);
      map.__traj.push(line);
      // Trazo de refuerzo para distinguir el sentido del recorrido.
      var arrowStyle = global.L.polyline(points, { color: '#ffffff', weight: 1, opacity: 0.9, dashArray: '6 10' }).addTo(map);
      map.__traj.push(arrowStyle);
    }

    geoEvents.forEach(function (ev, i) {
      var marker = global.L.marker(points[i], {
        icon: icon('lt-marker--seq ' + geoCls(ev.VALIDACION_GEO), String(i + 1)),
        title: 'Evento ' + (i + 1) + ': ' + ev.EVENTO
      }).addTo(map);
      marker.bindPopup(eventPopup(ev, i + 1, geoEvents.length));
      map.__traj.push(marker);

      // Geocerca de la ubicación declarada como contexto.
      if (o.locationIndex && ev.ID_UBICACION_DECLARADA) {
        var res = LT.Locations.resolveCoords(o.locationIndex, ev.ID_UBICACION_DECLARADA);
        if (res.found && res.radiusMeters) {
          var circle = global.L.circle([res.lat, res.lon], {
            radius: res.radiusMeters, color: geoColor(ev.VALIDACION_GEO),
            weight: 1, fillOpacity: 0.05, dashArray: '4 4'
          }).addTo(map);
          map.__traj.push(circle);
        }
      }
    });

    map.fitBounds(global.L.latLngBounds(points).pad(0.25));
    setTimeout(function () { map.invalidateSize(); }, 100);
    return map;
  }

  /* ============================================================
     VISTA MAPA GENERAL
     ============================================================ */
  var viewState = { filters: {}, data: null };

  function invalidateData() { viewState.data = null; }

  function initView() {
    var root = document.getElementById('view-map');
    if (!root || root.__ready) return;
    root.__ready = true;

    U.$('[data-map-legend]', root).innerHTML = legendHtml();

    var geoSel = U.$('[name="mapGeoStatus"]', root);
    UI.fillSelect(geoSel, Object.keys(CAT.GEO).map(function (k) {
      return { value: k, label: CAT.GEO[k].sym + ' ' + CAT.GEO[k].label };
    }), { placeholder: 'Todos los estados' });

    var evSel = U.$('[name="mapEvent"]', root);
    UI.fillSelect(evSel, CAT.EVENTS.map(function (e) { return { value: e.label, label: e.label }; }),
      { placeholder: 'Todos los eventos' });

    U.$('[data-map-action="apply"]', root).addEventListener('click', function () { renderView(true); });
    U.$('[data-map-action="clear"]', root).addEventListener('click', function () {
      U.$$('#view-map .filters input, #view-map .filters select').forEach(function (i) { i.value = ''; });
      renderView(true);
    });
    U.$('[data-map-action="fit"]', root).addEventListener('click', function () { fitAll(); });

    renderView(false);
  }

  function readFilters() {
    var root = document.getElementById('view-map');
    return {
      productId: (U.$('[name="mapProduct"]', root) || {}).value || '',
      event: (U.$('[name="mapEvent"]', root) || {}).value || '',
      geoStatus: (U.$('[name="mapGeoStatus"]', root) || {}).value || '',
      locationId: (U.$('[name="mapLocation"]', root) || {}).value || '',
      dateFrom: (U.$('[name="mapDateFrom"]', root) || {}).value || '',
      dateTo: (U.$('[name="mapDateTo"]', root) || {}).value || ''
    };
  }

  function renderView(fromUser) {
    var root = document.getElementById('view-map');
    if (!root) return;
    var mapEl = U.$('[data-map="canvas"]', root);
    var statsBox = U.$('[data-map="stats"]', root);
    var noGpsBox = U.$('[data-map="nogps"]', root);

    if (!available()) { libMissing(mapEl); return; }
    var filters = readFilters();

    Promise.all([LT.API.getLocations(), LT.API.getGeoEvents(filters), LT.API.getProducts()])
      .then(function (res) {
        var locations = res[0], events = res[1], products = res[2];
        var idx = LT.Locations.buildIndex(locations);

        // Selects dependientes (sólo la primera vez o cuando cambian los datos).
        var prodSel = U.$('[name="mapProduct"]', root);
        if (!prodSel.dataset.filled) {
          UI.fillSelect(prodSel, U.sortBy(products, function (p) { return p.NOMBRE; }).map(function (p) {
            return { value: p.ID_PRODUCTO, label: p.NOMBRE + ' — ' + p.ID_PRODUCTO };
          }), { placeholder: 'Todos los productos' });
          prodSel.dataset.filled = '1';
          if (filters.productId) prodSel.value = filters.productId;
        }
        var locSel = U.$('[name="mapLocation"]', root);
        if (!locSel.dataset.filled) {
          LT.Locations.fillLocationSelect(locSel, locations, { placeholder: 'Todas las ubicaciones' });
          locSel.dataset.filled = '1';
          if (filters.locationId) locSel.value = filters.locationId;
        }

        var map = createMap(mapEl);
        if (!map) return;
        map.__layers = map.__layers || [];
        clearLayers(map, map.__layers);

        var bounds = [];

        // --- Ubicaciones y geocercas ---
        locations.forEach(function (loc) {
          if (!LT.Locations.isActive(loc)) return;
          if (filters.locationId && String(loc.ID_UBICACION).toUpperCase() !== filters.locationId.toUpperCase()) return;
          var resolved = LT.Locations.resolveCoords(idx, loc.ID_UBICACION);
          if (!resolved.found) return;                       // nunca se inventan coordenadas
          var own = U.isValidLat(loc.LAT) && U.isValidLon(loc.LON);
          var marker = global.L.marker([resolved.lat, resolved.lon], {
            icon: icon('lt-marker--loc', own ? '▣' : '▢'),
            title: loc.NOMBRE
          }).addTo(map);
          marker.bindPopup(locationPopup(loc, resolved));
          map.__layers.push(marker);
          bounds.push([resolved.lat, resolved.lon]);
          if (resolved.radiusMeters) {
            var circle = global.L.circle([resolved.lat, resolved.lon], {
              radius: resolved.radiusMeters,
              color: '#14548c', weight: 1.5, fillColor: '#2585cc', fillOpacity: 0.07
            }).addTo(map);
            circle.bindPopup(locationPopup(loc, resolved));
            map.__layers.push(circle);
          }
        });

        // --- Eventos con coordenadas ---
        var withCoords = events.filter(function (e) { return U.isValidLat(e.LAT_CAPTURADA) && U.isValidLon(e.LON_CAPTURADA); });
        var withoutCoords = events.filter(function (e) { return !(U.isValidLat(e.LAT_CAPTURADA) && U.isValidLon(e.LON_CAPTURADA)); });

        withCoords.forEach(function (ev) {
          var g = U.geoInfo(ev.VALIDACION_GEO);
          var marker = global.L.marker([U.toNumber(ev.LAT_CAPTURADA), U.toNumber(ev.LON_CAPTURADA)], {
            icon: icon(geoCls(ev.VALIDACION_GEO), g.sym),
            title: ev.EVENTO + ' · ' + U.fmtDate(ev.FECHA_HORA)
          }).addTo(map);
          marker.bindPopup(eventPopup(ev));
          map.__layers.push(marker);
          bounds.push([U.toNumber(ev.LAT_CAPTURADA), U.toNumber(ev.LON_CAPTURADA)]);
        });

        map.__bounds = bounds;
        if (bounds.length && fitAllowed()) map.fitBounds(global.L.latLngBounds(bounds).pad(0.15));

        // --- Contadores ---
        var countBy = function (status) {
          return events.filter(function (e) { return String(e.VALIDACION_GEO || 'SIN_GPS').toUpperCase() === status; }).length;
        };
        statsBox.innerHTML =
          '<div class="kpi kpi--info"><div class="kpi__label">Eventos filtrados</div><div class="kpi__value">' + events.length + '</div></div>' +
          '<div class="kpi kpi--ok"><div class="kpi__label">✓ OK</div><div class="kpi__value">' + countBy('OK') + '</div></div>' +
          '<div class="kpi kpi--danger"><div class="kpi__label">⚠ Fuera de geocerca</div><div class="kpi__value">' + countBy('FUERA_GEOCERCA') + '</div></div>' +
          '<div class="kpi kpi--warn"><div class="kpi__label">◉ Baja precisión</div><div class="kpi__value">' + countBy('BAJA_PRECISION') + '</div></div>' +
          '<div class="kpi"><div class="kpi__label">— Sin GPS</div><div class="kpi__value">' + countBy('SIN_GPS') + '</div>' +
            '<div class="kpi__hint">No se representan en el mapa</div></div>';

        // --- Lista de eventos sin GPS (no se inventan coordenadas) ---
        if (!withoutCoords.length) {
          noGpsBox.innerHTML = '<div class="banner banner--ok txt-xs">Todos los eventos filtrados tienen coordenadas.</div>';
        } else {
          noGpsBox.innerHTML =
            '<div class="card"><div class="card__head"><div><div class="card__title">Eventos sin coordenadas (' + withoutCoords.length + ')</div>' +
            '<div class="card__desc">Se listan aquí porque no pueden representarse geográficamente.</div></div></div>' +
            '<div class="card__body card__body--flush"><div class="table-wrap"><table class="data responsive"><thead><tr>' +
            '<th>Fecha</th><th>Producto</th><th>Evento</th><th>Ubicación declarada</th><th>Actor</th></tr></thead><tbody>' +
            withoutCoords.slice(0, 50).map(function (e) {
              return '<tr>' +
                '<td data-label="Fecha" class="mono txt-xs">' + U.esc(U.fmtDate(e.FECHA_HORA)) + '</td>' +
                '<td data-label="Producto" class="mono txt-xs">' + U.esc(e.ID_PRODUCTO) + '</td>' +
                '<td data-label="Evento">' + UI.eventBadge(e.EVENTO) + '</td>' +
                '<td data-label="Ubicación declarada">' + U.esc(LT.Locations.nameOf(idx, e.ID_UBICACION_DECLARADA) || '—') + '</td>' +
                '<td data-label="Actor">' + U.esc(e.ACTOR || '—') + '</td>' +
                '</tr>';
            }).join('') +
            '</tbody></table></div></div></div>';
        }

        if (fromUser) UI.announce('Mapa actualizado: ' + events.length + ' eventos.');
      })
      .catch(function (err) {
        statsBox.innerHTML = '';
        noGpsBox.innerHTML = '';
        UI.error('No fue posible cargar el mapa', err.message);
      });
  }

  var fitLocked = false;
  function fitAllowed() { return !fitLocked; }

  function fitAll() {
    var mapEl = U.$('[data-map="canvas"]', document.getElementById('view-map'));
    var map = mapEl && mapEl.__ltMap;
    if (!map || !map.__bounds || !map.__bounds.length) { UI.warn('Nada que ajustar', 'No hay elementos representados.'); return; }
    map.fitBounds(global.L.latLngBounds(map.__bounds).pad(0.15));
  }

  /** Centra el mapa general en una ubicación concreta (desde otras vistas). */
  function focusLocation(locationId) {
    var root = document.getElementById('view-map');
    if (!root) return;
    var sel = U.$('[name="mapLocation"]', root);
    LT.API.getLocations().then(function (list) {
      LT.Locations.fillLocationSelect(sel, list, { placeholder: 'Todas las ubicaciones', value: locationId });
      sel.dataset.filled = '1';
      renderView(false);
      var res = LT.Locations.resolveCoords(LT.Locations.buildIndex(list), locationId);
      var mapEl = U.$('[data-map="canvas"]', root);
      if (res.found && mapEl && mapEl.__ltMap) {
        fitLocked = true;
        mapEl.__ltMap.setView([res.lat, res.lon], 16);
        setTimeout(function () { fitLocked = false; }, 800);
      }
    });
  }

  function focusProduct(productId) {
    var root = document.getElementById('view-map');
    if (!root) return;
    var sel = U.$('[name="mapProduct"]', root);
    LT.API.getProducts().then(function (products) {
      UI.fillSelect(sel, U.sortBy(products, function (p) { return p.NOMBRE; }).map(function (p) {
        return { value: p.ID_PRODUCTO, label: p.NOMBRE + ' — ' + p.ID_PRODUCTO };
      }), { placeholder: 'Todos los productos', value: productId });
      sel.dataset.filled = '1';
      renderView(false);
    });
  }

  LT.Maps = {
    available: available,
    DEFAULT_CENTER: DEFAULT_CENTER,
    createMap: createMap,
    icon: icon,
    legendHtml: legendHtml,
    showSinglePoint: showSinglePoint,
    pickCoordinates: pickCoordinates,
    drawTrajectory: drawTrajectory,
    initView: initView,
    renderView: renderView,
    invalidateData: invalidateData,
    focusLocation: focusLocation,
    focusProduct: focusProduct,
    eventPopup: eventPopup
  };
})(window);
