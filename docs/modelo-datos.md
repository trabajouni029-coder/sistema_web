# LogiTrace — Modelo de datos

Base de datos: **una hoja de cálculo de Google** con cinco pestañas.

| Pestaña | Papel |
|---|---|
| `Productos` | Catálogo y **stock actual** (operativa crítica) |
| `Eventos` | Historial inmutable de movimientos (operativa crítica) |
| `Ubicaciones` | Maestro geográfico con jerarquía y geocercas (operativa crítica) |
| `Catalogos` | Valores de referencia (eventos, tipos, estados) |
| `Inicio` | Portada con instrucciones y avisos |

## Reglas transversales

1. **El acceso es por nombre de encabezado.** Apps Script localiza cada columna por su título en
   la fila 1. El orden puede cambiar y se pueden añadir columnas propias al final sin romper nada.
2. **Los encabezados no se renombran ni se eliminan.** `initializeSheets()` vuelve a añadir los
   que falten, pero no puede recuperar datos de una columna renombrada.
3. **Ninguna fila se elimina por el sistema.** El historial de `Eventos` es permanente.
4. **Fechas y horas.** El backend escribe en la hoja objetos `Date` (instantes absolutos),
   nunca cadenas: una cadena como `2026-09-29T18:58:22` la interpreta Sheets en la zona horaria
   **de la hoja**, y si esa zona no coincide con `CONFIG.TIMEZONE` el valor aparece desplazado
   al releerlo. Al leer, cualquier `Date` se formatea en `CONFIG.TIMEZONE`
   (`America/Guayaquil` por defecto) y se muestra como `DD/MM/YYYY HH:mm:ss`. Las columnas de
   fecha importadas del `.xlsx` son texto y se leen tal cual. `initializeSheets()` alinea la
   zona horaria de la hoja con la configurada e informa del cambio; `?action=health` expone
   `spreadsheetTimezone` y `timezoneAligned` para detectar un desajuste.
5. **Celdas vacías** significan «sin valor». Nunca se rellenan con datos inventados; en
   particular, jamás se inventan coordenadas.

---

## Pestaña `Productos`

19 columnas. `CANTIDAD` representa el **stock actual**.

| Encabezado | Tipo | Oblig. | Descripción |
|---|---|---|---|
| `ID_PRODUCTO` | texto | **sí** | Clave primaria. Único. Sólo `A-Z a-z 0-9 . _ -` (compatible con Code 128 y QR). Ej.: `UPEC-ALM-P001-L03-0001` |
| `NOMBRE` | texto | **sí** | Denominación comercial |
| `DESCRIPCION` | texto | no | Detalle técnico |
| `CATEGORIA` | texto | **sí** | Agrupa el inventario y los gráficos |
| `LOTE` | texto | **sí** | Lote de producción |
| `CANTIDAD` | número ≥ 0 | **sí** | **Stock actual.** Lo modifica sólo `createEvent()` |
| `FECHA_VENCIMIENTO` | fecha `YYYY-MM-DD` | no | Vacío si no aplica |
| `ORIGEN` | `ID_UBICACION` | no | Referencia al maestro, no texto libre |
| `DESTINO` | `ID_UBICACION` | no | Referencia al maestro |
| `UBICACION_ACTUAL` | `ID_UBICACION` | **sí** | Posición actual; se actualiza con `UBICACION_DESTINO` de los eventos |
| `TIPO_IDENTIFICACION` | `CODE128` \| `EAN13` \| `QR` \| `RFID` \| `MIXTO` | no | Tecnología principal |
| `CODIGO_GENERADO` | texto | no | Identificador maestro generado (normalmente = `ID_PRODUCTO`) |
| `TIPO_CODIGO_1D` | `CODE128` \| `EAN13` | no | Simbología lineal usada |
| `CODIGO_1D` | texto | no | Valor del código lineal. **Único.** Si es `EAN13`, sólo dígitos y checksum válido |
| `CODIGO_QR` | texto | no | Contenido del QR. **Único.** Normalmente el `ID_PRODUCTO` |
| `RFID_UID_EPC` | hex(24) | no | EPC-like de 96 bits. **Único.** **SIMULADO** |
| `FECHA_REGISTRO` | fecha-hora | auto | Alta del producto |
| `ULTIMA_ACTUALIZACION` | fecha-hora | auto | Último cambio (datos o stock) |
| `ESTADO` | texto | auto | `ACTIVO` por defecto |

