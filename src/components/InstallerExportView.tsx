import React, { useState, useEffect, useRef } from 'react';
import {
  Package,
  Download,
  Copy,
  Check,
  Terminal,
  ShieldCheck,
  Server,
  Code2,
  FileText,
  Zap,
  RefreshCw,
  Layers,
  Sparkles,
  Play,
  Square,
  Loader2,
  CheckCircle2,
  XCircle,
  Minus,
  HardDrive,
  AlertTriangle,
  Boxes,
  Globe,
  Settings,
  ListChecks,
  Plus,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types (mirror /api/installer/status)
// ---------------------------------------------------------------------------

type StepStatus = 'pending' | 'running' | 'done' | 'skipped' | 'warn' | 'error';
type LogLevel = 'info' | 'succ' | 'warn' | 'err' | 'cmd' | 'out';

interface InstallerStep {
  id: string;
  title: string;
  status: StepStatus;
  detail?: string;
}

interface InstallerLog {
  t: string;
  level: LogLevel;
  msg: string;
}

interface InstallerStatus {
  status: 'idle' | 'running' | 'done' | 'stopped';
  currentStep: number;
  totalSteps: number;
  steps: InstallerStep[];
  logs: InstallerLog[];
  startedAt: string | null;
  finishedAt: string | null;
  config: any;
  error: string | null;
}

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
  readyForInstallation: boolean;
}

const IDLE_STATUS: InstallerStatus = {
  status: 'idle',
  currentStep: 0,
  totalSteps: 0,
  steps: [],
  logs: [],
  startedAt: null,
  finishedAt: null,
  config: null,
  error: null,
};

