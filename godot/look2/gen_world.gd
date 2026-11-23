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
var _rack_z := -11.0          ## the pipe rack's z: BEHIND the plant, so the front cameras never look through its beams
const LADDER := {"ladder": true, "ladder_ang": PI * 0.17, "manway_ang": PI * 0.5 + 0.12}   ## ladders and manways face the front cameras (+z, a little +x)

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
	_lid = str(app.b.g.get("level", "")) if app != null and app.b != null else ""
	var sig := _lid + ";"
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
			"stoich_reactor": _vessel(c, 0.55, 1.5, _shader("steel", {"rough_base": 0.28, "metallic": 0.85, "blotch": 0.1}), plant, {"legs": true, "base": 0.6})   # the bench reactor (L01, L04)
			"burner": _burner(id, c)
			"splitter": _splitter(id, c)
			"cooler": _exchanger(c, 3.2, 0.42, M.enamel_green, true)    # 0.12 (chapter 2): CW cooler
			"hx": _exchanger(c, 5.2, 0.62, M.heat_paint, false)          # feed-effluent exchanger (L08)
			"heater": _heater(id, c)
			"gasifier": _gasifier(id, c)
			"co_burner": _burner(id, c)
			_: _box(Vector3(1.0, 1.0, 1.0), c + Vector3(0, 0.5, 0), M.steel_dull, plant)
		var lab := Label3D.new(); lab.text = id; lab.font_size = 36; lab.pixel_size = 0.0009; lab.fixed_size = true; lab.no_depth_test = true; lab.render_priority = 10; lab.billboard = BaseMaterial3D.BILLBOARD_ENABLED; lab.modulate = Color(0.9, 0.95, 1.0, 0.95)
		lab.outline_size = 12; lab.outline_modulate = Color(0, 0, 0, 0.85); lab.position = c + Vector3(0, _height(ty) + 0.6, 0); plant.add_child(lab)
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
	var k := 0
	for s in p.get("streams", []):
		var fu := str(s.get("from", {}).get("unit", "")); var tu := str(s.get("to", {}).get("unit", ""))
		if not at.has(fu) or not at.has(tu): continue
		if not _out.has(fu): _out[fu] = str(s.id)
		var a: Vector3 = at[fu]; var b: Vector3 = at[tu]
		var y := 2.38 if k % 2 == 0 else 3.28   # phase C: every run lies on one of the rack's two levels
		var zr := _rack_z
		var pts := [a + Vector3(0.6, 0.9, 0), a + Vector3(0.6, y, 0), Vector3(a.x + 0.6, y, zr), Vector3(b.x - 0.6, y, zr), Vector3(b.x - 0.6, y, b.z), b + Vector3(-0.6, 0.9, 0)]
		_pipe(pts, 0.09, M.clad if k % 2 == 0 else M.steel_dull, plant, true)
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
			var sp := SpotLight3D.new(); sp.light_specular = 0.4; sp.light_color = Color(1.0, 0.88, 0.72); sp.light_energy = 14.0; sp.spot_range = 22.0; sp.spot_angle = 24.0
			sp.light_volumetric_fog_energy = 3.0; sp.shadow_enabled = i % 2 == 0; sp.position = Vector3(sx, 15.5, _ctr.z + 1.0); plant.add_child(sp); sp.rotation_degrees.x = -90
			_cyl(0.5, 0.25, Vector3(sx, 15.8, _ctr.z + 1.0), M.paint_grey, plant); _cyl(0.42, 0.02, Vector3(sx, 15.67, _ctr.z + 1.0), _flat(Color(1, 1, 1), 0, 0.3, Color(1.0, 0.9, 0.75), 3.0), plant)
	print("LOOK2 gen: %d units, %d pipes" % [at.size(), k])
	set_camera(_preset)   # re-frame the new plant

func _height(ty: String) -> float:
	match ty:
		"splitter": return 1.6
		"cooler": return 2.0
		"hx": return 2.6
		"heater": return 7.5
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
	var l := OmniLight3D.new(); l.light_color = Color(1.0, 0.45, 0.15); l.light_energy = 0.0; l.light_specular = 0.0; l.omni_range = 5.0; l.position = c + Vector3(0, 2.4, 1.6); plant.add_child(l)
	_glow[id] = {"mat": gm, "light": l, "kind": "converter"}

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

