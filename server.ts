import express from 'express';
import http from 'http';
import os from 'os';
import fs from 'fs';
import path from 'path';
import net from 'net';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { exec, execSync, spawn } from 'child_process';
import { registerInstallerRoutes, getInstallerScript, getModuleImages } from './installer.ts';
import { registerHardwareRoutes } from './hardware.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Port is configurable: env PORT (set by installer's systemd unit / .env override)
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

// Ensure local data directory for Auth database
// Overridable via FIXCAT_DATA_DIR so the installer can point to /opt/fixcat-os-manager/data
const dataDir = process.env.FIXCAT_DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const usersDbFile = path.join(dataDir, 'users.json');

interface UserRecord {
  username: string;
  passwordHash: string;
  createdAt: string;
  role?: 'admin' | 'user';
  status?: 'active' | 'disabled';
  lastLoginAt?: string;
}

const appVersion = '2.8.0';

// Multi-session support: token -> username
const sessions = new Map<string, string>();

function getUsers(): UserRecord[] {
  try {
    if (fs.existsSync(usersDbFile)) {
      const content = fs.readFileSync(usersDbFile, 'utf-8');
      return JSON.parse(content);
    }
  } catch {
    // Read error fallback
  }
  return [];
}

function saveUsers(users: UserRecord[]) {
  fs.writeFileSync(usersDbFile, JSON.stringify(users, null, 2), 'utf-8');
}

function hashPassword(pass: string): string {
  return crypto.createHash('sha256').update(pass + 'fixcat-salt-2026').digest('hex');
}

// Resolve the currently logged-in username from the Authorization header
function currentUserFromReq(req: any): string | null {
  const tokenHeader = req.headers.authorization?.replace('Bearer ', '');
  if (!tokenHeader) return null;
  return sessions.get(tokenHeader) || null;
}

// API key grants full admin access over HTTP (used by remote panel nodes)
function isApiKeyAuthorized(req: any): boolean {
  if (!appConfig.apiKey) return false;
  const provided = req.headers['x-fixcat-api-key'] || req.headers['x-api-key'] || req.headers.authorization?.replace('Bearer ', '');
  return typeof provided === 'string' && provided === appConfig.apiKey;
}

// Resolve whether current request holds a real user session even if API key present
function sessionUserFromReq(req: any): string | null {
  const tokenHeader = req.headers.authorization?.replace('Bearer ', '');
  if (!tokenHeader) return null;
  const u = sessions.get(tokenHeader);
  return u || null;
}

// Auth middleware for protected APIs (session OR panel API key)
function requireAuth(req: any, res: any, next: () => void) {
  if (isApiKeyAuthorized(req)) {
    (req as any).username = 'api-key';
    return next();
  }
  const username = currentUserFromReq(req);
  if (!username) {
    return res.status(401).json({ error: 'Не авторизован. Выполните вход заново.' });
  }
  (req as any).username = username;
  next();
}

// Require admin role for user-management APIs (API key passes as admin)
export function requireAdmin(req: any, res: any, next: () => void) {
  if (isApiKeyAuthorized(req)) {
    (req as any).username = 'api-key';
    return next();
  }
  const username = currentUserFromReq(req);
  if (!username) return res.status(401).json({ error: 'Не авторизован.' });
  const user = getUsers().find((u) => u.username === username);
  if (!user || (user.role || 'admin') !== 'admin') {
    return res.status(403).json({ error: 'Требуются права администратора.' });
  }
  (req as any).username = username;
  next();
}

// Allow first-run bootstrap (no admins registered yet → open), else require admin.
// Used by installer / module management so a fresh panel can still be set up.
function allowBootstrapOrAdmin(req: any, res: any, next: () => void) {
  if (getUsers().length === 0) return next();
  return requireAdmin(req, res, next);
}

// In-memory event journal (last 150 events)
interface EventEntry {
  timestamp: string;
  type: string;
  message: string;
  container?: string;
  id?: string;
}

const eventLog: EventEntry[] = [];

export function recordEvent(type: string, message: string, container?: string, id?: string) {
  if (appConfig && appConfig.enableEventJournal === false) return;
  const entry: EventEntry = { timestamp: new Date().toISOString(), type, message };
  if (container) entry.container = container;
  if (id) entry.id = id;
  eventLog.unshift(entry);
  if (eventLog.length > 150) eventLog.length = 150;
}

// In-memory telemetry history for real system charts
interface MetricPoint {
  timestamp: string;
  time: string;
  hostCpu: number;
  hostRam: number;
  gpuUsage?: number[];
  containers: Record<string, { cpu: number; ramMb: number }>;
}

const telemetryHistory: MetricPoint[] = [];
const MAX_HISTORY = 40;

// User / Host configuration (persisted to settings.json)
let appConfig: Record<string, any> = {
  hostIp: 'localhost',
  dockerSocketPath: '/var/run/docker.sock',
  dockerTcpHost: '',
  autoDetectNoVnc: true,
  // ---- extended panel settings ----
  panelTitle: 'Fixcat OS Manager',
  language: 'ru',
  theme: 'dark',
  compactMode: false,
  animationsEnabled: true,
  maxHistoryPoints: 40,
  enableEventJournal: true,
  enableGpuTelemetry: true,
  statsEnabled: true,
  enableAutoUpdateCheck: true,
  updateChannel: 'main',
  logLevel: 'info',
  novncScaleMode: 'fit',
  autoOpenNovnc: true,
  defaultRestartPolicy: 'no',
  defaultResolution: '1920x1080',
  defaultRamMb: 2048,
  defaultCpuCores: 2,
  defaultOsTemplate: 'ubuntu',
  swapAutoCleanup: false,
  backupRetentionDays: 7,
  networkPollingEnabled: true,
  apiKey: '',
};

const settingsFile = path.join(dataDir, 'settings.json');

function loadAppConfig() {
  try {
    if (fs.existsSync(settingsFile)) {
      const saved = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
      appConfig = { ...appConfig, ...saved };
    }
  } catch {
    // Reset to defaults on corrupt file
  }
  if (!appConfig.apiKey) {
    appConfig.apiKey = crypto.randomBytes(24).toString('hex');
    saveAppConfig();
  }
}

function saveAppConfig() {
  try {
    fs.writeFileSync(settingsFile, JSON.stringify(appConfig, null, 2), 'utf-8');
  } catch {
    // No permission to persist — ignore
  }
}

loadAppConfig();

// Map OS image → internal noVNC web port + VNC port
function getImagePorts(image: string): { web: number; vnc: number } {
  const i = image.toLowerCase();
  if (i.includes('accetto')) return { web: 6901, vnc: 5901 };
  if (i.includes('kasmweb')) return { web: 6901, vnc: 5901 };
  if (i.includes('webtop')) return { web: 3000, vnc: 5900 };
  if (i.includes('dockur')) return { web: 8006, vnc: 5900 };
  return { web: 80, vnc: 5900 }; // generic VNC fallback
}

// Helper to query real GPU stats via nvidia-smi with Intel iGPU fallback
interface GpuInfo {
  id: number;
  name: string;
  usagePercent: number;
  vramUsedMb: number;
  vramTotalMb: number;
  vramPercent: number;
  temperatureC: number;
  powerWatts: number;
  driverVersion?: string;
}

const INTEL_IGPU_ARCH: Record<string, string> = {
  'Sandy Bridge':  'Intel HD Graphics (Sandy Bridge)',
  'Ivy Bridge':    'Intel HD Graphics 4000',
  'Haswell':       'Intel HD Graphics 4600',
  'Broadwell':     'Intel HD Graphics 5300/5500/6000',
  'Skylake':       'Intel HD Graphics 530',
  'Kaby Lake':     'Intel UHD Graphics 620',
  'Coffee Lake':   'Intel UHD Graphics 630',
  'Amber Lake':    'Intel UHD Graphics 620',
  'Whiskey Lake':  'Intel UHD Graphics 620',
  'Comet Lake':    'Intel UHD Graphics 630',
  'Ice Lake':      'Intel Iris Plus Graphics G4/G7',
  'Tiger Lake':    'Intel Iris Xe Graphics',
  'Alder Lake':    'Intel UHD Graphics 730/770',
  'Raptor Lake':   'Intel UHD Graphics 730/770',
  'Meteor Lake':   'Intel Arc Graphics',
  'Arrow Lake':    'Intel Arc Graphics',
  'Lunar Lake':    'Intel Arc Graphics 140V',
};

function readIntelGpuArch(): string | null {
  try {
    const cpuinfo = fs.readFileSync('/proc/cpuinfo', 'utf-8');
    const m = cpuinfo.match(/^model name\s*:\s*(.+)$/mi);
    if (!m) return null;
    const name = m[1];
    for (const arch of Object.keys(INTEL_IGPU_ARCH)) {
      if (name.includes(arch)) return arch;
    }
  } catch {}
  return null;
}

function readSysfsInt(filename: string): number | null {
  try {
    const v = parseInt(fs.readFileSync(filename, 'utf-8').trim(), 10);
    return isNaN(v) ? null : v;
  } catch { return null; }
}

function getIntelGpuInfo(): GpuInfo[] {
  const arch = readIntelGpuArch();
  if (!arch) return [];
  const gpuName = INTEL_IGPU_ARCH[arch];

  // Try to find DRM card path (e.g. /sys/class/drm/card0/device/)
  let drmBase = '';
  try {
    const cards = fs.readdirSync('/sys/class/drm');
    for (const c of cards) {
      if (!c.startsWith('card') || c.includes('-')) continue;
      const uevent = `/sys/class/drm/${c}/device/uevent`;
      try {
        const uev = fs.readFileSync(uevent, 'utf-8');
        if (uev.includes('8086')) { drmBase = `/sys/class/drm/${c}/device`; break; }
      } catch {}
    }
  } catch {}

  // Read frequency info
  let curFreq = readSysfsInt(`${drmBase}/gt_cur_freq_mhz`);
  const maxFreq = readSysfsInt(`${drmBase}/gt_max_freq_mhz`);
  // Fallback: /sys/kernel/gt/ on newer kernels
  if (curFreq === null) curFreq = readSysfsInt('/sys/kernel/gt/RP0_cur_freq_mhz');
  const maxFreqFallback = maxFreq ?? readSysfsInt('/sys/kernel/gt/RP0_max_freq_mhz');

  const usagePercent = (curFreq && maxFreqFallback)
    ? Math.min(100, Math.round((curFreq / maxFreqFallback) * 100))
    : 0;

  // Temperature from coretemp / hwmon
  let temperatureC = 0;
  try {
    const hwmons = fs.readdirSync('/sys/class/hwmon');
    for (const h of hwmons) {
      try {
        const name = fs.readFileSync(`/sys/class/hwmon/${h}/name`, 'utf-8').trim();
        if (name === 'coretemp') {
          const inputs = fs.readdirSync(`/sys/class/hwmon/${h}`).filter(f => f.startsWith('temp') && f.endsWith('_input'));
          if (inputs.length > 0) {
            const v = readSysfsInt(`/sys/class/hwmon/${h}/${inputs[0]}`);
            if (v !== null) { temperatureC = Math.round(v / 1000); break; }
          }
        }
      } catch {}
    }
  } catch {}

  // Shared memory: iGPU uses system RAM
  const totalMemMb = Math.round(os.totalmem() / (1024 * 1024));

  // Driver version from /sys
  let driverVersion = '';
  try {
    driverVersion = fs.readFileSync(`${drmBase}/driver/module/version`, 'utf-8').trim();
  } catch {}

  return [{
    id: 0,
    name: gpuName,
    usagePercent,
    vramUsedMb: 0,
    vramTotalMb: totalMemMb,
    vramPercent: 0,
    temperatureC,
    powerWatts: 0,
    driverVersion: driverVersion || undefined,
  }];
}

function getGpuStats(): Promise<GpuInfo[]> {
  return new Promise((resolve) => {
    exec(
      'nvidia-smi --query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw --format=csv,noheader,nounits',
      (err, stdout) => {
        if (!err && stdout) {
          const lines = stdout.trim().split('\n');
          const gpus: GpuInfo[] = lines.map((line, idx) => {
            const parts = line.split(',').map((s) => s.trim());
            const index = parseInt(parts[0], 10) || idx;
            const name = parts[1] || `NVIDIA GPU ${idx}`;
            const util = parseInt(parts[2], 10) || 0;
            const memUsed = parseInt(parts[3], 10) || 0;
            const memTotal = parseInt(parts[4], 10) || 16384;
            const temp = parseInt(parts[5], 10) || 40;
            const power = parseInt(parts[6], 10) || 50;

            return {
              id: index,
              name,
              usagePercent: util,
              vramUsedMb: memUsed,
              vramTotalMb: memTotal,
              vramPercent: Number(((memUsed / memTotal) * 100).toFixed(1)),
              temperatureC: temp,
              powerWatts: power,
            };
          });
          return resolve(gpus);
        }

        // No NVIDIA — try Intel iGPU
        const intelGpus = getIntelGpuInfo();
        resolve(intelGpus);
      }
    );
  });
}

