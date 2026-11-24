import { ArrowRight, Cable, Cpu, Layers, Radio, Workflow } from 'lucide-react'
import { useFieldbusStore } from '../../engine/fieldbus/fieldbusStore'
import { DI_DEFINITIONS, DO_DEFINITIONS } from '../../engine/fieldbus/types'
import { useRobotStore } from '../../engine/store/robotStore'

const PLC_TRACKS = [
  {
    vendor: 'Siemens TIA Portal',
    platform: 'S7-1500 · LAD / SCL',
    accent: '#009999',
    protocol: 'PROFINET IO (IRT)',
    highlights: [
      'OB1 Cyclic Main + TON/TOF/CTU IEC Timers',
      'SCL Structured Control Language state machines for CNC cell orchestration',
      'Safety Integrated F-CPU dual-channel interlocks (DI[6], DI[12])',
    ],
  },
  {
    vendor: 'Allen-Bradley Studio 5000',
    platform: 'ControlLogix · LAD / ST',
    accent: '#FF3B30',
    protocol: 'EtherNet/IP CIP Implicit',
    highlights: [
      'Tag-based Ladder Logic (XIC/XIO/OTE/OTL/OTU) mapped to Virtual Fieldbus',
      'Add-On Instructions (AOI) for Robot Handshake & Fault Recovery',
      'Structured Text (ST) vision offset validation & recipe dispatching',
    ],
  },
  {
    vendor: 'ABB / CODESYS',
    platform: 'IEC 61131-3 · LD / ST / SFC',
    accent: '#2979FF',
    protocol: 'EtherCAT / Modbus TCP',
    highlights: [
      'Sequential Function Chart (SFC) multi-station cycle supervision',
      'Portable IEC 61131-3 Function Blocks directly driving the 3D OMNI-R20iD cell',
      'Live online watch-table, bit forcing, and 10ms deterministic scan diagnostics',
    ],
  },
] as const

