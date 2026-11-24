import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { OemDialect } from '../../engine/dialects/types'
import { DEG2RAD } from '../../engine/kinematics/math3d'
import { OMNI_ROBOT_SPEC } from '../../engine/kinematics/types'
import { tickSimulation } from '../../engine/runtime/simulationLoop'
import { robotRuntime, useRobotStore } from '../../engine/store/robotStore'

const MM_TO_M = 0.001

interface OemLivery {
  /** Primary cast arm body color (upper arm, forearm, J1 turret) */
  primaryBody: string
  /** Base pedestal, counterweight, wrist housing */
  secondaryCast: string
  /** Rib spine, end-caps, accent trim */
  accentTrim: string
  /** Machined joint rings & servo collars */
  jointRing: string
  bodyMetalness: number
  bodyRoughness: number
}

/** Authentic high-contrast factory liveries mapped to each industrial robot OEM */
const OEM_LIVERIES: Record<OemDialect, OemLivery> = {
  FANUC: {
    primaryBody: '#F5C400', // Iconic FANUC Safety Yellow
    secondaryCast: '#232832', // Matte graphite base & counterweight
    accentTrim: '#1A1E26', // Black industrial trim spine
    jointRing: '#94A3B8', // Machined steel joint rings
    bodyMetalness: 0.25,
    bodyRoughness: 0.34,
  },
  ABB: {
    primaryBody: '#E2E8F0', // Iconic ABB Graphite White
    secondaryCast: '#334155', // Dark industrial slate base
    accentTrim: '#EF4444', // Signature ABB Red spine/cap accents
    jointRing: '#64748B',
    bodyMetalness: 0.28,
    bodyRoughness: 0.32,
  },
  KUKA: {
    primaryBody: '#FF6B00', // Iconic KUKA Cybertech Orange
    secondaryCast: '#1F242D', // Matte KUKA black base & wrist
    accentTrim: '#171A21', // Stealth black rib
    jointRing: '#94A3B8',
    bodyMetalness: 0.26,
    bodyRoughness: 0.34,
  },
  YASKAWA: {
    primaryBody: '#2979FF', // Iconic Motoman Blue
    secondaryCast: '#232B38', // Deep navy-slate pedestal
    accentTrim: '#DCE6F2', // Silver-white Motoman trim
    jointRing: '#A8B5C8',
    bodyMetalness: 0.34,
    bodyRoughness: 0.3,
  },
  UR: {
    primaryBody: '#DDE5EF', // Brushed anodized aluminum links
    secondaryCast: '#3B4556', // Machined dark aluminum base
    accentTrim: '#00B8D9', // Signature UR Blue-Cyan joint caps & trim
    jointRing: '#00B8D9', // Signature UR Blue joint caps
    bodyMetalness: 0.52,
    bodyRoughness: 0.26,
  },
}