// Helper to check if a TCP port is free on host (real connect probe; bind-probe
// lies inside proot/virtualized environments)
function isPortAvailable(port: number): Promise<boolean> {
  const hosts = new Set<string>(['127.0.0.1']);
  const ifs = os.networkInterfaces();
  for (const key of Object.keys(ifs)) {
    for (const a of ifs[key] || []) {
      if (a.family === 'IPv4' && !a.internal && a.address) hosts.add(a.address);
    }
  }
  return new Promise((resolve) => {
    let pending = hosts.size;
    let busy = false;
    if (pending === 0) return resolve(true);
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
      sock.once('connect', () => finish(false));
      sock.once('error', () => finish(true));
      sock.once('timeout', () => finish(true));
    }
  });
}

async function getAvailablePort(desiredPort: number): Promise<number> {
  let port = Math.max(1024, desiredPort);
  while (port < 65535) {
    const free = await isPortAvailable(port);
    if (free) {
      return port;
    }
    port++;
  }
  return desiredPort;
}

// Helper to query Docker Unix socket or TCP Host
function queryDockerSocket(pathStr: string, method = 'GET', postData?: any): Promise<{ statusCode: number; data: any }> {
  return new Promise((resolve, reject) => {
    const isTcp = appConfig.dockerTcpHost && appConfig.dockerTcpHost.startsWith('tcp://');
    let options: http.RequestOptions;

    if (isTcp) {
      const url = new URL(appConfig.dockerTcpHost.replace('tcp://', 'http://'));
      options = {
        hostname: url.hostname,
        port: url.port || 2375,
        path: pathStr,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Fixcat-OS-Manager/2.5',
        },
      };
    } else {
      options = {
        socketPath: appConfig.dockerSocketPath,
        path: pathStr,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Fixcat-OS-Manager/2.5',
        },
      };
    }

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        let parsedData = body;
        try {
          parsedData = JSON.parse(body);
        } catch {
          // Plain text response
        }
        resolve({ statusCode: res.statusCode || 500, data: parsedData });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }

    req.end();
  });
}

// Helper: Inspect Docker container ports and OS type
function detectOSAndVnc(container: any) {
  const name = (container.Names?.[0] || container.Id.slice(0, 12)).replace('/', '');
  const image = (container.Image || '').toLowerCase();
  const lowerName = name.toLowerCase();

  let type = 'linux';
  let displayName = 'Generic Linux OS';
  let distro = 'Linux';
  let version = 'Latest';
  let icon = 'linux';
  let desktopEnv = 'GUI';
  let vncPath = '/vnc.html?autoplay=true&reconnect=true';
  let resolution = '1920x1080';
  let description = 'Контейнер с графическим окружением';

  const labelOs = (container.Labels && (container.Labels['io.fixcat.os'] || container.Labels['fixcat.os'])) || '';
  const containerEnv: string[] = Array.isArray(container.Config?.Env) ? container.Config.Env : [];
  if (labelOs === 'windows' || ['windows-xp', 'windows-7', 'windows-8', 'windows-10', 'windows-11'].includes(labelOs) || image.includes('windows') || lowerName.includes('windows') || lowerName.includes('winxp')) {
    const versionTag = (containerEnv.find((e) => e.startsWith('VERSION=')) || '').split('=')[1] || '';
    if (labelOs === 'windows-11' || versionTag === '11') {
      type = 'windows-11';
      displayName = 'Windows 11 Pro';
      distro = 'Windows';
      version = '11 24H2';
      icon = 'windows-11';
      desktopEnv = 'Modern UI (Fluent)';
    } else if (labelOs === 'windows-10' || versionTag === '10') {
      type = 'windows-10';
      displayName = 'Windows 10 Pro';
      distro = 'Windows';
      version = '10 22H2';
      icon = 'windows-10';
      desktopEnv = 'Modern UI';
    } else if (labelOs === 'windows-8' || versionTag === '8e') {
      type = 'windows-8';
      displayName = 'Windows 8.1 Enterprise';
      distro = 'Windows';
      version = '8.1';
      icon = 'windows-8';
      desktopEnv = 'Modern UI (Metro)';
    } else if (labelOs === 'windows-7' || versionTag === '7u') {
      type = 'windows-7';
      displayName = 'Windows 7 Ultimate';
      distro = 'Windows';
      version = '7 SP1';
      icon = 'windows-7';
      desktopEnv = 'Aero / Basic';
    } else if (labelOs === 'windows-xp' || versionTag === 'xp') {
      type = 'windows-xp';
      displayName = 'Windows XP Professional SP3';
      distro = 'Windows';
      version = 'XP SP3';
      icon = 'windows-xp';
      desktopEnv = 'Luna Shell';
    } else {
      type = 'windows';
      displayName = 'Windows VM (dockur)';
      distro = 'Windows';
      version = 'Latest';
      icon = 'windows';
      desktopEnv = 'Desktop';
    }
    vncPath = '/';
    resolution = '1024x768';
    description = 'Windows в контейнере dockur со встроенным noVNC-просмотрщиком (порт 8006). ISO скачивается при первом запуске.';
  } else if (image.includes('ubuntu') || labelOs === 'ubuntu' || lowerName.includes('ubuntu')) {
    type = 'ubuntu';
    displayName = 'Ubuntu 24.04 LTS (XFCE)';
    distro = 'Ubuntu';
    version = '24.04 LTS';
    icon = 'ubuntu';
    desktopEnv = 'XFCE4';
    vncPath = image.includes('accetto') ? '/vnc.html?password=headless' : '/vnc.html?autoplay=true&reconnect=true';
    description = 'Настольный Ubuntu с XFCE и доступом через noVNC (логин/пароль: headless).';
  } else if (image.includes('debian') || lowerName.includes('debian')) {
    type = 'debian';
    displayName = 'Debian 12 Bookworm XFCE';
    distro = 'Debian';
    version = '12';
    icon = 'debian';
    desktopEnv = 'XFCE4';
    vncPath = '/';
    description = 'Надежная операционная система Debian Linux';
  } else if (image.includes('kali') || lowerName.includes('kali')) {
    type = 'kali';
    displayName = 'Kali Linux GUI Workstation';
    distro = 'Kali';
    version = 'Rolling';
    icon = 'kali';
    desktopEnv = 'XFCE4';
    if (image.includes('kasmweb')) vncPath = '/vnc.html?autoconnect=1&resize=scale&password=vncpasswd';
    description = 'Специализированная ОС для аудита и информационной безопасности';
  } else if (image.includes('alpine') || lowerName.includes('alpine')) {
    type = 'alpine';
    displayName = 'Alpine Linux Light Desktop';
    distro = 'Alpine';
    version = '3.19';
    icon = 'alpine';
    desktopEnv = 'Openbox / KDE';
    vncPath = '/';
    description = 'Минималистичный дистрибутив с низким потреблением RAM';
  }

  let noVncPort: number | null = null;
  const ports = container.Ports || [];

  if (Array.isArray(ports)) {
    const candidates = [80, 6080, 6081, 6082, 3000, 3001, 3002, 3003, 6901, 8006, 8007, 8080];
    for (const cand of candidates) {
      const p = ports.find((pt: any) => pt.PublicPort === cand || pt.PrivatePort === cand);
      if (p && p.PublicPort) {
        noVncPort = p.PublicPort;
        break;
      }
    }
    if (!noVncPort) {
      const anyPort = ports.find((pt: any) => pt.PublicPort && pt.PublicPort !== 5900 && pt.PublicPort !== 22);
      if (anyPort) {
        noVncPort = anyPort.PublicPort;
      }
    }
  }

  const host = appConfig.hostIp || 'localhost';
  const vncUrl = noVncPort ? `http://${host}:${noVncPort}${vncPath}` : null;

  return {
    type,
    displayName,
    distro,
    version,
    icon,
    desktopEnv,
    noVncPort,
    vncPath,
    vncUrl,
    resolution,
    description,
  };
}

// ==================== Container Port Placeholder ====================
// Stopped containers keep their published port "occupied". A tiny placeholder
// HTTP server answers on that port with a "container temporarily stopped" page,
// so a direct visit to http://host:PORT never shows a dead connection.
interface PortRegistryEntry { name: string; port: number; restart: string; managed: boolean }

const portRegistry = new Map<string, PortRegistryEntry>();
let portRegistryLoaded = false;

function loadPortRegistry() {
  if (portRegistryLoaded) return;
  portRegistryLoaded = true;
  try {
    const file = path.join(dataDir, 'ports.json');
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (parsed && typeof parsed === 'object') {
        for (const [id, entry] of Object.entries(parsed)) {
          const e = entry as any;
          if (e && e.port) {
            portRegistry.set(id, { name: String(e.name || id), port: Number(e.port), restart: String(e.restart || 'no'), managed: true });
          }
        }
      }
    }
  } catch { /* corrupt registry — reset */ }
}

function getRegistryByContainerId(id: string): { id: string; entry: PortRegistryEntry } | null {
  if (portRegistry.has(id)) return { id, entry: portRegistry.get(id)! };
  for (const [rid, entry] of portRegistry) {
    if (rid.startsWith(id) || id.startsWith(rid)) return { id: rid, entry };
  }
  return null;
}

function getRegistryByContainerName(name: string): PortRegistryEntry | null {
  for (const entry of portRegistry.values()) {
    if (entry.name === name) return entry;
  }
  return null;
}

function windowsVersionFromContainerName(name: string): string | null {
  const m = /^windows-(xp|7u|8e|10|11)(?:[._-]|$)/.exec(name || '');
  return m ? m[1] : null;
}

function kernelAtLeast(major: number, minor: number): boolean {
  const m = /^(\d+)\.(\d+)/.exec(os.release() || '');
  if (!m) return false;
  const M = Number(m[1]);
  const m2 = Number(m[2]);
  return M > major || (M === major && m2 >= minor);
}

// NVIDIA vs AMD/Intel DRI. NVIDIA must go through the container runtime
// (--gpus all / NVIDIA Container Toolkit), /dev/dri devices are not enough.
function hostGpuType(): 'nvidia' | 'dri' | null {
  try {
    const dir = '/dev/dri';
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) {
        if (!/^renderD\d{3}$/.test(f)) continue;
        try {
          const vendor = String(fs.readFileSync(`/sys/class/drm/${f}/device/vendor`, 'utf8')).trim().toLowerCase();
          if (vendor === '0x10de') return 'nvidia';
          if (vendor === '0x8086' || vendor === '0x1002') return 'dri';
        } catch { /* no sysfs entry for this node */ }
      }
    }
  } catch { /* no /dev/dri at all */ }
  if (fs.existsSync('/dev/nvidia0') || fs.existsSync('/usr/bin/nvidia-smi')) return 'nvidia';
  return null;
}

// A hard guarantee for GPU-enabled Windows deploys: refuse to start unless the
// host actually can drive hardware rendering (usable GPU present, Linux 6.13+
// for VirtIO host blobs/Venus, and a dockur image that is not the broken v6.05).
async function assertGpuSupported(image: string, gpuType: 'nvidia' | 'dri' | null): Promise<string | null> {
  if (!gpuType) {
    return 'GPU-ускорение запрошено, но на хосте не найдена видеокарта (нет /dev/dri и нет NVIDIA-устройств). Добавьте GPU или выключите GPU.';
  }
  if (!kernelAtLeast(6, 13)) {
    return `GPU-ускорение требует Linux ядро 6.13+ (VirtIO host blobs / Venus). Текущее ядро: ${os.release()}`;
  }
  if (gpuType === 'nvidia') {
    if (!fs.existsSync('/usr/bin/nvidia-smi') && !fs.existsSync('/proc/driver/nvidia/version')) {
      return 'NVIDIA GPU найдена, но на хосте нет драйвера NVIDIA (nvidia-smi / /proc/driver/nvidia отсутствуют). Установите драйвер NVIDIA и NVIDIA Container Toolkit.';
    }
  }
  try {
    const enc = encodeURIComponent(image);
    const { statusCode, data } = await queryDockerSocket(`/images/${enc}/json`, 'GET');
    if (statusCode === 200 && data?.Config?.Labels) {
      const ver = String(data.Config.Labels['org.opencontainers.image.version'] || '').trim();
      if (ver === '6.05') {
        return 'Образ dockurr/windows (v6.05) не поддерживает GPU-ускорение (битый путь «-device std»). Обновите образ dockur или выключите GPU.';
      }
    }
  } catch { /* image not pulled yet — allow, will be checked by the image itself */ }
  return null;
}

// dockur downloads the ISO into /storage (named *.iso). On container removal we
// keep that ISO in a per-version cache, so reinstalling the same Windows never
// re-downloads it — and the rest of the storage disk (64 GB overlay) is freed.
function seedWindowsIsoCache(storageDir: string, version: string) {
  try {
    const cache = path.join(dataDir, 'win-cache', version);
    if (!fs.existsSync(cache)) return;
    fs.mkdirSync(storageDir, { recursive: true });
    for (const f of fs.readdirSync(cache)) {
      if (!f.toLowerCase().endsWith('.iso')) continue;
      const dst = path.join(storageDir, f);
      if (!fs.existsSync(dst)) fs.copyFileSync(path.join(cache, f), dst);
    }
  } catch { /* best effort */ }
}

