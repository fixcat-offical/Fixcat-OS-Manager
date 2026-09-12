import React, { useState, useEffect } from 'react';
import {
  Tv,
  ExternalLink,
  RotateCw,
  Play,
  Pause,
  Square,
  Maximize2,
  Columns,
  Monitor,
  Check,
  Copy,
  Sliders,
} from 'lucide-react';
import { ContainerItem } from '../types';
import { copyText } from '../lib/clipboard';
import { getOSIcon } from './icons/OSIcons';
import { InteractiveDesktop } from './desktop/InteractiveDesktop';

interface NoVncFullViewProps {
  containers: ContainerItem[];
  onContainerAction: (id: string, action: string) => void;
}

export const NoVncFullView: React.FC<NoVncFullViewProps> = ({
  containers,
  onContainerAction,
}) => {
  const osContainers = containers.filter((c) => c.osInfo.noVncPort);
  const [activeId, setActiveId] = useState<string>(osContainers[0]?.Id || '');
  const [isSplitMode, setIsSplitMode] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'interactive' | 'iframe'>('interactive');
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Keep selection in sync when the container list changes (new container appears / old one is removed)
  useEffect(() => {
    setActiveId((prev) => {
      if (prev && osContainers.some((c) => c.Id === prev)) return prev;
      return osContainers[0]?.Id || '';
    });
  }, [containers, osContainers]);

  const selectedContainer = osContainers.find((c) => c.Id === activeId) || osContainers[0];

  const handleCopyUrl = async (url: string) => {
    await copyText(url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  if (osContainers.length === 0) {
    return (
      <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
        <Tv className="w-12 h-12 text-slate-500 mx-auto" />
        <h3 className="text-base font-bold text-white">noVNC Контейнеры не найдены</h3>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          Убедитесь, что контейнеры запущены и открыты порты веб-десктопа (6080 для Ubuntu или 8006 для Windows XP).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-12">
      {/* OS Switcher and Controls Top Bar */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
        {/* OS Tabs */}
        <div className="flex items-center space-x-2 overflow-x-auto">
          {osContainers.map((container) => {
            const isSelected = container.Id === selectedContainer?.Id;
            const isRunning = container.State === 'running';
            const isPaused = container.State === 'paused';

            return (
              <button
                key={container.Id}
                onClick={() => {
                  setActiveId(container.Id);
                  setIsSplitMode(false);
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2.5 transition-all cursor-pointer ${
                  isSelected && !isSplitMode
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25 border border-blue-500/40'
                    : 'bg-slate-950 text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800'
                }`}
              >
                <div className="w-5 h-5 rounded-md bg-slate-900 flex items-center justify-center">
                  {getOSIcon(container.osInfo.type, 'w-4 h-4')}
                </div>
                <span>{container.osInfo.displayName}</span>
                <span
                  className={`w-2 h-2 rounded-full ${
                    isRunning ? 'bg-emerald-400' : isPaused ? 'bg-amber-400' : 'bg-slate-500'
                  }`}
                />
              </button>
            );
          })}

          {/* Split Mode Button (2 OSes side by side) */}
          {osContainers.length >= 2 && (
            <button
              onClick={() => setIsSplitMode(!isSplitMode)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2 transition-all cursor-pointer ${
                isSplitMode
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25 border border-indigo-500/40'
                  : 'bg-slate-950 text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800'
              }`}
            >
              <Columns className="w-4 h-4 text-cyan-400" />
              <span>Split-View (2 ОС рядом)</span>
            </button>
          )}
        </div>

        {/* View Mode & Actions */}
        <div className="flex items-center space-x-2">
          {/* Switch Mode: Interactive vs Live Iframe */}
          <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 flex text-xs">
            <button
              onClick={() => setViewMode('interactive')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                viewMode === 'interactive' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Интерактивный стол
            </button>
            <button
              onClick={() => setViewMode('iframe')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                viewMode === 'iframe' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Прямой noVNC поток
            </button>
          </div>

          {selectedContainer && (
            <a
              href={selectedContainer.osInfo.vncUrl || `http://localhost:${selectedContainer.osInfo.noVncPort}/`}
              target="_blank"
              rel="noreferrer"
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer text-xs flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">В новой вкладке</span>
            </a>
          )}
        </div>
      </div>

      {/* Main Desktop Screen(s) */}
      {!isSplitMode ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl h-[74vh] flex flex-col">
          {/* Screen Top Header */}
          <div className="bg-slate-950 px-4 py-2 border-b border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              <span className="font-bold text-white">{selectedContainer?.osInfo.displayName}</span>
              <span className="text-slate-400 font-mono">({selectedContainer?.Names[0]})</span>
            </div>

            <div className="flex items-center space-x-2">
              {selectedContainer?.State === 'running' ? (
                <button
                  onClick={() => onContainerAction(selectedContainer.Id, 'pause')}
                  className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 text-[11px] font-medium flex items-center gap-1 cursor-pointer"
                >
                  <Pause className="w-3 h-3" />
                  <span>Пауза</span>
                </button>
              ) : selectedContainer?.State === 'paused' ? (
                <button
                  onClick={() => onContainerAction(selectedContainer.Id, 'unpause')}
                  className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 text-[11px] font-medium flex items-center gap-1 cursor-pointer"
                >
                  <Play className="w-3 h-3" />
                  <span>Снять с паузы</span>
                </button>
              ) : null}

              <button
                onClick={() => onContainerAction(selectedContainer.Id, 'restart')}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer"
                title="Перезапустить"
              >
                <RotateCw className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Canvas or Iframe */}
          <div className="flex-1 bg-black overflow-hidden relative">
            {viewMode === 'interactive' ? (
              <InteractiveDesktop container={selectedContainer} />
            ) : (
              <iframe
                src={selectedContainer.osInfo.vncUrl || `http://localhost:${selectedContainer.osInfo.noVncPort}/`}
                title={selectedContainer.osInfo.displayName}
                className="w-full h-full border-0 bg-slate-950"
                allow="clipboard-read; clipboard-write; fullscreen"
              />
            )}
          </div>
        </div>
      ) : (
        /* Split-Screen 2 OS View */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-[74vh]">
          {osContainers.slice(0, 2).map((container) => (
            <div
              key={container.Id}
              className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col h-full"
            >
              <div className="bg-slate-950 px-3.5 py-2 border-b border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4">{getOSIcon(container.osInfo.type, 'w-4 h-4')}</div>
                  <span className="font-bold text-white text-xs">{container.osInfo.displayName}</span>
                </div>
                <span className="text-[11px] font-mono text-cyan-400">:{container.osInfo.noVncPort}</span>
              </div>
              <div className="flex-1 bg-black overflow-hidden relative">
                {viewMode === 'interactive' ? (
                  <InteractiveDesktop container={container} />
                ) : (
                  <iframe
                    src={container.osInfo.vncUrl || `http://localhost:${container.osInfo.noVncPort}/`}
                    title={container.osInfo.displayName}
                    className="w-full h-full border-0 bg-slate-950"
                    allow="clipboard-read; clipboard-write; fullscreen"
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
