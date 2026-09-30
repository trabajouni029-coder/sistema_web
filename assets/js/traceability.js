/* ============================================================
   LogiTrace — traceability.js
   Vista profesional de trazabilidad por producto:
   cabecera, identificadores visibles, KPIs, timeline completo,
   trayectoria geográfica numerada y KPIs geográficos.
   Expone: window.LT.Trace
   ============================================================ */
(function (global) {
  'use strict';

  var LT = global.LT = global.LT || {};
  var U = LT.U;
  var UI = LT.UI;

  var current = { productId: null };

  /* ============================================================
     TIMELINE
     Un elemento por evento, con todos los campos exigidos.
     ============================================================ */
  function renderTimeline(container, events, idx) {
    if (!container) return;
    var list = events || [];
    if (!list.length) {
      UI.empty(container, {
        icon: '◷', title: 'Sin eventos registrados',
        desc: 'El historial se construye a medida que se registran eventos logísticos.'
      });
      return;
    }

    var ordered = U.sortBy(list, function (e) {
      var d = U.parseDate(e.FECHA_HORA);
      return d ? d.getTime() : 0;
    }, 'asc');

    var geoSeq = 0;
    container.innerHTML = '<ol class="timeline">' + ordered.map(function (ev, i) {
      var def = U.eventByAny(ev.EVENTO);
      var cls = def ? def.tl : 'plain';
      var g = U.geoInfo(ev.VALIDACION_GEO);
      var hasCoords = U.isValidLat(ev.LAT_CAPTURADA) && U.isValidLon(ev.LON_CAPTURADA);
      if (hasCoords) geoSeq++;
      return '<li class="tl-item tl-item--' + cls + '">' +
        '<div class="tl-head">' +
          '<span class="tl-event">' + (i + 1) + '. ' + U.esc(def ? def.label : ev.EVENTO) + '</span>' +
          UI.geoBadge(ev.VALIDACION_GEO) +
          (hasCoords ? UI.badge('punto ' + geoSeq + ' de la trayectoria', 'outline') : '') +
          '<span class="spacer"></span>' +
          '<span class="tl-date">' + U.esc(U.fmtDate(ev.FECHA_HORA)) + '</span>' +
        '</div>' +
        '<div class="tl-body">' +
          '<dl class="tl-grid">' +
            '<div><dt>Cantidad</dt><dd>' + U.fmtNum(ev.CANTIDAD_MOVIMIENTO) + '</dd></div>' +
            '<div><dt>Stock antes → después</dt><dd class="stock-move">' + U.esc(ev.STOCK_ANTES) + ' &rarr; ' + U.esc(ev.STOCK_DESPUES) + '</dd></div>' +
            '<div><dt>Actor</dt><dd>' + U.esc(ev.ACTOR || '—') + '</dd></div>' +
            '<div><dt>Ubicación origen</dt><dd>' + U.esc(nameOf(idx, ev.UBICACION_ORIGEN)) + '</dd></div>' +
            '<div><dt>Ubicación destino</dt><dd>' + U.esc(nameOf(idx, ev.UBICACION_DESTINO)) + '</dd></div>' +
            '<div><dt>Código leído</dt><dd class="mono txt-xs">' + U.esc(ev.CODIGO_LEIDO || '—') + '</dd></div>' +
            '<div><dt>Tecnología</dt><dd>' + U.esc(ev.TIPO_IDENTIFICACION || '—') + '</dd></div>' +
            '<div><dt>Estado</dt><dd>' + U.esc(ev.ESTADO || '—') + '</dd></div>' +
            '<div><dt>Ubicación declarada</dt><dd>' + U.esc(nameOf(idx, ev.ID_UBICACION_DECLARADA)) + '</dd></div>' +
            '<div><dt>Posición capturada</dt><dd class="mono txt-xs">' + (hasCoords ? U.fmtCoord(ev.LAT_CAPTURADA, ev.LON_CAPTURADA) : '—') + '</dd></div>' +
            '<div><dt>Precisión</dt><dd>' + (ev.PRECISION_M === '' || ev.PRECISION_M === null || ev.PRECISION_M === undefined ? '—' : '±' + U.fmtMeters(ev.PRECISION_M)) + '</dd></div>' +
            '<div><dt>Distancia declarada</dt><dd>' + U.fmtMeters(ev.DISTANCIA_DECLARADA_M) + '</dd></div>' +
            '<div><dt>Fuente de ubicación</dt><dd>' + U.esc(ev.FUENTE_UBICACION || '—') + '</dd></div>' +
            '<div><dt>Validación geo</dt><dd>' + g.sym + ' ' + U.esc(g.label) + '</dd></div>' +
          '</dl>' +
          (ev.OBSERVACION ? '<div class="txt-xs txt-soft mt-2"><b>Observación:</b> ' + U.esc(ev.OBSERVACION) + '</div>' : '') +
          '<div class="txt-xs txt-muted mt-2 mono">' + U.esc(ev.ID_EVENTO || '') + '</div>' +
        '</div>' +
        '</li>';
    }).join('') + '</ol>';
  }

  function nameOf(idx, id) {
    if (!id) return '—';
    if (!idx) return id;
    var l = LT.Locations.get(idx, id);
    return l ? l.NOMBRE + ' (' + l.ID_UBICACION + ')' : id;
  }

  /* ============================================================
     VISTA TRAZABILIDAD
     ============================================================ */
  function initView() {
    var root = document.getElementById('view-traceability');
    if (!root || root.__ready) return;
    root.__ready = true;

    var sel = U.$('[name="traceProduct"]', root);
    sel.addEventListener('change', function () {
      if (sel.value) open(sel.value);
      else showPlaceholder();
    });

    U.$('[data-trace-action="reload"]', root).addEventListener('click', function () {
      LT.API.invalidate();
      if (current.productId) open(current.productId, true);
    });

    fillProducts().then(function () {
      if (current.productId) open(current.productId);
      else showPlaceholder();
    });
  }

  function fillProducts(selected) {
    var root = document.getElementById('view-traceability');
    if (!root) return Promise.resolve();
    var sel = U.$('[name="traceProduct"]', root);
    return LT.API.getProducts().then(function (products) {
      UI.fillSelect(sel, U.sortBy(products, function (p) { return p.NOMBRE; }).map(function (p) {
        return { value: p.ID_PRODUCTO, label: p.NOMBRE + ' — ' + p.ID_PRODUCTO };
      }), { placeholder: '— Seleccione un producto —', value: selected || current.productId || '' });
      return products;
    });
  }

  function showPlaceholder() {
    var box = U.$('[data-trace="content"]', document.getElementById('view-traceability'));
    UI.empty(box, {
      icon: '◈',
      title: 'Seleccione un producto',
      desc: 'La trazabilidad muestra identificadores, historial cronológico y recorrido geográfico.',
      actionLabel: 'Abrir escáner',
      onAction: function () { LT.Router.go('scanner'); }
    });
  }

  function open(productId, force) {
    var root = document.getElementById('view-traceability');
    if (!root) return;
    current.productId = productId;
    var box = U.$('[data-trace="content"]', root);
    var sel = U.$('[name="traceProduct"]', root);
    if (sel && sel.value !== productId) {
      fillProducts(productId).then(function () { sel.value = productId; });
    }
    UI.loading(box, 'Construyendo trazabilidad…');

    if (force) LT.API.invalidate();

    Promise.all([LT.API.getTrace(productId), LT.API.getLocations()])
      .then(function (res) {
        var trace = res[0];
        var idx = LT.Locations.buildIndex(res[1]);
        render(box, trace, idx);
      })
      .catch(function (err) {
        UI.errorState(box, err.message, function () { open(productId, true); });
      });
  }

  function render(box, trace, idx) {
    var p = trace.product || {};
    var s = trace.summary || {};
    var g = trace.geoSummary || {};
    var st = U.stockState(p.CANTIDAD);

    box.innerHTML =
      /* --- Cabecera --- */
      '<div class="card mb-4"><div class="card__head"><div>' +
          '<div class="card__title">' + U.esc(p.NOMBRE || '—') + '</div>' +
          '<div class="card__desc mono">' + U.esc(p.ID_PRODUCTO || '') + '</div></div>' +
          '<span class="spacer"></span>' + UI.badge(st.label, st.kind) +
        '</div><div class="card__body">' +
        '<dl class="dl-grid">' +
          '<div><dt>Categoría</dt><dd>' + U.esc(p.CATEGORIA || '—') + '</dd></div>' +
          '<div><dt>Lote</dt><dd>' + U.esc(p.LOTE || '—') + '</dd></div>' +
          '<div><dt>Stock actual</dt><dd>' + U.esc(U.fmtNum(p.CANTIDAD)) + '</dd></div>' +
          '<div><dt>Ubicación actual</dt><dd>' + U.esc(nameOf(idx, p.UBICACION_ACTUAL)) + '</dd></div>' +
          '<div><dt>Origen</dt><dd>' + U.esc(nameOf(idx, p.ORIGEN)) + '</dd></div>' +
          '<div><dt>Destino</dt><dd>' + U.esc(nameOf(idx, p.DESTINO)) + '</dd></div>' +
          '<div><dt>Vencimiento</dt><dd>' + (p.FECHA_VENCIMIENTO ? U.esc(U.fmtDateOnly(p.FECHA_VENCIMIENTO)) : '—') + '</dd></div>' +
          '<div><dt>Registrado</dt><dd>' + U.esc(U.fmtDate(p.FECHA_REGISTRO)) + '</dd></div>' +
        '</dl>' +
        '<div class="row mt-4">' +
          '<button class="btn btn--primary btn--sm" type="button" data-tr-act="event">Registrar evento</button>' +
          '<button class="btn btn--ghost btn--sm" type="button" data-tr-act="label">Imprimir etiqueta</button>' +
          '<button class="btn btn--ghost btn--sm" type="button" data-tr-act="map">Ver en mapa general</button>' +
          '<button class="btn btn--subtle btn--sm" type="button" data-tr-act="geojson">Exportar eventos GeoJSON</button>' +
        '</div>' +
        '</div></div>' +

      /* --- Identificadores visibles (no sólo al imprimir) --- */
      '<div class="card mb-4"><div class="card__head"><div>' +
          '<div class="card__title">Identificadores del producto</div>' +
          '<div class="card__desc">Código de barras, QR y RFID simulado siempre visibles</div></div></div>' +
        '<div class="card__body" data-tr="identifiers"></div></div>' +

      /* --- KPIs logísticos --- */
      '<div class="grid grid--kpi mb-4">' +
        '<div class="kpi kpi--info"><div class="kpi__label">Eventos</div><div class="kpi__value">' + (s.eventos || 0) + '</div></div>' +
        '<div class="kpi kpi--ok"><div class="kpi__label">Recibido</div><div class="kpi__value">' + U.fmtNum(s.unidadesRecibidas) + '</div></div>' +
        '<div class="kpi kpi--warn"><div class="kpi__label">Despachado</div><div class="kpi__value">' + U.fmtNum(s.unidadesDespachadas) + '</div></div>' +
        '<div class="kpi kpi--accent"><div class="kpi__label">Devuelto</div><div class="kpi__value">' + U.fmtNum(s.devoluciones) + '</div></div>' +
        '<div class="kpi kpi--danger"><div class="kpi__label">Incidencias</div><div class="kpi__value">' + (s.incidencias || 0) + '</div></div>' +
      '</div>' +

      /* --- KPIs geográficos --- */
      '<div class="grid grid--kpi mb-4">' +
        '<div class="kpi kpi--info"><div class="kpi__label">Eventos georreferenciados</div><div class="kpi__value">' + (g.georreferenciados || 0) + '</div></div>' +
        '<div class="kpi kpi--ok"><div class="kpi__label">✓ OK</div><div class="kpi__value">' + (g.ok || 0) + '</div></div>' +
        '<div class="kpi kpi--danger"><div class="kpi__label">⚠ Fuera de geocerca</div><div class="kpi__value">' + (g.fueraGeocerca || 0) + '</div></div>' +
        '<div class="kpi kpi--warn"><div class="kpi__label">◉ Baja precisión</div><div class="kpi__value">' + (g.bajaPrecision || 0) + '</div></div>' +
        '<div class="kpi"><div class="kpi__label">— Sin GPS</div><div class="kpi__value">' + (g.sinGps || 0) + '</div></div>' +
        '<div class="kpi kpi--accent"><div class="kpi__label">Distancia geodésica</div>' +
          '<div class="kpi__value">' + U.fmtMeters(g.distanciaGeodesicaM) + '</div>' +
          '<div class="kpi__hint">Suma de tramos entre puntos consecutivos</div></div>' +
      '</div>' +
      '<div class="banner banner--info txt-xs mb-4">La distancia entre puntos es una aproximación geodésica (Haversine): ' +
        'no equivale necesariamente a la distancia vial recorrida.</div>' +

      /* --- Trayectoria geográfica --- */
      '<div class="card mb-4"><div class="card__head"><div>' +
          '<div class="card__title">Trayectoria geográfica</div>' +
          '<div class="card__desc">Eventos con coordenadas ordenados por fecha: 1 → 2 → 3 …</div></div></div>' +
        '<div class="card__body">' +
          (trace.trajectory && trace.trajectory.length
            ? '<div class="map-canvas map-canvas--md" data-tr="map"></div>' + LT.Maps.legendHtml() +
              '<div class="print-map-note">Mapa disponible únicamente en pantalla.</div>'
            : '<div class="banner banner--warn txt-sm">Este producto no tiene eventos con coordenadas. ' +
              'No se dibuja ninguna trayectoria: LogiTrace no inventa posiciones.</div>') +
        '</div></div>' +

      /* --- Timeline --- */
      '<div class="card"><div class="card__head"><div>' +
          '<div class="card__title">Historial cronológico</div>' +
          '<div class="card__desc">' + (s.eventos || 0) + ' evento(s). Ningún registro se elimina.</div></div></div>' +
        '<div class="card__body" data-tr="timeline"></div></div>';

    LT.Code.renderIdentifierGallery(U.$('[data-tr="identifiers"]', box), p, { actions: true, locationName: nameOf(idx, p.UBICACION_ACTUAL) });
    renderTimeline(U.$('[data-tr="timeline"]', box), trace.events, idx);

    var mapEl = U.$('[data-tr="map"]', box);
    if (mapEl) {
      setTimeout(function () {
        LT.Maps.drawTrajectory(mapEl, trace.events, { locationIndex: idx });
      }, 150);
    }

    U.$$('[data-tr-act]', box).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var act = btn.dataset.trAct;
        if (act === 'event') {
          LT.Events.openForm(p, { onSaved: function () { open(p.ID_PRODUCTO, true); } });
        } else if (act === 'label') {
          LT.Code.openLabelModal(p, nameOf(idx, p.UBICACION_ACTUAL));
        } else if (act === 'map') {
          LT.Router.go('map', { productId: p.ID_PRODUCTO });
        } else if (act === 'geojson') {
          LT.GeoJSON.exportEvents({ productId: p.ID_PRODUCTO });
        }
      });
    });
  }

  LT.Trace = {
    renderTimeline: renderTimeline,
    initView: initView,
    open: open,
    current: current
  };
})(window);
