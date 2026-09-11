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
  onUpdateConfig: (config: any) => void;
  onRefresh: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  systemInfo,
  onUpdateConfig,
  onRefresh,
}) => {
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

  const fetchDockerInfo = () => {
    fetch('/api/docker/info')
      .then((r) => r.json())
      .then(setDockerInfo)
      .catch(() => setDockerInfo(null));
  };

  useEffect(() => {
    fetchDockerInfo();
    fetch('/api/images')
      .then((r) => r.json())
      .then((d) => setImages(d.images || []))
      .catch(() => setImages(null));
  }, []);

  const isDockerActive = systemInfo?.docker?.socketAvailable || systemInfo?.docker?.mode === 'connected';

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await onUpdateConfig({
      hostIp,
      dockerSocketPath: dockerSocket,
      dockerTcpHost: dockerTcp,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleDownloadConfigBackup = async () => {
    try {
      const res = await fetch('/api/config/backup');
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
        const res = await fetch('/api/config/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config: cfg }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'restore failed');
        setConfigRestoreStatus('ok');
        setConfigRestoreMsg('Конфигурация восстановлена — обновите страницу для применения всех настроек.');
        setTimeout(() => setConfigRestoreStatus('idle'), 4000);
      } catch (err: any) {
        setConfigRestoreStatus('err');
        setConfigRestoreMsg(err?.message || 'Ошибка восстановления конфигурации');
        setTimeout(() => setConfigRestoreStatus('idle'), 4000);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
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

  return (
    <div className="space-y-6 max-w-4xl pb-12">
      {/* Docker Connection Status Card */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Статус подключения к Docker</h3>
              <p className="text-xs text-slate-400 font-mono">
                {dockerTcp || dockerSocket}
              </p>
            </div>
          </div>

          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold border flex items-center gap-1.5 ${
              isDockerActive
                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
            }`}
          >
            <Radio className={`w-3.5 h-3.5 ${isDockerActive ? 'text-emerald-400 animate-pulse' : 'text-amber-400'}`} />
            <span>{isDockerActive ? 'Docker Socket подключен' : 'Режим автопоиска (Эмуляция)'}</span>
          </span>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed pt-1">
          Панель автоматически находит контейнеры операционных систем (Ubuntu, Windows XP и др.), сканирует открытые порты noVNC (6080, 8006, 5800, 3000) и формирует рабочие ссылки для удаленного доступа прямо в браузере.
        </p>
      </div>

      {/* Settings Form */}
      <form onSubmit={handleSave} className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <h3 className="font-bold text-white text-sm uppercase tracking-wider flex items-center gap-2">
          <Settings className="w-4 h-4 text-blue-400" />
          Конфигурация хоста и ссылок noVNC
        </h3>

        <div className="space-y-3 text-xs">
          <div>
            <label className="text-slate-300 font-medium block mb-1">
              IP-адрес или домен хоста (для формирования ссылок noVNC):
            </label>
            <input
              type="text"
              value={hostIp}
              onChange={(e) => setHostIp(e.target.value)}
              placeholder="localhost или 192.168.1.50"
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:border-blue-500 focus:outline-none font-mono"
            />
            <span className="text-[11px] text-slate-500 mt-1 block">
              Если вы подключаетесь с другого устройства в локальной сети, укажите локальный IP вашего ноутбука (например: 192.168.1.100).
            </span>
          </div>

          <div>
            <label className="text-slate-300 font-medium block mb-1">
              Путь к Unix-сокету Docker:
            </label>
            <input
              type="text"
              value={dockerSocket}
              onChange={(e) => setDockerSocket(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:border-blue-500 focus:outline-none font-mono"
            />
          </div>

          <div>
            <label className="text-slate-300 font-medium block mb-1">
              Docker TCP Host (опционально, если Docker запущен по TCP):
            </label>
            <input
              type="text"
              value={dockerTcp}
              onChange={(e) => setDockerTcp(e.target.value)}
              placeholder="tcp://127.0.0.1:2375"
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:border-blue-500 focus:outline-none font-mono"
            />
          </div>
        </div>

        <div className="pt-2 flex items-center justify-between">
          {saved ? (
            <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
              <Check className="w-4 h-4" /> Настройки сохранены!
            </span>
          ) : (
            <span />
          )}

          <button
            type="submit"
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-xl shadow-md shadow-blue-600/20 transition-all cursor-pointer"
          >
            Сохранить настройки
          </button>
        </div>
      </form>

      {/* Config Backup / Restore */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-white text-sm flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-violet-400" />
            Бэкап / Восстановление конфигурации
          </h3>
        </div>

        <p className="text-xs text-slate-400">
          Скачайте текущий конфиг панели (IP, Docker Host) в JSON-файл и восстановите его на другом экземпляре.
        </p>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleDownloadConfigBackup}
            className={`px-4 py-2 text-xs font-semibold rounded-xl cursor-pointer flex items-center gap-2 transition-colors ${
              configBackupStatus === 'ok'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : configBackupStatus === 'err'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                : 'bg-violet-500/15 hover:bg-violet-500/25 text-violet-200 border border-violet-500/25'
            }`}
          >
            {configBackupStatus === 'ok' ? <Check className="w-3.5 h-3.5" /> : <HardDrive className="w-3.5 h-3.5" />}
            {configBackupStatus === 'ok' ? 'Скачано' : configBackupStatus === 'err' ? 'Ошибка' : 'Скачать текущий конфиг'}
          </button>

          <label
            className={`px-4 py-2 text-xs font-semibold rounded-xl cursor-pointer flex items-center gap-2 transition-colors ${
              configRestoreStatus === 'ok'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : configRestoreStatus === 'err'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
            }`}
          >
            {configRestoreStatus === 'ok' ? <Check className="w-3.5 h-3.5" /> : configRestoreStatus === 'err' ? <AlertCircle className="w-3.5 h-3.5" /> : <Radio className="w-3.5 h-3.5" />}
            {configRestoreStatus === 'ok' ? 'Готово' : configRestoreStatus === 'err' ? 'Ошибка' : 'Загрузить и восстановить'}
            <input
              type="file"
              accept=".json"
              onChange={handleRestoreConfig}
              className="hidden"
            />
          </label>
        </div>

        {configRestoreMsg && configRestoreStatus !== 'idle' && (
          <p className={`text-xs font-medium ${configRestoreStatus === 'ok' ? 'text-emerald-400' : 'text-rose-400'}`}>
            {configRestoreMsg}
          </p>
        )}
      </div>

      {/* Instructions on running on laptop */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-white text-sm flex items-center gap-2">
            <Terminal className="w-4 h-4 text-cyan-400" />
            Инструкция запуска на вашем ноутбуке
          </h3>
          <button
            onClick={handleCopyScript}
            className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 cursor-pointer"
          >
            {copiedScript ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedScript ? 'Скопировано!' : 'Копировать'}
          </button>
        </div>

        <p className="text-xs text-slate-400">
          Для того чтобы сайт напрямую управлял вашими запущенными образами Ubuntu и Windows XP, смонтируйте сокет Docker:
        </p>

        <pre className="p-3 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-slate-300 overflow-x-auto whitespace-pre-wrap">
          {laptopRunCommand}
        </pre>
      </div>

      {/* Docker Engine Info */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-white text-sm flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-400" />
            Информация о Docker Engine
          </h3>
          <button
            onClick={() => fetch('/api/docker/info').then((r) => r.json()).then(setDockerInfo).catch(() => setDockerInfo(null))}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
            title="Обновить"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {!dockerInfo ? (
          <p className="text-xs text-slate-500">
            {dockerInfo === null ? 'Загрузка...' : 'Не удалось получить данные.'}
          </p>
        ) : !dockerInfo.connected ? (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
            <Info className="w-4 h-4 shrink-0" />
            Docker Engine недоступен — подключите сокет или TCP Host.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <p className="text-[10px] text-slate-500 uppercase mb-1 flex items-center gap-1"><Server className="w-3 h-3" /> Версия</p>
              <p className="font-mono text-sm text-slate-200">{dockerInfo.version || '—'}</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <p className="text-[10px] text-slate-500 uppercase mb-1 flex items-center gap-1"><Cpu className="w-3 h-3" /> API</p>
              <p className="font-mono text-sm text-slate-200">{dockerInfo.apiVersion || '—'}</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <p className="text-[10px] text-slate-500 uppercase mb-1 flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> ОС / Архитектура</p>
              <p className="font-mono text-xs text-slate-200 truncate" title={dockerInfo.os}>{dockerInfo.os || '—'}</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <p className="text-[10px] text-slate-500 uppercase mb-1 flex items-center gap-1"><Cpu className="w-3 h-3" /> Ядро</p>
              <p className="font-mono text-xs text-slate-200 truncate">{dockerInfo.kernel || '—'}</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <p className="text-[10px] text-slate-500 uppercase mb-1 flex items-center gap-1"><Activity className="w-3 h-3" /> Контейнеры</p>
              <p className="font-mono text-sm text-slate-200">
                {dockerInfo.containers ? `${dockerInfo.containers.running}/${dockerInfo.containers.total}` : '—'}
                <span className="text-[10px] text-slate-500"> (запущено/всего)</span>
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <p className="text-[10px] text-slate-500 uppercase mb-1 flex items-center gap-1"><Layers className="w-3 h-3" /> Образов</p>
              <p className="font-mono text-sm text-slate-200">{dockerInfo.images ?? '—'}</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <p className="text-[10px] text-slate-500 uppercase mb-1 flex items-center gap-1"><HardDrive className="w-3 h-3" /> Docker Root</p>
              <p className="font-mono text-xs text-slate-200 truncate" title={dockerInfo.dockerRootDir}>{dockerInfo.dockerRootDir || '—'}</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <p className="text-[10px] text-slate-500 uppercase mb-1 flex items-center gap-1"><Zap className="w-3 h-3" /> RAM хоста</p>
              <p className="font-mono text-sm text-slate-200">
                {dockerInfo.memoryTotalMb ? `${(dockerInfo.memoryTotalMb / 1024).toFixed(1)} GB` : '—'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Local Docker Images */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-white text-sm flex items-center gap-2">
            <Boxes className="w-4 h-4 text-cyan-400" />
            Локальные образы Docker
          </h3>
          <span className="text-[11px] text-slate-500 font-mono">{images ? `${images.length} образ(ов)` : ''}</span>
        </div>

        {images === null ? (
          <p className="text-xs text-slate-500">Загрузка...</p>
        ) : images.length === 0 ? (
          <p className="text-xs text-slate-500">Образы недоступны — Docker сокет не подключен.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                <tr>
                  <th className="py-2 pr-4">Репозиторий</th>
                  <th className="py-2 pr-4">Тег</th>
                  <th className="py-2 pr-4">Размер</th>
                  <th className="py-2">ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {images.map((img) => (
                  <tr key={img.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2 pr-4 text-slate-200 font-medium">{img.repo}</td>
                    <td className="py-2 pr-4">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[11px]">{img.tag}</span>
                    </td>
                    <td className="py-2 pr-4 text-slate-400 font-mono">{(img.size / 1048576).toFixed(0)} MB</td>
                    <td className="py-2 text-slate-500 font-mono text-[11px]">{img.id.slice(0, 12)}</td>
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
