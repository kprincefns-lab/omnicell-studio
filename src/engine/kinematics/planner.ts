import type { PositionRegister, ProgramInstruction, TerminationMode } from '../dialects/types'
import type { VisionBank } from '../fieldbus/types'
import { computeFK, DEFAULT_TOOL_FRAME, DEFAULT_USER_FRAME } from './fk'
import { solveIKFromMat4, solveIKFromPose } from './ik'
import {
  clamp,
  mat4GetTranslation,
  mat4ToQuat,
  poseToMat4,
  quatSlerp,
  quatToMat4,
  vec3Dist,
  vec3Lerp,
} from './math3d'
import { checkSafetyZones } from './safetyZones'
import { evaluateSingularity, WRIST_SINGULARITY_FAULT_DEG } from './singularity'
import {
  OMNI_ROBOT_SPEC,
  type CartesianPose,
  type JointAngles,
  type Mat4,
  type SafetyZone,
  type ToolFrame,
  type UserFrame,
  type Vec3,
} from './types'

export interface MotionStepPlan {
  instructionIndex: number
  moveType: 'MOVE_J' | 'MOVE_L'
  startJoints: JointAngles
  endJoints: JointAngles
  startTcpMat: Mat4
  endTcpMat: Mat4
  durationSec: number
  termination: TerminationMode
  fineSettleSec: number
  /** Corner blend overlap time with next motion step (0 if FINE or next instruction is non-motion) */
  blendOverlapSec: number
}

export interface BlendZoneMarker {
  position: Vec3
  cntValue: number
  instructionIndex: number
}

export interface ProgramPathPreview {
  programmedPoints: Vec3[]
  blendedPoints: Vec3[]
  blendMarkers: BlendZoneMarker[]
  estimatedCycleTimeSec: number
  blendEfficiencyPct: number
  fineStopCount: number
  cntBlendCount: number
  predictedSafetyBreach: { zoneName: string; instructionIndex: number } | null
  predictedSingularity: { instructionIndex: number; minJ5Deg: number } | null
}

/**
 * Resolves a PositionRegister + optional Vision Offset VR[n] to both target TCP Mat4 and joint angles.
 */
export function resolveTargetPosition(
  pos: PositionRegister,
  currentJoints: JointAngles,
  tool: ToolFrame,
  visionBank: VisionBank,
  vOffsetReg?: 1 | 2 | 3 | 4,
): { reachable: boolean; joints: JointAngles; tcpMat: Mat4; errorMessage?: string } {
  const vr = vOffsetReg ? visionBank[vOffsetReg] : undefined

  if (pos.representation === 'JOINT' && pos.joints && !vr?.valid) {
    const fk = computeFK(pos.joints, tool, DEFAULT_USER_FRAME)
    return { reachable: true, joints: [...pos.joints] as JointAngles, tcpMat: fk.frames.tcp }
  }

  let basePose: CartesianPose
  if (pos.cartesian) {
    basePose = { ...pos.cartesian }
  } else if (pos.joints) {
    basePose = computeFK(pos.joints, tool, DEFAULT_USER_FRAME).tcpWorldPose
  } else {
    const fk = computeFK(currentJoints, tool, DEFAULT_USER_FRAME)
    return { reachable: true, joints: currentJoints, tcpMat: fk.frames.tcp }
  }

  if (vr && vr.valid) {
    basePose = {
      x: basePose.x + vr.x,
      y: basePose.y + vr.y,
      z: basePose.z + vr.z,
      w: basePose.w + vr.rx,
      p: basePose.p + vr.ry,
      r: basePose.r + vr.rz,
    }
  }

  const ik = solveIKFromPose(basePose, currentJoints, tool)
  if (!ik.reachable) {
    return {
      reachable: false,
      joints: currentJoints,
      tcpMat: poseToMat4(basePose),
      errorMessage: ik.message ?? 'Target unreachable',
    }
  }
  const fk = computeFK(ik.joints, tool, DEFAULT_USER_FRAME)
  return { reachable: true, joints: ik.joints, tcpMat: fk.frames.tcp }
}