const IMAGE_MODULES = [
  { id: 'os:ubuntu', label: 'Ubuntu 22.04', image: 'dorowu/ubuntu-desktop-lxde-vnc' },
  { id: 'os:debian', label: 'Debian 12 XFCE', image: 'ghcr.io/linuxserver/webtop:debian-xfce' },
  { id: 'os:kali', label: 'Kali Linux GUI', image: 'kasmweb/kali-rolling-desktop:1.16.0' },
  { id: 'os:alpine', label: 'Alpine Light', image: 'ghcr.io/linuxserver/webtop:alpine-kde' },
  { id: 'os:windows-xp', label: 'Windows XP', image: 'dockur/windows:xp' },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const StepIcon: React.FC<{ status: StepStatus }> = ({ status }) => {
  switch (status) {
    case 'running':
      return <Loader2 className="w-4 h-4 text-blue-400 animate-spin shrink-0" />;
    case 'done':
      return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />;
    case 'error':
      return <XCircle className="w-4 h-4 text-rose-400 shrink-0" />;
    case 'warn':
      return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
    case 'skipped':
      return <Minus className="w-4 h-4 text-slate-500 shrink-0" />;
    default:
      return <span className="w-4 h-4 rounded-full border border-slate-600 shrink-0" />;
  }
};

const logColor = (level: LogLevel): string => {
  switch (level) {
    case 'succ': return 'text-emerald-400';
    case 'err': return 'text-rose-400';
    case 'warn': return 'text-amber-300';
    case 'cmd': return 'text-blue-300 font-semibold';
    case 'info': return 'text-slate-200';
    default: return 'text-slate-400';
  }
};

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export const InstallerExportView: React.FC = () => {
  // Installer live state
  const [installer, setInstaller] = useState<InstallerStatus>(IDLE_STATUS);
  const [connected, setConnected] = useState(false);

  // Config form
  const [port, setPort] = useState<string>(String(window.location.port || '3000'));
  const [installDir, setInstallDir] = useState('/opt/fixcat-os-manager');
  const [dataDir, setDataDir] = useState('/opt/fixcat-os-manager/data');
  const [installDocker, setInstallDocker] = useState(true);
  const [installNode, setInstallNode] = useState(true);
  const [installNvidia, setInstallNvidia] = useState(true);
  const [preloadModules, setPreloadModules] = useState<Set<string>>(
    () => new Set(IMAGE_MODULES.map((m) => m.id))
  );
  const [dryRun, setDryRun] = useState(true);
  const [starting, setStarting] = useState(false);
  const [scanPort, setScanPort] = useState(false);

  // Export kit
  const [activeFileTab, setActiveFileTab] = useState('install.sh');
  const [copied, setCopied] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticResult | null>(null);
  const [loadingDiagnostics, setLoadingDiagnostics] = useState(false);

  const termRef = useRef<HTMLDivElement>(null);

  const hostIp = window.location.hostname || 'localhost';
  const oneLinerCommand = `curl -fsSL http://${hostIp}${window.location.port ? ':' + window.location.port : ''}/api/installer/script | sudo bash`;

  // -------------------------------------------------------------------------
  // SSE live stream
  // -------------------------------------------------------------------------
  useEffect(() => {
    const es = new EventSource('/api/installer/stream');
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.onmessage = (event) => {
      try {
        const ev = JSON.parse(event.data);
        if (ev.type !== 'installer') return;
        const p = ev.payload || {};
        if (p.type === 'snapshot') {
          setInstaller((prev) => ({
            ...prev,
            status: p.status,
            currentStep: p.currentStep,
            totalSteps: p.totalSteps,
            steps: p.steps || [],
            logs: p.logs || [],
            startedAt: p.startedAt,
            finishedAt: p.finishedAt,
            config: p.config,
          }));
        } else if (p.type === 'log') {
          setInstaller((prev) => ({
            ...prev,
            logs: [...prev.logs, { t: p.t, level: p.level, msg: p.msg }].slice(-400),
          }));
        } else if (p.type === 'step') {
          setInstaller((prev) => ({
            ...prev,
            steps: prev.steps.map((s) =>
              s.id === p.id ? { ...s, status: p.status, detail: p.detail } : s
            ),
          }));
        } else if (p.type === 'status') {
          setInstaller((prev) => ({
            ...prev,
            status: p.status,
            currentStep: p.currentStep,
            totalSteps: p.totalSteps,
          }));
        } else if (p.type === 'start') {
          setInstaller((prev) => ({
            ...prev,
            status: 'running',
            currentStep: 0,
            startedAt: new Date().toISOString(),
          }));
        } else if (p.type === 'final') {
          setInstaller((prev) => ({ ...prev, status: p.status }));
        }
      } catch {
        // bad json, ignore
      }
    };

    return () => es.close();
  }, []);

  // Auto-scroll terminal
  useEffect(() => {
    if (termRef.current) {
      termRef.current.scrollTop = termRef.current.scrollHeight;
    }
  }, [installer.logs]);

  const running = installer.status === 'running';

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2500);
  };

  const runDiagnostics = async () => {
    setLoadingDiagnostics(true);
    try {
      const res = await fetch('/api/installer/check-requirements');
      if (res.ok) setDiagnostics(await res.json());
    } catch {
      // ignore
    } finally {
      setLoadingDiagnostics(false);
    }
  };

  useEffect(() => {
    runDiagnostics();
  }, []);

  const scanFreePort = async () => {
    setScanPort(true);
    try {
      const res = await fetch(`/api/ports/next?desired=${parseInt(port, 10) || 3000}`);
      if (res.ok) {
        const data = await res.json();
        if (data.freePort) setPort(String(data.freePort));
      }
    } catch {
      // ignore
    } finally {
      setScanPort(false);
    }
  };

  const toggleModule = (id: string) => {
    setPreloadModules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startInstall = async () => {
    setStarting(true);
    try {
      const res = await fetch('/api/installer/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          port: parseInt(port, 10) || 3000,
          installDir,
          dataDir,
          installDocker,
          installNode,
          installNvidia,
          preloadModules: Array.from(preloadModules),
          dryRun,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Не удалось запустить установку');
      }
    } catch {
      alert('Ошибка сетевого запроса');
    } finally {
      setStarting(false);
    }
  };

  const stopInstall = async () => {
    await fetch('/api/installer/stop', { method: 'POST' }).catch(() => {});
  };

  // Export kit file contents
  const installShContent = `#!/usr/bin/env bash
# ==============================================================================
# Fixcat OS Manager — профессиональный установщик
# Этот файл скачивается командой: curl -fsSL <host>/api/installer/script
# Интерактивный режим, автовыбор порта, установка Docker/Node/NVIDIA,
# предзагрузка модулей (образов ОС), сборка панели и systemd-служба.
#
# Запуск:  sudo bash fixcat-install.sh
# Параметры: --port 8080 | --dir /opt/fixcat | --yes | --dry-run
# ==============================================================================
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
      - "3000:3000"       # Веб-панель и noVNC
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock   # Управление Docker хоста
      - ./data:/app/data                             # База данных / конфигурация
    environment:
      - NODE_ENV=production
      - PORT=3000
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu, compute, utility]
`;

  const dockerfileContent = `FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json bun.lock* package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

COPY . .
RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN apk add --no-cache curl procps

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "dist/server.js"]
`;

  const serviceContent = `[Unit]
Description=Fixcat OS Manager Service
Documentation=https://github.com/fixcat-offical/Fixcat-OS-Manager
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/fixcat-os-manager
Environment=PORT=3000
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /opt/fixcat-os-manager/dist/server.js
ExecReload=/bin/kill -HUP $MAINPID
Restart=always
RestartSec=3
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
`;

  const ps1Content = `# Fixcat OS Manager - PowerShell подготовка (Windows + Docker Desktop + WSL2)
# Требуется: PowerShell 5.1+, Windows 10/11

Write-Host "=== Fixcat OS Manager - Windows Setup ===" -ForegroundColor Cyan

$IsAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $IsAdmin) {
    Write-Host "Запустите PowerShell от имени Администратора!" -ForegroundColor Red
    exit 1
}

if (-not (Get-Command "docker" -ErrorAction SilentlyContinue)) {
    Write-Host "Docker Engine не найден. Установите Docker Desktop с WSL2." -ForegroundColor Yellow
} else {
    Write-Host "Docker Engine найден." -ForegroundColor Green
}

$TargetDir = "C:\\FixcatOSManager"
New-Item -ItemType Directory -Path "$TargetDir\\data" -Force | Out-Null

docker run -d --name fixcat-os-manager -p 3000:3000 -v //var/run/docker.sock:/var/run/docker.sock -v "$TargetDir/data:/app/data" fixcat/os-manager:latest

Write-Host "Готово! Панель: http://localhost:3000" -ForegroundColor Green
`;

  const manifestContent = `{
  "app": {
    "id": "fixcat-os-manager",
    "name": "Fixcat OS Manager",
    "version": "2.6.0",
    "description": "Панель управления операционными системами Docker, noVNC веб-рабочими столами, контейнерами и встроенным пошаговым установщиком",
    "license": "MIT",
    "author": "Fixcat Dev Team"
  },
  "runtime": {
    "platform": "Node.js 20+ LTS",
    "framework": "Express + Vite (TypeScript)",
    "entryPoint": "server.ts",
    "builtServer": "dist/server.js",
    "defaultPort": 3000,
    "configPort": "создаётся установщиком (systemd-юнит / .env PORT)"
  },
  "installer": {
    "endpoint": "/api/installer/script",
    "stream": "/api/installer/stream (SSE)",
    "status": "/api/installer/status",
    "modules": "/api/modules",
    "mode": "интерактивный выбор порта/директории, установка Docker/Node/NVIDIA, предзагрузка ОС-модулей, systemd"
  },
  "dependencies": {
    "system": ["Docker Engine 24+", "NVIDIA Container Toolkit (Optional for GPU)", "Node.js 18+"],
    "ports": [
      { "port": 3000, "protocol": "TCP", "description": "Web GUI Control Panel & noVNC proxy" }
    ]
  },
  "components": [
    { "name": "InstallerEngine", "description": "Пошаговый установщик с streaming-логами (SSE)" },
    { "name": "ModulesStore", "description": "Каталог модулей: ОС-образы и системные компоненты" },
    { "name": "DashboardView", "description": "Дашборд хоста: CPU, RAM, Multi-GPU, списки ОС" },
    { "name": "ContainersView", "description": "Управление контейнерами Docker, порты, логи, старт/стоп" }
  ],
  "supportedOS": [
    "Ubuntu Desktop (dorowu/ubuntu-desktop-lxde-vnc)",
    "Windows XP (dockur/windows:xp)",
    "Debian XFCE (ghcr.io/linuxserver/webtop:debian-xfce)",
    "Kali Linux (kasmweb/kali-rolling-desktop:1.16.0)",
    "Alpine Linux (ghcr.io/linuxserver/webtop:alpine-kde)"
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

  const fileTabs = [
    { id: 'install.sh', label: 'install.sh (Linux)', icon: Terminal },
    { id: 'docker-compose.yml', label: 'docker-compose.yml', icon: Layers },
    { id: 'Dockerfile', label: 'Dockerfile', icon: Server },
    { id: 'fixcat.service', label: 'fixcat.service', icon: Zap },
    { id: 'install.ps1', label: 'install.ps1 (Win)', icon: FileText },
    { id: 'manifest.json', label: 'manifest.json', icon: Code2 },
  ];

  const progressPercent =
    installer.totalSteps > 0
      ? Math.round((installer.currentStep / installer.totalSteps) * 100)
      : 0;

  const toggle = (label: string, value: boolean, set: (v: boolean) => void, disabled: boolean) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => set(!value)}
      className={`px-3 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 ${
        value
          ? 'bg-blue-600/20 border-blue-500/40 text-blue-200'
          : 'bg-slate-950 border-slate-700 text-slate-400 hover:border-slate-600'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${value ? 'bg-blue-400' : 'bg-slate-600'}`} />
      {label}
    </button>
  );

  return (
    <div className="space-y-6 pb-12">
      {/* ================= LIVE INSTALLER ================= */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-blue-950/80 via-slate-900 to-indigo-950/80 border border-blue-500/30 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <Package className="w-48 h-48 text-blue-400" />
        </div>

        <div className="relative z-10 space-y-3 max-w-3xl">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs font-semibold">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Установщик Fixcat OS Manager</span>
            <span className="flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
              <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
              {connected ? 'SSE connected' : 'SSE offline'}
            </span>
          </div>

          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            Установщик Fixcat OS Manager
          </h1>

          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Пошаговая установка: свой порт, своя директория, установка
            Docker / Node.js / NVIDIA Toolkit, предзагрузка ОС-модулей,
            продакшн-сборка панели и автозапуск systemd. Все шаги выполняются на этом
            сервере с живым логом прямо в браузере.
          </p>
        </div>
      </div>

      {/* Config */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Settings className="w-4 h-4 text-cyan-400" />
            <span>Настройки установки</span>
          </h2>
          <span className={`text-[11px] font-mono px-2.5 py-1 rounded-full border ${
            installer.status === 'running'
              ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
              : installer.status === 'done'
              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
              : installer.status === 'stopped'
              ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
              : 'bg-slate-800 text-slate-400 border-slate-700'
          }`}>
            {installer.status === 'running' ? 'ВЫПОЛНЯЕТСЯ' : installer.status === 'done' ? 'ГОТОВО' : installer.status === 'stopped' ? 'ОСТАНОВЛЕНА' : 'ОЖИДАНИЕ'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Port */}
          <div>
            <label className="text-slate-400 text-xs mb-1 block flex items-center justify-between">
              <span className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5 text-cyan-400" /> Порт веб-панели:</span>
              {scanPort && <Loader2 className="w-3 h-3 animate-spin text-blue-400" />}
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                min={1024}
                max={65535}
                value={port}
                disabled={running}
                onChange={(e) => setPort(e.target.value)}
                className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:border-blue-500 focus:outline-none font-mono text-sm disabled:opacity-50"
              />
              <button
                type="button"
                disabled={running || scanPort}
                onClick={scanFreePort}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold border border-slate-700 cursor-pointer disabled:opacity-50"
              >
                Авто
              </button>
            </div>
          </div>

          {/* Install dir */}
          <div>
            <label className="text-slate-400 text-xs mb-1 block flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-cyan-400" /> Каталог установки:
            </label>
            <input
              type="text"
              value={installDir}
              disabled={running}
              onChange={(e) => setInstallDir(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:border-blue-500 focus:outline-none font-mono text-sm disabled:opacity-50"
            />
          </div>

          {/* Data dir */}
          <div>
            <label className="text-slate-400 text-xs mb-1 block flex items-center gap-1.5">
              <Boxes className="w-3.5 h-3.5 text-cyan-400" /> Каталог данных:
            </label>
            <input
              type="text"
              value={dataDir}
              disabled={running}
              onChange={(e) => setDataDir(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:border-blue-500 focus:outline-none font-mono text-sm disabled:opacity-50"
            />
          </div>
        </div>

        {/* Component toggles */}
        <div>
          <label className="text-slate-400 text-xs mb-1.5 block">Компоненты для установки:</label>
          <div className="flex flex-wrap gap-2">
            {toggle('Docker Engine', installDocker, setInstallDocker, running)}
            {toggle('Node.js LTS', installNode, setInstallNode, running)}
            {toggle('NVIDIA Toolkit', installNvidia, setInstallNvidia, running)}
            {toggle('🛡 Dry-run (тест)', dryRun, setDryRun, running)}
          </div>
        </div>

        {/* Module preload */}
        <div>
          <label className="text-slate-400 text-xs mb-1.5 block">
            Модули для предзагрузки (образы ОС — появятся в разделе «Модули»):
          </label>
          <div className="flex flex-wrap gap-2">
            {IMAGE_MODULES.map((m) => {
              const on = preloadModules.has(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={running}
                  onClick={() => toggleModule(m.id)}
                  className={`px-3 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 ${
                    on
                      ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-200'
                      : 'bg-slate-950 border-slate-700 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  {on ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                  {m.label}
                  <span className="opacity-60 font-mono text-[10px]">{m.image}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Actions + progress */}
        <div className="flex items-center justify-between flex-wrap gap-3 pt-2 border-t border-slate-800">
          <div className="flex items-center gap-3 flex-wrap">
            {installer.status === 'running' ? (
              <button
                onClick={stopInstall}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-lg shadow-rose-600/25 flex items-center gap-2 cursor-pointer"
              >
                <Square className="w-4 h-4" />
                Остановить
              </button>
            ) : (
              <button
                onClick={startInstall}
                disabled={starting}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/25 flex items-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {installer.status === 'done' ? 'Запустить заново' : 'Запустить установку'}
              </button>
            )}

            {installer.totalSteps > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-40 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      installer.status === 'done' ? 'bg-emerald-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <span className="text-[11px] text-slate-400 font-mono">
                  {installer.currentStep}/{installer.totalSteps}
                </span>
              </div>
            )}
          </div>

          {dryRun && installer.status === 'idle' && (
            <span className="text-[10px] text-amber-300/80 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Режим dry-run: команды выводятся в лог, но не выполняются
            </span>
          )}
        </div>
      </div>

      {/* Progress: steps + terminal */}
      {(installer.logs.length > 0 || installer.status === 'running' || installer.status === 'done') && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Steps */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2.5 lg:col-span-1">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-1">
              <ListChecks className="w-4 h-4 text-blue-400" />
              <span>Шаги установки</span>
            </h2>
            {installer.steps.map((s, i) => (
              <div key={s.id} className="flex items-start gap-2.5">
                <StepIcon status={s.status} />
                <div className="min-w-0">
                  <div className="text-xs text-slate-200 font-medium">
                    <span className="text-slate-500 font-mono mr-1.5">{i + 1}.</span>
                    {s.title}
                  </div>
                  {s.detail && <div className="text-[10px] text-slate-500 truncate">{s.detail}</div>}
                </div>
              </div>
            ))}
          </div>

          {/* Terminal */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 lg:col-span-2 flex flex-col min-h-[280px]">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span>Живой лог установки</span>
              </h2>
              <button
                onClick={() => copyToClipboard(installer.logs.map((l) => `[${l.t}] ${l.msg}`).join('\n'), 'log')}
                className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 cursor-pointer"
              >
                {copied === 'log' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copied === 'log' ? 'Скопировано' : 'Скопировать лог'}
              </button>
            </div>
            <div
              ref={termRef}
              className="flex-1 rounded-xl bg-slate-950 border border-slate-800 p-3 font-mono text-[11px] leading-relaxed overflow-y-auto max-h-[420px]"
            >
              {installer.logs.length === 0 ? (
                <div className="text-slate-600 text-center py-10">
                  Лог появится после запуска установки
                </div>
              ) : (
                installer.logs.map((l, i) => (
                  <div key={i} className={`whitespace-pre-wrap break-all ${logColor(l.level)}`}>
                    <span className="text-slate-600">{l.t}</span>{' '}
                    {l.level === 'cmd' ? <span className="text-blue-300">$</span> : ''} {l.msg}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= INSTANT INSTALL COMMAND ================= */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Terminal className="w-5 h-5 text-emerald-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Установка на другой сервер в 1 команду (Linux Bash)
            </h2>
          </div>
          <a
            href="/api/installer/script"
            download="fixcat-install.sh"
            className="px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/20 flex items-center gap-1.5 transition-colors text-xs"
          >
            <Download className="w-3.5 h-3.5" />
            Скачать install.sh
          </a>
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

      {/* ================= DIAGNOSTICS ================= */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              <span>Диагностика сервера</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Проверка Docker, GPU NVIDIA, памяти и свободных портов
            </p>
          </div>
          <button
            onClick={runDiagnostics}
            disabled={loadingDiagnostics}
            className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingDiagnostics ? 'animate-spin text-cyan-400' : ''}`} />
            Перепроверить
          </button>
        </div>

        {diagnostics && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className={`p-3.5 rounded-xl border flex items-center justify-between ${
              diagnostics.dockerActive ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200' : 'bg-amber-950/20 border-amber-500/30 text-amber-200'
            }`}>
              <div>
                <div className="font-semibold text-white">Docker Daemon</div>
                <div className="text-[11px] opacity-80 mt-0.5">{diagnostics.dockerSocketPath}</div>
              </div>
              <span className={`px-2 py-0.5 rounded font-mono font-bold ${
                diagnostics.dockerActive ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
              }`}>
                {diagnostics.dockerActive ? 'АКТИВЕН' : 'НЕТ СИСТЕМЫ'}
              </span>
            </div>

            <div className={`p-3.5 rounded-xl border flex items-center justify-between ${
              diagnostics.gpuDetected ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200' : 'bg-slate-950 border-slate-800 text-slate-400'
            }`}>
              <div>
                <div className="font-semibold text-white">NVIDIA GPU & CUDA</div>
                <div className="text-[11px] opacity-80 mt-0.5">{diagnostics.gpuCount} GPU ({diagnostics.vramTotalGb} GB VRAM)</div>
              </div>
              <span className={`px-2 py-0.5 rounded font-mono font-bold ${
                diagnostics.gpuDetected ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'
              }`}>
                {diagnostics.gpuDetected ? 'ОБНАРУЖЕН' : 'ОТСУТСТВУЕТ'}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div>
                <div className="font-semibold text-white">Память RAM</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {diagnostics.memoryFreeGb} GB свободно из {diagnostics.memoryTotalGb} GB
                </div>
              </div>
              <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 font-mono font-bold">OK</span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div>
                <div className="font-semibold text-white">Node.js</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{diagnostics.nodeVersion} · {diagnostics.os}</div>
              </div>
              <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 font-mono font-bold">OK</span>
            </div>
          </div>
        )}
      </div>

      {/* ================= EXPORT KIT ================= */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <Code2 className="w-5 h-5 text-blue-400" />
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Исходные файлы для сборки установщика
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Манифесты и конфигурация для дистрибутивов / другого ИИ</p>
            </div>
          </div>

          <button
            onClick={() => copyToClipboard(currentScriptContent, activeFileTab)}
            className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm shadow-blue-600/20 transition-all cursor-pointer self-start sm:self-auto"
          >
            {copied === activeFileTab ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied === activeFileTab ? 'Скопировано!' : 'Скопировать файл'}</span>
          </button>
        </div>

        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 text-xs">
          {fileTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeFileTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveFileTab(tab.id)}
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

        <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
          <pre className="p-4 text-xs font-mono text-slate-300 overflow-x-auto max-h-[420px] leading-relaxed select-all">
            {currentScriptContent}
          </pre>
        </div>
      </div>

      {/* Guide */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>Инструкция</span>
        </h3>
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-2 leading-relaxed">
          <p>
            <b>1.</b> На этой машине — настройте параметры и нажмите <b className="text-blue-300">«Запустить установку»</b>.
            Процедура выполнит проверки, поставит Docker/Node.js/GPU-драйверы, предзагрузит ОС-модули,
            соберёт панель и создаст службу systemd с выбранным портом.
          </p>
          <p>
            <b>2.</b> На другом сервере — выполните <code className="text-emerald-300"> {oneLinerCommand} </code>
            для интерактивного <b>пошагового</b> установщика (выбор порта, директории, компонентов).
          </p>
          <p>
            <b>3.</b> Для дистрибутива — скопируйте файлы из раздела выше (<code>install.sh</code>,
            <code> docker-compose.yml</code>, <code>Dockerfile</code>, <code>fixcat.service</code>, <code>install.ps1</code>)
            и манифест <code>manifest.json</code> для генерации setup.exe/.deb в другом ИИ.
          </p>
        </div>
      </div>
    </div>
  );
};