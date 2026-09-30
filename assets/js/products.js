/* ============================================================
   LogiTrace — products.js
   Alta, edición, consulta y listado de productos.
   · ID automático legible y compatible con Code 128 / QR / RFID
   · ORIGEN, DESTINO y UBICACION_ACTUAL siempre desde el maestro
   · La cantidad de creación es STOCK INICIAL (no genera recepción)
   Expone: window.LT.Products
   ============================================================ */
(function (global) {
  'use strict';

  var LT = global.LT = global.LT || {};
  var U = LT.U;
  var UI = LT.UI;
  var CAT = LT.CAT;

  /* ============================================================
     FORMULARIO
     ============================================================ */
  function openForm(existing, opts) {
    var o = opts || {};
    var isEdit = !!existing;

    Promise.all([LT.API.getProducts(), LT.API.getLocations()]).then(function (res) {
      var products = res[0];
      var locations = res[1];
      var idx = LT.Locations.buildIndex(locations);
      var nextSeq = LT.Code.nextSequence(products);

      var body = U.el('div');
      body.innerHTML =
        '<form data-p-form novalidate>' +
          '<fieldset>' +
            '<legend>Identificación del producto</legend>' +
            '<div class="grid grid--form">' +
              '<div class="field">' +
                '<label class="field__label" for="pId">ID_PRODUCTO <span class="req">*</span></label>' +
                '<input id="pId" name="ID_PRODUCTO" maxlength="40" placeholder="UPEC-ALM-P001-L03-0001" ' + (isEdit ? 'readonly' : '') + '>' +
                '<span class="field__hint">Único, legible, compatible con Code 128 y QR.</span>' +
                '<span class="field__error"></span>' +
              '</div>' +
              (isEdit ? '' :
              '<div class="field">' +
                '<label class="field__label">&nbsp;</label>' +
                '<button class="btn btn--subtle" type="button" data-p="genId">Generar ID automático</button>' +
                '<span class="field__hint">Formato PREFIJO-UBICACIÓN-Pnnn-LOTE-nnnn.</span>' +
              '</div>') +
              '<div class="field">' +
                '<label class="field__label" for="pName">Nombre <span class="req">*</span></label>' +
                '<input id="pName" name="NOMBRE" maxlength="90" placeholder="Teclado mecánico retroiluminado">' +
                '<span class="field__error"></span>' +
              '</div>' +
              '<div class="field">' +
                '<label class="field__label" for="pCat">Categoría <span class="req">*</span></label>' +
                '<input id="pCat" name="CATEGORIA" list="catList" maxlength="40" placeholder="Tecnología">' +
                '<datalist id="catList"></datalist>' +
                '<span class="field__error"></span>' +
              '</div>' +
              '<div class="field">' +
                '<label class="field__label" for="pLote">Lote <span class="req">*</span></label>' +
                '<input id="pLote" name="LOTE" maxlength="20" placeholder="L03">' +
                '<span class="field__error"></span>' +
              '</div>' +
              '<div class="field">' +
                '<label class="field__label" for="pQty">Cantidad inicial <span class="req">*</span></label>' +
                '<input id="pQty" name="CANTIDAD" inputmode="numeric" value="0" ' + (isEdit ? 'readonly' : '') + '>' +
                '<span class="field__hint">' + (isEdit
                  ? 'El stock sólo cambia mediante eventos logísticos.'
                  : 'Es el STOCK INICIAL: no genera un evento de recepción adicional.') + '</span>' +
                '<span class="field__error"></span>' +
              '</div>' +
              '<div class="field">' +
                '<label class="field__label" for="pExp">Fecha de vencimiento</label>' +
                '<input id="pExp" name="FECHA_VENCIMIENTO" type="date">' +
                '<span class="field__hint">Vacío si no aplica.</span>' +
              '</div>' +
            '</div>' +
            '<div class="field">' +
              '<label class="field__label" for="pDesc">Descripción</label>' +
              '<textarea id="pDesc" name="DESCRIPCION" maxlength="240"></textarea>' +
            '</div>' +
          '</fieldset>' +

          '<fieldset>' +
            '<legend>Ubicaciones (maestro, sin texto libre)</legend>' +
            '<div class="grid grid--form">' +
              '<div class="field">' +
                '<label class="field__label" for="pOrigin">Origen</label>' +
                '<select id="pOrigin" name="ORIGEN" data-location-select data-placeholder="— Seleccione origen —"></select>' +
              '</div>' +
              '<div class="field">' +
                '<label class="field__label" for="pDest">Destino</label>' +
                '<select id="pDest" name="DESTINO" data-location-select data-placeholder="— Seleccione destino —"></select>' +
              '</div>' +
              '<div class="field">' +
                '<label class="field__label" for="pLoc">Ubicación actual <span class="req">*</span></label>' +
                '<select id="pLoc" name="UBICACION_ACTUAL" data-location-select data-placeholder="— Seleccione ubicación —"></select>' +
                '<span class="field__error"></span>' +
              '</div>' +
            '</div>' +
            '<div class="txt-xs txt-muted">Se muestra el NOMBRE y se almacena el ID_UBICACION.</div>' +
          '</fieldset>' +

          '<fieldset>' +
            '<legend>Identificadores</legend>' +
            '<div class="grid grid--form">' +
              '<div class="field">' +
                '<label class="field__label" for="pIdType">Tipo de identificación</label>' +
                '<select id="pIdType" name="TIPO_IDENTIFICACION"></select>' +
              '</div>' +
              '<div class="field">' +
                '<label class="field__label" for="pType1d">Tipo de código 1D</label>' +
                '<select id="pType1d" name="TIPO_CODIGO_1D">' +
                  '<option value="CODE128">CODE128</option><option value="EAN13">EAN13</option>' +
                '</select>' +
              '</div>' +
              '<div class="field">' +
                '<label class="field__label" for="pCode1d">Código 1D</label>' +
                '<input id="pCode1d" name="CODIGO_1D" maxlength="40">' +
                '<span class="field__hint" data-p="hint1d"></span>' +
                '<span class="field__error"></span>' +
              '</div>' +
              '<div class="field">' +
                '<label class="field__label" for="pQr">Contenido QR</label>' +
                '<input id="pQr" name="CODIGO_QR" maxlength="60">' +
                '<span class="field__hint">Por defecto el ID_PRODUCTO (modalidad simple).</span>' +
                '<span class="field__error"></span>' +
              '</div>' +
              '<div class="field">' +
                '<label class="field__label" for="pRfid">RFID UID / EPC (simulado)</label>' +
                '<input id="pRfid" name="RFID_UID_EPC" maxlength="40">' +
                '<span class="field__hint">Generado por software. No es una lectura física.</span>' +
                '<span class="field__error"></span>' +
              '</div>' +
              '<div class="field">' +
                '<label class="field__label">&nbsp;</label>' +
                '<button class="btn btn--subtle" type="button" data-p="genCodes">Generar códigos sugeridos</button>' +
              '</div>' +
            '</div>' +
            '<div class="card"><div class="card__head"><div class="card__title">Vista previa de identificadores</div></div>' +
              '<div class="card__body" data-p="preview"></div></div>' +
          '</fieldset>' +
        '</form>';

      UI.openModal({
        title: isEdit ? 'Editar producto — ' + existing.ID_PRODUCTO : 'Nuevo producto',
        size: 'wide',
        body: body,
        actions: [
          { label: 'Cancelar', kind: 'ghost' },
          {
            label: isEdit ? 'Guardar cambios' : 'Crear producto', kind: 'primary', close: false,
            onClick: function (btn) { submit(btn); return false; }
          }
        ]
      });

      var form = U.$('[data-p-form]', body);
      var idInput = U.$('[name="ID_PRODUCTO"]', form);
      var loteInput = U.$('[name="LOTE"]', form);
      var locSel = U.$('[name="UBICACION_ACTUAL"]', form);
      var type1d = U.$('[name="TIPO_CODIGO_1D"]', form);
      var code1d = U.$('[name="CODIGO_1D"]', form);
      var qrInput = U.$('[name="CODIGO_QR"]', form);
      var rfidInput = U.$('[name="RFID_UID_EPC"]', form);
      var hint1d = U.$('[data-p="hint1d"]', body);
      var previewBox = U.$('[data-p="preview"]', body);

      U.$('#catList', body).innerHTML = U.unique(CAT.CATEGORIES.concat(products.map(function (p) { return p.CATEGORIA; })))
        .map(function (c) { return '<option value="' + U.esc(c) + '"></option>'; }).join('');

      UI.fillSelect(U.$('[name="TIPO_IDENTIFICACION"]', form), CAT.ID_TYPES, {
        valueKey: 'code', labelKey: 'label', placeholder: '— Seleccione —'
      });

      ['ORIGEN', 'DESTINO', 'UBICACION_ACTUAL'].forEach(function (nm) {
        var sel = U.$('[name="' + nm + '"]', form);
        LT.Locations.fillLocationSelect(sel, locations, { placeholder: sel.dataset.placeholder });
      });

      if (isEdit) {
        Object.keys(existing).forEach(function (k) {
          var input = U.$('[name="' + k + '"]', form);
          if (!input) return;
          input.value = k === 'FECHA_VENCIMIENTO'
            ? U.isoDateInput(existing[k])
            : (existing[k] === null || existing[k] === undefined ? '' : existing[k]);
        });
      } else {
        U.$('[name="TIPO_IDENTIFICACION"]', form).value = 'MIXTO';
        rfidInput.value = LT.RFID.generateEpc96();
        if (o.prefillCode) {
          if (/^\d{13}$/.test(o.prefillCode)) { type1d.value = 'EAN13'; code1d.value = o.prefillCode; }
          else { code1d.value = o.prefillCode; idInput.value = o.prefillCode; qrInput.value = o.prefillCode; }
        }
      }

      function syncHint() {
        hint1d.textContent = type1d.value === 'EAN13'
          ? 'Sólo dígitos: 12 (se calcula el 13.º) o 13 completos. ' + LT.Code.AVISO_EAN
          : 'Alfanumérico. Se recomienda el propio ID_PRODUCTO.';
      }

      function paintPreview() {
        var draft = {
          ID_PRODUCTO: idInput.value,
          TIPO_CODIGO_1D: type1d.value,
          CODIGO_1D: code1d.value || idInput.value,
          CODIGO_QR: qrInput.value || idInput.value,
          RFID_UID_EPC: rfidInput.value
        };
        if (!draft.ID_PRODUCTO && !draft.CODIGO_1D) {
          previewBox.innerHTML = '<div class="txt-sm txt-muted">Complete el ID o los códigos para ver la vista previa.</div>';
          return;
        }
        LT.Code.renderIdentifierGallery(previewBox, draft, { actions: false });
      }

      function generateId() {
        var seq = nextSeq;
        idInput.value = LT.Code.buildProductId({
          prefix: 'UPEC',
          locationId: locSel.value || 'GEN',
          sequence: seq,
          lote: loteInput.value,
          serial: seq
        });
        if (!qrInput.value) qrInput.value = idInput.value;
        if (!code1d.value || type1d.value === 'CODE128') code1d.value = idInput.value;
        paintPreview();
      }

      if (!isEdit) {
        U.$('[data-p="genId"]', body).addEventListener('click', generateId);
      }

      U.$('[data-p="genCodes"]', body).addEventListener('click', function () {
        if (!idInput.value) generateId();
        if (type1d.value === 'EAN13') code1d.value = LT.Code.suggestEan13(nextSeq);
        else code1d.value = idInput.value;
        if (!qrInput.value) qrInput.value = idInput.value;
        if (!rfidInput.value) rfidInput.value = LT.RFID.generateEpc96();
        paintPreview();
        UI.ok('Códigos generados', 'Revise la vista previa antes de guardar.');
      });

      type1d.addEventListener('change', function () { syncHint(); paintPreview(); });
      [idInput, code1d, qrInput, rfidInput].forEach(function (input) {
        input.addEventListener('change', paintPreview);
      });
      loteInput.addEventListener('blur', function () {
        if (!isEdit && !idInput.value && loteInput.value) generateId();
      });

      syncHint();
      paintPreview();

      function submit(btn) {
        UI.clearErrors(form);
        var data = UI.readForm(form);
        var errors = 0;

        if (!data.ID_PRODUCTO) { UI.fieldError('ID_PRODUCTO', 'El ID es obligatorio.', form); errors++; }
        else if (!/^[A-Za-z0-9._-]+$/.test(data.ID_PRODUCTO)) {
          UI.fieldError('ID_PRODUCTO', 'Use sólo letras, números, punto, guion o guion bajo (compatibilidad Code 128).', form); errors++;
        } else if (!isEdit && products.some(function (p) { return String(p.ID_PRODUCTO).toUpperCase() === data.ID_PRODUCTO.toUpperCase(); })) {
          UI.fieldError('ID_PRODUCTO', 'Ya existe un producto con ese ID.', form); errors++;
        }
        if (!data.NOMBRE) { UI.fieldError('NOMBRE', 'El nombre es obligatorio.', form); errors++; }
        if (!data.CATEGORIA) { UI.fieldError('CATEGORIA', 'La categoría es obligatoria.', form); errors++; }
        if (!data.LOTE) { UI.fieldError('LOTE', 'El lote es obligatorio.', form); errors++; }
        if (!data.UBICACION_ACTUAL) { UI.fieldError('UBICACION_ACTUAL', 'Seleccione la ubicación actual.', form); errors++; }

        var qty = U.toNumber(data.CANTIDAD, null);
        if (qty === null || qty < 0) { UI.fieldError('CANTIDAD', 'La cantidad debe ser mayor o igual que cero.', form); errors++; }

        if (data.TIPO_CODIGO_1D === 'EAN13' && data.CODIGO_1D) {
          var ean = U.ean13Resolve(data.CODIGO_1D);
          if (!ean.ok) { UI.fieldError('CODIGO_1D', ean.error, form); errors++; }
          else data.CODIGO_1D = ean.code;
        }

        // Unicidad de códigos frente al resto de productos.
        [['CODIGO_1D', 'código 1D'], ['CODIGO_QR', 'contenido QR'], ['RFID_UID_EPC', 'identificador RFID']].forEach(function (pair) {
          var field = pair[0];
          if (!data[field]) return;
          var dup = products.filter(function (p) {
            if (isEdit && String(p.ID_PRODUCTO).toUpperCase() === String(data.ID_PRODUCTO).toUpperCase()) return false;
            return String(p[field] || '').toUpperCase() === String(data[field]).toUpperCase();
          })[0];
          if (dup) { UI.fieldError(field, 'Ese ' + pair[1] + ' ya está asignado a ' + dup.ID_PRODUCTO + '.', form); errors++; }
        });

        if (errors) { UI.warn('Revise el formulario', errors + ' campo(s) requieren corrección.'); return; }

        var payload = {
          ID_PRODUCTO: data.ID_PRODUCTO,
          NOMBRE: data.NOMBRE,
          DESCRIPCION: data.DESCRIPCION || '',
          CATEGORIA: data.CATEGORIA,
          LOTE: data.LOTE,
          FECHA_VENCIMIENTO: data.FECHA_VENCIMIENTO || '',
          ORIGEN: data.ORIGEN || '',
          DESTINO: data.DESTINO || '',
          UBICACION_ACTUAL: data.UBICACION_ACTUAL,
          TIPO_IDENTIFICACION: data.TIPO_IDENTIFICACION || 'MIXTO',
          CODIGO_GENERADO: data.ID_PRODUCTO,
          TIPO_CODIGO_1D: data.TIPO_CODIGO_1D || 'CODE128',
          CODIGO_1D: data.CODIGO_1D || data.ID_PRODUCTO,
          CODIGO_QR: data.CODIGO_QR || data.ID_PRODUCTO,
          RFID_UID_EPC: data.RFID_UID_EPC || '',
          ESTADO: existing && existing.ESTADO ? existing.ESTADO : 'ACTIVO'
        };
        if (!isEdit) payload.CANTIDAD = qty;

        UI.setBusy(btn, true, 'Guardando…');
        var op = isEdit ? LT.API.updateProduct(payload) : LT.API.createProduct(payload);
        op.then(function (res) {
          UI.setBusy(btn, false);
          UI.closeModal();
          UI.ok(isEdit ? 'Producto actualizado' : 'Producto creado', payload.NOMBRE);
          render();
          if (LT.Maps) LT.Maps.invalidateData();
          if (!isEdit) {
            UI.confirm({
              title: 'Producto creado',
              html: 'Se registró <b>' + U.esc(payload.NOMBRE) + '</b> con stock inicial ' + qty + '.<br>¿Desea abrir la etiqueta con sus identificadores?',
              confirmLabel: 'Ver etiqueta', cancelLabel: 'Más tarde'
            }).then(function (yes) {
              if (yes) LT.Code.openLabelModal((res && res.product) || payload, LT.Locations.nameOf(idx, payload.UBICACION_ACTUAL));
            });
          }
        }).catch(function (err) {
          UI.setBusy(btn, false);
          if (err.errorCode === 'DUPLICATE_ID') UI.fieldError('ID_PRODUCTO', err.message, form);
          if (err.errorCode === 'DUPLICATE_CODE') UI.fieldError('CODIGO_1D', err.message, form);
          UI.error('No fue posible guardar', err.message);
        });
      }
    }).catch(function (err) {
      UI.error('No fue posible preparar el formulario', err.message);
    });
  }

  /* ============================================================
     DETALLE
     ============================================================ */
  function openDetail(productId) {
    var body = U.el('div');
    UI.openModal({
      title: 'Detalle del producto',
      size: 'wide',
      body: body,
      actions: [
        { label: 'Cerrar', kind: 'ghost' },
        { label: 'Ver trazabilidad', kind: 'primary', onClick: function () { LT.Router.go('traceability', { productId: productId }); } }
      ]
    });
    UI.loading(body, 'Cargando producto…');
    Promise.all([LT.API.getProduct(productId), LT.API.getEvents(productId)])
      .then(function (res) {
        LT.Scanner.renderProductSheet(body, res[0], res[1], {
          readValue: res[0].ID_PRODUCTO,
          technology: res[0].TIPO_IDENTIFICACION,
          when: new Date()
        });
      })
      .catch(function (err) { UI.errorState(body, err.message); });
  }

  /* ============================================================
     VISTA PRODUCTOS
     ============================================================ */
  function initView() {
    var root = document.getElementById('view-products');
    if (!root || root.__ready) return;
    root.__ready = true;

    U.$('[data-p-action="new"]', root).addEventListener('click', function () { openForm(null); });
    U.$('[data-p-action="reload"]', root).addEventListener('click', function () {
      LT.API.invalidate(['products']);
      render();
    });
    U.$('[name="pSearch"]', root).addEventListener('input', U.debounce(function () { render(); }, 200));
    U.$$('#view-products .filters select').forEach(function (sel) {
      sel.addEventListener('change', function () { render(); });
    });
    render();
  }

  function render() {
    var root = document.getElementById('view-products');
    if (!root) return;
    var tableBox = U.$('[data-p="table"]', root);
    UI.loading(tableBox, 'Cargando productos…');

    Promise.all([LT.API.getProducts(), LT.API.getLocations()]).then(function (res) {
      var products = res[0];
      var idx = LT.Locations.buildIndex(res[1]);

      var catSel = U.$('[name="pCategory"]', root);
      if (!catSel.dataset.filled) {
        UI.fillSelect(catSel, U.unique(products.map(function (p) { return p.CATEGORIA; })).sort(), { placeholder: 'Todas las categorías' });
        catSel.dataset.filled = '1';
      }
      var locSel = U.$('[name="pLocation"]', root);
      if (!locSel.dataset.filled) {
        LT.Locations.fillLocationSelect(locSel, res[1], { placeholder: 'Todas las ubicaciones' });
        locSel.dataset.filled = '1';
      }

      var search = String((U.$('[name="pSearch"]', root) || {}).value || '');
      var cat = catSel.value, loc = locSel.value;
      var stockFilter = (U.$('[name="pStock"]', root) || {}).value || '';

      var filtered = products.filter(function (p) {
        if (cat && p.CATEGORIA !== cat) return false;
        if (loc && String(p.UBICACION_ACTUAL).toUpperCase() !== loc.toUpperCase()) return false;
        if (stockFilter && U.stockState(p.CANTIDAD).key !== stockFilter) return false;
        if (!search) return true;
        return ['ID_PRODUCTO', 'NOMBRE', 'DESCRIPCION', 'CATEGORIA', 'LOTE', 'CODIGO_1D', 'CODIGO_QR', 'RFID_UID_EPC']
          .some(function (f) { return U.includesText(p[f], search); });
      });

      UI.renderTable(tableBox, {
        rows: filtered,
        rowId: function (p) { return p.ID_PRODUCTO; },
        sortKey: 'NOMBRE',
        pageSize: 15,
        emptyTitle: 'Sin productos',
        emptyDesc: 'Registre el primer producto para comenzar a operar.',
        emptyActionLabel: 'Nuevo producto',
        onEmptyAction: function () { openForm(null); },
        onRowClick: function (id) { openDetail(id); },
        columns: [
          { key: 'ID_PRODUCTO', label: 'ID', cell: function (p) { return '<span class="mono txt-xs">' + U.esc(p.ID_PRODUCTO) + '</span>'; } },
          { key: 'NOMBRE', label: 'Producto', wrap: true },
          { key: 'CATEGORIA', label: 'Categoría', cell: function (p) { return UI.badge(p.CATEGORIA || '—', 'brand'); } },
          { key: 'LOTE', label: 'Lote' },
          { key: 'CANTIDAD', label: 'Stock', align: 'right', sortValue: function (p) { return U.toNumber(p.CANTIDAD, 0); }, cell: function (p) { return '<b>' + U.fmtNum(p.CANTIDAD) + '</b>'; } },
          { key: 'UBICACION_ACTUAL', label: 'Ubicación', cell: function (p) { return U.esc(LT.Locations.nameOf(idx, p.UBICACION_ACTUAL) || '—'); } },
          {
            key: 'FECHA_VENCIMIENTO', label: 'Vencimiento',
            cell: function (p) {
              if (!p.FECHA_VENCIMIENTO) return '<span class="txt-muted">—</span>';
              var days = U.daysUntil(p.FECHA_VENCIMIENTO);
              var txt = U.fmtDateOnly(p.FECHA_VENCIMIENTO);
              if (days !== null && days < 0) return txt + ' ' + UI.badge('vencido', 'danger');
              if (days !== null && days <= 60) return txt + ' ' + UI.badge(days + ' días', 'warn');
              return txt;
            }
          },
          { key: 'estado', label: 'Estado', sortValue: function (p) { return U.stockState(p.CANTIDAD).key; }, cell: function (p) { return UI.stockBadge(p.CANTIDAD); } },
          { key: 'CODIGO_1D', label: 'Código 1D', cell: function (p) { return '<span class="mono txt-xs">' + U.esc(p.CODIGO_1D || '—') + '</span> ' + UI.badge(p.TIPO_CODIGO_1D || 'CODE128', 'outline'); } },
          { key: 'CODIGO_QR', label: 'QR', cell: function (p) { return p.CODIGO_QR ? UI.badge('sí', 'ok') : UI.badge('no', 'outline'); } },
          { key: 'RFID_UID_EPC', label: 'RFID', cell: function (p) { return p.RFID_UID_EPC ? '<span class="mono txt-xs">' + U.esc(String(p.RFID_UID_EPC).slice(0, 10)) + '…</span>' : UI.badge('no', 'outline'); } },
          {
            key: 'ULTIMA_ACTUALIZACION', label: 'Actualización',
            sortValue: function (p) { var d = U.parseDate(p.ULTIMA_ACTUALIZACION); return d ? d.getTime() : 0; },
            cell: function (p) { return '<span class="txt-xs">' + U.esc(U.relTime(p.ULTIMA_ACTUALIZACION)) + '</span>'; }
          },
          {
            key: 'acciones', label: 'Acciones', sortable: false,
            cell: function (p) {
              var id = U.esc(p.ID_PRODUCTO);
              return '<div class="btn-group">' +
                '<button class="btn btn--sm btn--ghost" data-act="detail" data-id="' + id + '">Ver</button>' +
                '<button class="btn btn--sm btn--subtle" data-act="trace" data-id="' + id + '">Traza</button>' +
                '<button class="btn btn--sm btn--subtle" data-act="event" data-id="' + id + '">Evento</button>' +
                '<button class="btn btn--sm btn--subtle" data-act="label" data-id="' + id + '">Etiqueta</button>' +
                '<button class="btn btn--sm btn--ghost" data-act="edit" data-id="' + id + '">Editar</button>' +
                '</div>';
            }
          }
        ],
        onAction: function (act, id) {
          var p = filtered.filter(function (x) { return x.ID_PRODUCTO === id; })[0];
          if (!p) return;
          if (act === 'detail') openDetail(id);
          else if (act === 'trace') LT.Router.go('traceability', { productId: id });
          else if (act === 'event') LT.Events.openForm(p, { onSaved: function () { render(); } });
          else if (act === 'label') LT.Code.openLabelModal(p, LT.Locations.nameOf(idx, p.UBICACION_ACTUAL));
          else if (act === 'edit') openForm(p);
        }
      });
    }).catch(function (err) {
      UI.errorState(tableBox, err.message, function () { render(); });
    });
  }

  LT.Products = {
    openForm: openForm,
    openDetail: openDetail,
    initView: initView,
    render: render
  };
})(window);
