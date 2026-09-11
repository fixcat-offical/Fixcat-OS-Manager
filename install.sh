#!/usr/bin/env bash
# =============================================================================
#  Fixcat OS Manager — профессиональный установщик (интерактивный/автоматический)
#  Авто-выбор свободного порта, выбор директорий, установка Docker / Node.js /
#  NVIDIA Toolkit, сборка панели, systemd-служба.
#
#  Примеры:
#    sudo bash install.sh                       # интерактивный режим
#    sudo bash install.sh --port 8080 --yes     # полностью автоматический
#    sudo bash install.sh --dry-run             # превью без изменений
# =============================================================================

set -euo pipefail

# При любой ошибке показываем строку и команду вместо тихого выхода
trap 'rc=$?; echo -e "\033[0;31m[FAIL ] Ошибка на строке $LINENO: $BASH_COMMAND (код $rc)\033[0m" >&2' ERR

REPO_URL="https://github.com/fixcat-offical/Fixcat-OS-Manager.git"
INSTALL_DIR="/opt/fixcat-os-manager"
DATA_DIR="/opt/fixcat-os-manager/data"
PORT="3000"
ASSUME_YES=0
DRY_RUN=0
INSTALL_DOCKER=1
INSTALL_NODE=1
INSTALL_NVIDIA=1
PRELOAD_OS=1

# ---------- аргументы командной строки ----------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)
      if [[ "$2" =~ ^[0-9]+$ ]] && (( $2 >= 1024 && $2 <= 65535 )); then
        PORT="$2"
      else
        warn "Некорректный --port: «$2» — используются 3000"
      fi
      shift 2
      ;;
    --dir)         INSTALL_DIR="$2"; DATA_DIR="$2/data"; shift 2 ;;
    --data-dir)    DATA_DIR="$2"; shift 2 ;;
    --yes|-y)      ASSUME_YES=1; shift ;;
    --dry-run)     DRY_RUN=1; shift ;;
    --no-docker)   INSTALL_DOCKER=0; shift ;;
    --no-node)     INSTALL_NODE=0; shift ;;
    --no-nvidia)   INSTALL_NVIDIA=0; shift ;;
    --no-images)   PRELOAD_OS=0; shift ;;
    -h|--help)     grep "^#" "$0"; exit 0 ;;
    *) echo "❌ Неизвестный аргумент: $1"; exit 1 ;;
  esac
done

COLOR_RESET='\033[0m'; COLOR_BLUE='\033[0;34m'; COLOR_GREEN='\033[0;32m'
COLOR_YELLOW='\033[0;33m'; COLOR_RED='\033[0;31m'; COLOR_CYAN='\033[0;36m'

info()  { echo -e "${COLOR_BLUE}[INFO]${COLOR_RESET} $*"; }
ok()    { echo -e "${COLOR_GREEN}[  OK ]${COLOR_RESET} $*"; }
warn()  { echo -e "${COLOR_YELLOW}[WARN ]${COLOR_RESET} $*"; }
fail()  { echo -e "${COLOR_RED}[FAIL ]${COLOR_RESET} $*"; }
step()  { echo; echo -e "${COLOR_CYAN}════════════════════════════════════════════════════════════${COLOR_RESET}"; echo -e "${COLOR_CYAN}  $*${COLOR_RESET}"; echo -e "${COLOR_CYAN}════════════════════════════════════════════════════════════${COLOR_RESET}"; }

exec_cmd() {
  if [[ "$DRY_RUN" == "1" ]]; then
    info "[DRY-RUN] $*"
    return 0
  fi
  "$@"
}

