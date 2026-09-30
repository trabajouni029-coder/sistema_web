/* ============================================================
   LogiTrace — dashboard.js
   KPIs logísticos y geográficos + gráficos con Chart.js.
   Expone: window.LT.Dashboard
   ============================================================ */
(function (global) {
  'use strict';

  var LT = global.LT = global.LT || {};
  var U = LT.U;
  var UI = LT.UI;

  var charts = {};

  var PALETTE = ['#1a6aad', '#12a37d', '#c07c00', '#4a5fb0', '#9e2323', '#0f8a6a', '#2585cc', '#78899b'];
  var GEO_COLORS = { OK: '#1c9d5c', 'Fuera de geocerca': '#c62f2f', 'Baja precisión': '#c07c00', 'Sin GPS': '#a3b1bf' };

  function hasChart() { return typeof global.Chart !== 'undefined'; }

  function destroyChart(key) {
    if (charts[key]) { try { charts[key].destroy(); } catch (e) { /* ya destruido */ } delete charts[key]; }
  }

  function baseOptions(extra) {
    var textColor = getComputedStyle(document.body).getPropertyValue('--text-soft').trim() || '#55697e';
    var gridColor = getComputedStyle(document.body).getPropertyValue('--border').trim() || '#e2e8ee';
    return Object.assign({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: textColor, font: { size: 11 }, boxWidth: 12 } },
        tooltip: { padding: 8 }
      },
      scales: {
        x: { ticks: { color: textColor, font: { size: 10 } }, grid: { color: gridColor } },
        y: { beginAtZero: true, ticks: { color: textColor, font: { size: 10 }, precision: 0 }, grid: { color: gridColor } }
      }
    }, extra || {});
  }

  function renderChart(key, canvasId, config) {
    if (!hasChart()) return;
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    destroyChart(key);
    charts[key] = new global.Chart(canvas.getContext('2d'), config);
  }

  function initView() {
    var root = document.getElementById('view-dashboard');
    if (!root || root.__ready) return;
    root.__ready = true;
    U.$('[data-dash-action="reload"]', root).addEventListener('click', function () {
      LT.API.invalidate();
      render();
    });
    U.$$('[data-dash-goto]', root).forEach(function (btn) {
      btn.addEventListener('click', function () { LT.Router.go(btn.dataset.dashGoto); });
    });
    render();
  }

  function render() {
    var root = document.getElementById('view-dashboard');
    if (!root) return;
    var logBox = U.$('[data-dash="kpis"]', root);
    var geoBox = U.$('[data-dash="geo"]', root);
    var chartsBox = U.$('[data-dash="charts"]', root);
    var alertBox = U.$('[data-dash="alerts"]', root);

    UI.loading(logBox, 'Calculando indicadores…');
    geoBox.innerHTML = '';

    LT.API.getDashboard().then(function (d) {
      var l = d.logistics || {};
      var g = d.geo || {};
      var c = d.charts || {};

      logBox.innerHTML =
        '<div class="kpi"><div class="kpi__label">Productos</div><div class="kpi__value">' + U.fmtNum(l.productos) + '</div></div>' +
        '<div class="kpi kpi--accent"><div class="kpi__label">Unidades</div><div class="kpi__value">' + U.fmtNum(l.unidades) + '</div></div>' +
        '<div class="kpi kpi--info"><div class="kpi__label">Categorías</div><div class="kpi__value">' + U.fmtNum(l.categorias) + '</div></div>' +
        '<div class="kpi kpi--warn"><div class="kpi__label">Stock bajo</div><div class="kpi__value">' + U.fmtNum(l.stockBajo) + '</div></div>' +
        '<div class="kpi kpi--danger"><div class="kpi__label">Agotados</div><div class="kpi__value">' + U.fmtNum(l.agotados) + '</div></div>' +
        '<div class="kpi"><div class="kpi__label">Eventos</div><div class="kpi__value">' + U.fmtNum(l.eventos) + '</div></div>' +
        '<div class="kpi kpi--info"><div class="kpi__label">Eventos hoy</div><div class="kpi__value">' + U.fmtNum(l.eventosHoy) + '</div></div>' +
        '<div class="kpi kpi--ok"><div class="kpi__label">Recepciones</div><div class="kpi__value">' + U.fmtNum(l.recepciones) + '</div></div>' +
        '<div class="kpi kpi--warn"><div class="kpi__label">Despachos</div><div class="kpi__value">' + U.fmtNum(l.despachos) + '</div></div>' +
        '<div class="kpi kpi--danger"><div class="kpi__label">Incidencias</div><div class="kpi__value">' + U.fmtNum(l.incidencias) + '</div></div>';

      geoBox.innerHTML =
        '<div class="kpi kpi--info"><div class="kpi__label">Eventos georreferenciados</div>' +
          '<div class="kpi__value">' + U.fmtNum(g.georreferenciados) + '</div>' +
          '<div class="kpi__hint">de ' + U.fmtNum(l.eventos) + ' eventos</div></div>' +
        '<div class="kpi kpi--ok"><div class="kpi__label">✓ % OK</div><div class="kpi__value">' + U.fmtNum(g.pctOk, 1) + '%</div>' +
          '<div class="kpi__hint">' + U.fmtNum(g.ok) + ' eventos</div></div>' +
        '<div class="kpi kpi--danger"><div class="kpi__label">⚠ % fuera de geocerca</div><div class="kpi__value">' + U.fmtNum(g.pctFuera, 1) + '%</div>' +
          '<div class="kpi__hint">' + U.fmtNum(g.fueraGeocerca) + ' eventos</div></div>' +
        '<div class="kpi kpi--warn"><div class="kpi__label">◉ % baja precisión</div><div class="kpi__value">' + U.fmtNum(g.pctBaja, 1) + '%</div>' +
          '<div class="kpi__hint">' + U.fmtNum(g.bajaPrecision) + ' eventos</div></div>' +
        '<div class="kpi"><div class="kpi__label">— Sin GPS</div><div class="kpi__value">' + U.fmtNum(g.sinGps) + '</div>' +
          '<div class="kpi__hint">' + U.fmtNum(g.pctSinGps, 1) + '% del total</div></div>';

      /* --- Alertas operativas --- */
      var alerts = [];
      if (l.agotados) alerts.push({ kind: 'danger', title: l.agotados + ' producto(s) agotado(s)', desc: 'Revise el inventario y programe reposición.', goto: 'inventory' });
      if (l.stockBajo) alerts.push({ kind: 'warn', title: l.stockBajo + ' producto(s) con stock bajo', desc: 'Por debajo del umbral configurado.', goto: 'inventory' });
      if (g.fueraGeocerca) alerts.push({ kind: 'danger', title: g.fueraGeocerca + ' evento(s) fuera de geocerca', desc: 'Excepciones geográficas registradas como evidencia.', goto: 'map' });
      if (g.bajaPrecision) alerts.push({ kind: 'warn', title: g.bajaPrecision + ' evento(s) de baja precisión', desc: 'La precisión del GPS superó el umbral configurado.', goto: 'map' });
      if (l.incidencias) alerts.push({ kind: 'warn', title: l.incidencias + ' incidencia(s) registrada(s)', desc: 'No modifican inventario automáticamente.', goto: 'events' });

      if (!alerts.length) {
        alertBox.innerHTML = '<div class="banner banner--ok"><div><div class="banner__title">Sin alertas operativas</div>' +
          '<div class="txt-xs">Inventario y validaciones geográficas dentro de los parámetros configurados.</div></div></div>';
      } else {
        alertBox.innerHTML = alerts.map(function (a) {
          return '<div class="banner banner--' + a.kind + ' mb-2"><div style="flex:1">' +
            '<div class="banner__title">' + U.esc(a.title) + '</div>' +
            '<div class="txt-xs">' + U.esc(a.desc) + '</div></div>' +
            '<button class="btn btn--sm btn--ghost" type="button" data-alert-goto="' + a.goto + '">Revisar</button></div>';
        }).join('');
        U.$$('[data-alert-goto]', alertBox).forEach(function (btn) {
          btn.addEventListener('click', function () { LT.Router.go(btn.dataset.alertGoto); });
        });
      }

      /* --- Gráficos --- */
      if (!hasChart()) {
        chartsBox.querySelectorAll('.chart-box').forEach(function (box) {
          box.innerHTML = '<div class="banner banner--warn txt-xs">No se pudo cargar Chart.js: los gráficos requieren conexión al CDN.</div>';
        });
        return;
      }

      var invCat = c.inventoryByCategory || [];
      renderChart('inv', 'chartInventory', {
        type: 'bar',
        data: {
          labels: invCat.map(function (x) { return x.label; }),
          datasets: [
            { label: 'Unidades', data: invCat.map(function (x) { return x.unidades; }), backgroundColor: PALETTE[0], borderRadius: 4 },
            { label: 'Productos', data: invCat.map(function (x) { return x.productos; }), backgroundColor: PALETTE[1], borderRadius: 4 }
          ]
        },
        options: baseOptions()
      });

      var tech = c.technologies || [];
      renderChart('tech', 'chartTech', {
        type: 'doughnut',
        data: {
          labels: tech.map(function (x) { return x.label; }),
          datasets: [{ data: tech.map(function (x) { return x.value; }), backgroundColor: PALETTE.slice(0, tech.length), borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } } }
      });

      var act = c.recentActivity || [];
      renderChart('act', 'chartActivity', {
        type: 'line',
        data: {
          labels: act.map(function (x) { return x.label; }),
          datasets: [{
            label: 'Eventos', data: act.map(function (x) { return x.value; }),
            borderColor: PALETTE[0], backgroundColor: 'rgba(26,106,173,0.15)',
            fill: true, tension: 0.3, pointRadius: 3
          }]
        },
        options: baseOptions()
      });

      var geoChart = c.geoValidation || [];
      renderChart('geo', 'chartGeo', {
        type: 'bar',
        data: {
          labels: geoChart.map(function (x) { return x.label; }),
          datasets: [{
            label: 'Eventos', data: geoChart.map(function (x) { return x.value; }),
            backgroundColor: geoChart.map(function (x) { return GEO_COLORS[x.label] || PALETTE[0]; }),
            borderRadius: 4
          }]
        },
        options: baseOptions({ plugins: { legend: { display: false } } })
      });

      var exc = c.exceptionsByLocation || [];
      var excBox = document.getElementById('chartExceptions');
      if (!exc.length && excBox) {
        excBox.parentNode.innerHTML = '<div class="banner banner--ok txt-xs">Ninguna ubicación acumula excepciones geográficas.</div>';
      } else {
        renderChart('exc', 'chartExceptions', {
          type: 'bar',
          data: {
            labels: exc.map(function (x) { return x.label; }),
            datasets: [{ label: 'Excepciones', data: exc.map(function (x) { return x.value; }), backgroundColor: PALETTE[4], borderRadius: 4 }]
          },
          options: baseOptions({ indexAxis: 'y', plugins: { legend: { display: false } } })
        });
      }

      var byType = c.eventsByType || [];
      renderChart('evt', 'chartEvents', {
        type: 'bar',
        data: {
          labels: byType.map(function (x) { return x.label; }),
          datasets: [{ label: 'Eventos', data: byType.map(function (x) { return x.value; }), backgroundColor: PALETTE[3], borderRadius: 4 }]
        },
        options: baseOptions({ indexAxis: 'y', plugins: { legend: { display: false } } })
      });
    }).catch(function (err) {
      UI.errorState(logBox, err.message, function () { render(); });
    });
  }

  LT.Dashboard = { initView: initView, render: render };
})(window);