/**
 * Computes realistic industrial motion duration for a J or L segment.
 * Includes trapezoidal acceleration/deceleration profile overhead.
 */
export function computeSegmentDurationSec(
  moveType: 'MOVE_J' | 'MOVE_L',
  startJoints: JointAngles,
  endJoints: JointAngles,
  startTcpMat: Mat4,
  endTcpMat: Mat4,
  speedValue: number, // % for MOVE_J, mm/s for MOVE_L
  speedOverridePct = 100,
): number {
  const ovr = clamp(speedOverridePct, 5, 100) / 100

  if (moveType === 'MOVE_J') {
    const pct = clamp(speedValue, 1, 100) / 100
    let maxAxisTime = 0.12
    for (let i = 0; i < 6; i++) {
      const dist = Math.abs(endJoints[i] - startJoints[i])
      const vMax = OMNI_ROBOT_SPEC.jointMaxVelDegPerSec[i] * pct * ovr
      const aMax = OMNI_ROBOT_SPEC.jointMaxAccDegPerSec2[i] * Math.sqrt(pct * ovr)
      // Trapezoidal velocity profile time
      const tCruise = dist / Math.max(vMax, 1)
      const tAccel = Math.min(vMax / Math.max(aMax, 1), Math.sqrt(dist / Math.max(aMax, 1)))
      const tTotal = tCruise + tAccel * 0.9
      if (tTotal > maxAxisTime) maxAxisTime = tTotal
    }
    return maxAxisTime
  }

  // Linear Cartesian MOVE_L
  const p0 = mat4GetTranslation(startTcpMat)
  const p1 = mat4GetTranslation(endTcpMat)
  const linDistMm = vec3Dist(p0, p1)
  const linVel = Math.max(15, speedValue * ovr)
  const linTime = linDistMm / linVel + 0.14

  // Also respect joint velocity ceiling during Cartesian motion
  let jointMinTime = 0.12
  for (let i = 0; i < 6; i++) {
    const dist = Math.abs(endJoints[i] - startJoints[i])
    const vMax = OMNI_ROBOT_SPEC.jointMaxVelDegPerSec[i] * ovr
    const t = dist / Math.max(vMax, 1)
    if (t > jointMinTime) jointMinTime = t
  }

  return Math.max(linTime, jointMinTime)
}

/**
 * Smooth S-curve / quintic-like ease for single-segment evaluation u in [0, 1]
 */
export function smoothEase(u: number): number {
  const t = clamp(u, 0, 1)
  return t * t * (3 - 2 * t)
}

/**
 * Evaluates a single segment at normalized parameter u in [0, 1].
 * For MOVE_L, interpolates TCP linearly in World space + SLERP orientation and solves IK.
 * For MOVE_J, interpolates directly in joint space.
 */
