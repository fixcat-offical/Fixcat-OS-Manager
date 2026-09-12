import React, { useState, useEffect, useCallback } from 'react';
import {
  Download,
  Trash2,
  Loader2,
  RefreshCw,
  CheckCheck,
  HardDrive,
  Cpu,
  Container,
  Bot,
  Boxes,
  Play,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Search,
} from 'lucide-react';
import {
  UbuntuIcon,
  WindowsXPIcon,
  DebianIcon,
  AlpineIcon,
  KaliIcon,
} from './icons/OSIcons';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ModuleKind = 'image' | 'cli' | 'service';
type ModuleStatus = 'ready' | 'installing' | 'done' | 'warn' | 'error';

interface ModuleItem {
  id: string;
  category: 'os' | 'ai' | 'system';
  name: string;
  description: string;
  icon: string;
  group: string;
  image?: string;
  sizeLabel?: string;
  kind: ModuleKind;
  installed: boolean;
  detail: string;
  size?: string;
  status: ModuleStatus;
  message?: string | null;
}

interface ModulePayload {
  id: string;
  status: ModuleStatus;
  message?: string | null;
}

const defaultModules: ModuleItem[] = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const moduleIcon = (icon: string, className = 'w-6 h-6') => {
  switch (icon) {
    case 'ubuntu': return <UbuntuIcon className={className} />;
    case 'windows-xp':
    case 'windows-7':
    case 'windows-8':
    case 'windows-10':
    case 'windows-11':
    case 'windows': return <WindowsXPIcon className={className} />;
    case 'debian': return <DebianIcon className={className} />;
    case 'kali': return <KaliIcon className={className} />;
    case 'alpine': return <AlpineIcon className={className} />;
    case 'bot': return <Bot className={`${className} text-purple-400`} />;
    case 'docker': return <Container className={`${className} text-blue-400`} />;
    case 'node': return <Boxes className={`${className} text-emerald-400`} />;
    case 'nvidia': return <Cpu className={`${className} text-green-400`} />;
    default: return <Boxes className={`${className} text-slate-400`} />;
  }
};

const statusBadge = (m: ModuleItem) => {
  if (m.status === 'installing') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-500/10 text-blue-300 border border-blue-500/30">
        <Loader2 className="w-3 h-3 animate-spin" />
        {m.message || 'Устанавливается...'}
      </span>
    );
  }
  if (m.status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/10 text-rose-300 border border-rose-500/30">
        <XCircle className="w-3 h-3" />
        Ошибка
      </span>
    );
  }
  if (m.status === 'warn') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
        <AlertTriangle className="w-3 h-3" />
        {m.message || 'Внимание'}
      </span>
    );
  }
  if (m.installed) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
        <CheckCircle2 className="w-3 h-3" />
        {m.kind === 'image' && m.size ? m.size : 'Установлен'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
      Не установлен
    </span>
  );
};

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

interface ModulesViewProps {
  authToken?: string | null;
}

