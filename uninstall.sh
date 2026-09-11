#!/usr/bin/env bash
# =============================================================================
#  Fixcat OS Manager — полное удаление одной командой
#  Останавливает и отключает службу systemd, удаляет unit-файл и каталог
#  установки. Данные (users.db, конфиги, модели) по умолчанию сохраняются —
#  спросит подтверждение. Флаг --purge удаляет данные и ОС-образы модулей.
#
#  Примеры:
#    sudo bash uninstall.sh                        # интерактивно
#    sudo bash uninstall.sh --yes                  # без вопросов (данные сохранит)
#    sudo bash uninstall.sh --yes --purge          # всё удалить, включая данные и образы
#    sudo bash uninstall.sh --dir /srv/fixcat      # своя директория установки
# =============================================================================

set -euo pipefail

INSTALL_DIR="/opt/fixcat-os-manager"
ASSUME_YES=0
PURGE=0
KEEP_DATA=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir)         INSTALL_DIR="$2"; shift 2 ;;
    --yes|-y)      ASSUME_YES=1; shift ;;
    --purge)       PURGE=1; KEEP_DATA=0; shift ;;
    --keep-data)   KEEP_DATA=1; shift ;;
    -h|--help)     grep "^#" "$0"; exit 0 ;;
    *)             echo "❌ Неизвестный аргумент: $1"; exit 1 ;;
  esac
done

COLOR_RESET='\033[0m'; COLOR_BLUE='\033[0;34m'; COLOR_GREEN='\033[0;32m'
COLOR_YELLOW='\033[0;33m'; COLOR_RED='\033[0;31m'; COLOR_CYAN='\033[0;36m'

info()  { echo -e "${COLOR_BLUE}[INFO]${COLOR_RESET} $*"; }
ok()    { echo -e "${COLOR_GREEN}[  OK ]${COLOR_RESET} $*"; }
warn()  { echo -e "${COLOR_YELLOW}[WARN ]${COLOR_RESET} $*"; }
fail()  { echo -e "${COLOR_RED}[FAIL ]${COLOR_RESET} $*"; }
step()  { echo; echo -e "${COLOR_CYAN}════════════════════════════════════════════════════════════${COLOR_RESET}"; echo -e "${COLOR_CYAN}  $*${COLOR_RESET}"; echo -e "${COLOR_CYAN}════════════════════════════════════════════════════════════${COLOR_RESET}"; }

confirm() {
  local label="$1"
  if [[ "$ASSUME_YES" == "1" ]]; then return 0; fi
  while true; do
    read -r -p "❓ $label [y/N]: " a
    case "${a,,}" in y|yes) return 0 ;; ""|n|no) return 1 ;; *) ;; esac
  done
}

# ---------- root ----------
if [[ "$EUID" -ne 0 ]]; then
  fail "Скрипт должен запускаться от root. Используйте: sudo bash uninstall.sh"
  exit 1
fi

SERVICE="fixcat.service"
DATA_DIR="$(grep -E '^FIXCAT_DATA_DIR=' "$INSTALL_DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '[:space:]' || echo "$INSTALL_DIR/data")"
PORT="$(grep -E '^PORT=' "$INSTALL_DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '[:space:]' || echo 3000)"

echo
echo -e "${COLOR_RED}╔══════════════════════════════════════════════════════════════╗${COLOR_RESET}"
echo -e "${COLOR_RED}║  ВНИМАНИЕ: удаление Fixcat OS Manager с этого сервера       ║${COLOR_RESET}"
echo -e "${COLOR_RED}║  Панель:     $INSTALL_DIR              ║${COLOR_RESET}"
echo -e "${COLOR_RED}║  Данные:     $DATA_DIR  ║${COLOR_RESET}"
echo -e "${COLOR_RED}╚══════════════════════════════════════════════════════════════╝${COLOR_RESET}"
echo

if confirm "Удалить Fixcat OS Manager ($INSTALL_DIR)?"; then
  :
else
  info "Отменено. Установка осталась нетронутой."
  exit 0
fi

# ---------- 1. служба ----------
step "1/4 — Остановка и удаление службы"
if [[ -d /run/systemd/system ]] && systemctl list-unit-files "$SERVICE" >/dev/null 2>&1; then
  systemctl stop "$SERVICE" 2>/dev/null || true
  systemctl disable "$SERVICE" 2>/dev/null || true
  rm -f "/etc/systemd/system/$SERVICE" "/etc/systemd/system/$SERVICE" /etc/systemd/system/multi-user.target.wants/$SERVICE
  systemctl daemon-reload 2>/dev/null || true
  ok "Служба $SERVICE остановлена и удалена."
else
  pkill -f 'node dist/server.js' 2>/dev/null && info "Node-процесс остановлен." || info "Node-процесс не найден — ок."
fi

# ---------- 2. каталог установки ----------
step "2/4 — Удаление каталога установки"
rm -rf "$INSTALL_DIR"
ok "Каталог $INSTALL_DIR удалён."

# ---------- 3. данные ----------
step "3/4 — Данные"
if [[ "$PURGE" == "1" ]]; then
  if confirm "Удалить данные (users.db, локальные модели) из $DATA_DIR? [y/N]"; then
    rm -rf "$DATA_DIR"
    ok "Данные удалены."
  else
    KEEP_DATA=1
  fi
fi

if [[ "$KEEP_DATA" == "1" ]] && [[ -d "$DATA_DIR" ]]; then
  info "Данные сохранены в $DATA_DIR (для восстановления бэкапа)."
  info "  Удалить их можно вручную: rm -rf \"$DATA_DIR\""
fi

# ---------- 4. питание/образы ----------
step "4/4 — Образы модулей (если нужно)"
if [[ "$PURGE" == "1" ]] && command -v docker >/dev/null 2>&1; then
  if confirm "Удалить также ОС-образы модулей (Ubuntu, Windows XP, Debian, Kali, Alpine)? [y/N]"; then
    IMAGES=( "dorowu/ubuntu-desktop-lxde-vnc:latest" "dockur/windows:xp" "ghcr.io/linuxserver/webtop:debian-xfce" "kasmweb/kali-rolling-desktop:1.16.0" "ghcr.io/linuxserver/webtop:alpine-kde" )
    for img in "${IMAGES[@]}"; do
      docker image rm -f "$img" >/dev/null 2>&1 && ok "Образ удалён: $img" || true
    done
  fi
elif [[ "$PURGE" == "1" ]]; then
  warn "Docker не найден на сервере — образы не трогали."
fi

echo
ok "Fixcat OS Manager полностью удалён. До свидания! 👋"
echo -e "${COLOR_YELLOW}   Данные сохранены в: $DATA_DIR${COLOR_RESET}"
echo