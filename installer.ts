import express from 'express';
import { exec } from 'child_process';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import net from 'net';

// =============================================================================
// Fixcat OS Manager — Installer & Module Engine
// Interactive config (port, dir, components), staged install,
// live SSE logs, module catalog (OS images /  / system components).
// =============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LogLevel = 'info' | 'succ' | 'warn' | 'err' | 'cmd' | 'out';

interface LogEntry {
  t: string;
  level: LogLevel;
  msg: string;
}

interface StepState {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'done' | 'skipped' | 'warn' | 'error';
  detail?: string;
}

export interface InstallerConfig {
  port: number;
  installDir: string;
  dataDir: string;
  installDocker: boolean;
  installNode: boolean;
  installNvidia: boolean;
  installLms: boolean;
  preloadModules: string[];
  language: 'ru' | 'en';
  snapshotName: string;
  dryRun: boolean;
}

interface InstallerState {
  status: 'idle' | 'running' | 'done' | 'stopped';
  currentStep: number;
  totalSteps: number;
  steps: StepState[];
  logs: LogEntry[];
  startedAt: string | null;
  finishedAt: string | null;
  config: InstallerConfig | null;
  cancelRequested: boolean;
  error: string | null;
}

type BroadcasterEvent =
  | { type: 'installer'; payload: Record<string, unknown> }
  | { type: 'module'; payload: Record<string, unknown> };

type Subscriber = (event: BroadcasterEvent) => void;

// ---------------------------------------------------------------------------
// State & Broadcaster
// ---------------------------------------------------------------------------

class Broadcaster {
  private subs = new Set<Subscriber>();

  subscribe(fn: Subscriber): () => void {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }

  emit(event: BroadcasterEvent): void {
    for (const fn of this.subs) {
      try {
        fn(event);
      } catch {
        // ignore subscriber errors
      }
    }
  }
}

export const broadcaster = new Broadcaster();

const MAX_LOG_LINES = 600;

let installerState: InstallerState = {
  status: 'idle',
  currentStep: 0,
  totalSteps: 0,
  steps: [],
  logs: [],
  startedAt: null,
  finishedAt: null,
  config: null,
  cancelRequested: false,
  error: null,
};

const moduleStates: Record<string, { status: string; message?: string }> = {};

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------

function nowTs(): string {
  return new Date().toLocaleTimeString('ru-RU', { hour12: false });
}

function pushLog(level: LogLevel, msg: string): void {
  installerState.logs.push({ t: nowTs(), level, msg });
  if (installerState.logs.length > MAX_LOG_LINES) {
    installerState.logs = installerState.logs.slice(-MAX_LOG_LINES);
  }
  broadcaster.emit({ type: 'installer', payload: { type: 'log', level, msg, t: nowTs() } });
}

function logInfo(msg: string): void {
  pushLog('info', msg);
}
function logSucc(msg: string): void {
  pushLog('succ', msg);
}
function logWarn(msg: string): void {
  pushLog('warn', msg);
}
function logErr(msg: string): void {
  pushLog('err', msg);
}
function logCmd(cmd: string): void {
  pushLog('cmd', cmd);
}

// ---------------------------------------------------------------------------
// Command runner (streams output to the live log)
// ---------------------------------------------------------------------------

interface RunResult {
  code: number;
  output: string;
}

function runBash(command: string, opts: { echo?: boolean; dryRun?: boolean } = {}): Promise<RunResult> {
  const { echo = true, dryRun = false } = opts;

  if (dryRun) {
    logInfo(`[DRY-RUN] ${command}`);
    return Promise.resolve({ code: 0, output: '' });
  }
  if (installerState.cancelRequested) {
    return Promise.resolve({ code: -1, output: '' });
  }

  if (echo) logCmd(command);

  return new Promise((resolve) => {
    let output = '';
    const child = spawn('/bin/bash', ['-c', command]);

    const handleChunk = (chunk: Buffer, isErr: boolean) => {
      const text = chunk.toString('utf-8');
      output += text;
      const lines = text.split('\n').filter((l) => l.trim().length > 0 && !/^\r$/.test(l));
      for (const line of lines) {
        const clean = line.replace(/\r/g, '').replace(/\u001b\[[0-9;]*m/g, '').trim();
        if (clean.length > 0) {
          if (isErr) pushLog('out', clean);
          else pushLog('out', clean);
        }
      }
    };

    child.stdout.on('data', (chunk: Buffer) => handleChunk(chunk, false));
    child.stderr.on('data', (chunk: Buffer) => handleChunk(chunk, true));
    child.on('error', (err) => {
      logWarn(`Не удалось запустить команду: ${err.message}`);
      resolve({ code: 1, output });
    });
    child.on('close', (code) => resolve({ code: code ?? -1, output }));
  });
}

function execP(cmd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    exec(cmd, { maxBuffer: 1024 * 1024 * 16 }, (err, stdout, stderr) => {
      resolve({ code: err ? (typeof err === 'object' && 'code' in err && typeof (err as any).code === 'number' ? (err as any).code : 1) : 0, stdout, stderr });
    });
  });
}

async function commandExists(cmd: string): Promise<boolean> {
  if (installerState.config?.dryRun) return true;
  const r = await execP(`command -v ${cmd} >/dev/null 2>&1 && echo yes || echo no`);
  return r.stdout.trim() === 'yes';
}

// ---------------------------------------------------------------------------
// Environment helpers
// ---------------------------------------------------------------------------

function hasGpu(): Promise<boolean> {
  return new Promise(async (resolve) => {
    if (installerState.config?.dryRun) return resolve(true);
    const r = await execP('command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi -L 2>/dev/null | wc -l || echo 0');
    const n = parseInt(r.stdout.trim(), 10) || 0;
    resolve(n > 0);
  });
}

function isDockerRunning(): Promise<boolean> {
  return new Promise(async (resolve) => {
    const r = await execP('command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1 && echo yes || echo no');
    resolve(r.stdout.trim() === 'yes');
  });
}

function isSystemdHost(): Promise<boolean> {
  return new Promise(async (resolve) => {
    const r = await execP('test -d /run/systemd/system && echo yes || echo no');
    resolve(r.stdout.trim() === 'yes');
  });
}

// Все локальные IPv4-адреса (lo + интерфейсы), чтобы ловить слушателей на любом IP.
function localIPv4s(): string[] {
  const out = new Set<string>(['127.0.0.1']);
  const ifs = os.networkInterfaces();
  for (const key of Object.keys(ifs)) {
    for (const a of ifs[key] || []) {
      if (a.family === 'IPv4' && !a.internal && a.address) out.add(a.address);
    }
  }
  return Array.from(out);
}

