import { useEffect, useState } from 'react'
import {
  Activity,
  Clock,
  Cpu,
  Eye,
  EyeOff,
  GitBranch,
  Play,
  Plus,
  RotateCcw,
  Square,
  Trash2,
  X,
} from 'lucide-react'
import { useFieldbusStore } from '../../engine/fieldbus/fieldbusStore'
import { PLC_PRESETS } from '../../engine/plc/presets'
import { usePlcStore } from '../../engine/plc/plcStore'
import {
  PLC_TAGS,
  WRITABLE_PLC_TAGS,
  type LadderRung,
  type PlcBrandStyle,
  type PlcCoilType,
  type PlcContactType,
  type PlcTagId,
  type PlcTimerId,
} from '../../engine/plc/types'
import { WorkcellViewport } from '../scene/WorkcellViewport'

type EditingTarget =
  | { kind: 'CONTACT'; rungId: string; condId: string }
  | { kind: 'BRANCH'; rungId: string }
  | { kind: 'TIMER'; rungId: string }
  | { kind: 'COIL'; rungId: string }
  | null

function formatTagAddress(tag: PlcTagId, brand: PlcBrandStyle): string {
  const meta = PLC_TAGS.find((t) => t.id === tag)
  if (!meta) return tag
  if (brand === 'SIEMENS') return meta.siemensAddr
  if (brand === 'AB') return meta.abAddr
  return tag
}

function getContactSymbol(type: PlcContactType, brand: PlcBrandStyle): string {
  if (brand === 'CODESYS') return type === 'XIC' ? '┤ ├' : '┤/├'
  return type === 'XIC' ? '─┤ ├─' : '─┤/├─'
}

function getCoilSymbol(type: PlcCoilType): string {
  if (type === 'OTE') return '─( )─'
  if (type === 'OTL') return '─(L)─'
  return '─(U)─'
}

function getShortTagLabel(tag: PlcTagId): string {
  const meta = PLC_TAGS.find((t) => t.id === tag)
  if (!meta) return tag
  return meta.label.replace(/^(DO\[\d+\]|DI\[\d+\]|PB\d|M\d|T\d)\s+/, '')
}

/**
 * Interactive Mobile & Desktop PLC Ladder Logic Studio wired live to the 3D Robot Cell
 * via the Shared Virtual Fieldbus (DI[1..16] / DO[1..16]).
 */
