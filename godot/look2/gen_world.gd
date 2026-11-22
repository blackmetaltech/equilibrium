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
	_out.clear(); _glow.clear(); _steam.clear(); _types.clear(); anchors.clear(); radius.clear(); _tmax.clear(); _tmin.clear()
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
			"vent", "stack", "flare": _vent(id, c)
			_: _box(Vector3(1.0, 1.0, 1.0), c + Vector3(0, 0.5, 0), M.steel_dull, plant)
		var lab := Label3D.new(); lab.text = id; lab.font_size = 36; lab.pixel_size = 0.0009; lab.fixed_size = true; lab.no_depth_test = true; lab.render_priority = 10; lab.billboard = BaseMaterial3D.BILLBOARD_ENABLED; lab.modulate = Color(0.9, 0.95, 1.0, 0.95)
		lab.outline_size = 12; lab.outline_modulate = Color(0, 0, 0, 0.85); lab.position = c + Vector3(0, _height(ty) + 0.6, 0); plant.add_child(lab)
		anchors[id] = c + Vector3(0, _height(ty) * 0.6, 0); radius[id] = 1.0
	var k := 0
	for s in p.get("streams", []):
		var fu := str(s.get("from", {}).get("unit", "")); var tu := str(s.get("to", {}).get("unit", ""))
		if not at.has(fu) or not at.has(tu): continue
		if not _out.has(fu): _out[fu] = str(s.id)
		var a: Vector3 = at[fu]; var b: Vector3 = at[tu]
		var y := 2.4 + (k % 3) * 0.35
		var pts := [a + Vector3(0.6, 0.9, 0), a + Vector3(0.6, y, 0), Vector3(b.x - 0.6, y, a.z), Vector3(b.x - 0.6, y, b.z), b + Vector3(-0.6, 0.9, 0)]
		_pipe(pts, 0.09, M.clad if k % 2 == 0 else M.steel_dull, plant, true)
		k += 1
	# pipe rack posts along the main run
	for i in 10: _box(Vector3(0.18, 3.6, 0.18), ORIGIN + Vector3(i * 3.2, 1.8, 2.7), M.yellow, plant)
	print("LOOK2 gen: %d units, %d pipes" % [at.size(), k])

func _height(ty: String) -> float:
	match ty:
		"eq_reactor": return 7.0
		"eq_bed": return 3.4
		"compressor": return 1.6
		"boiler": return 2.6
		"nh3_sep": return 4.2
		"product": return 3.4
		"vent", "stack", "flare": return 6.0
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

func _converter(id: String, c: Vector3) -> void:
	var sh := _shader("steel", {"rough_base": 0.3, "metallic": 0.8, "blotch": 0.15, "streak": Vector3(140.0, 6.0, 140.0)})
	_cyl(1.0, 6.2, c + Vector3(0, 3.6, 0), sh, plant, -1.0, 40); _sph(1.0, c + Vector3(0, 6.7, 0), sh, plant, true)
	for k in 6: _cyl(1.025, 0.07, c + Vector3(0, 1.0 + k * 0.95, 0), M.clad, plant, -1.0, 40)   # cladding bands, as R-106 in L00
	_flange(c + Vector3(0, 6.95, 0), Vector3.UP, 0.25, plant)
	_cyl(1.05, 0.5, c + Vector3(0, 0.25, 0), M.steel_dull, plant, -1.0, 40)
	for k in 3: _torus(1.02, 0.04, c + Vector3(0, 1.6 + k * 1.8, 0), M.steel_dull, plant)
	_cyl(1.6, 0.08, c + Vector3(0, 6.0, 0), M.plate, plant); _torus(1.58, 0.03, c + Vector3(0, 7.0, 0), M.yellow, plant)
	var gm := _glowmat(); var w := _cyl(1.01, 0.5, c + Vector3(0, 2.4, 0), gm, plant, -1.0, 40); w.name = "window"
	var l := OmniLight3D.new(); l.light_color = Color(1.0, 0.45, 0.15); l.light_energy = 0.0; l.omni_range = 5.0; l.position = c + Vector3(0, 2.4, 1.6); plant.add_child(l)
	_glow[id] = {"mat": gm, "light": l, "kind": "converter"}

