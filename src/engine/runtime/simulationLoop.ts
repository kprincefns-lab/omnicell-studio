import { useFieldbusStore } from '../fieldbus/fieldbusStore'
import { computeFK, DEFAULT_USER_FRAME } from '../kinematics/fk'
import { applyCartesianJog, solveIKFromPose } from '../kinematics/ik'
import { clamp, mat4GetTranslation, vec3Dist, vec3Lerp } from '../kinematics/math3d'
import { computeSegmentDurationSec, evaluateSegmentAt, resolveTargetPosition, smoothEase } from '../kinematics/planner'
import { checkSafetyZones } from '../kinematics/safetyZones'
import { evaluateSingularity } from '../kinematics/singularity'
import { OMNI_ROBOT_SPEC, type JointAngles, type ToolFrame, type Vec3 } from '../kinematics/types'
import { SCENARIOS } from '../scenarios/definitions'
import { usePlcStore } from '../plc/plcStore'
import { robotRuntime, useRobotStore } from '../store/robotStore'

let plcScanAccumSec = 0

function pushTrailPoint(pt: Vec3): void {
  const trail = robotRuntime.tcpTrail
  if (trail.length === 0 || vec3Dist(trail[trail.length - 1], pt) > 8) {
    trail.push([pt[0], pt[1], pt[2]])
    if (trail.length > 360) {
      trail.shift()
    }
  }
}

function getPhysicalTorchTipWorld(joints: JointAngles): Vec3 {
  const sc = SCENARIOS.scenario1
  const off = sc.physicalToolOffsetMm ?? [70, 0, 230]
  const physicalTool: ToolFrame = {
    id: 99,
    name: 'PhysicalTorch',
    x: off[0],
    y: off[1],
    z: off[2],
    w: 0,
    p: 0,
    r: 0,
    endEffectorType: 'torch',
  }
  const fk = computeFK(joints, physicalTool, DEFAULT_USER_FRAME)
  return mat4GetTranslation(fk.frames.tcp)
}

/**
 * Deterministic 60Hz simulation tick driven inside R3F useFrame().
 * Updates mutable `robotRuntime` without triggering React re-renders per frame;
 * syncs UI telemetry at ~12 Hz and runs PLC Ladder Logic scan at 20 Hz when armed.
 */
