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
var _analyser := {}   ## stack id -> Label3D (the flue analyser screen)
var _types := {}              ## unit id -> type
var _tmax := {}               ## unit id -> sinter limit K (beds), 0 if none
var _tmin := {}               ## unit id -> light-off K, 0 if none

func _ready() -> void:
	_build_env(); _build_hall(); _build_outside()
	cam = Camera3D.new(); cam.fov = 50.0; cam.near = 0.05; cam.far = 3000.0; add_child(cam)
	plant = Node3D.new(); plant.name = "player_plant"; add_child(plant)
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
	var sig := ""
	for u in p.get("units", []): sig += "%s:%s:%s;" % [u.id, u.get("type", ""), str(u.get("pos", {}))]
	for s in p.get("streams", []): sig += "%s>%s;" % [s.get("from", {}).get("unit", ""), s.get("to", {}).get("unit", "")]
	if sig == _sig: return
	_sig = sig
	for c in plant.get_children(): c.queue_free()
	_out.clear(); _glow.clear(); _analyser.clear(); _steam.clear(); _types.clear(); anchors.clear(); radius.clear(); _tmax.clear(); _tmin.clear()
	var at := {}
	var feeds := 0
	for u in p.get("units", []):
		var id := str(u.id); var ty := str(u.get("type", "")); var c := _pos(u)
		at[id] = c; _types[id] = ty
		var pr: Dictionary = u.get("params", {})
		_tmax[id] = float(pr.get("Tmax", 0.0)); _tmin[id] = float(pr.get("Tmin", 0.0))
		match ty:
			"feed": _feed(c, feeds); feeds += 1
			"mixer", "mixer3": _mixer(c)
			"compressor": _compressor(c)
			"eq_reactor": _converter(id, c)
			"eq_bed": _bed(id, c)
			"boiler": _boiler(id, c)
			"nh3_sep": _separator(c)
			"product": _tank(c)
			"vent", "flare": _vent(id, c)
			"stack": _stack(id, c)
			"burner": _burner(id, c)
			_: _box(Vector3(1.0, 1.0, 1.0), c + Vector3(0, 0.5, 0), M.steel_dull, plant)
		var lab := Label3D.new(); lab.text = id; lab.font_size = 36; lab.pixel_size = 0.0009; lab.fixed_size = true; lab.no_depth_test = true; lab.render_priority = 10; lab.billboard = BaseMaterial3D.BILLBOARD_ENABLED; lab.modulate = Color(0.9, 0.95, 1.0, 0.95)
		lab.outline_size = 12; lab.outline_modulate = Color(0, 0, 0, 0.85); lab.position = c + Vector3(0, _height(ty) + 0.6, 0); plant.add_child(lab)
		anchors[id] = c + Vector3(0, _height(ty) * 0.6, 0); radius[id] = 1.0
	_ctr = Vector3.ZERO; _span = 4.0
	if not at.is_empty():   # the cameras frame the plant the player drew, wherever it sits on the grid
		var lo := Vector3(1e9, 0, 1e9); var hi := Vector3(-1e9, 0, -1e9)
		for id2 in at: var v: Vector3 = at[id2]; lo = Vector3(minf(lo.x, v.x), 0, minf(lo.z, v.z)); hi = Vector3(maxf(hi.x, v.x), 0, maxf(hi.z, v.z))
		_ctr = (lo + hi) * 0.5; _span = maxf(hi.x - lo.x, hi.z - lo.z) + 4.0
	var k := 0
	for s in p.get("streams", []):
		var fu := str(s.get("from", {}).get("unit", "")); var tu := str(s.get("to", {}).get("unit", ""))
		if not at.has(fu) or not at.has(tu): continue
		if not _out.has(fu): _out[fu] = str(s.id)
		var a: Vector3 = at[fu]; var b: Vector3 = at[tu]
		var y := 2.38 if k % 2 == 0 else 3.28   # phase C: every run lies on one of the rack's two levels
		var zr := _ctr.z - 1.6
		var pts := [a + Vector3(0.6, 0.9, 0), a + Vector3(0.6, y, 0), Vector3(a.x + 0.6, y, zr), Vector3(b.x - 0.6, y, zr), Vector3(b.x - 0.6, y, b.z), b + Vector3(-0.6, 0.9, 0)]
		_pipe(pts, 0.09, M.clad if k % 2 == 0 else M.steel_dull, plant, true)
		if absf(b.x - a.x) > 2.2: _valve(Vector3((a.x + b.x) * 0.5, y, zr), Vector3(signf(b.x - a.x), 0, 0), 0.09, plant)   # a block valve on each line
		k += 1
	# pipe rack posts along the main run
	if at.size() > 1:   # phase C: a two-level pipe rack under the pipe runs, spanning the plant only
		var x0 := 1e9; var x1 := -1e9
		for id2 in at: x0 = minf(x0, (at[id2] as Vector3).x); x1 = maxf(x1, (at[id2] as Vector3).x)
		_rack(Vector3(x0 + 0.6, 0, _ctr.z - 1.6), Vector3(x1 - 0.6, 0, _ctr.z - 1.6), 2.2, plant, 4.0)
	if not at.is_empty():   # phase C: high-bay downlights over the player's plant (shafts in the hall's fog), rebuilt with it
		var n := clampi(int(_span / 7.0) + 1, 2, 5)
		for i in n:
			var sx := _ctr.x - _span * 0.4 + _span * 0.8 * float(i) / float(maxi(1, n - 1))
			var sp := SpotLight3D.new(); sp.light_color = Color(1.0, 0.88, 0.72); sp.light_energy = 14.0; sp.spot_range = 22.0; sp.spot_angle = 24.0
			sp.light_volumetric_fog_energy = 3.0; sp.shadow_enabled = i % 2 == 0; sp.position = Vector3(sx, 15.5, _ctr.z + 1.0); plant.add_child(sp); sp.rotation_degrees.x = -90
			_cyl(0.5, 0.25, Vector3(sx, 15.8, _ctr.z + 1.0), M.paint_grey, plant); _cyl(0.42, 0.02, Vector3(sx, 15.67, _ctr.z + 1.0), _flat(Color(1, 1, 1), 0, 0.3, Color(1.0, 0.9, 0.75), 3.0), plant)
	print("LOOK2 gen: %d units, %d pipes" % [at.size(), k])
	set_camera(_preset)   # re-frame the new plant

