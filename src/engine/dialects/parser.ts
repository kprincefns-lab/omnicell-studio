import type { DigitalSignalIndex, VisionRegisterIndex } from '../fieldbus/types'
import type { ParseResult, ProgramInstruction, TerminationMode } from './types'

function toSignalIndex(n: number): DigitalSignalIndex {
  return Math.max(1, Math.min(16, Math.round(n))) as DigitalSignalIndex
}

function toVrIndex(n: number): VisionRegisterIndex {
  return Math.max(1, Math.min(4, Math.round(n))) as VisionRegisterIndex
}

function parseTermination(token: string): TerminationMode {
  const upper = token.toUpperCase()
  if (upper.includes('FINE')) return { kind: 'FINE' }
  const cntMatch = upper.match(/CNT\s*(\d+)/)
  if (cntMatch) {
    return { kind: 'CNT', value: Math.max(0, Math.min(100, Number(cntMatch[1]))) }
  }
  const abbZ = upper.match(/\bZ(\d+)\b/)
  if (abbZ) {
    const zVal = Number(abbZ[1])
    if (zVal === 0) return { kind: 'CNT', value: 0 }
    return { kind: 'CNT', value: Math.max(0, Math.min(100, Math.round(zVal / 2))) }
  }
  const plMatch = upper.match(/PL\s*=\s*(\d)/)
  if (plMatch) {
    const pl = Number(plMatch[1])
    return pl === 0 ? { kind: 'FINE' } : { kind: 'CNT', value: Math.round((pl / 8) * 100) }
  }
  if (upper.includes('C_DIS') || upper.includes('C_PTP')) {
    return { kind: 'CNT', value: 65 }
  }
  const urR = token.match(/r\s*=\s*([0-9.]+)/i)
  if (urR) {
    const r = Number(urR[1])
    return r <= 0.001 ? { kind: 'FINE' } : { kind: 'CNT', value: Math.max(1, Math.min(100, Math.round((r / 0.14) * 100))) }
  }
  return { kind: 'FINE' }
}

/**
 * Safe client-side parser supporting FANUC TP (primary) as well as quick edits
 * pasted or typed in ABB RAPID, KUKA KRL, Yaskawa INFORM, or URScript.
 */
