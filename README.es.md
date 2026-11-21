<p align="center">
  <a href="README.md"><img src="panel/flags/gb.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.md">English</a> &nbsp;·&nbsp;
  <a href="README.es.md"><img src="panel/flags/py.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.es.md"><b>Español</b></a> &nbsp;·&nbsp;
  <a href="README.de.md"><img src="panel/flags/de.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.de.md">Deutsch</a> &nbsp;·&nbsp;
  <a href="README.ja.md"><img src="panel/flags/jp.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.ja.md">日本語</a> &nbsp;·&nbsp;
  <a href="README.zh.md"><img src="panel/flags/cn.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.zh.md">中文</a> &nbsp;·&nbsp;
  <a href="README.ru.md"><img src="panel/flags/ru.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.ru.md">Русский</a>
</p>

<p align="center">
  <img src="docs/hero.png" alt="B-Side: tu colección lossless en la barra lateral de Orca" width="100%">
</p>

<p align="center">
  <a href="https://github.com/icaceresc/b-side/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/icaceresc/b-side/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Windows 10/11" src="https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4?style=flat-square&logo=windows&logoColor=white">
  <img alt="Orca 1.4.248+" src="https://img.shields.io/badge/Orca-1.4.248%2B-7C5CFF?style=flat-square">
  <img alt="AIMP 4.60 Microsoft Store" src="https://img.shields.io/badge/AIMP-4.60%20Store-FF6A3D?style=flat-square">
  <img alt="Sin administrador" src="https://img.shields.io/badge/admin-no%20hace%20falta-3DDC84?style=flat-square">
  <img alt="Licencia MIT" src="https://img.shields.io/badge/licencia-MIT-lightgrey?style=flat-square">
</p>

# B-Side

