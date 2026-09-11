import React from 'react';
import {
  LayoutDashboard,
  Server,
  Activity,
  Tv,
  Bot,
  Settings,
  Package,
  Boxes,
  Rocket,
  Users,
  Cpu,
  Network,
  X,
} from 'lucide-react';
import { FixcatLogo } from './icons/OSIcons';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  containersCount?: number;
  totalCount?: number;
  runningCount: number;
  dockerConnected?: boolean;
  isDockerConnected?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  mobileOpen?: boolean;
  setMobileOpen?: (open: boolean) => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  setCurrentTab,
  containersCount,
  totalCount,
  runningCount,
  dockerConnected,
  isDockerConnected,
  mobileOpen,
  setMobileOpen,
  isOpenMobile,
  onCloseMobile,
}) => {
  const isMobileDrawerOpen = Boolean(mobileOpen || isOpenMobile);
  const handleClose = () => {
    if (setMobileOpen) setMobileOpen(false);
    if (onCloseMobile) onCloseMobile();
  };

  const isConnected = dockerConnected ?? isDockerConnected ?? false;
  const countTotal = containersCount ?? totalCount ?? 0;

  const menuItems = [
    {
      id: 'dashboard',
      label: 'Панель управления',
      sublabel: 'Сводка, CPU, RAM, GPU',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'containers',
      label: 'Менеджер контейнеров',
      sublabel: 'Развертывание, пауза, удаление',
      icon: Server,
      badge: `${runningCount}/${countTotal}`,
      badgeColor: runningCount > 0 ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-slate-800 text-slate-400',
    },
    {
      id: 'nodes',
      label: 'Связанные ПК (Узлы)',
      sublabel: 'Подключение второго устройства',
      icon: Network,
      badge: null,
    },
    {
      id: 'resources',
      label: 'Мониторинг ресурсов',
      sublabel: 'Метрики CPU, RAM, GPU 0/1',
      icon: Activity,
      badge: 'Live',
      badgeColor: 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20',
    },
    {
      id: 'novnc',
      label: 'noVNC Рабочие столы',
      sublabel: 'Удаленный доступ к ОС',
      icon: Tv,
      badge: null,
    },
    {
      id: 'autostart',
      label: 'Автозагрузки',
      sublabel: 'Автозапуск при старте хоста',
      icon: Rocket,
      badge: 'Boot',
      badgeColor: 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20',
    },
    {
      id: 'on-device-ai',
      label: ' (Нейросети)',
      sublabel: ' & Local LLM',
      icon: Bot,
      badge: 'New',
      badgeColor: 'bg-blue-500/10 text-blue-300 border border-blue-500/20',
    },
    {
      id: 'users',
      label: 'Пользователи',
      sublabel: 'Учётные записи и роли',
      icon: Users,
      badge: 'Roles',
      badgeColor: 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20',
    },
    {
      id: 'modules',
      label: 'Модули',
      sublabel: 'Каталог ОС, AI и системы',
      icon: Boxes,
      badge: 'Store',
      badgeColor: 'bg-violet-500/10 text-violet-300 border border-violet-500/20',
    },
    {
      id: 'installer',
      label: 'Установщик & Экспорт',
      sublabel: 'Пошаговая установка и скрипты',
      icon: Package,
      badge: 'Kit',
      badgeColor: 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20',
    },
    {
      id: 'hardware',
      label: 'Управление железом',
      sublabel: 'CPU, вентиляторы, Swap',
      icon: Cpu,
      badge: 'Sys',
      badgeColor: 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20',
    },
    {
      id: 'settings',
      label: 'Настройки панели',
      sublabel: 'Параметры, обновление',
      icon: Settings,
      badge: isConnected ? 'Docker OK' : 'Настройки',
      badgeColor: isConnected ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300',
    },
  ];

  const handleTabClick = (tabId: string) => {
    setCurrentTab(tabId);
    handleClose();
  };

  const SidebarContent = (
    <div className="flex flex-col h-full justify-between select-none">
      <div>
        {/* Header Logo */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <FixcatLogo className="w-8 h-8" />
            <div>
              <h2 className="font-extrabold text-white text-base tracking-tight flex items-center gap-1.5">
                <span>Fixcat OS</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-mono border border-blue-500/30">
                  Manager
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">Управление ОС &amp; </p>
            </div>
          </div>

          {/* Close button inside mobile menu drawer */}
          <button
            onClick={handleClose}
            className="md:hidden p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white cursor-pointer"
            aria-label="Закрыть меню"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="p-3 space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleTabClick(item.id)}
                className={`w-full p-2.5 rounded-xl text-left transition-all flex items-center justify-between group cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white font-semibold shadow-lg shadow-blue-600/20'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-blue-400'}`} />
                  <div className="truncate">
                    <div className="text-xs font-medium leading-tight">{item.label}</div>
                    <div className={`text-[10px] truncate ${isActive ? 'text-blue-100' : 'text-slate-500'}`}>
                      {item.sublabel}
                    </div>
                  </div>
                </div>

                {item.badge && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-medium shrink-0 ${isActive ? 'bg-white/20 text-white' : item.badgeColor}`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Status Card */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950/40">
        <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/50 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.8)]'}`} />
              <span className="text-xs font-semibold text-slate-200">
                {isConnected ? 'Docker Daemon' : 'Docker Socket'}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">{isConnected ? 'OK' : 'Off'}</span>
          </div>

          <p className="text-[11px] text-slate-400 leading-snug">
            {isConnected
              ? 'Сокет /var/run/docker.sock активен. Порты и GPU готовы.'
              : 'Сокет Docker отключен. Отображаются данные хоста.'}
          </p>

          <div className="pt-1 flex items-center justify-between text-[11px] text-slate-300 border-t border-slate-700/40">
            <span>Активных ОС:</span>
            <span className="font-semibold text-white">{runningCount}</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside id="main-sidebar-desktop" className="hidden md:flex w-64 bg-slate-900 border-r border-slate-800 flex-col shrink-0">
        {SidebarContent}
      </aside>

      {/* Mobile Drawer Slide-over */}
      {isMobileDrawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Backdrop Overlay */}
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
            onClick={handleClose}
          />

          {/* Drawer Panel */}
          <aside className="relative w-80 max-w-[85vw] bg-slate-900 border-r border-slate-800 h-full flex flex-col z-10 shadow-2xl animate-fade-in">
            {SidebarContent}
          </aside>
        </div>
      )}
    </>
  );
};