## 0.12 (chapter 2): a box fired heater: a radiant firebox in heat paint on legs with a peep window that glows with the fire, a convection section above it with
## a header box, a stack with a damper, a ladder and a platform at the convection level. Its fire follows the outlet temperature, like the burner.
func _heater(id: String, c: Vector3) -> void:
	for lx in [-1.1, 1.1]: for lz in [-0.9, 0.9]: _box(Vector3(0.2, 1.0, 0.2), c + Vector3(lx, 0.5, lz), M.paint_grey, plant)   # legs
	_box(Vector3(2.6, 3.2, 2.2), c + Vector3(0, 2.6, 0), M.heat_paint, plant)   # radiant box
	for x in [-1.3, -0.43, 0.43, 1.3]: _box(Vector3(0.06, 3.24, 2.24), c + Vector3(x, 2.6, 0), M.steel_dull, plant)   # buckstays
	_box(Vector3(2.0, 1.2, 1.6), c + Vector3(0, 4.8, 0), M.heat_paint, plant)   # convection section
	_box(Vector3(2.1, 0.3, 0.3), c + Vector3(0, 4.8, 0.95), M.steel_dull, plant)   # header box
	_lathe(PackedVector2Array([Vector2(0.35, 0), Vector2(0.3, 2.4), Vector2(0.0, 2.4)]), 24, M.steel_dull, c + Vector3(0, 5.4, 0), plant, true)   # stack
	_box(Vector3(0.7, 0.06, 0.7), c + Vector3(0, 6.2, 0), M.black, plant)   # damper
	_box(Vector3(2.8, 0.05, 0.8), c + Vector3(0, 4.2, 1.5), M.plate, plant)   # platform
	for sx in [-1.4, 1.4]: _seg(c + Vector3(sx, 4.2, 1.9), c + Vector3(sx, 5.2, 1.9), 0.02, M.steel_dull, plant)
	_seg(c + Vector3(-1.4, 5.2, 1.9), c + Vector3(1.4, 5.2, 1.9), 0.02, M.steel_dull, plant)
	for sx2 in [-0.2, 0.2]: _seg(c + Vector3(1.6 + sx2, 0, 1.4), c + Vector3(1.6 + sx2, 4.2, 1.4), 0.02, M.yellow, plant)   # ladder
	for i in 13: _seg(c + Vector3(1.4, 0.3 + i * 0.3, 1.4), c + Vector3(1.8, 0.3 + i * 0.3, 1.4), 0.012, M.yellow, plant)
	var gm := _glowmat()
	for zz in [1.12, -1.12]: var pw := _cyl(0.14, 0.04, c + Vector3(0.0, 1.6, zz), gm, plant); pw.rotation_degrees.x = 90   # peep windows
	for bx in [-0.6, 0.6]: _cyl(0.18, 0.4, c + Vector3(bx, 0.85, 0), M.steel_dull, plant)   # floor burners under the box
	var l := OmniLight3D.new(); l.light_color = Color(1.0, 0.5, 0.2); l.light_energy = 0.0; l.light_specular = 0.0; l.omni_range = 4.0; l.position = c + Vector3(0, 1.6, 1.8); plant.add_child(l)
	_glow[id] = {"mat": gm, "light": l, "kind": "burner"}