export function evaluateSegmentAt(
  moveType: 'MOVE_J' | 'MOVE_L',
  startJoints: JointAngles,
  endJoints: JointAngles,
  startTcpMat: Mat4,
  endTcpMat: Mat4,
  uRaw: number,
  prevJoints: JointAngles,
  tool: ToolFrame = DEFAULT_TOOL_FRAME,
): {
  joints: JointAngles
  tcpPos: Vec3
  singularityFault: boolean
  ikFailed: boolean
  minJ5Deg: number
} {
  const u = clamp(uRaw, 0, 1)

  if (moveType === 'MOVE_J') {
    const j: JointAngles = [
      startJoints[0] + (endJoints[0] - startJoints[0]) * u,
      startJoints[1] + (endJoints[1] - startJoints[1]) * u,
      startJoints[2] + (endJoints[2] - startJoints[2]) * u,
      startJoints[3] + (endJoints[3] - startJoints[3]) * u,
      startJoints[4] + (endJoints[4] - startJoints[4]) * u,
      startJoints[5] + (endJoints[5] - startJoints[5]) * u,
    ]
    const fk = computeFK(j, tool, DEFAULT_USER_FRAME)
    return {
      joints: j,
      tcpPos: mat4GetTranslation(fk.frames.tcp),
      singularityFault: false, // Joint moves safely transit wrist singularities
      ikFailed: false,
      minJ5Deg: Math.abs(j[4]),
    }
  }

  // Linear Cartesian interpolation
  const p0 = mat4GetTranslation(startTcpMat)
  const p1 = mat4GetTranslation(endTcpMat)
  const pInterp = vec3Lerp(p0, p1, u)
  const q0 = mat4ToQuat(startTcpMat)
  const q1 = mat4ToQuat(endTcpMat)
  const qInterp = quatSlerp(q0, q1, u)
  const matInterp = quatToMat4(qInterp, pInterp)

  const ik = solveIKFromMat4(matInterp, prevJoints, tool)
  if (!ik.reachable) {
    return {
      joints: prevJoints,
      tcpPos: pInterp,
      singularityFault: false,
      ikFailed: true,
      minJ5Deg: Math.abs(prevJoints[4]),
    }
  }

  const sing = evaluateSingularity(ik.joints)
  // Detect sudden J4/J6 flip spike or direct J5 < threshold on Linear move
  const j4Jump = Math.abs(ik.joints[3] - prevJoints[3])
  const j6Jump = Math.abs(ik.joints[5] - prevJoints[5])
  const wristCritical =
    sing.wristAngleDeg < WRIST_SINGULARITY_FAULT_DEG || (sing.wristWarning && (j4Jump > 32 || j6Jump > 32))

  return {
    joints: ik.joints,
    tcpPos: pInterp,
    singularityFault: wristCritical,
    ikFailed: false,
    minJ5Deg: sing.wristAngleDeg,
  }
}

/**
 * Computes full 3D path preview (dashed programmed polyline + bright cyan CNT-blended curve),
 * exact estimated cycle time, and pre-flight DCS/obstacle & singularity checks.
 */
