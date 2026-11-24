import { useState } from 'react'
import { Activity, ClipboardList, Code2, Gamepad2 } from 'lucide-react'
import { MultiOemCodePanel } from './components/code/MultiOemCodePanel'
import { FieldbusControlDeck, FieldbusStrip } from './components/fieldbus/FieldbusStrip'
import { TopHeaderBar } from './components/layout/TopHeaderBar'
import { TeachPendantPanel } from './components/pendant/TeachPendantPanel'
import { PlcLabPlaceholder } from './components/plc/PlcLabPlaceholder'
import { WorkcellViewport, type MobileViewportSize } from './components/scene/WorkcellViewport'
import { ScenarioTelemetryPanel } from './components/scenario/ScenarioTelemetryPanel'
import { useRobotStore, type DockTab } from './engine/store/robotStore'

const DESKTOP_DOCK_TABS: ReadonlyArray<{ id: DockTab; label: string; icon: typeof Gamepad2 }> = [
  { id: 'PENDANT', label: 'Teach Pendant', icon: Gamepad2 },
  { id: 'CODE', label: 'Multi-OEM Code', icon: Code2 },
  { id: 'SCENARIO', label: 'Scenario & Telemetry', icon: ClipboardList },
]

const MOBILE_BOTTOM_TABS: ReadonlyArray<{ id: DockTab; label: string; icon: typeof Gamepad2 }> = [
  { id: 'PENDANT', label: 'Pendant', icon: Gamepad2 },
  { id: 'CODE', label: 'Code', icon: Code2 },
  { id: 'SCENARIO', label: 'Mission', icon: ClipboardList },
  { id: 'IO', label: 'I/O Bus', icon: Activity },
]

export function App() {
  const [mobileViewportSize, setMobileViewportSize] = useState<MobileViewportSize>('compact')

  const activeWorkspace = useRobotStore((s) => s.activeWorkspace)
  const activeDockTab = useRobotStore((s) => s.activeDockTab)
  const setDockTab = useRobotStore((s) => s.setDockTab)

  const cycleMobileViewportSize = () => {
    setMobileViewportSize((prev) =>
      prev === 'compact' ? 'expanded' : prev === 'expanded' ? 'full' : 'compact',
    )
  }

  const mobileViewportHeightClass =
    mobileViewportSize === 'full'
      ? 'flex-1'
      : mobileViewportSize === 'expanded'
        ? 'h-[56%] shrink-0'
        : 'h-[36%] min-h-[205px] shrink-0'

  return (
    <div className="flex h-[100dvh] w-screen flex-col overflow-hidden bg-[#0A0C10] text-[#E6EDF3]">
      {/* Persistent Top Industrial HMI Bar */}
      <TopHeaderBar />

      {/* Persistent Live Virtual Fieldbus I/O Strip (Single-line ticker on mobile, full strip on desktop) */}
      <FieldbusStrip />

      {/* Main Workspace Area */}
      <main className="min-h-0 flex-1 overflow-hidden">
        {activeWorkspace === 'PLC' ? (
          <PlcLabPlaceholder />
        ) : (
          <div className="flex h-full w-full flex-col lg:flex-row">
            {/* 3D Workcell Viewport: Resizable on Mobile, 65% Left on Desktop */}
            <section
              className={`relative w-full border-b border-[#2A303C] transition-[height] duration-200 lg:h-full lg:w-[65%] lg:flex-none lg:border-b-0 lg:border-r ${mobileViewportHeightClass}`}
              aria-label="3D Industrial Robot Workcell Viewport"
            >
              <WorkcellViewport
                mobileSize={mobileViewportSize}
                onCycleMobileSize={cycleMobileViewportSize}
              />
            </section>

            {/* Controller Dock: Hidden only when Mobile 3D is in Fullscreen mode; always 35% Right on Desktop */}
            <aside
              className={`${
                mobileViewportSize === 'full' ? 'hidden lg:flex' : 'flex'
              } min-h-0 flex-1 flex-col bg-[#1C1F26] lg:h-full lg:w-[35%] lg:flex-none`}
              aria-label="Controller Dock"
            >
              {/* Desktop Top Dock Tab Bar (lg+) */}
              <div className="hidden shrink-0 grid-cols-3 border-b border-[#2A303C] bg-[#151820] lg:grid">
                {DESKTOP_DOCK_TABS.map((tab) => {
                  const Icon = tab.icon
                  const active = activeDockTab === tab.id || (activeDockTab === 'IO' && tab.id === 'PENDANT')
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
                {activeDockTab === 'IO' && <FieldbusControlDeck />}
              </div>
            </aside>

            {/* Mobile Bottom Thumb-Zone Navigation Bar (< lg) */}
            <nav
              className="safe-bottom grid shrink-0 grid-cols-4 border-t border-[#2A303C] bg-[#14171D] lg:hidden"
              aria-label="Mobile Controller Navigation"
            >
              {MOBILE_BOTTOM_TABS.map((tab) => {
                const Icon = tab.icon
                const active = activeDockTab === tab.id && mobileViewportSize !== 'full'
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setDockTab(tab.id)
                      if (mobileViewportSize === 'full') {
                        setMobileViewportSize('compact')
                      }
                    }}
                    className={`flex min-h-[50px] flex-col items-center justify-center gap-0.5 border-t-2 font-mono text-[10px] font-semibold transition-colors ${
                      active
                        ? 'border-[#00E5FF] bg-[#1C212B] text-[#00E5FF]'
                        : 'border-transparent text-[#8B949E]'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{tab.label}</span>
                  </button>
                )
              })}
            </nav>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