// Проверка порта реальным TCP-connect: если что-то принимает — порт занят.
// (bind-проверка в некоторых виртуализациях/proot ложно «успешна».)
function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const hosts = localIPv4s();
    if (hosts.length === 0) return resolve(true);
    let pending = hosts.length;
    let busy = false;
    for (const host of hosts) {
      const sock = net.connect({ port, host });
      let settled = false;
      const finish = (free: boolean) => {
        if (settled) return;
        settled = true;
        if (!free) busy = true;
        sock.destroy();
        if (--pending === 0) resolve(!busy);
      };
      sock.setTimeout(400);
      sock.once('connect', () => finish(false)); // принял соединение => слушает
      sock.once('error', () => finish(true));     // refused => свободен
      sock.once('timeout', () => finish(true));   // нет ответа => считаем свободным
    }
  });
}

async function getFreePort(desired: number): Promise<number> {
  let port = Math.max(1024, desired);
  while (port < 65535) {
    if (await portFree(port)) return port;
    port++;
  }
  return desired;
}

async function findImage(id: string): Promise<string | null> {
  const def = MODULES.find((m) => m.id === id);
  return def?.image || null;
}

// ---------------------------------------------------------------------------
// Module catalog
// ---------------------------------------------------------------------------

type ModuleCategory = 'os' | 'ai' | 'system';

interface ModuleDef {
  id: string;
  category: ModuleCategory;
  name: string;
  description: string;
  icon: string;
  group: string;
  image?: string;
  sizeLabel?: string;
  kind: 'image' | 'cli' | 'service';
}

const MODULES: ModuleDef[] = [
  {
    id: 'os:ubuntu',
    category: 'os',
    name: 'Ubuntu 22.04 Desktop',
    description: 'Полноценный рабочий стол Ubuntu с LXDE и доступом через noVNC.',
    icon: 'ubuntu',
    group: 'Операционные системы',
    image: 'dorowu/ubuntu-desktop-lxde-vnc:latest',
    sizeLabel: '~2.5 GB',
    kind: 'image',
  },
  {
    id: 'os:windows-xp',
    category: 'os',
    name: 'Windows XP Professional SP3',
    description: 'Классическая Windows XP в QEMU-контейнере dockur (скачивается при первом запуске).',
    icon: 'windows-xp',
    group: 'Операционные системы',
    image: 'dockur/windows:xp',
    sizeLabel: '~6 GB (при первом запуске)',
    kind: 'image',
  },
  {
    id: 'os:debian',
    category: 'os',
    name: 'Debian 12 XFCE',
    description: 'Стабильная ОС Debian с рабочим столом XFCE и встроенным noVNC.',
    icon: 'debian',
    group: 'Операционные системы',
    image: 'ghcr.io/linuxserver/webtop:debian-xfce',
    sizeLabel: '~1.2 GB',
    kind: 'image',
  },
  {
    id: 'os:kali',
    category: 'os',
    name: 'Kali Linux Security GUI',
    description: 'Дистрибутив для аудита безопасности с графическим интерфейсом и noVNC.',
    icon: 'kali',
    group: 'Операционные системы',
    image: 'kasmweb/kali-rolling-desktop:1.16.0',
    sizeLabel: '~2.2 GB',
    kind: 'image',
  },
  {
    id: 'os:alpine',
    category: 'os',
    name: 'Alpine Linux Light GUI',
    description: 'Сверхлёгкий дистрибутив с минимальным потреблением RAM.',
    icon: 'alpine',
    group: 'Операционные системы',
    image: 'ghcr.io/linuxserver/webtop:alpine-kde',
    sizeLabel: '~800 MB',
    kind: 'image',
  },
  {
    id: 'ai:lmstudio-cli',
    category: 'ai',
    name: ' CLI (lms)',
    description: 'CLI-клиент  для загрузки и запуска локальных нейросетей в память VRAM.',
    icon: 'bot',
    group: 'Локальные нейросети',
    kind: 'cli',
  },
  {
    id: 'sys:docker',
    category: 'system',
    name: 'Docker Engine',
    description: 'Базовое окружение для запуска ОС-модулей и контейнеров.',
    icon: 'docker',
    group: 'Системные компоненты',
    kind: 'service',
  },
  {
    id: 'sys:nodejs',
    category: 'system',
    name: 'Node.js LTS',
    description: 'Выполнение Node.js-приложений и сборка панели (>= 18).',
    icon: 'node',
    group: 'Системные компоненты',
    kind: 'service',
  },
  {
    id: 'sys:nvidia',
    category: 'system',
    name: 'NVIDIA Container Toolkit',
    description: 'GPU-ускорение для контейнеров и моделей  (если есть видеокарта).',
    icon: 'nvidia',
    group: 'Системные компоненты',
    kind: 'service',
  },
];

interface ModuleStatusResult {
  installed: boolean;
  detail: string;
  size?: string;
}

async function getModuleStatus(def: ModuleDef): Promise<ModuleStatusResult> {
  if (def.kind === 'image' && def.image) {
    const r = await execP(`docker image inspect "${def.image}" >/dev/null 2>&1 && echo yes || echo no`);
    if (r.stdout.trim() === 'yes') {
      const sz = await execP(`docker image inspect --format '{{.Size}}' "${def.image}" 2>/dev/null`);
      const bytes = parseInt(sz.stdout.trim(), 10) || 0;
      const size = bytes > 0 ? `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB` : def.sizeLabel || '';
      return { installed: true, detail: 'Локальный образ установлен', size };
    }
    return { installed: false, detail: 'Образ не загружен' };
  }

  if (def.id === 'ai:lmstudio-cli') {
    const ok = await commandExists('lms');
    return ok ? { installed: true, detail: 'lms установлен' } : { installed: false, detail: 'lms не найден' };
  }
  if (def.id === 'sys:docker') {
    const ok = await isDockerRunning();
    return ok ? { installed: true, detail: 'Docker daemon активен' } : { installed: false, detail: 'Docker не установлен / выключен' };
  }
  if (def.id === 'sys:nodejs') {
    const r = await execP('node --version 2>/dev/null');
    const v = r.stdout.trim();
    return v ? { installed: true, detail: `Node.js ${v}` } : { installed: false, detail: 'Node.js не найден' };
  }
  if (def.id === 'sys:nvidia') {
    const hasNv = await hasGpu();
    if (!hasNv) return { installed: false, detail: 'NVIDIA GPU не обнаружен (пропуск)' };
    const ok = await commandExists('nvidia-ctk');
    return ok ? { installed: true, detail: 'Toolkit установлен' } : { installed: false, detail: 'Toolkit не установлен' };
  }

  return { installed: false, detail: '' };
}

