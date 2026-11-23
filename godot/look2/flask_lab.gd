class_name FlaskLab
extends LabWorld
## L14 The Brown Gas in the genius's private lab (docs/LOOK2.md). Same contract as LabWorld (setup, set_snapshot, set_quality, make_current, anchor_screen,
## anchor_size, set_camera, set_xray, key, cam, picked) plus control_changed(key, value) from the in-world wheels ("T" kelvin, "V" m3) and
## set_control_value(key, value) to mirror the HUD. Roles: flask, feed (the N2O4 dewar), argon, vent, gauge.
## The hero is the player's own experiment: a glass gas cylinder with a screw piston on a dais. Its gas height follows V (the 1 L flask is drawn larger
## so it reads; the HUD carries the true numbers). The brown is the NO2 concentration from the engine's solve: c = y_NO2 P / (R T) of the flask outlet,
## shown relative to the notebook flask. Turning V compresses the gas at once (the colour darkens by V_old/V before the run); RUN gives the new equilibrium.
const R := 8.314
const V_BOOK := 1.0e-3
const GAS_H := 1.5           ## m of drawn gas column at V_BOOK
const CR := 0.42             ## m, cylinder radius
const DAIS := Vector3(0, 0.6, -2.0)
var TWIN_NO2 := 251.2         ## mol/m3 of NO2 in the book's flask; set in setup from the engine's book gauge (the hero band) with the book's own constants
const RIG_S := 1.5          ## the experiment is drawn 1.5x on its dais so it reads from the doorway (the HUD carries the true litres)
var pivot: Node3D
var flask_V := V_BOOK; var flask_T := 400.0; var flask_Pfix := 0.0; var argon_on := false
var c_rel := 1.0; var c_show := 1.0; var c_eq := 1.0; var _V_eq := V_BOOK; var c_book := 0.0
var P_bar := 9.15
var m_gas: StandardMaterial3D; var m_coil: StandardMaterial3D; var m_glass_frost: ShaderMaterial
var gas: MeshInstance3D; var piston: Node3D; var wheel_v: Node3D; var wheel_t: Node3D; var gauge_m: ShaderMaterial
var coil_light: OmniLight3D; var dewar_fog: GPUParticles3D; var gas_light: OmniLight3D
var _gas_h := GAS_H
var _wdrag := ""; var _wdrag_v := 0.0
var _flask_out := ""
var p_own := {}               ## bar(a) by (V, T): the flask's own readings without argon at constant volume; the clamp holds the one for the current wheels (Naledi: one value broke the coached order)
static func own_key(V: float, T: float) -> String: return "%d_%d" % [roundi(V * 1.0e6), roundi(T)]
var V_draw := V_BOOK          ## the gas volume the engine has (at constant P with argon it grows past the V wheel)
var twin_plate: Label3D
var lever: Node3D; var valve_h: Node3D; var clamp_h: Node3D; var _lever_t := 0.0
## QA capture hook (CB_L14DEMO=1): the coach's test 1 on a clock, for the 10 s evidence capture. Engine actions only, as the HUD sends them.
var _demo := 0 if OS.get_environment("CB_L14DEMO") == "1" else -1
const DEMO := [[0.8, "commission", []], [2.8, "setParam", ["V", 0.0005]], [4.8, "commission", []], [6.8, "setParam", ["V", 0.001]], [6.85, "argon", [0.15]], [6.9, "commission", []], [8.8, "clampown", []], [9.0, "commission", []]]   # test 2 at constant V, then test 3   # test 3: argon at constant P dilutes the NO2 (paler)
func _demo_step() -> void:
	while _demo < DEMO.size() and _t >= float(DEMO[_demo][0]):
		var st: Array = DEMO[_demo]; var args: Array = st[2]
		if str(st[1]) == "setParam": app.b.act("setParam", [str(ids.get("flask", "")), args[0], args[1]])
		elif str(st[1]) == "clampown": app.b.act("setParam", [str(ids.get("flask", "")), "Pfix", float(p_own.get(own_key(0.001, 400.0), 8.826)) * 1.0e5])   # the clamp holds the first run's own pressure (test 3)
		elif str(st[1]) == "argon": app.b.act("setFeed", [str(ids.get("argon", "")), {"flow": args[0]}])
		else: app.b.act(str(st[1]), [])
		_demo += 1
	if _demo >= DEMO.size(): _demo = -1

func _ready() -> void:
	_build_env()
	env.volumetric_fog_density = 0.008; env.volumetric_fog_albedo = Color(0.85, 0.85, 0.88); env.volumetric_fog_anisotropy = 0.7
	env.ambient_light_energy = 1.4; env.tonemap_exposure = 1.55   # owner review: the glassware, tanks and the bay must read
	_build_room(); _build_rig(); _build_racks()
	cam = Camera3D.new(); cam.fov = 48.0; cam.near = 0.03; cam.far = 600.0; add_child(cam)
	set_camera("wide"); _snap_cam()
	print("LOOK2 lab: %d mesh instances, %d lights" % [find_children("*", "MeshInstance3D", true, false).size(), find_children("*", "Light3D", true, false).size()])
	if OS.get_environment("CB_FRAMETIME") == "1": _ft_start()

# ---- the room: a vast private laboratory. Round 3: walls you can read, a reactor bay behind glass, a gantry, benches of coloured glass, columns, tanks
const HALL := Vector3(64, 24, 44)   ## x span, height, z span; the floor runs z -24..20
var mats := {}
func _lab_mats() -> void:
	var st := StandardMaterial3D.new(); st.metallic = 1.0; st.roughness = 0.24; st.albedo_color = Color(0.78, 0.79, 0.8); st.anisotropy_enabled = true; st.anisotropy = 0.7
	mats.stainless = st
	var st2 := st.duplicate() as StandardMaterial3D; st2.roughness = 0.38; st2.albedo_color = Color(0.66, 0.67, 0.68); mats.stainless_dull = st2
	mats.copper = _flat(Color(0.86, 0.5, 0.32), 1.0, 0.28)
	mats.enamel_white = _flat(Color(0.86, 0.87, 0.85), 0.0, 0.25)
	mats.enamel_green = _flat(Color(0.2, 0.38, 0.33), 0.0, 0.3)
	mats.enamel_navy = _flat(Color(0.12, 0.17, 0.28), 0.0, 0.32)
	mats.anod = _flat(Color(0.07, 0.075, 0.085), 0.8, 0.32)
	mats.wood = _flat(Color(0.24, 0.14, 0.08), 0.0, 0.45)
	mats.panel = _flat(Color(0.16, 0.17, 0.19), 0.3, 0.55)
	mats.concrete = _pbr("concrete_slab_wall", 0.12, Color(0.55, 0.55, 0.56))
	mats.screen = _flat(Color(0.02, 0.04, 0.05), 0.0, 0.2, Color(0.15, 0.55, 0.6), 0.5)
	mats.warm = _flat(Color.WHITE, 0, 0.4, Color(1.0, 0.78, 0.5), 3.0)
	mats.cool = _flat(Color.WHITE, 0, 0.4, Color(0.75, 0.88, 1.0), 2.0)

func _spot(pos: Vector3, at: Vector3, col: Color, e: float, rng: float, ang: float, fog := 1.0, shadow := false) -> SpotLight3D:
	var s := SpotLight3D.new(); s.light_color = col; s.light_energy = e; s.spot_range = rng; s.spot_angle = ang; s.light_volumetric_fog_energy = fog; s.shadow_enabled = shadow
	s.position = pos; add_child(s); s.look_at(at, Vector3.UP if absf((at - pos).normalized().y) < 0.99 else Vector3.FORWARD); return s

## Many copies of one mesh with a colour each (glassware liquids): one draw call.
func _mmc(mesh: Mesh, xf: Array, cols: Array, mat: Material, parent: Node = self) -> MultiMeshInstance3D:
	var mm := MultiMesh.new(); mm.transform_format = MultiMesh.TRANSFORM_3D; mm.use_colors = true; mm.mesh = mesh; mm.instance_count = xf.size()
	for i in xf.size(): mm.set_instance_transform(i, xf[i]); mm.set_instance_color(i, cols[i])
	var mi := MultiMeshInstance3D.new(); mi.multimesh = mm; mi.material_override = mat; parent.add_child(mi); return mi