Controla AIMP desde Orca: tu colección lossless mientras trabajas. [AIMP](https://www.aimp.ru)
transmite tu música desde la nube (OneDrive, Google Drive, Dropbox y más, con su **My Clouds**
integrado) y la reproduce; B-Side pone el reproductor en la barra lateral de Orca, para que no
tengas que salir del editor para cambiar de tema.

## Qué obtienes

<table>
  <tr>
    <td align="center"><img src="docs/panel-playing-es.png" width="180" alt="Reproduciendo: portada, título, artista, álbum, insignia de calidad CD, progreso y controles"></td>
    <td align="center"><img src="docs/panel-idle.png" width="180" alt="AIMP abierto y esperando, con una pista para elegir un álbum en My Clouds"></td>
    <td align="center"><img src="docs/panel-closed.png" width="180" alt="AIMP cerrado, con un botón Abrir AIMP"></td>
    <td align="center"><img src="docs/panel-offline.png" width="180" alt="Aviso de sin conexión con un tema en pausa"></td>
  </tr>
  <tr>
    <td align="center"><sub>Reproduciendo</sub></td>
    <td align="center"><sub>En espera</sub></td>
    <td align="center"><sub>AIMP cerrado</sub></td>
    <td align="center"><sub>Sin conexión</sub></td>
  </tr>
</table>

- **Lo que suena**: portada (el panel toma de ella su color de acento), título, artista, álbum y año.
- **Formato real**: códec, frecuencia de muestreo, bitrate y canales tal como los informa AIMP, y una insignia de *calidad CD* para lossless a 44,1 kHz estéreo.
- **Controles**: reproducir/pausar, anterior, siguiente, avanzar en el tema (arrastra la barra o usa ←/→), volumen, silencio (pulsa el icono del altavoz; mover el control de volumen quita el silencio), aleatorio y repetir. `Espacio` pausa o reanuda.
- **Estados claros**: AIMP cerrado (con un botón *Abrir AIMP*), nada sonando, AIMP sin responder, sin conexión.
- **Tu idioma**: English, Español, Deutsch, 日本語, 中文 o Русский, desde la bandera de la esquina. Empieza en el idioma de Orca y recuerda tu elección; los temas claro y oscuro siguen a Orca.

*Las capturas usan un tema y una portada de demostración sintéticos.*

## Requisitos

- Windows 10 u 11
- [Git](https://git-scm.com/download/win)
- [Orca](https://github.com/stablyai/orca) 1.4.248 o posterior
- AIMP de Microsoft Store (el instalador lo consigue por ti, por usuario y sin administrador)

## Instalación

Son dos pasos, los dos en una terminal dentro de Orca (ahí está el comando `orca`).

**1. Instala el plugin.**

```powershell
orca plugin install icaceresc/b-side
```

B-Side ejecuta código en tu PC: un pequeño worker que Orca inicia para hablar con AIMP (un
*trusted worker*). Por eso, la primera vez Orca se detiene, te muestra lo que recibiría el plugin
(su propio almacenamiento, nada más) e imprime el mismo comando con `--approve <código>` al final.
Ejecuta ese comando para aprobarlo e instalarlo.

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

Luego abre **B-Side** en la barra lateral derecha de Orca.

## Actualizar

```powershell
orca plugin update icaceresc.b-side
```

Orca vuelve a pedir aprobación solo si una versión nueva pide más acceso. Para tener también el
`install.ps1` más reciente, ejecuta `git pull` en el clon; volver a ejecutar el script también
actualiza el plugin.

## Conecta tu nube (una sola vez)

1. En el panel de B-Side, pulsa **Abrir AIMP**.
2. En AIMP, abre la pestaña **My Clouds**, haz clic derecho en **All** en la columna izquierda y
   elige **Agregar almacenamiento…**.
3. Servicio: **OneDrive** (u otro) › **Obtener clave** › inicia sesión › permite el acceso › **Aceptar**.
4. Elige un álbum y dale a reproducir. Desde ahora, contrólalo desde Orca.


El acceso por streaming está activado, así que los temas no se descargan completos: AIMP solo
guarda en búfer lo que reproduce y vacía su caché al cerrarse.

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

## Cómo funciona

```text
Panel de Orca  ──plugin.request──▶  worker de B-Side (Node)  ──stdin/stdout──▶  helper (PowerShell + C#)  ──API remota de AIMP──▶  AIMP
```

- El helper habla con AIMP solo a través de su API remota oficial: mensajes de ventana y la
  memoria compartida `AIMP2_RemoteInfo`. Cada comando está en una lista permitida.
- Orca ejecuta el worker como *trusted worker*: un proceso de Node con el acceso de tu cuenta de
  usuario a esta PC, y por eso Orca te pide aprobarlo. De los permisos propios de Orca solo pide su
  propio almacenamiento, para recordar tu idioma: ni terminal, ni espacios de trabajo, ni secretos.

## Privacidad

- Solo lee lo que muestra AIMP: título, artista, álbum, año, formato y portada del tema actual.
  Solo guarda tu idioma elegido, en el almacenamiento propio del plugin en Orca; no envía nada.
- Nunca toca tus archivos de música, tu cuenta en la nube ni su inicio de sesión. My Clouds
  inicia sesión dentro de AIMP.
- No escucha en ningún puerto de red. Con el panel visible, comprueba la conexión cada 30 s
  abriendo (y cerrando) una conexión TCP a `graph.microsoft.com:443`, sin enviar nada.
- Windows PowerShell compila la pequeña parte en C# del helper en `%TEMP%` cada vez que arranca.

## Limitaciones

- La API remota de AIMP no expone la lista de reproducción ni la profundidad de bits, así que
  B-Side no las muestra.
- Hecho y probado para AIMP 4.60 de Microsoft Store. AIMP 5 se instala para todo el equipo
  (requiere administrador).
- Solo el host local de Orca.
- En una PC unida a una cuenta de trabajo o estudio, Windows puede iniciar sesión en My Clouds con esa cuenta automáticamente. Usa una PC personal o una cuenta de Microsoft que Windows no administre.

## Recuperar y desinstalar

- **AIMP olvida su configuración al cerrarse**: ejecuta `powershell -ExecutionPolicy Bypass -File .\install.ps1 -SkipSettings -SkipPlugin`.
- **El panel dice que AIMP está cerrado y está abierto**: reinicia AIMP; el panel se reconecta solo.
- **Deshacer los cambios del instalador en AIMP**: la configuración original de AIMP queda a su
  lado como `AIMP.ini.b-side.bak`.
- **Desinstalar**: `orca plugin uninstall icaceresc.b-side` (o `orca plugin dev unload <ruta>\b-side`
  si lo cargaste con `-Dev`); después, si ya no quieres AIMP, desinstálalo desde Configuración de
  Windows › Aplicaciones, y borra el clon.

## Desarrollo

Todo se ejecuta desde la raíz del repositorio:

```powershell
orca plugin test .        # pruebas unitarias (node:test)
orca plugin validate .
orca plugin dev watch . --check --shot .orca/shots
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Dev    # carga esta carpeta en lugar de la versión de GitHub
```

`native/aimp-helper.ps1` es el único código que toca AIMP; el worker lo inicia con
`powershell.exe -EncodedCommand` y habla con él por stdin/stdout. GitHub Actions ejecuta el
workflow de CI (insignia de arriba) en Windows.

El icono, la portada y las capturas de la página del plugin en Orca salen de
`python docs/make-assets.py` (Pillow, más Chrome o Edge): dibuja el panel real con un tema de
demostración sintético, así que vuelve a ejecutarlo cuando cambie el panel.

## Créditos y licencia

- B-Side: [Licencia MIT](LICENSE).
- [AIMP](https://www.aimp.ru), de Artem Izmaylov, y My Clouds son productos aparte y no se
  incluyen. Este es un proyecto independiente, no oficial de AIMP ni de Orca.
- Iconos de banderas: [lipis/flag-icons](https://github.com/lipis/flag-icons), [Licencia MIT](panel/flags/LICENSE).
