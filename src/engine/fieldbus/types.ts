export type DigitalSignalIndex =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16

export type VisionRegisterIndex = 1 | 2 | 3 | 4

export interface SignalDefinition {
  index: DigitalSignalIndex
  direction: 'DI' | 'DO'
  symbol: string
  shortLabel: string
  description: string
  /** Planned PROFINET / EtherNet/IP mapping for Phase 3 PLC integration */
  plcAddress: string
  safetyCritical?: boolean
}

export interface VisionOffset {
  /** Millimeters */
  x: number
  y: number
  z: number
  /** Degrees (W, P, R) */
  rx: number
  ry: number
  rz: number
  /** Whether offset has been populated by latest vision snap */
  valid: boolean
  /** Timestamp of capture */
  timestampMs: number
  /** Match score 0..100% */
  score: number
}

export type DigitalBank = Record<DigitalSignalIndex, boolean>
export type VisionBank = Record<VisionRegisterIndex, VisionOffset>

export const DI_DEFINITIONS: readonly SignalDefinition[] = [
  { index: 1, direction: 'DI', symbol: 'PartPresent_Infeed', shortLabel: 'PART_IN', description: 'Infeed conveyor photo-eye detects billet', plcAddress: 'Q0.0 / O:0.0' },
  { index: 2, direction: 'DI', symbol: 'CNC_DoorOpen', shortLabel: 'CNC_DOOR', description: 'CNC enclosure door fully open limit switch', plcAddress: 'Q0.1 / O:0.1' },
  { index: 3, direction: 'DI', symbol: 'Clamp_Released', shortLabel: 'CLMP_REL', description: 'CNC pneumatic chuck jaws unclamped', plcAddress: 'Q0.2 / O:0.2' },
  { index: 4, direction: 'DI', symbol: 'Gripper_ClosedReed', shortLabel: 'GRP_CLS', description: 'EOAT parallel gripper closed reed switch', plcAddress: 'Q0.3 / O:0.3' },
  { index: 5, direction: 'DI', symbol: 'Gripper_OpenReed', shortLabel: 'GRP_OPN', description: 'EOAT parallel gripper open reed switch', plcAddress: 'Q0.4 / O:0.4' },
  { index: 6, direction: 'DI', symbol: 'SafetyFence_OK', shortLabel: 'FENCE_OK', description: 'Dual-channel cell safety gate interlock healthy', plcAddress: 'Q0.5 / O:0.5', safetyCritical: true },
  { index: 7, direction: 'DI', symbol: 'PLC_CycleStart', shortLabel: 'CYC_STRT', description: 'Master PLC auto-cycle permission signal', plcAddress: 'Q0.6 / O:0.6' },
  { index: 8, direction: 'DI', symbol: 'FaultReset', shortLabel: 'FLT_RST', description: 'Remote PLC alarm acknowledge / reset pulse', plcAddress: 'Q0.7 / O:0.7' },
  { index: 9, direction: 'DI', symbol: 'Vision_Ready', shortLabel: 'VIS_RDY', description: '2D overhead vision camera idle & ready', plcAddress: 'Q1.0 / O:0.8' },
  { index: 10, direction: 'DI', symbol: 'Vision_Pass', shortLabel: 'VIS_OK', description: 'Vision model found valid billet offset in VR[1]', plcAddress: 'Q1.1 / O:0.9' },
  { index: 11, direction: 'DI', symbol: 'Outfeed_TrayReady', shortLabel: 'TRAY_RDY', description: '2x2 output tray seated in nest', plcAddress: 'Q1.2 / O:0.10' },
  { index: 12, direction: 'DI', symbol: 'Operator_BayClear', shortLabel: 'BAY_CLR', description: 'Light curtain clear at operator load bay', plcAddress: 'Q1.3 / O:0.11', safetyCritical: true },
  { index: 13, direction: 'DI', symbol: 'AirPressure_OK', shortLabel: 'AIR_OK', description: 'Main pneumatic manifold > 5.5 bar', plcAddress: 'Q1.4 / O:0.12' },
  { index: 14, direction: 'DI', symbol: 'CNC_SpindleStopped', shortLabel: 'SPDL_0', description: 'CNC zero-speed spindle interlock verified', plcAddress: 'Q1.5 / O:0.13' },
  { index: 15, direction: 'DI', symbol: 'PLC_HoldRequest', shortLabel: 'PLC_HOLD', description: 'Immediate controlled cycle hold from PLC', plcAddress: 'Q1.6 / O:0.14' },
  { index: 16, direction: 'DI', symbol: 'PLC_Heartbeat', shortLabel: 'HBEAT', description: '1 Hz fieldbus watchdog toggle from PLC', plcAddress: 'Q1.7 / O:0.15' },
] as const

