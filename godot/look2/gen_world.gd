class_name GenWorld
extends LabWorld
## Chapter 3 build levels (L10-L13) in the new look (docs/LOOK2.md, phase B, D-B4). The player draws the plant on the drafting table (the classic build view)
## and, once commissioned, it stands here in the process hall, generated from the engine's own flowsheet: one model per unit type, pipes on a rack, live state
## from the snapshot (outlet temperatures make converters and beds glow, cold beds stay dark, boilers raise steam, vents plume). Same contract as LabWorld.
const GRID := 1.35            ## m per flowsheet grid cell
const ORIGIN := Vector3(-14.0, 0, -9.0)
var plant: Node3D
var _sig := ""
var _out := {}                ## unit id -> outlet stream id
var _glow := {}               ## unit id -> {mat, light, kind}
var _steam := {}
var _kind := {}   ## steam id -> "boiler" (plume by the engine's steam kg/s) or "vent"
var _duty := {}   ## boiler id -> steam kg/s from the engine (the plume follows it)              ## unit id -> particles
var _preset := "wide"
var _ctr := Vector3.ZERO   ## plant centre (m)
var _span := 4.0          ## plant extent (m)
var _stack_at := Vector3.ZERO   ## the flue analyser cabinet (the "stack" camera)
var _analyser := {}   ## stack id -> Label3D (the flue analyser screen)
var _types := {}              ## unit id -> type
var _tmax := {}               ## unit id -> sinter limit K (beds), 0 if none
var _tmin := {}               ## unit id -> light-off K, 0 if none
var _at := {}                 ## unit id -> floor position (m)
var _lid := ""                ## the level id (the hero camera and the exam props follow it)
var _hov: Label3D            ## the one screen-space label: only the hovered or selected unit gets it
var _board: HallBoards = null   ## 0.14: the board level's subject props and their live state (null on build levels)
var _rack_z := -11.0          ## the pipe rack's z: BEHIND the plant, so the front cameras never look through its beams
const LADDER := {"ladder": true, "ladder_ang": PI * 0.17, "manway_ang": PI * 0.5 + 0.12}   ## ladders and manways face the front cameras (+z, a little +x)

func _ready() -> void:
	_build_env(); _build_hall(); _build_outside()
	for l in get_children():   # 0.13 (Sigrid: "warm pools on the floor with no visible source"): the roof high-bays' specular glints on the damp floor; their fixtures are out of every build view
		if l is SpotLight3D and (l as SpotLight3D).position.y > 16.0:   # the shafts' feet glowed on the floor: flatter, wider, a little dimmer, no glint
			var hb := l as SpotLight3D; hb.light_specular = 0.1; hb.light_volumetric_fog_energy = 1.2; hb.spot_attenuation = 0.4; hb.spot_angle = 48.0; hb.light_energy = 4.5
		if l is MeshInstance3D and absf((l as MeshInstance3D).position.y - 16.38) < 0.05 and (l as MeshInstance3D).material_override is StandardMaterial3D:   # and their lenses: at 14x they mirrored in the damp floor as orange blobs (SSR)
			var lm := ((l as MeshInstance3D).material_override as StandardMaterial3D).duplicate() as StandardMaterial3D; lm.emission_energy_multiplier = 3.0; lm.emission = Color(1.0, 0.9, 0.75); (l as MeshInstance3D).material_override = lm
	if flare_light != null: flare_light.visible = false   # 0.13: the outside flare's light (range 160 m, shadowed) came through a window gap as an orange patch on the hall floor (Sigrid's "pool with no source"; found by hiding light groups)
	floor_wet = 0.4   # a drier floor in the build hall: fewer mirror patches (set_quality applies it)
	cam = Camera3D.new(); cam.fov = 50.0; cam.near = 0.05; cam.far = 3000.0; add_child(cam)
	plant = Node3D.new(); plant.name = "player_plant"; add_child(plant)
	_hov = Label3D.new(); _hov.name = "HoverTag"; _hov.font_size = 36; _hov.pixel_size = 0.0009; _hov.fixed_size = true; _hov.no_depth_test = true; _hov.render_priority = 10
	_hov.billboard = BaseMaterial3D.BILLBOARD_ENABLED; _hov.modulate = Color(0.9, 0.95, 1.0, 0.95); _hov.outline_size = 12; _hov.outline_modulate = Color(0, 0, 0, 0.85); _hov.visible = false; add_child(_hov)
	set_camera("wide"); _snap_cam()
	if OS.get_environment("CB_FRAMETIME") == "1": _ft_start()

func setup(role_ids: Dictionary) -> void: ids = role_ids; rebuild()

func _pos(u: Dictionary) -> Vector3:
	var p: Dictionary = u.get("pos", {})
	return ORIGIN + Vector3(float(p.get("x", 0)) * GRID, 0, float(p.get("y", 0)) * GRID)

## Rebuild the plant when the flowsheet changes (units or pipes). Cheap: a few dozen meshes.
func rebuild() -> void:
	var p = app.b.q("plant") if app != null and app.b != null else null
	if not (p is Dictionary): return
	_lid = str(app.b.g.get("level", "")) if app != null and app.b != null else ""
	if DisplayScene.UNITS.has(_lid): p = board_plant(_lid)   # 0.14 (D-14-1): a board level's plant is display only (the engine carries a placeholder feed and tank)
	var sig := _lid + ";"
	for u in p.get("units", []): sig += "%s:%s:%s:%s:%s;" % [u.id, u.get("type", ""), str(u.get("pos", {})), str(u.get("catalystId", "")), str((u.get("params", {}) as Dictionary).get("W", "")) if u.get("params", {}) is Dictionary else ""]
	for s in p.get("streams", []): sig += "%s>%s;" % [s.get("from", {}).get("unit", ""), s.get("to", {}).get("unit", "")]
	if sig == _sig: return
	_sig = sig
	for c in plant.get_children(): c.queue_free()
	_out.clear(); _glow.clear(); _analyser.clear(); _steam.clear(); _types.clear(); anchors.clear(); radius.clear(); _tmax.clear(); _tmin.clear(); _beds.clear(); _kettles.clear(); _bench = {}; _levels.clear(); _towers.clear(); _reliefs.clear(); _cstr.clear()
	var at := {}
	var feeds := 0
	var tys: Array = []
	for u0 in p.get("units", []): tys.append(str(u0.get("type", "")))
	_loop = tys.has("compressor") and tys.has("mixer3") and (tys.has("flash") or tys.has("nh3_sep"))   # chapter 5: a recycle loop
	for u in p.get("units", []):
		var id := str(u.id); var ty := str(u.get("type", "")); var c := _pos(u)
		at[id] = c; _types[id] = ty
		var pr: Dictionary = u.get("params", {})
		_tmax[id] = float(pr.get("Tmax", 0.0)); _tmin[id] = float(pr.get("Tmin", 0.0))
		match ty:
			"stoich_reactor" when _lid == "L09": _calorimeter_bench(id, c)   # 0.13: the L09 exam is a bench of calorimeters, not a reactor
			"stack" when _lid == "L09": _lab_furnace(id, c)
			"feed": _feed(c, feeds); feeds += 1
			"mixer", "mixer3": _mixer(c)
			"compressor": _recycle_compressor(c) if _loop else _compressor(c)
			"eq_reactor": _converter(id, c)
			"eq_bed": _bed(id, c)
			"boiler": _boiler(id, c)
			"nh3_sep": _separator(c)
			"product": _tank(c)
			"vent", "flare": _vent(id, c)
			"stack": _stack(id, c)
			"stoich_reactor": _vessel(c, 0.55, 1.5, _shader("steel", {"rough_base": 0.42, "metallic": 0.6, "blotch": 0.1}), plant, {"legs": true, "base": 0.6})   # the bench reactor (L01, L04)
			"burner": _burner(id, c)
			"splitter": _splitter(id, c)
			"cooler": _exchanger(c, 3.2, 0.42, M.enamel_green, true)    # 0.12 (chapter 2): CW cooler
			"hx": _exchanger(c, 5.2, 0.62, M.heat_paint, false)          # feed-effluent exchanger (L08)
			"heater": _heater(id, c)
			"gasifier": _gasifier(id, c)
			"co_burner": _burner(id, c)
			"packed_bed": _packed_bed(id, c, u)
			"batch": _kettle(id, c, u)
			"flash": _flash(id, c, u)
			"tubular": _tubular(id, c)
			"fermenter": _fermenter(id, c)
			"column": _column(id, c, u)
			"absorber": _absorber(id, c, false)
			"hno3_absorber": _absorber(id, c, true)
			"gauze_burner": _gauze_burner(id, c)
			"n2o_abater": _abater(c)
			"cstr": _cstr_unit(id, c)
			"relief": _relief(id, c)
			"interlock": _interlock(id, c)
			"sink": _sink(c)
			"reformer": _reformer(id, c)          # 0.14 (L28): the primary steam reformer
			"co2_removal": _co2_removal(id, c)    # 0.14 (L28): absorber and regenerator
			"methanator": _methanator(id, c)      # 0.14 (L28)
			"valve": _valve(c + Vector3(0, 0.9, 0), Vector3(1, 0, 0), 0.14, plant); _box(Vector3(0.5, 0.9, 0.4), c + Vector3(0, 0.45, 0), M.paint_grey, plant)   # 0.14: a control valve on a plinth (board levels)
			_: _box(Vector3(1.0, 1.0, 1.0), c + Vector3(0, 0.5, 0), M.steel_dull, plant)
		_plate(id, c, ty)
		anchors[id] = c + Vector3(0, _height(ty) * 0.6, 0); radius[id] = 1.0
	_at = at
	var minz := 1e9
	for id3 in at: minz = minf(minz, (at[id3] as Vector3).z)
	_rack_z = clampf(minz - 3.1, HALL_MIN.z + 1.1, HALL_MAX.z - 8.0) if not at.is_empty() else -11.0   # behind the plant (a converter's platform reaches 2 m back)
	if _lid == "L04":   # the exam bridge: an inspector's stand and a sample bomb by the reactor
		for id4 in at: if str(_types[id4]) == "stoich_reactor": _exam_props(at[id4])
	_ctr = Vector3.ZERO; _span = 4.0
	if not at.is_empty():   # the cameras frame the plant the player drew, wherever it sits on the grid
		var lo := Vector3(1e9, 0, 1e9); var hi := Vector3(-1e9, 0, -1e9)
		for id2 in at: var v: Vector3 = at[id2]; lo = Vector3(minf(lo.x, v.x), 0, minf(lo.z, v.z)); hi = Vector3(maxf(hi.x, v.x), 0, maxf(hi.z, v.z))
		_ctr = (lo + hi) * 0.5; _span = maxf(hi.x - lo.x, hi.z - lo.z) + 4.0
	var rk := {}   # 0.14 (L28): the recycle compressor is the one fed from the purge splitter or the separator; the syngas compressor of the Works is not
	for s0 in p.get("streams", []):
		var f0 := str(s0.get("from", {}).get("unit", "")); var t0 := str(s0.get("to", {}).get("unit", ""))
		if str(_types.get(t0, "")) == "compressor" and str(_types.get(f0, "")) in ["splitter", "flash", "nh3_sep"]: rk[t0] = true
	var k := 0
	for s in p.get("streams", []):
		var fu := str(s.get("from", {}).get("unit", "")); var tu := str(s.get("to", {}).get("unit", ""))
		if not at.has(fu) or not at.has(tu): continue
		if not _out.has(fu): _out[fu] = str(s.id)
		if _lid == "L09" and (str(_types[fu]) in ["stoich_reactor", "stack"] or str(_types[tu]) in ["stoich_reactor", "stack"]): continue   # 0.13: the bench has its own tubing; a rack pipe rose out of the bomb cabinet
		var a: Vector3 = at[fu]; var b: Vector3 = at[tu]
		var y := 2.38 if k % 2 == 0 else 3.28   # phase C: every run lies on one of the rack's two levels
		var zr := _rack_z
		var xa := _corridor(a.x + 0.6, a.z, zr, y, [fu, tu]); var xb := _corridor(b.x - 0.6, b.z, zr, y, [fu, tu])   # 0.14: a run to the rack goes round the units in its way, never through them
		var pts := [a + Vector3(0.6, 0.9, 0), a + Vector3(0.6, y, 0)]
		if absf(xa - (a.x + 0.6)) > 0.01: pts.append(Vector3(xa, y, a.z))
		pts.append_array([Vector3(xa, y, zr), Vector3(xb, y, zr)])
		if absf(xb - (b.x - 0.6)) > 0.01: pts.append(Vector3(xb, y, b.z))
		pts.append_array([Vector3(b.x - 0.6, y, b.z), b + Vector3(-0.6, 0.9, 0)])
		var recyc: bool = _loop and ((rk.has(fu) or rk.has(tu)) if not rk.is_empty() else (str(_types.get(fu, "")) == "compressor" or str(_types.get(tu, "")) == "compressor"))
		_pipe(pts, 0.09 if not recyc else 0.13, (M.clad if k % 2 == 0 else M.steel_dull) if not recyc else _loop_paint(), plant, true)
		if recyc:   # chapter 5: the recycle line is the loop's own colour, with flow arrows stencilled along its rack run
			var a0: Vector3 = pts[2]; var a1: Vector3 = pts[3]; var dd := (a1 - a0)
			for q in 3: if dd.length() > 1.0: var cone := _cyl(0.0, 0.28, a0 + dd * (0.25 + 0.25 * q) + Vector3(0, 0.2, 0), _flat(Color(0.78, 0.74, 0.66), 0.0, 0.5), plant, 0.12, 12); cone.look_at(cone.position + dd.normalized(), Vector3.UP); cone.rotate_object_local(Vector3.RIGHT, -PI * 0.5)
		if absf(b.x - a.x) > 2.2: _valve(Vector3((a.x + b.x) * 0.5, y, zr), Vector3(signf(b.x - a.x), 0, 0), 0.09, plant)   # a block valve on each line
		k += 1
	# pipe rack posts along the main run
	if at.size() > 1:   # phase C: a two-level pipe rack under the pipe runs, spanning the plant only
		var x0 := 1e9; var x1 := -1e9
		for id2 in at: x0 = minf(x0, (at[id2] as Vector3).x); x1 = maxf(x1, (at[id2] as Vector3).x)
		_rack(Vector3(x0 + 0.6, 0, _rack_z), Vector3(x1 - 0.6, 0, _rack_z), 2.2, plant, 4.0)
	if not at.is_empty():   # phase C: high-bay downlights over the player's plant (shafts in the hall's fog), rebuilt with it
		var n := clampi(int(_span / 7.0) + 1, 2, 5)
		for i in n:
			var sx := _ctr.x - _span * 0.4 + _span * 0.8 * float(i) / float(maxi(1, n - 1))
			var sp := SpotLight3D.new(); sp.light_specular = 0.05; sp.light_color = Color(1.0, 0.94, 0.86); sp.light_energy = (8.0 if tier != "compat" else 1.2); sp.spot_range = 22.0; sp.spot_angle = 40.0   # 0.13 (Sigrid: "warm pools on the floor with no source"): wide, near-white, low specular: hall light, not a fire
			sp.light_volumetric_fog_energy = 1.0; sp.shadow_enabled = i % 2 == 0; sp.position = Vector3(sx, 15.5, _ctr.z + 1.0); plant.add_child(sp); sp.rotation_degrees.x = -90
			_cyl(0.5, 0.25, Vector3(sx, 15.8, _ctr.z + 1.0), M.paint_grey, plant); _cyl(0.42, 0.02, Vector3(sx, 15.67, _ctr.z + 1.0), _flat(Color(0.8, 0.8, 0.8), 0, 0.3, Color(1.0, 0.9, 0.75), 3.0), plant)
	var hb := 0
	for id5 in at:   # warm high-bay spots over the converters and beds, so the row is lit from above and not only glowing
		if str(_types[id5]) in ["eq_bed", "eq_reactor"] and hb < 3:
			var hc: Vector3 = at[id5]; hb += 1
			var hs := SpotLight3D.new(); hs.light_color = Color(1.0, 0.82, 0.6); hs.light_energy = 20.0 if tier != "compat" else 2.5; hs.spot_range = 17.0; hs.spot_angle = 26.0; hs.light_specular = 0.0
			hs.position = Vector3(hc.x + 1.5, 12.5, hc.z + 5.5); plant.add_child(hs); hs.look_at(hc + Vector3(0, 3.5, 0), Vector3.UP); hs.spot_angle = 16.0; hs.light_energy *= 0.6   # 0.13: aimed at the shell from the front, so its pool lands on the vessel and behind it, not on bare floor beside it (Sigrid's L10-L12 "pool with no source")
			_cyl(0.4, 0.2, Vector3(hc.x, 12.6, hc.z + 0.6), M.paint_grey, plant, 0.3); _cyl(0.34, 0.02, Vector3(hc.x, 12.49, hc.z + 0.6), _flat(Color(0.8, 0.8, 0.8), 0, 0.3, Color(1.0, 0.85, 0.65), 3.0), plant)
	_board = null
	if DisplayScene.UNITS.has(_lid): _board = HallBoards.new(); _board.build(self, _lid)   # 0.14: each board level's subject (gauges, sensors, cards, blinds, meters, crane, pump legs)
	print("LOOK2 gen: %d units, %d pipes" % [at.size(), k])
	set_camera(_preset)   # re-frame the new plant

## Phase D (art pass): a unit's name is a small stamped plate on its skirt, leg or saddle (a plate and a Label3D that is part of the world, facing front), not a
## billboard floating over it; the screen-space label is _hov, for the hovered or selected unit only.
func _plate_at(ty: String) -> Array:   # [x, y, z, half-width of a tie bar between legs (0 = none)] from the unit's floor centre; the unit's front is +z
	match ty:
		"eq_reactor": return [0.0, 0.55, 0.985, 0.0]
		"gasifier": return [0.0, 0.7, 0.835, 0.0]
		"eq_bed": return [0.0, 0.42, 0.54, 0.54]
		"stoich_reactor": return [0.0, 0.38, 0.33, 0.33]
		"product": return [0.0, 0.4, 0.72, 0.72]
		"nh3_sep": return [0.0, 0.5, 0.59, 0.0]
		"burner", "co_burner": return [0.5, 0.78, 0.93, 0.0]
		"heater": return [0.0, 0.5, 0.9, 1.1]
		"boiler": return [0.0, 0.62, 0.53, 0.0]
		"compressor": return [-0.8, 0.12, 0.605, 0.0]
		"mixer", "mixer3": return [0.0, 0.62, 0.29, 0.0]
		"feed": return [0.0, 0.05, 0.455, 0.0]
		"stack": return [0.0, 0.4, 0.74, 0.0]
		"vent", "flare": return [0.0, 0.15, 0.46, 0.0]
		"hx": return [0.0, 0.94, 0.45, 0.0]
		"cooler": return [0.0, 0.88, 0.31, 0.0]
		"splitter": return [0.0, 0.45, 0.0, 0.7]
		"batch": return [0.0, 0.55, 0.652, 0.0]
	return [0.0, 0.4, 0.5, 0.0]

func _plate(id: String, c: Vector3, ty: String) -> void:
	var o := _plate_at(ty)
	if ty == "packed_bed" and _beds.has(id): o = [0.0, 0.5, float(_beds[id].r) * 0.98 + 0.004, 0.0]   # on the skirt, under the window
	if _lid == "L09" and ty == "stoich_reactor": o = [0.6, 0.82, 0.556, 0.0]   # on the bench's front edge
	if _lid == "L09" and ty == "stack": o = [0.0, 1.0, 0.03, 0.0]
	var p := c + Vector3(o[0], o[1], o[2])
	if float(o[3]) > 0.0: _box(Vector3(float(o[3]) * 2.0 + 0.1, 0.05, 0.02), p + Vector3(0, -0.02, -0.004), M.paint_grey, plant)   # a tie bar between the legs carries the plate
	_box(Vector3(0.34, 0.13, 0.012), p + Vector3(0, 0, 0.006), _flat(Color(0.74, 0.75, 0.76), 0.85, 0.35), plant)   # the stamped plate
	var l := Label3D.new(); l.text = id; l.font = load("res://ui/fonts/Archivo-Variable.ttf"); l.font_size = 40; l.pixel_size = 0.0016; l.outline_size = 0; l.shaded = true; l.double_sided = false
	l.modulate = Color(0.08, 0.09, 0.1); l.position = p + Vector3(0, 0, 0.0128); plant.add_child(l)

## The hovered unit's name (or the selected one's) as a screen-space label; nothing else in the hall is a billboard.
func _hover_id() -> String:
	if app == null or cam == null or not visible: return ""
	var pw = app.get("plant_world")
	if pw != null and str(pw.get("selected_id")) != "" and _at.has(str(pw.get("selected_id"))): return str(pw.get("selected_id"))
	var vp := get_viewport()
	if vp == null or vp.gui_get_hovered_control() != null: return ""
	var hv := pick(vp.get_mouse_position())
	return hv if _at.has(hv) else ""

func _height(ty: String) -> float:
	match ty:
		"reformer": return 9.0
		"co2_removal": return 9.5
		"methanator": return 4.6
		"packed_bed": return 3.6
		"batch": return 2.3
		"column": return 12.0
		"fermenter": return 7.0
		"tubular": return 9.0
		"cstr": return 5.0
		"relief": return 2.7
		"absorber": return 9.0
		"hno3_absorber": return 12.5
		"gauze_burner": return 3.7
		"flash": return 4.6
		"interlock": return 1.6
		"sink": return 0.3
		"n2o_abater": return 2.4
		"splitter": return 1.6
		"cooler": return 2.0
		"hx": return 2.6
		"heater": return 7.9
		"gasifier": return 6.2
		"co_burner": return 2.6
		"eq_reactor": return 7.0
		"eq_bed": return 3.4
		"compressor": return 1.6
		"boiler": return 2.6
		"nh3_sep": return 4.2
		"product": return 3.4
		"vent", "flare": return 6.0
		"stack": return 9.4
		"burner": return 2.5
		"stoich_reactor": return 2.9
		"feed": return 1.8
	return 1.2

