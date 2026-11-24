import {
  DEG2RAD,
  RAD2DEG,
  clamp,
  mat4FromRy,
  mat4FromRz,
  mat4InvertRigid,
  mat4Mul,
  poseToMat4,
} from './math3d'
import { DEFAULT_TOOL_FRAME, toolFrameToMat4, userFrameToMat4 } from './fk'
import {
  OMNI_ROBOT_SPEC,
  type CartesianPose,
  type CoordinateFrameMode,
  type IKResult,
  type JointAngles,
  type Mat4,
  type RobotKinematicsSpec,
  type ToolFrame,
  type UserFrame,
} from './types'

function unwrapNear(angleDeg: number, refDeg: number, minDeg: number, maxDeg: number): number | null {
  // Choose k * 360 closest to refDeg within [minDeg, maxDeg]
  const candidates = [angleDeg - 720, angleDeg - 360, angleDeg, angleDeg + 360, angleDeg + 720]
  let best: number | null = null
  let bestDist = Infinity
  for (const c of candidates) {
    if (c >= minDeg - 1e-4 && c <= maxDeg + 1e-4) {
      const clamped = clamp(c, minDeg, maxDeg)
      const d = Math.abs(clamped - refDeg)
      if (d < bestDist) {
        bestDist = d
        best = clamped
      }
    }
  }
  return best
}

/**
 * Exact closed-form spherical-wrist Inverse Kinematics solver.
 * Evaluates all valid shoulder/elbow/wrist branches and picks the continuous
 * solution closest to `currentJoints` within mechanical joint limits.
 */
