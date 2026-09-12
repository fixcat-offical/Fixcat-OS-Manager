import React, { useState, useEffect, useCallback } from 'react';
import {
  Network,
  Plus,
  Trash2,
  RefreshCw,
  Check,
  X,
  Server,
  Wifi,
  WifiOff,
  Cpu,
  MemoryStick,
  HardDrive,
  Clock,
  Boxes,
  Zap,
  Copy,
  MonitorSmartphone,
  Globe,
  Loader2,
  Activity,
} from 'lucide-react';
import { NodeItem } from '../types';
import { copyText } from '../lib/clipboard';

interface NodesViewProps {
  authToken: string | null;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const NodesView: React.FC<NodesViewProps> = ({ authToken, showToast }) => {
  const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [ip, setIp] = useState('');
  const [port, setPort] = useState('3000');
  const [apiKey, setApiKey] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [testingId, setTestingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const headers = authToken ? { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };

  const fetchNodes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/nodes', { headers });
      if (res.ok) {
        const data = await res.json();
        setNodes(data.nodes || []);
      }
    } catch {
      // ignore
    }
    setLoading(false);
  }, [authToken]);

  useEffect(() => {
    fetchNodes();
    const timer = setInterval(fetchNodes, 8000);
    return () => clearInterval(timer);
  }, [fetchNodes]);

  const handleAdd = async () => {
    if (!ip.trim() || !apiKey.trim()) {
      setAddError('Укажите IP адрес и API ключ второго ПК.');
      return;
    }
    setAdding(true);
    setAddError('');
    try {
      const res = await fetch('/api/nodes', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: name.trim() || undefined, ip: ip.trim(), port: Number(port) || 3000, apiKey: apiKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error || 'Ошибка добавления узла.');
      } else {
        setShowAdd(false);
        setName('');
        setIp('');
        setPort('3000');
        setApiKey('');
        showToast?.(`Узел «${data.node?.name}» добавлен.`, 'success');
        fetchNodes();
      }
    } catch (err: any) {
      setAddError(err?.message || 'Ошибка сети.');
    }
    setAdding(false);
  };

  const handleRemove = async (node: NodeItem) => {
    if (!window.confirm(`Удалить узел «${node.name}» (${node.ip}:${node.port})?`)) return;
    try {
      const res = await fetch(`/api/nodes/${node.id}`, { method: 'DELETE', headers });
      const data = await res.json();
      if (res.ok) {
        showToast?.(data.message || 'Узел удалён.', 'success');
        fetchNodes();
      } else {
        showToast?.(data.error || 'Ошибка удаления.', 'error');
      }
    } catch (err: any) {
      showToast?.(err?.message || 'Ошибка сети.', 'error');
    }
  };

  const handleTest = async (node: NodeItem) => {
    setTestingId(node.id);
    try {
      const res = await fetch(`/api/nodes/${node.id}/test`, { method: 'POST', headers });
      const data = await res.json();
      if (res.ok) {
        showToast?.(`Узел «${node.name}» доступен (${data.system?.hostname || 'OK'}).`, 'success');
      } else {
        showToast?.(data.error || 'Узел недоступен.', 'error');
      }
    } catch (err: any) {
      showToast?.(err?.message || 'Ошибка сети.', 'error');
    }
    setTestingId(null);
  };

  const handleCopyApi = (node: NodeItem) => {
    // Real key is never sent to the UI; construct add-string from public fields.
    copyText(`${node.name} | ${node.ip}:${node.port}`);
    setCopiedId(node.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatUptime = (s: number) => {
    if (!s) return '—';
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    return d > 0 ? `${d}д ${h}ч` : `${h}ч ${m}м`;
  };

  return (
    <div className="space-y-6 max-w-5xl pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-11 h-11 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
            <Network className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-white text-lg">Связанные ПК (узлы)</h2>
            <p className="text-xs text-slate-400">Подключите второе/третье устройство к панели по IP и API ключу</p>
          </div>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-md shadow-indigo-600/20 transition-colors"
        >
          <Plus className="w-4 h-4" /> Создать узел
        </button>
      </div>

      {/* How it works hint */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-400 leading-relaxed">
        <p className="text-slate-300 font-semibold mb-1 flex items-center gap-2"><MonitorSmartphone className="w-3.5 h-3.5 text-indigo-400" /> Как это работает</p>
        На 1-м ПК откройте <b className="text-slate-200">Настройки → API</b> и скопируйте API ключ. Затем на 2-м ПК создайте узел, указав IP/порт 1-го ПК и его API ключ. После этого на 2-м ПК можно выбирать «1-й ПК» при развёртывании контейнеров, видеть его показатели на главной странице и управлять его железом в разделе <b className="text-slate-200">Системное оборудование</b>.
      </div>

      {/* Nodes list */}
      {loading && nodes.length === 0 ? (
        <div className="p-8 text-center text-xs text-slate-400 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Загрузка узлов...
        </div>
      ) : nodes.length === 0 ? (
        <div className="p-10 text-center bg-slate-900 border border-slate-800 rounded-2xl">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-800/60 flex items-center justify-center mb-3">
            <Network className="w-7 h-7 text-slate-500" />
          </div>
          <p className="text-sm font-semibold text-slate-300">Узлы ещё не добавлены</p>
          <p className="text-xs text-slate-500 mt-1">Добавьте второй ПК с установленной панелью, чтобы управлять им отсюда.</p>
          <button onClick={() => setShowAdd(true)} className="mt-4 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer">
            <Plus className="w-3.5 h-3.5 inline mr-1" /> Добавить узел
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {nodes.map((node) => {
            const st = node.status;
            const sys = st?.system;
            const online = !!st?.online;
            return (
              <div key={node.id} className={`p-5 rounded-2xl border transition-colors ${online ? 'bg-slate-900 border-slate-800' : 'bg-slate-900/60 border-slate-800/70 opacity-90'}`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${online ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'}`}>
                      {online ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-white">{node.name}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${online ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'}`}>
                          {online ? 'Онлайн' : 'Недоступен'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 font-mono">{node.ip}:{node.port}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <button onClick={() => handleTest(node)} disabled={testingId === node.id}
                      className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer disabled:opacity-50" title="Проверить соединение">
                      {testingId === node.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => handleCopyApi(node)} className={`p-2 rounded-lg cursor-pointer transition-colors ${copiedId === node.id ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'}`} title="Скопировать адрес">
                      {copiedId === node.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => handleRemove(node)} className="p-2 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 cursor-pointer" title="Удалить узел">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {online && sys ? (
                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
                    <div className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800">
                      <p className="text-[10px] text-slate-500 uppercase flex items-center gap-1"><Server className="w-3 h-3" /> Хост</p>
                      <p className="font-semibold text-slate-200 truncate" title={sys.hostname}>{sys.hostname}</p>
                    </div>
                    <div className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800">
                      <p className="text-[10px] text-slate-500 uppercase flex items-center gap-1"><Cpu className="w-3 h-3" /> CPU</p>
                      <p className="font-semibold text-slate-200">{sys.cpus?.count} ядер/speed</p>
                    </div>
                    <div className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800">
                      <p className="text-[10px] text-slate-500 uppercase flex items-center gap-1"><MemoryStick className="w-3 h-3" /> RAM</p>
                      <p className="font-semibold text-slate-200">{sys.memory ? ((sys.memory.used / 1048576).toFixed(0)) : '—'} / {sys.memory ? ((sys.memory.total / 1048576).toFixed(0)) : '—'} MB</p>
                    </div>
                    <div className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800">
                      <p className="text-[10px] text-slate-500 uppercase flex items-center gap-1"><Boxes className="w-3 h-3" /> Контейнеры</p>
                      <p className="font-semibold text-slate-200">{st?.runningCount ?? 0}/{st?.containerCount ?? 0} запущено</p>
                    </div>
                    <div className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800">
                      <p className="text-[10px] text-slate-500 uppercase flex items-center gap-1"><Clock className="w-3 h-3" /> Аптайм</p>
                      <p className="font-semibold text-slate-200">{formatUptime(sys.uptime)}</p>
                    </div>
                    <div className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800">
                      <p className="text-[10px] text-slate-500 uppercase flex items-center gap-1"><Zap className="w-3 h-3" /> Версия</p>
                      <p className="font-semibold text-slate-200">{st?.version || sys.app?.version || '—'}</p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-[11px] text-slate-500 flex items-center gap-1.5">
                    <Activity className="w-3 h-3" /> Статус: {st?.checkedAt ? `нет ответа (последняя проверка ${new Date(st.checkedAt).toLocaleTimeString()})` : 'проверка...'}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setShowAdd(false)}>
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Plus className="w-4 h-4 text-indigo-400" /> Создать узел
              </h3>
              <button onClick={() => setShowAdd(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 font-medium block mb-1.5 flex items-center gap-1.5"><Globe className="w-3.5 h-3.5 text-slate-400" /> IP адрес устройства</label>
                <input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="192.168.1.50"
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:border-indigo-500 focus:outline-none font-mono" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium block mb-1.5">Порт</label>
                  <input value={port} onChange={(e) => setPort(e.target.value)} placeholder="3000"
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:border-indigo-500 focus:outline-none font-mono" />
                </div>
                <div>
                  <label className="text-slate-300 font-medium block mb-1.5">Название (опц.)</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ноутбук 2"
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:border-indigo-500 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="text-slate-300 font-medium block mb-1.5 flex items-center gap-1.5"><KeySyncIcon /> API ключ панели 2-го ПК</label>
                <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="вставьте из Настройки → API"
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:border-indigo-500 focus:outline-none font-mono" />
                <p className="text-[10px] text-slate-500 mt-1">Найдите ключ в панели этого устройства: Настройки → API (раздел «Интеграция»).</p>
              </div>
            </div>

            {addError && (
              <p className="mt-3 text-xs text-rose-400 font-medium bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">{addError}</p>
            )}

            <div className="mt-5 flex gap-2">
              <button onClick={() => setShowAdd(false)} className="flex-1 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer">
                Отмена
              </button>
              <button onClick={handleAdd} disabled={adding}
                className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60">
                {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                {adding ? 'Проверка...' : 'Добавить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function KeySyncIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  );
}