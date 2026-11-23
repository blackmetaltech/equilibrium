#!/bin/zsh
# desk-gpu.sh <tester> start <WxH> [VAR=VAL...] : the desk harness, but the game renders Forward+ on the RTX 4090 and presents into the
# tester's own Xvfb display (NVIDIA Vulkan presents to a non-NVIDIA X server by readback), so hand play runs at real speed without
# touching the owner's screen. Holds the shared GPU window lock (/tmp/cb-gpu-display.lock) until the game exits: one GPU window at a time.
# Frame cap 60 (written to the tester's settings.cfg). Every other subcommand passes straight to desk.sh (click, move, drag, shot, log, stop).
# Check after start:  grep "Using Device" <qa>/<tester>/game.log   must say NVIDIA (else it is software rendering and the play is not real speed).
T=${1:?tester}; C=${2:?cmd}; shift 2
G=${0:A:h:h}
cd $G; source qa.env
if [[ $C != start ]]; then exec zsh core/qa/desk.sh $T $C "$@"; fi
R=${1:-1600x900}; shift
source core/qa/env.sh 2>/dev/null; Q=$CB_QA/$T
mkdir -p $Q/data/godot/app_userdata/EQUILIBRIUM
S=$Q/data/godot/app_userdata/EQUILIBRIUM/settings.cfg
if [[ -f $S ]] && grep -q "^\[a\]" $S; then sed -i '/^fps_cap=/d' $S; sed -i 's/^\[a\]$/[a]\nfps_cap=60/' $S; else printf '[a]\nfps_cap=60\n' > $S; fi
exec 9>/tmp/cb-gpu-display.lock
flock -w 600 9 || { echo "desk-gpu: GPU window lock busy for 10 min"; exit 3; }
zsh core/qa/desk.sh $T start $R VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/nvidia_icd.json CB_FRAMETIME=1 "$@"
PID=$(cat $Q/pid 2>/dev/null)
grep -m1 "Using Device" $Q/game.log
( while [[ -n $PID ]] && kill -0 $PID 2>/dev/null; do sleep 2; done ) 9>&9 >/dev/null 2>&1 </dev/null &!
