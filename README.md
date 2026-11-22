# ⚗️ EQUILIBRIUM — run a chemical plant where the chemistry is real

**[Releases](https://github.com/ixaxaar/equilibrium/releases)** · **[Changelog](CHANGELOG.md)** · **[Critique](docs/CRITIQUE-0.8.md)** · **[Issues](https://github.com/ixaxaar/equilibrium/issues)**

**Build a chemical plant, then find out whether it works.** Place feed banks, heaters, exchangers, burners, reactors, columns and recycle loops, pipe them together, and commission the plant. Then real equilibrium, real kinetics and real heat balances decide what happens: the ammonia you can reach at 450 °C and 200 bar, the catalyst that falls asleep below 410 °C, the glycol reactor that crosses its Semenov point and runs away, the argon that builds up in a loop with no purge. The campaign climbs from std-9 stoichiometry to the work of a junior process engineer: PID tuning, interlocks, HAZOP, data reconciliation, and a five-year career running a whole Works.

The front-end is a **Godot 4.7** game drawn as a 1970s control room: annunciator windows, a chart recorder, Bakelite knobs, a DESIGN / COMMISSION / RUN key switch, a green-bar printout. Every rule (thermodynamics, equilibrium, kinetics, flowsheet solving, dynamics, economics) runs in a deterministic TypeScript engine (on the shared COBANANA core) that Godot drives through a headless Node sidecar.

> **Alpha (0.8.0).** Playable on desktop Linux; that is the only platform really supported so far (a Windows zip is built but untested). An Android debug APK builds locally, and there is a Steam Deck (1280×800) layout. Rough in places: see the [changelog](CHANGELOG.md) and the known gaps below. Tell us what broke or confused you in [issues](https://github.com/ixaxaar/equilibrium/issues).

![Three adiabatic beds with interstage coolers in the contact plant, with molecule critters in the pipes and the X-T staircase top right](docs/readme/staircase.png)

## What's new in 0.8

| An incident fixed in the plant: the Career's ammonia loop with inerts in its feed, re-purged and running | L39 Size the Line: the pump settles where its curve crosses the system curve |
|---|---|
| ![incident loop](docs/readme/incident-loop.png) | ![size the line](docs/readme/size-the-line.png) |

The Career now sends you into a real plant when inerts reach the ammonia feed, and the purge you set there changes the next three months. Chapter 10 adds hydraulics. Money is one currency per number in every region, long shifts at 16x run at 16x even under software rendering, and the Career autosaves and resumes. Details in the [changelog](CHANGELOG.md).

## What you actually do

| | |
|---|---|
| **Design** | Pick units from the P&ID parts rack (feed banks, mixers, heaters, coolers, exchangers, compressors, reactors, flash drums, columns, absorbers, boilers, stacks, relief valves, interlocks), place them on the plot and pipe them. Each unit has a faceplate with Bakelite knobs. |
| **Commission** | Turn the key. The flowsheet solver settles the whole plant (recycle loops included) and the stream tags show composition, flow, T and P. |
| **Run** | Shift levels run the plant in time on the chart recorder, with an ISA-18.2 style annunciator and the intercom voices of Mara, Tomas, Victor and Noor: dry and exact, practical, money, and sober. Stop, edit and run again; your build is kept. |
| **Call it** | Predict a number before you commission (the H₂ you must buy, K at 450 °C, the adiabatic rise). The printout compares your call with the engine's. |
| **Instruments** | The **Equilibrium Window** and balance beam, the **X-T staircase**, the **Semenov plot**, the **heat ledger** and the **loop panel** with a green-bar strip chart, tuning knobs and a Nixie readout. |
| **Turnaround boards** | A HAZOP worksheet, start-up SOP cards, permit to work, a data-reconciliation logsheet and a planning board with crew and crane levelling. |
| **Hydraulics** | Size a pipe and pick a pump: the system curve against the pump curve, NPSH and cavitation, and the cheapest line over a year. |
| **Career** | Five seeded years running the Works: contracts, price walks, catalyst decay, fouling, wear, inspections, turnarounds, incidents, emissions caps, investments, and an annual review. When inerts creep into the ammonia feed you can go to the plant and fix the purge yourself, call a contractor or ignore it. |

**The campaign.** Twelve stops on the **Works Map**, 40 levels plus the Career. **Night Shift** is a cold open at 02:40 on an ammonia loop. **The Bench** (L01-L04) is moles, not kilograms, air is mostly nitrogen, the unknown fuel, and a lab-notebook exam bridge. **Fire** (L05-L09) is waste-heat boilers, a burner lining limit, Hess's road, paying once for heat, and bomb vs flow calorimeter. **The Wall** (L10-L14) is Le Chatelier with the rigorous K, gas contracts with inerts, a water-gas shift where pressure does nothing, the SO₂ staircase and the brown N₂O₄ gas. **Speed** (L15-L18) is rate vs ceiling, light-off, a faster road to the same destination, and an oxygen rig. **The Loop** (L19-L23) is recycle, purge, refrigerated flash, the methanol loop and a distillery. **Containment** (L24-L27) is runaway, the last 0.3 percent, the nitric acid gauze deck and a blocked outlet. **The Works** (L28) feeds the world with ammonia from natural gas. **The Control Room** (L29-L33) is PID, a bump test and IMC tuning, ratio, cascade and an interlock with voting. **Turnaround** (L34-L38) is HAZOP, start-up, permit to work, reconciliation and a 20-day planning window. **Hydraulics** (L39) is a condensate line to size, with five pumps and a cavitating suction to avoid. **Career** (C) is five years in charge. Exam bridges sit at the end of chapters 1 to 4.

**Modes.** **Learner** (coach, auto-explanations, gentler events, costs never fail a goal), **Engineer** (rigorous, costs and emissions can fail goals) and **Sandbox** (all units and species, no goals). Stars on the map count toward an Engineer rank.

**Honest by design.** The thermodynamics come from NIST Shomate polynomials (NASA 7-term where NIST has none), checked against JANAF to about 0.01 kJ/mol, with equilibrium constants from the rigorous Gibbs route. A suite of oracle tests (hand-checkable values, JANAF fixtures, property tests on the solvers, analytic PID and FOPDT responses) pins the numbers, and a level's own numbers appear in the lesson text rather than generic ones. The engine is deterministic: every `exp`, `log` and `pow` goes through the core's fdlibm math, the random streams are seeded per level, and a run replays exactly. What is simplified is written down in [docs/DESIGN.md](docs/DESIGN.md): gases are ideal at every pressure (a Pitzer virial gauge flags how far off that is), the nitric acid absorber has a fixed recovery, the relief model is API 520 with K_b = K_c = 1, and some bench prices are game numbers rather than quotes.

**Cute mode.** Turn it on from the title or the pause menu (it is on by default). Every pipe fills with molecule critters, and the picture is the physics: the number of critters of each species follows its **molar flow** (largest remainder over the mole fractions), their size follows **M^⅓**, and their pace follows the flow. A light gas such as hydrogen makes many small critters and a heavy one a few big ones. Gulls, flamingos, the QC-lab cat and the old Works wander the site. Switch it off for the plain control room.

## Screenshots

| Night Shift (L00): the Equilibrium Window and balance beam | Notebook brief, goals, budget and flasks (L16) |
|---|---|
| ![night shift](docs/readme/night-shift.png) | ![notebook](docs/readme/notebook.png) |
| **A run that went wrong: the printout says why (L01)** | **Runaway (L24): Semenov plot, running** |
| ![printout](docs/readme/printout.png) | ![runaway](docs/readme/runaway.png) |

## The control room and the boards

| Tune It (L30): bump test, IMC, Nixie IAE | The Interlock (L33): sensors, votes, trip point |
|---|---|
| ![tune it](docs/readme/tune-it.png) | ![interlock](docs/readme/interlock.png) |
| **HAZOP Node (L34)** | **The Analyser Lies (L37): data reconciliation** |
| ![hazop](docs/readme/hazop.png) | ![reconcile](docs/readme/reconcile.png) |

## Guidance you can follow

| The build order checklist (L24 start-up): every row ticks from the plant itself and stays up while the plant runs | Career: one decision a year, every option with the terms that make up its MUSD |
|---|---|
| ![checklist](docs/readme/l24-checklist.png) | ![career decision](docs/readme/career-decision.png) |

## The Works

| The Works Map | Career: year 2 of 5 |
|---|---|
| ![works map](docs/readme/works-map.png) | ![career](docs/readme/career.png) |

## On a Steam Deck

The handheld layout (1280×800) keeps the loop panel and the console on screen together.

![Tune It at 1280x800](docs/readme/handheld.png)

## Download

There is **no public release yet**. The repository is private and a release needs the owner's go-ahead (the release workflow publishes the `[x.y.z]` section of the changelog on a `v*` tag). Until then:

- **Desktop Linux**: run from source (below).
- **Android**: `core/qa/buildapk.sh` builds a **debug** APK for arm64 (`build/android/EQUILIBRIUM-debug.apk`); the engine runs in-process on nodejs-mobile. It is a local build, not a store build.

## Run from source

Needs **Node.js 18+**, pnpm and **Godot 4.7**.

```sh
git clone --recursive <this repo>        # or: git submodule update --init
pnpm install
pnpm bridge                              # builds the engine sidecar -> godot/sidecar/bridge.mjs
godot --headless --path godot --import   # once, and after adding class_name scripts
godot --path godot                       # play
```

| task | command |
|---|---|
| typecheck | `pnpm typecheck` |
| unit, golden, persona and level tests | `pnpm test` |
| regenerate goldens (deliberate rule change only) | `GOLDEN_UPDATE=1 pnpm test` |
| UI smoke (every screen) | `pnpm smoke` (prints `SMOKE OK`) |
| screenshots and play-testers | `core/qa/README.md` |
| Android debug APK | `core/qa/buildapk.sh` (see `core/android/README.md`) |

Environment hooks for testing (`CB_AUTOSTART=learner`, `CB_LEVEL=L24`, `CB_CUTE=0|1`, `CB_SHOT=out.png`) are listed in `core/godot/addons/cobanana/README.md`. Where things go: `core/CORE.md`. Game design: [docs/DESIGN.md](docs/DESIGN.md).

## Architecture

```
core/        cobanana-core (git submodule): deterministic kit, Node bridge, Godot shell addon, Android runner, QA scripts
src/
  data/      species, reactions, kinetics, catalysts, equipment, VLE (generated from NIST / JANAF, provenance-tested)
  sim/       chem (equilibrium, kinetics), thermo, units, flowsheet (sequential-modular, Wegstein),
             dynamics, control (PID / FOPDT), ops, career, econ, explain
  engine/    actions, queries and the instrument queries the game calls
  levels/    one file per level (L00-L38, Career) with its tests; locales/en holds the text
  oracle/    JANAF and analytic fixtures
godot/       the game: main.gd, world/ (plant, pipes, critters, models), ui/ (console, faceplates, boards, instruments), tests/
docs/        DESIGN, DECISIONS, CRITIQUE-0.3 … CRITIQUE-0.7, readme screenshots, research
```

## Status and known gaps

0.8 ("The plant behind the numbers") is tagged. A Career incident now opens a real plant to fix, chapter 10 adds pump and line sizing, money uses one currency per number in every region, and long shifts are fast on weak hardware. In round 11 a careful teacher went to the plant for the incident and beat the contractor (2.51 against 2.83 MUSD), and the Career resumed intact after a crash. Still open, from the [critique](docs/CRITIQUE-0.8.md) and `.work/backlog.md`:

- **Career**: after a resume the board can be wider than the window, the incident's prediction is graded against the last purge rather than the first, and some commitments are one click while others ask twice. No careful human has finished all 60 months on this build yet.
- **Gamepad**: the controller works on the main screens but has not had a pad-only pass on every screen.
- **Phone**: checked on desktop at phone size only; the device needs the owner's adb authorisation.
- Releases are pre-releases: a Linux build (smoke-tested) and a Windows zip (untested); no macOS build, and the Android APK is a debug build.
