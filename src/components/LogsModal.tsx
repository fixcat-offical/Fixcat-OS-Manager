import React, { useState, useEffect } from 'react';
import {
  X,
  Terminal,
  RotateCw,
  Copy,
  Check,
  Download,
} from 'lucide-react';
import { ContainerItem } from '../types';

interface LogsModalProps {
  container: ContainerItem | null;
  onClose: () => void;
  api?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

export const LogsModal: React.FC<LogsModalProps> = ({ container, onClose, api }) => {
  if (!container) return null;

  const [logs, setLogs] = useState<string>('Загрузка логов контейнера...');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await (api || fetch)(`/api/containers/${container.Id}/logs`);
      const data = await res.json();
      setLogs(data.logs || 'Логи отсутствуют.');
    } catch {
      setLogs('Ошибка получения логов контейнера.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [container.Id]);

  const handleCopy = () => {
    navigator.clipboard.writeText(logs);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([logs], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${container.Names[0].replace('/', '')}-logs.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl h-[80vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-slate-950 px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">Логи контейнера: {container.Names[0]}</h3>
              <p className="text-xs text-slate-400">{container.osInfo.displayName} • {container.Image}</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={fetchLogs}
              title="Обновить логи"
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            </button>
            <button
              onClick={handleCopy}
              title="Копировать"
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
            <button
              onClick={handleDownload}
              title="Скачать файл логов"
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              title="Закрыть"
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/60 text-slate-300 hover:text-rose-200 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Terminal view */}
        <div className="flex-1 p-4 bg-slate-950 font-mono text-xs text-slate-200 overflow-y-auto whitespace-pre-wrap select-text leading-relaxed">
          {logs}
        </div>
      </div>
    </div>
  );
};
