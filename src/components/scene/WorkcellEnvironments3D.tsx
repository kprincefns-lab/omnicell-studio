import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Edges } from '@react-three/drei'
import * as THREE from 'three'
import { DEG2RAD } from '../../engine/kinematics/math3d'
import { robotRuntime, useRobotStore } from '../../engine/store/robotStore'
import { CoordinateTriad3D } from './RobotArm3D'

const MM_TO_M = 0.001

/** Shared cell perimeter safety fencing & dead-front workcell floor */
function BaseWorkcellFloor() {
  const posts: Array<[number, number]> = [
    [-1.4, -1.6],
    [0.2, -1.6],
    [1.8, -1.6],
    [1.8, 0],
    [1.8, 1.6],
    [0.2, 1.6],
    [-1.4, 1.6],
    [-1.4, 0],
  ]

  return (
    <group>
      {/* Dead-front industrial slate-black floor slab */}
      <mesh position={[0.25, 0, -0.015]} receiveShadow>
        <boxGeometry args={[4.4, 4.2, 0.03]} />
        <meshStandardMaterial color="#0D1016" metalness={0.25} roughness={0.85} />
      </mesh>

      {/* Precision Floor Grid (Rotated to Z=0 plane) */}
      <gridHelper
        args={[4.2, 21, '#2A303C', '#191E27']}
        position={[0.25, 0, 0.002]}
        rotation={[Math.PI / 2, 0, 0]}
      />

      {/* Perimeter Safety Fence Stanchions */}
      {posts.map(([px, py], i) => (
        <group key={`post_${i}`} position={[px, py, 0.65]}>
          <mesh>
            <boxGeometry args={[0.045, 0.045, 1.3]} />
            <meshStandardMaterial color="#232833" metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0, 0.655]}>
            <boxGeometry args={[0.052, 0.052, 0.02]} />
            <meshStandardMaterial color="#FFD600" roughness={0.4} />
          </mesh>
        </group>
      ))}

      {/* Subtle Top Safety Rails */}
      <mesh position={[0.2, -1.6, 1.24]}>
        <boxGeometry args={[3.2, 0.025, 0.025]} />
        <meshStandardMaterial color="#2D3545" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0.2, 1.6, 1.24]}>
        <boxGeometry args={[3.2, 0.025, 0.025]} />
        <meshStandardMaterial color="#2D3545" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[1.8, 0, 1.24]}>
        <boxGeometry args={[0.025, 3.2, 0.025]} />
        <meshStandardMaterial color="#2D3545" metalness={0.6} roughness={0.4} />
      </mesh>
    </group>
  )
}

/** Scenario 1: Welding Table + UFRAME[1] Triad + Vertical Calibration Pin at [1080, 0, 620] */
function Scenario1Environment() {
  const userFrame = useRobotStore((s) => s.userFrame)
  const coordinateFrame = useRobotStore((s) => s.coordinateFrame)
  const showTriads = useRobotStore((s) => s.showTriads)

  return (
    <group>
      {/* Heavy Steel Welding Fixture Table */}
      <mesh position={[1.08, 0, 0.21]} castShadow receiveShadow>
        <boxGeometry args={[0.72, 0.9, 0.42]} />
        <meshStandardMaterial color="#1F242E" metalness={0.55} roughness={0.5} />
      </mesh>
      {/* Top Machined Grid Plate */}
      <mesh position={[1.08, 0, 0.425]} receiveShadow>
        <boxGeometry args={[0.74, 0.92, 0.02]} />
        <meshStandardMaterial color="#2E3645" metalness={0.75} roughness={0.32} />
      </mesh>

      {/* Precision Calibration Reference Pin — Tip exactly at World [1.080, 0, 0.620] m */}
      <group position={[1.08, 0, 0.435]}>
        {/* Pedestal Collar */}
        <mesh position={[0, 0, 0.015]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.045, 0.055, 0.03, 20]} />
          <meshStandardMaterial color="#374151" metalness={0.8} roughness={0.25} />
        </mesh>
        {/* Pin Shaft */}
        <mesh position={[0, 0, 0.095]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.012, 0.014, 0.14, 18]} />
          <meshStandardMaterial color="#C8D2E0" metalness={0.9} roughness={0.18} />
        </mesh>
        {/* Precision Tapered Needle Tip reaching z = 0.435 + 0.185 = 0.620 m */}
        <mesh position={[0, 0, 0.175]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.012, 0.02, 16]} />
          <meshStandardMaterial color="#00E5FF" emissive="#00E5FF" emissiveIntensity={0.95} />
        </mesh>
        {/* Target Calibration Halo Ring */}
        <mesh position={[0, 0, 0.185]}>
          <torusGeometry args={[0.024, 0.0022, 8, 28]} />
          <meshStandardMaterial color="#00E5FF" emissive="#00E5FF" emissiveIntensity={0.8} transparent opacity={0.75} />
        </mesh>
      </group>

      {/* Angled UFRAME[1] Welding Table Coordinate Triad */}
      <group
        position={[userFrame.x * MM_TO_M, userFrame.y * MM_TO_M, userFrame.z * MM_TO_M + 0.02]}
        rotation={[userFrame.w * DEG2RAD, userFrame.p * DEG2RAD, userFrame.r * DEG2RAD]}
      >
        <CoordinateTriad3D
          length={0.24}
          highlighted={coordinateFrame === 'USER'}
          visible={showTriads}
        />
      </group>
    </group>
  )
}

