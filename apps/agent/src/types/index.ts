export interface MachineInfo {
  machineId: string; hostname: string; osName: string; osVersion: string;
  kernelVersion: string; arch: string; cpuLogicalCores: number; cpuPhysicalCores: number;
  cpuBrand: string; totalMemoryMb: number; usedMemoryMb: number; totalDiskMb: number;
  availableDiskMb: number; localIp: string;
}
export interface RegistrationResponse {
  status: string; nodeId: string; sessionToken: string; assignedRegion: string; heartbeatIntervalSecs: number;
}
export interface MetricsTick { cpuPercent: number; usedMemoryMb: number; totalMemoryMb: number; }
