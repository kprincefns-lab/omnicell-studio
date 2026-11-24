import { mat4TransformPoint, vec3Dist } from './math3d'
import type { Mat4, Vec3 } from './types'

export interface TcpCalibrationSample {
  id: number
  label: string
  flangeMat: Mat4
  jointSnapshot: [number, number, number, number, number, number]
}

export interface TcpCalibrationResult {
  success: boolean
  offsetMm: Vec3
  estimatedPinWorldMm: Vec3
  rmsErrorMm: number
  maxErrorMm: number
  message: string
}

/**
 * Solves 3x3 linear system A * x = b via Gaussian elimination with partial pivoting.
 */
function solve3x3(A: number[][], b: number[]): Vec3 | null {
  const M = [
    [A[0][0], A[0][1], A[0][2], b[0]],
    [A[1][0], A[1][1], A[1][2], b[1]],
    [A[2][0], A[2][1], A[2][2], b[2]],
  ]

  for (let col = 0; col < 3; col++) {
    let pivotRow = col
    let maxAbs = Math.abs(M[col][col])
    for (let r = col + 1; r < 3; r++) {
      const v = Math.abs(M[r][col])
      if (v > maxAbs) {
        maxAbs = v
        pivotRow = r
      }
    }
    if (maxAbs < 1e-6) return null
    if (pivotRow !== col) {
      const tmp = M[col]
      M[col] = M[pivotRow]
      M[pivotRow] = tmp
    }
    const pivot = M[col][col]
    for (let r = col + 1; r < 3; r++) {
      const factor = M[r][col] / pivot
      for (let c = col; c < 4; c++) {
        M[r][c] -= factor * M[col][c]
      }
    }
  }

  const x: [number, number, number] = [0, 0, 0]
  for (let r = 2; r >= 0; r--) {
    let sum = M[r][3]
    for (let c = r + 1; c < 3; c++) {
      sum -= M[r][c] * x[c]
    }
    x[r] = sum / M[r][r]
  }
  return x
}

/**
 * Industrial 3-Point TCP Calibration (Sphere-Fit / Least-Squares Rigid Pivot Solver).
 *
 * Given N >= 3 flange poses (R_i, p_i) where the physical tool tip touches the same fixed
 * calibration reference pin P_pin:
 *   R_i * t_tcp + p_i = P_pin  for all i
 * Subtracting pairs (i, j):
 *   (R_i - R_j) * t_tcp = p_j - p_i
 * Solving the overdetermined linear system via normal equations (A^T A) t = A^T b
 * recovers the exact flange-to-TCP offset vector t_tcp = [tx, ty, tz] in mm.
 */
export function computeThreePointTcp(samples: readonly TcpCalibrationSample[]): TcpCalibrationResult {
  if (samples.length < 3) {
    return {
      success: false,
      offsetMm: [0, 0, 0],
      estimatedPinWorldMm: [0, 0, 0],
      rmsErrorMm: 999,
      maxErrorMm: 999,
      message: 'At least 3 distinct touch-off orientations are required.',
    }
  }

  // Build normal equations ATA (3x3) and ATb (3) over all pairs (i < j)
  const ATA = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
  const ATb = [0, 0, 0]

  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) {
      const fi = samples[i].flangeMat
      const fj = samples[j].flangeMat

      // 3 rows of (R_i - R_j)
      const rows = [
        [fi[0] - fj[0], fi[1] - fj[1], fi[2] - fj[2]],
        [fi[4] - fj[4], fi[5] - fj[5], fi[6] - fj[6]],
        [fi[8] - fj[8], fi[9] - fj[9], fi[10] - fj[10]],
      ]
      const rhs = [fj[3] - fi[3], fj[7] - fi[7], fj[11] - fi[11]]

      for (let r = 0; r < 3; r++) {
        const row = rows[r]
        for (let c1 = 0; c1 < 3; c1++) {
          ATb[c1] += row[c1] * rhs[r]
          for (let c2 = 0; c2 < 3; c2++) {
            ATA[c1][c2] += row[c1] * row[c2]
          }
        }
      }
    }
  }

  const solved = solve3x3(ATA, ATb)
  if (!solved) {
    return {
      success: false,
      offsetMm: [0, 0, 0],
      estimatedPinWorldMm: [0, 0, 0],
      rmsErrorMm: 999,
      maxErrorMm: 999,
      message: 'Singular orientation set — re-record points with greater angular separation (>15°).',
    }
  }

  // Compute estimated pin world position as centroid of R_i * t + p_i
  const predictedPins = samples.map((s) => mat4TransformPoint(s.flangeMat, solved))
  const meanPin: Vec3 = [
    predictedPins.reduce((acc, p) => acc + p[0], 0) / predictedPins.length,
    predictedPins.reduce((acc, p) => acc + p[1], 0) / predictedPins.length,
    predictedPins.reduce((acc, p) => acc + p[2], 0) / predictedPins.length,
  ]

  let sumSq = 0
  let maxErr = 0
  for (const p of predictedPins) {
    const d = vec3Dist(p, meanPin)
    sumSq += d * d
    if (d > maxErr) maxErr = d
  }
  const rmsErrorMm = Math.sqrt(sumSq / predictedPins.length)

  return {
    success: true,
    offsetMm: solved,
    estimatedPinWorldMm: meanPin,
    rmsErrorMm,
    maxErrorMm: maxErr,
    message:
      rmsErrorMm < 1.5
        ? `TCP Calibration Verified (RMS ${rmsErrorMm.toFixed(2)} mm < 1.5 mm)`
        : `Calibration computed (RMS ${rmsErrorMm.toFixed(2)} mm — refine touch-off accuracy)`,
  }
}