func _height(ty: String) -> float:
	match ty:
		"eq_reactor": return 7.0
		"eq_bed": return 3.4
		"compressor": return 1.6
		"boiler": return 2.6
		"nh3_sep": return 4.2
		"product": return 3.4
		"vent", "flare": return 6.0
		"stack": return 9.4
		"burner": return 2.5
		"feed": return 1.8
	return 1.2

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

func _glowmat() -> StandardMaterial3D:
	var m := StandardMaterial3D.new(); m.albedo_color = Color(0.12, 0.12, 0.13); m.metallic = 0.6; m.roughness = 0.4; m.emission_enabled = true; m.emission = Color(1.0, 0.4, 0.1); m.emission_energy_multiplier = 0.0
	return m

func _converter(id: String, c: Vector3) -> void:   # phase C: a real pressure vessel (dished heads, clad with seams, nozzles, manway, caged ladder, platform)
	var sh := _shader("steel", {"rough_base": 0.3, "metallic": 0.8, "blotch": 0.15, "streak": Vector3(140.0, 6.0, 140.0)})
	_vessel(c, 1.0, 5.6, sh, plant, {"clad": true, "ladder": true, "base": 0.9})
	var gm := _glowmat(); var w := _cyl(1.03, 0.5, c + Vector3(0, 2.4, 0), gm, plant, -1.0, 40); w.name = "window"
	var l := OmniLight3D.new(); l.light_color = Color(1.0, 0.45, 0.15); l.light_energy = 0.0; l.omni_range = 5.0; l.position = c + Vector3(0, 2.4, 1.6); plant.add_child(l)
	_glow[id] = {"mat": gm, "light": l, "kind": "converter"}

