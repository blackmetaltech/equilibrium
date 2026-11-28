# Play this (branch v0.14, not released)

## Start
```
make run SAVE=tour
```
The game opens on the RTX 4090 in a 1000x640 window. On a landscape screen, `WIN=1920x1080` (or `WIN=1600x900`) shows the hall much better.
`SAVE=tour` uses a separate save folder (`build/tour-data`) with every chapter and the Career open. Your own save, settings and Career are not touched.
Without it you play your own save, and chapters open in campaign order.

Other ways to start:
- `make run LEVEL=L28` goes straight into one job and does not write your save. `LEVEL=C` opens the Career.
- `make run LOW=1` is the low tier on the integrated GPU.
- `make run CLASSIC=1` is the classic look for every job.

## New since 0.13.0
- Every job is now in the new look. Chapters 7 to 10 and the Career stand in the plant hall.
- L28 Feed the World: the whole ammonia Works in the hall. The steam reformer's tubes rise through its roof, and its peepholes glow with its outlet temperature. CO2 removal, the methanator and the synthesis loop stand beside it.
- Chapters 8 to 10 and the Career keep their worksheet on the right. The plant behind it shows what you set:
  - L29: the drum's gauge glass.
  - L30: the heater's fire.
  - L32: the cascade cable lights.
  - L33: the reactor's sensors and the voting cabinet.
  - L34: safeguards on the exchanger.
  - L35: SOP lamps.
  - L36: valves, the blind and the locks.
  - L37: five meters, with a red tag on the one you flag.
  - L38: scaffolds and cranes.
  - L39: pipe sizes and the pump's place.
  - Career: four plants with stack lights.
- Compressors are now a machine on a skid: baseplate, casing, coupling guard, finned motor.
- Pipes no longer run through vessels.
- Closer views of each level's subject in chapters 5 and 6.
- The HAZOP sheet, the turnaround chart and the Career text no longer overlap or cut off.
- B (pad X) flips any job between the hall and the classic view.

## Ten minutes
Open the Works map from the title and pick a job. In the hall, right-drag (or middle-drag) turns the view and the wheel zooms.
1. **L28 Feed the World** (2 min). The Works is already built. Turn the key to Run. Watch the reformer's peepholes, then zoom out over the whole Works.
2. **L26 Inside the Envelope** (1 min). Run it, then press B to see the hall. The gauze glows through the burner's window.
3. **L29 Hold the Line** (1 min). Set the gain and the integral time, then Run. Watch the drum's gauge glass settle.
4. **L33 The Interlock** (2 min). Pick 3 sensors, 2 votes and the dump, then Run. The sensors stand on the reactor, and the voting cabinet lamps follow the replay.
5. **L37 The Analyser Lies** (1 min). Reconcile, then flag a meter. A red tag hangs on that meter in the hall.
6. **L39 Size the Line** (1 min). Turn the pipe-size dials. The pipes in the hall change size, and "at the boiler house" moves the pump.
7. **Career** (2 min). New career. The four plants stand behind the board. Answer a decision and advance a month.

## Known to be rough
- On chapters 9 and 10 and the Career, the worksheet still covers about half the screen. The plant sits in the other half, and the Career is still mostly a board.
- Art score (Sigrid, 4090 shots): 6.4 out of 10 on average. Chapter 4 (7.0) and L28 (7.5) reach the 7 target; the other ten chapters do not.
- L20: the purge vent in front catches the eye more than the purge valve. L27: the relief valve is hard to see.
- Chapter 4 and L25 still show °C numbers as plates in the 3D. White vessels (L01, L04, L27) still look a bit plastic.
- Lamps on the towers outside read as small dots in wide shots.
- The default 1000x640 window is small for the hall. Below 1280x800, the panels crowd.
- The phone layout still prints one harmless error line in its log at start-up (not found yet).
- Sound: nobody has listened to it.

## Classic look
`make run CLASSIC=1` draws every job in the old look. Inside the game, B flips one job.
