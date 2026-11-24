import { DI_DEFINITIONS, DO_DEFINITIONS } from '../fieldbus/types'
import type { OemDialect, PositionRegister, ProgramInstruction, TerminationMode } from './types'

function getDiSymbol(idx: number): string {
  return DI_DEFINITIONS.find((d) => d.index === idx)?.symbol ?? `DI_${idx}`
}

function getDoSymbol(idx: number): string {
  return DO_DEFINITIONS.find((d) => d.index === idx)?.symbol ?? `DO_${idx}`
}

function getPosLabel(positions: Record<number, PositionRegister>, id: number, isPR?: boolean): string {
  const pos = positions[id]
  if (pos?.name) return pos.name
  return isPR ? `PR_${id}` : `P${id}`
}

function fanucTerm(t: TerminationMode): string {
  return t.kind === 'FINE' ? 'FINE' : `CNT${Math.round(t.value)}`
}

function abbZone(t: TerminationMode): string {
  if (t.kind === 'FINE') return 'fine'
  // Map CNT0..100 -> z0..z200 standard ABB zone radii
  const z = Math.round(t.value * 2)
  if (z <= 2) return 'z0'
  if (z <= 7) return 'z5'
  if (z <= 15) return 'z10'
  if (z <= 25) return 'z20'
  if (z <= 40) return 'z30'
  if (z <= 65) return 'z50'
  if (z <= 90) return 'z80'
  if (z <= 125) return 'z100'
  if (z <= 170) return 'z150'
  return 'z200'
}

function abbSpeedFromPercent(pct: number): string {
  const mm = Math.max(100, Math.round((pct / 100) * 2000))
  return `v${mm}`
}

function yaskawaPL(t: TerminationMode): string {
  if (t.kind === 'FINE') return 'PL=0'
  const pl = Math.max(1, Math.min(8, Math.round((t.value / 100) * 8)))
  return `PL=${pl}`
}

function urBlendMeters(t: TerminationMode): string {
  if (t.kind === 'FINE') return '0.000'
  return ((t.value / 100) * 0.14).toFixed(3)
}

/**
 * Formats a single canonical ProgramInstruction into the requested OEM syntax.
 * Maintains strict 1-to-1 instruction index correspondence for live multi-OEM cross-highlighting.
 */
