# LogiTrace — Inicio rápido

Guía para poner el sistema en marcha **sin experiencia previa**. Tiempo estimado: 20–30 minutos.
Todo lo necesario es una cuenta de Google y una cuenta de GitHub. No hay costes ni servidores.

> ¿Quiere ver la aplicación funcionando antes de configurar nada? Abra `index.html` o publíquelo
> en GitHub Pages: sin `APPS_SCRIPT_URL` arranca en **modo local de demostración** con 10
> productos, 10 ubicaciones y 20 eventos. Los datos viven en su navegador y pueden borrarse
> desde *Ayuda / Configuración*.

---

## Paso 1 · Crear la hoja de cálculo

**Opción A — importar la base incluida (recomendada).**

1. Abra [drive.google.com](https://drive.google.com).
2. **Nuevo → Subir archivo** y suba `base-datos/LogiTrace_Base.xlsx`.
3. Haga doble clic en el archivo subido y elija **Abrir con → Hojas de cálculo de Google**.
4. Menú **Archivo → Guardar como hoja de cálculo de Google**.

Ya tiene las cinco pestañas con los encabezados correctos y datos de demostración.

**Opción B — empezar vacío.**

1. Abra [sheets.new](https://sheets.new).
2. Póngale nombre, por ejemplo `LogiTrace DB`.
3. Las pestañas y encabezados los creará el paso 5.

---

## Paso 2 · Copiar el SPREADSHEET_ID

Mire la barra de direcciones de la hoja:

```
https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890/edit#gid=0
                                      └──────────── este es el ID ────────────┘
```

Copie el tramo entre `/d/` y `/edit`. Guárdelo: lo usará en los pasos 3 y 10.

---

## Paso 3 · Abrir el editor de Apps Script

1. En la hoja: **Extensiones → Apps Script**.
2. Se abre un editor con un archivo `Código.gs` que contiene `function myFunction() {}`.
3. **Borre todo su contenido.**
4. Abra `apps-script/Code.gs` de este proyecto, cópielo **completo** y péguelo ahí.
5. Guarde con el icono del disquete (o `Ctrl+S`).

---

## Paso 4 · (Opcional) Indicar el ID de la hoja

Si abrió el editor **desde la hoja** (paso 3), el script ya está vinculado y no hace falta nada:
deje `SPREADSHEET_ID: ''`.

Si creó un proyecto de Apps Script independiente, escriba el ID en la primera línea de `CONFIG`:

```js
var CONFIG = {
  SPREADSHEET_ID: '1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890',
  ...
```

---

## Paso 5 · Ejecutar `initializeSheets()`

1. En la barra superior del editor, en el desplegable de funciones, elija **`initializeSheets`**.
2. Pulse **Ejecutar**.
3. Google pedirá autorización la primera vez → continúe con el paso 6.
4. Al terminar, revise la hoja: existen `Inicio`, `Productos`, `Eventos`, `Ubicaciones` y
   `Catalogos` con los encabezados en negrita.

La función es **idempotente**: puede ejecutarla tantas veces como quiera; añade lo que falte y
nunca borra ni duplica datos.

---

## Paso 6 · Permitir el acceso requerido

Al ejecutar por primera vez:

1. **Revisar permisos**.
2. Elija su cuenta de Google.
3. Aparecerá *«Google no ha verificado esta aplicación»* — es normal: la aplicación es la suya.
   Pulse **Configuración avanzada → Ir a (nombre del proyecto) (no seguro)**.
4. **Permitir**.

Se concede un solo permiso: ver y gestionar las hojas de cálculo con las que se usa el script.

---

## Paso 7 · Implementar la aplicación web

1. Arriba a la derecha: **Implementar → Nueva implementación**.
2. Engranaje **Seleccionar tipo → Aplicación web**.
3. Complete:
   * **Descripción:** `LogiTrace v1`
   * **Ejecutar como:** **Yo** (su cuenta)
   * **Quién tiene acceso:** **Cualquier persona**
4. **Implementar**.

> **Ejecutar como: Yo** es imprescindible: así el script escribe en *su* hoja sin pedir cuenta a
> cada usuario.
>
> **Cualquier persona** significa que quien conozca la URL puede leer y escribir datos mediante
> la API. Si eso no es aceptable en su caso, elija *Cualquier usuario con cuenta de Google* y
> asuma que sus usuarios deberán iniciar sesión.

---

## Paso 8 · Copiar la URL `/exec`

Al terminar la implementación se muestra la **URL de la aplicación web**:

```
https://script.google.com/macros/s/AKfycb................/exec
```

Cópiela completa. Debe terminar en **`/exec`** (la que acaba en `/dev` sólo funciona para usted).

---

## Paso 9 · Probar el backend

Pegue en el navegador la URL seguida de `?action=health`:

```
https://script.google.com/macros/s/AKfycb.../exec?action=health
```

Respuesta esperada:

```json
{
  "success": true,
  "message": "Backend operativo",
  "data": {
    "status": "OK",
    "spreadsheetId": "1AbCdEf...",
    "spreadsheetName": "LogiTrace DB",
    "timezone": "America/Guayaquil",
    "missingSheets": []
  }
}
```

Si ve `"status": "INCOMPLETO"`, vuelva al paso 5. Si ve HTML en lugar de JSON, revise que la
implementación tenga acceso para *Cualquier persona* y que la URL termine en `/exec`.

---

## Paso 10 · Pegar los datos en `config.runtime.js`

Abra `assets/js/config.runtime.js` y sustituya los dos valores de ejemplo:

```js
window.LOGITRACE_CONFIG = Object.freeze({
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycb.../exec',
  SPREADSHEET_ID: '1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890',
  TIMEZONE: 'America/Guayaquil',
  LOW_STOCK_THRESHOLD: 5,
  MAX_ACCEPTABLE_ACCURACY_M: 100,
  DEMO_MODE: false
});
```

No añada contraseñas, claves ni tokens: este archivo será público.

> Atajo para probar sin editar archivos: abra la aplicación, vaya a **Ayuda / Configuración**,
> pegue la URL y el ID en el formulario y pulse *Guardar en este navegador*. Sirve sólo para su
> navegador; para todos los usuarios hay que editar el archivo.

---

## Paso 11 · Subir el frontend a GitHub

Con la interfaz web de GitHub:

1. Cree un repositorio nuevo, por ejemplo `logitrace`, **público**.
2. **Add file → Upload files** y arrastre el contenido del proyecto: `index.html`, la carpeta
   `assets/`, y también `README.md`, `INICIO_RAPIDO.md`, `apps-script/`, `base-datos/` y `docs/`.
3. **Commit changes**.

Con Git en su equipo:

```bash
git init
git add .
git commit -m "LogiTrace: versión inicial"
git branch -M main
git remote add origin https://github.com/USUARIO/logitrace.git
git push -u origin main
```

---

## Paso 12 · Activar GitHub Pages

1. En el repositorio: **Settings → Pages**.
2. **Source:** `Deploy from a branch`.
3. **Branch:** `main`, carpeta `/ (root)` → **Save**.
4. Espere 1–2 minutos. La URL será:

```
https://USUARIO.github.io/logitrace/
```

Las rutas del proyecto son relativas: funciona en subcarpeta sin ajustes.

---

## Paso 13 · Comprobar cámara y GPS

Abra la URL de GitHub Pages **desde un smartphone** (es HTTPS, requisito de ambos permisos):

1. **Escáner → Iniciar cámara** → permita el acceso. Enfoque un código generado por la propia
   aplicación.
2. Tras la lectura debe aparecer la **ficha completa** del producto: datos, códigos dibujados,
   historial y mapa.
3. **Registrar nuevo evento** → elija el evento, la ubicación declarada y pulse **Obtener
   posición actual** → permita la ubicación.
4. Revise la precisión y la vista previa de distancia, y pulse **Confirmar y registrar**.
5. Abra la hoja de Google: el evento está en `Eventos` con `VALIDACION_GEO` y
   `DISTANCIA_DECLARADA_M` calculadas por el servidor.

Si deniega el GPS, la aplicación no se bloquea: ofrece **Seleccionar en mapa** o guardar el
evento como `SIN_GPS`.

---

## Paso 14 · Prueba de aceptación de extremo a extremo

Recorrido completo recomendado para validar la instalación:

1. **Ubicaciones → Nueva ubicación**: cree un centro de distribución con *Usar posición actual*
   y radio 150 m.
2. Cree una ubicación hija (un rack) **sin coordenadas**, con el centro como padre: verá el
   aviso de herencia.
3. **Productos → Nuevo producto**: use *Generar ID automático* y *Generar códigos sugeridos*;
   asigne origen, destino y ubicación actual; guarde con stock inicial.
4. Confirme que **no** se creó ningún evento de recepción automático.
5. **Generar códigos**: produzca Code 128, EAN-13, QR y RFID; descargue un PNG.
6. Abra la **etiqueta** del producto e imprímala (sólo se imprime la etiqueta).
7. **Escáner** desde el móvil: lea la etiqueta → revise la ficha completa.
8. Registre una **RECEPCIÓN** con GPS y verifique el estado geográfico.
9. Registre un **DESPACHO** mayor al stock: debe rechazarse y el stock no debe cambiar.
10. Registre un **DESPACHO** válido: revise el stock antes/después.
11. **Inventario**: compruebe KPIs, estados y tarjetas por categoría.
12. **Trazabilidad**: revise el timeline, los identificadores visibles y la trayectoria numerada.
13. **Mapa**: filtre por producto y por estado geográfico; compruebe las geocercas.
14. **Dashboard**: revise los KPIs logísticos y geográficos.
15. **Exportar**: descargue `ubicaciones.geojson` y `eventos.geojson`.
16. Cárguelos en **QGIS** (*Capa → Añadir capa vectorial*) y simbolice los eventos por
    `validacion_geo`.

Si algún punto falla, consulte la tabla de problemas y la matriz de `docs/pruebas.md`.

---

## Problemas frecuentes

| Síntoma | Causa probable | Solución |
|---|---|---|
| El encabezado dice *Modo local de demostración* | `APPS_SCRIPT_URL` sigue con el valor de ejemplo | Paso 10 |
| *El backend no devolvió JSON* | La Web App no está publicada para *Cualquier persona*, o la URL no termina en `/exec` | Repita el paso 7 y vuelva a copiar la URL |
| *La pestaña "Productos" no existe* | No se ejecutó `initializeSheets()` | Paso 5 |
| La cámara no arranca | Página abierta por `http://` o `file://` | Use HTTPS (GitHub Pages) o `localhost` |
| El GPS no responde | Permiso denegado o interior sin señal | Use *Seleccionar en mapa*; el evento se guarda igualmente |
| Todos los eventos salen `BAJA_PRECISION` | Umbral demasiado estricto para el dispositivo | Suba `MAX_ACCEPTABLE_ACCURACY_M` |
| Todos los eventos salen `FUERA_GEOCERCA` | Radio demasiado pequeño o coordenadas de la ubicación mal tomadas | Corrija la ubicación y ejecute `recalculateGeoValidation()` |
| Los puntos aparecen en el océano en QGIS | Coordenadas invertidas en un archivo externo | LogiTrace exporta `[lon, lat]`; revise el otro archivo |
| Cambié `Code.gs` y no se refleja | Falta volver a implementar | **Implementar → Gestionar implementaciones → Editar → Nueva versión** |
| Los gráficos o el mapa no aparecen | Sin acceso a los CDN | Compruebe la conexión; la aplicación avisa en cada componente |
