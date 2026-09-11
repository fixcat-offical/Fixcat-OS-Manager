import React, { useState } from 'react';
import {
  Server,
  Play,
  Square,
  RotateCw,
  Trash2,
  Tv,
  Terminal,
  Search,
  PlusCircle,
  Pause,
  FileCode,
  CheckSquare,
  Square as SquareEmpty,
  RefreshCw,
} from 'lucide-react';
import { ContainerItem } from '../types';
import { getOSIcon } from './icons/OSIcons';
import { ContainerInspectModal } from './ContainerInspectModal';

interface ContainersViewProps {
  containers: ContainerItem[];
  onOpenNoVnc: (container: ContainerItem) => void;
  onOpenLogs: (container: ContainerItem) => void;
  onContainerAction: (id: string, action: string) => void;
  onOpenDeploy: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const ContainersView: React.FC<ContainersViewProps> = ({
  containers,
  onOpenNoVnc,
  onOpenLogs,
  onContainerAction,
  onOpenDeploy,
  onRefresh,
  isRefreshing,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'running' | 'paused' | 'exited'>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [inspectingContainer, setInspectingContainer] = useState<ContainerItem | null>(null);

  // Filtered containers
  const filteredContainers = containers.filter((c) => {
    const matchesSearch =
      (c.Names?.[0] || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.Image || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.osInfo?.displayName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.Id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(c.osInfo?.noVncPort || '').includes(searchTerm);

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'running' && c.State === 'running') ||
      (statusFilter === 'paused' && c.State === 'paused') ||
      (statusFilter === 'exited' && (c.State === 'exited' || c.State === 'dead'));

    return matchesSearch && matchesStatus;
  });

  // Batch toggle
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filteredContainers.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredContainers.map((c) => c.Id));
    }
  };

  const handleBatchAction = async (action: string) => {
    if (selectedIds.length === 0) return;
    try {
      await fetch('/api/containers/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds, action }),
      });
      setSelectedIds([]);
      onRefresh();
    } catch {
      onRefresh();
    }
  };

  const handlePrune = async () => {
    try {
      await fetch('/api/containers/prune', { method: 'POST' });
      onRefresh();
    } catch {
      onRefresh();
    }
  };

  const runningCount = containers.filter((c) => c.State === 'running').length;
  const pausedCount = containers.filter((c) => c.State === 'paused').length;
  const exitedCount = containers.filter((c) => c.State === 'exited' || c.State === 'dead').length;

  return (
    <div className="space-y-5 pb-12">
      {/* Header and Quick Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
            <Server className="w-5 h-5 text-blue-400" />
            <span>Контейнеры операционных систем</span>
          </h2>
          <p className="text-xs text-slate-400">
            Запуск, возобновление, логи, инспекция и удаление
          </p>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={onRefresh}
            title="Обновить список"
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-400' : ''}`} />
          </button>

          <button
            onClick={handlePrune}
            title="Очистить все остановленные контейнеры"
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span className="hidden sm:inline">Очистить неактивные</span>
          </button>

          <button
            onClick={onOpenDeploy}
            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm shadow-blue-600/20 transition-all cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Развернуть ОС</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Поиск по имени, образу, порту noVNC или ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:border-blue-500 focus:outline-none placeholder:text-slate-500"
          />
        </div>

        {/* Status Filter Buttons */}
        <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs overflow-x-auto">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-2.5 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap cursor-pointer ${
              statusFilter === 'all' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Все ({containers.length})
          </button>
          <button
            onClick={() => setStatusFilter('running')}
            className={`px-2.5 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap cursor-pointer ${
              statusFilter === 'running' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Запущены ({runningCount})
          </button>
          <button
            onClick={() => setStatusFilter('paused')}
            className={`px-2.5 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap cursor-pointer ${
              statusFilter === 'paused' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Пауза ({pausedCount})
          </button>
          <button
            onClick={() => setStatusFilter('exited')}
            className={`px-2.5 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap cursor-pointer ${
              statusFilter === 'exited' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Стоп ({exitedCount})
          </button>
        </div>
      </div>

      {/* Batch Actions Toolbar when items selected */}
      {selectedIds.length > 0 && (
        <div className="p-3.5 rounded-xl bg-blue-950/60 border border-blue-800/60 flex flex-wrap items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center space-x-2 text-xs text-blue-200">
            <span className="font-bold">{selectedIds.length}</span> выбрано
          </div>

          <div className="flex items-center space-x-1.5 text-xs flex-wrap">
            <button
              onClick={() => handleBatchAction('pause')}
              className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 font-medium cursor-pointer flex items-center gap-1"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>Пауза</span>
            </button>
            <button
              onClick={() => handleBatchAction('unpause')}
              className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 font-medium cursor-pointer flex items-center gap-1"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Старт</span>
            </button>
            <button
              onClick={() => handleBatchAction('restart')}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-200 font-medium cursor-pointer flex items-center gap-1"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Перезапуск</span>
            </button>
            <button
              onClick={() => handleBatchAction('stop')}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 text-rose-300 font-medium cursor-pointer flex items-center gap-1"
            >
              <Square className="w-3.5 h-3.5" />
              <span>Стоп</span>
            </button>
            <button
              onClick={() => handleBatchAction('remove')}
              className="px-2.5 py-1.5 rounded-lg bg-rose-600 text-white font-semibold cursor-pointer flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Удалить</span>
            </button>
          </div>
        </div>
      )}

      {/* Mobile Card List View for smartphones */}
      <div className="block md:hidden space-y-3">
        {filteredContainers.map((container) => {
          const isSelected = selectedIds.includes(container.Id);
          const isRunning = container.State === 'running';
          const isPaused = container.State === 'paused';
          const ramMb = Math.round((container.stats?.memoryUsage || 0) / (1024 * 1024));
          const cpu = container.stats?.cpuPercent || 0;

          return (
            <div
              key={container.Id}
              className={`p-4 rounded-2xl border bg-slate-900 ${
                isSelected ? 'border-blue-500 bg-blue-950/20' : 'border-slate-800'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center space-x-3 min-w-0">
                  <button
                    onClick={() => handleToggleSelect(container.Id)}
                    className="text-slate-400 hover:text-white shrink-0 cursor-pointer p-1"
                  >
                    {isSelected ? (
                      <CheckSquare className="w-5 h-5 text-blue-500" />
                    ) : (
                      <SquareEmpty className="w-5 h-5" />
                    )}
                  </button>

                  <div className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0">
                    {getOSIcon(container.osInfo?.type || 'linux', 'w-6 h-6')}
                  </div>

                  <div className="min-w-0">
                    <h3 className="font-bold text-white text-xs truncate">
                      {container.osInfo?.displayName || container.Image}
                    </h3>
                    <p className="text-[11px] text-slate-400 font-mono truncate">
                      {container.Names?.[0] || container.Id.slice(0, 10)}
                    </p>
                  </div>
                </div>

                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border shrink-0 ${
                    isRunning
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : isPaused
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {isRunning ? 'Запущен' : isPaused ? 'Пауза' : 'Стоп'}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-400 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                <div>
                  <span>CPU: </span>
                  <span className="font-mono font-bold text-slate-200">{cpu}%</span>
                </div>
                <div>
                  <span>RAM: </span>
                  <span className="font-mono font-bold text-slate-200">{ramMb} MB</span>
                </div>
                {container.osInfo?.noVncPort && (
                  <div className="col-span-2 text-cyan-400 font-mono">
                    noVNC Порт: :{container.osInfo.noVncPort}
                  </div>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between gap-1">
                <div className="flex items-center space-x-1">
                  {isRunning ? (
                    <>
                      <button
                        onClick={() => onContainerAction(container.Id, 'pause')}
                        className="p-2 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20 cursor-pointer"
                      >
                        <Pause className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onContainerAction(container.Id, 'restart')}
                        className="p-2 rounded-lg bg-slate-800 text-slate-300 cursor-pointer"
                      >
                        <RotateCw className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onContainerAction(container.Id, 'stop')}
                        className="p-2 rounded-lg bg-slate-800 text-rose-300 cursor-pointer"
                      >
                        <Square className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => onContainerAction(container.Id, 'start')}
                      className="p-2 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 cursor-pointer"
                    >
                      <Play className="w-4 h-4" />
                    </button>
                  )}

                  <button
                    onClick={() => onOpenLogs(container)}
                    className="p-2 rounded-lg bg-slate-800 text-slate-300 cursor-pointer"
                  >
                    <Terminal className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => setInspectingContainer(container)}
                    className="p-2 rounded-lg bg-slate-800 text-slate-300 cursor-pointer"
                  >
                    <FileCode className="w-4 h-4" />
                  </button>
                </div>

                {container.osInfo?.noVncPort && (
                  <button
                    onClick={() => onOpenNoVnc(container)}
                    className="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-md shadow-blue-600/20"
                  >
                    <Tv className="w-4 h-4" />
                    <span>noVNC</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {filteredContainers.length === 0 && (
          <div className="p-6 text-center text-xs text-slate-400 bg-slate-900 border border-slate-800 rounded-2xl">
            Контейнеры не найдены.
          </div>
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wider text-slate-400 font-semibold border-b border-slate-800 select-none">
              <tr>
                <th className="p-4 w-10 text-center">
                  <button
                    onClick={handleSelectAll}
                    className="text-slate-400 hover:text-white cursor-pointer"
                  >
                    {selectedIds.length > 0 && selectedIds.length === filteredContainers.length ? (
                      <CheckSquare className="w-4 h-4 text-blue-500" />
                    ) : (
                      <SquareEmpty className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="py-4 px-3">Операционная система</th>
                <th className="py-4 px-3">Статус</th>
                <th className="py-4 px-3">Образ и noVNC порт</th>
                <th className="py-4 px-3">CPU</th>
                <th className="py-4 px-3">Память RAM</th>
                <th className="py-4 px-3 text-right">Управление</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800/60">
              {filteredContainers.map((container) => {
                const isSelected = selectedIds.includes(container.Id);
                const isRunning = container.State === 'running';
                const isPaused = container.State === 'paused';
                const ramMb = Math.round((container.stats?.memoryUsage || 0) / (1024 * 1024));
                const cpu = container.stats?.cpuPercent || 0;

                return (
                  <tr
                    key={container.Id}
                    className={`hover:bg-slate-800/40 transition-colors ${
                      isSelected ? 'bg-blue-950/20' : ''
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="p-4 text-center">
                      <button
                        onClick={() => handleToggleSelect(container.Id)}
                        className="text-slate-400 hover:text-white cursor-pointer"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-blue-500" />
                        ) : (
                          <SquareEmpty className="w-4 h-4" />
                        )}
                      </button>
                    </td>

                    {/* OS Icon & Info */}
                    <td className="py-3 px-3">
                      <div className="flex items-center space-x-3">
                        <div className="w-9 h-9 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0">
                          {getOSIcon(container.osInfo?.type || 'linux', 'w-5 h-5')}
                        </div>
                        <div>
                          <div className="font-bold text-white text-xs">
                            {container.osInfo?.displayName || container.Image}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            {container.Names?.[0] || container.Id.slice(0, 10)}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Status pill */}
                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                          isRunning
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : isPaused
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isRunning ? 'bg-emerald-400 animate-pulse' : isPaused ? 'bg-amber-400' : 'bg-slate-500'
                          }`}
                        />
                        <span>{isRunning ? 'Запущен' : isPaused ? 'На паузе' : 'Остановлен'}</span>
                      </span>
                    </td>

                    {/* Image & noVNC Port */}
                    <td className="py-3 px-3">
                      <div className="font-mono text-slate-300 text-[11px] truncate max-w-[180px]">
                        {container.Image}
                      </div>
                      {container.osInfo?.noVncPort ? (
                        <button
                          onClick={() => onOpenNoVnc(container)}
                          className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-mono text-cyan-400 hover:text-cyan-300 cursor-pointer"
                        >
                          <Tv className="w-3 h-3" />
                          <span>:{container.osInfo.noVncPort} (noVNC)</span>
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-500">Порт не привязан</span>
                      )}
                    </td>

                    {/* CPU Usage */}
                    <td className="py-3 px-3">
                      <div className="font-mono font-medium text-slate-200">{cpu}%</div>
                      <div className="w-20 bg-slate-950 rounded-full h-1 mt-1 overflow-hidden">
                        <div
                          className="bg-blue-500 h-1 rounded-full"
                          style={{ width: `${Math.min(100, cpu)}%` }}
                        />
                      </div>
                    </td>

                    {/* RAM Usage */}
                    <td className="py-3 px-3">
                      <div className="font-mono font-medium text-slate-200">{ramMb} MB</div>
                      <div className="w-20 bg-slate-950 rounded-full h-1 mt-1 overflow-hidden">
                        <div
                          className="bg-cyan-500 h-1 rounded-full"
                          style={{ width: `${Math.min(100, container.stats?.memoryPercent || 0)}%` }}
                        />
                      </div>
                    </td>

                    {/* Action Controls */}
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end space-x-1">
                        {isRunning ? (
                          <>
                            <button
                              onClick={() => onContainerAction(container.Id, 'pause')}
                              title="Поставить на паузу"
                              className="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 transition-colors cursor-pointer"
                            >
                              <Pause className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => onContainerAction(container.Id, 'restart')}
                              title="Перезапустить"
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                            >
                              <RotateCw className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => onContainerAction(container.Id, 'stop')}
                              title="Остановить"
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/60 text-slate-300 hover:text-rose-200 transition-colors cursor-pointer"
                            >
                              <Square className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : isPaused ? (
                          <>
                            <button
                              onClick={() => onContainerAction(container.Id, 'unpause')}
                              title="Возобновить"
                              className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 transition-colors cursor-pointer"
                            >
                              <Play className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => onContainerAction(container.Id, 'stop')}
                              title="Остановить"
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/60 text-slate-300 hover:text-rose-200 transition-colors cursor-pointer"
                            >
                              <Square className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => onContainerAction(container.Id, 'start')}
                            title="Запустить"
                            className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 transition-colors cursor-pointer"
                          >
                            <Play className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <button
                          onClick={() => setInspectingContainer(container)}
                          title="Инспекция конфигурации"
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                        >
                          <FileCode className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => onOpenLogs(container)}
                          title="Логи терминала"
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                        >
                          <Terminal className="w-3.5 h-3.5" />
                        </button>

                        {container.osInfo?.noVncPort && (
                          <button
                            onClick={() => onOpenNoVnc(container)}
                            title="Открыть noVNC"
                            className="p-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white shadow-sm shadow-blue-600/20 transition-colors cursor-pointer"
                          >
                            <Tv className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <button
                          onClick={() => onContainerAction(container.Id, 'remove')}
                          title="Удалить контейнер"
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredContainers.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    Контейнеры не найдены по заданным критериям фильтрации.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inspect Modal Drawer */}
      {inspectingContainer && (
        <ContainerInspectModal
          container={inspectingContainer}
          onClose={() => setInspectingContainer(null)}
        />
      )}
    </div>
  );
};