export function tickSimulation(rawDeltaSec: number): void {
  const dt = Math.min(rawDeltaSec, 0.05) // Clamp dt on tab background resume
  const store = useRobotStore.getState()
  const fieldbus = useFieldbusStore.getState()
  const prevJoints: JointAngles = [...robotRuntime.joints] as JointAngles

  // 0. Live PLC Ladder Logic Scan Engine (20 Hz fixed step)
  const plc = usePlcStore.getState()
  if (plc.plcRunning) {
    plcScanAccumSec += dt
    if (plcScanAccumSec >= 0.05) {
      plc.stepPlcScan(plcScanAccumSec)
      plcScanAccumSec = 0
    }
  } else {
    plcScanAccumSec = 0
  }

  // 1. 1Hz Fieldbus Watchdog Heartbeat (DI[16] & DO[16])
  robotRuntime.heartbeatAccumSec += dt
  if (robotRuntime.heartbeatAccumSec >= 0.5) {
    robotRuntime.heartbeatAccumSec = 0
    fieldbus.setDI(16, !fieldbus.di[16], 'PLC_SIM')
    fieldbus.setDO(16, !fieldbus.do[16], 'ROBOT')
    fieldbus.incrementScan()
  }

  // 2. Decay overhead 2D vision flash
  if (robotRuntime.cellObjects.visionFlashAlpha > 0) {
    robotRuntime.cellObjects.visionFlashAlpha = Math.max(0, robotRuntime.cellObjects.visionFlashAlpha - dt * 1.4)
  }

  // 3. Simulated PLC Handshake Responder (Scenario 2 & Scenario 4)
  if (fieldbus.autoPlcHandshake) {
    // Animate gripper jaws smoothly
    const targetOpen = fieldbus.do[1] ? 0 : 1
    const currOpen = robotRuntime.cellObjects.gripperOpenFraction
    robotRuntime.cellObjects.gripperOpenFraction =
      currOpen + (targetOpen - currOpen) * Math.min(1, dt * 14)

    // Reed switch confirmation delay
    if (robotRuntime.gripperPlcDelaySec !== null) {
      robotRuntime.gripperPlcDelaySec -= dt
      if (robotRuntime.gripperPlcDelaySec <= 0) {
        robotRuntime.gripperPlcDelaySec = null
        if (fieldbus.do[1]) {
          // Closing gripper
          fieldbus.setDI(5, false, 'PLC_SIM')
          if (!fieldbus.faultSuppressGripperClosedReed) {
            fieldbus.setDI(4, true, 'PLC_SIM')
          }
        } else {
          // Opening gripper
          fieldbus.setDI(4, false, 'PLC_SIM')
          fieldbus.setDI(5, true, 'PLC_SIM')
        }
      }
    }

    // CNC Door & Machining Cycle (Scenario 4)
    if (store.scenarioId === 'scenario4') {
      if (fieldbus.faultCncDoorStuckClosed) {
        robotRuntime.cellObjects.cncDoorOpenFraction = Math.max(
          0,
          robotRuntime.cellObjects.cncDoorOpenFraction - dt * 3.5,
        )
        fieldbus.setDI(2, false, 'PLC_SIM')
      } else if (fieldbus.do[2] && robotRuntime.cellObjects.cncMachiningRemainingSec <= 0) {
        // Start simulated CNC clamp + close door + spindle run
        robotRuntime.cellObjects.cncMachiningRemainingSec = 2.1
        fieldbus.setDI(2, false, 'PLC_SIM')
        fieldbus.setDI(3, false, 'PLC_SIM')
        fieldbus.setDI(14, false, 'PLC_SIM')
      }

      if (robotRuntime.cellObjects.cncMachiningRemainingSec > 0) {
        robotRuntime.cellObjects.cncMachiningRemainingSec -= dt
        robotRuntime.cellObjects.cncDoorOpenFraction = Math.max(
          0,
          robotRuntime.cellObjects.cncDoorOpenFraction - dt * 3.0,
        )
        if (robotRuntime.cellObjects.cncMachiningRemainingSec <= 0) {
          fieldbus.setDI(2, true, 'PLC_SIM')
          fieldbus.setDI(3, true, 'PLC_SIM')
          fieldbus.setDI(14, true, 'PLC_SIM')
        }
      } else if (!fieldbus.faultCncDoorStuckClosed) {
        const targetDoor = fieldbus.di[2] ? 1 : 0
        robotRuntime.cellObjects.cncDoorOpenFraction +=
          (targetDoor - robotRuntime.cellObjects.cncDoorOpenFraction) * Math.min(1, dt * 4)
      }
    }
  }

  // 4. Manual Virtual Teach Pendant Jogging (T1 / T2 with Deadman enabled)
  const hasJogInput = robotRuntime.jogInput.some((v) => Math.abs(v) > 0.01)
  if (
    hasJogInput &&
    !robotRuntime.execState.running &&
    !store.estopActive &&
    store.deadmanEnabled &&
    (store.controllerMode === 'T1' || store.controllerMode === 'T2') &&
    (!store.activeFault || store.activeFault.type === 'SRVO_062_BZAL' || store.activeFault.type === 'SRVO_050_COLLISION_OVERTORQUE')
  ) {
    const modeCap = store.controllerMode === 'T1' ? 0.28 : 0.85
    const speedScale = (store.speedOverridePct / 100) * modeCap
    const jIn = robotRuntime.jogInput

    let candidateJoints: JointAngles = [...robotRuntime.joints] as JointAngles
    let ikOk = true

    if (store.coordinateFrame === 'JOINT') {
      for (let i = 0; i < 6; i++) {
        const degDelta = jIn[i] * 78 * speedScale * dt
        candidateJoints[i] = clamp(
          candidateJoints[i] + degDelta,
          OMNI_ROBOT_SPEC.jointMin[i],
          OMNI_ROBOT_SPEC.jointMax[i],
        )
      }
    } else {
      const linDeltaMm = 320 * speedScale * dt
      const rotDeltaDeg = 55 * speedScale * dt
      const res = applyCartesianJog(
        robotRuntime.fk.frames.tcp,
        robotRuntime.joints,
        store.coordinateFrame,
        {
          x: jIn[0] * linDeltaMm,
          y: jIn[1] * linDeltaMm,
          z: jIn[2] * linDeltaMm,
          w: jIn[3] * rotDeltaDeg,
          p: jIn[4] * rotDeltaDeg,
          r: jIn[5] * rotDeltaDeg,
        },
        store.tool,
        store.userFrame,
      )
      if (res.reachable) {
        candidateJoints = res.joints
      } else {
        ikOk = false
      }
    }

    if (ikOk) {
      const candidateFk = computeFK(candidateJoints, store.tool, store.userFrame)
      // Allow backing OUT of a collision fault in T1 mode; enforce DCS/obstacles otherwise
      const safety = checkSafetyZones(candidateFk, store.safetyZones)
      const currentSafety = checkSafetyZones(robotRuntime.fk, store.safetyZones)
      const movingFurtherIn = !safety.safe && safety.minClearanceMm <= currentSafety.minClearanceMm

      if (!safety.safe && movingFurtherIn && safety.violatedZone) {
        if (safety.violatedZone.kind === 'DCS_FORBIDDEN') {
          store.triggerFault('SYST_212_DCS_VIOLATION', safety.violatedZone.faultMessage)
        } else {
          store.triggerFault('SYST_304_OBSTACLE_COLLISION', safety.violatedZone.faultMessage)
        }
      } else {
        robotRuntime.joints = candidateJoints
        robotRuntime.fk = candidateFk
        robotRuntime.singularity = evaluateSingularity(candidateJoints)

        // Scenario 1: Track TCP rotation invariance in TOOL mode when rotating W/P/R
        if (
          store.scenarioId === 'scenario1' &&
          store.coordinateFrame === 'TOOL' &&
          store.tcpCalResult?.success &&
          (Math.abs(jIn[3]) > 0.01 || Math.abs(jIn[4]) > 0.01 || Math.abs(jIn[5]) > 0.01)
        ) {
          const tip = getPhysicalTorchTipWorld(candidateJoints)
          const tracker = robotRuntime.tcpRotationTracker
          if (!tracker.initialTipPos) {
            tracker.initialTipPos = tip
            tracker.accumulatedRotDeg = 0
            tracker.maxDriftMm = 0
          } else {
            const drift = vec3Dist(tip, tracker.initialTipPos)
            tracker.maxDriftMm = Math.max(tracker.maxDriftMm, drift)
            const rotStep = Math.hypot(jIn[3], jIn[4], jIn[5]) * 55 * speedScale * dt
            tracker.accumulatedRotDeg += rotStep
            if (tracker.accumulatedRotDeg >= 10 && tracker.maxDriftMm < 1.5) {
              const tel = store.telemetryByScenario.scenario1
              if (!tel.tcpRotationVerified) {
                store.updateTelemetry((p) => ({ ...p, tcpRotationVerified: true }))
              }
            }
          }
        }
      }
    }
  }

  // 5. Automated / Step Program Execution
  const ex = robotRuntime.execState
  if (ex.running && !ex.paused && !store.activeFault && !store.estopActive) {
    // Check remote PLC Hold DI[15]
    if (fieldbus.di[15]) {
      store.holdProgram()
    } else {
      ex.cycleElapsedSec += dt
      stepProgramExecutor(dt)
    }
  }

  // 6. Compute instantaneous joint velocities (deg/s)
  for (let i = 0; i < 6; i++) {
    robotRuntime.jointVelocities[i] = dt > 1e-4 ? (robotRuntime.joints[i] - prevJoints[i]) / dt : 0
  }

  // 7. Update held workpiece attachment
  if (robotRuntime.cellObjects.holdingPart) {
    const tcp = robotRuntime.fk.tcpWorldPose
    robotRuntime.cellObjects.partWorldPos = [tcp.x, tcp.y, tcp.z - 32]
    robotRuntime.cellObjects.partRotZDeg = tcp.r
  }

  // 8. Throttled HUD telemetry sync (~12 Hz)
  robotRuntime.hudSyncAccumSec += dt
  if (robotRuntime.hudSyncAccumSec >= 0.08) {
    robotRuntime.hudSyncAccumSec = 0
    store.syncHudFromRuntime()
  }
}

