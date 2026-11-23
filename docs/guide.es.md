<p align="center"><a href="guide.md">English</a> &nbsp;·&nbsp; <b>Español</b> &nbsp;·&nbsp; <a href="guide.de.md">Deutsch</a> &nbsp;·&nbsp; <a href="guide.ja.md">日本語</a> &nbsp;·&nbsp; <a href="guide.zh.md">中文</a> &nbsp;·&nbsp; <a href="guide.ru.md">Русский</a></p>

# Guía de B-Side

[← Volver al README](../README.es.md)

<a id="features"></a>

## Qué obtienes

- **Biblioteca**: Artistas, Álbumes, Canciones y Géneros, a partir de las etiquetas de tus
  archivos; cuando falta una etiqueta, usa los nombres de carpeta y de archivo
  (`Artista\Álbum\01 Título.flac`). Los álbumes se ordenan por artista, título o año; la lista de
  Canciones se desplaza con fluidez aunque tenga diez mil.
- **Páginas de artista y de álbum**: teñidas con la portada del álbum o la foto del artista. La
  página de un álbum muestra el formato leído de sus archivos (códec, frecuencia de muestreo,
  profundidad de bits), sus discos y duraciones, y marca las canciones que
  tienen letra o que solo están en la nube.
- **Reproducir**: reproduce un álbum desde su página, los álbumes de un artista desde la página del
  artista, o pulsa una canción para reproducir desde ella hasta el final de su álbum. El menú de una
  canción o de un álbum (**⋯**) tiene **Reproducir a continuación**, **Agregar a la cola**,
  **Ir al álbum** e **Ir al artista**. Si AIMP está cerrado, al reproducir se abre.
- **Buscar**: al instante, en artistas, álbumes y canciones. No distingue mayúsculas ni acentos
  (`rios` encuentra *Ríos de Ámbar y Sal*) y encuentra palabras dentro de nombres en japonés o chino. `/` o
  `Ctrl+K` te llevan ahí desde cualquier parte del panel.
- **Sonando**: portada, título, artista y álbum (cada uno abre su página en la biblioteca), el
  formato en una línea (`FLAC | 16 bits | 44.1 kHz | 738 kbps | Estéreo`) y
  todos los controles: reproducir/pausar, anterior, siguiente, avanzar en la canción (arrastra la
  barra o usa ←/→), volumen, silencio, aleatorio y repetir. `Espacio` pausa o reanuda.
- **Letras**: desde las etiquetas del archivo (FLAC `LYRICS`/`UNSYNCEDLYRICS`, MP3 `USLT`/`SYLT`) o
  un `.lrc` junto a la canción, en Sonando cada vez que la canción las tiene. Las letras sincronizadas
  siguen la canción con la línea actual resaltada; toca una línea para saltar ahí. El botón redondo
  **Letras** junto al título las muestra u oculta en todos los aspectos; si una canción no tiene, dice por qué. A− y A+ en la esquina cambian su tamaño en cuatro
  pasos; B-Side lo recuerda.
- **Hecho para la barra lateral**: angosto, funciona como una app de teléfono, con las pestañas
  Sonando, Biblioteca y Buscar y un minirreproductor; si ensanchas la barra lateral, la biblioteca o
  la búsqueda quedan a la izquierda y Sonando a la derecha.
- **Colores de la portada** (aspecto CD): sobre una base negra neutra, la paleta de la portada que
  suena tiñe todas las superficies, de la barra de pestañas al minirreproductor, con el texto legible
  (WCAG AA) en claro y oscuro. La página de un álbum toma los colores de su propia portada.
- **Estados claros**: elegir tus carpetas, leyendo la biblioteca, AIMP cerrado (con un botón
  *Abrir AIMP*), AIMP sin responder, sin conexión.
- **Tu idioma**: English, Español, Deutsch, 日本語, 中文 o Русский, desde la bandera de la esquina.
  Empieza en el idioma de Orca y recuerda tu elección; los temas claro y oscuro siguen a Orca.