function getModuleDynamic(def: ModuleDef) {
  const st = moduleStates[def.id];
  return {
    status: st?.status || 'ready',
    message: st?.message || null,
  };
}

async function buildModuleList() {
  const list = await Promise.all(
    MODULES.map(async (def) => {
      const status = await getModuleStatus(def);
      return { ...def, ...status, ...getModuleDynamic(def) };
    })
  );
  return list;
}

// ---------------------------------------------------------------------------
// Module actions (install / uninstall)
// ---------------------------------------------------------------------------

async function moduleInstall(def: ModuleDef): Promise<void> {
  moduleStates[def.id] = { status: 'installing', message: 'Установка...' };
  broadcaster.emit({ type: 'module', payload: { id: def.id, status: 'installing' } });

  try {
    if (def.kind === 'image' && def.image) {
      logInfo(`Загрузка образа «${def.name}» (${def.image})...`);
      const r = await runBash(`docker pull "${def.image}"`);
      if (r.code !== 0) throw new Error(`Не удалось загрузить образ ${def.image}`);
      logSucc(`Образ «${def.name}» загружен.`);
      moduleStates[def.id] = { status: 'done', message: 'Образ установлен' };
    } else if (def.id === 'ai:lmstudio-cli') {
      logInfo('Установка  CLI (lms)...');
      const r = await runBash(
        'curl -fsSL https://lmstudio.ai/install | sh'
      );
      if (r.code !== 0) {
        logWarn('Автоустановка lms не удалась — установите  вручную и включите CLI.');
        moduleStates[def.id] = { status: 'warn', message: 'Нужна ручная установка' };
      } else {
        logSucc(' CLI установлен.');
        moduleStates[def.id] = { status: 'done', message: 'lms установлен' };
      }
    } else {
      moduleStates[def.id] = { status: 'done', message: 'Компонент проверен' };
    }
  } catch (err: any) {
    logErr(`Ошибка установки модуля «${def.name}»: ${err?.message || err}`);
    moduleStates[def.id] = { status: 'error', message: err?.message || 'Ошибка' };
  }

  broadcaster.emit({ type: 'module', payload: { id: def.id, ...moduleStates[def.id] } });
}

async function moduleUninstall(def: ModuleDef): Promise<void> {
  moduleStates[def.id] = { status: 'installing', message: 'Удаление...' };
  broadcaster.emit({ type: 'module', payload: { id: def.id, status: 'installing' } });

  try {
    if (def.kind === 'image' && def.image) {
      logInfo(`Удаление образа «${def.name}»...`);
      const r = await runBash(`docker image rm -f "${def.image}"`);
      if (r.code !== 0) throw new Error(`Не удалось удалить образ ${def.image}`);
      logSucc(`Образ «${def.name}» удалён.`);
      moduleStates[def.id] = { status: 'done', message: 'Образ удалён' };
    } else {
      moduleStates[def.id] = { status: 'done', message: `Не удаляется (системный: ${def.id})` };
    }
  } catch (err: any) {
    logErr(`Ошибка удаления модуля «${def.name}»: ${err?.message || err}`);
    moduleStates[def.id] = { status: 'error', message: err?.message || 'Ошибка' };
  }

  broadcaster.emit({ type: 'module', payload: { id: def.id, ...moduleStates[def.id] } });
}

// ---------------------------------------------------------------------------
// Installer steps
// ---------------------------------------------------------------------------

function setStepStatus(id: string, status: StepState['status'], detail?: string): void {
  const step = installerState.steps.find((s) => s.id === id);
  if (step) {
    step.status = status;
    if (detail !== undefined) step.detail = detail;
  }
  broadcaster.emit({ type: 'installer', payload: { type: 'step', id, status, detail } });
  broadcaster.emit({ type: 'installer', payload: { type: 'status', ...getPublicState() } });
}

async function stepRequirements(): Promise<void> {
  const osStr = `${os.type()} ${os.platform()} ${os.arch()}`;
  const memGb = (os.totalmem() / 1024 / 1024 / 1024).toFixed(1);
  const dockerOk = await isDockerRunning();
  const gpu = await hasGpu();

  logInfo(`ОС: ${osStr}`);
  logInfo(`Ядро: ${os.release()}`);
  logInfo(`Node.js: ${process.version}`);
  logInfo(`RAM: ${memGb} GB`);
  logInfo(`Docker: ${dockerOk ? 'активен' : 'не обнаружен'}`);
  logInfo(`GPU: ${gpu ? 'NVIDIA обнаружен' : 'не обнаружен'}`);

  const free = await getFreePort(installerState.config!.port);
  if (free !== installerState.config!.port) {
    logWarn(`Порт ${installerState.config!.port} занят — будет использован свободный порт ${free}`);
  }
}

async function stepSystemDeps(): Promise<void> {
  const deps = ['curl', 'git', 'ca-certificates', 'gnupg', 'lsb-release', 'unzip', 'xz-utils'];
  const aptOk = await commandExists('apt-get');
  const dnfOk = await commandExists('dnf');

  if (installerState.config!.dryRun) {
    logInfo(`[DRY-RUN] apt-get update && apt-get install -y ${deps.join(' ')}`);
    return;
  }

  if (!aptOk && !dnfOk) {
    logWarn('Пакетный менеджер apt/dnf не найден — пропуск установки системных зависимостей.');
    setStepStatus('system-deps', 'skipped', 'нет apt/dnf');
    return;
  }

  if (aptOk) {
    logInfo('Обновление списка пакетов (apt-get update)...');
    const up = await runBash('apt-get update -y');
    if (up.code !== 0) logWarn('apt-get update завершился с ошибкой (продолжаем).');
    logInfo(`Установка зависимостей: ${deps.join(', ')}...`);
    const inst = await runBash(`DEBIAN_FRONTEND=noninteractive apt-get install -y ${deps.join(' ')}`);
    if (inst.code !== 0) {
      logWarn('Часть зависимостей не установилась (можно продолжить — они не критичны).');
      setStepStatus('system-deps', 'warn', 'частично установлено');
      return;
    }
  } else {
    logInfo(`Установка зависимостей (dnf): ${deps.join(', ')}...`);
    const inst = await runBash(`dnf install -y ${deps.join(' ')}`);
    if (inst.code !== 0) logWarn('Часть зависимостей не установилась (продолжаем).');
  }
  logSucc('Системные зависимости готовы.');
}