function stepProgramExecutor(dt: number): void {
  const store = useRobotStore.getState()
  const fieldbus = useFieldbusStore.getState()
  const ex = robotRuntime.execState
  const instructions = store.instructions

  // Advance non-blocking instructions until we hit a motion, wait, or end of program
  let safetyCounter = 0
  while (ex.phase === 'IDLE' && safetyCounter < 12) {
    safetyCounter++
    if (ex.instructionIndex >= instructions.length) {
      // Program cycle completed cleanly!
      const finishedTime = ex.cycleElapsedSec
      ex.running = false
      ex.phase = 'IDLE'
      ex.instructionIndex = 0
      fieldbus.setDO(11, false)
      fieldbus.setDO(5, true)

      const curTel = store.telemetryByScenario[store.scenarioId]
      const best =
        curTel.bestCycleTimeSec === null
          ? finishedTime
          : Math.min(curTel.bestCycleTimeSec, finishedTime)

      // Scenario 3 singularity resolved check
      const resolvedSing =
        store.scenarioId === 'scenario3' &&
        store.programName === 'SINGULARITY_DEMO' &&
        finishedTime > 0.5

      store.updateTelemetry((p) => ({
        ...p,
        lastCycleTimeSec: finishedTime,
        bestCycleTimeSec: best,
        blendEfficiencyPct: store.pathPreview.blendEfficiencyPct,
        completedCycles: p.completedCycles + 1,
        singularityResolved: p.singularityResolved || resolvedSing,
      }))

      // Scenario 4: Prepare next randomized billet after cycle
      if (store.scenarioId === 'scenario4') {
        store.randomizeBillet()
      }

      useRobotStore.setState({ isRunning: false, isPaused: false, activeLineIndex: 0 })
      return
    }

    const inst = instructions[ex.instructionIndex]

    if (inst.type === 'COMMENT' || inst.type === 'LABEL') {
      ex.instructionIndex++
      continue
    }

    if (inst.type === 'SET_DO') {
      fieldbus.setDO(inst.index, inst.value, 'ROBOT')
      ex.instructionIndex++
      if (ex.stepStopAfterCurrent) {
        pauseForStep()
        return
      }
      continue
    }

    if (inst.type === 'JUMP') {
      const targetIdx = instructions.findIndex(
        (item) => item.type === 'LABEL' && item.labelId === inst.labelId,
      )
      ex.loopGuard++
      if (targetIdx >= 0 && ex.loopGuard < 40) {
        ex.instructionIndex = targetIdx + 1
      } else {
        ex.instructionIndex++
      }
      continue
    }

    if (inst.type === 'IF_DI_JUMP') {
      if (fieldbus.di[inst.index] === inst.value) {
        const targetIdx = instructions.findIndex(
          (item) => item.type === 'LABEL' && item.labelId === inst.labelId,
        )
        if (targetIdx >= 0) {
          ex.instructionIndex = targetIdx + 1
          continue
        }
      }
      ex.instructionIndex++
      continue
    }

    if (inst.type === 'VISION_CAPTURE') {
      fieldbus.setDO(7, true, 'ROBOT')
      const off = robotRuntime.cellObjects.billetOffset
      fieldbus.setVR(inst.vrIndex, {
        x: off.x,
        y: off.y,
        z: 0,
        rx: 0,
        ry: 0,
        rz: off.rz,
        valid: true,
        timestampMs: Date.now(),
        score: Number((95.4 + Math.random() * 4.1).toFixed(1)),
      })
      fieldbus.setDI(10, true, 'VISION')
      fieldbus.setDO(7, false, 'ROBOT')
      robotRuntime.cellObjects.visionFlashAlpha = 1.0
      ex.phase = 'WAITING_TIME'
      ex.waitElapsedSec = 0
      ex.segmentDurationSec = 0.25
      return
    }

    if (inst.type === 'WAIT_TIME') {
      ex.phase = 'WAITING_TIME'
      ex.waitElapsedSec = 0
      ex.segmentDurationSec = inst.seconds
      return
    }

    if (inst.type === 'WAIT_DI') {
      if (fieldbus.di[inst.index] === inst.value) {
        ex.instructionIndex++
        if (ex.stepStopAfterCurrent) {
          pauseForStep()
          return
        }
        continue
      }
      ex.phase = 'WAITING_DI'
      ex.waitElapsedSec = 0
      return
    }

    if (inst.type === 'CALL_GRIPPER') {
      const closeCmd = inst.action === 'CLOSE'
      fieldbus.setDO(1, closeCmd, 'ROBOT')
      robotRuntime.gripperPlcDelaySec = 0.16
      ex.gripperTargetAction = inst.action
      ex.phase = 'GRIPPER_WAIT'
      ex.waitElapsedSec = 0
      return
    }

    if (inst.type === 'MOVE_J' || inst.type === 'MOVE_L') {
      const posReg = store.positions[inst.targetId]
      if (!posReg) {
        store.triggerFault('MOTN_018_UNREACHABLE', `Undefined position register P[${inst.targetId}]`)
        return
      }
      const resolved = resolveTargetPosition(
        posReg,
        robotRuntime.joints,
        store.tool,
        fieldbus.vr,
        inst.vOffsetReg,
      )
      if (!resolved.reachable) {
        store.triggerFault('MOTN_018_UNREACHABLE', resolved.errorMessage)
        return
      }

      const speedVal = inst.type === 'MOVE_J' ? inst.speedPercent : inst.speedMmPerSec
      const segDur = computeSegmentDurationSec(
        inst.type,
        robotRuntime.joints,
        resolved.joints,
        robotRuntime.fk.frames.tcp,
        resolved.tcpMat,
        speedVal,
        store.speedOverridePct,
      )

      // Check if next executable instruction is also a motion move (for CNT corner blending)
      let nextTcpPos: Vec3 | null = null
      let canBlend = false
      if (inst.termination.kind === 'CNT' && inst.termination.value > 0 && !ex.stepStopAfterCurrent) {
        for (let k = ex.instructionIndex + 1; k < instructions.length; k++) {
          const nxt = instructions[k]
          if (nxt.type === 'COMMENT' || nxt.type === 'LABEL') continue
          if (nxt.type === 'MOVE_J' || nxt.type === 'MOVE_L') {
            const nxtPos = store.positions[nxt.targetId]
            if (nxtPos) {
              const resNext = resolveTargetPosition(nxtPos, resolved.joints, store.tool, fieldbus.vr, nxt.vOffsetReg)
              if (resNext.reachable) {
                nextTcpPos = mat4GetTranslation(resNext.tcpMat)
                canBlend = true
              }
            }
          }
          break
        }
      }

      const cntVal = inst.termination.kind === 'CNT' ? inst.termination.value : 0
      const blendOverlap = canBlend ? Math.min(segDur * 0.22, 0.22) * (cntVal / 100) : 0

      ex.phase = 'MOVING'
      ex.moveType = inst.type
      ex.startJoints = [...robotRuntime.joints] as JointAngles
      ex.endJoints = resolved.joints
      ex.startTcpMat = [...robotRuntime.fk.frames.tcp] as typeof ex.startTcpMat
      ex.endTcpMat = resolved.tcpMat
      ex.segmentElapsedSec = 0
      ex.segmentDurationSec = Math.max(0.08, segDur - blendOverlap)
      ex.fineSettleSec = canBlend ? 0 : 0.34
      ex.blendFraction = canBlend ? (cntVal / 100) * 0.44 : 0
      ex.nextTcpPos = nextTcpPos
      return
    }
  }

  // Handle active blocking phases
  if (ex.phase === 'WAITING_TIME') {
    ex.waitElapsedSec += dt
    if (ex.waitElapsedSec >= ex.segmentDurationSec) {
      ex.phase = 'IDLE'
      ex.instructionIndex++
      if (ex.stepStopAfterCurrent) pauseForStep()
    }
    return
  }

  if (ex.phase === 'WAITING_DI') {
    const inst = instructions[ex.instructionIndex]
    if (inst?.type === 'WAIT_DI') {
      if (fieldbus.di[inst.index] === inst.value) {
        ex.phase = 'IDLE'
        ex.instructionIndex++
        if (ex.stepStopAfterCurrent) pauseForStep()
        return
      }
      ex.waitElapsedSec += dt
      if (inst.timeoutSec && ex.waitElapsedSec >= inst.timeoutSec) {
        if (inst.index === 2) {
          store.triggerFault(
            'SRVO_050_COLLISION_OVERTORQUE',
            'WAIT DI[2] CNC_DoorOpen=ON timed out — CNC door interlock closed!',
          )
        } else {
          store.triggerFault(
            'IO_GRIPPER_TIMEOUT',
            `WAIT DI[${inst.index}]=${inst.value ? 'ON' : 'OFF'} timed out after ${inst.timeoutSec}s.`,
          )
        }
      }
    }
    return
  }

  if (ex.phase === 'GRIPPER_WAIT') {
    ex.waitElapsedSec += dt
    const closing = ex.gripperTargetAction === 'CLOSE'
    const confirmed = closing ? fieldbus.di[4] : fieldbus.di[5]
    if (confirmed && ex.waitElapsedSec >= 0.16) {
      // Attach or release physical part in Scenario 2 & Scenario 4
      if (closing) {
        robotRuntime.cellObjects.holdingPart = true
        fieldbus.setDO(13, true, 'ROBOT')
      } else {
        if (robotRuntime.cellObjects.holdingPart) {
          robotRuntime.cellObjects.holdingPart = false
          robotRuntime.cellObjects.placedCount++
          fieldbus.setDO(13, false, 'ROBOT')
          const tcp = robotRuntime.fk.tcpWorldPose
          robotRuntime.cellObjects.partWorldPos = [tcp.x, tcp.y, tcp.z - 38]
        }
      }
      ex.phase = 'IDLE'
      ex.instructionIndex++
      if (ex.stepStopAfterCurrent) pauseForStep()
      return
    }
    if (ex.waitElapsedSec >= 2.2) {
      store.triggerFault('IO_GRIPPER_TIMEOUT')
    }
    return
  }

  if (ex.phase === 'SETTLING') {
    ex.waitElapsedSec += dt
    if (ex.waitElapsedSec >= ex.fineSettleSec) {
      ex.phase = 'IDLE'
      ex.instructionIndex++
      if (ex.stepStopAfterCurrent) pauseForStep()
    }
    return
  }

  if (ex.phase === 'MOVING') {
    ex.segmentElapsedSec += dt
    const rawU = clamp(ex.segmentElapsedSec / ex.segmentDurationSec, 0, 1)
    // Use smooth ease for FINE stops, near-linear velocity profile for CNT continuous moves
    const u = ex.blendFraction > 0 ? rawU : smoothEase(rawU)

    const ev = evaluateSegmentAt(
      ex.moveType,
      ex.startJoints,
      ex.endJoints,
      ex.startTcpMat,
      ex.endTcpMat,
      u,
      robotRuntime.joints,
      store.tool,
    )

    if (ev.ikFailed) {
      store.triggerFault('MOTN_018_UNREACHABLE')
      return
    }

    if (ev.singularityFault) {
      store.triggerFault(
        'MOTN_023_SINGULARITY',
        `Linear move crossed wrist singularity (|J5|=${ev.minJ5Deg.toFixed(1)}°). Switch to Joint (J/MoveJ/PTP).`,
      )
      return
    }

    let nextJoints = ev.joints

    // Apply live quadratic Bezier corner blend near the end of a CNT segment!
    if (ex.blendFraction > 0 && ex.nextTcpPos && rawU > 1 - ex.blendFraction) {
      const startPos = mat4GetTranslation(ex.startTcpMat)
      const cornerPos = mat4GetTranslation(ex.endTcpMat)
      const pEntry = vec3Lerp(startPos, cornerPos, 1 - ex.blendFraction)
      const pExit = vec3Lerp(cornerPos, ex.nextTcpPos, ex.blendFraction)
      const localT = clamp((rawU - (1 - ex.blendFraction)) / ex.blendFraction, 0, 1) * 0.5
      const omt = 1 - localT
      const blendedPos: Vec3 = [
        omt * omt * pEntry[0] + 2 * omt * localT * cornerPos[0] + localT * localT * pExit[0],
        omt * omt * pEntry[1] + 2 * omt * localT * cornerPos[1] + localT * localT * pExit[1],
        omt * omt * pEntry[2] + 2 * omt * localT * cornerPos[2] + localT * localT * pExit[2],
      ]
      const endPose = computeFK(nextJoints, store.tool, store.userFrame).tcpWorldPose
      const ikBlend = solveIKFromPose(
        { ...endPose, x: blendedPos[0], y: blendedPos[1], z: blendedPos[2] },
        robotRuntime.joints,
        store.tool,
      )
      if (ikBlend.reachable) {
        nextJoints = ikBlend.joints
      }
    }

    const nextFk = computeFK(nextJoints, store.tool, store.userFrame)
    const nextSing = evaluateSingularity(nextJoints)

    if (nextSing.wristWarning && !robotRuntime.singularity.wristWarning) {
      store.updateTelemetry((p) => ({
        ...p,
        singularityWarningCount: p.singularityWarningCount + 1,
      }))
    }

    // Real-time DCS / SafeMove & Obstacle collision check BEFORE committing motion
    const safety = checkSafetyZones(nextFk, store.safetyZones)
    if (!safety.safe && safety.violatedZone) {
      if (safety.violatedZone.kind === 'DCS_FORBIDDEN') {
        store.triggerFault('SYST_212_DCS_VIOLATION', safety.violatedZone.faultMessage)
      } else if (safety.violatedZone.kind === 'CNC_DOOR') {
        store.triggerFault('SRVO_050_COLLISION_OVERTORQUE', safety.violatedZone.faultMessage)
      } else {
        store.triggerFault('SYST_304_OBSTACLE_COLLISION', safety.violatedZone.faultMessage)
      }
      return
    }

    robotRuntime.joints = nextJoints
    robotRuntime.fk = nextFk
    robotRuntime.singularity = nextSing
    pushTrailPoint(mat4GetTranslation(nextFk.frames.tcp))

    if (rawU >= 1) {
      if (ex.fineSettleSec > 0) {
        ex.phase = 'SETTLING'
        ex.waitElapsedSec = 0
      } else {
        ex.phase = 'IDLE'
        ex.instructionIndex++
        if (ex.stepStopAfterCurrent) pauseForStep()
      }
    }
  }
}

function pauseForStep(): void {
  robotRuntime.execState.running = false
  robotRuntime.execState.paused = true
  useFieldbusStore.getState().setDO(11, false)
  useRobotStore.setState({
    isRunning: false,
    isPaused: true,
    activeLineIndex: robotRuntime.execState.instructionIndex,
  })
}