var _wallwhite: Material
func _build_room() -> void:
	_lab_mats()
	_wallwhite = _flat(Color(0.84, 0.86, 0.88), 0.0, 0.38)
	var x0 := -32.0; var x1 := 32.0; var z0 := -24.0; var z1 := 20.0; var H := 24.0
	var fl := PlaneMesh.new(); fl.size = Vector2(x1 - x0, z1 - z0)
	var ep := StandardMaterial3D.new(); ep.albedo_color = Color(0.7, 0.72, 0.74); ep.roughness = 0.16; ep.metallic = 0.0   # phase C (owner: the lab should gleam): light poured epoxy, polished
	ep.normal_enabled = true; ep.normal_texture = _tex("concrete_floor_02_nor"); ep.normal_scale = 0.12; ep.uv1_scale = Vector3(16, 12, 1)
	_mi(fl, Vector3(0, 0, (z0 + z1) * 0.5), ep)
	for gx in range(int(x0) + 4, int(x1), 4): _box(Vector3(0.02, 0.003, z1 - z0), Vector3(gx, 0.002, (z0 + z1) * 0.5), _flat(Color(0.5, 0.52, 0.54), 0.0, 0.4))   # epoxy joint lines
	# walls: dark wood wainscot to 3.5 m with a warm cove light, concrete above, steel pilasters; the ceiling is a dark coffer with skylights
	for w in [[Vector3(0, 0, z1), Vector3(x1 - x0, 0, 0.4)], [Vector3(x0, 0, 0), Vector3(0.4, 0, z1 - z0)], [Vector3(x1, 0, 0), Vector3(0.4, 0, z1 - z0)]]:
		var c: Vector3 = w[0]; var sz: Vector3 = w[1]
		var cz := c.z if c.z != 0.0 else (z0 + z1) * 0.5
		var cx := c.x
		var thin := Vector3(maxf(sz.x, 0.4), 0, maxf(sz.z, 0.4))
		_box(Vector3(thin.x, 3.5, thin.z), Vector3(cx, 1.75, cz), mats.wood)
		_box(Vector3(thin.x, H - 3.5, thin.z), Vector3(cx, 3.5 + (H - 3.5) * 0.5, cz), _wallwhite)   # white panelled upper walls
		var inward := Vector3(-signf(cx), 0, 0) if sz.x < 1.0 else Vector3(0, 0, -signf(cz - (z0 + z1) * 0.5))
		_box(Vector3(maxf(thin.x - 0.5, 0.06) if sz.x > 1.0 else 0.06, 0.05, maxf(thin.z - 0.5, 0.06) if sz.z > 1.0 else 0.06), Vector3(cx, 3.6, cz) + inward * 0.25, mats.warm)
	_box(Vector3(x1 - x0, 0.6, z1 - z0), Vector3(0, H, (z0 + z1) * 0.5), _flat(Color(0.78, 0.8, 0.82), 0.0, 0.5))   # a light ceiling
	for zz in [-8.0, -2.0, 4.0, 10.0, 16.0]:   # continuous LED lines across the ceiling
		_box(Vector3(x1 - x0 - 4.0, 0.06, 0.35), Vector3(0, H - 0.33, zz), _flat(Color(1, 1, 1), 0, 0.3, Color(0.95, 0.97, 1.0), 2.2))
	for i in 6:
		_box(Vector3(6.0, 0.1, 3.0), Vector3(-25.0 + i * 10.0, H - 0.35, -2.0), _flat(Color(0.4, 0.5, 0.7), 0, 0.3, Color(0.3, 0.42, 0.65), 0.6))
		_spot(Vector3(-25.0 + i * 10.0, H - 0.6, -2.0), Vector3(-25.0 + i * 10.0 + 3.0, 0, 2.0), Color(0.6, 0.72, 1.0), 4.0, 34.0, 12.0, 3.0, i % 2 == 0)
	for x in [-24.0, -12.0, 12.0, 24.0]:
		for z in [z1 - 0.4]: _box(Vector3(0.7, H, 0.8), Vector3(x, H * 0.5, z), mats.stainless_dull)
		_box(Vector3(0.8, H, 0.7), Vector3(x0 + 0.4, H * 0.5, x * 0.6), mats.stainless_dull); _box(Vector3(0.8, H, 0.7), Vector3(x1 - 0.4, H * 0.5, x * 0.6), mats.stainless_dull)
	# the reactor bay behind a glass wall (z -13 .. -24): the big vessel, tanks, a gantry, its own cool light
	var gz := -13.0
	_box(Vector3(x1 - x0, 0.3, 0.4), Vector3(0, 0.15, gz), mats.anod)
	for i in 17:
		var x := x0 + 2.0 + i * 3.75
		_box(Vector3(0.12, 12.0, 0.2), Vector3(x, 6.0, gz), mats.anod)
	_box(Vector3(x1 - x0 - 2.0, 12.0, 0.04), Vector3(0, 6.0, gz), M.glass)
	_box(Vector3(x1 - x0, 0.25, 0.3), Vector3(0, 12.1, gz), mats.anod)
	_box(Vector3(x1 - x0, H - 12.2, 0.4), Vector3(0, 12.2 + (H - 12.2) * 0.5, gz), mats.concrete)
	_box(Vector3(x1 - x0, H, 0.4), Vector3(0, H * 0.5, z0), mats.concrete)
	var rv := Vector3(-6.0, 0, -19.0)   # the reactor: jacketed stainless, dished heads, manway, nozzles, insulation bands, sight glass glowing
	_cyl(1.9, 8.0, rv + Vector3(0, 5.0, 0), mats.stainless, self, -1.0, 48)
	_sph(1.9, rv + Vector3(0, 9.0, 0), mats.stainless, self, true)
	_cyl(1.95, 0.25, rv + Vector3(0, 2.2, 0), mats.stainless_dull, self, -1.0, 48)
	for k in 4: _torus(1.93, 0.05, rv + Vector3(0, 3.5 + k * 1.6, 0), mats.stainless_dull)
	for a in 4: _seg(rv + Vector3(cos(a * TAU / 4.0) * 1.6, 0, sin(a * TAU / 4.0) * 1.6), rv + Vector3(cos(a * TAU / 4.0) * 1.6, 2.3, sin(a * TAU / 4.0) * 1.6), 0.12, mats.anod)
	_cyl(0.35, 0.4, rv + Vector3(0.9, 10.6, 0.4), mats.stainless); _cyl(0.2, 1.4, rv + Vector3(-0.8, 10.8, 0.0), mats.stainless)
	_cyl(0.32, 0.1, rv + Vector3(0, 5.2, 1.95), _flat(Color(0.2, 0.1, 0.05), 0, 0.2, Color(1.0, 0.55, 0.2), 2.5)).rotation_degrees.x = 90
	var bl := OmniLight3D.new(); bl.light_color = Color(1.0, 0.6, 0.3); bl.light_energy = 1.5; bl.omni_range = 5.0; bl.position = rv + Vector3(0, 5.2, 2.6); add_child(bl)
	for t in [[Vector3(5.0, 0, -20.0), 1.6, 6.0, mats.enamel_white], [Vector3(10.5, 0, -20.0), 1.6, 6.0, mats.enamel_white], [Vector3(17.0, 0, -19.0), 1.3, 9.0, mats.copper]]:
		var p: Vector3 = t[0]; var r: float = t[1]; var h: float = t[2]
		_cyl(r, h, p + Vector3(0, h * 0.5 + 0.6, 0), t[3], self, -1.0, 40); _sph(r, p + Vector3(0, h + 0.6, 0), t[3], self, true)
		for a in 3: _seg(p + Vector3(cos(a * TAU / 3.0) * r * 0.8, 0, sin(a * TAU / 3.0) * r * 0.8), p + Vector3(cos(a * TAU / 3.0) * r * 0.8, 0.7, sin(a * TAU / 3.0) * r * 0.8), 0.08, mats.anod)
	_box(Vector3(36.0, 0.15, 1.6), Vector3(2.0, 7.0, -16.4), M.plate)   # bay gantry with rail
	_box(Vector3(36.0, 0.05, 0.05), Vector3(2.0, 8.05, -15.65), M.yellow)
	for i in 10: _seg(Vector3(-16.0 + i * 4.0, 7.0, -15.65), Vector3(-16.0 + i * 4.0, 8.05, -15.65), 0.025, M.yellow)
	for i in 4: _seg(Vector3(-14.0 + i * 11.0, 0, -16.4), Vector3(-14.0 + i * 11.0, 7.0, -16.4), 0.12, mats.anod)
	_pipe([rv + Vector3(1.9, 6.5, 0), Vector3(3.4, 6.5, -19.0), Vector3(3.4, 6.5, -20.0), Vector3(3.4, 5.0, -20.0)], 0.12, mats.stainless_dull, self, true)
	_pipe([Vector3(10.5, 6.8, -20.0), Vector3(10.5, 7.6, -20.0), Vector3(17.0, 7.6, -20.0), Vector3(17.0, 7.6, -19.0)], 0.1, mats.copper, self, true)
	for x in [-14.0, -2.0, 10.0, 22.0]: _spot(Vector3(x, 11.5, -15.0), Vector3(x + 1.0, 0, -20.0), Color(0.78, 0.88, 1.0), 9.0, 18.0, 30.0, 2.5, x == -2.0)
	# gantry bridge across the hall at 8 m with a travelling hoist
	_box(Vector3(x1 - x0 - 1.0, 0.5, 1.4), Vector3(0, 9.6, -9.5), mats.enamel_navy)
	_box(Vector3(x1 - x0 - 1.0, 0.05, 0.05), Vector3(0, 10.6, -10.15), M.yellow); _box(Vector3(x1 - x0 - 1.0, 0.05, 0.05), Vector3(0, 10.6, -8.85), M.yellow)
	_box(Vector3(1.6, 0.9, 1.6), Vector3(-9.0, 9.0, -9.5), M.yellow); _seg(Vector3(-9.0, 8.6, -9.5), Vector3(-9.0, 4.5, -9.5), 0.02, M.black); _box(Vector3(0.4, 0.3, 0.2), Vector3(-9.0, 4.4, -9.5), M.yellow)
	for x in [-20.0, 20.0]: _box(Vector3(0.6, 9.4, 0.6), Vector3(x, 4.7, -9.5), mats.enamel_navy)
	# cable trays overhead, conduits down the pilasters
	for z in [-8.0, 0.0, 12.0]: _box(Vector3(x1 - x0 - 2.0, 0.1, 0.6), Vector3(0, 11.0, z), mats.stainless_dull); _box(Vector3(x1 - x0 - 2.0, 0.08, 0.5), Vector3(0, 11.06, z), _flat(Color(0.1, 0.1, 0.12), 0.0, 0.7))
	for x in [-24.0, -12.0, 12.0, 24.0]: _seg(Vector3(x + 0.5, 0.5, -8.0), Vector3(x + 0.5, 11.0, -8.0), 0.05, mats.stainless_dull)
	# key and fill: a cool key on the hero, warm cove light, practicals; the hero is backlit by the bay
	var key := SpotLight3D.new(); key.light_color = Color(0.92, 0.95, 1.0); key.light_energy = 28.0; key.spot_range = 24.0; key.spot_angle = 16.0; key.shadow_enabled = true
	key.position = DAIS + Vector3(4.0, 15.0, 5.0); key.light_volumetric_fog_energy = 2.5; add_child(key); key.look_at(DAIS + Vector3(0, 2.0, 0))
	_spot(DAIS + Vector3(-5.0, 7.0, -6.0), DAIS + Vector3(0, 2.5, 0), Color(0.5, 0.75, 1.0), 6.0, 16.0, 28.0, 1.0)
	for f in [Vector3(-16, 6, 4), Vector3(16, 6, 4), Vector3(0, 7, 12), Vector3(0, 7, -9)]:
		var o := OmniLight3D.new(); o.light_color = Color(1.0, 0.82, 0.62); o.light_energy = 3.5; o.omni_range = 18.0; o.position = f; add_child(o)
	for gx in [-24.0, -14.0, -4.0, 6.0, 16.0, 26.0]:   # a grid of warm high-bay downlights: the lab is lit like a place someone works in
		for gz2 in [-6.0, 4.0, 13.0]:
			_cyl(0.45, 0.25, Vector3(gx, 17.8, gz2), mats.anod); _cyl(0.38, 0.02, Vector3(gx, 17.67, gz2), mats.warm)
			_spot(Vector3(gx, 17.6, gz2), Vector3(gx, 0, gz2 + 0.01), Color(1.0, 0.85, 0.66), 5.0, 22.0, 38.0, 0.8, false)
	var rp := ReflectionProbe.new(); rp.size = Vector3(64, 24, 44); rp.position = Vector3(0, 12, -2); rp.box_projection = true; rp.interior = true; rp.update_mode = ReflectionProbe.UPDATE_ONCE; add_child(rp)
	anchors["bench"] = Vector3(-18.0, 1.4, 4.0)

