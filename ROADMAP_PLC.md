# OmniCell Studio — Phase 3 PLC & Controls Lab Roadmap

This document specifies the Phase 3 **PLC & Controls Lab** architecture that plugs directly into OmniCell Studio's existing **Virtual Fieldbus** (`src/engine/fieldbus/fieldbusStore.ts`) without modifying the 3D Robotics Workcell engine.

---

## 1. Shared Virtual Fieldbus Contract (Already Active in Phases 1 & 2)

Both workspaces share a single deterministic Zustand memory bus (`useFieldbusStore`):

| Bus Direction | Robot Memory | Siemens S7-1500 (PROFINET) | Allen-Bradley ControlLogix (EtherNet/IP) | Signal Purpose |
| --- | --- | --- | --- | --- |
| PLC → Robot | `DI[1]` | `%Q0.0` | `Local:1:O.Data.0` | `PartPresent_Infeed` |
| PLC → Robot | `DI[2]` | `%Q0.1` | `Local:1:O.Data.1` | `CNC_DoorOpen` |
| PLC → Robot | `DI[3]` | `%Q0.2` | `Local:1:O.Data.2` | `Clamp_Released` |
| PLC → Robot | `DI[4]` | `%Q0.3` | `Local:1:O.Data.3` | `Gripper_ClosedReed` |
| PLC → Robot | `DI[5]` | `%Q0.4` | `Local:1:O.Data.4` | `Gripper_OpenReed` |
| PLC → Robot | `DI[6]` | `%Q0.5` | `Local:1:O.Data.5` | `SafetyFence_OK` (F-Safe) |
| PLC → Robot | `DI[7]` | `%Q0.6` | `Local:1:O.Data.6` | `PLC_CycleStart` |
| PLC → Robot | `DI[8]` | `%Q0.7` | `Local:1:O.Data.7` | `FaultReset` |
| Robot → PLC | `DO[1]` | `%I0.0` | `Local:1:I.Data.0` | `Gripper_CloseCmd` |
| Robot → PLC | `DO[2]` | `%I0.1` | `Local:1:I.Data.1` | `CNC_ClampAndStart` |
| Robot → PLC | `DO[3]` | `%I0.2` | `Local:1:I.Data.2` | `Infeed_ConveyorRun` |
| Robot → PLC | `DO[4]` | `%I0.3` | `Local:1:I.Data.3` | `Robot_AtHome` |
| Robot → PLC | `DO[5]` | `%I0.4` | `Local:1:I.Data.4` | `Robot_CycleComplete` |
| Robot → PLC | `DO[6]` | `%I0.5` | `Local:1:I.Data.5` | `Robot_FaultActive` |
| Vision → Robot | `VR[1..4]` | `DB100.VR[1..4]` | `Vision_Offset[1..4]` (UDT) | `{ x, y, z, rx, ry, rz, valid, score }` |

---

## 2. Deterministic Browser PLC Scan-Cycle Engine (`src/engine/plc/`)

Phase 3 introduces a deterministic, zero-backend IEC 61131-3 scan loop executing every **10 ms** (100 Hz) via fixed-timestep accumulation inside the shared runtime:

1. **Read Input Process Image (`PI_I`):** Snapshot `useFieldbusStore.getState().do` + simulated cell sensors (conveyor photo-eyes, CNC spindle zero-speed, safety light curtains).
2. **Execute User Logic (`OB1` / `MainRoutine`):**
   - **Ladder Diagram (LAD / RLL) Evaluator:** Visual rung canvas supporting `XIC` (NO), `XIO` (NC), `OTE` (Coil), `OTL`/`OTU` (Set/Reset Latch), `OSR` (Rising Edge), `TON`/`TOF`/`RTO` timers, `CTU`/`CTD` counters, and `EQU`/`GRT`/`LES` comparators.
   - **Structured Text (SCL / ST) Compiler & Sandbox:** Safe AST-based TypeScript interpreter executing `IF/ELSIF`, `CASE`, `FOR`, timer FB instances (`TON_DoorDelay(IN := ..., PT := T#1500ms)`), and arithmetic — with strict loop iteration caps so user code can never freeze the browser tab.
3. **Write Output Process Image (`PI_Q`):** Commit resolved outputs atomically to `useFieldbusStore.getState().setDI(...)` (with `autoPlcHandshake` automatically disabled while User PLC is in `RUN` mode).
4. **Watchdog & Diagnostics:** Toggle `DI[16]` heartbeat, compute real scan time (`μs`), and highlight energized ladder power rails in live Emerald Green (`#00E676`).

---

## 3. Phase 3 Multi-Vendor PLC Curriculum

### Track A — Siemens TIA Portal (`S7-1500` · LAD & SCL)
- **Lab 1:** Safety Relay & Start/Stop Seal-In Circuit (`SafetyFence_OK` + `Operator_BayClear` + `FaultReset` pulse).
- **Lab 2:** Conveyor Indexing & Part Queue Debouncing using IEC `TON` timers and rising-edge `P_TRIG`.
- **Lab 3:** SCL State Machine (`CASE #nCellState OF ...`) orchestrating full CNC tending handshake (`DO[4]`, `DO[2]`, `DI[2]`, `DO[5]`).

### Track B — Allen-Bradley Studio 5000 (`ControlLogix` · LAD & ST)
- **Lab 1:** Tag-based Ladder Rungs (`XIC`, `XIO`, `OTE`, `OTL`, `OTU`) with Studio 5000 `TON.DN` / `TON.TT` timer bits.
- **Lab 2:** Building a reusable **Robot Handshake Add-On Instruction (AOI)** with timeout fault latching and HMI alarm codes.
- **Lab 3:** Structured Text (`ST`) Vision Offset bounds-checker validating `VR[1]` tolerance before issuing `DI[7] PLC_CycleStart`.

### Track C — ABB / CODESYS (`IEC 61131-3` · LD, ST & SFC)
- **Lab 1:** Multi-station **Sequential Function Chart (SFC)** driving Infeed → Vision → Robot Pick → CNC Load → Machine Cycle → Unload.
- **Lab 2:** Online Watch Table, Force Table, and live split-screen view showing the 3D OMNI-R20iD workcell responding to every rung transition in real time.

---

## 4. Handoff Integration Checklist for Phase 3
- [ ] Add `src/engine/plc/scanEngine.ts` implementing fixed-timestep 10 ms `PI_I -> Logic -> PI_Q` scan cycle.
- [ ] Add `src/engine/plc/stParser.ts` safe AST interpreter for Siemens SCL / AB ST / IEC ST.
- [ ] Add `src/components/plc/LadderEditor.tsx` interactive drag-and-click rung editor with live energized power-rail highlighting.
- [ ] Add split-viewport mode (`50% 3D Workcell | 50% Live PLC IDE`) so students watch their Ladder/ST code drive the 3D robot cell live.
