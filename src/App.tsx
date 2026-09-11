import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { DashboardView } from './components/DashboardView';
import { ContainersView } from './components/ContainersView';
import { ResourceMonitorView } from './components/ResourceMonitorView';
import { NoVncFullView } from './components/NoVncFullView';
import { NoVncModal } from './components/NoVncModal';
import { LogsModal } from './components/LogsModal';
import { DeployModal } from './components/DeployModal';
import { SettingsView } from './components/SettingsView';
import { OnDeviceAiView } from './components/OnDeviceAiView';
import { InstallerExportView } from './components/InstallerExportView';
import { ModulesView } from './components/ModulesView';
import { AutostartView } from './components/AutostartView';
import { AuthView } from './components/AuthView';
import { ContainerItem, SystemInfo, MetricHistoryPoint, AuthStatus } from './types';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';

export default function App() {
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [containers, setContainers] = useState<ContainerItem[]>([]);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [history, setHistory] = useState<MetricHistoryPoint[]>([]);
  const [refreshInterval, setRefreshInterval] = useState<number>(2000);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  // Auth State
  const [authStatus, setAuthStatus] = useState<AuthStatus>({
    isRegistered: true,
    isAuthenticated: false,
  });
  const [authToken, setAuthToken] = useState<string | null>(() => localStorage.getItem('fixcat_auth_token'));

  // Modals state
  const [activeNoVncModal, setActiveNoVncModal] = useState<ContainerItem | null>(null);
  const [activeLogsModal, setActiveLogsModal] = useState<ContainerItem | null>(null);
  const [isDeployModalOpen, setIsDeployModalOpen] = useState<boolean>(false);

  // Toast notifications
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 3500);
  };

  // Check Auth Status on Mount
  const checkAuthStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/status', {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setAuthStatus({
          isRegistered: data.isRegistered,
          isAuthenticated: data.isAuthenticated,
          username: data.username,
        });
      }
    } catch {
      // Auth check error
    }
  }, [authToken]);

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  // Login Handler
  const handleLogin = async (username: string, pass: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: pass }),
      });
      const data = await res.json();
      if (res.ok && data.token) {
        localStorage.setItem('fixcat_auth_token', data.token);
        setAuthToken(data.token);
        setAuthStatus({ isRegistered: true, isAuthenticated: true, username: data.username });
        showToast('Добро пожаловать в Fixcat OS Manager!', 'success');
        return true;
      }
    } catch {
      // Login error
    }
    return false;
  };

  // Register Handler
  const handleRegister = async (username: string, pass: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: pass }),
      });
      const data = await res.json();
      if (res.ok && data.token) {
        localStorage.setItem('fixcat_auth_token', data.token);
        setAuthToken(data.token);
        setAuthStatus({ isRegistered: true, isAuthenticated: true, username: data.username });
        showToast('Аккаунт администратора создан!', 'success');
        return true;
      }
    } catch {
      // Register error
    }
    return false;
  };

  // Logout Handler
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Logout error
    }
    localStorage.removeItem('fixcat_auth_token');
    setAuthToken(null);
    setAuthStatus((prev) => ({ ...prev, isAuthenticated: false }));
    showToast('Вы вышли из панели управления', 'info');
  };

  // Fetch data
  const fetchData = useCallback(async () => {
    if (!authStatus.isAuthenticated) return;

    setIsRefreshing(true);
    try {
      const [contRes, sysRes, histRes] = await Promise.all([
        fetch('/api/containers'),
        fetch('/api/system'),
        fetch('/api/stats/history'),
      ]);

      if (contRes.ok) {
        const cData = await contRes.json();
        setContainers(cData.containers || []);
      }

      if (sysRes.ok) {
        const sData = await sysRes.json();
        setSystemInfo(sData);
      }

      if (histRes.ok) {
        const hData = await histRes.json();
        setHistory(hData.history || []);
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [authStatus.isAuthenticated]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh timer
  useEffect(() => {
    if (refreshInterval <= 0 || !authStatus.isAuthenticated) return;
    const timer = setInterval(() => {
      fetchData();
    }, refreshInterval);
    return () => clearInterval(timer);
  }, [refreshInterval, fetchData, authStatus.isAuthenticated]);

  // Action handler (Start/Stop/Restart/Remove/Pause/Unpause)
  const handleContainerAction = async (id: string, action: string) => {
    try {
      const res = await fetch(`/api/containers/${id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || `Действие ${action} выполнено успешно!`, 'success');
        fetchData();
      } else {
        showToast(data.error || 'Ошибка выполнения действия', 'error');
      }
    } catch {
      showToast('Ошибка сетевого запроса к Docker', 'error');
    }
  };

  // Full Automated Deploy handler
  const handleDeployContainer = async (config: any) => {
    try {
      const res = await fetch('/api/containers/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || 'ОС успешно развернута и запущена!', 'success');
        setIsDeployModalOpen(false);
        await fetchData();
        setCurrentTab('novnc');
        return true;
      } else {
        showToast(data.error || 'Ошибка автоматического развертывания', 'error');
        throw new Error(data.error || 'Ошибка развертывания');
      }
    } catch (err: any) {
      showToast(err?.message || 'Ошибка выполнения сетевого запроса', 'error');
      throw err;
    }
  };

  // Update Config handler
  const handleUpdateConfig = async (cfg: any) => {
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      if (res.ok) {
        showToast('Настройки успешно сохранены!', 'success');
        fetchData();
      }
    } catch {
      showToast('Ошибка сохранения конфигурации', 'error');
    }
  };

  // If user is not authenticated -> show Login / Register screen
  if (!authStatus.isAuthenticated) {
    return (
      <AuthView
        isRegistered={authStatus.isRegistered}
        onLogin={handleLogin}
        onRegister={handleRegister}
      />
    );
  }

  const runningCount = containers.filter((c) => c.State === 'running').length;
  const isDockerConnected = systemInfo?.docker?.socketAvailable || systemInfo?.docker?.mode === 'connected';

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 font-sans select-none">
      {/* Fixcat OS Manager Sidebar */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        runningCount={runningCount}
        totalCount={containers.length}
        isDockerConnected={Boolean(isDockerConnected)}
        isOpenMobile={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        mobileOpen={mobileMenuOpen}
        setMobileOpen={setMobileMenuOpen}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-950">
        <Header
          currentTab={currentTab}
          systemInfo={systemInfo}
          onOpenDeploy={() => setIsDeployModalOpen(true)}
          onRefresh={fetchData}
          isRefreshing={isRefreshing}
          refreshInterval={refreshInterval}
          setRefreshInterval={setRefreshInterval}
          onOpenQuickVnc={() => setCurrentTab('novnc')}
          onToggleMobileMenu={() => setMobileMenuOpen(!mobileMenuOpen)}
          onLogout={handleLogout}
          username={authStatus.username}
        />

        <main className="flex-1 overflow-y-auto p-3 sm:p-6 lg:p-8">
          {currentTab === 'dashboard' && (
            <DashboardView
              containers={containers}
              systemInfo={systemInfo}
              history={history}
              onOpenNoVnc={(c) => setActiveNoVncModal(c)}
              onOpenLogs={(c) => setActiveLogsModal(c)}
              onContainerAction={handleContainerAction}
              onNavigateTab={(tab) => setCurrentTab(tab)}
              onOpenDeploy={() => setIsDeployModalOpen(true)}
            />
          )}

          {currentTab === 'containers' && (
            <ContainersView
              containers={containers}
              onOpenNoVnc={(c) => setActiveNoVncModal(c)}
              onOpenLogs={(c) => setActiveLogsModal(c)}
              onContainerAction={handleContainerAction}
              onOpenDeploy={() => setIsDeployModalOpen(true)}
              onRefresh={fetchData}
              isRefreshing={isRefreshing}
            />
          )}

          {currentTab === 'resources' && (
            <ResourceMonitorView
              containers={containers}
              systemInfo={systemInfo}
              history={history}
            />
          )}

          {currentTab === 'novnc' && (
            <NoVncFullView
              containers={containers}
              onContainerAction={handleContainerAction}
            />
          )}

          {currentTab === 'autostart' && (
            <AutostartView />
          )}

          {currentTab === 'on-device-ai' && (
            <OnDeviceAiView hostIp={systemInfo?.config?.hostIp || 'localhost'} />
          )}

          {currentTab === 'modules' && (
            <ModulesView />
          )}

          {currentTab === 'installer' && (
            <InstallerExportView />
          )}

          {currentTab === 'settings' && (
            <SettingsView
              systemInfo={systemInfo}
              refreshInterval={refreshInterval}
              setRefreshInterval={setRefreshInterval}
              onSaveConfig={handleUpdateConfig}
            />
          )}
        </main>
      </div>

      {/* Modals */}
      {activeNoVncModal && (
        <NoVncModal
          container={activeNoVncModal}
          onClose={() => setActiveNoVncModal(null)}
        />
      )}

      {activeLogsModal && (
        <LogsModal
          container={activeLogsModal}
          onClose={() => setActiveLogsModal(null)}
        />
      )}

      {isDeployModalOpen && (
        <DeployModal
          onClose={() => setIsDeployModalOpen(false)}
          onDeploy={handleDeployContainer}
        />
      )}

      {/* Floating Toast Banner */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-2xl shadow-2xl border flex items-center space-x-2.5 text-xs font-semibold backdrop-blur-md animate-fade-in max-w-sm ${
            toast.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-200 border-emerald-500/40 shadow-emerald-950/50'
              : toast.type === 'error'
              ? 'bg-rose-950/90 text-rose-200 border-rose-500/40 shadow-rose-950/50'
              : 'bg-blue-950/90 text-blue-200 border-blue-500/40 shadow-blue-950/50'
          }`}
        >
          {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
          {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
          {toast.type === 'info' && <Info className="w-4 h-4 text-blue-400 shrink-0" />}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