func _bed(id: String, c: Vector3) -> void:
	var sh := _shader("steel", {"rough_base": 0.32, "metallic": 0.8, "blotch": 0.2})
	_vessel(c, 0.9, 2.4, sh, plant, {"legs": true, "base": 0.7})
	var gm := _glowmat(); _cyl(0.92, 0.9, c + Vector3(0, 1.9, 0), gm, plant, -1.0, 36)   # the catalyst band you can read: dark when cold, orange when working, red-white when sintering
	var l := OmniLight3D.new(); l.light_color = Color(1.0, 0.45, 0.15); l.light_energy = 0.0; l.omni_range = 4.0; l.position = c + Vector3(0, 1.9, 1.3); plant.add_child(l)
	_glow[id] = {"mat": gm, "light": l, "kind": "bed"}

func _boiler(id: String, c: Vector3) -> void:
	# waste-heat boiler: clad horizontal shell with dished ends on saddles, a steam drum above with risers, a safety valve
	_drum(c + Vector3(0, 1.1, 0), 0.7, 2.6, M.clad, plant, true)
	_drum(c + Vector3(0, 2.45, 0), 0.32, 1.8, _paint(Color(0.32, 0.42, 0.36)), plant)
	for x in [-0.5, 0.0, 0.5]: _seg(c + Vector3(x, 1.75, 0), c + Vector3(x, 2.15, 0), 0.06, M.steel_dull, plant)
	_seg(c + Vector3(0.6, 2.75, 0), c + Vector3(0.6, 3.25, 0), 0.08, M.steel_dull, plant); _flange(c + Vector3(0.6, 3.25, 0), Vector3.UP, 0.08, plant)
	_kind[id] = "boiler"
	_steam[id] = _particles(c + Vector3(0.6, 3.35, 0), 30, 3.0, Vector3(0, 1.6, 0), 12.0, 0.6, Color(0.92, 0.94, 0.96, 0.4), plant, 3.0)

func _separator(c: Vector3) -> void:
	_vessel(c, 0.6, 3.0, _shader("steel", {"rough_base": 0.4, "frost": 0.5, "frost_h": 1.2, "metallic": 0.6}), plant, {"base": 0.8})

func _tank(c: Vector3) -> void:
	_vessel(c, 1.2, 2.4, _flat(Color(0.86, 0.87, 0.85), 0.1, 0.35), plant, {"legs": true, "base": 0.6})

func _vent(id: String, c: Vector3) -> void:
	_cyl(0.25, 6.0, c + Vector3(0, 3.0, 0), M.rust, plant)
	_cyl(0.45, 0.3, c + Vector3(0, 0.15, 0), M.paint_grey, plant)
	for k in 3: _seg(c + Vector3(0, 6.0, 0), c + Vector3(cos(k * TAU / 3.0) * 2.0, 0.05, sin(k * TAU / 3.0) * 2.0), 0.01, M.steel_dull, plant, 4)   # guy wires
	_steam[id] = _particles(c + Vector3(0, 6.2, 0), 20, 4.0, Vector3(0, 1.2, 0), 10.0, 0.8, Color(0.7, 0.7, 0.72, 0.3), plant, 3.0)

