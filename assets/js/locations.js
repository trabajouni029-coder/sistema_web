/* ============================================================
   LogiTrace — locations.js
   Maestro de ubicaciones: alta, edición, jerarquía PADRE_ID,
   herencia de coordenadas y radios sugeridos de geocerca.
   Expone: window.LT.Locations
   ============================================================ */
(function (global) {
  'use strict';

  var LT = global.LT = global.LT || {};
  var U = LT.U;
  var UI = LT.UI;
  var CAT = LT.CAT;

  var cacheList = [];

  /* ============================================================
     ÍNDICE Y RESOLUCIÓN JERÁRQUICA
     ============================================================ */
  function buildIndex(list) {
    var byId = {};
    (list || []).forEach(function (l) { byId[String(l.ID_UBICACION).trim().toUpperCase()] = l; });
    return { byId: byId, list: list || [] };
  }

  function get(index, id) {
    if (!id) return null;
    return index.byId[String(id).trim().toUpperCase()] || null;
  }

  function nameOf(index, id) {
    var l = get(index, id);
    return l ? l.NOMBRE : (id || '');
  }

  function labelOf(index, id) {
    var l = get(index, id);
    if (!l) return id || '—';
    return l.NOMBRE + ' (' + l.ID_UBICACION + ')';
  }

  /**
   * Resuelve coordenadas efectivas subiendo por PADRE_ID.
   * Réplica de resolveLocationCoordinates() de Code.gs.
   */
  function resolveCoords(index, id) {
    var visited = {};
    var requested = get(index, id);
    var current = requested;
    var radius = null;
    while (current) {
      var key = String(current.ID_UBICACION).toUpperCase();
      if (visited[key]) break;                     // ciclo: se detiene
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
          inherited: !!(requested && current.ID_UBICACION !== requested.ID_UBICACION),
          requestedLocationId: requested ? requested.ID_UBICACION : id,
          requestedLocationName: requested ? requested.NOMBRE : ''
        };
      }
      current = get(index, current.PADRE_ID);
    }
    return {
      found: false, lat: null, lon: null, radiusMeters: radius,
      effectiveLocationId: '', effectiveLocationName: '', inherited: false,
      requestedLocationId: requested ? requested.ID_UBICACION : id,
      requestedLocationName: requested ? requested.NOMBRE : ''
    };
  }

  function childrenOf(index, id) {
    var key = String(id || '').trim().toUpperCase();
    return index.list.filter(function (l) { return String(l.PADRE_ID || '').trim().toUpperCase() === key; });
  }

  function suggestedRadius(typeValue) {
    var t = U.locationTypeByAny(typeValue);
    return t ? t.radius : 100;
  }

  function isActive(loc) {
    var v = String(loc.ACTIVO === undefined ? 'SI' : loc.ACTIVO).trim().toUpperCase();
    return v !== 'NO' && v !== 'FALSE' && v !== '0';
  }

  /** Detecta ciclos antes de guardar (validación de cliente; el servidor repite). */
  function wouldCycle(index, id, parentId) {
    if (!parentId) return false;
    if (String(parentId).toUpperCase() === String(id).toUpperCase()) return true;
    var guard = 0;
    var current = get(index, parentId);
    while (current && guard++ < 60) {
      if (String(current.ID_UBICACION).toUpperCase() === String(id).toUpperCase()) return true;
      current = get(index, current.PADRE_ID);
    }
    return false;
  }

  /* ============================================================
     SELECTS ALIMENTADOS DESDE EL MAESTRO
     Muestra NOMBRE, guarda ID_UBICACION. Nunca texto libre.
     ============================================================ */
  function fillLocationSelect(select, list, opts) {
    if (!select) return;
    var o = opts || {};
    var items = (list || cacheList).filter(function (l) { return o.includeInactive ? true : isActive(l); });
    items = U.sortBy(items, function (l) { return l.NOMBRE; });
    var current = o.value !== undefined ? o.value : select.value;
    var html = '<option value="">' + U.esc(o.placeholder || '— Seleccione ubicación —') + '</option>';
    var byType = U.groupBy(items, function (l) { return l.TIPO || 'Otro'; });
    Object.keys(byType).sort().forEach(function (type) {
      html += '<option disabled>── ' + U.esc(type) + ' ──</option>';
      byType[type].forEach(function (l) {
        if (o.exclude && String(o.exclude).toUpperCase() === String(l.ID_UBICACION).toUpperCase()) return;
        html += '<option value="' + U.esc(l.ID_UBICACION) + '">' + U.esc(l.NOMBRE) + ' — ' + U.esc(l.ID_UBICACION) + '</option>';
      });
    });
    select.innerHTML = html;
    if (current) select.value = current;
  }

  function refreshAllSelects() {
    return LT.API.getLocations().then(function (list) {
      cacheList = list;
      U.$$('[data-location-select]').forEach(function (sel) {
        fillLocationSelect(sel, list, { value: sel.value, placeholder: sel.dataset.placeholder });
      });
      return list;
    });
  }

  function list() { return cacheList.slice(); }
  function index() { return buildIndex(cacheList); }

  /* ============================================================
     FORMULARIO DE UBICACIÓN
     ============================================================ */
  function openForm(existing) {
    var isEdit = !!existing;
    var idx = index();
    var body = U.el('div');
    body.innerHTML =
      '<form data-loc-form novalidate>' +
        '<div class="grid grid--form">' +
          '<div class="field">' +
            '<label class="field__label" for="locId">ID ubicación <span class="req">*</span></label>' +
            '<input id="locId" name="ID_UBICACION" maxlength="30" placeholder="CD-002" ' + (isEdit ? 'readonly' : '') + '>' +
            '<span class="field__hint">Identificador corto y estable. Ej.: CD-001, ALM-UPEC, RACK-A01.</span>' +
            '<span class="field__error"></span>' +
          '</div>' +
          '<div class="field">' +
            '<label class="field__label" for="locName">Nombre <span class="req">*</span></label>' +
            '<input id="locName" name="NOMBRE" maxlength="80" placeholder="Centro de Distribución Norte">' +
            '<span class="field__error"></span>' +
          '</div>' +
          '<div class="field">' +
            '<label class="field__label" for="locType">Tipo <span class="req">*</span></label>' +
            '<select id="locType" name="TIPO"></select>' +
            '<span class="field__error"></span>' +
          '</div>' +
          '<div class="field">' +
            '<label class="field__label" for="locParent">Ubicación padre</label>' +
            '<select id="locParent" name="PADRE_ID" data-placeholder="— Sin padre (nivel raíz) —"></select>' +
            '<span class="field__hint">Si la hija no tiene coordenadas, hereda LAT/LON y radio del padre.</span>' +
            '<span class="field__error"></span>' +
          '</div>' +
        '</div>' +
        '<div class="field">' +
          '<label class="field__label" for="locAddr">Dirección</label>' +
          '<input id="locAddr" name="DIRECCION" maxlength="140" placeholder="Av. Veintimilla y Panamericana Norte">' +
        '</div>' +
        '<fieldset>' +
          '<legend>Coordenadas y geocerca</legend>' +
          '<div class="grid grid--form">' +
            '<div class="field">' +
              '<label class="field__label" for="locLat">Latitud</label>' +
              '<input id="locLat" name="LAT" inputmode="decimal" placeholder="0.812340">' +
              '<span class="field__hint">-90 a 90. Vacío = hereda del padre.</span>' +
              '<span class="field__error"></span>' +
            '</div>' +
            '<div class="field">' +
              '<label class="field__label" for="locLon">Longitud</label>' +
              '<input id="locLon" name="LON" inputmode="decimal" placeholder="-77.717820">' +
              '<span class="field__hint">-180 a 180.</span>' +
              '<span class="field__error"></span>' +
            '</div>' +
            '<div class="field">' +
              '<label class="field__label" for="locRadius">Radio de geocerca (m)</label>' +
              '<input id="locRadius" name="RADIO_GEOCERCA_M" inputmode="numeric" placeholder="150">' +
              '<span class="field__hint">Valor sugerido según el tipo; editable. Vacío = hereda.</span>' +
              '<span class="field__error"></span>' +
            '</div>' +
            '<div class="field">' +
              '<label class="field__label" for="locActive">Activo</label>' +
              '<select id="locActive" name="ACTIVO"><option value="SI">SI</option><option value="NO">NO</option></select>' +
            '</div>' +
          '</div>' +
          '<div class="row">' +
            '<button class="btn btn--sm btn--primary" type="button" data-loc="gps">Usar posición actual</button>' +
            '<button class="btn btn--sm btn--ghost" type="button" data-loc="map">Seleccionar en mapa</button>' +
          '</div>' +
          '<div data-loc="coordinfo" class="coord-picker__readout mt-3">Sin coordenadas propias.</div>' +
          '<div data-loc="inherit" class="geofence-note"></div>' +
        '</fieldset>' +
      '</form>';

    UI.openModal({
      title: isEdit ? 'Editar ubicación — ' + existing.ID_UBICACION : 'Nueva ubicación',
      size: 'wide',
      body: body,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        {
          label: isEdit ? 'Guardar cambios' : 'Crear ubicación', kind: 'primary', close: false,
          onClick: function (btn) { submit(btn); return false; }
        }
      ]
    });

    var form = U.$('[data-loc-form]', body);
    var typeSel = U.$('[name="TIPO"]', form);
    var parentSel = U.$('[name="PADRE_ID"]', form);
    var latInput = U.$('[name="LAT"]', form);
    var lonInput = U.$('[name="LON"]', form);
    var radiusInput = U.$('[name="RADIO_GEOCERCA_M"]', form);
    var coordInfo = U.$('[data-loc="coordinfo"]', body);
    var inheritInfo = U.$('[data-loc="inherit"]', body);

    UI.fillSelect(typeSel, CAT.LOCATION_TYPES, { valueKey: 'label', labelKey: 'label', placeholder: '— Seleccione tipo —' });
    fillLocationSelect(parentSel, cacheList, {
      placeholder: '— Sin padre (nivel raíz) —',
      exclude: isEdit ? existing.ID_UBICACION : null
    });

    if (isEdit) {
      Object.keys(existing).forEach(function (k) {
        var input = U.$('[name="' + k + '"]', form);
        if (input) input.value = existing[k] === null || existing[k] === undefined ? '' : existing[k];
      });
    }

    typeSel.addEventListener('change', function () {
      if (!radiusInput.value || radiusInput.dataset.auto === '1') {
        var r = suggestedRadius(typeSel.value);
        radiusInput.value = r > 0 ? r : '';
        radiusInput.dataset.auto = '1';
      }
      paintCoordInfo();
    });
    radiusInput.addEventListener('input', function () { radiusInput.dataset.auto = '0'; });
    parentSel.addEventListener('change', paintCoordInfo);
    latInput.addEventListener('input', paintCoordInfo);
    lonInput.addEventListener('input', paintCoordInfo);

    function paintCoordInfo() {
      var lat = latInput.value, lon = lonInput.value;
      if (U.isValidLat(lat) && U.isValidLon(lon)) {
        coordInfo.textContent = 'Coordenadas propias: ' + U.fmtCoord(lat, lon);
      } else {
        coordInfo.textContent = 'Sin coordenadas propias.';
      }
      var parentId = parentSel.value;
      if (!U.isValidLat(lat) && parentId) {
        var res = resolveCoords(idx, parentId);
        inheritInfo.innerHTML = res.found
          ? 'Heredará de <b>' + U.esc(res.effectiveLocationName) + '</b>: ' + U.fmtCoord(res.lat, res.lon) +
            (res.radiusMeters ? ' · radio ' + U.fmtMeters(res.radiusMeters) : '')
          : 'El padre seleccionado tampoco tiene coordenadas: los eventos aquí quedarán como SIN_GPS salvo captura manual.';
      } else {
        inheritInfo.textContent = '';
      }
    }

    U.$('[data-loc="gps"]', body).addEventListener('click', function (ev) {
      var btn = ev.currentTarget;
      UI.setBusy(btn, true, 'Localizando…');
      LT.Geo.getCurrentPosition().then(function (pos) {
        UI.setBusy(btn, false);
        latInput.value = pos.lat.toFixed(6);
        lonInput.value = pos.lon.toFixed(6);
        paintCoordInfo();
        UI.ok('Posición aplicada', '±' + U.fmtMeters(pos.accuracy));
      }).catch(function (err) {
        UI.setBusy(btn, false);
        UI.warn('GPS no disponible', err.message + ' Use la selección en mapa.');
      });
    });

    U.$('[data-loc="map"]', body).addEventListener('click', function () {
      LT.Maps.pickCoordinates({
        lat: U.toNumber(latInput.value, null),
        lon: U.toNumber(lonInput.value, null),
        radiusMeters: U.toNumber(radiusInput.value, null),
        title: 'Seleccionar coordenadas de la ubicación'
      }).then(function (picked) {
        if (!picked) return;
        latInput.value = Number(picked.lat).toFixed(6);
        lonInput.value = Number(picked.lon).toFixed(6);
        paintCoordInfo();
      });
    });

    paintCoordInfo();

    function submit(btn) {
      UI.clearErrors(form);
      var data = UI.readForm(form);
      var errors = 0;

      if (!data.ID_UBICACION) { UI.fieldError('ID_UBICACION', 'El ID es obligatorio.', form); errors++; }
      else if (!/^[A-Za-z0-9._-]+$/.test(data.ID_UBICACION)) {
        UI.fieldError('ID_UBICACION', 'Use sólo letras, números, punto, guion o guion bajo.', form); errors++;
      } else if (!isEdit && get(idx, data.ID_UBICACION)) {
        UI.fieldError('ID_UBICACION', 'Ya existe una ubicación con ese ID.', form); errors++;
      }
      if (!data.NOMBRE) { UI.fieldError('NOMBRE', 'El nombre es obligatorio.', form); errors++; }
      if (!data.TIPO) { UI.fieldError('TIPO', 'Seleccione el tipo.', form); errors++; }

      if (data.LAT !== '' && !U.isValidLat(data.LAT)) { UI.fieldError('LAT', 'Latitud fuera de rango (-90 a 90).', form); errors++; }
      if (data.LON !== '' && !U.isValidLon(data.LON)) { UI.fieldError('LON', 'Longitud fuera de rango (-180 a 180).', form); errors++; }
      if ((data.LAT === '') !== (data.LON === '')) {
        UI.fieldError('LON', 'Indique ambas coordenadas o ninguna.', form); errors++;
      }
      if (data.RADIO_GEOCERCA_M !== '') {
        var r = U.toNumber(data.RADIO_GEOCERCA_M, null);
        if (r === null || r <= 0) { UI.fieldError('RADIO_GEOCERCA_M', 'El radio debe ser mayor que cero.', form); errors++; }
      }
      if (data.PADRE_ID && wouldCycle(idx, data.ID_UBICACION, data.PADRE_ID)) {
        UI.fieldError('PADRE_ID', 'Esa relación crearía un ciclo en la jerarquía.', form); errors++;
      }

      if (errors) { UI.warn('Revise el formulario', errors + ' campo(s) requieren corrección.'); return; }

      var payload = {
        ID_UBICACION: data.ID_UBICACION.toUpperCase(),
        NOMBRE: data.NOMBRE,
        TIPO: data.TIPO,
        DIRECCION: data.DIRECCION || '',
        LAT: data.LAT === '' ? '' : U.toNumber(data.LAT),
        LON: data.LON === '' ? '' : U.toNumber(data.LON),
        RADIO_GEOCERCA_M: data.RADIO_GEOCERCA_M === '' ? '' : U.toNumber(data.RADIO_GEOCERCA_M),
        PADRE_ID: data.PADRE_ID || '',
        ACTIVO: data.ACTIVO || 'SI'
      };

      UI.setBusy(btn, true, 'Guardando…');
      var op = isEdit ? LT.API.updateLocation(payload) : LT.API.createLocation(payload);
      op.then(function () {
        UI.setBusy(btn, false);
        UI.closeModal();
        UI.ok(isEdit ? 'Ubicación actualizada' : 'Ubicación creada', payload.NOMBRE);
        refreshAllSelects().then(render);
        if (LT.Maps) LT.Maps.invalidateData();
      }).catch(function (err) {
        UI.setBusy(btn, false);
        UI.error('No fue posible guardar', err.message);
      });
    }
  }

  /* ============================================================
     VISTA UBICACIONES
     ============================================================ */
  function initView() {
    var root = document.getElementById('view-locations');
    if (!root || root.__ready) return;
    root.__ready = true;
    U.$('[data-loc-action="new"]', root).addEventListener('click', function () { openForm(null); });
    U.$('[data-loc-action="reload"]', root).addEventListener('click', function () {
      LT.API.invalidate(['locations']);
      render();
    });
    var search = U.$('[name="locSearch"]', root);
    search.addEventListener('input', U.debounce(function () { render(); }, 200));
    var typeFilter = U.$('[name="locTypeFilter"]', root);
    UI.fillSelect(typeFilter, CAT.LOCATION_TYPES, { valueKey: 'label', labelKey: 'label', placeholder: 'Todos los tipos' });
    typeFilter.addEventListener('change', function () { render(); });
    render();
  }

  function render() {
    var root = document.getElementById('view-locations');
    if (!root) return;
    var tableBox = U.$('[data-loc="table"]', root);
    var treeBox = U.$('[data-loc="tree"]', root);
    var kpiBox = U.$('[data-loc="kpis"]', root);
    UI.loading(tableBox, 'Cargando maestro de ubicaciones…');

    LT.API.getLocations().then(function (items) {
      cacheList = items;
      var idx = buildIndex(items);
      var search = String((U.$('[name="locSearch"]', root) || {}).value || '');
      var typeFilter = String((U.$('[name="locTypeFilter"]', root) || {}).value || '');

      var withCoords = items.filter(function (l) { return U.isValidLat(l.LAT) && U.isValidLon(l.LON); });
      var inherited = items.filter(function (l) {
        if (U.isValidLat(l.LAT)) return false;
        return resolveCoords(idx, l.ID_UBICACION).found;
      });
      var orphans = items.filter(function (l) { return !resolveCoords(idx, l.ID_UBICACION).found; });

      kpiBox.innerHTML =
        '<div class="kpi"><div class="kpi__label">Ubicaciones</div><div class="kpi__value">' + items.length + '</div></div>' +
        '<div class="kpi kpi--ok"><div class="kpi__label">Con coordenadas propias</div><div class="kpi__value">' + withCoords.length + '</div></div>' +
        '<div class="kpi kpi--info"><div class="kpi__label">Coordenadas heredadas</div><div class="kpi__value">' + inherited.length + '</div>' +
          '<div class="kpi__hint">Reciben LAT/LON del padre</div></div>' +
        '<div class="kpi kpi--warn"><div class="kpi__label">Sin georreferencia</div><div class="kpi__value">' + orphans.length + '</div>' +
          '<div class="kpi__hint">No se inventan coordenadas</div></div>';

      var filtered = items.filter(function (l) {
        if (typeFilter && l.TIPO !== typeFilter) return false;
        if (!search) return true;
        return U.includesText(l.ID_UBICACION, search) || U.includesText(l.NOMBRE, search) ||
               U.includesText(l.DIRECCION, search) || U.includesText(l.TIPO, search);
      });

      UI.renderTable(tableBox, {
        rows: filtered,
        rowId: function (l) { return l.ID_UBICACION; },
        sortKey: 'NOMBRE',
        pageSize: 15,
        emptyTitle: 'Sin ubicaciones',
        emptyDesc: 'Cree la primera ubicación del maestro para poder georreferenciar eventos.',
        emptyActionLabel: 'Nueva ubicación',
        onEmptyAction: function () { openForm(null); },
        columns: [
          { key: 'ID_UBICACION', label: 'ID', cell: function (l) { return '<span class="mono">' + U.esc(l.ID_UBICACION) + '</span>'; } },
          { key: 'NOMBRE', label: 'Nombre', wrap: true },
          { key: 'TIPO', label: 'Tipo', cell: function (l) { return UI.badge(l.TIPO || '—', 'brand'); } },
          { key: 'DIRECCION', label: 'Dirección', wrap: true },
          {
            key: 'coords', label: 'Coordenadas', sortable: false, cell: function (l) {
              if (U.isValidLat(l.LAT) && U.isValidLon(l.LON)) {
                return '<span class="mono txt-xs">' + U.fmtCoord(l.LAT, l.LON) + '</span>';
              }
              var res = resolveCoords(idx, l.ID_UBICACION);
              if (res.found) {
                return '<span class="mono txt-xs">' + U.fmtCoord(res.lat, res.lon) + '</span> ' +
                  UI.badge('heredada de ' + res.effectiveLocationId, 'info');
              }
              return UI.badge('sin georreferencia', 'warn');
            }
          },
          {
            key: 'RADIO_GEOCERCA_M', label: 'Radio', align: 'right', cell: function (l) {
              var own = U.toNumber(l.RADIO_GEOCERCA_M, null);
              if (own) return U.fmtMeters(own);
              var res = resolveCoords(idx, l.ID_UBICACION);
              return res.radiusMeters ? '<span class="txt-muted">' + U.fmtMeters(res.radiusMeters) + ' (heredado)</span>' : '—';
            }
          },
          {
            key: 'PADRE_ID', label: 'Padre', cell: function (l) {
              return l.PADRE_ID ? '<span class="mono txt-xs">' + U.esc(l.PADRE_ID) + '</span>' : '<span class="txt-muted">raíz</span>';
            }
          },
          { key: 'ACTIVO', label: 'Activo', cell: function (l) { return isActive(l) ? UI.badge('SI', 'ok') : UI.badge('NO', 'danger'); } },
          {
            key: 'acciones', label: 'Acciones', sortable: false, cell: function (l) {
              return '<div class="btn-group">' +
                '<button class="btn btn--sm btn--ghost" data-act="edit" data-id="' + U.esc(l.ID_UBICACION) + '">Editar</button>' +
                '<button class="btn btn--sm btn--subtle" data-act="map" data-id="' + U.esc(l.ID_UBICACION) + '">Mapa</button>' +
                '</div>';
            }
          }
        ],
        onAction: function (act, id) {
          var loc = get(idx, id);
          if (act === 'edit') openForm(loc);
          if (act === 'map') LT.Router.go('map', { locationId: id });
        }
      });

      renderTree(treeBox, idx);
    }).catch(function (err) {
      UI.errorState(tableBox, err.message, function () { render(); });
    });
  }

  function renderTree(container, idx) {
    if (!container) return;
    var roots = idx.list.filter(function (l) { return !l.PADRE_ID || !get(idx, l.PADRE_ID); });
    if (!roots.length) { UI.empty(container, { title: 'Sin jerarquía definida' }); return; }

    function branch(loc, depth, seen) {
      var key = String(loc.ID_UBICACION).toUpperCase();
      if (seen[key]) return '<li class="txt-xs" style="color:var(--danger-600)">Ciclo detectado en ' + U.esc(loc.ID_UBICACION) + '</li>';
      seen[key] = true;
      var kids = childrenOf(idx, loc.ID_UBICACION);
      var own = U.isValidLat(loc.LAT) && U.isValidLon(loc.LON);
      return '<li style="margin:4px 0">' +
        '<span class="mono txt-xs">' + U.esc(loc.ID_UBICACION) + '</span> · ' + U.esc(loc.NOMBRE) + ' ' +
        UI.badge(loc.TIPO || '—', 'outline') + ' ' +
        (own ? UI.badge('coordenadas propias', 'ok') : UI.badge('hereda', 'info')) +
        (kids.length ? '<ul style="margin:4px 0 4px 18px;list-style:none;border-left:2px solid var(--border);padding-left:12px">' +
          kids.map(function (k) { return branch(k, depth + 1, Object.assign({}, seen)); }).join('') + '</ul>' : '') +
        '</li>';
    }

    container.innerHTML = '<ul style="list-style:none;margin:0;padding:0">' +
      roots.map(function (r) { return branch(r, 0, {}); }).join('') + '</ul>';
  }

  LT.Locations = {
    buildIndex: buildIndex, get: get, nameOf: nameOf, labelOf: labelOf,
    resolveCoords: resolveCoords, childrenOf: childrenOf,
    suggestedRadius: suggestedRadius, isActive: isActive, wouldCycle: wouldCycle,
    fillLocationSelect: fillLocationSelect, refreshAllSelects: refreshAllSelects,
    list: list, index: index,
    openForm: openForm, initView: initView, render: render
  };
})(window);
