extends SceneTree
## Contact sheets of every unit model (needs a display): godot --path godot --script res://tests/models_sheet.gd -- <out prefix> [cold|hot|both]
## Writes <prefix>_<state>_<page>.png at the window size, 8 models a page (4 x 2), each in a driven state; prints one line per model
## (type, footprint, ports, height). Fails (exit 1) if a model has no ports, no anchor or a footprint that differs from the table.
const PER_PAGE := 8
const COLS := 4
const SPACING := 11.0
var fails := 0

## Driven display states: cold = plant idle/cool, hot = running hard (glow, flames, plumes, frost, bubbles).
func state(type: String, hot: bool) -> Dictionary:
	var d := {}
	match type:
		"boiler": d = {"T_K": 1100.0 if hot else 320.0, "steam": 0.8 if hot else 0.0, "level": 0.55}
		"burner": d = {"T_K": 1380.0 if hot else 320.0, "flame": 0.9 if hot else 0.0, "spin": 0.6}
		"gasifier", "co_burner": d = {"T_K": 1300.0 if hot else 320.0, "flame": 0.8 if hot else 0.0}
		"multibed": d = {"bands": [820.0, 760.0, 700.0] if hot else [320.0, 320.0, 320.0], "light_off": 1.0 if hot else 0.0}
		"packed_bed": d = {"T_K": 780.0, "light_off": 0.6 if hot else 0.0}
		"cstr": d = {"T_K": 380.0, "T_lim": 400.0 if hot else 0.0, "Tj_K": 330.0 if hot else 290.0, "level": 0.7, "spin": 0.7 if hot else 0.0, "color": "#D9C75A"}
		"absorber": d = {"color": "#E8D17A" if hot else "#BFD8E8", "level": 0.6, "spin": 0.7, "plume": 0.5 if hot else 0.0}
		"column": d = {"trays": [335.0, 340.0, 350.0, 362.0, 375.0, 388.0, 398.0, 410.0, 420.0, 430.0] if hot else [], "T_top": 300.0, "T_bot": 305.0, "level": 0.5, "reflux": 0.6}
		"fermenter": d = {"gas": 0.9 if hot else 0.0, "level": 0.7, "spin": 0.5, "color": "#C9A66B", "T_K": 308.0}
		"chiller": d = {"T_K": 235.0 if hot else 300.0, "spin": 0.6}
		"reformer": d = {"T_K": 1150.0 if hot else 320.0, "flame": 0.8 if hot else 0.0}
		"gauze_burner": d = {"T_K": 1170.0 if hot else 320.0}
		"lab_flask": d = {"alpha": 0.7 if hot else 0.0, "T_K": 350.0 if hot else 290.0, "P_bar": 2.5 if hot else 1.0}
		"bomb_calorimeter": d = {"dT": 6.0 if hot else 0.0, "ignite": 1.0 if hot else 0.0, "T_K": 303.0 if hot else 295.0, "spin": 0.6}
		"gas_burette": d = {"volume": 0.55 if hot else 0.0, "color": "#4CC9F0"}
		_: d = {"T_K": 700.0 if hot else 300.0, "spin": 0.5, "level": 0.5, "flame": 0.6 if hot else 0.0}
	return d

func _initialize() -> void:
	var a := OS.get_cmdline_user_args()
	var prefix := str(a[0]) if a.size() > 0 else "/tmp/models"
	var which := str(a[1]) if a.size() > 1 else "both"
	var types := UnitModels.TYPES
	var vp: Viewport = root; vp.msaa_3d = Viewport.MSAA_4X
	var env := Environment.new(); env.background_mode = Environment.BG_COLOR; env.background_color = Color("#2C4A45")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR; env.ambient_light_color = Color("#9FB4C8"); env.ambient_light_energy = 0.4
	var we := WorldEnvironment.new(); we.environment = env; root.add_child(we)
	var sun := DirectionalLight3D.new(); sun.rotation_degrees = Vector3(-52, -35, 0); sun.light_energy = 0.95; sun.shadow_enabled = true; root.add_child(sun)
	var floor_ := MeshInstance3D.new(); var pm := PlaneMesh.new(); pm.size = Vector2(400, 400); floor_.mesh = pm
	var fm := StandardMaterial3D.new(); fm.albedo_color = Color("#3E5C55"); floor_.material_override = fm; root.add_child(floor_)
	var cam := Camera3D.new(); cam.fov = 38.0; root.add_child(cam); cam.current = true
	for hot in ([false, true] if which == "both" else [which == "hot"]):
		var tag := "hot" if hot else "cold"
		var pages := (types.size() + PER_PAGE - 1) / PER_PAGE
		for p in range(pages):
			var nodes: Array[UnitModel] = []
			var n := mini(PER_PAGE, types.size() - p * PER_PAGE)
			for i in range(n):
				var t: String = types[p * PER_PAGE + i]
				var m := UnitModels.create(t, "m_" + t); root.add_child(m)
				var col := i % COLS; var row := i / COLS
				m.position = Vector3((col - (COLS - 1) * 0.5) * SPACING, 0, (row - 0.5) * SPACING * 1.25)
				m.set_display(state(t, hot)); nodes.append(m)
				var fp := UnitModels.footprint(t, 0)
				var ok := m.ports.size() > 0 and m.anchor_top != null and m.footprint(0) == fp
				if not ok: fails += 1
				if not hot: print("%-18s fp %s model %s ports %s h %.1f %s" % [t, fp, m.footprint(0), m.port_names(), m.height, "" if ok else "FAIL"])
			cam.look_at_from_position(Vector3(0, 27.0, 41.0), Vector3(0, 2.8, 0.0), Vector3.UP)
			for k in 12: await process_frame
			await create_timer(0.8).timeout
			var path := "%s_%s_%d.png" % [prefix, tag, p]
			vp.get_texture().get_image().save_png(path); print("saved ", path)
			for m in nodes: m.queue_free()
			await process_frame
	print("MODELS_SHEET fails=", fails); quit(1 if fails > 0 else 0)
