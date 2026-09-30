/* ============================================================
   LogiTrace — app.js
   Arranque, enrutado por hash, sidebar, encabezado de estado,
   búsqueda global, escaneo rápido y vista de configuración.
   Expone: window.LT.Router  ·  window.LT.App
   ============================================================ */
(function (global) {
  'use strict';

  var LT = global.LT = global.LT || {};
  var U = LT.U;
  var UI = LT.UI;

  /* ============================================================
     ENRUTADOR
     ============================================================ */
  var VIEWS = {
    dashboard:    { title: 'Dashboard',        init: function () { LT.Dashboard.initView(); }, show: function () { LT.Dashboard.render(); } },
    products:     { title: 'Productos',        init: function () { LT.Products.initView(); },  show: function () { LT.Products.render(); } },
    codes:        { title: 'Generar códigos',  init: function () { LT.Code.initGeneratorView(); } },
    scanner:      { title: 'Escáner',          init: function () { LT.Scanner.initView(); },   leave: function () { LT.Scanner.stopCamera(); } },
    rfid:         { title: 'RFID simulado',    init: function () { LT.RFID.initView(); } },
    inventory:    { title: 'Inventario',       init: function () { LT.Inventory.initView(); }, show: function () { LT.Inventory.render(); } },
    traceability: { title: 'Trazabilidad',     init: function () { LT.Trace.initView(); },
                    show: function (params) { if (params && params.productId) LT.Trace.open(params.productId); } },
    events:       { title: 'Eventos',          init: function () { LT.Events.initView(); },    show: function () { LT.Events.render(); } },
    locations:    { title: 'Ubicaciones',      init: function () { LT.Locations.initView(); }, show: function () { LT.Locations.render(); } },
    map:          { title: 'Mapa',             init: function () { LT.Maps.initView(); },
                    show: function (params) {
                      if (params && params.locationId) LT.Maps.focusLocation(params.locationId);
                      else if (params && params.productId) LT.Maps.focusProduct(params.productId);
                      else LT.Maps.renderView(false);
                    } },
    export:       { title: 'Exportar',         init: function () { LT.GeoJSON.initView(); } },
    help:         { title: 'Ayuda y configuración', init: function () { initHelpView(); }, show: function () { paintConfig(); } }
  };

  var routerState = { current: null, params: {} };

  function parseHash() {
    var raw = String(location.hash || '').replace(/^#\/?/, '');
    if (!raw) return { view: 'dashboard', params: {} };
    var parts = raw.split('?');
    var view = decodeURIComponent(parts[0] || 'dashboard');
    var params = {};
    (parts[1] || '').split('&').forEach(function (pair) {
      if (!pair) return;
      var kv = pair.split('=');
      params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
    });
    return { view: VIEWS[view] ? view : 'dashboard', params: params };
  }

  function go(view, params) {
    var qs = Object.keys(params || {})
      .filter(function (k) { return params[k] !== undefined && params[k] !== null && params[k] !== ''; })
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
      .join('&');
    var hash = '#/' + view + (qs ? '?' + qs : '');
    if (location.hash === hash) { activate(view, params || {}); return; }
    location.hash = hash;
  }

  function activate(viewName, params) {
    var def = VIEWS[viewName];
    if (!def) return;

    if (routerState.current && routerState.current !== viewName) {
      var prev = VIEWS[routerState.current];
      if (prev && prev.leave) { try { prev.leave(); } catch (e) { /* aislado */ } }
    }

    U.$$('.view').forEach(function (v) { v.classList.remove('is-active'); });
    var node = document.getElementById('view-' + viewName);
    if (node) node.classList.add('is-active');

    U.$$('.nav-item').forEach(function (item) {
      var active = item.dataset.view === viewName;
      if (active) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });

    var titleEl = document.getElementById('headerTitle');
    if (titleEl) titleEl.textContent = def.title;
    document.title = 'LogiTrace · ' + def.title;

    routerState.current = viewName;
    routerState.params = params || {};

    try { if (def.init) def.init(); } catch (err) {
      UI.error('Error al preparar la vista', err.message);
      if (global.console) console.error(err);
    }
    try { if (def.show) def.show(params || {}); } catch (err2) {
      UI.error('Error al cargar la vista', err2.message);
      if (global.console) console.error(err2);
    }

    closeSidebar();
    UI.icons();
    global.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleHashChange() {
    var r = parseHash();
    activate(r.view, r.params);
  }

  function fire(name) {
    if (name === 'map' && LT.Maps) LT.Maps.renderView(false);
  }

  LT.Router = { go: go, parseHash: parseHash, fire: fire, state: routerState };

  /* ============================================================
     SIDEBAR
     ============================================================ */
  function openSidebar() {
    U.$('#sidebar').classList.add('is-open');
    U.$('#sidebarScrim').classList.add('is-open');
    U.$('#menuButton').setAttribute('aria-expanded', 'true');
  }

  function closeSidebar() {
    var sb = U.$('#sidebar');
    if (!sb) return;
    sb.classList.remove('is-open');
    U.$('#sidebarScrim').classList.remove('is-open');
    U.$('#menuButton').setAttribute('aria-expanded', 'false');
  }

  /* ============================================================
     ENCABEZADO DE ESTADO
     ============================================================ */
  function paintConnection(state) {
    var box = document.getElementById('connState');
    if (!box) return;
    var mode = state.mode;
    var cls = mode === 'online' ? 'conn--online' : mode === 'local' ? 'conn--local' : 'conn--error';
    var label = mode === 'online' ? 'Conectado a Google Sheets'
      : mode === 'local' ? 'Modo local (demostración)'
      : 'Backend no disponible';
    if (state.online === false) { cls = 'conn--error'; label = 'Sin conexión a Internet'; }

    box.className = 'conn ' + cls;
    box.innerHTML = '<span class="conn__dot"></span>' +
      '<span>' + U.esc(label) + '</span>' +
      '<span class="conn__sync">' + (state.lastSync ? 'Sinc.: ' + U.esc(U.fmtDate(state.lastSync)) : 'sin sincronizar') + '</span>';
    box.title = state.lastError ? ('Último error: ' + state.lastError) : label;

    var banner = document.getElementById('modeBanner');
    if (!banner) return;
    if (mode === 'local') {
      banner.className = 'banner banner--warn mb-4';
      banner.innerHTML = '<div style="flex:1"><div class="banner__title">Modo local de demostración</div>' +
        '<div class="txt-xs">No hay Web App de Apps Script configurada: los datos residen en este navegador. ' +
        'Configure <span class="mono">APPS_SCRIPT_URL</span> para operar con Google Sheets reales.</div></div>' +
        '<button class="btn btn--sm btn--ghost" type="button" data-mode-goto>Configurar</button>';
      banner.classList.remove('hidden');
      var btn = banner.querySelector('[data-mode-goto]');
      if (btn) btn.addEventListener('click', function () { go('help'); });
    } else if (mode === 'error') {
      banner.className = 'banner banner--danger mb-4';
      banner.innerHTML = '<div style="flex:1"><div class="banner__title">No fue posible contactar al backend</div>' +
        '<div class="txt-xs">' + U.esc(state.lastError || '') + ' — No se muestran datos simulados: corrija la configuración y reintente.</div></div>' +
        '<button class="btn btn--sm btn--ghost" type="button" data-mode-retry>Reintentar</button>';
      banner.classList.remove('hidden');
      var rbtn = banner.querySelector('[data-mode-retry]');
      if (rbtn) rbtn.addEventListener('click', function () { boot(true); });
    } else {
      banner.classList.add('hidden');
      banner.innerHTML = '';
    }
  }

  /* ============================================================
     BÚSQUEDA GLOBAL
     ============================================================ */
  function globalSearch(term) {
    var q = String(term || '').trim();
    if (!q) return;
    var body = U.el('div');
    UI.openModal({ title: 'Búsqueda: ' + q, size: 'wide', body: body });
    UI.loading(body, 'Buscando…');

    Promise.all([LT.API.getProducts(), LT.API.getLocations()]).then(function (res) {
      var products = res[0];
      var idx = LT.Locations.buildIndex(res[1]);
      var hits = products.filter(function (p) {
        return ['ID_PRODUCTO', 'NOMBRE', 'CODIGO_1D', 'CODIGO_QR', 'RFID_UID_EPC', 'LOTE', 'CATEGORIA', 'DESCRIPCION']
          .some(function (f) { return U.includesText(p[f], q); });
      });

      if (!hits.length) {
        UI.empty(body, {
          icon: '✕', title: 'Sin resultados',
          desc: 'No hay productos que coincidan con «' + q + '» por ID, código, nombre, lote o categoría.'
        });
        return;
      }

      body.innerHTML = '<div class="txt-sm txt-soft mb-3">' + hits.length + ' resultado(s)</div>' +
        hits.slice(0, 25).map(function (p) {
          var st = U.stockState(p.CANTIDAD);
          return '<div class="card mb-3"><div class="card__body">' +
            '<div class="row"><div style="flex:1;min-width:200px">' +
              '<div style="font-weight:600">' + U.esc(p.NOMBRE) + ' ' + UI.badge(st.label, st.kind) + '</div>' +
              '<div class="txt-xs mono txt-muted">' + U.esc(p.ID_PRODUCTO) + '</div>' +
              '<div class="txt-xs txt-soft">' + U.esc(p.CATEGORIA || '') + ' · Lote ' + U.esc(p.LOTE || '—') +
                ' · Stock ' + U.esc(U.fmtNum(p.CANTIDAD)) + ' · ' + U.esc(LT.Locations.nameOf(idx, p.UBICACION_ACTUAL) || '—') + '</div>' +
            '</div></div>' +
            '<div class="row mt-3">' +
              '<button class="btn btn--sm btn--primary" data-gs="detail" data-id="' + U.esc(p.ID_PRODUCTO) + '">Producto</button>' +
              '<button class="btn btn--sm btn--ghost" data-gs="inventory" data-id="' + U.esc(p.ID_PRODUCTO) + '">Inventario</button>' +
              '<button class="btn btn--sm btn--ghost" data-gs="trace" data-id="' + U.esc(p.ID_PRODUCTO) + '">Trazabilidad</button>' +
              '<button class="btn btn--sm btn--ghost" data-gs="map" data-id="' + U.esc(p.ID_PRODUCTO) + '">Mapa</button>' +
              '<button class="btn btn--sm btn--subtle" data-gs="ids" data-id="' + U.esc(p.ID_PRODUCTO) + '">Identificadores</button>' +
            '</div></div></div>';
        }).join('');

      U.$$('[data-gs]', body).forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = btn.dataset.id;
          var p = hits.filter(function (x) { return x.ID_PRODUCTO === id; })[0];
          var act = btn.dataset.gs;
          UI.closeModal();
          if (act === 'detail') LT.Products.openDetail(id);
          else if (act === 'inventory') go('inventory');
          else if (act === 'trace') go('traceability', { productId: id });
          else if (act === 'map') go('map', { productId: id });
          else if (act === 'ids' && p) LT.Code.openLabelModal(p, LT.Locations.nameOf(idx, p.UBICACION_ACTUAL));
        });
      });
    }).catch(function (err) { UI.errorState(body, err.message); });
  }

  /* ============================================================
     VISTA AYUDA / CONFIGURACIÓN
     ============================================================ */
  function initHelpView() {
    var root = document.getElementById('view-help');
    if (!root || root.__ready) return;
    root.__ready = true;

    U.$('[data-cfg="health"]', root).addEventListener('click', function (ev) {
      var btn = ev.currentTarget;
      UI.setBusy(btn, true, 'Consultando…');
      LT.API.health().then(function (h) {
        UI.setBusy(btn, false);
        paintConfig();
        UI.ok('Backend operativo', (h && h.spreadsheetName) ? h.spreadsheetName : 'Respuesta correcta');
      }).catch(function (err) {
        UI.setBusy(btn, false);
        paintConfig();
        UI.error('El backend no respondió', err.message);
      });
    });

    U.$('[data-cfg="save"]', root).addEventListener('click', function () {
      var data = UI.readForm(U.$('[data-cfg-form]', root));
      var values = {};
      if (data.APPS_SCRIPT_URL) {
        if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(data.APPS_SCRIPT_URL)) {
          UI.warn('URL sospechosa', 'La URL de la Web App suele comenzar por https://script.google.com/macros/… y terminar en /exec.');
        }
        values.APPS_SCRIPT_URL = data.APPS_SCRIPT_URL;
      }
      if (data.SPREADSHEET_ID) values.SPREADSHEET_ID = data.SPREADSHEET_ID;
      if (data.TIMEZONE) values.TIMEZONE = data.TIMEZONE;
      if (data.LOW_STOCK_THRESHOLD) values.LOW_STOCK_THRESHOLD = U.toNumber(data.LOW_STOCK_THRESHOLD, 5);
      if (data.MAX_ACCEPTABLE_ACCURACY_M) values.MAX_ACCEPTABLE_ACCURACY_M = U.toNumber(data.MAX_ACCEPTABLE_ACCURACY_M, 100);
      values.DEMO_MODE = !!data.DEMO_MODE;
      LT.API.saveConfigOverride(values);
      UI.ok('Configuración guardada en este navegador', 'Para todos los usuarios, edite assets/js/config.runtime.js.');
      boot(true);
    });

    U.$('[data-cfg="clear"]', root).addEventListener('click', function () {
      LT.API.clearConfigOverride();
      UI.info('Configuración local eliminada', 'Se vuelve a los valores de config.runtime.js.');
      boot(true);
    });

    U.$('[data-cfg="reset-demo"]', root).addEventListener('click', function () {
      UI.confirm({
        title: 'Restaurar datos de demostración',
        message: 'Se reemplazarán los datos locales por el conjunto de demostración original. Esta acción sólo afecta al modo local.',
        confirmLabel: 'Restaurar', confirmKind: 'warn'
      }).then(function (yes) {
        if (!yes) return;
        try {
          LT.API.resetDemoData();
          UI.ok('Datos de demostración restaurados');
          boot(true);
        } catch (err) { UI.error('No fue posible restaurar', err.message); }
      });
    });

    U.$('[data-cfg="clear-demo"]', root).addEventListener('click', function () {
      UI.confirm({
        title: 'Eliminar datos de demostración',
        message: 'El sistema quedará vacío en modo local. Los datos demo pueden eliminarse sin afectar al funcionamiento.',
        confirmLabel: 'Eliminar', confirmKind: 'danger'
      }).then(function (yes) {
        if (!yes) return;
        try {
          LT.API.clearDemoData();
          UI.ok('Datos de demostración eliminados');
          boot(true);
        } catch (err) { UI.error('No fue posible eliminar', err.message); }
      });
    });

    UI.initTabs(root);
  }

  function paintConfig() {
    var root = document.getElementById('view-help');
    if (!root) return;
    var c = U.cfg();
    var state = LT.API.getState();

    var form = U.$('[data-cfg-form]', root);
    if (form) {
      var set = function (name, value) {
        var input = U.$('[name="' + name + '"]', form);
        if (!input) return;
        if (input.type === 'checkbox') input.checked = !!value;
        else if (!input.value) input.value = value === undefined || value === null ? '' : value;
      };
      set('APPS_SCRIPT_URL', U.backendConfigured() ? c.APPS_SCRIPT_URL : '');
      set('SPREADSHEET_ID', c.SPREADSHEET_ID === 'PEGAR_AQUI_SPREADSHEET_ID' ? '' : c.SPREADSHEET_ID);
      set('TIMEZONE', c.TIMEZONE);
      set('LOW_STOCK_THRESHOLD', c.LOW_STOCK_THRESHOLD);
      set('MAX_ACCEPTABLE_ACCURACY_M', c.MAX_ACCEPTABLE_ACCURACY_M);
      var demo = U.$('[name="DEMO_MODE"]', form);
      if (demo) demo.checked = c.DEMO_MODE === true;
    }

    var statusBox = U.$('[data-cfg="status"]', root);
    if (statusBox) {
      var h = state.health || {};
      statusBox.innerHTML =
        '<dl class="dl-grid">' +
          '<div><dt>Modo</dt><dd>' + U.esc(state.mode === 'online' ? 'Conectado' : state.mode === 'local' ? 'Local (demostración)' : 'Error de backend') + '</dd></div>' +
          '<div><dt>Backend configurado</dt><dd>' + (state.backendConfigured ? 'Sí' : 'No') + '</dd></div>' +
          '<div><dt>Estado reportado</dt><dd>' + U.esc(h.status || '—') + '</dd></div>' +
          '<div><dt>Spreadsheet</dt><dd class="break">' + U.esc(h.spreadsheetName || '—') + '</dd></div>' +
          '<div><dt>ID de hoja</dt><dd class="mono txt-xs break">' + U.esc(h.spreadsheetId || c.SPREADSHEET_ID || '—') + '</dd></div>' +
          '<div><dt>Zona horaria</dt><dd>' + U.esc(h.timezone || c.TIMEZONE) + '</dd></div>' +
          '<div><dt>Última sincronización</dt><dd>' + U.esc(state.lastSync ? U.fmtDate(state.lastSync) : '—') + '</dd></div>' +
          '<div><dt>Conexión del navegador</dt><dd>' + (state.online === false ? 'Sin Internet' : 'En línea') + '</dd></div>' +
          '<div><dt>Contexto seguro (HTTPS)</dt><dd>' + (LT.Geo.isSecureOk() ? 'Sí' : 'No — cámara y GPS limitados') + '</dd></div>' +
          '<div><dt>Umbral de stock bajo</dt><dd>' + U.esc(c.LOW_STOCK_THRESHOLD) + ' unidades</dd></div>' +
          '<div><dt>Precisión máxima aceptable</dt><dd>' + U.esc(c.MAX_ACCEPTABLE_ACCURACY_M) + ' m</dd></div>' +
        '</dl>' +
        (state.lastError ? '<div class="banner banner--danger txt-xs mt-3">' + U.esc(state.lastError) + '</div>' : '');
    }

    var demoBox = U.$('[data-cfg="demo"]', root);
    if (demoBox) {
      demoBox.classList.toggle('hidden', !LT.API.useLocal());
    }
  }

  /* ============================================================
     ARRANQUE
     ============================================================ */
  function boot(silent) {
    LT.API.invalidate();
    return LT.API.init()
      .then(function (state) {
        paintConnection(state);
        LT.Locations.refreshAllSelects();
        if (!silent) UI.announce('LogiTrace listo.');
        handleHashChange();
        if (routerState.current) {
          var def = VIEWS[routerState.current];
          if (def && def.show) { try { def.show(routerState.params); } catch (e) { /* ya notificado */ } }
        }
        return state;
      })
      .catch(function (err) {
        paintConnection(LT.API.getState());
        UI.error('No fue posible conectar con el backend', err.message);
        handleHashChange();
      });
  }

  function wireChrome() {
    U.$$('.nav-item').forEach(function (item) {
      item.addEventListener('click', function () { go(item.dataset.view); });
    });

    U.$('#menuButton').addEventListener('click', function () {
      var sb = U.$('#sidebar');
      if (sb.classList.contains('is-open')) closeSidebar(); else openSidebar();
    });
    U.$('#sidebarScrim').addEventListener('click', closeSidebar);

    var searchInput = U.$('#globalSearch');
    searchInput.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); globalSearch(searchInput.value); }
    });
    U.$('#searchButton').addEventListener('click', function () { globalSearch(searchInput.value); });

    U.$('#quickScanButton').addEventListener('click', function () { LT.Scanner.quickScan(); });

    U.$('#themeButton').addEventListener('click', function () {
      var root = document.documentElement;
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      U.writeJson('lt.theme', next);
      LT.Dashboard.render();
    });

    var saved = U.readJson('lt.theme', null);
    if (saved) document.documentElement.setAttribute('data-theme', saved);

    global.addEventListener('hashchange', handleHashChange);

    LT.API.onStateChange(paintConnection);

    global.addEventListener('online', function () {
      UI.ok('Conexión restablecida', 'Puede reintentar las operaciones pendientes.');
      paintConnection(LT.API.getState());
    });
    global.addEventListener('offline', function () {
      UI.warn('Sin conexión', 'Las operaciones de escritura no llegarán al backend hasta recuperar Internet.');
      paintConnection(LT.API.getState());
    });

    // Atajo de teclado: "/" enfoca la búsqueda global.
    document.addEventListener('keydown', function (ev) {
      if (ev.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
        ev.preventDefault();
        searchInput.focus();
      }
    });
  }

  function checkPendingDraft() {
    var draft = LT.Events.pendingDraft();
    if (!draft) return;
    UI.toast('warning', 'Hay un evento sin registrar',
      'Se guardó un formulario el ' + U.fmtDate(draft.savedAt) + '. Ábralo desde el producto ' + draft.productId + '.', 12000);
  }

  function start() {
    wireChrome();
    UI.icons();
    boot(false).then(checkPendingDraft);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  LT.App = { boot: boot, globalSearch: globalSearch, paintConfig: paintConfig, VIEWS: VIEWS };
})(window);
