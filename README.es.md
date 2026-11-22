<p align="center">
  <a href="README.md">English</a> &nbsp;·&nbsp; <b>Español</b> &nbsp;·&nbsp; <a href="README.de.md">Deutsch</a> &nbsp;·&nbsp; <a href="README.ja.md">日本語</a> &nbsp;·&nbsp; <a href="README.zh.md">中文</a> &nbsp;·&nbsp; <a href="README.ru.md">Русский</a>
</p>

<h1 align="center"><img src="docs/icon.png" width="72" height="72" alt=""><br>B-Side</h1>

<p align="center"><b>Tu biblioteca de música, en la barra lateral de Orca.</b><br>
Explora, busca y reproduce la música de tu PC con Windows, con letras sincronizadas y tres aspectos.<br>Suena a través de AIMP, un reproductor gratuito.</p>

<p align="center">
  <img src="docs/hero.webp" width="100%" alt="Una ventana de editor con B-Side en su barra lateral reproduciendo una canción de demostración con letra sincronizada: el aspecto CD toma los colores de dos portadas, luego Vinilo y Casete, cada uno con su logo girando">
</p>

<p align="center">
  <a href="https://github.com/icaceresc/b-side/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/icaceresc/b-side/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Windows 10 y 11" src="https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4?style=flat-square">
  <a href="LICENSE"><img alt="Licencia MIT" src="https://img.shields.io/badge/license-MIT-6e7781?style=flat-square"></a>
</p>

### Toda tu colección, a una tecla de distancia

Artistas, álbumes, canciones y géneros de tus propias carpetas, con portadas y el formato leído
de cada archivo (FLAC · 24 bits · 96 kHz). Pulsa `/` o `Ctrl+K` y escribe: `rio` encuentra *Río*.

<p align="center"><img src="docs/readme-library.webp" width="100%" alt="El panel ensanchado: una cuadrícula de álbumes de demostración junto a Sonando con letra sincronizada"></p>

### Letras que siguen la canción

La letra sincronizada se ilumina línea a línea; A− y A+ cambian su tamaño. Sale de las etiquetas de
tus archivos o de un `.lrc` junto a la canción.

<p align="center"><img src="docs/readme-lyrics.webp" width="100%" alt="Letra sincronizada en Vinilo, CD y Casete en tres tamaños, con la línea actual resaltada"></p>

### Tres aspectos, y un logo que sigue la música

CD se viste con los colores de cada portada, Vinilo es cuero y oro viejo, Casete es una casetera de
los 80 en píxeles. Toca el logo para elegir uno; gira mientras suena la música y se detiene al pausar.

<p align="center"><img src="docs/readme-skins.webp" width="100%" alt="El mismo panel en los aspectos CD, Vinilo y Casete"></p>

### Local y privado

B-Side solo lee tus carpetas de música y nunca cambia tus archivos. Sin cuenta y sin rastreo: con la
música en tu PC, su único uso de la red es descargar una vez, desde GitHub, su propio helper de
0,5 MB, comprobado por SHA-256, y puedes desactivarlo.
[Qué lee, qué escribe y qué descarga](docs/guide.es.md#privacy).

## Instalación

En una terminal dentro de Orca:

```powershell
orca plugin install icaceresc/b-side
```

Orca muestra lo que B-Side podrá hacer e imprime el mismo comando con `--approve <código>`:
ejecútalo. Luego abre **B-Side** en la barra lateral derecha y elige tus carpetas de música.

**Necesitas** Windows 10 u 11, [Orca](https://github.com/stablyai/orca) 1.4.248 o posterior y
[AIMP de Microsoft Store](https://apps.microsoft.com/detail/9PCLLLH15SMT) (gratis). ¿No tienes AIMP? `install.ps1` lo prepara por ti:
[Instalación en detalle](docs/guide.es.md#install).

## Más información

[Elige tus carpetas](docs/guide.es.md#library-folders) ·
[Todo lo que hace](docs/guide.es.md#features) ·
[Solución de problemas](docs/guide.es.md#troubleshooting) ·
[Privacidad](docs/guide.es.md#privacy) ·
[Actualizar](docs/guide.es.md#update) ·
[Streaming desde la nube (beta)](docs/guide.es.md#two-ways-to-use-it) ·
[Cómo funciona](docs/guide.es.md#how-it-works) ·
[Comprobar el helper](docs/guide.es.md#verify-helper) ·
[Desarrollo](docs/guide.es.md#develop)

---

<sub>[MIT](LICENSE). Un proyecto independiente, sin relación con AIMP ni con Orca. Las imágenes y la música de
demostración están hechas para B-Side: artistas inventados, música sintética original y portadas
generadas. [Créditos](docs/guide.es.md#credits).</sub>