<a id="skins"></a>

### Aspectos

Toca el logo de arriba a la izquierda y elige un aspecto; B-Side lo recuerda. Cada uno cambia todo el panel (Sonando, Biblioteca, Buscar, letras, el minirreproductor y la línea del formato) en los temas claro y oscuro de Orca, con texto que mantiene el contraste WCAG AA.

- **CD** (el predeterminado): Tipografía Manrope sobre negro neutro; los colores de la portada que suena tiñen todas las superficies, y una portada casi monocroma queda casi negra con un acento discreto.
- **Vinilo**: una sala de escucha en cuero, nogal y oro viejo, a la manera de un amplificador a válvulas. Cormorant y EB Garamond, versalitas, una barra de pestañas oscura con la pestaña activa en oro fino y una perilla oscura con un anillo champán.
- **Casete**: una casetera de los 80 en píxeles. Tipografías VT323 y Press Start 2P, violeta oscuro con contornos cian como las teclas de un walkman, el fucsia como un acento pequeño y una barra de progreso de LED.

El logo acompaña a AIMP: el CD gira, iridiscente, bajo un brillo fijo; el disco gira a 33⅓ y el brazo baja sobre él, y se levanta al pausar; los carretes del casete corren. Las animaciones solo corren mientras suena música y el panel está a la vista, y se detienen con los *Efectos de animación* de Windows desactivados (el logo igual muestra que suena con un brillo, una luz o el brazo sobre el disco).


<a id="requirements"></a>

## Requisitos

