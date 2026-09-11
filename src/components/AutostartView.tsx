import React, { useState, useEffect, useCallback } from 'react';
import {
  Rocket,
  RefreshCw,
  Trash2,
  Power,
  Pause,
  Play,
  Search,
  ShieldCheck,
  ShieldOff,
  Clock,
  Loader2,
} from 'lucide-react';
import { getOSIcon } from './icons/OSIcons';

interface AutostartEntry {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  policy: string;
  retries: number;
}

const POLICY_LABELS: Record<string, string> = {
  no: 'Нет',
  always: 'always',
  'unless-stopped': 'unless-stopped',
  'on-failure': 'on-failure',
};

const POLICY_COLORS: Record<string, string> = {
  no: 'bg-slate-800 text-slate-400 border-slate-700',
  always: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  'unless-stopped': 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
  'on-failure': 'bg-amber-500/10 text-amber-400 border-amber-500/30',
};

interface AutostartViewProps {
  api?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

export const AutostartView: React.FC<AutostartViewProps> = ({ api }) => {
  const [entries, setEntries] = useState<AutostartEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingPolicy, setEditingPolicy] = useState('no');
  const [notice, setNotice] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await (api || fetch)('/api/autostarts');
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Не удалось загрузить список автозагрузок');
        setEntries([]);
      }
    } catch {
      setError('Docker сокет недоступен');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const showNotice = (message: string, type: 'success' | 'error' = 'success') => {
    setNotice({ message, type });
    setTimeout(() => setNotice(null), 3500);
  };

  const handleSetPolicy = async (id: string, policy: string) => {
    try {
      const res = await (api || fetch)(`/api/autostarts/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ policy }),
      });
      const data = await res.json();
      if (res.ok) {
        showNotice(data.message || 'Политика обновлена');
        setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, policy } : e)));
      } else {
        showNotice(data.error || 'Ошибка обновления', 'error');
      }
    } catch {
      showNotice('Ошибка подключения к Docker', 'error');
    }
    setEditingId(null);
  };

  const handleRemove = async (id: string) => {
    try {
      const res = await (api || fetch)(`/api/autostarts/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        showNotice(data.message || 'Автозапуск удалён');
        setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, policy: 'no' } : e)));
      } else {
        showNotice(data.error || 'Ошибка удаления', 'error');
      }
    } catch {
      showNotice('Ошибка подключения к Docker', 'error');
    }
  };

  const handleToggle = async (entry: AutostartEntry) => {
    if (entry.policy === 'no') {
      await handleSetPolicy(entry.id, 'unless-stopped');
    } else {
      await handleSetPolicy(entry.id, 'no');
    }
  };

  const handleBulk = async (policy: string) => {
    setBulkBusy(true);
    try {
      const res = await (api || fetch)('/api/autostarts/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ policy }),
      });
      const data = await res.json();
      if (res.ok) {
        showNotice(data.message || `Политика "${policy}" применена`);
        await fetchEntries();
      } else {
        showNotice(data.error || 'Ошибка применения политики', 'error');
      }
    } catch {
      showNotice('Ошибка подключения к Docker', 'error');
    } finally {
      setBulkBusy(false);
    }
  };

  const enabledCount = entries.filter((e) => e.policy !== 'no').length;
  const runningCount = entries.filter((e) => e.state === 'running').length;

  const filtered = entries.filter((e) => {
    const q = searchTerm.toLowerCase();
    return (
      e.name.toLowerCase().includes(q) ||
      e.image.toLowerCase().includes(q) ||
      e.policy.toLowerCase().includes(q)
    );
  });

  const isRecognizedImage = (image: string) => {
    const i = image.toLowerCase();
    if (i.includes('ubuntu')) return 'ubuntu';
    if (i.includes('windows')) return 'windows-xp';
    if (i.includes('debian')) return 'debian';
    if (i.includes('kali')) return 'kali';
    if (i.includes('alpine')) return 'alpine';
    return 'linux';
  };

  return (
    <div className="space-y-5 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
            <Rocket className="w-5 h-5 text-cyan-400" />
            <span>Автозагрузки контейнеров</span>
          </h2>
          <p className="text-xs text-slate-400">
            Политика перезапуска Docker: контейнеры с «always» / «unless-stopped» стартуют автоматически при загрузке хоста
          </p>
        </div>

        <button
          onClick={fetchEntries}
          title="Обновить список"
          className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
        </button>
      </div>

      {/* Notice / Error Banner */}
      {notice && (
        <div
          className={`p-3.5 rounded-xl border animate-fade-in text-xs font-medium ${
            notice.type === 'error'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
          }`}
        >
          {notice.message}
        </div>
      )}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300 flex items-start space-x-2.5">
          <ShieldOff className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">{error}</span>
            <p className="text-rose-300/80 mt-1">
              Подключите /var/run/docker.sock или TCP Host в разделе «Настройки Docker», чтобы управлять автозапуском контейнеров.
            </p>
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Контейнеров</span>
            <Search className="w-3.5 h-3.5" />
          </div>
          <div className="text-xl font-bold font-mono text-white">{entries.length}</div>
        </div>
        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Автозапуск</span>
            <Rocket className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl font-bold font-mono text-emerald-400">{enabledCount}</div>
        </div>
        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Запущено сейчас</span>
            <Play className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="text-xl font-bold font-mono text-blue-400">{runningCount}</div>
        </div>
      </div>

      {/* Search + bulk actions */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Поиск по имени, образу или политике..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 focus:border-cyan-500 focus:outline-none placeholder:text-slate-500"
          />
        </div>
        {entries.length > 0 && (
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 p-1 rounded-xl text-xs overflow-x-auto">
            <button
              onClick={() => handleBulk('always')}
              className="px-2.5 py-1.5 rounded-lg font-medium bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 transition whitespace-nowrap cursor-pointer"
              title="Включить автозапуск для всех контейнеров"
            >
              Вкл. все
            </button>
            <button
              onClick={() => handleBulk('unless-stopped')}
              className="px-2.5 py-1.5 rounded-lg font-medium bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 transition whitespace-nowrap cursor-pointer"
              title="unless-stopped для всех"
            >
              unless-stopped
            </button>
            <button
              onClick={() => handleBulk('no')}
              className="px-2.5 py-1.5 rounded-lg font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition whitespace-nowrap cursor-pointer"
              title="Отключить автозапуск для всех"
            >
              Выкл. все
            </button>
            {bulkBusy && (
              <span className="flex items-center gap-1 pl-1 text-slate-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                применяю...
              </span>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Политики перезапуска ({filtered.length})</span>
          </h3>
          <span className="text-[11px] text-slate-400 font-mono">docker update --restart=…</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wider text-slate-400 font-semibold border-b border-slate-800 select-none">
              <tr>
                <th className="py-4 px-4">Контейнер</th>
                <th className="py-4 px-3">Статус</th>
                <th className="py-4 px-3">Автозапуск (политика)</th>
                <th className="py-4 px-3 text-right">Управление</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.map((entry) => {
                const enabled = entry.policy !== 'no';
                const running = entry.state === 'running';
                const isEditing = editingId === entry.id;

                return (
                  <tr key={entry.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-9 h-9 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0">
                          {getOSIcon(isRecognizedImage(entry.image), 'w-5 h-5')}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-white text-xs truncate">{entry.name}</div>
                          <div className="text-[11px] text-slate-400 font-mono truncate max-w-[220px]">{entry.image}</div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                          running
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${running ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                        {running ? 'Запущен' : 'Остановлен'}
                      </span>
                    </td>

                    <td className="py-3 px-3">
                      {isEditing ? (
                        <div className="flex items-center space-x-1.5">
                          <select
                            value={editingPolicy}
                            onChange={(e) => setEditingPolicy(e.target.value)}
                            className="px-2 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs font-mono text-slate-200 focus:border-cyan-500 focus:outline-none"
                          >
                            <option value="no">Нет (выкл.)</option>
                            <option value="unless-stopped">unless-stopped</option>
                            <option value="always">always</option>
                            <option value="on-failure">on-failure</option>
                          </select>
                          <button
                            onClick={() => handleSetPolicy(entry.id, editingPolicy)}
                            className="px-2.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-semibold cursor-pointer"
                          >
                            ОК
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-2 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-[11px] cursor-pointer"
                          >
                            Отмена
                          </button>
                        </div>
                      ) : (
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold border ${POLICY_COLORS[entry.policy] || POLICY_COLORS.no}`}>
                          {enabled ? <Power className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                          {POLICY_LABELS[entry.policy] || entry.policy}
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end space-x-1">
                        <button
                          onClick={() => handleToggle(entry)}
                          title={enabled ? 'Выключить автозапуск' : 'Включить автозапуск'}
                          className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                            enabled
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                              : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-emerald-300'
                          }`}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setEditingId(entry.id);
                            setEditingPolicy(entry.policy);
                          }}
                          title="Редактировать политику"
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                        >
                          <Rocket className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleRemove(entry.id)}
                          title="Удалить автозапуск (политика no)"
                          disabled={!enabled}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center">
                    {loading ? (
                      <div className="flex items-center justify-center space-x-2 text-slate-400">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Загрузка контейнеров...</span>
                      </div>
                    ) : (
                      <div className="text-slate-400">Контейнеры не найдены{searchTerm ? ' по вашему запросу' : ''}.</div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info block */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-400 space-y-1.5">
        <div className="font-semibold text-slate-300 flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          Как это работает
        </div>
        <p>• <b className="text-slate-300">always</b> — контейнер стартует автоматически при каждой загрузке хоста.</p>
        <p>• <b className="text-slate-300">unless-stopped</b> — то же самое, но если вы остановили контейнер вручную, он не запустится сам.</p>
        <p>• <b className="text-slate-300">on-failure</b> — перезапуск только при аварийном выходе (до 5 попыток).</p>
        <p>• <b className="text-slate-300">no</b> — автозапуска нет (по умолчанию).</p>
      </div>
    </div>
  );
};