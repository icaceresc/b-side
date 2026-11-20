<p align="center">
  <a href="README.md"><img src="docs/flags/gb.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.md">English</a> &nbsp;·&nbsp;
  <a href="README.es.md"><img src="docs/flags/py.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.es.md">Español</a> &nbsp;·&nbsp;
  <a href="README.de.md"><img src="docs/flags/de.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.de.md">Deutsch</a> &nbsp;·&nbsp;
  <a href="README.ja.md"><img src="docs/flags/jp.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.ja.md">日本語</a> &nbsp;·&nbsp;
  <a href="README.zh.md"><img src="docs/flags/cn.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.zh.md">中文</a> &nbsp;·&nbsp;
  <a href="README.ru.md"><img src="docs/flags/ru.svg" width="20" height="15" alt=""></a>&nbsp;<a href="README.ru.md"><b>Русский</b></a>
</p>

<p align="center">
  <img src="docs/hero.png" alt="B-Side: ваша lossless-коллекция прямо в боковой панели Orca" width="100%">
</p>

<p align="center">
  <img alt="Windows 10/11" src="https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4?style=flat-square&logo=windows&logoColor=white">
  <img alt="Orca 1.4.248+" src="https://img.shields.io/badge/Orca-1.4.248%2B-7C5CFF?style=flat-square">
  <img alt="AIMP 4.60 Microsoft Store" src="https://img.shields.io/badge/AIMP-4.60%20Store-FF6A3D?style=flat-square">
  <img alt="Без прав администратора" src="https://img.shields.io/badge/%D0%B0%D0%B4%D0%BC%D0%B8%D0%BD-%D0%BD%D0%B5%20%D0%BD%D1%83%D0%B6%D0%B5%D0%BD-3DDC84?style=flat-square">
  <img alt="Лицензия MIT" src="https://img.shields.io/badge/license-MIT-lightgrey?style=flat-square">
</p>

# B-Side