export const ModulesView: React.FC<ModulesViewProps> = ({ authToken }) => {
  const [modules, setModules] = useState<ModuleItem[]>(defaultModules);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');

  const fetchModules = useCallback(async () => {
    try {
      const res = await fetch('/api/modules');
      if (res.ok) {
        const data = await res.json();
        setModules(data.modules || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  // SSE live updates for module actions
  useEffect(() => {
    const es = new EventSource('/api/installer/stream');
    es.onopen = () => setLiveStatus(true);
    es.onerror = () => setLiveStatus(false);

    es.onmessage = (event) => {
      try {
        const ev = JSON.parse(event.data);
        if (ev.type !== 'module') return;
        const p: ModulePayload = ev.payload;
        setModules((prev) =>
          prev.map((m) =>
            m.id !== p.id
              ? m
              : { ...m, status: p.status, message: p.message ?? null, detail: p.message || m.detail }
          )
        );
        // When a module finishes, refresh to pull fresh installed/size status
        if (p.status !== 'installing') {
          window.setTimeout(fetchModules, 800);
        }
      } catch {
        // ignore
      }
    };

    return () => es.close();
  }, [fetchModules]);

  useEffect(() => {
    fetchModules();
  }, [fetchModules]);

  const act = async (id: string, action: 'install' | 'uninstall') => {
    setBusyId(id);
    try {
      await fetch(`/api/modules/${id}/${action}`, {
        method: 'POST',
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
    } catch {
      // ignore
    } finally {
      setBusyId(null);
    }
  };

  const groups = Array.from(new Set(modules.map((m) => m.group)));
  const installedCount = modules.filter((m) => m.installed).length;
  const imagesCount = modules.filter((m) => m.category === 'os').length;

  const visibleModules = modules.filter((m) => {
    const matchesGroup = groupFilter === 'all' || m.group === groupFilter;
    const q = searchTerm.toLowerCase();
    const matchesSearch =
      !q ||
      m.id.toLowerCase().includes(q) ||
      m.name.toLowerCase().includes(q) ||
      (m.description || '').toLowerCase().includes(q) ||
      (m.image || '').toLowerCase().includes(q);
    return matchesGroup && matchesSearch;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-indigo-950/80 via-slate-900 to-blue-950/80 border border-indigo-500/30 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <Boxes className="w-48 h-48 text-indigo-400" />
        </div>
        <div className="relative z-10 space-y-3 max-w-3xl">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-semibold">
            <Boxes className="w-3.5 h-3.5" />
            <span>Каталог модулей</span>
            <span className="flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
              <span className={`w-1.5 h-1.5 rounded-full ${liveStatus ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
              {liveStatus ? 'SSE connected' : 'SSE offline'}
            </span>
          </div>

          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            Модули и дистрибутивы ОС
          </h1>

          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Готовые виртуальные ОС (Ubuntu, Windows XP, Debian, Kali, Alpine) с доступом
            через noVNC и системные компоненты. Установите
            модуль одним кликом — он появится в списке контейнеров.
          </p>

          {/* Stats */}
          <div className="flex flex-wrap gap-3 pt-2">
            <div className="px-4 py-2.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center gap-2.5">
              <Container className="w-4 h-4 text-blue-400" />
              <div>
                <div className="text-lg font-bold text-white leading-none">{modules.length}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Всего модулей</div>
              </div>
            </div>
            <div className="px-4 py-2.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center gap-2.5">
              <CheckCheck className="w-4 h-4 text-emerald-400" />
              <div>
                <div className="text-lg font-bold text-white leading-none">{installedCount}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Установлено</div>
              </div>
            </div>
            <div className="px-4 py-2.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center gap-2.5">
              <HardDrive className="w-4 h-4 text-cyan-400" />
              <div>
                <div className="text-lg font-bold text-white leading-none">{imagesCount}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">ОС-дистрибутивов</div>
              </div>
            </div>
            <button
              onClick={fetchModules}
              disabled={loading}
              className="ml-auto px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-700"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Обновить
            </button>
          </div>
        </div>
      </div>

      {/* Search + group filter */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Поиск модуля, ОС или изображения..."
            className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 focus:border-indigo-500 focus:outline-none placeholder:text-slate-500"
          />
        </div>
        <div className="flex items-center space-x-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs overflow-x-auto">
          <button
            onClick={() => setGroupFilter('all')}
            className={`px-2.5 py-1.5 rounded-lg font-medium whitespace-nowrap cursor-pointer transition-colors ${
              groupFilter === 'all' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Все
          </button>
          {groups.map((g) => (
            <button
              key={g}
              onClick={() => setGroupFilter(g)}
              className={`px-2.5 py-1.5 rounded-lg font-medium whitespace-nowrap cursor-pointer transition-colors ${
                groupFilter === g ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="p-16 text-center text-slate-500 flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
          Загрузка модулей...
        </div>
      ) : visibleModules.length === 0 ? (
        <div className="p-16 text-center text-slate-500 flex flex-col items-center gap-2">
          <Search className="w-6 h-6 text-slate-600" />
          Ничего не найдено по запросу «{searchTerm}»
        </div>
      ) : (
        groups.map((group) => {
          const groupModules = visibleModules.filter((m) => m.group === group);
          return (
            <div key={group} className="space-y-3">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 px-1">
                <span className="w-1 h-4 rounded bg-gradient-to-b from-indigo-400 to-blue-500" />
                {group}
                <span className="text-[11px] font-mono text-slate-500">{groupModules.length}</span>
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {groupModules.map((m) => (
                  <div
                    key={m.id}
                    className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-colors flex flex-col gap-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                          {moduleIcon(m.icon)}
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white leading-tight">{m.name}</h3>
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">{m.id}</div>
                        </div>
                      </div>
                      {statusBadge(m)}
                    </div>

                    <p className="text-xs text-slate-400 leading-relaxed min-h-[2.5rem]">
                      {m.description}
                    </p>

                    {m.kind === 'image' && m.image && (
                      <div className="text-[10px] font-mono text-slate-600 truncate bg-slate-950 rounded-lg px-2.5 py-1.5 border border-slate-800">
                        docker pull {m.image}
                      </div>
                    )}

                    <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                      {m.kind === 'image' ? (
                        <>
                          <HardDrive className="w-3 h-3" />
                          {m.sizeLabel || m.detail}
                        </>
                      ) : (
                        <>{m.detail}</>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-1 mt-auto">
                      {m.installed && m.kind === 'image' ? (
                        <button
                          onClick={() => act(m.id, 'uninstall')}
                          disabled={busyId === m.id || m.status === 'installing'}
                          className="flex-1 px-3 py-2 rounded-xl bg-slate-800 hover:bg-rose-600/20 hover:text-rose-200 text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 border border-slate-700"
                        >
                          {busyId === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          Удалить
                        </button>
                      ) : (
                        <button
                          onClick={() => act(m.id, 'install')}
                          disabled={busyId === m.id || m.status === 'installing'}
                          className="flex-1 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-60 shadow-lg shadow-blue-600/20"
                        >
                          {busyId === m.id || m.status === 'installing' ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Download className="w-3.5 h-3.5" />
                          )}
                          {m.status === 'installing' ? 'Установка...' : m.installed ? 'Установлен' : 'Установить'}
                        </button>
                      )}

                      <button
                        onClick={() => act(m.id, 'install')}
                        disabled={!m.installed || m.kind !== 'image'}
                        title={m.kind === 'image' ? 'Создать контейнер и открыть рабочий стол' : 'Запуск доступен для ОС-образов'}
                        className={`px-3 py-2 rounded-xl flex items-center justify-center gap-1.5 text-xs font-semibold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                          m.installed && m.kind === 'image'
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20'
                            : 'bg-slate-800 text-slate-500 border border-slate-800'
                        }`}
                      >
                        <Play className="w-3.5 h-3.5" />
                        Запуск
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}

      {/* Installer CTA */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
          <ArrowRight className="w-5 h-5 text-indigo-300" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-white">Планируете новую систему с нуля?</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Вкладка «Установщик» поставит Docker, Node.js, GPU-стек и предзагрузит все нужные
            ОС-образы в один прогон — с нуля до готовой системы за пару кликов.
          </p>
        </div>
      </div>
    </div>
  );
};