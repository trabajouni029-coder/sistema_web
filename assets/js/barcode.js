/* ============================================================
   LogiTrace — barcode.js
   Generación y renderizado de identificadores visuales:
   Code 128, EAN-13 y QR (simple o estructurado).
   También construye la etiqueta logística imprimible.
   Expone: window.LT.Code
   ============================================================ */
(function (global) {
  'use strict';

  var LT = global.LT = global.LT || {};
  var U = LT.U;
  var UI = LT.UI;

  var AVISO_EAN = 'EAN-13 demostrativo / uso interno. No representa necesariamente un GTIN oficialmente asignado por GS1.';

  /* ---------- Disponibilidad de bibliotecas ---------- */
  function hasJsBarcode() { return typeof global.JsBarcode === 'function'; }
  function hasQr() { return typeof global.QRCode === 'function'; }

  function libWarning(container, lib) {
    container.innerHTML = '<div class="banner banner--warn txt-xs">No se pudo cargar la biblioteca ' +
      U.esc(lib) + '. Verifique su conexión: los gráficos de códigos se generan en el navegador.</div>';
  }

  /* ============================================================
     CODE 128
     Para identificadores alfanuméricos tipo UPEC-ALM-P001-L03-0001
     ============================================================ */
  function renderCode128(container, value, opts) {
    if (!container) return null;
    U.clear(container);
    var text = String(value || '').trim();
    if (!text) { container.innerHTML = '<span class="txt-muted txt-xs">Sin código</span>'; return null; }
    if (!hasJsBarcode()) { libWarning(container, 'JsBarcode'); return null; }
    var o = opts || {};
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    container.appendChild(svg);
    try {
      global.JsBarcode(svg, text, {
        format: 'CODE128',
        width: o.width || 2,
        height: o.height || 64,
        displayValue: o.displayValue !== false,
        fontSize: o.fontSize || 13,
        fontOptions: 'bold',
        font: 'monospace',
        textMargin: 3,
        margin: o.margin === undefined ? 6 : o.margin,
        background: '#ffffff',
        lineColor: '#000000'
      });
      return svg;
    } catch (err) {
      container.innerHTML = '<div class="banner banner--danger txt-xs">Code 128 no admite este valor: ' + U.esc(err.message) + '</div>';
      return null;
    }
  }

  /* ============================================================
     EAN-13
     Acepta 12 dígitos (calcula el 13.º) o 13 (valida checksum).
     ============================================================ */
  function renderEan13(container, value, opts) {
    if (!container) return null;
    U.clear(container);
    var res = U.ean13Resolve(value);
    if (!res.ok) {
      container.innerHTML = '<div class="banner banner--danger txt-xs">' + U.esc(res.error) + '</div>';
      return null;
    }
    if (!hasJsBarcode()) { libWarning(container, 'JsBarcode'); return null; }
    var o = opts || {};
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    container.appendChild(svg);
    try {
      global.JsBarcode(svg, res.code, {
        format: 'EAN13',
        width: o.width || 2,
        height: o.height || 64,
        displayValue: o.displayValue !== false,
        fontSize: o.fontSize || 14,
        font: 'monospace',
        margin: o.margin === undefined ? 6 : o.margin,
        background: '#ffffff',
        lineColor: '#000000',
        flat: false
      });
      svg.dataset.code = res.code;
      return svg;
    } catch (err) {
      container.innerHTML = '<div class="banner banner--danger txt-xs">EAN-13 inválido: ' + U.esc(err.message) + '</div>';
      return null;
    }
  }

  /* ============================================================
     QR — modalidad simple (ID) o estructurada (JSON)
     ============================================================ */
  function qrPayload(productId, structured) {
    if (!structured) return String(productId || '');
    return JSON.stringify({ type: 'PRODUCT', id: String(productId || ''), version: 1 });
  }

  function renderQR(container, value, opts) {
    if (!container) return null;
    U.clear(container);
    var text = String(value || '').trim();
    if (!text) { container.innerHTML = '<span class="txt-muted txt-xs">Sin código</span>'; return null; }
    if (!hasQr()) { libWarning(container, 'QRCode.js'); return null; }
    var o = opts || {};
    var holder = U.el('div');
    container.appendChild(holder);
    try {
      new global.QRCode(holder, {
        text: text,
        width: o.size || 140,
        height: o.size || 140,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: global.QRCode.CorrectLevel ? global.QRCode.CorrectLevel.M : undefined
      });
      return holder;
    } catch (err) {
      container.innerHTML = '<div class="banner banner--danger txt-xs">No fue posible generar el QR: ' + U.esc(err.message) + '</div>';
      return null;
    }
  }

  /**
   * Interpreta el contenido de un QR leído.
   * Reconoce el ID simple y el JSON estructurado {type,id,version}.
   */
  function parseQrPayload(raw) {
    var text = String(raw || '').trim();
    if (!text) return { id: '', structured: false };
    if (text.charAt(0) === '{') {
      try {
        var obj = JSON.parse(text);
        if (obj && obj.id) {
          return { id: String(obj.id).trim(), structured: true, type: obj.type || '', version: obj.version || 1 };
        }
      } catch (err) { /* no era JSON: se trata como ID simple */ }
    }
    return { id: text, structured: false };
  }

  /* ============================================================
     GENERADOR AUTOMÁTICO DE ID DE PRODUCTO
     Formato: PREFIJO-UBICACION-Pnnn-LOTE-nnnn
     Ejemplo: UPEC-ALM-P001-L03-0001
     ============================================================ */
  function locationToken(locationId) {
    var raw = U.codeToken(locationId, 'GEN');
    // Usa el primer segmento significativo: ALM-UPEC → ALM, CD-001-RA01 → CD
    var parts = String(locationId || '').split('-');
    var token = U.codeToken(parts[0], '');
    if (token.length >= 2 && !/^\d+$/.test(token)) return token.slice(0, 4);
    return raw.slice(0, 4) || 'GEN';
  }

  /**
   * buildProductId({ prefix, locationId, sequence, lote, serial })
   * Todos los tramos quedan en A-Z 0-9 y guiones: seguro para Code 128 y QR.
   */
  function buildProductId(opts) {
    var o = opts || {};
    var prefix = U.codeToken(o.prefix || 'UPEC', 'UPEC').slice(0, 6);
    var loc = locationToken(o.locationId || 'GEN');
    var seq = 'P' + U.pad(o.sequence || 1, 3);
    var lote = U.codeToken(o.lote || '', '');
    var serial = U.pad(o.serial === undefined ? (o.sequence || 1) : o.serial, 4);
    var parts = [prefix, loc, seq];
    if (lote) parts.push(lote);
    parts.push(serial);
    return parts.join('-');
  }

  /** Siguiente número de secuencia libre a partir de los productos existentes. */
  function nextSequence(products) {
    var max = 0;
    (products || []).forEach(function (p) {
      var m = String(p.ID_PRODUCTO || '').match(/-P(\d{1,4})-/);
      if (m) max = Math.max(max, Number(m[1]));
      var s = String(p.ID_PRODUCTO || '').match(/-(\d{4})$/);
      if (s) max = Math.max(max, Number(s[1]));
    });
    return max + 1;
  }

  /** EAN-13 interno sugerido: prefijo 78601 + secuencia. */
  function suggestEan13(sequence) {
    var base = '78601' + U.pad(sequence || 1, 7);
    return base + U.ean13Checksum(base);
  }

  /* ============================================================
     ETIQUETA LOGÍSTICA
     ============================================================ */
  function buildLabel(product, opts) {
    var o = opts || {};
    var p = product || {};
    var wrap = U.el('div', { class: 'label-sheet' });
    var is1dEan = String(p.TIPO_CODIGO_1D || '').toUpperCase() === 'EAN13';
    wrap.innerHTML =
      '<div class="label-sheet__top">' +
        '<span class="label-sheet__brand">LOGITRACE</span>' +
        '<span class="label-sheet__brand" style="font-weight:400">' + U.esc(U.fmtDateOnly(new Date())) + '</span>' +
      '</div>' +
      '<div class="label-sheet__name">' + U.esc(p.NOMBRE || '—') + '</div>' +
      '<div class="label-sheet__meta">' +
        '<span><b>ID:</b> ' + U.esc(p.ID_PRODUCTO || '—') + '</span>' +
        '<span><b>Lote:</b> ' + U.esc(p.LOTE || '—') + '</span>' +
        '<span><b>Categoría:</b> ' + U.esc(p.CATEGORIA || '—') + '</span>' +
        '<span><b>Stock:</b> ' + U.esc(U.fmtNum(p.CANTIDAD)) + '</span>' +
        '<span><b>Ubicación:</b> ' + U.esc(o.locationName || p.UBICACION_ACTUAL || '—') + '</span>' +
        '<span><b>Vence:</b> ' + U.esc(p.FECHA_VENCIMIENTO ? U.fmtDateOnly(p.FECHA_VENCIMIENTO) : '—') + '</span>' +
      '</div>' +
      '<div class="label-sheet__codes">' +
        '<div class="label-sheet__bc" data-label-bc></div>' +
        '<div class="label-sheet__qr" data-label-qr></div>' +
      '</div>' +
      '<div class="label-sheet__rfid"><b>RFID (SIMULADO):</b> ' + U.esc(p.RFID_UID_EPC || '—') + '</div>' +
      (is1dEan ? '<div class="label-sheet__rfid" style="border:0">' + U.esc(AVISO_EAN) + '</div>' : '');

    var bcBox = wrap.querySelector('[data-label-bc]');
    if (is1dEan) renderEan13(bcBox, p.CODIGO_1D, { height: 46, fontSize: 11, width: 1.6 });
    else renderCode128(bcBox, p.CODIGO_1D || p.ID_PRODUCTO, { height: 46, fontSize: 10, width: 1.4 });

    renderQR(wrap.querySelector('[data-label-qr]'), qrPayload(p.CODIGO_QR || p.ID_PRODUCTO, false), { size: 92 });
    return wrap;
  }

  /** Abre la etiqueta en un modal con opciones de descarga e impresión. */
  function openLabelModal(product, locationName) {
    var body = U.el('div', { class: 'stack' });
    var label = buildLabel(product, { locationName: locationName });
    var host = U.el('div', { class: 'row', style: 'justify-content:center' });
    host.appendChild(label);
    body.appendChild(host);
    body.appendChild(U.el('div', { class: 'banner banner--info txt-xs' },
      'Al imprimir se oculta la navegación de la aplicación: sólo se envía la etiqueta al papel.'));

    UI.openModal({
      title: 'Etiqueta logística — ' + (product.NOMBRE || product.ID_PRODUCTO),
      body: body,
      actions: [
        { label: 'Cerrar', kind: 'ghost' },
        {
          label: 'Descargar PNG', kind: 'subtle', close: false, onClick: function () {
            captureLabelAsPng(label, product);
          }
        },
        {
          label: 'Imprimir', kind: 'primary', close: false, onClick: function () {
            printLabel(product, locationName);
          }
        }
      ]
    });
  }

  /** Descarga por separado los identificadores gráficos de la etiqueta. */
  function captureLabelAsPng(labelNode, product) {
    var id = U.codeToken(product.ID_PRODUCTO, 'PRODUCTO');
    var bc = labelNode.querySelector('[data-label-bc] svg');
    var qr = labelNode.querySelector('[data-label-qr] canvas, [data-label-qr] img');
    var jobs = [];
    if (bc) jobs.push(U.downloadNodeAsPng(bc, 'codigo-1d-' + id + '.png'));
    if (qr) jobs.push(U.downloadNodeAsPng(qr, 'codigo-qr-' + id + '.png'));
    if (!jobs.length) { UI.warn('Sin imágenes', 'La etiqueta no contiene códigos exportables.'); return; }
    Promise.all(jobs)
      .then(function () { UI.ok('Descarga completada', 'Se exportaron los identificadores en PNG.'); })
      .catch(function (e) { UI.error('No fue posible exportar', e.message); });
  }

  /** Imprime únicamente la etiqueta usando el área reservada #printArea. */
  function printLabel(product, locationName) {
    var area = document.getElementById('printArea');
    if (!area) { UI.error('Área de impresión no disponible'); return; }
    U.clear(area);
    area.appendChild(buildLabel(product, { locationName: locationName }));
    document.body.classList.add('printing-label');
    var cleanup = function () {
      document.body.classList.remove('printing-label');
      U.clear(area);
      global.removeEventListener('afterprint', cleanup);
    };
    global.addEventListener('afterprint', cleanup);
    setTimeout(function () { global.print(); setTimeout(cleanup, 1200); }, 250);
  }

  /* ============================================================
     GALERÍA DE IDENTIFICADORES (usada por escáner y trazabilidad)
     Siempre renderiza gráficamente; nunca sólo texto.
     ============================================================ */
  function renderIdentifierGallery(container, product, opts) {
    if (!container) return;
    var o = opts || {};
    var p = product || {};
    var is1dEan = String(p.TIPO_CODIGO_1D || '').toUpperCase() === 'EAN13';
    container.innerHTML =
      '<div class="id-gallery">' +
        '<div class="id-box">' +
          '<span class="id-box__label">' + (is1dEan ? 'EAN-13' : 'Code 128') + '</span>' +
          '<div class="id-box__canvas" data-gal-1d></div>' +
          '<span class="id-box__value">' + U.esc(p.CODIGO_1D || p.ID_PRODUCTO || '—') + '</span>' +
        '</div>' +
        '<div class="id-box">' +
          '<span class="id-box__label">Código QR</span>' +
          '<div class="id-box__canvas" data-gal-qr></div>' +
          '<span class="id-box__value">' + U.esc(p.CODIGO_QR || p.ID_PRODUCTO || '—') + '</span>' +
        '</div>' +
        '<div class="id-box">' +
          '<span class="id-box__label">RFID simulado</span>' +
          '<div class="id-box__canvas"><span class="rfid-chip">' + U.esc(p.RFID_UID_EPC || '—') + '</span></div>' +
          '<span class="id-box__value">' + LT.UI.badge('RFID SIMULADO', 'warn') + '</span>' +
        '</div>' +
      '</div>' +
      (is1dEan ? '<div class="banner banner--info txt-xs mt-3">' + U.esc(AVISO_EAN) + '</div>' : '') +
      (o.actions === false ? '' :
        '<div class="row mt-3">' +
          '<button class="btn btn--sm btn--subtle" type="button" data-gal="png-1d">Descargar código 1D</button>' +
          '<button class="btn btn--sm btn--subtle" type="button" data-gal="png-qr">Descargar QR</button>' +
          '<button class="btn btn--sm btn--subtle" type="button" data-gal="copy">Copiar ID</button>' +
          '<button class="btn btn--sm btn--ghost" type="button" data-gal="label">Imprimir etiqueta</button>' +
        '</div>');

    var box1d = container.querySelector('[data-gal-1d]');
    if (is1dEan) renderEan13(box1d, p.CODIGO_1D, { height: 58, fontSize: 12 });
    else renderCode128(box1d, p.CODIGO_1D || p.ID_PRODUCTO, { height: 58, fontSize: 11, width: 1.7 });
    renderQR(container.querySelector('[data-gal-qr]'), qrPayload(p.CODIGO_QR || p.ID_PRODUCTO, false), { size: 128 });

    U.$$('[data-gal]', container).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var act = btn.dataset.gal;
        var id = U.codeToken(p.ID_PRODUCTO, 'PRODUCTO');
        if (act === 'png-1d') {
          U.downloadNodeAsPng(container.querySelector('[data-gal-1d] svg'), 'codigo-1d-' + id + '.png')
            .then(function () { UI.ok('PNG descargado'); })
            .catch(function (e) { UI.error('No fue posible exportar', e.message); });
        } else if (act === 'png-qr') {
          U.downloadNodeAsPng(container.querySelector('[data-gal-qr] canvas, [data-gal-qr] img'), 'codigo-qr-' + id + '.png')
            .then(function () { UI.ok('PNG descargado'); })
            .catch(function (e) { UI.error('No fue posible exportar', e.message); });
        } else if (act === 'copy') {
          U.copyToClipboard(p.ID_PRODUCTO || '')
            .then(function () { UI.ok('ID copiado', p.ID_PRODUCTO); })
            .catch(function () { UI.warn('No fue posible copiar', 'Seleccione el texto manualmente.'); });
        } else if (act === 'label') {
          openLabelModal(p, o.locationName);
        }
      });
    });
  }

  /* ============================================================
     VISTA "GENERAR CÓDIGOS"
     Configuración | Vista previa, con generación bajo demanda.
     ============================================================ */
  var genState = { type: 'CODE128', lastValue: '' };

  function initGeneratorView() {
    var root = document.getElementById('view-codes');
    if (!root || root.__ready) return;
    root.__ready = true;

    var typeSel = U.$('[name="genType"]', root);
    var input = U.$('[name="genValue"]', root);
    var qrMode = U.$('[name="genQrMode"]', root);
    var qrModeField = U.$('[data-field="qrMode"]', root);
    var eanHint = U.$('[data-ean-hint]', root);
    var preview = U.$('[data-gen-preview]', root);
    var meta = U.$('[data-gen-meta]', root);

    function syncFields() {
      var t = typeSel.value;
      genState.type = t;
      qrModeField.classList.toggle('hidden', t !== 'QR');
      eanHint.classList.toggle('hidden', t !== 'EAN13');
      input.placeholder = t === 'EAN13' ? '786010000003 (12 dígitos) o 13 completos'
        : t === 'RFID' ? 'Se genera automáticamente'
        : 'UPEC-ALM-P001-L03-0001';
      input.disabled = t === 'RFID';
      if (t === 'RFID' && !input.value) input.value = LT.RFID ? LT.RFID.generateEpc96() : '';
    }

    function generate() {
      U.clear(preview);
      meta.innerHTML = '';
      var t = typeSel.value;
      var value = String(input.value || '').trim();
      if (t === 'RFID') {
        value = value || (LT.RFID ? LT.RFID.generateEpc96() : '');
        input.value = value;
      }
      if (!value) { UI.warn('Falta información', 'Introduzca el valor a codificar.'); input.focus(); return; }

      if (t === 'CODE128') {
        renderCode128(preview, value, { height: 96, width: 2.2 });
        meta.innerHTML = '<div class="dl-grid">' +
          '<div><dt>Tipo</dt><dd>Code 128</dd></div>' +
          '<div><dt>Longitud</dt><dd>' + value.length + ' caracteres</dd></div>' +
          '<div><dt>Uso</dt><dd>Identificadores alfanuméricos internos</dd></div></div>';
      } else if (t === 'EAN13') {
        var res = U.ean13Resolve(value);
        if (!res.ok) { UI.error('EAN-13 inválido', res.error); preview.innerHTML = '<div class="banner banner--danger txt-sm">' + U.esc(res.error) + '</div>'; return; }
        renderEan13(preview, res.code, { height: 96, width: 2.2 });
        input.value = res.code;
        meta.innerHTML = '<div class="dl-grid">' +
          '<div><dt>Código final</dt><dd class="mono">' + U.esc(res.code) + '</dd></div>' +
          '<div><dt>Dígito de control</dt><dd>' + res.checkDigit + (res.computed ? ' (calculado)' : ' (validado)') + '</dd></div>' +
          '</div><div class="banner banner--warn txt-xs mt-3">' + U.esc(AVISO_EAN) + '</div>';
      } else if (t === 'QR') {
        var structured = qrMode.value === 'STRUCTURED';
        var payload = qrPayload(value, structured);
        renderQR(preview, payload, { size: 210 });
        meta.innerHTML = '<div class="dl-grid"><div><dt>Modalidad</dt><dd>' +
          (structured ? 'Estructurada (JSON)' : 'Simple (ID_PRODUCTO)') + '</dd></div>' +
          '<div><dt>Contenido</dt><dd class="mono break">' + U.esc(payload) + '</dd></div></div>';
      } else if (t === 'RFID') {
        preview.innerHTML = '<div class="id-box" style="max-width:320px;margin:0 auto">' +
          '<span class="id-box__label">EPC-like 96 bits</span>' +
          '<span class="rfid-chip">' + U.esc(value) + '</span>' +
          '<span class="id-box__value">' + UI.badge('RFID SIMULADO', 'warn') + '</span></div>';
        meta.innerHTML = '<div class="banner banner--warn txt-xs">Identificador generado por software. LogiTrace NO realiza lectura RFID física.</div>';
      }
      genState.lastValue = value;
      UI.announce('Identificador generado.');
    }

    typeSel.addEventListener('change', function () { syncFields(); U.clear(preview); meta.innerHTML = ''; });
    U.$('[data-gen="generate"]', root).addEventListener('click', generate);
    U.$('[data-gen="download"]', root).addEventListener('click', function () {
      var node = preview.querySelector('svg, canvas, img');
      if (!node) { UI.warn('Nada que descargar', 'Genere primero un identificador.'); return; }
      U.downloadNodeAsPng(node, 'logitrace-' + U.codeToken(genState.type) + '-' + U.codeToken(genState.lastValue, 'codigo') + '.png')
        .then(function () { UI.ok('PNG descargado'); })
        .catch(function (e) { UI.error('No fue posible exportar', e.message); });
    });
    U.$('[data-gen="copy"]', root).addEventListener('click', function () {
      if (!genState.lastValue) { UI.warn('Nada que copiar'); return; }
      U.copyToClipboard(genState.lastValue).then(function () { UI.ok('Valor copiado'); });
    });
    U.$('[data-gen="print"]', root).addEventListener('click', function () {
      var node = preview.querySelector('svg, canvas, img');
      if (!node) { UI.warn('Nada que imprimir', 'Genere primero un identificador.'); return; }
      var area = document.getElementById('printArea');
      U.clear(area);
      var box = U.el('div', { class: 'label-sheet' });
      box.innerHTML = '<div class="label-sheet__top"><span class="label-sheet__brand">LOGITRACE</span>' +
        '<span class="label-sheet__brand" style="font-weight:400">' + U.esc(genState.type) + '</span></div>';
      var holder = U.el('div', { class: 'txt-center mt-3' });
      holder.appendChild(node.cloneNode(true));
      box.appendChild(holder);
      area.appendChild(box);
      document.body.classList.add('printing-label');
      var cleanup = function () { document.body.classList.remove('printing-label'); U.clear(area); };
      setTimeout(function () { global.print(); setTimeout(cleanup, 1200); }, 200);
    });
    U.$('[data-gen="suggest"]', root).addEventListener('click', function () {
      LT.API.getProducts().then(function (products) {
        var seq = nextSequence(products);
        if (typeSel.value === 'EAN13') input.value = suggestEan13(seq);
        else if (typeSel.value === 'RFID') input.value = LT.RFID.generateEpc96();
        else input.value = buildProductId({ sequence: seq, locationId: 'ALM-UPEC', lote: 'L' + U.pad(seq % 12 + 1, 2), serial: seq });
        generate();
      });
    });

    syncFields();
  }

  LT.Code = {
    AVISO_EAN: AVISO_EAN,
    renderCode128: renderCode128,
    renderEan13: renderEan13,
    renderQR: renderQR,
    qrPayload: qrPayload,
    parseQrPayload: parseQrPayload,
    buildProductId: buildProductId,
    nextSequence: nextSequence,
    suggestEan13: suggestEan13,
    buildLabel: buildLabel,
    openLabelModal: openLabelModal,
    printLabel: printLabel,
    renderIdentifierGallery: renderIdentifierGallery,
    initGeneratorView: initGeneratorView
  };
})(window);
