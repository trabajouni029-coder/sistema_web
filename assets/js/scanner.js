/* ============================================================
   LogiTrace — scanner.js
   Lectura de identificadores con la cámara (Code 128, EAN-13, QR)
   o desde una imagen cargada, y FICHA COMPLETA del producto.

   Regla central (sección 25 del requerimiento):
   tras escanear NO se muestra sólo el código: se consulta el
   producto y su historial y se presenta una ficha íntegra.
   Nunca se registra un evento automáticamente.
   Expone: window.LT.Scanner
   ============================================================ */
(function (global) {
  'use strict';

  var LT = global.LT = global.LT || {};
  var U = LT.U;
  var UI = LT.UI;

  var READER_ID = 'scannerReader';
  var state = {
    instance: null,
    running: false,
    cameras: [],
    cameraIndex: 0,
    lastCode: '',
    lastAt: 0
  };

  function libAvailable() { return typeof global.Html5Qrcode !== 'undefined'; }

  function supportedFormats() {
    if (typeof global.Html5QrcodeSupportedFormats === 'undefined') return undefined;
    var F = global.Html5QrcodeSupportedFormats;
    return [F.QR_CODE, F.CODE_128, F.EAN_13, F.EAN_8, F.CODE_39, F.UPC_A].filter(function (v) { return v !== undefined; });
  }

  function technologyFromFormat(formatName, value) {
    var f = String(formatName || '').toUpperCase();
    if (f.indexOf('QR') !== -1) return 'QR';
    if (f.indexOf('EAN_13') !== -1 || f.indexOf('EAN13') !== -1) return 'EAN13';
    if (f.indexOf('CODE_128') !== -1 || f.indexOf('CODE128') !== -1) return 'CODE128';
    if (f) return f;
    // Sin metadatos del lector: se deduce del valor leído.
    if (/^\d{13}$/.test(String(value || ''))) return 'EAN13';
    if (String(value || '').charAt(0) === '{') return 'QR';
    return 'CODE128';
  }

  /* ============================================================
     CÁMARA
     ============================================================ */
  function ensureInstance() {
    if (state.instance) return state.instance;
    state.instance = new global.Html5Qrcode(READER_ID, {
      formatsToSupport: supportedFormats(),
      verbose: false
    });
    return state.instance;
  }

  function startCamera() {
    var root = document.getElementById('view-scanner');
    var statusBox = U.$('[data-scan="status"]', root);

    if (!libAvailable()) {
      statusBox.innerHTML = '<div class="banner banner--danger">No se pudo cargar la biblioteca de lectura (html5-qrcode). ' +
        'Verifique su conexión o use la lectura desde imagen.</div>';
      return Promise.reject(new Error('Biblioteca no disponible'));
    }
    if (!LT.Geo.isSecureOk()) {
      statusBox.innerHTML = '<div class="banner banner--warn"><div><div class="banner__title">Cámara no disponible</div>' +
        '<div class="txt-xs">' + U.esc(LT.Geo.HTTPS_NOTICE) + '</div></div></div>';
      return Promise.reject(new Error(LT.Geo.HTTPS_NOTICE));
    }
    if (state.running) return Promise.resolve();

    statusBox.innerHTML = '<div class="loader"><span class="spinner"></span>Solicitando acceso a la cámara…</div>';

    return global.Html5Qrcode.getCameras()
      .then(function (devices) {
        state.cameras = devices || [];
        var config = {
          fps: 10,
          qrbox: function (w, h) {
            var size = Math.floor(Math.min(w, h) * 0.75);
            return { width: size, height: Math.max(120, Math.floor(size * 0.65)) };
          },
          aspectRatio: 1.33,
          experimentalFeatures: { useBarCodeDetectorIfSupported: true }
        };
        var target;
        if (state.cameras.length) {
          var idx = Math.min(state.cameraIndex, state.cameras.length - 1);
          // Prioriza la cámara trasera en la primera ejecución.
          if (!state.cameraIndex) {
            var back = state.cameras.filter(function (c) { return /back|rear|trasera|environment/i.test(c.label || ''); })[0];
            if (back) idx = state.cameras.indexOf(back);
          }
          state.cameraIndex = idx;
          target = { deviceId: { exact: state.cameras[idx].id } };
        } else {
          target = { facingMode: 'environment' };
        }
        return ensureInstance().start(target, config, onDecoded, onDecodeFailure);
      })
      .then(function () {
        state.running = true;
        statusBox.innerHTML = '<div class="banner banner--ok txt-xs">Cámara activa. Enfoque el código dentro del recuadro.</div>';
        syncButtons();
        U.$$('[data-scan="switch"]').forEach(function (b) {
          b.classList.toggle('hidden', state.cameras.length < 2);
        });
      })
      .catch(function (err) {
        state.running = false;
        syncButtons();
        var msg = String(err && err.message ? err.message : err);
        statusBox.innerHTML = '<div class="banner banner--danger"><div>' +
          '<div class="banner__title">No fue posible iniciar la cámara</div>' +
          '<div class="txt-xs">' + U.esc(msg) + '</div>' +
          '<div class="txt-xs">Alternativas: cargue una imagen del código o introduzca el valor manualmente.</div></div></div>';
        throw err;
      });
  }

  function stopCamera() {
    if (!state.instance || !state.running) { syncButtons(); return Promise.resolve(); }
    return state.instance.stop()
      .then(function () {
        state.running = false;
        try { state.instance.clear(); } catch (e) { /* el contenedor ya pudo limpiarse */ }
        var root = document.getElementById('view-scanner');
        var statusBox = root && U.$('[data-scan="status"]', root);
        if (statusBox) statusBox.innerHTML = '<div class="banner txt-xs">Cámara detenida.</div>';
        syncButtons();
      })
      .catch(function () { state.running = false; syncButtons(); });
  }

  function switchCamera() {
    if (state.cameras.length < 2) { UI.info('Una sola cámara', 'El dispositivo no expone cámaras adicionales.'); return; }
    state.cameraIndex = (state.cameraIndex + 1) % state.cameras.length;
    stopCamera().then(function () { startCamera(); });
  }

  function syncButtons() {
    var root = document.getElementById('view-scanner');
    if (!root) return;
    var startBtn = U.$('[data-scan="start"]', root);
    var stopBtn = U.$('[data-scan="stop"]', root);
    if (startBtn) startBtn.classList.toggle('hidden', state.running);
    if (stopBtn) stopBtn.classList.toggle('hidden', !state.running);
  }

  function onDecodeFailure() { /* fotogramas sin código: silencioso por diseño */ }

  function onDecoded(decodedText, decodedResult) {
    var now = Date.now();
    // Anti-rebote: el mismo código no se procesa dos veces en 2,5 s.
    if (decodedText === state.lastCode && (now - state.lastAt) < 2500) return;
    state.lastCode = decodedText;
    state.lastAt = now;

    var formatName = '';
    try { formatName = decodedResult.result.format.formatName; } catch (e) { formatName = ''; }

    if (global.navigator && navigator.vibrate) { try { navigator.vibrate(60); } catch (e) { /* opcional */ } }
    stopCamera();
    handleCode(decodedText, technologyFromFormat(formatName, decodedText));
  }

  /* ============================================================
     RESOLUCIÓN DEL CÓDIGO LEÍDO
     ============================================================ */
  function handleCode(rawValue, technology) {
    var root = document.getElementById('view-scanner');
    var resultBox = U.$('[data-scan="result"]', root);
    var parsed = LT.Code.parseQrPayload(rawValue);
    var lookupValue = parsed.id;

    UI.loading(resultBox, 'Consultando producto e historial…');
    UI.announce('Código leído. Consultando producto.');

    LT.API.findProductByCode(lookupValue)
      .then(function (res) {
        if (!res.product) {
          // Segundo intento: valor completo tal cual se leyó.
          if (lookupValue !== rawValue) return LT.API.findProductByCode(rawValue);
          return res;
        }
        return res;
      })
      .then(function (res) {
        if (!res || !res.product) {
          renderUnknown(resultBox, rawValue, technology, parsed);
          return;
        }
        renderProductSheet(resultBox, res.product, res.events, {
          readValue: rawValue,
          technology: technology,
          when: new Date(),
          structured: parsed.structured
        });
        UI.ok('Producto identificado', res.product.NOMBRE);
      })
      .catch(function (err) {
        UI.errorState(resultBox, err.message, function () { handleCode(rawValue, technology); });
      });
  }

  function renderUnknown(container, rawValue, technology, parsed) {
    container.innerHTML =
      '<div class="card"><div class="card__body">' +
        '<div class="banner banner--danger mb-4"><div>' +
          '<div class="banner__title">Ningún producto corresponde al código leído</div>' +
          '<div class="txt-xs">El identificador existe físicamente pero no está registrado en LogiTrace.</div>' +
        '</div></div>' +
        '<dl class="dl-grid">' +
          '<div><dt>Valor leído</dt><dd class="mono break">' + U.esc(rawValue) + '</dd></div>' +
          '<div><dt>Tecnología</dt><dd>' + U.esc(technology) + '</dd></div>' +
          '<div><dt>Contenido QR</dt><dd>' + (parsed && parsed.structured ? 'Estructurado (JSON)' : 'Simple / lineal') + '</dd></div>' +
          '<div><dt>Fecha de lectura</dt><dd>' + U.esc(U.fmtDate(new Date())) + '</dd></div>' +
        '</dl>' +
        '<div class="row mt-4">' +
          '<button class="btn btn--primary" type="button" data-unknown="create">Registrar producto con este código</button>' +
          '<button class="btn btn--ghost" type="button" data-unknown="again">Escanear de nuevo</button>' +
        '</div>' +
      '</div></div>';

    U.$('[data-unknown="create"]', container).addEventListener('click', function () {
      LT.Products.openForm(null, { prefillCode: rawValue, technology: technology });
    });
    U.$('[data-unknown="again"]', container).addEventListener('click', function () {
      U.clear(container);
      startCamera();
    });
  }

  /* ============================================================
     FICHA COMPLETA DEL PRODUCTO (resultado del escaneo)
     ============================================================ */
  function renderProductSheet(container, product, events, opts) {
    var o = opts || {};
    var evs = events || [];
    var idxPromise = LT.API.getLocations().then(LT.Locations.buildIndex);

    var trace = LT.API.buildTrace(product, evs);
    var summary = trace.summary;
    var geoSummary = trace.geoSummary;
    var lastEvent = trace.events.length ? trace.events[trace.events.length - 1] : null;
    var st = U.stockState(product.CANTIDAD);

    container.innerHTML =
      /* --- 1. Identificación --- */
      '<div class="card mb-4"><div class="card__head"><div>' +
          '<div class="card__title">Identificación</div>' +
          '<div class="card__desc">Datos de la lectura realizada</div></div>' +
          '<span class="spacer"></span>' + UI.badge('Lectura válida', 'ok', '✓') +
        '</div><div class="card__body">' +
        '<dl class="dl-grid">' +
          '<div><dt>Valor leído</dt><dd class="mono break">' + U.esc(o.readValue || product.ID_PRODUCTO) + '</dd></div>' +
          '<div><dt>Tecnología</dt><dd>' + U.esc(o.technology || product.TIPO_IDENTIFICACION || '—') +
            (o.structured ? ' ' + UI.badge('QR estructurado', 'info') : '') + '</dd></div>' +
          '<div><dt>Fecha y hora de lectura</dt><dd>' + U.esc(U.fmtDate(o.when || new Date())) + '</dd></div>' +
        '</dl></div></div>' +

      /* --- 2. Producto --- */
      '<div class="card mb-4"><div class="card__head"><div>' +
          '<div class="card__title">' + U.esc(product.NOMBRE) + '</div>' +
          '<div class="card__desc mono">' + U.esc(product.ID_PRODUCTO) + '</div></div>' +
          '<span class="spacer"></span>' + UI.badge(st.label, st.kind) +
        '</div><div class="card__body">' +
        '<dl class="dl-grid">' +
          '<div><dt>Descripción</dt><dd>' + U.esc(product.DESCRIPCION || '—') + '</dd></div>' +
          '<div><dt>Categoría</dt><dd>' + U.esc(product.CATEGORIA || '—') + '</dd></div>' +
          '<div><dt>Lote</dt><dd>' + U.esc(product.LOTE || '—') + '</dd></div>' +
          '<div><dt>Stock actual</dt><dd>' + U.esc(U.fmtNum(product.CANTIDAD)) + '</dd></div>' +
          '<div><dt>Ubicación actual</dt><dd data-sheet="locCurrent">' + U.esc(product.UBICACION_ACTUAL || '—') + '</dd></div>' +
          '<div><dt>Origen</dt><dd data-sheet="locOrigin">' + U.esc(product.ORIGEN || '—') + '</dd></div>' +
          '<div><dt>Destino</dt><dd data-sheet="locDest">' + U.esc(product.DESTINO || '—') + '</dd></div>' +
          '<div><dt>Vencimiento</dt><dd>' + (product.FECHA_VENCIMIENTO ? U.esc(U.fmtDateOnly(product.FECHA_VENCIMIENTO)) : '—') + '</dd></div>' +
          '<div><dt>Estado</dt><dd>' + U.esc(product.ESTADO || 'ACTIVO') + '</dd></div>' +
          '<div><dt>Última actualización</dt><dd>' + U.esc(U.fmtDate(product.ULTIMA_ACTUALIZACION)) + '</dd></div>' +
        '</dl></div></div>' +

      /* --- 3. Identificadores visibles (gráficos, no sólo texto) --- */
      '<div class="card mb-4"><div class="card__head"><div>' +
          '<div class="card__title">Identificadores</div>' +
          '<div class="card__desc">Representación gráfica de los códigos asignados</div></div></div>' +
        '<div class="card__body" data-sheet="identifiers"></div></div>' +

      /* --- 4. Resumen histórico --- */
      '<div class="grid grid--kpi mb-4">' +
        '<div class="kpi kpi--info"><div class="kpi__label">Eventos</div><div class="kpi__value">' + summary.eventos + '</div></div>' +
        '<div class="kpi kpi--ok"><div class="kpi__label">Unidades recibidas</div><div class="kpi__value">' + U.fmtNum(summary.unidadesRecibidas) + '</div></div>' +
        '<div class="kpi kpi--warn"><div class="kpi__label">Unidades despachadas</div><div class="kpi__value">' + U.fmtNum(summary.unidadesDespachadas) + '</div></div>' +
        '<div class="kpi kpi--accent"><div class="kpi__label">Devoluciones</div><div class="kpi__value">' + U.fmtNum(summary.devoluciones) + '</div></div>' +
        '<div class="kpi kpi--danger"><div class="kpi__label">Incidencias</div><div class="kpi__value">' + summary.incidencias + '</div></div>' +
      '</div>' +

      /* --- 5. Trazabilidad (timeline completo) --- */
      '<div class="card mb-4"><div class="card__head"><div>' +
          '<div class="card__title">Trazabilidad</div>' +
          '<div class="card__desc">Historial cronológico completo. Los eventos nunca se eliminan.</div></div></div>' +
        '<div class="card__body" data-sheet="timeline"></div></div>' +

      /* --- 6. Información geográfica --- */
      '<div class="card mb-4"><div class="card__head"><div>' +
          '<div class="card__title">Información geográfica</div>' +
          '<div class="card__desc">Último evento y resumen de validaciones</div></div>' +
          '<span class="spacer"></span>' + (lastEvent ? UI.geoBadge(lastEvent.VALIDACION_GEO) : '') +
        '</div><div class="card__body">' +
          (lastEvent ? LT.Geo.eventGeoHtml(lastEvent) : '<div class="txt-sm txt-muted">Sin eventos registrados.</div>') +
          '<div class="grid grid--kpi mt-4">' +
            '<div class="kpi kpi--info"><div class="kpi__label">Georreferenciados</div><div class="kpi__value">' + geoSummary.georreferenciados + '</div></div>' +
            '<div class="kpi kpi--ok"><div class="kpi__label">✓ OK</div><div class="kpi__value">' + geoSummary.ok + '</div></div>' +
            '<div class="kpi kpi--danger"><div class="kpi__label">⚠ Fuera geocerca</div><div class="kpi__value">' + geoSummary.fueraGeocerca + '</div></div>' +
            '<div class="kpi kpi--warn"><div class="kpi__label">◉ Baja precisión</div><div class="kpi__value">' + geoSummary.bajaPrecision + '</div></div>' +
            '<div class="kpi"><div class="kpi__label">— Sin GPS</div><div class="kpi__value">' + geoSummary.sinGps + '</div></div>' +
          '</div>' +
          (lastEvent && U.isValidLat(lastEvent.LAT_CAPTURADA)
            ? '<div class="map-canvas map-canvas--sm mt-4" data-sheet="map"></div>' +
              '<div class="print-map-note">Mapa disponible únicamente en pantalla.</div>'
            : '<div class="banner banner--warn txt-xs mt-4">El último evento no tiene coordenadas: no se representa en el mapa.</div>') +
        '</div></div>' +

      /* --- 7. Acciones --- */
      '<div class="row">' +
        '<button class="btn btn--primary" type="button" data-sheet-act="event">Registrar nuevo evento</button>' +
        '<button class="btn btn--ghost" type="button" data-sheet-act="trace">Ver trazabilidad completa</button>' +
        '<button class="btn btn--ghost" type="button" data-sheet-act="map">Ver en mapa</button>' +
        '<button class="btn btn--subtle" type="button" data-sheet-act="label">Imprimir etiqueta</button>' +
        '<button class="btn btn--subtle" type="button" data-sheet-act="again">Escanear otro</button>' +
      '</div>';

    /* --- Identificadores gráficos --- */
    LT.Code.renderIdentifierGallery(U.$('[data-sheet="identifiers"]', container), product, { actions: true });

    /* --- Timeline --- */
    idxPromise.then(function (idx) {
      LT.Trace.renderTimeline(U.$('[data-sheet="timeline"]', container), trace.events, idx);
      // Nombres legibles de ubicaciones
      var setName = function (sel, id) {
        var node = U.$('[data-sheet="' + sel + '"]', container);
        if (node && id) node.textContent = LT.Locations.labelOf(idx, id);
      };
      setName('locCurrent', product.UBICACION_ACTUAL);
      setName('locOrigin', product.ORIGEN);
      setName('locDest', product.DESTINO);

      var mapEl = U.$('[data-sheet="map"]', container);
      if (mapEl && lastEvent) {
        setTimeout(function () {
          LT.Maps.showSinglePoint(mapEl, null, U.toNumber(lastEvent.LAT_CAPTURADA), U.toNumber(lastEvent.LON_CAPTURADA), {
            label: lastEvent.EVENTO + ' · ' + U.fmtDate(lastEvent.FECHA_HORA),
            accuracy: lastEvent.PRECISION_M
          });
        }, 150);
      }
    });

    /* --- Acciones --- */
    U.$$('[data-sheet-act]', container).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var act = btn.dataset.sheetAct;
        if (act === 'event') {
          LT.Events.openForm(product, {
            readValue: o.readValue, technology: o.technology,
            onSaved: function () {
              LT.API.getProduct(product.ID_PRODUCTO).then(function (fresh) {
                LT.API.getEvents(product.ID_PRODUCTO).then(function (list) {
                  renderProductSheet(container, fresh, list, o);
                });
              });
            }
          });
        } else if (act === 'trace') {
          LT.Router.go('traceability', { productId: product.ID_PRODUCTO });
        } else if (act === 'map') {
          LT.Router.go('map', { productId: product.ID_PRODUCTO });
        } else if (act === 'label') {
          LT.Code.openLabelModal(product);
        } else if (act === 'again') {
          U.clear(container);
          startCamera();
        }
      });
    });
  }

  /* ============================================================
     VISTA ESCÁNER
     ============================================================ */
  function initView() {
    var root = document.getElementById('view-scanner');
    if (!root || root.__ready) return;
    root.__ready = true;

    var httpsBox = U.$('[data-scan="https"]', root);
    httpsBox.innerHTML = LT.Geo.httpsBannerHtml();

    U.$('[data-scan="start"]', root).addEventListener('click', function () { startCamera(); });
    U.$('[data-scan="stop"]', root).addEventListener('click', function () { stopCamera(); });
    U.$('[data-scan="switch"]', root).addEventListener('click', switchCamera);

    /* Lectura desde imagen */
    var fileInput = U.$('[name="scanFile"]', root);
    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      if (!libAvailable()) { UI.error('Biblioteca no disponible', 'No se pudo cargar html5-qrcode.'); return; }
      var statusBox = U.$('[data-scan="status"]', root);
      statusBox.innerHTML = '<div class="loader"><span class="spinner"></span>Procesando imagen…</div>';
      stopCamera().then(function () {
        var scanner = ensureInstance();
        scanner.scanFile(file, false)
          .then(function (decodedText) {
            statusBox.innerHTML = '<div class="banner banner--ok txt-xs">Código detectado en la imagen.</div>';
            handleCode(decodedText, technologyFromFormat('', decodedText));
          })
          .catch(function (err) {
            statusBox.innerHTML = '<div class="banner banner--danger"><div>' +
              '<div class="banner__title">No se detectó ningún código en la imagen</div>' +
              '<div class="txt-xs">' + U.esc(String(err && err.message ? err.message : err)) + '</div>' +
              '<div class="txt-xs">Sugerencias: mejore el enfoque, recorte el código o aumente el contraste.</div></div></div>';
          })
          .then(function () { fileInput.value = ''; });
      });
    });

    /* Entrada manual (respaldo cuando no hay cámara) */
    var manualForm = U.$('[data-scan="manual-form"]', root);
    manualForm.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var value = String(U.$('[name="scanManual"]', root).value || '').trim();
      if (!value) { UI.warn('Introduzca un código'); return; }
      handleCode(value, technologyFromFormat('', value));
    });

    UI.initTabs(root);
    syncButtons();
  }

  /** Escaneo rápido desde el encabezado. */
  function quickScan() {
    LT.Router.go('scanner');
    setTimeout(function () { startCamera(); }, 300);
  }

  LT.Scanner = {
    initView: initView,
    startCamera: startCamera,
    stopCamera: stopCamera,
    switchCamera: switchCamera,
    handleCode: handleCode,
    renderProductSheet: renderProductSheet,
    quickScan: quickScan
  };
})(window);