## 0.14: the x of a clear corridor for a pipe run from (x, z0) to the rack at z1 at height y: the nearest offset whose path crosses no other unit's footprint
## (a unit lower than the run does not block it). Falls back to x when nothing within 5 m is clear.
func _corridor(x: float, z0: float, z1: float, y: float, skip: Array) -> float:
	var lo := minf(z0, z1); var hi := maxf(z0, z1)
	for off in [0.0, 0.7, -0.7, 1.4, -1.4, 2.1, -2.1, 2.8, -2.8, 3.6, -3.6, 4.5, -4.5]:
		var xc := x + float(off); var clear := true
		for id in _at:
			if skip.has(id): continue
			var e := _ext(str(_types[id])); var u: Vector3 = _at[id]
			if float(e[4]) < y - 0.3: continue
			if xc > u.x + float(e[0]) - 0.35 and xc < u.x + float(e[1]) + 0.35 and hi > u.z + float(e[2]) - 0.2 and lo < u.z + float(e[3]) + 0.2: clear = false; break
		if clear: return xc
	return x

## 0.14 (D-14-1): the display plant of a board level, in the engine's plant format, from DisplayScene.UNITS: the classic scene's types mapped to the hall's
## models; consecutive units joined by a pipe (the Career joins only the units of one plant).
const BOARD_TYPE := {"converter": "eq_reactor"}
static func board_plant(lid: String) -> Dictionary:
	var units: Array = []; var streams: Array = []; var seen := {}
	var prev := ""; var prev_tag := ""
	for e in DisplayScene.UNITS[lid]:
		var tag := str(e[4]); var id := tag
		if lid == "CAREER" or seen.has(id):
			seen[tag] = int(seen.get(tag, 0)) + 1; id = "%s-%d" % [tag, int(seen[tag])]
		else: seen[id] = 1
		units.append({"id": id, "type": BOARD_TYPE.get(str(e[0]), str(e[0])), "pos": {"x": e[1], "y": e[2]}, "params": {}})
		if prev != "" and (lid != "CAREER" or tag == prev_tag): streams.append({"id": "S%d" % streams.size(), "from": {"unit": prev}, "to": {"unit": id}})
		prev = id; prev_tag = tag
	return {"units": units, "streams": streams}

# ---- models -------------------------------------------------------------------------------------------------------------------------------------
func _feed(c: Vector3, i: int) -> void:
	var cols := [Color(0.25, 0.45, 0.32), Color(0.62, 0.62, 0.6), Color(0.6, 0.2, 0.15), Color(0.2, 0.3, 0.55)]
	var m := _paint(cols[i % cols.size()])
	for k in 6:
		var p := c + Vector3((k % 3) * 0.32 - 0.32, 0, (k / 3) * 0.32 - 0.16)
		_cyl(0.13, 1.5, p + Vector3(0, 0.75, 0), m, plant); _sph(0.13, p + Vector3(0, 1.5, 0), m, plant, true); _cyl(0.04, 0.12, p + Vector3(0, 1.68, 0), M.brass, plant)
	_seg(c + Vector3(-0.5, 1.8, 0), c + Vector3(0.6, 1.8, 0), 0.04, M.brass, plant)
	_box(Vector3(1.3, 0.1, 0.9), c + Vector3(0, 0.05, 0), M.plate, plant)

func _mixer(c: Vector3) -> void:
	var pm := _paint(Color(0.55, 0.56, 0.56))
	var cy := _cyl(0.4, 1.6, c + Vector3(0, 0.9, 0), pm, plant); cy.rotation_degrees.z = 90
	for x in [-0.8, 0.8]: _sph(0.4, c + Vector3(x, 0.9, 0), pm, plant)
	for x in [-0.5, 0.5]: _box(Vector3(0.12, 0.7, 0.6), c + Vector3(x, 0.35, 0), M.yellow, plant)

func _compressor(c: Vector3) -> void:
	_box(Vector3(2.6, 0.25, 1.2), c + Vector3(0, 0.12, 0), M.yellow, plant)
	var cs := _cyl(0.55, 1.2, c + Vector3(-0.5, 0.85, 0), _paint(Color(0.2, 0.32, 0.5)), plant); cs.rotation_degrees.z = 90
	var mo := _cyl(0.4, 0.9, c + Vector3(0.75, 0.75, 0), _paint(Color(0.1, 0.25, 0.2)), plant); mo.rotation_degrees.z = 90
	for i in 6: _torus(0.42, 0.03, c + Vector3(0.45 + i * 0.12, 0.75, 0), M.black, plant).rotation_degrees.z = 90

## The band you read the unit's temperature on. Cold it is bare steel (it was near-black: a hole in the shell), hot it is a blackbody (see _blackbody).
func _glowmat(window := false) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = Color(0.1, 0.1, 0.11) if window else Color(0.5, 0.52, 0.55); m.metallic = 0.55; m.roughness = 0.42 if not window else 0.25
	m.emission_enabled = true; m.emission = Color(1.0, 0.4, 0.1); m.emission_energy_multiplier = 0.0
	return m

## Blackbody glow of a steel surface at T (K): invisible below ~450 C, dull red at 450 C to orange at 650 C; the emission energy is capped at 1.5 so it never blows to white.
func _blackbody(T: float) -> Array:   # [colour, emission energy]
	var t := clampf((T - 273.15 - 450.0) / 200.0, 0.0, 1.0)
	if T <= 0.0 or T - 273.15 <= 450.0: return [Color(0.55, 0.07, 0.02), 0.0]
	return [Color(0.55, 0.07, 0.02).lerp(Color(1.0, 0.42, 0.08), t), 0.2 + 1.3 * t]

func _converter(id: String, c: Vector3) -> void:   # phase C: a real pressure vessel (dished heads, clad with seams, nozzles, manway, caged ladder, platform)
	var sh := _shader("steel", {"rough_base": 0.3, "metallic": 0.8, "blotch": 0.15, "streak": Vector3(140.0, 6.0, 140.0)})
	_vessel(c, 1.0, 5.6, sh, plant, LADDER.merged({"clad": true, "base": 0.9}))
	var gm := _glowmat(); var w := _cyl(1.03, 0.5, c + Vector3(0, 2.4, 0), gm, plant, -1.0, 40); w.name = "window"
	var l := OmniLight3D.new(); l.light_color = Color(1.0, 0.45, 0.15); l.light_energy = 0.0; l.light_specular = 0.0; l.omni_range = 3.2; l.position = c + Vector3(0, 2.4, 1.2); plant.add_child(l)   # close to the shell: the pool it throws is under its own glow
	_glow[id] = {"mat": gm, "light": l, "kind": "converter", "lampk": 0.6}

func _bed(id: String, c: Vector3) -> void:
	var sh := _shader("steel", {"rough_base": 0.32, "metallic": 0.8, "blotch": 0.2})
	_vessel(c, 0.9, 2.4, sh, plant, {"legs": true, "base": 0.7})
	var gm := _glowmat(); _cyl(0.92, 0.9, c + Vector3(0, 1.9, 0), gm, plant, -1.0, 36)   # the catalyst band you can read: dark when cold, orange when working, red-white when sintering
	var l := OmniLight3D.new(); l.light_color = Color(1.0, 0.45, 0.15); l.light_energy = 0.0; l.light_specular = 0.0; l.omni_range = 4.0; l.position = c + Vector3(0, 1.9, 1.3); plant.add_child(l)
	_glow[id] = {"mat": gm, "light": l, "kind": "bed"}

func _boiler(id: String, c: Vector3) -> void:
	# waste-heat boiler: clad horizontal shell with dished ends on saddles, a steam drum above with risers, a safety valve
	_drum(c + Vector3(0, 1.1, 0), 0.7, 2.6, M.clad, plant, true)
	_drum(c + Vector3(0, 2.45, 0), 0.32, 1.8, _paint(Color(0.32, 0.42, 0.36)), plant)
	for x in [-0.5, 0.0, 0.5]: _seg(c + Vector3(x, 1.75, 0), c + Vector3(x, 2.15, 0), 0.06, M.steel_dull, plant)
	_seg(c + Vector3(0.6, 2.75, 0), c + Vector3(0.6, 3.25, 0), 0.08, M.steel_dull, plant); _flange(c + Vector3(0.6, 3.25, 0), Vector3.UP, 0.08, plant)
	for sg in [-1.0, 1.0]:   # bolted channel heads at both ends: a flange pair and a ring of bolt heads where each dished head meets the barrel
		var ff := _cyl(0.8, 0.14, c + Vector3(sg * 1.3, 1.1, 0), M.steel_dull, plant, -1.0, 36); ff.rotation_degrees.z = 90
		for i in 18:
			var a := i * TAU / 18.0
			var bh := _cyl(0.028, 0.06, c + Vector3(sg * 1.3 + sg * 0.09, 1.1 + sin(a) * 0.74, cos(a) * 0.74), M.black, plant, -1.0, 8); bh.rotation_degrees.z = 90
	for sa in [0.9, -0.9]:   # two long cladding seams, and the straps over the bands
		_box(Vector3(2.6, 0.022, 0.022), c + Vector3(0, 1.1 + cos(sa) * 0.712, sin(sa) * 0.712), M.steel_dull, plant)
	var brass := _flat(Color(0.78, 0.6, 0.3), 1.0, 0.3)
	_seg(c + Vector3(-0.5, 2.7, 0), c + Vector3(-0.5, 2.85, 0), 0.05, M.steel_dull, plant); _flange(c + Vector3(-0.5, 2.85, 0), Vector3.UP, 0.05, plant)   # safety valve on the steam drum: base, body, spring bonnet, lever, tail pipe
	_cyl(0.06, 0.2, c + Vector3(-0.5, 3.0, 0), brass, plant); _cyl(0.04, 0.28, c + Vector3(-0.5, 3.24, 0), M.steel_dull, plant); _sph(0.035, c + Vector3(-0.5, 3.4, 0), brass, plant)
	_seg(c + Vector3(-0.5, 3.12, 0), c + Vector3(-0.15, 3.3, 0), 0.01, M.steel_dull, plant); _seg(c + Vector3(-0.44, 3.02, 0), c + Vector3(-0.2, 3.02, 0), 0.02, M.steel_dull, plant); _seg(c + Vector3(-0.2, 3.02, 0), c + Vector3(-0.2, 2.6, 0.0), 0.02, M.steel_dull, plant)
	var glass := _flat(Color(0.75, 0.88, 0.95), 0.0, 0.1); glass.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; glass.albedo_color.a = 0.35   # the gauge glass on the steam drum's front
	for gy in [2.28, 2.62]: _seg(c + Vector3(0.55, gy, 0.27), c + Vector3(0.55, gy, 0.38), 0.02, brass, plant); _cyl(0.04, 0.06, c + Vector3(0.55, gy, 0.38), brass, plant)
	_seg(c + Vector3(0.55, 2.28, 0.38), c + Vector3(0.55, 2.62, 0.38), 0.018, glass, plant); _seg(c + Vector3(0.55, 2.28, 0.38), c + Vector3(0.55, 2.5, 0.38), 0.012, _flat(Color(0.2, 0.45, 0.65), 0.0, 0.2), plant)
	_kind[id] = "boiler"
	_steam[id] = _particles(c + Vector3(0.6, 3.35, 0), 30, 3.0, Vector3(0, 1.6, 0), 12.0, 0.6, Color(0.92, 0.94, 0.96, 0.4), plant, 3.0)

func _separator(c: Vector3) -> void:
	_vessel(c, 0.6, 3.0, _shader("steel", {"rough_base": 0.4, "frost": 0.5, "frost_h": 1.2, "metallic": 0.6}), plant, {"base": 0.8})

func _tank(c: Vector3) -> void:
	_vessel(c, 1.2, 2.4, _coat(Color(0.6, 0.63, 0.61), 0.45, 0.7, 0.5, 0.15), plant, {"legs": true, "base": 0.6})

func _vent(id: String, c: Vector3) -> void:
	_cyl(0.25, 6.0, c + Vector3(0, 3.0, 0), M.rust, plant)
	_cyl(0.45, 0.3, c + Vector3(0, 0.15, 0), M.paint_grey, plant)
	for k in 3: _seg(c + Vector3(0, 6.0, 0), c + Vector3(cos(k * TAU / 3.0) * 2.0, 0.05, sin(k * TAU / 3.0) * 2.0), 0.01, M.steel_dull, plant, 4)   # guy wires
	_steam[id] = _particles(c + Vector3(0, 6.2, 0), 20, 4.0, Vector3(0, 1.2, 0), 10.0, 0.8, Color(0.7, 0.7, 0.72, 0.3), plant, 3.0)

## Phase C (chapter 1): the stack with its flue analyser. A tapered brick-red stack with a sampling platform; at the base, the analyser cabinet
## whose screen reads the engine's stack composition (y_O2, y_CO2, y_SO2, y_CO, y_H2O) in mol %.
## 0.12 (chapter 2, L07/L08): a horizontal shell-and-tube exchanger on two saddles: a flanged channel head with a pass-partition bonnet, a dished rear head, shell
## nozzles top and bottom with flanges, channel nozzles, a nameplate. Green enamel with CW stubs for a cooler; grey heat paint for a process exchanger.
func _exchanger(c: Vector3, L: float, r: float, paint: Material, cw: bool) -> void:
	var y := r + 0.75
	var sh := _cyl(r, L, c + Vector3(0, y, 0), paint, plant, -1.0, 36); sh.rotation_degrees.z = 90
	_cyl(r + 0.12, 0.12, c + Vector3(-L * 0.5, y, 0), M.steel_dull, plant, -1.0, 36).rotation_degrees.z = 90   # girth flange
	var ch := _cyl(r, 0.7, c + Vector3(-L * 0.5 - 0.41, y, 0), paint, plant, -1.0, 36); ch.rotation_degrees.z = 90   # channel
	_cyl(r + 0.12, 0.1, c + Vector3(-L * 0.5 - 0.8, y, 0), M.steel_dull, plant, -1.0, 36).rotation_degrees.z = 90   # cover flange
	for i in 16: var a := i * TAU / 16.0; _cyl(0.025, 0.2, c + Vector3(-L * 0.5 - 0.8, y + sin(a) * (r + 0.07), cos(a) * (r + 0.07)), M.steel_dull, plant).rotation_degrees.z = 90   # cover bolts
	_sph(r, c + Vector3(L * 0.5, y, 0), paint, plant, true).rotation_degrees.z = -90   # rear head
	for sx in [-L * 0.3, L * 0.3]:   # saddles with a wear plate and a base plate
		_box(Vector3(0.25, y - 0.15, r * 1.6), c + Vector3(sx, (y - 0.15) * 0.5, 0), M.paint_grey, plant)
		_box(Vector3(0.4, 0.03, r * 1.9), c + Vector3(sx, 0.015, 0), M.steel_dull, plant)
	for nz in [[-L * 0.32, 1.0], [L * 0.32, -1.0]]:   # shell nozzles: in at the top, out at the bottom
		_seg(c + Vector3(nz[0], y + nz[1] * r * 0.9, 0), c + Vector3(nz[0], y + nz[1] * (r + 0.35), 0), 0.09, M.steel_dull, plant)
		_cyl(0.17, 0.05, c + Vector3(nz[0], y + nz[1] * (r + 0.35), 0), M.steel_dull, plant)
	for nz2 in [0.35, -0.35]:   # channel nozzles (the tube side)
		var cp := c + Vector3(-L * 0.5 - 0.41, y + nz2 * r * 1.5, 0)
		_seg(cp, cp + Vector3(0, 0, 0.5 + r), 0.08, M.paint_green if cw else M.steel_dull, plant)
		var f := _cyl(0.15, 0.05, cp + Vector3(0, 0, 0.5 + r), M.steel_dull, plant); f.rotation_degrees.x = 90
	_box(Vector3(0.28, 0.18, 0.01), c + Vector3(0.0, y, r + 0.005), _flat(Color(0.8, 0.72, 0.45), 0.8, 0.35), plant)   # nameplate

## A peep window recessed in a short open tube: the sleeve out from the wall to `len`, a black liner, the glass set back at the wall. `dir` is the wall's outward axis.
func _peep(p: Vector3, dir: Vector3, r: float, len: float, glass: Material) -> void:
	var q := Basis(Quaternion(Vector3.UP, dir))
	var tube := _lathe(PackedVector2Array([Vector2(r + 0.04, 0.0), Vector2(r + 0.04, len), Vector2(r, len), Vector2(r, 0.0)]), 24, M.steel_dull, p, plant, false); tube.basis = q
	var liner := _lathe(PackedVector2Array([Vector2(r - 0.004, len), Vector2(r - 0.004, 0.0)]), 24, _flat(Color(0.03, 0.03, 0.03), 0.0, 0.9), p, plant, false); liner.basis = q
	var gl := _cyl(r * 0.99, 0.02, p + dir * 0.02, glass, plant, -1.0, 24); gl.basis = q

## 0.12 (chapter 2): a box fired heater: a radiant firebox in heat paint on legs with a peep window that glows with the fire, a convection section above it with
## a header box, a stack with a damper, a ladder and a platform at the convection level. Its fire follows the outlet temperature, like the burner.
func _heater(id: String, c: Vector3) -> void:
	# art pass: a radiant box of grey panels (world-space noise, soot toward the top), L-angle stiffener ribs every 0.8 m, a tapered breeching into the stack, a rain
	# hood on three struts, peepholes recessed in tubes with a flickering light, and three floor burner throats under the box with faint glowing rings.
	var panel := _shader("panel", {"soot_y0": 3.2, "soot_y1": 5.8})
	for lx in [-1.1, 1.1]: for lz in [-0.9, 0.9]: _box(Vector3(0.2, 1.0, 0.2), c + Vector3(lx, 0.5, lz), M.paint_grey, plant)   # legs
	_box(Vector3(2.6, 3.2, 2.2), c + Vector3(0, 2.6, 0), panel, plant)   # radiant box
	for k in 4:   # horizontal L-angle ribs every 0.8 m, one leg on the wall and one standing out, on all four faces
		var ry := 1.4 + 0.8 * float(k)
		for sz in [-1.0, 1.0]:
			_box(Vector3(2.62, 0.08, 0.012), c + Vector3(0, ry, sz * 1.106), M.steel_dull, plant); _box(Vector3(2.62, 0.012, 0.07), c + Vector3(0, ry - 0.034, sz * 1.135), M.steel_dull, plant)
		for sx in [-1.0, 1.0]:
			_box(Vector3(0.012, 0.08, 2.22), c + Vector3(sx * 1.306, ry, 0), M.steel_dull, plant); _box(Vector3(0.07, 0.012, 2.22), c + Vector3(sx * 1.335, ry - 0.034, 0), M.steel_dull, plant)
	for x in [-1.3, 1.3]: for z in [-1.1, 1.1]: _box(Vector3(0.07, 3.24, 0.07), c + Vector3(x, 2.6, z), M.steel_dull, plant)   # corner buckstays
	_box(Vector3(2.0, 1.2, 1.6), c + Vector3(0, 4.8, 0), panel, plant)   # convection section
	for k in 2:
		for sz in [-1.0, 1.0]: _box(Vector3(2.02, 0.08, 0.012), c + Vector3(0, 4.4 + 0.8 * float(k), sz * 0.806), M.steel_dull, plant)
	_box(Vector3(2.1, 0.3, 0.3), c + Vector3(0, 4.8, 0.95), M.steel_dull, plant)   # header box
	_cyl(0.92, 0.9, c + Vector3(0, 5.85, 0), panel, plant, 0.38, 32)   # the breeching: a frustum from the box to the stack
	_cyl(0.38, 1.1, c + Vector3(0, 6.85, 0), M.steel_dull, plant, 0.33, 32)   # stack
	_cyl(0.7, 0.34, c + Vector3(0, 7.75, 0), M.steel_dull, plant, 0.0, 24)   # rain hood: a cone ...
	for k in 3: var a := k * TAU / 3.0 + 0.4; _seg(c + Vector3(cos(a) * 0.33, 7.4, sin(a) * 0.33), c + Vector3(cos(a) * 0.46, 7.62, sin(a) * 0.46), 0.012, M.steel_dull, plant)   # ... on three struts
	_box(Vector3(2.8, 0.05, 0.8), c + Vector3(0, 4.2, 1.5), M.plate, plant)   # platform
	for sx in [-1.4, 1.4]: _seg(c + Vector3(sx, 4.2, 1.9), c + Vector3(sx, 5.2, 1.9), 0.02, M.steel_dull, plant)
	_seg(c + Vector3(-1.4, 5.2, 1.9), c + Vector3(1.4, 5.2, 1.9), 0.02, M.steel_dull, plant)
	for sx2 in [-0.2, 0.2]: _seg(c + Vector3(1.6 + sx2, 0, 1.4), c + Vector3(1.6 + sx2, 4.2, 1.4), 0.02, M.yellow, plant)   # ladder
	for i in 13: _seg(c + Vector3(1.4, 0.3 + i * 0.3, 1.4), c + Vector3(1.8, 0.3 + i * 0.3, 1.4), 0.012, M.yellow, plant)
	var gm := _glowmat(true)
	for sg in [1.0, -1.0]: _peep(c + Vector3(0, 1.6, sg * 1.1), Vector3(0, 0, sg), 0.15, 0.28, gm)   # peepholes, recessed
	var ring := _flat(Color(0.2, 0.08, 0.04), 0.3, 0.5, Color(1.0, 0.4, 0.1), 0.0)
	for bx in [-0.7, 0.0, 0.7]:   # floor burner throats under the box
		_cyl(0.2, 0.4, c + Vector3(bx, 0.2, 0.0), M.steel_dull, plant, 0.17, 20)
		_torus(0.19, 0.018, c + Vector3(bx, 0.41, 0.0), ring, plant)
		_cyl(0.16, 0.02, c + Vector3(bx, 0.42, 0.0), ring, plant, -1.0, 20)   # the glowing throat itself
	var l := OmniLight3D.new(); l.light_color = Color(1.0, 0.5, 0.2); l.light_energy = 0.0; l.light_specular = 0.0; l.omni_range = 5.0; l.position = c + Vector3(0, 0.6, 1.3); plant.add_child(l)   # at the base: the glow lands on the floor and the legs
	_glow[id] = {"mat": gm, "light": l, "kind": "burner", "window": true, "extra": [ring], "flick": true, "lampk": 2.2, "ringk": 1.1}

