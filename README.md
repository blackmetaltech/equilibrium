# ⚗️ EQUILIBRIUM — run a chemical plant where the chemistry is real

**[Releases](https://github.com/ixaxaar/equilibrium/releases)** · **[Changelog](CHANGELOG.md)** · **[Critique](docs/CRITIQUE-0.3.md)** · **[Issues](https://github.com/ixaxaar/equilibrium/issues)**

**Build a chemical plant, then find out whether it works.** Place feed banks, heaters, exchangers, burners, reactors, columns and recycle loops, pipe them together, and commission the plant. Then real equilibrium, real kinetics and real heat balances decide what happens: the ammonia you can reach at 450 °C and 200 bar, the catalyst that falls asleep below 410 °C, the glycol reactor that crosses its Semenov point and runs away, the argon that builds up in a loop with no purge. The campaign climbs from std-9 stoichiometry to the work of a junior process engineer: PID tuning, interlocks, HAZOP, data reconciliation, and a five-year career running a whole Works.

The front-end is a **Godot 4.7** game drawn as a 1970s control room: annunciator windows, a chart recorder, Bakelite knobs, a DESIGN / COMMISSION / RUN key switch, a green-bar printout. Every rule (thermodynamics, equilibrium, kinetics, flowsheet solving, dynamics, economics) runs in a deterministic TypeScript engine on [cobanana-core](https://github.com/ixaxaar/cobanana-core) that Godot drives through a headless Node sidecar.

> **Alpha (0.4 in progress).** Playable on desktop Linux; that is the only platform really supported so far. An Android debug APK builds locally, and there is a Steam Deck (1280×800) layout. Rough in places: see the [changelog](CHANGELOG.md) and the known gaps below. Tell us what broke or confused you in [issues](https://github.com/ixaxaar/equilibrium/issues).

![Three adiabatic beds with interstage coolers in the contact plant, with molecule critters in the pipes and the X-T staircase top right](docs/readme/staircase.png)

## What you actually do

| | |
|---|---|
| **Design** | Pick units from the P&ID parts rack (feed banks, mixers, heaters, coolers, exchangers, compressors, reactors, flash drums, columns, absorbers, boilers, stacks, relief valves, interlocks), place them on the plot and pipe them. Each unit has a faceplate with Bakelite knobs. |
| **Commission** | Turn the key. The flowsheet solver settles the whole plant (recycle loops included) and the stream tags show composition, flow, T and P. |
| **Run** | Shift levels run the plant in time on the chart recorder, with an ISA-18.2 style annunciator and the intercom voices of Mara, Tomas, Victor and Noor: dry and exact, practical, money, and sober. Stop, edit and run again; your build is kept. |
| **Call it** | Predict a number before you commission (the H₂ you must buy, K at 450 °C, the adiabatic rise). The printout compares your call with the engine's. |
| **Instruments** | The **Equilibrium Window** and balance beam, the **X-T staircase**, the **Semenov plot**, the **heat ledger** and the **loop panel** with a green-bar strip chart, tuning knobs and a Nixie readout. |
| **Turnaround boards** | A HAZOP worksheet, start-up SOP cards, permit to work, a data-reconciliation logsheet and a planning board with crew and crane levelling. |
| **Career** | Five seeded years running the Works: contracts, price walks, catalyst decay, fouling, wear, inspections, turnarounds, incidents, emissions caps, investments, and an annual review. |

**The campaign.** Eleven stops on the **Works Map**, 39 levels plus the Career. **Night Shift** is a cold open at 02:40 on an ammonia loop. **The Bench** (L01-L04) is moles, not kilograms, air is mostly nitrogen, the unknown fuel, and a lab-notebook exam bridge. **Fire** (L05-L09) is waste-heat boilers, a burner lining limit, Hess's road, paying once for heat, and bomb vs flow calorimeter. **The Wall** (L10-L14) is Le Chatelier with the rigorous K, gas contracts with inerts, a water-gas shift where pressure does nothing, the SO₂ staircase and the brown N₂O₄ gas. **Speed** (L15-L18) is rate vs ceiling, light-off, a faster road to the same destination, and an oxygen rig. **The Loop** (L19-L23) is recycle, purge, refrigerated flash, the methanol loop and a distillery. **Containment** (L24-L27) is runaway, the last 0.3 percent, the nitric acid gauze deck and a blocked outlet. **The Works** (L28) feeds the world with ammonia from natural gas. **The Control Room** (L29-L33) is PID, a bump test and IMC tuning, ratio, cascade and an interlock with voting. **Turnaround** (L34-L38) is HAZOP, start-up, permit to work, reconciliation and a 20-day planning window. **Career** (C) is five years in charge. Exam bridges sit at the end of chapters 1 to 4.

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
docs/        DESIGN, DECISIONS, CRITIQUE-0.3, research
```

## Status and known gaps

0.4 ("Employable") is in progress: every chapter, the Career and the instruments exist and play. The 0.3 [critique](docs/CRITIQUE-0.3.md) found that the chemistry holds up and the interface fought you; five play-test rounds and their fix rounds followed. In round 5, persona play-testers won at least one level in every chapter from the in-game guidance alone (L08, L11, L16, L18, L21, L22, L24, L27, L28, L29, L30, L33, L35, L37). Still open (`.work/backlog.md`):

- **Build-heavy levels** (L23 Spirits, L25, L26) are hard to finish: big units are awkward to place on a crowded plot, and the first pipe is not obvious.
- **A few numbers still disagree across screens** (for example the L24 steady-state temperature between the notebook, the debrief and the Semenov marker).
- **Career** has not been won in a play-test yet (24-25 months reached); the annual review now separates operating margin from investments.
- **Phone layout** is checked on desktop at phone size, not yet on a phone since the last round.
- No public release, no Windows or macOS build, and the Android APK is a debug build.
