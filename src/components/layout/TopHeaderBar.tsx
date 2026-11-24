import { Cpu, Layers, OctagonAlert, RotateCcw, ShieldCheck } from 'lucide-react'
import { SCENARIO_LIST } from '../../engine/scenarios/definitions'
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
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-[#2A303C] bg-[#161920] px-3">
      {/* Left: Brand + Dual-Workspace Switcher */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded border border-[#00E5FF]/40 bg-[#00E5FF]/10">
            <Cpu className="h-4 w-4 text-[#00E5FF]" />
          </div>
          <div className="leading-tight">
            <h1 className="font-mono text-xs font-bold tracking-wider text-[#F1F5F9]">
              OMNICELL <span className="text-[#00E5FF]">STUDIO</span>
            </h1>
            <p className="font-mono text-[9px] tracking-widest text-[#64748B]">
              OMNI-R20iD/25 · DUAL-TRACK HMI
            </p>
          </div>
        </div>

        <div className="h-6 w-px bg-[#2A303C]" />

        {/* Dual-Workspace Switcher */}
        <nav className="flex items-center rounded-md border border-[#2A303C] bg-[#0F1217] p-0.5" aria-label="Workspace Switcher">
          <button
            type="button"
            onClick={() => setWorkspace('ROBOTICS')}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1 font-mono text-[11px] font-semibold transition-colors ${
              activeWorkspace === 'ROBOTICS'
                ? 'bg-[#232936] text-[#00E5FF] shadow-sm'
                : 'text-[#8B949E] hover:text-[#E6EDF3]'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            Robotics Workcell Lab
          </button>
          <button
            type="button"
            onClick={() => setWorkspace('PLC')}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1 font-mono text-[11px] font-semibold transition-colors ${
              activeWorkspace === 'PLC'
                ? 'bg-[#232936] text-[#FFB300] shadow-sm'
                : 'text-[#8B949E] hover:text-[#E6EDF3]'
            }`}
          >
            <Cpu className="h-3.5 w-3.5" />
            PLC &amp; Controls Lab
            <span className="rounded bg-[#FFB300]/15 px-1 py-0.2 font-mono text-[9px] text-[#FFB300]">
              PHASE 3
            </span>
          </button>
        </nav>
      </div>

      {/* Center: Scenario Selector (Visible in Robotics Lab) */}
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
      <div className="flex items-center gap-2">
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
            className="flex items-center gap-1 rounded border border-[#FFB300]/60 bg-[#FFB300]/15 px-2.5 py-1 font-mono text-[11px] font-semibold text-[#FFB300] hover:bg-[#FFB300]/25"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            RESET FAULT
          </button>
        )}

        <button
          type="button"
          onClick={toggleEstop}
          className={`flex items-center gap-1.5 rounded border px-2.5 py-1 font-mono text-[11px] font-bold tracking-wider transition-all ${
            estopActive
              ? 'border-[#FF1744] bg-[#FF1744] text-white shadow-[0_0_12px_rgba(255,23,68,0.6)]'
              : 'border-[#FF1744]/50 bg-[#2A1117] text-[#FF526B] hover:border-[#FF1744] hover:bg-[#3A141D]'
          }`}
        >
          {estopActive ? <ShieldCheck className="h-3.5 w-3.5" /> : <OctagonAlert className="h-3.5 w-3.5" />}
          {estopActive ? 'RELEASE E-STOP' : 'E-STOP'}
        </button>
      </div>
    </header>
  )
}
