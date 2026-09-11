import React, { useState, useEffect } from 'react';
import {
  Package,
  Download,
  Copy,
  Check,
  Terminal,
  ShieldCheck,
  Cpu,
  Server,
  Code2,
  FileText,
  Zap,
  HardDrive,
  RefreshCw,
  ExternalLink,
  Layers,
  Sparkles,
} from 'lucide-react';

interface DiagnosticResult {
  os: string;
  kernel: string;
  nodeVersion: string;
  dockerActive: boolean;
  dockerSocketPath: string;
  gpuDetected: boolean;
  gpuCount: number;
  gpuModels: string[];
  vramTotalGb: number;
  memoryTotalGb: number;
  memoryFreeGb: number;
  port3000Free: boolean;
  port1234Free: boolean;
  readyForInstallation: boolean;
}

export const InstallerExportView: React.FC = () => {
  const [activeFileTab, setActiveFileTab] = useState<'install.sh' | 'docker-compose.yml' | 'Dockerfile' | 'fixcat.service' | 'install.ps1' | 'manifest.json'>('install.sh');
  const [copied, setCopied] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticResult | null>(null);
  const [loadingDiagnostics, setLoadingDiagnostics] = useState<boolean>(false);

  const hostIp = window.location.hostname || 'localhost';

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2500);
  };

  const runDiagnostics = async () => {
    setLoadingDiagnostics(true);
    try {
      const res = await fetch('/api/installer/check-requirements');
      if (res.ok) {
        const data = await res.json();
        setDiagnostics(data);
      }
    } catch {
      // Diagnostic error
    } finally {
      setLoadingDiagnostics(false);
    }
  };

  useEffect(() => {
    runDiagnostics();
  }, []);

  // Installation Files content
  const installShContent = `#!/usr/bin/env bgash
# ==============================================================================
# Fixcat OS Manager - Automated System Installer & Daemon Setup
# Target Platform: Ubuntu 20.04+, Debian 11+, RHEL/CentOS 9+, Arch Linux
# ==============================================================================

set -e

echo "=== [Fixcat OS Manager] Запуск автоматической установки системы ==="

# 1. Проверка прав root
if [ "$EUID" -ne 0 ]; then
  echo "❌ Ошибка: Скрипт установки должен быть запущен с правами root (sudo)."
  exit 1
fi

# 2. Обновление пакетов и установка зависимостей
echo "📦 [1/6] Обновление системных пакетов и установка curl, git, build-essential..."
apt-get update -y && apt-get install -y curl git build-essential ca-certificates gnupg lsb-release

# 3. Установка Docker и Docker Compose (если отсутствуют)
if ! command -v docker &> /dev/null; then
  echo "🐳 [2/6] Установка Docker Engine..."
  curl -fsSL https://get.docker.com -o get-docker.sh
  sh get-docker.sh
  systemctl enable --now docker
else
  echo "✅ Docker уже установлен на хосте."
fi

# 4. Проверка и установка NVIDIA Container Toolkit (для GPU acceleration / )
if command -v nvidia-smi &> /dev/null; then
  echo "🚀 [3/6] Обнаружен NVIDIA GPU! Настройка NVIDIA Container Toolkit..."
  curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg || true
  curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \\
    sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \\
    tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
  apt-get update -y && apt-get install -y nvidia-container-toolkit || true
  nvidia-ctk runtime configure --runtime=docker || true
  systemctl restart docker
fi

# 5. Установка Node.js LTS (v20+)
if ! command -v node &> /dev/null; then
  echo "🟢 [4/6] Установка Node.js v20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

# 6. Развертывание приложения Fixcat OS Manager
INSTALL_DIR="/opt/fixcat-os-manager"
echo "📁 [5/6] Подготовка директории \${INSTALL_DIR}..."
mkdir -p \${INSTALL_DIR}/data

cat << 'EOF' > \${INSTALL_DIR}/docker-compose.yml
version: '3.8'
services:
  fixcat-manager:
    image: fixcat/os-manager:latest
    container_name: fixcat-os-manager
    restart: always
    ports:
      - "3000:3000"
      - "1234:1234"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./data:/app/data
    environment:
      - NODE_ENV=production
      - PORT=3000
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
EOF

# 7. Создание системной службы systemd
echo "⚙️ [6/6] Создание системного демона systemd (/etc/systemd/system/fixcat.service)..."
cat << EOF > /etc/systemd/system/fixcat.service
[Unit]
Description=Fixcat OS Manager - Container &  Control Panel
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
WorkingDirectory=\${INSTALL_DIR}
ExecStart=/usr/bin/docker compose up
ExecStop=/usr/bin/docker compose down
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable fixcat.service

echo ""
echo "=========================================================================="
echo "🎉 Установка Fixcat OS Manager успешно завершена!"
echo "🌐 Панель доступна по адресу: http://$(hostname -I | awk '{print $1}'):3000"
echo "🤖  OpenAI Proxy: http://$(hostname -I | awk '{print $1}'):1234/v1"
echo "=========================================================================="
`;

  const dockerComposeContent = `version: '3.8'

services:
  fixcat-os-manager:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: fixcat-os-manager
    restart: unless-stopped
    ports:
      - "3000:3000"  # Web Control Panel & noVNC
      - "1234:1234"  #  OpenAI-Compatible API Proxy
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock  # Direct Docker Host Management
      - ./data:/app/data                            # Persistent User Database
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DOCKER_SOCKET=/var/run/docker.sock
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu, compute, utility]
`;

  const dockerfileContent = `FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package*.json ./
RUN npm ci

# Copy source files and build production bundle
COPY . .
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

# Production environment
ENV NODE_ENV=production
ENV PORT=3000

# Install runtime utilities (curl, procps)
RUN apk add --no-舆-cache curl procps

# Copy built artifacts from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

# Ensure data directory exists for persistent sqlite/json auth
RUN mkdir -p /app/data

EXPOSE 3000 1234

CMD ["node", "dist/server.js"]
`;

  const serviceContent = `[Unit]
Description=Fixcat OS Manager Service
Documentation=https://github.com/fixcat/os-manager
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/fixcat-os-manager
ExecStart=/usr/bin/node /opt/fixcat-os-manager/dist/server.js
ExecReload=/bin/kill -HUP $MAINPID
Restart=always
RestartSec=3s
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
`;

  const ps1Content = `# Fixcat OS Manager - Windows PowerShell Automated Setup Script
# Requires: PowerShell 5.1+, Windows 10/11 or Server 2022 with Docker Desktop & WSL2

Write-Host "=== Fixcat OS Manager - Подготовка к запуск на Windows ===" -ForegroundColor Cyan

# 1. Проверка прав администратора
$IsAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $IsAdmin) {
    Write-Host "❌ Ошибка: Запустите PowerShell от имени Администратора!" -ForegroundColor Red
    exit 1
}

# 2. Проверка Docker Desktop
if (-not (Get-Command "docker" -ErrorAction SilentlyContinue)) {
    Write-Host "⚠️ Docker Engine не найден. Установите Docker Desktop с поддержкой WSL2." -ForegroundColor Yellow
} else {
    Write-Host "✅ Docker Engine найден." -ForegroundColor Green
}

# 3. Клонирование и сборка
$TargetDir = "C:\\FixcatOSManager"
if (-not (Test-Path $TargetDir)) {
    New-Item -ItemType Directory -Path $TargetDir | Out-Null
}

Set-Location $TargetDir
Write-Host "📦 Создание локальных папок базы данных и конфигурации..." -ForegroundColor Cyan
New-Item -ItemType Directory -Path "$TargetDir\\data" -Force | Out-Null

Write-Host "🚀 Запуск через Docker Desktop..." -ForegroundColor Cyan
docker run -d --name fixcat-os-manager -p 3000:3000 -p 1234:1234 -v //var/run/docker.sock:/var/run/docker.sock -v "$TargetDir/data:/app/data" fixcat/os-manager:latest

Write-Host "🎉 Готово! Панель открывается по адресу http://localhost:3000" -ForegroundColor Green
`;

  const manifestContent = `{
  "app": {
    "id": "fixcat-os-manager",
    "name": "Fixcat OS Manager",
    "version": "2.5.0",
    "description": "Панель управления операционными системами Docker, noVNC веб-рабочими столами и локальными нейросетями ( /  Proxy)",
    "license": "MIT",
    "author": "Fixcat Dev Team"
  },
  "runtime": {
    "platform": "Node.js 20 LTS",
    "framework": "Express + Vite (TypeScript)",
    "entryPoint": "server.ts",
    "builtServer": "dist/server.js",
    "defaultPort": 3000,
    "ProxyPort": 1234
  },
  "dependencies": {
    "system": ["Docker Engine 24+", "NVIDIA Container Toolkit (Optional for GPU)", "Node.js 20+"],
    "ports": [
      { "port": 3000, "protocol": "TCP", "description": "Web GUI Control Panel & noVNC proxy" },
      { "port": 1234, "protocol": "TCP", "description": "OpenAI-Compatible  Proxy API" },
      { "port": 6082, "protocol": "TCP", "description": "Auto-allocated noVNC container desktop port" }
    ],
    "volumes": [
      { "host": "/var/run/docker.sock", "container": "/var/run/docker.sock", "mode": "rw" },
      { "host": "./data", "container": "/app/data", "mode": "rw" }
    ]
  },
  "components": [
    { "name": "DashboardView", "description": "Дашборд хоста: CPU, RAM, Multi-GPU, списки ОС" },
    { "name": "ContainersView", "description": "Управление контейнерами Docker, порты, логи, старт/стоп" },
    { "name": "ResourceMonitorView", "description": "Мониторинг NVIDIA CUDA GPU (0 & 1), VRAM, температура, питание" },
    { "name": "NoVncFullView", "description": "Встроенный полноэкранный клиенты noVNC веб-рабочих столов" },
    { "name": "OnDeviceAiView", "description": "Менеджер локальных нейросетей , вызов API, скачивание моделей" },
    { "name": "SettingsView", "description": "Настройки сокета Docker, TCP Host, конфигурация сети" }
  ],
  "supportedOS": [
    "Ubuntu Desktop (dorowu/ubuntu-desktop-lxde-vnc)",
    "Windows XP (dockur/windows:xp)",
    "Debian XFCE (lscr.io/linuxserver/webtop:debian-xfce)",
    "Kali Linux (lscr.io/linuxserver/webtop:kali-xfce)",
    "Alpine Linux (lscr.io/linuxserver/webtop:alpine-xfce)"
  ]
}`;

  const getFileContent = () => {
    switch (activeFileTab) {
      case 'install.sh': return installShContent;
      case 'docker-compose.yml': return dockerComposeContent;
      case 'Dockerfile': return dockerfileContent;
      case 'fixcat.service': return serviceContent;
      case 'install.ps1': return ps1Content;
      case 'manifest.json': return manifestContent;
      default: return installShContent;
    }
  };

  const currentScriptContent = getFileContent();

  const oneLinerCommand = `curl -fsSL http://${hostIp}:3000/api/installer/script | sudo bash`;

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-blue-950/80 via-slate-900 to-indigo-950/80 border border-blue-500/30 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <Package className="w-48 h-48 text-blue-400" />
        </div>

        <div className="relative z-10 space-y-3 max-w-3xl">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            <span>Подготовка к сборке установщика в другом ИИ</span>
          </div>

          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            Комплект автономного установщика и сборки (Installer &amp; Export Kit)
          </h1>

          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Здесь собраны все необходимые модули, манифесты и автоскрипты для того, чтобы в другом ИИ (ChatGPT, Claude, Cursor) или сборщике (Inno Setup, Electron, PyInstaller) сделать полноценный установщик <b>Fixcat OS Manager</b> со всеми компонентами.
          </p>

          <div className="pt-2 flex flex-wrap gap-3">
            <a
              href="/api/installer/export-kit"
              download="fixcat-installer-kit.json"
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-blue-600/30 transition-all cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Скачать полный манифест (JSON)</span>
            </a>

            <button
              onClick={() => copyToClipboard(JSON.stringify(JSON.parse(manifestContent), null, 2), 'manifest')}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center gap-2 border border-slate-700 transition-all cursor-pointer"
            >
              {copied === 'manifest' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>Скопировать ТЗ для другого ИИ</span>
            </button>
          </div>
        </div>
      </div>

      {/* Instant 1-Line Command Section */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Terminal className="w-5 h-5 text-emerald-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Команда быстрой установки в 1 клик (Linux Bash)
            </h2>
          </div>
          <span className="text-xs text-slate-400 font-mono">Ubuntu / Debian / CentOS</span>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3 font-mono text-xs">
          <code className="text-emerald-400 truncate select-all">{oneLinerCommand}</code>
          <button
            onClick={() => copyToClipboard(oneLinerCommand, 'oneliner')}
            className="px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 font-semibold shrink-0 border border-emerald-500/20 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            {copied === 'oneliner' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied === 'oneliner' ? 'Скопировано!' : 'Копировать'}</span>
          </button>
        </div>
      </div>

      {/* Diagnostics Check */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              <span>Диагностика готовности текущей системы к установке</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Проверка компонентов, сокета Docker, ускорителей NVIDIA CUDA и свободных портов
            </p>
          </div>

          <button
            onClick={runDiagnostics}
            disabled={loadingDiagnostics}
            className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingDiagnostics ? 'animate-spin text-cyan-400' : ''}`} />
            <span>Перепроверить</span>
          </button>
        </div>

        {diagnostics && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {/* Docker Status */}
            <div className={`p-3.5 rounded-xl border flex items-center justify-between ${
              diagnostics.dockerActive
                ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
                : 'bg-amber-950/20 border-amber-500/30 text-amber-200'
            }`}>
              <div>
                <div className="font-semibold text-white">Docker Daemon</div>
                <div className="text-[11px] opacity-80 mt-0.5">{diagnostics.dockerSocketPath}</div>
              </div>
              <span className={`px-2 py-0.5 rounded font-mono font-bold ${
                diagnostics.dockerActive ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
              }`}>
                {diagnostics.dockerActive ? 'АКТИВЕН' : 'НЕТ СОКЕТА'}
              </span>
            </div>

            {/* GPU CUDA Status */}
            <div className={`p-3.5 rounded-xl border flex items-center justify-between ${
              diagnostics.gpuDetected
                ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
                : 'bg-slate-950 border-slate-800 text-slate-400'
            }`}>
              <div>
                <div className="font-semibold text-white">NVIDIA GPU &amp; CUDA</div>
                <div className="text-[11px] opacity-80 mt-0.5">{diagnostics.gpuCount} Ускорителя ({diagnostics.vramTotalGb} GB VRAM)</div>
              </div>
              <span className={`px-2 py-0.5 rounded font-mono font-bold ${
                diagnostics.gpuDetected ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'
              }`}>
                {diagnostics.gpuDetected ? 'ОБНАРУЖЕН' : 'ОТСУТСТВУЕТ'}
              </span>
            </div>

            {/* Node & Memory */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div>
                <div className="font-semibold text-white">Память RAM</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{diagnostics.memoryFreeGb} GB свободно из {diagnostics.memoryTotalGb} GB</div>
              </div>
              <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 font-mono font-bold">
                OK
              </span>
            </div>

            {/* Ports status */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div>
                <div className="font-semibold text-white">Порты 3000 &amp; 1234</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Порт 3000 (Панель) / 1234 (AI)</div>
              </div>
              <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 font-mono font-bold">
                ГОТОВЫ
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Tabs for Installation Files View */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <Code2 className="w-5 h-5 text-blue-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Исходный код компонентов установщика
            </h2>
          </div>

          <button
            onClick={() => copyToClipboard(currentScriptContent, activeFileTab)}
            className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm shadow-blue-600/20 transition-all cursor-pointer self-start sm:self-auto"
          >
            {copied === activeFileTab ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied === activeFileTab ? 'Скопировано!' : 'Скопировать текущий файл'}</span>
          </button>
        </div>

        {/* File Tabs Header */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 text-xs">
          {[
            { id: 'install.sh', label: 'install.sh (Linux Script)', icon: Terminal },
            { id: 'docker-compose.yml', label: 'docker-compose.yml', icon: Layers },
            { id: 'Dockerfile', label: 'Dockerfile', icon: Server },
            { id: 'fixcat.service', label: 'fixcat.service (systemd)', icon: Zap },
            { id: 'install.ps1', label: 'install.ps1 (Windows)', icon: FileText },
            { id: 'manifest.json', label: 'manifest.json (AI Schema)', icon: Code2 },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeFileTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveFileTab(tab.id as any)}
                className={`px-3 py-2 rounded-xl font-medium transition-all flex items-center space-x-2 shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/20'
                    : 'bg-slate-950 text-slate-400 hover:bg-slate-800 hover:text-white border border-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Code View Canvas */}
        <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
          <pre className="p-4 text-xs font-mono text-slate-300 overflow-x-auto max-h-[420px] leading-relaxed select-all">
            {currentScriptContent}
          </pre>
        </div>
      </div>

      {/* Guide for other AI Prompting */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>Инструкция для создания установщика в другом ИИ (ChatGPT / Claude / Cursor)</span>
        </h3>

        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-2 leading-relaxed">
          <p>
            <b>Шаг 1:</b> Нажмите кнопку <b>«Скопировать ТЗ для другого ИИ»</b> вверху этой страницы (она скопирует полный структурированный JSON-манифест проекта).
          </p>
          <p>
            <b>Шаг 2:</b> Откройте диалог с другим ИИ и отправьте ему такой промпт:
          </p>
          <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 font-mono text-emerald-300 text-[11px] select-all">
            "Вот структурированный манифест моей веб-панели управления Fixcat OS Manager: [вставьте скопированный JSON]. Помоги мне сделать полноценный установочный дистрибутив (Inno Setup / Electron GUI wrapper / Python GUI installer / Debian deb-пакет) со встроенной проверкой зависимостей Docker и NVIDIA GPU."
          </div>
          <p className="text-slate-400 pt-1">
            Другой ИИ мгновенно поймет архитектуру панелей, зависимости портов, пути к базе данных `/data/users.json` и сгенерирует готовый `setup.exe` или `.deb` пакет.
          </p>
        </div>
      </div>
    </div>
  );
};
