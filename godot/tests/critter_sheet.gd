extends SceneTree
## Writes every species critter (happy / lost / plain) to a sheet PNG: godot --headless -s tests/critter_sheet.gd -- out.png
func _init() -> void:
	var out := "/tmp/critters.png"
	var a := OS.get_cmdline_user_args()
	if a.size() > 0: out = a[0]
	var sps := Critters.MOLAR.keys()
	var sheet := Image.create(Critters.TEX * 3 * 2, Critters.TEX * sps.size() / 2 + Critters.TEX, false, Image.FORMAT_RGBA8)
	sheet.fill(Color("#2C4A45"))
	for i in range(sps.size()):
		var col := (i % 2) * 3; var row := i / 2
		var imgs := [Critters.paint(sps[i], "happy", true), Critters.paint(sps[i], "lost", true), Critters.paint(sps[i], "happy", false)]
		for k in range(3): sheet.blend_rect(imgs[k], Rect2i(0, 0, 64, 64), Vector2i((col + k) * 64, row * 64))
	sheet.resize(sheet.get_width() * 2, sheet.get_height() * 2, Image.INTERPOLATE_NEAREST)
	sheet.save_png(out); print("SHEET ", out, " ", sps.size()); quit()
