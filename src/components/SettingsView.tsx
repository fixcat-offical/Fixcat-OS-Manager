import React, { useState } from 'react';
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
} from 'lucide-react';
import { SystemInfo } from '../types';

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

  const laptopRunCommand = `# Запуск панели на ноутбуке с прямым доступом к Docker сокету:
docker run -d \\
  --name -os-manager \\
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
    </div>
  );
};
