import { DEG2RAD, clamp } from './math3d'
import type { FKResult, SafetyCheckResult, SafetyZone, Vec3 } from './types'

const LINK_NAMES = [
  'Base Pedestal',
  'J1-J2 Shoulder',
  'J2-J3 Upper Arm',
  'J3-J5 Forearm',
  'J5-Flange Wrist',
  'EOAT / TCP',
]

const LINK_RADII_MM = [95, 85, 68, 52, 42, 24]

/**
 * Transform a world point into a zone's local OBB space (centered at origin).
 */
function worldToZoneLocal(p: Vec3, zone: SafetyZone): Vec3 {
  const dx = p[0] - zone.center[0]
  const dy = p[1] - zone.center[1]
  const dz = p[2] - zone.center[2]
  const rotDeg = zone.rotationZDeg ?? 0
  if (Math.abs(rotDeg) < 1e-4) {
    return [dx, dy, dz]
  }
  const rad = -rotDeg * DEG2RAD
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  return [c * dx - s * dy, s * dx + c * dy, dz]
}

/**
 * Signed/unsigned Euclidean distance from point `p` in local OBB frame to box with half-extents `h`.
 * Returns 0 when inside the box.
 */
function pointToBoxDistance(p: Vec3, half: Vec3): number {
  const qx = Math.max(Math.abs(p[0]) - half[0], 0)
  const qy = Math.max(Math.abs(p[1]) - half[1], 0)
  const qz = Math.max(Math.abs(p[2]) - half[2], 0)
  return Math.hypot(qx, qy, qz)
}

/**
 * Computes minimum distance between line segment AB and an OBB by dense sampling + midpoint refinement.
 * Fast (~microseconds) and deterministic for real-time 60Hz DCS/SafeMove checking.
 */
function segmentToZoneDistance(aWorld: Vec3, bWorld: Vec3, zone: SafetyZone): number {
  const a = worldToZoneLocal(aWorld, zone)
  const b = worldToZoneLocal(bWorld, zone)
  const half: Vec3 = [zone.size[0] * 0.5, zone.size[1] * 0.5, zone.size[2] * 0.5]

  let minD = Infinity
  let bestT = 0
  const steps = 12
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const p: Vec3 = [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
    ]
    const d = pointToBoxDistance(p, half)
    if (d < minD) {
      minD = d
      bestT = t
      if (minD === 0) return 0
    }
  }

  // Local golden-style refinement around bestT
  const dt = 1 / steps
  const tStart = clamp(bestT - dt, 0, 1)
  const tEnd = clamp(bestT + dt, 0, 1)
  for (let i = 0; i <= 6; i++) {
    const t = tStart + ((tEnd - tStart) * i) / 6
    const p: Vec3 = [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
    ]
    const d = pointToBoxDistance(p, half)
    if (d < minD) minD = d
  }

  return minD
}

/**
 * Evaluates FANUC DCS / ABB SafeMove Cartesian Position Check (CPC) and physical cell obstacles
 * against all robot kinematic link capsules and the active TCP.
 */
export function checkSafetyZones(fk: FKResult, zones: readonly SafetyZone[]): SafetyCheckResult {
  let minClearanceMm = Infinity
  const pts = fk.linkPoints

  for (const zone of zones) {
    if (!zone.enabled) continue

    // Check active TCP point with tight safety envelope (18mm)
    const tcpPt = pts[pts.length - 1]
    const tcpDist = segmentToZoneDistance(tcpPt, tcpPt, zone)
    const tcpClearance = tcpDist - 18
    if (tcpClearance < minClearanceMm) minClearanceMm = tcpClearance
    if (tcpClearance <= 0) {
      return {
        safe: false,
        violatedZone: zone,
        violatedLinkName: 'Active TCP',
        minClearanceMm: tcpClearance,
      }
    }

    // Check kinematic link segments (skip static base pedestal index 0->1)
    for (let segIdx = 2; segIdx < pts.length - 1; segIdx++) {
      const dist = segmentToZoneDistance(pts[segIdx], pts[segIdx + 1], zone)
      const radius = LINK_RADII_MM[segIdx] ?? 30
      const clearance = dist - radius
      if (clearance < minClearanceMm) minClearanceMm = clearance
      if (clearance <= 0) {
        return {
          safe: false,
          violatedZone: zone,
          violatedLinkName: LINK_NAMES[segIdx] ?? `Link ${segIdx}`,
          minClearanceMm: clearance,
        }
      }
    }
  }

  return {
    safe: true,
    violatedZone: null,
    violatedLinkName: null,
    minClearanceMm: Number.isFinite(minClearanceMm) ? minClearanceMm : 999,
  }
}