# Псевдо-прогрессбар для долгих шагов (npm ci / сборка): показывает заполняющийся
# бар и прошедшее время, а по завершении — итог. Реальные команды идут в логфайл.
run_with_progress() {
  local label="$1"; shift
  if [[ "$DRY_RUN" == "1" ]]; then
    info "[DRY-RUN] $label: $*"
    return 0
  fi
  local logf="/tmp/fixcat-progress.log" pid start_sec sec i bar filler rc
  info "$label..."
  "$@" >"$logf" 2>&1 &
  pid=$!; start_sec=$SECONDS
  while kill -0 "$pid" 2>/dev/null; do
    sec=$((SECONDS-start_sec))
    bar=""; filler=""
    for ((i=0; i<sec*2%20; i++)); do bar+='#'; done
    for ((i=sec*2%20; i<20; i++)); do filler+='.'; done
    printf "\033[K   \033[0;33m[%s%s]\033[0m %ss " "$bar" "$filler" "$sec"
    sleep 0.25
  done
  rc=0; wait "$pid" 2>/dev/null && rc=0 || rc=$?
  sec=$((SECONDS-start_sec))
  if [[ $rc -eq 0 ]]; then
    printf "\033[K   \033[0;32m[####################]\033[0m %ss — готово\n" "$sec"
    ok "$label."
  else
    printf "\033[K   \033[0;31m[ошибка %s]\033[0m %ss\n" "$rc" "$sec"
    tail -n 20 "$logf" | sed 's/^/       /'
  fi
  return $rc
}

# ---------- права root ----------
if [[ "$EUID" -ne 0 ]]; then
  fail "Скрипт должен запускаться от root. Используйте: sudo bash install.sh"
  exit 1
fi

# ---------- определение ОС ----------
detect_os() {
  if [[ -f /etc/os-release ]]; then
    . /etc/os-release
    echo "$ID"
  else
    echo "unknown"
  fi
}
OS_ID="$(detect_os)"
# Arch-подобные (manjaro, endeavour, garuda...) опознаём по наличию pacman
IS_PACMAN=0
command -v pacman >/dev/null 2>&1 && IS_PACMAN=1

banner() {
  echo
  echo "   ███████╗██╗██╗  ██╗ ██████╗ █████╗ ████████╗"
  echo "   ██╔════╝██║╚██╗██╔╝██╔════╝██╔══██╗╚══██╔══╝"
  echo "   █████╗  ██║ ╚███╔╝ ██║     ███████║   ██║   "
  echo "   ██╔══╝  ██║ ██╔██╗ ██║     ██╔══██║   ██║   "
  echo "   ██║     ██║██╔╝ ██╗╚██████╗██║  ██║   ██║   "
  echo "   ╚═╝     ╚═╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝   ╚═╝   "
  echo "      OS Manager — интерактивный установщик v2.6"
  echo
}

port_free() {
  local p="$1" ip busy=0
  # ss/netstat могут отсутствовать или не видеть /proc — не ждём их вечно
  if command -v timeout >/dev/null 2>&1; then
    if timeout 2 ss -tlnp 2>/dev/null | grep -q "\s$p\s"; then return 1; fi
    if timeout 2 netstat -tlnp 2>/dev/null | grep -q "\s$p\s"; then return 1; fi
  elif command -v ss >/dev/null 2>&1; then
    if ss -tlnp 2>/dev/null | grep -q "\s$p\s"; then return 1; fi
  elif command -v netstat >/dev/null 2>&1; then
    if netstat -tlnp 2>/dev/null | grep -q "\s$p\s"; then return 1; fi
  fi
  # Фолбэк: реальный TCP-connect к lo и ко всем внешним IPv4
  for ip in 127.0.0.1 $(hostname -I 2>/dev/null); do
    [[ "$ip" == *:* ]] && continue
    if (exec 3<>/dev/tcp/"$ip"/"$p") 2>/dev/null; then exec 3>&- 3<&-; busy=1; break; fi
  done
  return $busy
}

# Ответы читаем с терминала /dev/tty, а не из stdin:
# при «curl ... | bash» stdin занят телом самого скрипта.
read_input() {
  local prompt="$1" out=""
  if (exec 3<>/dev/tty) 2>/dev/null; then
    read -r -p "$prompt" out < /dev/tty || out=""
  elif [[ -t 0 ]]; then
    read -r -p "$prompt" out || out=""
  fi
  printf '%s\n' "$out"
}