export function formatInstruction(
  inst: ProgramInstruction,
  dialect: OemDialect,
  positions: Record<number, PositionRegister>,
  lineNumber: number,
): string {
  const posName =
    inst.type === 'MOVE_J' || inst.type === 'MOVE_L'
      ? getPosLabel(positions, inst.targetId, inst.isPR)
      : ''

  switch (dialect) {
    case 'FANUC': {
      const prefix = `${String(lineNumber).padStart(2, ' ')}:`
      switch (inst.type) {
        case 'MOVE_J': {
          const ref = inst.isPR ? `PR[${inst.targetId}:${posName}]` : `P[${inst.targetId}:${posName}]`
          const voff = inst.vOffsetReg ? ` VOFFSET,VR[${inst.vOffsetReg}]` : ''
          return `${prefix} J ${ref} ${Math.round(inst.speedPercent)}% ${fanucTerm(inst.termination)}${voff} ;`
        }
        case 'MOVE_L': {
          const ref = inst.isPR ? `PR[${inst.targetId}:${posName}]` : `P[${inst.targetId}:${posName}]`
          const voff = inst.vOffsetReg ? ` VOFFSET,VR[${inst.vOffsetReg}]` : ''
          return `${prefix} L ${ref} ${Math.round(inst.speedMmPerSec)}mm/sec ${fanucTerm(inst.termination)}${voff} ;`
        }
        case 'SET_DO':
          return `${prefix} DO[${inst.index}:${getDoSymbol(inst.index)}]=${inst.value ? 'ON' : 'OFF'} ;`
        case 'WAIT_DI': {
          const tOut = inst.timeoutSec ? ` TIMEOUT,LBL[99]` : ''
          return `${prefix} WAIT DI[${inst.index}:${getDiSymbol(inst.index)}]=${inst.value ? 'ON' : 'OFF'}${tOut} ;`
        }
        case 'WAIT_TIME':
          return `${prefix} WAIT ${inst.seconds.toFixed(2)}(sec) ;`
        case 'LABEL':
          return `${prefix} LBL[${inst.labelId}] ;`
        case 'JUMP':
          return `${prefix} JMP LBL[${inst.labelId}] ;`
        case 'IF_DI_JUMP':
          return `${prefix} IF DI[${inst.index}]=${inst.value ? 'ON' : 'OFF'},JMP LBL[${inst.labelId}] ;`
        case 'CALL_GRIPPER':
          return `${prefix} CALL ${inst.action === 'CLOSE' ? 'GRIP_CLOSE' : 'GRIP_OPEN'} ;`
        case 'VISION_CAPTURE':
          return `${prefix} VISION GET_OFFSET '${inst.modelName}' VR[${inst.vrIndex}] ;`
        case 'COMMENT':
          return `${prefix} ! ${inst.text} ;`
      }
      break
    }

    case 'ABB': {
      switch (inst.type) {
        case 'MOVE_J': {
          const target = inst.vOffsetReg ? `Offs(p${inst.targetId}_${posName}, vr${inst.vOffsetReg}.x, vr${inst.vOffsetReg}.y, 0)` : `p${inst.targetId}_${posName}`
          return `  MoveJ ${target}, ${abbSpeedFromPercent(inst.speedPercent)}, ${abbZone(inst.termination)}, toolActive\\WObj:=wobjCell;`
        }
        case 'MOVE_L': {
          const target = inst.vOffsetReg ? `Offs(p${inst.targetId}_${posName}, vr${inst.vOffsetReg}.x, vr${inst.vOffsetReg}.y, 0)` : `p${inst.targetId}_${posName}`
          return `  MoveL ${target}, v${Math.round(inst.speedMmPerSec)}, ${abbZone(inst.termination)}, toolActive\\WObj:=wobjCell;`
        }
        case 'SET_DO':
          return `  SetDO do${inst.index}_${getDoSymbol(inst.index)}, ${inst.value ? 1 : 0};`
        case 'WAIT_DI':
          return `  WaitDI di${inst.index}_${getDiSymbol(inst.index)}, ${inst.value ? 1 : 0}${inst.timeoutSec ? `\\MaxTime:=${inst.timeoutSec}` : ''};`
        case 'WAIT_TIME':
          return `  WaitTime ${inst.seconds.toFixed(2)};`
        case 'LABEL':
          return `  LBL_${inst.labelId}:`
        case 'JUMP':
          return `  GOTO LBL_${inst.labelId};`
        case 'IF_DI_JUMP':
          return `  IF di${inst.index}=${inst.value ? 1 : 0} GOTO LBL_${inst.labelId};`
        case 'CALL_GRIPPER':
          return `  ${inst.action === 'CLOSE' ? 'GripperClose' : 'GripperOpen'}; ! DO[1] + DI[4/5]`
        case 'VISION_CAPTURE':
          return `  CamReqImage cam1; CamGetResult cam1, vr${inst.vrIndex}; ! ${inst.modelName}`
        case 'COMMENT':
          return `  ! ${inst.text}`
      }
      break
    }

    case 'KUKA': {
      switch (inst.type) {
        case 'MOVE_J': {
          const approx = inst.termination.kind === 'CNT' ? ` C_PTP ; CNT${Math.round(inst.termination.value)}` : ''
          const voff = inst.vOffsetReg ? ` : VR_${inst.vOffsetReg}` : ''
          return `  PTP XP${inst.targetId}_${posName}${voff}${approx} ; VEL=${Math.round(inst.speedPercent)}%`
        }
        case 'MOVE_L': {
          const approx = inst.termination.kind === 'CNT' ? ` C_DIS ; CNT${Math.round(inst.termination.value)}` : ''
          const voff = inst.vOffsetReg ? ` : VR_${inst.vOffsetReg}` : ''
          return `  LIN XP${inst.targetId}_${posName}${voff}${approx} ; ${(inst.speedMmPerSec / 1000).toFixed(2)}m/s`
        }
        case 'SET_DO':
          return `  $OUT[${inst.index}] = ${inst.value ? 'TRUE' : 'FALSE'} ; ${getDoSymbol(inst.index)}`
        case 'WAIT_DI':
          return `  WAIT FOR $IN[${inst.index}] == ${inst.value ? 'TRUE' : 'FALSE'} ; ${getDiSymbol(inst.index)}`
        case 'WAIT_TIME':
          return `  WAIT SEC ${inst.seconds.toFixed(2)}`
        case 'LABEL':
          return `  LBL_${inst.labelId}:`
        case 'JUMP':
          return `  GOTO LBL_${inst.labelId}`
        case 'IF_DI_JUMP':
          return `  IF $IN[${inst.index}] == ${inst.value ? 'TRUE' : 'FALSE'} THEN GOTO LBL_${inst.labelId}`
        case 'CALL_GRIPPER':
          return `  ${inst.action === 'CLOSE' ? 'GRIP_CLOSE()' : 'GRIP_OPEN()'} ; $OUT[1] + $IN[4/5]`
        case 'VISION_CAPTURE':
          return `  VISION_GET_OFFSET("${inst.modelName}", VR_${inst.vrIndex})`
        case 'COMMENT':
          return `  ; ${inst.text}`
      }
      break
    }

    case 'YASKAWA': {
      switch (inst.type) {
        case 'MOVE_J': {
          const voff = inst.vOffsetReg ? ` SFTON P00${inst.vOffsetReg}` : ''
          return `MOVJ P00${inst.targetId} VJ=${inst.speedPercent.toFixed(1)} ${yaskawaPL(inst.termination)}${voff} //${posName}`
        }
        case 'MOVE_L': {
          const voff = inst.vOffsetReg ? ` SFTON P00${inst.vOffsetReg}` : ''
          return `MOVL P00${inst.targetId} V=${inst.speedMmPerSec.toFixed(1)} ${yaskawaPL(inst.termination)}${voff} //${posName}`
        }
        case 'SET_DO':
          return `DOUT OT#(${inst.index}) ${inst.value ? 'ON' : 'OFF'} //${getDoSymbol(inst.index)}`
        case 'WAIT_DI':
          return `WAIT IN#(${inst.index})=${inst.value ? 'ON' : 'OFF'}${inst.timeoutSec ? ` T=${inst.timeoutSec.toFixed(1)}` : ''}`
        case 'WAIT_TIME':
          return `TIMER T=${inst.seconds.toFixed(2)}`
        case 'LABEL':
          return `*LBL_${inst.labelId}`
        case 'JUMP':
          return `JUMP *LBL_${inst.labelId}`
        case 'IF_DI_JUMP':
          return `JUMP *LBL_${inst.labelId} IF IN#(${inst.index})=${inst.value ? 'ON' : 'OFF'}`
        case 'CALL_GRIPPER':
          return `CALL JOB:${inst.action === 'CLOSE' ? 'GRIP_CLOSE' : 'GRIP_OPEN'}`
        case 'VISION_CAPTURE':
          return `CALL JOB:VIS_OFFSET ARGF${inst.vrIndex} //'${inst.modelName}'`
        case 'COMMENT':
          return `' ${inst.text}`
      }
      break
    }

    case 'UR': {
      switch (inst.type) {
        case 'MOVE_J': {
          const target = inst.vOffsetReg ? `pose_trans(p${inst.targetId}_${posName}, vr_${inst.vOffsetReg})` : `p${inst.targetId}_${posName}`
          const velRad = ((inst.speedPercent / 100) * 3.14).toFixed(2)
          return `  movej(${target}, a=1.4, v=${velRad}, r=${urBlendMeters(inst.termination)})`
        }
        case 'MOVE_L': {
          const target = inst.vOffsetReg ? `pose_trans(p${inst.targetId}_${posName}, vr_${inst.vOffsetReg})` : `p${inst.targetId}_${posName}`
          const velMs = (inst.speedMmPerSec / 1000).toFixed(2)
          return `  movel(${target}, a=1.2, v=${velMs}, r=${urBlendMeters(inst.termination)})`
        }
        case 'SET_DO':
          return `  set_standard_digital_out(${inst.index - 1}, ${inst.value ? 'True' : 'False'}) # DO[${inst.index}]`
        case 'WAIT_DI':
          return `  while (get_standard_digital_in(${inst.index - 1}) != ${inst.value ? 'True' : 'False'}): sync() end # DI[${inst.index}]`
        case 'WAIT_TIME':
          return `  sleep(${inst.seconds.toFixed(2)})`
        case 'LABEL':
          return `  # label LBL_${inst.labelId}`
        case 'JUMP':
          return `  # goto LBL_${inst.labelId}`
        case 'IF_DI_JUMP':
          return `  if get_standard_digital_in(${inst.index - 1}) == ${inst.value ? 'True' : 'False'}: # goto LBL_${inst.labelId}`
        case 'CALL_GRIPPER':
          return `  ${inst.action === 'CLOSE' ? 'gripper_close()' : 'gripper_open()'} # DO[1] + DI[4/5]`
        case 'VISION_CAPTURE':
          return `  vr_${inst.vrIndex} = vision_get_offset("${inst.modelName}")`
        case 'COMMENT':
          return `  # ${inst.text}`
      }
      break
    }
  }
  return ''
}

export function formatProgram(
  instructions: readonly ProgramInstruction[],
  dialect: OemDialect,
  positions: Record<number, PositionRegister>,
): string[] {
  return instructions.map((inst, idx) => formatInstruction(inst, dialect, positions, idx + 1))
}

export function getDialectHeaderFooter(
  programName: string,
  dialect: OemDialect,
): { header: string[]; footer: string[] } {
  switch (dialect) {
    case 'FANUC':
      return {
        header: [`/PROG  ${programName}`, `/MN`],
        footer: [`/POS`, `/END`],
      }
    case 'ABB':
      return {
        header: [`MODULE ${programName}`, `  PROC main()`],
        footer: [`  ENDPROC`, `ENDMODULE`],
      }
    case 'KUKA':
      return {
        header: [`DEF ${programName}()`, `  BAS(#INITMOV, 0)`],
        footer: [`END`],
      }
    case 'YASKAWA':
      return {
        header: [`/JOB`, `//NAME ${programName}`, `NOP`],
        footer: [`END`],
      }
    case 'UR':
      return {
        header: [`def ${programName.toLowerCase()}():`],
        footer: [`end`],
      }
  }
}
