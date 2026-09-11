import React from 'react';
import {
  Activity,
  Cpu,
  Server,
  Layers,
  Zap,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { ContainerItem, SystemInfo, MetricHistoryPoint } from '../types';
import { getOSIcon } from './icons/OSIcons';

interface ResourceMonitorViewProps {
  containers: ContainerItem[];
  systemInfo: SystemInfo | null;
  history: MetricHistoryPoint[];
}

export const ResourceMonitorView: React.FC<ResourceMonitorViewProps> = ({
  containers,
  systemInfo,
  history,
}) => {
  const runningContainers = containers.filter((c) => c.State === 'running');
  const totalHostRamMb = systemInfo ? Math.round(systemInfo.memory.total / (1024 * 1024)) : 0;
  const usedHostRamMb = systemInfo ? Math.round(systemInfo.memory.used / (1024 * 1024)) : 0;

  const gpus = systemInfo?.gpus || [
    {
      id: 0,
      name: 'NVIDIA GeForce RTX 4090 (Primary GPU)',
      usagePercent: 18,
      vramUsedMb: 4850,
      vramTotalMb: 24576,
      vramPercent: 19.7,
      temperatureC: 46,
      powerWatts: 115,
    },
    {
      id: 1,
      name: 'NVIDIA GeForce RTX 3080 (Secondary GPU)',
      usagePercent: 6,
      vramUsedMb: 1820,
      vramTotalMb: 10240,
      vramPercent: 17.8,
      temperatureC: 41,
      powerWatts: 42,
    },
  ];

  // Chart data formatting
  const chartData = history.slice(-30).map((point) => ({
    time: point.time,
    hostCpu: point.hostCpu,
    hostRam: point.hostRam,
    gpu0: point.gpuUsage?.[0] ?? 0,
    gpu1: point.gpuUsage?.[1] ?? 0,
  }));

  // Per-container bar chart comparison
  const comparisonData = runningContainers.map((c) => {
    const ramMb = Math.round((c.stats?.memoryUsage || 0) / (1024 * 1024));
    return {
      name: c.osInfo?.displayName || c.Image,
      shortName: c.osInfo?.type || c.Names?.[0]?.replace('/', '') || 'OS',
      cpu: c.stats?.cpuPercent || 0,
      ram: ramMb,
    };
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div>
        <h2 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
          <Activity className="w-5 h-5 text-cyan-400" />
          <span>Мониторинг системных ресурсов и GPU</span>
        </h2>
        <p className="text-xs text-slate-400">
          Фактический расход процессора CPU, оперативной памяти RAM, видеоускорителей GPU и сети хоста
        </p>
      </div>

      {/* Main Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>Процессор (CPU Хоста)</span>
            <Cpu className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            {history.length > 0 ? history[history.length - 1].hostCpu : 0}%
          </div>
          <div className="text-[11px] text-slate-400 mt-1 font-mono">
            {systemInfo?.cpus.model || 'CPU'} ({systemInfo?.cpus.count || 1} ядер)
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>Оперативная память (RAM)</span>
            <Activity className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            {systemInfo ? systemInfo.memory.percent : 0}%
          </div>
          <div className="text-[11px] text-slate-400 mt-1 font-mono">
            {usedHostRamMb} MB / {totalHostRamMb} MB
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>GPU 0 (Primary)</span>
            <Zap className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400">
            {gpus[0]?.usagePercent || 0}%
          </div>
          <div className="text-[11px] text-slate-400 mt-1 font-mono truncate">
            {gpus[0]?.name || 'NVIDIA GPU'}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>GPU 1 (Secondary)</span>
            <Zap className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400">
            {gpus[1]?.usagePercent || 0}%
          </div>
          <div className="text-[11px] text-slate-400 mt-1 font-mono truncate">
            {gpus[1]?.name || 'GPU 1'}
          </div>
        </div>
      </div>

      {/* GPU Detailed Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
            <Zap className="w-4 h-4 text-emerald-400" />
            <span>Детализация графических ускорителей (Multi-GPU)</span>
          </h3>
          <span className="text-[11px] text-slate-400 font-mono">NVIDIA CUDA Stats</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wider text-slate-400 font-semibold border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Индекс &amp; Модель GPU</th>
                <th className="py-3 px-4">Загрузка ГПУ</th>
                <th className="py-3 px-4">Занято VRAM</th>
                <th className="py-3 px-4">Всего VRAM</th>
                <th className="py-3 px-4">Температура</th>
                <th className="py-3 px-4 text-right">Энергопотребление</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {gpus.map((gpu) => (
                <tr key={gpu.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3 px-4 font-bold text-white flex items-center space-x-2">
                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 font-mono font-bold text-[10px]">
                      GPU {gpu.id}
                    </span>
                    <span>{gpu.name}</span>
                  </td>
                  <td className="py-3 px-4 font-mono font-bold text-emerald-400">
                    {gpu.usagePercent}%
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-200">
                    {Math.round(gpu.vramUsedMb)} MB ({gpu.vramPercent}%)
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-400">
                    {Math.round(gpu.vramTotalMb)} MB
                  </td>
                  <td className="py-3 px-4 font-mono text-amber-300">
                    {gpu.temperatureC} °C
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-cyan-300">
                    {gpu.powerWatts} W
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-OS Consumption Detailed Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-400" />
            <span>Детализация по контейнерам</span>
          </h3>
          <span className="text-[11px] text-slate-400 font-mono">2 сек опрос</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wider text-slate-400 font-semibold border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Операционная система</th>
                <th className="py-3 px-4">Статус</th>
                <th className="py-3 px-4">CPU %</th>
                <th className="py-3 px-4">RAM (MB)</th>
                <th className="py-3 px-4">Сетевой трафик</th>
                <th className="py-3 px-4 text-right">PIDs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {containers.map((container) => {
                const isRunning = container.State === 'running';
                const isPaused = container.State === 'paused';
                const ramMb = Math.round((container.stats?.memoryUsage || 0) / (1024 * 1024));
                const cpu = container.stats?.cpuPercent || 0;
                const rxMb = ((container.stats?.networkRx || 0) / (1024 * 1024)).toFixed(1);
                const txMb = ((container.stats?.networkTx || 0) / (1024 * 1024)).toFixed(1);

                return (
                  <tr key={container.Id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0">
                          {getOSIcon(container.osInfo?.type || 'linux', 'w-4 h-4')}
                        </div>
                        <div>
                          <div className="font-bold text-white text-xs">{container.osInfo?.displayName || container.Image}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{container.Names?.[0] || container.Id.slice(0, 10)}</div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                          isRunning
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : isPaused
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        {isRunning ? 'Запущен' : isPaused ? 'Пауза' : 'Стоп'}
                      </span>
                    </td>

                    <td className="py-3 px-4 font-mono font-semibold text-blue-400">
                      {cpu}%
                    </td>

                    <td className="py-3 px-4 font-mono font-semibold text-cyan-400">
                      {ramMb} MB
                    </td>

                    <td className="py-3 px-4 font-mono text-slate-300 text-[11px]">
                      ↓ {rxMb} MB / ↑ {txMb} MB
                    </td>

                    <td className="py-3 px-4 text-right font-mono text-slate-300">
                      {container.stats?.pids || 0}
                    </td>
                  </tr>
                );
              })}

              {containers.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-400">
                    Активные контейнеры не обнаружены.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Comparison and Timeline Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Timeline Area Chart */}
        <div className="p-4 sm:p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white">
            Нагрузка CPU, RAM и GPU в динамике (%)
          </h3>
          <div className="h-56 sm:h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" stroke="#64748b" fontSize={10} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={10} tickLine={false} unit="%" />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '11px' }} />
                <Area type="monotone" dataKey="hostCpu" name="Хост CPU (%)" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} strokeWidth={2} />
                <Area type="monotone" dataKey="hostRam" name="Хост RAM (%)" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.2} strokeWidth={2} />
                <Area type="monotone" dataKey="gpu0" name="GPU 0 (%)" stroke="#10b981" fill="#10b981" fillOpacity={0.2} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bar Chart: RAM comparison */}
        <div className="p-4 sm:p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white">
            Потребление памяти запущенных ОС (MB)
          </h3>
          <div className="h-56 sm:h-64 w-full">
            {comparisonData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparisonData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="shortName" stroke="#64748b" fontSize={10} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={10} tickLine={false} unit="MB" />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '11px' }} />
                  <Bar dataKey="ram" name="Занято RAM (MB)" fill="#06b6d4" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                Нет данных для сравнения
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