async function stepDocker(): Promise<void> {
  const running = await isDockerRunning();
  if (running) {
    logSucc('Docker Engine уже установлен и активен.');
    setStepStatus('docker', 'done', 'docker активен');
    return;
  }

  const haveCli = await commandExists('docker');
  if (!installerState.config!.installDocker) {
    logWarn('Установка Docker отключена в настройках установщика.');
    setStepStatus('docker', 'skipped', 'отключено пользователем');
    return;
  }

  logInfo('Установка Docker Engine через официальный скрипт get.docker.com...');
  const r = await runBash('curl -fsSL https://get.docker.com | sh');
  if (r.code !== 0) {
    logErr('Не удалось установить Docker автоматически.');
    setStepStatus('docker', 'error', 'см. лог');
    return;
  }

  const enabled = await runBash('systemctl enable --now docker 2>/dev/null || service docker start 2>/dev/null || true');
  void enabled;

  const still = await isDockerRunning();
  if (still) {
    logSucc('Docker Engine установлен и запущен.');
  } else if (haveCli) {
    logWarn('Docker CLI есть, но демон не запущен — проверьте сервис docker.');
    setStepStatus('docker', 'warn');
  } else {
    setStepStatus('docker', 'error', 'docker daemon не отвечает');
  }
}

async function stepNode(): Promise<void> {
  const r = await execP('node --version 2>/dev/null || echo none');
  const ver = r.stdout.trim();
  if (ver !== 'none') {
    const major = parseInt(ver.replace('v', '').split('.')[0], 10) || 0;
    if (major >= 18) {
      logSucc(`Node.js ${ver} уже установлен.`);
      setStepStatus('nodejs', 'done', ver);
      return;
    }
  }

  if (!installerState.config!.installNode) {
    logWarn('Установка Node.js отключена в настройках установщика.');
    setStepStatus('nodejs', 'skipped', 'отключено пользователем');
    return;
  }

  const aptOk = await commandExists('apt-get');
  if (!aptOk) {
    logWarn('apt-get не найден — пропуск установки Node.js через NodeSource.');
    setStepStatus('nodejs', 'skipped', 'нет apt-get');
    return;
  }

  logInfo('Установка Node.js 22 LTS через NodeSource...');
  const r1 = await runBash('curl -fsSL https://deb.nodesource.com/setup_22.x | bash -');
  if (r1.code !== 0) {
    logErr('Не удалось добавить репозиторий NodeSource.');
    setStepStatus('nodejs', 'error');
    return;
  }
  const r2 = await runBash(
    'DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs'
  );
  if (r2.code !== 0) {
    logErr('Не удалось установить Node.js.');
    setStepStatus('nodejs', 'error');
    return;
  }
  const check = await execP('node --version 2>/dev/null || echo none');
  logSucc(`Node.js ${check.stdout.trim()} установлен.`);
}

async function stepNvidia(): Promise<void> {
  const gpu = await hasGpu();
  if (!gpu) {
    logInfo('NVIDIA GPU не обнаружен — пропуск установки Container Toolkit.');
    setStepStatus('nvidia', 'skipped', 'GPU не найден');
    return;
  }
  if (await commandExists('nvidia-ctk')) {
    logSucc('NVIDIA Container Toolkit уже установлен.');
    setStepStatus('nvidia', 'done');
    return;
  }
  if (!installerState.config!.installNvidia) {
    logWarn('Установка NVIDIA Toolkit отключена в настройках.');
    setStepStatus('nvidia', 'skipped', 'отключено пользователем');
    return;
  }

  logInfo('Установка NVIDIA Container Toolkit...');
  const r = await runBash(
    'curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg || true; ' +
      'curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | ' +
      "sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' > /etc/apt/sources.list.d/nvidia-container-toolkit.list || true; " +
      'apt-get update -y && DEBIAN_FRONTEND=noninteractive apt-get install -y nvidia-container-toolkit || true'
  );
  if (r.code !== 0) {
    logWarn('Автоустановка NVIDIA Toolkit завершилась с ошибками (не критично).');
    setStepStatus('nvidia', 'warn');
    return;
  }
  const cfg = await runBash('nvidia-ctk runtime configure --runtime=docker 2>/dev/null || true');
  void cfg;
  logSucc('NVIDIA Container Toolkit настроен.');
}

async function stepLms(): Promise<void> {
  if (await commandExists('lms')) {
    logSucc(' CLI (lms) уже установлен.');
    setStepStatus('lms', 'done');
    return;
  }
  if (!installerState.config!.installLms) {
    logWarn('Установка  CLI отключена в настройках.');
    setStepStatus('lms', 'skipped', 'отключено пользователем');
    return;
  }

  logInfo('Установка  CLI (lms)...');
  const r = await runBash('curl -fsSL https://lmstudio.ai/install | sh');
  if (r.code !== 0) {
    logWarn('Автоустановка lms не удалась. CLI можно установить позже из раздела «Модули».');
    setStepStatus('lms', 'warn', 'установите вручную');
    return;
  }
  logSucc(' CLI установлен.');
}

async function stepModules(): Promise<void> {
  const selected = installerState.config!.preloadModules || [];
  if (selected.length === 0) {
    logInfo('Загрузка модулей не выбрана пользователем.');
    setStepStatus('modules', 'skipped', 'не выбраны модули');
    return;
  }

  const dockerRunning = await isDockerRunning();
  const imageIds = selected.filter((id) => MODULES.some((m) => m.id === id && m.kind === 'image'));

  if (imageIds.length > 0 && !dockerRunning) {
    logErr('Docker не запущен — пропуск загрузки ОС-образов.');
    setStepStatus('modules', 'warn', 'docker недоступен');
  }

  for (const id of selected) {
    const def = MODULES.find((m) => m.id === id);
    if (!def) continue;
    logInfo(`Модуль «${def.name}»...`);
    await moduleInstall(def);
  }

  const failed = selected.some((id) => moduleStates[id]?.status === 'error');
  setStepStatus('modules', failed ? 'error' : 'done', `${selected.length} модулей обработано`);
}