## Phase C (chapter 1): the stack with its flue analyser. A tapered brick-red stack with a sampling platform; at the base, the analyser cabinet
## whose screen reads the engine's stack composition (y_O2, y_CO2, y_SO2, y_CO, y_H2O) in mol %.
func _stack(id: String, c: Vector3) -> void:
	var brick := _flat(Color(0.46, 0.2, 0.14), 0.0, 0.85)
	_lathe(PackedVector2Array([Vector2(0.75, 0), Vector2(0.45, 9.0), Vector2(0.5, 9.0), Vector2(0.5, 9.4), Vector2(0.0, 9.4)]), 32, brick, c, plant, true)
	for y in [3.0, 6.0, 8.9]: _torus(0.75 - y * 0.033 + 0.03, 0.04, c + Vector3(0, y, 0), M.black, plant)
	_lathe(PackedVector2Array([Vector2(0.62, 0), Vector2(1.5, 0), Vector2(1.5, 0.05), Vector2(0.62, 0.05)]), 32, M.plate, c + Vector3(0, 4.0, 0), plant, false)
	_torus(1.5, 0.02, c + Vector3(0, 5.05, 0), M.yellow, plant)
	for sx in [-0.2, 0.2]: _seg(c + Vector3(sx, 0, -0.95), c + Vector3(sx, 5.0, -0.95), 0.02, M.yellow, plant)
	for i in 13: _seg(c + Vector3(-0.2, 0.3 + i * 0.3, -0.95), c + Vector3(0.2, 0.3 + i * 0.3, -0.95), 0.012, M.yellow, plant)
	_seg(c + Vector3(0.6, 4.3, 0), c + Vector3(1.2, 4.3, 0.4), 0.02, M.steel_dull, plant)   # sample probe line
	_seg(c + Vector3(1.2, 4.3, 0.4), c + Vector3(1.4, 1.6, 0.9), 0.02, M.steel_dull, plant)
	var cab := c + Vector3(1.5, 0, 1.1)
	_box(Vector3(0.9, 1.7, 0.6), cab + Vector3(0, 0.85, 0), _paint(Color(0.82, 0.83, 0.8)), plant)
	var scr := _flat(Color(0.02, 0.05, 0.05), 0.0, 0.2); scr.emission_enabled = true; scr.emission = Color(0.1, 0.5, 0.45); scr.emission_energy_multiplier = 0.5
	_box(Vector3(0.7, 0.5, 0.02), cab + Vector3(0, 1.25, 0.31), scr, plant)
	var t := Label3D.new(); t.name = "analyser"; t.text = "FLUE ANALYSER\n--"; t.font_size = 40; t.pixel_size = 0.0035; t.modulate = Color(0.5, 1.0, 0.9)
	t.outline_size = 0; t.position = cab + Vector3(0, 1.25, 0.33); t.width = 180.0; t.autowrap_mode = TextServer.AUTOWRAP_OFF; plant.add_child(t)
	_analyser[id] = t
	_steam[id] = _particles(c + Vector3(0, 9.5, 0), 24, 5.0, Vector3(0, 1.4, 0), 10.0, 1.0, Color(0.75, 0.74, 0.72, 0.28), plant, 3.5)

## Phase C (chapter 1): a fired burner box. Refractory-lined steel casing, a burner throat with a forced-draft blower folded in (D-C2), a peep
## window and a flame whose size and light follow the outlet temperature, as the beds glow.
func _burner(id: String, c: Vector3) -> void:
	_box(Vector3(2.4, 2.2, 1.8), c + Vector3(0, 1.4, 0), M.heat_paint, plant)
	for x in [-0.9, 0.0, 0.9]: _box(Vector3(0.08, 2.24, 1.84), c + Vector3(x, 1.4, 0), M.steel_dull, plant)   # stiffeners
	_box(Vector3(2.6, 0.3, 2.0), c + Vector3(0, 0.15, 0), M.paint_grey, plant)
	var thr := _cyl(0.35, 0.6, c + Vector3(-1.5, 1.4, 0), M.refractory, plant); thr.rotation_degrees.z = 90
	var bl := _cyl(0.45, 0.5, c + Vector3(-2.1, 1.0, 0.0), _paint(Color(0.2, 0.32, 0.5)), plant); bl.rotation_degrees.x = 90   # blower volute
	_cyl(0.3, 0.6, c + Vector3(-2.1, 1.0, 0.55), _paint(Color(0.1, 0.25, 0.2)), plant).rotation_degrees.x = 90                    # motor
	var gm := _glowmat(); var pw := _cyl(0.16, 0.05, c + Vector3(0.3, 1.5, 0.92), gm, plant); pw.rotation_degrees.x = 90       # peep window
	var fl := _particles(c + Vector3(-0.6, 1.4, 0), 60, 0.5, Vector3(2.4, 0.2, 0), 8.0, 0.35, Color(1.0, 0.55, 0.15, 0.7), plant, 2.0)
	fl.emitting = false
	var l := OmniLight3D.new(); l.light_color = Color(1.0, 0.5, 0.2); l.light_energy = 0.0; l.omni_range = 5.0; l.position = c + Vector3(0.3, 1.5, 1.6); plant.add_child(l)
	_glow[id] = {"mat": gm, "light": l, "kind": "burner", "flame": fl}