func _bed(id: String, c: Vector3) -> void:
	var sh := _shader("steel", {"rough_base": 0.32, "metallic": 0.8, "blotch": 0.2})
	_cyl(0.9, 2.8, c + Vector3(0, 1.8, 0), sh, plant, -1.0, 36); _sph(0.9, c + Vector3(0, 3.2, 0), sh, plant, true); _sph(0.9, c + Vector3(0, 0.4, 0), sh, plant)
	for y in [1.2, 2.4]: _cyl(0.93, 0.06, c + Vector3(0, y, 0), M.clad, plant, -1.0, 36)
	_flange(c + Vector3(0, 4.05, 0), Vector3.UP, 0.18, plant)
	for a in 3: _seg(c + Vector3(cos(a * TAU / 3.0) * 0.7, 0, sin(a * TAU / 3.0) * 0.7), c + Vector3(cos(a * TAU / 3.0) * 0.7, 0.6, sin(a * TAU / 3.0) * 0.7), 0.06, M.black, plant)
	var gm := _glowmat(); _cyl(0.91, 0.9, c + Vector3(0, 1.8, 0), gm, plant, -1.0, 36)   # the catalyst band you can read: dark when cold, orange when working, red-white when sintering
	var l := OmniLight3D.new(); l.light_color = Color(1.0, 0.45, 0.15); l.light_energy = 0.0; l.omni_range = 4.0; l.position = c + Vector3(0, 1.8, 1.3); plant.add_child(l)
	_glow[id] = {"mat": gm, "light": l, "kind": "bed"}

func _boiler(id: String, c: Vector3) -> void:
	# waste-heat boiler: aluminium-clad shell on saddles with a steam drum above (Sigrid: not red toy drums)
	var d := _cyl(0.7, 2.6, c + Vector3(0, 1.1, 0), M.clad, plant); d.rotation_degrees.z = 90
	for x in [-1.3, 1.3]: _sph(0.7, c + Vector3(x, 1.1, 0), M.steel_dull, plant)
	for k in 5: (_cyl(0.72, 0.05, c + Vector3(-1.0 + k * 0.5, 1.1, 0), M.steel_dull, plant)).rotation_degrees.z = 90
	for x in [-0.8, 0.8]: _box(Vector3(0.3, 0.6, 1.1), c + Vector3(x, 0.3, 0), _paint(Color(0.3, 0.32, 0.34)), plant)
	var dr := _cyl(0.35, 1.8, c + Vector3(0, 2.4, 0), _paint(Color(0.32, 0.42, 0.36)), plant); dr.rotation_degrees.z = 90
	for x in [-0.4, 0.4]: _seg(c + Vector3(x, 1.75, 0), c + Vector3(x, 2.1, 0), 0.06, M.steel_dull, plant)
	_cyl(0.18, 1.6, c + Vector3(0.6, 2.4, 0), M.steel_dull, plant)
	_kind[id] = "boiler"
	_steam[id] = _particles(c + Vector3(0.6, 3.3, 0), 30, 3.0, Vector3(0, 1.6, 0), 12.0, 0.6, Color(0.92, 0.94, 0.96, 0.4), plant, 3.0)

func _separator(c: Vector3) -> void:
	_cyl(0.6, 3.4, c + Vector3(0, 2.1, 0), _shader("steel", {"rough_base": 0.4, "frost": 0.5, "frost_h": 1.2, "metallic": 0.6}), plant)
	_sph(0.6, c + Vector3(0, 3.8, 0), M.steel_dull, plant, true); _sph(0.6, c + Vector3(0, 0.4, 0), M.steel_dull, plant)
	for y in [1.2, 2.2, 3.2]: _cyl(0.62, 0.05, c + Vector3(0, y, 0), M.clad, plant)

func _tank(c: Vector3) -> void:
	var w := _flat(Color(0.86, 0.87, 0.85), 0.1, 0.35)
	_cyl(1.2, 3.0, c + Vector3(0, 1.5, 0), w, plant, -1.0, 40); _sph(1.2, c + Vector3(0, 3.0, 0), w, plant, true)
	_torus(1.2, 0.04, c + Vector3(0, 3.3, 0), M.yellow, plant)

func _vent(id: String, c: Vector3) -> void:
	_cyl(0.25, 6.0, c + Vector3(0, 3.0, 0), M.rust, plant)
	_steam[id] = _particles(c + Vector3(0, 6.2, 0), 20, 4.0, Vector3(0, 1.2, 0), 10.0, 0.8, Color(0.7, 0.7, 0.72, 0.3), plant, 3.0)

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
	var info := {}
	for u in g.get("units", []): info[str(u.get("id", ""))] = u.get("info", {}) if u.get("info", {}) is Dictionary else {}
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
	"wide": [Vector3(0.0, 2.5, -4.0), PI * 0.12, -0.32, 30.0],
	"plant": [Vector3(0.0, 2.0, -4.0), -PI * 0.2, -0.45, 22.0],
	"close": [Vector3(0.0, 2.0, -6.0), PI * 0.05, -0.2, 12.0],
}
func set_camera(spec: String) -> void:
	for part in spec.split(","):
		var p := part.strip_edges()
		if not GEN_PRESETS.has(p): continue
		var v: Array = GEN_PRESETS[p]; t_focus = v[0]; t_yaw = v[1]; t_pitch = v[2]; t_dist = v[3]
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