## 0.12 (chapter 2, L07): a moving-bed coke gasifier: a refractory-lined shell in heat paint on a skirt, a coke hopper and lock on top, a cone bottom to an ash
## lock, air tuyeres round the base, a sight glass that glows with the bed, a gas offtake near the top, a caged ladder and a top platform.
func _gasifier(id: String, c: Vector3) -> void:
	_vessel(c, 0.85, 3.6, M.heat_paint, plant, LADDER.merged({"base": 1.4}))
	_lathe(PackedVector2Array([Vector2(0.85, 0), Vector2(0.25, -0.8), Vector2(0.25, -1.0), Vector2(0.0, -1.0)]), 32, M.heat_paint, c + Vector3(0, 1.4, 0), plant, true)   # cone bottom
	_box(Vector3(0.5, 0.5, 0.5), c + Vector3(0, 0.25, 0), M.steel_dull, plant)   # ash lock
	_lathe(PackedVector2Array([Vector2(0.0, 0), Vector2(0.2, 0), Vector2(0.6, 0.9), Vector2(0.6, 1.2), Vector2(0.0, 1.2)]), 24, M.paint_grey, c + Vector3(0, 5.6, 0), plant, true)   # coke hopper
	_cyl(0.22, 0.4, c + Vector3(0, 5.4, 0), M.steel_dull, plant)   # coal lock
	for i in 8: var a := i * TAU / 8.0; _seg(c + Vector3(cos(a) * 0.86, 1.9, sin(a) * 0.86), c + Vector3(cos(a) * 1.15, 1.75, sin(a) * 1.15), 0.05, M.steel_dull, plant)   # air tuyeres
	_lathe(PackedVector2Array([Vector2(1.0, 0), Vector2(1.18, 0), Vector2(1.18, 0.18), Vector2(1.0, 0.18)]), 32, M.steel_dull, c + Vector3(0, 1.7, 0), plant, false)   # bustle main
	_seg(c + Vector3(0.85, 4.6, 0), c + Vector3(1.5, 4.6, 0), 0.16, M.steel_dull, plant)   # gas offtake
	var gm := _glowmat(); var sg := _cyl(0.12, 0.04, c + Vector3(0, 2.4, 0.87), gm, plant); sg.rotation_degrees.x = 90   # sight glass on the bed
	var l := OmniLight3D.new(); l.light_color = Color(1.0, 0.5, 0.2); l.light_energy = 0.0; l.light_specular = 0.0; l.omni_range = 3.5; l.position = c + Vector3(0, 2.4, 1.6); plant.add_child(l)
	_glow[id] = {"mat": gm, "light": l, "kind": "burner"}

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
	_lathe(PackedVector2Array([Vector2(0.765, 0), Vector2(r_at.call(1.1) + 0.012, 1.1), Vector2(r_at.call(1.1), 1.1), Vector2(0.75, 0)]), 40, _flat(Color(0.28, 0.14, 0.08), 0.3, 0.95), c, plant, false)   # rust at the base
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
	_seg(c + Vector3(0.6, 4.3, 0), c + Vector3(1.2, 4.3, 0.4), 0.02, M.steel_dull, plant)   # sample probe line
	_seg(c + Vector3(1.2, 4.3, 0.4), c + Vector3(1.4, 1.6, 0.9), 0.02, M.steel_dull, plant)
	var cab := c + Vector3(1.5, 0, 1.1)
	_box(Vector3(0.9, 1.7, 0.6), cab + Vector3(0, 0.85, 0), _flat(Color(0.62, 0.65, 0.68), 0.15, 0.45), plant)   # grey powder-coat analyser cabinet
	_box(Vector3(0.82, 0.72, 0.03), cab + Vector3(0, 1.25, 0.3), _flat(Color(0.15, 0.16, 0.17), 0.3, 0.4), plant)   # recessed bezel
	_seg(cab + Vector3(-0.3, 1.7, 0), cab + Vector3(-0.3, 2.6, 0), 0.03, M.steel_dull, plant)   # conduit up to the sample line
	var scr := _flat(Color(0.02, 0.05, 0.05), 0.0, 0.2); scr.emission_enabled = true; scr.emission = Color(0.1, 0.5, 0.45); scr.emission_energy_multiplier = 0.5
	_box(Vector3(0.74, 0.62, 0.02), cab + Vector3(0, 1.25, 0.31), scr, plant)
	var t := Label3D.new(); t.name = "analyser"; t.text = "FLUE ANALYSER\n--"; t.font_size = 40; t.pixel_size = 0.0016; t.modulate = Color(0.5, 1.0, 0.9)
	t.outline_size = 0; t.position = cab + Vector3(0, 1.25, 0.33); t.width = 180.0; t.autowrap_mode = TextServer.AUTOWRAP_OFF; plant.add_child(t)
	_analyser[id] = t; _stack_at = cab
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
	for sg in [1.0, -1.0]:
		var px := XC + 0.1
		var tube := _cyl(0.21, 0.34, c + Vector3(px, AY, sg * (R + 0.1)), M.steel_dull, plant); tube.rotation_degrees.x = 90
		var bore := _cyl(0.165, 0.1, c + Vector3(px, AY, sg * (R + 0.2)), _flat(Color(0.03, 0.03, 0.03), 0.0, 0.9), plant); bore.rotation_degrees.x = 90   # the dark bore of the tube
		var pw := _cyl(0.15, 0.03, c + Vector3(px, AY, sg * (R + 0.06)), gm, plant); pw.rotation_degrees.x = 90   # the glass, set back 0.2 m in the tube
		var rim := _torus(0.2, 0.025, c + Vector3(px, AY, sg * (R + 0.27)), M.steel_dull, plant); rim.rotation_degrees.x = 90
	var fl := _particles(c + Vector3(x0 + 0.4, AY, 0), 60, 0.5, Vector3(2.4, 0.2, 0), 8.0, 0.35, Color(1.0, 0.55, 0.15, 0.7), plant, 2.0)
	fl.emitting = false
	var l := OmniLight3D.new(); l.light_color = Color(1.0, 0.5, 0.2); l.light_energy = 0.0; l.light_specular = 0.0; l.omni_range = 5.5; l.position = c + Vector3(XC + 0.1, 1.0, R + 0.8); plant.add_child(l)
	_glow[id] = {"mat": gm, "light": l, "kind": "burner", "flame": fl, "window": true}