**Estado de stock** (derivado, no se almacena): `AGOTADO` si `CANTIDAD ≤ 0`;
`STOCK_BAJO` si `0 < CANTIDAD ≤ LOW_STOCK_THRESHOLD`; `DISPONIBLE` en el resto.

### Formato del ID automático

```
UPEC   - ALM       - P001      - L03   - 0001
prefijo  ubicación   secuencia   lote    serie
```

Legible, único, estable, compatible con Code 128 y QR, y relacionable con el RFID del producto.

---

## Pestaña `Eventos`

23 columnas: 16 logísticas + **7 de la ampliación geográfica**.

| Encabezado | Tipo | Descripción |
|---|---|---|
| `ID_EVENTO` | UUID | Clave primaria. Generado con `Utilities.getUuid()`, nunca sólo con la hora |
| `CLIENT_REQUEST_ID` | texto | Identificador del intento del cliente. Impide registrar dos veces el mismo envío |
| `FECHA_HORA` | fecha-hora | Momento del registro, puesto por el servidor |
| `ID_PRODUCTO` | `ID_PRODUCTO` | Producto afectado |
| `TIPO_IDENTIFICACION` | texto | Tecnología con la que se identificó (`QR`, `EAN13`, `CODE128`, `RFID`) |
| `CODIGO_LEIDO` | texto | Valor exacto leído por el escáner |
| `EVENTO` | catálogo | Uno de los nueve eventos logísticos |
| `CANTIDAD_MOVIMIENTO` | número ≥ 0 | Unidades del movimiento; 0 en eventos sin efecto |
| `STOCK_ANTES` | número | Stock previo (evidencia de auditoría) |
| `STOCK_DESPUES` | número | Stock resultante |
| `UBICACION` | `ID_UBICACION` | Ubicación operativa del evento |
| `UBICACION_ORIGEN` | `ID_UBICACION` | De dónde salió |
| `UBICACION_DESTINO` | `ID_UBICACION` | A dónde fue; actualiza `UBICACION_ACTUAL` del producto |
| `ACTOR` | texto | Responsable de la operación. **Obligatorio** |
| `OBSERVACION` | texto | Nota libre |
| `ESTADO` | texto | `REGISTRADO` |
| **`ID_UBICACION_DECLARADA`** | `ID_UBICACION` | **Dónde debía ocurrir.** Referencia de la validación |
| **`LAT_CAPTURADA`** | −90…90 | Latitud real capturada; vacío si no hubo posición |
| **`LON_CAPTURADA`** | −180…180 | Longitud real capturada |
| **`PRECISION_M`** | número ≥ 0 | Incertidumbre informada por el dispositivo (radio) |
| **`FUENTE_UBICACION`** | `GPS_NAVEGADOR` \| `MAPA_MANUAL` \| `SIN_GPS` | Procedencia de la posición |
| **`DISTANCIA_DECLARADA_M`** | número | Distancia Haversine entre lo capturado y lo declarado. **La calcula el servidor** |
| **`VALIDACION_GEO`** | `OK` \| `FUERA_GEOCERCA` \| `BAJA_PRECISION` \| `SIN_GPS` | Veredicto del servidor |

> `PRECISION_M` y `DISTANCIA_DECLARADA_M` son magnitudes distintas y nunca se confunden:
> la primera describe la calidad del sensor, la segunda la separación respecto a lo declarado.

### Catálogo de eventos y efecto en inventario

| `EVENTO` | Efecto | Cantidad |
|---|---|---|
| `RECEPCIÓN` | `+ cantidad` | obligatoria > 0 |
| `INGRESO AL ALMACÉN` | sin efecto | — |
| `UBICACIÓN` | sin efecto | — |
| `MOVIMIENTO INTERNO` | sin efecto | — |
| `PREPARACIÓN DE PEDIDO` | sin efecto | — |
| `DESPACHO` | `− cantidad` | obligatoria > 0 |
| `ENTREGA` | sin efecto (no descuenta de nuevo) | — |
| `DEVOLUCIÓN` | `+ cantidad` | obligatoria > 0 |
| `INCIDENCIA` | sin efecto automático | — |

El nombre se compara sin acentos ni signos, de modo que `RECEPCION` y `RECEPCIÓN` son
equivalentes al leer datos escritos a mano en la hoja.

---

## Pestaña `Ubicaciones`

