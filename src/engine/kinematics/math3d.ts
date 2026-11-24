import type { CartesianPose, Mat4, Vec3 } from './types'

export const DEG2RAD = Math.PI / 180
export const RAD2DEG = 180 / Math.PI

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

export function mat4Identity(): Mat4 {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]
}

export function mat4FromTranslation(x: number, y: number, z: number): Mat4 {
  return [
    1, 0, 0, x,
    0, 1, 0, y,
    0, 0, 1, z,
    0, 0, 0, 1,
  ]
}

export function mat4FromRx(rad: number): Mat4 {
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  return [
    1, 0, 0, 0,
    0, c, -s, 0,
    0, s, c, 0,
    0, 0, 0, 1,
  ]
}

export function mat4FromRy(rad: number): Mat4 {
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  return [
    c, 0, s, 0,
    0, 1, 0, 0,
    -s, 0, c, 0,
    0, 0, 0, 1,
  ]
}

export function mat4FromRz(rad: number): Mat4 {
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  return [
    c, -s, 0, 0,
    s, c, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]
}

export function mat4Mul(a: Mat4, b: Mat4): Mat4 {
  const out: Mat4 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  for (let r = 0; r < 4; r++) {
    const r4 = r * 4
    const a0 = a[r4]
    const a1 = a[r4 + 1]
    const a2 = a[r4 + 2]
    const a3 = a[r4 + 3]
    out[r4] = a0 * b[0] + a1 * b[4] + a2 * b[8] + a3 * b[12]
    out[r4 + 1] = a0 * b[1] + a1 * b[5] + a2 * b[9] + a3 * b[13]
    out[r4 + 2] = a0 * b[2] + a1 * b[6] + a2 * b[10] + a3 * b[14]
    out[r4 + 3] = a0 * b[3] + a1 * b[7] + a2 * b[11] + a3 * b[15]
  }
  return out
}

/** Exact rigid-body inverse for SE(3) homogeneous transform */
export function mat4InvertRigid(m: Mat4): Mat4 {
  const r00 = m[0], r01 = m[1], r02 = m[2], tx = m[3]
  const r10 = m[4], r11 = m[5], r12 = m[6], ty = m[7]
  const r20 = m[8], r21 = m[9], r22 = m[10], tz = m[11]

  return [
    r00, r10, r20, -(r00 * tx + r10 * ty + r20 * tz),
    r01, r11, r21, -(r01 * tx + r11 * ty + r21 * tz),
    r02, r12, r22, -(r02 * tx + r12 * ty + r22 * tz),
    0, 0, 0, 1,
  ]
}

export function mat4GetTranslation(m: Mat4): Vec3 {
  return [m[3], m[7], m[11]]
}

export function mat4TransformPoint(m: Mat4, p: Vec3): Vec3 {
  return [
    m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3],
    m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7],
    m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11],
  ]
}

/**
 * FANUC / Industrial W-P-R convention: R = Rz(R) * Ry(P) * Rx(W)
 */
export function poseToMat4(pose: CartesianPose): Mat4 {
  const rz = mat4FromRz(pose.r * DEG2RAD)
  const ry = mat4FromRy(pose.p * DEG2RAD)
  const rx = mat4FromRx(pose.w * DEG2RAD)
  const rot = mat4Mul(mat4Mul(rz, ry), rx)
  rot[3] = pose.x
  rot[7] = pose.y
  rot[11] = pose.z
  return rot
}

export function mat4ToPose(m: Mat4): CartesianPose {
  const r00 = m[0], r10 = m[4], r20 = m[8]
  const r21 = m[9], r22 = m[10]
  const r01 = m[1], r11 = m[5]

  const sy = clamp(-r20, -1, 1)
  const p = Math.asin(sy)

  let w: number
  let r: number
  if (Math.abs(Math.cos(p)) > 1e-6) {
    w = Math.atan2(r21, r22)
    r = Math.atan2(r10, r00)
  } else {
    // Gimbal lock fallback
    w = Math.atan2(-r01, r11)
    r = 0
  }

  return {
    x: m[3],
    y: m[7],
    z: m[11],
    w: w * RAD2DEG,
    p: p * RAD2DEG,
    r: r * RAD2DEG,
  }
}