pick_port() {
  if [[ "$ASSUME_YES" == "1" ]]; then
    if ! port_free "$PORT"; then
      for p in $(seq $((PORT+1)) 60100); do
        if port_free "$p"; then PORT="$p"; break; fi
      done
    fi
    return
  fi
  while true; do
    local want
    want="$(read_input "🔌 Введите порт веб-панели [сейчас: $PORT, пусто=оставить]: ")"
    [[ -n "$want" ]] && PORT="$want"
    # валидация: только число, 1024-65535
    if ! [[ "$PORT" =~ ^[0-9]+$ ]] || (( PORT < 1024 || PORT > 65535 )); then
      warn "Некорректный порт: «$PORT» — введите число от 1024 до 65535"
      PORT="3000"
      continue
    fi
    if port_free "$PORT"; then ok "Порт $PORT свободен."; return; fi
    warn "Порт $PORT занят. Ищу ближайший свободный..."
    for p in $(seq $((PORT+1)) 60100); do
      if port_free "$p"; then
        info "Свободный порт: $p"
        use="$(read_input "Использовать $p? [Y/n]: ")"
        [[ "${use,,}" != "n" ]] && { PORT="$p"; ok "Выбран порт $PORT."; return; }
        break
      fi
    done
  done
}

pick_dir() {
  if [[ "$ASSUME_YES" == "1" ]]; then return; fi
  local d
  d="$(read_input "📁 Директория установки [${INSTALL_DIR}]: ")"
  if [[ -n "$d" ]]; then
    INSTALL_DIR="$d"; DATA_DIR="$d/data"
  fi
  d="$(read_input "📁 Директория данных [${DATA_DIR}]: ")"
  if [[ -n "$d" ]]; then
    DATA_DIR="$d"
  fi
}

prompt_yn() {
  local label="$1" default="$2"
  if [[ "$ASSUME_YES" == "1" ]]; then
    [[ "$default" == "1" ]] && return 0 || return 1
  fi
  while true; do
    a="$(read_input "❓ $label [Y/n]: ")"
    [[ -z "$a" ]] && a="$default"
    case "${a,,}" in y|yes) return 0 ;; n|no) return 1 ;; *) ;; esac
  done
}

# =============================================================================
banner
step "1/9 — Конфигурация установки"
echo "  ОС:        ${OS_ID:-unknown} / $(uname -m)"
echo "  Node.js:   $(node --version 2>/dev/null || echo 'не установлен')"
echo "  Docker:    $(command -v docker >/dev/null && echo 'установлен' || echo 'не установлен')"
echo "  GPU:       $(command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi -L >/dev/null 2>&1 && echo 'NVIDIA' || echo '—')"
pick_port
pick_dir
echo
info "Итоговая конфигурация:"
echo "  · Порт панели:      $PORT"
echo "  · Директория:       $INSTALL_DIR"
echo "  · Данные:           $DATA_DIR"
echo

step "2/9 — Системные зависимости"
case "$OS_ID" in
  ubuntu|debian|kali|linuxmint)
    DEPS="curl git ca-certificates gnupg lsb-release unzip xz-utils build-essential"
    exec_cmd apt-get update -y
    exec_cmd env DEBIAN_FRONTEND=noninteractive apt-get install -y $DEPS 2>/dev/null || warn "Часть зависимостей не установилась." ;;
  centos|rhel|rocky|almalinux|fedora)
    DEPS="curl git ca-certificates gnupg unzip xz"
    exec_cmd dnf install -y $DEPS 2>/dev/null || yum install -y $DEPS 2>/dev/null || warn "Часть зависимостей не установилась." ;;
  arch|manjaro|archlinux|endeavouros|garuda|chakra|cachyos)
    exec_cmd pacman -Sy --noconfirm curl git base-devel 2>/dev/null || true ;;
  *)
    if [[ "$IS_PACMAN" == "1" ]]; then
      exec_cmd pacman -Sy --noconfirm curl git base-devel 2>/dev/null || true
    else
      warn "ОС ${OS_ID} не распознана — ставлю зависимости вручную."
    fi ;;
esac
ok "Базовые компоненты готовы."

step "3/9 — Docker Engine"
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  ok "Docker уже активен."
elif [[ "$INSTALL_DOCKER" == "0" ]]; then
  warn "Установка Docker пропущена (флаг --no-docker)."
