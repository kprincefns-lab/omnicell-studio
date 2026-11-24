import { useEffect, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import {
  AlertTriangle,
  Box,
  Compass,
  Eye,
  GitBranch,
  Home,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useRobotStore } from '../../engine/store/robotStore'
import { SCENARIOS } from '../../engine/scenarios/definitions'
import { PathVisuals3D } from './PathVisuals3D'
import { RobotArm3D } from './RobotArm3D'
import { WorkcellEnvironments3D } from './WorkcellEnvironments3D'

type CameraPreset = 'ISO' | 'TOP' | 'FRONT' | 'SIDE'

const CAMERA_PRESETS: Record<CameraPreset, { pos: [number, number, number]; target: [number, number, number] }> = {
  ISO: { pos: [2.55, 2.15, 2.25], target: [0.55, 0.72, 0] },
  TOP: { pos: [0.65, 3.7, 0.01], target: [0.65, 0.5, 0] },
  FRONT: { pos: [3.2, 1.15, 0], target: [0.6, 0.75, 0] },
  SIDE: { pos: [0.75, 1.1, 3.1], target: [0.75, 0.7, 0] },
}

function CameraController({
  preset,
  presetTrigger,
}: {
  preset: CameraPreset
  presetTrigger: number
}) {
  const { camera } = useThree()
  const controlsRef = useRef<OrbitControlsImpl>(null)

  useEffect(() => {
    const cfg = CAMERA_PRESETS[preset]
    camera.position.set(...cfg.pos)
    if (controlsRef.current) {
      controlsRef.current.target.set(...cfg.target)
      controlsRef.current.update()
    } else {
      camera.lookAt(...cfg.target)
    }
  }, [camera, preset, presetTrigger])

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={0.7}
      maxDistance={6.5}
      maxPolarAngle={Math.PI * 0.49}
      target={[0.55, 0.72, 0]}
    />
  )
}

