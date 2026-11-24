import { useMemo, useState } from 'react'
import {
  AlertCircle,
  Check,
  Code2,
  Edit3,
  Play,
  RotateCcw,
  SkipForward,
  Sliders,
  Sparkles,
} from 'lucide-react'
import { parseProgramText } from '../../engine/dialects/parser'
import {
  formatInstruction,
  formatProgram,
  getDialectHeaderFooter,
} from '../../engine/dialects/transpiler'
import { OEM_DIALECTS, type ProgramInstruction } from '../../engine/dialects/types'
import { useRobotStore } from '../../engine/store/robotStore'

export function MultiOemCodePanel() {
  const [rawEditMode, setRawEditMode] = useState(false)
  const [draftText, setDraftText] = useState('')
  const [parseErrors, setParseErrors] = useState<Array<{ line: number; message: string }>>([])
  const [selectedLineIdx, setSelectedLineIdx] = useState<number>(3)

  const dialect = useRobotStore((s) => s.dialect)
  const setDialect = useRobotStore((s) => s.setDialect)
  const programName = useRobotStore((s) => s.programName)
  const instructions = useRobotStore((s) => s.instructions)
  const positions = useRobotStore((s) => s.positions)
  const activeLineIndex = useRobotStore((s) => s.activeLineIndex)
  const isRunning = useRobotStore((s) => s.isRunning)
  const pathPreview = useRobotStore((s) => s.pathPreview)
  const scenarioId = useRobotStore((s) => s.scenarioId)

  const updateInstructions = useRobotStore((s) => s.updateInstructions)
  const resetScenarioProgram = useRobotStore((s) => s.resetScenarioProgram)
  const startProgram = useRobotStore((s) => s.startProgram)
  const stepProgram = useRobotStore((s) => s.stepProgram)

  const activeMeta = OEM_DIALECTS.find((d) => d.id === dialect) ?? OEM_DIALECTS[0]
  const formattedLines = useMemo(
    () => formatProgram(instructions, dialect, positions),
    [instructions, dialect, positions],
  )
  const { header, footer } = useMemo(
    () => getDialectHeaderFooter(programName, dialect),
    [programName, dialect],
  )

  const openRawEditor = () => {
    setDraftText(formattedLines.join('\n'))
    setParseErrors([])
    setRawEditMode(true)
  }

  const applyRawEdits = () => {
    const parsed = parseProgramText(draftText)
    if (!parsed.success) {
      setParseErrors(parsed.errors)
      return
    }
    setParseErrors([])
    updateInstructions(parsed.instructions)
    setRawEditMode(false)
  }

  // Inline quick-mutator for motion instructions (toggle J/L or adjust FINE/CNT or speed)
  const mutateInstruction = (index: number, updater: (inst: ProgramInstruction) => ProgramInstruction) => {
    const next = instructions.map((inst, idx) => (idx === index ? updater(inst) : inst))
    updateInstructions(next)
  }

  // Quick helper for Scenario 2: tune air moves to CNT65 to compare
  const applyRecommendedCntPreset = () => {
    const next = instructions.map((inst) => {
      if ((inst.type === 'MOVE_J' || inst.type === 'MOVE_L') && ![3, 7, 1].includes(inst.targetId)) {
        return { ...inst, termination: { kind: 'CNT' as const, value: 65 } }
      }
      return inst
    })
    updateInstructions(next)
  }

  const clampedSelIdx = Math.min(selectedLineIdx, Math.max(0, instructions.length - 1))
  const selectedInst = instructions[clampedSelIdx]

  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden p-3">
      {/* Multi-OEM Dialect Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex flex-wrap items-center gap-1">
          {OEM_DIALECTS.map((oem) => {
            const active = oem.id === dialect
            return (
              <button
                key={oem.id}
                type="button"
                onClick={() => {
                  setDialect(oem.id)
                  setRawEditMode(false)
                }}
                className={`flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-[10px] font-bold transition-colors ${
                  active
                    ? 'border-[#3F4A5E] bg-[#242B38] text-[#F1F5F9]'
                    : 'border-[#252B36] bg-[#151820] text-[#7D8797] hover:border-[#343C4C] hover:text-[#CBD5E1]'
                }`}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: oem.accentColor }}
                />
                {oem.name}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-1">
          {!rawEditMode ? (
            <button
              type="button"
              onClick={openRawEditor}
              className="flex items-center gap-1 rounded border border-[#00E5FF]/40 bg-[#00E5FF]/10 px-2 py-1 font-mono text-[10px] font-semibold text-[#00E5FF] hover:bg-[#00E5FF]/20"
            >
              <Edit3 className="h-3 w-3" />
              EDIT CODE
            </button>
          ) : (
            <button
              type="button"
              onClick={applyRawEdits}
              className="flex items-center gap-1 rounded border border-[#00E676]/60 bg-[#00E676]/15 px-2 py-1 font-mono text-[10px] font-bold text-[#00E676] hover:bg-[#00E676]/25"
            >
              <Check className="h-3 w-3" />
              APPLY
            </button>
          )}
          <button
            type="button"
            onClick={resetScenarioProgram}
            title="Reset Program to Scenario Default"
            className="rounded border border-[#2A303C] bg-[#1C1F26] p-1 text-[#94A3B8] hover:text-[#E6EDF3]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Program Header & Cycle Summary */}
      <div className="flex items-center justify-between rounded border border-[#252B36] bg-[#14171D] px-2.5 py-1.5 font-mono text-[10px]">
        <div className="flex items-center gap-2">
          <Code2 className="h-3.5 w-3.5" style={{ color: activeMeta.accentColor }} />
          <span className="font-bold text-[#E6EDF3]">
            {programName}
            {activeMeta.fileExtension}
          </span>
          <span className="text-[#64748B]">({activeMeta.controllerFamily})</span>
        </div>
        <div className="flex items-center gap-2 tabular-nums">
          <span className="text-[#94A3B8]">
            EST: <strong className="text-[#00E5FF]">{pathPreview.estimatedCycleTimeSec.toFixed(2)}s</strong>
          </span>
          <button
            type="button"
            onClick={startProgram}
            className="flex items-center gap-1 rounded bg-[#00E676]/15 px-2 py-0.5 font-bold text-[#00E676] hover:bg-[#00E676]/25"
          >
            <Play className="h-2.5 w-2.5" />
            RUN
          </button>
          <button
            type="button"
            onClick={stepProgram}
            className="flex items-center gap-1 rounded bg-[#00E5FF]/15 px-2 py-0.5 font-bold text-[#00E5FF] hover:bg-[#00E5FF]/25"
          >
            <SkipForward className="h-2.5 w-2.5" />
            STEP
          </button>
        </div>
      </div>

      {/* Scenario 2 Quick CNT Optimization Hint Bar */}
      {scenarioId === 'scenario2' && !rawEditMode && (
        <div className="flex items-center justify-between gap-2 rounded border border-[#FFB300]/35 bg-[#FFB300]/10 px-2.5 py-1.5 text-[11px]">
          <span className="text-[#FDE68A]">
            Click any air-move line below to switch <code className="font-mono font-bold">FINE → CNT65</code> &amp; beat 6.5s takt.
          </span>
          <button
            type="button"
            onClick={applyRecommendedCntPreset}
            className="flex shrink-0 items-center gap-1 rounded border border-[#FFB300]/50 bg-[#FFB300]/20 px-2 py-0.5 font-mono text-[10px] font-bold text-[#FFB300] hover:bg-[#FFB300]/30"
          >
            <Sparkles className="h-3 w-3" />
            AUTO-TUNE CNT65
          </button>
        </div>
      )}

      {/* Main Code Pane: Either Raw Editor or Interactive Line-by-Line Monitor */}
      {rawEditMode ? (
        <div className="flex min-h-0 flex-1 flex-col gap-1.5">
          <textarea
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            spellCheck={false}
            className="hmi-recessed min-h-0 flex-1 resize-none rounded-md p-2.5 font-mono text-[11px] leading-relaxed text-[#E6EDF3] outline-none focus:border-[#00E5FF]"
          />
          {parseErrors.length > 0 && (
            <div className="rounded border border-[#FF1744]/50 bg-[#2A0E15] p-2 font-mono text-[10px] text-[#FCA5A5]">
              {parseErrors.map((err) => (
                <div key={err.line} className="flex items-center gap-1.5">
                  <AlertCircle className="h-3 w-3 shrink-0 text-[#FF1744]" />
                  <span>
                    Line {err.line}: {err.message}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between text-[10px] text-[#8B949E]">
            <span>Supports FANUC TP, ABB RAPID, &amp; KUKA KRL syntax.</span>
            <button
              type="button"
              onClick={() => setRawEditMode(false)}
              className="font-mono text-[#94A3B8] hover:text-[#E6EDF3]"
            >
              CANCEL
            </button>
          </div>
        </div>
      ) : (
        <div className="hmi-recessed min-h-0 flex-1 overflow-y-auto rounded-md p-2 font-mono text-[11px]">
          {header.map((h, i) => (
            <div key={`h_${i}`} className="px-2 py-0.5 text-[#586377]">
              {h}
            </div>
          ))}

          {instructions.map((inst, idx) => {
            const isExecLine = isRunning && activeLineIndex === idx
            const isSelected = clampedSelIdx === idx
            const lineText = formattedLines[idx]
            const isMove = inst.type === 'MOVE_J' || inst.type === 'MOVE_L'
            const isPredictedSing = pathPreview.predictedSingularity?.instructionIndex === idx

            return (
              <div
                key={inst.id}
                onClick={() => setSelectedLineIdx(idx)}
                className={`group flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1 transition-colors ${
                  isExecLine
                    ? 'border-l-2 border-[#00E5FF] bg-[#00E5FF]/15 text-[#00E5FF]'
                    : isSelected
                      ? 'bg-[#202633] text-[#F1F5F9]'
                      : 'text-[#CBD5E1] hover:bg-[#181C24]'
                }`}
              >
                <span className="truncate whitespace-pre">
                  {lineText}
                </span>
                {isPredictedSing && (
                  <span className="shrink-0 rounded bg-[#FFB300]/20 px-1.5 py-0.5 text-[9px] font-bold text-[#FFB300]">
                    SINGULAR
                  </span>
                )}
                {isMove && !isPredictedSing && (
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold ${
                      inst.termination.kind === 'CNT'
                        ? 'bg-[#FFB300]/15 text-[#FFB300]'
                        : 'bg-[#252B36] text-[#8B949E]'
                    }`}
                  >
                    {inst.termination.kind === 'FINE' ? 'FINE' : `CNT${inst.termination.value}`}
                  </span>
                )}
              </div>
            )
          })}

          {footer.map((f, i) => (
            <div key={`f_${i}`} className="px-2 py-0.5 text-[#586377]">
              {f}
            </div>
          ))}
        </div>
      )}

      {/* Selected Line Inline Parameter Tuner + 5-OEM Syntax Equivalence Inspector */}
      {!rawEditMode && selectedInst && (
        <div className="hmi-recessed shrink-0 rounded-md p-2.5">
          {(selectedInst.type === 'MOVE_J' || selectedInst.type === 'MOVE_L') && (
            <div className="mb-2 border-b border-[#232833] pb-2">
              <div className="mb-1.5 flex items-center justify-between font-mono text-[10px]">
                <span className="flex items-center gap-1 font-bold text-[#00E5FF]">
                  <Sliders className="h-3 w-3" />
                  LINE {clampedSelIdx + 1} QUICK TUNE
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      mutateInstruction(clampedSelIdx, (old) =>
                        old.type === 'MOVE_L'
                          ? {
                              id: old.id,
                              type: 'MOVE_J',
                              targetId: old.targetId,
                              isPR: old.isPR,
                              speedPercent: 80,
                              termination: old.termination,
                              vOffsetReg: old.vOffsetReg,
                            }
                          : old,
                      )
                    }
                    className={`rounded border px-2 py-0.5 font-bold ${
                      selectedInst.type === 'MOVE_J'
                        ? 'border-[#00E676] bg-[#00E676]/20 text-[#00E676]'
                        : 'border-[#2A303C] bg-[#181C24] text-[#8B949E]'
                    }`}
                  >
                    J (Joint)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      mutateInstruction(clampedSelIdx, (old) =>
                        old.type === 'MOVE_J'
                          ? {
                              id: old.id,
                              type: 'MOVE_L',
                              targetId: old.targetId,
                              isPR: old.isPR,
                              speedMmPerSec: 800,
                              termination: old.termination,
                              vOffsetReg: old.vOffsetReg,
                            }
                          : old,
                      )
                    }
                    className={`rounded border px-2 py-0.5 font-bold ${
                      selectedInst.type === 'MOVE_L'
                        ? 'border-[#00E5FF] bg-[#00E5FF]/20 text-[#00E5FF]'
                        : 'border-[#2A303C] bg-[#181C24] text-[#8B949E]'
                    }`}
                  >
                    L (Linear)
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 font-mono text-[10px]">
                <button
                  type="button"
                  onClick={() =>
                    mutateInstruction(clampedSelIdx, (old) =>
                      old.type === 'MOVE_J' || old.type === 'MOVE_L'
                        ? { ...old, termination: { kind: 'FINE' } }
                        : old,
                    )
                  }
                  className={`rounded border px-2 py-0.5 font-bold ${
                    selectedInst.termination.kind === 'FINE'
                      ? 'border-[#00E5FF] bg-[#00E5FF]/15 text-[#00E5FF]'
                      : 'border-[#2A303C] bg-[#181C24] text-[#8B949E]'
                  }`}
                >
                  FINE
                </button>
                <span className="text-[#8B949E]">CNT</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={selectedInst.termination.kind === 'CNT' ? selectedInst.termination.value : 0}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    mutateInstruction(clampedSelIdx, (old) =>
                      old.type === 'MOVE_J' || old.type === 'MOVE_L'
                        ? { ...old, termination: v === 0 ? { kind: 'FINE' } : { kind: 'CNT', value: v } }
                        : old,
                    )
                  }}
                  className="h-1.5 flex-1 cursor-pointer accent-[#FFB300]"
                  aria-label="CNT Corner Blend Value"
                />
                <span className="w-12 text-right font-bold text-[#FFB300] tabular-nums">
                  {selectedInst.termination.kind === 'CNT'
                    ? `CNT${selectedInst.termination.value}`
                    : 'FINE'}
                </span>
              </div>
            </div>
          )}

          {/* Cross-OEM Live Equivalence Peek */}
          <div className="space-y-1 font-mono text-[9.5px]">
            <div className="font-bold tracking-wider text-[#64748B]">
              MULTI-OEM SYNTAX EQUIVALENCE (LINE {clampedSelIdx + 1})
            </div>
            {OEM_DIALECTS.filter((o) => o.id !== dialect)
              .slice(0, 3)
              .map((oem) => (
                <div key={oem.id} className="flex items-center gap-2 truncate">
                  <span
                    className="w-14 shrink-0 font-bold"
                    style={{ color: oem.accentColor }}
                  >
                    {oem.name}
                  </span>
                  <span className="truncate text-[#94A3B8]">
                    {formatInstruction(selectedInst, oem.id, positions, clampedSelIdx + 1).trim()}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
