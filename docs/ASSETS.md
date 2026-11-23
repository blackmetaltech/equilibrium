# Assets (LOOK2)

Every third-party asset in `godot/look2/assets/`, its source and licence. All are CC0 (public domain). Everything else in the LOOK2 scene is procedural geometry and shaders written for this repo (`godot/look2/`).

| File(s) | What | Source | Author | Licence |
|---|---|---|---|---|
| `dikhololo_night_1k.hdr` | Night sky HDRI | https://polyhaven.com/a/dikhololo_night | Poly Haven (Greg Zaal / Dimitrios Savva) | CC0 |
| `tex/concrete_floor_02_*` | Hall floor (diffuse, normal, roughness) | https://polyhaven.com/a/concrete_floor_02 | Poly Haven | CC0 |
| `tex/concrete_floor_worn_02_*` | Floor variation | https://polyhaven.com/a/concrete_floor_worn_02 | Poly Haven | CC0 |
| `tex/concrete_slab_wall_*` | Hall walls | https://polyhaven.com/a/concrete_slab_wall | Poly Haven | CC0 |
| `tex/corrugated_iron_*` | Roof cladding, outside sheds | https://polyhaven.com/a/corrugated_iron | Poly Haven | CC0 |
| `tex/metal_plate_*` | Gantry deck, plinths | https://polyhaven.com/a/metal_plate | Poly Haven | CC0 |
| `tex/painted_metal_shutter_*` | Painted steel (compressor skid, frames) | https://polyhaven.com/a/painted_metal_shutter | Poly Haven | CC0 |
| `tex/rusty_metal_02_*` | Weathered steel outside | https://polyhaven.com/a/rusty_metal_02 | Poly Haven | CC0 |
| `godot/ui/fonts/Archivo-Variable.ttf` | UI type (already in the repo) | Google Fonts | Omnibus-Type | OFL 1.1 |

## Sound (phase C, 0.11.0)
- **Source and licence:** none to license. Every sound is synthesised at run time by `godot/audio/eq_audio.gd`; there are no audio files.
- **New in 0.11.0, the new-look worlds drive the shell's plant bed from live engine state:**
  - **L00:** the loop compressor while the loop runs; the converter's fire by its heat; cooling-water hiss that stops when the CW pump trips; the flare roar on a trip.
  - **Chapter 1 and chapter 3 halls:** a compressor drone when the plant has a compressor; the furnace roar from the hottest burner or bed; pipe hiss while running; a vent rumble.
  - **L14:** one-shots for the RUN lever (key), the argon valve (valve), the clamp (lock) and each wheel step (knob tick).
- **Not done:** positional (3D) audio. The bed is a stereo mix, not placed at each vessel.
- **Listening:** no human has listened to this mix. The levels and balance are untested by ear; only `look2_flow` checks that the bed is driven.