## The exam bridge (L04): a clipboard stand for the inspector, an inspection tag wired to the reactor's leg, a sample bomb on a stand with its two needle valves.
func _exam_props(c: Vector3) -> void:
	var sx := c.x - 1.9; var sz := c.z + 0.9   # the clipboard stand
	_seg(Vector3(sx, 0.02, sz), Vector3(sx, 1.25, sz), 0.018, M.steel_dull, plant)
	_box(Vector3(0.5, 0.025, 0.06), Vector3(sx, 0.015, sz), M.steel_dull, plant); _box(Vector3(0.06, 0.025, 0.5), Vector3(sx, 0.015, sz), M.steel_dull, plant)
	var cb := _box(Vector3(0.34, 0.44, 0.02), Vector3(sx, 1.4, sz + 0.03), _flat(Color(0.45, 0.3, 0.18), 0.0, 0.85), plant); cb.rotation_degrees.x = -12.0
	var sheet := _box(Vector3(0.28, 0.36, 0.006), Vector3(sx, 1.4, sz + 0.044), _flat(Color(0.9, 0.9, 0.86), 0.0, 0.9), plant); sheet.rotation_degrees.x = -12.0
	_box(Vector3(0.12, 0.04, 0.03), Vector3(sx, 1.62, sz + 0.04), M.steel_dull, plant).rotation_degrees.x = -12.0   # the clip
	var t := Label3D.new(); t.text = "INSPECTION\nREPORT"; t.font_size = 48; t.pixel_size = 0.0012; t.modulate = Color(0.1, 0.1, 0.12); t.outline_size = 0; t.shaded = true
	t.position = Vector3(sx, 1.46, sz + 0.05); t.rotation_degrees.x = -12.0; plant.add_child(t)
	var leg := c + Vector3(0.55 * cos(PI * 0.75), 0.0, 0.55 * sin(PI * 0.75))   # the inspection tag on the front-left leg
	_seg(leg + Vector3(0, 0.75, 0), leg + Vector3(0.1, 0.62, 0.12), 0.004, M.black, plant)
	_box(Vector3(0.1, 0.16, 0.006), leg + Vector3(0.1, 0.52, 0.14), _flat(Color(0.8, 0.12, 0.08), 0.0, 0.5), plant)
	_box(Vector3(0.07, 0.06, 0.007), leg + Vector3(0.1, 0.55, 0.14), _flat(Color(0.92, 0.9, 0.82), 0.0, 0.7), plant)
	var bx := c.x + 1.2; var bz := c.z + 0.8   # the sample bomb on a stand, tapped off the reactor
	_seg(Vector3(bx, 0.0, bz), Vector3(bx, 0.95, bz), 0.02, M.paint_grey, plant); _box(Vector3(0.3, 0.02, 0.3), Vector3(bx, 0.01, bz), M.steel_dull, plant)
	_seg(c + Vector3(0.5, 0.95, 0.4), Vector3(bx, 1.0, bz), 0.015, M.steel_dull, plant)   # the sample line from the shell
	_cyl(0.07, 0.5, Vector3(bx, 1.3, bz), M.steel, plant); _sph(0.07, Vector3(bx, 1.55, bz), M.steel, plant, true); _sph(0.07, Vector3(bx, 1.05, bz), M.steel, plant, true).rotation_degrees.x = 180
	for vy in [1.55, 1.05]:
		_seg(Vector3(bx, vy, bz), Vector3(bx + 0.18, vy + (0.1 if vy > 1.2 else -0.1), bz), 0.012, M.steel_dull, plant)
		_torus(0.04, 0.008, Vector3(bx + 0.18, vy + (0.1 if vy > 1.2 else -0.1) + 0.03, bz), M.red, plant)   # needle-valve handwheel
	_box(Vector3(0.12, 0.05, 0.005), Vector3(bx, 1.3, bz + 0.072), _flat(Color(0.8, 0.72, 0.45), 0.8, 0.35), plant)   # the bomb's nameplate

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
		var col: Color = bb[0]; var e: float = bb[1]; var lamp := e * 1.6   # the warm light on the shell scales with the glow
		if running and T > 0.0:
			heat = clampf((T - 620.0) / 260.0, 0.0, 1.0)
			if float(_tmin.get(id, 0.0)) > 0.0 and T < float(_tmin[id]): heat = 0.0; e = 0.0; lamp = 0.0   # asleep: below light-off the bed stays dark steel
			if float(_tmax.get(id, 0.0)) > 0.0 and T > float(_tmax[id]): heat = 1.0; col = Color(1.0, 0.22, 0.04); e = 1.5; lamp = 3.2   # sintering: a hard red-orange at the cap, and the light to match
		gw["sinter"] = e >= 1.5 and col.g < 0.3
		(gw.mat as StandardMaterial3D).emission = col
		if not bool(gw.get("window", false)): (gw.mat as StandardMaterial3D).albedo_color = Color(0.5, 0.52, 0.55).lerp(Color(0.14, 0.12, 0.12), e / 1.5)   # the steel darkens as it glows, so the colour is the blackbody's and not steel lit orange
		(gw.mat as StandardMaterial3D).emission_energy_multiplier = e
		(gw.light as OmniLight3D).light_energy = lamp
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
	for id in _analyser:   # the flue analyser reads the engine's stack composition
		var inf: Dictionary = info.get(id, {})
		var tx := "FLUE GAS, mol % wet"   # Anjali: the engine's fractions include the water; say so, and show it (L03 identifies its fuel by CO2 : H2O)
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
	for id in _glow:   # a sintering bed does not glow steadily: a slow throb, never above the cap
		var gw: Dictionary = _glow[id]
		if bool(gw.get("sinter", false)): (gw.mat as StandardMaterial3D).emission_energy_multiplier = 1.5 * (0.88 + 0.12 * sin(_t * 5.0))
	_ft_tick(dt)