# ---- the rig: dais, gas cylinder with screw piston, coils, gauge, wheels, dewar of liquid N2O4, argon, fume hood -----------------------------------
func _build_rig() -> void:
	var d := DAIS
	# the dais: two stepped discs with an LED ring
	_cyl(4.2, 0.3, Vector3(d.x, 0.15, d.z), _paint(Color(0.16, 0.17, 0.19)), self, -1.0, 64)
	_cyl(3.2, 0.3, Vector3(d.x, 0.45, d.z), _paint(Color(0.2, 0.21, 0.23)), self, -1.0, 64)
	# round 3 fix (Sigrid): a steel plinth with a hand rail, not a neon halo
	_torus(3.21, 0.03, Vector3(d.x, 0.6, d.z), mats.stainless_dull)
	_torus(4.21, 0.03, Vector3(d.x, 0.3, d.z), mats.stainless_dull)
	for i in 20:
		var a := TAU * i / 20.0
		if absf(wrapf(a - PI * 0.5, -PI, PI)) < 0.45: continue   # the way in, facing the camera side
		_seg(Vector3(d.x + cos(a) * 4.05, 0.3, d.z + sin(a) * 4.05), Vector3(d.x + cos(a) * 4.05, 1.25, d.z + sin(a) * 4.05), 0.025, mats.stainless_dull)
	for k in 2:
		for i in 20:
			var a0 := TAU * i / 20.0; var a1 := TAU * (i + 1) / 20.0
			if absf(wrapf(a0 - PI * 0.5, -PI, PI)) < 0.45 or absf(wrapf(a1 - PI * 0.5, -PI, PI)) < 0.45: continue
			_seg(Vector3(d.x + cos(a0) * 4.05, 0.75 + k * 0.5, d.z + sin(a0) * 4.05), Vector3(d.x + cos(a1) * 4.05, 0.75 + k * 0.5, d.z + sin(a1) * 4.05), 0.022, mats.stainless_dull)
	var n0 := get_child_count()
	# base plinth and the jacket: copper heating coil (glows with T) and a cooling coil (frosts when cold)
	var by := d.y
	_cyl(CR + 0.22, 0.35, Vector3(d.x, by + 0.175, d.z), M.steel, self, -1.0, 48)
	m_coil = _flat(Color(0.72, 0.42, 0.25), 1.0, 0.32, Color(1.0, 0.35, 0.08), 0.0)
	for i in 6: _torus(CR + 0.27, 0.022, Vector3(d.x, by + 0.04 + i * 0.05, d.z), m_coil)   # heater band round the plinth, below the glass: the gas column stays clear
	m_glass_frost = _shader("steel", {"albedo": Color(0.7, 0.85, 0.95), "metallic": 0.6, "rough_base": 0.2, "frost": 0.0, "frost_h": 2.0})
	for i in 6: _torus(CR + 0.05, 0.018, Vector3(d.x, by + 1.95 + i * 0.05, d.z), m_glass_frost)
	coil_light = OmniLight3D.new(); coil_light.light_color = Color(1.0, 0.45, 0.12); coil_light.light_energy = 0.0; coil_light.omni_range = 3.0; coil_light.position = Vector3(d.x, by + 0.2, d.z + CR + 0.5); add_child(coil_light)
	# a lit white diffuser behind the cylinder: brown reads against white (a photometer's light box)
	var dif := _box(Vector3(1.3, 2.5, 0.04), Vector3(d.x, by + 1.6, d.z - CR - 0.35), _flat(Color(0.9, 0.9, 0.87), 0, 0.5, Color(1.0, 0.97, 0.9), 0.35)); dif.name = "diffuser"
	_box(Vector3(1.4, 2.6, 0.06), Vector3(d.x, by + 1.6, d.z - CR - 0.38), M.steel_dull)
	var dl := OmniLight3D.new(); dl.light_color = Color(1.0, 0.96, 0.9); dl.light_energy = 0.5; dl.omni_range = 3.0; dl.position = Vector3(d.x, by + 1.6, d.z - CR - 0.2); add_child(dl)
	# the glass cylinder (thick borosilicate), the brown gas inside, the steel piston on a screw
	var gl := _cyl(CR, 2.4, Vector3(d.x, by + 0.35 + 1.2, d.z), M.glass, self, -1.0, 64); gl.name = "cylinder"
	m_gas = StandardMaterial3D.new(); m_gas.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; m_gas.albedo_color = Color(0.55, 0.24, 0.05, 0.5)
	m_gas.roughness = 1.0; m_gas.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; m_gas.cull_mode = BaseMaterial3D.CULL_DISABLED; m_gas.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_ALWAYS
	m_gas.render_priority = 127   # drawn after the refracting glass, which samples the screen before transparents
	m_gas.emission_enabled = true; m_gas.emission = Color(0.3, 0.13, 0.04); m_gas.emission_energy_multiplier = 0.3
	var gm := CylinderMesh.new(); gm.top_radius = CR - 0.02; gm.bottom_radius = CR - 0.02; gm.height = 1.0; gm.radial_segments = 48
	gas = _mi(gm, Vector3(d.x, by + 0.37, d.z), m_gas)
	gas_light = OmniLight3D.new(); gas_light.light_color = Color(0.9, 0.45, 0.15); gas_light.light_energy = 0.6; gas_light.omni_range = 2.5; gas_light.position = Vector3(d.x, by + 1.0, d.z); add_child(gas_light)
	piston = Node3D.new(); add_child(piston)
	_cyl(CR - 0.015, 0.12, Vector3.ZERO, M.steel, piston, -1.0, 48)
	_torus(CR - 0.02, 0.012, Vector3(0, -0.06, 0), M.black, piston)
	_cyl(0.045, 2.6, Vector3(0, 1.36, 0), M.steel, piston)   # the screw
	for i in 30: _torus(0.05, 0.006, Vector3(0, 0.15 + i * 0.08, 0), M.steel_dull, piston)
	# frame: four tie rods, top crosshead with the V handwheel
	for a in 4:
		var ang := TAU * a / 4.0 + PI / 4.0
		var p := Vector3(d.x + cos(ang) * (CR + 0.16), 0, d.z + sin(ang) * (CR + 0.16))
		_seg(p + Vector3(0, by + 0.35, 0), p + Vector3(0, by + 3.2, 0), 0.03, M.steel)
		_cyl(0.05, 0.06, p + Vector3(0, by + 3.22, 0), M.brass)
	_cyl(CR + 0.24, 0.16, Vector3(d.x, by + 3.15, d.z), M.steel, self, -1.0, 48)
	wheel_v = Node3D.new(); wheel_v.position = Vector3(d.x, by + 3.55, d.z); add_child(wheel_v)
	_torus(0.42, 0.028, Vector3.ZERO, M.brass, wheel_v)
	for i in 5: _seg(Vector3.ZERO, Vector3(cos(TAU * i / 5.0), 0, sin(TAU * i / 5.0)) * 0.41, 0.016, M.brass, wheel_v)
	_cyl(0.07, 0.12, Vector3.ZERO, M.brass, wheel_v)
	_torus(0.44, 0.006, Vector3(0, 0.03, 0), _flat(Color.WHITE, 0, 0.4, Color(0.18, 0.77, 0.71), 3.0), wheel_v)
	anchors["wheel_v"] = wheel_v.position; radius["wheel_v"] = 0.45
	# the big gauge on an arm
	var gp := Vector3(d.x + CR + 0.75, by + 1.9, d.z + 0.15)
	_seg(Vector3(d.x + CR + 0.05, by + 1.9, d.z), gp, 0.025, M.steel)
	gauge_m = _gauge(gp + Vector3(0, 0, 0.05), Vector3(0.2, 0, 1).normalized(), self, 0.46, 0.22)
	anchors["gauge"] = gp + Vector3(0, 0.3, 0); radius["gauge"] = 0.3
	# the console on the dais with the T wheel and screens
	var cp := Vector3(d.x - 1.9, by, d.z + 1.5)
	var desk := _box(Vector3(1.6, 0.9, 0.7), cp + Vector3(0, 0.45, 0), _paint(Color(0.14, 0.15, 0.17))); desk.rotation_degrees.y = 35
	var scr := _box(Vector3(1.3, 0.55, 0.04), cp + Vector3(0.12, 1.25, -0.2), _flat(Color(0.02, 0.03, 0.035), 0.2, 0.12, Color(0.1, 0.42, 0.4), 0.12)); scr.rotation_degrees = Vector3(-15, 35, 0); scr.scale = Vector3(0.7, 0.7, 1)
	wheel_t = Node3D.new(); wheel_t.position = cp + Vector3(0.0, 1.0, 0.3); add_child(wheel_t); wheel_t.rotation_degrees = Vector3(55, 35, 0)
	_torus(0.2, 0.02, Vector3.ZERO, M.brass, wheel_t)
	for i in 4: _seg(Vector3.ZERO, Vector3(cos(TAU * i / 4.0), 0, sin(TAU * i / 4.0)) * 0.19, 0.012, M.brass, wheel_t)
	_torus(0.215, 0.005, Vector3(0, 0.025, 0), _flat(Color.WHITE, 0, 0.4, Color(1.0, 0.55, 0.2), 3.0), wheel_t)
	anchors["wheel_t"] = wheel_t.position; radius["wheel_t"] = 0.25
	_seg(cp + Vector3(0.3, 0.4, 0), Vector3(d.x, by + 0.3, d.z), 0.02, M.black)   # heater cable
	# the feed: liquid N2O4 in a frosted dewar, cold vapour falling off it, a line up to the cylinder
	var fp := Vector3(d.x + 2.0, by, d.z - 1.4)
	_cyl(0.28, 0.9, fp + Vector3(0, 0.45, 0), _shader("steel", {"rough_base": 0.45, "frost": 0.35, "frost_h": 0.6, "metallic": 0.5, "albedo": Color(0.85, 0.88, 0.9)}), self, -1.0, 32)
	_cyl(0.22, 0.12, fp + Vector3(0, 0.96, 0), M.steel_dull)
	var amp := _lathe(PackedVector2Array([Vector2(0, 0), Vector2(0.09, 0), Vector2(0.1, 0.04), Vector2(0.1, 0.22), Vector2(0.03, 0.3), Vector2(0.025, 0.42)]), 24, M.glass, fp + Vector3(0, 1.02, 0))
	amp.name = "ampoule"
	_lathe(PackedVector2Array([Vector2(0, 0.005), Vector2(0.088, 0.005), Vector2(0.095, 0.04), Vector2(0.095, 0.15), Vector2(0, 0.15)]), 24, _shader("liquid", {"col": Color(0.85, 0.6, 0.12, 0.8)}), fp + Vector3(0, 1.02, 0))
	dewar_fog = _particles(fp + Vector3(0, 0.95, 0), 30, 3.0, Vector3(0, -0.12, 0), 60.0, 0.35, Color(0.9, 0.95, 1.0, 0.25), self, 4.0)
	(dewar_fog.process_material as ParticleProcessMaterial).gravity = Vector3(0, -0.15, 0)
	_pipe([fp + Vector3(0, 1.44, 0), fp + Vector3(0, 1.6, 0), Vector3(d.x + CR + 0.1, by + 1.6, d.z - 0.3), Vector3(d.x + CR, by + 0.5, d.z - 0.2)], 0.012, M.steel, self, false)
	anchors["feed"] = fp + Vector3(0, 1.6, 0); radius["feed"] = 0.4
	# argon: a tall grey bottle with a brass regulator, a line with a valve
	var ap := Vector3(d.x - 2.3, by, d.z - 1.2)
	_cyl(0.13, 1.4, ap + Vector3(0, 0.7, 0), _paint(Color(0.32, 0.42, 0.36)))
	_sph(0.13, ap + Vector3(0, 1.4, 0), _paint(Color(0.32, 0.42, 0.36)), self, true)
	_cyl(0.05, 0.14, ap + Vector3(0, 1.58, 0), M.brass); _sph(0.06, ap + Vector3(0.08, 1.62, 0), M.brass)
	_gauge(ap + Vector3(0.1, 1.68, 0.06), Vector3(0.3, 0, 1).normalized(), self, 0.7, 0.05)
	_pipe([ap + Vector3(0, 1.7, 0), ap + Vector3(0, 1.85, 0), Vector3(d.x - CR - 0.1, by + 1.85, d.z - 0.2), Vector3(d.x - CR, by + 0.5, d.z - 0.2)], 0.01, M.steel, self, false)
	_stencil("argon", ap + Vector3(0, 0.9, 0.132), Vector3(0, 0, 1), 0.0016)
	anchors["argon"] = ap + Vector3(0, 1.9, 0); radius["argon"] = 0.4
	# D-B1: the twin, the book's flask, beside yours: same glass, the book's brown, a brass plate
	var tw := Vector3(d.x - 1.2, by, d.z - 0.35)
	_cyl(0.26, 0.2, tw + Vector3(0, 0.1, 0), mats.stainless, self, -1.0, 32)
	_cyl(0.22, 1.6, tw + Vector3(0, 1.0, 0), M.glass, self, -1.0, 40)
	var tg := StandardMaterial3D.new(); tg.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; tg.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; tg.render_priority = 127; tg.cull_mode = BaseMaterial3D.CULL_DISABLED
	var a1 := 1.0 - exp(-1.1); var cc := Color(0.55, 0.36, 0.14).lerp(Color(0.16, 0.06, 0.015), a1); tg.albedo_color = Color(cc.r, cc.g, cc.b, 1.0 - exp(-2.2))
	_cyl(0.2, 1.5, tw + Vector3(0, 0.97, 0), tg, self, -1.0, 40)
	_cyl(0.25, 0.08, tw + Vector3(0, 1.84, 0), mats.stainless, self, -1.0, 32)
	var pl := Label3D.new(); twin_plate = pl; pl.text = "The book's flask"; pl.font_size = 40; pl.pixel_size = 0.0022; pl.no_depth_test = true; pl.render_priority = 127; pl.billboard = BaseMaterial3D.BILLBOARD_FIXED_Y; pl.outline_size = 10; pl.modulate = Color(0.95, 0.85, 0.6); pl.position = tw + Vector3(0, -0.12, 0.45); add_child(pl)
	anchors["twin"] = tw + Vector3(0, 1.2, 0); radius["twin"] = 0.3
	# the RUN lever on the console: pull it to run
	lever = Node3D.new(); lever.position = cp + Vector3(0.45, 0.95, 0.15); add_child(lever)
	_box(Vector3(0.16, 0.06, 0.22), Vector3.ZERO, mats.anod, lever)
	_seg(Vector3.ZERO, Vector3(0, 0.38, -0.12), 0.018, mats.stainless, lever); _sph(0.045, Vector3(0, 0.4, -0.13), _flat(Color(0.9, 0.2, 0.12), 0.1, 0.35), lever)
	anchors["lever"] = lever.position + Vector3(0, 0.3, 0); radius["lever"] = 0.22
	# the argon valve: a red quarter-turn handle on the regulator
	valve_h = Node3D.new(); valve_h.position = ap + Vector3(0, 1.66, 0.09); add_child(valve_h)
	_box(Vector3(0.18, 0.025, 0.04), Vector3(0.07, 0, 0), _flat(Color(0.85, 0.15, 0.1), 0.1, 0.4), valve_h)
	anchors["argon_valve"] = valve_h.position; radius["argon_valve"] = 0.16
	# the clamp on the crosshead: on = the piston is held (constant V); off = it floats at the gauge pressure (constant P)
	clamp_h = Node3D.new(); clamp_h.position = Vector3(d.x + CR + 0.3, by + 3.15, d.z); add_child(clamp_h)
	_box(Vector3(0.14, 0.16, 0.14), Vector3.ZERO, mats.anod, clamp_h); _seg(Vector3.ZERO, Vector3(0.42, 0.0, 0), 0.024, M.red, clamp_h); _sph(0.06, Vector3(0.44, 0, 0), M.red, clamp_h)
	var cl := Label3D.new(); cl.text = "CLAMP"; cl.font_size = 30; cl.pixel_size = 0.00135; cl.fixed_size = true; cl.no_depth_test = true; cl.render_priority = 127; cl.billboard = BaseMaterial3D.BILLBOARD_ENABLED; cl.outline_size = 8; cl.modulate = Color(1.0, 0.75, 0.6); cl.position = Vector3(0.25, 0.2, 0); clamp_h.add_child(cl)   # playtest: nobody found it
	anchors["clamp"] = clamp_h.position + Vector3(0.22, 0, 0); radius["clamp"] = 0.3
	# everything built since n0 moves under a pivot scaled about the dais centre (local positions stay as written)
	pivot = Node3D.new(); pivot.name = "rig"; add_child(pivot)
	pivot.transform = Transform3D(Basis.from_scale(Vector3.ONE * RIG_S), Vector3(d.x, 0, d.z) * (1.0 - RIG_S))
	var kids := get_children().slice(n0, get_child_count() - 1)
	for k in kids: remove_child(k); pivot.add_child(k)
	for r in ["wheel_v", "wheel_t", "gauge", "feed", "argon", "twin", "lever", "argon_valve", "clamp"]: anchors[r] = pivot.transform * anchors[r]; radius[r] = float(radius[r]) * RIG_S
	var top := pivot.transform * Vector3(d.x, by + 3.25, d.z)
	# the vent to a fume hood on the back wall
	var hp := Vector3(d.x, 0, -11.0)
	_box(Vector3(3.0, 2.4, 1.2), hp + Vector3(0, 2.2, 0), M.steel)
	_box(Vector3(2.6, 1.2, 0.02), hp + Vector3(0, 1.9, 0.61), M.glass)
	_box(Vector3(2.6, 0.04, 0.06), hp + Vector3(0, 3.0, 0.62), _flat(Color.WHITE, 0, 0.4, Color(0.8, 0.9, 1.0), 4.0))
	_cyl(0.35, 9.0, hp + Vector3(0, 7.9, -0.2), M.steel_dull)
	_pipe([top, Vector3(d.x, 7.2, d.z), Vector3(d.x, 7.2, -10.6), Vector3(d.x, 3.4, -10.6)], 0.03, M.steel, self, false)
	anchors["vent"] = hp + Vector3(0, 3.6, 0); radius["vent"] = 1.2
	anchors["flask"] = pivot.transform * Vector3(d.x, by + 2.0, d.z); radius["flask"] = 0.7 * RIG_S
	anchors["bench"] = Vector3(-9.0, 1.4, 6.0)

