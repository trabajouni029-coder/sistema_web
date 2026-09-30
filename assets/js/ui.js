/* ============================================================
   LogiTrace — ui.js
   Componentes de interfaz reutilizables: toasts, modales,
   confirmación, loaders, estados vacíos, badges, tablas
   ordenables y paginadas, pestañas.
   Expone: window.LT.UI
   ============================================================ */
(function (global) {
  'use strict';

  var LT = global.LT = global.LT || {};
  var U = LT.U;

  /* ================= Toasts ================= */
  function toastStack() {
    var stack = document.getElementById('toastStack');
    if (!stack) {
      stack = U.el('div', { id: 'toastStack', class: 'toast-stack', role: 'status', 'aria-live': 'polite' });
      document.body.appendChild(stack);
    }
    return stack;
  }

  var ICONS = { success: '✓', error: '✕', warning: '⚠', info: 'i' };

  function toast(type, title, message, ms) {
    var kind = ['success', 'error', 'warning', 'info'].indexOf(type) === -1 ? 'info' : type;
    var node = U.el('div', { class: 'toast toast--' + kind, role: 'alert' });
    node.innerHTML =
      '<span class="badge badge--' + (kind === 'success' ? 'ok' : kind === 'error' ? 'danger' : kind === 'warning' ? 'warn' : 'info') + '">' +
        '<span class="badge__sym">' + ICONS[kind] + '</span></span>' +
      '<div style="flex:1">' +
        '<div class="toast__title">' + U.esc(title) + '</div>' +
        (message ? '<div class="toast__msg">' + U.esc(message) + '</div>' : '') +
      '</div>' +
      '<button class="toast__close" type="button" aria-label="Cerrar aviso">&times;</button>';
    node.querySelector('.toast__close').addEventListener('click', function () { remove(); });
    toastStack().appendChild(node);
    var timer = setTimeout(remove, ms || (kind === 'error' ? 9000 : 5000));
    function remove() {
      clearTimeout(timer);
      if (node.parentNode) node.parentNode.removeChild(node);
    }
    return remove;
  }

  var ok = function (t, m) { return toast('success', t, m); };
  var err = function (t, m) { return toast('error', t, m); };
  var warn = function (t, m) { return toast('warning', t, m); };
  var info = function (t, m) { return toast('info', t, m); };

  /* ================= Modales ================= */
  var modalState = { lastFocus: null, onClose: null };

  function backdrop() {
    var bd = document.getElementById('modalBackdrop');
    if (!bd) {
      bd = U.el('div', { id: 'modalBackdrop', class: 'modal-backdrop' });
      bd.innerHTML =
        '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">' +
          '<div class="modal__head">' +
            '<h2 class="modal__title" id="modalTitle"></h2>' +
            '<button class="modal__close" type="button" aria-label="Cerrar">&times;</button>' +
          '</div>' +
          '<div class="modal__body" id="modalBody"></div>' +
          '<div class="modal__foot" id="modalFoot"></div>' +
        '</div>';
      document.body.appendChild(bd);
      bd.addEventListener('click', function (ev) { if (ev.target === bd) closeModal(); });
      bd.querySelector('.modal__close').addEventListener('click', function () { closeModal(); });
      document.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape' && bd.classList.contains('is-open')) closeModal();
      });
    }
    return bd;
  }

  /**
   * openModal({ title, body (html|Node), size, actions:[{label,kind,onClick,close}], onClose })
   * Devuelve el elemento del cuerpo para seguir manipulándolo.
   */
  function openModal(opts) {
    var o = opts || {};
    var bd = backdrop();
    var modal = bd.querySelector('.modal');
    modal.className = 'modal' + (o.size === 'wide' ? ' modal--wide' : o.size === 'narrow' ? ' modal--narrow' : '');
    bd.querySelector('#modalTitle').textContent = o.title || '';

    var body = bd.querySelector('#modalBody');
    U.clear(body);
    if (typeof o.body === 'string') body.innerHTML = o.body;
    else if (o.body) body.appendChild(o.body);

    var foot = bd.querySelector('#modalFoot');
    U.clear(foot);
    var actions = o.actions || [{ label: 'Cerrar', kind: 'ghost', close: true }];
    actions.forEach(function (a) {
      var btn = U.el('button', { type: 'button', class: 'btn btn--' + (a.kind || 'ghost') });
      btn.textContent = a.label;
      if (a.id) btn.id = a.id;
      btn.addEventListener('click', function () {
        var result = a.onClick ? a.onClick(btn) : undefined;
        if (a.close !== false && result !== false) closeModal();
      });
      foot.appendChild(btn);
    });
    foot.style.display = actions.length ? '' : 'none';

    modalState.lastFocus = document.activeElement;
    modalState.onClose = o.onClose || null;
    bd.classList.add('is-open');
    document.body.style.overflow = 'hidden';

    var focusable = body.querySelector('input, select, textarea, button, [tabindex]');
    setTimeout(function () {
      if (focusable && focusable.focus) focusable.focus();
      else bd.querySelector('.modal__close').focus();
    }, 40);

    if (global.lucide && global.lucide.createIcons) global.lucide.createIcons();
    return body;
  }

  function closeModal() {
    var bd = document.getElementById('modalBackdrop');
    if (!bd || !bd.classList.contains('is-open')) return;
    bd.classList.remove('is-open');
    document.body.style.overflow = '';
    var cb = modalState.onClose;
    modalState.onClose = null;
    if (modalState.lastFocus && modalState.lastFocus.focus) {
      try { modalState.lastFocus.focus(); } catch (e) { /* elemento retirado del DOM */ }
    }
    if (cb) cb();
  }

  function modalBody() {
    var bd = document.getElementById('modalBackdrop');
    return bd ? bd.querySelector('#modalBody') : null;
  }

  function isModalOpen() {
    var bd = document.getElementById('modalBackdrop');
    return !!(bd && bd.classList.contains('is-open'));
  }

  /** Confirmación accesible (reemplaza a confirm()). */
  function confirmDialog(opts) {
    var o = opts || {};
    return new Promise(function (resolve) {
      var settled = false;
      openModal({
        title: o.title || 'Confirmar operación',
        size: 'narrow',
        body: '<div class="stack">' +
                (o.banner ? '<div class="banner banner--' + (o.bannerKind || 'warn') + '">' + o.banner + '</div>' : '') +
                '<p class="mb-0">' + (o.html || U.esc(o.message || '¿Desea continuar?')) + '</p>' +
              '</div>',
        actions: [
          { label: o.cancelLabel || 'Cancelar', kind: 'ghost', onClick: function () { settled = true; resolve(false); } },
          { label: o.confirmLabel || 'Confirmar', kind: o.confirmKind || 'primary', onClick: function () { settled = true; resolve(true); } }
        ],
        onClose: function () { if (!settled) resolve(false); }
      });
    });
  }

  /* ================= Estados ================= */
  function loading(container, text) {
    if (!container) return;
    container.innerHTML =
      '<div class="loader-block"><span class="loader"><span class="spinner"></span>' +
      U.esc(text || 'Cargando…') + '</span></div>';
  }

  function empty(container, opts) {
    if (!container) return;
    var o = opts || {};
    container.innerHTML =
      '<div class="empty">' +
        '<div class="empty__icon">' + (o.icon || '◻') + '</div>' +
        '<div class="empty__title">' + U.esc(o.title || 'Sin información') + '</div>' +
        (o.desc ? '<div class="empty__desc">' + U.esc(o.desc) + '</div>' : '') +
        (o.actionLabel ? '<div class="empty__action"><button class="btn btn--primary" type="button" data-empty-action>' + U.esc(o.actionLabel) + '</button></div>' : '') +
      '</div>';
    if (o.actionLabel && o.onAction) {
      container.querySelector('[data-empty-action]').addEventListener('click', o.onAction);
    }
  }

  function errorState(container, message, onRetry) {
    if (!container) return;
    container.innerHTML =
      '<div class="empty">' +
        '<div class="empty__icon">⚠</div>' +
        '<div class="empty__title">No fue posible cargar la información</div>' +
        '<div class="empty__desc">' + U.esc(message || '') + '</div>' +
        (onRetry ? '<div class="empty__action"><button class="btn btn--ghost" type="button" data-retry>Reintentar</button></div>' : '') +
      '</div>';
    if (onRetry) container.querySelector('[data-retry]').addEventListener('click', onRetry);
  }

  function setBusy(btn, busy, busyLabel) {
    if (!btn) return;
    if (busy) {
      btn.dataset.prevHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>' + U.esc(busyLabel || 'Procesando…');
    } else {
      btn.disabled = false;
      if (btn.dataset.prevHtml) btn.innerHTML = btn.dataset.prevHtml;
      delete btn.dataset.prevHtml;
    }
  }

  /* ================= Badges ================= */
  function badge(text, kind, symbol) {
    return '<span class="badge badge--' + (kind || 'outline') + '">' +
      (symbol ? '<span class="badge__sym">' + symbol + '</span>' : '') + U.esc(text) + '</span>';
  }

  function stockBadge(quantity) {
    var st = U.stockState(quantity);
    return badge(st.label, st.kind);
  }

  /** Badge de validación geográfica: símbolo + texto, nunca sólo color. */
  function geoBadge(status) {
    var g = U.geoInfo(status);
    return badge(g.short, g.kind, g.sym);
  }

  function eventBadge(eventName) {
    var e = U.eventByAny(eventName);
    if (!e) return badge(String(eventName || '—'), 'outline');
    var kind = e.stock > 0 ? 'ok' : e.stock < 0 ? 'warn' : e.tl === 'alert' ? 'danger' : 'brand';
    return badge(e.label, kind);
  }

  /* ================= Campos de formulario ================= */
  function fieldError(inputOrName, message, root) {
    var input = typeof inputOrName === 'string'
      ? (root || document).querySelector('[name="' + inputOrName + '"]')
      : inputOrName;
    if (!input) return;
    var field = input.closest('.field');
    if (!field) return;
    var box = field.querySelector('.field__error');
    if (!box) {
      box = U.el('div', { class: 'field__error' });
      field.appendChild(box);
    }
    if (message) {
      field.classList.add('has-error');
      box.textContent = message;
      input.setAttribute('aria-invalid', 'true');
    } else {
      field.classList.remove('has-error');
      box.textContent = '';
      input.removeAttribute('aria-invalid');
    }
  }

  function clearErrors(root) {
    U.$$('.field.has-error', root || document).forEach(function (f) {
      f.classList.remove('has-error');
      var b = f.querySelector('.field__error');
      if (b) b.textContent = '';
      var i = f.querySelector('input, select, textarea');
      if (i) i.removeAttribute('aria-invalid');
    });
  }

  /** Lee un formulario a objeto plano (recortando espacios). */
  function readForm(form) {
    var out = {};
    U.$$('input[name], select[name], textarea[name]', form).forEach(function (input) {
      if (input.type === 'checkbox') out[input.name] = input.checked;
      else if (input.type === 'radio') { if (input.checked) out[input.name] = input.value; }
      else out[input.name] = String(input.value === null || input.value === undefined ? '' : input.value).trim();
    });
    return out;
  }

  function fillSelect(select, items, opts) {
    if (!select) return;
    var o = opts || {};
    var current = o.value !== undefined ? o.value : select.value;
    var html = o.placeholder === false ? '' : '<option value="">' + U.esc(o.placeholder || '— Seleccione —') + '</option>';
    items.forEach(function (item) {
      var value = o.valueKey ? item[o.valueKey] : (item.value !== undefined ? item.value : item);
      var label = o.labelKey ? item[o.labelKey] : (item.label !== undefined ? item.label : item);
      html += '<option value="' + U.esc(value) + '">' + U.esc(label) + '</option>';
    });
    select.innerHTML = html;
    if (current) select.value = current;
  }

  /* ================= Tabla ordenable + paginada ================= */
  /**
   * renderTable(container, {
   *   columns: [{ key, label, align, sortable, cell(row), sortValue(row), hideMobile }],
   *   rows: [...], page, pageSize, sortKey, sortDir,
   *   emptyTitle, emptyDesc, responsive, onState(state)
   * })
   */
  function renderTable(container, opts) {
    if (!container) return null;
    var o = opts || {};
    var state = container.__tableState || {};
    state.page = o.page !== undefined ? o.page : (state.page || 1);
    state.pageSize = o.pageSize || state.pageSize || 25;
    state.sortKey = o.sortKey !== undefined ? o.sortKey : state.sortKey;
    state.sortDir = o.sortDir !== undefined ? o.sortDir : (state.sortDir || 'asc');
    container.__tableState = state;

    var cols = o.columns || [];
    var rows = (o.rows || []).slice();

    if (state.sortKey) {
      var col = cols.filter(function (c) { return c.key === state.sortKey; })[0];
      if (col) {
        rows = U.sortBy(rows, function (r) {
          return col.sortValue ? col.sortValue(r) : r[col.key];
        }, state.sortDir);
      }
    }

    var total = rows.length;
    var pages = Math.max(1, Math.ceil(total / state.pageSize));
    if (state.page > pages) state.page = pages;
    var start = (state.page - 1) * state.pageSize;
    var pageRows = rows.slice(start, start + state.pageSize);

    if (!total) {
      empty(container, {
        icon: o.emptyIcon || '◻',
        title: o.emptyTitle || 'Sin registros',
        desc: o.emptyDesc || '',
        actionLabel: o.emptyActionLabel,
        onAction: o.onEmptyAction
      });
      return state;
    }

    var html = '<div class="table-wrap"><table class="data' + (o.responsive === false ? '' : ' responsive') + '">' +
      '<thead><tr>' +
      cols.map(function (c) {
        return '<th' + (c.sortable === false ? '' : ' class="sortable" tabindex="0" role="button" data-sort="' + U.esc(c.key) + '"') +
          (c.align === 'right' ? ' style="text-align:right"' : '') + '>' + U.esc(c.label) +
          (state.sortKey === c.key ? '<span class="sort-ind">' + (state.sortDir === 'asc' ? '▲' : '▼') + '</span>' : '') +
          '</th>';
      }).join('') +
      '</tr></thead><tbody>' +
      pageRows.map(function (row) {
        return '<tr' + (o.rowId ? ' data-row-id="' + U.esc(o.rowId(row)) + '"' : '') + '>' +
          cols.map(function (c) {
            var content = c.cell ? c.cell(row) : U.esc(row[c.key]);
            return '<td data-label="' + U.esc(c.label) + '"' + (c.align === 'right' ? ' class="num"' : c.wrap ? ' class="wrap"' : '') + '>' +
              (content === undefined || content === null || content === '' ? '<span class="txt-muted">—</span>' : content) + '</td>';
          }).join('') + '</tr>';
      }).join('') +
      '</tbody></table></div>';

    if (total > state.pageSize) {
      html += '<div class="pager">' +
        '<button class="btn btn--sm btn--ghost" type="button" data-page="prev"' + (state.page <= 1 ? ' disabled' : '') + '>Anterior</button>' +
        '<span>Página ' + state.page + ' de ' + pages + ' · ' + total + ' registros</span>' +
        '<button class="btn btn--sm btn--ghost" type="button" data-page="next"' + (state.page >= pages ? ' disabled' : '') + '>Siguiente</button>' +
        '</div>';
    } else {
      html += '<div class="pager"><span>' + total + ' registro' + (total === 1 ? '' : 's') + '</span></div>';
    }

    container.innerHTML = html;

    U.$$('th.sortable', container).forEach(function (th) {
      function sort() {
        var key = th.dataset.sort;
        if (state.sortKey === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        else { state.sortKey = key; state.sortDir = 'asc'; }
        renderTable(container, Object.assign({}, o, { sortKey: state.sortKey, sortDir: state.sortDir, page: state.page }));
        if (o.onState) o.onState(state);
      }
      th.addEventListener('click', sort);
      th.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); sort(); }
      });
    });

    U.$$('[data-page]', container).forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.page += (btn.dataset.page === 'next' ? 1 : -1);
        renderTable(container, Object.assign({}, o, { page: state.page, sortKey: state.sortKey, sortDir: state.sortDir }));
        if (o.onState) o.onState(state);
      });
    });

    if (o.onRowClick) {
      U.$$('tbody tr', container).forEach(function (tr) {
        tr.style.cursor = 'pointer';
        tr.addEventListener('click', function (ev) {
          if (ev.target.closest('button, a, input, select')) return;
          o.onRowClick(tr.dataset.rowId, tr);
        });
      });
    }

    U.$$('[data-act]', container).forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (o.onAction) o.onAction(btn.dataset.act, btn.dataset.id, btn);
      });
    });

    if (global.lucide && global.lucide.createIcons) global.lucide.createIcons();
    return state;
  }

  /* ================= Pestañas ================= */
  function initTabs(root) {
    U.$$('[data-tabs]', root || document).forEach(function (group) {
      if (group.__tabsReady) return;
      group.__tabsReady = true;
      var tabs = U.$$('.tab', group);
      tabs.forEach(function (tab) {
        tab.addEventListener('click', function () { activate(tab); });
        tab.addEventListener('keydown', function (ev) {
          var i = tabs.indexOf(tab);
          if (ev.key === 'ArrowRight') { ev.preventDefault(); activate(tabs[(i + 1) % tabs.length], true); }
          if (ev.key === 'ArrowLeft') { ev.preventDefault(); activate(tabs[(i - 1 + tabs.length) % tabs.length], true); }
        });
      });
      function activate(tab, focus) {
        tabs.forEach(function (t) {
          var selected = t === tab;
          t.setAttribute('aria-selected', selected ? 'true' : 'false');
          t.setAttribute('tabindex', selected ? '0' : '-1');
          var panel = document.getElementById(t.getAttribute('aria-controls'));
          if (panel) panel.hidden = !selected;
        });
        if (focus && tab.focus) tab.focus();
        if (tab.dataset.onShow && LT.Router) LT.Router.fire(tab.dataset.onShow);
      }
    });
  }

  /* ================= Región aria-live ================= */
  function announce(message) {
    var live = document.getElementById('liveRegion');
    if (!live) {
      live = U.el('div', { id: 'liveRegion', class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' });
      document.body.appendChild(live);
    }
    live.textContent = '';
    setTimeout(function () { live.textContent = message; }, 30);
  }

  function icons() {
    if (global.lucide && global.lucide.createIcons) {
      try { global.lucide.createIcons(); } catch (e) { /* iconos opcionales */ }
    }
  }

  LT.UI = {
    toast: toast, ok: ok, error: err, warn: warn, info: info,
    openModal: openModal, closeModal: closeModal, modalBody: modalBody, isModalOpen: isModalOpen,
    confirm: confirmDialog,
    loading: loading, empty: empty, errorState: errorState, setBusy: setBusy,
    badge: badge, stockBadge: stockBadge, geoBadge: geoBadge, eventBadge: eventBadge,
    fieldError: fieldError, clearErrors: clearErrors, readForm: readForm, fillSelect: fillSelect,
    renderTable: renderTable, initTabs: initTabs, announce: announce, icons: icons
  };
})(window);
