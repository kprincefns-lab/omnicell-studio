import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import { robotRuntime, useRobotStore } from '../../engine/store/robotStore'

const MM_TO_M = 0.001
const MAX_TRAIL_POINTS = 360

/**
 * Renders:
 * 1. Programmed waypoint polyline (dim dashed slate)
 * 2. Planned CNT-blended TCP swept curve (bright Electric Cyan #00E5FF)
 * 3. Amber CNT corner-blend zone markers
 * 4. Real-time swept TCP trail updated in useFrame with preallocated BufferGeometry
 */
export function PathVisuals3D() {
  const showPathPreview = useRobotStore((s) => s.showPathPreview)
  const pathPreview = useRobotStore((s) => s.pathPreview)
  const scenarioId = useRobotStore((s) => s.scenarioId)

  const trailGeomRef = useRef<THREE.BufferGeometry>(null)

  const { trailGeometry, trailMaterial } = useMemo(() => {
    const geom = new THREE.BufferGeometry()
    const positions = new Float32Array(MAX_TRAIL_POINTS * 3)
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geom.setDrawRange(0, 0)
    const mat = new THREE.LineBasicMaterial({
      color: '#00E5FF',
      transparent: true,
      opacity: 0.92,
    })
    return { trailGeometry: geom, trailMaterial: mat }
  }, [])

  const trailLineObj = useMemo(() => new THREE.Line(trailGeometry, trailMaterial), [trailGeometry, trailMaterial])

  useEffect(() => {
    return () => {
      trailGeometry.dispose()
      trailMaterial.dispose()
    }
  }, [trailGeometry, trailMaterial])

  useFrame(() => {
    const trail = robotRuntime.tcpTrail
    const attr = trailGeometry.getAttribute('position') as THREE.BufferAttribute
    const count = Math.min(trail.length, MAX_TRAIL_POINTS)
    for (let i = 0; i < count; i++) {
      attr.setXYZ(i, trail[i][0] * MM_TO_M, trail[i][1] * MM_TO_M, trail[i][2] * MM_TO_M)
    }
    attr.needsUpdate = true
    trailGeometry.setDrawRange(0, count)
    if (trailGeomRef.current) {
      trailGeomRef.current.setDrawRange(0, count)
    }
  })

  const programmedPts = useMemo(
    () =>
      pathPreview.programmedPoints.map(
        (p) => [p[0] * MM_TO_M, p[1] * MM_TO_M, p[2] * MM_TO_M] as [number, number, number],
      ),
    [pathPreview.programmedPoints],
  )

  const blendedPts = useMemo(
    () =>
      pathPreview.blendedPoints.map(
        (p) => [p[0] * MM_TO_M, p[1] * MM_TO_M, p[2] * MM_TO_M] as [number, number, number],
      ),
    [pathPreview.blendedPoints],
  )

  return (
    <group>
      {/* Live Swept TCP Trail */}
      <primitive object={trailLineObj} />

      {showPathPreview && scenarioId !== 'scenario1' && (
        <group>
          {/* Dim Dashed Programmed Waypoint Polyline */}
          {programmedPts.length >= 2 && (
            <Line
              points={programmedPts}
              color="#64748B"
              lineWidth={1.35}
              dashed
              dashSize={0.035}
              gapSize={0.025}
              transparent
              opacity={0.7}
            />
          )}

          {/* Bright Electric Cyan Blended TCP Path */}
          {blendedPts.length >= 2 && (
            <Line
              points={blendedPts}
              color="#00E5FF"
              lineWidth={2.4}
              transparent
              opacity={0.85}
            />
          )}

          {/* Programmed Waypoint Nodes */}
          {programmedPts.slice(1).map((pt, idx) => (
            <mesh key={`wp_${idx}`} position={pt}>
              <sphereGeometry args={[0.012, 10, 10]} />
              <meshStandardMaterial color="#94A3B8" emissive="#475569" emissiveIntensity={0.4} />
            </mesh>
          ))}

          {/* Amber CNT Corner Blend Zone Indicators */}
          {pathPreview.blendMarkers.map((bm, idx) => (
            <group
              key={`cnt_${idx}`}
              position={[bm.position[0] * MM_TO_M, bm.position[1] * MM_TO_M, bm.position[2] * MM_TO_M]}
            >
              <mesh>
                <sphereGeometry args={[0.016 + (bm.cntValue / 100) * 0.012, 12, 12]} />
                <meshStandardMaterial
                  color="#FFB300"
                  emissive="#FFB300"
                  emissiveIntensity={0.85}
                  transparent
                  opacity={0.75}
                />
              </mesh>
            </group>
          ))}
        </group>
      )}
    </group>
  )
}
