# OmniCell Studio

**Dual-Track Industrial Robotics & PLC Training Platform** — a zero-backend, browser-native TypeScript + React Three Fiber simulation environment built for industrial automation engineers, controls integrators, and robotics students.

---

## Architecture Overview

OmniCell Studio splits industrial automation training into two integrated workspaces coupled by a deterministic **Shared Virtual Fieldbus I/O Bus** (`src/engine/fieldbus/fieldbusStore.ts`):

1. **Robotics Workcell Lab (Phases 1 & 2 — Built Completely)**
   - **6-DOF Industrial Manipulator (`OMNI-R20iD/25` class, 25 kg payload, 1,831 mm reach):** Closed-form spherical-wrist Forward/Inverse Kinematics, real joint limits & velocity ceilings, swappable MIG Welding Torch and Schunk-style Pneumatic Parallel Gripper, live RGB coordinate triads, and emissive status collar.
   - **Virtual Teach Pendant:** Deadman enable switch, `T1`/`T2`/`AUTO` keyswitch, `CONT`/`STEP` execution, `5%–100%` speed override, `JOINT`/`WORLD`/`TOOL`/`USER` coordinate frames, press-and-hold jog pad + keyboard shortcuts (`Q/A`, `W/S`, `E/D`, `R/F`, `T/G`, `Y/H`), and real-time joint/Cartesian HUD.
   - **Multi-OEM Dialect Transpiler & Parser:** Canonical Intermediate Representation (`ProgramInstruction[]`) supporting live editing, stepping, and side-by-side equivalence across **FANUC TP (`.LS`)**, **ABB RAPID (`.mod`)**, **KUKA KRL (`.src`)**, **Yaskawa INFORM III (`.JBI`)**, and **URScript (`.script`)**.
   - **Real-Time Motion & Safety Engine:** `FINE` exact-stop vs. `CNT0–CNT100` quadratic corner blending with live cycle-time telemetry, Wrist/Shoulder/Elbow singularity detection (`MOTN-023`), and 3D AABB/OBB Dual Check Safety (`DCS` / `SafeMove` `SYST-212`) link-capsule collision checking.
   - **4 Real-World Factory Scenarios:**
     1. *Teach Pendant & 3-Point Sphere-Fit TCP Calibration*
     2. *High-Speed Pick-and-Place & Cycle-Time Optimization (`FINE` vs. `CNT`)*
     3. *Wrist Singularity (`J5 → 0°`) & Configurable DCS / SafeMove Safety Zones*
     4. *CNC Machine Tending with PLC Handshake, 2D Vision Offset (`VR[1]`) & 3 Plant-Floor Fault Triage Drills (`SRVO-062 BZAL`, Gripper Reed-Switch Timeout, `SRVO-050` CNC Door Over-Torque)*

2. **PLC & Controls Lab (Phase 3 — Navigation & Shared Virtual Fieldbus Active)**
   - Live real-time mirror of `DI[1..16]`, `DO[1..16]`, and `VR[1..4]` with PROFINET / EtherNet/IP byte.bit tag addresses and manual bit forcing.
   - Full Phase 3 specification documented in [`ROADMAP_PLC.md`](./ROADMAP_PLC.md).

---

## Kinematics Mathematics

### Link Geometry (`OMNI_ROBOT_SPEC`, World Z-Up, Millimeters)

| Parameter | Value (mm) | Description |
| --- | ---: | --- |
| `d1` | `525` | Base pedestal height from floor `Z=0` to `J2` shoulder axis |
| `a1` | `150` | Shoulder horizontal offset along `+X` from `J1` axis |
| `a2` | `790` | Upper arm length (`J2 → J3`) |
| `a3` | `150` | Elbow vertical offset at `J3` |
| `d4` | `835` | Forearm length (`J3 → J5` spherical wrist center) |
| `d6` | `100` | Spherical wrist center `J5` to ISO 9787 flange face |

### Forward Kinematics (`src/engine/kinematics/fk.ts`)
Evaluates the exact rigid-body SE(3) chain:
$$T_{\text{tcp}} = R_z(q_1)\,T_x(a_1)\,T_z(d_1)\,R_y(q_2)\,T_z(a_2)\,R_y(q_3)\,T_z(a_3)\,T_x(d_4)\,R_x(q_4)\,R_y(q_5)\,R_x(q_6)\,T_x(d_6)\,R_y(90^\circ)\,T_{\text{UTOOL}}$$

Orientation uses the industrial **W-P-R** convention: $R = R_z(R)\,R_y(P)\,R_x(W)$.