export function solveIKFromMat4(
  targetTcpWorld: Mat4,
  currentJoints: JointAngles,
  tool: ToolFrame = DEFAULT_TOOL_FRAME,
  spec: RobotKinematicsSpec = OMNI_ROBOT_SPEC,
): IKResult {
  const tToolInv = mat4InvertRigid(toolFrameToMat4(tool))
  const tFlange = mat4Mul(targetTcpWorld, tToolInv)

  // Flange +Z (column 2) is the tool approach vector pointing outward from J5 -> Flange
  const ax = tFlange[2]
  const ay = tFlange[6]
  const az = tFlange[10]

  // Spherical wrist center P_wc = P_flange - d6 * approach
  const wx = tFlange[3] - spec.d6 * ax
  const wy = tFlange[7] - spec.d6 * ay
  const wz = tFlange[11] - spec.d6 * az

  const lFore = Math.hypot(spec.d4, spec.a3)
  const alpha = Math.atan2(spec.a3, spec.d4)

  // Candidate base angles (front / back shoulder)
  const rho = Math.hypot(wx, wy)
  const q1Base = rho > 1e-5 ? Math.atan2(wy, wx) : currentJoints[0] * DEG2RAD
  const q1Candidates = [q1Base, q1Base + Math.PI]

  // Rotation matrix of J6 frame relative to world: R_flange * Ry(-90 deg)
  const rJ6Target = mat4Mul(tFlange, mat4FromRy(-Math.PI / 2))

  let bestSolution: JointAngles | null = null
  let bestCost = Infinity
  let anyReachableButLimit = false
  let bestWristSingular = false

  // Joint weighting favors keeping big axes & wrist flip smooth
  const weights = [1.4, 1.4, 1.2, 0.85, 1.0, 0.45]

  for (const q1Raw of q1Candidates) {
    const q1Deg = unwrapNear(q1Raw * RAD2DEG, currentJoints[0], spec.jointMin[0], spec.jointMax[0])
    if (q1Deg === null) {
      anyReachableButLimit = true
      continue
    }
    const q1 = q1Deg * DEG2RAD

    const r = wx * Math.cos(q1) + wy * Math.sin(q1) - spec.a1
    const z = wz - spec.d1

    const dSq = r * r + z * z
    const s = (dSq - spec.a2 * spec.a2 - lFore * lFore) / (2 * spec.a2 * lFore)
    if (s < -1.0001 || s > 1.0001) {
      continue
    }
    const sClamped = clamp(s, -1, 1)
    const cosTerm = Math.sqrt(Math.max(0, 1 - sClamped * sClamped))

    // Two elbow configurations: elbow-up (+cosTerm) and elbow-down (-cosTerm)
    const elbowSigns = [1, -1]
    for (const elbowSign of elbowSigns) {
      const q3 = alpha - Math.atan2(sClamped, elbowSign * cosTerm)
      const q3Deg = unwrapNear(q3 * RAD2DEG, currentJoints[2], spec.jointMin[2], spec.jointMax[2])
      if (q3Deg === null) {
        anyReachableButLimit = true
        continue
      }

      const q3Rad = q3Deg * DEG2RAD
      const k1 = spec.a2 - lFore * Math.sin(q3Rad - alpha)
      const k2 = lFore * Math.cos(q3Rad - alpha)
      const q2 = Math.atan2(r, z) - Math.atan2(k2, k1)
      const q2Deg = unwrapNear(q2 * RAD2DEG, currentJoints[1], spec.jointMin[1], spec.jointMax[1])
      if (q2Deg === null) {
        anyReachableButLimit = true
        continue
      }
      const q2Rad = q2Deg * DEG2RAD

      // Compute wrist orientation R_wrist = R_03^T * R_J6 = Rx(q4) * Ry(q5) * Rx(q6)
      // R_03 = Rz(q1) * Ry(q2 + q3)
      const r03 = mat4Mul(mat4FromRz(q1), mat4FromRy(q2Rad + q3Rad))
      const r03T = mat4InvertRigid(r03)
      const rw = mat4Mul(r03T, rJ6Target)

      // Expand Rx(q4) * Ry(q5) * Rx(q6):
      // Row 0: [ cos(q5),          sin(q5)*sin(q6),                sin(q5)*cos(q6)              ]
      // Col 0: [ cos(q5),          sin(q4)*sin(q5),               -cos(q4)*sin(q5)              ]
      // Wait: verify Rx(a)*Ry(b)*Rx(c) entries:
      // Rx(a) = [1,0,0; 0,ca,-sa; 0,sa,ca]
      // Ry(b) = [cb,0,sb; 0,1,0; -sb,0,cb]
      // Rx(a)*Ry(b) = [cb, 0, sb; sa*sb, ca, -sa*cb; -ca*sb, sa, ca*cb]
      // Multiply by Rx(c) = [1,0,0; 0,cc,-sc; 0,sc,cc]:
      // [0,0] = cb
      // [0,1] = sb * sc
      // [0,2] = sb * cc
      // [1,0] = sa * sb
      // [2,0] = -ca * sb
      const cosQ5 = clamp(rw[0], -1, 1)
      const absQ5 = Math.acos(cosQ5)
      const isSingular = Math.sin(absQ5) < 1e-4

      const wristBranches: Array<[number, number, number]> = []
      if (isSingular) {
        // Near J5 = 0 or 180: hold q4 = currentJoints[3], absorb remaining roll into q6
        const q4Hold = currentJoints[3] * DEG2RAD
        // At q5=0: Rx(q4 + q6) = rw => rw[5] = cos(q4+q6), rw[9] = sin(q4+q6)
        // At q5=pi: Rx(q4 - q6) => rw[5] = cos(q4-q6), rw[9] = sin(q4-q6)
        const sumAngle = Math.atan2(rw[9], rw[5])
        const q6Calc = cosQ5 > 0 ? sumAngle - q4Hold : q4Hold - sumAngle
        wristBranches.push([q4Hold, cosQ5 > 0 ? 0 : Math.PI, q6Calc])
      } else {
        // Non-flip (+absQ5) and flip (-absQ5)
        for (const sign of [1, -1]) {
          const q5 = sign * absQ5
          const s5 = Math.sin(q5)
          const q4 = Math.atan2(rw[4] / s5, -rw[8] / s5)
          const q6 = Math.atan2(rw[1] / s5, rw[2] / s5)
          wristBranches.push([q4, q5, q6])
        }
      }

      for (const [q4Rad, q5Rad, q6Rad] of wristBranches) {
        const q4Deg = unwrapNear(q4Rad * RAD2DEG, currentJoints[3], spec.jointMin[3], spec.jointMax[3])
        const q5Deg = unwrapNear(q5Rad * RAD2DEG, currentJoints[4], spec.jointMin[4], spec.jointMax[4])
        const q6Deg = unwrapNear(q6Rad * RAD2DEG, currentJoints[5], spec.jointMin[5], spec.jointMax[5])
        if (q4Deg === null || q5Deg === null || q6Deg === null) {
          anyReachableButLimit = true
          continue
        }

        const candidate: JointAngles = [q1Deg, q2Deg, q3Deg, q4Deg, q5Deg, q6Deg]
        let cost = 0
        for (let i = 0; i < 6; i++) {
          const diff = candidate[i] - currentJoints[i]
          cost += weights[i] * diff * diff
        }
        // Slight preference for elbow-up when nearly tied
        if (elbowSign < 0) cost += 250

        if (cost < bestCost) {
          bestCost = cost
          bestSolution = candidate
          bestWristSingular = isSingular || Math.abs(q5Deg) < 2.5
        }
      }
    }
  }

  if (!bestSolution) {
    return {
      reachable: false,
      joints: currentJoints,
      errorCode: anyReachableButLimit ? 'JOINT_LIMIT' : 'OUT_OF_REACH',
      message: anyReachableButLimit
        ? 'MOTN-018 Position not reachable (Axis joint limit exceeded)'
        : 'MOTN-018 Position not reachable (Target outside kinematic envelope)',
      wristSingular: false,
    }
  }

  return {
    reachable: true,
    joints: bestSolution,
    wristSingular: bestWristSingular,
  }
}

