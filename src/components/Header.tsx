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
  Sparkles,
  Clock,
} from 'lucide-react';
import { SystemInfo } from '../types';

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
}

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
}) => {
  const getTabTitle = (tab: string) => {
    switch (tab) {
      case 'dashboard':
        return {
          title: 'Панель управления',
          subtitle: 'Сводка CPU, RAM, GPU и статистика контейнеров',
        };
      case 'containers':
        return {
          title: 'Управление ОС',
          subtitle: 'Список контейнеров, автоподбор портов и питание',
        };
      case 'resources':
        return {
          title: 'Мониторинг ресурсов',
          subtitle: 'Потребление CPU, RAM и видеокарт GPU 0/1',
        };
      case 'novnc':
        return {
          title: 'noVNC Веб-терминал',
          subtitle: 'Удаленный доступ к графическим столам',
        };
      case 'autostart':
        return {
          title: 'Автозагрузки',
          subtitle: 'Автозапуск контейнеров при старте хоста',
        };
      case 'on-device-ai':
        return {
          title: ' (Нейросети)',
          subtitle: 'Интеграция с , каталог моделей и чат',
        };
      case 'users':
        return {
          title: 'Управление пользователями',
          subtitle: 'Учётные записи, роли и доступ',
        };
      case 'modules':
        return {
          title: 'Каталог модулей',
          subtitle: 'Каталог ОС, AI и системы',
        };
      case 'settings':
        return {
          title: 'Настройки панели',
          subtitle: 'Конфигурация панели, Docker, обновления',
        };
      case 'nodes':
        return {
          title: 'Связанные ПК (Узлы)',
          subtitle: 'Интеграция нескольких панелей по API',
        };
      case 'hardware':
        return {
          title: 'Системное оборудование',
          subtitle: 'CPU, управление вентиляторами и swap',
        };
      case 'installer':
        return {
          title: 'Экспорт установщика',
          subtitle: 'Генерация скрипта установки Fixcat OS Manager',
        };
      default:
        return { title: 'Fixcat OS Manager', subtitle: 'Docker &  Management' };
    }
  };

  const { title, subtitle } = getTabTitle(currentTab);

  const ramUsedGb = systemInfo ? (systemInfo.memory.used / (1024 * 1024 * 1024)).toFixed(1) : '0';
  const ramTotalGb = systemInfo ? (systemInfo.memory.total / (1024 * 1024 * 1024)).toFixed(1) : '0';
  const ramPercent = systemInfo ? systemInfo.memory.percent : 0;
  const isDockerActive = systemInfo?.docker?.socketAvailable || systemInfo?.docker?.mode === 'connected';

  return (
    <header id="main-header" className="bg-slate-900 border-b border-slate-800 px-3 sm:px-6 py-3 flex items-center justify-between gap-2 sticky top-0 z-20">
      <div className="flex items-center space-x-2.5">
        {/* Mobile Hamburger Menu Toggle */}
        <button
          id="btn-mobile-menu-toggle"
          onClick={onToggleMobileMenu}
          className="md:hidden p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/60 cursor-pointer active:scale-95 transition-transform"
          aria-label="Открыть меню"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div>
          <h1 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
            {title}
          </h1>
          <p className="text-[11px] sm:text-xs text-slate-400 truncate max-w-[180px] sm:max-w-none">{subtitle}</p>
        </div>
      </div>

      <div className="flex items-center flex-wrap gap-2">
        {/* Quick System Load Badges (Desktop) */}
        {systemInfo && (
          <div className="hidden xl:flex items-center space-x-2 bg-slate-950/70 border border-slate-800 px-3 py-1.5 rounded-xl text-xs">
            <div className="flex items-center space-x-1.5 pr-2 border-r border-slate-800">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-slate-400">CPU:</span>
              <span className="font-semibold text-slate-200">{systemInfo.cpus.count} яд.</span>
            </div>

            <div className="flex items-center space-x-1.5 pr-2 border-r border-slate-800">
              <HardDrive className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-slate-400">RAM:</span>
              <span className="font-semibold text-slate-200">
                {ramUsedGb}/{ramTotalGb} GB ({ramPercent}%)
              </span>
            </div>

            <div className="flex items-center space-x-1.5">
              <Globe className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-slate-400">Хост:</span>
              <span className="font-mono text-emerald-400 font-medium">
                {systemInfo.config?.hostIp || 'localhost'}
              </span>
            </div>
          </div>
        )}

        {/* Docker Mode Indicator */}
        <div className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium border ${
          isDockerActive
            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
            : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
        }`}>
          <Radio className={`w-3.5 h-3.5 ${isDockerActive ? 'text-emerald-400 animate-pulse' : 'text-rose-400'}`} />
          <span className="hidden sm:inline">{isDockerActive ? 'Docker Live' : 'Сокет отключен'}</span>
        </div>

        {/* Live refresh indicator (always on) */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs font-medium text-emerald-300" title="Данные обновляются автоматически в реальном времени">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="hidden sm:inline">Live</span>
        </div>

        {/* Manual Refresh Button */}
        <button
          id="btn-header-refresh"
          onClick={onRefresh}
          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/70 transition-colors cursor-pointer"
          title="Обновить данные"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-400' : ''}`} />
        </button>

        {/* Last Updated Indicator */}
        {lastUpdated && (
          <div
            className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800/60 border border-slate-700/50 text-[11px] text-slate-400 font-mono"
            title="Обновлено"
          >
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        )}

        {/* Action Button: Deploy OS */}
        <button
          id="btn-header-deploy"
          onClick={onOpenDeploy}
          className="flex items-center space-x-1 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-600/20 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Запустить ОС</span>
        </button>

        {/* Logout Button */}
        {onLogout && (
          <button
            onClick={onLogout}
            className="flex items-center space-x-1.5 p-2 rounded-xl bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 border border-slate-700/70 hover:border-rose-500/30 transition-colors cursor-pointer"
            title={`Выйти (${username || 'admin'})`}
          >
            {username && (
              <span className={`hidden md:inline text-[11px] font-medium px-2 py-0.5 rounded-lg ${
                role === 'admin'
                  ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                  : 'bg-sky-500/10 text-sky-300 border border-sky-500/20'
              }`}>
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