export interface Quat {
  x: number
  y: number
  z: number
  w: number
}

export function mat4ToQuat(m: Mat4): Quat {
  const m00 = m[0], m01 = m[1], m02 = m[2]
  const m10 = m[4], m11 = m[5], m12 = m[6]
  const m20 = m[8], m21 = m[9], m22 = m[10]
  const trace = m00 + m11 + m22

  let x: number, y: number, z: number, w: number
  if (trace > 0) {
    const s = Math.sqrt(trace + 1.0) * 2
    w = 0.25 * s
    x = (m21 - m12) / s
    y = (m02 - m20) / s
    z = (m10 - m01) / s
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1.0 + m00 - m11 - m22) * 2
    w = (m21 - m12) / s
    x = 0.25 * s
    y = (m01 + m10) / s
    z = (m02 + m20) / s
  } else if (m11 > m22) {
    const s = Math.sqrt(1.0 + m11 - m00 - m22) * 2
    w = (m02 - m20) / s
    x = (m01 + m10) / s
    y = 0.25 * s
    z = (m12 + m21) / s
  } else {
    const s = Math.sqrt(1.0 + m22 - m00 - m11) * 2
    w = (m10 - m01) / s
    x = (m02 + m20) / s
    y = (m12 + m21) / s
    z = 0.25 * s
  }
  const len = Math.hypot(x, y, z, w) || 1
  return { x: x / len, y: y / len, z: z / len, w: w / len }
}

export function quatToMat4(q: Quat, pos: Vec3): Mat4 {
  const { x, y, z, w } = q
  const xx = x * x, yy = y * y, zz = z * z
  const xy = x * y, xz = x * z, yz = y * z
  const wx = w * x, wy = w * y, wz = w * z

  return [
    1 - 2 * (yy + zz), 2 * (xy - wz), 2 * (xz + wy), pos[0],
    2 * (xy + wz), 1 - 2 * (xx + zz), 2 * (yz - wx), pos[1],
    2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (xx + yy), pos[2],
    0, 0, 0, 1,
  ]
}

export function quatSlerp(a: Quat, b: Quat, t: number): Quat {
  let bx = b.x, by = b.y, bz = b.z, bw = b.w
  let dot = a.x * bx + a.y * by + a.z * bz + a.w * bw
  if (dot < 0) {
    dot = -dot
    bx = -bx
    by = -by
    bz = -bz
    bw = -bw
  }
  if (dot > 0.9995) {
    const x = a.x + t * (bx - a.x)
    const y = a.y + t * (by - a.y)
    const z = a.z + t * (bz - a.z)
    const w = a.w + t * (bw - a.w)
    const len = Math.hypot(x, y, z, w) || 1
    return { x: x / len, y: y / len, z: z / len, w: w / len }
  }
  const theta0 = Math.acos(clamp(dot, -1, 1))
  const theta = theta0 * t
  const sinTheta = Math.sin(theta)
  const sinTheta0 = Math.sin(theta0)
  const s0 = Math.cos(theta) - (dot * sinTheta) / sinTheta0
  const s1 = sinTheta / sinTheta0
  return {
    x: s0 * a.x + s1 * bx,
    y: s0 * a.y + s1 * by,
    z: s0 * a.z + s1 * bz,
    w: s0 * a.w + s1 * bw,
  }
}

export function vec3Dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

export function vec3Lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ]
}

export function normalizeAngleDeg(deg: number): number {
  let a = ((deg + 180) % 360 + 360) % 360 - 180
  if (a === -180) a = 180
  return a
}