export function WorkcellViewport() {
  const [camPreset, setCamPreset] = useState<CameraPreset>('ISO')
  const [presetTrigger, setPresetTrigger] = useState(0)

  const scenarioId = useRobotStore((s) => s.scenarioId)
  const coordinateFrame = useRobotStore((s) => s.coordinateFrame)
  const controllerMode = useRobotStore((s) => s.controllerMode)
  const isRunning = useRobotStore((s) => s.isRunning)
  const activeFault = useRobotStore((s) => s.activeFault)
  const estopActive = useRobotStore((s) => s.estopActive)
  const hudSingularity = useRobotStore((s) => s.hudSingularity)
  const hudCycleTimeSec = useRobotStore((s) => s.hudCycleTimeSec)
  const hudTcpWorld = useRobotStore((s) => s.hudTcpWorld)
  const hudPhysicalTipErrorMm = useRobotStore((s) => s.hudPhysicalTipErrorMm)
  const pathPreview = useRobotStore((s) => s.pathPreview)
  const showPathPreview = useRobotStore((s) => s.showPathPreview)
  const showSafetyZones = useRobotStore((s) => s.showSafetyZones)
  const showTriads = useRobotStore((s) => s.showTriads)
  const setShowPathPreview = useRobotStore((s) => s.setShowPathPreview)
  const setShowSafetyZones = useRobotStore((s) => s.setShowSafetyZones)
  const setShowTriads = useRobotStore((s) => s.setShowTriads)
  const returnHome = useRobotStore((s) => s.returnHome)
  const resetFault = useRobotStore((s) => s.resetFault)

  const scenario = SCENARIOS[scenarioId]

  const applyPreset = (p: CameraPreset) => {
    setCamPreset(p)
    setPresetTrigger((n) => n + 1)
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0A0C10]">
      {/* 3D WebGL Canvas */}
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: CAMERA_PRESETS.ISO.pos, fov: 42, near: 0.05, far: 25 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <color attach="background" args={['#0A0C10']} />
        <fog attach="fog" args={['#0A0C10', 6.5, 14]} />

        {/* Industrial Workcell Studio Lighting */}
        <ambientLight intensity={0.48} color="#CBD5E1" />
        <hemisphereLight args={['#94A3B8', '#0F131A', 0.55]} />
        <directionalLight
          position={[3.5, 5.2, 3.2]}
          intensity={1.55}
          color="#F8FAFC"
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-camera-near={0.5}
          shadow-camera-far={12}
          shadow-camera-left={-2.5}
          shadow-camera-right={2.5}
          shadow-camera-top={2.5}
          shadow-camera-bottom={-2.5}
        />
        <pointLight position={[-1.8, 2.2, -1.5]} intensity={0.55} color="#00E5FF" distance={7} />

        {/* Entire Robotics Workcell rotated -90° around X so Industrial Z-Up maps cleanly to Three Y-Up */}
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <WorkcellEnvironments3D />
          <RobotArm3D />
          <PathVisuals3D />
        </group>

        <CameraController preset={camPreset} presetTrigger={presetTrigger} />
      </Canvas>

      {/* Top-Left Live Status & Scenario HUD */}
      <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-2">
        <div className="pointer-events-auto flex items-center gap-2.5 rounded-md border border-[#2A303C] bg-[#14171D]/90 px-3 py-1.5 backdrop-blur-sm">
          <span
            className={`led-dot ${
              estopActive || activeFault
                ? 'led-red'
                : hudSingularity.wristWarning
                  ? 'led-amber'
                  : isRunning
                    ? 'led-cyan'
                    : 'led-green'
            }`}
          />
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] font-semibold tracking-wider text-[#E6EDF3]">
                SCENARIO 0{scenario.number} · {scenario.shortTitle.toUpperCase()}
              </span>
              <span className="rounded bg-[#232833] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[#00E5FF]">
                {controllerMode}
              </span>
              <span className="rounded bg-[#232833] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[#94A3B8]">
                {coordinateFrame}
              </span>
            </div>
            <span className="font-mono text-[10px] text-[#8B949E] tabular-nums">
              TCP ({hudTcpWorld.x.toFixed(1)}, {hudTcpWorld.y.toFixed(1)}, {hudTcpWorld.z.toFixed(1)}) mm
              {scenarioId === 'scenario1' && (
                <span
                  className={`ml-2 font-semibold ${
                    hudPhysicalTipErrorMm < 1.5 ? 'text-[#00E676]' : 'text-[#FFB300]'
                  }`}
                >
                  | PIN Δ: {hudPhysicalTipErrorMm.toFixed(2)} mm
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Singularity Proximity Warning Banner */}
        {hudSingularity.severity !== 'CLEAR' && !activeFault && (
          <div className="flex items-center gap-2 rounded-md border border-[#FFB300]/50 bg-[#FFB300]/12 px-3 py-1.5 backdrop-blur-sm">
            <AlertTriangle className="h-3.5 w-3.5 text-[#FFB300]" />
            <span className="font-mono text-[11px] font-medium text-[#FFB300] tabular-nums">
              {hudSingularity.summary} · J4/J6 Gain ×{hudSingularity.wristVelocityMultiplier.toFixed(1)}
            </span>
          </div>
        )}

        {/* Active Controller Fault Banner */}
        {activeFault && (
          <div className="pointer-events-auto flex max-w-md items-start gap-2.5 rounded-md border border-[#FF1744]/70 bg-[#2A0E15]/95 px-3 py-2 shadow-lg backdrop-blur-sm">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#FF1744]" />
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-bold text-[#FF1744]">
                  {activeFault.code} — {activeFault.title}
                </span>
                <button
                  type="button"
                  onClick={resetFault}
                  className="rounded border border-[#FF1744]/60 bg-[#FF1744]/20 px-2 py-0.5 font-mono text-[10px] font-semibold text-[#FFE4E8] hover:bg-[#FF1744]/35"
                >
                  RESET
                </button>
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-[#FCA5A5]">{activeFault.detail}</p>
            </div>
          </div>
        )}
      </div>

      {/* Top-Right Camera Presets & Overlay Toggles */}
      <div className="absolute right-3 top-3 flex flex-col items-end gap-2">
        <div className="flex items-center gap-1 rounded-md border border-[#2A303C] bg-[#14171D]/90 p-1 backdrop-blur-sm">
          {(['ISO', 'TOP', 'FRONT', 'SIDE'] as CameraPreset[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => applyPreset(p)}
              className={`rounded px-2 py-1 font-mono text-[10px] font-semibold transition-colors ${
                camPreset === p
                  ? 'bg-[#283142] text-[#00E5FF]'
                  : 'text-[#8B949E] hover:bg-[#1E232E] hover:text-[#E6EDF3]'
              }`}
            >
              {p}
            </button>
          ))}
          <div className="mx-0.5 h-4 w-px bg-[#2A303C]" />
          <button
            type="button"
            onClick={returnHome}
            title="Return Robot to Home Perch"
            className="flex items-center gap-1 rounded px-2 py-1 font-mono text-[10px] font-semibold text-[#CBD5E1] hover:bg-[#1E232E] hover:text-[#00E676]"
          >
            <Home className="h-3 w-3" />
            HOME
          </button>
        </div>

        <div className="flex items-center gap-1 rounded-md border border-[#2A303C] bg-[#14171D]/90 p-1 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setShowPathPreview(!showPathPreview)}
            className={`flex items-center gap-1 rounded px-2 py-1 font-mono text-[10px] ${
              showPathPreview ? 'bg-[#00E5FF]/15 text-[#00E5FF]' : 'text-[#64748B] hover:text-[#CBD5E1]'
            }`}
          >
            <GitBranch className="h-3 w-3" />
            PATH
          </button>
          <button
            type="button"
            onClick={() => setShowSafetyZones(!showSafetyZones)}
            className={`flex items-center gap-1 rounded px-2 py-1 font-mono text-[10px] ${
              showSafetyZones ? 'bg-[#FF1744]/15 text-[#FF6B81]' : 'text-[#64748B] hover:text-[#CBD5E1]'
            }`}
          >
            <Box className="h-3 w-3" />
            DCS
          </button>
          <button
            type="button"
            onClick={() => setShowTriads(!showTriads)}
            className={`flex items-center gap-1 rounded px-2 py-1 font-mono text-[10px] ${
              showTriads ? 'bg-[#00E676]/15 text-[#00E676]' : 'text-[#64748B] hover:text-[#CBD5E1]'
            }`}
          >
            <Compass className="h-3 w-3" />
            FRAMES
          </button>
        </div>
      </div>

      {/* Bottom-Left Cycle Time & Blend Telemetry Strip */}
      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-3 rounded-md border border-[#2A303C] bg-[#14171D]/90 px-3 py-1.5 font-mono text-[11px] backdrop-blur-sm">
          <div className="flex items-center gap-1.5">
            <span className="text-[#8B949E]">CYCLE</span>
            <span className="font-semibold text-[#00E5FF] tabular-nums">
              {hudCycleTimeSec > 0 ? hudCycleTimeSec.toFixed(2) : pathPreview.estimatedCycleTimeSec.toFixed(2)}s
            </span>
          </div>
          {scenario.taktTargetSec && (
            <>
              <span className="text-[#2A303C]">|</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[#8B949E]">TAKT</span>
                <span
                  className={`font-semibold tabular-nums ${
                    pathPreview.estimatedCycleTimeSec <= scenario.taktTargetSec
                      ? 'text-[#00E676]'
                      : 'text-[#FFB300]'
                  }`}
                >
                  &lt; {scenario.taktTargetSec.toFixed(1)}s
                </span>
              </div>
            </>
          )}
          <span className="text-[#2A303C]">|</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[#8B949E]">BLEND</span>
            <span className="font-semibold text-[#FFB300] tabular-nums">
              {pathPreview.blendEfficiencyPct.toFixed(0)}%
            </span>
          </div>
          <span className="text-[#2A303C]">|</span>
          <div className="flex items-center gap-1.5">
            {pathPreview.predictedSafetyBreach ? (
              <>
                <ShieldAlert className="h-3.5 w-3.5 text-[#FF1744]" />
                <span className="font-semibold text-[#FF1744]">ZONE BREACH PREDICTED</span>
              </>
            ) : (
              <>
                <ShieldCheck className="h-3.5 w-3.5 text-[#00E676]" />
                <span className="font-semibold text-[#00E676]">DCS CLEAR</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Bottom-Right Orbit Hint */}
      <div className="pointer-events-none absolute bottom-3 right-3 hidden items-center gap-1.5 rounded border border-[#2A303C]/80 bg-[#14171D]/75 px-2.5 py-1 font-mono text-[10px] text-[#64748B] xl:flex">
        <Eye className="h-3 w-3" />
        LMB Orbit · RMB Pan · Scroll Zoom
      </div>
    </div>
  )
}
