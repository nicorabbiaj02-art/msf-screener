# Screener RSI + MACD · Mercados Sin Filtro

Screener web de todas las acciones de EE. UU. (NYSE, NASDAQ y AMEX, unas 5.500) con:

- Precio y variación diaria
- RSI 14 en número y en gráfico
- MACD 12/26/9 en gráfico, con la señal **Compra / Venta** y las ruedas desde el último cruce
- **Divergencias RSI** de las últimas 10 jornadas (alcistas y bajistas, confirmadas o en formación)
- Filtros, buscador, orden por columna y botón **Ir a TradingView**

Es una página estática: GitHub Actions actualiza los datos de lunes a viernes después del cierre de Wall Street y la publica gratis en GitHub Pages.

---

## Cómo subirlo a GitHub (una sola vez)

1. **Crear el repositorio.** En github.com tocá **New repository**. Ponele un nombre, por ejemplo `msf-screener`, dejalo **Public** (GitHub Pages gratis necesita repos públicos) y creálo vacío, sin README.
2. **Subir los archivos.** En el repo nuevo tocá **uploading an existing file**, arrastrá **todo el contenido** de esta carpeta (no la carpeta en sí) y tocá **Commit changes**.
   - La carpeta `.github` empieza con punto y en algunas computadoras no se ve al arrastrar. Si después no aparece en el repo, creala a mano: **Add file → Create new file**, escribí `.github/workflows/actualizar.yml` como nombre y pegá el contenido de ese archivo.
   - También podés usar Git:
     ```bash
     cd msf-screener
     git init && git add . && git commit -m "Screener MSF"
     git branch -M main
     git remote add origin https://github.com/TU_USUARIO/msf-screener.git
     git push -u origin main
     ```
3. **Activar la página.** En el repo andá a **Settings → Pages** y, en *Build and deployment → Source*, elegí **GitHub Actions**.
4. **Permitir que se actualice solo.** En **Settings → Actions → General**, en *Workflow permissions*, marcá **Read and write permissions** y guardá.
5. **Primera publicación.** En la pestaña **Actions** elegí **Actualizar datos del screener**, tocá **Run workflow** y esperá unos 3 o 4 minutos. Cuando termine en verde, la página queda en `https://TU_USUARIO.github.io/msf-screener/` (el link también aparece en el paso *publicar*).
   - Si al subir los archivos ya corrió una vez y falló en *publicar*, es normal: fue antes de activar Pages. Con este paso queda resuelto.

Listo. Después de eso, cada día hábil a las **19:30 (hora argentina)** se bajan los cierres nuevos, se recalculan los indicadores y se vuelve a publicar la página. Cada vez que subas un cambio al repo, la página también se republica.

---

## Publicarlo también en Vercel

Vercel se conecta al mismo repo de GitHub y vuelve a publicar la página cada vez que cambia algo, incluidos los datos que sube el workflow todos los días. Así queda actualizado en los dos lados sin hacer nada más.

1. Primero hacé los pasos de arriba, así el repo existe y el workflow está andando.
2. En vercel.com tocá **Add New → Project** y elegí el repo **msf-screener** (si no aparece, tocá *Adjust GitHub App Permissions* y dale acceso).
3. En *Framework Preset* dejá **Other**. No hace falta cambiar nada más: es una página estática, así que Vercel la publica tal cual, sin compilar nada.
4. Tocá **Deploy**. En menos de un minuto queda en `https://msf-screener.vercel.app` o una dirección parecida.

Si preferís usar **solo Vercel**, podés saltear el paso de GitHub Pages (Settings → Pages). El paso *publicar* del workflow va a figurar con error, pero la actualización de datos sigue funcionando y Vercel publica igual.

## Estructura

```
index.html                 La página
assets/estilo.css          Diseño (azul / celeste neón)
assets/app.js              Lógica: filtros, tabla, gráficos
assets/d3.min.js           Librería de gráficos (D3 v7)
assets/logo-msf.webp       Logo de Mercados Sin Filtro
data/*.json                Datos calculados (los reescribe el workflow)
vercel.json                Configuración para publicar en Vercel
scripts/actualizar_datos.py  Baja precios y calcula RSI, MACD y divergencias
.github/workflows/actualizar.yml  Actualiza los datos y publica la página
```

## Cambiar parámetros

En `scripts/actualizar_datos.py`:

- `MAX_DIV_AGE = 10`: cuántas jornadas hacia atrás se buscan divergencias
- `MIN_PRICE = 0.5`: precio mínimo para entrar al listado
- Los períodos del RSI (14) y del MACD (12, 26, 9) están en `rsi(c)`, `ema(c, 12)`, `ema(c, 26)` y `ema(..., 9)`

El horario se cambia en la línea `cron` de `.github/workflows/actualizar.yml`, que está en hora UTC. Argentina es UTC−3.

## Verlo en tu computadora

Si abrís `index.html` con doble clic, el navegador bloquea la carga de los datos. Usá un servidor local:

```bash
cd msf-screener
python -m http.server 8000
```

y entrá a `http://localhost:8000`.

## Notas

- Los datos son cierres diarios de **Yahoo Finance**, no cotización en tiempo real.
- Si Yahoo bloquea o falla la descarga (menos del 60 % de las acciones), el script no pisa los datos anteriores y el workflow figura en rojo en **Actions**. Se puede volver a correr a mano con **Run workflow**.
- Si el repo no tiene actividad durante 60 días, GitHub pausa los workflows programados. Se reactivan desde la pestaña **Actions**.
- Material educativo de Mercados Sin Filtro. No es recomendación de inversión.
