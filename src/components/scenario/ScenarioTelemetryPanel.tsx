import { useState } from 'react'
import {
  AlertTriangle,
  BatteryWarning,
  Check,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Copy,
  Download,
  RefreshCw,
  Shield,
  ShieldAlert,
  Wrench,
  Zap,
} from 'lucide-react'
import { useFieldbusStore } from '../../engine/fieldbus/fieldbusStore'
import { SCENARIOS } from '../../engine/scenarios/definitions'
import { snapRuntimeJointsToZero, useRobotStore } from '../../engine/store/robotStore'

export function ScenarioTelemetryPanel() {
  const [copied, setCopied] = useState(false)

  const scenarioId = useRobotStore((s) => s.scenarioId)
  const telemetry = useRobotStore((s) => s.telemetryByScenario[s.scenarioId])
  const allTelemetry = useRobotStore((s) => s.telemetryByScenario)
  const pathPreview = useRobotStore((s) => s.pathPreview)
  const safetyZones = useRobotStore((s) => s.safetyZones)
  const activeFault = useRobotStore((s) => s.activeFault)
  const bzalRequiresMaster = useRobotStore((s) => s.bzalRequiresMaster)
  const bzalCleared = useRobotStore((s) => s.bzalCleared)
  const tcpSamples = useRobotStore((s) => s.tcpSamples)
  const tcpCalResult = useRobotStore((s) => s.tcpCalResult)
  const dialect = useRobotStore((s) => s.dialect)
  const programName = useRobotStore((s) => s.programName)

  const setSafetyZoneEnabled = useRobotStore((s) => s.setSafetyZoneEnabled)
  const updateSafetyZoneSize = useRobotStore((s) => s.updateSafetyZoneSize)
  const loadSecondaryProgram = useRobotStore((s) => s.loadSecondaryProgram)
  const resetScenarioProgram = useRobotStore((s) => s.resetScenarioProgram)
  const startProgram = useRobotStore((s) => s.startProgram)
  const resetFault = useRobotStore((s) => s.resetFault)

  const injectBzalFault = useRobotStore((s) => s.injectBzalFault)
  const clearBzalAlarm = useRobotStore((s) => s.clearBzalAlarm)
  const executeQuickMaster = useRobotStore((s) => s.executeQuickMaster)
  const injectGripperReedFault = useRobotStore((s) => s.injectGripperReedFault)
  const restoreGripperReedSensor = useRobotStore((s) => s.restoreGripperReedSensor)
  const injectCncDoorCollisionFault = useRobotStore((s) => s.injectCncDoorCollisionFault)
  const restoreCncDoorInterlock = useRobotStore((s) => s.restoreCncDoorInterlock)
  const randomizeBillet = useRobotStore((s) => s.randomizeBillet)

  const faultSuppressReed = useFieldbusStore((s) => s.faultSuppressGripperClosedReed)
  const faultDoorStuck = useFieldbusStore((s) => s.faultCncDoorStuckClosed)
  const di = useFieldbusStore((s) => s.di)

  const scenario = SCENARIOS[scenarioId]

  // Deterministic Mission Pass/Fail Objective Evaluator
  const isObjectiveComplete = (objId: string): boolean => {
    switch (objId) {
      case 'explore_frames':
        return telemetry.framesExplored.length >= 3
      case 'record_3_points':
        return tcpSamples.length >= 3 || telemetry.tcpCalibrationRmsMm !== null
      case 'solve_tcp':
        return (
          (tcpCalResult?.success && tcpCalResult.rmsErrorMm < 1.5) ||
          (telemetry.tcpCalibrationRmsMm !== null && telemetry.tcpCalibrationRmsMm < 1.5)
        )
      case 'verify_invariance':
        return telemetry.tcpRotationVerified
      case 'run_baseline':
        return telemetry.completedCycles >= 1
      case 'tune_cnt_blend':
        return pathPreview.cntBlendCount >= 3
      case 'beat_takt_time':
        return (
          telemetry.bestCycleTimeSec !== null &&
          scenario.taktTargetSec !== undefined &&
          telemetry.bestCycleTimeSec <= scenario.taktTargetSec
        )
      case 'observe_singularity':
        return telemetry.singularityFaultCount >= 1
      case 'resolve_singularity':
        return telemetry.singularityResolved
      case 'verify_dcs_stop':
        return telemetry.dcsVerifiedStop
      case 'complete_vision_cycle':
        return telemetry.completedCycles >= 1
      case 'triage_bzal':
        return telemetry.faultsTriaged.includes('BZAL')
      case 'triage_gripper':
        return telemetry.faultsTriaged.includes('GRIPPER')
      case 'triage_collision':
        return telemetry.faultsTriaged.includes('COLLISION')
      case 'ft_swap_tool':
        return telemetry.freeTeachToolSwapped
      case 'ft_record_points':
        return telemetry.freeTeachPointsRecorded >= 3
      case 'ft_run_program':
        return telemetry.completedCycles >= 1
      default:
        return false
    }
  }

  const completedCount = scenario.objectives.filter((o) => isObjectiveComplete(o.id)).length
  const missionPassed = completedCount === scenario.objectives.length

  const buildReportMarkdown = (): string => {
    const lines = [
      `# OmniCell Studio — Mission Engineering Report`,
      `**Generated:** ${new Date().toISOString()}`,
      `**Active Scenario:** Scenario 0${scenario.number} — ${scenario.title}`,
      `**Controller Model:** OMNI-R20iD/25 (6-DOF Spherical Wrist)`,
      `**Active OEM Dialect:** ${dialect} (${programName})`,
      `**Mission Status:** ${missionPassed ? 'PASS' : `IN PROGRESS (${completedCount}/${scenario.objectives.length})`}`,
      ``,
      `## Key Telemetry Metrics`,
      `- Best Verified Cycle Time: ${telemetry.bestCycleTimeSec ? `${telemetry.bestCycleTimeSec.toFixed(2)}s` : 'Not run'}`,
      `- Estimated Program Cycle Time: ${pathPreview.estimatedCycleTimeSec.toFixed(2)}s`,
      `- CNT Corner Blend Efficiency: ${pathPreview.blendEfficiencyPct.toFixed(1)}%`,
      `- Safety Zone Breaches Logged: ${telemetry.safetyBreachCount}`,
      `- Singularity Warnings / Faults: ${telemetry.singularityWarningCount} / ${telemetry.singularityFaultCount}`,
      `- Completed Cycles: ${telemetry.completedCycles}`,
      ...(scenarioId === 'scenario1'
        ? [
            `- 3-Point TCP RMS Error: ${telemetry.tcpCalibrationRmsMm !== null ? `${telemetry.tcpCalibrationRmsMm.toFixed(3)} mm` : 'Pending'}`,
            `- TOOL Rotation Invariance Verified: ${telemetry.tcpRotationVerified ? 'YES' : 'NO'}`,
          ]
        : []),
      ...(scenarioId === 'scenario4'
        ? [`- Plant-Floor Faults Triaged: ${telemetry.faultsTriaged.join(', ') || 'None yet'}`]
        : []),
      ``,
      `## Objective Scorecard`,
      ...scenario.objectives.map(
        (o) => `- [${isObjectiveComplete(o.id) ? 'x' : ' '}] **${o.label}** — ${o.description}`,
      ),
    ]
    return lines.join('\n')
  }

  const handleCopyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(buildReportMarkdown())
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Fallback ignored in headless environments
    }
  }

  const handleDownloadJson = () => {
    const payload = {
      platform: 'OmniCell Studio',
      generatedAt: new Date().toISOString(),
      activeScenario: scenario.id,
      activeDialect: dialect,
      programName,
      missionPassed,
      completedObjectives: `${completedCount}/${scenario.objectives.length}`,
      telemetry: allTelemetry,
      pathMetrics: {
        estimatedCycleTimeSec: Number(pathPreview.estimatedCycleTimeSec.toFixed(3)),
        blendEfficiencyPct: Number(pathPreview.blendEfficiencyPct.toFixed(1)),
        fineStopCount: pathPreview.fineStopCount,
        cntBlendCount: pathPreview.cntBlendCount,
      },
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `omnicell-report-${scenario.id}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const dcsZone = safetyZones.find((z) => z.kind === 'DCS_FORBIDDEN')

  return (
    <div className="flex h-full flex-col gap-2.5 overflow-y-auto p-3">
      {/* Mission Header & Status Pill */}
      <div className="hmi-recessed rounded-md p-2.5">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] font-bold tracking-wider text-[#00E5FF]">
            SCENARIO 0{scenario.number} · {scenario.difficulty}
          </span>
          <span
            className={`rounded px-2 py-0.5 font-mono text-[10px] font-bold ${
              missionPassed
                ? 'bg-[#00E676]/20 text-[#00E676]'
                : 'bg-[#232833] text-[#CBD5E1]'
            }`}
          >
            {missionPassed ? 'MISSION PASS' : `${completedCount}/${scenario.objectives.length} COMPLETE`}
          </span>
        </div>
        <h2 className="text-xs font-bold text-[#F1F5F9]">{scenario.title}</h2>
        <p className="mt-1 text-[11px] leading-snug text-[#94A3B8]">{scenario.subtitle}</p>
      </div>

      {/* Live Telemetry KPI Grid */}
      <div className="grid grid-cols-2 gap-1.5 font-mono">
        <div className="hmi-recessed rounded p-2">
          <div className="text-[9px] text-[#64748B]">BEST / EST CYCLE</div>
          <div className="mt-0.5 text-xs font-bold text-[#00E5FF] tabular-nums">
            {telemetry.bestCycleTimeSec ? `${telemetry.bestCycleTimeSec.toFixed(2)}s` : '--'}
            <span className="ml-1 text-[10px] font-normal text-[#8B949E]">
              / {pathPreview.estimatedCycleTimeSec.toFixed(2)}s
            </span>
          </div>
        </div>
        <div className="hmi-recessed rounded p-2">
          <div className="text-[9px] text-[#64748B]">CNT BLEND GAIN</div>
          <div className="mt-0.5 text-xs font-bold text-[#FFB300] tabular-nums">
            {pathPreview.blendEfficiencyPct.toFixed(1)}%
            <span className="ml-1 text-[10px] font-normal text-[#8B949E]">
              ({pathPreview.cntBlendCount} CNT)
            </span>
          </div>
        </div>
        <div className="hmi-recessed rounded p-2">
          <div className="text-[9px] text-[#64748B]">DCS / OBSTACLE BREACHES</div>
          <div
            className={`mt-0.5 text-xs font-bold tabular-nums ${
              telemetry.safetyBreachCount > 0 ? 'text-[#FF1744]' : 'text-[#00E676]'
            }`}
          >
            {telemetry.safetyBreachCount}
          </div>
        </div>
        <div className="hmi-recessed rounded p-2">
          <div className="text-[9px] text-[#64748B]">SINGULARITY EVENTS</div>
          <div
            className={`mt-0.5 text-xs font-bold tabular-nums ${
              telemetry.singularityFaultCount > 0 ? 'text-[#FFB300]' : 'text-[#E6EDF3]'
            }`}
          >
            {telemetry.singularityWarningCount} warn · {telemetry.singularityFaultCount} fault
          </div>
        </div>
      </div>

      {/* Scenario 3 Dedicated DCS / SafeMove CPC Configurator */}
      {scenarioId === 'scenario3' && dcsZone && (
        <div className="rounded-md border border-[#FF1744]/40 bg-[#1B1116] p-2.5">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-[#FF6B81]">
              <Shield className="h-3.5 w-3.5 text-[#FF1744]" />
              DCS / SAFEMOVE CPC-1 ZONE
            </div>
            <button
              type="button"
              onClick={() => setSafetyZoneEnabled(dcsZone.id, !dcsZone.enabled)}
              className={`rounded border px-2 py-0.5 font-mono text-[10px] font-bold ${
                dcsZone.enabled
                  ? 'border-[#FF1744] bg-[#FF1744]/20 text-[#FF6B81]'
                  : 'border-[#2A303C] bg-[#1C1F26] text-[#8B949E]'
              }`}
            >
              {dcsZone.enabled ? 'ARMED' : 'BYPASSED'}
            </button>
          </div>

          <div className="mb-2 space-y-1.5 font-mono text-[10px]">
            <div className="flex items-center justify-between text-[#CBD5E1]">
              <span>Operator Bay Y-Boundary Width</span>
              <span className="tabular-nums text-[#FF6B81]">{dcsZone.size[1].toFixed(0)} mm</span>
            </div>
            <input
              type="range"
              min={420}
              max={920}
              step={20}
              value={dcsZone.size[1]}
              onChange={(e) =>
                updateSafetyZoneSize(dcsZone.id, [dcsZone.size[0], Number(e.target.value), dcsZone.size[2]])
              }
              className="h-1.5 w-full cursor-pointer accent-[#FF1744]"
              aria-label="DCS Operator Bay Y-Boundary Width"
            />
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => {
                resetScenarioProgram()
                startProgram()
              }}
              className="min-h-[38px] rounded border border-[#FFB300]/50 bg-[#FFB300]/12 py-1.5 font-mono text-[10px] font-bold text-[#FFB300] hover:bg-[#FFB300]/22"
            >
              RUN SINGULARITY
            </button>
            <button
              type="button"
              onClick={() => {
                loadSecondaryProgram()
                startProgram()
              }}
              className="min-h-[38px] rounded border border-[#FF1744]/60 bg-[#FF1744]/15 py-1.5 font-mono text-[10px] font-bold text-[#FF6B81] hover:bg-[#FF1744]/25"
            >
              TEST DCS INTRUSION
            </button>
          </div>
        </div>
      )}

      {/* Scenario 4 Plant-Floor Fault Injection & Triage Console */}
      {scenarioId === 'scenario4' && (
        <div className="rounded-md border border-[#FFB300]/40 bg-[#1A1711] p-2.5">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-[#FFB300]">
              <Wrench className="h-3.5 w-3.5" />
              PLANT-FLOOR FAULT TRIAGE DRILLS
            </div>
            <button
              type="button"
              onClick={randomizeBillet}
              className="flex min-h-[30px] items-center gap-1 rounded border border-[#00E5FF]/40 bg-[#00E5FF]/10 px-2.5 py-0.5 font-mono text-[9.5px] font-bold text-[#00E5FF] hover:bg-[#00E5FF]/20"
            >
              <RefreshCw className="h-3 w-3" />
              NEW BILLET
            </button>
          </div>

          {/* 3 Realistic Plant-Floor Fault Triggers */}
          <div className="grid grid-cols-1 gap-1.5">
            {/* Fault 1: SRVO-062 BZAL */}
            <div className="rounded border border-[#2D313B] bg-[#14171D] p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-mono text-[10.5px] font-bold text-[#E6EDF3]">
                  <BatteryWarning className="h-3.5 w-3.5 text-[#FF1744]" />
                  SRVO-062 BZAL Alarm
                </span>
                <button
                  type="button"
                  onClick={injectBzalFault}
                  className="min-h-[34px] rounded border border-[#FF1744]/50 bg-[#FF1744]/15 px-3 font-mono text-[10px] font-bold text-[#FF6B81] hover:bg-[#FF1744]/25"
                >
                  INJECT
                </button>
              </div>
              {bzalRequiresMaster && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={clearBzalAlarm}
                    className={`min-h-[34px] rounded border px-2.5 py-1 font-mono text-[10px] font-bold ${
                      bzalCleared
                        ? 'border-[#00E676]/60 bg-[#00E676]/15 text-[#00E676]'
                        : 'border-[#FFB300]/60 bg-[#FFB300]/15 text-[#FFB300]'
                    }`}
                  >
                    1. {bzalCleared ? 'BZAL Cleared ✓' : 'Clear BZAL'}
                  </button>
                  <button
                    type="button"
                    onClick={snapRuntimeJointsToZero}
                    className="min-h-[34px] rounded border border-[#00E5FF]/50 bg-[#00E5FF]/10 px-2.5 py-1 font-mono text-[10px] font-bold text-[#00E5FF]"
                  >
                    2. Jog Zero Marks
                  </button>
                  <button
                    type="button"
                    disabled={!bzalCleared}
                    onClick={executeQuickMaster}
                    className="min-h-[34px] rounded border border-[#00E676]/60 bg-[#00E676]/15 px-2.5 py-1 font-mono text-[10px] font-bold text-[#00E676] disabled:opacity-40"
                  >
                    3. Quick Master &amp; Calibrate
                  </button>
                </div>
              )}
            </div>

            {/* Fault 2: Gripper Reed-Switch Timeout */}
            <div className="rounded border border-[#2D313B] bg-[#14171D] p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-mono text-[10.5px] font-bold text-[#E6EDF3]">
                  <Zap className="h-3.5 w-3.5 text-[#FFB300]" />
                  Gripper Reed Timeout
                </span>
                <div className="flex items-center gap-1">
                  {faultSuppressReed ? (
                    <button
                      type="button"
                      onClick={() => {
                        restoreGripperReedSensor()
                        resetFault()
                      }}
                      className="min-h-[34px] rounded border border-[#00E676]/60 bg-[#00E676]/15 px-2.5 font-mono text-[10px] font-bold text-[#00E676]"
                    >
                      RESTORE &amp; RESET
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={injectGripperReedFault}
                      className="min-h-[34px] rounded border border-[#FFB300]/50 bg-[#FFB300]/15 px-3 font-mono text-[10px] font-bold text-[#FFB300] hover:bg-[#FFB300]/25"
                    >
                      INJECT
                    </button>
                  )}
                </div>
              </div>
              {faultSuppressReed && (
                <p className="mt-1 font-mono text-[10px] text-[#FCA5A5]">
                  DO[1]=ON commanded, DI[4] ClosedReed={di[4] ? 'ON' : 'OFF'}! Inspect I/O Bus tab then restore sensor.
                </p>
              )}
            </div>

            {/* Fault 3: CNC Door Over-Torque Collision */}
            <div className="rounded border border-[#2D313B] bg-[#14171D] p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-mono text-[10.5px] font-bold text-[#E6EDF3]">
                  <ShieldAlert className="h-3.5 w-3.5 text-[#FF1744]" />
                  CNC Door Over-Torque
                </span>
                <div className="flex items-center gap-1">
                  {faultDoorStuck ? (
                    <button
                      type="button"
                      onClick={() => {
                        restoreCncDoorInterlock()
                        resetFault()
                      }}
                      className="min-h-[34px] rounded border border-[#00E676]/60 bg-[#00E676]/15 px-2.5 font-mono text-[10px] font-bold text-[#00E676]"
                    >
                      OPEN DOOR &amp; RESET
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={injectCncDoorCollisionFault}
                      className="min-h-[34px] rounded border border-[#FF1744]/50 bg-[#FF1744]/15 px-3 font-mono text-[10px] font-bold text-[#FF6B81] hover:bg-[#FF1744]/25"
                    >
                      INJECT
                    </button>
                  )}
                </div>
              </div>
              {faultDoorStuck && (
                <p className="mt-1 font-mono text-[10px] text-[#FCA5A5]">
                  DI[2] CNC_DoorOpen=OFF! Switch to T1 + WORLD, jog clear (−Y), then open door interlock &amp; reset.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Active Fault Guided Recovery Checklist */}
      {activeFault && (
        <div className="rounded-md border border-[#FF1744]/50 bg-[#251016] p-2.5">
          <div className="mb-1 flex items-center gap-1.5 font-mono text-[10px] font-bold text-[#FF6B81]">
            <AlertTriangle className="h-3.5 w-3.5 text-[#FF1744]" />
            RECOVERY PROCEDURE — {activeFault.code}
          </div>
          <ul className="space-y-1 text-[11px] text-[#FECDD3]">
            {activeFault.recoverySteps.map((step, idx) => (
              <li key={idx} className="leading-snug">
                • {step}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Mission Objectives Scorecard */}
      <div className="hmi-recessed rounded-md p-2.5">
        <div className="mb-2 flex items-center justify-between font-mono text-[10px]">
          <span className="flex items-center gap-1.5 font-bold text-[#94A3B8]">
            <ClipboardCheck className="h-3.5 w-3.5 text-[#00E676]" />
            MISSION SCORECARD
          </span>
          <span className="text-[#64748B] tabular-nums">
            {completedCount}/{scenario.objectives.length} PASSED
          </span>
        </div>

        <div className="space-y-2">
          {scenario.objectives.map((obj) => {
            const done = isObjectiveComplete(obj.id)
            return (
              <div
                key={obj.id}
                className={`flex items-start gap-2 rounded border p-2 transition-colors ${
                  done
                    ? 'border-[#00E676]/40 bg-[#00E676]/8'
                    : 'border-[#232833] bg-[#14171D]'
                }`}
              >
                {done ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#00E676]" />
                ) : (
                  <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#475569]" />
                )}
                <div>
                  <div
                    className={`font-mono text-[10.5px] font-bold ${
                      done ? 'text-[#00E676]' : 'text-[#E6EDF3]'
                    }`}
                  >
                    {obj.label}
                  </div>
                  <p className="mt-0.5 text-[10.5px] leading-snug text-[#8B949E]">{obj.description}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Mission Engineering Report Export */}
      <div className="mt-auto flex items-center gap-1.5 pt-1">
        <button
          type="button"
          onClick={handleCopyMarkdown}
          className="flex flex-1 items-center justify-center gap-1.5 rounded border border-[#2F3747] bg-[#1C212B] py-1.5 font-mono text-[10px] font-semibold text-[#CBD5E1] hover:border-[#00E5FF]/50 hover:text-[#00E5FF]"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-[#00E676]" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'COPIED MD REPORT' : 'COPY MD REPORT'}
        </button>
        <button
          type="button"
          onClick={handleDownloadJson}
          className="flex flex-1 items-center justify-center gap-1.5 rounded border border-[#00E5FF]/40 bg-[#00E5FF]/10 py-1.5 font-mono text-[10px] font-semibold text-[#00E5FF] hover:bg-[#00E5FF]/20"
        >
          <Download className="h-3.5 w-3.5" />
          EXPORT JSON
        </button>
      </div>
    </div>
  )
}
