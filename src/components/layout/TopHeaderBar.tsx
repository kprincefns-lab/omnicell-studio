import { Cpu, Layers, OctagonAlert, RotateCcw, ShieldCheck } from 'lucide-react'
import { SCENARIO_LIST } from '../../engine/scenarios/definitions'
import type { ScenarioId } from '../../engine/scenarios/types'
import { useRobotStore } from '../../engine/store/robotStore'

export function TopHeaderBar() {
  const activeWorkspace = useRobotStore((s) => s.activeWorkspace)
  const setWorkspace = useRobotStore((s) => s.setWorkspace)
  const scenarioId = useRobotStore((s) => s.scenarioId)
  const loadScenario = useRobotStore((s) => s.loadScenario)
  const estopActive = useRobotStore((s) => s.estopActive)
  const toggleEstop = useRobotStore((s) => s.toggleEstop)
  const activeFault = useRobotStore((s) => s.activeFault)
  const resetFault = useRobotStore((s) => s.resetFault)
  const isRunning = useRobotStore((s) => s.isRunning)

  return (
    <header className="safe-top shrink-0 border-b border-[#2A303C] bg-[#161920]">
      <div className="flex h-11 items-center justify-between gap-2 px-2.5 lg:h-12 lg:px-3">
        {/* Left: Brand + Workspace Switcher */}
        <div className="flex min-w-0 items-center gap-2 lg:gap-3">
          <div className="flex shrink-0 items-center gap-1.5">
            <div className="flex h-7 w-7 items-center justify-center rounded border border-[#00E5FF]/40 bg-[#00E5FF]/10">
              <Cpu className="h-4 w-4 text-[#00E5FF]" />
            </div>
            <div className="hidden leading-tight sm:block">
              <h1 className="font-mono text-xs font-bold tracking-wider text-[#F1F5F9]">
                OMNICELL <span className="text-[#00E5FF]">STUDIO</span>
              </h1>
              <p className="hidden font-mono text-[9px] tracking-widest text-[#64748B] lg:block">
                OMNI-R20iD/25 · DUAL-TRACK HMI
              </p>
            </div>
          </div>

          <div className="hidden h-6 w-px bg-[#2A303C] sm:block" />

          {/* Dual-Workspace Switcher (Compact on mobile, Full on desktop) */}
          <nav
            className="flex shrink-0 items-center rounded-md border border-[#2A303C] bg-[#0F1217] p-0.5"
            aria-label="Workspace Switcher"
          >
            <button
              type="button"
              onClick={() => setWorkspace('ROBOTICS')}
              className={`flex items-center gap-1 rounded px-2 py-1 font-mono text-[10px] font-semibold transition-colors lg:gap-1.5 lg:px-2.5 lg:text-[11px] ${
                activeWorkspace === 'ROBOTICS'
                  ? 'bg-[#232936] text-[#00E5FF] shadow-sm'
                  : 'text-[#8B949E] hover:text-[#E6EDF3]'
              }`}
            >
              <Layers className="h-3 w-3 lg:h-3.5 lg:w-3.5" />
              <span className="lg:hidden">ROBOT</span>
              <span className="hidden lg:inline">Robotics Workcell Lab</span>
            </button>
            <button
              type="button"
              onClick={() => setWorkspace('PLC')}
              className={`flex items-center gap-1 rounded px-2 py-1 font-mono text-[10px] font-semibold transition-colors lg:gap-1.5 lg:px-2.5 lg:text-[11px] ${
                activeWorkspace === 'PLC'
                  ? 'bg-[#232936] text-[#FFB300] shadow-sm'
                  : 'text-[#8B949E] hover:text-[#E6EDF3]'
              }`}
            >
              <Cpu className="h-3 w-3 lg:h-3.5 lg:w-3.5" />
              <span className="lg:hidden">PLC</span>
              <span className="hidden lg:inline">PLC &amp; Ladder Lab</span>
              <span className="hidden rounded bg-[#00E676]/15 px-1 font-mono text-[9px] text-[#00E676] xl:inline">
                LADDER
              </span>
            </button>
          </nav>

          {/* Mobile Compact Scenario Dropdown (right inside header — saves a full vertical row!) */}
          {activeWorkspace === 'ROBOTICS' && (
            <select
              aria-label="Select Training Scenario"
              value={scenarioId}
              onChange={(e) => loadScenario(e.target.value as ScenarioId)}
              className="min-w-0 max-w-[140px] flex-1 truncate rounded border border-[#2A303C] bg-[#101318] px-2 py-1 font-mono text-[11px] font-semibold text-[#E6EDF3] outline-none focus:border-[#00E5FF] sm:max-w-[190px] lg:hidden"
            >
              {SCENARIO_LIST.map((sc) => (
                <option key={sc.id} value={sc.id} className="bg-[#161920] text-[#E6EDF3]">
                  0{sc.number}: {sc.shortTitle}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Center: Desktop Scenario Pills */}
        {activeWorkspace === 'ROBOTICS' && (
          <div className="hidden items-center gap-1 lg:flex">
            {SCENARIO_LIST.map((sc) => {
              const active = sc.id === scenarioId
              return (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => loadScenario(sc.id)}
                  title={sc.title}
                  className={`rounded border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                    active
                      ? 'border-[#00E5FF]/60 bg-[#00E5FF]/12 font-semibold text-[#00E5FF]'
                      : 'border-[#2A303C] bg-[#1C1F26] text-[#94A3B8] hover:border-[#3D4657] hover:text-[#E6EDF3]'
                  }`}
                >
                  <span className="mr-1 opacity-60">0{sc.number}</span>
                  {sc.shortTitle}
                </button>
              )
            })}
          </div>
        )}

        {/* Right: Servo Status + Reset + E-Stop */}
        <div className="flex shrink-0 items-center gap-1.5 lg:gap-2">
          <div className="hidden items-center gap-1.5 rounded border border-[#2A303C] bg-[#101318] px-2.5 py-1 font-mono text-[10px] xl:flex">
            <span
              className={`led-dot ${
                estopActive || activeFault
                  ? 'led-red'
                  : isRunning
                    ? 'led-cyan'
                    : 'led-green'
              }`}
            />
            <span
              className={
                estopActive || activeFault
                  ? 'font-bold text-[#FF1744]'
                  : isRunning
                    ? 'font-semibold text-[#00E5FF]'
                    : 'font-semibold text-[#00E676]'
              }
            >
              {estopActive
                ? 'E-STOP'
                : activeFault
                  ? activeFault.code
                  : isRunning
                    ? 'IN MOTION'
                    : 'SERVO READY'}
            </span>
          </div>

          {activeFault && !estopActive && (
            <button
              type="button"
              onClick={resetFault}
              className="flex h-8 items-center gap-1 rounded border border-[#FFB300]/60 bg-[#FFB300]/15 px-2 font-mono text-[10px] font-bold text-[#FFB300] hover:bg-[#FFB300]/25 lg:h-auto lg:px-2.5 lg:py-1 lg:text-[11px]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">RESET</span>
            </button>
          )}

          <button
            type="button"
            onClick={toggleEstop}
            className={`flex h-8 items-center gap-1 rounded border px-2 font-mono text-[10px] font-bold tracking-wider transition-all lg:h-auto lg:gap-1.5 lg:px-2.5 lg:py-1 lg:text-[11px] ${
              estopActive
                ? 'border-[#FF1744] bg-[#FF1744] text-white shadow-[0_0_12px_rgba(255,23,68,0.6)]'
                : 'border-[#FF1744]/50 bg-[#2A1117] text-[#FF526B] hover:border-[#FF1744] hover:bg-[#3A141D]'
            }`}
          >
            {estopActive ? <ShieldCheck className="h-3.5 w-3.5" /> : <OctagonAlert className="h-3.5 w-3.5" />}
            <span>{estopActive ? 'RELEASE' : 'E-STOP'}</span>
          </button>
        </div>
      </div>
    </header>
  )
}
