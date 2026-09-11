<div align="center">

# 🖥️ Fixcat OS Manager

### Веб-панель управления операционными системами в Docker и контейнерами

[![Version](https://img.shields.io/badge/version-2.6.0-blue.svg?style=for-the-badge&logo=github)](https://github.com/fixcat-offical/Fixcat-OS-Manager)
[![License](https://img.shields.io/badge/license-MIT-green.svg?style=for-the-badge)](LICENSE)
[![Node](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://docker.com)
[![Installer](https://img.shields.io/badge/installer-Fixcat--OS--Manager-6366F1?style=for-the-badge)](install.sh)

**Разворачивайте полноценные виртуальные ОС** (Ubuntu, Windows XP, Debian, Kali, Alpine)
**с рабочим столом через браузер (noVNC), следите за CPU/RAM/GPU и управляйте несколькими ПК** — всё в одном месте.

---

**Установка на сервер одной командой** 🚀

```bash
curl -fsSL https://raw.githubusercontent.com/fixcat-offical/Fixcat-OS-Manager/main/install.sh | sudo bash
```

**Обновление одной командой** 🔄

```bash
curl -fsSL https://raw.githubusercontent.com/fixcat-offical/Fixcat-OS-Manager/main/update.sh | sudo bash
```

**Удаление одной командой** 🗑️

```bash
curl -fsSL https://raw.githubusercontent.com/fixcat-offical/Fixcat-OS-Manager/main/uninstall.sh | sudo bash
```

</div>

---

## ✨ Возможности

| | |
|---|---|
| 🐳 **Менеджер контейнеров** | Создание, запуск, пауза, удаление ВМ и ОС, логи, порты, noVNC одним кликом |
| 🖥️ **Виртуальные ОС** | Ubuntu Desktop, Windows XP, Debian XFCE, Kali GUI, Alpine — с доступом в браузере |
| 📊 **Мониторинг** | Живые метрики CPU, RAM, Multi-GPU (NVIDIA), сеть, диск, история |
| ⚡ **Профессиональный установщик** | Интерактивный пошаговый установщик с live-логом (SSE), выбор порта/директорий |
| 📦 **Модули** | Каталог модулей: ОС-образы, Docker/Node/NVIDIA — установка в один клик |
| 🌐 **Несколько ПК (Узлы)** | Подключение вторых панелей по IP + API-ключу: управление контейнерами, автозапуском, настройками и железом удалённого ПК через одну панель |
| 🔐 **Авторизация** | Регистрация/вход администратора, тостовые уведомления |
| 📱 **Адаптивный UI** | Тёмная тема, мобильное меню, Tailwind CSS |

---

## 🚀 Быстрый старт

### Способ 1 — Одна команда (рекомендуется)

Скрипт сам: определит ОС, поставит `Docker`, `Node.js`, `NVIDIA Toolkit`,
предзагрузит ОС-образы из каталога модулей, соберёт панель и создаст системную службу `systemd`.

```bash
curl -fsSL https://raw.githubusercontent.com/fixcat-offical/Fixcat-OS-Manager/main/install.sh | sudo bash
```

Развёрнутые примеры:

```bash
# Полностью автоматически, свой порт:
curl -fsSL https://raw.githubusercontent.com/fixcat-offical/Fixcat-OS-Manager/main/install.sh -o install.sh \
  && sudo bash install.sh --port 8080 --yes

# Превью без изменений (обратно-совместимый «сухой прогон»):
sudo bash install.sh --dry-run

# Гипертонкая установка (без Docker-образов и GPU-стека):
sudo bash install.sh --yes --no-images --no-nvidia
```

Параметры скрипта:

| Флаг | Описание |
|------|----------|
| `--port <N>` | Порт веб-панели (по умолчанию `3000`, авто-подбор при занятости) |
| `--dir <path>` | Директория установки (по умолчанию `/opt/fixcat-os-manager`) |
| `--data-dir <path>` | Директория данных (БД, конфиги) |
| `--yes` / `-y` | Полностью автоматический режим без вопросов |
| `--dry-run` | Показать команды без внесения изменений |
| `--no-docker` | Пропустить установку Docker |
| `--no-node` | Пропустить установку Node.js |
| `--no-nvidia` | Пропустить NVIDIA Container Toolkit |
| `--no-images` | Не предзагружать ОС-образы |
| `-h` / `--help` | Справка |

> 💡 Скрипт также доступен прямо **из самой панели** (вкладка «Установщик»)
> и живёт в её API: `GET /api/installer/script`.

---

## 🔄 Обновление

Подтягивает последнюю версию, ставит зависимости, пересобирает и перезапускает службу.
Файл `.env` (порт/директории) сохраняется.

```bash
curl -fsSL https://raw.githubusercontent.com/fixcat-offical/Fixcat-OS-Manager/main/update.sh | sudo bash
```

```bash
# Своя директория установки:
curl -fsSL https://raw.githubusercontent.com/fixcat-offical/Fixcat-OS-Manager/main/update.sh -o update.sh \
  && sudo bash update.sh --dir /srv/fixcat
```

---

## 🗑️ Удаление

Останавливает и удаляет службу и каталог установки. **Данные (users.db, модели, конфиги)
по умолчанию сохраняются** — подтверждение запрашивается интерактивно.

```bash
curl -fsSL https://raw.githubusercontent.com/fixcat-offical/Fixcat-OS-Manager/main/uninstall.sh | sudo bash
```

```bash
# Без вопросов (данные сохранятся):
sudo bash uninstall.sh --yes

# Полное удаление вместе с данными и ОС-образами:
sudo bash uninstall.sh --yes --purge
```

Параметры:

| Флаг | Описание |
|------|----------|
| `--dir <path>` | Директория установки (по умолчанию `/opt/fixcat-os-manager`) |
| `--yes` / `-y` | Без вопросов (данные сохраняются) |
| `--purge` | Удалить данные и ОС-образы модулей |
| `--keep-data` | Гарантированно сохранить данные |

### Способ 2 — Вручную (разработка)

```bash
git clone https://github.com/fixcat-offical/Fixcat-OS-Manager.git
cd Fixcat-OS-Manager
npm install

# разработка (Vite + tsx, hot reload)
npm run dev

# и/или продакшн-сервер
npm run build
PORT=3000 NODE_ENV=production node dist/server.js
```

Откройте **http://localhost:3000**.

---

## 🧩 Модули

Установка и удаление в один клик — вкладка **«Модули»** в панели.

| Модуль | Назначение | Ресурс |
|--------|-----------|--------|
| 🐧 Ubuntu 22.04 Desktop | Полный рабочий стол LXDE + noVNC | `dorowu/ubuntu-desktop-lxde-vnc` |
| 🪟 Windows XP Professional | Классическая WinXP в QEMU | `dockur/windows:xp` |
| 🐟 Debian 12 XFCE | Стабильный рабочий стол | `ghcr.io/linuxserver/webtop:debian-xfce` |
| 🎯 Kali Linux GUI | Аудит безопасности | `kasmweb/kali-rolling-desktop` |
| 🗻 Alpine Light GUI | Ультра-лёгкий (RAM ~300MB) | `ghcr.io/linuxserver/webtop:alpine-kde` |
| 🐳 Docker Engine | Базовое окружение | системный |
| 🟩 Node.js LTS | Рантайм панели | системный |
| 🎮 NVIDIA Toolkit | GPU в контейнерах | системный |

---

## 🛠️ Технологии

Frontend · TypeScript · React · Vite · Tailwind CSS · Lucide · noVNC widgets
Backend · Node.js · Express · SSE (live-логи) · Docker Socket API · WebSocket
Установщик · Bash (POSIX) · systemd · интерактив с автоподбором порта

---

## ⚙️ API

| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/api/system` | Информация о хосте (CPU/RAM/GPU/диск/сеть, версия приложения) |
| `GET` | `/api/containers` | Список контейнеров |
| `GET` | `/api/containers/:id/inspect` | Детали контейнера |
| `POST` | `/api/containers/:id/rename` | Переименовать контейнер |
| `GET` | `/api/containers/:id/logs` | Логи контейнера |
| `POST` | `/api/containers/create` | Развернуть ОС |
| `GET` | `/api/images` | Локальные Docker-образы |
| `GET` | `/api/docker/info` | Параметры Docker Engine |
| `GET` | `/api/health` | Health-check панели |
| `GET` | `/api/events` | Журнал событий панели и Docker |
| `GET` | `/api/config/backup` | Скачать конфиг панели (JSON) |
| `POST` | `/api/config/restore` | Восстановить конфиг из JSON |
| `GET` | `/api/installer/status` | Статус установки |
| `GET` | `/api/installer/stream` | SSE live-логи установки и модулей |
| `POST` | `/api/installer/start` | Запустить установщик |
| `POST` | `/api/installer/stop` | Остановить установку |
| `GET` | `/api/installer/script` | Скачать `install.sh` |
| `GET` | `/api/modules` | Каталог модулей |
| `POST` | `/api/modules/:id/install` | Установить модуль |
| `POST` | `/api/modules/:id/uninstall` | Удалить модуль |
| `GET` | `/api/autostarts` | Список политик автозапуска контейнеров |
| `POST` | `/api/autostarts/bulk` | Применить политику ко всем контейнерам |
| `POST` | `/api/autostarts/:id` | Установить политику (`no`, `always`, `unless-stopped`, `on-failure`) |
| `DELETE` | `/api/autostarts/:id` | Удалить автозапуск (политика `no`) |
| `GET` | `/api/nodes` | Список подключённых ПК (узлов) со статусом 🔒👑 |
| `POST` | `/api/nodes` | Добавить узел по IP + API-ключу 🔒👑 |
| `DELETE` | `/api/nodes/:id` | Удалить узел 🔒👑 |
| `POST` | `/api/nodes/:id/test` | Проверить соединение с узлом 🔒👑 |
| `POST` | `/api/nodes/:id/proxy` | Проксирование запроса к удалённой панели 🔒👑 |
| `POST` | `/api/config/api-key` | Перегенерировать API-ключ панели 🔒👑 |
| `GET` | `/api/auth/status` | Проверка авторизации (возвращает роль) |
| `POST` | `/api/auth/register` | Регистрация первого администратора |
| `POST` | `/api/auth/login` | Вход (поддержка нескольких одновременных сессий) |
| `POST` | `/api/auth/logout` | Выход из текущей сессии |
| `POST` | `/api/auth/change-password` | Смена собственного пароля 🔒 |
| `GET` | `/api/users/backup` | Скачать бэкап пользователей 🔒👑 |
| `GET` | `/api/users` | Список всех пользователей 🔒👑 |
| `POST` | `/api/users` | Создать пользователя 🔒👑 |
| `PUT` | `/api/users/:username` | Редактирование (логин, пароль, роль, статус) 🔒👑 |
| `DELETE` | `/api/users/:username` | Удалить пользователя 🔒👑 |

> 🔒 — Requires `Authorization: Bearer <token>` or `X-Fixcat-Api-Key` header. 👑 — Admin role only.

### 🌐 Управление несколькими ПК

Каждая панель автоматически генерирует API-ключ (раздел **Настройки → API для интеграции**). Чтобы управлять вторым ПК:

1. В настройках первого ПК скопируйте его API-ключ.
2. На втором ПК откройте панель → вкладка **Связанные ПК (Узлы)** → **Создать узел** → укажите IP, порт и API-ключ первого ПК.
3. В шапке панели появится переключатель **🖥️ Этот ПК / <узел>** — выберите устройство, и все вкладки (контейнеры, автозапуск, настройки, ресурсы, журнал, развёртывание ОС, управление железом) будут работать с выбранным ПК через единую панель.

> Проксируется список безопасных путей `/api/*` (контейнеры, автозапуск, события, статистика, настройки, обновления, оборудование, образы, порты, Docker-info). Развёртывание ОС на удалённом узле выполняется напрямую на том ПК.

---

## 📁 Структура проекта

```
Fixcat-OS-Manager/
├── server.ts                  # Express-сервер + роуты
├── installer.ts               # Движок установщика/модулей (SSE, шаги, bash-скрипт)
├── install.sh                 # Установка одной командой
├── update.sh                  # Обновление одной командой
├── uninstall.sh               # Удаление одной командой
├── src/
│   ├── App.tsx                # Роутинг вкладок, авторизация, тосты
│   └── components/
│       ├── DashboardView.tsx      # Дашборд хоста
│       ├── ContainersView.tsx     # Менеджер контейнеров
│       ├── NoVncFullView.tsx      # noVNC рабочие столы
│       ├── ResourceMonitorView.tsx# Метрики
│       ├── ModulesView.tsx        # Каталог модулей
│       ├── InstallerExportView.tsx# Живой установщик + экспорт-кит
│       └── ...
└── data/                      # Создаётся при первом запуске (users, settings, nodes)
```

---

## 📄 Лицензия

MIT © Fixcat Dev Team. Сделано с ❤️ для сообщества Fixcat.

> ⚠️ Windows XP — модуль для образовательных и исследовательских целей.
> Убедитесь, что у вас есть права на используемое ПО.