import React, { useState, useEffect } from 'react';
import {
  Bot,
  Play,
  Square,
  Download,
  Loader2,
  Send,
  Server,
  Copy,
  Check,
  CheckCircle2,
  Terminal,
  Cpu,
  RefreshCw,
  MessageSquare,
  Globe,
  Plus,
  Zap,
  HardDrive,
  Sparkles,
} from 'lucide-react';
import { OnDeviceAiModel } from '../types';

interface OnDeviceAiViewProps {
  hostIp: string;
}

interface ServerStatusResponse {
  isRunning: boolean;
  port: number;
  activeProvider: string;
  lmsCliInstalled: boolean;
  loadedModels: string[];
  activeLoadedModelId?: string;
  activeLoadedModelName?: string;
  hostEndpoint: string;
}

export const OnDeviceAiView: React.FC<OnDeviceAiViewProps> = ({ hostIp }) => {
  const [status, setStatus] = useState<ServerStatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState<boolean>(true);
  const [isStartingServer, setIsStartingServer] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'catalog' | 'chat' | 'server'>('catalog');
  const [models, setModels] = useState<OnDeviceAiModel[]>([]);

  // Search / Add Custom HuggingFace Model
  const [customModelId, setCustomModelId] = useState('');
  const [isAddingCustom, setIsAddingCustom] = useState(false);

  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [loadingModelId, setLoadingModelId] = useState<string | null>(null);
  const [copiedEndpoint, setCopiedEndpoint] = useState<boolean>(false);

  // Chat State
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string; time: string; modelName?: string }>>([
    {
      role: 'assistant',
      text: 'Привет! Я твоя локальная нейросеть . Все диалоги обрабатываются локально без интернет-запросов.',
      time: 'Только что',
      modelName: ' Engine',
    },
  ]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Fetch models catalog & active status from backend
  const fetchModelsAndStatus = async () => {
    setLoadingStatus(true);
    try {
      // 1. Fetch Status
      const statusRes = await fetch('/api/on-device-ai/status');
      let statusData: ServerStatusResponse | null = null;
      if (statusRes.ok) {
        statusData = await statusRes.json();
        setStatus(statusData);
      }

      // 2. Fetch Models
      const modelsRes = await fetch('/api/on-device-ai/models');
      if (modelsRes.ok) {
        const modelsData = await modelsRes.json();
        if (Array.isArray(modelsData.models)) {
          setModels(modelsData.models);
        }
      }
    } catch {
      // Fetch error
    } font: {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    fetchModelsAndStatus();
  }, []);

  // Active running model from models array or status
  const activeRunningModel = models.find((m) => m.isRunning) || null;

  // Handle Download Model
  const handleDownloadModel = async (id: string) => {
    setDownloadingId(id);
    setStatusMessage(`Скачивание модели ${id} через lms / Hugging Face...`);
    try {
      const res = await fetch('/api/on-device-ai/models/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: id }),
      });
      if (res.ok) {
        const data = await res.json();
        setStatusMessage(data.message || `Модель ${id} успешно скачана!`);
        await fetchModelsAndStatus();
      }
    } catch {
      setStatusMessage('Ошибка при закачке модели.');
    } finally {
      setDownloadingId(null);
    }
  };

  // Handle Run / Load Model in VRAM
  const handleRunModel = async (id: string) => {
    setLoadingModelId(id);
    setStatusMessage(`Загрузка модели ${id} в видеопамять VRAM (lms load)...`);
    try {
      const res = await fetch('/api/on-device-ai/models/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: id }),
      });
      if (res.ok) {
        const data = await res.json();
        setStatusMessage(data.message || `Модель ${id} успешно запущен в VRAM!`);
        await fetchModelsAndStatus();
      }
    } catch {
      setStatusMessage('Ошибка при запуске модели в VRAM.');
    } finally {
      setLoadingModelId(null);
    }
  };

  // Handle Stop / Unload Model
  const handleStopModel = async (id?: string) => {
    setStatusMessage('Выгрузка модели из памяти VRAM...');
    try {
      const res = await fetch('/api/on-device-ai/models/unload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: id }),
      });
      if (res.ok) {
        const data = await res.json();
        setStatusMessage(data.message || 'Модель успешно выгружена из VRAM.');
        await fetchModelsAndStatus();
      }
    } catch {
      setStatusMessage('Ошибка выгрузки модели.');
    }
  };

  // Handle Add Custom HuggingFace Model
  const handleAddCustomModel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customModelId.trim()) return;

    setIsAddingCustom(true);
    const targetId = customModelId.trim();
    setStatusMessage(`Добавление модели с Hugging Face: ${targetId}...`);

    try {
      const res = await fetch('/api/on-device-ai/models/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: targetId }),
      });

      if (res.ok) {
        setCustomModelId('');
        setStatusMessage(`Модель ${targetId} успешно добавлена и скачана!`);
        await fetchModelsAndStatus();
      }
    } catch {
      setStatusMessage('Ошибка добавления пользовательской модели.');
    } finally {
      setIsAddingCustom(false);
    }
  };

  // Handle Start  Server
  const handleStartServer = async () => {
    setIsStartingServer(true);
    setStatusMessage('Запуск сервера  lms на порту 1234...');
    try {
      const res = await fetch('/api/on-device-ai/server/start', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setStatusMessage(data.message || 'Сервер запущен!');
        await fetchModelsAndStatus();
      }
    } catch {
      setStatusMessage('Запрос отправлен.');
    } finally {
      setIsStartingServer(false);
    }
  };

  // Send Chat Message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputPrompt.trim() || isGenerating) return;

    const userText = inputPrompt;
    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const newMessages = [...chatMessages, { role: 'user' as const, text: userText, time: nowStr }];
    setChatMessages(newMessages);
    setInputPrompt('');
    setIsGenerating(true);

    try {
      const res = await fetch('/api/on-device-ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: activeRunningModel ? activeRunningModel.id : 'local-model',
          messages: newMessages.map((m) => ({ role: m.role, content: m.text })),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setChatMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: data.reply || 'Ответ сгенерирован!',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            modelName: activeRunningModel ? activeRunningModel.name : ' Local Model',
          },
        ]);
      }
    } catch (err: any) {
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: `⚠️ Ошибка: ${err.message}`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  const localApiEndpoint = status?.hostEndpoint || `http://${hostIp || 'localhost'}:1234/v1`;

  const copyEndpointToClipboard = () => {
    navigator.clipboard.writeText(localApiEndpoint);
    setCopiedEndpoint(true);
    setTimeout(() => setCopiedEndpoint(false), 2000);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* PROMINENT ACTIVE MODEL VRAM BANNER */}
      {activeRunningModel ? (
        <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-r from-emerald-950 via-slate-900 to-teal-950 border-2 border-emerald-500/60 shadow-2xl shadow-emerald-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
              <Zap className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="inline-flex items-center space-x-2 px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold uppercase tracking-wider">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>Запущена в VRAM (АКТИВНА)</span>
              </div>
              <h2 className="text-lg sm:text-xl font-extrabold text-white mt-1">
                {activeRunningModel.name}
              </h2>
              <p className="text-xs text-slate-300 font-mono mt-0.5">
                ID: {activeRunningModel.id} | {activeRunningModel.quantization} | VRAM: {activeRunningModel.ramRequiredMb} MB
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3 shrink-0">
            <button
              onClick={() => setActiveTab('chat')}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-lg shadow-emerald-600/30 flex items-center gap-2 cursor-pointer"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Открыть Чат с нейросетью</span>
            </button>

            <button
              onClick={() => handleStopModel(activeRunningModel.id)}
              className="px-4 py-2.5 rounded-xl bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-500/40 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer"
            >
              <Square className="w-4 h-4 text-rose-400" />
              <span>Выгрузить из VRAM</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center space-x-3">
            <Bot className="w-5 h-5 text-slate-500" />
            <span>В VRAM сейчас нет запущенных моделей. Выберите модель ниже и нажмите <b>«Запустить в »</b>.</span>
          </div>
          <span className="px-2.5 py-1 rounded bg-slate-800 font-mono text-[11px]">Статус: Ожидание</span>
        </div>
      )}

      {/* Hero Banner & Server Controller */}
      <div className="p-6 sm:p-8 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-semibold">
              <Bot className="w-4 h-4 text-blue-400" />
              <span>Менеджер локальных нейросетей  &amp; Hugging Face</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Локальный ИИ ( Control)
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Скачивайте любые GGUF модели с Hugging Face, запускайте их в памяти VRAM и управляйте через единую веб-панель Fixcat OS Manager.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {!status?.isRunning ? (
              <button
                onClick={handleStartServer}
                disabled={isStartingServer}
                className="px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-xl shadow-blue-600/25 transition-all cursor-pointer flex items-center gap-2"
              >
                {isStartingServer ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-amber-300 text-amber-300" />}
                <span>Запустить  Server</span>
              </button>
            ) : (
              <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 flex items-center space-x-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <div>
                  <div className="text-xs font-bold text-emerald-300">Сервер  Активен</div>
                  <div className="text-[11px] font-mono text-emerald-400/80">{localApiEndpoint}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Status Toast */}
        {statusMessage && (
          <div className="mt-4 p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-cyan-300 font-mono flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 space-x-2 text-xs font-medium">
        <button
          onClick={() => setActiveTab('catalog')}
          className={`pb-3 px-4 flex items-center space-x-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'catalog'
              ? 'border-blue-500 text-blue-400 font-bold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Cpu className="w-4 h-4" />
          <span>Каталог нейросетей ({models.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('chat')}
          className={`pb-3 px-4 flex items-center space-x-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'chat'
              ? 'border-blue-500 text-blue-400 font-bold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>Встроенный Web-Чат</span>
          {activeRunningModel && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('server')}
          className={`pb-3 px-4 flex items-center space-x-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'server'
              ? 'border-blue-500 text-blue-400 font-bold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Server className="w-4 h-4" />
          <span>API Адрес для внешних ПК</span>
        </button>
      </div>

      {/* TAB 1: CATALOG & ADD CUSTOM MODEL */}
      {activeTab === 'catalog' && (
        <div className="space-y-6">
          {/* Custom Model Installer Input */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
            <div className="flex items-center space-x-2">
              <Plus className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-bold text-white">
                Скачивание любой нейросети с Hugging Face
              </h3>
            </div>
            <p className="text-xs text-slate-400">
              Вставьте идентификатор модели с Hugging Face (например: <code>lmstudio-community/Meta-Llama-3.2-3B-Instruct-GGUF</code> или <code>TheBloke/Llama-2-7B-GGUF</code>):
            </p>

            <form onSubmit={handleAddCustomModel} className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={customModelId}
                onChange={(e) => setCustomModelId(e.target.value)}
                placeholder="lmstudio-community/Meta-Llama-3.2-3B-Instruct-GGUF..."
                className="flex-1 px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none font-mono"
              />
              <button
                type="submit"
                disabled={isAddingCustom || !customModelId.trim()}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                {isAddingCustom ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                <span>Скачать и добавить</span>
              </button>
            </form>
          </div>

          {/* Model Cards Grid */}
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Все доступные модели
            </h2>
            <button
              onClick={fetchModelsAndStatus}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1 font-mono cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? 'animate-spin text-blue-400' : ''}`} />
              <span>Обновить</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {models.map((m) => {
              const isDownloadingThis = downloadingId === m.id;
              const isLoadingThis = loadingModelId === m.id;

              return (
                <div
                  key={m.id}
                  className={`p-5 rounded-2xl bg-slate-900 border transition-all flex flex-col justify-between space-y-4 ${
                    m.isRunning
                      ? 'border-emerald-500 ring-2 ring-emerald-500/30 bg-emerald-950/20 shadow-xl'
                      : m.isDownloaded
                      ? 'border-slate-700 bg-slate-900'
                      : 'border-slate-800/80 bg-slate-900/60'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20">
                          {m.provider}
                        </span>
                        <h3 className="font-bold text-white text-base mt-1">{m.name}</h3>
                      </div>

                      {m.isRunning ? (
                        <span className="text-[10px] font-bold text-emerald-300 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center gap-1 shrink-0 animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          АКТИВНА В VRAM
                        </span>
                      ) : m.isDownloaded ? (
                        <span className="text-[10px] font-bold text-blue-300 px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 flex items-center gap-1 shrink-0">
                          <HardDrive className="w-3 h-3 text-blue-400" />
                          СКАЧАНО
                        </span>
                      ) : null}
                    </div>

                    <p className="text-xs text-slate-400 leading-relaxed">{m.description}</p>

                    <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-300 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                      <div>
                        <span className="text-slate-500 block">Размер:</span>
                        <span>{m.sizeGb} GB</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">VRAM RAM:</span>
                        <span>{m.ramRequiredMb} MB</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Формат:</span>
                        <span>{m.quantization}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Контекст:</span>
                        <span>{m.contextWindow?.toLocaleString()} тк.</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-2 border-t border-slate-800">
                    {isDownloadingThis ? (
                      <div className="flex items-center justify-center p-2.5 rounded-xl bg-blue-500/10 text-blue-300 text-xs font-semibold gap-2 border border-blue-500/20">
                        <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                        <span>Закачка с Hugging Face...</span>
                      </div>
                    ) : isLoadingThis ? (
                      <div className="flex items-center justify-center p-2.5 rounded-xl bg-emerald-500/10 text-emerald-300 text-xs font-semibold gap-2 border border-emerald-500/20">
                        <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                        <span>Загрузка в память VRAM...</span>
                      </div>
                    ) : !m.isDownloaded ? (
                      <button
                        onClick={() => handleDownloadModel(m.id)}
                        className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center space-x-2 border border-slate-700"
                      >
                        <Download className="w-4 h-4 text-blue-400" />
                        <span>Скачать на диск ({m.sizeGb} GB)</span>
                      </button>
                    ) : m.isRunning ? (
                      <button
                        onClick={() => handleStopModel(m.id)}
                        className="w-full py-2.5 px-4 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-500/40 text-rose-300 text-xs font-bold transition-colors cursor-pointer flex items-center justify-center space-x-2"
                      >
                        <Square className="w-4 h-4 text-rose-400" />
                        <span>Выгрузить из VRAM (Остановить)</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleRunModel(m.id)}
                        className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/20 transition-all cursor-pointer flex items-center justify-center space-x-2"
                      >
                        <Play className="w-4 h-4 fill-white" />
                        <span>Запустить в  (VRAM)</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: BUILT-IN CHAT */}
      {activeTab === 'chat' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden flex flex-col h-[600px] shadow-2xl">
          <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-white text-sm">
                  {activeRunningModel ? activeRunningModel.name : ' Local Engine'}
                </h3>
                <p className="text-[11px] text-slate-400 font-mono">
                  {activeRunningModel ? `Активна: ${activeRunningModel.id}` : 'Запустите модель в каталоге'}
                </p>
              </div>
            </div>
            <span className="text-[10px] px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-mono">
              OpenAI Proxy (1234)
            </span>
          </div>

          <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-4 bg-slate-950/40">
            {chatMessages.map((msg, idx) => {
              const isUser = msg.role === 'user';
              return (
                <div key={idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] sm:max-w-[75%] p-4 rounded-2xl text-xs sm:text-sm leading-relaxed space-y-1 ${
                      isUser
                        ? 'bg-blue-600 text-white rounded-br-none'
                        : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-none'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{msg.text}</div>
                    <div className={`text-[10px] font-mono text-right ${isUser ? 'text-blue-200' : 'text-slate-500'}`}>
                      {msg.time} {msg.modelName ? `| ${msg.modelName}` : ''}
                    </div>
                  </div>
                </div>
              );
            })}

            {isGenerating && (
              <div className="flex justify-start">
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-blue-400 flex items-center space-x-2">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                  <span>Обработка вызова локальной нейросетью...</span>
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleSendMessage} className="p-4 bg-slate-950 border-t border-slate-800 flex items-center space-x-3">
            <input
              type="text"
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              placeholder="Задайте вопрос локальной нейросети..."
              className="flex-1 px-4 py-3 bg-slate-900 border border-slate-800 rounded-2xl text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={isGenerating || !inputPrompt.trim()}
              className="px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>Отправить</span>
            </button>
          </form>
        </div>
      )}

      {/* TAB 3: SERVER ENDPOINT */}
      {activeTab === 'server' && (
        <div className="p-6 sm:p-8 rounded-3xl bg-slate-900 border border-slate-800 space-y-6">
          <div className="flex items-center space-x-3">
            <Globe className="w-6 h-6 text-cyan-400" />
            <div>
              <h3 className="text-base font-bold text-white">Адрес для внешней интеграции</h3>
              <p className="text-xs text-slate-400">
                Используйте этот OpenAI-совместимый эндпоинт для подключения из других программ (VS Code, Python, LangChain).
              </p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 font-mono text-xs">
            <div className="flex justify-between text-slate-400">
              <span>OpenAI Base URL:</span>
              <button onClick={copyEndpointToClipboard} className="text-blue-400 hover:text-blue-300 font-semibold cursor-pointer">
                {copiedEndpoint ? 'Скопировано!' : 'Скопировать'}
              </button>
            </div>
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-emerald-400 font-bold select-all">
              {localApiEndpoint}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
