import React from 'react';
import {
  RefreshCw,
  Cpu,
  HardDrive,
  Globe,
  Radio,
  Plus,
  Menu,
  LogOut,
  Clock,
  Monitor,
} from 'lucide-react';
import { SystemInfo, NodeItem } from '../types';
import { PanelTheme } from '../lib/useTheme';

interface HeaderProps {
  systemInfo: SystemInfo | null;
  currentTab: string;
  onRefresh: () => void;
  isRefreshing: boolean;
  onOpenDeploy: () => void;
  onOpenQuickVnc: () => void;
  onToggleMobileMenu?: () => void;
  onLogout?: () => void;
  username?: string | null;
  role?: string | null;
  lastUpdated?: Date | null;
  nodes?: NodeItem[];
  activeNodeId?: string;
  onChangeNode?: (id: string) => void;
  theme?: PanelTheme;
  onThemeChange?: (t: PanelTheme) => void;
}

const THEMES: { id: PanelTheme; label: string }[] = [
  { id: 'cobalt', label: 'Cobalt' },
  { id: 'black', label: 'Black' },
  { id: 'panel', label: 'Panel' },
];

const TAB_DEF: Record<string, { title: string; subtitle: string }> = {
  dashboard: { title: 'Панель управления', subtitle: 'Сводка CPU, RAM, GPU и статистика контейнеров' },
  containers: { title: 'Управление ОС', subtitle: 'Список контейнеров, автоподбор портов и питание' },
  resources: { title: 'Мониторинг ресурсов', subtitle: 'Потребление CPU, RAM и видеокарт GPU 0/1' },
  novnc: { title: 'noVNC Веб-терминал', subtitle: 'Удаленный доступ к графическим столам' },
  autostart: { title: 'Автозагрузки', subtitle: 'Автозапуск контейнеров при старте хоста' },
  users: { title: 'Управление пользователями', subtitle: 'Учётные записи, роли и доступ' },
  modules: { title: 'Каталог модулей', subtitle: 'Каталог ОС, AI и системы' },
  settings: { title: 'Настройки панели', subtitle: 'Конфигурация панели, Docker, обновления' },
  nodes: { title: 'Связанные ПК (Узлы)', subtitle: 'Интеграция нескольких панелей по API' },
  hardware: { title: 'Системное оборудование', subtitle: 'CPU, управление вентиляторами и swap' },
  installer: { title: 'Экспорт установщика', subtitle: 'Генерация скрипта установки Fixcat OS Manager' },
};