# ---- the working lab: benches of coloured glassware, tall glass columns, a kettle, a control dais. Coloured MultiMesh for the many flasks.
func _build_racks() -> void:
	var palette := [Color(0.2, 0.5, 1.0, 0.75), Color(0.95, 0.72, 0.12, 0.7), Color(0.15, 0.85, 0.45, 0.7), Color(0.92, 0.18, 0.45, 0.72), Color(0.6, 0.3, 0.95, 0.7), Color(0.95, 0.4, 0.1, 0.72), Color(0.85, 0.92, 1.0, 0.4)]
	var lq := StandardMaterial3D.new(); lq.vertex_color_use_as_albedo = true; lq.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; lq.roughness = 0.1; lq.emission_enabled = true; lq.emission = Color(0.05, 0.05, 0.05)
	lq.render_priority = 5
	var erl := ArrayMesh.new(); var em := _lathe(PackedVector2Array([Vector2(0, 0), Vector2(0.075, 0), Vector2(0.08, 0.01), Vector2(0.03, 0.15), Vector2(0.022, 0.2), Vector2(0.025, 0.205)]), 14, M.glass, Vector3(0, -50, 0))
	erl = em.mesh; em.queue_free()
	var lm := _lathe(PackedVector2Array([Vector2(0, 0.004), Vector2(0.071, 0.004), Vector2(0.075, 0.012), Vector2(0.045, 0.09), Vector2(0, 0.09)]), 14, M.glass, Vector3(0, -50, 0))
	var liqmesh: Mesh = lm.mesh; lm.queue_free()
	var bm := _lathe(PackedVector2Array([Vector2(0, 0), Vector2(0.05, 0), Vector2(0.05, 0.16), Vector2(0.055, 0.17)]), 12, M.glass, Vector3(0, -50, 0))
	var beak: Mesh = bm.mesh; bm.queue_free()
	var gx := []; var lx := []; var lc := []; var bx := []
	var k := 0
	# three rows of benches on the left, two on the right front; each a black epoxy top on a steel frame, a reagent shelf, a hood light
	var rows := [[-14.0, 1.0], [-14.0, 6.5], [-14.0, 12.0], [-24.0, 3.0], [-24.0, 9.0], [-24.0, 15.0], [18.0, 13.0], [18.0, 17.5], [9.5, -5.0], [-10.5, -7.0]]   # phase C: two rows in the wide view (Sigrid: sparse)
	for r in rows:
		var bxp := Vector3(r[0], 0, r[1])
		_box(Vector3(7.0, 0.05, 1.4), bxp + Vector3(0, 0.95, 0), _flat(Color(0.05, 0.05, 0.055), 0.0, 0.18))
		_box(Vector3(6.9, 0.9, 1.3), bxp + Vector3(0, 0.46, 0), mats.enamel_white if int(r[1]) % 2 == 0 else mats.enamel_green)
		_box(Vector3(6.9, 0.04, 0.35), bxp + Vector3(0, 1.75, -0.5), mats.stainless_dull)
		_box(Vector3(6.9, 0.04, 0.35), bxp + Vector3(0, 2.35, -0.5), mats.stainless_dull)
		for sx in [-3.4, 3.4]: _seg(bxp + Vector3(sx, 0.97, -0.6), bxp + Vector3(sx, 2.4, -0.6), 0.02, mats.stainless_dull)
		_box(Vector3(6.6, 0.04, 0.1), bxp + Vector3(0, 2.6, -0.3), mats.warm)
		var l := OmniLight3D.new(); l.light_color = Color(1.0, 0.82, 0.6); l.light_energy = 1.4; l.omni_range = 4.5; l.position = bxp + Vector3(0, 2.4, 0.1); add_child(l)
		for j in 22:   # shelves of flasks
			var shelf := 1.77 if j < 11 else 2.37
			var p := bxp + Vector3(-3.1 + (j % 11) * 0.62, shelf, -0.5)
			var xf := Transform3D(Basis.IDENTITY, p)
			gx.append(xf); lx.append(xf); lc.append(palette[(k + j * 3) % palette.size()])
		for j in 9:    # beakers on the bench top
			var p2 := bxp + Vector3(-3.0 + j * 0.7, 0.98, 0.25)
			bx.append(Transform3D(Basis.from_scale(Vector3(1, 0.9 + 0.3 * ((j + k) % 3), 1)), p2))
			lx.append(Transform3D(Basis.from_scale(Vector3(0.68, 1.0, 0.68)), p2 + Vector3(0, 0.005, 0))); lc.append(palette[(k * 2 + j) % palette.size()]); gx.append(Transform3D(Basis.from_scale(Vector3(0.0001, 0.0001, 0.0001)), p2))
		k += 1
	_mmc(liqmesh, lx, lc, lq)
	_mm(erl, gx, M.glass, self)
	_mm(beak, bx, M.glass, self)
	# tall glass columns on the right with coloured liquid levels and bubbles
	var cols := [[Vector3(18.0, 0, -4.0), Color(0.15, 0.8, 0.6, 0.45), 9.0], [Vector3(21.5, 0, -6.5), Color(0.95, 0.65, 0.1, 0.45), 11.0], [Vector3(25.0, 0, -3.5), Color(0.35, 0.5, 1.0, 0.45), 8.0]]
	for c in cols:
		var p: Vector3 = c[0]; var h: float = c[2]
		_cyl(0.42, h, p + Vector3(0, h * 0.5 + 0.5, 0), M.glass, self, -1.0, 32)
		for i in int(h / 1.2): _cyl(0.46, 0.06, p + Vector3(0, 0.9 + i * 1.2, 0), mats.stainless, self, -1.0, 32)
		var lqm := StandardMaterial3D.new(); lqm.albedo_color = c[1]; lqm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; lqm.emission_enabled = true; lqm.emission = Color(c[1].r, c[1].g, c[1].b) * 0.35; lqm.render_priority = 5
		_cyl(0.4, h * 0.45, p + Vector3(0, 0.5 + h * 0.225, 0), lqm, self, -1.0, 32)
		for y in [0.3, h + 0.6]: _cyl(0.55, 0.4, p + Vector3(0, y, 0), mats.stainless, self, -1.0, 32)
		_particles(p + Vector3(0, 0.7, 0), 24, 3.0, Vector3(0, 0.9, 0), 6.0, 0.05, Color(1, 1, 1, 0.5), self, 1.0)
		var gl := OmniLight3D.new(); gl.light_color = Color(c[1].r, c[1].g, c[1].b); gl.light_energy = 0.8; gl.omni_range = 3.5; gl.position = p + Vector3(0.0, 1.5, 0.8); add_child(gl)
	_pipe([Vector3(18.0, 9.8, -4.0), Vector3(18.0, 10.6, -4.0), Vector3(21.5, 10.6, -4.0), Vector3(21.5, 10.6, -6.5), Vector3(21.5, 11.8, -6.5)], 0.06, mats.copper, self, true)
	# a copper kettle with a domed lid and a sight glass, beside the columns
	var kp := Vector3(14.5, 0, -8.0)
	_cyl(1.0, 1.8, kp + Vector3(0, 1.5, 0), mats.copper, self, -1.0, 40); _sph(1.0, kp + Vector3(0, 2.4, 0), mats.copper, self, true)
	_cyl(0.12, 1.2, kp + Vector3(0, 3.8, 0), mats.copper); for a in 3: _seg(kp + Vector3(cos(a * TAU / 3.0) * 0.8, 0, sin(a * TAU / 3.0) * 0.8), kp + Vector3(cos(a * TAU / 3.0) * 0.8, 0.6, sin(a * TAU / 3.0) * 0.8), 0.06, mats.anod)
	# the control dais: a raised platform with a curved desk, three screens, a chair: where the owner of the lab sits
	var cd := Vector3(9.0, 0, 9.0)
	_cyl(3.2, 0.5, cd + Vector3(0, 0.25, 0), mats.panel, self, -1.0, 48); _torus(3.21, 0.02, cd + Vector3(0, 0.5, 0), mats.cool)
	for i in 5:
		var a := -0.9 + i * 0.45
		var dp := cd + Vector3(sin(a) * 2.2, 0.95, -cos(a) * 2.2)
		var d := _box(Vector3(1.0, 0.9, 0.7), dp, mats.anod); d.rotation.y = -a
		if i > 0 and i < 4:
			var sc := _box(Vector3(0.9, 0.55, 0.03), dp + Vector3(sin(a) * 0.1, 0.85, -cos(a) * 0.1), mats.screen); sc.rotation = Vector3(-0.2, -a, 0)
	_cyl(0.3, 0.08, cd + Vector3(0, 0.95, -0.4), mats.anod); _box(Vector3(0.6, 0.7, 0.08), cd + Vector3(0, 1.3, -0.1), mats.anod)
	var dl := OmniLight3D.new(); dl.light_color = Color(0.5, 0.85, 0.9); dl.light_energy = 0.8; dl.omni_range = 4.0; dl.position = cd + Vector3(0, 1.8, -1.6); add_child(dl)
	anchors["dais"] = cd + Vector3(0, 1.5, 0)