async function stepDeploy(): Promise<void> {
  const cfg = installerState.config!;
  const installDir = cfg.installDir;
  const repo = 'https://github.com/fixcat-offical/Fixcat-OS-Manager.git';

  logInfo(`Директория установки: ${installDir}`);
  logInfo(`Порт панели: ${cfg.port}`);
  logInfo(`Директория данных: ${cfg.dataDir}`);

  if (installerState.config!.dryRun) {
    logInfo(`[DRY-RUN] git clone ${repo} ${installDir}`);
    logInfo('[DRY-RUN] npm ci && npm run build');
    logInfo('[DRY-RUN] создание systemd-юнита с PORT=' + cfg.port);
    return;
  }

  const sameDir = path.resolve(process.cwd()) === path.resolve(installDir);

  if (!sameDir) {
    if (fs.existsSync(path.join(installDir, 'package.json'))) {
      logInfo(`Папка ${installDir} уже содержит проект — обновляю из git...`);
      const pull = await runBash(`cd "${installDir}" && git pull --ff-only 2>/dev/null || true`);
      if (pull.code !== 0) logWarn('git pull не удался — продолжаю с текущими файлами.');
    } else {
      logInfo(`Клонирование репозитория в ${installDir}...`);
      fs.mkdirSync(installDir, { recursive: true });
      const clone = await runBash(`git clone ${repo} "${installDir}" 2>/dev/null || (cd "${installDir}" && git init -q && git remote add origin ${repo} && git fetch -q origin && git checkout -q origin/main 2>/dev/null) || true`);
      if (clone.code !== 0 && !fs.existsSync(path.join(installDir, 'package.json'))) {
        logErr('Не удалось получить исходный код панели.');
        setStepStatus('deploy', 'error', 'git clone failed');
        return;
      }
    }
  } else {
    logInfo('Панель уже запущена из директории установки — выполняю сборку in-place.');
  }

  logInfo('Установка зависимостей (npm ci)...');
  const ci = await runBash(`cd "${installDir}" && npm ci --no-audit --no-fund 2>/dev/null || npm install --no-audit --no-fund`);
  if (ci.code !== 0) {
    logErr('Ошибка установки npm-зависимостей.');
    setStepStatus('deploy', 'error', 'npm install failed');
    return;
  }

  logInfo('Продакшн-сборка панели (npm run build)...');
  const build = await runBash(`cd "${installDir}" && npm run build`);
  if (build.code !== 0) {
    logErr('Ошибка продакшн-сборки.');
    setStepStatus('deploy', 'error', 'build failed');
    return;
  }

  fs.mkdirSync(cfg.dataDir, { recursive: true });

  const envFile = path.join(installDir, '.env');
  const envLines = [
    '# Fixcat OS Manager — конфигурация, создана установщиком',
    `PORT=${cfg.port}`,
    `FIXCAT_DATA_DIR=${cfg.dataDir}`,
    `FIXCAT_INSTALL_DIR=${installDir}`,
    `NODE_ENV=production`,
  ];
  try {
    fs.writeFileSync(envFile, envLines.join('\n') + '\n', 'utf-8');
    logSucc(`Конфигурация записана: ${envFile}`);
  } catch (e: any) {
    logWarn(`Не удалось записать .env: ${e?.message}`);
  }

  logSucc('Панель собрана и готова к запуску.');
}

async function stepSystemd(): Promise<void> {
  const cfg = installerState.config!;
  const systemd = await isSystemdHost();
  if (!systemd) {
    logWarn('systemd не обнаружен — пропуск создания службы (запустите вручную: node dist/server.js).');
    setStepStatus('systemd', 'skipped', 'нет systemd');
    return;
  }
  if (installerState.config!.dryRun) {
    logInfo(`[DRY-RUN] создать /etc/systemd/system/fixcat.service (PORT=${cfg.port})`);
    return;
  }

  const unit = `[Unit]
Description=Fixcat OS Manager - Web Panel &  Control
Documentation=https://github.com/fixcat-offical/Fixcat-OS-Manager
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=root
WorkingDirectory=${cfg.installDir}
Environment=PORT=${cfg.port}
Environment=NODE_ENV=production
Environment=FIXCAT_DATA_DIR=${cfg.dataDir}
ExecStart=/usr/bin/node ${cfg.installDir}/dist/server.js
ExecReload=/bin/kill -HUP $MAINPID
Restart=always
RestartSec=3
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
`;

  try {
    fs.writeFileSync('/etc/systemd/system/fixcat.service', unit, 'utf-8');
    logSucc('Служебный файл fixcat.service записан.');
  } catch (e: any) {
    logErr(`Не удалось записать юнит: ${e?.message}`);
    setStepStatus('systemd', 'error');
    return;
  }

  const reload = await runBash('systemctl daemon-reload');
  void reload;
  const enable = await runBash('systemctl enable fixcat.service');
  if (enable.code !== 0) logWarn('Не удалось включить автозапуск.');
  const start = await runBash('systemctl restart fixcat.service');
  if (start.code !== 0) {
    logWarn('Служба fixcat.service не запустилась. Проверьте `journalctl -u fixcat -n 50`.');
    setStepStatus('systemd', 'warn');
    return;
  }

  logSucc(`Служба fixcat.service запущена на порту ${cfg.port}.`);
}

async function stepFinish(): Promise<void> {
  const cfg = installerState.config!;
  const port = cfg.port;

  const lanR = await execP(`hostname -I 2>/dev/null || true`);
  const lanIps = lanR.stdout.split(/\s+/).filter((s) => s && !s.includes(':'));

  const pubR = await execP(`curl -fsS --max-time 4 https://ipinfo.io/ip 2>/dev/null || echo ""`);
  const publicIp = pubR.stdout.trim();

  logInfo('');
  logSucc('=== Установка Fixcat OS Manager завершена ===');
  logInfo('');
  logInfo(`🌐 Ссылки для входа в веб-панель (порт ${port}):`);
  logInfo(`   • Локально:          http://localhost:${port}`);
  if (lanIps.length > 0) {
    for (const ip of lanIps.slice(0, 8)) {
      logInfo(`   • Локальная сеть:    http://${ip}:${port}`);
    }
  } else {
    logInfo(`   • Локальная сеть:    http://<server-ip>:${port}`);
  }
  if (publicIp) {
    logInfo(`   • Интернет:          http://${publicIp}:${port}   (если порт открыт/проброшен)`);
  }
  logInfo(`   • Данные / установка: ${cfg.dataDir} / ${cfg.installDir}`);
  if (cfg.installLms || cfg.preloadModules.includes('ai:lmstudio-cli')) {
    logInfo(`   •  OpenAI Proxy: http://localhost:${port}/api/on-device-ai`);
  }
  logInfo('Для первого входа перейдите в панель и создайте администратора.');
}