/** Scenario 2: Infeed Conveyor + Central Metal Guard Divider + 2x2 Output Tray + Animated Workpiece */
function Scenario2Environment() {
  const partRef = useRef<THREE.Mesh>(null)

  useFrame(() => {
    if (partRef.current) {
      const [px, py, pz] = robotRuntime.cellObjects.partWorldPos
      partRef.current.position.set(px * MM_TO_M, py * MM_TO_M, pz * MM_TO_M)
      partRef.current.rotation.z = robotRuntime.cellObjects.partRotZDeg * DEG2RAD
    }
  })

  return (
    <group>
      {/* Infeed Conveyor (Y = -0.56 m) */}
      <group position={[1.02, -0.56, 0.24]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.68, 0.42, 0.48]} />
          <meshStandardMaterial color="#1C212A" metalness={0.5} roughness={0.55} />
        </mesh>
        {/* Dark Belt Surface */}
        <mesh position={[0, 0, 0.245]}>
          <boxGeometry args={[0.66, 0.34, 0.015]} />
          <meshStandardMaterial color="#0E1117" roughness={0.9} />
        </mesh>
        {/* Photo-Eye Sensor Post (DI[1]) */}
        <mesh position={[0.26, -0.22, 0.29]}>
          <boxGeometry args={[0.03, 0.03, 0.09]} />
          <meshStandardMaterial color="#FFB300" emissive="#FFB300" emissiveIntensity={0.4} />
        </mesh>
      </group>

      {/* Central Metal Guard Divider Obstacle (X=1.02, Y=0, Height=0.858m) */}
      <group position={[1.02, 0, 0.429]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.56, 0.075, 0.858]} />
          <meshStandardMaterial color="#272D38" metalness={0.72} roughness={0.35} />
          <Edges scale={1.002} color="#FFB300" />
        </mesh>
        {/* High-Visibility Amber Top Hazard Bar */}
        <mesh position={[0, 0, 0.435]}>
          <boxGeometry args={[0.568, 0.082, 0.022]} />
          <meshStandardMaterial color="#FFB300" emissive="#FFB300" emissiveIntensity={0.45} roughness={0.35} />
        </mesh>
      </group>

      {/* 2x2 Output Tray Fixture (Y = +0.56 m) */}
      <group position={[1.02, 0.56, 0.24]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.58, 0.52, 0.48]} />
          <meshStandardMaterial color="#1E242E" metalness={0.55} roughness={0.48} />
        </mesh>
        {/* 2x2 Machined Tray Nests */}
        {[
          [-0.1, -0.1],
          [0.1, -0.1],
          [-0.1, 0.1],
          [0.1, 0.1],
        ].map(([nx, ny], idx) => (
          <mesh key={`nest_${idx}`} position={[nx, ny, 0.246]}>
            <boxGeometry args={[0.14, 0.14, 0.014]} />
            <meshStandardMaterial color="#2C3546" metalness={0.7} roughness={0.3} />
            <Edges color="#00E5FF" />
          </mesh>
        ))}
      </group>

      {/* Live Animated Machined Aluminum Workpiece */}
      <mesh ref={partRef} position={[1.02, -0.56, 0.505]} castShadow>
        <boxGeometry args={[0.085, 0.085, 0.05]} />
        <meshStandardMaterial color="#94A3B8" metalness={0.85} roughness={0.22} />
        <Edges color="#00E5FF" />
      </mesh>
    </group>
  )
}