export function planProgramPreview(
  instructions: readonly ProgramInstruction[],
  positions: Record<number, PositionRegister>,
  startJoints: JointAngles,
  tool: ToolFrame,
  userFrame: UserFrame,
  visionBank: VisionBank,
  safetyZones: readonly SafetyZone[],
  speedOverridePct = 100,
): ProgramPathPreview {
  const startFk = computeFK(startJoints, tool, userFrame)
  const programmedPoints: Vec3[] = [mat4GetTranslation(startFk.frames.tcp)]
  const blendedPoints: Vec3[] = [mat4GetTranslation(startFk.frames.tcp)]
  const blendMarkers: BlendZoneMarker[] = []

  // Collect motion waypoints with metadata
  interface MotionNode {
    instIdx: number
    moveType: 'MOVE_J' | 'MOVE_L'
    joints: JointAngles
    tcpMat: Mat4
    tcpPos: Vec3
    speedValue: number
    termination: TerminationMode
    followedByWaitOrIo: boolean
  }

  const nodes: MotionNode[] = []
  let cursorJoints: JointAngles = [...startJoints] as JointAngles
  let nonMotionWaitSec = 0
  let fineStopCount = 0
  let cntBlendCount = 0

  for (let i = 0; i < instructions.length; i++) {
    const inst = instructions[i]
    if (inst.type === 'WAIT_TIME') {
      nonMotionWaitSec += inst.seconds
      continue
    }
    if (inst.type === 'CALL_GRIPPER') {
      nonMotionWaitSec += 0.22
      continue
    }
    if (inst.type === 'VISION_CAPTURE') {
      nonMotionWaitSec += 0.25
      continue
    }
    if (inst.type !== 'MOVE_J' && inst.type !== 'MOVE_L') continue

    const posReg = positions[inst.targetId]
    if (!posReg) continue

    const resolved = resolveTargetPosition(posReg, cursorJoints, tool, visionBank, inst.vOffsetReg)
    if (!resolved.reachable) continue

    // Check if an I/O or wait forces an exact stop before the next move
    let followedByWaitOrIo = true
    for (let k = i + 1; k < instructions.length; k++) {
      const next = instructions[k]
      if (next.type === 'COMMENT' || next.type === 'LABEL') continue
      if (next.type === 'MOVE_J' || next.type === 'MOVE_L') {
        followedByWaitOrIo = false
      }
      break
    }

    nodes.push({
      instIdx: i,
      moveType: inst.type,
      joints: resolved.joints,
      tcpMat: resolved.tcpMat,
      tcpPos: mat4GetTranslation(resolved.tcpMat),
      speedValue: inst.type === 'MOVE_J' ? inst.speedPercent : inst.speedMmPerSec,
      termination: inst.termination,
      followedByWaitOrIo,
    })

    programmedPoints.push(mat4GetTranslation(resolved.tcpMat))
    cursorJoints = resolved.joints
  }

  if (nodes.length === 0) {
    return {
      programmedPoints,
      blendedPoints,
      blendMarkers,
      estimatedCycleTimeSec: nonMotionWaitSec,
      blendEfficiencyPct: 0,
      fineStopCount: 0,
      cntBlendCount: 0,
      predictedSafetyBreach: null,
      predictedSingularity: null,
    }
  }

  // Build segment timings & corner-blended polyline
  let totalTimeSec = nonMotionWaitSec
  let totalSavedByBlendSec = 0
  let prevJoints: JointAngles = [...startJoints] as JointAngles
  let prevTcpMat: Mat4 = startFk.frames.tcp
  let prevTcpPos: Vec3 = mat4GetTranslation(startFk.frames.tcp)
  let predictedSafetyBreach: { zoneName: string; instructionIndex: number } | null = null
  let predictedSingularity: { instructionIndex: number; minJ5Deg: number } | null = null

  const FINE_SETTLE_PENALTY_SEC = 0.34

  for (let n = 0; n < nodes.length; n++) {
    const curr = nodes[n]
    const next = n + 1 < nodes.length ? nodes[n + 1] : null

    const segDur = computeSegmentDurationSec(
      curr.moveType,
      prevJoints,
      curr.joints,
      prevTcpMat,
      curr.tcpMat,
      curr.speedValue,
      speedOverridePct,
    )

    const canBlendCorner =
      curr.termination.kind === 'CNT' && curr.termination.value > 0 && next !== null && !curr.followedByWaitOrIo

    if (canBlendCorner && curr.termination.kind === 'CNT') {
      cntBlendCount++
      const blendRatio = curr.termination.value / 100
      // Continuous cornering eliminates the 0.34s FINE stop-settle AND overlaps decel/accel smoothly
      const saved = FINE_SETTLE_PENALTY_SEC + Math.min(segDur * 0.24, 0.24) * blendRatio
      totalTimeSec += Math.max(0.08, segDur - Math.min(segDur * 0.22, 0.22) * blendRatio)
      totalSavedByBlendSec += saved
    } else {
      fineStopCount++
      totalTimeSec += segDur + FINE_SETTLE_PENALTY_SEC
    }

    // Sample segment geometry & corner blend curve
    const prevNode = n > 0 ? nodes[n - 1] : null
    const startCutFrac =
      prevNode &&
      prevNode.termination.kind === 'CNT' &&
      prevNode.termination.value > 0 &&
      !prevNode.followedByWaitOrIo
        ? (prevNode.termination.value / 100) * 0.44
        : 0

    const endCutFrac = canBlendCorner && curr.termination.kind === 'CNT' ? (curr.termination.value / 100) * 0.44 : 0

    // Sample interior linear/joint segment from startCutFrac to (1 - endCutFrac)
    const steps = 10
    let iterJoints: JointAngles = [...prevJoints] as JointAngles
    for (let s = 1; s <= steps; s++) {
      const u = startCutFrac + ((1 - endCutFrac - startCutFrac) * s) / steps
      const ev = evaluateSegmentAt(
        curr.moveType,
        prevJoints,
        curr.joints,
        prevTcpMat,
        curr.tcpMat,
        u,
        iterJoints,
        tool,
      )
      iterJoints = ev.joints
      blendedPoints.push(ev.tcpPos)

      if (!predictedSingularity && ev.singularityFault) {
        predictedSingularity = { instructionIndex: curr.instIdx, minJ5Deg: ev.minJ5Deg }
      }
      if (!predictedSafetyBreach && safetyZones.length > 0) {
        const fkSample = computeFK(ev.joints, tool, userFrame)
        const check = checkSafetyZones(fkSample, safetyZones)
        if (!check.safe && check.violatedZone) {
          predictedSafetyBreach = {
            zoneName: check.violatedZone.name,
            instructionIndex: curr.instIdx,
          }
        }
      }
    }

    // Quadratic Bezier corner blend between curr segment exit and next segment entry!
    if (canBlendCorner && next && curr.termination.kind === 'CNT') {
      const blendFrac = (curr.termination.value / 100) * 0.44
      const pEntry = vec3Lerp(prevTcpPos, curr.tcpPos, 1 - blendFrac)
      const pCorner = curr.tcpPos
      const pExit = vec3Lerp(curr.tcpPos, next.tcpPos, blendFrac)

      // Midpoint of quadratic Bezier at t=0.5: 0.25*pEntry + 0.5*pCorner + 0.25*pExit
      const midPt: Vec3 = [
        0.25 * pEntry[0] + 0.5 * pCorner[0] + 0.25 * pExit[0],
        0.25 * pEntry[1] + 0.5 * pCorner[1] + 0.25 * pExit[1],
        0.25 * pEntry[2] + 0.5 * pCorner[2] + 0.25 * pExit[2],
      ]
      blendMarkers.push({
        position: midPt,
        cntValue: curr.termination.value,
        instructionIndex: curr.instIdx,
      })

      const arcSteps = 8
      for (let a = 1; a <= arcSteps; a++) {
        const t = a / arcSteps
        const omt = 1 - t
        const bp: Vec3 = [
          omt * omt * pEntry[0] + 2 * omt * t * pCorner[0] + t * t * pExit[0],
          omt * omt * pEntry[1] + 2 * omt * t * pCorner[1] + t * t * pExit[1],
          omt * omt * pEntry[2] + 2 * omt * t * pCorner[2] + t * t * pExit[2],
        ]
        blendedPoints.push(bp)

        // Check if corner cut clips an obstacle (critical for Scenario 2 divider check!)
        if (!predictedSafetyBreach && safetyZones.length > 0) {
          const blendPose: CartesianPose = {
            ...computeFK(curr.joints, tool, userFrame).tcpWorldPose,
            x: bp[0],
            y: bp[1],
            z: bp[2],
          }
          const ikBlend = solveIKFromPose(blendPose, curr.joints, tool)
          if (ikBlend.reachable) {
            const fkBlend = computeFK(ikBlend.joints, tool, userFrame)
            const check = checkSafetyZones(fkBlend, safetyZones)
            if (!check.safe && check.violatedZone) {
              predictedSafetyBreach = {
                zoneName: check.violatedZone.name,
                instructionIndex: curr.instIdx,
              }
            }
          }
        }
      }
    }

    prevJoints = curr.joints
    prevTcpMat = curr.tcpMat
    prevTcpPos = curr.tcpPos
  }

  const allFineBaseline = totalTimeSec + totalSavedByBlendSec
  const blendEfficiencyPct =
    allFineBaseline > 0.1 ? clamp((totalSavedByBlendSec / allFineBaseline) * 100, 0, 100) : 0

  return {
    programmedPoints,
    blendedPoints,
    blendMarkers,
    estimatedCycleTimeSec: totalTimeSec,
    blendEfficiencyPct,
    fineStopCount,
    cntBlendCount,
    predictedSafetyBreach,
    predictedSingularity,
  }
}
