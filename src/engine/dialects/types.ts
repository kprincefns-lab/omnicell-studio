import type { CartesianPose, JointAngles } from '../kinematics/types'
import type { DigitalSignalIndex, VisionRegisterIndex } from '../fieldbus/types'

export type OemDialect = 'FANUC' | 'ABB' | 'KUKA' | 'YASKAWA' | 'UR'

export interface DialectMeta {
  id: OemDialect
  name: string
  languageName: string
  accentColor: string
  fileExtension: string
  controllerFamily: string
}

export const OEM_DIALECTS: readonly DialectMeta[] = [
  {
    id: 'FANUC',
    name: 'FANUC',
    languageName: 'TP (Teach Pendant)',
    accentColor: '#FFD600',
    fileExtension: '.LS',
    controllerFamily: 'R-30iB Plus',
  },
  {
    id: 'ABB',
    name: 'ABB',
    languageName: 'RAPID',
    accentColor: '#FF3B30',
    fileExtension: '.mod',
    controllerFamily: 'OmniCore / IRC5',
  },
  {
    id: 'KUKA',
    name: 'KUKA',
    languageName: 'KRL',
    accentColor: '#FF6D00',
    fileExtension: '.src',
    controllerFamily: 'KR C5',
  },
  {
    id: 'YASKAWA',
    name: 'Yaskawa',
    languageName: 'INFORM III',
    accentColor: '#2979FF',
    fileExtension: '.JBI',
    controllerFamily: 'YRC1000',
  },
  {
    id: 'UR',
    name: 'UR',
    languageName: 'URScript',
    accentColor: '#00E5FF',
    fileExtension: '.script',
    controllerFamily: 'PolyScope e-Series',
  },
] as const

export type TerminationMode =
  | { kind: 'FINE' }
  | { kind: 'CNT'; value: number } // 0..100

export interface PositionRegister {
  /** P[1], P[2], ... or PR[1] */
  id: number
  isPR?: boolean
  name: string
  /** Preferred target definition: Cartesian world pose or explicit joint angles */
  representation: 'CARTESIAN' | 'JOINT'
  cartesian?: CartesianPose
  joints?: JointAngles
}

export type ProgramInstruction =
  | {
      id: string
      type: 'MOVE_J'
      targetId: number
      isPR?: boolean
      speedPercent: number // 1..100%
      termination: TerminationMode
      vOffsetReg?: VisionRegisterIndex
      comment?: string
    }
  | {
      id: string
      type: 'MOVE_L'
      targetId: number
      isPR?: boolean
      speedMmPerSec: number // 10..2000 mm/s
      termination: TerminationMode
      vOffsetReg?: VisionRegisterIndex
      comment?: string
    }
  | {
      id: string
      type: 'SET_DO'
      index: DigitalSignalIndex
      value: boolean
    }
  | {
      id: string
      type: 'WAIT_DI'
      index: DigitalSignalIndex
      value: boolean
      timeoutSec?: number
    }
  | {
      id: string
      type: 'WAIT_TIME'
      seconds: number
    }
  | {
      id: string
      type: 'LABEL'
      labelId: number
    }
  | {
      id: string
      type: 'JUMP'
      labelId: number
    }
  | {
      id: string
      type: 'IF_DI_JUMP'
      index: DigitalSignalIndex
      value: boolean
      labelId: number
    }
  | {
      id: string
      type: 'CALL_GRIPPER'
      action: 'CLOSE' | 'OPEN'
    }
  | {
      id: string
      type: 'VISION_CAPTURE'
      vrIndex: VisionRegisterIndex
      modelName: string
    }
  | {
      id: string
      type: 'COMMENT'
      text: string
    }

export interface RobotProgram {
  name: string
  instructions: ProgramInstruction[]
  positions: Record<number, PositionRegister>
}

export interface ParseResult {
  success: boolean
  instructions: ProgramInstruction[]
  errors: Array<{ line: number; message: string }>
}
