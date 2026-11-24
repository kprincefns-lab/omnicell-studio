export type JointAngles = [number, number, number, number, number, number]

export type Vec3 = [number, number, number]

/** Row-major 4x4 homogeneous transformation matrix (length 16) */
export type Mat4 = [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
]

/** Industrial Cartesian pose: position in mm, orientation in W, P, R degrees (extrinsic XYZ / intrinsic ZYX: Rz(R)*Ry(P)*Rx(W)) */
export interface CartesianPose {
  x: number
  y: number
  z: number
  w: number
  p: number
  r: number
}

export interface ToolFrame {
  id: number
  name: string
  /** Offset from flange center in flange frame (mm) */
  x: number
  y: number
  z: number
  /** Orientation offset in degrees */
  w: number
  p: number
  r: number
  endEffectorType: 'torch' | 'gripper'
}

export interface UserFrame {
  id: number
  name: string
  x: number
  y: number
  z: number
  w: number
  p: number
  r: number
}

export interface RobotKinematicsSpec {
  modelName: string
  payloadKg: number
  reachMm: number
  /** Base pedestal height to J2 axis (mm) */
  d1: number
  /** Shoulder forward offset along +X (mm) */
  a1: number
  /** Upper arm length J2 -> J3 (mm) */
  a2: number
  /** Elbow vertical offset at J3 (mm) */
  a3: number
  /** Forearm length J3 -> J5 wrist center along +X (mm) */
  d4: number
  /** Wrist center J5 -> mounting flange face (mm) */
  d6: number
  jointMin: JointAngles
  jointMax: JointAngles
  jointMaxVelDegPerSec: JointAngles
  jointMaxAccDegPerSec2: JointAngles
}

/** 20kg payload class industrial 6-DOF articulated arm (M-20iD/25 / IRB 2600 class) */
export const OMNI_ROBOT_SPEC: RobotKinematicsSpec = {
  modelName: 'OMNI-R20iD/25',
  payloadKg: 25,
  reachMm: 1831,
  d1: 525,
  a1: 150,
  a2: 790,
  a3: 150,
  d4: 835,
  d6: 100,
  jointMin: [-185, -100, -135, -200, -140, -360],
  jointMax: [185, 145, 180, 200, 140, 360],
  jointMaxVelDegPerSec: [210, 210, 265, 420, 420, 720],
  jointMaxAccDegPerSec2: [650, 620, 780, 1200, 1200, 1800],
}

export interface FKResult {
  /** World 4x4 transforms for Base, J1, J2, J3, J4, J5, J6, Flange, TCP */
  frames: {
    base: Mat4
    j1: Mat4
    j2: Mat4
    j3: Mat4
    j4: Mat4
    j5: Mat4
    j6: Mat4
    flange: Mat4
    tcp: Mat4
  }
  /** Key link endpoints in World mm for collision capsules & 3D rendering */
  linkPoints: Vec3[]
  flangePose: CartesianPose
  tcpWorldPose: CartesianPose
  tcpUserPose: CartesianPose
}

export interface IKResult {
  reachable: boolean
  joints: JointAngles
  errorCode?: 'OUT_OF_REACH' | 'JOINT_LIMIT'
  message?: string
  wristSingular: boolean
}

export type SingularitySeverity = 'CLEAR' | 'WARNING' | 'CRITICAL'

export interface SingularityReport {
  severity: SingularitySeverity
  wristAngleDeg: number
  wristWarning: boolean
  wristCritical: boolean
  shoulderRadiusMm: number
  shoulderWarning: boolean
  elbowExtensionRatio: number
  elbowWarning: boolean
  /** Estimated J4/J6 amplification factor near J5 = 0 */
  wristVelocityMultiplier: number
  summary: string
}

export interface SafetyZone {
  id: string
  name: string
  kind: 'DCS_FORBIDDEN' | 'OBSTACLE' | 'CNC_DOOR'
  enabled: boolean
  /** Center in World mm */
  center: Vec3
  /** Full dimensions [widthX, depthY, heightZ] in mm */
  size: Vec3
  /** Optional Z-axis rotation in degrees for OBB support */
  rotationZDeg?: number
  color: string
  faultCode: string
  faultMessage: string
}

export interface SafetyCheckResult {
  safe: boolean
  violatedZone: SafetyZone | null
  violatedLinkName: string | null
  minClearanceMm: number
}

export type CoordinateFrameMode = 'JOINT' | 'WORLD' | 'TOOL' | 'USER'
export type ControllerMode = 'T1' | 'T2' | 'AUTO'
export type ExecutionMode = 'CONT' | 'STEP'