export function PlcLabPlaceholder() {
  const di = useFieldbusStore((s) => s.di)
  const doBank = useFieldbusStore((s) => s.do)
  const vr = useFieldbusStore((s) => s.vr)
  const scanCycleCount = useFieldbusStore((s) => s.scanCycleCount)
  const toggleDI = useFieldbusStore((s) => s.toggleDI)
  const setWorkspace = useRobotStore((s) => s.setWorkspace)

  return (
    <div className="safe-bottom flex h-full flex-col overflow-y-auto bg-[#0D1016] p-3 sm:p-5">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:gap-5">
        {/* Top Architecture Banner */}
        <div className="hmi-panel flex flex-wrap items-center justify-between gap-4 rounded-lg p-5">
          <div className="max-w-2xl">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="rounded border border-[#FFB300]/50 bg-[#FFB300]/15 px-2 py-0.5 font-mono text-[10px] font-bold text-[#FFB300]">
                PHASE 3 — READY FOR PLC SCAN-CYCLE ENGINE
              </span>
              <span className="font-mono text-[10px] text-[#64748B]">
                SHARED VIRTUAL FIELDBUS CONTRACT ACTIVE
              </span>
            </div>
            <h2 className="font-mono text-lg font-bold tracking-tight text-[#F1F5F9]">
              PLC &amp; Controls Lab — Deterministic Industrial Cell Orchestration
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-[#94A3B8]">
              This workspace shares the exact live <code className="font-mono text-[#00E5FF]">useFieldbusStore</code> I/O
              memory map (<code className="font-mono text-[#E6EDF3]">DI[1..16]</code>,{' '}
              <code className="font-mono text-[#E6EDF3]">DO[1..16]</code>,{' '}
              <code className="font-mono text-[#E6EDF3]">VR[1..4]</code>) with the 3D Robotics Workcell. In Phase 3,
              browser-native Ladder &amp; Structured Text runtimes will scan at 10ms and drive the 3D robot cell live.
              See <code className="font-mono text-[#FFB300]">ROADMAP_PLC.md</code> for the full engineering spec.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setWorkspace('ROBOTICS')}
            className="flex items-center gap-2 rounded-md border border-[#00E5FF]/50 bg-[#00E5FF]/12 px-4 py-2 font-mono text-xs font-bold text-[#00E5FF] hover:bg-[#00E5FF]/20"
          >
            Return to 3D Robotics Workcell
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        {/* Phase 3 Curriculum Track Cards */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {PLC_TRACKS.map((track) => (
            <div
              key={track.vendor}
              className="hmi-panel flex flex-col justify-between rounded-lg p-4"
            >
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span
                    className="flex items-center gap-1.5 font-mono text-xs font-bold"
                    style={{ color: track.accent }}
                  >
                    <Cpu className="h-4 w-4" />
                    {track.vendor}
                  </span>
                  <span className="rounded bg-[#14171D] px-2 py-0.5 font-mono text-[9px] text-[#94A3B8]">
                    {track.protocol}
                  </span>
                </div>
                <div className="mb-3 font-mono text-[11px] font-semibold text-[#E6EDF3]">
                  {track.platform}
                </div>
                <ul className="space-y-1.5 text-[11px] leading-snug text-[#94A3B8]">
                  {track.highlights.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-[#262C38] pt-2.5 font-mono text-[10px]">
                <span className="text-[#FFB300]">Phase 3 — Ready for PLC Scan-Cycle Engine</span>
                <Workflow className="h-3.5 w-3.5 text-[#64748B]" />
              </div>
            </div>
          ))}
        </div>

        {/* Live Shared Virtual Fieldbus Mirror (Interactive Bit Force Table) */}
        <div className="hmi-panel rounded-lg p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Cable className="h-4 w-4 text-[#00E5FF]" />
              <h3 className="font-mono text-xs font-bold tracking-wider text-[#F1F5F9]">
                LIVE SHARED VIRTUAL FIELDBUS MIRROR (ROBOT ↔ PLC MEMORY MAP)
              </h3>
            </div>
            <div className="flex items-center gap-3 font-mono text-[10px] text-[#94A3B8] tabular-nums">
              <span className="flex items-center gap-1.5">
                <Radio className="h-3.5 w-3.5 text-[#00E676]" />
                BUS ONLINE · HEARTBEAT TICKS: <strong className="text-[#00E5FF]">{scanCycleCount}</strong>
              </span>
              <span className="flex items-center gap-1">
                <Layers className="h-3.5 w-3.5 text-[#FFB300]" />
                VR[1]: {vr[1].valid ? `ΔX ${vr[1].x.toFixed(1)} ΔY ${vr[1].y.toFixed(1)} Rz ${vr[1].rz.toFixed(1)}°` : 'IDLE'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* PLC Output -> Robot DI[1..16] */}
            <div className="hmi-recessed rounded-md p-3">
              <div className="mb-2 flex items-center justify-between font-mono text-[10px] font-bold text-[#00E5FF]">
                <span>PLC OUTPUTS → ROBOT DI[1..16] (CLICK TO FORCE BIT)</span>
                <span className="text-[#64748B]">SIEMENS / AB TAG</span>
              </div>
              <div className="space-y-1">
                {DI_DEFINITIONS.map((sig) => {
                  const val = di[sig.index]
                  return (
                    <button
                      key={`plc_di_${sig.index}`}
                      type="button"
                      onClick={() => toggleDI(sig.index)}
                      className={`flex w-full items-center justify-between rounded border px-2.5 py-1 text-left font-mono text-[10.5px] transition-colors ${
                        val
                          ? 'border-[#00E5FF]/40 bg-[#00E5FF]/10 text-[#E6EDF3]'
                          : 'border-[#222731] bg-[#14171D] text-[#7D8797] hover:border-[#374151]'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className={`led-dot ${val ? 'led-cyan' : 'led-off'}`} />
                        <span className="w-11 font-bold text-[#94A3B8]">DI[{sig.index}]</span>
                        <span className="font-semibold">{sig.symbol}</span>
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="text-[9.5px] text-[#64748B]">{sig.plcAddress}</span>
                        <span className={`w-6 text-right font-bold ${val ? 'text-[#00E5FF]' : 'text-[#475569]'}`}>
                          {val ? 'ON' : 'OFF'}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Robot DO[1..16] -> PLC Input */}
            <div className="hmi-recessed rounded-md p-3">
              <div className="mb-2 flex items-center justify-between font-mono text-[10px] font-bold text-[#00E676]">
                <span>ROBOT DO[1..16] → PLC INPUTS (LIVE READOUT)</span>
                <span className="text-[#64748B]">SIEMENS / AB TAG</span>
              </div>
              <div className="space-y-1">
                {DO_DEFINITIONS.map((sig) => {
                  const val = doBank[sig.index]
                  return (
                    <div
                      key={`plc_do_${sig.index}`}
                      className={`flex items-center justify-between rounded border px-2.5 py-1 font-mono text-[10.5px] ${
                        val
                          ? sig.index === 6
                            ? 'border-[#FF1744]/50 bg-[#FF1744]/15 text-[#FCA5A5]'
                            : 'border-[#00E676]/40 bg-[#00E676]/10 text-[#E6EDF3]'
                          : 'border-[#222731] bg-[#14171D] text-[#7D8797]'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={`led-dot ${
                            val ? (sig.index === 6 ? 'led-red' : 'led-green') : 'led-off'
                          }`}
                        />
                        <span className="w-11 font-bold text-[#94A3B8]">DO[{sig.index}]</span>
                        <span className="font-semibold">{sig.symbol}</span>
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="text-[9.5px] text-[#64748B]">{sig.plcAddress}</span>
                        <span className={`w-6 text-right font-bold ${val ? 'text-[#00E676]' : 'text-[#475569]'}`}>
                          {val ? 'ON' : 'OFF'}
                        </span>
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