- Windows 10 u 11
- [Git](https://git-scm.com/download/win), solo para ejecutar `install.ps1` (paso 2)
- [Orca](https://github.com/stablyai/orca) 1.4.248 o posterior
- AIMP de Microsoft Store (el instalador lo consigue por ti, por usuario y sin administrador)

<a id="install"></a>

## Instalación

En una terminal dentro de Orca (ahí está el comando `orca`). Si ya tienes AIMP, basta el paso 1; si no lo tienes,
o en una PC nueva, basta el paso 2, que hace ambos.

**1. Instala el plugin.**

```powershell
orca plugin install icaceresc/b-side
```

B-Side ejecuta código en tu PC: un pequeño worker que Orca inicia para leer tu biblioteca y hablar
con AIMP (un *trusted worker*). Por eso, la primera vez Orca se detiene, te muestra lo que recibiría
el plugin (su propio almacenamiento y su propia configuración, nada más) e imprime el mismo comando
con `--approve <código>` al final. Ejecuta ese comando para aprobarlo e instalarlo.

**2. Prepara AIMP.**

```powershell
git clone https://github.com/icaceresc/b-side.git
cd b-side
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

`-ExecutionPolicy Bypass` solo vale para esta ejecución, porque Windows bloquea los scripts por
defecto. `install.ps1` instala AIMP si falta, corrige un error de configuración de la edición de
la Store y activa el streaming en My Clouds. También hace el paso 1 por ti: instala o actualiza el
plugin desde GitHub y muestra el comando de aprobación cuando Orca lo pide, así que en una PC nueva
basta con este script. Puedes volver a ejecutarlo sin riesgo. Opciones:

- `-SkipSettings`: instala AIMP y corrige el error de configuración, pero no toca los ajustes de AIMP.
- `-SkipPlugin`: solo prepara AIMP; no instala el plugin.

Luego abre **B-Side** en la barra lateral derecha de Orca y elige tus carpetas de música.

<a id="library-folders"></a>

## Elige tus carpetas de música

La primera vez, el panel te pregunta dónde está tu música. Te sugiere las carpetas con música de
esta PC: la carpeta Música de Windows y la carpeta de música de cada OneDrive (*Music*, *Música*,
*Musik*, *音楽*…), cada una con sus subcarpetas grandes y cuántas canciones tienen. Elige una o más,
o pega la ruta de otra carpeta, y pulsa **Usar estas carpetas**. B-Side lee hasta 16 carpetas.

Puedes cambiarlas cuando quieras, desde el panel (**Cambiar carpetas**, en las opciones de la
biblioteca) o en Orca, en **Settings › Plugins › B-Side › Library folders**, una carpeta por línea.
Si dejas ese ajuste vacío, B-Side usa la carpeta Música de Windows.

La indexación ocurre en segundo plano y puedes explorar mientras tanto. En una colección de 428
archivos FLAC, la primera lectura tardó unos 2 segundos; después, el panel abre al instante con el
índice guardado, y las lecturas siguientes solo vuelven a leer los archivos que cambiaron.

<a id="update"></a>

## Actualizar

```powershell
orca plugin update icaceresc.b-side
```

Orca vuelve a pedir aprobación solo si una versión nueva pide más acceso (la 2.0 lo hizo, por su
configuración; la 2.3.1, por el ajuste **Native helper**). Orca muestra el cambio e imprime el mismo
comando con `--approve <código>`; ejecútalo. Hasta que lo apruebes, la versión que tienes sigue
funcionando. Si usas `install.ps1`, ejecuta `git pull` en su clon para tener el más reciente; volver
a ejecutar el script también actualiza el plugin.

<a id="aimp-setting"></a>

## Cómo reproduce B-Side en AIMP

La API remota de AIMP puede controlar la reproducción, pero no cargar archivos, así que B-Side le
pasa las canciones a AIMP como lo hace el Explorador. Cuando reproduces un álbum o una canción,
B-Side le pide a AIMP que abra la primera canción; AIMP vacía su lista **Default**, agrega la
canción y la reproduce. Después B-Side agrega el resto del álbum. **Agregar a la cola** agrega
canciones al final de la lista que está sonando en AIMP, y **Reproducir a continuación** las pone
justo después de la canción actual (al final, si AIMP está reproduciendo una lista propia). Si no
suena nada, las dos opciones reproducen las canciones.

Esto depende de un ajuste de AIMP que B-Side nunca cambia: **Preferencias › Lista de reproducción ›
Agregar archivos › Abrir archivos desde aplicaciones externas › Acción predeterminada**, con el valor
por defecto de AIMP, **Agregar a la lista "Default"** (en inglés: *Preferences › Playlist ›
File adding › Open files from external applications › Default action: Add to empty playlist
"Default"*). Con otro valor, AIMP igual reproduce la canción, pero en una pestaña de lista nueva
cada vez (*Crear nueva lista*) o agregada a la lista que ya está abierta (*Agregar a la lista
actual*), y el resto del álbum va al final de esa lista.

Para empezar en una canción, B-Side carga el álbum o la lista entera y lleva AIMP hasta tu canción
con Siguiente mientras AIMP está en silencio (con el aleatorio apagado ese momento), así Anterior
llega a las canciones previas. Tarda unos dos segundos; después el silencio y el aleatorio quedan
como los tenías.

<a id="two-ways-to-use-it"></a>

## Tu música en la nube

Probado con una colección de OneDrive de 324 canciones FLAC (8,1 GB) en noviembre de 2026. Hay tres
formas de guardar tu música, y B-Side funciona con todas:

**En esta PC: todo.** Guarda tu música en carpetas de esta PC (o en OneDrive, marcada como
*Mantener siempre en este dispositivo*). Los archivos de tu disco tienen todo: etiquetas, portadas,
letras y fotos de artista. Esta estructura le da a B-Side lo que busca:

```text
Música\
  Artista\
    artist.jpg            la foto del artista
    Álbum\
      cover.jpg           la portada, si no está en las etiquetas de los archivos
      01 Título.flac
      01 Título.lrc       letras, solo si no están en las etiquetas del archivo
```

**OneDrive con Archivos a petición.** Apunta B-Side a tu carpeta de música de OneDrive y déjala
*solo en la nube*. B-Side lista esos archivos por sus nombres de carpeta y de archivo, y nunca abre
uno que solo está en la nube, porque eso lo descargaría: las 324 canciones entraron a la biblioteca
en menos de un segundo y no se descargó nada. Sus portadas, letras y fotos de artista solo se ven
para los archivos que guardas en esta PC. Cuando reproduces una canción, AIMP la abre y OneDrive la
descarga completa y la guarda hasta que elijas **Liberar espacio** sobre ella en el Explorador. El
panel marca las canciones y los álbumes que solo están en OneDrive.

**My Clouds: streaming, nada que sincronizar.** AIMP reproduce directo desde OneDrive (o Google
Drive, Dropbox y más) con su **My Clouds** integrado, sin la app de OneDrive. La pestaña Sonando de
B-Side muestra y controla esas canciones; las eliges en AIMP. Es la forma para una PC del trabajo:
mira [En una PC del trabajo](#work-pc).

| | En esta PC | Archivos a petición | My Clouds |
|---|---|---|---|
| Navegar y buscar en B-Side | ✓ | ✓ por nombres de carpeta y archivo | en la pestaña My Clouds de AIMP |
| Reproducir, pausar, siguiente, saltar, volumen | ✓ | ✓ | ✓ |
| Portada y sus colores | ✓ | portadas guardadas en esta PC | ✓ la de AIMP |
| Formato (códec, kHz, kbps) | ✓ con profundidad de bits | ✓ al reproducir | ✓ sin profundidad de bits |
| Letras y foto del artista | ✓ | archivos guardados en esta PC | — |
| Hasta que suena | al instante | OneDrive descarga la canción | de 6 a 10 s (medido) |
| Disco | tus archivos | cada canción reproducida queda hasta que la liberes | la caché de AIMP, que se vacía al cerrarlo |

<a id="my-clouds"></a>

## Streaming desde My Clouds

1. En el panel de B-Side, pulsa **Abrir AIMP**.
2. En AIMP, abre la pestaña **My Clouds**, haz clic derecho en **All** en la columna izquierda y
   elige **Agregar almacenamiento…**.
3. Servicio: **OneDrive** (u otro) › **Obtener clave**. La ventana de inicio de sesión de AIMP es un
   navegador viejo: escribe tu correo, elige **Usar tu contraseña** (una llave de acceso o aprobar
   en el teléfono no funcionan ahí) y luego el código de tu app de autenticación o de un SMS.
   Permite el acceso › **Aceptar**. En una PC con una cuenta de trabajo o estudio, lee antes
   [PC de trabajo o estudio](#work-account).
4. En el árbol, abre tu carpeta de música hasta un álbum: My Clouds lista las canciones de la
   carpeta que eliges, no las de sus subcarpetas. Haz doble clic en una canción.

El instalador activa el acceso por streaming, así que una canción suena mientras se descarga. AIMP
guarda cada canción que reproduce en su caché (`%TEMP%\MyCloudsCache`, de 23 a 46 MB por canción en
la prueba) y la vacía al cerrarse. Si Microsoft responde *Too Many Requests*, espera media hora y
vuelve a pulsar **Obtener clave**.

<a id="work-pc"></a>

### En una PC del trabajo

1. Instala AIMP desde Microsoft Store y B-Side (`orca plugin install icaceresc/b-side`).
2. Opcional: ejecuta `install.ps1` ([Instalación](#install)); activa el acceso por
   streaming de My Clouds.
3. Agrega tu OneDrive personal en My Clouds como arriba, con tu cuenta **personal**.
4. Reproduce desde la pestaña My Clouds de AIMP; contrólalo y síguelo en B-Side.

Si la empresa bloquea el inicio de sesión de AIMP o el OneDrive personal, copia los álbumes que
quieras a una carpeta de esa PC (o a un USB) y agrégala en B-Side: ahí funciona todo, letras
incluidas. Si está bloqueada la descarga del helper de B-Side, desactiva **Settings ›
Plugins › B-Side › Native helper**. B-Side reproduce con AIMP: donde AIMP no está permitido, no
puede reproducir.

<a id="work-account"></a>

> **⚠ PC de trabajo o estudio: inicia sesión en My Clouds con tu cuenta personal.**
>
> Cuando Windows tiene iniciada una cuenta de trabajo o estudio, la página de inicio de sesión de
> Microsoft que abre **Obtener clave** puede elegir esa cuenta sola, y My Clouds reproduciría
> entonces desde tu OneDrive del trabajo. En AIMP › **My Clouds** › **Agregar almacenamiento…** ›
> **OneDrive** › **Obtener clave**, elige **Usar otra cuenta** e inicia sesión con tu cuenta personal
> de Microsoft; si Microsoft pregunta qué tipo de cuenta, elige **Cuenta personal**. El instalador
> te avisa cuando Windows tiene una cuenta de trabajo o estudio.
>
> - **Comprobar**: abre el almacenamiento en My Clouds. Deberías ver las carpetas de tu OneDrive
>   personal (tu música). Archivos del trabajo, o un OneDrive vacío que no reconoces, indican la
>   cuenta del trabajo.
> - **Corregir**: clic derecho en el almacenamiento › **Editar almacenamiento…** › **Obtener clave** e
>   inicia sesión de nuevo con tu cuenta personal. O clic derecho › **Quitar almacenamiento** (marca
>   **Limpiar caché local** para borrar también sus archivos en caché) y agrégalo de nuevo.

<a id="sound-quality"></a>

## Calidad de sonido

B-Side nunca toca el audio: AIMP lo decodifica y lo reproduce. El instalador apaga los efectos
de AIMP (fundidos, normalizador, anti-clipping y tramado); el realce lo guarda AIMP por su cuenta, así
que revísalo en su ventana de efectos de sonido. Para que los archivos en
calidad CD lleguen a tus auriculares sin remuestreo, pon el formato de Windows del dispositivo a
la misma frecuencia: **Configuración › Sistema › Sonido › tu dispositivo › Configuración de
salida › Formato: 16 bits, 44100 Hz**. Los demás sonidos siguen escuchándose junto a la música.

¿Quieres el dispositivo solo para AIMP? En AIMP, **Preferencias › Reproducción › Dispositivo**:
elige la entrada *WASAPI Exclusive*. Las notificaciones y llamadas en ese dispositivo quedan en
silencio mientras suena AIMP.

<a id="how-it-works"></a>

## Cómo funciona

```text
Panel de Orca ──plugin.request──▶ worker de B-Side (Node) ──stdin/stdout──▶ helper (nativo, Rust) ──▶ AIMP
Sonando · Biblioteca · Buscar     índice, etiquetas,                        API remota: estado, controles, portada
                                  búsqueda, cola                            verbos de shell: abrir, agregar a la lista
                                        │                                   listado de carpetas, miniaturas
                                        ▼
                           %LOCALAPPDATA%\B-Side\cache
                           library.json · miniaturas · cola
```

- **Biblioteca**: el helper lista tus carpetas solo desde el directorio (nombres, tamaños, fechas y
  atributos de Windows), así que listar no abre ningún archivo. El worker lee, en modo de solo
  lectura, las etiquetas de los archivos locales, arma artistas, álbumes, canciones y géneros, y
  guarda el índice en `%LOCALAPPDATA%\B-Side\cache\library.json`; las portadas y fotos de artista
  se convierten en miniaturas pequeñas a su lado. Al reiniciar Orca responde al instante con el
  índice guardado y lo actualiza en segundo plano. El panel recibe nombres e identificadores
  opacos, nunca rutas de archivos.
- **Reproducción**: el helper abre una canción con las asociaciones de archivo de AIMP, como el
  Explorador (*abrir*, y *Agregar a la lista* de AIMP para el resto del álbum, desde una lista
  `.m3u8` corta en `%LOCALAPPDATA%\B-Side\queue` que B-Side borra a los 10 minutos). Todo lo demás
  (estado, reproducir/pausar, avanzar, volumen, la portada) pasa por la API remota oficial de AIMP:
  mensajes de ventana y la memoria compartida `AIMP2_RemoteInfo`. Cada comando está en una lista
  permitida.
- **El helper** es un pequeño programa nativo (`bside-helper-x64.exe`, o `-arm64.exe`, de unos
  0,5 MB) compilado a partir del código en Rust de `native/helper`: no necesita nada instalado,
  usa unos pocos MB de memoria y responde en una fracción de segundo. El repositorio no lleva
  ningún programa: en el primer uso, B-Side descarga el de tu PC desde la versión publicada en
  GitHub de su misma versión y solo lo ejecuta si su SHA-256 es el fijado en el código de esa
  versión ([Comprobar el helper](#verify-helper)). Mientras tanto (descargando, sin red, una
  descarga o comprobación fallida), o si no puede iniciarse, por ejemplo porque un antivirus o la
  política de una PC de trabajo lo bloquea, B-Side usa en su lugar el mismo helper escrito en
  PowerShell (`native/aimp-helper.ps1`) y lo dice en su registro
  (`orca plugin logs icaceresc.b-side`); ese compila su parte en C# una sola vez en la carpeta de
  caché.
- Orca ejecuta el worker como *trusted worker*: un proceso de Node con el acceso de tu cuenta de
  usuario a esta PC, y por eso Orca te pide aprobarlo. De los permisos propios de Orca solo pide su
  propio almacenamiento (tu idioma y dónde dejaste el panel) y su propia configuración (las carpetas
  de la biblioteca): ni terminal, ni espacios de trabajo, ni secretos.

<a id="privacy"></a>

## Privacidad

- Lee, en modo de solo lectura, las carpetas que elijas: su listado y las etiquetas, portadas
  incrustadas, letras e imágenes de los archivos que están en la PC. Los archivos que solo están en
  la nube nunca se abren. También lee lo que AIMP informa de la canción que suena: título, artista,
  álbum, año, formato y portada.
- Nunca escribe, mueve ni borra tus archivos de música. Solo escribe en `%LOCALAPPDATA%\B-Side` (el
  índice, las miniaturas y la cola, el helper nativo descargado en `helper\<versión>`, más la
  compilación del helper de PowerShell si algún día se usa) y en su propio almacenamiento y
  configuración de Orca. Las rutas de las carpetas se quedan en esta PC y nunca se envían.
- Nunca toca tu cuenta en la nube ni su inicio de sesión. OneDrive y My Clouds inician sesión por su
  cuenta.
- Usa la red solo para dos cosas. Una vez por versión, descarga su helper nativo (unos 0,5 MB)
  por HTTPS desde
  `https://github.com/icaceresc/b-side/releases/download/v<version>/bside-helper-<x64|arm64>.exe`
  (GitHub lo sirve desde sus propios servidores de descarga), sin enviar nada más que esa
  petición; si la descarga falla, lo vuelve a intentar en un inicio posterior, esperando 10
  minutos, luego 1 hora, 6 horas y un día. Para desactivarlo, apaga **Configuración › Plugins ›
  B-Side › Native helper**: B-Side usa entonces siempre el helper de PowerShell y nunca lo
  descarga. Y mientras suena una canción en streaming desde la nube, comprueba la conexión
  abriendo (y cerrando) una conexión TCP a `graph.microsoft.com:443`, sin enviar nada, cada 30 s
  (cada 5 s tras una comprobación fallida). Los archivos de tu PC no necesitan nada más. No escucha
  en ningún puerto.

<a id="limitations"></a>

## Limitaciones

- Hecho y probado para AIMP 4.60 de Microsoft Store. AIMP 5 se instala para todo el equipo
  (requiere administrador).
- Reproducir depende de que la **Acción predeterminada** de AIMP para archivos de otras aplicaciones
  tenga su valor por defecto ([Cómo reproduce B-Side en AIMP](#aimp-setting)).
- **Reproducir a
  continuación** reinicia la canción actual en el mismo punto, con un corte breve, porque AIMP solo
  puede agregar canciones al final.
- B-Side no muestra la lista de reproducción de AIMP. En Sonando, el formato es el que informa AIMP,
  más la profundidad de bits cuando el archivo está en tu biblioteca; las páginas de álbum muestran el
  formato leído de los archivos.
- Las canciones que llegan por streaming desde My Clouds no están en la biblioteca (AIMP no
  comparte su lista de archivos en la nube) y no muestran letra ni foto del artista.
- Hasta 16 carpetas de biblioteca. Solo el host local de Orca.
- En una PC con una cuenta de trabajo o estudio, My Clouds puede iniciar sesión con esa cuenta: mira [PC de trabajo o estudio](#work-account).

<a id="troubleshooting"></a>

## Recuperar y desinstalar

- **La biblioteca está vacía o desactualizada**: revisa las carpetas (**Cambiar carpetas**, o en
  Orca **Settings › Plugins › B-Side › Library folders**) y pulsa **Volver a buscar**.
- **Cada canción que reproduces abre una pestaña de lista nueva en AIMP**: vuelve a poner la
  **Acción predeterminada** de AIMP en **Agregar a la lista "Default"** ([Cómo reproduce B-Side en
  AIMP](#aimp-setting)).
- **AIMP olvida su configuración al cerrarse**: en un clon del repositorio ([Instalación](#install), paso 2), ejecuta `powershell -ExecutionPolicy Bypass -File .\install.ps1 -SkipSettings -SkipPlugin`.
- **El panel dice que AIMP está cerrado y está abierto**: reinicia AIMP; el panel se reconecta solo.
- **Un antivirus bloquea `bside-helper-x64.exe`**: B-Side sigue funcionando con el helper de
  PowerShell (el registro dice `using the powershell helper`). Puedes [comprobar que el archivo es
  de B-Side](#verify-helper) y permitirlo en el antivirus; B-Side lo recoge la próxima vez que
  Orca se inicie (y lo vuelve a descargar si el antivirus lo borró). En una PC donde no se quieren
  programas descargados, apaga **Native helper** en **Configuración › Plugins › B-Side** de Orca.
- **Deshacer los cambios del instalador en AIMP**: la configuración original de AIMP queda a su
  lado como `AIMP.ini.b-side.bak`.
- **Desinstalar**: `orca plugin uninstall icaceresc.b-side` (o `orca plugin dev unload <ruta>\b-side`
  si lo cargaste con `-Dev`); después, si ya no quieres AIMP, desinstálalo desde Configuración de
  Windows › Aplicaciones, y borra el clon si lo hiciste. Para borrar también el índice, borra
  `%LOCALAPPDATA%\B-Side`.

<a id="verify-helper"></a>

## Comprobar el helper

El helper nativo no se compila en tu PC ni está en el repositorio: GitHub Actions lo compila a
partir del código de este repositorio (`native/helper`, con `native/build.mjs`), ejecuta todas
las pruebas contra él y firma para él una
[atestación de procedencia de la compilación](https://docs.github.com/actions/security-for-github-actions/using-artifact-attestations).
Cada versión publicada adjunta esas compilaciones, `bside-helper-x64.exe` y
`bside-helper-arm64.exe`, con su SHA-256 en `SHA256SUMS`, y los mismos SHA-256 están fijados en
el código de esa versión (`src/native-helper.mjs`). En el primer uso, B-Side descarga solo la
compilación para tu PC desde la versión publicada de su misma versión, la guarda en
`%LOCALAPPDATA%\B-Side\helper\<versión>` y solo la ejecuta si su SHA-256 es el fijado; un archivo
distinto se borra sin ejecutarse, y el registro dice por qué. Una versión nueva de B-Side
descarga su propia compilación y borra la anterior. No está firmado con un certificado de firma
de código, así que Windows no muestra ningún editor para él.

- **Compara la suma de verificación** con la del `SHA256SUMS` de la versión publicada:

  ```powershell
  Get-ChildItem "$env:LOCALAPPDATA\B-Side\helper" -Recurse -Filter bside-helper-*.exe | Get-FileHash
  ```

- **Comprueba dónde se compiló**, con la [CLI de GitHub](https://cli.github.com), sobre ese
  archivo o sobre el de la versión publicada:

  ```powershell
  gh attestation verify "$env:LOCALAPPDATA\B-Side\helper\<versión>\bside-helper-x64.exe" --repo icaceresc/b-side
  ```

  Nombra el workflow y el commit que compiló el archivo. En un clon, `node native/verify.mjs`
  hace lo mismo con el helper descargado (o `--dir <carpeta>` con los archivos de la versión
  publicada), comprueba el SHA-256 fijado y que el commit tiene el mismo código del helper que tu
  copia.
- **Compílalo tú**: instala [Rust](https://rustup.rs) y las herramientas de compilación de C++
  de Visual Studio (con las de ARM64 para arm64), y luego `node native/build.mjs x64`. rustup
  descarga la versión de Rust que usan las versiones publicadas
  (`native/helper/rust-toolchain.toml`). La compilación es determinista: con las mismas
  versiones de compilador y enlazador que el runner de GitHub obtienes los mismos bytes; con
  otras, el mismo programa. Un clon con una compilación en `native/bin` (ignorada por Git) la usa
  y no descarga nada.
- **No descargarlo nunca**: apaga **Native helper** en **Configuración › Plugins › B-Side**;
  B-Side usa el helper de PowerShell, que es texto plano en `native/aimp-helper.ps1`.

<a id="develop"></a>

## Desarrollo

Todo se ejecuta desde la raíz del repositorio:

```powershell
orca plugin test .        # pruebas unitarias (node:test)
orca plugin validate .
orca plugin dev watch . --check --shot .orca/shots
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Dev    # carga esta carpeta en lugar de la versión de GitHub
```

El helper es el único código que toca AIMP: `native/helper` (Rust), compilado en `native/bin` (ignorada por Git; una compilación ahí se usa en
lugar de la descarga) con `node native/build.mjs`, y su gemelo en PowerShell `native/aimp-helper.ps1`, que el worker inicia
con un pequeño cargador que pasa a `powershell.exe -EncodedCommand` cuando el nativo no puede
iniciarse. Los dos hablan las mismas líneas JSON por stdin/stdout, y `test/helper-parity.test.mjs`
comprueba que responden igual; `cargo test` en `native/helper` ejecuta las pruebas de Rust y
`node scripts/measure-helper.mjs --helper native` mide memoria, tiempo de inicio y CPU. La
biblioteca está en `src/library/`, la reproducción en `src/playback.mjs` y el panel en `panel/`.
GitHub Actions ejecuta el workflow de CI ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) en Windows.

El icono, la portada y las capturas de la página del plugin en Orca salen de
`python docs/make-assets.py` (Pillow, más Chrome o Edge): dibuja el panel real con una biblioteca de
demostración sintética, así que vuelve a ejecutarlo cuando cambie el panel.

<a id="credits"></a>

## Créditos y licencia

- B-Side: [Licencia MIT](../LICENSE).
- [AIMP](https://www.aimp.ru), de Artem Izmaylov, y My Clouds son productos aparte y no se
  incluyen. Este es un proyecto independiente, no oficial de AIMP ni de Orca.
- Iconos de banderas: [lipis/flag-icons](https://github.com/lipis/flag-icons), [Licencia MIT](../panel/flags/LICENSE).
- Tipografías de los aspectos: [Manrope](https://github.com/sharanda/manrope), [EB Garamond](https://github.com/octaviopardo/EBGaramond12), [Cormorant Garamond](https://github.com/CatharsisFonts/Cormorant), [Pixelify Sans](https://github.com/eifetx/Pixelify-Sans), [Press Start 2P](https://github.com/codeman38/PressStart2P) y [VT323](https://github.com/phoikoi/VT323), [SIL Open Font License 1.1](../panel/fonts/), incluidas en el plugin.