## 0.12 (chapter 2, L07): a moving-bed coke gasifier: a refractory-lined shell in heat paint on a skirt, a coke hopper and lock on top, a cone bottom to an ash
## lock, air tuyeres round the base, a sight glass that glows with the bed, a gas offtake near the top, a caged ladder and a top platform.
func _gasifier(id: String, c: Vector3) -> void:
	_vessel(c, 0.85, 3.6, M.heat_paint, plant, LADDER.merged({"base": 1.4}))
	_lathe(PackedVector2Array([Vector2(0.85, 0), Vector2(0.25, -0.8), Vector2(0.25, -1.0), Vector2(0.0, -1.0)]), 32, M.heat_paint, c + Vector3(0, 1.4, 0), plant, true)   # cone bottom
	_box(Vector3(0.5, 0.5, 0.5), c + Vector3(0, 0.25, 0), M.steel_dull, plant)   # ash lock
	_lathe(PackedVector2Array([Vector2(0.0, 0), Vector2(0.2, 0), Vector2(0.6, 0.9), Vector2(0.6, 1.2), Vector2(0.0, 1.2)]), 24, M.steel_dull, c + Vector3(0, 5.6, 0), plant, true)   # coke hopper
	_cyl(0.22, 0.4, c + Vector3(0, 5.4, 0), M.steel_dull, plant)   # coal lock
	for i in 8: var a := i * TAU / 8.0; _seg(c + Vector3(cos(a) * 0.86, 1.9, sin(a) * 0.86), c + Vector3(cos(a) * 1.15, 1.75, sin(a) * 1.15), 0.05, M.steel_dull, plant)   # air tuyeres
	_lathe(PackedVector2Array([Vector2(1.0, 0), Vector2(1.18, 0), Vector2(1.18, 0.18), Vector2(1.0, 0.18)]), 32, M.steel_dull, c + Vector3(0, 1.7, 0), plant, false)   # bustle main
	_seg(c + Vector3(0.85, 4.6, 0), c + Vector3(1.5, 4.6, 0), 0.16, M.steel_dull, plant)   # gas offtake
	var gm := _glowmat(true); _peep(c + Vector3(0, 2.4, 0.84), Vector3(0, 0, 1), 0.12, 0.2, gm)   # sight glass on the bed, recessed in a tube
	var l := OmniLight3D.new(); l.light_color = Color(1.0, 0.5, 0.2); l.light_energy = 0.0; l.light_specular = 0.0; l.omni_range = 3.5; l.position = c + Vector3(0, 2.4, 1.6); plant.add_child(l)
	_glow[id] = {"mat": gm, "light": l, "kind": "burner", "window": true, "flick": true}

## 0.12 (chapter 2, L06): a flow splitter as it stands in a plant: a header on two stanchions, an equal tee, a block valve on each leg and a flow-control
## valve with a diaphragm actuator on the bypass leg (the split fraction is that valve's opening).
func _splitter(id: String, c: Vector3) -> void:
	var y := 1.0
	_seg(c + Vector3(-0.9, y, 0), c + Vector3(0.9, y, 0), 0.11, M.steel_dull, plant)   # header
	_seg(c + Vector3(0.0, y, 0), c + Vector3(0.0, y, 0.9), 0.11, M.steel_dull, plant)  # tee leg
	_sphere_or_box(c + Vector3(0, y, 0))
	_valve(c + Vector3(0.55, y, 0), Vector3(1, 0, 0), 0.11, plant)
	_valve(c + Vector3(0.0, y, 0.55), Vector3(0, 0, 1), 0.11, plant, Color(0.2, 0.35, 0.6))   # control valve body (blue)
	_seg(c + Vector3(0.0, y + 0.2, 0.55), c + Vector3(0.0, y + 0.5, 0.55), 0.025, M.steel_dull, plant)   # yoke
	var dome := _cyl(0.2, 0.16, c + Vector3(0.0, y + 0.6, 0.55), M.yellow, plant, 0.06); dome.name = "Actuator"   # diaphragm actuator
	for sx in [-0.7, 0.7]:
		_box(Vector3(0.08, y - 0.1, 0.08), c + Vector3(sx, (y - 0.1) * 0.5, 0), M.paint_grey, plant)   # stanchion
		_box(Vector3(0.3, 0.02, 0.3), c + Vector3(sx, 0.01, 0), M.steel_dull, plant)   # base plate
func _sphere_or_box(p: Vector3) -> void: _cyl(0.15, 0.3, p, M.steel_dull, plant)   # the tee's body

func _stack(id: String, c: Vector3) -> void:
	# 0.12 (Sigrid: "the stack reads as red cloth"): a tapered steel stack. Weathered plate (rust deepest at the base), circumferential weld seams every 1.2 m, staggered
	# vertical plate seams, a heat-tinted band under the top, soot at the lip, and a base ring with anchor bolts
	var shell := _pbr("rusty_metal_02", 0.5, Color(0.72, 0.62, 0.55), true)
	_lathe(PackedVector2Array([Vector2(0.75, 0), Vector2(0.45, 9.0), Vector2(0.5, 9.0), Vector2(0.5, 9.4), Vector2(0.0, 9.4)]), 40, shell, c, plant, true)
	var r_at := func(y: float) -> float: return 0.75 - y * 0.30 / 9.0
	_lathe(PackedVector2Array([Vector2(0.765, 0), Vector2(r_at.call(1.1) + 0.012, 1.1), Vector2(r_at.call(1.1), 1.1), Vector2(0.75, 0)]), 40, _flat(Color(0.52, 0.33, 0.22), 0.3, 0.8), c, plant, false)   # rust at the base (0.13: lighter, it read as a black hole under the work light)
	_lathe(PackedVector2Array([Vector2(r_at.call(7.6) + 0.006, 7.6), Vector2(r_at.call(8.6) + 0.006, 8.6), Vector2(r_at.call(8.6), 8.6), Vector2(r_at.call(7.6), 7.6)]), 40, _flat(Color(0.36, 0.33, 0.42), 0.6, 0.5), c, plant, false)   # heat tint
	_lathe(PackedVector2Array([Vector2(r_at.call(8.6) + 0.008, 8.6), Vector2(0.508, 9.0), Vector2(0.508, 9.42), Vector2(0.5, 9.42), Vector2(0.5, 9.0), Vector2(r_at.call(8.6), 8.6)]), 40, _flat(Color(0.05, 0.05, 0.05), 0.0, 1.0), c, plant, false)   # soot
	var yy := 1.2
	while yy < 8.9: _torus(r_at.call(yy) + 0.005, 0.014, c + Vector3(0, yy, 0), M.steel_dull, plant); yy += 1.2   # weld seams
	for k in 7:
		var a0 := float(k % 2) * PI / 3.0 + float(k / 2) * TAU / 3.0; var y0 := float(k) * 1.2
		_seg(c + Vector3(cos(a0) * (r_at.call(y0) + 0.004), y0, sin(a0) * (r_at.call(y0) + 0.004)), c + Vector3(cos(a0) * (r_at.call(y0 + 1.2) + 0.004), y0 + 1.2, sin(a0) * (r_at.call(y0 + 1.2) + 0.004)), 0.01, M.steel_dull, plant, 6)   # vertical seams, staggered
	_lathe(PackedVector2Array([Vector2(0.75, 0), Vector2(1.0, 0), Vector2(1.0, 0.06), Vector2(0.75, 0.06)]), 40, M.steel_dull, c, plant, false)   # base ring
	for i in 12: _cyl(0.03, 0.12, c + Vector3(cos(i * TAU / 12.0) * 0.9, 0.1, sin(i * TAU / 12.0) * 0.9), M.steel_dull, plant)   # anchor bolts
	_lathe(PackedVector2Array([Vector2(0.62, 0), Vector2(1.5, 0), Vector2(1.5, 0.05), Vector2(0.62, 0.05)]), 32, M.plate, c + Vector3(0, 4.0, 0), plant, false)
	_torus(1.5, 0.025, c + Vector3(0, 5.05, 0), M.steel_dull, plant); _torus(1.5, 0.02, c + Vector3(0, 4.55, 0), M.steel_dull, plant)
	for i in 10: _seg(c + Vector3(cos(i * TAU / 10.0) * 1.5, 4.05, sin(i * TAU / 10.0) * 1.5), c + Vector3(cos(i * TAU / 10.0) * 1.5, 5.05, sin(i * TAU / 10.0) * 1.5), 0.018, M.steel_dull, plant)   # Sigrid: handrail stanchions, steel not UI halos
	for sx in [-0.8, -0.4]: _seg(c + Vector3(sx, 0, 0.95), c + Vector3(sx, 5.0, 0.95), 0.02, M.yellow, plant)   # the ladder faces the front cameras (+z)
	for i in 13: _seg(c + Vector3(-0.8, 0.3 + i * 0.3, 0.95), c + Vector3(-0.4, 0.3 + i * 0.3, 0.95), 0.012, M.yellow, plant)
	var ss: Material = M.ss   # stainless
	_flange(c + Vector3(0.65, 4.3, 0), Vector3.RIGHT, 0.04, plant); _seg(c + Vector3(0.55, 4.3, 0), c + Vector3(0.7, 4.3, 0), 0.025, ss, plant)   # the probe flange on the stack wall
	_pipe([c + Vector3(0.7, 4.3, 0), c + Vector3(1.1, 4.3, 0.5), c + Vector3(1.2, 2.6, 1.0), c + Vector3(1.2, 1.72, 1.0)], 0.018, ss, plant, false)   # 0.13: 0.018 so it reads at the analyser view   # the 0.02 m stainless sample line down to the cabinet
	var cab := c + Vector3(1.5, 0, 1.1)
	_box(Vector3(0.9, 1.7, 0.6), cab + Vector3(0, 0.85, 0), _enamel(Color(0.36, 0.38, 0.4)), plant)   # grey matte instrument enamel analyser cabinet
	_box(Vector3(0.82, 0.72, 0.03), cab + Vector3(0, 1.25, 0.3), _flat(Color(0.15, 0.16, 0.17), 0.3, 0.4), plant)   # recessed bezel
	_seg(cab + Vector3(-0.3, 1.7, 0), cab + Vector3(-0.3, 2.6, 0), 0.03, M.steel_dull, plant)   # conduit up to the sample line
	var scr := _flat(Color(0.015, 0.02, 0.02), 0.0, 0.15); scr.emission_enabled = true; scr.emission = Color(0.05, 0.16, 0.12); scr.emission_energy_multiplier = 0.6   # a dark LCD that glows faintly, not a teal slab
	_box(Vector3(0.74, 0.62, 0.02), cab + Vector3(0, 1.25, 0.31), scr, plant)
	_box(Vector3(0.86, 0.03, 0.3), cab + Vector3(0, 1.62, 0.43), _flat(Color(0.5, 0.52, 0.54), 0.4, 0.5), plant).rotation_degrees.x = 12.0   # the sun hood over the screen
	for sx in [-0.42, 0.42]: _box(Vector3(0.025, 0.2, 0.28), cab + Vector3(sx, 1.53, 0.43), _flat(Color(0.5, 0.52, 0.54), 0.4, 0.5), plant)
	var seam := _flat(Color(0.08, 0.08, 0.09), 0.3, 0.6)   # the door: its seam, a handle and two hinges
	for sx2 in [-0.4, 0.4]: _box(Vector3(0.012, 1.5, 0.006), cab + Vector3(sx2, 0.85, 0.303), seam, plant)
	for sy in [0.12, 1.6]: _box(Vector3(0.8, 0.012, 0.006), cab + Vector3(0, sy, 0.303), seam, plant)
	_box(Vector3(0.03, 0.18, 0.03), cab + Vector3(0.32, 0.8, 0.32), M.steel_dull, plant)
	var cl := SpotLight3D.new(); cl.light_color = Color(0.9, 0.95, 1.0); cl.light_energy = 3.0 if tier != "compat" else 1.2; cl.spot_range = 6.0; cl.spot_angle = 50.0; cl.light_specular = 0.2   # the work light over the cabinet: it lights the stack base and the sample line
	cl.position = cab + Vector3(0.2, 3.2, 1.4); plant.add_child(cl); cl.look_at(cab + Vector3(-0.8, 0.6, -0.4), Vector3.UP)
	var t := Label3D.new(); t.name = "analyser"; t.text = "FLUE ANALYSER\n--"; t.font_size = 40; t.pixel_size = 0.0016; t.modulate = Color(0.62, 1.0, 0.72)
	t.outline_size = 0; t.position = cab + Vector3(0, 1.25, 0.33); t.width = 180.0; t.autowrap_mode = TextServer.AUTOWRAP_OFF; plant.add_child(t)
	_analyser[id] = t; _stack_at = cab   # 0.13 (Sigrid): the first line was too long for the screen (the cabinet side cut "FLUE"); it is shorter now, at full size
	_steam[id] = _particles(c + Vector3(0, 9.5, 0), 24, 5.0, Vector3(0, 1.4, 0), 10.0, 1.0, Color(0.75, 0.74, 0.72, 0.28), plant, 3.5)

## Phase C (chapter 1), rebuilt for the art pass: a fired sulfur burner as a plant has it. A horizontal refractory-lined drum on two saddles (aluminium heat paint,
## circumferential seams every 1.2 m, a brown-blue temper tint toward the flame end), a flanged burner front plate at the -x end with a sulfur gun (a thin pipe and a
## small handwheel) and an air register ring, the forced-draft fan set ducted into the register, and a peep window recessed in a short tube whose warm light lands on the
## floor. The flame and the peep glow follow the outlet temperature (_glow), as the beds do.
func _burner(id: String, c: Vector3) -> void:
	var R := 1.1; var AY := 1.4; var L := 4.4; var XC := 0.5   # shell radius, axis height, length, centre offset
	var x0 := XC - L * 0.5; var x1 := XC + L * 0.5
	var paint := _flat(Color(0.6, 0.61, 0.6), 0.45, 0.6)   # aluminium heat-resistant paint, roughness 0.6
	var sh := _cyl(R, L, c + Vector3(XC, AY, 0), paint, plant, -1.0, 40); sh.rotation_degrees.z = 90
	var temper := [Color(0.56, 0.54, 0.5), Color(0.5, 0.44, 0.36), Color(0.42, 0.34, 0.3), Color(0.3, 0.31, 0.4)]   # straw, brown, then blue where the flame ends
	for k in 4:
		var tb := _cyl(R + 0.004, 0.3, c + Vector3(x1 - 1.05 + 0.3 * k, AY, 0), _flat(temper[k], 0.45, 0.6), plant, -1.0, 40); tb.rotation_degrees.z = 90
	var hd := Node3D.new(); hd.position = c + Vector3(x1, AY, 0); hd.rotation_degrees.z = -90.0; plant.add_child(hd)
	_dished(R, Vector3.ZERO, _flat(temper[3], 0.45, 0.6), hd, true)   # the dished end at the flame end
	for i in 3:   # circumferential seams every 1.2 m
		var sm := _cyl(R + 0.012, 0.035, c + Vector3(x0 + 1.2 * float(i + 1), AY, 0), M.steel_dull, plant, -1.0, 40); sm.rotation_degrees.z = 90
	for sx in [XC - 1.3, XC + 1.3]:   # two saddles on base plates with anchor bolts
		_box(Vector3(0.3, 1.1, 1.9), c + Vector3(sx, 0.55, 0), M.paint_grey, plant)
		_box(Vector3(0.55, 0.04, 2.2), c + Vector3(sx, 0.02, 0), M.steel_dull, plant)
		for bz in [-0.95, 0.95]: for bx in [-0.2, 0.2]: _cyl(0.025, 0.05, c + Vector3(sx + bx, 0.06, bz), M.black, plant)
	# the burner front plate: the girth flange with its bolts, the mounting plate, the air register (a wind box and its ring) and the sulfur gun
	var fl0 := _cyl(R + 0.12, 0.12, c + Vector3(x0 - 0.02, AY, 0), M.steel_dull, plant, -1.0, 40); fl0.rotation_degrees.z = 90
	for i in 16:
		var a := i * TAU / 16.0
		var bh := _cyl(0.028, 0.05, c + Vector3(x0 - 0.1, AY + sin(a) * (R + 0.05), cos(a) * (R + 0.05)), M.black, plant); bh.rotation_degrees.z = 90
	var plate := _cyl(0.8, 0.12, c + Vector3(x0 - 0.14, AY, 0), M.steel_dull, plant, -1.0, 32); plate.rotation_degrees.z = 90
	for i in 8:
		var a2 := i * TAU / 8.0 + 0.2
		var bh2 := _cyl(0.026, 0.04, c + Vector3(x0 - 0.22, AY + sin(a2) * 0.68, cos(a2) * 0.68), M.black, plant); bh2.rotation_degrees.z = 90
	var wb := _cyl(0.5, 0.34, c + Vector3(x0 - 0.38, AY, 0), M.steel, plant, -1.0, 32); wb.rotation_degrees.z = 90   # wind box
	var ring := _torus(0.5, 0.04, c + Vector3(x0 - 0.56, AY, 0), M.steel_dull, plant); ring.rotation_degrees.z = 90   # air register ring
	for i in 8:
		var a3 := i * TAU / 8.0
		_box(Vector3(0.05, 0.1, 0.06), c + Vector3(x0 - 0.56, AY + sin(a3) * 0.5, cos(a3) * 0.5), M.black, plant).rotation_degrees.x = rad_to_deg(a3)   # register vanes
	var gx := x0 - 1.5
	_seg(c + Vector3(x0 - 0.3, AY, 0), c + Vector3(gx, AY, 0), 0.035, M.steel_dull, plant)   # the sulfur gun, along the burner axis
	_flange(c + Vector3(gx, AY, 0), Vector3(-1, 0, 0), 0.035, plant)
	_seg(c + Vector3(gx, AY, 0), c + Vector3(gx, AY + 0.9, 0), 0.03, M.steel_dull, plant); _sph(0.05, c + Vector3(gx, AY, 0), M.steel_dull, plant)   # the sulfur line leaves upward
	_seg(c + Vector3(gx, AY + 0.9, 0), c + Vector3(gx, AY + 0.9, -1.8), 0.03, M.steel_dull, plant); _sph(0.05, c + Vector3(gx, AY + 0.9, 0), M.steel_dull, plant)
	_seg(c + Vector3(gx + 0.4, AY, 0), c + Vector3(gx + 0.4, AY + 0.34, 0), 0.02, M.steel_dull, plant); _seg(c + Vector3(gx + 0.4, AY, 0), c + Vector3(gx + 0.55, AY, 0), 0.055, M.black, plant)   # gun valve: stem and body
	_torus(0.1, 0.014, c + Vector3(gx + 0.4, AY + 0.36, 0), M.red, plant)   # the small handwheel
	# the forced-draft fan set (kept from 0.12), moved out to the front and ducted into the register's wind box
	var fo := Vector3(-0.95, 0.0, 0.95)
	var mach := _paint(Color(0.30, 0.36, 0.34))
	_box(Vector3(1.5, 0.14, 1.4), c + fo + Vector3(-2.35, 0.07, 0.25), M.paint_grey, plant)   # fan skid
	var vo := _cyl(0.55, 0.42, c + fo + Vector3(-2.35, 0.75, 0.0), mach, plant, -1.0, 40); vo.rotation_degrees.x = 90   # volute
	_box(Vector3(0.42, 0.42, 0.42), c + fo + Vector3(-2.35, 1.17, 0.0), mach, plant)   # scroll outlet, rising
	var duct_end := c + Vector3(x0 - 0.38, AY, 0.5)   # the wind box's side
	_seg(c + fo + Vector3(-2.35, 1.36, 0.0), duct_end, 0.2, mach, plant); _sph(0.2, c + fo + Vector3(-2.35, 1.36, 0.0), mach, plant)   # duct into the wind box
	_flange(c + Vector3(x0 - 0.38, AY, 0.5) + (c + fo + Vector3(-2.35, 1.36, 0.0) - duct_end).normalized() * 0.1, (duct_end - (c + fo + Vector3(-2.35, 1.36, 0.0))).normalized(), 0.2, plant)
	_box(Vector3(0.95, 0.1, 0.1), c + fo + Vector3(-2.35, 0.32, -0.24), mach, plant)   # volute feet
	var bell := _cyl(0.32, 0.12, c + fo + Vector3(-2.35, 0.75, -0.27), M.steel_dull, plant, 0.24); bell.rotation_degrees.x = -90   # inlet bell
	var scr := _cyl(0.31, 0.01, c + fo + Vector3(-2.35, 0.75, -0.34), _flat(Color(0.12, 0.12, 0.12), 0.6, 0.5), plant); scr.rotation_degrees.x = 90   # inlet screen
	var mo := _cyl(0.26, 0.55, c + fo + Vector3(-2.35, 0.62, 0.68), mach, plant); mo.rotation_degrees.x = 90   # motor
	for k in 7: var fin := _cyl(0.29, 0.025, c + fo + Vector3(-2.35, 0.62, 0.47 + k * 0.07), mach, plant); fin.rotation_degrees.x = 90   # cooling fins
	_box(Vector3(0.18, 0.14, 0.22), c + fo + Vector3(-2.35, 0.94, 0.68), mach, plant)   # terminal box
	_box(Vector3(0.3, 0.24, 0.2), c + fo + Vector3(-2.35, 0.62, 0.3), M.yellow, plant)   # coupling guard
	# the peep window, recessed in a short tube on each side (the hero view may stand on either); the lamp on the front one lands warm light on the floor
	var gm := _glowmat(true)
	for sg in [1.0, -1.0]: _peep(c + Vector3(XC + 0.1, AY, sg * (R - 0.02)), Vector3(0, 0, sg), 0.16, 0.3, gm)   # glass set back 0.3 m in a short tube
	var fl := _particles(c + Vector3(x0 + 0.4, AY, 0), 60, 0.5, Vector3(2.4, 0.2, 0), 8.0, 0.35, Color(1.0, 0.55, 0.15, 0.7), plant, 2.0)
	fl.emitting = false
	var l := OmniLight3D.new(); l.light_color = Color(1.0, 0.5, 0.2); l.light_energy = 0.0; l.light_specular = 0.0; l.omni_range = 5.5; l.position = c + Vector3(XC + 0.1, 1.0, R + 0.8); plant.add_child(l)
	_glow[id] = {"mat": gm, "light": l, "kind": "burner", "flame": fl, "window": true, "flick": true}