elif [[ "$IS_PACMAN" == "1" ]]; then
  exec_cmd pacman -Sy --noconfirm docker
  exec_cmd systemctl enable --now docker >/dev/null 2>&1 || exec_cmd service docker start >/dev/null 2>&1 || true
  ok "Docker Engine установлен (pacman)."
else
  exec_cmd bash -c 'curl -fsSL https://get.docker.com | sh'
  exec_cmd systemctl enable --now docker >/dev/null 2>&1 || exec_cmd service docker start >/dev/null 2>&1 || true
  ok "Docker Engine установлен."
fi

step "4/9 — Node.js LTS"
NODE_MAJOR=""
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR=$(node --version 2>/dev/null | sed 's/v//;s/\..*//')
fi
if [[ -n "$NODE_MAJOR" && "$NODE_MAJOR" -ge 18 ]]; then
  ok "Node.js v$NODE_MAJOR уже установлен."
elif [[ "$INSTALL_NODE" == "0" ]]; then
  warn "Установка Node.js пропущена (флаг --no-node)."
else
  case "$OS_ID" in
    ubuntu|debian|kali|linuxmint)
      exec_cmd bash -c 'curl -fsSL https://deb.nodesource.com/setup_22.x | bash -'
      exec_cmd env DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs ;;
    centos|rhel|rocky|almalinux|fedora)
      exec_cmd bash -c 'curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -'
      exec_cmd dnf install -y nodejs ;;
    arch|manjaro|archlinux|endeavouros|garuda|chakra|cachyos)
      exec_cmd pacman -Sy --noconfirm nodejs npm ;;
    *) warn "Нет автоматической установки Node для $OS_ID — установите Node.js 18+ вручную." ;;
  esac
  ok "Node.js v$(node --version 2>/dev/null | sed 's/v//' || echo '?') установлен."
fi

step "5/9 — NVIDIA Container Toolkit (GPU)"
if ! command -v nvidia-smi >/dev/null 2>&1 || ! nvidia-smi -L >/dev/null 2>&1; then
  warn "NVIDIA GPU не обнаружен — пропуск."
elif command -v nvidia-ctk >/dev/null 2>&1; then
  ok "Toolkit уже установлен."
elif [[ "$INSTALL_NVIDIA" == "0" ]]; then
  warn "Пропущено (флаг --no-nvidia)."
else
  if [[ "$IS_PACMAN" == "1" ]]; then
    exec_cmd pacman -Sy --noconfirm nvidia-container-toolkit 2>/dev/null || warn "Ручная установка toolkit: https://github.com/NVIDIA/nvidia-container-toolkit (или: pacman -S nvidia-container-toolkit)"
  else
    curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg 2>/dev/null || true
    curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' > /etc/apt/sources.list.d/nvidia-container-toolkit.list 2>/dev/null || true
    exec_cmd apt-get update -y
    exec_cmd env DEBIAN_FRONTEND=noninteractive apt-get install -y nvidia-container-toolkit 2>/dev/null || warn "Ручная установка toolkit: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html"
  fi
  exec_cmd nvidia-ctk runtime configure --runtime=docker 2>/dev/null || true
  ok "NVIDIA Container Toolkit настроен."
fi

step "6/9 — Модули панели (образы ОС)"
if [[ "$PRELOAD_OS" == "1" ]] && command -v docker >/dev/null 2>&1; then
  IMAGES=( "accetto/ubuntu-vnc-xfce-g3:latest" "ghcr.io/linuxserver/webtop:debian-xfce" "kasmweb/kali-rolling-desktop:1.16.0" "ghcr.io/linuxserver/webtop:alpine-kde" "dockurr/windows:latest" )
  for img in "${IMAGES[@]}"; do
    if docker image inspect "$img" >/dev/null 2>&1; then
      ok "Образ уже загружен: $img"
    else
      info "Docker pull: $img (может занять время)..."
      exec_cmd docker pull "$img" || warn "Не удалось загрузить $img (можно докачать позже из панели «Модули»)."
    fi
  done
  ok "Модули ОС загружены."
else
  warn "Загрузка образов пропущена или Docker недоступен."
fi