export function solveIKFromPose(
  pose: CartesianPose,
  currentJoints: JointAngles,
  tool: ToolFrame = DEFAULT_TOOL_FRAME,
  spec: RobotKinematicsSpec = OMNI_ROBOT_SPEC,
): IKResult {
  return solveIKFromMat4(poseToMat4(pose), currentJoints, tool, spec)
}

/**
 * Applies an incremental Cartesian jog delta (dx, dy, dz in mm; dw, dp, dr in deg)
 * in the active coordinate frame (WORLD, TOOL, or USER) and solves IK.
 */
export function applyCartesianJog(
  currentTcpWorld: Mat4,
  currentJoints: JointAngles,
  frame: Exclude<CoordinateFrameMode, 'JOINT'>,
  delta: CartesianPose,
  tool: ToolFrame,
  userFrame: UserFrame,
  spec: RobotKinematicsSpec = OMNI_ROBOT_SPEC,
): IKResult {
  const deltaRot = poseToMat4({ x: 0, y: 0, z: 0, w: delta.w, p: delta.p, r: delta.r })

  let nextTcp: Mat4

  if (frame === 'TOOL') {
    // Post-multiply in active TCP frame: pure rotation around TCP origin leaves TCP position invariant!
    const deltaMat = poseToMat4(delta)
    nextTcp = mat4Mul(currentTcpWorld, deltaMat)
  } else if (frame === 'WORLD') {
    // Translate in World axes, rotate about TCP origin aligned with World axes
    const rotOnly: Mat4 = [
      currentTcpWorld[0], currentTcpWorld[1], currentTcpWorld[2], 0,
      currentTcpWorld[4], currentTcpWorld[5], currentTcpWorld[6], 0,
      currentTcpWorld[8], currentTcpWorld[9], currentTcpWorld[10], 0,
      0, 0, 0, 1,
    ]
    const rotated = mat4Mul(deltaRot, rotOnly)
    nextTcp = [
      rotated[0], rotated[1], rotated[2], currentTcpWorld[3] + delta.x,
      rotated[4], rotated[5], rotated[6], currentTcpWorld[7] + delta.y,
      rotated[8], rotated[9], rotated[10], currentTcpWorld[11] + delta.z,
      0, 0, 0, 1,
    ]
  } else {
    // USER frame: transform TCP into UFRAME, apply World-style delta inside UFRAME, transform back
    const tUser = userFrameToMat4(userFrame)
    const tUserInv = mat4InvertRigid(tUser)
    const tcpInUser = mat4Mul(tUserInv, currentTcpWorld)
    const rotOnly: Mat4 = [
      tcpInUser[0], tcpInUser[1], tcpInUser[2], 0,
      tcpInUser[4], tcpInUser[5], tcpInUser[6], 0,
      tcpInUser[8], tcpInUser[9], tcpInUser[10], 0,
      0, 0, 0, 1,
    ]
    const rotated = mat4Mul(deltaRot, rotOnly)
    const nextInUser: Mat4 = [
      rotated[0], rotated[1], rotated[2], tcpInUser[3] + delta.x,
      rotated[4], rotated[5], rotated[6], tcpInUser[7] + delta.y,
      rotated[8], rotated[9], rotated[10], tcpInUser[11] + delta.z,
      0, 0, 0, 1,
    ]
    nextTcp = mat4Mul(tUser, nextInUser)
  }

  return solveIKFromMat4(nextTcp, currentJoints, tool, spec)
}
