import { create } from 'zustand'
import { useFieldbusStore } from '../fieldbus/fieldbusStore'
import type { OemDialect, PositionRegister, ProgramInstruction } from '../dialects/types'
import { computeFK, DEFAULT_USER_FRAME } from '../kinematics/fk'
import { solveIKFromPose } from '../kinematics/ik'
import { planProgramPreview, type ProgramPathPreview } from '../kinematics/planner'
import { evaluateSingularity } from '../kinematics/singularity'
import { computeThreePointTcp, type TcpCalibrationResult, type TcpCalibrationSample } from '../kinematics/tcpCalibration'
import {
  type CartesianPose,
  type ControllerMode,
  type CoordinateFrameMode,
  type ExecutionMode,
  type FKResult,
  type JointAngles,
  type SafetyZone,
  type SingularityReport,
  type ToolFrame,
  type UserFrame,
  type Vec3,
} from '../kinematics/types'
import { SCENARIOS } from '../scenarios/definitions'
import type {
  ActiveFaultType,
  ControllerFault,
  MissionTelemetry,
  ScenarioId,
} from '../scenarios/types'

export type WorkspaceTab = 'ROBOTICS' | 'PLC'
export type DockTab = 'PENDANT' | 'CODE' | 'SCENARIO'

/**
 * Mutable 60 FPS runtime state consumed directly by Three.js useFrame() hooks.
 * NEVER triggers React re-renders per frame.
 */
export interface RobotRuntimeState {
  joints: JointAngles
  jointVelocities: JointAngles
  fk: FKResult
  singularity: SingularityReport
  /** Active jog axis inputs [-1..1] for 6 axes (J1..J6 or X,Y,Z,W,P,R) */
  jogInput: [number, number, number, number, number, number]
  /** Swept TCP trail ring buffer (World mm) */
  tcpTrail: Vec3[]
  /** Execution cursor for smooth frame-by-frame motion */
  execState: {
    running: boolean
    paused: boolean
    instructionIndex: number
    phase: 'IDLE' | 'MOVING' | 'SETTLING' | 'WAITING_TIME' | 'WAITING_DI' | 'GRIPPER_WAIT'
    segmentElapsedSec: number
    segmentDurationSec: number
    fineSettleSec: number
    waitElapsedSec: number
    moveType: 'MOVE_J' | 'MOVE_L'
    startJoints: JointAngles
    endJoints: JointAngles
    startTcpMat: FKResult['frames']['tcp']
    endTcpMat: FKResult['frames']['tcp']
    /** Optional next segment for real-time CNT corner blending */
    blendFraction: number
    nextTcpPos: Vec3 | null
    cycleElapsedSec: number
    stepStopAfterCurrent: boolean
    gripperTargetAction: 'CLOSE' | 'OPEN' | null
    /** Count of instructions executed to prevent infinite jump loops */
    loopGuard: number
  }
  /** Animated workcell objects */
  cellObjects: {
    gripperOpenFraction: number // 0 = closed, 1 = open
    holdingPart: boolean
    /** Current billet/part world position (mm) when not held */
    partWorldPos: Vec3
    partRotZDeg: number
    placedCount: number
    /** Scenario 4 randomized billet offset on infeed conveyor */
    billetOffset: { x: number; y: number; rz: number }
    cncDoorOpenFraction: number // 0 = closed, 1 = open
    cncMachiningRemainingSec: number
    visionFlashAlpha: number // 0..1 visual camera scan pulse
  }
  /** Scenario 1 TCP rotation invariance tracker */
  tcpRotationTracker: {
    initialTipPos: Vec3 | null
    accumulatedRotDeg: number
    maxDriftMm: number
  }
  /** Throttled HUD sync accumulator */
  hudSyncAccumSec: number
  heartbeatAccumSec: number
  gripperPlcDelaySec: number | null
}

function createInitialScenarioTelemetry(): MissionTelemetry {
  return {
    lastCycleTimeSec: null,
    bestCycleTimeSec: null,
    blendEfficiencyPct: 0,
    safetyBreachCount: 0,
    singularityWarningCount: 0,
    singularityFaultCount: 0,
    completedCycles: 0,
    tcpCalibrationRmsMm: null,
    tcpRotationVerified: false,
    framesExplored: ['JOINT'],
    dcsVerifiedStop: false,
    singularityResolved: false,
    faultsTriaged: [],
  }
}

const initialScenario = SCENARIOS.scenario1
const initialFk = computeFK(initialScenario.homeJoints, initialScenario.tool, initialScenario.userFrame)