## The exam bridge (L04): a clipboard stand for the inspector, an inspection tag wired to the reactor's leg, a sample bomb on a stand with its two needle valves.
func _exam_props(c: Vector3) -> void:
	var sx := c.x - 1.9; var sz := c.z + 0.9   # the clipboard stand
	_seg(Vector3(sx, 0.02, sz), Vector3(sx, 1.25, sz), 0.018, M.steel_dull, plant)
	_box(Vector3(0.5, 0.025, 0.06), Vector3(sx, 0.015, sz), M.steel_dull, plant); _box(Vector3(0.06, 0.025, 0.5), Vector3(sx, 0.015, sz), M.steel_dull, plant)
	var cb := _box(Vector3(0.34, 0.44, 0.02), Vector3(sx, 1.4, sz + 0.03), _flat(Color(0.45, 0.3, 0.18), 0.0, 0.85), plant); cb.rotation_degrees.x = -12.0
	var sheet := _box(Vector3(0.28, 0.36, 0.006), Vector3(sx, 1.4, sz + 0.044), _flat(Color(0.74, 0.74, 0.7), 0.0, 0.9), plant); sheet.rotation_degrees.x = -12.0
	_box(Vector3(0.12, 0.04, 0.03), Vector3(sx, 1.62, sz + 0.04), M.steel_dull, plant).rotation_degrees.x = -12.0   # the clip
	var t := Label3D.new(); t.text = "INSPECTION\nREPORT"; t.font_size = 48; t.pixel_size = 0.0012; t.modulate = Color(0.1, 0.1, 0.12); t.outline_size = 0; t.shaded = true
	t.position = Vector3(sx, 1.46, sz + 0.05); t.rotation_degrees.x = -12.0; plant.add_child(t)
	var leg := c + Vector3(0.55 * cos(PI * 0.75), 0.0, 0.55 * sin(PI * 0.75))   # the inspection tag on the front-left leg
	_seg(leg + Vector3(0, 0.75, 0), leg + Vector3(0.1, 0.62, 0.12), 0.004, M.black, plant)
	_box(Vector3(0.1, 0.16, 0.006), leg + Vector3(0.1, 0.52, 0.14), _flat(Color(0.8, 0.12, 0.08), 0.0, 0.5), plant)
	_box(Vector3(0.07, 0.06, 0.007), leg + Vector3(0.1, 0.55, 0.14), _flat(Color(0.76, 0.74, 0.68), 0.0, 0.7), plant)
	var bx := c.x + 1.2; var bz := c.z + 0.8   # the sample bomb on a stand, tapped off the reactor
	_seg(Vector3(bx, 0.0, bz), Vector3(bx, 0.95, bz), 0.02, M.paint_grey, plant); _box(Vector3(0.3, 0.02, 0.3), Vector3(bx, 0.01, bz), M.steel_dull, plant)
	_seg(c + Vector3(0.5, 0.95, 0.4), Vector3(bx, 1.0, bz), 0.015, M.steel_dull, plant)   # the sample line from the shell
	_cyl(0.07, 0.5, Vector3(bx, 1.3, bz), M.steel, plant); _sph(0.07, Vector3(bx, 1.55, bz), M.steel, plant, true); _sph(0.07, Vector3(bx, 1.05, bz), M.steel, plant, true).rotation_degrees.x = 180
	for vy in [1.55, 1.05]:
		_seg(Vector3(bx, vy, bz), Vector3(bx + 0.18, vy + (0.1 if vy > 1.2 else -0.1), bz), 0.012, M.steel_dull, plant)
		_torus(0.04, 0.008, Vector3(bx + 0.18, vy + (0.1 if vy > 1.2 else -0.1) + 0.03, bz), M.red, plant)   # needle-valve handwheel
	_box(Vector3(0.12, 0.05, 0.005), Vector3(bx, 1.3, bz + 0.072), _flat(Color(0.8, 0.72, 0.45), 0.8, 0.35), plant)   # the bomb's nameplate

# ---- 0.13: chapter 4 (kinetics) and the L09 bench ---------------------------------------------------------------------------------------------------
var _beds := {}      ## packed_bed id -> {mats: [StandardMaterial3D per slice, top to bottom], tags: [Label3D], light: OmniLight3D, cat: String}
var _kettles := {}   ## batch id -> {bub: GPUParticles3D, foam: MeshInstance3D, act: float (0..1, by catalyst), liq: StandardMaterial3D}
var _bench := {}     ## L09: {furnace: StandardMaterial3D, light: OmniLight3D, needle: Node3D, ...}
const BULK := {"fe_ammonia": 2500.0, "v2o5": 550.0}   ## kg/m3 of the catalyst as loaded (game numbers: iron ammonia catalyst ~2.5 t/m3, V2O5 rings ~0.55 t/m3)
const CAT_COL := {"fe_ammonia": Color(0.3, 0.3, 0.32), "v2o5": Color(0.46, 0.31, 0.12)}

## A shell of revolution over part of the circle only (a0..a1, radians, a = 0 on +x, PI/2 on +z): the bed's shell around its window. `inward` flips it to face the axis.
func _arc(r: float, y0: float, y1: float, a0: float, a1: float, seg: int, mat: Material, pos: Vector3, parent: Node, inward := false) -> MeshInstance3D:
	var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES); st.set_smooth_group(0)
	for s in seg:
		var b0 := a0 + (a1 - a0) * s / seg; var b1 := a0 + (a1 - a0) * (s + 1) / seg
		var p00 := Vector3(r * cos(b0), y0, r * sin(b0)); var p01 := Vector3(r * cos(b1), y0, r * sin(b1))
		var p10 := Vector3(r * cos(b0), y1, r * sin(b0)); var p11 := Vector3(r * cos(b1), y1, r * sin(b1))
		var u0 := float(s) / seg; var u1 := float(s + 1) / seg
		if not inward:   # 0.14: Godot's front faces wind clockwise as seen; the two orders were swapped, so "outward" faced in (and its normals too)
			st.set_uv(Vector2(u0, 0)); st.add_vertex(p00); st.set_uv(Vector2(u1, 1)); st.add_vertex(p11); st.set_uv(Vector2(u0, 1)); st.add_vertex(p10)
			st.set_uv(Vector2(u0, 0)); st.add_vertex(p00); st.set_uv(Vector2(u1, 0)); st.add_vertex(p01); st.set_uv(Vector2(u1, 1)); st.add_vertex(p11)
		else:
			st.set_uv(Vector2(u0, 0)); st.add_vertex(p00); st.set_uv(Vector2(u0, 1)); st.add_vertex(p10); st.set_uv(Vector2(u1, 1)); st.add_vertex(p11)
			st.set_uv(Vector2(u0, 0)); st.add_vertex(p00); st.set_uv(Vector2(u1, 1)); st.add_vertex(p11); st.set_uv(Vector2(u1, 0)); st.add_vertex(p01)
	st.generate_normals(); st.generate_tangents()
	return _mi(st.commit(), pos, mat, parent)

## Pellets (or ceramic balls) packed against the inside of the window: a MultiMesh of small spheres in the window's arc, between heights y0 and y1.
func _pellets(c: Vector3, r: float, y0: float, y1: float, a0: float, a1: float, pr: float, mat: Material, seed_i: int) -> void:
	var rng := RandomNumberGenerator.new(); rng.seed = 7331 + seed_i
	var mm := MultiMesh.new(); mm.transform_format = MultiMesh.TRANSFORM_3D; mm.use_colors = true   # each pellet its own shade, so the charge reads as pellets and not a smooth wall
	var sm := SphereMesh.new(); sm.radius = pr; sm.height = pr * 2.0; sm.radial_segments = 10; sm.rings = 6; mm.mesh = sm
	var rows := maxi(1, int((y1 - y0) / (pr * 1.7))); var cols := maxi(2, int(r * (a1 - a0) / (pr * 1.8)))
	mm.instance_count = rows * cols * 2
	var i := 0
	for layer in 2:
		var rr := r - pr * (1.0 + 1.8 * layer)
		for ri in rows:
			for ci in cols:
				var a := a0 + (a1 - a0) * (float(ci) + 0.5 * float(ri % 2) + rng.randf_range(-0.2, 0.2)) / float(cols)
				var y := y0 + pr + (y1 - y0 - 2.0 * pr) * (float(ri) + rng.randf_range(-0.15, 0.15)) / float(maxi(1, rows - 1))
				var sc := rng.randf_range(0.8, 1.1)
				mm.set_instance_transform(i, Transform3D(Basis().scaled(Vector3(sc, sc * rng.randf_range(0.85, 1.0), sc)), Vector3(rr * cos(a), y, rr * sin(a))))
				var v := rng.randf_range(0.55, 1.25); mm.set_instance_color(i, Color(v, v * rng.randf_range(0.93, 1.03), v * rng.randf_range(0.9, 1.0))); i += 1
	if mat is StandardMaterial3D: (mat as StandardMaterial3D).vertex_color_use_as_albedo = true
	var n := MultiMeshInstance3D.new(); n.multimesh = mm; n.material_override = mat; n.position = c; plant.add_child(n)

## The bed's slice material: the catalyst's own colour, a blackbody emission set from the temperature at that depth (set_snapshot).
func _pellet_mat(col: Color) -> StandardMaterial3D:
	var m := _flat(col, 0.25, 0.55); m.emission_enabled = true; m.emission = Color(0.55, 0.07, 0.02); m.emission_energy_multiplier = 0.0
	return m

## 0.13 (chapter 4, kinetics): the catalyst bed you can see into. A pilot converter on a skirt with a tall bolted quartz window on its front (+z): through it the
## bed shows, ceramic balls over and under the catalyst, the pellets in the catalyst's colour (iron black, V2O5 brown-orange). The vessel is sized from the catalyst
## mass the engine holds (W over the loaded bulk density, three bores deep), so a bigger load is a bigger vessel. The pellets glow by the temperature down the bed
## (the engine's T_in at the top, T_out at the bottom, most of the adiabatic rise near the inlet), and five thermowells down the side read it in degrees C.
func _packed_bed(id: String, c: Vector3, u: Dictionary) -> void:
	var cat := str(u.get("catalystId", "")) if u.get("catalystId") != null else ""
	var pr: Dictionary = u.get("params", {}) if u.get("params", {}) is Dictionary else {}
	var vol := float(pr.get("W", 500.0)) / float(BULK.get(cat, 1000.0))
	var r := 0.55   # drawn, not to scale: the game's beds hold 0.1 to 0.6 m3; the depth grows with the catalyst volume (cube root) so more catalyst shows as a deeper bed
	var depth := clampf(0.9 * pow(vol / 0.08, 1.0 / 3.0), 0.6, 3.2)
	var base := 1.0; var ib := 0.18   # skirt height; ceramic-ball layer under and over the bed
	var h := depth + 2.0 * ib + 0.7   # shell: the bed, the ball layers, a disengaging space over the top
	var y0 := base; var yb0 := y0 + 0.1; var yb1 := yb0 + ib + depth   # bed from yb0 + ib to yb1
	var shell := _shader("steel", {"rough_base": 0.32, "metallic": 0.8, "blotch": 0.18})
	var wa := 0.62   # the window's half-angle round +z
	var wy0 := yb0 - 0.02; var wy1 := yb1 + ib + 0.06   # the window shows the whole charge
	_arc(r, y0, y0 + h, PI * 0.5 + wa, PI * 2.5 - wa, 40, shell, c, plant)
	_arc(r, y0, wy0, PI * 0.5 - wa, PI * 0.5 + wa, 10, shell, c, plant); _arc(r, wy1, y0 + h, PI * 0.5 - wa, PI * 0.5 + wa, 10, shell, c, plant)
	var lin := _flat(Color(0.2, 0.19, 0.18), 0.0, 0.9); lin.cull_mode = BaseMaterial3D.CULL_DISABLED
	_arc(r - 0.03, y0, y0 + h, PI * 0.5 + wa, PI * 2.5 - wa, 30, lin, c, plant, true)   # the liner on the far side, seen through the window above the bed
	_dished(r, Vector3(c.x, y0 + h, c.z), shell, plant, true); _dished(r, Vector3(c.x, y0, c.z), shell, plant, false)
	_cyl(r * 0.98, base - r * 0.25, Vector3(c.x, (base - r * 0.25) * 0.5, c.z), M.paint_grey, plant, -1.0, 40); _cyl(r * 1.14, 0.06, Vector3(c.x, 0.03, c.z), M.paint_grey, plant, -1.0, 40)
	# the bed: a dark core so nothing shows through gaps, ceramic balls below and above, the catalyst in slices that glow on their own
	_arc(r - 0.1, yb0, yb1 + ib, PI * 0.5 - wa - 0.1, PI * 0.5 + wa + 0.1, 12, _flat(Color(0.03, 0.03, 0.03), 0.0, 0.9), c, plant)   # the voids between pellets
	var ball := _flat(Color(0.76, 0.74, 0.68), 0.0, 0.45)
	_pellets(c, r - 0.04, yb0, yb0 + ib, PI * 0.5 - wa, PI * 0.5 + wa, 0.034, ball, 1)
	_pellets(c, r - 0.04, yb1, yb1 + ib, PI * 0.5 - wa, PI * 0.5 + wa, 0.034, ball, 2)
	var mats: Array = []; var n := clampi(int(depth / 0.18), 3, 10)
	for k in n:   # top (inlet) to bottom
		var m := _pellet_mat(CAT_COL.get(cat, Color(0.3, 0.32, 0.28)))
		_pellets(c, r - 0.03, yb1 - depth * float(k + 1) / n, yb1 - depth * float(k) / n, PI * 0.5 - wa, PI * 0.5 + wa, 0.026, m, 10 + k)
		mats.append(m)
	_box(Vector3(2.0 * r * sin(wa), 0.03, 0.04), c + Vector3(0, yb0 - 0.015, r * cos(wa) - 0.05), M.steel_dull, plant)   # the support grid's edge
	# the window: quartz in a bolted frame, two vertical bars and two curved rails
	var glass := _flat(Color(0.85, 0.92, 0.95, 0.1), 0.0, 0.04); glass.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; glass.metallic_specular = 0.7
	glass.cull_mode = BaseMaterial3D.CULL_DISABLED   # 0.13 (Sigrid: "no glass in the window"): _arc's outward winding faced away, so the quartz was culled
	_arc(r + 0.012, wy0, wy1, PI * 0.5 - wa, PI * 0.5 + wa, 12, glass, c, plant)
	for sg in [-1.0, 1.0]:
		var a: float = PI * 0.5 + sg * wa
		var bar := _box(Vector3(0.09, wy1 - wy0 + 0.12, 0.05), c + Vector3(cos(a) * (r + 0.03), (wy0 + wy1) * 0.5, sin(a) * (r + 0.03)), M.steel_dull, plant); bar.rotation.y = -a + PI * 0.5
		var yy := wy0 + 0.05
		while yy < wy1: _cyl(0.012, 0.03, c + Vector3(cos(a) * (r + 0.06), yy, sin(a) * (r + 0.06)), M.black, plant, -1.0, 6).rotation = Vector3(PI * 0.5, -a + PI * 0.5, 0); yy += 0.16
	for yy2 in [wy0 - 0.03, wy1 + 0.03]: _arc(r + 0.035, yy2 - 0.035, yy2 + 0.035, PI * 0.5 - wa - 0.05, PI * 0.5 + wa + 0.05, 12, M.steel_dull, c, plant)
	# nozzles: feed in at the top head, product out of the bottom through the skirt's side
	_seg(Vector3(c.x, y0 + h + r * 0.45, c.z), Vector3(c.x, y0 + h + r * 0.45 + 0.35, c.z), 0.07, M.steel_dull, plant); _flange(Vector3(c.x, y0 + h + r * 0.45 + 0.35, c.z), Vector3.UP, 0.07, plant)
	# thermowells down the far side of the window, each with a small readout plate: the bed's profile in numbers
	var tags: Array = []
	for k in 5:
		var ty := yb1 - depth * (0.1 + 0.9 * float(k) / 4.0)   # wells from 10 % depth down to the outlet; the last reads T_out, as the recorder does
		var a2 := PI * 0.5 + wa + 0.32
		var p0 := c + Vector3(cos(a2) * r, ty, sin(a2) * r); var d := Vector3(cos(a2), 0, sin(a2))
		_seg(p0, p0 + d * 0.16, 0.018, M.steel_dull, plant, 8); _cyl(0.035, 0.05, p0 + d * 0.19, M.brass, plant, -1.0, 12).rotation = Vector3(0, 0, PI * 0.5)
		var t := Label3D.new(); t.text = "--"; t.font = load("res://ui/fonts/Archivo-Variable.ttf"); t.font_size = 48; t.pixel_size = 0.0026; t.outline_size = 10; t.outline_modulate = Color(0, 0, 0, 0.9)
		t.pixel_size = 0.0026 if tier != "compat" else 0.0036   # 0.13 (Sigrid): compat tags were 12 px
		t.modulate = Color(1.0, 0.86, 0.6); t.position = p0 + d * 0.48 + Vector3(0, 0.0, 0.02); t.billboard = BaseMaterial3D.BILLBOARD_FIXED_Y; t.double_sided = true; t.sorting_offset = 0.05; plant.add_child(t); tags.append(t)
		_seg(p0 + d * 0.21, p0 + d * 0.36, 0.01, M.steel_dull, plant, 6)   # the lead to the readout, ending short of the plate
		var pq := MeshInstance3D.new(); var qm := QuadMesh.new(); qm.size = Vector2(0.34, 0.15) * (1.0 if tier != "compat" else 1.35); pq.mesh = qm
		var pm := _flat(Color(0.05, 0.05, 0.06, 0.8), 0.0, 0.6); pm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; pm.billboard_mode = BaseMaterial3D.BILLBOARD_FIXED_Y; pm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		pq.material_override = pm; pq.position = t.position; plant.add_child(pq)   # the readout plate: dark, so the number reads against the shell and the glow
	var l := OmniLight3D.new(); l.light_color = Color(1.0, 0.45, 0.15); l.light_energy = 0.0; l.light_specular = 0.0; l.omni_range = 2.5; l.position = c + Vector3(0, (yb0 + yb1) * 0.5, r + 0.7); plant.add_child(l)
	# the sight-glass lamp: a small flood on a bracket over the window, lighting the charge from outside, as plants light their sight glasses
	var lp := c + Vector3(0, wy1 + 0.25, r + 0.45)
	_seg(c + Vector3(0, wy1 + 0.25, r), lp, 0.015, M.steel_dull, plant, 8); _cyl(0.07, 0.1, lp, M.black, plant, 0.05, 16)
	var sl := SpotLight3D.new(); sl.light_color = Color(1.0, 0.94, 0.85); sl.light_energy = 2.2 if tier != "compat" else 1.2; sl.spot_range = wy1 - wy0 + 1.2; sl.spot_angle = 26.0; sl.light_specular = 0.2; sl.spot_attenuation = 0.4
	# 0.13 (Sigrid): the lamp washed the cold top layer brighter than the hot ones below; it is dimmer now and aimed at the lower part, so the glow sets the brightness
	sl.position = lp + Vector3(0, -0.05, 0); plant.add_child(sl); sl.look_at(c + Vector3(0, wy0 + (wy1 - wy0) * 0.3, 0.0), Vector3.UP)
	_beds[id] = {"mats": mats, "tags": tags, "light": l, "depth": depth, "h": y0 + h + r * 0.45 + 0.4, "r": r}

## The bed's temperatures from the engine: T(depth) from T_in to T_out, the steep part near the inlet (an adiabatic bed converts most where it is coldest and
## the rate is still far from the ceiling). Below 450 C the pellets show their own colour; above it they glow (the hall's blackbody ramp).
func _beds_live(info: Dictionary, running: bool) -> void:
	for id in _beds:
		var b: Dictionary = _beds[id]; var inf: Dictionary = info.get(id, {})
		var ti := float(inf.get("T_in", 0.0)); var to := float(inf.get("T_out", 0.0))
		var ok := running and ti > 0.0 and to > 0.0
		var emax := 0.0
		var n: int = (b.mats as Array).size()
		for k in n:
			var z := (float(k) + 0.5) / float(n); var T := ti + (to - ti) * (1.0 - exp(-3.0 * z)) / (1.0 - exp(-3.0))
			var bb: Array = _blackbody(T) if ok else [Color(0.55, 0.07, 0.02), 0.0]
			var m: StandardMaterial3D = b.mats[k]; m.emission = bb[0]; m.emission_energy_multiplier = float(bb[1]) * 0.75; emax = maxf(emax, float(bb[1]))
		for k2 in (b.tags as Array).size():
			var z2 := 0.1 + 0.9 * float(k2) / 4.0; var T2 := ti + (to - ti) * (1.0 - exp(-3.0 * z2)) / (1.0 - exp(-3.0))
			(b.tags[k2] as Label3D).text = ("%d °C" % roundi(T2 - 273.15)) if ok else "--"
		(b.light as OmniLight3D).light_energy = emax * 1.6

