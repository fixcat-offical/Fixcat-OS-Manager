import React, { useState, useEffect } from 'react';
import {
  Settings,
  Server,
  Globe,
  HardDrive,
  Copy,
  Check,
  Terminal,
  ShieldCheck,
  Radio,
  RefreshCw,
  Zap,
  Info,
  Layers,
  Cpu,
  Activity,
  Boxes,
  AlertCircle,
  Sliders,
  Globe2,
  Tv,
  Image,
  Gauge,
  MemoryStick,
  ChevronDown,
  ChevronUp,
  Download,
  Upload,
  Power,
  Loader2,
  Clock,
  GitBranch,
} from 'lucide-react';
import { SystemInfo } from '../types';

interface DockerImage {
  id: string;
  repo: string;
  tag: string;
  size: number;
  created: number;
}

interface DockerInfo {
  connected: boolean;
  version?: string;
  apiVersion?: string;
  os?: string;
  kernel?: string;
  containers?: { total: number; running: number; paused: number; stopped: number };
  images?: number;
  dockerRootDir?: string;
  memoryTotalMb?: number | null;
}

interface SettingsViewProps {
  systemInfo: SystemInfo | null;
  authToken?: string | null;
  api?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

const SETTING_GROUPS: { label: string; icon: any; keys: string[] }[] = [
  {
    label: 'Основные параметры',
    icon: Sliders,
    keys: ['panelTitle', 'language', 'theme', 'compactMode', 'animationsEnabled', 'logLevel'],
  },
  {
    label: 'Docker и контейнеры',
    icon: Server,
    keys: ['autoDetectNoVnc', 'defaultRestartPolicy', 'defaultResolution', 'defaultRamMb', 'defaultCpuCores', 'defaultOsTemplate'],
  },
  {
    label: 'Мониторинг и ресурсы',
    icon: Activity,
    keys: ['statsEnabled', 'enableGpuTelemetry', 'enableEventJournal', 'maxHistoryPoints', 'networkPollingEnabled'],
  },
  {
    label: 'noVNC и доступ',
    icon: Tv,
    keys: ['novncScaleMode', 'autoOpenNovnc'],
  },
  {
    label: 'Обновления и бэкапы',
    icon: RefreshCw,
    keys: ['updateChannel', 'enableAutoUpdateCheck', 'backupRetentionDays', 'swapAutoCleanup'],
  },
];

const SETTING_LABELS: Record<string, { name: string; desc: string; type: string; options?: string[] }> = {
  panelTitle: { name: 'Название панели', desc: 'Отображается в заголовке вкладки', type: 'text' },
  language: { name: 'Язык интерфейса', desc: 'Текущий: русский', type: 'select', options: ['ru', 'en', 'uk'] },
  theme: { name: 'Тема оформления', desc: 'Тёмная тема по умолчанию', type: 'select', options: ['dark', 'light', 'auto'] },
  compactMode: { name: 'Компактный режим', desc: 'Уменьшенные отступы', type: 'bool' },
  animationsEnabled: { name: 'Анимации', desc: 'Плавные переходы и анимации', type: 'bool' },
  logLevel: { name: 'Уровень логирования', desc: 'Влияет на серверные логи', type: 'select', options: ['debug', 'info', 'warn', 'error'] },
  autoDetectNoVnc: { name: 'Авто-обнаружение noVNC', desc: 'Сканировать порты noVNC автоматически', type: 'bool' },
  defaultRestartPolicy: { name: 'Политика автозапуска', desc: 'По умолчанию при создании контейнера', type: 'select', options: ['no', 'always', 'unless-stopped', 'on-failure'] },
  defaultResolution: { name: 'Разрешение по умолчанию', desc: 'Используется при развёртывании ОС', type: 'select', options: ['1920x1080', '1600x900', '1280x720', '1024x768'] },
  defaultRamMb: { name: 'RAM по умолчанию (MB)', desc: 'Оперативная память для нового контейнера', type: 'number' },
  defaultCpuCores: { name: 'Ядра CPU по умолчанию', desc: 'Количество виртуальных ядер', type: 'number' },
  defaultOsTemplate: { name: 'Шаблон ОС по умолчанию', desc: 'Шаблон для быстрого развёртывания', type: 'select', options: ['ubuntu', 'debian', 'kali', 'alpine', 'windows-xp', 'windows-7', 'windows-8', 'windows-10'] },
  statsEnabled: { name: 'Телеиметрия (CPU/RAM)', desc: 'Сбор метрик для графиков', type: 'bool' },
  enableGpuTelemetry: { name: 'Мониторинг GPU', desc: 'Опрос nvidia-smi / Intel iGPU', type: 'bool' },
  enableEventJournal: { name: 'Журнал событий', desc: 'Запись действий в панели', type: 'bool' },
  maxHistoryPoints: { name: 'Точек истории', desc: 'Макс. точек на графике (5-200)', type: 'number' },
  networkPollingEnabled: { name: 'Мониторинг сети', desc: 'Отслеживать RX/TX', type: 'bool' },
  novncScaleMode: { name: 'Масштабирование noVNC', desc: 'Как вписывать VNC в окно браузера', type: 'select', options: ['fit', 'scale', 'remote'] },
  autoOpenNovnc: { name: 'Авто-открытие noVNC', desc: 'При клике на контейнер', type: 'bool' },
  updateChannel: { name: 'Канал обновлений', desc: 'Git-ветка для обновления панели', type: 'select', options: ['main', 'dev', 'nightly'] },
  enableAutoUpdateCheck: { name: 'Авто-проверка обновлений', desc: 'Проверять наличие обновлений', type: 'bool' },
  backupRetentionDays: { name: 'Хранение бэкапов (дней)', desc: 'Срок жизни резервных копий', type: 'number' },
  swapAutoCleanup: { name: 'Автоочистка swap', desc: 'Отключать при нехватке диска', type: 'bool' },
};

export const SettingsView: React.FC<SettingsViewProps> = ({
  systemInfo,
  authToken,
  api,
}) => {
  const run = api || fetch;
  const [hostIp, setHostIp] = useState(systemInfo?.config?.hostIp || 'localhost');
  const [dockerSocket, setDockerSocket] = useState(systemInfo?.config?.dockerSocketPath || '/var/run/docker.sock');
  const [dockerTcp, setDockerTcp] = useState(systemInfo?.config?.dockerTcpHost || '');
  const [saved, setSaved] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [dockerInfo, setDockerInfo] = useState<DockerInfo | null>(null);
  const [images, setImages] = useState<DockerImage[] | null>(null);
  const [configBackupStatus, setConfigBackupStatus] = useState<'idle' | 'ok' | 'err'>('idle');
  const [configRestoreStatus, setConfigRestoreStatus] = useState<'idle' | 'ok' | 'err'>('idle');
  const [configRestoreMsg, setConfigRestoreMsg] = useState('');
  const [config, setConfig] = useState<Record<string, any>>(systemInfo?.config || {});
  const [groupsOpen, setGroupsOpen] = useState<Record<string, boolean>>({});
  const [updateStatus, setUpdateStatus] = useState<any>(null);
  const [updateLoading, setUpdateLoading] = useState(false);

  const authHeader = authToken ? { Authorization: `Bearer ${authToken}` } : {};

  const fetchDockerInfo = () => {
    run('/api/docker/info')
      .then((r) => r.json())
      .then(setDockerInfo)
      .catch(() => setDockerInfo(null));
  };

  const fetchUpdateStatus = () => {
    run('/api/update/status', { headers: authHeader })
      .then((r) => r.json())
      .then(setUpdateStatus)
      .catch(() => {});
  };

  useEffect(() => {
    fetchDockerInfo();
    run('/api/images').then((r) => r.json()).then((d) => setImages(d.images || [])).catch(() => setImages(null));
    fetchUpdateStatus();
  }, [api]);

  const isDockerActive = systemInfo?.docker?.socketAvailable || systemInfo?.docker?.mode === 'connected';

  const handleSaveConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    await run('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({ hostIp, dockerSocketPath: dockerSocket, dockerTcpHost: dockerTcp }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const saveSetting = async (key: string, value: any) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    try {
      await run('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({ [key]: value }),
      });
    } catch {
      // ignore
    }
  };

  const handleDownloadConfigBackup = async () => {
    try {
      const res = await run('/api/config/backup');
      if (!res.ok) throw new Error('Backup fetch failed');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fixcat-config-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setConfigBackupStatus('ok');
      setTimeout(() => setConfigBackupStatus('idle'), 3000);
    } catch {
      setConfigBackupStatus('err');
      setTimeout(() => setConfigBackupStatus('idle'), 3000);
    }
  };

  const handleRestoreConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const raw = JSON.parse(reader.result as string);
        const cfg = raw.config || raw;
        const res = await run('/api/config/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeader },
          body: JSON.stringify({ config: cfg }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'restore failed');
        setConfig(data.config || cfg);
        setConfigRestoreStatus('ok');
        setConfigRestoreMsg('Конфигурация восстановлена. Страница обновится через 2 сек...');
        setTimeout(() => window.location.reload(), 2000);
      } catch (err: any) {
        setConfigRestoreStatus('err');
        setConfigRestoreMsg(err?.message || 'Ошибка восстановления');
        setTimeout(() => setConfigRestoreStatus('idle'), 4000);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const runUpdate = async (endpoint: string) => {
    setUpdateLoading(true);
    try {
      const res = await run(endpoint, { method: 'POST', headers: authHeader });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast(data.message || 'Обновление запущено', 'success');
      fetchUpdateStatus();
    } catch (err: any) {
      showToast(err?.message || 'Ошибка', 'error');
    }
    setUpdateLoading(false);
  };

  const showToast = (msg: string, _type: 'success' | 'error' | 'info') => {
    // Minimal local toast — just flash an alert
    console.log(`[${_type}] ${msg}`);
  };

  const laptopRunCommand = `# Запуск панели на ноутбуке с прямым доступом к Docker сокету:
docker run -d \\
  --name fixcat-os-manager \\
  -p 3000:3000 \\
  -v /var/run/docker.sock:/var/run/docker.sock \\
  --restart unless-stopped \\
  node:20-alpine sh -c "npm start"`;

  const handleCopyScript = () => {
    navigator.clipboard.writeText(laptopRunCommand);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  const toggleGroup = (label: string) => setGroupsOpen((p) => ({ ...p, [label]: !p[label] }));

  return (
    <div className="space-y-6 max-w-4xl pb-12">
      {/* Docker Connection Status */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Статус подключения к Docker</h3>
              <p className="text-xs text-slate-400 font-mono">{dockerTcp || dockerSocket}</p>
            </div>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold border flex items-center gap-1.5 ${
            isDockerActive ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
          }`}>
            <Radio className={`w-3.5 h-3.5 ${isDockerActive ? 'text-emerald-400 animate-pulse' : 'text-amber-400'}`} />
            <span>{isDockerActive ? 'Docker Socket подключен' : 'Режим эмуляции (без Docker)'}</span>
          </span>
        </div>
      </div>

      {/* Connection Settings Form */}
      <form onSubmit={handleSaveConnection} className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <h3 className="font-bold text-white text-sm uppercase tracking-wider flex items-center gap-2">
          <Globe className="w-4 h-4 text-blue-400" />
          Подключение Docker и IP-хоста
        </h3>
        <div className="space-y-3 text-xs">
          <div>
            <label className="text-slate-300 font-medium block mb-1">IP-адрес или домен хоста (для noVNC ссылок):</label>
            <input type="text" value={hostIp} onChange={(e) => setHostIp(e.target.value)} placeholder="localhost или 192.168.1.50"
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:border-blue-500 focus:outline-none font-mono" />
          </div>
          <div>
            <label className="text-slate-300 font-medium block mb-1">Unix-сокет Docker:</label>
            <input type="text" value={dockerSocket} onChange={(e) => setDockerSocket(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:border-blue-500 focus:outline-none font-mono" />
          </div>
          <div>
            <label className="text-slate-300 font-medium block mb-1">Docker TCP Host (опционально):</label>
            <input type="text" value={dockerTcp} onChange={(e) => setDockerTcp(e.target.value)} placeholder="tcp://127.0.0.1:2375"
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:border-blue-500 focus:outline-none font-mono" />
          </div>
        </div>
        <div className="pt-2 flex items-center justify-between">
          {saved ? (
            <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1"><Check className="w-4 h-4" /> Сохранено!</span>
          ) : <span />}
          <button type="submit" className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-xl shadow-md shadow-blue-600/20 transition-all cursor-pointer">
            Сохранить настройки подключения
          </button>
        </div>
      </form>

      {/* API Key for Node Integration */}
      {authToken && (
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-white text-sm flex items-center gap-2">
              <Globe className="w-4 h-4 text-indigo-400" />
              API для интеграции (Узлы)
            </h3>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Этот API ключ используется для подключения других панелей Fixcat OS Manager в качестве <b className="text-slate-200">узлов</b>. Скопируйте его на вкладке <b className="text-slate-200">Связанные ПК</b> на втором устройстве.
          </p>
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5">
            <code className="flex-1 text-[11px] text-slate-300 font-mono break-all select-all">{systemInfo?.apiKey || '••••••••'}</code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(systemInfo?.apiKey || '');
              }}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 shrink-0 cursor-pointer"
              title="Скопировать ключ"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={async () => {
                if (!window.confirm('Перегенерировать API ключ? Все подключённые узлы потеряют доступ, пока не обновите ключ на них.')) return;
                try {
                  const res = await run('/api/config/api-key', {
                    method: 'POST',
                    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
                  });
                  const data = await res.json();
                  if (res.ok) {
                    showToast('API ключ обновлён! Обновите ключ на подключённых узлах.', 'info');
                    window.location.reload();
                  }
                } catch {}
              }}
              className="px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/25 text-[11px] font-semibold shrink-0 cursor-pointer"
            >
              Перегенерировать
            </button>
          </div>
          <p className="text-[10px] text-slate-500 flex items-center gap-1.5">
            <Info className="w-3 h-3" /> Для доступа к API из других панелей используйте заголовок <code className="bg-slate-800 px-1 rounded text-slate-400">X-Fixcat-Api-Key</code> или <code className="bg-slate-800 px-1 rounded text-slate-400">Authorization: Bearer &lt;ключ&gt;</code>.
          </p>
        </div>
      )}

      {/* Panel Settings (25 settings in groups) */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
        <h3 className="font-bold text-white text-sm uppercase tracking-wider flex items-center gap-2 mb-3">
          <Settings className="w-4 h-4 text-amber-400" />
          Параметры панели
        </h3>
        {SETTING_GROUPS.map((group) => {
          const Icon = group.icon;
          const isOpen = groupsOpen[group.label] !== false;
          return (
            <div key={group.label} className="rounded-xl bg-slate-950 border border-slate-800 overflow-hidden">
              <button onClick={() => toggleGroup(group.label)}
                className="w-full px-4 py-3 flex items-center justify-between text-xs font-semibold text-slate-200 hover:bg-slate-800/40 cursor-pointer transition-colors">
                <span className="flex items-center gap-2">
                  <Icon className="w-3.5 h-3.5 text-blue-400" />
                  {group.label}
                  <span className="text-[10px] text-slate-500 font-mono">{group.keys.length}</span>
                </span>
                {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
              </button>
              {isOpen && (
                <div className="px-4 pb-4 space-y-3 border-t border-slate-800 pt-3">
                  {group.keys.map((key) => {
                    const meta = SETTING_LABELS[key];
                    if (!meta) return null;
                    const val = config[key];
                    return (
                      <div key={key} className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                        <div className="flex-1 min-w-0">
                          <label className="text-slate-300 font-medium text-xs block">{meta.name}</label>
                          <p className="text-[10px] text-slate-500">{meta.desc}</p>
                        </div>
                        {meta.type === 'bool' ? (
                          <label className="flex items-center gap-2 cursor-pointer shrink-0">
                            <div className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${val ? 'bg-blue-600' : 'bg-slate-700'}`}
                              onClick={() => saveSetting(key, !val)}>
                              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${val ? 'translate-x-5' : 'translate-x-0.5'}`} />
                            </div>
                            <span className="text-[10px] text-slate-400 w-8">{val ? 'Вкл' : 'Выкл'}</span>
                          </label>
                        ) : meta.type === 'select' ? (
                          <select value={val || ''} onChange={(e) => saveSetting(key, e.target.value)}
                            className="w-full sm:w-48 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-200 focus:border-blue-500 focus:outline-none text-xs font-mono">
                            {meta.options?.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                        ) : meta.type === 'number' ? (
                          <input type="number" value={val ?? ''} onChange={(e) => saveSetting(key, Number(e.target.value))}
                            className="w-full sm:w-32 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-200 focus:border-blue-500 focus:outline-none text-xs font-mono" />
                        ) : (
                          <input type="text" value={val ?? ''} onChange={(e) => saveSetting(key, e.target.value)}
                            className="w-full sm:w-64 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-200 focus:border-blue-500 focus:outline-none text-xs font-mono" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Backup / Restore */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <h3 className="font-bold text-white text-sm flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-violet-400" />
          Бэкап / Восстановление конфигурации
        </h3>
        <div className="flex flex-wrap gap-3 text-xs">
          <button onClick={handleDownloadConfigBackup}
            className={`px-4 py-2 font-semibold rounded-xl cursor-pointer flex items-center gap-2 transition-colors ${
              configBackupStatus === 'ok' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : configBackupStatus === 'err' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-violet-500/15 hover:bg-violet-500/25 text-violet-200 border border-violet-500/25'
            }`}>
            {configBackupStatus === 'ok' ? <Check className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
            {configBackupStatus === 'ok' ? 'Скачано' : configBackupStatus === 'err' ? 'Ошибка' : 'Скачать конфиг'}
          </button>
          <label className={`px-4 py-2 font-semibold rounded-xl cursor-pointer flex items-center gap-2 transition-colors ${
            configRestoreStatus === 'ok' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : configRestoreStatus === 'err' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
          }`}>
            {configRestoreStatus === 'ok' ? <Check className="w-3.5 h-3.5" /> : configRestoreStatus === 'err' ? <AlertCircle className="w-3.5 h-3.5" /> : <Upload className="w-3.5 h-3.5" />}
            {configRestoreStatus === 'ok' ? 'Восстановлено' : configRestoreStatus === 'err' ? 'Ошибка' : 'Загрузить и восстановить'}
            <input type="file" accept=".json" onChange={handleRestoreConfig} className="hidden" />
          </label>
        </div>
        {configRestoreMsg && configRestoreStatus !== 'idle' && (
          <p className={`text-xs font-medium ${configRestoreStatus === 'ok' ? 'text-emerald-400' : 'text-rose-400'}`}>{configRestoreMsg}</p>
        )}
      </div>

      {/* Update Panel & Components */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-white text-sm flex items-center gap-2">
            <RefreshCw className={`w-4 h-4 text-cyan-400 ${updateLoading ? 'animate-spin' : ''}`} />
            Обновление панели и компонентов
          </h3>
          <button onClick={fetchUpdateStatus} className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
        {updateStatus && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800">
              <p className="text-[10px] text-slate-500 uppercase mb-1">Версия</p>
              <p className="font-mono text-sm text-slate-200 font-bold">{updateStatus.appVersion || '—'}</p>
            </div>
            <div className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800">
              <p className="text-[10px] text-slate-500 uppercase mb-1">Коммит</p>
              <p className="font-mono text-sm text-slate-200">{updateStatus.commit || '—'}</p>
            </div>
            <div className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800">
              <p className="text-[10px] text-slate-500 uppercase mb-1">Ветка</p>
              <p className="font-mono text-sm text-slate-200">{updateStatus.branch || '—'}</p>
            </div>
            <div className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800">
              <p className="text-[10px] text-slate-500 uppercase mb-1">Отставание</p>
              <p className="font-mono text-sm text-amber-300">{updateStatus.behind !== null ? `${updateStatus.behind} коммит(ов)` : '—'}</p>
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-3 text-xs">
          <button onClick={() => runUpdate('/api/update/panel')} disabled={updateLoading}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold cursor-pointer flex items-center gap-1.5 disabled:opacity-50">
            <Download className="w-3.5 h-3.5" /> Обновить панель (git pull + build)
          </button>
          <button onClick={() => runUpdate('/api/update/os-images')} disabled={updateLoading}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer flex items-center gap-1.5 disabled:opacity-50">
            <Image className="w-3.5 h-3.5" /> Обновить Docker-образы
          </button>
          <button onClick={() => runUpdate('/api/update/restart')} disabled={updateLoading}
            className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold cursor-pointer flex items-center gap-1.5 disabled:opacity-50">
            <Power className="w-3.5 h-3.5" /> Перезапустить панель
          </button>
        </div>
        {updateStatus?.lastLog && updateStatus.lastLog.length > 0 && (
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 max-h-48 overflow-y-auto">
            {updateStatus.lastLog.map((line: string, i: number) => (
              <p key={i} className="font-mono text-[11px] text-slate-400 leading-relaxed">{line}</p>
            ))}
          </div>
        )}
      </div>

      {/* Laptop Docker Run Command */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-white text-sm flex items-center gap-2">
            <Terminal className="w-4 h-4 text-cyan-400" />
            Запуск на ноутбуке с Docker
          </h3>
          <button onClick={handleCopyScript}
            className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 cursor-pointer">
            {copiedScript ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedScript ? 'Скопировано!' : 'Копировать'}
          </button>
        </div>
        <pre className="p-3 bg-slate-950 border border-slate-800 rounded-xl font-mono text-[11px] text-slate-300 overflow-x-auto whitespace-pre-wrap">{laptopRunCommand}</pre>
      </div>

      {/* Docker Info */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-white text-sm flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-400" />
            Docker Engine
          </h3>
          <button onClick={fetchDockerInfo} className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
        {!dockerInfo ? (
          <p className="text-xs text-slate-500">{dockerInfo === null ? 'Загрузка...' : 'Недоступно'}</p>
        ) : !dockerInfo.connected ? (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
            <Info className="w-4 h-4 shrink-0" /> Docker Engine недоступен
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800">
              <p className="text-[10px] text-slate-500 uppercase mb-1 flex items-center gap-1"><Server className="w-3 h-3" /> Версия</p>
              <p className="font-mono text-sm text-slate-200">{dockerInfo.version}</p>
            </div>
            <div className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800">
              <p className="text-[10px] text-slate-500 uppercase mb-1 flex items-center gap-1"><Cpu className="w-3 h-3" /> Контейнеры</p>
              <p className="font-mono text-sm text-slate-200">{dockerInfo.containers?.running}/{dockerInfo.containers?.total}</p>
            </div>
            <div className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800">
              <p className="text-[10px] text-slate-500 uppercase mb-1 flex items-center gap-1"><Image className="w-3 h-3" /> Образов</p>
              <p className="font-mono text-sm text-slate-200">{dockerInfo.images}</p>
            </div>
            <div className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800">
              <p className="text-[10px] text-slate-500 uppercase mb-1 flex items-center gap-1"><Zap className="w-3 h-3" /> RAM</p>
              <p className="font-mono text-sm text-slate-200">{dockerInfo.memoryTotalMb ? `${(dockerInfo.memoryTotalMb / 1024).toFixed(1)} GB` : '—'}</p>
            </div>
          </div>
        )}
      </div>

      {/* Local Images */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-white text-sm flex items-center gap-2">
            <Boxes className="w-4 h-4 text-cyan-400" />
            Локальные Docker-образы
          </h3>
          <span className="text-[11px] text-slate-500 font-mono">{images ? `${images.length}` : ''}</span>
        </div>
        {images === null ? (
          <p className="text-xs text-slate-500">Недоступно</p>
        ) : images.length === 0 ? (
          <p className="text-xs text-slate-500">Образы не найдены</p>
        ) : (
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
                <tr><th className="py-2 pr-3">Репозиторий</th><th className="py-2 pr-3">Тег</th><th className="py-2">Размер</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {images.map((img) => (
                  <tr key={img.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2 pr-3 text-slate-200 font-medium">{img.repo}</td>
                    <td className="py-2 pr-3"><span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[11px]">{img.tag}</span></td>
                    <td className="py-2 text-slate-400 font-mono">{(img.size / 1048576).toFixed(0)} MB</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