Управляйте AIMP из Orca: ваша lossless-коллекция, пока вы работаете. [AIMP](https://www.aimp.ru)
воспроизводит музыку потоком из облака (OneDrive, Google Drive, Dropbox и другие через встроенные
**Мои облака**), а B-Side выносит плеер в боковую панель Orca, чтобы переключать треки, не покидая редактор.

## Что вы получаете

<table>
  <tr>
    <td align="center"><img src="docs/panel-playing.png" width="180" alt="Воспроизведение: обложка, название, исполнитель, альбом, значок CD-качества, прогресс и управление"></td>
    <td align="center"><img src="docs/panel-idle.png" width="180" alt="AIMP открыт и ждёт, с подсказкой выбрать альбом в My Clouds"></td>
    <td align="center"><img src="docs/panel-closed.png" width="180" alt="AIMP закрыт, с кнопкой открытия AIMP"></td>
    <td align="center"><img src="docs/panel-offline.png" width="180" alt="Предупреждение «нет сети» при приостановленном треке"></td>
  </tr>
  <tr>
    <td align="center"><sub>Воспроизведение</sub></td>
    <td align="center"><sub>Ожидание</sub></td>
    <td align="center"><sub>AIMP закрыт</sub></td>
    <td align="center"><sub>Нет сети</sub></td>
  </tr>
</table>

- **Что играет**: обложка (из неё панель берёт акцентный цвет), название, исполнитель, альбом и год.
- **Реальный формат**: кодек, частота дискретизации, битрейт и каналы — так, как их сообщает AIMP, плюс значок *CD-качества* для lossless 44,1 кГц стерео.
- **Управление**: воспроизведение/пауза, назад, вперёд, перемотка (перетащите полосу или нажмите ←/→), громкость, перемешивание и повтор. `Пробел` ставит на паузу и продолжает.
- **Понятные состояния**: AIMP закрыт (с кнопкой *Open AIMP*), ничего не играет, AIMP не отвечает, нет сети.
- **Ваш язык**: English, Español, Deutsch, 日本語, 中文 или Русский — флажок в углу. Сначала берётся язык Orca, затем запоминается ваш выбор; светлая и тёмная темы следуют за Orca.

*На скриншотах — синтетический демо-трек и обложка.*

## Требования

- Windows 10 или 11
- [Orca](https://github.com/stablyai/orca) 1.4.248 или новее
- AIMP из Microsoft Store (установщик поставит его сам — для текущего пользователя, без прав администратора)

## Быстрая установка

```powershell
git clone https://github.com/icaceresc/b-side.git
cd b-side
.\install.ps1
```

`install.ps1` устанавливает AIMP, если его нет, исправляет ошибку сохранения настроек в версии из Store,
включает потоковое воспроизведение в «Моих облаках» и загружает панель в Orca. В первый раз Orca попросит
одобрить плагин: выполните команду `orca plugin dev load … --approve …`, которую выведет скрипт. Затем
откройте **B-Side** в правой боковой панели Orca. Скрипт можно безопасно запускать повторно.

## Подключите облако (один раз)

1. В панели B-Side нажмите **Open AIMP**.
2. В AIMP откройте вкладку **Мои облака**, щёлкните правой кнопкой по **All** в левой колонке и выберите
   **Добавить хранилище...**.
3. Сервис: **OneDrive** (или другой) › **Получить токен** › войдите › разрешите доступ › **OK**.
4. Выберите альбом и запустите воспроизведение. Дальше управляйте им из Orca.

> **Рабочий ПК входит под рабочей учётной записью?** *(Экспериментально: пока не подтверждено.)* Windows может автоматически передавать AIMP вашу
> рабочую учётную запись. Чтобы войти под личной учётной записью Microsoft, нажмите **Получить токен**, затем
> перетащите эту ссылку и отпустите её внутри окна AIMP *Authorization Master* (его адресную строку
> редактировать нельзя): **[Войти под личной учётной записью Microsoft](https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?client_id=a527d046-6111-4b9a-9855-f6a26b81b245&response_type=code&redirect_uri=http%3A%2F%2Flocalhost%2F&scope=Files.Read%20offline_access&prompt=select_account)**.
> Эта ссылка принимает только личные учётные записи.

Потоковый доступ включён, поэтому треки не скачиваются целиком: AIMP буферизует только то, что играет,
и очищает кэш при закрытии.

## Качество звука

B-Side никогда не трогает звук: декодирует и воспроизводит его AIMP. Установщик отключает эффекты AIMP
(улучшение, плавные переходы, нормализацию, защиту от клиппинга и дизеринг). Чтобы файлы CD-качества
доходили до наушников без передискретизации, задайте устройству в Windows ту же частоту:
**Параметры › Система › Звук › ваше устройство › Параметры вывода › Формат: 16 бит, 44100 Гц**.
Остальные звуки по-прежнему слышны вместе с музыкой.

Хотите отдать устройство только AIMP? В AIMP выберите **Настройки › Воспроизведение › Устройство** →
*WASAPI Exclusive*. Пока играет AIMP, уведомления и звонки на этом устройстве будут без звука.

## Как это работает

```text
Панель Orca  ──plugin.request──▶  воркер B-Side (Node)  ──stdin/stdout──▶  помощник (PowerShell + C#)  ──AIMP Remote API──▶  AIMP
```

- Помощник общается с AIMP только через его официальный Remote API: оконные сообщения и общую память
  `AIMP2_RemoteInfo`. Каждая команда — из разрешённого списка.
- Плагин просит у Orca только собственное хранилище, чтобы запомнить язык: ни сети, ни терминала,
  ни рабочих пространств, ни секретов.

## Конфиденциальность

- Читает только то, что показывает AIMP: название, исполнителя, альбом, год, формат и обложку текущего
  трека. Сохраняется только выбранный язык — в собственном хранилище плагина в Orca; ничего не
  отправляется.
- Никогда не трогает ваши музыкальные файлы, облачную учётную запись и вход в неё. «Мои облака» выполняют вход внутри AIMP.
- Не слушает ни один сетевой порт. Пока панель видна, каждые 30 с проверяет связь, открывая (и закрывая)
  TCP-соединение с `graph.microsoft.com:443` и ничего не отправляя.
- При каждом запуске помощника Windows PowerShell компилирует его небольшую часть на C# в `%TEMP%`.

## Ограничения

- Remote API AIMP не даёт ни плейлиста, ни разрядности, поэтому B-Side их не показывает.
- Сделано и проверено для AIMP 4.60 из Microsoft Store. AIMP 5 устанавливается для всего компьютера (нужны права администратора).
- Только локальный хост Orca.

## Восстановление и удаление

- **AIMP забывает настройки после закрытия**: выполните `.\install.ps1 -SkipSettings`.
- **Панель пишет, что AIMP закрыт, хотя он открыт**: перезапустите AIMP — панель переподключится сама.
- **Отменить изменения установщика в AIMP**: исходные настройки AIMP сохранены рядом как `AIMP.ini.b-side.bak`.
- **Удаление**: `orca plugin dev unload <путь>\b-side\plugin`, затем при желании удалите AIMP в
  Параметры Windows › Приложения и удалите клон.

## Разработка

```powershell
orca plugin test plugin        # модульные тесты (node:test)
orca plugin validate plugin
orca plugin dev watch plugin --check --shot plugin\.orca\shots
```

К AIMP обращается только `plugin/native/aimp-helper.ps1`; воркер запускает его через
`powershell.exe -EncodedCommand` и общается с ним по stdin/stdout.

## Благодарности и лицензия

- B-Side: [лицензия MIT](LICENSE).
- [AIMP](https://www.aimp.ru) Артёма Измайлова и «Мои облака» — отдельные продукты и не входят в
  репозиторий. Это независимый проект, а не официальный проект AIMP или Orca.
- Иконки флагов: [lipis/flag-icons](https://github.com/lipis/flag-icons), [лицензия MIT](docs/flags/LICENSE).