## Half-extents round a unit's floor position, for framing: [x0, x1, z0, z1, height] (m), the whole unit with its platform, fan set or stack.
func _ext(ty: String) -> Array:
	match ty:
		"burner", "co_burner": return [-4.1, 3.3, -1.4, 2.0, 2.9]
		"eq_reactor": return [-2.1, 2.1, -2.1, 2.1, 8.0]
		"eq_bed": return [-1.1, 1.1, -1.1, 1.1, 3.6]
		"gasifier": return [-2.0, 2.0, -2.0, 2.0, 7.3]
		"heater": return [-1.8, 2.3, -1.5, 2.3, 7.6]
		"boiler": return [-1.6, 1.6, -1.0, 1.0, 3.4]
		"stoich_reactor": return [-1.0, 1.0, -1.0, 1.0, 3.1]
		"splitter": return [-1.0, 1.0, -0.8, 1.3, 1.8]
		"nh3_sep": return [-0.8, 0.8, -0.8, 0.8, 4.4]
		"product": return [-1.3, 1.3, -1.3, 1.3, 3.5]
		"stack": return [-1.5, 2.2, -1.5, 2.0, 9.6]
	return [-1.3, 1.3, -1.0, 1.0, _height(ty)]

## Which units the level's hero view frames, and from which side. Each level gets its own: the story unit, not the first unit in the list.
func _pick_hero() -> Dictionary:
	var by := {}
	for id in _types:
		if not by.has(_types[id]): by[_types[id]] = []
		(by[_types[id]] as Array).append(id)
	var ids: Array = []; var yaw := 0.2 * PI
	if by.has("gasifier"): ids = [by.gasifier[0]]                                   # L07
	elif by.has("heater"): ids = [by.heater[0]]                                     # L08
	elif by.has("eq_bed"): var b: Array = by.eq_bed; ids = [b[b.size() / 2]]; yaw = 0.24 * PI   # L13: the middle bed, its neighbours either side
	elif by.has("eq_reactor"):                                                      # L10-L12: the converter, from a different side each
		ids = [by.eq_reactor[0]]; yaw = (0.2 if _lid != "L11" else -0.2) * PI
		if _lid == "L12": yaw = 0.3 * PI
	elif by.has("burner"):
		yaw = -0.2 * PI                                                            # the burner is framed from its front-plate end, the fan set in view
		var bo: String = by.burner[0]
		if _lid == "L03" and by.has("boiler"): ids = [by.boiler[0]]; yaw = 0.2 * PI   # L03: the waste-heat boiler (its plume), the burner behind it
		elif _lid == "L05" and by.has("boiler"): ids = [bo, by.boiler[0]]            # L05: the burner and the boiler it feeds
		elif _lid == "L06" and by.has("splitter"): ids = [bo, by.splitter[0]]        # L06: the splitter that sets the bypass, and the burner
		else: ids = [bo]                                                            # L02
	elif by.has("stoich_reactor"):                                                  # L01 the bench reactor; L04 (exam) from the other side with its props
		ids = [by.stoich_reactor[0]]; yaw = (0.2 if _lid != "L04" else -0.32) * PI
	else: ids = [str(_types.keys()[_types.size() / 2])]
	return {"ids": ids, "yaw": yaw}

