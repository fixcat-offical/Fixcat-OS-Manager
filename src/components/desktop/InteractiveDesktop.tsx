import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal,
  FileText,
  Settings,
  Folder,
  Globe,
  Maximize2,
  Minimize2,
  X,
  Play,
  Pause,
  RotateCw,
  Cpu,
  Activity,
  HardDrive,
} from 'lucide-react';
import { ContainerItem } from '../../types';
import { getOSIcon, WindowsXPIcon, UbuntuIcon } from '../icons/OSIcons';

interface InteractiveDesktopProps {
  container: ContainerItem;
}

export const InteractiveDesktop: React.FC<InteractiveDesktopProps> = ({ container }) => {
  const isWinXP = container.osInfo.type === 'windows-xp';
  const isUbuntu = container.osInfo.type === 'ubuntu';

  // Windows XP state
  const [startMenuOpen, setStartMenuOpen] = useState(false);
  const [activeWindows, setActiveWindows] = useState<string[]>(['terminal', 'notepad']);
  const [focusedWindow, setFocusedWindow] = useState<string>('terminal');

  // Terminal state
  const [termLines, setTermLines] = useState<string[]>(
    isWinXP
      ? [
          'Microsoft Windows XP [Version 5.1.2600]',
          '(C) Copyright 1985-2001 Microsoft Corp.',
          '',
          'C:\\Documents and Settings\\Administrator> systeminfo',
          'OS Name:                   Microsoft Windows XP Professional',
          'OS Version:                5.1.2600 Service Pack 3 Build 2600',
          'Host Name:                 WINXP-VNC',
          'Virtual Memory: Max Size:  2,048 MB',
          'Virtual Memory: In Use:    890 MB',
          '',
          'C:\\Documents and Settings\\Administrator> ',
        ]
      : [
          'ubuntu@ubuntu-desktop:~$ uname -a',
          'Linux ubuntu-desktop 5.15.0-generic #1 SMP x86_64 GNU/Linux',
          'ubuntu@ubuntu-desktop:~$ docker ps --format "table {{.Names}}\\t{{.Status}}"',
          'NAMES                  STATUS',
          '/ubuntu-xfce-desktop   Up 3 days (healthy)',
          '/windows-xp-pro-sp3    Up 24 hours',
          '',
          'ubuntu@ubuntu-desktop:~$ ',
        ]
  );
  const [termInput, setTermInput] = useState('');
  const termBottomRef = useRef<HTMLDivElement>(null);

  // Notepad text
  const [notepadText, setNotepadText] = useState(
    isWinXP
      ? 'Windows XP noVNC Instance\nConfiguration: 2048 MB RAM, 2 vCPUs\nResolution: 1024x768\nStatus: Online & Ready.'
      : '# Ubuntu 22.04 LTS Desktop Session\n# XFCE 4 / noVNC Client connected\n# Host port: 6080'
  );

  // Clock
  const [timeStr, setTimeStr] = useState('');
  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      setTimeStr(
        d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleTermSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!termInput.trim()) return;

    const cmd = termInput.trim();
    const newLines = [...termLines];

    if (isWinXP) {
      newLines.push(`C:\\Documents and Settings\\Administrator> ${cmd}`);
      if (cmd.toLowerCase() === 'help') {
        newLines.push('Available commands: DIR, SYSTEMINFO, VER, CLS, PING, DATE, TIME, EXIT');
      } else if (cmd.toLowerCase() === 'dir') {
        newLines.push(' Directory of C:\\Documents and Settings\\Administrator');
        newLines.push('10.09.2026  12:00    <DIR>          .');
        newLines.push('10.09.2026  12:00    <DIR>          ..');
        newLines.push('10.09.2026  12:00    <DIR>          Desktop');
        newLines.push('10.09.2026  12:00    <DIR>          My Documents');
        newLines.push('10.09.2026  12:00             1,024 config.ini');
        newLines.push('               1 File(s)          1,024 bytes');
        newLines.push('               4 Dir(s)  24,582,914,048 bytes free');
      } else if (cmd.toLowerCase() === 'cls') {
        setTermLines(['C:\\Documents and Settings\\Administrator> ']);
        setTermInput('');
        return;
      } else if (cmd.toLowerCase() === 'ver') {
        newLines.push('Microsoft Windows XP [Version 5.1.2600]');
      } else if (cmd.toLowerCase() === 'systeminfo') {
        newLines.push('OS Name:                   Microsoft Windows XP Professional SP3');
        newLines.push('Memory in use:             890 MB / 2048 MB');
        newLines.push('IP Address:                172.17.0.3 (Forwarded to :8006)');
      } else {
        newLines.push(`'${cmd}' is not recognized as an internal or external command.`);
      }
      newLines.push('C:\\Documents and Settings\\Administrator> ');
    } else {
      newLines.push(`ubuntu@ubuntu-desktop:~$ ${cmd}`);
      if (cmd.toLowerCase() === 'help') {
        newLines.push('Commands: ls, htop, ps, free, uname -a, clear, date, ifconfig');
      } else if (cmd.toLowerCase() === 'ls') {
        newLines.push('Desktop  Documents  Downloads  Music  Pictures  Videos  workspace');
      } else if (cmd.toLowerCase() === 'free -m' || cmd.toLowerCase() === 'free') {
        newLines.push('               total        used        free      shared  buff/cache   available');
        newLines.push('Mem:            4096        1420        2150          12         526        2676');
        newLines.push('Swap:           2048           0        2048');
      } else if (cmd.toLowerCase() === 'clear') {
        setTermLines(['ubuntu@ubuntu-desktop:~$ ']);
        setTermInput('');
        return;
      } else if (cmd.toLowerCase() === 'htop' || cmd.toLowerCase() === 'top') {
        newLines.push('Tasks: 48 total, 1 running, 47 sleeping');
        newLines.push('CPU[||||||                  12.4%]   Tasks: 48');
        newLines.push('Mem[|||||||||||||      1.42G/4.0G]   noVNC daemon : active');
      } else {
        newLines.push(`${cmd}: command executed successfully (PID ${Math.floor(Math.random() * 8000 + 1000)})`);
      }
      newLines.push('ubuntu@ubuntu-desktop:~$ ');
    }

    setTermLines(newLines);
    setTermInput('');
    setTimeout(() => {
      termBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  };

  const toggleWindow = (id: string) => {
    if (activeWindows.includes(id)) {
      setActiveWindows(activeWindows.filter((w) => w !== id));
    } else {
      setActiveWindows([...activeWindows, id]);
      setFocusedWindow(id);
    }
  };

  // -------------------------------------------------------------
  // Windows XP Classic Luna Shell
  // -------------------------------------------------------------
  if (isWinXP) {
    return (
      <div className="relative w-full h-full bg-[#0055EA] overflow-hidden select-none font-sans flex flex-col justify-between">
        {/* Bliss Wallpaper Background Canvas */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#245EDC] via-[#3B82F6] to-[#48BB78] opacity-90 pointer-events-none" />
        <div
          className="absolute inset-0 opacity-40 pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(ellipse at 50% 120%, #48BB78 40%, transparent 80%), radial-gradient(ellipse at 70% 30%, #60A5FA 20%, transparent 60%)',
          }}
        />

        {/* Desktop Icons */}
        <div className="relative z-10 p-4 grid grid-cols-1 gap-4 w-28">
          <div
            onClick={() => toggleWindow('mycomputer')}
            className="flex flex-col items-center text-center p-2 rounded hover:bg-blue-600/30 text-white cursor-pointer group"
          >
            <div className="w-10 h-10 rounded bg-slate-800/80 border border-slate-600 flex items-center justify-center shadow-md">
              <HardDrive className="w-6 h-6 text-cyan-300" />
            </div>
            <span className="text-[11px] mt-1 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] leading-tight">
              My Computer
            </span>
          </div>

          <div
            onClick={() => toggleWindow('terminal')}
            className="flex flex-col items-center text-center p-2 rounded hover:bg-blue-600/30 text-white cursor-pointer group"
          >
            <div className="w-10 h-10 rounded bg-black border border-slate-700 flex items-center justify-center shadow-md">
              <Terminal className="w-6 h-6 text-white" />
            </div>
            <span className="text-[11px] mt-1 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] leading-tight">
              Command Prompt
            </span>
          </div>

          <div
            onClick={() => toggleWindow('notepad')}
            className="flex flex-col items-center text-center p-2 rounded hover:bg-blue-600/30 text-white cursor-pointer group"
          >
            <div className="w-10 h-10 rounded bg-blue-100 border border-blue-300 flex items-center justify-center shadow-md">
              <FileText className="w-6 h-6 text-blue-800" />
            </div>
            <span className="text-[11px] mt-1 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] leading-tight">
              Notepad
            </span>
          </div>
        </div>

        {/* Floating Draggable Windows */}
        <div className="relative z-20 flex-1 p-4 pointer-events-none">
          {/* Windows XP Command Prompt Window */}
          {activeWindows.includes('terminal') && (
            <div
              onClick={() => setFocusedWindow('terminal')}
              className={`absolute top-6 left-32 w-[520px] max-w-[90vw] h-[340px] bg-black rounded-t-lg border-2 shadow-2xl flex flex-col pointer-events-auto transition-all ${
                focusedWindow === 'terminal' ? 'border-[#0A246A] z-30' : 'border-slate-500 z-20'
              }`}
            >
              {/* WinXP Blue Gradient Titlebar */}
              <div className="h-7 bg-gradient-to-r from-[#0055EA] via-[#0A246A] to-[#A6CAF0] px-2 flex items-center justify-between rounded-t-sm select-none">
                <div className="flex items-center space-x-1.5 text-white text-xs font-bold font-sans">
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Command Prompt - Windows XP</span>
                </div>
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => toggleWindow('terminal')}
                    className="w-5 h-5 bg-[#D9383A] hover:bg-[#FF4D4D] text-white font-bold text-xs rounded-sm flex items-center justify-center cursor-pointer shadow-inner"
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* Black Console Area */}
              <div className="flex-1 p-2.5 font-mono text-xs text-white bg-black overflow-y-auto space-y-0.5">
                {termLines.map((line, idx) => (
                  <div key={idx} className="whitespace-pre-wrap leading-tight">{line}</div>
                ))}
                <form onSubmit={handleTermSubmit} className="flex items-center">
                  <span className="text-white shrink-0">{'C:\\> '}</span>
                  <input
                    type="text"
                    value={termInput}
                    onChange={(e) => setTermInput(e.target.value)}
                    className="flex-1 bg-transparent text-white font-mono text-xs outline-none ml-1"
                    autoFocus
                  />
                </form>
                <div ref={termBottomRef} />
              </div>
            </div>
          )}

          {/* Windows XP Notepad Window */}
          {activeWindows.includes('notepad') && (
            <div
              onClick={() => setFocusedWindow('notepad')}
              className={`absolute top-20 left-72 w-[440px] max-w-[85vw] h-[260px] bg-white rounded-t-lg border-2 shadow-2xl flex flex-col pointer-events-auto transition-all ${
                focusedWindow === 'notepad' ? 'border-[#0A246A] z-30' : 'border-slate-500 z-20'
              }`}
            >
              {/* Titlebar */}
              <div className="h-7 bg-gradient-to-r from-[#0055EA] via-[#0A246A] to-[#A6CAF0] px-2 flex items-center justify-between rounded-t-sm select-none">
                <div className="flex items-center space-x-1.5 text-white text-xs font-bold font-sans">
                  <FileText className="w-3.5 h-3.5" />
                  <span>Untitled - Notepad</span>
                </div>
                <button
                  onClick={() => toggleWindow('notepad')}
                  className="w-5 h-5 bg-[#D9383A] hover:bg-[#FF4D4D] text-white font-bold text-xs rounded-sm flex items-center justify-center cursor-pointer shadow-inner"
                >
                  ×
                </button>
              </div>

              <div className="bg-[#ECE9D8] px-2 py-0.5 text-[11px] text-slate-800 border-b border-slate-300 flex space-x-3">
                <span>File</span>
                <span>Edit</span>
                <span>Format</span>
                <span>View</span>
                <span>Help</span>
              </div>

              <textarea
                value={notepadText}
                onChange={(e) => setNotepadText(e.target.value)}
                className="flex-1 p-2 font-mono text-xs text-slate-900 resize-none outline-none"
              />
            </div>
          )}
        </div>

        {/* Start Menu Pop-up */}
        {startMenuOpen && (
          <div className="absolute bottom-9 left-0 w-80 bg-white border-2 border-[#0A246A] shadow-2xl rounded-t-lg z-50 overflow-hidden font-sans text-xs select-none">
            <div className="h-12 bg-gradient-to-r from-[#0055EA] to-[#3B82F6] px-3 flex items-center space-x-3 text-white">
              <div className="w-8 h-8 rounded-full bg-blue-300 border-2 border-white flex items-center justify-center">
                <WindowsXPIcon className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-sm">Administrator</div>
                <div className="text-[10px] text-blue-100">Windows XP Professional</div>
              </div>
            </div>

            <div className="p-2 space-y-1">
              <button
                onClick={() => {
                  toggleWindow('terminal');
                  setStartMenuOpen(false);
                }}
                className="w-full flex items-center space-x-2.5 p-2 rounded hover:bg-blue-100 text-left cursor-pointer"
              >
                <Terminal className="w-4 h-4 text-slate-800" />
                <span className="font-bold text-slate-800">Command Prompt</span>
              </button>
              <button
                onClick={() => {
                  toggleWindow('notepad');
                  setStartMenuOpen(false);
                }}
                className="w-full flex items-center space-x-2.5 p-2 rounded hover:bg-blue-100 text-left cursor-pointer"
              >
                <FileText className="w-4 h-4 text-blue-600" />
                <span className="text-slate-800">Notepad</span>
              </button>
            </div>

            <div className="bg-[#D3E5FA] p-2 border-t border-[#B5D3F8] flex items-center justify-between text-slate-700">
              <span>noVNC Port: :8006</span>
              <span className="font-semibold text-blue-700">SP3 x86</span>
            </div>
          </div>
        )}

        {/* Windows XP Classic Taskbar */}
        <div className="relative z-40 h-9 bg-gradient-to-r from-[#1F4BB5] via-[#245EDC] to-[#1F4BB5] border-t border-[#3B82F6] px-1 flex items-center justify-between select-none">
          {/* Green Start Button */}
          <button
            onClick={() => setStartMenuOpen(!startMenuOpen)}
            className="h-7 px-3.5 rounded-r-xl bg-gradient-to-r from-[#3C8D0D] via-[#48BB78] to-[#2E700B] hover:brightness-110 text-white font-bold italic text-xs shadow-md border-r-2 border-emerald-300 flex items-center space-x-1.5 cursor-pointer"
          >
            <WindowsXPIcon className="w-4 h-4" />
            <span className="tracking-wide">start</span>
          </button>

          {/* Running Taskbar Tabs */}
          <div className="flex-1 flex items-center space-x-1 px-2">
            {activeWindows.map((win) => (
              <button
                key={win}
                onClick={() => setFocusedWindow(win)}
                className={`h-6 px-3 rounded text-xs font-medium flex items-center space-x-1.5 text-white cursor-pointer shadow-inner ${
                  focusedWindow === win ? 'bg-[#193C9B] border border-blue-400' : 'bg-[#2956C6] hover:bg-[#3264E2]'
                }`}
              >
                {win === 'terminal' ? <Terminal className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                <span className="truncate max-w-[120px]">
                  {win === 'terminal' ? 'Command Prompt' : 'Notepad'}
                </span>
              </button>
            ))}
          </div>

          {/* System Tray Clock */}
          <div className="h-7 px-3 rounded bg-[#0E80DE] border-l border-blue-300/40 flex items-center space-x-2 text-white text-[11px] font-mono">
            <span>{timeStr}</span>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // Ubuntu 22.04 LTS XFCE / LXDE Desktop Shell
  // -------------------------------------------------------------
  return (
    <div className="relative w-full h-full bg-[#2C001E] overflow-hidden select-none font-sans flex flex-col justify-between">
      {/* Ubuntu Aubergine gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#77216F] via-[#5E2750] to-[#2C001E] opacity-95 pointer-events-none" />
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle at 80% 20%, #E95420 15%, transparent 60%)',
        }}
      />

      {/* Top XFCE Panel */}
      <div className="relative z-40 h-7 bg-slate-950/90 border-b border-slate-800 px-3 flex items-center justify-between text-xs text-slate-200 backdrop-blur-md">
        <div className="flex items-center space-x-3">
          {/* Applications Menu */}
          <button
            onClick={() => toggleWindow('terminal')}
            className="flex items-center space-x-1.5 px-2 py-0.5 rounded hover:bg-slate-800 text-slate-200 cursor-pointer"
          >
            <UbuntuIcon className="w-4 h-4" />
            <span className="font-semibold text-xs text-white">Applications</span>
          </button>

          <div className="h-3 w-[1px] bg-slate-700" />

          {/* Window Buttons */}
          <div className="flex items-center space-x-1">
            {activeWindows.map((win) => (
              <button
                key={win}
                onClick={() => setFocusedWindow(win)}
                className={`px-2 py-0.5 rounded text-[11px] flex items-center space-x-1 cursor-pointer ${
                  focusedWindow === win ? 'bg-orange-600/30 text-orange-300 border border-orange-500/40' : 'text-slate-400 hover:text-white'
                }`}
              >
                {win === 'terminal' ? <Terminal className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                <span>{win === 'terminal' ? 'Terminal' : 'Editor'}</span>
              </button>
            ))}
          </div>
        </div>

        {/* System Indicators */}
        <div className="flex items-center space-x-3 font-mono text-[11px] text-slate-300">
          <div className="flex items-center space-x-1 text-orange-400">
            <Cpu className="w-3 h-3" />
            <span>{container.stats?.cpuPercent || 12.4}%</span>
          </div>
          <div className="flex items-center space-x-1 text-cyan-400">
            <Activity className="w-3 h-3" />
            <span>{Math.round((container.stats?.memoryUsage || 0) / (1024 * 1024))} MB</span>
          </div>
          <span>{timeStr}</span>
        </div>
      </div>

      {/* Desktop Workspace */}
      <div className="relative z-20 flex-1 p-4">
        {/* Desktop Icons */}
        <div className="grid grid-cols-1 gap-4 w-24">
          <div
            onClick={() => toggleWindow('terminal')}
            className="flex flex-col items-center text-center p-2 rounded hover:bg-white/10 text-white cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
              <Terminal className="w-5 h-5 text-orange-400" />
            </div>
            <span className="text-[11px] mt-1 text-slate-200">Terminal</span>
          </div>

          <div
            onClick={() => toggleWindow('notepad')}
            className="flex flex-col items-center text-center p-2 rounded hover:bg-white/10 text-white cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
              <FileText className="w-5 h-5 text-cyan-400" />
            </div>
            <span className="text-[11px] mt-1 text-slate-200">Editor</span>
          </div>
        </div>

        {/* Ubuntu Floating Terminal Window */}
        {activeWindows.includes('terminal') && (
          <div
            onClick={() => setFocusedWindow('terminal')}
            className={`absolute top-10 left-32 w-[540px] max-w-[90vw] h-[340px] bg-slate-950/95 rounded-xl border border-slate-800 shadow-2xl flex flex-col backdrop-blur-md transition-all ${
              focusedWindow === 'terminal' ? 'border-orange-500/50 z-30 shadow-orange-500/10' : 'border-slate-800 z-20'
            }`}
          >
            {/* Titlebar */}
            <div className="h-7 bg-slate-900 px-3 flex items-center justify-between rounded-t-xl border-b border-slate-800">
              <div className="flex items-center space-x-2 text-slate-200 text-xs font-mono font-semibold">
                <Terminal className="w-3.5 h-3.5 text-orange-400" />
                <span>ubuntu@ubuntu-desktop: ~ (XFCE Terminal)</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <button
                  onClick={() => toggleWindow('terminal')}
                  className="w-3 h-3 rounded-full bg-rose-500 hover:bg-rose-400 cursor-pointer"
                />
              </div>
            </div>

            {/* Terminal Body */}
            <div className="flex-1 p-3 font-mono text-xs text-slate-200 bg-slate-950 overflow-y-auto space-y-1">
              {termLines.map((line, idx) => (
                <div key={idx} className="whitespace-pre-wrap leading-relaxed">{line}</div>
              ))}
              <form onSubmit={handleTermSubmit} className="flex items-center text-orange-400">
                <span className="shrink-0 text-emerald-400">ubuntu@ubuntu-desktop:~$ </span>
                <input
                  type="text"
                  value={termInput}
                  onChange={(e) => setTermInput(e.target.value)}
                  className="flex-1 bg-transparent text-slate-200 font-mono text-xs outline-none ml-1.5"
                  autoFocus
                />
              </form>
              <div ref={termBottomRef} />
            </div>
          </div>
        )}
      </div>

      {/* Bottom Status bar */}
      <div className="relative z-30 h-6 bg-slate-950/80 px-3 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/80 font-mono">
        <span>noVNC: http://localhost:{container.osInfo.noVncPort || 6080}/</span>
        <span className="text-emerald-400">Connected (60 FPS, Low Latency)</span>
      </div>
    </div>
  );
};
