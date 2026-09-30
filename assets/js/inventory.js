/* ============================================================
   LogiTrace — inventory.js
   Inventario consolidado: KPIs, tabla de existencias y
   tarjetas por categoría.
   El stock NUNCA se edita aquí: sólo cambia mediante eventos.
   Expone: window.LT.Inventory
   ============================================================ */
(function (global) {
  'use strict';

  var LT = global.LT = global.LT || {};
  var U = LT.U;
  var UI = LT.UI;

  function initView() {
    var root = document.getElementById('view-inventory');
    if (!root || root.__ready) return;
    root.__ready = true;

    U.$('[data-inv-action="reload"]', root).addEventListener('click', function () {
      LT.API.invalidate(['products']);
      render();
    });
    U.$('[name="invSearch"]', root).addEventListener('input', U.debounce(function () { render(); }, 200));
    U.$$('#view-inventory .filters select').forEach(function (sel) {
      sel.addEventListener('change', function () { render(); });
    });
    render();
  }

  function render() {
    var root = document.getElementById('view-inventory');
    if (!root) return;
    var kpiBox = U.$('[data-inv="kpis"]', root);
    var catBox = U.$('[data-inv="categories"]', root);
    var tableBox = U.$('[data-inv="table"]', root);
    UI.loading(tableBox, 'Calculando inventario…');

    Promise.all([LT.API.getInventory(), LT.API.getLocations()]).then(function (res) {
      var inv = res[0];
      var idx = LT.Locations.buildIndex(res[1]);
      var t = inv.totals || {};
      var items = inv.items || [];

      kpiBox.innerHTML =
        '<div class="kpi"><div class="kpi__label">Productos</div><div class="kpi__value">' + U.fmtNum(t.productos) + '</div>' +
          '<div class="kpi__hint">Referencias distintas</div></div>' +
        '<div class="kpi kpi--accent"><div class="kpi__label">Unidades totales</div><div class="kpi__value">' + U.fmtNum(t.unidades) + '</div></div>' +
        '<div class="kpi kpi--info"><div class="kpi__label">Categorías</div><div class="kpi__value">' + U.fmtNum(t.categorias) + '</div></div>' +
        '<div class="kpi kpi--warn"><div class="kpi__label">Stock bajo</div><div class="kpi__value">' + U.fmtNum(t.stockBajo) + '</div>' +
          '<div class="kpi__hint">Umbral ≤ ' + U.fmtNum(t.umbralStockBajo) + ' unidades</div></div>' +
        '<div class="kpi kpi--danger"><div class="kpi__label">Agotados</div><div class="kpi__value">' + U.fmtNum(t.agotados) + '</div></div>';

      /* --- Tarjetas por categoría --- */
      var cats = inv.categories || [];
      if (!cats.length) {
        UI.empty(catBox, { title: 'Sin categorías', desc: 'Registre productos para ver el desglose.' });
      } else {
        catBox.innerHTML = '<div class="grid grid--cards">' + cats.map(function (c) {
          return '<div class="card"><div class="card__body">' +
            '<div class="kpi__label">' + U.esc(c.categoria) + '</div>' +
            '<div class="kpi__value">' + U.fmtNum(c.productos) + ' <span class="txt-sm txt-soft">producto' + (c.productos === 1 ? '' : 's') + '</span></div>' +
            '<div class="txt-sm txt-soft">' + U.fmtNum(c.unidades) + ' unidades</div>' +
            '<div class="txt-xs txt-muted mt-2">Última actualización: ' + U.esc(c.ultimaActualizacion ? U.fmtDate(c.ultimaActualizacion) : '—') + '</div>' +
            '</div></div>';
        }).join('') + '</div>';
      }

      /* --- Filtros --- */
      var catSel = U.$('[name="invCategory"]', root);
      if (!catSel.dataset.filled) {
        UI.fillSelect(catSel, cats.map(function (c) { return c.categoria; }), { placeholder: 'Todas las categorías' });
        catSel.dataset.filled = '1';
      }
      var search = String((U.$('[name="invSearch"]', root) || {}).value || '');
      var cat = catSel.value;
      var stateFilter = (U.$('[name="invState"]', root) || {}).value || '';

      var filtered = items.filter(function (p) {
        if (cat && p.CATEGORIA !== cat) return false;
        if (stateFilter && U.stockState(p.CANTIDAD).key !== stateFilter) return false;
        if (!search) return true;
        return ['ID_PRODUCTO', 'NOMBRE', 'CATEGORIA', 'LOTE', 'CODIGO_1D'].some(function (f) {
          return U.includesText(p[f], search);
        });
      });

      UI.renderTable(tableBox, {
        rows: filtered,
        rowId: function (p) { return p.ID_PRODUCTO; },
        sortKey: 'CANTIDAD',
        sortDir: 'asc',
        pageSize: 20,
        emptyTitle: 'Sin existencias que mostrar',
        onRowClick: function (id) { LT.Products.openDetail(id); },
        columns: [
          { key: 'CODIGO_1D', label: 'Código', cell: function (p) { return '<span class="mono txt-xs">' + U.esc(p.CODIGO_1D || p.ID_PRODUCTO) + '</span>'; } },
          { key: 'NOMBRE', label: 'Producto', wrap: true },
          { key: 'CATEGORIA', label: 'Categoría', cell: function (p) { return UI.badge(p.CATEGORIA || '—', 'brand'); } },
          { key: 'LOTE', label: 'Lote' },
          {
            key: 'CANTIDAD', label: 'Stock', align: 'right',
            sortValue: function (p) { return U.toNumber(p.CANTIDAD, 0); },
            cell: function (p) { return '<b>' + U.fmtNum(p.CANTIDAD) + '</b>'; }
          },
          { key: 'UBICACION_ACTUAL', label: 'Ubicación', cell: function (p) { return U.esc(LT.Locations.nameOf(idx, p.UBICACION_ACTUAL) || '—'); } },
          { key: 'estado', label: 'Estado', sortValue: function (p) { return U.stockState(p.CANTIDAD).key; }, cell: function (p) { return UI.stockBadge(p.CANTIDAD); } },
          {
            key: 'ULTIMA_ACTUALIZACION', label: 'Actualización',
            sortValue: function (p) { var d = U.parseDate(p.ULTIMA_ACTUALIZACION); return d ? d.getTime() : 0; },
            cell: function (p) { return '<span class="txt-xs">' + U.esc(U.fmtDate(p.ULTIMA_ACTUALIZACION)) + '</span>'; }
          },
          {
            key: 'acciones', label: 'Acciones', sortable: false,
            cell: function (p) {
              return '<div class="btn-group">' +
                '<button class="btn btn--sm btn--subtle" data-act="event" data-id="' + U.esc(p.ID_PRODUCTO) + '">Evento</button>' +
                '<button class="btn btn--sm btn--ghost" data-act="trace" data-id="' + U.esc(p.ID_PRODUCTO) + '">Traza</button>' +
                '</div>';
            }
          }
        ],
        onAction: function (act, id) {
          var p = filtered.filter(function (x) { return x.ID_PRODUCTO === id; })[0];
          if (!p) return;
          if (act === 'event') LT.Events.openForm(p, { onSaved: function () { LT.API.invalidate(); render(); } });
          if (act === 'trace') LT.Router.go('traceability', { productId: id });
        }
      });
    }).catch(function (err) {
      UI.errorState(tableBox, err.message, function () { render(); });
    });
  }

  LT.Inventory = { initView: initView, render: render };
})(window);