/** Crisp 3D RGB Coordinate Triad (X=Red, Y=Green, Z=Blue) */
export function CoordinateTriad3D({
  length = 0.16,
  highlighted = false,
  visible = true,
}: {
  length?: number
  highlighted?: boolean
  visible?: boolean
}) {
  if (!visible) return null
  const radius = highlighted ? 0.0045 : 0.0028
  const coneR = highlighted ? 0.011 : 0.0075
  const coneH = highlighted ? 0.032 : 0.024

  return (
    <group>
      {/* +X Axis (Red) */}
      <group rotation={[0, 0, -Math.PI / 2]}>
        <mesh position={[0, length * 0.5, 0]}>
          <cylinderGeometry args={[radius, radius, length, 8]} />
          <meshStandardMaterial color="#FF3B30" emissive="#FF3B30" emissiveIntensity={highlighted ? 0.85 : 0.3} />
        </mesh>
        <mesh position={[0, length + coneH * 0.5, 0]}>
          <coneGeometry args={[coneR, coneH, 10]} />
          <meshStandardMaterial color="#FF3B30" emissive="#FF3B30" emissiveIntensity={highlighted ? 0.9 : 0.35} />
        </mesh>
      </group>
      {/* +Y Axis (Green) */}
      <group>
        <mesh position={[0, length * 0.5, 0]}>
          <cylinderGeometry args={[radius, radius, length, 8]} />
          <meshStandardMaterial color="#00E676" emissive="#00E676" emissiveIntensity={highlighted ? 0.85 : 0.3} />
        </mesh>
        <mesh position={[0, length + coneH * 0.5, 0]}>
          <coneGeometry args={[coneR, coneH, 10]} />
          <meshStandardMaterial color="#00E676" emissive="#00E676" emissiveIntensity={highlighted ? 0.9 : 0.35} />
        </mesh>
      </group>
      {/* +Z Axis (Blue) */}
      <group rotation={[Math.PI / 2, 0, 0]}>
        <mesh position={[0, length * 0.5, 0]}>
          <cylinderGeometry args={[radius, radius, length, 8]} />
          <meshStandardMaterial color="#2979FF" emissive="#2979FF" emissiveIntensity={highlighted ? 0.85 : 0.3} />
        </mesh>
        <mesh position={[0, length + coneH * 0.5, 0]}>
          <coneGeometry args={[coneR, coneH, 10]} />
          <meshStandardMaterial color="#2979FF" emissive="#2979FF" emissiveIntensity={highlighted ? 0.9 : 0.35} />
        </mesh>
      </group>
      {highlighted && (
        <mesh>
          <sphereGeometry args={[0.011, 12, 12]} />
          <meshStandardMaterial color="#00E5FF" emissive="#00E5FF" emissiveIntensity={1.2} />
        </mesh>
      )}
    </group>
  )
}

/**
 * Articulated 6-DOF Industrial Manipulator (OMNI-R20iD/25 class).
 * Dynamically adopts authentic OEM factory colors matching the active dialect
 * (FANUC Yellow, ABB White/Red, KUKA Orange, Yaskawa Blue, UR Silver/Cyan).
 */