/** Scenario 3: Dual-Zone Manufacturing Cell + Operator Load Bay Pedestal */
function Scenario3Environment() {
  return (
    <group>
      {/* Seam Weld Fixture Table in Front */}
      <group position={[1.15, 0, 0.28]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.55, 1.15, 0.56]} />
          <meshStandardMaterial color="#1E232D" metalness={0.55} roughness={0.5} />
        </mesh>
        {/* Weld Seam Bar */}
        <mesh position={[0, 0, 0.305]}>
          <boxGeometry args={[0.14, 0.86, 0.04]} />
          <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.3} />
        </mesh>
      </group>

      {/* Operator Load Bay Floor Pad & Pushbutton Station (+Y Side inside DCS Zone) */}
      <group position={[0.86, 0.86, 0.01]}>
        <mesh receiveShadow>
          <boxGeometry args={[0.74, 0.6, 0.02]} />
          <meshStandardMaterial color="#2A1219" roughness={0.85} />
          <Edges color="#FF1744" />
        </mesh>
        {/* Operator HMI Pedestal */}
        <mesh position={[0.25, 0.22, 0.55]} castShadow>
          <boxGeometry args={[0.08, 0.08, 1.1]} />
          <meshStandardMaterial color="#232833" metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh position={[0.21, 0.22, 1.12]} rotation={[0, 0.35, 0]}>
          <boxGeometry args={[0.22, 0.28, 0.05]} />
          <meshStandardMaterial color="#181C23" metalness={0.5} roughness={0.4} />
        </mesh>
      </group>
    </group>
  )
}

/** Scenario 4: Vision Conveyor + Overhead iRVision Camera + Enclosed CNC Mill with Animated Sliding Door */
function Scenario4Environment() {
  const partRef = useRef<THREE.Mesh>(null)
  const doorRef = useRef<THREE.Mesh>(null)
  const reticleGroupRef = useRef<THREE.Group>(null)
  const reticleMatRef = useRef<THREE.MeshStandardMaterial>(null)
  const spindleRef = useRef<THREE.Mesh>(null)

  useFrame((_, delta) => {
    if (partRef.current) {
      const [px, py, pz] = robotRuntime.cellObjects.partWorldPos
      partRef.current.position.set(px * MM_TO_M, py * MM_TO_M, pz * MM_TO_M)
      partRef.current.rotation.z = robotRuntime.cellObjects.partRotZDeg * DEG2RAD
    }
    if (doorRef.current) {
      // Slide door along +X when opening
      const openFrac = robotRuntime.cellObjects.cncDoorOpenFraction
      doorRef.current.position.x = 0.98 + openFrac * 0.48
    }
    if (reticleGroupRef.current) {
      const off = robotRuntime.cellObjects.billetOffset
      reticleGroupRef.current.position.set((960 + off.x) * MM_TO_M, (-560 + off.y) * MM_TO_M, 0.54)
      reticleGroupRef.current.rotation.z = off.rz * DEG2RAD
    }
    if (reticleMatRef.current) {
      const flash = robotRuntime.cellObjects.visionFlashAlpha
      reticleMatRef.current.emissiveIntensity = 0.55 + flash * 2.0
      reticleMatRef.current.opacity = 0.45 + flash * 0.5
    }
    if (spindleRef.current && robotRuntime.cellObjects.cncMachiningRemainingSec > 0) {
      spindleRef.current.rotation.z += delta * 18
    }
  })

  return (
    <group>
      {/* Infeed Billet Conveyor (Y = -0.56 m) */}
      <group position={[0.96, -0.56, 0.24]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.66, 0.46, 0.48]} />
          <meshStandardMaterial color="#1C212A" metalness={0.5} roughness={0.55} />
        </mesh>
        <mesh position={[0, 0, 0.245]}>
          <boxGeometry args={[0.62, 0.38, 0.014]} />
          <meshStandardMaterial color="#0E1117" roughness={0.9} />
        </mesh>
      </group>

      {/* Overhead 2D iRVision Camera Gantry */}
      <group position={[0.96, -0.56, 1.38]}>
        <mesh castShadow>
          <boxGeometry args={[0.14, 0.14, 0.1]} />
          <meshStandardMaterial color="#232833" metalness={0.7} roughness={0.3} />
        </mesh>
        {/* Ring Light LED */}
        <mesh position={[0, 0, -0.055]}>
          <torusGeometry args={[0.055, 0.008, 8, 24]} />
          <meshStandardMaterial color="#00E5FF" emissive="#00E5FF" emissiveIntensity={1.1} />
        </mesh>
      </group>

      {/* Projected Cyan 2D Vision Alignment Reticle on Billet */}
      <group ref={reticleGroupRef} position={[0.98, -0.58, 0.54]}>
        <mesh>
          <ringGeometry args={[0.055, 0.063, 24]} />
          <meshStandardMaterial
            ref={reticleMatRef}
            color="#00E5FF"
            emissive="#00E5FF"
            emissiveIntensity={0.65}
            transparent
            opacity={0.55}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh position={[0.075, 0, 0]}>
          <boxGeometry args={[0.04, 0.005, 0.002]} />
          <meshStandardMaterial color="#00E5FF" emissive="#00E5FF" emissiveIntensity={1} />
        </mesh>
      </group>

      {/* Live Aluminum Billet */}
      <mesh ref={partRef} position={[0.986, -0.58, 0.505]} castShadow>
        <boxGeometry args={[0.082, 0.062, 0.048]} />
        <meshStandardMaterial color="#CBD5E1" metalness={0.9} roughness={0.18} />
        <Edges color="#00E5FF" />
      </mesh>

      {/* Enclosed 3-Axis CNC Mill (+Y Side, Chuck at [0.98, 0.64, 0.59]) */}
      <group position={[0.98, 0.82, 0.68]}>
        {/* Rear Wall */}
        <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.92, 0.08, 1.36]} />
          <meshStandardMaterial color="#1B2029" metalness={0.55} roughness={0.45} />
        </mesh>
        {/* Left & Right Walls */}
        <mesh position={[-0.44, 0, 0]} castShadow>
          <boxGeometry args={[0.08, 0.88, 1.36]} />
          <meshStandardMaterial color="#212733" metalness={0.55} roughness={0.45} />
        </mesh>
        <mesh position={[0.44, 0, 0]} castShadow>
          <boxGeometry args={[0.08, 0.88, 1.36]} />
          <meshStandardMaterial color="#212733" metalness={0.55} roughness={0.45} />
        </mesh>
        {/* Roof Canopy */}
        <mesh position={[0, 0, 0.68]} castShadow>
          <boxGeometry args={[0.96, 0.92, 0.08]} />
          <meshStandardMaterial color="#262D3B" metalness={0.6} roughness={0.4} />
        </mesh>
        {/* Lower Machine Bed */}
        <mesh position={[0, 0, -0.44]} castShadow receiveShadow>
          <boxGeometry args={[0.88, 0.84, 0.48]} />
          <meshStandardMaterial color="#151921" metalness={0.5} roughness={0.55} />
        </mesh>
        {/* Pneumatic 3-Jaw Chuck at World [0.98, 0.64, 0.56] */}
        <mesh position={[0, -0.18, -0.14]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.095, 0.11, 0.11, 20]} />
          <meshStandardMaterial color="#64748B" metalness={0.85} roughness={0.22} />
        </mesh>
        {/* Overhead CNC Spindle Head */}
        <mesh ref={spindleRef} position={[0, -0.18, 0.36]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.055, 0.04, 0.24, 14]} />
          <meshStandardMaterial color="#94A3B8" metalness={0.88} roughness={0.2} />
        </mesh>
      </group>

      {/* Animated Sliding CNC Safety Door at Y = 0.39 m */}
      <mesh ref={doorRef} position={[1.46, 0.39, 0.78]} castShadow>
        <boxGeometry args={[0.72, 0.032, 0.78]} />
        <meshStandardMaterial
          color="#2B3344"
          metalness={0.6}
          roughness={0.35}
          transparent
          opacity={0.78}
        />
        <Edges color="#FFB300" />
      </mesh>
    </group>
  )
}

