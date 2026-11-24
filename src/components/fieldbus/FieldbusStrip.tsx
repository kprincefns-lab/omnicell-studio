import { useState } from 'react'
import { Activity, ChevronDown, ChevronUp, Cpu, SlidersHorizontal } from 'lucide-react'
import { useFieldbusStore } from '../../engine/fieldbus/fieldbusStore'
import { DI_DEFINITIONS, DO_DEFINITIONS } from '../../engine/fieldbus/types'

/**
 * Persistent Live Virtual Fieldbus I/O Strip shared between Robotics Lab & Phase 3 PLC Lab.
 * Shows primary DI[1..8] / DO[1..8] LEDs + VR[1] offset + expandable Manual Cell / PLC Override Drawer.
 */
export function FieldbusStrip() {
  const [drawerOpen, setDrawerOpen] = useState(false)

  const di = useFieldbusStore((s) => s.di)
  const doBank = useFieldbusStore((s) => s.do)
  const vr = useFieldbusStore((s) => s.vr)
  const autoPlcHandshake = useFieldbusStore((s) => s.autoPlcHandshake)
  const setAutoPlcHandshake = useFieldbusStore((s) => s.setAutoPlcHandshake)
  const toggleDI = useFieldbusStore((s) => s.toggleDI)
  const eventLog = useFieldbusStore((s) => s.eventLog)

  const primaryDI = DI_DEFINITIONS.slice(0, 8)
  const primaryDO = DO_DEFINITIONS.slice(0, 8)
  const vr1 = vr[1]

  return (
    <div className="relative z-20 shrink-0 border-b border-[#2A303C] bg-[#12151B]">
      {/* Compact Persistent LED Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
        <div className="flex flex-wrap items-center gap-3">
          {/* Bus Label */}
          <div className="flex items-center gap-1.5 font-mono text-[10px] font-semibold tracking-wider text-[#94A3B8]">
            <Activity className="h-3.5 w-3.5 text-[#00E5FF]" />
            <span>FIELDBUS</span>
            <span
              className={`led-dot ${di[16] ? 'led-cyan' : 'led-off'}`}
              title="DI[16] PLC Watchdog Heartbeat"
            />
          </div>

          {/* DI[1..8] Clickable Input LEDs */}
          <div className="flex items-center gap-1">
            <span className="mr-1 font-mono text-[10px] font-bold text-[#64748B]">DI</span>
            {primaryDI.map((sig) => {
              const on = di[sig.index]
              return (
                <button
                  key={`di_${sig.index}`}
                  type="button"
                  onClick={() => toggleDI(sig.index)}
                  title={`Click to toggle DI[${sig.index}] ${sig.symbol} (${sig.description})`}
                  className={`flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] transition-colors ${
                    on
                      ? sig.safetyCritical
                        ? 'border-[#00E676]/45 bg-[#00E676]/10 text-[#00E676]'
                        : 'border-[#00E5FF]/40 bg-[#00E5FF]/10 text-[#E6EDF3]'
                      : sig.safetyCritical
                        ? 'border-[#FF1744]/50 bg-[#FF1744]/10 text-[#FF6B81]'
                        : 'border-[#252B36] bg-[#171B22] text-[#64748B] hover:border-[#3A4354]'
                  }`}
                >
                  <span
                    className={`led-dot ${
                      on ? (sig.safetyCritical ? 'led-green' : 'led-cyan') : sig.safetyCritical ? 'led-red' : 'led-off'
                    }`}
                  />
                  <span className="hidden xl:inline">{sig.shortLabel}</span>
                  <span className="xl:hidden">{sig.index}</span>
                </button>
              )
            })}
          </div>

          <div className="hidden h-4 w-px bg-[#2A303C] md:block" />

          {/* DO[1..8] Read-Only Robot Output LEDs */}
          <div className="flex items-center gap-1">
            <span className="mr-1 font-mono text-[10px] font-bold text-[#64748B]">DO</span>
            {primaryDO.map((sig) => {
              const on = doBank[sig.index]
              return (
                <div
                  key={`do_${sig.index}`}
                  title={`DO[${sig.index}] ${sig.symbol}: ${sig.description}`}
                  className={`flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                    on
                      ? sig.index === 6
                        ? 'border-[#FF1744]/60 bg-[#FF1744]/15 text-[#FF6B81]'
                        : 'border-[#00E676]/45 bg-[#00E676]/10 text-[#E6EDF3]'
                      : 'border-[#222731] bg-[#15181F] text-[#5B6575]'
                  }`}
                >
                  <span
                    className={`led-dot ${
                      on ? (sig.index === 6 ? 'led-red' : 'led-green') : 'led-off'
                    }`}
                  />
                  <span className="hidden 2xl:inline">{sig.shortLabel}</span>
                  <span className="2xl:hidden">{sig.index}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right: VR[1] Vision Summary + Simulated PLC Override Toggle */}
        <div className="flex items-center gap-2">
          <div
            className={`hidden items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[10px] tabular-nums sm:flex ${
              vr1.valid
                ? 'border-[#00E5FF]/40 bg-[#00E5FF]/10 text-[#00E5FF]'
                : 'border-[#252B36] bg-[#171B22] text-[#64748B]'
            }`}
            title="Vision Offset Register VR[1]"
          >
            <span className="font-bold">VR[1]</span>
            {vr1.valid ? (
              <span>
                ΔX:{vr1.x.toFixed(1)} ΔY:{vr1.y.toFixed(1)} Rz:{vr1.rz.toFixed(1)}°
              </span>
            ) : (
              <span>IDLE</span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setDrawerOpen(!drawerOpen)}
            className={`flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[10px] font-semibold transition-colors ${
              drawerOpen
                ? 'border-[#00E5FF]/60 bg-[#00E5FF]/15 text-[#00E5FF]'
                : 'border-[#2A303C] bg-[#1C1F26] text-[#CBD5E1] hover:border-[#3F495B]'
            }`}
          >
            <SlidersHorizontal className="h-3 w-3" />
            PLC I/O OVERRIDE
            {drawerOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {/* Expandable Manual Cell / Simulated PLC Override Drawer */}
      {drawerOpen && (
        <div className="border-t border-[#2A303C] bg-[#151820] px-4 py-3 shadow-2xl">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-[#00E5FF]" />
              <span className="font-mono text-xs font-semibold text-[#E6EDF3]">
                VIRTUAL FIELDBUS I/O MONITOR &amp; SIMULATED PLC OVERRIDE
              </span>
              <span className="rounded bg-[#232833] px-2 py-0.5 font-mono text-[10px] text-[#94A3B8]">
                SHARED PHASE 3 PLC CONTRACT
              </span>
            </div>
            <label className="flex cursor-pointer items-center gap-2 font-mono text-[11px] text-[#CBD5E1]">
              <input
                type="checkbox"
                checked={autoPlcHandshake}
                onChange={(e) => setAutoPlcHandshake(e.target.checked)}
                className="accent-[#00E5FF]"
              />
              Auto-Simulate PLC Handshakes (Gripper Reeds &amp; CNC Door)
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {/* DI[1..16] Bank */}
            <div className="hmi-recessed rounded-md p-2.5">
              <div className="mb-2 flex items-center justify-between font-mono text-[10px] font-bold text-[#00E5FF]">
                <span>DI[1..16] — INPUTS TO ROBOT (CLICK TO FORCE)</span>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {DI_DEFINITIONS.map((sig) => {
                  const on = di[sig.index]
                  return (
                    <button
                      key={`full_di_${sig.index}`}
                      type="button"
                      onClick={() => toggleDI(sig.index)}
                      className={`flex items-center justify-between rounded border px-2 py-1 text-left font-mono text-[10px] transition-colors ${
                        on
                          ? 'border-[#00E5FF]/40 bg-[#00E5FF]/10 text-[#E6EDF3]'
                          : 'border-[#232833] bg-[#14171D] text-[#64748B] hover:border-[#394254]'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        <span className={`led-dot ${on ? 'led-cyan' : 'led-off'}`} />
                        <span className="truncate">
                          [{sig.index}] {sig.symbol}
                        </span>
                      </span>
                      <span className="ml-1 shrink-0 font-bold">{on ? '1' : '0'}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* DO[1..16] Bank */}
            <div className="hmi-recessed rounded-md p-2.5">
              <div className="mb-2 flex items-center justify-between font-mono text-[10px] font-bold text-[#00E676]">
                <span>DO[1..16] — OUTPUTS FROM ROBOT TO PLC</span>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {DO_DEFINITIONS.map((sig) => {
                  const on = doBank[sig.index]
                  return (
                    <div
                      key={`full_do_${sig.index}`}
                      className={`flex items-center justify-between rounded border px-2 py-1 font-mono text-[10px] ${
                        on
                          ? sig.index === 6
                            ? 'border-[#FF1744]/50 bg-[#FF1744]/15 text-[#FCA5A5]'
                            : 'border-[#00E676]/40 bg-[#00E676]/10 text-[#E6EDF3]'
                          : 'border-[#232833] bg-[#14171D] text-[#64748B]'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        <span
                          className={`led-dot ${
                            on ? (sig.index === 6 ? 'led-red' : 'led-green') : 'led-off'
                          }`}
                        />
                        <span className="truncate">
                          [{sig.index}] {sig.symbol}
                        </span>
                      </span>
                      <span className="ml-1 shrink-0 font-bold">{on ? '1' : '0'}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Live Bus Event Log */}
            <div className="hmi-recessed flex flex-col rounded-md p-2.5">
              <div className="mb-2 font-mono text-[10px] font-bold text-[#FFB300]">
                FIELDBUS HANDSHAKE TRACE
              </div>
              <div className="max-h-44 flex-1 space-y-1 overflow-y-auto font-mono text-[10px]">
                {eventLog.length === 0 ? (
                  <p className="text-[#64748B]">No signal transitions recorded yet.</p>
                ) : (
                  eventLog.slice(0, 14).map((ev) => (
                    <div key={ev.id} className="flex items-center justify-between border-b border-[#1E222B] pb-0.5">
                      <span className="text-[#64748B] tabular-nums">{ev.timestamp}</span>
                      <span className="font-semibold text-[#E6EDF3]">{ev.channel}</span>
                      <span
                        className={
                          ev.source === 'FAULT'
                            ? 'text-[#FF1744]'
                            : ev.source === 'VISION'
                              ? 'text-[#00E5FF]'
                              : 'text-[#00E676]'
                        }
                      >
                        {ev.value}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
