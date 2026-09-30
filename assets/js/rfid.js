/* ============================================================
   LogiTrace — rfid.js
   RFID SIMULADO. Genera UID y EPC-like de 96 bits por software.
   LogiTrace NO realiza lectura de etiquetas RFID físicas: no
   existe API de navegador para ello y no se afirma lo contrario
   en ninguna parte de la interfaz.
   Expone: window.LT.RFID
   ============================================================ */
(function (global) {
  'use strict';

  var LT = global.LT = global.LT || {};
  var U = LT.U;
  var UI = LT.UI;

  var AVISO = 'RFID SIMULADO — identificador generado por software. No corresponde a una lectura de etiqueta física.';

  function randomHex(bytes) {
    var out = '';
    if (global.crypto && global.crypto.getRandomValues) {
      var buf = new Uint8Array(bytes);
      global.crypto.getRandomValues(buf);
      for (var i = 0; i < bytes; i++) out += ('0' + buf[i].toString(16)).slice(-2);
    } else {
      for (var j = 0; j < bytes; j++) out += ('0' + Math.floor(Math.random() * 256).toString(16)).slice(-2);
    }
    return out.toUpperCase();
  }

  /** UID de 8 bytes, formato habitual de tarjetas: AA:BB:CC:... */
  function generateUid(separator) {
    var hex = randomHex(8);
    var pairs = hex.match(/.{2}/g);
    return pairs.join(separator === undefined ? ':' : separator);
  }

  /**
   * EPC-like de 96 bits (24 caracteres hexadecimales).
   * Estructura inspirada en SGTIN-96 pero con valores propios:
   *   header(8) + filtro/partición(8) + empresa(24) + referencia(20) + serie(36)
   * El resultado es determinista en longitud y verificable visualmente.
   */
  function generateEpc96(seedText) {
    var header = '30';            // 0x30 = SGTIN-96 en la práctica industrial
    var filter = '34';            // valor demostrativo fijo
    var body;
    if (seedText) {
      // Derivación estable a partir de un texto (para reproducibilidad en demos).
      var h = 0x811c9dc5;
      var s = String(seedText);
      for (var i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = (h * 0x01000193) >>> 0;
      }
      var part = ('00000000' + h.toString(16).toUpperCase()).slice(-8);
      body = (part + randomHex(8)).slice(0, 20);
    } else {
      body = randomHex(10);       // 20 caracteres hex
    }
    var epc = (header + filter + body).toUpperCase().replace(/[^0-9A-F]/g, '');
    while (epc.length < 24) epc += randomHex(1);
    return epc.slice(0, 24);
  }

  function isEpcLike(value) {
    return /^[0-9A-F]{24}$/i.test(String(value || '').replace(/[\s:-]/g, ''));
  }

  function normalize(value) {
    return String(value || '').replace(/[\s:-]/g, '').toUpperCase();
  }

  /** Render de un chip RFID con su aviso obligatorio. */
  function renderChip(container, value, opts) {
    if (!container) return;
    var o = opts || {};
    container.innerHTML =
      '<div class="id-box">' +
        '<span class="id-box__label">RFID simulado (EPC 96 bits)</span>' +
        '<span class="rfid-chip">' + U.esc(value || '—') + '</span>' +
        '<span class="id-box__value">' + UI.badge('RFID SIMULADO', 'warn') + '</span>' +
      '</div>' +
      (o.note === false ? '' : '<div class="banner banner--warn txt-xs mt-3">' + U.esc(AVISO) + '</div>');
  }

  /* ============================================================
     VISTA RFID
     Permite generar identificadores y "leerlos" introduciendo el
     valor manualmente (lectura simulada), buscando el producto.
     ============================================================ */
  function initView() {
    var root = document.getElementById('view-rfid');
    if (!root || root.__ready) return;
    root.__ready = true;

    var uidOut = U.$('[data-rfid="uid"]', root);
    var epcOut = U.$('[data-rfid="epc"]', root);
    var chipBox = U.$('[data-rfid="chip"]', root);
    var readInput = U.$('[name="rfidRead"]', root);
    var resultBox = U.$('[data-rfid="result"]', root);

    function generate() {
      var uid = generateUid();
      var epc = generateEpc96();
      uidOut.textContent = uid;
      epcOut.textContent = epc;
      renderChip(chipBox, epc, { note: false });
      UI.announce('Identificador RFID simulado generado.');
    }

    U.$('[data-rfid="generate"]', root).addEventListener('click', generate);

    U.$('[data-rfid="copy"]', root).addEventListener('click', function () {
      var epc = epcOut.textContent;
      if (!epc || epc === '—') { UI.warn('Genere primero un EPC'); return; }
      U.copyToClipboard(epc).then(function () { UI.ok('EPC copiado', epc); });
    });

    U.$('[data-rfid="lookup"]', root).addEventListener('click', function (ev) {
      var code = normalize(readInput.value);
      if (!code) { UI.warn('Introduzca un UID/EPC', 'La lectura RFID es simulada: escriba o pegue el identificador.'); return; }
      UI.setBusy(ev.currentTarget, true, 'Consultando…');
      UI.loading(resultBox, 'Buscando producto asociado…');
      LT.API.findProductByCode(code)
        .then(function (res) {
          UI.setBusy(ev.currentTarget, false);
          if (!res.product) {
            UI.empty(resultBox, {
              icon: '✕', title: 'Ningún producto usa ese identificador RFID',
              desc: 'Verifique el valor o registre el producto con este EPC.'
            });
            return;
          }
          U.clear(resultBox);
          resultBox.appendChild(U.el('div', { class: 'banner banner--ok mb-3' },
            '<div><div class="banner__title">Producto identificado</div>' +
            '<div class="txt-xs">' + U.esc(res.product.NOMBRE) + ' · ' + U.esc(res.product.ID_PRODUCTO) + '</div></div>'));
          var host = U.el('div');
          resultBox.appendChild(host);
          LT.Scanner.renderProductSheet(host, res.product, res.events, {
            readValue: code, technology: 'RFID', when: new Date()
          });
        })
        .catch(function (err) {
          UI.setBusy(ev.currentTarget, false);
          UI.errorState(resultBox, err.message);
        });
    });

    generate();
  }

  LT.RFID = {
    AVISO: AVISO,
    generateUid: generateUid,
    generateEpc96: generateEpc96,
    isEpcLike: isEpcLike,
    normalize: normalize,
    renderChip: renderChip,
    initView: initView
  };
})(window);
