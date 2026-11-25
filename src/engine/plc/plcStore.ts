import { create } from 'zustand'
import { useFieldbusStore } from '../fieldbus/fieldbusStore'
import type { DigitalSignalIndex } from '../fieldbus/types'
import { useRobotStore } from '../store/robotStore'
import { PLC_PRESETS } from './presets'
import type {
  LadderCondition,
  LadderRung,
  PlcBrandStyle,
  PlcTagId,
  PlcTimerId,
  RungLiveState,
  TimerRuntimeState,
} from './types'

interface PlcStoreState {
  plcRunning: boolean
  plcBrand: PlcBrandStyle
  activePresetId: string
  rungs: LadderRung[]

  // Operator Pushbuttons & Internal PLC Memory
  pushbuttons: {
    PB_START: boolean
    PB_STOP: boolean
    PB_RESET: boolean
  }
  memory: Record<'M0' | 'M1' | 'M2' | 'M3', boolean>
  timers: Record<PlcTimerId, TimerRuntimeState>
  rungStates: Record<string, RungLiveState>
  scanCount: number
  lastScanUs: number
  /** Rising-edge trackers for PLC -> Robot bridge */
  prevDi7: boolean
  prevDi8: boolean

  // Actions
  setPlcRunning: (running: boolean) => void
  setPlcBrand: (brand: PlcBrandStyle) => void
  setPushbutton: (pb: 'PB_START' | 'PB_STOP' | 'PB_RESET', pressed: boolean) => void
  loadPreset: (presetId: string) => void
  addRung: () => void
  deleteRung: (rungId: string) => void
  updateRung: (rungId: string, updater: (r: LadderRung) => LadderRung) => void
  addConditionToRung: (rungId: string) => void
  removeConditionFromRung: (rungId: string, condId: string) => void
  toggleTimerOnRung: (rungId: string) => void
  toggleParallelBranch: (rungId: string) => void
  stepPlcScan: (dtSec: number) => void
}

function createInitialTimers(): Record<PlcTimerId, TimerRuntimeState> {
  return {
    T0: { accSec: 0, presetSec: 1.0, tt: false, dn: false },
    T1: { accSec: 0, presetSec: 1.0, tt: false, dn: false },
    T2: { accSec: 0, presetSec: 1.0, tt: false, dn: false },
    T3: { accSec: 0, presetSec: 1.0, tt: false, dn: false },
  }
}

let nextIdCounter = 100

function readTagValue(
  tag: PlcTagId,
  pb: PlcStoreState['pushbuttons'],
  mem: PlcStoreState['memory'],
  timers: PlcStoreState['timers'],
): boolean {
  if (tag === 'PB_START' || tag === 'PB_STOP' || tag === 'PB_RESET') return pb[tag]
  if (tag === 'M0' || tag === 'M1' || tag === 'M2' || tag === 'M3') return mem[tag]
  if (tag === 'T0.DN') return timers.T0.dn
  if (tag === 'T1.DN') return timers.T1.dn
  if (tag === 'T2.DN') return timers.T2.dn
  if (tag === 'T3.DN') return timers.T3.dn

  const fb = useFieldbusStore.getState()
  const doMatch = tag.match(/^DO\[(\d+)\]$/)
  if (doMatch) {
    const idx = Number(doMatch[1]) as DigitalSignalIndex
    return fb.do[idx]
  }
  const diMatch = tag.match(/^DI\[(\d+)\]$/)
  if (diMatch) {
    const idx = Number(diMatch[1]) as DigitalSignalIndex
    return fb.di[idx]
  }
  return false
}

