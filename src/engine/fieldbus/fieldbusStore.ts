import { create } from 'zustand'
import {
  createDefaultDI,
  createDefaultDO,
  createDefaultVR,
  type DigitalBank,
  type DigitalSignalIndex,
  type VisionBank,
  type VisionOffset,
  type VisionRegisterIndex,
} from './types'

export interface FieldbusLogEntry {
  id: number
  timestamp: string
  channel: string
  value: string
  source: 'ROBOT' | 'PLC_SIM' | 'MANUAL' | 'VISION' | 'FAULT'
}

export interface VirtualFieldbusState {
  di: DigitalBank
  do: DigitalBank
  vr: VisionBank
  /** When true, simulated cell/PLC auto-responds to robot outputs (gripper reeds, CNC door/chuck) */
  autoPlcHandshake: boolean
  /** Fault injection flags that override normal fieldbus handshakes */
  faultSuppressGripperClosedReed: boolean
  faultCncDoorStuckClosed: boolean
  scanCycleCount: number
  lastUpdatedMs: number
  eventLog: FieldbusLogEntry[]

  // Actions
  setDI: (index: DigitalSignalIndex, value: boolean, source?: FieldbusLogEntry['source']) => void
  toggleDI: (index: DigitalSignalIndex) => void
  setDO: (index: DigitalSignalIndex, value: boolean, source?: FieldbusLogEntry['source']) => void
  setVR: (index: VisionRegisterIndex, offset: VisionOffset) => void
  setAutoPlcHandshake: (enabled: boolean) => void
  setFaultSuppressGripperClosedReed: (active: boolean) => void
  setFaultCncDoorStuckClosed: (active: boolean) => void
  incrementScan: () => void
  resetFieldbus: (overrides?: { di?: Partial<DigitalBank>; do?: Partial<DigitalBank> }) => void
}

let nextLogId = 1

function formatTime(): string {
  const d = new Date()
  return `${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(Math.floor(d.getMilliseconds() / 10)).padStart(2, '0')}`
}

function appendLog(
  log: FieldbusLogEntry[],
  channel: string,
  value: string,
  source: FieldbusLogEntry['source'],
): FieldbusLogEntry[] {
  const entry: FieldbusLogEntry = {
    id: nextLogId++,
    timestamp: formatTime(),
    channel,
    value,
    source,
  }
  const next = [entry, ...log]
  return next.length > 40 ? next.slice(0, 40) : next
}

export const useFieldbusStore = create<VirtualFieldbusState>((set, get) => ({
  di: createDefaultDI(),
  do: createDefaultDO(),
  vr: createDefaultVR(),
  autoPlcHandshake: true,
  faultSuppressGripperClosedReed: false,
  faultCncDoorStuckClosed: false,
  scanCycleCount: 0,
  lastUpdatedMs: Date.now(),
  eventLog: [],

  setDI: (index, value, source = 'PLC_SIM') => {
    const current = get().di[index]
    if (current === value) return
    set((state) => ({
      di: { ...state.di, [index]: value },
      lastUpdatedMs: Date.now(),
      eventLog:
        index === 16
          ? state.eventLog
          : appendLog(state.eventLog, `DI[${index}]`, value ? 'ON' : 'OFF', source),
    }))
  },

  toggleDI: (index) => {
    const nextVal = !get().di[index]
    get().setDI(index, nextVal, 'MANUAL')
  },

  setDO: (index, value, source = 'ROBOT') => {
    const current = get().do[index]
    if (current === value) return
    set((state) => ({
      do: { ...state.do, [index]: value },
      lastUpdatedMs: Date.now(),
      eventLog:
        index === 16
          ? state.eventLog
          : appendLog(state.eventLog, `DO[${index}]`, value ? 'ON' : 'OFF', source),
    }))
  },

  setVR: (index, offset) => {
    set((state) => ({
      vr: { ...state.vr, [index]: offset },
      lastUpdatedMs: Date.now(),
      eventLog: appendLog(
        state.eventLog,
        `VR[${index}]`,
        `ΔX:${offset.x.toFixed(1)} ΔY:${offset.y.toFixed(1)} ΔRz:${offset.rz.toFixed(1)}°`,
        'VISION',
      ),
    }))
  },

  setAutoPlcHandshake: (enabled) => set({ autoPlcHandshake: enabled }),

  setFaultSuppressGripperClosedReed: (active) =>
    set((state) => ({
      faultSuppressGripperClosedReed: active,
      di: active ? { ...state.di, 4: false } : state.di,
      eventLog: appendLog(
        state.eventLog,
        'FAULT_INJ',
        active ? 'Gripper DI[4] reed fault armed' : 'Gripper DI[4] reed restored',
        'FAULT',
      ),
    })),

  setFaultCncDoorStuckClosed: (active) =>
    set((state) => ({
      faultCncDoorStuckClosed: active,
      di: active ? { ...state.di, 2: false } : { ...state.di, 2: true },
      eventLog: appendLog(
        state.eventLog,
        'FAULT_INJ',
        active ? 'CNC Door DI[2] stuck CLOSED' : 'CNC Door DI[2] restored OPEN',
        'FAULT',
      ),
    })),

  incrementScan: () => set((state) => ({ scanCycleCount: state.scanCycleCount + 1 })),

  resetFieldbus: (overrides) =>
    set({
      di: { ...createDefaultDI(), ...overrides?.di },
      do: { ...createDefaultDO(), ...overrides?.do },
      vr: createDefaultVR(),
      faultSuppressGripperClosedReed: false,
      faultCncDoorStuckClosed: false,
      lastUpdatedMs: Date.now(),
      eventLog: [],
    }),
}))
