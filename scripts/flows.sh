#!/bin/zsh
# scripts/flows.sh [out_dir] : run every godot/tests/*_flow.gd headless, 3 at a time, one OK/FAILED line per flow in <out_dir>/flows.txt.
# Isolation (phase C root cause): a virtual or real gamepad on this machine reaches EVERY Godot process, headless or not. A flow that turns
# pad input on then received another session's presses and failed at random (pad_build_flow: the cursor off by a step, focus on the title).
# SDL (Godot's joypad layer) is told to ignore the Xbox 360 pad ids, the ids core/qa/pad.py's virtual pad uses; the pad flows check that no
# joypad is left connected and fail loudly if one is.
O=${1:-/tmp/eq-flows}; mkdir -p $O; : > $O/flows.txt
cd ${0:A:h:h}/godot
export SDL_GAMECONTROLLER_IGNORE_DEVICES=0x045e/0x028e SDL_JOYSTICK_IGNORE_DEVICES=0x045e/0x028e
run1() { local n=${1:t:r}; local d=$(mktemp -d); XDG_DATA_HOME=$d nice -n 10 timeout 900 godot --headless --path . --script res://tests/$n.gd > $O/$n.log 2>&1
  local r=$(grep -E "(OK|FAILED)" $O/$n.log | grep -E "^[A-Z0-9_-]+[ :]" | tail -1); [[ -z $r ]] && r="NO RESULT"
  echo "$n: $r" >> $O/flows.txt; rm -rf $d }
for f in tests/*_flow.gd tests/fix6_save.gd; do
  while (( $(jobs -r | wc -l) >= 3 )); do sleep 2; done
  run1 $f &
done
wait; echo DONE >> $O/flows.txt