export function parseProgramText(source: string): ParseResult {
  const rawLines = source.split(/\r?\n/)
  const instructions: ProgramInstruction[] = []
  const errors: Array<{ line: number; message: string }> = []

  rawLines.forEach((rawLine, idx) => {
    const lineNo = idx + 1
    // Strip optional FANUC line numbering " 1:"
    const line = rawLine.trim().replace(/^\d+\s*:\s*/, '').replace(/;\s*$/, '').trim()
    if (!line) return

    // Skip module headers/footers if user pasted full file
    if (
      /^(\/PROG|\/MN|\/POS|\/END|\/JOB|\/\/NAME|NOP|END$|MODULE\b|ENDMODULE|PROC\b|ENDPROC|DEF\b|BAS\(|def\b.*:$|end$)/i.test(
        line,
      )
    ) {
      return
    }

    const id = `inst_${lineNo}_${instructions.length}`

    // Comments (! ... or ' ... or # ... or ; ...)
    if (/^[!'#;]/.test(line)) {
      const text = line.replace(/^[!'#;]\s*/, '')
      instructions.push({ id, type: 'COMMENT', text })
      return
    }

    // FANUC MOVE_J / MOVE_L: "J P[1:Home] 80% FINE" or "L P[2] 500mm/sec CNT50 VOFFSET,VR[1]"
    const fanucMove = line.match(
      /^(J|L)\s+(PR|P)\[(\d+)(?::[^\]]+)?\]\s+(\d+(?:\.\d+)?)\s*(%|mm\/sec|mm\/s)\s+(FINE|CNT\d+)(.*)$/i,
    )
    if (fanucMove) {
      const mode = fanucMove[1].toUpperCase()
      const isPR = fanucMove[2].toUpperCase() === 'PR'
      const targetId = Number(fanucMove[3])
      const speedVal = Number(fanucMove[4])
      const termination = parseTermination(fanucMove[6])
      const tail = fanucMove[7] ?? ''
      const voffMatch = tail.match(/VR\[(\d+)\]/i)
      const vOffsetReg = voffMatch ? toVrIndex(Number(voffMatch[1])) : undefined

      if (mode === 'J') {
        instructions.push({
          id,
          type: 'MOVE_J',
          targetId,
          isPR,
          speedPercent: Math.max(1, Math.min(100, speedVal)),
          termination,
          vOffsetReg,
        })
      } else {
        instructions.push({
          id,
          type: 'MOVE_L',
          targetId,
          isPR,
          speedMmPerSec: Math.max(10, Math.min(2000, speedVal)),
          termination,
          vOffsetReg,
        })
      }
      return
    }

    // ABB RAPID MoveJ / MoveL
    const abbMove = line.match(/^(MoveJ|MoveL)\s+(?:Offs\()?p(\d+)\w*[^,]*,\s*v(\d+)\s*,\s*(fine|z\d+)/i)
    if (abbMove) {
      const isL = abbMove[1].toUpperCase() === 'MOVEL'
      const targetId = Number(abbMove[2])
      const vNum = Number(abbMove[3])
      const termination = parseTermination(abbMove[4])
      const vrMatch = line.match(/vr(\d+)/i)
      const vOffsetReg = vrMatch ? toVrIndex(Number(vrMatch[1])) : undefined
      if (isL) {
        instructions.push({
          id,
          type: 'MOVE_L',
          targetId,
          speedMmPerSec: Math.max(10, Math.min(2000, vNum)),
          termination,
          vOffsetReg,
        })
      } else {
        instructions.push({
          id,
          type: 'MOVE_J',
          targetId,
          speedPercent: Math.max(5, Math.min(100, Math.round((vNum / 2000) * 100))),
          termination,
          vOffsetReg,
        })
      }
      return
    }

    // KUKA KRL PTP / LIN
    const kukaMove = line.match(/^(PTP|LIN)\s+XP(\d+)\w*(.*)$/i)
    if (kukaMove) {
      const isL = kukaMove[1].toUpperCase() === 'LIN'
      const targetId = Number(kukaMove[2])
      const rest = kukaMove[3] ?? ''
      const termination = parseTermination(rest)
      const vrMatch = rest.match(/VR_(\d+)/i)
      const vOffsetReg = vrMatch ? toVrIndex(Number(vrMatch[1])) : undefined
      const velPct = rest.match(/VEL=(\d+)%/i)
      const velMs = rest.match(/([0-9.]+)m\/s/i)
      if (isL) {
        instructions.push({
          id,
          type: 'MOVE_L',
          targetId,
          speedMmPerSec: velMs ? Math.round(Number(velMs[1]) * 1000) : 600,
          termination,
          vOffsetReg,
        })
      } else {
        instructions.push({
          id,
          type: 'MOVE_J',
          targetId,
          speedPercent: velPct ? Number(velPct[1]) : 80,
          termination,
          vOffsetReg,
        })
      }
      return
    }

    // FANUC / generic SET_DO
    const fanucDo = line.match(/^DO\[(\d+)(?::[^\]]+)?\]\s*=\s*(ON|OFF|1|0)/i)
    if (fanucDo) {
      instructions.push({
        id,
        type: 'SET_DO',
        index: toSignalIndex(Number(fanucDo[1])),
        value: fanucDo[2].toUpperCase() === 'ON' || fanucDo[2] === '1',
      })
      return
    }

    // ABB SetDO / KUKA $OUT
    const otherDo = line.match(/^(?:SetDO\s+do(\d+)\w*\s*,\s*(1|0)|\$OUT\[(\d+)\]\s*=\s*(TRUE|FALSE))/i)
    if (otherDo) {
      const idxNum = Number(otherDo[1] ?? otherDo[3])
      const valStr = (otherDo[2] ?? otherDo[4]).toUpperCase()
      instructions.push({
        id,
        type: 'SET_DO',
        index: toSignalIndex(idxNum),
        value: valStr === '1' || valStr === 'TRUE',
      })
      return
    }

    // WAIT DI
    const waitDi = line.match(
      /^WAIT\s+DI\[(\d+)(?::[^\]]+)?\]\s*=\s*(ON|OFF|1|0)(.*)$/i,
    )
    if (waitDi) {
      const hasTimeout = /TIMEOUT/i.test(waitDi[3] ?? '')
      instructions.push({
        id,
        type: 'WAIT_DI',
        index: toSignalIndex(Number(waitDi[1])),
        value: waitDi[2].toUpperCase() === 'ON' || waitDi[2] === '1',
        timeoutSec: hasTimeout ? 4.0 : undefined,
      })
      return
    }

    // WAIT TIME
    const waitTime = line.match(/^(?:WAIT\s+([0-9.]+)\s*\(sec\)|WaitTime\s+([0-9.]+)|WAIT\s+SEC\s+([0-9.]+)|sleep\(([0-9.]+)\))/i)
    if (waitTime) {
      const sec = Number(waitTime[1] ?? waitTime[2] ?? waitTime[3] ?? waitTime[4])
      instructions.push({ id, type: 'WAIT_TIME', seconds: Math.max(0.05, Math.min(10, sec)) })
      return
    }

    // CALL GRIPPER
    const gripCall = line.match(/^(?:CALL\s+)?(GRIP_CLOSE|GRIP_OPEN|GripperClose|GripperOpen|gripper_close|gripper_open)/i)
    if (gripCall) {
      instructions.push({
        id,
        type: 'CALL_GRIPPER',
        action: gripCall[1].toUpperCase().includes('CLOSE') ? 'CLOSE' : 'OPEN',
      })
      return
    }

    // VISION GET_OFFSET / RUN_FIND
    const visMatch = line.match(/^VISION\s+(?:GET_OFFSET|RUN_FIND)\s+'([^']+)'(?:\s+VR\[(\d+)\])?/i)
    if (visMatch) {
      instructions.push({
        id,
        type: 'VISION_CAPTURE',
        modelName: visMatch[1],
        vrIndex: toVrIndex(Number(visMatch[2] ?? 1)),
      })
      return
    }

    // LABEL
    const lblMatch = line.match(/^(?:LBL\[(\d+)\]|LBL_(\d+):|\*LBL_(\d+))/i)
    if (lblMatch) {
      instructions.push({
        id,
        type: 'LABEL',
        labelId: Number(lblMatch[1] ?? lblMatch[2] ?? lblMatch[3]),
      })
      return
    }

    // IF DI JMP
    const ifJmp = line.match(/^IF\s+DI\[(\d+)(?::[^\]]+)?\]\s*=\s*(ON|OFF)\s*,\s*JMP\s+LBL\[(\d+)\]/i)
    if (ifJmp) {
      instructions.push({
        id,
        type: 'IF_DI_JUMP',
        index: toSignalIndex(Number(ifJmp[1])),
        value: ifJmp[2].toUpperCase() === 'ON',
        labelId: Number(ifJmp[3]),
      })
      return
    }

    // JMP LBL
    const jmpMatch = line.match(/^(?:JMP\s+LBL\[(\d+)\]|GOTO\s+LBL_(\d+)|JUMP\s+\*LBL_(\d+))/i)
    if (jmpMatch) {
      instructions.push({
        id,
        type: 'JUMP',
        labelId: Number(jmpMatch[1] ?? jmpMatch[2] ?? jmpMatch[3]),
      })
      return
    }

    errors.push({
      line: lineNo,
      message: `Unrecognized instruction syntax: "${rawLine.trim()}"`,
    })
  })

  return {
    success: errors.length === 0,
    instructions,
    errors,
  }
}
