import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Play,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Terminal,
  Copy,
  Check,
  Zap,
  Server,
  Radio,
} from 'lucide-react';
import {
  UbuntuIcon,
  WindowsXPIcon,
  DebianIcon,
  KaliIcon,
  AlpineIcon,
} from './icons/OSIcons';

interface DeployModalProps {
  onClose: () => void;
  onDeploy: (config: any) => Promise<boolean | void>;
}

export const DeployModal: React.FC<DeployModalProps> = ({ onClose, onDeploy }) => {
  const [selectedTemplate, setSelectedTemplate] = useState('ubuntu');
  const [containerName, setContainerName] = useState(`ubuntu-desktop-${Math.floor(Math.random() * 89 + 10)}`);
  const [vncPort, setVncPort] = useState('6082');
  const [ramMb, setRamMb] = useState('2048');
  const [cpuCores, setCpuCores] = useState('2');
  const [resolution, setResolution] = useState('1920x1080');
  const [restartPolicy, setRestartPolicy] = useState('no');

  const [isDeploying, setIsDeploying] = useState(false);
  const [deployStep, setDeployStep] = useState<number>(0);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isScanningPort, setIsScanningPort] = useState(false);

  const templates = [
    {
      id: 'ubuntu',
      name: 'Ubuntu 22.04 LTS (XFCE Desktop)',
      renderIcon: () => <UbuntuIcon className="w-6 h-6" />,
      badge: 'Популярное',
      image: 'dorowu/ubuntu-desktop-lxde-vnc:latest',
      webPort: 80,
      vncPort: 5900,
      defaultPort: '6082',
      defaultRam: '2048',
      desc: 'Полноценный рабочий стол Ubuntu Linux с готовым веб-доступом noVNC.',
    },
    {
      id: 'windows-xp',
      name: 'Windows XP Professional SP3',
      renderIcon: () => <WindowsXPIcon className="w-6 h-6" />,
      badge: 'Классика',
      image: 'dockur/windows:xp',
      webPort: 8006,
      vncPort: 5900,
      defaultPort: '8007',
      defaultRam: '1024',
      desc: 'Легковесная виртуальная машина Windows XP с Luna темой в контейнере.',
    },
    {
      id: 'debian',
      name: 'Debian 12 Bookworm XFCE',
      renderIcon: () => <DebianIcon className="w-6 h-6" />,
      badge: 'Стабильность',
      image: 'ghcr.io/linuxserver/webtop:debian-xfce',
      webPort: 3000,
      vncPort: 5900,
      defaultPort: '3001',
      defaultRam: '2048',
      desc: 'Оригинальный дистрибутив Debian с легковесным графическим столом.',
    },
    {
      id: 'kali',
      name: 'Kali Linux Security GUI',
      renderIcon: () => <KaliIcon className="w-6 h-6" />,
      badge: 'Безопасность',
      image: 'kasmweb/kali-rolling-desktop:1.16.0',
      webPort: 6901,
      vncPort: 5901,
      defaultPort: '3002',
      defaultRam: '3072',
      desc: 'Дистрибутив для тестирования и безопасности с графическим интерфейсом.',
    },
    {
      id: 'alpine',
      name: 'Alpine Linux Light GUI',
      renderIcon: () => <AlpineIcon className="w-6 h-6" />,
      badge: 'Минимум RAM',
      image: 'ghcr.io/linuxserver/webtop:alpine-kde',
      webPort: 3000,
      vncPort: 5900,
      defaultPort: '3003',
      defaultRam: '512',
      desc: 'Сверхбыстрый дистрибутив с минимальным потреблением ресурсов.',
    },
  ];

  // Auto-scan for available free port
  const fetchFreePort = async (desiredPort: string) => {
    setIsScanningPort(true);
    try {
      const res = await fetch(`/api/ports/next?desired=${desiredPort}`);
      if (res.ok) {
        const data = await res.json();
        if (data.freePort) {
          setVncPort(String(data.freePort));
        }
      }
    } catch {
      // Ignore scan failure
    } finally {
      setIsScanningPort(false);
    }
  };

  useEffect(() => {
    const tpl = templates.find((t) => t.id === selectedTemplate) || templates[0];
    fetchFreePort(tpl.defaultPort);
  }, [selectedTemplate]);

  const handleSelectTemplate = (tpl: any) => {
    setSelectedTemplate(tpl.id);
    setContainerName(`${tpl.id}-desktop-${Math.floor(Math.random() * 89 + 10)}`);
    setRamMb(tpl.defaultRam);
  };

  const selectedTplObj = templates.find((t) => t.id === selectedTemplate) || templates[0];
  const dockerCmd = `docker run -d --restart=${restartPolicy} --name ${containerName || 'os-desktop'} -p ${vncPort}:${selectedTplObj.webPort} -p ${parseInt(vncPort, 10) + 100}:${selectedTplObj.vncPort} -e RESOLUTION=${resolution} --memory=${ramMb}m --cpus=${cpuCores} ${selectedTplObj.image}`;

  const handleCopyCmd = () => {
    navigator.clipboard.writeText(dockerCmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAutoDeploy = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsDeploying(true);
    setDeployError(null);
    setDeployStep(1);

    const stepTimer1 = setTimeout(() => setDeployStep(2), 1000);
    const stepTimer2 = setTimeout(() => setDeployStep(3), 2200);

    try {
      await onDeploy({
        osType: selectedTemplate,
        containerName,
        vncPort,
        ramMb,
        cpuCores,
        resolution,
        restartPolicy,
      });
      setDeployStep(4);
    } catch (err: any) {
      setDeployError(err?.message || 'Ошибка автоматического развертывания');
    } finally {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      setIsDeploying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden my-auto">
        {/* Modal Header */}
        <div className="bg-slate-950 px-5 sm:px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Автоматическое развертывание ОС</h3>
              <p className="text-xs text-slate-400">Авто-поиск свободного порта и развертывание без ввода команд</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isDeploying}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleAutoDeploy} className="p-5 sm:p-6 space-y-5">
          {/* Template Selection */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              1. Выберите дистрибутив:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {templates.map((tpl) => {
                const isSelected = selectedTemplate === tpl.id;
                return (
                  <div
                    key={tpl.id}
                    onClick={() => !isDeploying && handleSelectTemplate(tpl)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start space-x-3 ${
                      isSelected
                        ? 'bg-blue-950/40 border-blue-500 shadow-md shadow-blue-500/10'
                        : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                    } ${isDeploying ? 'pointer-events-none opacity-60' : ''}`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center shrink-0 mt-0.5">
                      {tpl.renderIcon()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-white truncate">{tpl.name}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{tpl.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Form Fields */}
          <div className="space-y-3">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              2. Параметры виртуальной среды:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-slate-400 mb-1 block">Имя контейнера:</label>
                <input
                  type="text"
                  value={containerName}
                  disabled={isDeploying}
                  onChange={(e) => setContainerName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:border-blue-500 focus:outline-none font-mono disabled:opacity-50"
                  required
                />
              </div>

              <div>
                <label className="text-slate-400 mb-1 block flex items-center justify-between">
                  <span>noVNC Порт (Авто-поиск):</span>
                  {isScanningPort && (
                    <span className="text-[10px] text-blue-400 flex items-center gap-1 font-mono">
                      <Loader2 className="w-3 h-3 animate-spin" /> поиск порта
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={vncPort}
                    disabled={isDeploying}
                    onChange={(e) => setVncPort(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:border-blue-500 focus:outline-none font-mono disabled:opacity-50"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => fetchFreePort(vncPort)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg cursor-pointer border border-slate-700"
                    title="Проверить свободный порт"
                  >
                    Авто
                  </button>
                </div>
              </div>

              <div>
                <label className="text-slate-400 mb-1 block">Оперативная память (MB):</label>
                <input
                  type="number"
                  value={ramMb}
                  disabled={isDeploying}
                  onChange={(e) => setRamMb(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:border-blue-500 focus:outline-none font-mono disabled:opacity-50"
                />
              </div>

              <div>
                <label className="text-slate-400 mb-1 block">Разрешение экрана:</label>
                <select
                  value={resolution}
                  disabled={isDeploying}
                  onChange={(e) => setResolution(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:border-blue-500 focus:outline-none font-mono disabled:opacity-50"
                >
                  <option value="1920x1080">1920x1080 (Full HD)</option>
                  <option value="1600x900">1600x900</option>
                  <option value="1280x720">1280x720 (HD)</option>
                  <option value="1024x768">1024x768 (Windows XP Classic)</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 mb-1 block">Автозапуск при старте хоста:</label>
                <select
                  value={restartPolicy}
                  disabled={isDeploying}
                  onChange={(e) => setRestartPolicy(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:border-blue-500 focus:outline-none font-mono disabled:opacity-50"
                >
                  <option value="no">Нет (выкл.)</option>
                  <option value="unless-stopped">Всегда (unless-stopped)</option>
                  <option value="always">Всегда (always)</option>
                  <option value="on-failure">При ошибке (on-failure)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Active Deployment Progress Box */}
          {isDeploying && (
            <div className="p-4 rounded-xl bg-blue-950/40 border border-blue-800/60 space-y-3 animate-fade-in">
              <div className="flex items-center space-x-2 text-xs font-semibold text-blue-300">
                <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                <span>Автоматический запуск ОС на порту :{vncPort}...</span>
              </div>
              <div className="space-y-1.5 text-xs text-slate-300 font-mono">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>1. Автоматический поиск свободного порта хоста (Занят? -&gt; назначит следующий)</span>
                </div>
                <div className="flex items-center space-x-2">
                  {deployStep >= 2 ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin shrink-0" />
                  )}
                  <span>2. Выполнение команды в сокет Docker daemon</span>
                </div>
                <div className="flex items-center space-x-2">
                  {deployStep >= 3 ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full border border-slate-600 shrink-0" />
                  )}
                  <span>3. Подготовка веб-сервера noVNC</span>
                </div>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {deployError && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-start space-x-2.5 text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Ошибка автоматического запуска:</span> {deployError}
                <p className="text-[11px] text-rose-400/80 mt-1">
                  Если сокет Docker на ноутбуке не проброшен, вы можете скопировать команду ниже и запустить вручную.
                </p>
              </div>
            </div>
          )}

          {/* Docker Run Command Backup Preview */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 flex items-center gap-1.5 font-medium">
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                Сформированная команда Docker CLI:
              </span>
              <button
                type="button"
                onClick={handleCopyCmd}
                className="text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 cursor-pointer text-[11px]"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Скопировано' : 'Скопировать'}
              </button>
            </div>
            <pre className="p-3 bg-slate-950 border border-slate-800 rounded-xl font-mono text-[11px] text-slate-300 overflow-x-auto whitespace-pre-wrap">
              {dockerCmd}
            </pre>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 flex items-center justify-end space-x-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isDeploying}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isDeploying}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/25 transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
            >
              {isDeploying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Разворачиваем ОС...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 text-amber-300 fill-amber-300" />
                  <span>Автоматически развернуть</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
