import { DEG2RAD, mat4GetTranslation } from './math3d'
import { computeFK } from './fk'
import {
  OMNI_ROBOT_SPEC,
  type JointAngles,
  type RobotKinematicsSpec,
  type SingularityReport,
  type SingularitySeverity,
} from './types'

export const WRIST_SINGULARITY_WARN_DEG = 8.0
export const WRIST_SINGULARITY_FAULT_DEG = 2.5
export const SHOULDER_SINGULARITY_WARN_MM = 140.0
export const ELBOW_SINGULARITY_WARN_RATIO = 0.965

/**
 * Evaluates wrist (|J5| -> 0), overhead/shoulder (wrist center near J1 axis),
 * and elbow extension (reach approaching a2 + sqrt(d4^2 + a3^2)) singularities.
 */
export function evaluateSingularity(
  joints: JointAngles,
  spec: RobotKinematicsSpec = OMNI_ROBOT_SPEC,
): SingularityReport {
  const fk = computeFK(joints, undefined, undefined, spec)
  const wc = mat4GetTranslation(fk.frames.j5)
  const j2 = mat4GetTranslation(fk.frames.j2)

  const wristAngleDeg = Math.abs(joints[4])
  const wristWarning = wristAngleDeg < WRIST_SINGULARITY_WARN_DEG
  const wristCritical = wristAngleDeg < WRIST_SINGULARITY_FAULT_DEG

  // Shoulder singularity: wrist center lies directly above/below J1 axis (x=0, y=0)
  const shoulderRadiusMm = Math.hypot(wc[0], wc[1])
  const shoulderWarning = shoulderRadiusMm < SHOULDER_SINGULARITY_WARN_MM

  // Elbow singularity: distance from J2 to wrist center approaching full extension
  const maxReach = spec.a2 + Math.hypot(spec.d4, spec.a3)
  const distJ2Wc = Math.hypot(wc[0] - j2[0], wc[1] - j2[1], wc[2] - j2[2])
  const elbowExtensionRatio = distJ2Wc / maxReach
  const elbowWarning = elbowExtensionRatio > ELBOW_SINGULARITY_WARN_RATIO

  // Inverse of sin(|J5|) models J4/J6 counter-rotation speed spike during linear Cartesian motion
  const sinJ5 = Math.max(Math.abs(Math.sin(wristAngleDeg * DEG2RAD)), 0.015)
  const wristVelocityMultiplier = Math.min(1 / sinJ5, 65)

  let severity: SingularitySeverity = 'CLEAR'
  if (wristCritical || elbowExtensionRatio > 0.992 || shoulderRadiusMm < 55) {
    severity = 'CRITICAL'
  } else if (wristWarning || shoulderWarning || elbowWarning) {
    severity = 'WARNING'
  }

  let summary = 'Kinematics Nominal'
  if (wristCritical) {
    summary = `WRIST SINGULARITY (|J5|=${wristAngleDeg.toFixed(1)}° < ${WRIST_SINGULARITY_FAULT_DEG}°)`
  } else if (wristWarning) {
    summary = `Wrist Singularity Proximity (|J5|=${wristAngleDeg.toFixed(1)}°)`
  } else if (shoulderWarning) {
    summary = `Overhead/Shoulder Singularity (r=${shoulderRadiusMm.toFixed(0)}mm)`
  } else if (elbowWarning) {
    summary = `Elbow Extension Limit (${(elbowExtensionRatio * 100).toFixed(1)}%)`
  }

  return {
    severity,
    wristAngleDeg,
    wristWarning,
    wristCritical,
    shoulderRadiusMm,
    shoulderWarning,
    elbowExtensionRatio,
    elbowWarning,
    wristVelocityMultiplier,
    summary,
  }
}
