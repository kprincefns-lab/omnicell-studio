export type PlcBrandStyle = 'SIEMENS' | 'AB' | 'CODESYS'

export type PlcContactType = 'XIC' | 'XIO'
export type PlcCoilType = 'OTE' | 'OTL' | 'OTU'
export type PlcTimerId = 'T0' | 'T1' | 'T2' | 'T3'

export type PlcTagId =
  | 'PB_START'
  | 'PB_STOP'
  | 'PB_RESET'
  | 'M0'
  | 'M1'
  | 'M2'
  | 'M3'
  | 'T0.DN'
  | 'T1.DN'
  | 'T2.DN'
  | 'T3.DN'
  | 'DO[1]'
  | 'DO[2]'
  | 'DO[4]'
  | 'DO[5]'
  | 'DO[6]'
  | 'DO[9]'
  | 'DO[11]'
  | 'DI[1]'
  | 'DI[2]'
  | 'DI[4]'
  | 'DI[5]'
  | 'DI[6]'
  | 'DI[7]'
  | 'DI[8]'
  | 'DI[15]'

export interface PlcTagMeta {
  id: PlcTagId
  label: string
  category: 'PUSHBUTTON' | 'MEMORY' | 'TIMER' | 'ROBOT_OUT' | 'ROBOT_IN'
  writable: boolean
  siemensAddr: string
  abAddr: string
}