# ---- live state ---------------------------------------------------------------------------------------------------------------------------------
func setup(role_ids: Dictionary) -> void:
	ids = role_ids
	var li = app.b.q("levelInfo") if app != null and app.b != null else null
	var hero = li.get("hero", null) if li is Dictionary else null
	if hero is Dictionary and float(hero.get("hi", 0.0)) > 0.0:
		var Pb := (float(hero.lo) + float(hero.hi)) * 0.5            # the book's gauge, bar(a)
		var alpha := Pb * 1.0 / (0.15 * 0.083 * 400.0) - 1.0          # the book's working: P V = n0 (1 + alpha) R T with its 0.15 mol, 1 L, 400 K, R = 0.083
		TWIN_NO2 = 2.0 * alpha * 0.15 / 1.0e-3
		if twin_plate: twin_plate.text = "The book's flask\n%.2f bar(a)" % Pb
	for r in tags: (tags[r] as Label3D).text = "Ar" if r == "argon" else str(ids.get(r, ""))
	var p = app.b.q("plant") if app != null and app.b != null else null
	if p is Dictionary:
		for s in p.get("streams", []):
			if str(s.get("from", {}).get("unit", "")) == str(ids.get("flask", "-")): _flask_out = str(s.id)
	_read_params()

func _read_params() -> void:
	var p = app.b.q("plant") if app != null and app.b != null else null
	if not (p is Dictionary): return
	for u in p.get("units", []):
		var id := str(u.get("id", "")); var pr: Dictionary = u.get("params", {})
		if id == str(ids.get("flask", "-")):
			flask_V = float(pr.get("V", V_BOOK)); flask_T = float(pr.get("T", 400.0)); flask_Pfix = float(pr.get("Pfix", 0.0))
		elif id == str(ids.get("argon", "-")): argon_on = float(pr.get("flow", 0.0)) > 0.0   # the valve shows the feed as set

