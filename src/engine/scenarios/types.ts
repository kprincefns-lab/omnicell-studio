import type { DigitalBank } from '../fieldbus/types'
import type { PositionRegister, ProgramInstruction } from '../dialects/types'
import type { JointAngles, SafetyZone, ToolFrame, UserFrame, Vec3 } from '../kinematics/types'

export type ScenarioId = 'scenario1' | 'scenario2' | 'scenario3' | 'scenario4' | 'freeteach'

export interface MissionObjective {
  id: string
  label: string
  description: string
}

export interface ScenarioDefinition {
  id: ScenarioId
  number: 1 | 2 | 3 | 4 | 5
  shortTitle: string
  title: string
  subtitle: string
  difficulty: 'FOUNDATION' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT' | 'SANDBOX'
  taktTargetSec?: number
  tool: ToolFrame
  /** True physical tool tip offset (used in Scenario 1 so student calibrates from 0,0,0 to match real torch) */
  physicalToolOffsetMm?: Vec3
  userFrame: UserFrame
  homeJoints: JointAngles
  initialPositions: Record<number, PositionRegister>
  initialProgramName: string
  initialInstructions: ProgramInstruction[]
  initialSafetyZones: SafetyZone[]
  initialFieldbusDI?: Partial<DigitalBank>
  objectives: MissionObjective[]
  /** Optional quick-load demo/test program (e.g. Scenario 3 unsafe DCS intrusion test) */
  secondaryProgram?: {
    label: string
    name: string
    instructions: ProgramInstruction[]
  }
}

export type ActiveFaultType =
  | 'NONE'
  | 'MOTN_023_SINGULARITY'
  | 'SYST_212_DCS_VIOLATION'
  | 'SYST_304_OBSTACLE_COLLISION'
  | 'SRVO_062_BZAL'
  | 'IO_GRIPPER_TIMEOUT'
  | 'SRVO_050_COLLISION_OVERTORQUE'
  | 'MOTN_018_UNREACHABLE'
  | 'ESTOP_ACTIVE'

export interface ControllerFault {
  code: string
  type: ActiveFaultType
  title: string
  detail: string
  recoverySteps: string[]
  timestamp: string
}

export interface MissionTelemetry {
  lastCycleTimeSec: number | null
  bestCycleTimeSec: number | null
  blendEfficiencyPct: number
  safetyBreachCount: number
  singularityWarningCount: number
  singularityFaultCount: number
  completedCycles: number
  tcpCalibrationRmsMm: number | null
  tcpRotationVerified: boolean
  framesExplored: string[]
  dcsVerifiedStop: boolean
  singularityResolved: boolean
  faultsTriaged: string[]
  freeTeachToolSwapped: boolean
  freeTeachPointsRecorded: number
}
