#!/usr/bin/env bash
# =============================================================================
#  Fixcat OS Manager — обновление панели одной командой
#  Подтягивает последнюю версию из GitHub, ставит зависимости, собирает
#  продакшн-сборку и перезапускает службу (systemd) / node-процесс.
#
#  Примеры:
#    sudo bash update.sh                          # обновить из /opt/fixcat-os-manager
#    sudo bash update.sh --dir /srv/fixcat        # своя директория установки
# =============================================================================

set -euo pipefail

INSTALL_DIR="/opt/fixcat-os-manager"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir)        INSTALL_DIR="$2"; shift 2 ;;
    -h|--help)    grep "^#" "$0"; exit 0 ;;
    *)            echo "❌ Неизвестный аргумент: $1"; exit 1 ;;
  esac
done

COLOR_RESET='\033[0m'; COLOR_BLUE='\033[0;34m'; COLOR_GREEN='\033[0;32m'
COLOR_YELLOW='\033[0;33m'; COLOR_RED='\033[0;31m'; COLOR_CYAN='\033[0;36m'

info()  { echo -e "${COLOR_BLUE}[INFO]${COLOR_RESET} $*"; }
ok()    { echo -e "${COLOR_GREEN}[  OK ]${COLOR_RESET} $*"; }
warn()  { echo -e "${COLOR_YELLOW}[WARN ]${COLOR_RESET} $*"; }
fail()  { echo -e "${COLOR_RED}[FAIL ]${COLOR_RESET} $*"; }
step()  { echo; echo -e "${COLOR_CYAN}════════════════════════════════════════════════════════════${COLOR_RESET}"; echo -e "${COLOR_CYAN}  $*${COLOR_RESET}"; echo -e "${COLOR_CYAN}════════════════════════════════════════════════════════════${COLOR_RESET}"; }

# ---------- проверки ----------
if [[ "$EUID" -ne 0 ]]; then
  fail "Скрипт должен запускаться от root. Используйте: sudo bash update.sh"
  exit 1
fi

if [[ ! -d "$INSTALL_DIR/.git" ]]; then
  fail "Не найден установленный проект в $INSTALL_DIR (.git отсутствует)."
  echo "   Установка выполняется командой:"
  echo "     curl -fsSL https://raw.githubusercontent.com/fixcat-offical/Fixcat-OS-Manager/main/install.sh | sudo bash"
  exit 1
fi

SERVICE="fixcat.service"
HAS_SYSTEMD=0
if [[ -d /run/systemd/system ]] && systemctl list-unit-files "$SERVICE" >/dev/null 2>&1; then
  HAS_SYSTEMD=1
fi

OLD_VERSION="$(grep -m1 '"version"' "$INSTALL_DIR/package.json" 2>/dev/null | sed 's/[^0-9.]*//g' || echo '?')"

# ---------- сам обновление ----------
step "1/3 — Получение последней версии (git pull)"
cd "$INSTALL_DIR"
if git pull --ff-only 2>/dev/null; then
  ok "Репозиторий обновлён."
else
  warn "ff-обновление не удалось (локальные правки) — сбрасываю на origin/main."
  git fetch --all -q 2>/dev/null || true
  git reset --hard origin/main 2>/dev/null || git reset --hard HEAD
  ok "Код сброшен к последней версии. (файл .env сохранён)"
fi

step "2/3 — Зависимости и продакшн-сборка"
info "node: $(node --version 2>/dev/null || echo 'нет') · npm: $(npm --version 2>/dev/null || echo 'нет')"
info "Установка зависимостей (npm ci)..."
npm ci --no-audit --no-fund 2>/dev/null || npm install --no-audit --no-fund
info "Продакшн-сборка (vite + esbuild)..."
npm run build
ok "Сборка завершена."

NEW_VERSION="$(grep -m1 '"version"' "$INSTALL_DIR/package.json" 2>/dev/null | sed 's/[^0-9.]*//g' || echo '?')"

step "3/3 — Перезапуск службы"
PORT="$(grep -E '^PORT=' "$INSTALL_DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '[:space:]' || echo 3000)"
if [[ "$HAS_SYSTEMD" == "1" ]]; then
  systemctl daemon-reload
  systemctl enable "$SERVICE" >/dev/null 2>&1 || true
  systemctl restart "$SERVICE"
  ok "Служба $SERVICE перезапущена."
else
  warn "systemd не найден — перезапустите вручную:"
  info "  kill \$(pgrep -f 'node dist/server.js') 2>/dev/null; cd $INSTALL_DIR && NODE_ENV=production PORT=$PORT node dist/server.js"
fi

echo
if [[ "$OLD_VERSION" != "$NEW_VERSION" ]]; then
  ok "Fixcat OS Manager обновлён: $OLD_VERSION → $NEW_VERSION"
else
  ok "Fixcat OS Manager уже актуален: v$NEW_VERSION"
fi
echo -e "   🌐 Панель:         http://<server-ip>:$PORT"
echo -e "   📜 Логи:           journalctl -u $SERVICE -f"
echo