### Analytical Spherical-Wrist Inverse Kinematics (`src/engine/kinematics/ik.ts`)
1. Remove active tool frame: $T_{\text{flange}} = T_{\text{target}} \, T_{\text{UTOOL}}^{-1}$.
2. Decouple wrist center: $\mathbf{p}_{wc} = \mathbf{p}_{\text{flange}} - d_6 \hat{\mathbf{a}}$ where $\hat{\mathbf{a}}$ is flange `+Z`.
3. Solve closed-form arm angles $(q_1, q_2, q_3)$ across front/back shoulder and elbow-up/elbow-down branches.
4. Solve spherical wrist $R_{\text{wrist}} = R_{03}^T R_{J6} = R_x(q_4) R_y(q_5) R_x(q_6)$ across flip/non-flip wrist branches, selecting the joint-limit-valid branch minimizing weighted joint distance from `qCurrent`.

### 3-Point Sphere-Fit TCP Calibration (`src/engine/kinematics/tcpCalibration.ts`)
For $N \ge 3$ flange poses $(R_i, \mathbf{p}_i)$ touching a fixed pin $\mathbf{p}_{\text{pin}}$, pairwise subtraction yields the linear system:
$$(R_i - R_j)\,\mathbf{t}_{\text{UTOOL}} = \mathbf{p}_j - \mathbf{p}_i$$
Solved via normal equations $(A^T A)\,\mathbf{t} = A^T \mathbf{b}$ with Gaussian elimination and partial pivoting, achieving sub-millimeter RMS accuracy.

---

## Multi-OEM Dialect Equivalence Map

| Canonical IR | FANUC TP (`.LS`) | ABB RAPID (`.mod`) | KUKA KRL (`.src`) | Yaskawa INFORM (`.JBI`) | URScript (`.script`) |
| --- | --- | --- | --- | --- | --- |
| `MOVE_J` | `J P[1] 85% FINE ;` | `MoveJ p1, v1700, fine, tool;` | `PTP XP1 ; VEL=85%` | `MOVJ P001 VJ=85.0 PL=0` | `movej(p1, a=1.4, v=2.67, r=0.000)` |
| `MOVE_L` (CNT) | `L P[4] 1450mm/sec CNT65 ;` | `MoveL p4, v1450, z150, tool;` | `LIN XP4 C_DIS ; 1.45m/s` | `MOVL P004 V=1450.0 PL=5` | `movel(p4, a=1.2, v=1.45, r=0.091)` |
| `SET_DO` | `DO[2]=ON ;` | `SetDO do2, 1;` | `$OUT[2] = TRUE` | `DOUT OT#(2) ON` | `set_standard_digital_out(1, True)` |
| `WAIT_DI` | `WAIT DI[2]=ON ;` | `WaitDI di2, 1;` | `WAIT FOR $IN[2] == TRUE` | `WAIT IN#(2)=ON` | `while (get_standard_digital_in(1) != True): sync() end` |
| `VOFFSET` | `L P[3] 550mm/sec FINE VOFFSET,VR[1] ;` | `MoveL Offs(p3, vr1.x, vr1.y, 0), ...` | `LIN XP3 : VR_1` | `MOVL P003 ... SFTON P001` | `movel(pose_trans(p3, vr_1), ...)` |

---

## Performance Design

- **Zero React Re-Renders per Animation Frame:** All 60 FPS joint angles, velocities, FK transforms, gripper jaw positions, CNC door motion, and TCP trail buffers live in a transient `robotRuntime` store mutated strictly inside `@react-three/fiber`'s `useFrame()`.
- **Throttled HUD Sync:** UI telemetry snapshots sync at ~12 Hz to keep React reconciliation negligible while preserving crisp numeric readouts.
- **Zero Memory Leaks:** Three.js `BufferGeometry` and `MeshStandardMaterial` instances are memoized and explicitly `.dispose()`d on unmount.

---

## Local Development & Verification

```bash
npm install
npm run dev        # Start Vite dev server
npm run typecheck  # Strict TypeScript check (tsc -b --noEmit)
npm run lint       # ESLint check
npm run build      # Production TypeScript + Vite bundle
```

## Deploying to Vercel

This repository ships with [`vercel.json`](./vercel.json) preconfigured for Vite SPA routing (`rewrites` to `/index.html`) and requires **zero environment variables or backend services**:

1. Push this repository to GitHub.
2. Open [vercel.com/new](https://vercel.com/new) and import the repository.
3. Vercel automatically detects **Vite** (`npm run build`, output directory `dist`). Click **Deploy**.
