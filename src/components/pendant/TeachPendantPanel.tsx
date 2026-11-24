import { useEffect, useState, type PointerEvent } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Crosshair,
  Hand,
  Home,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Square,
  Target,
  Trash2,
} from 'lucide-react'
import {
  OMNI_ROBOT_SPEC,
  type ControllerMode,
  type CoordinateFrameMode,
} from '../../engine/kinematics/types'
import { clearRuntimeJog, setRuntimeJogAxis, useRobotStore } from '../../engine/store/robotStore'

const JOINT_LABELS = ['J1', 'J2', 'J3', 'J4', 'J5', 'J6'] as const
const CART_LABELS = ['X', 'Y', 'Z', 'Rx', 'Ry', 'Rz'] as const
const KEY_BINDINGS: ReadonlyArray<[string, string]> = [
  ['Q', 'A'],
  ['W', 'S'],
  ['E', 'D'],
  ['R', 'F'],
  ['T', 'G'],
  ['Y', 'H'],
]

export function TeachPendantPanel() {
  const [pressedKey, setPressedKey] = useState<string | null>(null)
  const [showTelemetry, setShowTelemetry] = useState(true)

  const scenarioId = useRobotStore((s) => s.scenarioId)
  const controllerMode = useRobotStore((s) => s.controllerMode)
  const executionMode = useRobotStore((s) => s.executionMode)
  const coordinateFrame = useRobotStore((s) => s.coordinateFrame)
  const deadmanEnabled = useRobotStore((s) => s.deadmanEnabled)
  const speedOverridePct = useRobotStore((s) => s.speedOverridePct)
  const isRunning = useRobotStore((s) => s.isRunning)
  const isPaused = useRobotStore((s) => s.isPaused)
  const tool = useRobotStore((s) => s.tool)
  const userFrame = useRobotStore((s) => s.userFrame)

  const hudJoints = useRobotStore((s) => s.hudJoints)
  const hudJointVel = useRobotStore((s) => s.hudJointVel)
  const hudTcpWorld = useRobotStore((s) => s.hudTcpWorld)
  const hudTcpUser = useRobotStore((s) => s.hudTcpUser)
  const hudSingularity = useRobotStore((s) => s.hudSingularity)
  const hudPhysicalTipErrorMm = useRobotStore((s) => s.hudPhysicalTipErrorMm)

  const tcpSamples = useRobotStore((s) => s.tcpSamples)
  const tcpCalResult = useRobotStore((s) => s.tcpCalResult)
  const s1Telemetry = useRobotStore((s) => s.telemetryByScenario.scenario1)

  const setControllerMode = useRobotStore((s) => s.setControllerMode)
  const setExecutionMode = useRobotStore((s) => s.setExecutionMode)
  const setCoordinateFrame = useRobotStore((s) => s.setCoordinateFrame)
  const setDeadmanEnabled = useRobotStore((s) => s.setDeadmanEnabled)
  const setSpeedOverride = useRobotStore((s) => s.setSpeedOverride)
  const startProgram = useRobotStore((s) => s.startProgram)
  const stepProgram = useRobotStore((s) => s.stepProgram)
  const holdProgram = useRobotStore((s) => s.holdProgram)
  const stopProgram = useRobotStore((s) => s.stopProgram)
  const returnHome = useRobotStore((s) => s.returnHome)
  const recordTcpSample = useRobotStore((s) => s.recordTcpSample)
  const clearTcpSamples = useRobotStore((s) => s.clearTcpSamples)
  const solveAndApplyTcp = useRobotStore((s) => s.solveAndApplyTcp)
  const jumpToCalibrationApproach = useRobotStore((s) => s.jumpToCalibrationApproach)

  // Desktop keyboard jog shortcuts (Q/A, W/S, E/D, R/F, T/G, Y/H)
  useEffect(() => {
    const keyMap: Record<string, [number, -1 | 1]> = {
      q: [0, 1],
      a: [0, -1],
      w: [1, 1],
      s: [1, -1],
      e: [2, 1],
      d: [2, -1],
      r: [3, 1],
      f: [3, -1],
      t: [4, 1],
      g: [4, -1],
      y: [5, 1],
      h: [5, -1],
    }

    const onKeyDown = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.tagName === 'SELECT')) return
      const mapped = keyMap[ev.key.toLowerCase()]
      if (!mapped) return
      const [axis, dir] = mapped
      setRuntimeJogAxis(axis, dir)
      setPressedKey(`${axis}_${dir}`)
    }

    const onKeyUp = (ev: KeyboardEvent) => {
      const mapped = keyMap[ev.key.toLowerCase()]
      if (!mapped) return
      const [axis] = mapped
      setRuntimeJogAxis(axis, 0)
      setPressedKey(null)
    }

    const clearAll = () => {
      clearRuntimeJog()
      setPressedKey(null)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', clearAll)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', clearAll)
      clearAll()
    }
  }, [])

  // Pointer-capture safe press-and-hold for iOS Safari & Android Chrome
  const handleJogDown = (e: PointerEvent<HTMLButtonElement>, axis: number, dir: -1 | 1) => {
    e.preventDefault()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Ignore synthetic events without active pointerId
    }
    setRuntimeJogAxis(axis, dir)
    setPressedKey(`${axis}_${dir}`)
  }

  const handleJogRelease = (axis: number) => {
    setRuntimeJogAxis(axis, 0)
    setPressedKey(null)
  }

  const canManualJog = deadmanEnabled && (controllerMode === 'T1' || controllerMode === 'T2') && !isRunning
  const activePose = coordinateFrame === 'USER' ? hudTcpUser : hudTcpWorld
  const axisLabels = coordinateFrame === 'JOINT' ? JOINT_LABELS : CART_LABELS

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-2.5 pb-4 lg:gap-2.5 lg:p-3">
      {/* Row 1: Deadman + T1/T2/AUTO + STEP/CONT + Transport Bar */}
      <div className="hmi-recessed rounded-md p-2 lg:p-2.5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-1.5">
          <button
            type="button"
            onClick={() => setDeadmanEnabled(!deadmanEnabled)}
            className={`flex min-h-[34px] items-center gap-1 rounded border px-2 py-1 font-mono text-[10px] font-bold transition-colors ${
              deadmanEnabled
                ? 'border-[#00E676]/60 bg-[#00E676]/15 text-[#00E676]'
                : 'border-[#FFB300]/50 bg-[#FFB300]/10 text-[#FFB300]'
            }`}
          >
            <Hand className="h-3.5 w-3.5" />
            <span>{deadmanEnabled ? 'DEADMAN ON' : 'DEADMAN OFF'}</span>
          </button>

          <div className="flex items-center rounded border border-[#2A303C] bg-[#151820] p-0.5">
            {(['T1', 'T2', 'AUTO'] as ControllerMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setControllerMode(m)}
                className={`min-h-[30px] rounded px-2.5 py-0.5 font-mono text-[10.5px] font-bold transition-colors ${
                  controllerMode === m
                    ? m === 'AUTO'
                      ? 'bg-[#00E676]/20 text-[#00E676]'
                      : 'bg-[#00E5FF]/20 text-[#00E5FF]'
                    : 'text-[#64748B] hover:text-[#CBD5E1]'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <div className="flex items-center rounded border border-[#2A303C] bg-[#151820] p-0.5">
            {(['CONT', 'STEP'] as const).map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setExecutionMode(ex)}
                className={`min-h-[30px] rounded px-2 py-0.5 font-mono text-[10px] font-semibold ${
                  executionMode === ex
                    ? 'bg-[#FFB300]/20 text-[#FFB300]'
                    : 'text-[#64748B] hover:text-[#CBD5E1]'
                }`}
              >
                {ex}
              </button>
            ))}
          </div>
        </div>

        {/* Thumb-Friendly Cycle Transport Bar */}
        <div className="grid grid-cols-5 gap-1.5">
          <button
            type="button"
            onClick={startProgram}
            className={`flex min-h-[38px] flex-col items-center justify-center gap-0.5 rounded border py-1 font-mono text-[9.5px] font-bold transition-colors sm:flex-row sm:gap-1 sm:text-[10px] ${
              isRunning
                ? 'border-[#00E676] bg-[#00E676]/25 text-[#00E676]'
                : 'border-[#00E676]/45 bg-[#00E676]/12 text-[#00E676] hover:bg-[#00E676]/20'
            }`}
          >
            <Play className="h-3.5 w-3.5" />
            {isPaused ? 'CONT' : 'RUN'}
          </button>
          <button
            type="button"
            onClick={stepProgram}
            className="flex min-h-[38px] flex-col items-center justify-center gap-0.5 rounded border border-[#00E5FF]/40 bg-[#00E5FF]/10 py-1 font-mono text-[9.5px] font-bold text-[#00E5FF] hover:bg-[#00E5FF]/20 sm:flex-row sm:gap-1 sm:text-[10px]"
          >
            <SkipForward className="h-3.5 w-3.5" />
            STEP
          </button>
          <button
            type="button"
            onClick={holdProgram}
            className="flex min-h-[38px] flex-col items-center justify-center gap-0.5 rounded border border-[#FFB300]/45 bg-[#FFB300]/10 py-1 font-mono text-[9.5px] font-bold text-[#FFB300] hover:bg-[#FFB300]/20 sm:flex-row sm:gap-1 sm:text-[10px]"
          >
            <Pause className="h-3.5 w-3.5" />
            HOLD
          </button>
          <button
            type="button"
            onClick={stopProgram}
            className="flex min-h-[38px] flex-col items-center justify-center gap-0.5 rounded border border-[#FF1744]/40 bg-[#FF1744]/10 py-1 font-mono text-[9.5px] font-bold text-[#FF6B81] hover:bg-[#FF1744]/20 sm:flex-row sm:gap-1 sm:text-[10px]"
          >
            <Square className="h-3.5 w-3.5" />
            STOP
          </button>
          <button
            type="button"
            onClick={returnHome}
            className="flex min-h-[38px] flex-col items-center justify-center gap-0.5 rounded border border-[#353D4D] bg-[#1F242E] py-1 font-mono text-[9.5px] font-bold text-[#CBD5E1] hover:border-[#00E5FF]/50 hover:text-[#00E5FF] sm:flex-row sm:gap-1 sm:text-[10px]"
          >
            <Home className="h-3.5 w-3.5" />
            HOME
          </button>
        </div>

        {/* Speed Override % */}
        <div className="mt-2 flex items-center gap-2">
          <span className="font-mono text-[10px] font-semibold text-[#8B949E]">OVR</span>
          <button
            type="button"
            onClick={() => setSpeedOverride(speedOverridePct - 10)}
            className="hmi-key min-h-[32px] rounded px-2.5 font-mono text-[11px] font-bold text-[#E6EDF3]"
          >
            −
          </button>
          <input
            type="range"
            min={5}
            max={100}
            step={5}
            value={speedOverridePct}
            onChange={(e) => setSpeedOverride(Number(e.target.value))}
            className="h-2 flex-1 cursor-pointer accent-[#00E5FF]"
            aria-label="Speed Override Percentage"
          />
          <button
            type="button"
            onClick={() => setSpeedOverride(speedOverridePct + 10)}
            className="hmi-key min-h-[32px] rounded px-2.5 font-mono text-[11px] font-bold text-[#E6EDF3]"
          >
            +
          </button>
          <span className="w-10 text-right font-mono text-xs font-bold text-[#00E5FF] tabular-nums">
            {speedOverridePct}%
          </span>
        </div>
      </div>

      {/* Row 2: Coordinate Frame Switcher & Thumb-Sized Hold-to-Jog Keypad */}
      <div className="hmi-recessed rounded-md p-2 lg:p-2.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] font-bold tracking-wider text-[#94A3B8]">
            FRAME
          </span>
          <div className="grid flex-1 grid-cols-4 gap-1">
            {(['JOINT', 'WORLD', 'TOOL', 'USER'] as CoordinateFrameMode[]).map((frame) => (
              <button
                key={frame}
                type="button"
                onClick={() => setCoordinateFrame(frame)}
                className={`min-h-[32px] rounded border font-mono text-[10px] font-bold transition-colors ${
                  coordinateFrame === frame
                    ? 'border-[#00E5FF] bg-[#00E5FF]/15 text-[#00E5FF]'
                    : 'border-[#2A303C] bg-[#181C24] text-[#8B949E] hover:text-[#E6EDF3]'
                }`}
              >
                {frame}
              </button>
            ))}
          </div>
        </div>

        {!canManualJog && (
          <button
            type="button"
            onClick={() => {
              if (controllerMode === 'AUTO') setControllerMode('T1')
              if (!deadmanEnabled) setDeadmanEnabled(true)
            }}
            className="mb-2 w-full rounded border border-[#FFB300]/45 bg-[#FFB300]/12 px-2.5 py-1.5 text-left font-mono text-[10px] font-semibold text-[#FFB300]"
          >
            {controllerMode === 'AUTO'
              ? 'Tap here to switch AUTO → T1 for manual thumb jogging.'
              : !deadmanEnabled
                ? 'Tap here to latch DEADMAN ON for manual jogging.'
                : 'Stop program execution before manual jogging.'}
          </button>
        )}

        <div className="grid grid-cols-2 gap-1.5">
          {axisLabels.map((label, idx) => {
            const [posKey, negKey] = KEY_BINDINGS[idx]
            const negActive = pressedKey === `${idx}_-1`
            const posActive = pressedKey === `${idx}_1`
            return (
              <div
                key={label}
                className="flex items-center justify-between gap-1 rounded border border-[#242A35] bg-[#151820] p-1"
              >
                <button
                  type="button"
                  disabled={!canManualJog}
                  onPointerDown={(e) => handleJogDown(e, idx, -1)}
                  onPointerUp={() => handleJogRelease(idx)}
                  onPointerCancel={() => handleJogRelease(idx)}
                  onContextMenu={(e) => e.preventDefault()}
                  className={`hmi-key jog-touch-key flex min-h-[44px] flex-1 items-center justify-center rounded font-mono text-xs font-bold disabled:opacity-35 lg:min-h-[34px] lg:text-[11px] ${
                    negActive ? 'hmi-key-pressed text-[#00E5FF]' : 'text-[#E6EDF3]'
                  }`}
                  title={`Jog -${label} (Hold key ${negKey})`}
                >
                  −{label}
                </button>
                <span className="hidden w-7 text-center font-mono text-[9px] text-[#64748B] lg:inline">
                  {negKey}/{posKey}
                </span>
                <button
                  type="button"
                  disabled={!canManualJog}
                  onPointerDown={(e) => handleJogDown(e, idx, 1)}
                  onPointerUp={() => handleJogRelease(idx)}
                  onPointerCancel={() => handleJogRelease(idx)}
                  onContextMenu={(e) => e.preventDefault()}
                  className={`hmi-key jog-touch-key flex min-h-[44px] flex-1 items-center justify-center rounded font-mono text-xs font-bold disabled:opacity-35 lg:min-h-[34px] lg:text-[11px] ${
                    posActive ? 'hmi-key-pressed text-[#00E5FF]' : 'text-[#E6EDF3]'
                  }`}
                  title={`Jog +${label} (Hold key ${posKey})`}
                >
                  +{label}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Row 3: Scenario 1 Dedicated 3-Point Sphere-Fit TCP Calibration Console */}
      {scenarioId === 'scenario1' && (
        <div className="rounded-md border border-[#00E5FF]/35 bg-[#111922] p-2.5">
          <div className="mb-1.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Crosshair className="h-3.5 w-3.5 text-[#00E5FF]" />
              <span className="font-mono text-[10.5px] font-bold text-[#00E5FF]">
                3-POINT TCP CALIBRATION
              </span>
            </div>
            <span
              className={`font-mono text-[10.5px] font-bold tabular-nums ${
                hudPhysicalTipErrorMm < 1.5 ? 'text-[#00E676]' : 'text-[#FFB300]'
              }`}
            >
              PIN Δ: {hudPhysicalTipErrorMm.toFixed(2)} mm
            </span>
          </div>

          <div className="mb-2 grid grid-cols-3 gap-1.5">
            {([1, 2, 3] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => jumpToCalibrationApproach(n)}
                className="min-h-[36px] rounded border border-[#2A3548] bg-[#18212E] font-mono text-[10.5px] font-semibold text-[#CBD5E1] hover:border-[#00E5FF]/60 hover:text-[#00E5FF]"
              >
                Approach #{n}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={recordTcpSample}
              className="flex min-h-[40px] flex-1 items-center justify-center gap-1 rounded border border-[#00E5FF]/50 bg-[#00E5FF]/15 font-mono text-[10.5px] font-bold text-[#00E5FF] hover:bg-[#00E5FF]/25"
            >
              <Target className="h-3.5 w-3.5" />
              RECORD ({tcpSamples.length}/3)
            </button>
            <button
              type="button"
              disabled={tcpSamples.length < 3}
              onClick={solveAndApplyTcp}
              className="flex min-h-[40px] flex-1 items-center justify-center gap-1 rounded border border-[#00E676]/50 bg-[#00E676]/15 font-mono text-[10.5px] font-bold text-[#00E676] hover:bg-[#00E676]/25 disabled:opacity-40"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              SOLVE TCP
            </button>
            <button
              type="button"
              onClick={clearTcpSamples}
              title="Reset TCP Calibration"
              className="flex min-h-[40px] w-10 items-center justify-center rounded border border-[#2A303C] bg-[#1C1F26] text-[#94A3B8] hover:text-[#FF6B81]"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          {tcpCalResult && (
            <div
              className={`mt-2 rounded border px-2.5 py-2 font-mono text-[10px] tabular-nums ${
                tcpCalResult.success && tcpCalResult.rmsErrorMm < 1.5
                  ? 'border-[#00E676]/45 bg-[#00E676]/10 text-[#00E676]'
                  : 'border-[#FFB300]/45 bg-[#FFB300]/10 text-[#FFB300]'
              }`}
            >
              <div className="font-bold">{tcpCalResult.message}</div>
              <div className="mt-0.5 text-[#CBD5E1]">
                UTOOL[1] → X:{tool.x.toFixed(1)} Y:{tool.y.toFixed(1)} Z:{tool.z.toFixed(1)} mm
              </div>
              <div className="mt-0.5 text-[#94A3B8]">
                {s1Telemetry.tcpRotationVerified
                  ? '✓ Rotation Invariance Verified (< 1.5 mm drift)'
                  : 'Switch to TOOL frame and hold ±Rx/±Ry/±Rz to verify tip stays locked on pin.'}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Row 4: Collapsible Joint Angles & Cartesian WPR HUD */}
      <div className="hmi-recessed rounded-md p-2.5">
        <button
          type="button"
          onClick={() => setShowTelemetry(!showTelemetry)}
          className="flex w-full items-center justify-between font-mono text-[10px]"
        >
          <span className="font-bold text-[#94A3B8]">JOINTS &amp; CARTESIAN READOUT</span>
          <span className="flex items-center gap-2">
            <span
              className={`font-semibold tabular-nums ${
                hudSingularity.wristCritical
                  ? 'text-[#FF1744]'
                  : hudSingularity.wristWarning
                    ? 'text-[#FFB300]'
                    : 'text-[#00E676]'
              }`}
            >
              |J5| {hudSingularity.wristAngleDeg.toFixed(1)}°
            </span>
            {showTelemetry ? (
              <ChevronUp className="h-3.5 w-3.5 text-[#64748B]" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-[#64748B]" />
            )}
          </span>
        </button>

        {showTelemetry && (
          <>
            <div className="mt-2 space-y-1.5">
              {hudJoints.map((deg, i) => {
                const min = OMNI_ROBOT_SPEC.jointMin[i]
                const max = OMNI_ROBOT_SPEC.jointMax[i]
                const pct = ((deg - min) / (max - min)) * 100
                const vel = Math.abs(hudJointVel[i])
                const nearJ5Sing = i === 4 && hudSingularity.wristWarning
                const highVel = vel > OMNI_ROBOT_SPEC.jointMaxVelDegPerSec[i] * 0.65

                return (
                  <div key={JOINT_LABELS[i]} className="flex items-center gap-2 font-mono text-[10px] tabular-nums">
                    <span className={`w-5 font-bold ${nearJ5Sing ? 'text-[#FFB300]' : 'text-[#8B949E]'}`}>
                      {JOINT_LABELS[i]}
                    </span>
                    <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-[#1C212B]">
                      <div
                        className={`h-full rounded-full transition-all duration-75 ${
                          nearJ5Sing
                            ? 'bg-[#FFB300]'
                            : highVel
                              ? 'bg-[#FF1744]'
                              : 'bg-[#00E5FF]'
                        }`}
                        style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
                      />
                    </div>
                    <span className="w-13 text-right font-semibold text-[#E6EDF3]">
                      {deg.toFixed(1)}°
                    </span>
                    <span
                      className={`w-12 text-right text-[9px] ${
                        highVel ? 'font-bold text-[#FF1744]' : 'text-[#64748B]'
                      }`}
                    >
                      {vel.toFixed(0)}°/s
                    </span>
                  </div>
                )
              })}
            </div>

            <div className="mt-2.5 border-t border-[#232833] pt-2">
              <div className="mb-1 flex items-center justify-between font-mono text-[9.5px]">
                <span className="font-bold text-[#94A3B8]">
                  TCP ({coordinateFrame === 'USER' ? userFrame.name : 'WORLD'})
                </span>
                <span className="truncate text-[#64748B]">{tool.name}</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 font-mono text-[10px] tabular-nums">
                {[
                  ['X', activePose.x, 'mm'],
                  ['Y', activePose.y, 'mm'],
                  ['Z', activePose.z, 'mm'],
                  ['W', activePose.w, '°'],
                  ['P', activePose.p, '°'],
                  ['R', activePose.r, '°'],
                ].map(([k, val, unit]) => (
                  <div
                    key={String(k)}
                    className="flex items-center justify-between rounded border border-[#222731] bg-[#14171D] px-2 py-1"
                  >
                    <span className="font-bold text-[#64748B]">{k}</span>
                    <span className="font-semibold text-[#E6EDF3]">
                      {Number(val).toFixed(1)}
                      <span className="ml-0.5 text-[9px] text-[#64748B]">{unit}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