## 0.13 (L18, the oxygen rig): a jacketed glass batch reactor on a steel frame. Through the glass: the hydrogen peroxide (clear, faintly blue), and the oxygen the
## catalyst frees as bubbles and a foam head; no catalyst barely fizzes, iodide fizzes, catalase foams. A stirrer motor on the lid, a vent line for the oxygen.
const KETTLE_ACT := {"none": 0.04, "iodide": 0.45, "catalase": 1.0}
func _kettle(id: String, c: Vector3, u: Dictionary) -> void:
	var cat := str(u.get("catalystId", "none")) if u.get("catalystId") != null else "none"
	var r := 0.42; var y0 := 0.85; var h := 1.0
	for lx in [-1.0, 1.0]: for lz in [-1.0, 1.0]: _box(Vector3(0.06, 2.3, 0.06), c + Vector3(lx * 0.62, 1.15, lz * 0.62), M.steel_dull, plant)   # the frame
	for yy in [0.75, 2.0]:
		for sg in [-1.0, 1.0]: _box(Vector3(1.3, 0.05, 0.05), c + Vector3(0, yy, sg * 0.62), M.steel_dull, plant); _box(Vector3(0.05, 0.05, 1.3), c + Vector3(sg * 0.62, yy, 0), M.steel_dull, plant)
	var glass := _flat(Color(0.82, 0.9, 0.94, 0.16), 0.0, 0.05); glass.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_cyl(r + 0.06, h, c + Vector3(0, y0 + h * 0.5, 0), glass, plant, -1.0, 40)   # the jacket
	_cyl(r, h + 0.08, c + Vector3(0, y0 + h * 0.5 + 0.04, 0), glass, plant, -1.0, 40)   # the vessel wall
	_sph(r, c + Vector3(0, y0, 0), glass, plant, true).rotation_degrees.x = 180   # its round bottom
	var liq := _flat(Color(0.32, 0.5, 0.62, 0.62), 0.0, 0.08); liq.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	var lh := h * 0.62
	_cyl(r - 0.012, lh, c + Vector3(0, y0 + lh * 0.5, 0), liq, plant, -1.0, 32); _sph(r - 0.012, c + Vector3(0, y0, 0), liq, plant, true).rotation_degrees.x = 180
	# the foam head: dense white over the darker liquid, lit from inside a little so it reads through the glass; its height is the reaction rate (Sigrid 0.13)
	var fm := _flat(Color(0.78, 0.79, 0.79, 0.94), 0.0, 0.95, Color(0.9, 0.93, 0.95), 0.35); fm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	var foam := _cyl(r - 0.03, 0.02, c + Vector3(0, y0 + lh + 0.01, 0), fm, plant, -1.0, 32)
	fm.albedo_color.a = 0.55
	# the foam's skin: bubbles of mixed size against the glass and over the top, revealed from the liquid line up as the head grows (Sigrid 0.13: a smooth cylinder read as a plastic tub)
	var rng := RandomNumberGenerator.new(); rng.seed = 4242
	var mm := MultiMesh.new(); mm.transform_format = MultiMesh.TRANSFORM_3D; mm.use_colors = true
	var sm := SphereMesh.new(); sm.radius = 0.02; sm.height = 0.04; sm.radial_segments = 8; sm.rings = 5; mm.mesh = sm
	var nb := 900; mm.instance_count = nb
	for i in nb:
		var fy := float(i) / float(nb) * 0.32; var a := rng.randf() * TAU; var sc := rng.randf_range(0.5, 1.6)
		var rr := r - 0.02 - (0.0 if rng.randf() < 0.75 else rng.randf_range(0.0, r - 0.05))
		mm.set_instance_transform(i, Transform3D(Basis().scaled(Vector3.ONE * sc), Vector3(cos(a) * rr, fy, sin(a) * rr)))
		var v := rng.randf_range(0.82, 1.0); mm.set_instance_color(i, Color(v, v, v * 1.02))
	var bm := _flat(Color(0.8, 0.8, 0.8, 0.85), 0.0, 0.15); bm.vertex_color_use_as_albedo = true; bm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; bm.metallic_specular = 0.8
	var froth := MultiMeshInstance3D.new(); froth.multimesh = mm; froth.material_override = bm; froth.position = c + Vector3(0, y0 + lh, 0); plant.add_child(froth)
	mm.visible_instance_count = 0
	_cyl(r + 0.1, 0.06, c + Vector3(0, y0 + h + 0.1, 0), M.steel, plant, -1.0, 40)   # the lid flange and the clamp ring
	_cyl(r + 0.12, 0.03, c + Vector3(0, y0 - 0.02, 0), M.steel_dull, plant, -1.0, 40)
	_cyl(0.12, 0.3, c + Vector3(0, y0 + h + 0.3, 0), M.enamel_blue, plant); _cyl(0.09, 0.12, c + Vector3(0, y0 + h + 0.5, 0), M.steel_dull, plant)   # stirrer motor
	_seg(c + Vector3(0, y0 + 0.15, 0), c + Vector3(0, y0 + h + 0.15, 0), 0.012, M.steel, plant)   # the shaft
	for k in 3: var a := k * TAU / 3.0; _box(Vector3(0.22, 0.02, 0.05), c + Vector3(cos(a) * 0.1, y0 + 0.2, sin(a) * 0.1), M.steel, plant).rotation.y = -a   # impeller
	_pipe([c + Vector3(0.22, y0 + h + 0.13, 0), c + Vector3(0.22, y0 + h + 0.55, 0), c + Vector3(0.8, y0 + h + 0.55, 0)], 0.025, M.steel, plant, false)   # the oxygen line
	for sg2 in [-1.0, 1.0]: _seg(c + Vector3(sg2 * (r + 0.06), y0 + 0.2 + (0.6 if sg2 > 0 else 0.0), 0), c + Vector3(sg2 * (r + 0.3), y0 + 0.2 + (0.6 if sg2 > 0 else 0.0), 0), 0.02, M.paint_green, plant)   # jacket water in and out
	var lbl := Label3D.new(); lbl.text = {"none": "NO CATALYST", "iodide": "IODIDE", "catalase": "CATALASE"}.get(cat, cat.to_upper()); lbl.font = load("res://ui/fonts/Archivo-Variable.ttf")
	lbl.font_size = 40; lbl.pixel_size = 0.0016; lbl.outline_size = 0; lbl.modulate = Color(0.08, 0.09, 0.1); lbl.shaded = true; lbl.position = c + Vector3(0, 0.75, 0.66); plant.add_child(lbl)
	_box(Vector3(0.42, 0.09, 0.01), c + Vector3(0, 0.75, 0.652), _flat(Color(0.76, 0.72, 0.5), 0.2, 0.5), plant)
	var bub := _particles(c + Vector3(0, y0 + 0.08, 0), 220, 1.2, Vector3(0, 0.5, 0), 8.0, 0.05, Color(1.0, 1.0, 1.0, 0.95), plant, 1.4)
	(bub.process_material as ParticleProcessMaterial).emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX; (bub.process_material as ParticleProcessMaterial).emission_box_extents = Vector3(r * 0.6, 0.05, r * 0.6)
	(bub.process_material as ParticleProcessMaterial).gravity = Vector3.ZERO; bub.emitting = false
	var rim := SpotLight3D.new(); rim.light_color = Color(0.85, 0.92, 1.0); rim.light_energy = 6.0 if tier != "compat" else 3.0; rim.spot_range = 4.0; rim.spot_angle = 22.0; rim.light_specular = 1.0
	rim.position = c + Vector3(-1.2, y0 + h + 1.4, -1.0); plant.add_child(rim); rim.look_at(c + Vector3(0, y0 + h * 0.7, 0), Vector3.UP)   # the rim light that draws the glass edge
	var key := SpotLight3D.new(); key.light_color = Color(1.0, 0.95, 0.88); key.light_energy = 4.0 if tier != "compat" else 2.0; key.spot_range = 5.0; key.spot_angle = 30.0; key.light_specular = 0.6; key.shadow_enabled = tier != "compat"
	key.position = c + Vector3(1.0, y0 + h + 1.8, 1.6); plant.add_child(key); key.look_at(c + Vector3(0, y0 + h * 0.6, 0), Vector3.UP)
	_kettles[id] = {"bub": bub, "foam": foam, "froth": mm, "act": float(KETTLE_ACT.get(cat, 0.3)), "top": y0 + lh, "c": c}

func _kettles_live(info: Dictionary, running: bool) -> void:
	for id in _kettles:
		var k: Dictionary = _kettles[id]; var x := float((info.get(id, {}) as Dictionary).get("X", 0.0))
		var act: float = float(k.act) * clampf(x * 1.2, 0.0, 1.0) if running else 0.0
		var bub := k.bub as GPUParticles3D; bub.emitting = act > 0.02; bub.amount_ratio = clampf(act, 0.05, 1.0)
		var f := k.foam as MeshInstance3D; var th := 0.008 + 0.3 * act
		(f.mesh as CylinderMesh).height = th; f.position = (k.c as Vector3) + Vector3(0, float(k.top) + th * 0.5, 0)
		var fmm := k.froth as MultiMesh; fmm.visible_instance_count = int(float(fmm.instance_count) * clampf(th / 0.32, 0.0, 1.0)) if act > 0.02 else 0

## 0.13 (L09, the exam bench), rebuilt after Sigrid's 0.13 score ("a school desk, a stovepipe through a paint tin"): a laboratory bench in the hall under its
## own lamp, with the three fixtures the exam compares. Left: the flow calorimeter (the engine's isothermal reactor: CH4 and O2 burn at 25 C and its duty is the
## heat at constant pressure): a silvered Dewar in a clear water jacket with a stirrer, a thermometer and the small gas flame in its glass chimney. Middle: the bomb
## calorimeter (constant volume): the instrument cabinet with its lid and screen, the steel oxygen bomb in its stand beside it, the O2 cylinder with a regulator.
## Right: a clamshell tube furnace on the bench; the quartz work tube's ends glow with the furnace temperature the level reports, its controller reads it.
func _calorimeter_bench(id: String, c: Vector3) -> void:
	var top := 0.92
	var resin := _flat(Color(0.2, 0.22, 0.23), 0.0, 0.45)   # epoxy resin top
	var frame := _coat(Color(0.52, 0.54, 0.56), 0.35, 0.5, 0.5, 0.3)   # powder-coated steel frame
	_box(Vector3(3.6, 0.05, 1.0), c + Vector3(0.6, top, 0), resin, plant)
	_box(Vector3(3.6, 0.012, 0.02), c + Vector3(0.6, top + 0.026, 0.5), _flat(Color(0.3, 0.32, 0.33), 0.0, 0.3), plant)   # the drip lip
	for lx in [-1.15, 2.35]: for lz in [-0.45, 0.45]: _box(Vector3(0.05, top - 0.03, 0.05), c + Vector3(lx, (top - 0.03) * 0.5, lz), frame, plant)
	for lx2 in [-1.15, 2.35]: _box(Vector3(0.05, 0.05, 0.95), c + Vector3(lx2, 0.15, 0), frame, plant)
	_box(Vector3(3.5, 0.05, 0.05), c + Vector3(0.6, 0.15, -0.45), frame, plant)
	_box(Vector3(3.6, 0.9, 0.04), c + Vector3(0.6, top + 0.45, -0.52), _flat(Color(0.42, 0.44, 0.45), 0.0, 0.7), plant)   # the backboard: mid grey, so the lamp does not make it the brightest thing (Sigrid 0.13)
	_box(Vector3(3.6, 0.03, 0.22), c + Vector3(0.6, top + 0.62, -0.4), frame, plant)   # a shelf with reagent bottles
	var amber := _flat(Color(0.42, 0.22, 0.06, 0.85), 0.0, 0.12); amber.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	var clear := _flat(Color(0.88, 0.93, 0.95, 0.35), 0.0, 0.08); clear.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	for i in 9:
		var bx := -0.9 + i * 0.36
		_cyl(0.045, 0.16, c + Vector3(bx, top + 0.715, -0.4), amber if i % 3 != 1 else clear, plant, -1.0, 16); _cyl(0.025, 0.03, c + Vector3(bx, top + 0.81, -0.4), M.black, plant, -1.0, 12)
	# the bench lamp: an angled arm and a shade, its spot the scene's key light
	var lb := c + Vector3(-0.85, top + 0.03, 0.25)
	_cyl(0.08, 0.03, lb, M.black, plant); _seg(lb, lb + Vector3(0.0, 0.55, -0.15), 0.012, M.black, plant); _seg(lb + Vector3(0.0, 0.55, -0.15), lb + Vector3(0.35, 0.75, 0.0), 0.012, M.black, plant)
	_cyl(0.12, 0.14, lb + Vector3(0.4, 0.7, 0.0), _flat(Color(0.2, 0.32, 0.26), 0.3, 0.4), plant, 0.04, 20)
	var key := SpotLight3D.new(); key.light_color = Color(1.0, 0.92, 0.8); key.light_energy = 3.0 if tier != "compat" else 1.5; key.spot_range = 3.5; key.spot_angle = 55.0; key.light_specular = 0.3; key.shadow_enabled = tier != "compat"
	key.position = lb + Vector3(0.4, 0.66, 0.0); plant.add_child(key); key.look_at(c + Vector3(0.6, top, 0.05), Vector3.UP)
	# 1. the flow calorimeter
	var dw := c + Vector3(-0.35, top + 0.025, 0.05)
	var jacket := _flat(Color(0.8, 0.9, 0.95, 0.22), 0.0, 0.04); jacket.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_cyl(0.19, 0.4, dw + Vector3(0, 0.2, 0), jacket, plant, -1.0, 32)
	_cyl(0.13, 0.36, dw + Vector3(0, 0.19, 0), _flat(Color(0.78, 0.8, 0.82), 1.0, 0.14), plant, -1.0, 32)   # the silvered Dewar
	_cyl(0.2, 0.025, dw + Vector3(0, 0.41, 0), M.black, plant, -1.0, 32)
	var ther := _seg(dw + Vector3(0.08, 0.3, 0), dw + Vector3(0.08, 0.55, 0), 0.0045, _flat(Color(0.75, 0.08, 0.06), 0.0, 0.4, Color(0.6, 0.05, 0.03), 0.4), plant, 8)
	_seg(dw + Vector3(0.08, 0.3, 0), dw + Vector3(0.08, 0.85, 0), 0.008, clear, plant, 8)   # the thermometer
	_cyl(0.045, 0.1, dw + Vector3(-0.07, 0.62, 0), M.enamel_blue, plant); _seg(dw + Vector3(-0.07, 0.57, 0), dw + Vector3(-0.07, 0.15, 0), 0.004, M.steel, plant)   # stirrer
	_seg(dw + Vector3(0.0, 0.42, 0.0), dw + Vector3(0.0, 0.62, 0.0), 0.022, clear, plant, 16)   # the glass chimney over the burner jet
	var fl := _flat(Color(0.3, 0.5, 1.0), 0.0, 0.5, Color(0.35, 0.55, 1.0), 2.5); fl.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; fl.albedo_color.a = 0.7
	var flame := _cyl(0.0, 0.05, dw + Vector3(0, 0.47, 0), fl, plant, 0.012, 12)   # the small blue methane flame
	_pipe([dw + Vector3(0.0, 0.62, 0.0), dw + Vector3(0.0, 0.7, 0.0), dw + Vector3(-0.5, 0.7, 0.3), dw + Vector3(-0.75, 0.0, 0.3)], 0.006, M.brass, plant, false)
	# 2. the bomb calorimeter: the cabinet, its lid and screen, the bomb in its stand, the O2 cylinder and regulator
	var bc := c + Vector3(0.6, top + 0.025, 0.0)
	_box(Vector3(0.55, 0.34, 0.45), bc + Vector3(0, 0.17, 0), _enamel(Color(0.36, 0.42, 0.46)), plant)
	_cyl(0.13, 0.04, bc + Vector3(-0.1, 0.36, 0.0), M.steel, plant, -1.0, 28)   # the bucket lid
	var scr := _box(Vector3(0.2, 0.13, 0.015), bc + Vector3(0.15, 0.3, 0.2), _flat(Color(0.03, 0.05, 0.06), 0.2, 0.2, Color(0.15, 0.45, 0.6), 0.6), plant); scr.rotation_degrees.x = -25.0
	var bomb := c + Vector3(1.0, top + 0.025, 0.15)
	_cyl(0.09, 0.02, bomb, M.steel_dull, plant); _cyl(0.06, 0.2, bomb + Vector3(0, 0.12, 0), M.ss, plant, -1.0, 24); _cyl(0.07, 0.04, bomb + Vector3(0, 0.24, 0), M.ss, plant, -1.0, 24)
	_cyl(0.012, 0.04, bomb + Vector3(0.025, 0.28, 0), M.brass, plant); _cyl(0.012, 0.04, bomb + Vector3(-0.025, 0.28, 0), M.brass, plant)   # the valve and the electrode
	var oc := c + Vector3(1.0, 0.0, -0.75)   # the oxygen cylinder by the bench, chained
	_cyl(0.11, 1.3, oc + Vector3(0, 0.65, 0), M.paint_green, plant); _sph(0.11, oc + Vector3(0, 1.3, 0), M.paint_green, plant, true); _cyl(0.03, 0.08, oc + Vector3(0, 1.43, 0), M.brass, plant)
	var gm := _gauge(oc + Vector3(0.0, 1.5, 0.06), Vector3(0, 0, 1), plant, 0.0, 0.05)
	_pipe([oc + Vector3(0, 1.47, 0), oc + Vector3(0.0, 1.47, 0.4), bomb + Vector3(0.025, 0.32, 0)], 0.005, M.steel, plant, false)
	# 3. the tube furnace: a clamshell body on feet, the split line and hinges, the quartz work tube through it, the controller
	var tf := c + Vector3(1.85, top + 0.025, 0.0)
	var body: Material = _enamel(Color(0.4, 0.4, 0.37))
	for sgx in [-0.18, 0.18]: _box(Vector3(0.06, 0.12, 0.3), tf + Vector3(sgx, 0.06, 0), M.black, plant)
	var sh1 := _cyl(0.2, 0.5, tf + Vector3(0, 0.3, 0), body, plant, -1.0, 32); sh1.rotation_degrees.z = 90
	_box(Vector3(0.5, 0.012, 0.42), tf + Vector3(0, 0.3, 0), M.black, plant)   # the split line
	for hx in [-0.15, 0.15]: _cyl(0.015, 0.06, tf + Vector3(hx, 0.3, -0.2), M.steel_dull, plant).rotation_degrees.z = 90
	_box(Vector3(0.08, 0.04, 0.05), tf + Vector3(0, 0.5, 0.0), M.black, plant)   # the latch handle
	var tube := _cyl(0.045, 1.0, tf + Vector3(0, 0.3, 0), clear, plant, -1.0, 20); tube.rotation_degrees.z = 90
	var bore := _flat(Color(0.25, 0.1, 0.05), 0.0, 0.8); bore.emission_enabled = true; bore.emission = Color(0.55, 0.07, 0.02); bore.emission_energy_multiplier = 0.0
	for sgx2 in [-1.0, 1.0]:
		var e := _cyl(0.043, 0.02, tf + Vector3(sgx2 * 0.252, 0.3, 0), bore, plant, -1.0, 20); e.rotation_degrees.z = 90   # the glowing core seen down the tube
		var ec := _torus(0.05, 0.01, tf + Vector3(sgx2 * 0.26, 0.3, 0), bore, plant); ec.rotation_degrees.z = 90
	var ctl := tf + Vector3(0.48, 0.0, 0.1)
	_box(Vector3(0.24, 0.3, 0.28), ctl + Vector3(0, 0.15, 0), _flat(Color(0.25, 0.27, 0.3), 0.3, 0.45), plant)
	_box(Vector3(0.16, 0.06, 0.01), ctl + Vector3(0, 0.22, 0.142), _flat(Color(0.02, 0.02, 0.02), 0.2, 0.3), plant)
	var rd := Label3D.new(); rd.text = "25 °C"; rd.font_size = 40; rd.pixel_size = 0.0012; rd.modulate = Color(1.0, 0.3, 0.15); rd.outline_size = 0; rd.position = ctl + Vector3(0, 0.22, 0.149); plant.add_child(rd)
	var l := OmniLight3D.new(); l.light_color = Color(1.0, 0.5, 0.2); l.light_energy = 0.0; l.light_specular = 0.0; l.omni_range = 0.9; l.position = tf + Vector3(0.0, 0.3, 0.0); plant.add_child(l)
	_bench = {"ther": ther, "dw": dw, "gauge": gm, "furnace": bore, "flight": l, "fread": rd, "flame": flame}

## L09's furnace unit (the engine's stack) stands on the bench above (_calorimeter_bench), so its own place in the hall stays empty: a duct there fell through the bench.
func _lab_furnace(_id: String, _c: Vector3) -> void:
	pass

func _bench_live(running: bool) -> void:
	if _bench.is_empty() or app == null or app.b == null: return
	var li = app.b.q("levelInfo"); var T := 298.15
	if li is Dictionary and li.get("secondary") is Dictionary and str(li.secondary.get("key", "")) == "furnace_k" and not bool(li.secondary.get("pending", true)): T = float(li.secondary.get("value", 298.15))
	var fr = li.get("firstRun") if li is Dictionary else null   # while the first run replays, the furnace climbs with the recorder's clock (the engine's ramp is linear), not at its end value
	if fr is Dictionary and float(fr.get("len", 0.0)) > 0.0: T = 298.15 + (T - 298.15) * clampf(float(fr.get("t", 0.0)) / float(fr.len), 0.0, 1.0)
	if _bench.has("furnace"):
		var bb := _blackbody(T) if running else [Color(0.55, 0.07, 0.02), 0.0]
		var t := clampf((T - 900.0) / 1500.0, 0.0, 1.0)
		var col: Color = (bb[0] as Color).lerp(Color(1.0, 0.85, 0.55), t)   # past orange it goes yellow-white: 2400 K is a white heat
		(_bench.furnace as StandardMaterial3D).emission = col; (_bench.furnace as StandardMaterial3D).emission_energy_multiplier = float(bb[1]) * (1.0 + t)
		(_bench.flight as OmniLight3D).light_energy = float(bb[1]) * 0.5
		(_bench.fread as Label3D).text = "%d °C" % roundi(T - 273.15)
	if _bench.has("gauge"): (_bench.gauge as ShaderMaterial).set_shader_parameter("value", 0.75 if running else 0.0)