/** Renders configurable 3D DCS / SafeMove Forbidden Zones & Safety Boundaries */
function SafetyZonesOverlay3D() {
  const safetyZones = useRobotStore((s) => s.safetyZones)
  const showSafetyZones = useRobotStore((s) => s.showSafetyZones)

  const visibleZones = useMemo(
    () =>
      safetyZones.filter(
        (z) => z.enabled && (z.kind === 'DCS_FORBIDDEN' || z.kind === 'CNC_DOOR'),
      ),
    [safetyZones],
  )

  if (!showSafetyZones || visibleZones.length === 0) return null

  return (
    <group>
      {visibleZones.map((zone) => (
        <mesh
          key={zone.id}
          position={[zone.center[0] * MM_TO_M, zone.center[1] * MM_TO_M, zone.center[2] * MM_TO_M]}
          rotation={[0, 0, (zone.rotationZDeg ?? 0) * DEG2RAD]}
        >
          <boxGeometry
            args={[zone.size[0] * MM_TO_M, zone.size[1] * MM_TO_M, zone.size[2] * MM_TO_M]}
          />
          <meshStandardMaterial
            color={zone.color}
            emissive={zone.color}
            emissiveIntensity={0.45}
            transparent
            opacity={0.18}
            depthWrite={false}
          />
          <Edges scale={1.001} color={zone.color} />
        </mesh>
      ))}
    </group>
  )
}

export function WorkcellEnvironments3D() {
  const scenarioId = useRobotStore((s) => s.scenarioId)

  return (
    <group>
      <BaseWorkcellFloor />
      {scenarioId === 'scenario1' && <Scenario1Environment />}
      {scenarioId === 'scenario2' && <Scenario2Environment />}
      {scenarioId === 'scenario3' && <Scenario3Environment />}
      {scenarioId === 'scenario4' && <Scenario4Environment />}
      <SafetyZonesOverlay3D />
    </group>
  )
}