| Encabezado | Tipo | Oblig. | Descripción |
|---|---|---|---|
| `ID_UBICACION` | texto | **sí** | Clave primaria corta y estable (`CD-001`, `ALM-UPEC`, `RACK-A01`) |
| `NOMBRE` | texto | **sí** | Nombre mostrado en los selectores |
| `TIPO` | catálogo | **sí** | Planta, Centro de producción, Centro de distribución, Proveedor, Cliente, Almacén, Patio, Muelle, Rack, Laboratorio, Otro |
| `DIRECCION` | texto | no | Referencia postal |
| `LAT` | −90…90 | no | Vacío ⇒ **hereda** del padre |
| `LON` | −180…180 | no | Vacío ⇒ hereda del padre |
| `RADIO_GEOCERCA_M` | número > 0 | no | Radio de la geocerca. Vacío ⇒ hereda el del primer ancestro que lo defina |
| `PADRE_ID` | `ID_UBICACION` | no | Vacío = nivel raíz. Los ciclos se rechazan |
| `ACTIVO` | `SI` \| `NO` | no | `SI` por defecto. Las inactivas no se ofrecen ni se exportan |

### Jerarquía y herencia

```
CD-001  Centro de Distribución   LAT/LON propias, radio 150 m
 ├── CD-001-M1    Muelle 1       LAT/LON propias, radio 40 m
 ├── CD-001-RA01  Rack A01       sin coordenadas → hereda de CD-001 (radio 150 m)
 └── PAT-001      Patio          LAT/LON propias, radio 80 m
ALM-UPEC  Almacén UPEC           LAT/LON propias, radio 120 m
 └── LAB-001  Laboratorio        sin coordenadas → hereda de ALM-UPEC, radio propio 50 m
```

`resolveLocationCoordinates(id)` sube por `PADRE_ID` hasta encontrar coordenadas válidas y
devuelve `{lat, lon, radiusMeters, effectiveLocationId, inherited}`. Si nadie de la cadena tiene
coordenadas, devuelve `found: false` y los eventos allí quedarán como `SIN_GPS` salvo captura
manual. Recorrido protegido contra ciclos.

### Radios sugeridos (iniciales y editables)

| Tipo | Radio sugerido |
|---|---|
| Planta / Centro de producción | 200 m |
| Centro de distribución | 150 m |
| Proveedor | 150 m |
| Almacén | 150 m |
| Cliente | 100 m |
| Patio | 100 m |
| Muelle / Laboratorio | 50 m |
| Rack y demás internas | hereda |

No son reglas universales: dependen del tamaño real de la instalación y de la calidad del GPS
disponible.

---

## Pestaña `Catalogos`

| Encabezado | Descripción |
|---|---|
| `TIPO` | `EVENTO`, `TIPO_UBICACION`, `VALIDACION_GEO`, `TIPO_IDENTIFICACION` |
| `CODIGO` | Código interno |
| `VALOR` | Etiqueta mostrada |
| `DETALLE` | Aclaración (p. ej. efecto en el stock o radio sugerido) |

Es documentación operativa dentro de la propia base: el catálogo vigente en ejecución está en
`EVENT_TYPES` y `LOCATION_TYPES` de `Code.gs`.

---

## Reglas de negocio implementadas en el servidor

### Inventario

```
Stock inicial      la cantidad de creación ES el stock inicial
                   → no genera ningún evento de recepción adicional
RECEPCIÓN          stock_nuevo = stock_actual + cantidad
DEVOLUCIÓN         stock_nuevo = stock_actual + cantidad
DESPACHO           stock_nuevo = stock_actual − cantidad     (rechazo si cantidad > stock)
UBICACIÓN          stock sin cambios
MOVIMIENTO INTERNO stock sin cambios
PREPARACIÓN        stock sin cambios
INGRESO ALMACÉN    stock sin cambios
ENTREGA            stock sin cambios (el descuento ya lo hizo el DESPACHO)
INCIDENCIA         stock sin cambios (requiere decisión humana)

Invariante: stock ≥ 0 siempre.
```

### Orden de la transacción (`createEvent`)

```
1  localizar producto (por ID o por código leído)
2  validar evento y actor
3  leer stock actual
4  validar cantidad
5  calcular stock resultante
6  procesar geolocalización
7  validar geocerca
8  crear el evento (se guarda incluso si es una excepción geográfica)
9  actualizar el producto (cantidad, ubicación, marca de tiempo)
10 devolver respuesta con el evento, el producto y la validación
```