export const Header: React.FC<HeaderProps> = ({
  systemInfo,
  currentTab,
  onRefresh,
  isRefreshing,
  onOpenDeploy,
  onToggleMobileMenu,
  onLogout,
  username,
  role,
  lastUpdated,
  nodes = [],
  activeNodeId = 'local',
  onChangeNode,
  theme = 'panel',
  onThemeChange,
}) => {
  const { title, subtitle } = TAB_DEF[currentTab] ?? { title: 'Fixcat OS Manager', subtitle: 'Docker & Контейнеры' };

  const ramUsedGb = systemInfo ? (systemInfo.memory.used / (1024 * 1024 * 1024)).toFixed(1) : '0';
  const ramTotalGb = systemInfo ? (systemInfo.memory.total / (1024 * 1024 * 1024)).toFixed(1) : '0';
  const ramPercent = systemInfo ? systemInfo.memory.percent : 0;
  const isDockerActive = systemInfo?.docker?.socketAvailable || systemInfo?.docker?.mode === 'connected';

  return (
    <header
      id="main-header"
      className="px-3 sm:px-6 py-2.5 flex items-center justify-between gap-2 sticky top-0 z-20"
      style={{ background: 'var(--color-nav-bg)', backdropFilter: 'blur(8px)', borderBottom: '1px solid var(--color-rule)' }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <button
          id="btn-mobile-menu-toggle"
          onClick={onToggleMobileMenu}
          className="md:hidden p-2 -ml-2 rounded text-muted hover:text-ink transition-colors cursor-pointer"
          aria-label="Открыть меню"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="min-w-0">
          <h1 className="font-display text-base sm:text-lg font-medium text-ink tracking-tight leading-tight truncate">
            {title}
          </h1>
          <p className="mono-label truncate max-w-[200px] sm:max-w-[440px] mt-0.5">{subtitle}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap justify-end">
        {onChangeNode && nodes.length > 0 && (
          <div
            className="relative flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg border border-rule"
            style={{ background: 'var(--color-band-bg)' }}
          >
            <Monitor className={`w-3.5 h-3.5 ${activeNodeId !== 'local' ? 'text-accent' : 'text-muted'}`} />
            <select
              id="device-selector"
              value={activeNodeId}
              onChange={(e) => onChangeNode(e.target.value)}
              className="bg-transparent text-ink-2 font-medium outline-none cursor-pointer max-w-[150px] text-xs"
              title="Управление устройством — все вкладки работают с выбранным ПК"
            >
              <option value="local" className="bg-paper-2">🖥️ Этот ПК</option>
              {nodes.map((n) => (
                <option key={n.id} value={n.id} className="bg-paper-2">
                  {n.status?.online ? '🟢' : '🔴'} {n.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {systemInfo && (
          <div
            className="hidden xl:flex items-center gap-3 px-3 py-1.5 rounded-lg border border-rule text-xs"
            style={{ background: 'var(--color-band-bg)' }}
          >
            <span className="flex items-center gap-1.5 mono-label">
              <Cpu className="w-3.5 h-3.5 text-accent" />
              {systemInfo.cpus.count} <span className="normal-case">яд.</span>
            </span>
            <span className="flex items-center gap-1.5 mono-label">
              <HardDrive className="w-3.5 h-3.5 text-accent" />
              {ramUsedGb}/{ramTotalGb} GB · {ramPercent}%
            </span>
            <span className="flex items-center gap-1.5 mono-label">
              <Globe className="w-3.5 h-3.5 text-muted" />
              <span className="font-normal normal-case">{systemInfo.config?.hostIp || 'localhost'}</span>
            </span>
          </div>
        )}

        <div
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border ${
            isDockerActive
              ? 'text-ok border-ok/30'
              : 'text-danger border-danger/30'
          }`}
          style={{ background: isDockerActive ? 'var(--color-ok-tint)' : 'var(--color-danger-tint)' }}
        >
          <Radio className={`w-3.5 h-3.5 ${isDockerActive ? 'text-ok animate-pulse' : 'text-danger'}`} />
          <span className="hidden sm:inline mono-label">
            {isDockerActive ? 'Docker Live' : 'Сокет отключен'}
          </span>
        </div>

        <div
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium text-ok"
          style={{ background: 'var(--color-ok-tint)', borderColor: 'color-mix(in oklab, var(--color-ok) 30%, transparent)' }}
          title="Данные обновляются автоматически"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: 'var(--color-ok)' }} />
            <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: 'var(--color-ok)' }} />
          </span>
          <span className="hidden sm:inline mono-label">Live</span>
        </div>

        <button
          id="btn-header-refresh"
          onClick={onRefresh}
          className="p-2 rounded-lg border border-rule bg-paper transition-colors cursor-pointer text-muted hover:text-ink"
          title="Обновить данные"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-accent' : ''}`} />
        </button>

        {lastUpdated && (
          <div
            className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-rule text-[11px] font-mono text-muted"
            style={{ background: 'var(--color-band-bg)' }}
            title="Обновлено"
          >
            <Clock className="w-3.5 h-3.5 text-muted" />
            {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        )}

        {onThemeChange && (
          <div className="themes" role="group" aria-label="Тема оформления">
            {THEMES.map((t) => (
              <button
                key={t.id}
                className="theme-btn"
                aria-pressed={theme === t.id}
                title={t.label}
                onClick={() => onThemeChange(t.id)}
              >
                <span className="th-dot" data-dot={t.id} />
              </button>
            ))}
          </div>
        )}

        <button
          id="btn-header-deploy"
          onClick={onOpenDeploy}
          className="btn-primary"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Запустить ОС</span>
        </button>

        {onLogout && (
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 p-2 rounded-lg border border-rule bg-paper text-muted hover:text-danger transition-colors cursor-pointer"
            title={`Выйти (${username || 'admin'})`}
          >
            {username && (
              <span
                className={`hidden md:inline text-[11px] font-medium px-2 py-0.5 rounded mono-label ${
                  role === 'admin' ? 'text-warn' : 'text-muted'
                }`}
              >
                {role === 'admin' ? 'Админ' : 'Пользователь'}
              </span>
            )}
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  );
};

export default Header;