export const usePlcStore = create<PlcStoreState>((set, get) => ({
  plcRunning: false,
  plcBrand: 'SIEMENS',
  activePresetId: PLC_PRESETS[0].id,
  rungs: structuredClone(PLC_PRESETS[0].rungs) as LadderRung[],

  pushbuttons: {
    PB_START: false,
    PB_STOP: false,
    PB_RESET: false,
  },
  memory: { M0: false, M1: false, M2: false, M3: false },
  timers: createInitialTimers(),
  rungStates: {},
  scanCount: 0,
  lastScanUs: 18,
  prevDi7: false,
  prevDi8: false,

  setPlcRunning: (running) => {
    if (!running) {
      set({
        plcRunning: false,
        rungStates: {},
      })
    } else {
      // Clear previous rising-edge flags cleanly on entering RUN
      const fb = useFieldbusStore.getState()
      set({
        plcRunning: true,
        prevDi7: fb.di[7],
        prevDi8: fb.di[8],
      })
    }
  },

  setPlcBrand: (brand) => set({ plcBrand: brand }),

  setPushbutton: (pb, pressed) =>
    set((state) => ({
      pushbuttons: { ...state.pushbuttons, [pb]: pressed },
    })),

  loadPreset: (presetId) => {
    const found = PLC_PRESETS.find((p) => p.id === presetId) ?? PLC_PRESETS[0]
    set({
      activePresetId: found.id,
      rungs: structuredClone(found.rungs) as LadderRung[],
      memory: { M0: false, M1: false, M2: false, M3: false },
      timers: createInitialTimers(),
      rungStates: {},
    })
  },

  addRung: () =>
    set((state) => {
      const id = `rung_${nextIdCounter++}`
      const newRung: LadderRung = {
        id,
        comment: `Rung ${state.rungs.length}: Custom Ladder Logic`,
        conditions: [{ id: `c_${nextIdCounter++}`, type: 'XIC', tag: 'PB_START' }],
        coil: { type: 'OTE', tag: 'M2' },
      }
      return { rungs: [...state.rungs, newRung] }
    }),

  deleteRung: (rungId) =>
    set((state) => ({
      rungs: state.rungs.filter((r) => r.id !== rungId),
    })),

  updateRung: (rungId, updater) =>
    set((state) => ({
      rungs: state.rungs.map((r) => (r.id === rungId ? updater(r) : r)),
    })),

  addConditionToRung: (rungId) =>
    set((state) => ({
      rungs: state.rungs.map((r) => {
        if (r.id !== rungId || r.conditions.length >= 4) return r
        const nextCond: LadderCondition = {
          id: `c_${nextIdCounter++}`,
          type: 'XIC',
          tag: 'DO[4]',
        }
        return { ...r, conditions: [...r.conditions, nextCond] }
      }),
    })),

  removeConditionFromRung: (rungId, condId) =>
    set((state) => ({
      rungs: state.rungs.map((r) => {
        if (r.id !== rungId || r.conditions.length <= 1) return r
        return { ...r, conditions: r.conditions.filter((c) => c.id !== condId) }
      }),
    })),

  toggleTimerOnRung: (rungId) =>
    set((state) => ({
      rungs: state.rungs.map((r, idx) => {
        if (r.id !== rungId) return r
        if (r.timer) {
          const rest = { ...r }
          delete rest.timer
          return rest
        }
        const timerIds: PlcTimerId[] = ['T0', 'T1', 'T2', 'T3']
        return {
          ...r,
          timer: { timerId: timerIds[idx % timerIds.length], presetSec: 1.0 },
        }
      }),
    })),

  toggleParallelBranch: (rungId) =>
    set((state) => ({
      rungs: state.rungs.map((r) => {
        if (r.id !== rungId) return r
        if (r.parallelBranchTag) {
          const rest = { ...r }
          delete rest.parallelBranchTag
          return rest
        }
        return { ...r, parallelBranchTag: 'M0' }
      }),
    })),

  /**
   * Deterministic IEC 61131-3 PLC Scan Cycle:
   * 1. Snapshot Input Image (Fieldbus DO[] + Pushbuttons + Memory)
   * 2. Evaluate Ladder Rungs sequentially (left-to-right power rail)
   * 3. Commit Output Image to Virtual Fieldbus DI[] & bridge rising edges to 3D Robot
   */
  stepPlcScan: (dtSec) => {
    const st = get()
    if (!st.plcRunning) return

    const t0 = performance.now()
    const nextMem = { ...st.memory }
    const nextTimers: Record<PlcTimerId, TimerRuntimeState> = {
      T0: { ...st.timers.T0 },
      T1: { ...st.timers.T1 },
      T2: { ...st.timers.T2 },
      T3: { ...st.timers.T3 },
    }
    const nextRungStates: Record<string, RungLiveState> = {}
    const pendingDiWrites: Partial<Record<DigitalSignalIndex, boolean>> = {}

    for (const rung of st.rungs) {
      const condPass: boolean[] = []
      let branchPass = false

      if (rung.parallelBranchTag) {
        branchPass = readTagValue(rung.parallelBranchTag, st.pushbuttons, nextMem, nextTimers)
      }

      let power = true
      for (let i = 0; i < rung.conditions.length; i++) {
        const cond = rung.conditions[i]
        const raw = readTagValue(cond.tag, st.pushbuttons, nextMem, nextTimers)
        const active = cond.type === 'XIC' ? raw : !raw
        condPass.push(active)
        if (i === 0 && rung.parallelBranchTag) {
          power = power && (active || branchPass)
        } else {
          power = power && active
        }
      }

      const preTimerPower = power

      // Evaluate optional On-Delay Timer (TON)
      if (rung.timer) {
        const tm = nextTimers[rung.timer.timerId]
        tm.presetSec = rung.timer.presetSec
        if (preTimerPower) {
          tm.accSec = Math.min(tm.presetSec, tm.accSec + dtSec)
          tm.dn = tm.accSec >= tm.presetSec - 1e-4
          tm.tt = !tm.dn
        } else {
          tm.accSec = 0
          tm.dn = false
          tm.tt = false
        }
        power = tm.dn
      }

      nextRungStates[rung.id] = {
        conditionPass: condPass,
        branchPass,
        preTimerPower,
        rungEnergized: power,
      }

      // Execute Output Coil (OTE / OTL / OTU)
      const targetTag = rung.coil.tag
      const applyWrite = (currentVal: boolean): boolean => {
        if (rung.coil.type === 'OTE') return power
        if (rung.coil.type === 'OTL') return power ? true : currentVal
        return power ? false : currentVal
      }

      if (targetTag === 'M0' || targetTag === 'M1' || targetTag === 'M2' || targetTag === 'M3') {
        nextMem[targetTag] = applyWrite(nextMem[targetTag])
      } else {
        const diMatch = targetTag.match(/^DI\[(\d+)\]$/)
        if (diMatch) {
          const idx = Number(diMatch[1]) as DigitalSignalIndex
          const cur =
            pendingDiWrites[idx] !== undefined
              ? (pendingDiWrites[idx] as boolean)
              : useFieldbusStore.getState().di[idx]
          pendingDiWrites[idx] = applyWrite(cur)
        }
      }
    }

    // Commit output process image atomically to shared Virtual Fieldbus
    const fb = useFieldbusStore.getState()
    for (const [k, val] of Object.entries(pendingDiWrites)) {
      const idx = Number(k) as DigitalSignalIndex
      if (val !== undefined) {
        fb.setDI(idx, val, 'PLC_SIM')
      }
    }

    // PLC -> 3D Robot Cell Bridge (Rising Edges on DI[7] CycleStart & DI[8] FaultReset)
    const nowDi7 = useFieldbusStore.getState().di[7]
    const nowDi8 = useFieldbusStore.getState().di[8]
    const robot = useRobotStore.getState()

    if (nowDi8 && !st.prevDi8 && robot.activeFault) {
      robot.resetFault()
    }
    if (nowDi7 && !st.prevDi7 && !robot.isRunning && !robot.activeFault && !robot.estopActive) {
      robot.startProgram()
    }

    const elapsedUs = Math.max(8, Math.round((performance.now() - t0) * 1000))

    set({
      memory: nextMem,
      timers: nextTimers,
      rungStates: nextRungStates,
      scanCount: st.scanCount + 1,
      lastScanUs: elapsedUs,
      prevDi7: nowDi7,
      prevDi8: nowDi8,
    })
  },
}))
