# Colación ATC

Web app (PWA) para iPhone que escucha la radio del avión y muestra en letras grandes lo que hay que colacionar al controlador: autorizaciones, pista, QNH, código de transpondedor, altitudes/niveles, rumbos, frecuencias y notificaciones. Entiende fraseología en español y en inglés.

**Es una ayuda de escucha, no un sustituto de la colación.** El reconocimiento de voz falla con audio de radio; verifica siempre con lo que has oído.

## Archivos

- `index.html` — pantalla y ajustes.
- `app.js` — captura de audio, detección de transmisiones (squelch/VAD), reconocimiento local (Safari) o en nube (OpenAI), extracción opcional con LLM, pantalla.
- `parser.js` — extractor de fraseología por reglas (ES/EN). Sin dependencias; se prueba con `node tests/parser.test.js`.
- `sw.js`, `manifest.webmanifest`, `icon-*.png` — para instalarla en la pantalla de inicio y que cargue sin cobertura.

## Publicarla (5 minutos)

Safari solo da acceso al micrófono en páginas HTTPS, así que hay que alojarla. La opción más simple es GitHub Pages:

1. Crea un repositorio (puede ser privado con GitHub Pro/Team, o público) y sube esta carpeta a la rama `main`.
2. En el repositorio: Settings → Pages → Source: *Deploy from a branch* → `main` / `/ (root)` → Save.
3. Al minuto tendrás `https://<usuario>.github.io/<repo>/`. Ábrela en Safari del iPhone.
4. Compartir → **Añadir a pantalla de inicio**. Se abre a pantalla completa como una app.

Netlify Drop o Vercel funcionan igual (arrastrar la carpeta). Para desarrollo en el Mac: `python3 -m http.server 8000` y abrir `http://localhost:8000` (localhost cuenta como seguro).

## Primer uso

1. ⚙︎ Ajustes → **Indicativo** (por defecto D-KPPA).
2. Pega tu **OpenAI API key** para el modo nube (transcripción con `gpt-4o-transcribe`; unos céntimos por hora de vuelo, solo se envía audio cuando hay una transmisión). Opcionalmente activa la extracción con LLM y pon una clave de Anthropic.
3. Pulsa **ESCUCHAR** y acepta el permiso de micrófono. Con datos móviles y clave usa la nube; sin datos pasa al reconocedor local del iPhone (solo un idioma a la vez, elegido en Ajustes).
4. Prueba sin radio desde Ajustes → *Probar sin radio* (escribe una transmisión y pulsa Simular).

## Cómo meter el audio de la radio en el iPhone

El Bluetooth de un casco Bose A20 / Lightspeed Zulu solo envía al teléfono **tu** micrófono; la radio no llega por ahí. Opciones que sí funcionan:

- **Cable de grabación** desde el conector de auriculares del intercom/panel (o un divisor en el casco) a la entrada TRRS del iPhone: p. ej. Nflightcam "Audio Recorder Cable" GA → 3,5 mm + adaptador Apple Lightning/USB-C a jack (el adaptador oficial admite micrófono). Es la opción más limpia.
- **Transmisor Bluetooth** conectado a la salida de audio del intercom, emparejado con el iPhone como micrófono (perfil HFP). Peor calidad.
- Micrófono del iPhone pegado al auricular del casco: funciona a medias, con mucho ruido de motor. Sube el umbral de squelch en Ajustes.

Ajusta el **umbral de squelch (VAD)** en Ajustes: la barra de la cabecera debe ponerse verde solo cuando alguien habla por la radio.

## Modos

| Modo | Motor | Requiere datos | Idioma | Calidad con audio de radio |
|---|---|---|---|---|
| Nube | OpenAI `gpt-4o-transcribe` (+ LLM opcional) | Sí | ES/EN automático | Buena |
| Local | Reconocedor de Safari (Apple) | No, normalmente* | Uno fijo | Regular |
| Híbrido | Nube si hay datos, si no local | — | — | — |

\* Apple usa reconocimiento en el dispositivo cuando el idioma está descargado en Ajustes → General → Teclado → Dictado; Safari no lo garantiza.

## Limitaciones conocidas

- La pantalla debe estar encendida y la app en primer plano (Safari corta el micrófono en segundo plano). La app pide *wake lock* para que no se apague.
- Las claves API se guardan solo en el navegador del iPhone (`localStorage`); no las compartas por la URL.
- La app no distingue al 100 % quién habla: marca **PARA TI** cuando oye tu indicativo (completo o abreviado), **OTRO TRÁFICO** cuando oye otro, y **SIN INDICATIVO** cuando no oye ninguno.
