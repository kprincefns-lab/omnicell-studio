import type { LadderRung } from './types'

export interface PlcPreset {
  id: string
  name: string
  description: string
  rungs: LadderRung[]
}

export const PLC_PRESETS: readonly PlcPreset[] = [
  {
    id: 'seal_in_auto',
    name: 'Auto-Cycle Start/Stop Seal-In',
    description:
      'Classic 3-wire Start/Stop seal-in latch (M0) with 0.8s TON delay that automatically triggers the 3D robot cell via DI[7] PLC_CycleStart.',
    rungs: [
      {
        id: 'rung_1',
        comment: 'Rung 0: Start/Stop Seal-In Latch (Press START PB1 to latch M0, STOP PB2 to drop)',
        conditions: [
          { id: 'c1_1', type: 'XIC', tag: 'PB_START' },
          { id: 'c1_2', type: 'XIO', tag: 'PB_STOP' },
          { id: 'c1_3', type: 'XIO', tag: 'DO[6]' },
        ],
        parallelBranchTag: 'M0',
        coil: { type: 'OTE', tag: 'M0' },
      },
      {
        id: 'rung_2',
        comment: 'Rung 1: Auto-Cycle Delay Timer — When M0 latched & Robot Idle, delay 0.8s then fire DI[7] CycleStart',
        conditions: [
          { id: 'c2_1', type: 'XIC', tag: 'M0' },
          { id: 'c2_2', type: 'XIO', tag: 'DO[11]' },
        ],
        timer: { timerId: 'T0', presetSec: 0.8 },
        coil: { type: 'OTE', tag: 'DI[7]' },
      },
      {
        id: 'rung_3',
        comment: 'Rung 2: Remote Fault Reset — Press RESET PB3 to pulse DI[8] FaultReset',
        conditions: [{ id: 'c3_1', type: 'XIC', tag: 'PB_RESET' }],
        coil: { type: 'OTE', tag: 'DI[8]' },
      },
      {
        id: 'rung_4',
        comment: 'Rung 3: Immediate Hold — Pressing STOP PB2 asserts DI[15] PLC_HoldReq',
        conditions: [{ id: 'c4_1', type: 'XIC', tag: 'PB_STOP' }],
        coil: { type: 'OTE', tag: 'DI[15]' },
      },
    ],
  },
  {
    id: 'safety_alarm',
    name: 'Safety Interlock & Fault Latch',
    description:
      'Latches M1 whenever Robot_Fault (DO[6]) occurs, holds cycle until PB3 RESET unlatches M1 and pulses DI[8] FaultReset.',
    rungs: [
      {
        id: 's_rung_1',
        comment: 'Rung 0: Latch Alarm Bit M1 on Robot Fault DO[6]',
        conditions: [{ id: 'sc1', type: 'XIC', tag: 'DO[6]' }],
        coil: { type: 'OTL', tag: 'M1' },
      },
      {
        id: 's_rung_2',
        comment: 'Rung 1: Operator RESET PB3 unlatches M1 and pulses Robot FaultReset DI[8]',
        conditions: [{ id: 'sc2', type: 'XIC', tag: 'PB_RESET' }],
        coil: { type: 'OTU', tag: 'M1' },
      },
      {
        id: 's_rung_3',
        comment: 'Rung 2: Forward PB3 RESET to DI[8] FaultReset',
        conditions: [{ id: 'sc3', type: 'XIC', tag: 'PB_RESET' }],
        coil: { type: 'OTE', tag: 'DI[8]' },
      },
      {
        id: 's_rung_4',
        comment: 'Rung 3: Only allow Cycle Start DI[7] when PB1 pressed & Alarm M1 is clear',
        conditions: [
          { id: 'sc4_1', type: 'XIC', tag: 'PB_START' },
          { id: 'sc4_2', type: 'XIO', tag: 'M1' },
        ],
        coil: { type: 'OTE', tag: 'DI[7]' },
      },
    ],
  },
  {
    id: 'cnc_handshake',
    name: 'CNC Door & Cycle Handshake',
    description:
      'Supervises Scenario 4 CNC Tending: detects DO[2] Clamp & Start, runs 1.8s machining timer T1, and signals Part Present DI[1].',
    rungs: [
      {
        id: 'cnc_1',
        comment: 'Rung 0: When Robot asserts DO[2] CNC_Start, run 1.8s CNC machining timer T1',
        conditions: [{ id: 'cc1', type: 'XIC', tag: 'DO[2]' }],
        timer: { timerId: 'T1', presetSec: 1.8 },
        coil: { type: 'OTE', tag: 'M2' },
      },
      {
        id: 'cnc_2',
        comment: 'Rung 1: Keep Infeed PartPresent DI[1] ready when CNC not actively machining',
        conditions: [{ id: 'cc2', type: 'XIO', tag: 'DO[2]' }],
        coil: { type: 'OTE', tag: 'DI[1]' },
      },
      {
        id: 'cnc_3',
        comment: 'Rung 2: Manual PB1 Start triggers Robot Cycle DI[7]',
        conditions: [
          { id: 'cc3_1', type: 'XIC', tag: 'PB_START' },
          { id: 'cc3_2', type: 'XIO', tag: 'DO[11]' },
        ],
        coil: { type: 'OTE', tag: 'DI[7]' },
      },
    ],
  },
  {
    id: 'blank',
    name: 'Blank Ladder Canvas',
    description: 'Start from scratch with a single editable rung wired to PB1 Start → DI[7] PLC_CycleStart.',
    rungs: [
      {
        id: 'blank_1',
        comment: 'Rung 0: Tap any contact or coil to customize your own ladder logic',
        conditions: [{ id: 'bc1', type: 'XIC', tag: 'PB_START' }],
        coil: { type: 'OTE', tag: 'DI[7]' },
      },
    ],
  },
] as const