# ---- 0.14: chapter 5 (the loop) and chapter 6 (containment) ---------------------------------------------------------------------------------------
var _levels := {}    ## unit id -> {liq: MeshInstance3D, y0, h, kind} a gauge glass whose liquid column follows the engine (flash: 1 - beta; fermenter, column sump: level)
var _towers := {}    ## column / absorber id -> {tags: [Label3D], mats: [...], kind}
var _reliefs := {}   ## relief id -> {jet: GPUParticles3D}
var _cstr := {}      ## cstr id -> {dial: ShaderMaterial, glow: StandardMaterial3D, light: OmniLight3D, jet: GPUParticles3D}

## A level gauge: a glass tube on two isolation valves beside a vessel wall, the liquid column inside set by set_level (0..1 of the span). Faces +z.
func _gauge_glass(p: Vector3, h: float, liq_col: Color) -> MeshInstance3D:
	var glass := _flat(Color(0.85, 0.92, 0.95, 0.22), 0.0, 0.05); glass.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	for yy in [0.0, h]:
		_seg(p + Vector3(0, yy, -0.18), p + Vector3(0, yy, 0.0), 0.022, M.steel_dull, plant, 8); _cyl(0.04, 0.07, p + Vector3(0, yy, 0.0), M.brass, plant, -1.0, 12)
	_box(Vector3(0.09, h, 0.02), p + Vector3(0, h * 0.5, -0.04), M.steel_dull, plant)   # the backing strip
	_cyl(0.028, h, p + Vector3(0, h * 0.5, 0.0), glass, plant, -1.0, 12)
	var lm := _flat(liq_col, 0.0, 0.1); lm.emission_enabled = true; lm.emission = liq_col * 0.35; lm.emission_energy_multiplier = 0.4   # a lit glass reads at hall distance
	var liq := _cyl(0.022, h, p + Vector3(0, h * 0.5, 0.0), lm, plant, -1.0, 10)
	return liq

func _set_level(e: Dictionary, f: float) -> void:
	var liq := e.liq as MeshInstance3D; var h := float(e.h) * clampf(f, 0.02, 0.98)
	(liq.mesh as CylinderMesh).height = h; liq.position.y = float(e.y0) + h * 0.5

## 0.14 (chapters 5-6): a vertical flash drum (the loop's ammonia catch pot, L22's methanol separator, L27's knock-out drum): a shell on a skirt with a gauge
## glass whose liquid column is the liquid fraction the engine reports (1 - beta), frost on the shell when it runs below 0 C, a demister pad nozzle on top.
func _flash(id: String, c: Vector3, u: Dictionary) -> void:
	var pr: Dictionary = u.get("params", {}) if u.get("params", {}) is Dictionary else {}
	var cold := float(pr.get("T", 300.0)) < 273.15
	var sh := _shader("steel", {"rough_base": 0.4, "frost": 0.55 if cold else 0.0, "frost_h": 1.6, "metallic": 0.6}) if cold else _shader("steel", {"rough_base": 0.36, "metallic": 0.75, "blotch": 0.15})
	_vessel(c, 0.75, 3.2, sh, plant, {"base": 0.9, "manway_ang": PI * 0.85})
	var liq := _gauge_glass(c + Vector3(0.0, 1.3, 0.95), 2.4, Color(0.75, 0.86, 0.95) if cold else Color(0.7, 0.62, 0.35))
	_levels[id] = {"liq": liq, "y0": 1.3, "h": 2.4, "kind": "flash"}

## 0.14 (L22): the methanol converter as plants build it: a vertical multitubular reactor (catalyst in the tubes, boiling water round them) under its steam drum.
## The steam drum's plume follows the duty the engine reports (hot_W), and a hot band on the shell reads the hot spot (Tmax) on the blackbody ramp.
func _tubular(id: String, c: Vector3) -> void:
	var sh := _shader("steel", {"rough_base": 0.34, "metallic": 0.8, "blotch": 0.2})
	_vessel(c, 1.0, 5.0, sh, plant, LADDER.merged({"base": 1.0}))
	for k in 5: _torus(1.02, 0.025, c + Vector3(0, 1.6 + k * 0.95, 0), M.steel_dull, plant)   # tube-sheet flanges and stiffeners
	_drum(c + Vector3(0, 8.4, 0), 0.55, 3.2, M.paint_green, plant)   # the steam drum on its stand
	for sx in [-1.2, 1.2]: _seg(c + Vector3(sx, 6.4, 0.3), c + Vector3(sx, 7.85, 0.3), 0.05, M.steel_dull, plant); _seg(c + Vector3(sx * 0.6, 6.9, -0.5), c + Vector3(sx * 0.6, 7.9, -0.5), 0.09, M.clad, plant)   # stand legs, risers
	var gm := _glowmat(); _cyl(1.03, 0.6, c + Vector3(0, 3.0, 0), gm, plant, -1.0, 40)
	var l := OmniLight3D.new(); l.light_color = Color(1.0, 0.45, 0.15); l.light_energy = 0.0; l.light_specular = 0.0; l.omni_range = 3.0; l.position = c + Vector3(0, 3.0, 1.4); plant.add_child(l)
	_glow[id] = {"mat": gm, "light": l, "kind": "converter", "lampk": 0.6}
	_steam[id] = _particles(c + Vector3(1.2, 9.2, 0), 30, 3.0, Vector3(0, 1.6, 0), 12.0, 0.6, Color(0.92, 0.94, 0.96, 0.4), plant, 3.0)

## 0.14 (L23): the fermenter. A tall stainless tank with a cone bottom on legs, a manway, an agitator drive on the roof, a CO2 vent, and a wide sight glass with
## the beer inside at the engine's level, frothing with CO2 (gas) and turning (spin).
func _fermenter(id: String, c: Vector3) -> void:
	var ss := _flat(Color(0.72, 0.74, 0.76), 0.9, 0.3); ss.cull_mode = BaseMaterial3D.CULL_DISABLED
	var r := 1.3; var y0 := 1.4; var h := 4.2
	var wa0 := 0.35; var wb0 := y0 + 0.4; var wb1 := y0 + h - 0.4   # the shell leaves the sight window open (the glass and the beer fill it)
	_arc(r, y0, y0 + h, PI * 0.5 + wa0, PI * 2.5 - wa0, 44, ss, c, plant)
	_arc(r, y0, wb0, PI * 0.5 - wa0, PI * 0.5 + wa0, 8, ss, c, plant); _arc(r, wb1, y0 + h, PI * 0.5 - wa0, PI * 0.5 + wa0, 8, ss, c, plant)
	_cyl(0.15, 1.1, c + Vector3(0, y0 - 0.55, 0), ss, plant, r, 48).position = c + Vector3(0, y0 - 0.55, 0)   # the cone
	_dished(r, c + Vector3(0, y0 + h, 0), ss, plant, true)
	for a in 4: var ang := TAU * a / 4.0 + PI / 4.0; _seg(c + Vector3(cos(ang) * r * 0.95, 0, sin(ang) * r * 0.95), c + Vector3(cos(ang) * r * 0.95, y0 + 0.4, sin(ang) * r * 0.95), 0.06, ss, plant)
	for k in 3: _torus(r + 0.02, 0.03, c + Vector3(0, y0 + 0.9 + k * 1.3, 0), _flat(Color(0.5, 0.55, 0.6), 0.6, 0.4), plant)   # cooling jacket bands
	_cyl(0.22, 0.5, c + Vector3(0, y0 + h + r * 0.4 + 0.25, 0), M.enamel_blue, plant)   # agitator drive
	var glass := _flat(Color(0.85, 0.92, 0.95, 0.15), 0.0, 0.05); glass.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	var wa := 0.35; var wy0 := y0 + 0.4; var wy1 := y0 + h - 0.4
	var beer := _flat(Color(0.7, 0.48, 0.14, 0.92), 0.0, 0.25); beer.emission_enabled = true; beer.emission = Color(0.5, 0.32, 0.08); beer.emission_energy_multiplier = 0.35; beer.cull_mode = BaseMaterial3D.CULL_DISABLED; beer.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	var liq := _arc(r - 0.03, 0.0, 1.0, PI * 0.5 - wa, PI * 0.5 + wa, 10, beer, c + Vector3(0, wy0, 0), plant)
	_arc(r + 0.005, wy0, wy1, PI * 0.5 - wa, PI * 0.5 + wa, 10, glass, c, plant)
	for yy in [wy0, wy1]: _arc(r + 0.03, yy - 0.04, yy + 0.04, PI * 0.5 - wa - 0.04, PI * 0.5 + wa + 0.04, 10, M.steel_dull, c, plant)
	var dark := _flat(Color(0.05, 0.04, 0.03), 0.0, 0.9); dark.cull_mode = BaseMaterial3D.CULL_DISABLED
	_arc(r - 0.25, wy0, wy1, PI * 0.5 - wa - 0.2, PI * 0.5 + wa + 0.2, 10, dark, c, plant)   # the inside behind the beer
	var bub := _particles(c + Vector3(0, wy0 + 0.1, r - 0.15), 120, 2.2, Vector3(0, 0.6, 0), 6.0, 0.05, Color(1.0, 0.95, 0.8, 0.9), plant, 1.3)
	(bub.process_material as ParticleProcessMaterial).emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX; (bub.process_material as ParticleProcessMaterial).emission_box_extents = Vector3(0.4, 0.05, 0.05)
	(bub.process_material as ParticleProcessMaterial).gravity = Vector3.ZERO; bub.emitting = false
	_seg(c + Vector3(0.6, y0 + h + 0.4, 0), c + Vector3(0.6, y0 + h + 1.6, 0), 0.06, M.steel_dull, plant)   # the CO2 vent
	_levels[id] = {"liq": liq, "y0": wy0, "h": wy1 - wy0, "kind": "fermenter", "bub": bub, "arc": true}

## 0.14 (L23): the distillation column. A tall shell on a skirt with a platform every few metres, an overhead line to a condenser and a reflux drum, a
## kettle reboiler at the foot with its steam (the engine's steam kg/s), and eight thermometer tags down the side that read the engine's tray temperatures:
## cool at the top (the light key) to hot at the bottom (water). A row of tray windows shows froth on each tray.
func _column(id: String, c: Vector3, u: Dictionary) -> void:
	var r := 0.75; var y0 := 1.2; var h := 10.0
	var sh := _shader("steel", {"rough_base": 0.36, "metallic": 0.75, "blotch": 0.12})
	_cyl(r, h, c + Vector3(0, y0 + h * 0.5, 0), M.clad, plant, -1.0, 40)
	for i in int(h / 0.9): _cyl(r + 0.012, 0.03, c + Vector3(0, y0 + 0.45 + i * 0.9, 0), M.steel_dull, plant, -1.0, 40)
	_dished(r, c + Vector3(0, y0 + h, 0), M.clad, plant, true); _dished(r, c + Vector3(0, y0, 0), M.clad, plant, false)
	_cyl(r * 0.98, y0 - r * 0.25, c + Vector3(0, (y0 - r * 0.25) * 0.5, 0), M.paint_grey, plant, -1.0, 40)
	for py in [4.2, 8.0, y0 + h + 0.2]:   # platforms with rails
		_lathe(PackedVector2Array([Vector2(r + 0.05, 0), Vector2(r + 0.9, 0), Vector2(r + 0.9, 0.05), Vector2(r + 0.05, 0.05)]), 40, M.plate, c + Vector3(0, py, 0), plant, false)
		_torus(r + 0.9, 0.018, c + Vector3(0, py + 1.0, 0), M.steel_dull, plant)
	for sx in [-0.22, 0.22]: _seg(c + Vector3(sx, 0, -(r + 0.35)), c + Vector3(sx, y0 + h + 1.2, -(r + 0.35)), 0.022, M.yellow, plant)   # ladder at the back
	# the overhead: vapour line over to a condenser and a reflux drum, a reflux line back
	_pipe([c + Vector3(0, y0 + h + r * 0.5, 0), c + Vector3(0, y0 + h + 1.2, 0), c + Vector3(2.4, y0 + h + 1.2, 0), c + Vector3(2.4, 1.6, -0.6)], 0.12, M.clad, plant, true)
	_exchanger(c + Vector3(2.4, 0, -0.6), 2.4, 0.38, M.enamel_green, true)   # the condenser at grade
	_drum(c + Vector3(2.6, 1.0, 1.4), 0.42, 1.8, _paint(Color(0.55, 0.56, 0.56)), plant)   # the reflux drum
	_pipe([c + Vector3(1.7, 1.0, 1.4), c + Vector3(1.2, 1.0, 1.4), c + Vector3(1.2, y0 + h - 0.6, 0.6), c + Vector3(0.6, y0 + h - 0.6, 0.3)], 0.05, M.steel_dull, plant, false)
	# the reboiler: a kettle on saddles by the foot, with the steam supply and its plume at the trap
	_drum(c + Vector3(-2.2, 1.0, 0.4), 0.55, 2.2, M.clad, plant, true)
	_pipe([c + Vector3(-1.4, 1.5, 0.4), c + Vector3(-0.6, 1.5, 0.4), c + Vector3(-0.6, 1.8, 0.2)], 0.1, M.clad, plant, false)
	_kind[id] = "boiler"; _steam[id] = _particles(c + Vector3(-3.4, 0.4, 0.9), 26, 2.5, Vector3(0, 1.4, 0), 14.0, 0.5, Color(0.92, 0.94, 0.96, 0.4), plant, 3.0)
	# tray windows: a column of small round sight glasses, each showing a lit froth layer
	var froth := _flat(Color(0.78, 0.73, 0.56), 0.0, 0.6, Color(1.0, 0.9, 0.6), 0.5)
	var tags: Array = []
	var nt := 8
	for k in nt:
		var yy := y0 + h - 0.8 - (h - 1.6) * float(k) / float(nt - 1)
		var p := c + Vector3(0, yy, r)
		var sg := _cyl(0.13, 0.08, p + Vector3(0, 0, 0.03), M.steel_dull, plant, -1.0, 20); sg.rotation_degrees.x = 90
		var fr := _cyl(0.1, 0.02, p + Vector3(0, -0.02, 0.075), froth, plant, -1.0, 20); fr.rotation_degrees.x = 90
		var t := Label3D.new(); t.text = "--"; t.font = load("res://ui/fonts/Archivo-Variable.ttf"); t.font_size = 48; t.pixel_size = 0.0028; t.outline_size = 10; t.outline_modulate = Color(0, 0, 0, 0.9)
		t.modulate = Color(0.85, 0.95, 1.0); t.position = p + Vector3(0.62, 0.0, 0.08); t.billboard = BaseMaterial3D.BILLBOARD_FIXED_Y; plant.add_child(t); tags.append(t)
	var liq := _gauge_glass(c + Vector3(0.55, 0.35, r + 0.08), 1.2, Color(0.8, 0.85, 0.82))   # the sump level
	_levels[id] = {"liq": liq, "y0": 0.35, "h": 1.2, "kind": "column"}
	_towers[id] = {"tags": tags, "kind": "column"}

## 0.14 (L25): an acid absorption tower: a brick-lined packed tower (acid-proof paint, a distributor on top, acid in at the top and out at the foot to a pump tank).
## (L26): the nitric acid absorber: a tall stainless tray tower whose sight glasses show the gas colour: brown NO2 low in the tower, clearing toward the top.
func _absorber(id: String, c: Vector3, nitric: bool) -> void:
	var r := 0.9 if not nitric else 0.8; var y0 := 1.0; var h := 7.5 if not nitric else 11.0
	var paint: Material = _coat(Color(0.32, 0.36, 0.3), 0.5, 0.7) if not nitric else M.ss
	_cyl(r, h, c + Vector3(0, y0 + h * 0.5, 0), paint, plant, -1.0, 40)
	for i in int(h / 1.2): _cyl(r + 0.015, 0.05, c + Vector3(0, y0 + 0.6 + i * 1.2, 0), M.steel_dull, plant, -1.0, 40)
	_dished(r, c + Vector3(0, y0 + h, 0), paint, plant, true)
	_cyl(r * 1.05, y0, c + Vector3(0, y0 * 0.5, 0), _flat(Color(0.5, 0.48, 0.45), 0.0, 0.9), plant, -1.0, 40)   # concrete plinth
	_pipe([c + Vector3(0, y0 + h + r * 0.45, 0), c + Vector3(0, y0 + h + 1.0, 0), c + Vector3(1.4, y0 + h + 1.0, 0)], 0.1, M.steel_dull, plant, true)   # gas out
	_pipe([c + Vector3(r + 1.2, 0.4, 0.6), c + Vector3(r + 1.2, y0 + h - 0.6, 0.6), c + Vector3(r - 0.05, y0 + h - 0.6, 0.6)], 0.05, M.paint_blue if not nitric else M.steel_dull, plant, false)   # liquid in at the top
	_cyl(0.5, 1.0, c + Vector3(r + 1.2, 0.5, 0.6), M.paint_blue, plant)   # the circulation tank
	for sx in [-0.22, 0.22]: _seg(c + Vector3(sx, 0, r + 0.3), c + Vector3(sx, y0 + h, r + 0.3), 0.022, M.yellow, plant)
	if nitric:   # sight glasses up the side: the gas colour by height (brown NO2 low, clearing high)
		var mats: Array = []
		for k in 6:
			var yy := y0 + 1.0 + (h - 2.0) * float(k) / 5.0
			var p := c + Vector3(0.45, yy, r * 0.88)
			_cyl(0.14, 0.08, p + Vector3(0, 0, 0.04), M.steel_dull, plant, -1.0, 20).rotation_degrees.x = 90
			var gm := _flat(Color(0.55, 0.25, 0.08), 0.0, 0.3, Color(0.75, 0.32, 0.08), 0.6); mats.append(gm)
			_cyl(0.105, 0.02, p + Vector3(0, 0, 0.085), gm, plant, -1.0, 20).rotation_degrees.x = 90
		_towers[id] = {"mats": mats, "kind": "nitric"}

## 0.14 (L26): the ammonia burner: a squat flanged converter on a frame. Inside, under the flange, the platinum gauze; a peep window shows it glowing at the
## engine's outlet temperature (bright orange-yellow at 860 C). The N2O abater basket sits under it in the plant (n2o_abater: a small basket vessel).
func _gauze_burner(id: String, c: Vector3) -> void:
	var ss: Material = M.ss
	_cyl(1.2, 0.5, c + Vector3(0, 3.4, 0), ss, plant, 0.3, 40)   # the inlet cone above
	_cyl(1.35, 0.16, c + Vector3(0, 3.1, 0), M.steel_dull, plant, -1.0, 48)   # the gauze flange
	for i in 24: var a := i * TAU / 24.0; _cyl(0.03, 0.22, c + Vector3(cos(a) * 1.28, 3.1, sin(a) * 1.28), M.black, plant, -1.0, 8)
	_cyl(1.2, 1.6, c + Vector3(0, 2.2, 0), _flat(Color(0.36, 0.34, 0.32), 0.4, 0.6), plant, -1.0, 40)   # the lower shell (hot)
	_cyl(1.2, 0.6, c + Vector3(0, 1.1, 0), ss, plant, 0.4, 40)
	for lx in [-1.0, 1.0]: for lz in [-1.0, 1.0]: _box(Vector3(0.14, 1.0, 0.14), c + Vector3(lx * 0.95, 0.5, lz * 0.95), M.paint_grey, plant)
	var gm := _glowmat(true)
	for sg in [1.0, -1.0]: _peep(c + Vector3(0, 2.75, sg * 1.2), Vector3(0, 0, sg), 0.13, 0.25, gm)
	var ring := _flat(Color(0.2, 0.08, 0.04), 0.3, 0.5, Color(1.0, 0.4, 0.1), 0.0)
	_torus(1.22, 0.02, c + Vector3(0, 2.98, 0), ring, plant)   # the gauze edge glowing at the flange
	var l := OmniLight3D.new(); l.light_color = Color(1.0, 0.6, 0.25); l.light_energy = 0.0; l.light_specular = 0.0; l.omni_range = 4.0; l.position = c + Vector3(0, 2.75, 1.7); plant.add_child(l)
	_glow[id] = {"mat": gm, "light": l, "kind": "burner", "window": true, "extra": [ring], "flick": true, "lampk": 1.4, "ringk": 1.0}

func _abater(c: Vector3) -> void:
	var ss: Material = M.ss
	_vessel(c, 0.55, 1.2, ss, plant, {"legs": true, "base": 0.7})

## 0.14 (L24): the containment yard's CSTR: a jacketed stirred reactor in a concrete bund, with a big dial thermometer on the front, the agitator drive, a bursting disc
## and a relief line on the top head to the relief unit. The shell darkens and glows toward runaway (the engine's temperature against the trip), the dial follows it.
func _cstr_unit(id: String, c: Vector3) -> void:
	var sh := _shader("steel", {"rough_base": 0.3, "metallic": 0.8, "blotch": 0.1})
	_vessel(c, 1.0, 2.4, sh, plant, {"legs": true, "base": 1.0})
	_cyl(1.08, 1.4, c + Vector3(0, 1.9, 0), M.enamel_blue, plant, -1.0, 40)   # the cooling jacket
	for sg in [-1.0, 1.0]: _seg(c + Vector3(sg * 1.08, 1.4 + (0.9 if sg > 0 else 0.0), 0), c + Vector3(sg * 1.6, 1.4 + (0.9 if sg > 0 else 0.0), 0), 0.05, M.paint_green, plant)   # jacket water in/out
	_cyl(0.25, 0.5, c + Vector3(0, 4.4 + 0.25, 0), M.enamel_green, plant); _cyl(0.18, 0.25, c + Vector3(0, 4.95, 0), M.steel_dull, plant)   # agitator drive
	_seg(c + Vector3(0.45, 4.2, 0), c + Vector3(0.45, 4.6, 0), 0.08, M.steel_dull, plant); _cyl(0.14, 0.04, c + Vector3(0.45, 4.6, 0), M.red, plant)   # the bursting disc holder
	var gm := _gauge(c + Vector3(0, 2.0, 1.18), Vector3(0, 0, 1), plant, 0.3, 0.2)   # the dial thermometer
	var bund := _flat(Color(0.55, 0.54, 0.5), 0.0, 0.85)   # the bund: a low concrete wall round the reactor
	for sg2 in [-1.0, 1.0]: _box(Vector3(4.4, 0.6, 0.2), c + Vector3(0, 0.3, sg2 * 2.2), bund, plant); _box(Vector3(0.2, 0.6, 4.4), c + Vector3(sg2 * 2.2, 0.3, 0), bund, plant)
	var glow := _glowmat(); _cyl(1.012, 0.9, c + Vector3(0, 3.0, 0), glow, plant, -1.0, 40)
	var l := OmniLight3D.new(); l.light_color = Color(1.0, 0.45, 0.15); l.light_energy = 0.0; l.light_specular = 0.0; l.omni_range = 3.5; l.position = c + Vector3(0, 3.0, 1.5); plant.add_child(l)
	var jet := _particles(c + Vector3(0.45, 4.7, 0), 60, 2.0, Vector3(0, 4.0, 0), 10.0, 0.6, Color(0.92, 0.93, 0.95, 0.55), plant, 3.5); jet.emitting = false
	_cstr[id] = {"dial": gm, "glow": glow, "light": l, "jet": jet}

