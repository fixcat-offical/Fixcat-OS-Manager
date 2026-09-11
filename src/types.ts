export interface OSInfo {
  type: string; // 'ubuntu' | 'windows-xp' | 'windows' | 'debian' | 'alpine' | 'arch' | 'kali' | 'fedora' | 'linux';
  displayName: string;
  distro: string;
  version: string;
  icon: string;
  desktopEnv: string;
  noVncPort: number | null;
  vncPath: string;
  vncUrl: string | null;
  resolution: string;
  description: string;
}

export interface ContainerStats {
  cpuPercent: number;
  memoryUsage: number; // in bytes
  memoryLimit: number; // in bytes
  memoryPercent: number;
  networkRx: number; // in bytes
  networkTx: number; // in bytes
  blockRead: number;
  blockWrite: number;
  pids: number;
}

export interface PortMapping {
  IP?: string;
  PrivatePort: number;
  PublicPort?: number;
  Type: string;
}

export interface ContainerItem {
  Id: string;
  Names: string[];
  Image: string;
  ImageID: string;
  Command: string;
  Created: number;
  State: 'running' | 'paused' | 'exited' | 'restarting' | 'dead' | string;
  Status: string;
  Ports: PortMapping[];
  Labels: Record<string, string>;
  osInfo: OSInfo;
  stats: ContainerStats;
  isRealDocker?: boolean;
  env?: string[];
  mounts?: any[];
}

export interface GpuInfo {
  id: number;
  name: string;
  usagePercent: number;
  vramUsedMb: number;
  vramTotalMb: number;
  vramPercent: number;
  temperatureC: number;
  powerWatts: number;
  driverVersion?: string;
}

export interface SystemInfo {
  hostname: string;
  platform: string;
  arch: string;
  release: string;
  uptime: number;
  cpus: {
    count: number;
    model: string;
    speed: number;
  };
  memory: {
    total: number;
    free: number;
    used: number;
    percent: number;
  };
  gpus?: GpuInfo[];
  loadAvg: number[];
  docker: {
    socketPath: string;
    socketAvailable: boolean;
    tcpHost: string;
    mode: 'connected' | 'emulated';
  };
  config: {
    hostIp: string;
    dockerSocketPath: string;
    dockerTcpHost: string;
    refreshInterval: number;
    autoDetectNoVnc: boolean;
  };
}

export interface MetricHistoryPoint {
  timestamp: string;
  time: string;
  hostCpu: number;
  hostRam: number;
  gpuUsage?: number[];
  containers: Record<string, { cpu: number; ramMb: number }>;
}

export interface OnDeviceAiModel {
  id: string;
  name: string;
  provider: string;
  sizeGb: number;
  ramRequiredMb: number;
  quantization: string;
  description: string;
  isDownloaded: boolean;
  downloadProgress: number; // 0-100
  isRunning: boolean;
  contextWindow: number;
  endpointUrl: string;
}

export interface AuthStatus {
  isRegistered: boolean;
  isAuthenticated: boolean;
  username?: string;
}