func set_snapshot(g: Dictionary) -> void:
	var oldV := flask_V
	_read_params()
	if absf(flask_V - oldV) > 1e-9: _compress(oldV, flask_V)
	var sp: Array = g.get("species", [])
	var i_no2 := sp.find("NO2"); var i_ar := sp.find("Ar")
	for s in g.get("streams", []):
		if str(s.get("id", "")) != _flask_out: continue
		var y := 0.0; var yar := 0.0
		for w in s.get("w", []):
			if int(w[0]) == i_no2: y = float(w[1])
			if int(w[0]) == i_ar: yar = float(w[1])
		var P := float(s.get("P", 0.0)); var T := float(s.get("T", 400.0))
		if P > 0.0: V_draw = float(s.get("flow", 0.0)) * R * T / P if flask_Pfix > 0.0 and float(s.get("flow", 0.0)) > 0.0 else flask_V   # Anjali: draw the engine's volume
		if P > 0.0 and T > 0.0:
			P_bar = P / 1e5
			if not argon_on and flask_Pfix <= 0.0 and yar < 1e-6: p_own[own_key(flask_V, T)] = P_bar
			var c := y * P / (R * T)
			var ref := TWIN_NO2   # D-B1: the colour is read against the twin, the book's flask (its NO2 never changes)
			c_eq = c / ref; _V_eq = flask_V; c_rel = c_eq
	if gauge_m: gauge_m.set_shader_parameter("value", clampf(P_bar / 20.0, 0.0, 1.0))