## 0.14 (L24, L27): the relief unit: a spring relief valve on a riser, its discharge to a knock-out catch tank (the containment), a tail pipe up to a safe height.
func _relief(id: String, c: Vector3) -> void:
	_seg(c + Vector3(0, 0, 0), c + Vector3(0, 1.8, 0), 0.08, M.steel_dull, plant)
	_cyl(0.13, 0.35, c + Vector3(0, 2.0, 0), M.red, plant); _cyl(0.07, 0.45, c + Vector3(0, 2.4, 0), M.steel_dull, plant); _sph(0.06, c + Vector3(0, 2.65, 0), M.red, plant)   # body, spring bonnet, cap
	_pipe([c + Vector3(0.15, 2.0, 0), c + Vector3(1.2, 2.0, 0), c + Vector3(1.2, 1.6, 0)], 0.09, M.steel_dull, plant, true)
	_drum(c + Vector3(1.2, 0.9, 0.0), 0.55, 2.0, _paint(Color(0.62, 0.5, 0.2)), plant)   # the catch tank
	_seg(c + Vector3(1.8, 1.4, 0), c + Vector3(1.8, 6.5, 0), 0.08, M.steel_dull, plant)   # the vent tail pipe from the catch tank
	var jet := _particles(c + Vector3(1.8, 6.6, 0), 60, 2.5, Vector3(0, 5.0, 0), 8.0, 0.7, Color(0.92, 0.93, 0.95, 0.5), plant, 4.0); jet.emitting = false
	_reliefs[id] = {"jet": jet}

## 0.14 (L24): the interlock: a trip cabinet with its lamp, and the shut-off valve it closes.
func _interlock(id: String, c: Vector3) -> void:
	_box(Vector3(0.8, 1.6, 0.4), c + Vector3(0, 0.8, 0), _enamel(Color(0.4, 0.4, 0.36)), plant)
	_box(Vector3(0.7, 0.4, 0.02), c + Vector3(0, 1.25, 0.21), _flat(Color(0.12, 0.12, 0.13), 0.2, 0.4), plant)
	var lamp := _flat(Color(0.4, 0.05, 0.03), 0.0, 0.3, Color(1.0, 0.08, 0.04), 0.0); lamp.resource_name = "trip_lamp"
	_cyl(0.06, 0.05, c + Vector3(-0.2, 1.25, 0.23), lamp, plant).rotation_degrees.x = 90
	_cyl(0.06, 0.05, c + Vector3(0.2, 1.25, 0.23), _flat(Color(0.05, 0.3, 0.08), 0.0, 0.3, Color(0.1, 1.0, 0.3), 1.5), plant).rotation_degrees.x = 90
	_cstr["trip_" + id] = {"lamp": lamp}

## 0.14: a drain sink (L23's stillage): a grated pit with a kerb.
## 0.14 (L28): the primary steam reformer. A tall refractory box in heat paint on legs, a row of catalyst tubes standing through the roof to a hot outlet
## collector, roof fuel headers, peepholes down both long walls that glow with the engine's outlet temperature, a convection section and its stack.
func _reformer(id: String, c: Vector3) -> void:
	var panel := _shader("panel", {"soot_y0": 4.6, "soot_y1": 7.0})
	for lx in [-2.0, 0.0, 2.0]: for lz in [-1.5, 1.5]: _box(Vector3(0.24, 0.9, 0.24), c + Vector3(lx, 0.45, lz), M.paint_grey, plant)   # legs
	_box(Vector3(4.6, 4.6, 3.4), c + Vector3(0, 3.2, 0), panel, plant)   # the radiant box
	for k in 5:   # stiffener ribs
		var ry := 1.4 + 0.9 * float(k)
		for sz in [-1.0, 1.0]: _box(Vector3(4.62, 0.09, 0.05), c + Vector3(0, ry, sz * 1.72), M.steel_dull, plant)
		for sx in [-1.0, 1.0]: _box(Vector3(0.05, 0.09, 3.42), c + Vector3(sx * 2.32, ry, 0), M.steel_dull, plant)
	for x in [-2.3, -0.77, 0.77, 2.3]: for z in [-1.7, 1.7]: _box(Vector3(0.1, 4.64, 0.1), c + Vector3(x, 3.2, z), M.steel_dull, plant)   # buckstays
	var hot := _glowmat(); hot.albedo_color = Color(0.35, 0.34, 0.33)
	for i in 8:   # the catalyst tubes through the roof (pigtails into the collector)
		var tx := -1.75 + 0.5 * float(i)
		_cyl(0.075, 1.2, c + Vector3(tx, 6.1, 0), M.steel_dull, plant, -1.0, 16)
		_torus(0.1, 0.02, c + Vector3(tx, 5.56, 0), M.steel_dull, plant)
		_seg(c + Vector3(tx, 6.7, 0), c + Vector3(tx, 6.95, 0.45), 0.03, M.steel_dull, plant)
	_seg(c + Vector3(-2.0, 7.0, 0.45), c + Vector3(2.0, 7.0, 0.45), 0.16, hot, plant, 24)   # the outlet collector: dull red when the reformer runs hot
	for sz in [-0.9, 0.9]: _seg(c + Vector3(-2.2, 5.75, sz), c + Vector3(2.2, 5.75, sz), 0.05, M.yellow, plant)   # roof fuel headers
	_box(Vector3(4.9, 0.05, 1.0), c + Vector3(0, 5.55, 2.2), M.plate, plant)   # burner platform on the roof edge
	for sx in [-2.4, 2.4]: _seg(c + Vector3(sx, 5.55, 2.65), c + Vector3(sx, 6.55, 2.65), 0.02, M.steel_dull, plant)
	_seg(c + Vector3(-2.4, 6.55, 2.65), c + Vector3(2.4, 6.55, 2.65), 0.02, M.steel_dull, plant)
	for sx2 in [-0.2, 0.2]: _seg(c + Vector3(2.7 + sx2, 0, 2.0), c + Vector3(2.7 + sx2, 5.55, 2.0), 0.02, M.yellow, plant)   # ladder
	for i in 18: _seg(c + Vector3(2.5, 0.3 + i * 0.3, 2.0), c + Vector3(2.9, 0.3 + i * 0.3, 2.0), 0.012, M.yellow, plant)
	_box(Vector3(1.8, 2.4, 1.6), c + Vector3(-1.4, 6.7, -0.9), panel, plant)   # the convection section at the back
	_cyl(0.85, 0.8, c + Vector3(-1.4, 8.3, -0.9), panel, plant, 0.4, 32)
	_cyl(0.4, 1.6, c + Vector3(-1.4, 9.5, -0.9), M.steel_dull, plant, 0.36, 32)   # stack
	var gm := _glowmat(true)
	for sz2 in [1.0, -1.0]: for px in [-1.5, 0.0, 1.5]: _peep(c + Vector3(px, 2.2, sz2 * 1.7), Vector3(0, 0, sz2), 0.13, 0.26, gm)   # peepholes on both long walls
	var l := OmniLight3D.new(); l.light_color = Color(1.0, 0.5, 0.2); l.light_energy = 0.0; l.light_specular = 0.0; l.omni_range = 5.5; l.position = c + Vector3(0, 1.2, 2.4); plant.add_child(l)
	_glow[id] = {"mat": gm, "light": l, "kind": "burner", "window": true, "extra": [hot], "flick": true, "lampk": 2.0, "ringk": 0.35}

## 0.14 (L28): CO2 removal: the absorber (amine down the packing) and a shorter regenerator beside it with its reboiler, joined by the rich and CO2 lines.
func _co2_removal(id: String, c: Vector3) -> void:
	_absorber(id, c, false)
	var rc := c + Vector3(2.5, 0, 0.2)
	var paint := _coat(Color(0.36, 0.38, 0.34), 0.5, 0.7)
	_cyl(0.65, 5.6, rc + Vector3(0, 1.0 + 2.8, 0), paint, plant, -1.0, 32)
	_dished(0.65, rc + Vector3(0, 6.6, 0), paint, plant, true)
	_cyl(0.7, 1.0, rc + Vector3(0, 0.5, 0), _flat(Color(0.5, 0.48, 0.45), 0.0, 0.9), plant, -1.0, 32)
	for i in 4: _cyl(0.665, 0.05, rc + Vector3(0, 1.6 + i * 1.3, 0), M.steel_dull, plant, -1.0, 32)
	_exchanger(rc + Vector3(0.2, 0, 1.4), 1.8, 0.32, M.heat_paint, false)   # the reboiler
	_pipe([c + Vector3(0.6, 1.4, 0.7), c + Vector3(1.3, 1.4, 0.9), rc + Vector3(-0.6, 5.8, 0.4)], 0.06, M.paint_blue, plant, true)   # rich amine to the regenerator top
	_pipe([rc + Vector3(0, 7.0, 0), rc + Vector3(0, 7.6, 0), rc + Vector3(0.9, 7.6, 0)], 0.08, M.steel_dull, plant, true)   # CO2 off the top

## 0.14 (L28): the methanator: a short clad vessel on a skirt; its band warms a little as it turns the last CO and CO2 into methane.
func _methanator(id: String, c: Vector3) -> void:
	var sh := _shader("steel", {"rough_base": 0.35, "metallic": 0.7, "blotch": 0.15})
	_vessel(c, 0.75, 2.8, sh, plant, LADDER.merged({"clad": true, "base": 0.8}))
	var gm := _glowmat(); var w := _cyl(0.77, 0.3, c + Vector3(0, 2.0, 0), gm, plant, -1.0, 32); w.name = "window"
	var l := OmniLight3D.new(); l.light_color = Color(1.0, 0.45, 0.15); l.light_energy = 0.0; l.light_specular = 0.0; l.omni_range = 2.4; l.position = c + Vector3(0, 2.0, 1.0); plant.add_child(l)
	_glow[id] = {"mat": gm, "light": l, "kind": "converter", "lampk": 0.4}

func _sink(c: Vector3) -> void:
	_box(Vector3(1.6, 0.15, 1.6), c + Vector3(0, 0.075, 0), _flat(Color(0.5, 0.49, 0.46), 0.0, 0.9), plant)
	_box(Vector3(1.2, 0.02, 1.2), c + Vector3(0, 0.16, 0), M.plate, plant)

func _ch56_live(info: Dictionary, running: bool, g: Dictionary) -> void:
	for id in _levels:
		var e: Dictionary = _levels[id]; var inf: Dictionary = info.get(id, {})
		var f := 0.0
		match str(e.kind):
			"flash": f = clampf(1.0 - float(inf.get("beta", 1.0)), 0.0, 1.0) * 2.5 if running else 0.0   # the liquid fraction of the feed; the drum holds a working level, shown x2.5 so a small catch shows
			"fermenter", "column": f = float(inf.get("level", 0.0)) if running else 0.0
		if bool(e.get("arc", false)):
			var liq := e.liq as MeshInstance3D; liq.scale.y = maxf(0.02, float(e.h) * clampf(f, 0.02, 1.0))
			if e.has("bub"): (e.bub as GPUParticles3D).emitting = running and float(inf.get("gas", 0.0)) > 0.0
		else: _set_level(e, f)
	for id in _towers:
		var tw: Dictionary = _towers[id]; var inf2: Dictionary = info.get(id, {})
		if str(tw.kind) == "column":
			var n := int(inf2.get("tray_n", 0))
			for k in (tw.tags as Array).size():
				var t := tw.tags[k] as Label3D
				if not running or n <= 0: t.text = "--"; continue
				var ti := clampi(roundi(float(k) / float((tw.tags as Array).size() - 1) * float(n - 1)), 0, n - 1)
				t.text = "%d °C" % roundi(float(inf2.get("tray_T%d" % ti, 273.15)) - 273.15)
		elif str(tw.kind) == "nitric":   # brown at the foot, clearing up the tower while it absorbs; clear when stopped
			for k in (tw.mats as Array).size():
				var m := tw.mats[k] as StandardMaterial3D; var a := (1.0 - float(k) / 5.0) if running else 0.0
				m.albedo_color = Color(0.85, 0.87, 0.86).lerp(Color(0.55, 0.22, 0.06), a); m.emission = Color(0.8, 0.82, 0.8).lerp(Color(0.75, 0.3, 0.06), a); m.emission_energy_multiplier = 0.25 + 0.5 * a
	var trip := 398.15; var Tnow := 0.0; var tripped := false   # L24: the reactor temperature is the level's hero reading (C), its top the relief margin
	var li = app.b.q("levelInfo") if app != null and app.b != null and not _cstr.is_empty() else null
	if li is Dictionary and li.get("hero") is Dictionary and str(li.hero.get("key", "")) == "reactor_c": Tnow = float(li.hero.get("value", 25.0)) + 273.15; trip = float(li.hero.get("hi", 125.0)) + 273.15
	for id in _cstr:
		var cs: Dictionary = _cstr[id]
		if cs.has("lamp"): (cs.lamp as StandardMaterial3D).emission_energy_multiplier = 3.0 if tripped else 0.0; continue
		var frac := clampf((Tnow - 298.15) / maxf(1.0, trip - 298.15), 0.0, 1.3) if running and Tnow > 0.0 else 0.0
		(cs.dial as ShaderMaterial).set_shader_parameter("value", clampf(frac * 0.75, 0.0, 1.0))
		var hot := clampf((frac - 0.85) / 0.3, 0.0, 1.0)   # near the trip the shell shows heat: a dull red band, not a blackbody (the CSTR runs at 120 C)
		(cs.glow as StandardMaterial3D).emission = Color(0.8, 0.12, 0.03); (cs.glow as StandardMaterial3D).emission_energy_multiplier = hot * 1.2
		(cs.light as OmniLight3D).light_energy = hot * 1.5
		(cs.jet as GPUParticles3D).emitting = running and frac >= 1.0
		tripped = tripped or (running and frac >= 1.0)
	for id in _reliefs: ((_reliefs[id] as Dictionary).jet as GPUParticles3D).emitting = tripped


var _loop := false   ## chapter 5: the plant is a recycle loop (compressor + mixer3 + separator)
var _lp: ShaderMaterial
func _loop_paint() -> ShaderMaterial:
	if _lp == null: _lp = _paint(Color(0.78, 0.42, 0.12))   # process gas in the loop: one colour all round
	return _lp

## 0.14 (chapter 5): the recycle compressor: a barrel-casing centrifugal machine on a concrete block, big suction and discharge nozzles up, a coupling guard,
## the motor with cooling fins, a lube-oil console beside it, and a nameplate. The loop's own colour on its nozzles.
func _recycle_compressor(c: Vector3) -> void:
	_box(Vector3(4.6, 0.6, 2.0), c + Vector3(0, 0.3, 0), _flat(Color(0.55, 0.54, 0.51), 0.0, 0.9), plant)   # the block
	var casing := _paint(Color(0.28, 0.36, 0.44))
	var cs := _cyl(0.7, 1.8, c + Vector3(-0.9, 1.35, 0), casing, plant, -1.0, 40); cs.rotation_degrees.z = 90
	for sx in [-1.8, 0.0]: var fl := _cyl(0.82, 0.12, c + Vector3(sx, 1.35, 0), M.steel_dull, plant, -1.0, 40); fl.rotation_degrees.z = 90
	for nx in [-1.4, -0.4]: _seg(c + Vector3(nx, 1.9, 0), c + Vector3(nx, 2.55, 0), 0.2, _loop_paint(), plant); _flange(c + Vector3(nx, 2.55, 0), Vector3.UP, 0.2, plant)
	_box(Vector3(0.7, 0.6, 0.7), c + Vector3(0.5, 1.2, 0), M.yellow, plant)   # coupling guard
	var mo := _cyl(0.6, 1.4, c + Vector3(1.6, 1.2, 0), _paint(Color(0.12, 0.28, 0.22)), plant, -1.0, 36); mo.rotation_degrees.z = 90
	for i in 9: _torus(0.62, 0.025, c + Vector3(1.05 + i * 0.13, 1.2, 0), M.black, plant).rotation_degrees.z = 90
	_box(Vector3(0.9, 1.2, 0.6), c + Vector3(-0.6, 0.6, 1.5), _paint(Color(0.55, 0.56, 0.56)), plant)   # lube console
	_gauge(c + Vector3(-0.8, 1.0, 1.81), Vector3(0, 0, 1), plant, 0.6, 0.08); _gauge(c + Vector3(-0.4, 1.0, 1.81), Vector3(0, 0, 1), plant, 0.45, 0.08)

# ---- live state ---------------------------------------------------------------------------------------------------------------------------------
func set_snapshot(g: Dictionary) -> void:
	rebuild()
	var st := {}
	for s in g.get("streams", []): st[str(s.get("id", ""))] = s
	var running := str(g.get("phase", "")) != "design"
	for id in _glow:
		var gw: Dictionary = _glow[id]; var T := 0.0
		if _out.has(id) and st.has(_out[id]): T = float(st[_out[id]].get("T", 0.0))
		var heat := 0.0   # the flame's size (0..1), the old ramp: 620 K to 880 K
		var bb: Array = _blackbody(T) if running else [Color(0.55, 0.07, 0.02), 0.0]
		var col: Color = bb[0]; var e: float = bb[1]; var lamp := e * 1.2 * float(gw.get("lampk", 1.0))   # the warm light on the shell scales with the glow
		if running and T > 0.0:
			heat = clampf((T - 620.0) / 260.0, 0.0, 1.0)
			if float(_tmin.get(id, 0.0)) > 0.0 and T < float(_tmin[id]): heat = 0.0; e = 0.0; lamp = 0.0   # asleep: below light-off the bed stays dark steel
			if float(_tmax.get(id, 0.0)) > 0.0 and T > float(_tmax[id]): heat = 1.0; col = Color(1.0, 0.22, 0.04); e = 1.5; lamp = 2.6   # sintering: a hard red-orange at the cap, and the light to match
		gw["sinter"] = e >= 1.5 and col.g < 0.3
		var cold := e <= 0.0 and str(gw.get("kind", "")) in ["converter", "bed"]
		if cold: lamp = 1.3   # asleep: a cool fill so the band reads as steel, not a void
		(gw.light as OmniLight3D).light_color = Color(0.75, 0.85, 1.0) if cold else Color(1.0, 0.45, 0.15)
		(gw.mat as StandardMaterial3D).emission = col
		if not bool(gw.get("window", false)): (gw.mat as StandardMaterial3D).albedo_color = Color(0.5, 0.52, 0.55).lerp(Color(0.14, 0.12, 0.12), e / 1.5)   # the steel darkens as it glows, so the colour is the blackbody's and not steel lit orange
		(gw.mat as StandardMaterial3D).emission_energy_multiplier = e
		(gw.light as OmniLight3D).light_energy = lamp; gw["lamp"] = lamp
		for xm in gw.get("extra", []): (xm as StandardMaterial3D).emission = col; (xm as StandardMaterial3D).emission_energy_multiplier = e * float(gw.get("ringk", 0.5))   # the burner throats' rings
		if gw.has("flame"): (gw.flame as GPUParticles3D).emitting = heat > 0.05; (gw.flame as GPUParticles3D).amount_ratio = clampf(heat, 0.2, 1.0)
	var info := {}
	for u in g.get("units", []): info[str(u.get("id", ""))] = u.get("info", {}) if u.get("info", {}) is Dictionary else {}
	var furn := 0.0; var comp := 0.0; var vent := 0.0   # phase C sound: the plant you drew is heard: compressors, the hottest fire, vents
	for id in _glow: furn = maxf(furn, clampf(float(((_glow[id] as Dictionary).mat as StandardMaterial3D).emission_energy_multiplier) / 1.5, 0.0, 1.0))
	for id in _types:
		if str(_types[id]) == "compressor": comp = 0.75
		if str(_types[id]) in ["vent", "stack", "flare"]: vent = 0.35
	if running: _sound_bed(comp, furn, 0.5, vent)
	else: _sound_bed(0, 0, 0, 0)
	_beds_live(info, running); _kettles_live(info, running); _bench_live(running); _ch56_live(info, running, g)
	if _board != null:
		var lv = app.b.q("levelView") if app != null and app.b != null else null
		_board.live(self, lv if lv is Dictionary else {}, running, g)
	for id in _analyser:   # the flue analyser reads the engine's stack composition
		var inf: Dictionary = info.get(id, {})
		var tx := "Flue gas, % wet"   # Anjali: the engine's fractions include the water; say so, and show it (L03 identifies its fuel by CO2 : H2O)
		if running and inf.has("y_O2"):
			for k in [["O2", "y_O2"], ["CO2", "y_CO2"], ["H2O", "y_H2O"], ["SO2", "y_SO2"]]:
				if inf.has(k[1]) and (k[0] == "O2" or float(inf[k[1]]) > 0.0): tx += "\n%s  %.1f" % [k[0], float(inf[k[1]]) * 100.0]
			if float(inf.get("ppmv_CO", 0.0)) > 0.0: tx += "\nCO  %.0f ppm" % float(inf.ppmv_CO)   # CO in ppm, as real analysers read it
		else: tx += "\n--"
		(_analyser[id] as Label3D).text = tx
	for id in _steam:
		var ps := _steam[id] as GPUParticles3D
		if str(_kind.get(id, "")) == "boiler":   # Mateo: the plume follows the boiler's duty, not just "running"
			var kg := float((info.get(id, {}) as Dictionary).get("steam_kg_s", 0.0))
			ps.emitting = running and kg > 0.0
			ps.amount_ratio = clampf(kg / 0.6, 0.15, 1.0); ps.speed_scale = 0.6 + clampf(kg / 0.6, 0.0, 1.0) * 0.8
		else: ps.emitting = running

