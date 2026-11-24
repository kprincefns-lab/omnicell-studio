import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { DEG2RAD } from '../../engine/kinematics/math3d'
import { OMNI_ROBOT_SPEC } from '../../engine/kinematics/types'
import { tickSimulation } from '../../engine/runtime/simulationLoop'
import { robotRuntime, useRobotStore } from '../../engine/store/robotStore'

const MM_TO_M = 0.001

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
 * Operates in Z-up meters inside parent workcell transform.
 * Updates all 6 joint transforms strictly inside useFrame() with zero React re-renders.
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

  // Shared industrial PBR materials (disposed cleanly on unmount)
  const mats = useMemo(() => {
    const bodySlate = new THREE.MeshStandardMaterial({
      color: '#252B36',
      metalness: 0.62,
      roughness: 0.38,
    })
    const darkCast = new THREE.MeshStandardMaterial({
      color: '#171B22',
      metalness: 0.55,
      roughness: 0.52,
    })
    const jointRing = new THREE.MeshStandardMaterial({
      color: '#4E586B',
      metalness: 0.82,
      roughness: 0.24,
    })
    const accentTrim = new THREE.MeshStandardMaterial({
      color: '#384152',
      metalness: 0.72,
      roughness: 0.3,
    })
    const copper = new THREE.MeshStandardMaterial({
      color: '#D97736',
      metalness: 0.88,
      roughness: 0.22,
    })
    const chrome = new THREE.MeshStandardMaterial({
      color: '#C2CCD9',
      metalness: 0.9,
      roughness: 0.16,
    })
    return { bodySlate, darkCast, jointRing, accentTrim, copper, chrome }
  }, [])

  useEffect(() => {
    return () => {
      Object.values(mats).forEach((m) => m.dispose())
    }
  }, [mats])

  useFrame((state, delta) => {
    // Advance deterministic 60Hz simulation engine
    tickSimulation(delta)

    const [q1, q2, q3, q4, q5, q6] = robotRuntime.joints
    if (j1Ref.current) j1Ref.current.rotation.z = q1 * DEG2RAD
    if (j2Ref.current) j2Ref.current.rotation.y = q2 * DEG2RAD
    if (j3Ref.current) j3Ref.current.rotation.y = q3 * DEG2RAD
    if (j4Ref.current) j4Ref.current.rotation.x = q4 * DEG2RAD
    if (j5Ref.current) j5Ref.current.rotation.y = q5 * DEG2RAD
    if (j6Ref.current) j6Ref.current.rotation.x = q6 * DEG2RAD

    // Animate parallel gripper jaws
    const openFrac = robotRuntime.cellObjects.gripperOpenFraction
    const jawOffset = 0.016 + openFrac * 0.028
    if (jawLeftRef.current) jawLeftRef.current.position.y = jawOffset
    if (jawRightRef.current) jawRightRef.current.position.y = -jawOffset

    // Update emissive status LED collar without React re-renders
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

    // Highlight J5 wrist ring in amber/red when approaching wrist singularity!
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
        wristRingMatRef.current.emissiveIntensity = 0.25
      }
    }
  })

  // Active UTOOL TCP position in flange coordinates (meters)
  const tcpOffsetM: [number, number, number] = [tool.x * MM_TO_M, tool.y * MM_TO_M, tool.z * MM_TO_M]
  const isAngledTorch = scenarioId === 'scenario1'

  return (
    <group>
      {/* Static Bolted Base Pedestal (Floor Z=0 to J1 Turret) */}
      <mesh position={[0, 0, 0.025]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow material={mats.darkCast}>
        <cylinderGeometry args={[0.27, 0.3, 0.05, 24]} />
      </mesh>
      <mesh position={[0, 0, 0.14]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow material={mats.bodySlate}>
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
        <mesh position={[0, 0, 0.34]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow material={mats.bodySlate}>
          <cylinderGeometry args={[0.175, 0.185, 0.2, 24]} />
        </mesh>
        {/* Emissive Industrial Status LED Collar */}
        <mesh position={[0, 0, 0.255]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.188, 0.188, 0.022, 28]} />
          <meshStandardMaterial
            ref={statusRingMatRef}
            color="#00E676"
            emissive="#00E676"
            emissiveIntensity={0.95}
            roughness={0.2}
          />
        </mesh>
        {/* Shoulder Bracket Offset to (a1, 0, d1) */}
        <mesh position={[a1 * 0.55, 0, d1 - 0.08]} castShadow receiveShadow material={mats.darkCast}>
          <boxGeometry args={[a1 + 0.16, 0.26, 0.22]} />
        </mesh>

        {/* J2 Shoulder Axis at (a1, 0, d1) — Rotates about +Y */}
        <group ref={j2Ref} position={[a1, 0, d1]}>
          {/* Shoulder Servo Drum */}
          <mesh castShadow material={mats.jointRing}>
            <cylinderGeometry args={[0.135, 0.135, 0.31, 24]} />
          </mesh>
          {/* Twin Side Caps */}
          <mesh position={[0, 0.16, 0]} material={mats.darkCast}>
            <cylinderGeometry args={[0.095, 0.095, 0.025, 20]} />
          </mesh>
          <mesh position={[0, -0.16, 0]} material={mats.darkCast}>
            <cylinderGeometry args={[0.095, 0.095, 0.025, 20]} />
          </mesh>

          {/* Upper Arm Link (J2 -> J3 along +Z length a2) */}
          <mesh position={[0, 0, a2 * 0.5]} castShadow receiveShadow material={mats.bodySlate}>
            <boxGeometry args={[0.165, 0.185, a2 - 0.04]} />
          </mesh>
          {/* Machined Spine Rib */}
          <mesh position={[-0.088, 0, a2 * 0.5]} material={mats.accentTrim}>
            <boxGeometry args={[0.026, 0.09, a2 * 0.72]} />
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
            <mesh position={[0.14, 0, a3 * 0.85]} castShadow material={mats.bodySlate}>
              <boxGeometry args={[0.36, 0.165, 0.165]} />
            </mesh>

            {/* J4 Forearm Roll at (d4*0.45, 0, a3) — Rotates about +X */}
            <group ref={j4Ref} position={[d4 * 0.45, 0, a3]}>
              {/* J4 Roll Collar */}
              <mesh rotation={[0, 0, Math.PI / 2]} castShadow material={mats.jointRing}>
                <cylinderGeometry args={[0.088, 0.088, 0.06, 20]} />
              </mesh>
              {/* Tapered Forearm Tube to J5 Wrist Center */}
              <mesh position={[d4 * 0.275, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow material={mats.bodySlate}>
                <cylinderGeometry args={[0.066, 0.082, d4 * 0.52, 20]} />
              </mesh>

              {/* J5 Spherical Wrist Pitch at (d4*0.55, 0, 0) — Rotates about +Y */}
              <group ref={j5Ref} position={[d4 * 0.55, 0, 0]}>
                {/* Spherical Wrist Clevis & Singularity Status Ring */}
                <mesh castShadow material={mats.jointRing}>
                  <cylinderGeometry args={[0.068, 0.068, 0.145, 20]} />
                </mesh>
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <torusGeometry args={[0.074, 0.008, 10, 24]} />
                  <meshStandardMaterial
                    ref={wristRingMatRef}
                    color="#00E5FF"
                    emissive="#00E5FF"
                    emissiveIntensity={0.25}
                  />
                </mesh>

                {/* J6 Flange Roll — Rotates about +X */}
                <group ref={j6Ref}>
                  <mesh position={[d6 * 0.5, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow material={mats.darkCast}>
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
                        {/* Mounting Collar */}
                        <mesh position={[0, 0, 0.04]} rotation={[Math.PI / 2, 0, 0]} material={mats.darkCast}>
                          <cylinderGeometry args={[0.036, 0.044, 0.065, 16]} />
                        </mesh>
                        {isAngledTorch ? (
                          /* Scenario 1: Angled MIG Welding Torch with true physical tip at [0.070, 0, 0.230] m */
                          <group>
                            {/* Straight torch barrel up to bend */}
                            <mesh position={[0, 0, 0.095]} rotation={[Math.PI / 2, 0, 0]} material={mats.accentTrim}>
                              <cylinderGeometry args={[0.016, 0.02, 0.075, 14]} />
                            </mesh>
                            {/* Angled gooseneck from (0,0,0.12) -> (0.070, 0, 0.230): dx=0.07, dz=0.11, len=0.1304, angle=atan2(0.07,0.11)=32.5° */}
                            <group position={[0.035, 0, 0.175]} rotation={[0, Math.atan2(0.07, 0.11), 0]}>
                              <mesh rotation={[Math.PI / 2, 0, 0]} material={mats.chrome}>
                                <cylinderGeometry args={[0.011, 0.014, 0.085, 14]} />
                              </mesh>
                              {/* Copper Gas Nozzle & Tip */}
                              <mesh position={[0, 0, 0.052]} rotation={[Math.PI / 2, 0, 0]} material={mats.copper}>
                                <cylinderGeometry args={[0.005, 0.013, 0.036, 14]} />
                              </mesh>
                            </group>
                            {/* Physical Wire Tip Marker */}
                            <mesh position={[0.07, 0, 0.23]}>
                              <sphereGeometry args={[0.0045, 10, 10]} />
                              <meshStandardMaterial color="#FFD600" emissive="#FFD600" emissiveIntensity={1.1} />
                            </mesh>
                          </group>
                        ) : (
                          /* Scenario 3: Inline Process Torch tip at [0, 0, 0.185] m */
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
                      /* Pneumatic Parallel 2-Finger Industrial Gripper (Scenario 2 & 4, TCP at z=195mm) */
                      <group>
                        {/* Pneumatic Actuator Body */}
                        <mesh position={[0, 0, 0.048]} castShadow material={mats.accentTrim}>
                          <boxGeometry args={[0.078, 0.125, 0.078]} />
                        </mesh>
                        {/* Mounting Adapter */}
                        <mesh position={[0, 0, 0.012]} rotation={[Math.PI / 2, 0, 0]} material={mats.darkCast}>
                          <cylinderGeometry args={[0.048, 0.052, 0.024, 16]} />
                        </mesh>
                        {/* Guide Rail */}
                        <mesh position={[0, 0, 0.095]} material={mats.chrome}>
                          <boxGeometry args={[0.042, 0.128, 0.018]} />
                        </mesh>
                        {/* Animated Left Finger Jaw */}
                        <mesh ref={jawLeftRef} position={[0, 0.04, 0.148]} castShadow material={mats.chrome}>
                          <boxGeometry args={[0.028, 0.018, 0.096]} />
                        </mesh>
                        {/* Animated Right Finger Jaw */}
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