## Turning V before a run: the same gas in a new volume, so every concentration scales by V_old / V_new at once. The run then finds the new equilibrium.
func _compress(v_old: float, v_new: float) -> void:
	c_rel = c_eq * (_V_eq / maxf(v_new, 1e-6))
	c_show = c_eq * (_V_eq / maxf(v_old, 1e-6))

func set_control_value(k: String, v: float) -> void:
	if k == "V" and absf(v - flask_V) > 1e-9: var o := flask_V; flask_V = v; _compress(o, v)
	elif k == "T": flask_T = v

func _process(dt: float) -> void:
	_t += dt
	if cam != null and not cam.current and visible: cam.make_current()
	c_show = lerpf(c_show, c_rel, clampf(dt * 2.5, 0, 1))
	if _demo >= 0: _demo_step()
	# gas: column height follows V, colour depth follows the NO2 concentration (Beer-Lambert across the cylinder)
	var h_to := clampf(GAS_H * (V_draw if flask_Pfix > 0.0 else flask_V) / V_BOOK, 0.25, 2.2)
	_gas_h = lerpf(_gas_h, h_to, clampf(dt * 3.0, 0, 1))
	if gas:
		gas.scale = Vector3(1, _gas_h, 1); gas.position.y = DAIS.y + 0.37 + _gas_h * 0.5
		piston.position = Vector3(DAIS.x, DAIS.y + 0.37 + _gas_h + 0.06, DAIS.z)
		var a := 1.0 - exp(-1.1 * maxf(c_show, 0.0))   # fraction of light absorbed across the cylinder (Beer-Lambert, fixed path), c = NO2 concentration / the twin's; k = 1.1 chosen for legibility: 0.67 at the twin, 0.64 for the real flask at 400 K, 0.82 after halving V
		var col := Color(0.55, 0.36, 0.14).lerp(Color(0.16, 0.06, 0.015), clampf(a, 0.0, 1.0))
		var op := 1.0 - exp(-2.2 * maxf(c_show, 0.0))   # coverage: blending is linear, so a dark gas over the light box needs more than its absorbance to read
		m_gas.albedo_color = Color(col.r, col.g, col.b, clampf(op, 0.03, 0.97))
		m_gas.emission_energy_multiplier = 0.04 * a
		gas_light.light_energy = 0.1 + 0.4 * a
	# heat and cold: the coil glows above ~330 K of set point, the cooling coil frosts below 0 C, the dewar steams cold vapour always
	var hot := clampf((flask_T - 420.0) / 120.0, 0.0, 1.0)   # the heater glows only when pushed above the notebook 400 K
	m_coil.emission_energy_multiplier = hot * 3.0; coil_light.light_energy = hot * 2.5
	m_glass_frost.set_shader_parameter("frost", clampf((285.0 - flask_T) / 40.0, 0.0, 1.0))
	if m_shimmer: m_shimmer.set_shader_parameter("strength", hot * 0.02)
	# the wheels mirror their values (a drag in progress wins)
	if wheel_v and _wdrag != "V": wheel_v.rotation.y = lerp_angle(wheel_v.rotation.y, (flask_V / V_BOOK - 1.0) * TAU, clampf(dt * 5.0, 0, 1))
	if wheel_t and _wdrag != "T": wheel_t.rotation.y = lerp_angle(wheel_t.rotation.y, (flask_T - 400.0) / 50.0 * PI * 0.5, clampf(dt * 5.0, 0, 1))
	if lever: _lever_t = maxf(_lever_t - dt, 0.0); lever.rotation.x = lerpf(lever.rotation.x, 0.9 if _lever_t > 0.0 else 0.0, clampf(dt * 12.0, 0, 1))
	if valve_h: valve_h.rotation.z = lerp_angle(valve_h.rotation.z, PI * 0.5 if argon_on else 0.0, clampf(dt * 8.0, 0, 1))
	if clamp_h: clamp_h.rotation.y = lerp_angle(clamp_h.rotation.y, 0.0 if flask_Pfix <= 0.0 else -PI * 0.5, clampf(dt * 8.0, 0, 1))
	_cam_step(dt)
	_ft_tick(dt)