function cacheAndRemoveWindowsStorage(storageDir: string, version: string | null) {
  try {
    if (!fs.existsSync(storageDir)) return;
    if (version) {
      const cache = path.join(dataDir, 'win-cache', version);
      fs.mkdirSync(cache, { recursive: true });
      for (const f of fs.readdirSync(storageDir)) {
        if (!f.toLowerCase().endsWith('.iso')) continue;
        const dst = path.join(cache, f);
        if (!fs.existsSync(dst)) fs.renameSync(path.join(storageDir, f), dst);
      }
    }
    fs.rmSync(storageDir, { recursive: true, force: true });
  } catch { /* best effort */ }
}

function removeWindowsStorageByName(name: string) {
  if (!name) return;
  cacheAndRemoveWindowsStorage(
    path.join(dataDir, 'win-storage', name),
    windowsVersionFromContainerName(name)
  );
}

// Deletes leftover win-storage folders whose container is gone. Requires Docker
// to be reachable (otherwise it does nothing) and skips anything younger than
// 24h to never touch an in-progress deploy or a freshly renamed container.
async function sweepOrphanedWindowsStorage() {
  const root = path.join(dataDir, 'win-storage');
  if (!fs.existsSync(root)) return;
  let liveNames: string[] = [];
  try {
    const { statusCode, data } = await queryDockerSocket('/containers/json?all=1', 'GET');
    if (statusCode !== 200 || !Array.isArray(data)) return;
    liveNames = data.flatMap((c: any) => (c.Names || []).map((n: string) => n.replace(/^\//, '')));
  } catch {
    return;
  }
  const nameSet = new Set(liveNames);
  const now = Date.now();
  for (const dirName of fs.readdirSync(root)) {
    const dir = path.join(root, dirName);
    let st;
    try {
      st = fs.statSync(dir);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    if (nameSet.has(dirName)) continue;
    if (getRegistryByContainerName(dirName)) continue;
    if (now - st.mtimeMs < 24 * 60 * 60 * 1000) continue;
    cacheAndRemoveWindowsStorage(dir, windowsVersionFromContainerName(dirName));
  }
}

// Nightly-ish garbage collector for orphaned Windows storage folders.
setInterval(sweepOrphanedWindowsStorage, 60 * 60 * 1000).unref();

function savePortRegistry() {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    const obj: Record<string, any> = {};
    for (const [id, e] of portRegistry) obj[id] = { name: e.name, port: e.port, restart: e.restart };
    fs.writeFileSync(path.join(dataDir, 'ports.json'), JSON.stringify(obj, null, 2));
  } catch { /* ignore */ }
}

const placeholders = new Map<number, { server: http.Server; containerId: string; name: string }>();
const inspectPortCache = new Map<string, PortRegistryEntry | null>();

function placeholderPage(name: string, port: number, panelUrl: string): string {
  const safeName = name.replace(/[<>&"']/g, '');
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="refresh" content="5">
<title>${safeName} — Контейнер остановлен</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Segoe UI',system-ui,sans-serif; background:radial-gradient(circle at 20% 10%, #1b2a4a 0%, #0b1220 55%, #060a14 100%); min-height:100vh; display:flex; align-items:center; justify-content:center; color:#e2e8f0; padding:20px; }
  .card { background:rgba(15,23,42,0.85); border:1px solid rgba(148,163,184,0.15); border-radius:20px; padding:40px; max-width:440px; width:100%; text-align:center; box-shadow:0 25px 60px rgba(0,0,0,0.5); backdrop-filter:blur(8px); }
  .moon { width:64px; height:64px; margin:0 auto 20px; border-radius:50%; background:linear-gradient(135deg,#f59e0b,#d97706); animation:float 3s ease-in-out infinite; box-shadow:0 0 40px rgba(245,158,11,0.35); }
  @keyframes float { 0%,100%{ transform:translateY(0);} 50%{ transform:translateY(-8px);} }
  h1 { font-size:20px; font-weight:800; margin-bottom:8px; letter-spacing:-0.3px; }
  .name { color:#f59e0b; }
  h2 { font-size:15px; font-weight:600; color:#94a3b8; margin-bottom:16px; }
  p { font-size:13px; color:#94a3b8; line-height:1.6; }
  code { background:#0f172a; border:1px solid #1e293b; color:#7dd3fc; padding:2px 8px; border-radius:8px; font-size:12px; }
  .status { display:inline-flex; align-items:center; gap:8px; margin:18px 0; padding:8px 14px; border-radius:999px; background:rgba(245,158,11,0.12); border:1px solid rgba(245,158,11,0.3); color:#fcd34d; font-size:12px; font-weight:700; }
  .dot { width:8px; height:8px; border-radius:50%; background:#f59e0b; animation:pulse 1.2s infinite; }
  @keyframes pulse { 0%,100%{ opacity:1;} 50%{ opacity:0.3;} }
  a.btn { display:inline-block; margin-top:8px; padding:11px 22px; border-radius:12px; background:#2563eb; color:#fff; text-decoration:none; font-weight:700; font-size:13px; transition:background .2s; }
  a.btn:hover { background:#1d4ed8; }
  .hint { font-size:11px; color:#64748b; margin-top:16px; }
</style>
</head>
<body>
  <div class="card">
    <div class="moon"></div>
    <h1>Контейнер <span class="name">«${safeName}»</span></h1>
    <h2>временно остановлен</h2>
    <span class="status"><span class="dot"></span> Состояние: STOPPED</span>
    <p>Система выключена и занимает порт <code>:${port}</code>.<br>Обновите страницу через несколько секунд или</p>
    <a class="btn" href="${panelUrl}">Открыть Fixcat OS Manager</a>
    <p class="hint">Страница обновляется автоматически каждые 5 секунд и откроет ОС, как только контейнер будет запущен.</p>
  </div>
</body>
</html>`;
}

function bindPlaceholder(port: number, containerId: string, name: string): void {
  if (placeholders.has(port)) {
    const existing = placeholders.get(port)!;
    if (existing.containerId === containerId && existing.name === name) return;
    unbindPlaceholder(port);
  }
  try {
    const server = http.createServer((req, res) => {
      let hostname = 'localhost';
      try {
        hostname = new URL(`http://${req.headers.host}`).hostname;
      } catch { /* fallback to localhost */ }
      const panelUrl = `http://${hostname}:${PORT}`;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(placeholderPage(name, port, panelUrl));
    });
    server.on('error', () => {
      placeholders.delete(port);
    });
    server.listen(port, '0.0.0.0', () => {
      placeholders.set(port, { server, containerId, name });
    });
  } catch { /* binding failed — ignore */ }
}

function unbindPlaceholder(port: number): void {
  const p = placeholders.get(port);
  if (p) {
    placeholders.delete(port);
    try { p.server.close(); } catch { /* ignore */ }
  }
}

function unbindPlaceholderForContainer(id: string): void {
  for (const [port, p] of [...placeholders]) {
    if (p.containerId === id || p.containerId.startsWith(id) || id.startsWith(p.containerId)) unbindPlaceholder(port);
  }
}

async function resolveContainerPort(c: any): Promise<{ port: number; restart: string } | null> {
  // 1. reported runtime ports (running containers)
  if (Array.isArray(c.Ports) && c.Ports.length) {
    const candidates = [80, 6080, 6081, 6082, 3000, 3001, 3002, 3003, 6901, 8006, 8007, 8080];
    for (const cand of candidates) {
      const p = c.Ports.find((pt: any) => pt.PublicPort === cand || pt.PrivatePort === cand);
      if (p && p.PublicPort) return { port: p.PublicPort, restart: 'no' };
    }
    const anyP = c.Ports.find((pt: any) => pt.PublicPort && pt.PublicPort !== 5900 && pt.PublicPort !== 5901 && pt.PublicPort !== 22);
    if (anyP?.PublicPort) return { port: anyP.PublicPort, restart: 'no' };
    return null;
  }
  // 2. registry
  const reg = getRegistryByContainerId(c.Id);
  if (reg) return { port: reg.entry.port, restart: reg.entry.restart };
  // 3. lazy inspect (cached)
  if (inspectPortCache.has(c.Id)) {
    const cached = inspectPortCache.get(c.Id)!;
    return cached ? { port: cached.port, restart: cached.restart } : null;
  }
  try {
    const { statusCode, data } = await queryDockerSocket(`/containers/${c.Id}/json`);
    if (statusCode === 200 && data) {
      const bindings: Record<string, any> = data.HostConfig?.PortBindings || {};
      const restart = String(data.HostConfig?.RestartPolicy?.Name || 'no');
      const candidates = [80, 6080, 6081, 6082, 3000, 3001, 3002, 3003, 6901, 8006, 8007, 8080];
      let hostPort: number | null = null;
      for (const cand of candidates) {
        const hp = Number(bindings[`${cand}/tcp`]?.[0]?.HostPort);
        if (hp) { hostPort = hp; break; }
      }
      if (!hostPort) {
        for (const [containerPort, arr] of Object.entries(bindings)) {
          if (containerPort.includes('5900') || containerPort.includes('5901') || containerPort.includes('22')) continue;
          const hp = Number((arr as any)[0]?.HostPort);
          if (hp) { hostPort = hp; break; }
        }
      }
      const name = (c.Names?.[0] || '').replace(/^\//, '') || c.Id.slice(0, 12);
      const entry: PortRegistryEntry = { name, port: hostPort || 0, restart, managed: false };
      inspectPortCache.set(c.Id, hostPort ? entry : null);
      if (hostPort) {
        portRegistry.set(c.Id, entry);
        savePortRegistry();
        return { port: hostPort, restart };
      }
    }
  } catch { /* inspect failed */ }
  return null;
}

async function reconcilePlaceholders(rawContainers: any[]): Promise<void> {
  if (!Array.isArray(rawContainers)) return;
  const liveIds = new Set<string>();
  for (const c of rawContainers) {
    if (!c.Id) continue;
    liveIds.add(c.Id);
    const state = c.State || '';
    const running = ['running', 'paused', 'restarting'].includes(state);
    const resolved = await resolveContainerPort(c);
    if (!resolved || !resolved.port) continue;
    const name = (c.Names?.[0] || '').replace(/^\//, '') || c.Id.slice(0, 12);
    if (running) {
      unbindPlaceholder(resolved.port);
    } else if (state === 'exited' || state === 'dead' || state === 'created') {
      if (resolved.restart === 'no') {
        bindPlaceholder(resolved.port, c.Id, name);
      } else {
        unbindPlaceholder(resolved.port);
      }
    } else {
      unbindPlaceholder(resolved.port);
    }
  }
  for (const [port, p] of [...placeholders]) {
    if (!liveIds.has(p.containerId)) unbindPlaceholder(port);
  }
}

async function fetchAndReconcile(): Promise<void> {
  try {
    const { statusCode, data } = await queryDockerSocket('/containers/json?all=1');
    if (statusCode === 200 && Array.isArray(data)) await reconcilePlaceholders(data);
  } catch { /* docker unreachable */ }
}

setInterval(() => { fetchAndReconcile().catch(() => {}); }, 10000);

// Background metric recorder for REAL system stats
setInterval(async () => {
  if (!appConfig.statsEnabled) return;
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const hostRamPercent = Number(((usedMem / totalMem) * 100).toFixed(1));

  const cpus = os.cpus();
  const avgCpu = cpus.reduce((acc, cpu) => {
    const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
    return acc + ((total - cpu.times.idle) / total) * 100;
  }, 0) / (cpus.length || 1);

  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

  const containerStats: Record<string, { cpu: number; ramMb: number }> = {};
  let gpuUsages: number[] = [];
  if (appConfig.enableGpuTelemetry) {
    const gpus = await getGpuStats();
    gpuUsages = gpus.map((g) => g.usagePercent);
  }

  telemetryHistory.push({
    timestamp: now.toISOString(),
    time: timeStr,
    hostCpu: Number((avgCpu || 0).toFixed(1)),
    hostRam: hostRamPercent,
    gpuUsage: gpuUsages,
    containers: containerStats,
  });

  if (telemetryHistory.length > (appConfig.maxHistoryPoints || MAX_HISTORY)) {
    telemetryHistory.shift();
  }
}, 2000);

// --- AUTH & USER MANAGEMENT ENDPOINTS ---
app.get('/api/auth/status', (req, res) => {
  const users = getUsers();
  const username = currentUserFromReq(req);
  const isAuthenticated = Boolean(username);
  const user = isAuthenticated ? users.find((u) => u.username === username) : undefined;

  res.json({
    isRegistered: users.length > 0,
    isAuthenticated,
    username: isAuthenticated ? username : null,
    role: user?.role || null,
  });
});

app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Имя пользователя и пароль обязательны' });
  }

  const users = getUsers();
  if (users.length > 0) {
    return res.status(400).json({ error: 'Администратор уже зарегистрирован' });
  }

  const newUser: UserRecord = {
    username,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
    role: 'admin',
    status: 'active',
    lastLoginAt: new Date().toISOString(),
  };

  saveUsers([newUser]);
  const token = crypto.randomUUID();
  sessions.set(token, username);

  res.json({
    success: true,
    token,
    username,
    role: 'admin',
    message: 'Администратор Fixcat OS Manager успешно создан!',
  });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const users = getUsers();

  const user = users.find((u) => u.username === username && u.passwordHash === hashPassword(password));
  if (!user) {
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }
  if ((user.status || 'active') === 'disabled') {
    return res.status(403).json({ error: 'Учётная запись отключена администратором' });
  }

  user.lastLoginAt = new Date().toISOString();
  saveUsers(users);

  const token = crypto.randomUUID();
  sessions.set(token, username);

  res.json({
    success: true,
    token,
    username,
    role: user.role || 'user',
    message: 'Успешный вход в систему!',
  });
});

app.post('/api/auth/logout', (req, res) => {
  const tokenHeader = req.headers.authorization?.replace('Bearer ', '');
  if (tokenHeader) sessions.delete(tokenHeader);
  res.json({ success: true });
});

// List all users (admin only)
app.get('/api/users', requireAdmin, (req, res) => {
  const users = getUsers().map(({ passwordHash: _ph, ...u }) => ({ ...u }));
  res.json({ users });
});

// Create user (admin only)
app.post('/api/users', requireAdmin, (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Имя пользователя и пароль обязательны' });
  }
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
    return res.status(400).json({ error: 'Логин: 3-32 символа, только буквы, цифры, точка, дефис, подчёркивание' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'Пароль должен быть не короче 4 символов' });
  }

  const users = getUsers();
  if (users.some((u) => u.username === username)) {
    return res.status(409).json({ error: 'Пользователь с таким логином уже существует' });
  }

  const newUser: UserRecord = {
    username,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
    role: role === 'admin' ? 'admin' : 'user',
    status: 'active',
  };
  saveUsers([...users, newUser]);
  recordEvent('user', `Создан пользователь «${newUser.username}» (${role === 'admin' ? 'админ' : 'пользователь'})`);
  res.json({ success: true, user: { ...newUser, passwordHash: undefined } });
});

// Update user (admin only) — rename, password, role, status
app.put('/api/users/:username', requireAdmin, (req, res) => {
  const { username: current } = req.params;
  const { username: newName, password, role, status } = req.body;
  const me = (req as any).username as string;
  const users = getUsers();
  const idx = users.findIndex((u) => u.username === current);

  if (idx === -1) {
    return res.status(404).json({ error: 'Пользователь не найден' });
  }

  // Guards
  if (current === me && role && role !== 'admin') {
    return res.status(400).json({ error: 'Нельзя снять себе права администратора' });
  }
  if (current === me && status === 'disabled') {
    return res.status(400).json({ error: 'Нельзя отключить собственную учётную запись' });
  }
  if (users[idx].role === 'admin' && role !== 'admin' && users.filter((u) => (u.role || 'admin') === 'admin').length <= 1) {
    return res.status(400).json({ error: 'Нельзя удалить последнего администратора' });
  }

  if (newName && newName !== current) {
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(newName)) {
      return res.status(400).json({ error: 'Логин: 3-32 символа, только буквы, цифры, точка, дефис, подчёркивание' });
    }
    if (users.some((u) => u.username === newName)) {
      return res.status(409).json({ error: 'Пользователь с таким логином уже существует' });
    }
    users[idx].username = newName;
    // re-bind live session
    for (const [token, uname] of sessions.entries()) {
      if (uname === current) sessions.set(token, newName);
    }
  }

  if (password && password.length >= 4) {
    users[idx].passwordHash = hashPassword(password);
  }
  if (role === 'admin' || role === 'user') users[idx].role = role;
  if (status === 'active' || status === 'disabled') users[idx].status = status;

  saveUsers(users);
  recordEvent('user', `Обновлён пользователь «${users[idx].username}»`);
  res.json({ success: true, user: { ...users[idx], passwordHash: undefined } });
});

// Delete user (admin only) — cannot delete self or last admin
app.delete('/api/users/:username', requireAdmin, (req, res) => {
  const { username } = req.params;
  const me = (req as any).username as string;
  const users = getUsers();
  const idx = users.findIndex((u) => u.username === username);

  if (idx === -1) {
    return res.status(404).json({ error: 'Пользователь не найден' });
  }
  if (username === me) {
    return res.status(400).json({ error: 'Нельзя удалить собственную учётную запись' });
  }
  if (users[idx].role === 'admin' && users.filter((u) => (u.role || 'admin') === 'admin').length <= 1) {
    return res.status(400).json({ error: 'Нельзя удалить последнего администратора' });
  }

  const [removed] = users.splice(idx, 1);
  for (const [token, uname] of sessions.entries()) {
    if (uname === removed.username) sessions.delete(token);
  }
  saveUsers(users);
  recordEvent('user', `Удалён пользователь «${removed.username}»`);
  res.json({ success: true, deleted: removed.username });
});

// Change own password (any authenticated user)
app.post('/api/auth/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const me = (req as any).username as string;
  const users = getUsers();
  const idx = users.findIndex((u) => u.username === me);

  if (idx === -1) return res.status(404).json({ error: 'Пользователь не найден' });
  if (users[idx].passwordHash !== hashPassword(String(currentPassword || ''))) {
    return res.status(400).json({ error: 'Текущий пароль неверен' });
  }
  if (!newPassword || String(newPassword).length < 4) {
    return res.status(400).json({ error: 'Новый пароль должен быть не короче 4 символов' });
  }

  users[idx].passwordHash = hashPassword(String(newPassword));
  saveUsers(users);
  res.json({ success: true, message: 'Пароль успешно изменён' });
});

// Backup users database (admin only)
app.get('/api/users/backup', requireAdmin, (req, res) => {
  const users = getUsers();
  const backup = {
    app: 'Fixcat OS Manager',
    version: appVersion,
    exportedAt: new Date().toISOString(),
    count: users.length,
    users: users.map(({ passwordHash: _ph, ...u }) => ({ ...u })),
  };
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="fixcat-users-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.send(JSON.stringify(backup, null, 2));
});

// --- INSTALLER & EXPORT KIT ENDPOINTS ---
app.get('/api/installer/check-requirements', async (req, res) => {
  const gpus = await getGpuStats();
  const socketExists = fs.existsSync(appConfig.dockerSocketPath);
  const totalMemGb = Number((os.totalmem() / (1024 * 1024 * 1024)).toFixed(1));
  const freeMemGb = Number((os.freemem() / (1024 * 1024 * 1024)).toFixed(1));
  const port3000Available = await isPortAvailable(3000);

  const totalVramMb = gpus.reduce((acc, g) => acc + (g.vramTotalMb || 0), 0);

  res.json({
    os: `${os.type()} ${os.platform()} ${os.arch()}`,
    kernel: os.release(),
    nodeVersion: process.version,
    dockerActive: socketExists,
    dockerSocketPath: appConfig.dockerSocketPath,
    gpuDetected: gpus.length > 0,
    gpuCount: gpus.length,
    gpuModels: gpus.map((g) => g.name),
    vramTotalGb: Number((totalVramMb / 1024).toFixed(1)),
    memoryTotalGb: totalMemGb,
    memoryFreeGb: freeMemGb,
    port3000Free: port3000Available,
    readyForInstallation: true,
  });
});

app.get('/api/installer/export-kit', async (req, res) => {
  const gpus = await getGpuStats();

  res.json({
    app: {
      name: 'Fixcat OS Manager',
      version: '2.5.0',
      description: 'Автономная веб-панель управления операционными системами Docker, noVNC и контейнерами',
    },
    system: {
      nodeVersion: process.version,
      platform: os.platform(),
      arch: os.arch(),
      gpusCount: gpus.length,
    },
    installerScripts: {
      bash: '/api/installer/script',
      dockerCompose: '/docker-compose.yml',
      manifest: '/installer-manifest.json',
    },
  });
});

app.get('/api/installer/script', (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="fixcat-install.sh"`);
  res.send(getInstallerScript());
});


// --- API ENDPOINTS ---

// 1. Real System specs, host status & GPU info
// Aggregate real disk usage for the root filesystem
function getDiskUsage() {
  try {
    const s = fs.statfsSync('/');
    const total = s.bsize * s.blocks;
    const free = s.bsize * s.bavail;
    const used = total - free;
    return {
      total,
      used,
      free,
      percent: total > 0 ? Number(((used / total) * 100).toFixed(1)) : 0,
    };
  } catch {
    return null;
  }
}

// Aggregate real network RX/TX totals from /proc/net/dev
function getNetworkTotals() {
  let rx = 0;
  let tx = 0;
  try {
    const content = fs.readFileSync('/proc/net/dev', 'utf-8');
    for (const line of content.split('\n').slice(2)) {
      const m = line.trim().match(/^([\w.-]+):\s+(\d+)\s+(\d+).*?(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/);
      if (!m) continue;
      const iface = m[1];
      if (iface === 'lo' || iface === 'docker0' || iface?.startsWith('veth') || iface?.startsWith('br-')) continue;
      rx += parseInt(m[2], 10) || 0;
      tx += parseInt(m[10], 10) || 0;
    }
  } catch {
    // ignore
  }
  return { rx, tx };
}

app.get('/api/system', requireAuth, async (req, res) => {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const socketExists = fs.existsSync(appConfig.dockerSocketPath);
  const gpus = await getGpuStats();

  res.json({
    app: { name: 'Fixcat OS Manager', version: appVersion },
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    release: os.release(),
    uptime: os.uptime(),
    cpus: {
      count: cpus.length,
      model: cpus[0]?.model || 'Processor',
      speed: cpus[0]?.speed || 0,
    },
    memory: {
      total: totalMem,
      free: freeMem,
      used: usedMem,
      percent: Number(((usedMem / totalMem) * 100).toFixed(1)),
    },
    disk: getDiskUsage(),
    network: getNetworkTotals(),
    gpus,
    loadAvg: os.loadavg(),
    networkInterfaces: os.networkInterfaces(),
    processMemory: process.memoryUsage(),
    docker: {
      socketPath: appConfig.dockerSocketPath,
      socketAvailable: socketExists,
      tcpHost: appConfig.dockerTcpHost,
      mode: socketExists || appConfig.dockerTcpHost ? 'connected' : 'disconnected',
    },
    config: appConfig,
    apiKey: appConfig.apiKey || null,
    nodes: nodes.map((n) => ({
      id: n.id,
      name: n.name,
      ip: n.ip,
      port: n.port,
      createdAt: n.createdAt,
      status: nodeStatuses.get(n.id) || { online: false, checkedAt: null },
    })),
  });
});

// 2. Free Port Scanner Endpoint
app.get('/api/ports/next', requireAuth, async (req, res) => {
  const desired = parseInt(req.query.desired as string, 10) || 6082;
  const freePort = await getAvailablePort(desired);
  const freeVncPort = await getAvailablePort(freePort + 100);
  res.json({
    requestedPort: desired,
    freePort,
    freeVncPort,
  });
});

// 3. List REAL OS Containers
app.get('/api/containers', requireAuth, async (req, res) => {
  try {
    const { statusCode, data } = await queryDockerSocket('/containers/json?all=1');
    if (statusCode === 200 && Array.isArray(data)) {
      const enriched = await Promise.all(
        data.map(async (c: any) => {
          // For stopped containers Docker reports no runtime ports — restore the
          // configured port from our registry so noVNC links and placeholder
          // occupancy keep working.
          if (c.State !== 'running' && (!Array.isArray(c.Ports) || c.Ports.length === 0)) {
            const resolved = await resolveContainerPort(c);
            if (resolved?.port) {
              c.Ports = [{ PublicPort: resolved.port, PrivatePort: 80, Type: 'tcp' }];
            }
          }

          const osInfo = detectOSAndVnc(c);

          let stats = {
            cpuPercent: 0,
            memoryUsage: 0,
            memoryLimit: 1024 * 1024 * 1024,
            memoryPercent: 0,
            networkRx: 0,
            networkTx: 0,
            blockRead: 0,
            blockWrite: 0,
            pids: 0,
          };

          if (c.State === 'running') {
            try {
              const statRes = await queryDockerSocket(`/containers/${c.Id}/stats?stream=false`);
              if (statRes.statusCode === 200 && statRes.data) {
                const s = statRes.data;
                const cpuDelta = (s.cpu_stats?.cpu_usage?.total_usage || 0) - (s.precpu_stats?.cpu_usage?.total_usage || 0);
                const systemDelta = (s.cpu_stats?.system_cpu_usage || 0) - (s.precpu_stats?.system_cpu_usage || 0);
                const numCpus = s.cpu_stats?.online_cpus || s.cpu_stats?.cpu_usage?.percpu_usage?.length || 1;
                let cpuPercent = 0;
                if (systemDelta > 0 && cpuDelta > 0) {
                  cpuPercent = Number(((cpuDelta / systemDelta) * numCpus * 100).toFixed(1));
                }

                const memUsage = s.memory_stats?.usage || 0;
                const memLimit = s.memory_stats?.limit || 1;
                const memPercent = Number(((memUsage / memLimit) * 100).toFixed(1));

                let rx = 0, tx = 0;
                if (s.networks) {
                  Object.values(s.networks).forEach((net: any) => {
                    rx += net.rx_bytes || 0;
                    tx += net.tx_bytes || 0;
                  });
                }

                stats = {
                  cpuPercent,
                  memoryUsage: memUsage,
                  memoryLimit: memLimit,
                  memoryPercent: memPercent,
                  networkRx: rx,
                  networkTx: tx,
                  blockRead: 0,
                  blockWrite: 0,
                  pids: s.pids_stats?.current || 0,
                };
              }
            } catch {
              // Ignore stats error
            }
          }

          return {
            ...c,
            osInfo,
            stats,
            isRealDocker: true,
          };
        })
      );

      reconcilePlaceholders(data).catch(() => {});

      return res.json({
        source: 'real_docker',
        containers: enriched,
      });
    }
  } catch (err: any) {
    // Docker socket unreachable
  }

  return res.json({
    source: 'docker_disconnected',
    message: `Сокет Docker не найден по пути "${appConfig.dockerSocketPath}".`,
    containers: [],
  });
});

// 4. Container Actions
app.post('/api/containers/:id/action', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { action } = req.body;

  try {
    // Free the placeholder so Docker can take back the port when starting/restarting.
    unbindPlaceholderForContainer(id);

    let dockerMethod = 'POST';
    let dockerPath = `/containers/${id}/${action}`;

    if (action === 'remove') {
      dockerMethod = 'DELETE';
      dockerPath = `/containers/${id}?force=1`;
    }

    const { statusCode, data } = await queryDockerSocket(dockerPath, dockerMethod);
    if (statusCode < 300) {
      if (action === 'remove') {
        const reg = getRegistryByContainerId(id);
        if (reg) {
          portRegistry.delete(reg.id);
          savePortRegistry();
        }
        removeWindowsStorageByName(reg?.entry?.name || '');
        try {
          await queryDockerSocket('/images/prune', 'POST', { filters: { dangling: { true: true } } });
        } catch { /* best effort */ }
      }
      recordEvent('action', `Действие «${action}» выполнено`, id.slice(0, 12), id);
      return res.json({ success: true, message: `Действие "${action}" успешно выполнено.` });
    } else {
      return res.status(400).json({ error: data?.message || `Ошибка выполнения "${action}" в Docker.` });
    }
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Ошибка подключения к сокету Docker.' });
  }
});

// 5. Container Logs
app.get('/api/containers/:id/logs', requireAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const { statusCode, data } = await queryDockerSocket(`/containers/${id}/logs?stdout=1&stderr=1&tail=150`);
    if (statusCode === 200) {
      return res.json({ logs: typeof data === 'string' ? data : JSON.stringify(data, null, 2) });
    }
  } catch (err: any) {
    return res.status(400).json({ logs: `Не удалось получить логи: ${err.message}` });
  }

  res.status(404).json({ logs: 'Логи контейнера недоступны.' });
});

// 4b. Rename Container
app.post('/api/containers/:id/rename', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name } = req.body || {};
  if (!name || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,63}$/.test(name)) {
    return res.status(400).json({ error: 'Новое имя: 3-64 символа, буквы/цифры/точка/дефис/подчёркивание, первым символом буква или цифра' });
  }
  try {
    const { statusCode, data } = await queryDockerSocket(`/containers/${id}/rename?name=${encodeURIComponent(name)}`, 'POST');
    if (statusCode < 300) {
      recordEvent('rename', `Контейнер переименован в «${name}»`, id.slice(0, 12), id);
      return res.json({ success: true, message: `Контейнер переименован в "${name}".` });
    }
    return res.status(statusCode).json({ error: data?.message || 'Не удалось переименовать контейнер.' });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Ошибка Docker сокета.' });
  }
});

// 4c. Docker Version + Info (dashboard for diagnostics)
app.get('/api/docker/info', requireAuth, async (req, res) => {
  try {
    const [verRes, infoRes] = await Promise.all([
      queryDockerSocket('/version'),
      queryDockerSocket('/info'),
    ]);
    if (verRes.statusCode === 200 && infoRes.statusCode === 200) {
      const v = verRes.data || {};
      const i = infoRes.data || {};
      return res.json({
        connected: true,
        version: v.Version,
        apiVersion: v.ApiVersion,
        os: `${i.OperatingSystem} (${i.Architecture || i.Arch})`,
        kernel: v.KernelVersion,
        containers: {
          total: i.Containers ?? 0,
          running: i.ContainersRunning ?? 0,
          paused: i.ContainersPaused ?? 0,
          stopped: i.ContainersStopped ?? 0,
        },
        images: i.Images ?? 0,
        dockerRootDir: i.DockerRootDir,
        memoryTotalMb: i.MemTotal ? Math.round(i.MemTotal / 1048576) : null,
        serverTime: i.ServerTime,
      });
    }
    return res.status(400).json({ connected: false, error: 'Docker сокет недоступен' });
  } catch (err: any) {
    return res.status(400).json({ connected: false, error: err.message || 'Ошибка Docker сокета.' });
  }
});

// 4d. API Health check
app.get('/api/health', async (req, res) => {
  const socketExists = fs.existsSync(appConfig.dockerSocketPath);
  res.json({
    status: 'ok',
    app: appVersion,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    docker: {
      socketAvailable: socketExists,
      socketPath: appConfig.dockerSocketPath,
      mode: socketExists || appConfig.dockerTcpHost ? 'connected' : 'disconnected',
    },
  });
});

// 4e. Local Docker images list (for deploy-by-image)
app.get('/api/images', requireAuth, async (req, res) => {
  try {
    const { statusCode, data } = await queryDockerSocket('/images/json?all=0');
    if (statusCode === 200 && Array.isArray(data)) {
      const images = data
        .map((img: any) => {
          const tag = img.RepoTags?.[0] || `${img.Id.slice(0, 12)}:latest`;
          const [repo, tagName] = tag.split(':');
          return {
            id: img.Id,
            repo,
            tag: tagName || 'latest',
            size: img.Size || 0,
            created: img.Created,
          };
        })
        .sort((a: any, b: any) => a.repo.localeCompare(b.repo));
      return res.json({ images });
    }
    return res.status(400).json({ error: 'Docker сокет недоступен', images: [] });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Ошибка Docker сокета.', images: [] });
  }
});

// 4f. Event journal (recent panel activity)
app.get('/api/events', requireAuth, async (req, res) => {
  let dockerEvents: any[] = [];
  try {
    const { statusCode, data } = await queryDockerSocket('/events?since=' + Math.floor(Date.now() / 1000 - 300), 'GET');
    if (statusCode === 200 && Array.isArray(data)) {
      dockerEvents = data
        .filter((e: any) => ['container', 'image'].includes(e.Type))
        .slice(-30)
        .map((e: any) => ({
          timestamp: new Date((e.time || 0) * 1000).toISOString(),
          type: `docker-${e.Action || 'event'}`,
          message: `${e.Type === 'container' ? 'Контейнер' : 'Образ'} ${e.Actor?.Attributes?.name ? `«${e.Actor.Attributes.name}»` : (e.id?.slice?.(0, 12) || '')}: ${e.Action || 'событие'}`,
          container: e.Actor?.Attributes?.name,
          id: e.id,
        }));
    }
  } catch { /* ignore docker event errors — panel journal still works */ }
  res.json({ events: [...dockerEvents, ...eventLog].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 100) });
});

// 4g. Config backup / restore (download JSON, apply JSON)
app.get('/api/config/backup', requireAdmin, (req, res) => {
  res.json({ success: true, config: appConfig, exportedAt: new Date().toISOString(), appVersion });
});

app.post('/api/config/restore', requireAdmin, (req, res) => {
  const cfg = req.body?.config;
  if (!cfg || typeof cfg !== 'object') {
    return res.status(400).json({ error: 'Отсутствует блок "config" в загруженном файле.' });
  }
  for (const key of Object.keys(cfg)) {
    if (key in appConfig) {
      appConfig[key] = cfg[key];
    }
  }
  saveAppConfig();
  recordEvent('config', 'Конфигурация восстановлена из бэкапа');
  res.json({ success: true, config: appConfig, message: 'Конфигурация успешно применена.' });
});

// 5b. Container Inspect (full Docker metadata)
app.get('/api/containers/:id/inspect', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const { statusCode, data } = await queryDockerSocket(`/containers/${id}/json`);
    if (statusCode === 200) {
      return res.json({ inspect: data });
    }
    return res.status(statusCode).json({ error: data?.message || 'Контейнер не найден' });
  } catch (err: any) {
    return res.status(400).json({ error: `Не удалось получить данные контейнера: ${err.message}` });
  }
});

// 5c. Autostart (restart policy) management
const RESTART_POLICIES = ['no', 'always', 'unless-stopped', 'on-failure'];

app.get('/api/autostarts', requireAuth, async (req, res) => {
  try {
    const { statusCode, data } = await queryDockerSocket('/containers/json?all=1');
    if (statusCode === 200 && Array.isArray(data)) {
      const entries = await Promise.all(
        data.map(async (c: any) => {
          let policy = 'no';
          let retries = 0;
          try {
            const insp = await queryDockerSocket(`/containers/${c.Id}/json`);
            if (insp.statusCode === 200 && insp.data?.HostConfig?.RestartPolicy) {
              const rp = insp.data.HostConfig.RestartPolicy;
              policy = rp?.Name || 'no';
              retries = rp?.MaximumRetryCount || 0;
            }
          } catch {}
          return {
            id: c.Id,
            name: (c.Names?.[0] || c.Id).replace('/', ''),
            image: c.Image,
            state: c.State,
            status: c.Status,
            policy,
            retries,
          };
        })
      );
      return res.json({ entries });
    }
  } catch (err: any) {
    return res.status(400).json({ error: `Docker недоступен: ${err.message}` });
  }
  return res.status(400).json({ error: 'Docker сокет недоступен', entries: [] });
});

// Bulk apply autostart policy to all (or filtered) containers
app.post('/api/autostarts/bulk', requireAdmin, async (req, res) => {
  const { policy, state } = req.body || {};
  if (!RESTART_POLICIES.includes(policy)) {
    return res.status(400).json({ error: `Недопустимая политика: "${policy}".` });
  }
  try {
    const { statusCode, data } = await queryDockerSocket('/containers/json?all=1');
    if (statusCode !== 200 || !Array.isArray(data)) {
      return res.status(400).json({ error: 'Docker сокет недоступен' });
    }
    let targets = data;
    if (state === 'running') targets = data.filter((c: any) => c.State === 'running');
    if (state === 'stopped') targets = data.filter((c: any) => c.State !== 'running');

    let updated = 0;
    let failed = 0;
    for (const c of targets) {
      try {
        const r = await queryDockerSocket(`/containers/${c.Id}/update`, 'POST', {
          RestartPolicy: { Name: policy, MaximumRetryCount: policy === 'on-failure' ? 5 : 0 },
        });
        if (r.statusCode < 300) updated++;
        else failed++;
      } catch {
        failed++;
      }
    }
    return res.json({
      success: true,
      updated,
      failed,
      total: targets.length,
      policy,
      message: `Политика "${policy}" применена к ${updated} контейнер(ам).${failed ? ` Ошибок: ${failed}.` : ''}`,
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Ошибка Docker сокета.' });
  }
});

app.post('/api/autostarts/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { policy } = req.body || {};
  if (!RESTART_POLICIES.includes(policy)) {
    return res.status(400).json({ error: `Недопустимая политика: "${policy}". Допустимо: ${RESTART_POLICIES.join(', ')}` });
  }
  try {
    const { statusCode, data } = await queryDockerSocket(`/containers/${id}/update`, 'POST', {
      RestartPolicy: { Name: policy, MaximumRetryCount: policy === 'on-failure' ? 5 : 0 },
    });
    if (statusCode < 300) {
      recordEvent('autostart', `Политика автозапуска → «${policy}»`, id.slice(0, 12), id);
      return res.json({ success: true, message: `Автозапуск контейнера установлен: "${policy}".` });
    }
    return res.status(statusCode).json({ error: data?.message || 'Не удалось обновить политику перезапуска.' });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Ошибка Docker сокета.' });
  }
});

app.delete('/api/autostarts/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const { statusCode, data } = await queryDockerSocket(`/containers/${id}/update`, 'POST', {
      RestartPolicy: { Name: 'no', MaximumRetryCount: 0 },
    });
    if (statusCode < 300) {
      recordEvent('autostart', 'Автозапуск отключён (no)', id.slice(0, 12), id);
      return res.json({ success: true, message: 'Автозапуск удалён (политика "no").' });
    }
    return res.status(statusCode).json({ error: data?.message || 'Не удалось удалить автозапуск.' });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Ошибка Docker сокета.' });
  }
});

// 6. Historical telemetry metrics
app.get('/api/stats/history', requireAuth, (req, res) => {
  res.json({
    history: telemetryHistory,
  });
});

// 7. Settings and Docker Config
app.get('/api/config', requireAuth, (req, res) => {
  res.json(appConfig);
});

// Regenerate panel API key (used for node integration)
app.post('/api/config/api-key', requireAdmin, (_req, res) => {
  appConfig.apiKey = crypto.randomBytes(24).toString('hex');
  saveAppConfig();
  recordEvent('config', 'API ключ интегрии перегенерирован');
  res.json({ success: true, apiKey: appConfig.apiKey, message: 'API ключ обновлён. Обновите его в подключённых узлах.' });
});

app.post('/api/config', requireAdmin, (req, res) => {
  const body = req.body || {};
  const protectedKeys = new Set(['apiKey']);
  // Whitelist-style update: apply only known keys
  for (const key of Object.keys(body)) {
    if (protectedKeys.has(key)) continue;
    if (key in appConfig) {
      appConfig[key] = body[key];
    }
  }
  // Normalise numeric/bool fields
  if (appConfig.maxHistoryPoints) appConfig.maxHistoryPoints = Math.max(5, Math.min(200, Number(appConfig.maxHistoryPoints) || 40));
  if (appConfig.defaultRamMb) appConfig.defaultRamMb = Math.max(256, Number(appConfig.defaultRamMb) || 2048);
  if (appConfig.defaultCpuCores) appConfig.defaultCpuCores = Math.max(1, Number(appConfig.defaultCpuCores) || 2);
  for (const b of ['autoDetectNoVnc', 'compactMode', 'animationsEnabled', 'enableEventJournal', 'enableGpuTelemetry', 'statsEnabled', 'enableAutoUpdateCheck', 'autoOpenNovnc', 'swapAutoCleanup', 'networkPollingEnabled']) {
    appConfig[b] = Boolean(appConfig[b]);
  }
  saveAppConfig();
  recordEvent('config', 'Настройки панели обновлены');
  res.json({ success: true, config: appConfig });
});

// 8. FULL AUTOMATED Deploy OS Container with FREE PORT AUTO-DISCOVERY
app.post('/api/containers/create', requireAdmin, async (req, res) => {
  const { osType, containerName, vncPort, ramMb, cpuCores, resolution, restartPolicy } = req.body;
  // Deploy from arbitrary/custom image (overrides template mapping)
  let customImageName: string | null = null;
  let customWebPort: number | null = null;
  let customVncPort: number | null = null;
  if (req.body.image) {
    customImageName = String(req.body.image).trim();
    customWebPort = req.body.webPort ? parseInt(req.body.webPort, 10) : null;
    customVncPort = req.body.vncPortInternal ? parseInt(req.body.vncPortInternal, 10) : null;
  }

  const requestedPort = parseInt(vncPort, 10) || 6082;
  const actualPort = await getAvailablePort(requestedPort);
  const actualVncPort = await getAvailablePort(actualPort + 100);

  const name = containerName || `${osType || appConfig.defaultOsTemplate || 'ubuntu'}-desktop-${Math.floor(Math.random() * 900 + 100)}`;

  let image = 'accetto/ubuntu-vnc-xfce-g3';
  const windowsVersions: Record<string, string> = { 'windows-xp': 'xp', 'windows-7': '7u', 'windows-8': '8e', 'windows-10': '10', 'windows-11': '11' };
  const windowsVersion = customImageName ? '' : windowsVersions[osType] || '';
  if (customImageName) {
    image = customImageName;
  } else {
    if (windowsVersion) image = 'dockurr/windows:6.04';
    if (osType === 'ubuntu') image = 'accetto/ubuntu-vnc-xfce-g3';
    if (osType === 'debian') image = 'ghcr.io/linuxserver/webtop:debian-xfce';
    if (osType === 'kali') image = 'kasmweb/kali-rolling-desktop:1.16.0';
    if (osType === 'alpine') image = 'ghcr.io/linuxserver/webtop:alpine-kde';
  }

  // dockur Windows VM: VERSION + RAM/CPU + GPU + virtio drivers + KVM devices
  const isWindows = Boolean(windowsVersion);
  const ramMbVal = parseInt(ramMb, 10) || appConfig.defaultRamMb || 2048;
  const ramGb = Math.max(1, Math.ceil(ramMbVal / 1024));
  const cpuVal = parseInt(cpuCores, 10) || appConfig.defaultCpuCores || 2;
  let extraEnv = '';
  let gpuEnabled = false;
  let gpuType: 'nvidia' | 'dri' | null = null;
  let extraDevices = '';
  let extraVolumes = '';
  let rdpHostPort: number | null = null;
  const winDeviceList: string[] = [];
  if (isWindows) {
    const kvmTunDevices = ['/dev/kvm', '/dev/net/tun'];
    gpuType = hostGpuType();
    const driDevices = gpuType === 'dri' ? ['/dev/dri/card0', '/dev/dri/renderD128'] : [];
    for (const dev of [...kvmTunDevices, ...driDevices]) {
      if (fs.existsSync(dev) && !winDeviceList.includes(dev)) {
        winDeviceList.push(dev);
        extraDevices += ` --device=${dev}`;
      }
    }
    gpuEnabled = req.body.gpu === true || (req.body.gpu !== false && !!gpuType);
    if (gpuEnabled) {
      const gpuError = await assertGpuSupported(image, gpuType);
      if (gpuError) return res.status(400).json({ error: gpuError });
    }
    if (gpuEnabled && gpuType === 'nvidia') {
      extraDevices += ' --gpus all';
    }
    extraEnv = ` -e VERSION=${windowsVersion} -e RAM_SIZE=${ramGb}G -e CPU_CORES=${cpuVal} -e GPU=${gpuEnabled ? 'Y' : 'N'} -e DRIVERS=https://fedoraproject.org/wiki/Windows_Virtio_Drivers`;
    extraDevices += ' --cap-add NET_ADMIN --stop-timeout 120';
    const storageDir = path.join(dataDir, 'win-storage', name);
    try {
      fs.mkdirSync(storageDir, { recursive: true });
    } catch { /* host fs may be readonly */ }
    seedWindowsIsoCache(storageDir, windowsVersion);
    extraVolumes = ` -v "${storageDir}:/storage"`;
    rdpHostPort = await getAvailablePort(actualVncPort + 100);
  }

  // Different images expose noVNC/VNC on different container ports
  const imgPorts =
    customImageName && customWebPort && customVncPort
      ? { web: customWebPort, vnc: customVncPort }
      : getImagePorts(image);

  const memArg = isWindows ? `${ramGb}g` : `${ramMbVal}m`;
  const dockerRunCmd = `docker run -d --restart=${restartPolicy || appConfig.defaultRestartPolicy || 'no'} --name ${name} -p ${actualPort}:${imgPorts.web} -p ${actualVncPort}:${imgPorts.vnc}${isWindows ? ` -p ${rdpHostPort}:3389/tcp` : ''} -e RESOLUTION=${resolution || appConfig.defaultResolution || '1920x1080'}${extraEnv} --memory=${memArg} --cpus=${cpuVal}${extraDevices}${extraVolumes} --label io.fixcat.os=${osType || 'custom'} ${image}`;

  exec(dockerRunCmd, async (error, stdout, stderr) => {
    if (!error && stdout) {
      const containerId = stdout.trim();
      portRegistry.set(containerId, { name, port: actualPort, restart: restartPolicy || appConfig.defaultRestartPolicy || 'no', managed: true });
      savePortRegistry();
      recordEvent(customImageName ? 'custom-create' : 'create', `Запущен контейнер «${name}» (${image})`, containerId, containerId);
      return res.json({
        success: true,
        containerId,
        containerName: name,
        assignedPort: actualPort,
        dockerCommand: dockerRunCmd,
        message: `Операционная система "${name}" успешно создана и запущен контейнер на свободном порту :${actualPort}!`,
      });
    }

    try {
      const socketExists = fs.existsSync(appConfig.dockerSocketPath) || Boolean(appConfig.dockerTcpHost);
      if (socketExists) {
        const createBody = {
          Image: image,
          Env: [
            ...(isWindows
              ? [
                  `VERSION=${windowsVersion}`,
                  `RAM_SIZE=${ramGb}G`,
                  `CPU_CORES=${cpuVal}`,
                  `GPU=${gpuEnabled ? 'Y' : 'N'}`,
                  'DRIVERS=https://fedoraproject.org/wiki/Windows_Virtio_Drivers',
                  ...(gpuEnabled && gpuType === 'nvidia' ? ['NVIDIA_VISIBLE_DEVICES=all', 'NVIDIA_DRIVER_CAPABILITIES=all', 'GPU=Y'] : []),
                ]
              : []),
            `RESOLUTION=${resolution || appConfig.defaultResolution || '1920x1080'}`,
          ],
          Labels: { 'io.fixcat.os': osType || 'custom' },
          ExposedPorts: {
            [`${imgPorts.web}/tcp`]: {},
            [`${imgPorts.vnc}/tcp`]: {},
            ...(isWindows ? { '3389/tcp': {} } : {}),
          },
          HostConfig: {
            RestartPolicy: { Name: restartPolicy || appConfig.defaultRestartPolicy || 'no', MaximumRetryCount: (restartPolicy || appConfig.defaultRestartPolicy || 'no') === 'on-failure' ? 5 : 0 },
            PortBindings: {
              [`${imgPorts.web}/tcp`]: [{ HostPort: String(actualPort) }],
              [`${imgPorts.vnc}/tcp`]: [{ HostPort: String(actualVncPort) }],
              ...(isWindows && rdpHostPort ? { '3389/tcp': [{ HostPort: String(rdpHostPort) }] } : {}),
            },
            Memory: ramMbVal * 1024 * 1024,
            ...(isWindows && winDeviceList.length ? { Devices: winDeviceList.map((d) => ({ PathOnHost: d, PathInContainer: d, CgroupPermissions: 'mrw' })) } : {}),
            ...(isWindows && gpuEnabled && gpuType === 'nvidia' ? { DeviceRequests: [{ Driver: 'nvidia', Count: -1, Capabilities: [['gpu']] }] } : {}),
          },
        };

        let createRes = await queryDockerSocket(`/containers/create?name=${name}`, 'POST', createBody);

        if (createRes.statusCode === 404) {
          try {
            await queryDockerSocket(`/images/create?fromImage=${encodeURIComponent(image)}`, 'POST');
            createRes = await queryDockerSocket(`/containers/create?name=${name}`, 'POST', createBody);
          } catch {
            // Pull error
          }
        }

        if (createRes.statusCode < 300 && createRes.data?.Id) {
          await queryDockerSocket(`/containers/${createRes.data.Id}/start`, 'POST');
          portRegistry.set(createRes.data.Id, { name, port: actualPort, restart: restartPolicy || appConfig.defaultRestartPolicy || 'no', managed: true });
          savePortRegistry();
          recordEvent(customImageName ? 'custom-create' : 'create', `Запущен контейнер «${name}» (${image})`, createRes.data.Id, createRes.data.Id);
          return res.json({
            success: true,
            containerId: createRes.data.Id,
            containerName: name,
            assignedPort: actualPort,
            dockerCommand: dockerRunCmd,
            message: `ОС "${name}" успешно создана и запущена в Docker на порту :${actualPort}!`,
          });
        }
      }
    } catch (err: any) {
      // Socket error
    }

    return res.status(400).json({
      error: error?.message || stderr || 'Не удалось связаться с сокетом Docker на хосте.',
      dockerCommand: dockerRunCmd,
    });
  });
});

// ==================== Remote Nodes (Узлы) ====================
// Panel-to-panel integration: master panel connects to slave panels via API key
// and can deploy containers, view hardware, and monitor system stats remotely.

interface NodeItem {
  id: string;
  name: string;
  ip: string;
  port: number;
  apiKey: string;
  createdAt: string;
}

interface NodeStatus {
  online: boolean;
  checkedAt: string;
  system?: any;
  containers?: any[];
  containerCount?: number;
  runningCount?: number;
  version?: string;
  hostname?: string;
}

const nodesFile = path.join(dataDir, 'nodes.json');
let nodes: NodeItem[] = [];
const nodeStatuses = new Map<string, NodeStatus>();

function loadNodes() {
  try {
    if (fs.existsSync(nodesFile)) {
      nodes = JSON.parse(fs.readFileSync(nodesFile, 'utf-8'));
      if (!Array.isArray(nodes)) nodes = [];
    }
  } catch {
    nodes = [];
  }
}

function saveNodes() {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(nodesFile, JSON.stringify(nodes, null, 2), 'utf-8');
  } catch { /* ignore */ }
}

loadNodes();

// Whitelisted remote paths that may be proxied from the frontend
const PROXY_PATH_WHITELIST = [
  '/api/hardware',
  '/api/system',
  '/api/containers',
  '/api/autostarts',
  '/api/events',
  '/api/stats',
  '/api/config',
  '/api/docker',
  '/api/images',
  '/api/ports',
  '/api/update',
  '/api/nodes',
];

// noVNC / web links generated by a remote panel point at its own 'localhost'.
// When proxying containers from another device, rewrite the host to the node IP
// so links open on the actual machine (only safe when the panel reported localhost).
function rewriteContainerHosts(containers: any[], nodeIp: string): any[] {
  if (!Array.isArray(containers)) return containers;
  const localHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1']);
  return containers.map((c) => {
    if (!c || !c.osInfo) return c;
    const rewrite = (url?: string): string | undefined => {
      if (!url) return url;
      try {
        const u = new URL(String(url));
        if (localHosts.has(u.hostname)) {
          u.hostname = nodeIp;
          return u.href;
        }
      } catch { /* keep original */ }
      return url;
    };
    const osInfo: any = { ...c.osInfo };
    if (osInfo.vncUrl) osInfo.vncUrl = rewrite(osInfo.vncUrl);
    if (osInfo.webUrl) osInfo.webUrl = rewrite(osInfo.webUrl);
    return { ...c, osInfo };
  });
}

function remoteRequest(node: NodeItem, pathStr: string, method = 'GET', body?: any): Promise<{ statusCode: number; data: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: node.ip,
        port: node.port || 3000,
        path: pathStr,
        method,
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'X-Fixcat-Api-Key': node.apiKey,
          'User-Agent': 'Fixcat-OS-Manager/' + appVersion,
        },
      },
      (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => {
          let d: any = b;
          try { d = JSON.parse(b); } catch { /* plain text */ }
          resolve({ statusCode: res.statusCode || 500, data: d });
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function refreshNodeStatus(node: NodeItem): Promise<void> {
  try {
    const [sysRes, contRes] = await Promise.all([
      remoteRequest(node, '/api/system'),
      remoteRequest(node, '/api/containers').catch(() => ({ statusCode: 500, data: null })),
    ]);
    const system = sysRes.statusCode === 200 ? sysRes.data : null;
    const containers = contRes.statusCode === 200 && contRes.data ? contRes.data.containers || [] : [];
    nodeStatuses.set(node.id, {
      online: !!system,
      checkedAt: new Date().toISOString(),
      system,
      containers: rewriteContainerHosts(containers, node.ip),
      containerCount: containers.length,
      runningCount: containers.filter((c: any) => c.State === 'running').length,
      version: system?.app?.version || system?.appVersion || null,
      hostname: system?.hostname || null,
    });
  } catch {
    nodeStatuses.set(node.id, {
      online: false,
      checkedAt: new Date().toISOString(),
    });
  }
}

setInterval(() => {
  nodes.forEach((n) => refreshNodeStatus(n));
}, 8000);

// GET /api/nodes — list all nodes with live status
app.get('/api/nodes', requireAdmin, (_req, res) => {
  const result = nodes.map((n) => ({
    ...n,
    apiKey: '••••••••••••',  // Never expose real key
    status: nodeStatuses.get(n.id) || { online: false, checkedAt: null },
  }));
  res.json({ nodes: result });
});

// GET /api/nodes/raw — internal-only helper (needs api key auth)
// Returns real API keys for remote proxying by frontend when deploying.
// Called ONLY by the panel itself, not exposed to UI.
// Access is gated by session auth; the frontend fetches this internally.

// POST /api/nodes — add a new node
app.post('/api/nodes', requireAdmin, async (req, res) => {
  const { name, ip, port, apiKey } = req.body;
  if (!ip || !apiKey) {
    return res.status(400).json({ error: 'IP и API ключ обязательны.' });
  }
  const testNode: NodeItem = {
    id: '',
    name: name || `node-${ip}`,
    ip: String(ip).trim(),
    port: Number(port) || 3000,
    apiKey: String(apiKey).trim(),
    createdAt: new Date().toISOString(),
  };

  // Test connection
  try {
    const { statusCode, data } = await remoteRequest(testNode, '/api/system');
    if (statusCode !== 200 || !data) {
      return res.status(400).json({ error: `Не удалось подключиться к панели на ${testNode.ip}:${testNode.port} — код ${statusCode}.` });
    }
    // Check it's actually a Fixcat panel (or compatible)
    if (!data.app && !data.hostname) {
      return res.status(400).json({ error: 'Удалённый сервер не является Fixcat OS Manager.' });
    }
    testNode.id = `node-${crypto.randomBytes(6).toString('hex')}`;
    testNode.name = name || data.hostname || testNode.ip;
    nodes.push(testNode);
    saveNodes();
    recordEvent('node-add', `Добавлен узел «${testNode.name}» (${testNode.ip}:${testNode.port})`);
    await refreshNodeStatus(testNode);
    res.json({
      success: true,
      node: { ...testNode, apiKey: '••••••••••••', status: nodeStatuses.get(testNode.id) },
      message: `Узел «${testNode.name}» успешно добавлен.`,
    });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Ошибка подключения к удалённой панели.' });
  }
});

// DELETE /api/nodes/:id — remove a node
app.delete('/api/nodes/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const idx = nodes.findIndex((n) => n.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Узел не найден.' });
  const removed = nodes.splice(idx, 1)[0];
  saveNodes();
  nodeStatuses.delete(removed.id);
  recordEvent('node-remove', `Узел «${removed.name}» удалён`);
  res.json({ success: true, message: `Узел «${removed.name}» удалён.` });
});

// POST /api/nodes/:id/test — test connection
app.post('/api/nodes/:id/test', requireAdmin, async (req, res) => {
  const node = nodes.find((n) => n.id === req.params.id);
  if (!node) return res.status(404).json({ error: 'Узел не найден.' });
  try {
    const { statusCode, data } = await remoteRequest(node, '/api/system');
    if (statusCode === 200 && data) {
      await refreshNodeStatus(node);
      return res.json({ success: true, system: data, status: nodeStatuses.get(node.id) });
    }
    res.status(400).json({ error: `Код ответа: ${statusCode}` });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Нет подключения.' });
  }
});

// POST /api/nodes/:id/proxy — proxy arbitrary allowed request to remote node
// Body: { path: string, method?: string, body?: any }
app.post('/api/nodes/:id/proxy', requireAdmin, async (req, res) => {
  const node = nodes.find((n) => n.id === req.params.id);
  if (!node) return res.status(404).json({ error: 'Узел не найден.' });
  const { path: targetPath, method = 'GET', body } = req.body || {};
  if (!targetPath || typeof targetPath !== 'string') {
    return res.status(400).json({ error: 'Укажите path.' });
  }
  // Validate path is in whitelist (reject traversal attempts)
  if (targetPath.includes('..')) {
    return res.status(403).json({ error: 'Недопустимый путь.' });
  }
  const allowed = PROXY_PATH_WHITELIST.some((prefix) => targetPath.startsWith(prefix) && targetPath.length < 120);
  if (!allowed) {
    return res.status(403).json({ error: `Путь "${targetPath}" не разрешён для проксирования.` });
  }
  try {
    const result = await remoteRequest(node, targetPath, method.toUpperCase(), body);
    if (result.data && targetPath.startsWith('/api/containers') && Array.isArray(result.data.containers)) {
      result.data.containers = rewriteContainerHosts(result.data.containers, node.ip);
    }
    res.status(result.statusCode).json(result.data);
  } catch (err: any) {
    res.status(502).json({ error: err?.message || 'Узел недоступен.' });
  }
});

// --- INSTALLER & MODULES ROUTES (Fixcat installer engine) ---
registerInstallerRoutes(app, { allowBootstrapOrAdmin });
registerHardwareRoutes(app, { requireAuth, requireAdmin, recordEvent });

// --- Panel & Component Update ---
const updateLog: string[] = [];
let updateRunning = false;

function appendUpdateLog(line: string) {
  updateLog.push(`[${new Date().toLocaleTimeString()}] ${line}`);
  if (updateLog.length > 500) updateLog.length = 500;
}

app.get('/api/update/status', requireAdmin, async (_req, res) => {
  try {
    const execOpts: any = { timeout: 5000, encoding: 'utf-8' };
    const commit = execSyncSafe('git rev-parse --short HEAD', execOpts).trim();
    const branch = execSyncSafe('git branch --show-current', execOpts).trim();
    let remoteUrl = '';
    try { remoteUrl = execSyncSafe('git remote get-url origin', execOpts).trim(); } catch { /* ignore */ }
    const behind = appConfig.enableAutoUpdateCheck
      ? await getBehindCount(branch)
      : null;
    res.json({
      running: updateRunning,
      commit,
      branch,
      remoteUrl,
      appVersion,
      updateChannel: appConfig.updateChannel || 'main',
      behind,
      lastLog: updateLog.slice(-30),
    });
  } catch (err: any) {
    res.json({ running: updateRunning, appVersion, commit: null, branch: null, error: err?.message, lastLog: updateLog.slice(-30) });
  }
});

async function getBehindCount(branch: string): Promise<number> {
  try {
    execSyncSafe('git fetch --quiet origin 2>/dev/null || true', { timeout: 15000, encoding: 'utf-8' });
    const out = execSyncSafe(`git rev-list --count HEAD..origin/${branch} 2>/dev/null || echo 0`, { timeout: 8000, encoding: 'utf-8' });
    return Number(out.trim()) || 0;
  } catch {
    return 0;
  }
}

function execSyncSafe(cmd: string, opts: any = {}): string {
  return execSync(cmd, { timeout: 120000, encoding: 'utf-8', ...opts });
}

app.post('/api/update/panel', requireAdmin, async (_req, res) => {
  if (updateRunning) return res.status(409).json({ error: 'Обновление уже запущено' });
  updateRunning = true;
  updateLog.length = 0;
  appendUpdateLog('Обновление панели запускается...');
  recordEvent('config', 'Запущено обновление панели');

  const channel = (appConfig.updateChannel || 'main').replace(/[^a-zA-Z0-9._-]/g, '');
  const projectRoot = __dirname;
  const script = `
cd "${projectRoot}" && echo "--- git pull origin/${channel} ---" && \
git checkout ${channel} 2>/dev/null && \
git fetch origin ${channel} && \
git reset --hard origin/${channel} && \
echo "--- npm install ---" && \
npm install --no-audit --no-fund && \
echo "--- vite build ---" && \
npm run build && \
echo "--- update complete ---"`;

  const child = spawn('/bin/bash', ['-lc', script], { cwd: projectRoot });
  child.stdout?.on('data', (d: Buffer) => { appendUpdateLog(d.toString().trimEnd()); });
  child.stderr?.on('data', (d: Buffer) => { appendUpdateLog(d.toString().trimEnd()); });
  child.on('close', (code) => {
    appendUpdateLog(`Процесс завершён с кодом ${code}`);
    updateRunning = false;
    recordEvent('config', `Обновление панели завершено (exit ${code})`);
  });
  child.on('error', (err) => {
    appendUpdateLog(`Ошибка: ${err.message}`);
    updateRunning = false;
  });

  res.json({ success: true, message: 'Обновление запущено', channel });
});

app.post('/api/update/os-images', requireAdmin, async (_req, res) => {
  if (updateRunning) return res.status(409).json({ error: 'Обновление уже запущено' });
  updateRunning = true;
  updateLog.length = 0;
  appendUpdateLog('Обновление Docker-образов...');
  recordEvent('config', 'Запущено обновление Docker-образов');

  const images = getModuleImages();
  const script = images.map((img) => `docker pull ${img} && echo "OK: ${img}" || echo "FAIL: ${img}"`).join(' && ');
  const child = spawn('/bin/bash', ['-lc', script]);
  child.stdout?.on('data', (d: Buffer) => { appendUpdateLog(d.toString().trimEnd()); });
  child.stderr?.on('data', (d: Buffer) => { appendUpdateLog(d.toString().trimEnd()); });
  child.on('close', (code) => {
    appendUpdateLog(`Обновление образов завершено (exit ${code})`);
    updateRunning = false;
    recordEvent('config', `Обновление образов завершено (exit ${code})`);
  });
  child.on('error', (err) => {
    appendUpdateLog(`Ошибка: ${err.message}`);
    updateRunning = false;
  });

  res.json({ success: true, images, message: 'Обновление образов запущено' });
});

app.post('/api/update/restart', requireAdmin, async (_req, res) => {
  appendUpdateLog('Попытка перезапуска панели...');
  try {
    const hasSystemctl = execSyncSafe('command -v systemctl 2>/dev/null || echo no').trim();
    if (hasSystemctl === 'systemctl') {
      const out = execSyncSafe('systemctl restart fixcat-os-manager 2>&1 || echo systemctl-restart-sent');
      res.json({ success: true, method: 'systemctl', message: 'Панель перезапущена', output: out });
      process.exit(0);
      return;
    }
    const hasPm2 = execSyncSafe('command -v pm2 2>/dev/null || echo no').trim();
    if (hasPm2 === 'pm2') {
      const out = execSyncSafe('pm2 restart all 2>&1');
      res.json({ success: true, method: 'pm2', message: 'Панель перезапущена через pm2', output: out });
      process.exit(0);
      return;
    }
    const cmd = `sleep 2 && cd "${__dirname}" && node dist/server.js &`;
    spawn('/bin/bash', ['-lc', cmd], { detached: true, stdio: 'ignore' }).unref();
    res.json({ success: true, method: 'detached', message: 'Панель перезапускается в фоне' });
    setTimeout(() => process.exit(0), 1500);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Не удалось перезапустить панель' });
  }
});

// ---------------------------------------------------------------------------
// AI Agent API — управление панелью внешним интеллектом (нейронкой)
// Любой агент с API-ключом может получить описание инструментов и выполнить их.
// Каждый инструмент соответствует конкретной кнопке/пункту панели и имеет свою
// метку доступа (read/write). Исполнение — через внутренний HTTP на API-ключе,
// поэтому логика совпадает с обычными эндпоинтами панели 1-в-1.
// ---------------------------------------------------------------------------

interface AiToolParam {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object';
  required?: boolean;
  description: string;
  enum?: string[];
}

interface AiTool {
  name: string;
  description: string;
  permission: 'read' | 'write';
  method: 'GET' | 'POST';
  path: string;
  params: AiToolParam[];
  fixedBody?: Record<string, any>;
}

const AI_TOOLS: AiTool[] = [
  // --- Контейнеры (вкладка «Контейнеры») ---
  { name: 'list_containers', description: 'Список всех контейнеров (ВМ/ОС) со статусом, портами и метриками', permission: 'read', method: 'GET', path: '/api/containers', params: [] },
  { name: 'container_inspect', description: 'Подробная информация о контейнере', permission: 'read', method: 'GET', path: '/api/containers/:id/inspect', params: [{ name: 'id', type: 'string', required: true, description: 'ID или имя контейнера' }] },
  { name: 'container_logs', description: 'Последние 150 строк логов контейнера', permission: 'read', method: 'GET', path: '/api/containers/:id/logs', params: [{ name: 'id', type: 'string', required: true, description: 'ID или имя контейнера' }] },
  { name: 'container_start', description: 'Запустить контейнер', permission: 'write', method: 'POST', path: '/api/containers/:id/action', fixedBody: { action: 'start' }, params: [{ name: 'id', type: 'string', required: true, description: 'ID или имя контейнера' }] },
  { name: 'container_stop', description: 'Остановить контейнер', permission: 'write', method: 'POST', path: '/api/containers/:id/action', fixedBody: { action: 'stop' }, params: [{ name: 'id', type: 'string', required: true, description: 'ID или имя контейнера' }] },
  { name: 'container_restart', description: 'Перезапустить контейнер', permission: 'write', method: 'POST', path: '/api/containers/:id/action', fixedBody: { action: 'restart' }, params: [{ name: 'id', type: 'string', required: true, description: 'ID или имя контейнера' }] },
  { name: 'container_remove', description: 'УДАЛИТЬ контейнер навсегда (деструктивно: удаляется ВМ и её Windows-хранилище, затем подчищаются одноразовые образы)', permission: 'write', method: 'POST', path: '/api/containers/:id/action', fixedBody: { action: 'remove' }, params: [{ name: 'id', type: 'string', required: true, description: 'ID или имя контейнера' }] },
  { name: 'container_rename', description: 'Переименовать контейнер', permission: 'write', method: 'POST', path: '/api/containers/:id/rename', params: [{ name: 'id', type: 'string', required: true, description: 'ID или имя контейнера' }, { name: 'name', type: 'string', required: true, description: 'Новое имя: 3-64 символа, буквы/цифры/точка/дефис/подчёркивание' }] },
  { name: 'deploy_container', description: 'Развернуть новую ОС/контейнер (кнопка «Развернуть ОС»): Ubuntu, Windows XP/7/8/10/11, Debian, Kali, Alpine или кастомный образ', permission: 'write', method: 'POST', path: '/api/containers/create', params: [
    { name: 'osType', type: 'string', description: 'ОС для развёртывания', enum: ['ubuntu', 'windows-xp', 'windows-7', 'windows-8', 'windows-10', 'windows-11', 'debian', 'kali', 'alpine'] },
    { name: 'containerName', type: 'string', description: 'Имя контейнера (по умолчанию сгенерируется автоматически)' },
    { name: 'vncPort', type: 'number', description: 'Свободный HTTP-порт web-интерфейса (по умолчанию 6082 или авто-подбор)' },
    { name: 'ramMb', type: 'number', description: 'RAM в МБ (по умолчанию из настроек панели)' },
    { name: 'cpuCores', type: 'number', description: 'Число ядер CPU (по умолчанию из настроек панели)' },
    { name: 'resolution', type: 'string', description: 'Разрешение рабочего стола, например 1920x1080' },
    { name: 'restartPolicy', type: 'string', enum: ['no', 'always', 'unless-stopped', 'on-failure'], description: 'Политика автозапуска при перезагрузке ПК' },
    { name: 'image', type: 'string', description: 'Кастомный Docker-образ вместо шаблона ОС, например kasmweb/kali-rolling-desktop:1.16.0' },
    { name: 'webPort', type: 'number', description: 'Внутренний web-порт кастомного образа' },
    { name: 'vncPortInternal', type: 'number', description: 'Внутренний VNC-порт кастомного образа' },
    { name: 'gpu', type: 'boolean', description: 'Выделить GPU (для Windows; автоопределяется NVIDIA/AMD/Intel)' },
  ] },
  { name: 'list_images', description: 'Список локальных Docker-образов', permission: 'read', method: 'GET', path: '/api/images', params: [] },

  // --- Дашборд / мониторинг ---
  { name: 'system_info', description: 'Информация о хосте: CPU, RAM, GPU, диск, сеть, версия панели, API-ключ', permission: 'read', method: 'GET', path: '/api/system', params: [] },
  { name: 'docker_info', description: 'Параметры Docker Engine: версия, ядро, число контейнеров', permission: 'read', method: 'GET', path: '/api/docker/info', params: [] },
  { name: 'stats_history', description: 'История метрик (CPU/RAM/GPU/диск)', permission: 'read', method: 'GET', path: '/api/stats/history', params: [] },
  { name: 'events', description: 'Журнал событий панели и Docker за последнее время', permission: 'read', method: 'GET', path: '/api/events', params: [] },

  // --- Связанные ПК (Узлы) ---
  { name: 'list_nodes', description: 'Список подключённых ПК (узлов) со статусом и последними данными', permission: 'read', method: 'GET', path: '/api/nodes', params: [] },
  { name: 'node_proxy', description: 'Выполнить разрешённый запрос к удалённой панели-узлу через прокси (контейнеры, автозапуск, события, статистика, настройки, обновление, оборудование, образы, порты, Docker-info)', permission: 'write', method: 'POST', path: '/api/nodes/:id/proxy', params: [
    { name: 'id', type: 'string', required: true, description: 'ID узла (см. list_nodes)' },
    { name: 'path', type: 'string', required: true, description: 'Путь на удалённой панели, например /api/containers или /api/containers/abc/logs' },
    { name: 'method', type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'], description: 'Метод запроса (по умолчанию GET)' },
    { name: 'body', type: 'object', description: 'Тело запроса для POST/PUT' },
  ] },

  // --- Автозапуск ---
  { name: 'list_autostarts', description: 'Список политик автозапуска контейнеров', permission: 'read', method: 'GET', path: '/api/autostarts', params: [] },
  { name: 'set_autostart', description: 'Установить политику автозапуска для контейнера', permission: 'write', method: 'POST', path: '/api/autostarts/:id', params: [{ name: 'id', type: 'string', required: true, description: 'ID контейнера' }, { name: 'policy', type: 'string', required: true, enum: ['no', 'always', 'unless-stopped', 'on-failure'], description: 'Политика автозапуска' }] },
  { name: 'autostarts_bulk', description: 'Применить политику автозапуска сразу ко всем контейнерам', permission: 'write', method: 'POST', path: '/api/autostarts/bulk', params: [{ name: 'policy', type: 'string', required: true, enum: ['no', 'always', 'unless-stopped', 'on-failure'], description: 'Политика' }, { name: 'state', type: 'boolean', description: 'true — применить ко всем' }] },

  // --- Оборудование (вкладка «Железо») ---
  { name: 'hardware_cpu', description: 'Текущая частота/нагрузка CPU и доступные губернаторы', permission: 'read', method: 'GET', path: '/api/hardware/cpu', params: [] },
  { name: 'hardware_fans', description: 'Скорость вентиляторов и допустимые уровни PWM', permission: 'read', method: 'GET', path: '/api/hardware/fans', params: [] },
  { name: 'hardware_swap', description: 'Состояние swap-файла', permission: 'read', method: 'GET', path: '/api/hardware/swap', params: [] },

  // --- Настройки / пользователи / обновление ---
  { name: 'list_users', description: 'Список пользователей панели с ролями', permission: 'read', method: 'GET', path: '/api/users', params: [] },
  { name: 'config_get', description: 'Конфигурация панели (порты, политики по умолчанию, коллекции)', permission: 'read', method: 'GET', path: '/api/config', params: [] },
  { name: 'ports_next', description: 'Следующий свободный порт для развёртывания', permission: 'read', method: 'GET', path: '/api/ports/next', params: [] },
  { name: 'update_panel', description: 'Обновить панель из GitLab/GitHub (долгий процесс, панель перезапустится)', permission: 'write', method: 'POST', path: '/api/update/panel', params: [] },
  { name: 'restart_panel', description: 'Перезапустить сервис панели', permission: 'write', method: 'POST', path: '/api/update/restart', params: [] },
];

const AI_TOOL_BY_NAME = new Map(AI_TOOLS.map((t) => [t.name, t] as const));

function buildToolUrl(tool: AiTool, params: Record<string, any>): { url: string; body: Record<string, any> } {
  let url = tool.path;
  const body: Record<string, any> = {};
  const query: string[] = [];
  for (const p of tool.params) {
    const value = params[p.name];
    if (p.required && value === undefined) {
      throw new Error(`Не хватает параметра "${p.name}": ${p.description}`);
    }
    if (value === undefined) continue;
    if (p.enum && !p.enum.includes(String(value))) {
      throw new Error(`Параметр "${p.name}" может принимать только: ${p.enum.join(', ')} (передано: ${value})`);
    }
    if (url.includes(`:${p.name}`)) {
      url = url.replace(`:${p.name}`, encodeURIComponent(String(value)));
    } else if (tool.method === 'GET') {
      query.push(`${encodeURIComponent(p.name)}=${encodeURIComponent(String(value))}`);
    } else {
      body[p.name] = value;
    }
  }
  if (query.length) url += '?' + query.join('&');
  return { url, body: { ...(tool.fixedBody || {}), ...body } };
}

// Внутренний вызов собственных эндпоинтов: 1-в-1 логика с обычным REST API панели
function aiSelfRequest(path: string, method: string, body: any): Promise<{ statusCode: number; data: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path,
        method,
        timeout: 180000,
        headers: {
          'Content-Type': 'application/json',
          'X-Fixcat-Api-Key': appConfig.apiKey || '',
          'User-Agent': 'Fixcat-OS-Manager-Agent/' + appVersion,
        },
      },
      (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => {
          let d: any = b;
          try { d = JSON.parse(b); } catch { /* plain text */ }
          resolve({ statusCode: res.statusCode || 500, data: d });
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('Превышен таймаут (180 с).')); });
    if (body && Object.keys(body).length) req.write(JSON.stringify(body));
    req.end();
  });
}

