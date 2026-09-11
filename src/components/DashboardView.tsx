import React from 'react';
import {
  Server,
  Activity,
  Cpu,
  Tv,
  Play,
  Square,
  RotateCw,
  Trash2,
  Terminal,
  ExternalLink,
  PlusCircle,
  Pause,
  HardDrive,
  Info,
  Zap,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { ContainerItem, SystemInfo, MetricHistoryPoint } from '../types';
import { getOSIcon } from './icons/OSIcons';

interface DashboardViewProps {
  containers: ContainerItem[];
  systemInfo: SystemInfo | null;
  history: MetricHistoryPoint[];
  onOpenNoVnc: (container: ContainerItem) => void;
  onOpenLogs: (container: ContainerItem) => void;
  onContainerAction: (id: string, action: string) => void;
  onNavigateTab: (tab: string) => void;
  onOpenDeploy: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  containers,
  systemInfo,
  history,
  onOpenNoVnc,
  onOpenLogs,
  onContainerAction,
  onNavigateTab,
  onOpenDeploy,
}) => {
  const runningContainers = containers.filter((c) => c.State === 'running');
  const pausedContainers = containers.filter((c) => c.State === 'paused');

  // Resource calculations
  const totalRamUsedByOsBytes = runningContainers.reduce((acc, c) => acc + (c.stats?.memoryUsage || 0), 0);
  const totalRamUsedByOsMb = Math.round(totalRamUsedByOsBytes / (1024 * 1024));

  const ramUsedGb = systemInfo ? (systemInfo.memory.used / (1024 * 1024 * 1024)).toFixed(1) : '0';
  const ramTotalGb = systemInfo ? (systemInfo.memory.total / (1024 * 1024 * 1024)).toFixed(1) : '0';
  const ramPercent = systemInfo ? systemInfo.memory.percent : 0;
  const isDockerActive = systemInfo?.docker?.socketAvailable || systemInfo?.docker?.mode === 'connected';

  const gpus = systemInfo?.gpus || [];

  // Chart data formatting
  const chartData = history.slice(-25).map((point) => {
    const d: Record<string, string | number> = {
      time: point.time,
      hostCpu: point.hostCpu,
      hostRam: point.hostRam,
    };
    if (gpus.length > 0) d.gpu0 = point.gpuUsage?.[0] ?? 0;
    if (gpus.length > 1) d.gpu1 = point.gpuUsage?.[1] ?? 0;
    return d;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Docker Socket Disconnected Notice Banner if missing */}
      {!isDockerActive && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-start space-x-3">
            <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-amber-200">Сокет Docker не подключен</h4>
              <p className="text-amber-300/80 mt-0.5">
                Отображаются только фактические системные данные текущего хоста. Для управления контейнерами пробросьте <code className="bg-amber-950/80 px-1 py-0.5 rounded text-amber-200">/var/run/docker.sock</code> или настройте TCP Host.
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigateTab('settings')}
            className="px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-semibold shrink-0 cursor-pointer border border-amber-500/30"
          >
            Настройки Docker
          </button>
        </div>
      )}

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Host CPU */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Нагрузка CPU</span>
            <div className="p-1.5 rounded-lg bg-blue-600/10 text-blue-400 border border-blue-500/20">
              <Cpu className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div className="text-2xl font-bold font-mono text-white">
              {history.length > 0 ? history[history.length - 1].hostCpu : 0}%
            </div>
            <span className="text-xs text-slate-400 font-mono">
              {systemInfo?.cpus.count || 1} vCPUs
            </span>
          </div>
          <div className="mt-2 w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, history.length > 0 ? history[history.length - 1].hostCpu : 0)}%` }}
            />
          </div>
        </div>

        {/* Host RAM */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Память RAM</span>
            <div className="p-1.5 rounded-lg bg-cyan-600/10 text-cyan-400 border border-cyan-500/20">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div className="text-2xl font-bold font-mono text-white">
              {ramPercent}%
            </div>
            <span className="text-xs text-slate-400 font-mono">
              {ramUsedGb} / {ramTotalGb} GB
            </span>
          </div>
          <div className="mt-2 w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-cyan-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${ramPercent}%` }}
            />
          </div>
        </div>

        {/* Total OS Containers */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">ОС Контейнеры</span>
            <div className="p-1.5 rounded-lg bg-emerald-600/10 text-emerald-400 border border-emerald-500/20">
              <Server className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div className="text-2xl font-bold font-mono text-white">
              {runningContainers.length} <span className="text-xs font-normal text-slate-400">активно</span>
            </div>
            <div className="flex items-center space-x-1.5 text-xs text-slate-400">
              {pausedContainers.length > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 font-mono">
                  {pausedContainers.length} пауза
                </span>
              )}
              <span className="font-mono">всего {containers.length}</span>
            </div>
          </div>
          <div className="mt-2 text-[11px] text-slate-400 flex items-center justify-between">
            <span>RAM под ОС:</span>
            <span className="font-mono font-medium text-slate-200">{totalRamUsedByOsMb} MB</span>
          </div>
        </div>

        {/* noVNC Web Desktops */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">noVNC Сессии</span>
            <div className="p-1.5 rounded-lg bg-indigo-600/10 text-indigo-400 border border-indigo-500/20">
              <Tv className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div className="text-2xl font-bold font-mono text-indigo-400">
              {containers.filter((c) => c.osInfo?.noVncPort).length}
            </div>
            <button
              onClick={() => onNavigateTab('novnc')}
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer font-medium"
            >
              <span>Смотреть</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
          <div className="mt-2 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Статус noVNC:</span>
            <span className="font-mono text-slate-300">
              {containers.filter((c) => c.osInfo?.noVncPort).length > 0 ? 'Готов к подключению' : 'Нет активных портов'}
            </span>
          </div>
        </div>
      </div>

      {/* GPU Multi-Accelerator Monitoring Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Zap className="w-4 h-4 text-emerald-400" />
            <span>Мониторинг видеокарт GPU {gpus.length > 0 && `(${gpus.length} ускорителя)`}</span>
          </h2>
          <span className="text-xs text-slate-400 font-mono">
            {gpus.length > 0 ? (gpus[0].name.includes('NVIDIA') ? 'NVIDIA CUDA &  Acceleration' : 'Intel Integrated GPU') : 'Видеокарта не обнаружена'}
          </span>
        </div>

        {gpus.length === 0 ? (
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 text-center">
            <div className="w-10 h-10 rounded-2xl bg-slate-800 text-slate-500 flex items-center justify-center mx-auto mb-2">
              <Zap className="w-5 h-5" />
            </div>
            <p className="text-xs text-slate-400">Видеокарта не обнаружена на этом хосте</p>
            <p className="text-[11px] text-slate-500 mt-1">Подключите NVIDIA GPU или используйте хост с встроенной Intel графикой</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {gpus.map((gpu) => (
              <div
                key={gpu.id}
                className="p-4 sm:p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 relative overflow-hidden"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-bold">
                        GPU {gpu.id}
                      </span>
                      <span className="text-xs text-slate-400 font-mono">
                        {gpu.temperatureC > 0 && <>{gpu.temperatureC}°C &bull; </>}
                        {gpu.powerWatts > 0 && <>{gpu.powerWatts}W</>}
                      </span>
                    </div>
                    <h3 className="font-bold text-white text-sm mt-1">{gpu.name}</h3>
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-bold font-mono text-emerald-400">
                      {gpu.usagePercent}%
                    </span>
                    <div className="text-[10px] text-slate-400">Загрузка ГПУ</div>
                  </div>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-slate-800">
                  {gpu.vramTotalMb > 0 && gpu.vramTotalMb > gpu.vramUsedMb ? (
                    <>
                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-slate-400">
                          {gpu.name.includes('Intel') ? 'Системная память (shared):' : 'Видеопамять VRAM:'}
                        </span>
                        <span className="text-slate-200">
                          {Math.round(gpu.vramUsedMb / 1024 * 10) / 10} GB / {Math.round(gpu.vramTotalMb / 1024)} GB ({gpu.vramPercent}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                        <div
                          className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${gpu.vramPercent}%` }}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="text-[11px] text-slate-500 font-mono">
                      {gpu.name.includes('Intel') ? 'Встроенная графика — выделенной памяти нет' : 'Нет данных о памяти'}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main Section: OS Containers Quick Access */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <h2 className="text-base font-bold text-white tracking-tight">Операционные системы в Docker</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
              {containers.length}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onOpenDeploy}
              className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm shadow-blue-600/20 transition-all cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Развернуть ОС</span>
            </button>
            <button
              onClick={() => onNavigateTab('containers')}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors cursor-pointer"
            >
              Все контейнеры →
            </button>
          </div>
        </div>

        {/* Empty State when no containers exist */}
        {containers.length === 0 ? (
          <div className="p-8 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
              <Server className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white">Контейнеры Docker не найдены</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              {isDockerActive
                ? 'На подключенном сервере Docker нет запущенных контейнеров. Нажмите "Развернуть ОС", чтобы создать операционную систему Ubuntu, Windows XP или Debian.'
                : 'Подключите сокет /var/run/docker.sock к приложению или укажите TCP Host в настройках для обнаружения контейнеров на вашем ноутбуке.'}
            </p>
            <div className="pt-2 flex justify-center gap-3">
              <button
                onClick={onOpenDeploy}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer shadow-lg shadow-blue-600/20"
              >
                + Запустить первую ОС
              </button>
              <button
                onClick={() => onNavigateTab('settings')}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Настройки подключения
              </button>
            </div>
          </div>
        ) : (
          /* Cards Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {containers.map((container) => {
              const isRunning = container.State === 'running';
              const isPaused = container.State === 'paused';
              const ramMb = Math.round((container.stats?.memoryUsage || 0) / (1024 * 1024));
              const cpu = container.stats?.cpuPercent || 0;

              return (
                <div
                  key={container.Id}
                  className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                    isRunning
                      ? 'bg-slate-900 border-slate-800 hover:border-slate-700'
                      : isPaused
                      ? 'bg-slate-900/80 border-amber-500/20'
                      : 'bg-slate-900/60 border-slate-800/80 opacity-75'
                  }`}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0">
                        {getOSIcon(container.osInfo?.type || 'linux', 'w-6 h-6 sm:w-7 sm:h-7')}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h3 className="font-bold text-white text-sm">{container.osInfo?.displayName || container.Image}</h3>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                              isRunning
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : isPaused
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}
                          >
                            {isRunning ? 'Запущен' : isPaused ? 'На паузе' : 'Остановлен'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 font-mono mt-0.5 truncate max-w-[180px] sm:max-w-none">
                          {container.Names?.[0] || container.Id.slice(0, 12)} • {container.osInfo?.desktopEnv || 'GUI'}
                        </p>
                      </div>
                    </div>

                    {/* noVNC Badge / Direct Link */}
                    {container.osInfo?.noVncPort && (
                      <div className="text-right shrink-0">
                        <span className="text-[11px] font-mono px-2 py-1 rounded-lg bg-blue-600/10 text-blue-400 border border-blue-500/20 block">
                          :{container.osInfo.noVncPort}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Resource Meters */}
                  <div className="mt-4 grid grid-cols-2 gap-3 py-3 border-y border-slate-800/80 text-xs">
                    <div>
                      <div className="flex justify-between text-slate-400 mb-1">
                        <span>CPU:</span>
                        <span className="font-mono font-medium text-slate-200">{cpu}%</span>
                      </div>
                      <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-blue-500 h-1.5 rounded-full transition-all"
                          style={{ width: `${Math.min(100, cpu)}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-slate-400 mb-1">
                        <span>RAM:</span>
                        <span className="font-mono font-medium text-slate-200">{ramMb} MB</span>
                      </div>
                      <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-cyan-500 h-1.5 rounded-full transition-all"
                          style={{ width: `${Math.min(100, container.stats?.memoryPercent || 0)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Live Actions & noVNC launch */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center space-x-1.5">
                      {isRunning ? (
                        <>
                          <button
                            onClick={() => onContainerAction(container.Id, 'pause')}
                            title="Пауза"
                            className="p-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 transition-colors cursor-pointer text-xs flex items-center gap-1 font-medium"
                          >
                            <Pause className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Пауза</span>
                          </button>
                          <button
                            onClick={() => onContainerAction(container.Id, 'restart')}
                            title="Перезапустить"
                            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onContainerAction(container.Id, 'stop')}
                            title="Остановить"
                            className="p-2 rounded-lg bg-slate-800 hover:bg-rose-900/60 text-slate-300 hover:text-rose-200 transition-colors cursor-pointer"
                          >
                            <Square className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : isPaused ? (
                        <>
                          <button
                            onClick={() => onContainerAction(container.Id, 'unpause')}
                            title="Продолжить"
                            className="p-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 transition-colors cursor-pointer text-xs flex items-center gap-1 font-medium"
                          >
                            <Play className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Старт</span>
                          </button>
                          <button
                            onClick={() => onContainerAction(container.Id, 'stop')}
                            title="Остановить"
                            className="p-2 rounded-lg bg-slate-800 hover:bg-rose-900/60 text-slate-300 hover:text-rose-200 transition-colors cursor-pointer"
                          >
                            <Square className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => onContainerAction(container.Id, 'start')}
                          title="Запустить"
                          className="p-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 transition-colors cursor-pointer text-xs flex items-center gap-1 font-medium"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Старт</span>
                        </button>
                      )}

                      <button
                        onClick={() => onOpenLogs(container)}
                        title="Логи терминала"
                        className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                      >
                        <Terminal className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => onContainerAction(container.Id, 'remove')}
                        title="Удалить контейнер"
                        className="p-2 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* noVNC CTA */}
                    {container.osInfo?.noVncPort ? (
                      <button
                        onClick={() => onOpenNoVnc(container)}
                        className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm shadow-blue-600/20 transition-all cursor-pointer"
                      >
                        <Tv className="w-3.5 h-3.5" />
                        <span>noVNC</span>
                      </button>
                    ) : (
                      <span className="text-xs text-slate-500">Без VNC</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Telemetry Chart: Real-Time Resource Usage */}
      <div className="p-4 sm:p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <div>
            <h3 className="text-sm font-bold text-white">Мониторинг нагрузки хоста и GPU в реальном времени</h3>
            <p className="text-xs text-slate-400">
              {gpus.length > 0
                ? `Фактическая нагрузка процессора (CPU %), RAM (%) и ${gpus.length === 1 ? gpus[0].name : `ускорителей GPU 0 / GPU 1`}`
                : 'Фактическая нагрузка процессора (CPU %) и оперативной памяти RAM (%)'}
            </p>
          </div>
          <button
            onClick={() => onNavigateTab('resources')}
            className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1 cursor-pointer self-start sm:self-auto"
          >
            <span>Детально</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>

        <div className="h-52 sm:h-60 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="hostCpuGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="hostRamGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="gpuGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="time" stroke="#64748b" fontSize={10} tickLine={false} />
              <YAxis stroke="#64748b" fontSize={10} tickLine={false} unit="%" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#334155',
                  borderRadius: '0.75rem',
                  fontSize: '12px',
                }}
              />
              <Area type="monotone" dataKey="hostCpu" name="Хост CPU (%)" stroke="#3b82f6" fill="url(#hostCpuGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="hostRam" name="Хост RAM (%)" stroke="#06b6d4" fill="url(#hostRamGrad)" strokeWidth={2} />
              {gpus.length > 0 && (
                <Area type="monotone" dataKey="gpu0" name="GPU 0 Load (%)" stroke="#10b981" fill="url(#gpuGrad)" strokeWidth={2} />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