export function PlcLadderWorkspace() {
  const [showLive3D, setShowLive3D] = useState(true)
  const [editing, setEditing] = useState<EditingTarget>(null)

  const plcRunning = usePlcStore((s) => s.plcRunning)
  const plcBrand = usePlcStore((s) => s.plcBrand)
  const activePresetId = usePlcStore((s) => s.activePresetId)
  const rungs = usePlcStore((s) => s.rungs)
  const pushbuttons = usePlcStore((s) => s.pushbuttons)
  const memory = usePlcStore((s) => s.memory)
  const timers = usePlcStore((s) => s.timers)
  const rungStates = usePlcStore((s) => s.rungStates)
  const scanCount = usePlcStore((s) => s.scanCount)
  const lastScanUs = usePlcStore((s) => s.lastScanUs)

  const setPlcRunning = usePlcStore((s) => s.setPlcRunning)
  const setPlcBrand = usePlcStore((s) => s.setPlcBrand)
  const setPushbutton = usePlcStore((s) => s.setPushbutton)
  const loadPreset = usePlcStore((s) => s.loadPreset)
  const addRung = usePlcStore((s) => s.addRung)
  const deleteRung = usePlcStore((s) => s.deleteRung)
  const updateRung = usePlcStore((s) => s.updateRung)
  const addConditionToRung = usePlcStore((s) => s.addConditionToRung)
  const removeConditionFromRung = usePlcStore((s) => s.removeConditionFromRung)
  const toggleTimerOnRung = usePlcStore((s) => s.toggleTimerOnRung)
  const toggleParallelBranch = usePlcStore((s) => s.toggleParallelBranch)
  const stepPlcScan = usePlcStore((s) => s.stepPlcScan)

  const di = useFieldbusStore((s) => s.di)
  const doBank = useFieldbusStore((s) => s.do)

  // Fallback 50ms PLC scan timer when the live 3D Canvas is hidden
  useEffect(() => {
    if (!plcRunning || showLive3D) return
    const timer = window.setInterval(() => {
      stepPlcScan(0.05)
    }, 50)
    return () => window.clearInterval(timer)
  }, [plcRunning, showLive3D, stepPlcScan])

  const activeRungForEdit: LadderRung | undefined = editing
    ? rungs.find((r) => r.id === editing.rungId)
    : undefined

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#0D1016] lg:flex-row">
      {/* Live Split 3D Robot Cell Viewport (Top 32% on Mobile, Left 42% on Desktop when enabled) */}
      {showLive3D && (
        <section
          className="relative h-[32%] min-h-[175px] w-full shrink-0 border-b border-[#2A303C] lg:h-full lg:w-[42%] lg:border-b-0 lg:border-r"
          aria-label="Live 3D Robot Cell Driven by PLC"
        >
          <WorkcellViewport />
        </section>
      )}

      {/* Interactive PLC Ladder Logic IDE */}
      <section className="safe-bottom flex min-h-0 flex-1 flex-col overflow-hidden bg-[#14171E]">
        {/* Top PLC Toolbar: RUN/STOP + Brand Style + Preset + Live 3D Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#2A303C] bg-[#181C24] px-3 py-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPlcRunning(!plcRunning)}
              className={`flex min-h-[36px] items-center gap-1.5 rounded border px-3 font-mono text-[11px] font-bold transition-all ${
                plcRunning
                  ? 'border-[#00E676] bg-[#00E676]/20 text-[#00E676] shadow-[0_0_10px_rgba(0,230,118,0.25)]'
                  : 'border-[#FFB300]/55 bg-[#FFB300]/12 text-[#FFB300] hover:bg-[#FFB300]/22'
              }`}
            >
              {plcRunning ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {plcRunning ? 'PLC RUN' : 'START PLC'}
            </button>

            <div className="hidden items-center gap-1.5 rounded border border-[#262C38] bg-[#101318] px-2 py-1 font-mono text-[10px] text-[#94A3B8] tabular-nums sm:flex">
              <Activity className={`h-3 w-3 ${plcRunning ? 'text-[#00E676]' : 'text-[#64748B]'}`} />
              <span>SCAN #{scanCount}</span>
              <span className="text-[#475569]">·</span>
              <span>{lastScanUs}µs</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {/* PLC Vendor Style Selector */}
            <div className="flex items-center rounded border border-[#2A303C] bg-[#101318] p-0.5">
              {(
                [
                  ['SIEMENS', 'TIA'],
                  ['AB', 'AB5000'],
                  ['CODESYS', 'IEC'],
                ] as ReadonlyArray<[PlcBrandStyle, string]>
              ).map(([bKey, bLabel]) => (
                <button
                  key={bKey}
                  type="button"
                  onClick={() => setPlcBrand(bKey)}
                  className={`min-h-[28px] rounded px-2 font-mono text-[10px] font-bold ${
                    plcBrand === bKey
                      ? 'bg-[#252C3B] text-[#00E5FF]'
                      : 'text-[#64748B] hover:text-[#CBD5E1]'
                  }`}
                >
                  {bLabel}
                </button>
              ))}
            </div>

            {/* Preset Selector */}
            <select
              aria-label="PLC Ladder Preset"
              value={activePresetId}
              onChange={(e) => loadPreset(e.target.value)}
              className="min-h-[34px] max-w-[165px] truncate rounded border border-[#2A303C] bg-[#101318] px-2 font-mono text-[10.5px] font-semibold text-[#E6EDF3] outline-none focus:border-[#00E5FF]"
            >
              {PLC_PRESETS.map((p) => (
                <option key={p.id} value={p.id} className="bg-[#161920]">
                  {p.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setShowLive3D(!showLive3D)}
              className={`flex min-h-[34px] items-center gap-1 rounded border px-2.5 font-mono text-[10px] font-bold ${
                showLive3D
                  ? 'border-[#00E5FF]/50 bg-[#00E5FF]/12 text-[#00E5FF]'
                  : 'border-[#2A303C] bg-[#1C1F26] text-[#94A3B8]'
              }`}
            >
              {showLive3D ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              3D CELL
            </button>
          </div>
        </div>

        {/* Operator Console Pushbutton Strip + Live Memory Bits */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#252B36] bg-[#11141A] px-3 py-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onPointerDown={() => setPushbutton('PB_START', true)}
              onPointerUp={() => setPushbutton('PB_START', false)}
              onPointerLeave={() => setPushbutton('PB_START', false)}
              onPointerCancel={() => setPushbutton('PB_START', false)}
              onContextMenu={(e) => e.preventDefault()}
              className={`jog-touch-key flex min-h-[38px] items-center gap-1.5 rounded border px-3 font-mono text-[10.5px] font-bold transition-all ${
                pushbuttons.PB_START
                  ? 'border-[#00E676] bg-[#00E676] text-[#06120B]'
                  : 'border-[#00E676]/55 bg-[#00E676]/15 text-[#00E676]'
              }`}
            >
              <Play className="h-3.5 w-3.5" />
              PB1 START
            </button>
            <button
              type="button"
              onPointerDown={() => setPushbutton('PB_STOP', true)}
              onPointerUp={() => setPushbutton('PB_STOP', false)}
              onPointerLeave={() => setPushbutton('PB_STOP', false)}
              onPointerCancel={() => setPushbutton('PB_STOP', false)}
              onContextMenu={(e) => e.preventDefault()}
              className={`jog-touch-key flex min-h-[38px] items-center gap-1.5 rounded border px-3 font-mono text-[10.5px] font-bold transition-all ${
                pushbuttons.PB_STOP
                  ? 'border-[#FF1744] bg-[#FF1744] text-white'
                  : 'border-[#FF1744]/55 bg-[#FF1744]/15 text-[#FF6B81]'
              }`}
            >
              <Square className="h-3.5 w-3.5" />
              PB2 STOP
            </button>
            <button
              type="button"
              onPointerDown={() => setPushbutton('PB_RESET', true)}
              onPointerUp={() => setPushbutton('PB_RESET', false)}
              onPointerLeave={() => setPushbutton('PB_RESET', false)}
              onPointerCancel={() => setPushbutton('PB_RESET', false)}
              onContextMenu={(e) => e.preventDefault()}
              className={`jog-touch-key flex min-h-[38px] items-center gap-1.5 rounded border px-2.5 font-mono text-[10.5px] font-bold transition-all ${
                pushbuttons.PB_RESET
                  ? 'border-[#FFB300] bg-[#FFB300] text-[#141004]'
                  : 'border-[#FFB300]/55 bg-[#FFB300]/12 text-[#FFB300]'
              }`}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              PB3 RST
            </button>
          </div>

          {/* Live Memory Bit & Key Fieldbus Badges */}
          <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto font-mono text-[10px]">
            {(['M0', 'M1', 'M2', 'M3'] as const).map((m) => (
              <span
                key={m}
                className={`flex items-center gap-1 rounded border px-2 py-1 ${
                  memory[m]
                    ? 'border-[#00E676]/50 bg-[#00E676]/15 font-bold text-[#00E676]'
                    : 'border-[#252B36] bg-[#161A22] text-[#64748B]'
                }`}
              >
                <span className={`led-dot ${memory[m] ? 'led-green' : 'led-off'}`} />
                {m}
              </span>
            ))}
            <span
              className={`flex items-center gap-1 rounded border px-2 py-1 ${
                di[7]
                  ? 'border-[#00E5FF]/55 bg-[#00E5FF]/15 font-bold text-[#00E5FF]'
                  : 'border-[#252B36] bg-[#161A22] text-[#64748B]'
              }`}
            >
              DI[7]:{di[7] ? '1' : '0'}
            </span>
            <span
              className={`flex items-center gap-1 rounded border px-2 py-1 ${
                doBank[11]
                  ? 'border-[#FFB300]/55 bg-[#FFB300]/15 font-bold text-[#FFB300]'
                  : 'border-[#252B36] bg-[#161A22] text-[#64748B]'
              }`}
            >
              BUSY:{doBank[11] ? '1' : '0'}
            </span>
          </div>
        </div>

        {/* Visual Ladder Logic Canvas */}
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          {!plcRunning && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-[#FFB300]/40 bg-[#FFB300]/10 px-3 py-2 font-mono text-[10.5px] text-[#FDE68A]">
              <span>
                Tap <strong>START PLC</strong> then press <strong>PB1 START</strong> to execute your ladder rungs and drive the 3D robot cell live.
              </span>
              <Cpu className="h-4 w-4 shrink-0 text-[#FFB300]" />
            </div>
          )}

          {rungs.map((rung, rungIdx) => {
            const live = rungStates[rung.id]
            const energized = Boolean(plcRunning && live?.rungEnergized)
            const timerState = rung.timer ? timers[rung.timer.timerId] : null

            return (
              <div
                key={rung.id}
                className={`rounded-md border p-2.5 transition-colors ${
                  energized
                    ? 'border-[#00E676]/55 bg-[#0F1B16]'
                    : 'border-[#262C38] bg-[#11141B]'
                }`}
              >
                {/* Rung Header & Controls */}
                <div className="mb-2 flex flex-wrap items-center justify-between gap-1.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="rounded bg-[#1E2430] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#00E5FF]">
                      N{rungIdx}
                    </span>
                    <span className="truncate font-mono text-[10.5px] text-[#94A3B8]">
                      {rung.comment}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => addConditionToRung(rung.id)}
                      disabled={rung.conditions.length >= 4}
                      title="Add Series Contact"
                      className="min-h-[26px] rounded border border-[#2C3444] bg-[#181D27] px-2 font-mono text-[9.5px] font-semibold text-[#CBD5E1] hover:border-[#00E5FF]/50 disabled:opacity-35"
                    >
                      +Contact
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleParallelBranch(rung.id)}
                      title="Toggle OR Seal-In Parallel Branch"
                      className={`flex min-h-[26px] items-center gap-0.5 rounded border px-2 font-mono text-[9.5px] font-semibold ${
                        rung.parallelBranchTag
                          ? 'border-[#00E5FF]/55 bg-[#00E5FF]/12 text-[#00E5FF]'
                          : 'border-[#2C3444] bg-[#181D27] text-[#94A3B8]'
                      }`}
                    >
                      <GitBranch className="h-3 w-3" />
                      OR
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleTimerOnRung(rung.id)}
                      title="Toggle On-Delay Timer (TON)"
                      className={`flex min-h-[26px] items-center gap-0.5 rounded border px-2 font-mono text-[9.5px] font-semibold ${
                        rung.timer
                          ? 'border-[#FFB300]/55 bg-[#FFB300]/12 text-[#FFB300]'
                          : 'border-[#2C3444] bg-[#181D27] text-[#94A3B8]'
                      }`}
                    >
                      <Clock className="h-3 w-3" />
                      TON
                    </button>
                    {rungs.length > 1 && (
                      <button
                        type="button"
                        onClick={() => deleteRung(rung.id)}
                        title="Delete Rung"
                        className="flex min-h-[26px] w-7 items-center justify-center rounded border border-[#FF1744]/35 bg-[#231217] text-[#FF6B81]"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Ladder Power Rails + Interactive Contacts / Branch / Timer / Coil */}
                <div className="no-scrollbar overflow-x-auto pb-1">
                  <div className="flex min-w-[340px] items-center">
                    {/* Left Hot Power Rail */}
                    <div
                      className={`h-14 w-1.5 shrink-0 rounded-full ${
                        plcRunning ? 'bg-[#00E676] shadow-[0_0_8px_rgba(0,230,118,0.6)]' : 'bg-[#394150]'
                      }`}
                    />

                    {/* Series Contacts (+ Optional Parallel Seal-In Branch on Contact 0) */}
                    <div className="flex flex-1 items-center">
                      {rung.conditions.map((cond, cIdx) => {
                        const cActive = Boolean(plcRunning && live?.conditionPass[cIdx])
                        const branchActive = Boolean(plcRunning && live?.branchPass)
                        const hasBranch = cIdx === 0 && Boolean(rung.parallelBranchTag)

                        return (
                          <div key={cond.id} className="flex items-center">
                            <div
                              className={`h-0.5 w-3 shrink-0 ${
                                plcRunning && (cIdx === 0 || live?.conditionPass[cIdx - 1])
                                  ? 'bg-[#00E676]'
                                  : 'bg-[#394150]'
                              }`}
                            />
                            <div className="flex flex-col items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  setEditing({ kind: 'CONTACT', rungId: rung.id, condId: cond.id })
                                }
                                className={`flex min-w-[78px] flex-col items-center rounded border px-2 py-1 font-mono transition-colors ${
                                  cActive
                                    ? 'border-[#00E676] bg-[#00E676]/15 text-[#00E676]'
                                    : 'border-[#313949] bg-[#171C26] text-[#E6EDF3] hover:border-[#00E5FF]'
                                }`}
                              >
                                <span className="text-[9px] text-[#8B949E]">
                                  {formatTagAddress(cond.tag, plcBrand)}
                                </span>
                                <span className="text-xs font-bold leading-tight">
                                  {getContactSymbol(cond.type, plcBrand)}
                                </span>
                                <span className="max-w-[76px] truncate text-[9px] font-semibold">
                                  {getShortTagLabel(cond.tag)}
                                </span>
                              </button>

                              {/* Parallel OR Seal-In Contact */}
                              {hasBranch && rung.parallelBranchTag && (
                                <button
                                  type="button"
                                  onClick={() => setEditing({ kind: 'BRANCH', rungId: rung.id })}
                                  className={`flex min-w-[78px] flex-col items-center rounded border border-dashed px-2 py-0.5 font-mono transition-colors ${
                                    branchActive
                                      ? 'border-[#00E676] bg-[#00E676]/15 text-[#00E676]'
                                      : 'border-[#00E5FF]/50 bg-[#121923] text-[#00E5FF]'
                                  }`}
                                >
                                  <span className="text-[8.5px] font-bold">
                                    OR ─┤ {rung.parallelBranchTag} ├─
                                  </span>
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}

                      {/* Optional TON On-Delay Timer Block */}
                      {rung.timer && (
                        <div className="flex items-center">
                          <div
                            className={`h-0.5 w-3 shrink-0 ${
                              plcRunning && live?.preTimerPower ? 'bg-[#00E676]' : 'bg-[#394150]'
                            }`}
                          />
                          <button
                            type="button"
                            onClick={() => setEditing({ kind: 'TIMER', rungId: rung.id })}
                            className={`flex min-w-[88px] flex-col rounded border px-2 py-1 font-mono text-left ${
                              timerState?.dn
                                ? 'border-[#00E676] bg-[#00E676]/15 text-[#00E676]'
                                : timerState?.tt
                                  ? 'border-[#FFB300] bg-[#FFB300]/15 text-[#FFB300]'
                                  : 'border-[#384152] bg-[#181E29] text-[#E6EDF3]'
                            }`}
                          >
                            <div className="flex items-center justify-between text-[9px] font-bold">
                              <span>TON {rung.timer.timerId}</span>
                              <span>{timerState?.dn ? 'DN' : timerState?.tt ? 'TT' : 'IDLE'}</span>
                            </div>
                            <div className="mt-0.5 text-[9.5px] tabular-nums">
                              {(timerState?.accSec ?? 0).toFixed(2)}s / {rung.timer.presetSec.toFixed(1)}s
                            </div>
                            <div className="mt-1 h-1 w-full overflow-hidden rounded bg-[#0E1117]">
                              <div
                                className={`h-full ${timerState?.dn ? 'bg-[#00E676]' : 'bg-[#FFB300]'}`}
                                style={{
                                  width: `${Math.min(
                                    100,
                                    ((timerState?.accSec ?? 0) / Math.max(0.1, rung.timer.presetSec)) * 100,
                                  )}%`,
                                }}
                              />
                            </div>
                          </button>
                        </div>
                      )}

                      {/* Connecting Wire to Right Output Coil */}
                      <div
                        className={`h-0.5 min-w-[16px] flex-1 ${
                          energized ? 'bg-[#00E676]' : 'bg-[#394150]'
                        }`}
                      />

                      {/* Output Coil (OTE / OTL / OTU) */}
                      <button
                        type="button"
                        onClick={() => setEditing({ kind: 'COIL', rungId: rung.id })}
                        className={`flex min-w-[84px] flex-col items-center rounded border px-2 py-1 font-mono transition-colors ${
                          energized
                            ? 'border-[#00E676] bg-[#00E676]/20 text-[#00E676]'
                            : 'border-[#3A4355] bg-[#191F2B] text-[#E6EDF3] hover:border-[#00E5FF]'
                        }`}
                      >
                        <span className="text-[9px] text-[#8B949E]">
                          {formatTagAddress(rung.coil.tag, plcBrand)}
                        </span>
                        <span className="text-xs font-bold leading-tight">
                          {getCoilSymbol(rung.coil.type)}
                        </span>
                        <span className="max-w-[82px] truncate text-[9px] font-semibold">
                          {getShortTagLabel(rung.coil.tag)}
                        </span>
                      </button>

                      <div
                        className={`h-0.5 w-3 shrink-0 ${
                          energized ? 'bg-[#00E676]' : 'bg-[#394150]'
                        }`}
                      />
                    </div>

                    {/* Right Neutral Rail */}
                    <div className="h-14 w-1.5 shrink-0 rounded-full bg-[#394150]" />
                  </div>
                </div>
              </div>
            )
          })}

          {/* Add New Rung Button */}
          <button
            type="button"
            onClick={addRung}
            className="flex min-h-[42px] w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-[#343E50] bg-[#131720] font-mono text-xs font-bold text-[#00E5FF] hover:border-[#00E5FF]"
          >
            <Plus className="h-4 w-4" />
            ADD LADDER RUNG
          </button>
        </div>

        {/* Touch-Friendly Inline Element Editor Sheet (Appears when tapping any Contact, Branch, Timer, or Coil) */}
        {editing && activeRungForEdit && (
          <div className="border-t-2 border-[#00E5FF] bg-[#191E28] p-3 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-[#00E5FF]">
                EDIT {editing.kind}
              </span>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="flex h-7 w-7 items-center justify-center rounded border border-[#2E3646] bg-[#12161E] text-[#CBD5E1]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {editing.kind === 'CONTACT' && (() => {
              const cond = activeRungForEdit.conditions.find((c) => c.id === editing.condId)
              if (!cond) return null
              return (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex rounded border border-[#2A303C] bg-[#101318] p-0.5">
                    {(['XIC', 'XIO'] as PlcContactType[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() =>
                          updateRung(activeRungForEdit.id, (r) => ({
                            ...r,
                            conditions: r.conditions.map((c) =>
                              c.id === cond.id ? { ...c, type: t } : c,
                            ),
                          }))
                        }
                        className={`min-h-[34px] rounded px-3 font-mono text-[11px] font-bold ${
                          cond.type === t
                            ? 'bg-[#00E5FF]/20 text-[#00E5FF]'
                            : 'text-[#8B949E]'
                        }`}
                      >
                        {t === 'XIC' ? '─┤ ├─ NO (XIC)' : '─┤/├─ NC (XIO)'}
                      </button>
                    ))}
                  </div>

                  <select
                    value={cond.tag}
                    onChange={(e) =>
                      updateRung(activeRungForEdit.id, (r) => ({
                        ...r,
                        conditions: r.conditions.map((c) =>
                          c.id === cond.id ? { ...c, tag: e.target.value as PlcTagId } : c,
                        ),
                      }))
                    }
                    className="min-h-[36px] flex-1 rounded border border-[#323B4B] bg-[#101318] px-2 font-mono text-xs text-[#E6EDF3]"
                  >
                    {PLC_TAGS.map((tag) => (
                      <option key={tag.id} value={tag.id} className="bg-[#161920]">
                        {tag.label} ({formatTagAddress(tag.id, plcBrand)})
                      </option>
                    ))}
                  </select>

                  {activeRungForEdit.conditions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        removeConditionFromRung(activeRungForEdit.id, cond.id)
                        setEditing(null)
                      }}
                      className="min-h-[36px] rounded border border-[#FF1744]/50 bg-[#FF1744]/15 px-3 font-mono text-[10.5px] font-bold text-[#FF6B81]"
                    >
                      REMOVE
                    </button>
                  )}
                </div>
              )
            })()}

            {editing.kind === 'BRANCH' && (
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-[#94A3B8]">OR Branch Tag:</span>
                <select
                  value={activeRungForEdit.parallelBranchTag ?? 'M0'}
                  onChange={(e) =>
                    updateRung(activeRungForEdit.id, (r) => ({
                      ...r,
                      parallelBranchTag: e.target.value as PlcTagId,
                    }))
                  }
                  className="min-h-[36px] flex-1 rounded border border-[#323B4B] bg-[#101318] px-2 font-mono text-xs text-[#E6EDF3]"
                >
                  {PLC_TAGS.map((tag) => (
                    <option key={tag.id} value={tag.id} className="bg-[#161920]">
                      {tag.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {editing.kind === 'TIMER' && activeRungForEdit.timer && (
              <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                <select
                  value={activeRungForEdit.timer.timerId}
                  onChange={(e) =>
                    updateRung(activeRungForEdit.id, (r) =>
                      r.timer ? { ...r, timer: { ...r.timer, timerId: e.target.value as PlcTimerId } } : r,
                    )
                  }
                  className="min-h-[36px] rounded border border-[#323B4B] bg-[#101318] px-2 text-[#E6EDF3]"
                >
                  {(['T0', 'T1', 'T2', 'T3'] as PlcTimerId[]).map((tid) => (
                    <option key={tid} value={tid} className="bg-[#161920]">
                      Timer {tid}
                    </option>
                  ))}
                </select>
                <span className="text-[#94A3B8]">Preset:</span>
                <input
                  type="range"
                  min={0.2}
                  max={5.0}
                  step={0.2}
                  value={activeRungForEdit.timer.presetSec}
                  onChange={(e) =>
                    updateRung(activeRungForEdit.id, (r) =>
                      r.timer ? { ...r, timer: { ...r.timer, presetSec: Number(e.target.value) } } : r,
                    )
                  }
                  className="h-2 flex-1 cursor-pointer accent-[#FFB300]"
                />
                <span className="w-12 text-right font-bold text-[#FFB300] tabular-nums">
                  {activeRungForEdit.timer.presetSec.toFixed(1)}s
                </span>
              </div>
            )}

            {editing.kind === 'COIL' && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded border border-[#2A303C] bg-[#101318] p-0.5">
                  {(['OTE', 'OTL', 'OTU'] as PlcCoilType[]).map((ct) => (
                    <button
                      key={ct}
                      type="button"
                      onClick={() =>
                        updateRung(activeRungForEdit.id, (r) => ({
                          ...r,
                          coil: { ...r.coil, type: ct },
                        }))
                      }
                      className={`min-h-[34px] rounded px-2.5 font-mono text-[11px] font-bold ${
                        activeRungForEdit.coil.type === ct
                          ? 'bg-[#00E676]/20 text-[#00E676]'
                          : 'text-[#8B949E]'
                      }`}
                    >
                      {ct}
                    </button>
                  ))}
                </div>

                <select
                  value={activeRungForEdit.coil.tag}
                  onChange={(e) =>
                    updateRung(activeRungForEdit.id, (r) => ({
                      ...r,
                      coil: { ...r.coil, tag: e.target.value as PlcTagId },
                    }))
                  }
                  className="min-h-[36px] flex-1 rounded border border-[#323B4B] bg-[#101318] px-2 font-mono text-xs text-[#E6EDF3]"
                >
                  {WRITABLE_PLC_TAGS.map((tag) => (
                    <option key={tag.id} value={tag.id} className="bg-[#161920]">
                      {tag.label} ({formatTagAddress(tag.id, plcBrand)})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