export const robotRuntime: RobotRuntimeState = {
  joints: [...initialScenario.homeJoints] as JointAngles,
  jointVelocities: [0, 0, 0, 0, 0, 0],
  fk: initialFk,
  singularity: evaluateSingularity(initialScenario.homeJoints),
  jogInput: [0, 0, 0, 0, 0, 0],
  tcpTrail: [],
  execState: {
    running: false,
    paused: false,
    instructionIndex: 0,
    phase: 'IDLE',
    segmentElapsedSec: 0,
    segmentDurationSec: 0,
    fineSettleSec: 0,
    waitElapsedSec: 0,
    moveType: 'MOVE_J',
    startJoints: [...initialScenario.homeJoints] as JointAngles,
    endJoints: [...initialScenario.homeJoints] as JointAngles,
    startTcpMat: initialFk.frames.tcp,
    endTcpMat: initialFk.frames.tcp,
    blendFraction: 0,
    nextTcpPos: null,
    cycleElapsedSec: 0,
    stepStopAfterCurrent: false,
    gripperTargetAction: null,
    loopGuard: 0,
  },
  cellObjects: {
    gripperOpenFraction: 1,
    holdingPart: false,
    partWorldPos: [1020, -560, 505],
    partRotZDeg: 0,
    placedCount: 0,
    billetOffset: { x: 24, y: -18, rz: 16 },
    cncDoorOpenFraction: 1,
    cncMachiningRemainingSec: 0,
    visionFlashAlpha: 0,
  },
  tcpRotationTracker: {
    initialTipPos: null,
    accumulatedRotDeg: 0,
    maxDriftMm: 0,
  },
  hudSyncAccumSec: 0,
  heartbeatAccumSec: 0,
  gripperPlcDelaySec: null,
}

export function setRuntimeJogAxis(axis: number, dir: -1 | 0 | 1): void {
  robotRuntime.jogInput[axis] = dir
}

export function clearRuntimeJog(): void {
  robotRuntime.jogInput = [0, 0, 0, 0, 0, 0]
}

export function snapRuntimeJointsToZero(): void {
  const st = useRobotStore.getState()
  robotRuntime.joints = [0, 0, 0, 0, 0, 0]
  robotRuntime.fk = computeFK(robotRuntime.joints, st.tool, st.userFrame)
  robotRuntime.singularity = evaluateSingularity(robotRuntime.joints)
  st.syncHudFromRuntime()
}

export interface RobotStoreState {
  activeWorkspace: WorkspaceTab
  activeDockTab: DockTab
  scenarioId: ScenarioId

  // Controller State
  controllerMode: ControllerMode
  executionMode: ExecutionMode
  coordinateFrame: CoordinateFrameMode
  deadmanEnabled: boolean
  estopActive: boolean
  speedOverridePct: number
  isRunning: boolean
  isPaused: boolean
  activeLineIndex: number
  activeFault: ControllerFault | null
  bzalRequiresMaster: boolean
  bzalCleared: boolean
  showSafetyZones: boolean
  showPathPreview: boolean
  showTriads: boolean

  // Active Program & Dialect
  dialect: OemDialect
  programName: string
  instructions: ProgramInstruction[]
  positions: Record<number, PositionRegister>
  tool: ToolFrame
  userFrame: UserFrame
  safetyZones: SafetyZone[]
  pathPreview: ProgramPathPreview

  // Scenario 1 TCP Calibration
  tcpSamples: TcpCalibrationSample[]
  tcpCalResult: TcpCalibrationResult | null

  // Throttled HUD Snapshot (~12 Hz)
  hudJoints: JointAngles
  hudJointVel: JointAngles
  hudTcpWorld: CartesianPose
  hudTcpUser: CartesianPose
  hudSingularity: SingularityReport
  hudCycleTimeSec: number
  hudPhysicalTipErrorMm: number

  // Telemetry & Objectives
  telemetryByScenario: Record<ScenarioId, MissionTelemetry>

  // Actions
  setWorkspace: (tab: WorkspaceTab) => void
  setDockTab: (tab: DockTab) => void
  loadScenario: (id: ScenarioId) => void
  setControllerMode: (mode: ControllerMode) => void
  setExecutionMode: (mode: ExecutionMode) => void
  setCoordinateFrame: (frame: CoordinateFrameMode) => void
  setDeadmanEnabled: (enabled: boolean) => void
  toggleEstop: () => void
  setSpeedOverride: (pct: number) => void
  setDialect: (dialect: OemDialect) => void
  updateInstructions: (instructions: ProgramInstruction[], name?: string) => void
  loadSecondaryProgram: () => void
  resetScenarioProgram: () => void
  setSafetyZoneEnabled: (zoneId: string, enabled: boolean) => void
  updateSafetyZoneSize: (zoneId: string, size: Vec3, center?: Vec3) => void
  setShowSafetyZones: (show: boolean) => void
  setShowPathPreview: (show: boolean) => void
  setShowTriads: (show: boolean) => void
  recomputePathPreview: () => void

  // Motion & Execution controls
  startProgram: () => void
  stepProgram: () => void
  holdProgram: () => void
  stopProgram: () => void
  returnHome: () => void
  triggerFault: (type: ActiveFaultType, detailOverride?: string) => void
  resetFault: () => void

  // Scenario 1 TCP calibration actions
  recordTcpSample: () => void
  clearTcpSamples: () => void
  solveAndApplyTcp: () => void
  jumpToCalibrationApproach: (approachIndex: 1 | 2 | 3) => void

  // Scenario 4 Fault Injection & Recovery
  injectBzalFault: () => void
  clearBzalAlarm: () => void
  executeQuickMaster: () => void
  injectGripperReedFault: () => void
  restoreGripperReedSensor: () => void
  injectCncDoorCollisionFault: () => void
  restoreCncDoorInterlock: () => void
  randomizeBillet: () => void

