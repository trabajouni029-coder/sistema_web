/* ============================================================
   LogiTrace — events.js
   Registro de eventos logísticos con confirmación explícita,
   captura geográfica y vista de consulta de eventos.

   Reglas respetadas:
   · Tras un escaneo NUNCA se registra automáticamente.
   · El backend es la autoridad sobre stock y geocerca.
   · Un evento FUERA_GEOCERCA se guarda: es evidencia de anomalía.
   Expone: window.LT.Events
   ============================================================ */
(function (global) {
  'use strict';

  var LT = global.LT = global.LT || {};
  var U = LT.U;
  var UI = LT.UI;
  var CAT = LT.CAT;

  var DRAFT_KEY = 'lt.event.draft';
  var ACTOR_KEY = 'lt.actor.last';

  /* ============================================================
     MODAL DE REGISTRO DE EVENTO
     openForm(product, { readValue, technology, onSaved })
     ============================================================ */
  function openForm(product, opts) {
    var o = opts || {};
    if (!product) { UI.warn('Sin producto', 'Identifique primero un producto.'); return; }

    var requestId = U.uuid();      // idempotencia: un intento = un CLIENT_REQUEST_ID
    var geoWidget = null;
    var body = U.el('div');

    body.innerHTML =
      '<div class="banner banner--info mb-4">' +
        '<div><div class="banner__title">' + U.esc(product.NOMBRE) + '</div>' +
        '<div class="txt-xs mono">' + U.esc(product.ID_PRODUCTO) + ' · Lote ' + U.esc(product.LOTE || '—') +
        ' · Stock actual <b>' + U.esc(U.fmtNum(product.CANTIDAD)) + '</b></div></div>' +
      '</div>' +
      '<form data-ev-form novalidate>' +
        '<div class="grid grid--form">' +
          '<div class="field">' +
            '<label class="field__label" for="evType">Evento logístico <span class="req">*</span></label>' +
            '<select id="evType" name="EVENTO"></select>' +
            '<span class="field__hint" data-ev="hint"></span>' +
            '<span class="field__error"></span>' +
          '</div>' +
          '<div class="field" data-ev="qtyField">' +
            '<label class="field__label" for="evQty">Cantidad del movimiento</label>' +
            '<input id="evQty" name="CANTIDAD_MOVIMIENTO" inputmode="numeric" value="1">' +
            '<span class="field__hint" data-ev="qtyHint"></span>' +
            '<span class="field__error"></span>' +
          '</div>' +
          '<div class="field">' +
            '<label class="field__label" for="evActor">Actor / responsable <span class="req">*</span></label>' +
            '<input id="evActor" name="ACTOR" maxlength="60" placeholder="Nombre de quien opera">' +
            '<span class="field__error"></span>' +
          '</div>' +
        '</div>' +
        '<fieldset>' +
          '<legend>Ubicaciones</legend>' +
          '<div class="grid grid--form">' +
            '<div class="field">' +
              '<label class="field__label" for="evDeclared">Ubicación declarada <span class="req">*</span></label>' +
              '<select id="evDeclared" name="ID_UBICACION_DECLARADA" data-location-select data-placeholder="— Dónde debía ocurrir —"></select>' +
              '<span class="field__hint">Contra esta ubicación se valida la geocerca en el servidor.</span>' +
              '<span class="field__error"></span>' +
            '</div>' +
            '<div class="field">' +
              '<label class="field__label" for="evFrom">Ubicación origen</label>' +
              '<select id="evFrom" name="UBICACION_ORIGEN" data-location-select data-placeholder="— Sin origen —"></select>' +
            '</div>' +
            '<div class="field">' +
              '<label class="field__label" for="evTo">Ubicación destino</label>' +
              '<select id="evTo" name="UBICACION_DESTINO" data-location-select data-placeholder="— Sin destino —"></select>' +
            '</div>' +
          '</div>' +
        '</fieldset>' +
        '<fieldset>' +
          '<legend>Posición geográfica del evento</legend>' +
          '<div data-ev="geo"></div>' +
        '</fieldset>' +
        '<div class="field">' +
          '<label class="field__label" for="evObs">Observación</label>' +
          '<textarea id="evObs" name="OBSERVACION" maxlength="300" placeholder="Detalle relevante de la operación"></textarea>' +
        '</div>' +
        '<div class="banner banner--warn" data-ev="preview"></div>' +
      '</form>';

    UI.openModal({
      title: 'Registrar evento logístico',
      size: 'wide',
      body: body,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        {
          label: 'Confirmar y registrar', kind: 'primary', close: false,
          onClick: function (btn) { submit(btn); return false; }
        }
      ]
    });

    var form = U.$('[data-ev-form]', body);
    var typeSel = U.$('[name="EVENTO"]', form);
    var qtyInput = U.$('[name="CANTIDAD_MOVIMIENTO"]', form);
    var qtyField = U.$('[data-ev="qtyField"]', body);
    var qtyHint = U.$('[data-ev="qtyHint"]', body);
    var hint = U.$('[data-ev="hint"]', body);
    var actorInput = U.$('[name="ACTOR"]', form);
    var declaredSel = U.$('[name="ID_UBICACION_DECLARADA"]', form);
    var fromSel = U.$('[name="UBICACION_ORIGEN"]', form);
    var toSel = U.$('[name="UBICACION_DESTINO"]', form);
    var previewBox = U.$('[data-ev="preview"]', body);

    UI.fillSelect(typeSel, CAT.EVENTS.map(function (e) { return { value: e.label, label: e.label }; }),
      { placeholder: '— Seleccione evento —' });

    actorInput.value = U.readJson(ACTOR_KEY, '') || '';

    LT.API.getLocations().then(function (list) {
      [declaredSel, fromSel, toSel].forEach(function (sel) {
        LT.Locations.fillLocationSelect(sel, list, { placeholder: sel.dataset.placeholder });
      });
      if (product.UBICACION_ACTUAL) declaredSel.value = product.UBICACION_ACTUAL;
      if (product.UBICACION_ACTUAL) fromSel.value = product.UBICACION_ACTUAL;
      if (geoWidget) geoWidget.refreshPreview();
      paint();
    });

    geoWidget = LT.Geo.create(U.$('[data-ev="geo"]', body), {
      getDeclaredLocationId: function () { return declaredSel.value; },
      onChange: function () { paint(); }
    });

    function currentDef() { return U.eventByAny(typeSel.value); }

    function paint() {
      var def = currentDef();
      var before = U.toNumber(product.CANTIDAD, 0) || 0;
      if (!def) {
        hint.textContent = 'Seleccione el tipo de evento para ver su efecto sobre el inventario.';
        qtyField.classList.add('hidden');
        previewBox.innerHTML = '';
        return;
      }
      hint.textContent = def.hint;
      var needsQty = def.qty;
      qtyField.classList.toggle('hidden', !needsQty);
      qtyHint.textContent = def.stock === 1 ? 'Se sumará al stock actual.'
        : def.stock === -1 ? 'Se restará del stock actual. No se permite stock negativo.'
        : 'Este evento no modifica el inventario.';

      var qty = needsQty ? (U.toNumber(qtyInput.value, 0) || 0) : 0;
      var after = before;
      if (def.stock === 1) after = before + qty;
      if (def.stock === -1) after = before - qty;

      var insufficient = def.stock === -1 && qty > before;
      var geoVal = geoWidget ? geoWidget.getValue() : { source: 'SIN_GPS' };

      previewBox.className = 'banner banner--' + (insufficient ? 'danger' : 'info');
      previewBox.innerHTML =
        '<div><div class="banner__title">Resumen del movimiento</div>' +
        '<div class="txt-xs">' +
          'Stock: <span class="stock-move"><b>' + before + '</b> &rarr; <b>' + (insufficient ? '—' : after) + '</b></span>' +
          (insufficient ? ' · <b>Stock insuficiente: el servidor rechazará la operación.</b>' : '') +
          ' · Posición: ' + (geoVal.source === 'SIN_GPS' ? 'sin GPS (se guardará como SIN_GPS)' : geoVal.source) +
        '</div>' +
        '<div class="txt-xs txt-muted">El cálculo definitivo lo realiza Apps Script con LockService.</div></div>';
    }

    typeSel.addEventListener('change', function () {
      var def = currentDef();
      if (def && !def.qty) qtyInput.value = '0';
      if (def && def.qty && (!qtyInput.value || qtyInput.value === '0')) qtyInput.value = '1';
      paint();
    });
    qtyInput.addEventListener('input', paint);
    declaredSel.addEventListener('change', function () {
      if (geoWidget) geoWidget.refreshPreview();
      paint();
    });

    paint();

    function submit(btn) {
      UI.clearErrors(form);
      var data = UI.readForm(form);
      var def = U.eventByAny(data.EVENTO);
      var errors = 0;

      if (!def) { UI.fieldError('EVENTO', 'Seleccione el tipo de evento.', form); errors++; }
      if (!data.ACTOR) { UI.fieldError('ACTOR', 'Indique el actor responsable.', form); errors++; }
      if (!data.ID_UBICACION_DECLARADA) {
        UI.fieldError('ID_UBICACION_DECLARADA', 'La ubicación declarada es obligatoria para validar la geocerca.', form);
        errors++;
      }
      if (def && def.qty) {
        var qty = U.toNumber(data.CANTIDAD_MOVIMIENTO, null);
        if (qty === null || qty <= 0) {
          UI.fieldError('CANTIDAD_MOVIMIENTO', 'Indique una cantidad mayor que cero.', form); errors++;
        } else if (def.stock === -1 && qty > (U.toNumber(product.CANTIDAD, 0) || 0)) {
          UI.fieldError('CANTIDAD_MOVIMIENTO', 'Stock insuficiente: disponible ' + product.CANTIDAD + '.', form); errors++;
        }
      }
      if (errors) { UI.warn('Revise el formulario', errors + ' campo(s) requieren corrección.'); return; }

      if (navigator.onLine === false && !LT.API.useLocal()) {
        U.writeJson(DRAFT_KEY, { productId: product.ID_PRODUCTO, data: data, savedAt: U.nowIso() });
        UI.error('Sin conexión', 'El evento NO se registró. El formulario quedó guardado: reintente cuando recupere Internet.');
        return;
      }

      var geo = geoWidget.getValue();
      var payload = {
        CLIENT_REQUEST_ID: requestId,
        ID_PRODUCTO: product.ID_PRODUCTO,
        TIPO_IDENTIFICACION: o.technology || product.TIPO_IDENTIFICACION || '',
        CODIGO_LEIDO: o.readValue || product.CODIGO_1D || product.ID_PRODUCTO,
        EVENTO: def.label,
        CANTIDAD_MOVIMIENTO: def.qty ? U.toNumber(data.CANTIDAD_MOVIMIENTO, 0) : 0,
        UBICACION: data.ID_UBICACION_DECLARADA,
        UBICACION_ORIGEN: data.UBICACION_ORIGEN || '',
        UBICACION_DESTINO: data.UBICACION_DESTINO || '',
        ACTOR: data.ACTOR,
        OBSERVACION: data.OBSERVACION || '',
        ID_UBICACION_DECLARADA: data.ID_UBICACION_DECLARADA,
        LAT_CAPTURADA: geo.lat === null ? '' : geo.lat,
        LON_CAPTURADA: geo.lon === null ? '' : geo.lon,
        PRECISION_M: geo.accuracy === null ? '' : geo.accuracy,
        FUENTE_UBICACION: geo.source
      };

      U.writeJson(ACTOR_KEY, data.ACTOR);
      UI.setBusy(btn, true, 'Registrando…');

      LT.API.createEvent(payload)
        .then(function (res) {
          UI.setBusy(btn, false);
          U.removeKey(DRAFT_KEY);
          UI.closeModal();
          showResult(res, product);
          if (o.onSaved) o.onSaved(res);
          if (LT.Maps) LT.Maps.invalidateData();
        })
        .catch(function (err) {
          UI.setBusy(btn, false);
          if (err.errorCode === 'INSUFFICIENT_STOCK' || err.errorCode === 'NEGATIVE_STOCK') {
            UI.fieldError('CANTIDAD_MOVIMIENTO', err.message, form);
          }
          U.writeJson(DRAFT_KEY, { productId: product.ID_PRODUCTO, data: data, savedAt: U.nowIso() });
          UI.error('El evento no se registró', err.message);
        });
    }
  }

  /* ---------- Resultado del registro ---------- */
  function showResult(res, product) {
    var ev = res.event || {};
    var geo = res.geoValidation || {};
    var g = U.geoInfo(geo.status || ev.VALIDACION_GEO);
    var isException = g.cls === 'out' || g.cls === 'low';

    var html =
      '<div class="stack">' +
        '<div class="banner banner--ok"><div><div class="banner__title">Evento registrado</div>' +
          '<div class="txt-xs mono">' + U.esc(ev.ID_EVENTO || '') + '</div></div></div>' +
        (res.duplicated ? '<div class="banner banner--info txt-xs">Este intento ya se había registrado: no se duplicó el movimiento.</div>' : '') +
        '<dl class="dl-grid">' +
          '<div><dt>Evento</dt><dd>' + U.esc(ev.EVENTO || '') + '</dd></div>' +
          '<div><dt>Fecha y hora</dt><dd>' + U.esc(U.fmtDate(ev.FECHA_HORA)) + '</dd></div>' +
          '<div><dt>Stock</dt><dd class="stock-move">' + U.esc(ev.STOCK_ANTES) + ' &rarr; ' + U.esc(ev.STOCK_DESPUES) + '</dd></div>' +
          '<div><dt>Actor</dt><dd>' + U.esc(ev.ACTOR || '') + '</dd></div>' +
        '</dl>' +
        '<div class="banner banner--' + (g.kind === 'default' ? 'info' : g.kind) + '">' +
          '<div><div class="banner__title">Validación geográfica (servidor): ' + g.sym + ' ' + U.esc(g.label) + '</div>' +
          '<div class="txt-xs">' +
            'Ubicación declarada: <b>' + U.esc(geo.declaredLocation || ev.ID_UBICACION_DECLARADA || '—') + '</b>' +
            ' · Distancia: <b>' + U.fmtMeters(geo.distanceMeters !== undefined ? geo.distanceMeters : ev.DISTANCIA_DECLARADA_M) + '</b>' +
            ' · Radio: <b>' + (geo.geofenceRadiusMeters ? U.fmtMeters(geo.geofenceRadiusMeters) : 'no definido') + '</b>' +
            ' · Precisión: <b>' + (geo.accuracyMeters === null || geo.accuracyMeters === undefined ? '—' : '±' + U.fmtMeters(geo.accuracyMeters)) + '</b>' +
          '</div>' +
          (isException ? '<div class="txt-xs"><b>El evento se guardó igualmente</b>: una excepción geográfica es evidencia de anomalía, no un motivo de rechazo.</div>' : '') +
          '</div>' +
        '</div>' +
      '</div>';

    UI.openModal({
      title: 'Resultado del registro',
      body: html,
      actions: [
        { label: 'Cerrar', kind: 'ghost' },
        {
          label: 'Ver trazabilidad', kind: 'primary', onClick: function () {
            LT.Router.go('traceability', { productId: (res.product && res.product.ID_PRODUCTO) || product.ID_PRODUCTO });
          }
        }
      ]
    });

    UI.ok('Evento registrado', ev.EVENTO + ' · stock ' + ev.STOCK_ANTES + ' → ' + ev.STOCK_DESPUES);
    if (isException) UI.warn('Excepción geográfica registrada', g.label + ': queda como evidencia auditable.');
  }

  /* ---------- Borrador pendiente ---------- */
  function pendingDraft() { return U.readJson(DRAFT_KEY, null); }
  function discardDraft() { U.removeKey(DRAFT_KEY); }

  /* ============================================================
     VISTA EVENTOS
     ============================================================ */
  function initView() {
    var root = document.getElementById('view-events');
    if (!root || root.__ready) return;
    root.__ready = true;

    var evSel = U.$('[name="evFilterType"]', root);
    UI.fillSelect(evSel, CAT.EVENTS.map(function (e) { return { value: e.label, label: e.label }; }),
      { placeholder: 'Todos los eventos' });

    var geoSel = U.$('[name="evFilterGeo"]', root);
    UI.fillSelect(geoSel, Object.keys(CAT.GEO).map(function (k) {
      return { value: k, label: CAT.GEO[k].sym + ' ' + CAT.GEO[k].label };
    }), { placeholder: 'Todas las validaciones' });

    U.$$('#view-events .filters input, #view-events .filters select').forEach(function (input) {
      input.addEventListener('change', function () { render(); });
    });
    U.$('[name="evFilterSearch"]', root).addEventListener('input', U.debounce(function () { render(); }, 220));

    U.$('[data-ev-action="new"]', root).addEventListener('click', function () { openQuickPicker(); });
    U.$('[data-ev-action="reload"]', root).addEventListener('click', function () {
      LT.API.invalidate(['events', 'products']);
      render();
    });

    render();
  }

  /** Selección de producto previa al registro manual de un evento. */
  function openQuickPicker() {
    var body = U.el('div');
    body.innerHTML =
      '<div class="field">' +
        '<label class="field__label" for="pickProduct">Producto</label>' +
        '<select id="pickProduct" name="pickProduct"></select>' +
        '<span class="field__hint">También puede identificar el producto con el escáner.</span>' +
      '</div>';
    UI.openModal({
      title: 'Registrar evento — seleccionar producto',
      size: 'narrow',
      body: body,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Abrir escáner', kind: 'subtle', onClick: function () { LT.Router.go('scanner'); } },
        {
          label: 'Continuar', kind: 'primary', close: false, onClick: function () {
            var id = U.$('#pickProduct', body).value;
            if (!id) { UI.warn('Seleccione un producto'); return false; }
            UI.closeModal();
            LT.API.getProduct(id).then(function (p) {
              openForm(p, { onSaved: function () { LT.API.invalidate(); render(); } });
            }).catch(function (e) { UI.error('No fue posible cargar el producto', e.message); });
            return true;
          }
        }
      ]
    });
    LT.API.getProducts().then(function (products) {
      UI.fillSelect(U.$('#pickProduct', body), U.sortBy(products, function (p) { return p.NOMBRE; }).map(function (p) {
        return { value: p.ID_PRODUCTO, label: p.NOMBRE + ' — stock ' + p.CANTIDAD + ' — ' + p.ID_PRODUCTO };
      }), { placeholder: '— Seleccione producto —' });
    });
  }

  function render() {
    var root = document.getElementById('view-events');
    if (!root) return;
    var tableBox = U.$('[data-ev="table"]', root);
    var kpiBox = U.$('[data-ev="kpis"]', root);
    UI.loading(tableBox, 'Cargando eventos…');

    Promise.all([LT.API.getEvents(), LT.API.getLocations()]).then(function (res) {
      var events = res[0];
      var idx = LT.Locations.buildIndex(res[1]);

      var f = {
        type: (U.$('[name="evFilterType"]', root) || {}).value || '',
        geo: (U.$('[name="evFilterGeo"]', root) || {}).value || '',
        from: (U.$('[name="evFilterFrom"]', root) || {}).value || '',
        to: (U.$('[name="evFilterTo"]', root) || {}).value || '',
        search: (U.$('[name="evFilterSearch"]', root) || {}).value || ''
      };

      var filtered = events.filter(function (e) {
        if (f.type && String(e.EVENTO).toUpperCase() !== String(f.type).toUpperCase()) return false;
        if (f.geo && String(e.VALIDACION_GEO || 'SIN_GPS').toUpperCase() !== f.geo.toUpperCase()) return false;
        if (f.from) { var d1 = U.parseDate(e.FECHA_HORA), a = U.parseDate(f.from + 'T00:00:00'); if (d1 && a && d1 < a) return false; }
        if (f.to) { var d2 = U.parseDate(e.FECHA_HORA), b = U.parseDate(f.to + 'T23:59:59'); if (d2 && b && d2 > b) return false; }
        if (f.search) {
          return U.includesText(e.ID_PRODUCTO, f.search) || U.includesText(e.ACTOR, f.search) ||
                 U.includesText(e.CODIGO_LEIDO, f.search) || U.includesText(e.OBSERVACION, f.search) ||
                 U.includesText(e.ID_EVENTO, f.search);
        }
        return true;
      });

      var byGeo = function (s) { return filtered.filter(function (e) { return String(e.VALIDACION_GEO || 'SIN_GPS').toUpperCase() === s; }).length; };
      kpiBox.innerHTML =
        '<div class="kpi"><div class="kpi__label">Eventos</div><div class="kpi__value">' + filtered.length + '</div>' +
          '<div class="kpi__hint">de ' + events.length + ' registrados</div></div>' +
        '<div class="kpi kpi--ok"><div class="kpi__label">✓ OK</div><div class="kpi__value">' + byGeo('OK') + '</div></div>' +
        '<div class="kpi kpi--danger"><div class="kpi__label">⚠ Fuera de geocerca</div><div class="kpi__value">' + byGeo('FUERA_GEOCERCA') + '</div></div>' +
        '<div class="kpi kpi--warn"><div class="kpi__label">◉ Baja precisión</div><div class="kpi__value">' + byGeo('BAJA_PRECISION') + '</div></div>' +
        '<div class="kpi"><div class="kpi__label">— Sin GPS</div><div class="kpi__value">' + byGeo('SIN_GPS') + '</div></div>';

      UI.renderTable(tableBox, {
        rows: filtered,
        rowId: function (e) { return e.ID_EVENTO; },
        sortKey: 'FECHA_HORA',
        sortDir: 'desc',
        pageSize: 20,
        emptyTitle: 'Sin eventos',
        emptyDesc: 'Registre movimientos desde el escáner o desde el botón «Registrar evento».',
        columns: [
          {
            key: 'FECHA_HORA', label: 'Fecha / hora',
            sortValue: function (e) { var d = U.parseDate(e.FECHA_HORA); return d ? d.getTime() : 0; },
            cell: function (e) { return '<span class="mono txt-xs">' + U.esc(U.fmtDate(e.FECHA_HORA)) + '</span>'; }
          },
          { key: 'EVENTO', label: 'Evento', cell: function (e) { return UI.eventBadge(e.EVENTO); } },
          { key: 'ID_PRODUCTO', label: 'Producto', cell: function (e) { return '<span class="mono txt-xs">' + U.esc(e.ID_PRODUCTO) + '</span>'; } },
          { key: 'CANTIDAD_MOVIMIENTO', label: 'Cant.', align: 'right', cell: function (e) { return U.fmtNum(e.CANTIDAD_MOVIMIENTO); } },
          {
            key: 'stock', label: 'Stock', sortable: false,
            cell: function (e) { return '<span class="stock-move txt-xs">' + U.esc(e.STOCK_ANTES) + ' &rarr; ' + U.esc(e.STOCK_DESPUES) + '</span>'; }
          },
          {
            key: 'ID_UBICACION_DECLARADA', label: 'Ubicación declarada',
            cell: function (e) { return U.esc(LT.Locations.nameOf(idx, e.ID_UBICACION_DECLARADA) || e.UBICACION || '—'); }
          },
          { key: 'ACTOR', label: 'Actor' },
          {
            key: 'VALIDACION_GEO', label: 'Geo',
            cell: function (e) { return UI.geoBadge(e.VALIDACION_GEO); }
          },
          {
            key: 'DISTANCIA_DECLARADA_M', label: 'Distancia', align: 'right',
            cell: function (e) { return U.fmtMeters(e.DISTANCIA_DECLARADA_M); }
          },
          {
            key: 'acciones', label: 'Acciones', sortable: false,
            cell: function (e) {
              return '<div class="btn-group">' +
                '<button class="btn btn--sm btn--ghost" data-act="detail" data-id="' + U.esc(e.ID_EVENTO) + '">Detalle</button>' +
                '<button class="btn btn--sm btn--subtle" data-act="trace" data-id="' + U.esc(e.ID_PRODUCTO) + '">Trazabilidad</button>' +
                '</div>';
            }
          }
        ],
        onAction: function (act, id) {
          if (act === 'trace') { LT.Router.go('traceability', { productId: id }); return; }
          var ev = filtered.filter(function (e) { return e.ID_EVENTO === id; })[0];
          if (ev) openDetail(ev, idx);
        }
      });
    }).catch(function (err) {
      UI.errorState(tableBox, err.message, function () { render(); });
    });
  }

  function openDetail(ev, idx) {
    var body = U.el('div', { class: 'stack' });
    body.innerHTML =
      '<dl class="dl-grid">' +
        '<div><dt>ID evento</dt><dd class="mono txt-xs">' + U.esc(ev.ID_EVENTO) + '</dd></div>' +
        '<div><dt>Fecha / hora</dt><dd>' + U.esc(U.fmtDate(ev.FECHA_HORA)) + '</dd></div>' +
        '<div><dt>Evento</dt><dd>' + UI.eventBadge(ev.EVENTO) + '</dd></div>' +
        '<div><dt>Producto</dt><dd class="mono txt-xs">' + U.esc(ev.ID_PRODUCTO) + '</dd></div>' +
        '<div><dt>Código leído</dt><dd class="mono txt-xs">' + U.esc(ev.CODIGO_LEIDO || '—') + '</dd></div>' +
        '<div><dt>Tecnología</dt><dd>' + U.esc(ev.TIPO_IDENTIFICACION || '—') + '</dd></div>' +
        '<div><dt>Cantidad</dt><dd>' + U.fmtNum(ev.CANTIDAD_MOVIMIENTO) + '</dd></div>' +
        '<div><dt>Stock</dt><dd class="stock-move">' + U.esc(ev.STOCK_ANTES) + ' &rarr; ' + U.esc(ev.STOCK_DESPUES) + '</dd></div>' +
        '<div><dt>Origen</dt><dd>' + U.esc(LT.Locations.nameOf(idx, ev.UBICACION_ORIGEN) || '—') + '</dd></div>' +
        '<div><dt>Destino</dt><dd>' + U.esc(LT.Locations.nameOf(idx, ev.UBICACION_DESTINO) || '—') + '</dd></div>' +
        '<div><dt>Actor</dt><dd>' + U.esc(ev.ACTOR || '—') + '</dd></div>' +
        '<div><dt>Estado</dt><dd>' + U.esc(ev.ESTADO || '—') + '</dd></div>' +
      '</dl>' +
      (ev.OBSERVACION ? '<div class="banner"><div><div class="banner__title">Observación</div><div class="txt-xs">' + U.esc(ev.OBSERVACION) + '</div></div></div>' : '') +
      '<div class="card"><div class="card__head"><div class="card__title">Información geográfica</div></div>' +
        '<div class="card__body">' + LT.Geo.eventGeoHtml(ev) +
        (U.isValidLat(ev.LAT_CAPTURADA) ? '<div class="map-canvas map-canvas--sm mt-3" data-ev-map></div>' : '') +
        '</div></div>';

    UI.openModal({
      title: 'Detalle del evento',
      size: 'wide',
      body: body,
      actions: [
        { label: 'Cerrar', kind: 'ghost' },
        { label: 'Ver trazabilidad', kind: 'primary', onClick: function () { LT.Router.go('traceability', { productId: ev.ID_PRODUCTO }); } }
      ]
    });

    var mapEl = U.$('[data-ev-map]', body);
    if (mapEl) {
      setTimeout(function () {
        LT.Maps.showSinglePoint(mapEl, null, U.toNumber(ev.LAT_CAPTURADA), U.toNumber(ev.LON_CAPTURADA), {
          label: ev.EVENTO, accuracy: ev.PRECISION_M
        });
      }, 120);
    }
  }

  LT.Events = {
    openForm: openForm,
    showResult: showResult,
    pendingDraft: pendingDraft,
    discardDraft: discardDraft,
    openQuickPicker: openQuickPicker,
    initView: initView,
    render: render
  };
})(window);
