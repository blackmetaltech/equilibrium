#!/usr/bin/env zsh
# scripts/sheets.sh <out_dir> [chapter ...]: one contact sheet per chapter (and the Career) at 1920x1080 on the NVIDIA GPU (core/qa/gpu-shot.sh, shared lock).
# Each level is played the expert way (CB_AUTOPLAY), its end card put away, the hall's hero view shot; the sheet tiles the level shots with their ids.
# Chapters: 0-10 and C (the Career). Default: all. Shots stay in <out_dir>/shots, sheets are <out_dir>/sheet-chN.jpg.
here=${0:A:h:h}; O=${1:-build/shots}; shift; mkdir -p $O/shots
typeset -A CH
CH=(0 "L00" 1 "L01 L02 L03 L04" 2 "L05 L06 L07 L08 L09" 3 "L10 L11 L12 L13 L14" 4 "L15 L16 L17 L18" 5 "L19 L20 L21 L22 L23"
    6 "L24 L25 L26 L27" 7 "L28:plant L28:wide L28:close" 8 "L29 L30 L31 L32 L33" 9 "L34 L35 L36 L37 L38" 10 "L39:plant L39:wide" C "C:plant C:wide")
want=(${@:-0 1 2 3 4 5 6 7 8 9 10 C})
cd $here
for c in $want; do
  files=()
  for spec in ${=CH[$c]}; do
    L=${spec%%:*}; V=${spec#*:}; [[ $V == $spec ]] && V=plant
    f=$O/shots/$L-$V.png
    ap=(CB_AUTOPLAY=expert:40); cam="endclose|nbclose|$V"
    [[ $L == C ]] && { ap=(); cam="nbclose|$V"; }
    [[ $L == L00 || $L == L14 ]] && cam="endclose|nbclose"
    GPU_LOG=$O/shots/$L-$V.log timeout 150 zsh core/qa/gpu-shot.sh 1920x1080 $PWD/$f CB_NOCOACH=1 CB_AUTOSTART=learner CB_LEVEL=$L $ap CB_CAM="$cam" >/dev/null 2>&1
    if [[ -f $f ]]; then magick $f -resize 960x540 -gravity northwest -fill white -undercolor '#000000a0' -pointsize 22 -annotate +8+500 " ${L/C/Career} $V " $O/shots/$L-$V.jpg; files+=$O/shots/$L-$V.jpg
    else echo "sheets: no shot for $L $V (see $O/shots/$L-$V.log)"; fi
  done
  (( ${#files} )) && magick montage $files -tile 2x -geometry +4+4 -background '#111' -quality 82 $O/sheet-ch$c.jpg && echo "$O/sheet-ch$c.jpg (${#files} shots)"
done