const STEPS: { id: string; title: string; fn: () => Promise<void> }[] = [
  { id: 'requirements', title: 'Проверка требований', fn: stepRequirements },
  { id: 'system-deps', title: 'Системные зависимости', fn: stepSystemDeps },
  { id: 'docker', title: 'Docker Engine + Compose', fn: stepDocker },
  { id: 'nodejs', title: 'Node.js LTS', fn: stepNode },
  { id: 'nvidia', title: 'NVIDIA Container Toolkit (GPU)', fn: stepNvidia },
  { id: 'lms', title: ' CLI ()', fn: stepLms },
  { id: 'modules', title: 'Загрузка модулей (образы ОС / AI)', fn: stepModules },
  { id: 'deploy', title: 'Сборка и развертывание панели', fn: stepDeploy },
  { id: 'systemd', title: 'Служба systemd (автозапуск)', fn: stepSystemd },
  { id: 'finish', title: 'Завершение', fn: stepFinish },
];

async function runInstaller(cfg: InstallerConfig): Promise<void> {
  if (installerState.status === 'running') return;

  installerState = {
    status: 'running',
    currentStep: 0,
    totalSteps: STEPS.length,
    steps: STEPS.map((s) => ({ id: s.id, title: s.title, status: 'pending' as const })),
    logs: [],
    startedAt: new Date().toISOString(),
    finishedAt: null,
    config: cfg,
    cancelRequested: false,
    error: null,
  };
  moduleStates.__installer = { status: 'running', message: 'Установка запущена' };

  broadcaster.emit({ type: 'installer', payload: { type: 'start', config: cfg } });
  broadcaster.emit({ type: 'installer', payload: { type: 'status', ...getPublicState() } });

  logInfo(`=== Запуск установщика Fixcat OS Manager (dry-run: ${cfg.dryRun ? 'да' : 'нет'}) ===`);
  logInfo(`Настройки: порт=${cfg.port}, каталог=${cfg.installDir}, данные=${cfg.dataDir}`);
  logInfo(`Компоненты: docker=${cfg.installDocker}, node=${cfg.installNode}, nvidia=${cfg.installNvidia}, lms=${cfg.installLms}`);

  for (let i = 0; i < STEPS.length; i++) {
    if (installerState.cancelRequested) break;
    installerState.currentStep = i;
    setStepStatus(STEPS[i].id, 'running');
    logInfo('');
    logInfo(`[Шаг ${i + 1}/${STEPS.length}] ${STEPS[i].title}`);
    try {
      await STEPS[i].fn();
      if (installerState.steps[i]?.status === 'running') {
        setStepStatus(STEPS[i].id, 'done');
      }
    } catch (err: any) {
      logErr(`Шаг «${STEPS[i].title}» завершился ошибкой: ${err?.message || err}`);
      setStepStatus(STEPS[i].id, 'error', err?.message || 'ошибка');
    }
  }

  const cancelled = installerState.cancelRequested;
  installerState.status = cancelled ? 'stopped' : 'done';
  installerState.finishedAt = new Date().toISOString();
  moduleStates.__installer = { status: installerState.status, message: undefined };

  if (cancelled) {
    logWarn('=== Установка остановлена пользователем ===');
  } else {
    logSucc(`=== Установка завершена за ${((Date.now() - new Date(installerState.startedAt!).getTime()) / 1000).toFixed(0)} сек ===`);
  }

  broadcaster.emit({ type: 'installer', payload: { type: 'status', ...getPublicState() } });
  broadcaster.emit({ type: 'installer', payload: { type: 'final', status: installerState.status } });
}

// ---------------------------------------------------------------------------
// Public state snapshot
// ---------------------------------------------------------------------------

