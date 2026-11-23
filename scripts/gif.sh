#!/bin/zsh
# gif.sh <slot a-h> <name> <seconds> <fps> [VAR=VAL ...] : record a README/site GIF of the built game, 640x360, own palette.
#   Renders Forward+ on the RTX 4090 through scripts/desk-gpu.sh (holds the shared GPU lock, one window at a time) into the
#   slot's own Xvfb display, grabs a frame every 1/fps s with scrot, stops only the PID it started, then ffmpeg builds the GIF.
#   Output: $GIF_OUT/<name>.gif (default docs/readme). Frames stay in $GIF_TMP/<name>/ (default $TMPDIR or /tmp).
#   Drive the scene with the game's QA env, e.g. night trip:  gif.sh a night-trip 60 5 CB_AUTOSTART=learner CB_LEVEL=L00 CB_NOCOACH=1 CB_NEW=1 "CB_CAM=speed=3"
#   GIF_FRAMES=<n> keeps only the first n frames after the skip (cut the clip where the story ends).
#   Scripted input (clicks, keys) during the capture: set GIF_DRIVE to a zsh snippet; it runs in the background with $SLOT and $G set,
#   using  zsh core/qa/desk.sh $SLOT click X Y  etc. Trim a long lead-in with GIF_SKIP=<s>. Check the size: keep each GIF under ~5 MB.
set -u
SLOT=${1:?slot a-h}; NAME=${2:?name}; SECS=${3:?seconds}; FPS=${4:?fps}; shift 4
G=${0:A:h:h}; cd $G; source qa.env; source core/qa/env.sh 2>/dev/null
T=${GIF_TMP:-${TMPDIR:-/tmp}}/gif-$NAME; rm -rf $T; mkdir -p $T/f
OUT=${GIF_OUT:-$G/docs/readme}
zsh scripts/desk-gpu.sh $SLOT start 1920x1080 "$@" || exit 1
Q=$CB_QA/$SLOT; DISPLAY=:$(cb_disp $SLOT); export DISPLAY
grep -m1 "Using Device" $Q/game.log | grep -q NVIDIA || { echo "gif: not on the NVIDIA GPU"; zsh core/qa/desk.sh $SLOT stop; exit 2; }
[[ -n ${GIF_DRIVE:-} ]] && { export SLOT G; ( eval "$GIF_DRIVE" ) >/dev/null 2>&1 & DP=$!; }
N=$(( SECS * FPS )); for i in {1..$N}; do scrot -o $T/f/$(printf %04d $i).png; sleep $(( 1.0 / FPS - 0.12 > 0 ? 1.0 / FPS - 0.12 : 0 )); done
zsh core/qa/desk.sh $SLOT stop >/dev/null 2>&1; [[ -n ${DP:-} ]] && kill $DP 2>/dev/null
ffmpeg -loglevel error -y -framerate $FPS -start_number $(( ${GIF_SKIP:-0} * FPS + 1 )) -i $T/f/%04d.png -frames:v ${GIF_FRAMES:-100000} \
  -vf "scale=640:360:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" $OUT/$NAME.gif
ls -la $OUT/$NAME.gif | awk '{print $5, $9}'