export function RobotArm3D() {
  const j1Ref = useRef<THREE.Group>(null)
  const j2Ref = useRef<THREE.Group>(null)
  const j3Ref = useRef<THREE.Group>(null)
  const j4Ref = useRef<THREE.Group>(null)
  const j5Ref = useRef<THREE.Group>(null)
  const j6Ref = useRef<THREE.Group>(null)
  const jawLeftRef = useRef<THREE.Mesh>(null)
  const jawRightRef = useRef<THREE.Mesh>(null)
  const statusRingMatRef = useRef<THREE.MeshStandardMaterial>(null)
  const wristRingMatRef = useRef<THREE.MeshStandardMaterial>(null)

  const dialect = useRobotStore((s) => s.dialect)
  const tool = useRobotStore((s) => s.tool)
  const scenarioId = useRobotStore((s) => s.scenarioId)
  const coordinateFrame = useRobotStore((s) => s.coordinateFrame)
  const showTriads = useRobotStore((s) => s.showTriads)

  const d1 = OMNI_ROBOT_SPEC.d1 * MM_TO_M
  const a1 = OMNI_ROBOT_SPEC.a1 * MM_TO_M
  const a2 = OMNI_ROBOT_SPEC.a2 * MM_TO_M
  const a3 = OMNI_ROBOT_SPEC.a3 * MM_TO_M
  const d4 = OMNI_ROBOT_SPEC.d4 * MM_TO_M
  const d6 = OMNI_ROBOT_SPEC.d6 * MM_TO_M

  // Shared industrial PBR materials keyed by active OEM livery (disposed cleanly on brand switch or unmount)
  const mats = useMemo(() => {
    const livery = OEM_LIVERIES[dialect]
    const bodyPaint = new THREE.MeshStandardMaterial({
      color: livery.primaryBody,
      metalness: livery.bodyMetalness,
      roughness: livery.bodyRoughness,
    })
    const darkCast = new THREE.MeshStandardMaterial({
      color: livery.secondaryCast,
      metalness: 0.48,
      roughness: 0.45,
    })
    const jointRing = new THREE.MeshStandardMaterial({
      color: livery.jointRing,
      metalness: 0.65,
      roughness: 0.28,
    })
    const accentTrim = new THREE.MeshStandardMaterial({
      color: livery.accentTrim,
      metalness: 0.42,
      roughness: 0.36,
    })
    const copper = new THREE.MeshStandardMaterial({
      color: '#E5853E',
      metalness: 0.85,
      roughness: 0.2,
    })
    const chrome = new THREE.MeshStandardMaterial({
      color: '#DCE4EE',
      metalness: 0.85,
      roughness: 0.18,
    })
    return { bodyPaint, darkCast, jointRing, accentTrim, copper, chrome }
  }, [dialect])

  useEffect(() => {
    return () => {
      Object.values(mats).forEach((m) => m.dispose())
    }
  }, [mats])

  useFrame((state, delta) => {
    tickSimulation(delta)

    const [q1, q2, q3, q4, q5, q6] = robotRuntime.joints
    if (j1Ref.current) j1Ref.current.rotation.z = q1 * DEG2RAD
    if (j2Ref.current) j2Ref.current.rotation.y = q2 * DEG2RAD
    if (j3Ref.current) j3Ref.current.rotation.y = q3 * DEG2RAD
    if (j4Ref.current) j4Ref.current.rotation.x = q4 * DEG2RAD
    if (j5Ref.current) j5Ref.current.rotation.y = q5 * DEG2RAD
    if (j6Ref.current) j6Ref.current.rotation.x = q6 * DEG2RAD

    const openFrac = robotRuntime.cellObjects.gripperOpenFraction
    const jawOffset = 0.016 + openFrac * 0.028
    if (jawLeftRef.current) jawLeftRef.current.position.y = jawOffset
    if (jawRightRef.current) jawRightRef.current.position.y = -jawOffset

    const st = useRobotStore.getState()
    const pulse = 0.75 + 0.35 * Math.sin(state.clock.elapsedTime * 6)

    if (statusRingMatRef.current) {
      if (st.estopActive || st.activeFault) {
        statusRingMatRef.current.color.set('#FF1744')
        statusRingMatRef.current.emissive.set('#FF1744')
        statusRingMatRef.current.emissiveIntensity = 1.6 * pulse
      } else if (robotRuntime.singularity.wristWarning) {
        statusRingMatRef.current.color.set('#FFB300')
        statusRingMatRef.current.emissive.set('#FFB300')
        statusRingMatRef.current.emissiveIntensity = 1.4 * pulse
      } else if (robotRuntime.execState.running) {
        statusRingMatRef.current.color.set('#00E5FF')
        statusRingMatRef.current.emissive.set('#00E5FF')
        statusRingMatRef.current.emissiveIntensity = 1.25
      } else {
        statusRingMatRef.current.color.set('#00E676')
        statusRingMatRef.current.emissive.set('#00E676')
        statusRingMatRef.current.emissiveIntensity = 0.95
      }
    }

    if (wristRingMatRef.current) {
      if (robotRuntime.singularity.wristCritical) {
        wristRingMatRef.current.color.set('#FF1744')
        wristRingMatRef.current.emissive.set('#FF1744')
        wristRingMatRef.current.emissiveIntensity = 1.9 * pulse
      } else if (robotRuntime.singularity.wristWarning) {
        wristRingMatRef.current.color.set('#FFB300')
        wristRingMatRef.current.emissive.set('#FFB300')
        wristRingMatRef.current.emissiveIntensity = 1.4 * pulse
      } else {
        wristRingMatRef.current.color.set('#00E5FF')
        wristRingMatRef.current.emissive.set('#00E5FF')
        wristRingMatRef.current.emissiveIntensity = 0.35
      }
    }
  })

  const tcpOffsetM: [number, number, number] = [tool.x * MM_TO_M, tool.y * MM_TO_M, tool.z * MM_TO_M]
  const isAngledTorch = scenarioId === 'scenario1'

  return (
    <group>
      {/* Static Bolted Base Pedestal (Floor Z=0 to J1 Turret) */}
      <mesh position={[0, 0, 0.025]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow material={mats.darkCast}>
        <cylinderGeometry args={[0.27, 0.3, 0.05, 24]} />
      </mesh>
      <mesh position={[0, 0, 0.14]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow material={mats.darkCast}>
        <cylinderGeometry args={[0.19, 0.23, 0.22, 24]} />
      </mesh>

      {/* World Base Coordinate Triad */}
      <group position={[0, 0, 0.055]}>
        <CoordinateTriad3D
          length={0.28}
          highlighted={coordinateFrame === 'WORLD'}
          visible={showTriads}
        />
      </group>

      {/* J1 Waist Turret (Rotates about +Z) */}
      <group ref={j1Ref}>
        <mesh position={[0, 0, 0.34]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow material={mats.bodyPaint}>
          <cylinderGeometry args={[0.175, 0.185, 0.2, 24]} />
        </mesh>
        {/* Emissive Industrial Status LED Collar */}
        <mesh position={[0, 0, 0.255]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.19, 0.19, 0.024, 28]} />
          <meshStandardMaterial
            ref={statusRingMatRef}
            color="#00E676"
            emissive="#00E676"
            emissiveIntensity={0.95}
            roughness={0.2}
          />
        </mesh>
        {/* Shoulder Bracket Offset to (a1, 0, d1) */}
        <mesh position={[a1 * 0.55, 0, d1 - 0.08]} castShadow receiveShadow material={mats.bodyPaint}>
          <boxGeometry args={[a1 + 0.16, 0.26, 0.22]} />
        </mesh>

        {/* J2 Shoulder Axis at (a1, 0, d1) — Rotates about +Y */}
        <group ref={j2Ref} position={[a1, 0, d1]}>
          <mesh castShadow material={mats.jointRing}>
            <cylinderGeometry args={[0.135, 0.135, 0.31, 24]} />
          </mesh>
          <mesh position={[0, 0.16, 0]} material={mats.accentTrim}>
            <cylinderGeometry args={[0.095, 0.095, 0.028, 20]} />
          </mesh>
          <mesh position={[0, -0.16, 0]} material={mats.accentTrim}>
            <cylinderGeometry args={[0.095, 0.095, 0.028, 20]} />
          </mesh>

          {/* Upper Arm Link (J2 -> J3 along +Z length a2) */}
          <mesh position={[0, 0, a2 * 0.5]} castShadow receiveShadow material={mats.bodyPaint}>
            <boxGeometry args={[0.165, 0.185, a2 - 0.04]} />
          </mesh>
          {/* Contrast Spine Rib */}
          <mesh position={[-0.088, 0, a2 * 0.5]} material={mats.accentTrim}>
            <boxGeometry args={[0.026, 0.095, a2 * 0.74]} />
          </mesh>

          {/* J3 Elbow Axis at (0, 0, a2) — Rotates about +Y */}
          <group ref={j3Ref} position={[0, 0, a2]}>
            <mesh castShadow material={mats.jointRing}>
              <cylinderGeometry args={[0.112, 0.112, 0.26, 22]} />
            </mesh>
            {/* Elbow Rear Counterweight Housing */}
            <mesh position={[-0.1, 0, a3 * 0.45]} castShadow material={mats.darkCast}>
              <boxGeometry args={[0.26, 0.19, 0.21]} />
            </mesh>
            {/* Elbow-to-Forearm Offset Riser */}
            <mesh position={[0.14, 0, a3 * 0.85]} castShadow material={mats.bodyPaint}>
              <boxGeometry args={[0.36, 0.165, 0.165]} />
            </mesh>

            {/* J4 Forearm Roll at (d4*0.45, 0, a3) — Rotates about +X */}
            <group ref={j4Ref} position={[d4 * 0.45, 0, a3]}>
              <mesh rotation={[0, 0, Math.PI / 2]} castShadow material={mats.jointRing}>
                <cylinderGeometry args={[0.088, 0.088, 0.06, 20]} />
              </mesh>
              <mesh position={[d4 * 0.275, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow material={mats.bodyPaint}>
                <cylinderGeometry args={[0.066, 0.082, d4 * 0.52, 20]} />
              </mesh>

              {/* J5 Spherical Wrist Pitch at (d4*0.55, 0, 0) — Rotates about +Y */}
              <group ref={j5Ref} position={[d4 * 0.55, 0, 0]}>
                <mesh castShadow material={mats.darkCast}>
                  <cylinderGeometry args={[0.068, 0.068, 0.145, 20]} />
                </mesh>
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <torusGeometry args={[0.075, 0.0085, 10, 24]} />
                  <meshStandardMaterial
                    ref={wristRingMatRef}
                    color="#00E5FF"
                    emissive="#00E5FF"
                    emissiveIntensity={0.35}
                  />
                </mesh>

                {/* J6 Flange Roll — Rotates about +X */}
                <group ref={j6Ref}>
                  <mesh position={[d6 * 0.5, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow material={mats.jointRing}>
                    <cylinderGeometry args={[0.052, 0.058, d6 * 0.72, 18]} />
                  </mesh>

                  {/* ISO 9787 Mounting Flange at +d6, rotated Ry(+90 deg) so +Z points outward along tool */}
                  <group position={[d6, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
                    <mesh rotation={[Math.PI / 2, 0, 0]} castShadow material={mats.chrome}>
                      <cylinderGeometry args={[0.058, 0.058, 0.016, 20]} />
                    </mesh>

                    {/* Swappable End-Effector */}
                    {tool.endEffectorType === 'torch' ? (
                      <group>
                        <mesh position={[0, 0, 0.04]} rotation={[Math.PI / 2, 0, 0]} material={mats.darkCast}>
                          <cylinderGeometry args={[0.036, 0.044, 0.065, 16]} />
                        </mesh>
                        {isAngledTorch ? (
                          <group>
                            <mesh position={[0, 0, 0.095]} rotation={[Math.PI / 2, 0, 0]} material={mats.chrome}>
                              <cylinderGeometry args={[0.016, 0.02, 0.075, 14]} />
                            </mesh>
                            <group position={[0.035, 0, 0.175]} rotation={[0, Math.atan2(0.07, 0.11), 0]}>
                              <mesh rotation={[Math.PI / 2, 0, 0]} material={mats.chrome}>
                                <cylinderGeometry args={[0.011, 0.014, 0.085, 14]} />
                              </mesh>
                              <mesh position={[0, 0, 0.052]} rotation={[Math.PI / 2, 0, 0]} material={mats.copper}>
                                <cylinderGeometry args={[0.005, 0.013, 0.036, 14]} />
                              </mesh>
                            </group>
                            <mesh position={[0.07, 0, 0.23]}>
                              <sphereGeometry args={[0.005, 10, 10]} />
                              <meshStandardMaterial color="#FFD600" emissive="#FFD600" emissiveIntensity={1.2} />
                            </mesh>
                          </group>
                        ) : (
                          <group>
                            <mesh position={[0, 0, 0.11]} rotation={[Math.PI / 2, 0, 0]} material={mats.chrome}>
                              <cylinderGeometry args={[0.014, 0.022, 0.1, 14]} />
                            </mesh>
                            <mesh position={[0, 0, 0.172]} rotation={[Math.PI / 2, 0, 0]} material={mats.copper}>
                              <cylinderGeometry args={[0.004, 0.013, 0.03, 14]} />
                            </mesh>
                          </group>
                        )}
                      </group>
                    ) : (
                      <group>
                        <mesh position={[0, 0, 0.048]} castShadow material={mats.darkCast}>
                          <boxGeometry args={[0.078, 0.125, 0.078]} />
                        </mesh>
                        <mesh position={[0, 0, 0.012]} rotation={[Math.PI / 2, 0, 0]} material={mats.jointRing}>
                          <cylinderGeometry args={[0.048, 0.052, 0.024, 16]} />
                        </mesh>
                        <mesh position={[0, 0, 0.095]} material={mats.chrome}>
                          <boxGeometry args={[0.042, 0.128, 0.018]} />
                        </mesh>
                        <mesh ref={jawLeftRef} position={[0, 0.04, 0.148]} castShadow material={mats.chrome}>
                          <boxGeometry args={[0.028, 0.018, 0.096]} />
                        </mesh>
                        <mesh ref={jawRightRef} position={[0, -0.04, 0.148]} castShadow material={mats.chrome}>
                          <boxGeometry args={[0.028, 0.018, 0.096]} />
                        </mesh>
                      </group>
                    )}

                    {/* Active UTOOL TCP Coordinate Triad */}
                    <group position={tcpOffsetM}>
                      <CoordinateTriad3D
                        length={0.14}
                        highlighted={coordinateFrame === 'TOOL'}
                        visible={showTriads}
                      />
                    </group>
                  </group>
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}
