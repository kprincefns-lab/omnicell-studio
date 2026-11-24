import {
  DEG2RAD,
  mat4FromRx,
  mat4FromRy,
  mat4FromRz,
  mat4FromTranslation,
  mat4GetTranslation,
  mat4Identity,
  mat4InvertRigid,
  mat4Mul,
  mat4ToPose,
  poseToMat4,
} from './math3d'
import {
  OMNI_ROBOT_SPEC,
  type FKResult,
  type JointAngles,
  type Mat4,
  type RobotKinematicsSpec,
  type ToolFrame,
  type UserFrame,
} from './types'

export const DEFAULT_TOOL_FRAME: ToolFrame = {
  id: 1,
  name: 'UTOOL[1] Tool0',
  x: 0,
  y: 0,
  z: 0,
  w: 0,
  p: 0,
  r: 0,
  endEffectorType: 'gripper',
}

export const DEFAULT_USER_FRAME: UserFrame = {
  id: 0,
  name: 'UFRAME[0] World',
  x: 0,
  y: 0,
  z: 0,
  w: 0,
  p: 0,
  r: 0,
}

export function toolFrameToMat4(tool: ToolFrame): Mat4 {
  return poseToMat4({
    x: tool.x,
    y: tool.y,
    z: tool.z,
    w: tool.w,
    p: tool.p,
    r: tool.r,
  })
}

export function userFrameToMat4(uframe: UserFrame): Mat4 {
  return poseToMat4({
    x: uframe.x,
    y: uframe.y,
    z: uframe.z,
    w: uframe.w,
    p: uframe.p,
    r: uframe.r,
  })
}

/**
 * Computes exact Forward Kinematics for all 6 joints, ISO 9787 flange (+Z approach),
 * active UTOOL TCP, and active UFRAME Cartesian readout.
 *
 * Zero pose [0, 0, 0, 0, 0, 0]:
 * - Base at (0,0,0), Z up
 * - J1 rotates about +Z
 * - J2 at (a1, 0, d1), rotates about +Y (upper arm points +Z at q2=0)
 * - J3 at (0, 0, a2) from J2, rotates about +Y (forearm points +X at q2=0,q3=0)
 * - J4 rotates about +X (forearm centerline)
 * - J5 wrist center at (d4, 0, a3) from J3, rotates about +Y (q5=0 -> wrist singularity)
 * - J6 rotates about +X
 * - Flange at (d6, 0, 0) from J5, rotated Ry(+90 deg) so Flange +Z points along tool approach
 */
export function computeFK(
  joints: JointAngles,
  tool: ToolFrame = DEFAULT_TOOL_FRAME,
  userFrame: UserFrame = DEFAULT_USER_FRAME,
  spec: RobotKinematicsSpec = OMNI_ROBOT_SPEC,
): FKResult {
  const [q1, q2, q3, q4, q5, q6] = joints.map((d) => d * DEG2RAD)

  const base = mat4Identity()
  const j1 = mat4FromRz(q1)
  const j2 = mat4Mul(mat4Mul(j1, mat4FromTranslation(spec.a1, 0, spec.d1)), mat4FromRy(q2))
  const j3 = mat4Mul(mat4Mul(j2, mat4FromTranslation(0, 0, spec.a2)), mat4FromRy(q3))

  // J4 rotates around forearm +X axis (centered at wrist offset z=a3)
  const j4 = mat4Mul(mat4Mul(j3, mat4FromTranslation(spec.d4 * 0.45, 0, spec.a3)), mat4FromRx(q4))
  // J5 spherical wrist center sits at (d4, 0, a3) in J3 frame
  const j5 = mat4Mul(mat4Mul(j4, mat4FromTranslation(spec.d4 * 0.55, 0, 0)), mat4FromRy(q5))
  const j6 = mat4Mul(j5, mat4FromRx(q6))

  // Flange center at +d6 along J6 +X, rotated Ry(+90 deg) so Flange +Z aligns with tool approach
  const flange = mat4Mul(
    mat4Mul(j6, mat4FromTranslation(spec.d6, 0, 0)),
    mat4FromRy(Math.PI / 2),
  )

  const tTool = toolFrameToMat4(tool)
  const tcp = mat4Mul(flange, tTool)

  const tUFrameInv = mat4InvertRigid(userFrameToMat4(userFrame))
  const tcpInUser = mat4Mul(tUFrameInv, tcp)

  const linkPoints = [
    mat4GetTranslation(base),
    [0, 0, spec.d1] as [number, number, number],
    mat4GetTranslation(j2),
    mat4GetTranslation(j3),
    mat4GetTranslation(j5),
    mat4GetTranslation(flange),
    mat4GetTranslation(tcp),
  ]

  return {
    frames: { base, j1, j2, j3, j4, j5, j6, flange, tcp },
    linkPoints,
    flangePose: mat4ToPose(flange),
    tcpWorldPose: mat4ToPose(tcp),
    tcpUserPose: mat4ToPose(tcpInUser),
  }
}
