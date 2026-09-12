import React, { useState, useEffect } from 'react';
import {
  X,
  FileCode,
  Copy,
  Check,
  RotateCw,
  Layers,
  Server,
  Network,
  HardDrive,
} from 'lucide-react';
import { ContainerItem } from '../types';
import { getOSIcon } from './icons/OSIcons';

interface ContainerInspectModalProps {
  container: ContainerItem | null;
  onClose: () => void;
  api?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

export const ContainerInspectModal: React.FC<ContainerInspectModalProps> = ({
  container,
  onClose,
  api,
}) => {
  if (!container) return null;

  const [inspectData, setInspectData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'json' | 'env' | 'mounts'>('overview');

  const fetchInspect = async () => {
    setLoading(true);
    try {
      const res = await (api || fetch)(`/api/containers/${container.Id}/inspect`);
      const data = await res.json();
      setInspectData(data.inspect || data);
    } catch {
      setInspectData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInspect();
  }, [container.Id]);

  const jsonString = inspectData ? JSON.stringify(inspectData, null, 2) : '';

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl h-[82vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-slate-950 px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center">
              {getOSIcon(container.osInfo.type, 'w-5 h-5')}
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">Инспекция контейнера: {container.Names[0]}</h3>
              <p className="text-xs text-slate-400 font-mono text-[11px]">{container.Id}</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer text-xs flex items-center gap-1 px-2.5"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Скопировано' : 'Копировать JSON'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/60 text-slate-300 hover:text-rose-200 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="bg-slate-950/80 px-5 py-2 border-b border-slate-800 flex items-center space-x-2 text-xs">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              activeTab === 'overview' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Сводка конфигурации
          </button>
          <button
            onClick={() => setActiveTab('env')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              activeTab === 'env' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Переменные среды (ENV)
          </button>
          <button
            onClick={() => setActiveTab('mounts')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              activeTab === 'mounts' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Тома и монтирования
          </button>
          <button
            onClick={() => setActiveTab('json')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              activeTab === 'json' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Сырой JSON (Docker API)
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-5 overflow-y-auto font-mono text-xs">
          {loading ? (
            <div className="h-full flex items-center justify-center text-slate-400">
              <RotateCw className="w-5 h-5 animate-spin text-blue-400 mr-2" /> Загрузка данных инспекции...
            </div>
          ) : activeTab === 'json' ? (
            <pre className="p-4 bg-slate-950 rounded-xl text-slate-300 text-[11px] overflow-x-auto whitespace-pre-wrap">
              {jsonString}
            </pre>
          ) : activeTab === 'env' ? (
            <div className="space-y-2 font-sans">
              <div className="text-xs text-slate-400 mb-2">Переменные окружения контейнера:</div>
              <div className="bg-slate-950 rounded-xl p-3 border border-slate-800 space-y-1.5 font-mono text-xs">
                {(inspectData?.Config?.Env || ['RESOLUTION=1920x1080', 'VNC_PORT=' + container.osInfo.noVncPort]).map((e: string, i: number) => (
                  <div key={i} className="py-1 px-2 rounded bg-slate-900/60 border border-slate-800/80 text-cyan-300">
                    {e}
                  </div>
                ))}
              </div>
            </div>
          ) : activeTab === 'mounts' ? (
            <div className="space-y-2 font-sans">
              <div className="text-xs text-slate-400 mb-2">Примонтированные каталоги хоста (Volume Mounts):</div>
              <div className="bg-slate-950 rounded-xl p-3 border border-slate-800 space-y-2">
                {inspectData?.Mounts && inspectData.Mounts.length > 0 ? (
                  inspectData.Mounts.map((m: any, i: number) => (
                    <div key={i} className="p-2.5 bg-slate-900 rounded-lg border border-slate-800 text-xs flex items-center justify-between">
                      <span className="text-slate-300 font-mono">{m.Source || m.Name}</span>
                      <span className="text-slate-500">→</span>
                      <span className="text-cyan-400 font-mono">{m.Destination}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400">{m.Mode || 'rw'}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-slate-500 text-xs p-2">Нет примонтированных внешних томов.</div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4 font-sans text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="text-slate-400 font-semibold uppercase text-[10px]">Параметры запуска</div>
                  <div className="flex justify-between py-1 border-b border-slate-900">
                    <span className="text-slate-400">Образ:</span>
                    <span className="text-slate-200 font-mono">{container.Image}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-900">
                    <span className="text-slate-400">Команда:</span>
                    <span className="text-slate-200 font-mono">{container.Command}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Создан:</span>
                    <span className="text-slate-200">{new Date(container.Created * 1000).toLocaleString('ru-RU')}</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="text-slate-400 font-semibold uppercase text-[10px]">Сеть и noVNC порты</div>
                  <div className="flex justify-between py-1 border-b border-slate-900">
                    <span className="text-slate-400">IP контейнера:</span>
                    <span className="text-slate-200 font-mono">{inspectData?.NetworkSettings?.IPAddress || '172.17.0.2'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-900">
                    <span className="text-slate-400">noVNC порт:</span>
                    <span className="text-cyan-400 font-mono">:{container.osInfo.noVncPort}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">noVNC URL:</span>
                    <span className="text-blue-400 font-mono truncate max-w-[200px]">{container.osInfo.vncUrl}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
