<p align="center">
  <a href="README.md">English</a> &nbsp;·&nbsp; <a href="README.es.md">Español</a> &nbsp;·&nbsp; <a href="README.de.md">Deutsch</a> &nbsp;·&nbsp; <a href="README.ja.md">日本語</a> &nbsp;·&nbsp; <a href="README.zh.md">中文</a> &nbsp;·&nbsp; <b>Русский</b>
</p>

<h1 align="center"><img src="docs/icon.png" width="72" height="72" alt=""><br>B-Side</h1>

<p align="center"><b>Ваша медиатека — в боковой панели Orca.</b><br>
Просматривайте, ищите и слушайте музыку с вашего ПК, с синхронным текстом песен и тремя скинами. Играет её AIMP.</p>

<p align="center">
  <img src="docs/hero.webp" width="100%" alt="Окно редактора с B-Side в боковой панели: играет демо-трек с синхронным текстом, скин CD принимает цвета двух обложек, затем Vinyl и Cassette, и у каждого вращается логотип">
</p>

<p align="center">
  <a href="https://github.com/icaceresc/b-side/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/icaceresc/b-side/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Windows 10 и 11" src="https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4?style=flat-square">
  <a href="LICENSE"><img alt="Лицензия MIT" src="https://img.shields.io/badge/license-MIT-6e7781?style=flat-square"></a>
</p>

### Вся коллекция — под рукой

Исполнители, альбомы, треки и жанры из ваших папок, с обложками и настоящим форматом каждого файла
(FLAC · 24 бита · 96 кГц). Поиск по мере ввода: `rio` находит *Río*.

<p align="center"><img src="docs/shot-library.webp" width="100%" alt="Расширенная панель: сетка демо-альбомов рядом с экраном воспроизведения и синхронным текстом"></p>

### Текст, который идёт вместе с песней

Синхронный текст подсвечивается строка за строкой, в удобном вам размере. Он берётся из тегов файлов
или из `.lrc` рядом с треком.

<p align="center"><img src="docs/shot-lyrics.webp" width="100%" alt="Синхронный текст в Vinyl, CD и Cassette трёх размеров, текущая строка выделена"></p>

### Три скина и логотип, который играет вместе с музыкой

CD принимает цвета каждой обложки, Vinyl — это кожа и старое золото, Cassette — кассетная дека 80-х в
пикселях. Нажмите на логотип, чтобы сменить скин; он вращается, пока играет музыка, и замирает на паузе.

<p align="center"><img src="docs/shot-skins.webp" width="100%" alt="Одна и та же панель в скинах CD, Vinyl и Cassette"></p>

### Лёгкий, локальный и приватный

Нативный помощник размером 0,5 МБ общается с AIMP, занимая около 9 МБ памяти. B-Side только читает
ваши папки, никогда не меняет файлы, ничего о вас не отправляет и не следит за вами.
[Что он читает, пишет и скачивает](docs/guide.ru.md#privacy).

## Установка

В терминале внутри Orca:

```powershell
orca plugin install icaceresc/b-side
```

Orca покажет, что будет разрешено B-Side, и выведет ту же команду с `--approve <код>`: выполните её.
Затем откройте **B-Side** в правой боковой панели и выберите папки с музыкой.

**Нужны** Windows 10 или 11, [Orca](https://github.com/stablyai/orca) 1.4.248 или новее и
[AIMP](https://www.aimp.ru) из Microsoft Store (бесплатно). Ещё нет AIMP? `install.ps1` всё подготовит:
[Подробно об установке](docs/guide.ru.md#install).

## Подробнее

[Выбор папок](docs/guide.ru.md#library-folders) · [Все возможности](docs/guide.ru.md#features) ·
[Обновление](docs/guide.ru.md#update) · [Потоковое воспроизведение из облака (бета)](docs/guide.ru.md#two-ways-to-use-it) ·
[Как это работает](docs/guide.ru.md#how-it-works) · [Конфиденциальность](docs/guide.ru.md#privacy) ·
[Решение проблем](docs/guide.ru.md#troubleshooting) · [Проверка помощника](docs/guide.ru.md#verify-helper) ·
[Разработка](docs/guide.ru.md#develop)

---

<sub>[MIT](LICENSE). Независимый проект, не связанный ни с AIMP, ни с Orca. Изображения и демо-музыка
сделаны для B-Side: вымышленные исполнители, оригинальная синтезированная музыка и сгенерированные
обложки. [Благодарности](docs/guide.ru.md#credits).</sub>