## The distance at which the footprint-and-height box fills `frac` of the frame height (and at most `hfrac` of its width at a 16:10 window, the narrowest we ship): a pinhole fit.
## The box overstates a round unit's silhouette (its far-corner depth), so frac 0.6 of the box is the 45-55 % of the frame the unit itself fills.
func _fit(target: Vector3, corners: Array, yaw: float, pitch: float, frac := 0.6, hfrac := 0.86, aspect := 1.6) -> float:
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
		if maxf((y1 - y0) * 0.5 / frac, (x1 - x0) * 0.5 / hfrac) > 1.0: lo = d
		else: hi = d
	return hi

func _frame_hero() -> void:
	var h := _pick_hero()
	var lo := Vector3(1e9, 0, 1e9); var hi := Vector3(-1e9, 0, -1e9); var top := 0.0
	for id in h.ids:
		var c: Vector3 = _at[id]; var e := _ext(str(_types[id]))
		if _lid == "L04" and str(_types[id]) == "stoich_reactor": e = [-2.3, 2.0, -1.0, 1.8, 3.1]   # the clipboard stand and the sample bomb are in the frame
		lo = Vector3(minf(lo.x, c.x + e[0]), 0, minf(lo.z, c.z + e[2])); hi = Vector3(maxf(hi.x, c.x + e[1]), 0, maxf(hi.z, c.z + e[3])); top = maxf(top, e[4])
	var corners: Array = []
	for x in [lo.x, hi.x]: for y in [0.0, top]: for z in [lo.z, hi.z]: corners.append(Vector3(x, y, z))
	var target := Vector3((lo.x + hi.x) * 0.5, top * 0.5, (lo.z + hi.z) * 0.5)
	var pitch := -0.52   # 30 degrees down
	var d := _fit(target, corners, h.yaw, pitch)
	t_yaw = h.yaw; t_pitch = pitch; t_dist = d
	t_focus = target - Vector3(0, 0.06 * d, 0)   # the unit sits a little above the middle: the instrument bar takes the bottom of the frame
	if OS.get_environment("CB_CAMDBG") == "1":
		var dir := Basis(Vector3.UP, t_yaw) * Basis(Vector3.RIGHT, t_pitch) * Vector3(0, 0, 1)
		print("CAMDBG hero=%s lid=%s focus=%s dist=%.2f eye=%s room_z=%.1f" % [str(h.ids), _lid, str(t_focus), d, str(t_focus + dir * d), HALL_MAX.z - (t_focus + dir * d).z])

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
			_preset = p; t_focus = _stack_at + Vector3(0, 1.4, 0); t_yaw = -0.5; t_pitch = -0.08; t_dist = 3.6; continue
		if not GEN_PRESETS.has(p): continue
		_preset = p
		var v: Array = GEN_PRESETS[p]; t_focus = _ctr + Vector3(0, (v[0] as Vector3).y, 0); t_yaw = v[1]; t_pitch = v[2]
		t_dist = clampf(_span * float(v[3]) / 22.0, 7.0, float(v[3]) * 1.4)   # phase C: distance scales with the plant, not a fixed spot in the hall
	if OS.has_environment("CB_SHOT"):
		_snap_cam()
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