export const PLC_TAGS: readonly PlcTagMeta[] = [
  // Operator Pushbuttons
  { id: 'PB_START', label: 'PB1 Cycle Start', category: 'PUSHBUTTON', writable: false, siemensAddr: '%I2.0', abAddr: 'HMI_PB_Start' },
  { id: 'PB_STOP', label: 'PB2 Cycle Stop', category: 'PUSHBUTTON', writable: false, siemensAddr: '%I2.1', abAddr: 'HMI_PB_Stop' },
  { id: 'PB_RESET', label: 'PB3 Fault Reset', category: 'PUSHBUTTON', writable: false, siemensAddr: '%I2.2', abAddr: 'HMI_PB_Reset' },

  // Internal PLC Memory Bits
  { id: 'M0', label: 'M0 AutoMode_Latch', category: 'MEMORY', writable: true, siemensAddr: '%M0.0', abAddr: 'Cell_AutoRun' },
  { id: 'M1', label: 'M1 Fault_Latch', category: 'MEMORY', writable: true, siemensAddr: '%M0.1', abAddr: 'Cell_FaultLatched' },
  { id: 'M2', label: 'M2 Aux_Flag_2', category: 'MEMORY', writable: true, siemensAddr: '%M0.2', abAddr: 'Cell_Aux2' },
  { id: 'M3', label: 'M3 Aux_Flag_3', category: 'MEMORY', writable: true, siemensAddr: '%M0.3', abAddr: 'Cell_Aux3' },

  // Timer Done Bits
  { id: 'T0.DN', label: 'T0 Timer Done', category: 'TIMER', writable: false, siemensAddr: 'TON_0.Q', abAddr: 'T0.DN' },
  { id: 'T1.DN', label: 'T1 Timer Done', category: 'TIMER', writable: false, siemensAddr: 'TON_1.Q', abAddr: 'T1.DN' },
  { id: 'T2.DN', label: 'T2 Timer Done', category: 'TIMER', writable: false, siemensAddr: 'TON_2.Q', abAddr: 'T2.DN' },
  { id: 'T3.DN', label: 'T3 Timer Done', category: 'TIMER', writable: false, siemensAddr: 'TON_3.Q', abAddr: 'T3.DN' },

  // Robot Outputs (Read by PLC)
  { id: 'DO[1]', label: 'DO[1] Gripper_Cmd', category: 'ROBOT_OUT', writable: false, siemensAddr: '%I0.0', abAddr: 'Robot:I.Data.0' },
  { id: 'DO[2]', label: 'DO[2] CNC_Start', category: 'ROBOT_OUT', writable: false, siemensAddr: '%I0.1', abAddr: 'Robot:I.Data.1' },
  { id: 'DO[4]', label: 'DO[4] Robot_AtHome', category: 'ROBOT_OUT', writable: false, siemensAddr: '%I0.3', abAddr: 'Robot:I.Data.3' },
  { id: 'DO[5]', label: 'DO[5] Cycle_Done', category: 'ROBOT_OUT', writable: false, siemensAddr: '%I0.4', abAddr: 'Robot:I.Data.4' },
  { id: 'DO[6]', label: 'DO[6] Robot_Fault', category: 'ROBOT_OUT', writable: false, siemensAddr: '%I0.5', abAddr: 'Robot:I.Data.5' },
  { id: 'DO[9]', label: 'DO[9] Weld/Laser_On', category: 'ROBOT_OUT', writable: false, siemensAddr: '%I1.0', abAddr: 'Robot:I.Data.8' },
  { id: 'DO[11]', label: 'DO[11] Robot_Busy', category: 'ROBOT_OUT', writable: false, siemensAddr: '%I1.2', abAddr: 'Robot:I.Data.10' },

  // PLC Outputs (Drive 3D Robot Cell DI[])
  { id: 'DI[1]', label: 'DI[1] PartPresent', category: 'ROBOT_IN', writable: true, siemensAddr: '%Q0.0', abAddr: 'Robot:O.Data.0' },
  { id: 'DI[2]', label: 'DI[2] CNC_DoorOpen', category: 'ROBOT_IN', writable: true, siemensAddr: '%Q0.1', abAddr: 'Robot:O.Data.1' },
  { id: 'DI[4]', label: 'DI[4] Grip_Closed', category: 'ROBOT_IN', writable: true, siemensAddr: '%Q0.3', abAddr: 'Robot:O.Data.3' },
  { id: 'DI[5]', label: 'DI[5] Grip_Open', category: 'ROBOT_IN', writable: true, siemensAddr: '%Q0.4', abAddr: 'Robot:O.Data.4' },
  { id: 'DI[6]', label: 'DI[6] SafetyFence_OK', category: 'ROBOT_IN', writable: true, siemensAddr: '%Q0.5', abAddr: 'Robot:O.Data.5' },
  { id: 'DI[7]', label: 'DI[7] PLC_CycleStart', category: 'ROBOT_IN', writable: true, siemensAddr: '%Q0.6', abAddr: 'Robot:O.Data.6' },
  { id: 'DI[8]', label: 'DI[8] FaultReset', category: 'ROBOT_IN', writable: true, siemensAddr: '%Q0.7', abAddr: 'Robot:O.Data.7' },
  { id: 'DI[15]', label: 'DI[15] PLC_HoldReq', category: 'ROBOT_IN', writable: true, siemensAddr: '%Q1.6', abAddr: 'Robot:O.Data.14' },
] as const

export const WRITABLE_PLC_TAGS = PLC_TAGS.filter((t) => t.writable)

export interface LadderCondition {
  id: string
  type: PlcContactType
  tag: PlcTagId
}

export interface LadderTimerConfig {
  timerId: PlcTimerId
  presetSec: number
}

export interface LadderCoil {
  type: PlcCoilType
  tag: PlcTagId
}

export interface LadderRung {
  id: string
  comment: string
  conditions: LadderCondition[]
  /** Optional parallel OR seal-in branch across the first contact */
  parallelBranchTag?: PlcTagId
  /** Optional IEC On-Delay Timer before coil */
  timer?: LadderTimerConfig
  coil: LadderCoil
}

export interface TimerRuntimeState {
  accSec: number
  presetSec: number
  tt: boolean // Timer Timing
  dn: boolean // Timer Done
}

export interface RungLiveState {
  conditionPass: boolean[]
  branchPass: boolean
  preTimerPower: boolean
  rungEnergized: boolean
}
