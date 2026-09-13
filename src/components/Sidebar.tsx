import React from 'react';
import {
  LayoutDashboard,
  Server,
  Activity,
  Tv,
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

interface MenuItem {
  id: string;
  label: string;
  sublabel: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  tone?: 'accent' | 'ok' | 'warn';
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

  const menuItems: MenuItem[] = [
    { id: 'dashboard', label: 'Панель управления', sublabel: 'Сводка, CPU, RAM, GPU', icon: LayoutDashboard },
    {
      id: 'containers',
      label: 'Менеджер контейнеров',
      sublabel: 'Развертывание, пауза, удаление',
      icon: Server,
      badge: `${runningCount}/${countTotal}`,
      tone: runningCount > 0 ? 'ok' : undefined,
    },
    { id: 'nodes', label: 'Связанные ПК (Узлы)', sublabel: 'Подключение второго устройства', icon: Network },
    { id: 'resources', label: 'Мониторинг ресурсов', sublabel: 'Метрики CPU, RAM, GPU 0/1', icon: Activity, badge: 'Live', tone: 'accent' },
    { id: 'novnc', label: 'noVNC Рабочие столы', sublabel: 'Удаленный доступ к ОС', icon: Tv },
    { id: 'autostart', label: 'Автозагрузки', sublabel: 'Автозапуск при старте хоста', icon: Rocket, badge: 'Boot', tone: 'accent' },
    { id: 'users', label: 'Пользователи', sublabel: 'Учётные записи и роли', icon: Users, badge: 'Roles', tone: 'ok' },
    { id: 'modules', label: 'Модули', sublabel: 'Каталог ОС, AI и системы', icon: Boxes, badge: 'Store', tone: 'accent' },
    { id: 'installer', label: 'Установщик & Экспорт', sublabel: 'Пошаговая установка и скрипты', icon: Package, badge: 'Kit', tone: 'accent' },
    { id: 'hardware', label: 'Управление железом', sublabel: 'CPU, вентиляторы, Swap', icon: Cpu, badge: 'Sys', tone: 'ok' },
    {
      id: 'settings',
      label: 'Настройки панели',
      sublabel: 'Параметры, обновление',
      icon: Settings,
      badge: isConnected ? 'Docker OK' : 'Docker Off',
      tone: isConnected ? 'ok' : 'warn',
    },
  ];

  const toneClass = (tone?: MenuItem['tone']) => {
    switch (tone) {
      case 'ok':
        return 'text-ok border-ok/30 bg-ok-tint/60';
      case 'warn':
        return 'text-warn border-warn/30 bg-warn-tint/60';
      default:
        return 'text-accent border-accent/30 bg-accent/10';
    }
  };

  const handleTabClick = (tabId: string) => {
    setCurrentTab(tabId);
    handleClose();
  };

  const SidebarContent = (
    <div className="flex flex-col h-full justify-between select-none">
      <div>
        <div className="px-4 py-4 border-b border-rule flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FixcatLogo className="w-8 h-8" />
            <div>
              <h2 className="font-display font-semibold text-base text-ink tracking-tight leading-tight flex items-center gap-2">
                <span>Fixcat OS</span>
                <span className="mono-label text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent border border-accent/30">
                  Manager
                </span>
              </h2>
              <p className="mono-label text-[10px]">ОС &amp; контейнеры в Docker</p>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="md:hidden p-1.5 rounded-lg bg-paper-3 hover:bg-graphite-2 text-muted hover:text-on-graphite transition-colors cursor-pointer"
            aria-label="Закрыть меню"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="p-3 space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleTabClick(item.id)}
                className={`w-full px-3 py-2.5 rounded-lg text-left transition-all flex items-center justify-between group cursor-pointer border ${
                  isActive
                    ? 'bg-accent text-accent-ink font-semibold border-accent shadow-[0_1px_0_var(--rule-2)]'
                    : 'bg-transparent text-ink-2 border-transparent hover:bg-paper-3 hover:text-ink'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-accent-ink' : 'text-muted group-hover:text-accent'}`} />
                  <div className="truncate text-left">
                    <div className={`text-xs font-medium leading-tight ${isActive ? 'font-semibold' : ''}`}>{item.label}</div>
                    <div className={`mono-label text-[10px] mt-0.5 truncate ${isActive ? 'text-accent-ink/70' : ''}`}>
                      {item.sublabel}
                    </div>
                  </div>
                </div>

                {item.badge && (
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-medium shrink-0 border ${
                      isActive ? 'bg-accent-ink/20 text-accent-ink border-accent-ink/30' : toneClass(item.tone)
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="p-3 border-t border-rule">
        <div
          className="p-3 rounded-lg border space-y-2"
          style={{
            background: 'var(--graphite)',
            borderColor: 'var(--graphite-rule)',
            color: 'var(--on-graphite)',
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full"
                style={{
                  background: isConnected ? 'var(--ok)' : 'var(--danger)',
                  boxShadow: isConnected ? '0 0 8px var(--ok)' : '0 0 8px var(--danger)',
                }}
              />
              <span className="text-xs font-semibold">{isConnected ? 'Docker Daemon' : 'Docker Socket'}</span>
            </div>
            <span className="mono-label text-[10px] text-on-graphite-2">{isConnected ? 'OK' : 'Off'}</span>
          </div>

          <p className="text-[11px] leading-snug opacity-80">
            {isConnected
              ? 'Сокет /var/run/docker.sock активен. Порты и GPU готовы.'
              : 'Сокет Docker отключен. Отображаются данные хоста.'}
          </p>

          <div className="pt-1 flex items-center justify-between text-[11px] border-t border-graphite-rule/60">
            <span className="opacity-70">Активных ОС:</span>
            <span className="font-semibold">{runningCount}</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside
        id="main-sidebar-desktop"
        className="hidden md:flex w-64 bg-paper-2 border-r border-rule flex-col shrink-0"
      >
        {SidebarContent}
      </aside>

      {isMobileDrawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity" onClick={handleClose} />

          <aside className="relative w-80 max-w-[85vw] bg-paper-2 border-r border-rule h-full flex flex-col z-10 shadow-2xl">
            {SidebarContent}
          </aside>
        </div>
      )}
    </>
  );
};

export default Sidebar;