  // Internal sync from runtime loop
  syncHudFromRuntime: () => void
  updateTelemetry: (updater: (prev: MissionTelemetry) => MissionTelemetry) => void
}

function nowTimestamp(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

function createFaultObject(type: ActiveFaultType, detailOverride?: string): ControllerFault {
  const ts = nowTimestamp()
  switch (type) {
    case 'MOTN_023_SINGULARITY':
      return {
        code: 'MOTN-023',
        type,
        title: 'In Singularity (Linear Move Impossible)',
        detail:
          detailOverride ??
          'Wrist axis |J5| crossed near 0° during Linear (L/MoveL) motion causing J4/J6 velocity saturation.',
        recoverySteps: [
          'Press RESET FAULT on Teach Pendant or HMI header.',
          'Edit line 4 from Linear (L / MoveL / LIN) to Joint (J / MoveJ / PTP) so wrist passes smoothly.',
          'Re-run program in AUTO mode to confirm clean transit.',
        ],
        timestamp: ts,
      }
    case 'SYST_212_DCS_VIOLATION':
      return {
        code: 'SYST-212',
        type,
        title: 'DCS / SafeMove CPC Zone Violation',
        detail:
          detailOverride ??
          'Dual Check Safety halted servos deterministically prior to entering protected Operator Load Bay.',
        recoverySteps: [
          'Verify operator bay clear (DI[12]=ON).',
          'Switch to T1 mode, press RESET FAULT, and jog clear of the crimson DCS boundary.',
        ],
        timestamp: ts,
      }
    case 'SYST_304_OBSTACLE_COLLISION':
      return {
        code: 'SYST-304',
        type,
        title: 'Workcell Obstacle Collision Detected',
        detail:
          detailOverride ??
          'Blended TCP/EOAT trajectory clipped a fixed cell guard obstacle.',
        recoverySteps: [
          'Press RESET FAULT and click HOME PERCH.',
          'Reduce CNT blend value or increase clearance waypoint Z height above the central divider.',
        ],
        timestamp: ts,
      }
    case 'SRVO_062_BZAL':
      return {
        code: 'SRVO-062',
        type,
        title: 'BZAL Alarm (Pulse Coder Backup Battery Lost)',
        detail:
          detailOverride ??
          'Absolute encoder pulse count lost on J1-J6. Mastering required before AUTO operation.',
        recoverySteps: [
          '1. Click [Clear BZAL Pulse Alarm] in Triage Panel.',
          '2. Switch to T1 mode and jog all axes near 0° witness marks (or click Jog to Zero Marks).',
          '3. Execute [Quick Master & Calibrate] then press RESET FAULT.',
        ],
        timestamp: ts,
      }
    case 'IO_GRIPPER_TIMEOUT':
      return {
        code: 'INTP-281',
        type,
        title: 'Gripper Reed-Switch Confirmation Timeout',
        detail:
          detailOverride ??
          'DO[1] Gripper_CloseCmd asserted ON, but DI[4] Gripper_ClosedReed failed to confirm within 2.5s.',
        recoverySteps: [
          '1. Inspect Virtual Fieldbus I/O Strip: verify DO[1]=ON while DI[4]=OFF.',
          '2. Check pneumatic reed sensor / dropped billet and click [Restore Reed Sensor].',
          '3. Press RESET FAULT and return Home before resuming AUTO.',
        ],
        timestamp: ts,
      }
    case 'SRVO_050_COLLISION_OVERTORQUE':
      return {
        code: 'SRVO-050',
        type,
        title: 'Collision Detect Over-Torque (CNC Door Closed)',
        detail:
          detailOverride ??
          'Arm detected disturbance torque at CNC enclosure plane while DI[2] CNC_DoorOpen = OFF.',
        recoverySteps: [
          '1. Verify CNC door interlock DI[2] is OFF on Virtual Fieldbus.',
          '2. Switch controller keyswitch to T1 (Slow Teach) and select WORLD frame.',
          '3. Jog robot clear (-Y) out of CNC doorway, restore CNC door interlock, and press RESET FAULT.',
        ],
        timestamp: ts,
      }
    case 'ESTOP_ACTIVE':
      return {
        code: 'SYST-001',
        type,
        title: 'Emergency Stop Circuit Open',
        detail: 'Dual-channel E-Stop pressed. Servo power contactor open.',
        recoverySteps: ['Twist/release E-STOP button, then press RESET FAULT.'],
        timestamp: ts,
      }
    default:
      return {
        code: 'MOTN-018',
        type: 'MOTN_018_UNREACHABLE',
        title: 'Position Not Reachable / Axis Limit',
        detail: detailOverride ?? 'Target pose lies outside kinematic reach or joint mechanical limits.',
        recoverySteps: ['Press RESET FAULT and jog away from mechanical joint limits.'],
        timestamp: ts,
      }
  }
}

function buildInitialPreview(scenarioId: ScenarioId): ProgramPathPreview {
  const sc = SCENARIOS[scenarioId]
  return planProgramPreview(
    sc.initialInstructions,
    sc.initialPositions,
    sc.homeJoints,
    sc.tool,
    sc.userFrame,
    useFieldbusStore.getState().vr,
    sc.initialSafetyZones,
    100,
  )
}

export const useRobotStore = create<RobotStoreState>((set, get) => ({
  activeWorkspace: 'ROBOTICS',
  activeDockTab: 'PENDANT',
  scenarioId: 'scenario1',

  controllerMode: 'T1',
  executionMode: 'CONT',
  coordinateFrame: 'JOINT',
  deadmanEnabled: true,
  estopActive: false,
  speedOverridePct: 100,
  isRunning: false,
  isPaused: false,
  activeLineIndex: 0,
  activeFault: null,
  bzalRequiresMaster: false,
  bzalCleared: false,
  showSafetyZones: true,
  showPathPreview: true,
  showTriads: true,

  dialect: 'FANUC',
  programName: initialScenario.initialProgramName,
  instructions: initialScenario.initialInstructions.map((i) => ({ ...i })),
  positions: structuredClone(initialScenario.initialPositions),
  tool: { ...initialScenario.tool },
  userFrame: { ...initialScenario.userFrame },
  safetyZones: initialScenario.initialSafetyZones.map((z) => ({ ...z })),
  pathPreview: buildInitialPreview('scenario1'),

  tcpSamples: [],
  tcpCalResult: null,

  hudJoints: [...initialScenario.homeJoints] as JointAngles,
  hudJointVel: [0, 0, 0, 0, 0, 0],
  hudTcpWorld: initialFk.tcpWorldPose,
  hudTcpUser: initialFk.tcpUserPose,
  hudSingularity: evaluateSingularity(initialScenario.homeJoints),
  hudCycleTimeSec: 0,
  hudPhysicalTipErrorMm: 0,

  telemetryByScenario: {
    scenario1: createInitialScenarioTelemetry(),
    scenario2: createInitialScenarioTelemetry(),
    scenario3: createInitialScenarioTelemetry(),
    scenario4: createInitialScenarioTelemetry(),
  },

  setWorkspace: (tab) => set({ activeWorkspace: tab }),
  setDockTab: (tab) => set({ activeDockTab: tab }),

  loadScenario: (id) => {
    const sc = SCENARIOS[id]
    const fk = computeFK(sc.homeJoints, sc.tool, sc.userFrame)
    const sing = evaluateSingularity(sc.homeJoints)

    // Reset transient runtime
    robotRuntime.joints = [...sc.homeJoints] as JointAngles
    robotRuntime.jointVelocities = [0, 0, 0, 0, 0, 0]
    robotRuntime.fk = fk
    robotRuntime.singularity = sing
    robotRuntime.jogInput = [0, 0, 0, 0, 0, 0]
    robotRuntime.tcpTrail = []
    robotRuntime.execState.running = false
    robotRuntime.execState.paused = false
    robotRuntime.execState.instructionIndex = 0
    robotRuntime.execState.phase = 'IDLE'
    robotRuntime.execState.cycleElapsedSec = 0
    robotRuntime.execState.stepStopAfterCurrent = false
    robotRuntime.execState.gripperTargetAction = null
    robotRuntime.cellObjects.gripperOpenFraction = 1
    robotRuntime.cellObjects.holdingPart = false
    robotRuntime.cellObjects.placedCount = 0
    robotRuntime.cellObjects.cncDoorOpenFraction = 1
    robotRuntime.cellObjects.cncMachiningRemainingSec = 0
    robotRuntime.cellObjects.visionFlashAlpha = 0
    robotRuntime.cellObjects.billetOffset = { x: 26, y: -20, rz: 18 }
    robotRuntime.cellObjects.partWorldPos =
      id === 'scenario4' ? [960 + 26, -560 - 20, 505] : [1020, -560, 505]
    robotRuntime.cellObjects.partRotZDeg = id === 'scenario4' ? 18 : 0
    robotRuntime.tcpRotationTracker = { initialTipPos: null, accumulatedRotDeg: 0, maxDriftMm: 0 }

    useFieldbusStore.getState().resetFieldbus({ di: sc.initialFieldbusDI })

    const nextMode: ControllerMode = id === 'scenario1' ? 'T1' : 'AUTO'
    const nextDockTab: DockTab = id === 'scenario1' ? 'PENDANT' : id === 'scenario2' ? 'CODE' : 'SCENARIO'
    const zones = sc.initialSafetyZones.map((z) => ({ ...z }))
    const preview = planProgramPreview(
      sc.initialInstructions,
      sc.initialPositions,
      sc.homeJoints,
      sc.tool,
      sc.userFrame,
      useFieldbusStore.getState().vr,
      zones,
      100,
    )

    set({
      scenarioId: id,
      controllerMode: nextMode,
      activeDockTab: nextDockTab,
      coordinateFrame: 'JOINT',
      isRunning: false,
      isPaused: false,
      activeLineIndex: 0,
      activeFault: null,
      estopActive: false,
      bzalRequiresMaster: false,
      bzalCleared: false,
      programName: sc.initialProgramName,
      instructions: sc.initialInstructions.map((i) => ({ ...i })),
      positions: structuredClone(sc.initialPositions),
      tool: { ...sc.tool },
      userFrame: { ...sc.userFrame },
      safetyZones: zones,
      pathPreview: preview,
      tcpSamples: [],
      tcpCalResult: null,
      hudJoints: [...sc.homeJoints] as JointAngles,
      hudJointVel: [0, 0, 0, 0, 0, 0],
      hudTcpWorld: fk.tcpWorldPose,
      hudTcpUser: fk.tcpUserPose,
      hudSingularity: sing,
      hudCycleTimeSec: 0,
    })
  },

  setControllerMode: (mode) => {
    useFieldbusStore.getState().setDO(10, mode === 'AUTO')
    if (mode !== 'AUTO' && get().isRunning) {
      // Switching out of AUTO stops continuous cycle safely
      robotRuntime.execState.running = false
      robotRuntime.execState.phase = 'IDLE'
      set({ controllerMode: mode, isRunning: false, isPaused: false })
      return
    }
    set({ controllerMode: mode })
  },

  setExecutionMode: (mode) => set({ executionMode: mode }),

  setCoordinateFrame: (frame) => {
    set({ coordinateFrame: frame })
    get().updateTelemetry((prev) => ({
      ...prev,
      framesExplored: prev.framesExplored.includes(frame)
        ? prev.framesExplored
        : [...prev.framesExplored, frame],
    }))
    // Reset rotation invariance baseline when entering TOOL mode
    if (frame === 'TOOL') {
      robotRuntime.tcpRotationTracker = {
        initialTipPos: null,
        accumulatedRotDeg: 0,
        maxDriftMm: 0,
      }
    }
  },

  setDeadmanEnabled: (enabled) => set({ deadmanEnabled: enabled }),

  toggleEstop: () => {
    const next = !get().estopActive
    if (next) {
      robotRuntime.execState.running = false
      robotRuntime.execState.phase = 'IDLE'
      robotRuntime.jogInput = [0, 0, 0, 0, 0, 0]
      useFieldbusStore.getState().setDO(6, true)
      useFieldbusStore.getState().setDO(11, false)
      set({
        estopActive: true,
        isRunning: false,
        isPaused: false,
        activeFault: createFaultObject('ESTOP_ACTIVE'),
      })
    } else {
      set({ estopActive: false })
    }
  },

  setSpeedOverride: (pct) => {
    const clamped = Math.max(5, Math.min(100, Math.round(pct)))
    set({ speedOverridePct: clamped })
    get().recomputePathPreview()
  },

  setDialect: (dialect) => set({ dialect }),

  updateInstructions: (instructions, name) => {
    set((state) => ({
      instructions,
      programName: name ?? state.programName,
    }))
    get().recomputePathPreview()
  },

  loadSecondaryProgram: () => {
    const sc = SCENARIOS[get().scenarioId]
    if (!sc.secondaryProgram) return
    get().stopProgram()
    set({
      programName: sc.secondaryProgram.name,
      instructions: sc.secondaryProgram.instructions.map((i) => ({ ...i })),
      activeLineIndex: 0,
    })
    get().recomputePathPreview()
  },

  resetScenarioProgram: () => {
    const sc = SCENARIOS[get().scenarioId]
    get().stopProgram()
    set({
      programName: sc.initialProgramName,
      instructions: sc.initialInstructions.map((i) => ({ ...i })),
      activeLineIndex: 0,
    })
    get().recomputePathPreview()
  },

  setSafetyZoneEnabled: (zoneId, enabled) => {
    set((state) => ({
      safetyZones: state.safetyZones.map((z) => (z.id === zoneId ? { ...z, enabled } : z)),
    }))
    get().recomputePathPreview()
  },

  updateSafetyZoneSize: (zoneId, size, center) => {
    set((state) => ({
      safetyZones: state.safetyZones.map((z) =>
        z.id === zoneId ? { ...z, size, center: center ?? z.center } : z,
      ),
    }))
    get().recomputePathPreview()
  },

  setShowSafetyZones: (show) => set({ showSafetyZones: show }),
  setShowPathPreview: (show) => set({ showPathPreview: show }),
  setShowTriads: (show) => set({ showTriads: show }),

  recomputePathPreview: () => {
    const st = get()
    const sc = SCENARIOS[st.scenarioId]
    const preview = planProgramPreview(
      st.instructions,
      st.positions,
      sc.homeJoints,
      st.tool,
      st.userFrame,
      useFieldbusStore.getState().vr,
      st.safetyZones,
      st.speedOverridePct,
    )
    set({ pathPreview: preview })
  },

  startProgram: () => {
    const st = get()
    if (st.estopActive) return
    if (st.activeFault) return
    if (st.bzalRequiresMaster) {
      st.triggerFault('SRVO_062_BZAL', 'Robot unmastered — complete Quick Master & Calibrate before running.')
      return
    }
    if (!useFieldbusStore.getState().di[6]) {
      st.triggerFault('SYST_212_DCS_VIOLATION', 'Safety Fence Interlock DI[6]=OFF — close safety gate.')
      return
    }
    if (st.controllerMode !== 'AUTO') {
      // Auto-switch to AUTO with user-friendly convenience if they click Run
      set({ controllerMode: 'AUTO' })
    }

    if (st.isPaused) {
      robotRuntime.execState.running = true
      robotRuntime.execState.paused = false
      robotRuntime.execState.stepStopAfterCurrent = st.executionMode === 'STEP'
      useFieldbusStore.getState().setDO(11, true)
      set({ isRunning: true, isPaused: false })
      return
    }

    // Start fresh from line 0
    robotRuntime.tcpTrail = []
    robotRuntime.execState.running = true
    robotRuntime.execState.paused = false
    robotRuntime.execState.instructionIndex = 0
    robotRuntime.execState.phase = 'IDLE'
    robotRuntime.execState.cycleElapsedSec = 0
    robotRuntime.execState.stepStopAfterCurrent = st.executionMode === 'STEP'
    robotRuntime.execState.loopGuard = 0
    useFieldbusStore.getState().setDO(10, true)
    useFieldbusStore.getState().setDO(11, true)
    useFieldbusStore.getState().setDO(6, false)

    set({ isRunning: true, isPaused: false, activeLineIndex: 0 })
  },

  stepProgram: () => {
    const st = get()
    if (st.estopActive || st.activeFault) return
    if (st.bzalRequiresMaster) {
      st.triggerFault('SRVO_062_BZAL')
      return
    }
    set({ executionMode: 'STEP' })
    robotRuntime.execState.running = true
    robotRuntime.execState.paused = false
    robotRuntime.execState.stepStopAfterCurrent = true
    if (robotRuntime.execState.phase === 'IDLE' && !st.isPaused) {
      robotRuntime.execState.instructionIndex = st.activeLineIndex
    }
    useFieldbusStore.getState().setDO(11, true)
    set({ isRunning: true, isPaused: false })
  },

  holdProgram: () => {
    robotRuntime.execState.running = false
    robotRuntime.execState.paused = true
    useFieldbusStore.getState().setDO(11, false)
    set({ isRunning: false, isPaused: true })
  },

  stopProgram: () => {
    robotRuntime.execState.running = false
    robotRuntime.execState.paused = false
    robotRuntime.execState.phase = 'IDLE'
    robotRuntime.execState.instructionIndex = 0
    robotRuntime.execState.cycleElapsedSec = 0
    useFieldbusStore.getState().setDO(11, false)
    set({ isRunning: false, isPaused: false, activeLineIndex: 0, hudCycleTimeSec: 0 })
  },

  returnHome: () => {
    const st = get()
    const sc = SCENARIOS[st.scenarioId]
    robotRuntime.execState.running = false
    robotRuntime.execState.paused = false
    robotRuntime.execState.phase = 'IDLE'
    robotRuntime.joints = [...sc.homeJoints] as JointAngles
    robotRuntime.jointVelocities = [0, 0, 0, 0, 0, 0]
    robotRuntime.fk = computeFK(robotRuntime.joints, st.tool, st.userFrame)
    robotRuntime.singularity = evaluateSingularity(robotRuntime.joints)
    robotRuntime.tcpTrail = []
    robotRuntime.cellObjects.holdingPart = false
    robotRuntime.cellObjects.gripperOpenFraction = 1
    robotRuntime.cellObjects.partWorldPos =
      st.scenarioId === 'scenario4'
        ? [960 + robotRuntime.cellObjects.billetOffset.x, -560 + robotRuntime.cellObjects.billetOffset.y, 505]
        : [1020, -560, 505]
    useFieldbusStore.getState().setDO(4, true)
    useFieldbusStore.getState().setDO(11, false)
    useFieldbusStore.getState().setDO(1, false)
    set({
      isRunning: false,
      isPaused: false,
      activeLineIndex: 0,
      hudCycleTimeSec: 0,
      hudJoints: [...robotRuntime.joints] as JointAngles,
      hudTcpWorld: robotRuntime.fk.tcpWorldPose,
      hudTcpUser: robotRuntime.fk.tcpUserPose,
      hudSingularity: robotRuntime.singularity,
    })
  },

  triggerFault: (type, detailOverride) => {
    if (type === 'NONE') return
    const fault = createFaultObject(type, detailOverride)
    robotRuntime.execState.running = false
    robotRuntime.execState.paused = false
    robotRuntime.execState.phase = 'IDLE'
    robotRuntime.jogInput = [0, 0, 0, 0, 0, 0]
    useFieldbusStore.getState().setDO(6, true)
    useFieldbusStore.getState().setDO(11, false)
    if (type === 'SYST_212_DCS_VIOLATION') {
      useFieldbusStore.getState().setDO(12, false)
    }

    set({
      activeFault: fault,
      isRunning: false,
      isPaused: false,
    })

    get().updateTelemetry((prev) => ({
      ...prev,
      safetyBreachCount:
        type === 'SYST_212_DCS_VIOLATION' || type === 'SYST_304_OBSTACLE_COLLISION'
          ? prev.safetyBreachCount + 1
          : prev.safetyBreachCount,
      singularityFaultCount:
        type === 'MOTN_023_SINGULARITY' ? prev.singularityFaultCount + 1 : prev.singularityFaultCount,
      dcsVerifiedStop:
        prev.dcsVerifiedStop || type === 'SYST_212_DCS_VIOLATION',
    }))
  },

  resetFault: () => {
    const st = get()
    if (st.estopActive) return
    if (st.bzalRequiresMaster && st.activeFault?.type === 'SRVO_062_BZAL') {
      return
    }
    const prevType = st.activeFault?.type
    useFieldbusStore.getState().setDO(6, false)
    useFieldbusStore.getState().setDO(12, true)
    set({ activeFault: null })

    if (prevType === 'IO_GRIPPER_TIMEOUT' && !useFieldbusStore.getState().faultSuppressGripperClosedReed) {
      st.updateTelemetry((p) => ({
        ...p,
        faultsTriaged: p.faultsTriaged.includes('GRIPPER') ? p.faultsTriaged : [...p.faultsTriaged, 'GRIPPER'],
      }))
    }
    if (prevType === 'SRVO_050_COLLISION_OVERTORQUE' && !useFieldbusStore.getState().faultCncDoorStuckClosed) {
      st.updateTelemetry((p) => ({
        ...p,
        faultsTriaged: p.faultsTriaged.includes('COLLISION') ? p.faultsTriaged : [...p.faultsTriaged, 'COLLISION'],
      }))
    }
  },

  recordTcpSample: () => {
    const st = get()
    const samples = st.tcpSamples
    const nextId = samples.length + 1
    const sample: TcpCalibrationSample = {
      id: nextId,
      label: `Touch Point #${nextId}`,
      flangeMat: [...robotRuntime.fk.frames.flange] as FKResult['frames']['flange'],
      jointSnapshot: [...robotRuntime.joints] as JointAngles,
    }
    const updated = [...samples.slice(-5), sample]
    set({ tcpSamples: updated })
  },

  clearTcpSamples: () => {
    const sc = SCENARIOS.scenario1
    set({
      tcpSamples: [],
      tcpCalResult: null,
      tool: { ...sc.tool },
    })
    robotRuntime.fk = computeFK(robotRuntime.joints, sc.tool, get().userFrame)
    get().syncHudFromRuntime()
  },

  solveAndApplyTcp: () => {
    const st = get()
    const res = computeThreePointTcp(st.tcpSamples)
    if (!res.success) {
      set({ tcpCalResult: res })
      return
    }
    const nextTool: ToolFrame = {
      ...st.tool,
      name: 'UTOOL[1] Calibrated MIG Torch',
      x: Number(res.offsetMm[0].toFixed(2)),
      y: Number(res.offsetMm[1].toFixed(2)),
      z: Number(res.offsetMm[2].toFixed(2)),
    }
    robotRuntime.fk = computeFK(robotRuntime.joints, nextTool, st.userFrame)
    robotRuntime.tcpRotationTracker = {
      initialTipPos: null,
      accumulatedRotDeg: 0,
      maxDriftMm: 0,
    }
    set({
      tcpCalResult: res,
      tool: nextTool,
    })
    get().updateTelemetry((prev) => ({
      ...prev,
      tcpCalibrationRmsMm: res.rmsErrorMm,
    }))
    get().syncHudFromRuntime()
  },

  jumpToCalibrationApproach: (approachIndex) => {
    const st = get()
    const sc = SCENARIOS.scenario1
    const trueOff = sc.physicalToolOffsetMm ?? [70, 0, 230]
    // Calibration pin tip world coordinate: [1080, 0, 620]
    // Preset 3 distinct angular orientations touching near the pin (~0.4mm accuracy so user can verify & fine-jog!)
    const presets: Record<1 | 2 | 3, JointAngles> = {
      1: [0, 21.8, 30.2, 0, 38.0, 0],
      2: [-14, 24.0, 25.0, 28, 42.0, -25],
      3: [15, 22.5, 27.5, -32, 46.0, 28],
    }
    // Better yet: compute exact IK using true physical torch offset so the physical torch tip lands within 0.3mm of pin [1080, 0, 620]!
    const trueTool: ToolFrame = {
      id: 99,
      name: 'TrueTorch',
      x: trueOff[0],
      y: trueOff[1],
      z: trueOff[2],
      w: 0,
      p: 0,
      r: 0,
      endEffectorType: 'torch',
    }
    const targetOrientations: Record<1 | 2 | 3, CartesianPose> = {
      1: { x: 1080, y: 0, z: 620, w: 180, p: 0, r: 0 },
      2: { x: 1080.2, y: -0.2, z: 620.1, w: 158, p: 24, r: 22 },
      3: { x: 1079.8, y: 0.2, z: 620.2, w: -160, p: -22, r: -26 },
    }
    const ik = solveIKFromPose(targetOrientations[approachIndex], presets[approachIndex], trueTool)
    if (ik.reachable) {
      robotRuntime.joints = ik.joints
      robotRuntime.fk = computeFK(ik.joints, st.tool, st.userFrame)
      robotRuntime.singularity = evaluateSingularity(ik.joints)
      robotRuntime.tcpRotationTracker = { initialTipPos: null, accumulatedRotDeg: 0, maxDriftMm: 0 }
      get().syncHudFromRuntime()
    }
  },

  injectBzalFault: () => {
    set({ bzalRequiresMaster: true, bzalCleared: false })
    get().triggerFault('SRVO_062_BZAL')
  },

  clearBzalAlarm: () => {
    set({ bzalCleared: true })
  },

  executeQuickMaster: () => {
    const st = get()
    if (!st.bzalCleared) return
    // Check joints are reasonably close to zero witness marks (< 15 deg per axis)
    const maxOffset = Math.max(...robotRuntime.joints.map((j) => Math.abs(j)))
    if (maxOffset > 15) {
      // Automatically jog smoothly / snap to zero witness marks if user hasn't yet, or require close
      robotRuntime.joints = [0, 0, 0, 0, 0, 0]
      robotRuntime.fk = computeFK(robotRuntime.joints, st.tool, st.userFrame)
      robotRuntime.singularity = evaluateSingularity(robotRuntime.joints)
    }
    useFieldbusStore.getState().setDO(6, false)
    set({ bzalRequiresMaster: false, bzalCleared: false, activeFault: null })
    st.updateTelemetry((p) => ({
      ...p,
      faultsTriaged: p.faultsTriaged.includes('BZAL') ? p.faultsTriaged : [...p.faultsTriaged, 'BZAL'],
    }))
    get().syncHudFromRuntime()
  },

  injectGripperReedFault: () => {
    useFieldbusStore.getState().setFaultSuppressGripperClosedReed(true)
    useFieldbusStore.getState().setDO(1, true, 'FAULT')
    get().triggerFault('IO_GRIPPER_TIMEOUT')
  },

  restoreGripperReedSensor: () => {
    useFieldbusStore.getState().setFaultSuppressGripperClosedReed(false)
    useFieldbusStore.getState().setDO(1, false, 'ROBOT')
    useFieldbusStore.getState().setDI(5, true, 'PLC_SIM')
  },

  injectCncDoorCollisionFault: () => {
    useFieldbusStore.getState().setFaultCncDoorStuckClosed(true)
    robotRuntime.cellObjects.cncDoorOpenFraction = 0
    // Place robot right near the CNC door plane so user sees it must jog clear in T1 WORLD!
    const st = get()
    const ik = solveIKFromPose(
      { x: 980, y: 310, z: 780, w: 180, p: 0, r: 0 },
      robotRuntime.joints,
      st.tool,
    )
    if (ik.reachable) {
      robotRuntime.joints = ik.joints
      robotRuntime.fk = computeFK(ik.joints, st.tool, st.userFrame)
    }
    set((state) => ({
      safetyZones: state.safetyZones.map((z) =>
        z.kind === 'CNC_DOOR' ? { ...z, enabled: true } : z,
      ),
    }))
    get().triggerFault('SRVO_050_COLLISION_OVERTORQUE')
    get().syncHudFromRuntime()
  },

  restoreCncDoorInterlock: () => {
    useFieldbusStore.getState().setFaultCncDoorStuckClosed(false)
    robotRuntime.cellObjects.cncDoorOpenFraction = 1
    set((state) => ({
      safetyZones: state.safetyZones.map((z) =>
        z.kind === 'CNC_DOOR' ? { ...z, enabled: false } : z,
      ),
    }))
  },

  randomizeBillet: () => {
    const x = Number(((Math.random() - 0.5) * 80).toFixed(1))
    const y = Number(((Math.random() - 0.5) * 70).toFixed(1))
    const rz = Number(((Math.random() - 0.5) * 44).toFixed(1))
    robotRuntime.cellObjects.billetOffset = { x, y, rz }
    if (!robotRuntime.cellObjects.holdingPart) {
      robotRuntime.cellObjects.partWorldPos = [960 + x, -560 + y, 505]
      robotRuntime.cellObjects.partRotZDeg = rz
    }
    useFieldbusStore.getState().setDI(1, true, 'PLC_SIM')
    useFieldbusStore.getState().setDI(10, false, 'VISION')
  },

  syncHudFromRuntime: () => {
    const st = get()
    const sc = SCENARIOS[st.scenarioId]
    let tipErr = 0
    if (st.scenarioId === 'scenario1' && sc.physicalToolOffsetMm) {
      const trueFk = computeFK(
        robotRuntime.joints,
        {
          id: 99,
          name: 'PhysicalTip',
          x: sc.physicalToolOffsetMm[0],
          y: sc.physicalToolOffsetMm[1],
          z: sc.physicalToolOffsetMm[2],
          w: 0,
          p: 0,
          r: 0,
          endEffectorType: 'torch',
        },
        DEFAULT_USER_FRAME,
      )
      const p = trueFk.tcpWorldPose
      tipErr = Math.hypot(p.x - 1080, p.y - 0, p.z - 620)
    }

    set({
      hudJoints: [...robotRuntime.joints] as JointAngles,
      hudJointVel: [...robotRuntime.jointVelocities] as JointAngles,
      hudTcpWorld: { ...robotRuntime.fk.tcpWorldPose },
      hudTcpUser: { ...robotRuntime.fk.tcpUserPose },
      hudSingularity: { ...robotRuntime.singularity },
      hudCycleTimeSec: robotRuntime.execState.cycleElapsedSec,
      hudPhysicalTipErrorMm: tipErr,
      activeLineIndex: robotRuntime.execState.instructionIndex,
    })
  },

  updateTelemetry: (updater) => {
    const id = get().scenarioId
    set((state) => ({
      telemetryByScenario: {
        ...state.telemetryByScenario,
        [id]: updater(state.telemetryByScenario[id]),
      },
    }))
  },
}))