step "7/9 — Сборка панели"
mkdir -p "$INSTALL_DIR" "$DATA_DIR"
cd "$INSTALL_DIR"
if [[ "$DRY_RUN" != "1" ]]; then
  if [[ -f package.json ]]; then
    info "Проект уже в $INSTALL_DIR — обновляю..."
    git pull --ff-only 2>/dev/null || true
  else
    info "Клонирую Fixcat OS Manager..."
    git clone "$REPO_URL" . 2>/dev/null || { git init -q; git remote add origin "$REPO_URL"; git fetch -q origin; git checkout -q origin/main; }
  fi
  info "Зависимости (npm ci, кэширующе)..."
  run_with_progress "npm ci (зависимости, ~1-3 мин на слабой сети)"     npm ci --no-audit --no-fund --loglevel=error --prefer-offline     --fetch-retries=3 --fetch-retry-mintimeout=1000 --fetch-retry-maxtimeout=5000   || run_with_progress "npm install (запасной)"     npm install --no-audit --no-fund --loglevel=error --prefer-offline     --fetch-retries=3 --fetch-retry-mintimeout=1000 --fetch-retry-maxtimeout=5000
  run_with_progress "Продакшн-сборка (vite + esbuild)" npm run build
  cat > .env <<EOF
# Fixcat OS Manager
PORT=$PORT
NODE_ENV=production
FIXCAT_DATA_DIR=$DATA_DIR
FIXCAT_INSTALL_DIR=$INSTALL_DIR
EOF
  ok "Панель собрана."
else
  info "[DRY-RUN] git clone / npm run build / .env — без изменений."
fi

step "8/9 — Служба systemd"
if [[ -d /run/systemd/system ]]; then
  cat > /etc/systemd/system/fixcat.service <<EOF
[Unit]
Description=Fixcat OS Manager - Web Panel for Virtual OS and Containers
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
Environment=PORT=$PORT
Environment=NODE_ENV=production
Environment=FIXCAT_DATA_DIR=$DATA_DIR
ExecStart=/usr/bin/node $INSTALL_DIR/dist/server.js
Restart=always
RestartSec=3
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF
  exec_cmd systemctl daemon-reload
  exec_cmd systemctl enable fixcat.service
  exec_cmd systemctl restart fixcat.service
  ok "Служба fixcat.service запущена."
else
  warn "systemd не найден — запустите вручную: cd $INSTALL_DIR && NODE_ENV=production node dist/server.js"
fi

step "9/9 — Готово"
LOCAL_IPS=($(hostname -I 2>/dev/null || true))
PUBLIC_IP=""
PUBLIC_IP=$(curl -fsS --max-time 4 https://ipinfo.io/ip 2>/dev/null || curl -fsS --max-time 4 https://ifconfig.me 2>/dev/null || echo "")
echo
ok "Установка Fixcat OS Manager завершена!"
echo
echo -e "   🌐 Ссылки для входа в веб-панель (порт $PORT):"
echo
echo -e "     • Локально (этот сервер):  http://localhost:$PORT"
for ip in ${LOCAL_IPS[@]}; do
  if [[ "$ip" == *:* ]]; then continue; fi
  echo -e "     • Локальная сеть:            http://$ip:$PORT"
done
if [[ -n "$PUBLIC_IP" ]]; then
  echo -e "     • Интернет (если проброшен): http://$PUBLIC_IP:$PORT"
fi
echo
echo -e "   📁 Установка:      $INSTALL_DIR"
echo -e "   📦 Данные:         $DATA_DIR"
echo
echo -e "   ⚙️  Управление:    systemctl status fixcat   |  systemctl restart fixcat"
echo -e "   📜 Логи:           journalctl -u fixcat -f"
echo -e "   🛡️  Файрвол:       sudo ufw allow $PORT/tcp   (при недоступности извне)"
echo
if [[ -z "$PUBLIC_IP" ]]; then
  echo -e "   💡 Внешний IP не определился (нет интернета/ICMP) — проверьте снаружи:"
  echo -e "      curl -fsS https://ipinfo.io/ip ;   затем http://<этот-ip>:$PORT"
  echo
fi
