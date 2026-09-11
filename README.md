<div align="center">

# 🖥️ Fixcat OS Manager

### Веб-панель управления операционными системами в Docker и локальными нейросетями

[![Version](https://img.shields.io/badge/version-2.6.0-blue.svg?style=for-the-badge&logo=github)](https://github.com/fixcat-offical/Fixcat-OS-Manager)
[![License](https://img.shields.io/badge/license-MIT-green.svg?style=for-the-badge)](LICENSE)
[![Node](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://docker.com)
[![-style](https://img.shields.io/badge/installer---style-6366F1?style=for-the-badge)](install.sh)

**Разворачивайте полноценные виртуальные ОС** (Ubuntu, Windows XP, Debian, Kali, Alpine)
**с рабочим столом через браузер (noVNC), следите за CPU/RAM/GPU и запускайте
локальные ИИ-модели ()** — всё в одном месте.

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
| 🤖 **** | Менеджер локальных нейросетей () + OpenAI-совместимый API на порту `1234` |
| 📊 **Мониторинг** | Живые метрики CPU, RAM, Multi-GPU (NVIDIA), сеть, диск, история |
| ⚡ **Установщик -style** | Интерактивный пошаговый установщик с live-логом (SSE), выбор порта/директорий |
| 📦 **Модули** | Каталог модулей: ОС-образы,  CLI, Docker/Node/NVIDIA — установка в один клик |
| 🔐 **Авторизация** | Регистрация/вход администратора, тостовые уведомления |
| 📱 **Адаптивный UI** | Тёмная тема, мобильное меню, Tailwind CSS |

---

## 🚀 Быстрый старт

### Способ 1 — Одна команда (рекомендуется)

Скрипт сам: определит ОС, поставит `Docker`, `Node.js`, `NVIDIA Toolkit`, ` CLI`,
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
sudo bash install.sh --yes --no-images --no-nvidia --no-lms
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
| `--no-lms` | Пропустить  CLI |
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
| 🤖  CLI | Локальные нейросети в VRAM | `lms` CLI |
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
| `GET` | `/api/system` | Информация о хосте (CPU/RAM/GPU/сеть) |
| `GET` | `/api/containers` | Список контейнеров |
| `GET` | `/api/containers/:id/inspect` | Детали контейнера |
| `POST` | `/api/containers/create` | Развернуть ОС |
| `GET` | `/api/installer/status` | Статус установки |
| `GET` | `/api/installer/stream` | SSE live-логи установки и модулей |
| `POST` | `/api/installer/start` | Запустить установщик |
| `POST` | `/api/installer/stop` | Остановить установку |
| `GET` | `/api/installer/script` | Скачать `install.sh` |
| `GET` | `/api/modules` | Каталог модулей |
| `POST` | `/api/modules/:id/install` | Установить модуль |
| `POST` | `/api/modules/:id/uninstall` | Удалить модуль |
| `GET` | `/api/autostarts` | Список политик автозапуска контейнеров |
| `POST` | `/api/autostarts/:id` | Установить политику (`no`, `always`, `unless-stopped`, `on-failure`) |
| `DELETE` | `/api/autostarts/:id` | Удалить автозапуск (политика `no`) |

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
│       ├── OnDeviceAiView.tsx        #  / 
│       ├── ResourceMonitorView.tsx# Метрики
│       ├── ModulesView.tsx        # Каталог модулей
│       ├── InstallerExportView.tsx# Живой установщик + экспорт-кит
│       └── ...
└── data/                      # Создаётся при первом запуске (users.db, models)
```

---

## 📄 Лицензия

MIT © Fixcat Dev Team. Сделано с ❤️ для сообщества Fixcat.

> ⚠️ Windows XP — модуль для образовательных и исследовательских целей.
> Убедитесь, что у вас есть права на используемое ПО.