import React, { useEffect, useState } from 'react';
import {
  Cpu,
  Fan,
  RefreshCw,
  Thermometer,
  Settings2,
  Gauge,
  AlertCircle,
  CheckCircle2,
  Flame,
  MemoryStick,
  Zap,
  Plus,
  Trash2,
  Power,
  PowerOff,
  Network,
  Wifi,
  WifiOff,
  Server,
} from 'lucide-react';
import { NodeItem } from '../types';

interface HardwareViewProps {
  authToken: string | null;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
  nodes?: NodeItem[];
}

interface CpuCore {
  index: number;
  supported: boolean;
  governor: string | null;
  curMhz: number | null;
  minMhz: number | null;
  maxMhz: number | null;
  cpuMaxMhz: number | null;
  hasSetspeed: boolean;
}

interface FanInfo {
  hwmon: string;
  driver: string;
  fanInputs: { channel: number; rpm: number | null; label?: string }[];
  pwm: { channel: number; value: number | null; enable: number | null }[];
}

interface SwapEntry {
  filename: string;
  type: string;
  sizeMb: number;
  usedMb: number;
  priority: number;
}

export const HardwareView: React.FC<HardwareViewProps> = ({ authToken, showToast, nodes }) => {
  const [cpuInfo, setCpuInfo] = useState<{ cpus: CpuCore[]; availableGovernors: string[]; writable: boolean; model: string | null } | null>(null);
  const [fanInfo, setFanInfo] = useState<{ fans: FanInfo[]; thinkpad: { available: boolean; status: string | null } } | null>(null);
  const [swapInfo, setSwapInfo] = useState<{ swaps: SwapEntry[]; totalMb: number; usedMb: number; freeRootMb: number | null } | null>(null);

  const [targetNode, setTargetNode] = useState('local');
  const [governor, setGovernor] = useState('');
  const [freqPerCore, setFreqPerCore] = useState<Record<string, number>>({});
  const [allCoreFreq, setAllCoreFreq] = useState('');
  const [minMhz, setMinMhz] = useState('');
  const [maxMhz, setMaxMhz] = useState('');
  const [pwmSettings, setPwmSettings] = useState<Record<string, number>>({});

  const [swapCreateSize, setSwapCreateSize] = useState('512');
  const [swapCreatePath, setSwapCreatePath] = useState('/swapfile');
  const [swapCreatePersist, setSwapCreatePersist] = useState(false);

  const [loading, setLoading] = useState({ cpu: false, fan: false, swap: false });

  const authHeader = authToken ? { Authorization: `Bearer ${authToken}` } : {};

  // Route hardware calls to local hardware module OR to a connected node via proxy
  const hwApi = async (path: string, method = 'GET', body?: any) => {
    if (targetNode === 'local') {
      const res = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: method !== 'GET' && body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, data };
    }
    const res = await fetch(`/api/nodes/${targetNode}/proxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({ path, method, body }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  };

  const selectedNode = nodes?.find((n) => n.id === targetNode);
  const isRemote = targetNode !== 'local';

  const fetchCpu = async () => {
    setLoading((p) => ({ ...p, cpu: true }));
    try {
      const { ok, data } = await hwApi('/api/hardware/cpu');
      if (!ok) throw new Error(data.error);
      setCpuInfo(data);
      if (!governor && data.currentGovernor) setGovernor(data.currentGovernor);
    } catch {
      showToast('Не удалось загрузить информацию о CPU', 'error');
    }
    setLoading((p) => ({ ...p, cpu: false }));
  };

  const fetchFans = async () => {
    setLoading((p) => ({ ...p, fan: true }));
    try {
      const { ok, data } = await hwApi('/api/hardware/fans');
      if (!ok) throw new Error(data.error);
      setFanInfo(data);
    } catch {
      showToast('Не удалось загрузить информацию о вентиляторах', 'error');
    }
    setLoading((p) => ({ ...p, fan: false }));
  };

  const fetchSwap = async () => {
    setLoading((p) => ({ ...p, swap: true }));
    try {
      const { ok, data } = await hwApi('/api/hardware/swap');
      if (!ok) throw new Error(data.error);
      setSwapInfo(data);
    } catch {
      showToast('Не удалось загрузить информацию о swap', 'error');
    }
    setLoading((p) => ({ ...p, swap: false }));
  };

  useEffect(() => {
    fetchCpu();
    fetchFans();
    fetchSwap();
  }, [targetNode]);

  // ---- CPU Actions ----
  const applyGovernor = async () => {
    if (!governor) return showToast('Выберите governor', 'error');
    try {
      const { ok, data } = await hwApi('/api/hardware/cpu/governor', 'POST', { governor });
      if (!ok) throw new Error(data.error);
      showToast(data.message || 'Governor применён', 'success');
      fetchCpu();
    } catch (err: any) {
      showToast(err?.message || 'Ошибка', 'error');
    }
  };

  const applyAllCoreFreq = async () => {
    const mhz = Number(allCoreFreq);
    if (!mhz || mhz <= 0) return showToast('Введите частоту в МГц', 'error');
    try {
      const { ok, data } = await hwApi('/api/hardware/cpu/frequency', 'POST', { mhz, cores: [] });
      if (!ok) throw new Error(data.error);
      showToast(data.message, 'success');
      fetchCpu();
    } catch (err: any) {
      showToast(err?.message || 'Ошибка', 'error');
    }
  };

  const applyPerCoreFreq = async () => {
    const entries = (Object.entries(freqPerCore) as [string, number][]).filter(([_, mhz]) => mhz > 0);
    if (entries.length === 0) return showToast('Укажите частоту хотя бы для одного ядра', 'error');
    for (const [coreStr, mhz] of entries) {
      const core = Number(coreStr);
      try {
        const { ok, data } = await hwApi('/api/hardware/cpu/frequency', 'POST', { mhz, cores: [core] });
        if (!ok) showToast(`Ядро ${core}: ${data.error}`, 'error');
        else showToast(`Ядро ${core}: ${mhz} МГц`, 'success');
      } catch (err: any) {
        showToast(`Ядро ${core}: ${err?.message}`, 'error');
      }
    }
    fetchCpu();
  };

  const applyLimits = async () => {
    try {
      const { ok, data } = await hwApi('/api/hardware/cpu/limits', 'POST', {
        minMhz: minMhz ? Number(minMhz) : null,
        maxMhz: maxMhz ? Number(maxMhz) : null,
      });
      if (!ok) throw new Error(data.error);
      showToast(data.message || 'Лимиты применены', 'success');
      fetchCpu();
    } catch (err: any) {
      showToast(err?.message || 'Ошибка', 'error');
    }
  };

  // ---- Fan Actions ----
  const applyPwm = async (hwmon: string, channel: number) => {
    const key = `${hwmon}:${channel}`;
    const percent = pwmSettings[key] ?? 50;
    try {
      const { ok, data } = await hwApi('/api/hardware/fans/pwm', 'POST', { hwmon, channel, percent });
      if (!ok) throw new Error(data.error);
      showToast(data.message, 'success');
      fetchFans();
    } catch (err: any) {
      showToast(err?.message || 'Ошибка', 'error');
    }
  };

  const setAutoFan = async (hwmon: string, channel: number) => {
    try {
      const { ok, data } = await hwApi('/api/hardware/fans/pwm-auto', 'POST', { hwmon, channel });
      if (!ok) throw new Error(data.error);
      showToast(data.message, 'success');
      fetchFans();
    } catch (err: any) {
      showToast(err?.message || 'Ошибка', 'error');
    }
  };

  const applyThinkpadLevel = async (level: string) => {
    try {
      const { ok, data } = await hwApi('/api/hardware/fans/thinkpad-level', 'POST', { level });
      if (!ok) throw new Error(data.error);
      showToast(data.message, 'success');
      fetchFans();
    } catch (err: any) {
      showToast(err?.message || 'Ошибка', 'error');
    }
  };

  // ---- Swap Actions ----
  const createSwap = async () => {
    const sizeMb = Number(swapCreateSize);
    if (!sizeMb || sizeMb <= 0) return showToast('Укажите размер', 'error');
    try {
      const { ok, data } = await hwApi('/api/hardware/swap/create', 'POST', { sizeMb, path: swapCreatePath || '/swapfile', persist: swapCreatePersist });
      if (!ok) throw new Error(data.error);
      showToast(data.message, 'success');
      fetchSwap();
    } catch (err: any) {
      showToast(err?.message || 'Ошибка', 'error');
    }
  };

  const toggleSwap = async (path: string, activate: boolean) => {
    try {
      const { ok, data } = await hwApi(`/api/hardware/swap/${activate ? 'activate' : 'deactivate'}`, 'POST', { path });
      if (!ok) throw new Error(data.error);
      showToast(data.message, 'success');
      fetchSwap();
    } catch (err: any) {
      showToast(err?.message || 'Ошибка', 'error');
    }
  };

  const removeSwap = async (path: string) => {
    try {
      const { ok, data } = await hwApi('/api/hardware/swap/remove', 'POST', { path });
      if (!ok) throw new Error(data.error);
      showToast(data.message, 'success');
      fetchSwap();
    } catch (err: any) {
      showToast(err?.message || 'Ошибка', 'error');
    }
  };

  return (
    <div className="space-y-6 pb-12 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <Cpu className="w-5 h-5 text-cyan-400" />
            Управление железом сервера
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Управление частотами ядер CPU, скоростью вентиляторов и swap-памятью
          </p>
        </div>
        <button onClick={() => { fetchCpu(); fetchFans(); fetchSwap(); }}
          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer border border-slate-700/70"
          title="Обновить">
          <RefreshCw className={`w-4 h-4 ${(loading.cpu || loading.fan || loading.swap) ? 'animate-spin text-blue-400' : ''}`} />
        </button>
      </div>

      {/* Node selector */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-bold text-white whitespace-nowrap">
            <span className={`w-8 h-8 rounded-xl border flex items-center justify-center ${isRemote ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-blue-600/10 border-blue-500/30 text-blue-400'}`}>
              {isRemote ? <Wifi className="w-4 h-4" /> : <Server className="w-4 h-4" />}
            </span>
            Управлять железом:
          </div>
          <select
            value={targetNode}
            onChange={(e) => setTargetNode(e.target.value)}
            className="flex-1 px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-xs font-semibold focus:border-emerald-500 focus:outline-none"
          >
            <option value="local">🖥️ Этот компьютер (локально)</option>
            {nodes?.filter((n) => n.status?.online).map((n) => (
              <option key={n.id} value={n.id}>🖥️ {n.name} ({n.ip}:{n.port})</option>
            ))}
            {nodes?.filter((n) => !n.status?.online).map((n) => (
              <option key={n.id} value={n.id} disabled>{n.name} — оффлайн</option>
            ))}
          </select>
        </div>
        {isRemote && (
          <p className="mt-2 text-[11px] text-emerald-300 flex items-center gap-1.5">
            <Wifi className="w-3 h-3" /> Управляем удалённым ПК «{selectedNode?.name}» ({selectedNode?.ip}:{selectedNode?.port}). Частоты и вентиляторы применяются на нём через API.
            {!selectedNode?.status?.online && <span className="text-amber-300">Узел может быть недоступен.</span>}
          </p>
        )}
      </div>

      {/* ===================== CPU SECTION ===================== */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-white text-sm flex items-center gap-2">
            <Cpu className="w-4 h-4 text-blue-400" />
            Процессор — частоты и губернаторы
          </h3>
          {cpuInfo?.model && <span className="text-[11px] text-slate-400 font-mono truncate max-w-xs" title={cpuInfo.model}>{cpuInfo.model}</span>}
        </div>

        {!cpuInfo ? (
          <p className="text-xs text-slate-500">Загрузка...</p>
        ) : !cpuInfo.supported ? (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">cpufreq недоступен</span> — sysfs не поддерживается на этом устройстве или ядро не позволяет изменять частоты.
              <p className="text-[10px] text-amber-400/80 mt-1">Это может быть связано с проротом (proot) или отсутствием драйверов cpufreq.</p>
            </div>
          </div>
        ) : (
          <>
            {/* Governor selector + Apply */}
            <div className="flex flex-wrap items-end gap-3 text-xs">
              <div>
                <label className="text-slate-400 mb-1 block">Текущий governor:</label>
                <select
                  value={governor}
                  onChange={(e) => setGovernor(e.target.value)}
                  disabled={!cpuInfo.writable}
                  className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:border-blue-500 focus:outline-none font-mono disabled:opacity-50"
                >
                  {cpuInfo.availableGovernors.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
              <button onClick={applyGovernor} disabled={!cpuInfo.writable}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold cursor-pointer disabled:opacity-40">
                Применить ко всем ядрам
              </button>
            </div>

            {/* Per-core table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                  <tr>
                    <th className="py-2 pr-3">Ядро</th>
                    <th className="py-2 pr-3">Текущая</th>
                    <th className="py-2 pr-3">Макс.</th>
                    <th className="py-2 pr-3">Губернатор</th>
                    <th className="py-2 pr-3">Точная частота (МГц)</th>
                    <th className="py-2">userspace</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {cpuInfo.cpus.map((core) => (
                    <tr key={core.index} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-2 pr-3 font-mono text-slate-300">CPU {core.index}</td>
                      <td className="py-2 pr-3 font-mono text-blue-300">{core.curMhz ? `${core.curMhz} МГц` : '—'}</td>
                      <td className="py-2 pr-3 font-mono text-slate-400">{core.cpuMaxMhz || core.maxMhz || '—'} МГц</td>
                      <td className="py-2 pr-3">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">{core.governor || '—'}</span>
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          type="number"
                          placeholder="МГц"
                          value={freqPerCore[core.index] || ''}
                          onChange={(e) => setFreqPerCore((prev) => ({ ...prev, [core.index]: Number(e.target.value) }))}
                          disabled={!core.hasSetspeed || !cpuInfo.writable}
                          className="w-24 px-2 py-1 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 font-mono focus:border-blue-500 focus:outline-none disabled:opacity-40"
                        />
                      </td>
                      <td className="py-2">
                        <span className={`text-[10px] font-mono ${core.hasSetspeed ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {core.hasSetspeed ? 'Да' : 'Нет'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Apply per-core */}
            <div className="flex flex-wrap gap-3 text-xs pt-2 border-t border-slate-800/60">
              <button onClick={applyPerCoreFreq} disabled={!cpuInfo.writable}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer disabled:opacity-40 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" /> Задать частоты по ядрам
              </button>
              <button onClick={applyGovernor} disabled={!cpuInfo.writable}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold cursor-pointer disabled:opacity-40 flex items-center gap-1.5">
                <Settings2 className="w-3.5 h-3.5" /> Применить governor
              </button>
            </div>

            {/* All-core frequency cap */}
            <div className="mt-3 p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
              <h4 className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5 text-cyan-400" /> Принудительная частота для всех ядер
              </h4>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="text-slate-400 mb-1 block">Частота (МГц):</label>
                  <input type="number" value={allCoreFreq} onChange={(e) => setAllCoreFreq(e.target.value)}
                    placeholder={`текущая → ${(cpuInfo.cpus[0]?.curMhz || 2000)}`}
                    className="w-36 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-200 focus:border-blue-500 focus:outline-none font-mono" />
                </div>
                <button onClick={applyAllCoreFreq}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold cursor-pointer flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5" /> Установить
                </button>
              </div>
              <p className="text-[10px] text-slate-500">Включает governor <code className="text-cyan-300">userspace</code> и задаёт фиксированную частоту. Для кратковременных задач.</p>
            </div>

            {/* Min/Max frequency limits */}
            <div className="mt-3 p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
              <h4 className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Thermometer className="w-3.5 h-3.5 text-amber-400" /> Частотные пределы
              </h4>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="text-slate-400 mb-1 block">Мин. частота (МГц):</label>
                  <input type="number" value={minMhz} onChange={(e) => setMinMhz(e.target.value)}
                    placeholder={`fromJson → ${cpuInfo.cpus[0]?.minMhz || ''}`}
                    className="w-32 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-200 focus:border-blue-500 focus:outline-none font-mono" />
                </div>
                <div>
                  <label className="text-slate-400 mb-1 block">Макс. частота (МГц):</label>
                  <input type="number" value={maxMhz} onChange={(e) => setMaxMhz(e.target.value)}
                    placeholder={`fromJson → ${cpuInfo.cpus[0]?.cpuMaxMhz || cpuInfo.cpus[0]?.maxMhz || ''}`}
                    className="w-32 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-200 focus:border-blue-500 focus:outline-none font-mono" />
                </div>
                <button onClick={applyLimits}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold cursor-pointer flex items-center gap-1.5">
                  <Thermometer className="w-3.5 h-3.5" /> Применить лимиты
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ===================== FAN SECTION ===================== */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-white text-sm flex items-center gap-2">
            <Fan className="w-4 h-4 text-emerald-400" />
            Вентиляторы (Fan Control)
          </h3>
        </div>

        {!fanInfo ? (
          <p className="text-xs text-slate-500">Загрузка...</p>
        ) : fanInfo.fans.length === 0 && !fanInfo.thinkpad.available ? (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Вентиляторы не обнаружены</span> — hwmon интерфейс недоступен или вентиляторы отсутствуют.
              <p className="text-[10px] text-slate-500 mt-1">Для ноутбучных кулеров ThinkPad поддерживается ACPI-интерфейс.</p>
            </div>
          </div>
        ) : (
          <>
            {/* hwmon PWM channels */}
            {fanInfo.fans.filter((f) => f.pwm.length > 0).map((fan) => (
              <div key={fan.hwmon} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Flame className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="font-mono text-sm text-slate-200">{fan.driver}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">{fan.hwmon}</span>
                  </div>
                  {fan.fanInputs.length > 0 && (
                    <span className="text-xs font-mono text-emerald-300">
                      {fan.fanInputs.map((fi) => fi.rpm !== null ? `${fi.label || `fan${fi.channel}`}: ${fi.rpm} RPM` : '').filter(Boolean).join(' · ')}
                    </span>
                  )}
                </div>
                {fan.pwm.map((pwm) => {
                  const key = `${fan.hwmon}:${pwm.channel}`;
                  const current = pwmSettings[key] ?? (pwm.value !== null ? Math.round(pwm.value / 2.55) : 50);
                  const isManual = pwm.enable === 1;
                  const isAuto = pwm.enable === 2;
                  return (
                    <div key={pwm.channel} className="flex items-center gap-4 text-xs">
                      <span className="text-slate-400 w-20">PWM {pwm.channel}:</span>
                      <input
                        type="range"
                        min={0} max={100}
                        value={current}
                        onChange={(e) => setPwmSettings((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                        className="flex-1 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                      />
                      <span className="w-12 text-right font-mono text-slate-300">{current}%</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${isManual ? 'bg-amber-500/15 text-amber-300' : isAuto ? 'bg-blue-500/15 text-blue-300' : 'bg-slate-800 text-slate-400'}`}>
                        {isManual ? 'Manual' : isAuto ? 'Auto' : `en=${pwm.enable}`}
                      </span>
                      <button onClick={() => applyPwm(fan.hwmon, pwm.channel)}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 text-white font-medium cursor-pointer"
                        title="Применить">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setAutoFan(fan.hwmon, pwm.channel)}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium cursor-pointer"
                        title="Авто-режим">
                        <Settings2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Thinkpad fan control */}
            {fanInfo.thinkpad.available && (
              <div className="p-4 rounded-xl bg-slate-950 border border-blue-500/20 space-y-3">
                <div className="flex items-center gap-2">
                  <Thermometer className="w-3.5 h-3.5 text-blue-400" />
                  <span className="font-semibold text-sm text-slate-200">Ноутбучный вентилятор (ThinkPad ACPI)</span>
                  {fanInfo.thinkpad.status && (
                    <pre className="text-[10px] text-slate-400 font-mono max-h-16 overflow-auto whitespace-pre-wrap">{fanInfo.thinkpad.status}</pre>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <button onClick={() => applyThinkpadLevel('auto')}
                    className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold cursor-pointer flex items-center gap-1.5">
                    <Settings2 className="w-3.5 h-3.5" /> Auto
                  </button>
                  <button onClick={() => applyThinkpadLevel('disengaged')}
                    className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold cursor-pointer flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5" /> Disengaged (макс.)
                  </button>
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((lvl) => (
                    <button key={lvl} onClick={() => applyThinkpadLevel(String(lvl))}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold cursor-pointer">
                      {lvl === 0 ? '0 (стоп)' : lvl <= 3 ? `${lvl} (тихо)` : lvl <= 5 ? `${lvl} (средне)` : `${lvl} (макс)`}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500">ThinkPad ACPI: <code className="text-blue-300">/proc/acpi/ibm/fan</code> · level 0 = стоп, 1-3 = тихо, 4-5 = среда, 6-7 = макс., disengaged = без ограничений</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* ===================== SWAP SECTION ===================== */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-white text-sm flex items-center gap-2">
            <MemoryStick className="w-4 h-4 text-violet-400" />
            Swap-память
          </h3>
        </div>

        {!swapInfo ? (
          <p className="text-xs text-slate-500">Загрузка...</p>
        ) : (
          <>
            {/* Current swap summary */}
            <div className="flex flex-wrap gap-4 text-xs">
              <div className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800">
                <p className="text-[10px] text-slate-500 uppercase">Всего swap</p>
                <p className="text-lg font-bold font-mono text-white">{swapInfo.totalMb} MB</p>
              </div>
              <div className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800">
                <p className="text-[10px] text-slate-500 uppercase">Занято</p>
                <p className="text-lg font-bold font-mono text-amber-300">{swapInfo.usedMb} MB</p>
              </div>
              <div className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800">
                <p className="text-[10px] text-slate-500 uppercase">Свободно на корне</p>
                <p className="text-lg font-bold font-mono text-emerald-300">{swapInfo.freeRootMb !== null ? `${swapInfo.freeRootMb} MB` : '—'}</p>
              </div>
            </div>

            {/* Active swaps table */}
            {swapInfo.swaps.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                    <tr>
                      <th className="py-2 pr-3">Файл / Устройство</th>
                      <th className="py-2 pr-3">Тип</th>
                      <th className="py-2 pr-3">Размер</th>
                      <th className="py-2 pr-3">Занято</th>
                      <th className="py-2 pr-3">Приоритет</th>
                      <th className="py-2">Действия</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {swapInfo.swaps.map((sw) => (
                      <tr key={sw.filename} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-2 pr-3 font-mono text-slate-200 truncate max-w-[200px]" title={sw.filename}>{sw.filename}</td>
                        <td className="py-2 pr-3">
                          <span className="px-2 py-0.5 rounded bg-violet-500/15 text-violet-300 font-mono text-[11px]">{sw.type}</span>
                        </td>
                        <td className="py-2 pr-3 font-mono text-slate-300">{sw.sizeMb} MB</td>
                        <td className="py-2 pr-3 font-mono text-amber-300">{sw.usedMb} MB</td>
                        <td className="py-2 pr-3 font-mono text-slate-400">{sw.priority}</td>
                        <td className="py-2">
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => toggleSwap(sw.filename, false)}
                              className="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 cursor-pointer"
                              title="Отключить swapoff">
                              <PowerOff className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => { if (confirm(`Удалить swap ${sw.filename}?`)) removeSwap(sw.filename); }}
                              className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 cursor-pointer"
                              title="Удалить swap-файл">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-slate-500">Активных swap-устройств нет.</p>
            )}

            {/* Create new swap */}
            <div className="mt-3 p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 text-xs">
              <h4 className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5 text-violet-400" /> Создать новый swap
              </h4>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="text-slate-400 mb-1 block">Размер (МБ):</label>
                  <input type="number" value={swapCreateSize} onChange={(e) => setSwapCreateSize(e.target.value)}
                    min={1}
                    className="w-28 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-200 focus:border-blue-500 focus:outline-none font-mono" />
                </div>
                <div>
                  <label className="text-slate-400 mb-1 block">Путь:</label>
                  <input type="text" value={swapCreatePath} onChange={(e) => setSwapCreatePath(e.target.value)}
                    className="w-48 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-200 focus:border-blue-500 focus:outline-none font-mono" />
                </div>
                <label className="flex items-center gap-1.5 cursor-pointer py-2">
                  <input type="checkbox" checked={swapCreatePersist} onChange={(e) => setSwapCreatePersist(e.target.checked)}
                    className="w-3.5 h-3.5 accent-violet-500" />
                  <span className="text-slate-300">Постоянный (/etc/fstab)</span>
                </label>
                <button onClick={createSwap}
                  className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold cursor-pointer flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Создать и активировать
                </button>
              </div>
              <p className="text-[10px] text-slate-500">
                Создаёт swap-файл через fallocate (или dd) → chmod 600 → mkswap → swapon. При "Постоянный" добавляется в <code className="text-violet-300">/etc/fstab</code>.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default HardwareView;