function getPublicState() {
  return {
    status: installerState.status,
    currentStep: installerState.currentStep,
    totalSteps: installerState.totalSteps,
    steps: installerState.steps,
    startedAt: installerState.startedAt,
    finishedAt: installerState.finishedAt,
    config: installerState.config,
    error: installerState.error,
    logs: installerState.logs.slice(-300),
  };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

// Expose all known OS docker images for update/preload features
export function getModuleImages(): string[] {
  return [...new Set(MODULES.filter((m) => m.kind === 'image' && m.image).map((m) => m.image!))];
}

// ---------------------------------------------------------------------------
// Installer Routes (Express)
// ---------------------------------------------------------------------------
export function registerInstallerRoutes(app: express.Express): void {
  app.get('/api/installer/status', (req, res) => {
    res.json(getPublicState());
  });

  app.get('/api/installer/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const snapshot = { type: 'installer', payload: { type: 'snapshot', ...getPublicState() } };
    res.write(`data: ${JSON.stringify(snapshot)}\n\n`);

    const unsub = broadcaster.subscribe((event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    req.on('close', () => {
      unsub();
    });
  });

  app.post('/api/installer/start', async (req, res) => {
    if (installerState.status === 'running') {
      return res.status(409).json({ error: 'Установка уже выполняется.' });
    }

    const body = req.body || {};
    const requested = body.port !== undefined && body.port !== null && String(body.port).trim() !== ''
      ? parseInt(body.port, 10)
      : 3000;
    // Автоподбор: если запрошенный порт занят — берём ближайший свободный.
    const port = await getFreePort(Math.max(1024, requested || 3000));
    const installDir = String(body.installDir || '/opt/fixcat-os-manager').trim();
    const dataDir = String(body.dataDir || path.join(installDir, 'data')).trim();
    const dryRun = Boolean(body.dryRun);

    const cfg: InstallerConfig = {
      port,
      installDir,
      dataDir,
      installDocker: body.installDocker !== false,
      installNode: body.installNode !== false,
      installNvidia: body.installNvidia !== false,
      installLms: body.installLms !== false,
      preloadModules: Array.isArray(body.preloadModules) ? body.preloadModules : ['os:ubuntu', 'os:debian', 'os:kali', 'os:alpine', 'os:windows-xp'],
      language: body.language === 'en' ? 'en' : 'ru',
      snapshotName: String(body.snapshotName || 'default'),
      dryRun,
    };

    void runInstaller(cfg);

    res.json({ success: true, status: 'running', config: cfg });
  });

  app.post('/api/installer/stop', (req, res) => {
    if (installerState.status === 'running') {
      installerState.cancelRequested = true;
      logWarn('Запрошена остановка установки...');
      res.json({ success: true, message: 'Остановка установки запрошена.' });
    } else {
      res.json({ success: false, message: 'Установка не выполняется.' });
    }
  });

  app.get('/api/modules', async (req, res) => {
    const modules = await buildModuleList();
    res.json({ modules });
  });

  app.post('/api/modules/:id/install', async (req, res) => {
    const def = MODULES.find((m) => m.id === req.params.id);
    if (!def) return res.status(404).json({ error: 'Модуль не найден' });
    if (moduleStates[def.id]?.status === 'installing') {
      return res.status(409).json({ error: 'Модуль уже обрабатывается' });
    }
    void moduleInstall(def);
    res.json({ success: true, message: `Установка «${def.name}» запущена` });
  });

  app.post('/api/modules/:id/uninstall', async (req, res) => {
    const def = MODULES.find((m) => m.id === req.params.id);
    if (!def) return res.status(404).json({ error: 'Модуль не найден' });
    if (moduleStates[def.id]?.status === 'installing') {
      return res.status(409).json({ error: 'Модуль уже обрабатывается' });
    }
    void moduleUninstall(def);
    res.json({ success: true, message: `Удаление «${def.name}» запущено` });
  });
}

// ---------------------------------------------------------------------------
// --- Interactive bash installer (served to /api/installer/script) ---
// ---------------------------------------------------------------------------

export function getInstallerScript(): string {
  return `#!/usr/bin/env bash
# =============================================================================
#  Fixcat OS Manager — профессиональный установщик (интерактивный/автоматический)
#  Авто-выбор свободного порта, выбор директорий, установка Docker / Node.js /
#  NVIDIA Toolkit /  CLI, сборка панели, systemd-служба.
#
#  Примеры:
#    sudo bash install.sh                       # интерактивный режим
#    sudo bash install.sh --port 8080 --yes     # полностью автоматический
#    sudo bash install.sh --dry-run             # превью без изменений
# =============================================================================

set -euo pipefail

REPO_URL="https://github.com/fixcat-offical/Fixcat-OS-Manager.git"
INSTALL_DIR="/opt/fixcat-os-manager"
DATA_DIR="/opt/fixcat-os-manager/data"
PORT="3000"
ASSUME_YES=0
DRY_RUN=0
INSTALL_DOCKER=1
INSTALL_NODE=1
INSTALL_NVIDIA=1
INSTALL_LMS=1
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
    --no-lms)      INSTALL_LMS=0; shift ;;
    --no-images)   PRELOAD_OS=0; shift ;;
    -h|--help)     grep "^#" "$0"; exit 0 ;;
    *) echo "❌ Неизвестный аргумент: $1"; exit 1 ;;
  esac
done

COLOR_RESET='\\033[0m'; COLOR_BLUE='\\033[0;34m'; COLOR_GREEN='\\033[0;32m'
COLOR_YELLOW='\\033[0;33m'; COLOR_RED='\\033[0;31m'; COLOR_CYAN='\\033[0;36m'

info()  { echo -e "\${COLOR_BLUE}[INFO]\${COLOR_RESET} $*"; }
ok()    { echo -e "\${COLOR_GREEN}[  OK ]\${COLOR_RESET} $*"; }
warn()  { echo -e "\${COLOR_YELLOW}[WARN ]\${COLOR_RESET} $*"; }
fail()  { echo -e "\${COLOR_RED}[FAIL ]\${COLOR_RESET} $*"; }
step()  { echo; echo -e "\${COLOR_CYAN}════════════════════════════════════════════════════════════\${COLOR_RESET}"; echo -e "\${COLOR_CYAN}  $*\${COLOR_RESET}"; echo -e "\${COLOR_CYAN}════════════════════════════════════════════════════════════\${COLOR_RESET}"; }

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
    printf "\r\\033[K   \\033[0;33m[%s%s]\\033[0m %ss " "$bar" "$filler" "$sec"
    sleep 0.25
  done
  rc=0; wait "$pid" 2>/dev/null && rc=0 || rc=$?
  sec=$((SECONDS-start_sec))
  if [[ $rc -eq 0 ]]; then
    printf "\r\\033[K   \\033[0;32m[####################]\\033[0m %ss — готово\\n" "$sec"
    ok "$label."
  else
    printf "\r\\033[K   \\033[0;31m[ошибка %s]\\033[0m %ss\\n" "$rc" "$sec"
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

banner() {
  echo
  echo "   ███████╗██╗██╗  ██╗ ██████╗ █████╗ ████████╗"
  echo "   ██╔════╝██║╚██╗██╔╝██╔════╝██╔══██╗╚══██╔══╝"
  echo "   █████╗  ██║ ╚███╔╝ ██║     ███████║   ██║   "
  echo "   ██╔══╝  ██║ ██╔██╗ ██║     ██╔══██║   ██║   "
  echo "   ██║     ██║██╔╝ ██╗╚██████╗██║  ██║   ██║   "
  echo "   ╚═╝     ╚═╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝   ╚═╝   "
  echo "      OS Manager — интерактивный установщик v2.5"
  echo
}

port_free() {
  local p="$1" ip busy=0
  # ss/netstat могут отсутствовать или не видеть /proc — не ждём их вечно
  if command -v timeout >/dev/null 2>&1; then
    if timeout 2 ss -tlnp 2>/dev/null | grep -q "\\s$p\\s"; then return 1; fi
    if timeout 2 netstat -tlnp 2>/dev/null | grep -q "\\s$p\\s"; then return 1; fi
  elif command -v ss >/dev/null 2>&1; then
    if ss -tlnp 2>/dev/null | grep -q "\\s$p\\s"; then return 1; fi
  elif command -v netstat >/dev/null 2>&1; then
    if netstat -tlnp 2>/dev/null | grep -q "\\s$p\\s"; then return 1; fi
  fi
  # Фолбэк: реальный TCP-connect к lo и ко всем внешним IPv4
  for ip in 127.0.0.1 $(hostname -I 2>/dev/null); do
    [[ "$ip" == *:* ]] && continue
    if (exec 3<>/dev/tcp/"$ip"/"$p") 2>/dev/null; then exec 3>&- 3<&-; busy=1; break; fi
  done
  return $busy
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
    read -r -p "🔌 Введите порт веб-панели [сейчас: $PORT, пусто=оставить]: " want
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
        read -r -p "Использовать $p? [Y/n]: " use
        [[ "\${use,,}" != "n" ]] && { PORT="$p"; ok "Выбран порт $PORT."; return; }
        break
      fi
    done
  done
}

pick_dir() {
  if [[ "$ASSUME_YES" == "1" ]]; then return; fi
  local d
  read -r -p "📁 Директория установки [\${INSTALL_DIR}]: " d
  [[ -n "$d" ]] && { INSTALL_DIR="$d"; DATA_DIR="$d/data"; }
  read -r -p "📁 Директория данных [\${DATA_DIR}]: " d
  [[ -n "$d" ]] && DATA_DIR="$d"
}

prompt_yn() {
  local label="$1" default="$2"
  if [[ "$ASSUME_YES" == "1" ]]; then
    [[ "$default" == "1" ]] && return 0 || return 1
  fi
  while true; do
    read -r -p "❓ $label [Y/n]: " a
    [[ -z "$a" ]] && a="$default"
    case "\${a,,}" in y|yes) return 0 ;; n|no) return 1 ;; *) ;; esac
  done
}

# =============================================================================
banner
step "1/10 — Конфигурация установки"
echo "  ОС:        \${OS_ID:-unknown} / $(uname -m)"
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

step "2/10 — Системные зависимости"
case "$OS_ID" in
  ubuntu|debian|kali|linuxmint)
    DEPS="curl git ca-certificates gnupg lsb-release unzip xz-utils build-essential"
    exec_cmd apt-get update -y
    exec_cmd env DEBIAN_FRONTEND=noninteractive apt-get install -y $DEPS 2>/dev/null || warn "Часть зависимостей не установилась." ;;
  centos|rhel|rocky|almalinux|fedora)
    DEPS="curl git ca-certificates gnupg unzip xz"
    exec_cmd dnf install -y $DEPS 2>/dev/null || yum install -y $DEPS 2>/dev/null || warn "Часть зависимостей не установилась." ;;
  arch)
    exec_cmd pacman -Sy --noconfirm curl git base-devel 2>/dev/null || true ;;
  *) warn "ОС \${OS_ID} не распознана — ставлю зависимости вручную." ;;
esac
ok "Базовые компоненты готовы."

step "3/10 — Docker Engine"
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  ok "Docker уже активен."
elif [[ "$INSTALL_DOCKER" == "0" ]]; then
  warn "Установка Docker пропущена (флаг --no-docker)."
else
  exec_cmd curl -fsSL https://get.docker.com | sh
  exec_cmd systemctl enable --now docker >/dev/null 2>&1 || exec_cmd service docker start >/dev/null 2>&1 || true
  ok "Docker Engine установлен."
fi

step "4/10 — Node.js LTS"
NODE_MAJOR=$(node --version 2>/dev/null | sed 's/v//;s/\\..*//')
if [[ -n "$NODE_MAJOR" && "$NODE_MAJOR" -ge 18 ]]; then
  ok "Node.js v$NODE_MAJOR уже установлен."
elif [[ "$INSTALL_NODE" == "0" ]]; then
  warn "Установка Node.js пропущена (флаг --no-node)."
else
  case "$OS_ID" in
    ubuntu|debian|kali|linuxmint)
      exec_cmd curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
      exec_cmd env DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs ;;
    centos|rhel|rocky|almalinux|fedora)
      exec_cmd curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
      exec_cmd dnf install -y nodejs ;;
    *) warn "Нет автоматической установки Node для $OS_ID — установите Node.js 18+ вручную." ;;
  esac
  ok "Node.js v$(node --version | sed 's/v//') установлен."
fi

step "5/10 — NVIDIA Container Toolkit (GPU)"
if ! command -v nvidia-smi >/dev/null 2>&1 || ! nvidia-smi -L >/dev/null 2>&1; then
  warn "NVIDIA GPU не обнаружен — пропуск."
elif command -v nvidia-ctk >/dev/null 2>&1; then
  ok "Toolkit уже установлен."
elif [[ "$INSTALL_NVIDIA" == "0" ]]; then
  warn "Пропущено (флаг --no-nvidia)."
else
  curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg 2>/dev/null || true
  curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' > /etc/apt/sources.list.d/nvidia-container-toolkit.list 2>/dev/null || true
  exec_cmd apt-get update -y
  exec_cmd env DEBIAN_FRONTEND=noninteractive apt-get install -y nvidia-container-toolkit 2>/dev/null || warn "Ручная установка toolkit: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html"
  exec_cmd nvidia-ctk runtime configure --runtime=docker 2>/dev/null || true
  ok "NVIDIA Container Toolkit настроен."
fi

step "6/10 —  CLI ()"
if command -v lms >/dev/null 2>&1; then
  ok "lms уже установлен."
elif [[ "$INSTALL_LMS" == "0" ]]; then
  warn "Установка lms пропущена (флаг --no-lms)."
else
  exec_cmd curl -fsSL https://lmstudio.ai/install | sh || warn "Автоустановка lms не удалась — CLI можно поставить позже из раздела «Модули»."
  ok " CLI готов."
fi

step "7/10 — Модули панели (образы ОС)"
if [[ "$PRELOAD_OS" == "1" ]] && command -v docker >/dev/null 2>&1; then
  IMAGES=( "dorowu/ubuntu-desktop-lxde-vnc:latest" "ghcr.io/linuxserver/webtop:debian-xfce" "kasmweb/kali-rolling-desktop:1.16.0" "ghcr.io/linuxserver/webtop:alpine-kde" "dockur/windows:xp" )
  for img in "\${IMAGES[@]}"; do
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

step "8/10 — Сборка панели"
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
  run_with_progress "npm ci (зависимости, ~1-3 мин на слабой сети)" \
    npm ci --no-audit --no-fund --loglevel=error --prefer-offline \
    --fetch-retries=3 --fetch-retry-mintimeout=1000 --fetch-retry-maxtimeout=5000 \
  || run_with_progress "npm install (запасной)" \
    npm install --no-audit --no-fund --loglevel=error --prefer-offline \
    --fetch-retries=3 --fetch-retry-mintimeout=1000 --fetch-retry-maxtimeout=5000
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

step "9/10 — Служба systemd"
if [[ -d /run/systemd/system ]]; then
  cat > /etc/systemd/system/fixcat.service <<EOF
[Unit]
Description=Fixcat OS Manager - Web Panel &  Control
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

step "10/10 — Готово"
LOCAL_IPS=($(hostname -I 2>/dev/null))
PUBLIC_IP=""
PUBLIC_IP=$(curl -fsS --max-time 4 https://ipinfo.io/ip 2>/dev/null || curl -fsS --max-time 4 https://ifconfig.me 2>/dev/null || echo "")
echo
ok "Установка Fixcat OS Manager завершена!"
echo
echo -e "   🌐 Ссылки для входа в веб-панель (порт $PORT):"
echo
echo -e "     • Локально (этот сервер):  http://localhost:$PORT"
for ip in $\{LOCAL_IPS[@]\}; do
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
`;
}

// Always export a reference so bundlers keep the module graph intact.
void broadcaster;