Todo el bloque se ejecuta bajo `LockService.getScriptLock()` para evitar condiciones de carrera
entre operarios simultáneos. El reenvío del mismo `CLIENT_REQUEST_ID` devuelve el evento ya
registrado sin duplicar el movimiento.

### Validación geográfica

```
SIN_GPS         sin LAT/LON
BAJA_PRECISION  PRECISION_M > MAX_ACCEPTABLE_ACCURACY_M
FUERA_GEOCERCA  precisión aceptable  Y  distancia > radio
OK              precisión aceptable  Y  distancia ≤ radio
```

* Distancia: `haversineDistance()` con radio terrestre **6 371 000 m**.
* Si la ubicación declarada no tiene radio definido (ni heredado), no hay geocerca que
  comprobar: el resultado es `OK` con la distancia informada.
* La validación **no modifica** el inventario y **nunca** rechaza el evento.

---

## Integridad referencial

| Relación | Regla |
|---|---|
| `Productos.UBICACION_ACTUAL` → `Ubicaciones.ID_UBICACION` | Obligatoria y verificada al crear o editar |
| `Productos.ORIGEN` / `DESTINO` → `Ubicaciones` | Verificadas si se informan |
| `Eventos.ID_PRODUCTO` → `Productos.ID_PRODUCTO` | Verificada; sin producto no hay evento |
| `Eventos.ID_UBICACION_DECLARADA` → `Ubicaciones` | Verificada; es la base de la geocerca |
| `Ubicaciones.PADRE_ID` → `Ubicaciones` | Verificada; los ciclos se rechazan |
| `Productos.CODIGO_1D` / `CODIGO_QR` / `RFID_UID_EPC` | Únicos en toda la tabla |

---

## Mapeo a GeoJSON

`ubicaciones.geojson` — un `Point` por ubicación activa con coordenadas resolubles:

```json
{
  "type": "Feature",
  "geometry": { "type": "Point", "coordinates": [-77.71782, 0.81234] },
  "properties": {
    "id_ubicacion": "CD-001",
    "nombre": "Centro de Distribución Tulcán",
    "tipo": "Centro de distribución",
    "direccion": "Av. Veintimilla y Panamericana Norte, Tulcán",
    "radio_geocerca_m": 150,
    "padre_id": "",
    "activo": "SI",
    "coordenadas_heredadas": "NO",
    "ubicacion_efectiva": "CD-001"
  }
}
```

`eventos.geojson` — un `Point` por evento con coordenadas:

```json
{
  "type": "Feature",
  "geometry": { "type": "Point", "coordinates": [-77.71765, 0.81250] },
  "properties": {
    "id_evento": "EVT-DEMO-005",
    "fecha_hora": "2026-09-22T08:20:00",
    "id_producto": "UPEC-CD-P003-L01-0003",
    "evento": "RECEPCIÓN",
    "precision_m": 7,
    "distancia_declarada_m": 6,
    "validacion_geo": "OK"
  }
}
```

> **`[longitud, latitud]`**, nunca al revés. Todos los pares se construyen en una sola función
> (`coordPair` en el cliente, `coordPair_` en el servidor): esa es la única defensa fiable contra
> las inversiones de coordenadas.

Los eventos `SIN_GPS` no generan geometría; se contabilizan en `metadata.eventosSinCoordenadas`.

---

## Datos de demostración incluidos

`base-datos/LogiTrace_Base.xlsx` contiene:

| Conjunto | Cantidad | Detalle |
|---|---|---|
| Ubicaciones | 10 | 8 con coordenadas propias, 2 que heredan (`CD-001-RA01`, `LAB-001`) |
| Productos | 10 | 7 disponibles, 2 con stock bajo, 1 agotado; Code 128, EAN-13, QR y RFID |
| Eventos | 20 | 16 georreferenciados, 13 `OK`, 2 `FUERA_GEOCERCA`, 1 `BAJA_PRECISION`, 4 `SIN_GPS` |

`DISTANCIA_DECLARADA_M` y `VALIDACION_GEO` de la base se calcularon con las mismas reglas de
`Code.gs` (Haversine, umbral de precisión 100 m), y el motor local de la aplicación reproduce
exactamente los mismos valores.

Los datos son ficticios y pueden eliminarse sin afectar al sistema: basta con borrar las filas
2 y siguientes de `Productos`, `Eventos` y `Ubicaciones`.