function abridgeAiData(data: any): any {
  try {
    const s = JSON.stringify(data);
    if (s.length <= 200000) return data;
    return { truncated: true, bytes: s.length, note: 'Ответ слишком большой, показано начало', preview: s.slice(0, 120000) + '…' };
  } catch {
    return data;
  }
}

// GET /api/ai/tools — манифест инструментов для нейронки (что умеет панель)
app.get('/api/ai/tools', requireAuth, (_req, res) => {
  res.json({
    ok: true,
    agent: 'Fixcat OS Manager Agent',
    version: appVersion,
    basePath: '/api',
    authHeader: 'X-Fixcat-Api-Key',
    tools: AI_TOOLS,
  });
});

// POST /api/ai/run — выполнить инструмент нейронкой
// Тело: { "tool": "container_logs", "params": { "id": "..." } }
app.post('/api/ai/run', requireAdmin, async (req, res) => {
  const { tool: toolName, params } = req.body || {};
  const tool = AI_TOOL_BY_NAME.get(String(toolName || ''));
  if (!tool) {
    return res.status(404).json({
      ok: false,
      error: `Инструмент "${toolName}" не найден. Доступно: ${AI_TOOLS.map((t) => t.name).join(', ')}`,
    });
  }
  const p: Record<string, any> = params && typeof params === 'object' ? params : {};
  let built: { url: string; body: Record<string, any> };
  try {
    built = buildToolUrl(tool, p);
  } catch (e: any) {
    return res.status(400).json({ ok: false, tool: tool.name, error: e.message });
  }
  try {
    const { statusCode, data: raw } = await aiSelfRequest(built.url, tool.method, built.body);
    const data = abridgeAiData(raw);
    return res.status(statusCode).json({ ok: statusCode < 400, status: statusCode, tool: tool.name, data });
  } catch (e: any) {
    return res.status(502).json({ ok: false, tool: tool.name, error: e?.message || 'Внутренний вызов API не удался' });
  }
});

// Start Express + Vite
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    // dist/ is written next to dist/server.js, so resolve it relative to __dirname
    const distDir =
      fs.existsSync(path.join(__dirname, 'dist', 'index.html'))
        ? path.join(__dirname, 'dist')
        : fs.existsSync(path.join(__dirname, 'index.html'))
        ? __dirname
        : path.join(__dirname, 'dist');

    app.use(express.static(distDir));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Fixcat OS Manager] Server running on http://0.0.0.0:${PORT}`);
    loadPortRegistry();
    fetchAndReconcile().catch(() => {});
  });
}

startServer();