func _process(dt: float) -> void:
	_t += dt
	if cam != null and not cam.current and visible: cam.make_current()
	_cam_step(dt)
	var hid := _hover_id()
	_hov.visible = hid != ""
	if hid != "": _hov.text = hid; _hov.position = (_at[hid] as Vector3) + Vector3(0, _height(str(_types.get(hid, ""))) + 0.6, 0)
	for id in _glow:   # a sintering bed does not glow steadily: a slow throb, never above the cap
		var gw: Dictionary = _glow[id]
		if bool(gw.get("sinter", false)): (gw.mat as StandardMaterial3D).emission_energy_multiplier = 1.5 * (0.88 + 0.12 * sin(_t * 5.0))
		if bool(gw.get("flick", false)) and float(gw.get("lamp", 0.0)) > 0.0:   # a fire's light is never steady
			(gw.light as OmniLight3D).light_energy = float(gw.lamp) * (0.86 + 0.09 * sin(_t * 11.0 + float(str(id).hash() % 7)) + 0.05 * sin(_t * 23.0))
	_ft_tick(dt)

## Half-extents round a unit's floor position, for framing: [x0, x1, z0, z1, height] (m), the whole unit with its platform, fan set or stack.
func _ext(ty: String) -> Array:
	match ty:
		"reformer": return [-2.6, 2.6, -2.0, 2.6, 9.4]
		"co2_removal": return [-1.1, 3.6, -1.1, 1.8, 9.6]
		"methanator": return [-0.9, 0.9, -0.9, 0.9, 4.7]
		"burner", "co_burner": return [-4.1, 3.3, -1.4, 2.0, 2.9]
		"eq_reactor": return [-2.1, 2.1, -2.1, 2.1, 8.0]
		"eq_bed": return [-1.1, 1.1, -1.1, 1.1, 3.6]
		"gasifier": return [-2.0, 2.0, -2.0, 2.0, 7.3]
		"heater": return [-1.8, 2.3, -1.5, 2.3, 7.95]
		"boiler": return [-1.6, 1.6, -1.0, 1.0, 3.4]
		"stoich_reactor": return [-0.8, 0.8, -0.8, 0.8, 3.1] if _lid != "L09" else [-1.2, 2.4, -0.8, 0.6, 1.8]
		"splitter": return [-1.0, 1.0, -0.8, 1.3, 1.8]
		"nh3_sep": return [-0.8, 0.8, -0.8, 0.8, 4.4]
		"product": return [-1.3, 1.3, -1.3, 1.3, 3.5]
		"stack": return [-1.5, 2.2, -1.5, 2.0, 9.6] if _lid != "L09" else [-0.5, 0.5, -0.4, 0.4, 5.5]
		"packed_bed": return [-0.8, 0.8, -0.8, 0.8, 4.4]
		"column": return [-3.6, 3.4, -1.3, 2.4, 12.6]
		"fermenter": return [-1.4, 1.4, -1.4, 1.4, 7.3]
		"tubular": return [-1.9, 1.9, -1.3, 1.3, 9.2]
		"cstr": return [-2.3, 2.3, -2.3, 2.3, 5.1]
		"relief": return [-0.3, 2.4, -0.7, 0.7, 6.7]
		"absorber": return [-1.0, 2.3, -1.0, 1.7, 9.0]
		"hno3_absorber": return [-1.0, 2.3, -1.0, 1.7, 12.6]
		"gauze_burner": return [-1.4, 1.4, -1.4, 1.5, 3.8]
		"flash": return [-0.9, 0.9, -0.9, 1.1, 4.7]
		"interlock": return [-0.4, 0.4, -0.25, 0.3, 1.6]
		"compressor": return [-1.6, 1.6, -0.8, 0.8, 1.8] if not _loop else [-2.4, 2.4, -1.2, 1.2, 2.6]
		"batch": return [-0.7, 0.7, -0.7, 0.7, 2.4]
	return [-1.3, 1.3, -1.0, 1.0, _height(ty)]

## Which units the level's hero view frames, and from which side. Each level gets its own: the story unit, not the first unit in the list.
func _pick_hero() -> Dictionary:
	if _board != null:   # 0.14: a board level frames its own subject (hall_boards.gd)
		var bh: Dictionary = _board.hero(self, _lid)
		if not bh.is_empty(): return bh
	var by := {}
	for id in _types:
		if not by.has(_types[id]): by[_types[id]] = []
		(by[_types[id]] as Array).append(id)
	var pitch := -0.52
	var ids: Array = []; var yaw := 0.2 * PI; var frac := 0.0; var extra_ids: Array = []; var third := false
	if by.has("reformer"): ids = [by.reformer[0]]; extra_ids = by.get("boiler", []); yaw = 0.18 * PI; frac = 0.6   # L28: the Works: the reformer's firebox glowing, its waste-heat boiler beside it
	elif by.has("cstr"): ids = [by.cstr[0]]; extra_ids = by.get("relief", []); yaw = 0.15 * PI; frac = 0.62   # L24: the reactor in its bund, the relief and catch tank in frame
	elif by.has("gauze_burner"): ids = [by.gauze_burner[0]]; yaw = -0.25 * PI; frac = 0.6; pitch = -0.42                 # L26: the ammonia burner and its glowing gauze
	elif by.has("tubular"): ids = [by.tubular[0]]; yaw = 0.18 * PI; frac = 0.7                             # L22: the steam-raising converter under its drum
	elif by.has("fermenter"): ids = [by.fermenter[0]]; yaw = 0.12 * PI; frac = 0.62   # L23: the fermenter close (its beer in the sight glass); the still shows in the wide view
	elif _lid == "L27" and by.has("relief"): ids = [by.flash[0]] if by.has("flash") else [by.relief[0]]; yaw = 0.15 * PI; frac = 0.62   # L27: the drum and its relief
	elif by.has("compressor") and by.has("eq_reactor") and (by.has("flash") or by.has("nh3_sep")) and by.has("mixer3"): ids = [by.compressor[0]]; yaw = 0.2 * PI; frac = 0.55   # chapter 5: the recycle compressor in front, the converter it feeds behind
	elif _lid == "L09" and by.has("stoich_reactor"): ids = [by.stoich_reactor[0]]; yaw = 0.1 * PI; frac = 0.75   # L09: the calorimeter bench, the furnace kept in frame
	elif by.has("packed_bed"):                                                      # chapter 4: the bed through its window; 0.13 (Sigrid): a different view per level
		ids = [by.packed_bed[0]]; yaw = 0.1 * PI; frac = 0.72                          # L15: near face on
		if _lid == "L16": yaw = 0.24 * PI; frac = 0.7          # L16: from the right (pulling the exchanger into frame made the bed small and the tags unreadable)
		elif _lid == "L17": yaw = -0.1 * PI; frac = 0.7        # L17: from the left
	elif by.has("batch"): ids = by.batch; yaw = 0.1 * PI; frac = 0.66                 # L18: the glass kettles side by side
	elif by.has("gasifier"): ids = [by.gasifier[0]]                                   # L07
	elif by.has("heater") and not by.has("packed_bed"): ids = [by.heater[0]]; frac = 0.78   # L08: the heater fills most of the frame height (0.13, Sigrid: still small)
	elif by.has("eq_bed"): var b: Array = by.eq_bed; ids = [b[b.size() / 2]]; yaw = 0.24 * PI   # L13: the middle bed, its neighbours either side
	elif by.has("eq_reactor"):                                                      # L10-L12: the converter, from a different side each
		ids = [by.eq_reactor[0]]; yaw = (0.2 if _lid != "L11" else -0.2) * PI
		if _lid == "L12": yaw = 0.3 * PI; frac = 0.62
	elif by.has("burner"):
		yaw = -0.2 * PI                                                            # the burner is framed from its front-plate end, the fan set in view
		var bo: String = by.burner[0]
		if _lid == "L03" and by.has("boiler"): ids = [by.boiler[0]]; yaw = 0.2 * PI; frac = 0.6   # L03: the waste-heat boiler (its plume), the burner behind it
		elif _lid == "L05" and by.has("boiler"): ids = [bo, by.boiler[0]]            # L05: the burner and the boiler it feeds
		elif _lid == "L06" and by.has("splitter"): ids = [bo]; extra_ids = [by.splitter[0]]   # L06: the burner in the middle, the splitter that sets the bypass kept in frame
		else: ids = [bo]                                                            # L02
	elif by.has("stoich_reactor"):                                                  # L01 the bench reactor; L04 (exam) from the other side with its props
		ids = [by.stoich_reactor[0]]; yaw = (0.2 if _lid != "L04" else -0.32) * PI; frac = 0.7; third = true   # lower and closer, the vessel on a third
	else: ids = [str(_types.keys()[_types.size() / 2])]
	return {"ids": ids, "yaw": yaw, "front": by.has("burner") and ids.has(by.burner[0]), "frac": frac, "extra_ids": extra_ids, "third": third, "pitch": pitch}

## The distance at which the footprint-and-height box fills `frac` of the frame height (and at most `hfrac` of its width at a 16:10 window, the narrowest we ship): a pinhole fit.
## Round units are fitted as footprint circles (a box overstates their silhouette), so 0.5 is the 45-55 % of the frame height the unit itself fills.
func _fit(target: Vector3, corners: Array, yaw: float, pitch: float, frac := 0.5, hfrac := 0.86, aspect := 1.6, extra := []) -> float:
	var t := tan(deg_to_rad((cam.fov if cam != null else 50.0) * 0.5))
	var lo := 3.0; var hi := 45.0
	var dir := Basis(Vector3.UP, yaw) * Basis(Vector3.RIGHT, pitch) * Vector3(0, 0, 1)
	for it in 30:
		var d := (lo + hi) * 0.5
		var eye := target + dir * d
		var f := (target - eye).normalized(); var r := f.cross(Vector3.UP).normalized(); var u := r.cross(f).normalized()
		var y0 := 1e9; var y1 := -1e9; var x0 := 1e9; var x1 := -1e9
		for q in corners:
			var v: Vector3 = (q as Vector3) - eye; var z := maxf(v.dot(f), 0.1)
			var ny := v.dot(u) / (z * t); var nx := v.dot(r) / (z * t * aspect)
			y0 = minf(y0, ny); y1 = maxf(y1, ny); x0 = minf(x0, nx); x1 = maxf(x1, nx)
		var big := maxf((y1 - y0) * 0.5 / frac, (x1 - x0) * 0.5 / hfrac) > 1.0
		if not big and not extra.is_empty():   # props beside the hero (L04's clipboard stand and sample bomb) must stay in the frame, but do not make the hero small
			for q in extra:
				var v2: Vector3 = (q as Vector3) - eye; var z2 := maxf(v2.dot(f), 0.1)
				var ny2 := v2.dot(u) / (z2 * t); var nx2 := v2.dot(r) / (z2 * t * aspect)
				if minf(y0, ny2) < -0.9 or maxf(y1, ny2) > 0.9 or minf(x0, nx2) < -hfrac or maxf(x1, nx2) > hfrac: big = true
		if big: lo = d
		else: hi = d
	return hi

## How much the other units spoil a view from `eye` at `target`: a tall unit nearer than the hero and inside the frame (the L08 stack stood in front of the heater from the
## +z side) is a heavy penalty, one near the edge a light one, and a unit the hero hides is free.
func _spoil(eye: Vector3, target: Vector3, hero_ids: Array) -> float:
	var t := tan(deg_to_rad(cam.fov * 0.5 if cam != null else 25.0))
	var f := (target - eye).normalized(); var r := f.cross(Vector3.UP).normalized()
	var zt := (target - eye).dot(f); var pen := 0.0
	for id in _at:
		if hero_ids.has(id): continue
		var e := _ext(str(_types[id])); var c: Vector3 = _at[id]
		if eye.x > c.x + float(e[0]) - 1.8 and eye.x < c.x + float(e[1]) + 1.8 and eye.z > c.z + float(e[2]) - 1.8 and eye.z < c.z + float(e[3]) + 1.8 and eye.y < float(e[4]) + 1.5: pen += 100.0   # the lens must not stand in a unit (L03's stack)
		var q := c + Vector3((e[0] + e[1]) * 0.5, e[4] * 0.5, (e[2] + e[3]) * 0.5)
		var v := q - eye; var z := v.dot(f)
		if z < 0.5 or z > zt: continue
		var nx := v.dot(r) / (z * t * 1.6); var hf := minf(maxf(float(e[4]), (float(e[1]) - float(e[0])) * 0.5) / (z * t * 2.0), 1.5)
		if absf(nx) < 0.6: pen += 3.0 * hf + 0.5
		elif absf(nx) < 1.15: pen += 1.2 * hf
	return pen

func _frame_hero() -> void:
	var h := _pick_hero()
	var lo := Vector3(1e9, 0, 1e9); var hi := Vector3(-1e9, 0, -1e9); var top := 0.0
	for id in h.ids:
		var c: Vector3 = _at[id]; var e := _ext(str(_types[id]))
		if _lid == "L04" and str(_types[id]) == "stoich_reactor": e = [-2.3, 2.0, -1.0, 1.8, 3.1]   # the clipboard stand and the sample bomb are in the frame
		lo = Vector3(minf(lo.x, c.x + e[0]), 0, minf(lo.z, c.z + e[2])); hi = Vector3(maxf(hi.x, c.x + e[1]), 0, maxf(hi.z, c.z + e[3])); top = maxf(top, e[4])
	var corners: Array = []; var extra: Array = []
	for xid in h.extra_ids:   # units kept in frame without setting its size
		var xc: Vector3 = _at[xid]; var xe := _ext(str(_types[xid]))
		for x in [xc.x + float(xe[0]), xc.x + float(xe[1])]: for z in [xc.z + float(xe[2]), xc.z + float(xe[3])]: extra.append(Vector3(x, 0.0, z)); extra.append(Vector3(x, float(xe[4]), z))
	for id in h.ids:
		var c: Vector3 = _at[id]; var ty := str(_types[id]); var e := _ext(ty)
		if ty in ["eq_reactor", "eq_bed", "gasifier", "stoich_reactor", "nh3_sep", "product", "stack", "packed_bed"] and not (_lid == "L09" and ty in ["stoich_reactor", "stack"]):   # round: twelve points on the footprint circle, at the foot and at the top
			var rr := maxf(float(e[1]), float(e[3])) if ty != "stack" else 1.5
			for k in 12: for y in [0.0, float(e[4])]: corners.append(c + Vector3(cos(k * TAU / 12.0) * rr, y, sin(k * TAU / 12.0) * rr))
		else:
			for x in [c.x + float(e[0]), c.x + float(e[1])]: for y in [0.0, float(e[4])]: for z in [c.z + float(e[2]), c.z + float(e[3])]: corners.append(Vector3(x, y, z))
		if _lid == "L04" and ty == "stoich_reactor":   # the clipboard stand, the inspection tag and the sample bomb stay in the frame
			for p in [Vector3(-1.9, 0.0, 0.9), Vector3(-1.9, 1.7, 0.9), Vector3(1.2, 0.0, 0.8), Vector3(1.2, 1.7, 0.8)]: extra.append(c + p)
	var target := Vector3((lo.x + hi.x) * 0.5, top * 0.5, (lo.z + hi.z) * 0.5)
	var pitch := float(h.get("pitch", -0.52))   # 30 degrees down (0.14: a squat unit among the racks is seen from lower)
	var sg := signf(float(h.yaw)); var best := 1e9; var by := float(h.yaw); var bd := 10.0
	var cands: Array = []   # the level's own side first, then the others; the burner keeps its front-plate side unless nothing else is clear
	for k in [1.0, 1.5, 0.5, 2.0, 2.5]: cands.append([float(h.yaw) * k / 1.0 if absf(float(h.yaw) * k) < PI * 0.55 else sg * PI * 0.5, 0.0])
	for k in [1.0, 1.5, 0.5, 2.0]: cands.append([-float(h.yaw) * k, 3.0 if bool(h.get("front", false)) else 0.6])
	for i in cands.size():
		var yw: float = cands[i][0]
		var d := _fit(target, corners, yw, pitch, float(h.frac) if float(h.frac) > 0.0 else (0.62 if bool(h.get("front", false)) else 0.5), 0.86, 1.6, extra)   # a long burner is fitted a little looser: its box overstates it most
		var dir := Basis(Vector3.UP, yw) * Basis(Vector3.RIGHT, pitch) * Vector3(0, 0, 1)
		var foc := target - Vector3(0, 0.06 * d, 0); var eye := foc + dir * d
		var pen := float(cands[i][1]) + 0.05 * float(i) + _spoil(eye, foc, h.ids) + maxf(0.0, absf(yw) / PI - 0.3) * 20.0   # from the side the runs to the rack cross the whole frame
		if eye.x < HALL_MIN.x or eye.x > HALL_MAX.x or eye.z > HALL_MAX.z or eye.y > HALL_MAX.y - 0.3: pen += 50.0   # the hall's walls and roof clamp the camera
		if pen < best: best = pen; by = yw; bd = d
	t_yaw = by; t_pitch = pitch; t_dist = bd
	t_focus = target - Vector3(0, 0.06 * bd, 0)   # the unit sits a little above the middle: the instrument bar takes the bottom of the frame
	if bool(h.get("third", false)):   # the vessel on the left third and lower, the rack behind it, not half a frame of floor
		t_focus = target + Vector3(0, 0.03 * bd, 0) + Vector3(cos(by), 0, -sin(by)) * 0.13 * bd
	if OS.get_environment("CB_CAMDBG") == "1":
		var dir2 := Basis(Vector3.UP, t_yaw) * Basis(Vector3.RIGHT, t_pitch) * Vector3(0, 0, 1)
		print("CAMDBG hero=%s lid=%s yaw=%.2f pen=%.2f focus=%s dist=%.2f eye=%s" % [str(h.ids), _lid, by / PI, best, str(t_focus), bd, str(t_focus + dir2 * bd)])

const GEN_PRESETS := {
	"wide": [Vector3(0.0, 2.5, -4.0), PI * 0.12, -0.26, 24.0],
	"plant": [Vector3(0.0, 2.2, -4.0), -PI * 0.2, -0.22, 15.0],   # phase C: low and close, so the vessels loom
	"close": [Vector3(0.0, 2.0, -6.0), PI * 0.05, -0.12, 9.0],
}
func set_camera(spec: String) -> void:
	for part in spec.replace(" ", ",").split(",", false):   # CB_CAM hands "nbclose plant": spaces separate too (every 0.11 hall shot had silently been "wide")
		var p := part.strip_edges()
		if p == "plant" and not _at.is_empty():   # the hero view: the unit that tells the level's story, whole, 45-55 % of the frame high, three-quarter, ~30 degrees down
			_preset = p; _frame_hero(); continue
		if p == "stack" and not _analyser.is_empty():   # the flue analyser close up
			_preset = p; t_focus = _stack_at + Vector3(-0.7, 1.9, -0.5); t_yaw = -0.42; t_pitch = -0.14; t_dist = 5.0; continue   # 0.13 (Sigrid): back far enough to see the probe, the sample line down the stack and the cabinet
		if not GEN_PRESETS.has(p): continue
		_preset = p
		var v: Array = GEN_PRESETS[p]; t_focus = _ctr + Vector3(0, (v[0] as Vector3).y, 0); t_yaw = v[1]; t_pitch = v[2]
		t_dist = clampf(_span * float(v[3]) / 22.0, 7.0, float(v[3]) * 1.4)   # phase C: distance scales with the plant, not a fixed spot in the hall
	if OS.has_environment("CB_SHOT"):
		_snap_cam()
		if OS.get_environment("CB_LIGHTOFF") != "":   # debug: hide the plant's lights ("plant"), the hall's ("hall") or the particles ("fx")
			var w := OS.get_environment("CB_LIGHTOFF")
			for l in find_children("*", "Light3D", true, false):
				if w in ["hallspot", "hallomni", "halldir"] and not plant.is_ancestor_of(l) and l.get_class() == {"hallspot": "SpotLight3D", "hallomni": "OmniLight3D", "halldir": "DirectionalLight3D"}[w]: (l as Light3D).visible = false
				elif w in ["plant", "hall"] and (w == "plant") == plant.is_ancestor_of(l): (l as Light3D).visible = false
			if w == "fx": for q in find_children("*", "GPUParticles3D", true, false): (q as Node3D).visible = false
		if OS.get_environment("CB_CAMDBG") == "2":
			for l in find_children("*", "Light3D", true, false): if (l as Light3D).visible and (l as Light3D).light_energy > 0.0: print("LIGHTDBG %s %s e=%.2f c=%s spec=%.2f" % [l.get_class(), str((l as Node3D).global_position), (l as Light3D).light_energy, str((l as Light3D).light_color), (l as Light3D).light_specular])
		if OS.get_environment("CB_CAMDBG") == "1": print("CAMDBG preset=%s focus=%s cam=%s glow=%s types=%s anchors=%s" % [_preset, str(t_focus), str(cam.position if cam else Vector3.ZERO), str(_glow.keys()), str(_types), str(anchors)])
func key(e: InputEventKey) -> bool:
	match e.keycode:
		KEY_1: set_camera("wide"); return true
		KEY_2: set_camera("plant"); return true
		KEY_3: set_camera("close"); return true
		KEY_Q: t_yaw -= PI / 8.0; return true
		KEY_E: t_yaw += PI / 8.0; return true
	return false

func pad_controls() -> Array: return []
func pad_cams() -> Array: return ["wide", "plant", "close", "stack"] if not _analyser.is_empty() else ["wide", "plant", "close"]