# ---- live state ---------------------------------------------------------------------------------------------------------------------------------
func set_snapshot(g: Dictionary) -> void:
	rebuild()
	var st := {}
	for s in g.get("streams", []): st[str(s.get("id", ""))] = s
	var running := str(g.get("phase", "")) != "design"
	for id in _glow:
		var gw: Dictionary = _glow[id]; var T := 0.0
		if _out.has(id) and st.has(_out[id]): T = float(st[_out[id]].get("T", 0.0))
		var heat := 0.0; var col := Color(1.0, 0.42, 0.12)
		if running and T > 0.0:
			heat = clampf((T - 620.0) / 260.0, 0.0, 1.0)
			if float(_tmin.get(id, 0.0)) > 0.0 and T < float(_tmin[id]): heat = 0.0                          # asleep: below light-off the bed stays dark
			if float(_tmax.get(id, 0.0)) > 0.0 and T > float(_tmax[id]): heat = 1.3; col = Color(1.0, 0.85, 0.7)   # sintering: past the catalyst's limit
		(gw.mat as StandardMaterial3D).emission = col
		(gw.mat as StandardMaterial3D).emission_energy_multiplier = heat * 2.2
		(gw.light as OmniLight3D).light_energy = heat * 2.0
		if gw.has("flame"): (gw.flame as GPUParticles3D).emitting = heat > 0.05; (gw.flame as GPUParticles3D).amount_ratio = clampf(heat, 0.2, 1.0)
	var info := {}
	for u in g.get("units", []): info[str(u.get("id", ""))] = u.get("info", {}) if u.get("info", {}) is Dictionary else {}
	for id in _analyser:   # the flue analyser reads the engine's stack composition
		var inf: Dictionary = info.get(id, {})
		var tx := "FLUE ANALYSER"
		if running and inf.has("y_O2"):
			for k in [["O2", "y_O2"], ["CO2", "y_CO2"], ["SO2", "y_SO2"], ["CO", "y_CO"]]:
				if inf.has(k[1]) and (k[0] == "O2" or float(inf[k[1]]) > 0.0): tx += "\n%s  %.1f %%" % [k[0], float(inf[k[1]]) * 100.0]
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
	_ft_tick(dt)

const GEN_PRESETS := {
	"wide": [Vector3(0.0, 2.5, -4.0), PI * 0.12, -0.26, 24.0],
	"plant": [Vector3(0.0, 2.2, -4.0), -PI * 0.2, -0.22, 15.0],   # phase C: low and close, so the vessels loom
	"close": [Vector3(0.0, 2.0, -6.0), PI * 0.05, -0.12, 9.0],
}
func set_camera(spec: String) -> void:
	for part in spec.split(","):
		var p := part.strip_edges()
		if not GEN_PRESETS.has(p): continue
		_preset = p
		var v: Array = GEN_PRESETS[p]; t_focus = _ctr + Vector3(0, (v[0] as Vector3).y, 0); t_yaw = v[1]; t_pitch = v[2]
		t_dist = clampf(_span * float(v[3]) / 22.0, 7.0, float(v[3]) * 1.4)   # phase C: distance scales with the plant, not a fixed spot in the hall
	if OS.has_environment("CB_SHOT"): _snap_cam()
func key(e: InputEventKey) -> bool:
	match e.keycode:
		KEY_1: set_camera("wide"); return true
		KEY_2: set_camera("plant"); return true
		KEY_3: set_camera("close"); return true
		KEY_Q: t_yaw -= PI / 8.0; return true
		KEY_E: t_yaw += PI / 8.0; return true
	return false

func pad_controls() -> Array: return []
func pad_cams() -> Array: return ["wide", "plant", "close"]