# ---- wheels: drag to turn (left press on a wheel, drag sideways, release commits) ----------------------------------------------------------------
func _unhandled_input(e: InputEvent) -> void:
	if e is InputEventMouseButton and (e as InputEventMouseButton).pressed and (e as InputEventMouseButton).button_index in [MOUSE_BUTTON_WHEEL_UP, MOUSE_BUTTON_WHEEL_DOWN]:
		var wr := pick_control((e as InputEventMouseButton).position)
		if wr == "wheel_v" or wr == "wheel_t": pad_turn(wr, 1 if (e as InputEventMouseButton).button_index == MOUSE_BUTTON_WHEEL_UP else -1); get_viewport().set_input_as_handled(); return   # playtest: scroll over a wheel turns it
	if e is InputEventMouseButton and (e as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
		var mb := e as InputEventMouseButton
		if mb.pressed:
			var r := pick_control(mb.position)
			if r in ["lever", "argon_valve", "clamp"]: press_control(r); get_viewport().set_input_as_handled(); return
			if r == "wheel_v" or r == "wheel_t":
				_wdrag = "V" if r == "wheel_v" else "T"; _wdrag_v = flask_V if _wdrag == "V" else flask_T
				get_viewport().set_input_as_handled(); return
		elif _wdrag != "":
			control_changed.emit(_wdrag, _wdrag_v); set_control_value(_wdrag, _wdrag_v); _wdrag = ""
			get_viewport().set_input_as_handled(); return
	if e is InputEventMouseMotion and _wdrag != "":
		var dx := (e as InputEventMouseMotion).relative.x
		if _wdrag == "V":
			_wdrag_v = clampf(snappedf(_wdrag_v + dx * 2.0e-6, 0.05e-3), 0.25e-3, 2.0e-3); wheel_v.rotation.y += dx * 0.02
			set_control_value("V", _wdrag_v)
		else:
			_wdrag_v = clampf(snappedf(_wdrag_v + dx * 0.25, 1.0), 250.0, 520.0); wheel_t.rotation.y += dx * 0.02; flask_T = _wdrag_v
		get_viewport().set_input_as_handled(); return
	super(e)

func pad_controls() -> Array: return [["wheel_t", "T wheel"], ["wheel_v", "V wheel"], ["lever", "RUN lever"], ["argon_valve", "Argon valve"], ["clamp", "Piston clamp"], ["call", "Call box"]]
func pad_cams() -> Array: return ["wide", "flask", "gauge", "wheel", "bench", "dewar"]
func pad_turn(id: String, dir: int) -> void:
	_sfx("knob_tick")
	if id == "wheel_t":
		flask_T = clampf(snappedf(flask_T + 1.0 * dir, 1.0), 250.0, 520.0); wheel_t.rotation.y += 0.06 * dir   # phase C: 1 K steps; the book flask wins only at 406 or 407 K
		control_changed.emit("T", flask_T); set_control_value("T", flask_T)
	elif id == "wheel_v":
		var v := clampf(snappedf(flask_V + 0.05e-3 * dir, 0.05e-3), 0.25e-3, 2.0e-3); wheel_v.rotation.y += 0.3 * dir
		control_changed.emit("V", v); set_control_value("V", v)
func pad_value(id: String) -> String:
	match id:
		"wheel_t": return "%.2f °C  (drag sideways or scroll; pad up/down: 1 K)" % (flask_T - 273.15)
		"wheel_v": return "%.2f L  (drag sideways or scroll; pad up/down: 0.05 L)" % (flask_V * 1000.0)
		"lever": return "click or A: run"
		"argon_valve": return ("open" if argon_on else "shut") + "  (click or A: turn)"
		"clamp": return ("released: the piston holds %.2f bar(a)" % (flask_Pfix / 1e5) if flask_Pfix > 0.0 else "on: the volume is fixed") + "  (click or A: toggle)"
		"call": return "type it in the Call box, or A for a keypad"
	return ""

## D-B1: the world's switches. The HUD commits control_changed exactly as its own controls did; RUN commissions.
func press_control(r: String) -> void:
	match r:
		"lever": _lever_t = 0.6; _sfx("key"); control_changed.emit("run", 1.0)
		"argon_valve": argon_on = not argon_on; _sfx("valve"); control_changed.emit("argon", 0.15 if argon_on else 0.0)
		"clamp":
			if flask_Pfix <= 0.0 and not p_own.has(own_key(flask_V, flask_T)):   # playtest: the clamp holds the flask's own reading, so it needs one at these wheels
				if app != null: app.toast("Run once without argon at %.2f L and %.2f °C first: the released piston holds that reading." % [flask_V * 1000.0, flask_T - 273.15], "warn")
				return
			var pf := 0.0 if flask_Pfix > 0.0 else float(p_own.get(own_key(flask_V, flask_T), P_bar)) * 1.0e5   # releasing the clamp holds the flask's own pressure: its last reading without argon (test 3 counts only there)
			flask_Pfix = pf; _sfx("lock"); control_changed.emit("Pfix", pf)

func pick(p: Vector2) -> String:
	var r := super(p)
	return "flask" if r == "bench" else r

# ---- camera -------------------------------------------------------------------------------------------------------------------------------------
const L14_PRESETS := {
	"wide": [Vector3(-5.0, 2.9, -3.4), -0.40, -0.17, 14.5],
	"flask": [Vector3(0, 2.9, -2.0), 0.38, -0.03, 6.6],
	"gauge": [Vector3(1.75, 3.75, -1.6), 0.2, -0.02, 1.5],
	"wheel": [Vector3(0, 6.2, -2.0), 0.5, -0.55, 3.6],
	"bench": [Vector3(-7.4, 1.3, 6.0), -0.5, -0.3, 2.6],
	"dewar": [Vector3(3.0, 2.2, -4.1), 0.7, -0.2, 3.2],
	"xray": [Vector3(0, 2.9, -2.0), 0.38, -0.03, 6.6],
}
func set_camera(spec: String) -> void:
	for part in spec.split(","):
		var p := part.strip_edges()
		if p == "converter": p = "flask"   # the HUD's generic hero button
		if p == "outside" or p == "loop" or p == "front": p = "wide"
		if not L14_PRESETS.has(p): continue
		var v: Array = L14_PRESETS[p]
		t_focus = v[0]; t_yaw = v[1]; t_pitch = v[2]; t_dist = v[3]
	if OS.has_environment("CB_SHOT"): _snap_cam()
func key(e: InputEventKey) -> bool:
	match e.keycode:
		KEY_1: set_camera("wide"); return true
		KEY_2: set_camera("flask"); return true
		KEY_3: set_camera("gauge"); return true
		KEY_4: set_camera("wheel"); return true
		KEY_5: set_camera("dewar"); return true
		KEY_6: set_camera("bench"); return true
		KEY_Q: t_yaw -= PI / 8.0; return true
		KEY_E: t_yaw += PI / 8.0; return true
	return false
func set_quality(t: String) -> void:
	super(t)
	if env != null and t != "ultra": env.volumetric_fog_density = 0.006
	if t == "compat" and pivot != null and pivot.get_node_or_null("compat_fill") == null:   # compat has no GI or shadows: one plain light keeps the rig out of the dark
		var f := OmniLight3D.new(); f.name = "compat_fill"; f.light_color = Color(0.95, 0.95, 1.0); f.light_energy = 3.0; f.omni_range = 7.0; f.position = DAIS + Vector3(1.5, 3.0, 2.5); pivot.add_child(f)
