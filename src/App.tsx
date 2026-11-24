import { ClipboardList, Code2, Gamepad2 } from 'lucide-react'
import { MultiOemCodePanel } from './components/code/MultiOemCodePanel'
import { FieldbusStrip } from './components/fieldbus/FieldbusStrip'
import { TopHeaderBar } from './components/layout/TopHeaderBar'
import { TeachPendantPanel } from './components/pendant/TeachPendantPanel'
import { PlcLabPlaceholder } from './components/plc/PlcLabPlaceholder'
import { WorkcellViewport } from './components/scene/WorkcellViewport'
import { ScenarioTelemetryPanel } from './components/scenario/ScenarioTelemetryPanel'
import { SCENARIO_LIST } from './engine/scenarios/definitions'
import { useRobotStore, type DockTab } from './engine/store/robotStore'

const DOCK_TABS: ReadonlyArray<{ id: DockTab; label: string; icon: typeof Gamepad2 }> = [
  { id: 'PENDANT', label: 'Teach Pendant', icon: Gamepad2 },
  { id: 'CODE', label: 'Multi-OEM Code', icon: Code2 },
  { id: 'SCENARIO', label: 'Scenario & Telemetry', icon: ClipboardList },
]

export function App() {
  const activeWorkspace = useRobotStore((s) => s.activeWorkspace)
  const activeDockTab = useRobotStore((s) => s.activeDockTab)
  const setDockTab = useRobotStore((s) => s.setDockTab)
  const scenarioId = useRobotStore((s) => s.scenarioId)
  const loadScenario = useRobotStore((s) => s.loadScenario)

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#0A0C10] text-[#E6EDF3]">
      {/* Persistent Top Industrial HMI Bar */}
      <TopHeaderBar />

      {/* Persistent Live Virtual Fieldbus I/O Strip */}
      <FieldbusStrip />

      {/* Compact Scenario Bar for smaller screens (< lg) */}
      {activeWorkspace === 'ROBOTICS' && (
        <div className="flex items-center gap-1 overflow-x-auto border-b border-[#2A303C] bg-[#151820] px-3 py-1 lg:hidden">
          {SCENARIO_LIST.map((sc) => (
            <button
              key={sc.id}
              type="button"
              onClick={() => loadScenario(sc.id)}
              className={`shrink-0 rounded border px-2 py-0.5 font-mono text-[10px] ${
                sc.id === scenarioId
                  ? 'border-[#00E5FF]/60 bg-[#00E5FF]/15 font-bold text-[#00E5FF]'
                  : 'border-[#2A303C] bg-[#1C1F26] text-[#94A3B8]'
              }`}
            >
              0{sc.number} {sc.shortTitle}
            </button>
          ))}
        </div>
      )}

      {/* Main Workspace Area */}
      <main className="min-h-0 flex-1 overflow-hidden">
        {activeWorkspace === 'PLC' ? (
          <PlcLabPlaceholder />
        ) : (
          <div className="flex h-full w-full flex-col lg:flex-row">
            {/* 65% 3D Workcell Viewport */}
            <section
              className="relative h-[46%] w-full border-b border-[#2A303C] lg:h-full lg:w-[65%] lg:border-b-0 lg:border-r"
              aria-label="3D Industrial Robot Workcell Viewport"
            >
              <WorkcellViewport />
            </section>

            {/* 35% Tabbed Virtual Teach Pendant / Multi-OEM Code / Scenario Telemetry Dock */}
            <aside
              className="flex h-[54%] w-full flex-col bg-[#1C1F26] lg:h-full lg:w-[35%]"
              aria-label="Controller Dock"
            >
              {/* Dock Tab Bar */}
              <div className="grid shrink-0 grid-cols-3 border-b border-[#2A303C] bg-[#151820]">
                {DOCK_TABS.map((tab) => {
                  const Icon = tab.icon
                  const active = activeDockTab === tab.id
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setDockTab(tab.id)}
                      className={`flex items-center justify-center gap-1.5 border-b-2 py-2.5 font-mono text-[11px] font-semibold transition-colors ${
                        active
                          ? 'border-[#00E5FF] bg-[#1C1F26] text-[#00E5FF]'
                          : 'border-transparent text-[#8B949E] hover:bg-[#191D26] hover:text-[#E6EDF3]'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span className="truncate">{tab.label}</span>
                    </button>
                  )
                })}
              </div>

              {/* Active Dock Content */}
              <div className="min-h-0 flex-1 overflow-hidden">
                {activeDockTab === 'PENDANT' && <TeachPendantPanel />}
                {activeDockTab === 'CODE' && <MultiOemCodePanel />}
                {activeDockTab === 'SCENARIO' && <ScenarioTelemetryPanel />}
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
