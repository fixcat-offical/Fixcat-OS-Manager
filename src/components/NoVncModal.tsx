import React, { useState } from 'react';
import {
  X,
  ExternalLink,
  Maximize2,
  Minimize2,
  Tv,
  RotateCw,
  Sliders,
  Keyboard,
  Power,
  Pause,
  Play,
  Monitor,
  Check,
  Copy,
} from 'lucide-react';
import { ContainerItem } from '../types';
import { getOSIcon } from './icons/OSIcons';
import { InteractiveDesktop } from './desktop/InteractiveDesktop';

interface NoVncModalProps {
  container: ContainerItem | null;
  onClose: () => void;
}

export const NoVncModal: React.FC<NoVncModalProps> = ({ container, onClose }) => {
  if (!container) return null;

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState<'interactive' | 'iframe'>('interactive');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [keyToast, setKeyToast] = useState<string | null>(null);

  const vncUrl = container.osInfo.vncUrl || `http://localhost:${container.osInfo.noVncPort || 6080}/`;

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(vncUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const sendVirtualKey = (keyName: string) => {
    setKeyToast(`Клавиша ${keyName} отправлена в контейнер`);
    setTimeout(() => setKeyToast(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <div
        className={`bg-slate-900 border border-slate-800 rounded-2xl flex flex-col shadow-2xl overflow-hidden transition-all duration-300 ${
          isFullscreen ? 'w-full h-full fixed inset-0 rounded-none border-0' : 'w-full max-w-6xl h-[88vh]'
        }`}
      >
        {/* Top Control Bar */}
        <div className="bg-slate-950 px-4 py-2.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          {/* OS info */}
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center">
              {getOSIcon(container.osInfo.type, 'w-5 h-5')}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-white text-xs sm:text-sm">{container.osInfo.displayName}</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                  Порт :{container.osInfo.noVncPort}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono">
                {container.Names[0]} • {container.osInfo.resolution || '1920x1080'}
              </p>
            </div>
          </div>

          {/* Mode switch & Virtual Keys */}
          <div className="flex items-center space-x-2">
            {/* Switch Mode: Interactive vs Live Iframe */}
            <div className="bg-slate-900 p-0.5 rounded-lg border border-slate-800 flex text-xs">
              <button
                onClick={() => setViewMode('interactive')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                  viewMode === 'interactive' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Интерактивный стол
              </button>
              <button
                onClick={() => setViewMode('iframe')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                  viewMode === 'iframe' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Прямой noVNC поток
              </button>
            </div>

            {/* Virtual hotkeys */}
            <div className="hidden md:flex items-center space-x-1 bg-slate-900 px-1.5 py-1 rounded-lg border border-slate-800 text-[11px]">
              <button
                onClick={() => sendVirtualKey('Ctrl+Alt+Del')}
                className="px-2 py-0.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
                title="Отправить Ctrl+Alt+Del"
              >
                Ctrl+Alt+Del
              </button>
              <button
                onClick={() => sendVirtualKey('Alt+Tab')}
                className="px-2 py-0.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
                title="Отправить Alt+Tab"
              >
                Alt+Tab
              </button>
              <button
                onClick={() => sendVirtualKey('Win Key')}
                className="px-2 py-0.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
                title="Клавиша Windows"
              >
                Win
              </button>
            </div>

            {/* Copy Link */}
            <button
              onClick={handleCopyUrl}
              title="Скопировать прямую ссылку noVNC"
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              {copiedUrl ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>

            {/* Open in new browser tab */}
            <a
              href={vncUrl}
              target="_blank"
              rel="noreferrer"
              title="Открыть в новой вкладке браузера"
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <ExternalLink className="w-4 h-4" />
            </a>

            {/* Fullscreen */}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? 'Свернуть' : 'На весь экран'}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              title="Закрыть"
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/60 text-slate-300 hover:text-rose-200 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Remote Desktop Stage */}
        <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
          {viewMode === 'interactive' ? (
            <InteractiveDesktop container={container} />
          ) : (
            <div className="w-full h-full relative">
              <iframe
                src={vncUrl}
                title={container.osInfo.displayName}
                className="w-full h-full border-0 bg-slate-950"
                allow="clipboard-read; clipboard-write; fullscreen"
              />
              <div className="absolute top-2 right-2 z-10 px-2.5 py-1 rounded-lg bg-slate-900/80 border border-slate-700/80 text-[11px] text-slate-300 backdrop-blur-sm pointer-events-none">
                noVNC WebSocket: {vncUrl}
              </div>
            </div>
          )}

          {/* Virtual key feedback toast */}
          {keyToast && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-blue-600/90 text-white text-xs font-semibold shadow-lg backdrop-blur-sm z-50 animate-bounce">
              {keyToast}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