export const DO_DEFINITIONS: readonly SignalDefinition[] = [
  { index: 1, direction: 'DO', symbol: 'Gripper_CloseCmd', shortLabel: 'GRP_CMD', description: 'Solenoid command: ON=Close Gripper, OFF=Open', plcAddress: 'I0.0 / I:0.0' },
  { index: 2, direction: 'DO', symbol: 'CNC_ClampAndStart', shortLabel: 'CNC_GO', description: 'Command CNC chuck clamp, close door & start cycle', plcAddress: 'I0.1 / I:0.1' },
  { index: 3, direction: 'DO', symbol: 'Infeed_ConveyorRun', shortLabel: 'CONV_RUN', description: 'Index infeed conveyor belt until PartPresent', plcAddress: 'I0.2 / I:0.2' },
  { index: 4, direction: 'DO', symbol: 'Robot_AtHome', shortLabel: 'AT_HOME', description: 'Robot within home perch tolerance cube', plcAddress: 'I0.3 / I:0.3' },
  { index: 5, direction: 'DO', symbol: 'Robot_CycleComplete', shortLabel: 'CYC_DONE', description: 'Handshaking pulse confirming completed cycle', plcAddress: 'I0.4 / I:0.4' },
  { index: 6, direction: 'DO', symbol: 'Robot_FaultActive', shortLabel: 'FLT_ACT', description: 'Controller faulted — requires operator triage', plcAddress: 'I0.5 / I:0.5', safetyCritical: true },
  { index: 7, direction: 'DO', symbol: 'Vision_Trigger', shortLabel: 'VIS_TRG', description: 'Trigger overhead 2D vision camera capture', plcAddress: 'I0.6 / I:0.6' },
  { index: 8, direction: 'DO', symbol: 'Robot_InCNCZone', shortLabel: 'IN_CNC', description: 'Interlock: arm envelope inside CNC enclosure', plcAddress: 'I0.7 / I:0.7', safetyCritical: true },
  { index: 9, direction: 'DO', symbol: 'Weld_ArcEnable', shortLabel: 'ARC_ON', description: 'MIG welding power source arc start command', plcAddress: 'I1.0 / I:0.8' },
  { index: 10, direction: 'DO', symbol: 'Robot_AutoMode', shortLabel: 'AUTO_ON', description: 'Keyswitch in AUTO & servos enabled', plcAddress: 'I1.1 / I:0.9' },
  { index: 11, direction: 'DO', symbol: 'Robot_Busy', shortLabel: 'BUSY', description: 'Motion planner actively executing program', plcAddress: 'I1.2 / I:0.10' },
  { index: 12, direction: 'DO', symbol: 'DCS_ZoneSafe', shortLabel: 'DCS_OK', description: 'Dual Check Safety Cartesian envelope clear', plcAddress: 'I1.3 / I:0.11', safetyCritical: true },
  { index: 13, direction: 'DO', symbol: 'Part_Gripped', shortLabel: 'PART_OK', description: 'Confirmed part retained in parallel jaws', plcAddress: 'I1.4 / I:0.12' },
  { index: 14, direction: 'DO', symbol: 'Spare_DO14', shortLabel: 'DO_14', description: 'User-assignable fieldbus output 14', plcAddress: 'I1.5 / I:0.13' },
  { index: 15, direction: 'DO', symbol: 'Spare_DO15', shortLabel: 'DO_15', description: 'User-assignable fieldbus output 15', plcAddress: 'I1.6 / I:0.14' },
  { index: 16, direction: 'DO', symbol: 'Robot_Heartbeat', shortLabel: 'R_HBEAT', description: '1 Hz controller watchdog toggle to PLC', plcAddress: 'I1.7 / I:0.15' },
] as const

export function createDefaultDI(): DigitalBank {
  return {
    1: true,
    2: true,
    3: true,
    4: false,
    5: true,
    6: true,
    7: true,
    8: false,
    9: true,
    10: false,
    11: true,
    12: true,
    13: true,
    14: true,
    15: false,
    16: false,
  }
}

export function createDefaultDO(): DigitalBank {
  return {
    1: false,
    2: false,
    3: false,
    4: true,
    5: false,
    6: false,
    7: false,
    8: false,
    9: false,
    10: false,
    11: false,
    12: true,
    13: false,
    14: false,
    15: false,
    16: false,
  }
}

export function createEmptyVisionOffset(): VisionOffset {
  return {
    x: 0,
    y: 0,
    z: 0,
    rx: 0,
    ry: 0,
    rz: 0,
    valid: false,
    timestampMs: 0,
    score: 0,
  }
}

export function createDefaultVR(): VisionBank {
  return {
    1: createEmptyVisionOffset(),
    2: createEmptyVisionOffset(),
    3: createEmptyVisionOffset(),
    4: createEmptyVisionOffset(),
  }
}
