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
## QA capture hook (CB_L14DEMO=1): the coach's test 1 on a clock, for the 10 s evidence capture. Engine actions only, as the HUD sends them.
var _demo := 0 if OS.get_environment("CB_L14DEMO") == "1" else -1
const DEMO := [[0.8, "commission", []], [2.8, "setParam", ["V", 0.0005]], [4.8, "commission", []], [6.8, "setParam", ["V", 0.001]], [6.85, "argon", [0.15]], [6.9, "setParam", ["Pfix", 9.15e5]], [7.0, "commission", []]]   # test 3: argon at constant P dilutes the NO2 (paler)
func _demo_step() -> void:
	while _demo < DEMO.size() and _t >= float(DEMO[_demo][0]):
		var st: Array = DEMO[_demo]; var args: Array = st[2]
		if str(st[1]) == "setParam": app.b.act("setParam", [str(ids.get("flask", "")), args[0], args[1]])
		elif str(st[1]) == "argon": app.b.act("setFeed", [str(ids.get("argon", "")), {"flow": args[0]}])
		else: app.b.act(str(st[1]), [])
		_demo += 1
	if _demo >= DEMO.size(): _demo = -1

func _ready() -> void:
	_build_env()
	env.volumetric_fog_density = 0.012; env.volumetric_fog_albedo = Color(0.85, 0.88, 0.95); env.volumetric_fog_anisotropy = 0.7
	env.ambient_light_energy = 0.5
	_build_room(); _build_rig(); _build_racks()
	cam = Camera3D.new(); cam.fov = 48.0; cam.near = 0.03; cam.far = 600.0; add_child(cam)
	set_camera("wide"); _snap_cam()
	print("LOOK2 lab: %d mesh instances, %d lights" % [find_children("*", "MeshInstance3D", true, false).size(), find_children("*", "Light3D", true, false).size()])
	if OS.get_environment("CB_FRAMETIME") == "1": _ft_start()

# ---- the room: a tall private hall, dark panels, LED ribs, clerestory shafts, polished floor ---------------------------------------------------
func _build_room() -> void:
	var fl := PlaneMesh.new(); fl.size = Vector2(44, 28)
	_mi(fl, Vector3.ZERO, _shader("floor", {"diff": _tex("concrete_floor_02_diff"), "rgh": _tex("concrete_floor_02_rough"), "nor": _tex("concrete_floor_02_nor"), "wet": 1.0, "tint": Color(0.3, 0.32, 0.36)}))
	var panel := _paint(Color(0.2, 0.21, 0.23)); panel.metallic = 0.7; panel.roughness = 0.22
	var H := 20.0
	_box(Vector3(44, H, 0.5), Vector3(0, H * 0.5, -13.0), panel)
	_box(Vector3(44, H, 0.5), Vector3(0, H * 0.5, 13.0), panel)
	_box(Vector3(0.5, H, 26), Vector3(-21.5, H * 0.5, 0), panel)
	_box(Vector3(0.5, H, 26), Vector3(21.5, H * 0.5, 0), panel)
	_box(Vector3(44, 0.4, 26), Vector3(0, H, 0), _flat(Color(0.05, 0.05, 0.06), 0.3, 0.6))
	var led := _flat(Color.WHITE, 0, 0.4, Color(0.6, 0.8, 1.0), 1.3)
	for i in 11:   # vertical light ribs on the back and side walls
		var x := -20.0 + i * 4.0
		_box(Vector3(0.12, H - 2.0, 0.06), Vector3(x, H * 0.5, -12.72), led)
		_box(Vector3(0.6, H, 0.7), Vector3(x + 2.0, H * 0.5, -12.6), M.steel_dull)   # steel pilasters
	for z in [-8.0, -4.0, 0.0, 4.0, 8.0]:
		_box(Vector3(0.06, H - 2.0, 0.12), Vector3(-21.2, H * 0.5, z), led); _box(Vector3(0.06, H - 2.0, 0.12), Vector3(21.2, H * 0.5, z), led)
	# clerestory: a band of high windows on the back wall with moonlight shafts through the haze
	for i in 8:
		var x := -17.5 + i * 5.0
		_box(Vector3(3.2, 3.0, 0.1), Vector3(x, 16.5, -12.7), _flat(Color(0.5, 0.6, 0.8), 0, 0.2, Color(0.35, 0.45, 0.7), 1.2))
		var s := SpotLight3D.new(); s.light_color = Color(0.62, 0.72, 1.0); s.light_energy = 6.0; s.spot_range = 30.0; s.spot_angle = 14.0
		s.position = Vector3(x, 17.5, -13.5); s.rotation_degrees = Vector3(-38, 0, 0); s.light_volumetric_fog_energy = 4.0; s.shadow_enabled = i % 2 == 0; add_child(s)
	# a gallery walkway around three sides at 7 m, with a glass balustrade
	for side in [[Vector3(0, 7, -11.3), Vector3(42, 0.15, 2.6)], [Vector3(-19.7, 7, 0), Vector3(2.6, 0.15, 20)], [Vector3(19.7, 7, 0), Vector3(2.6, 0.15, 20)]]:
		_box(side[1], side[0], M.plate)
	_box(Vector3(39, 1.0, 0.02), Vector3(0, 7.6, -10.0), M.glass)
	_box(Vector3(39, 0.05, 0.08), Vector3(0, 8.1, -10.0), M.steel)
	_box(Vector3(39, 0.03, 0.06), Vector3(0, 6.92, -10.05), led)
	# warm practicals: pendant lamps over the benches, a key light on the dais
	for x in [-14.0, -7.0, 7.0, 14.0]:
		_seg(Vector3(x, H, 6.0), Vector3(x, 4.2, 6.0), 0.01, M.black)
		_cyl(0.3, 0.25, Vector3(x, 4.1, 6.0), M.black, self, 0.08)
		var l := SpotLight3D.new(); l.light_color = Color(1.0, 0.8, 0.55); l.light_energy = 5.0; l.spot_range = 7.0; l.spot_angle = 48.0; l.position = Vector3(x, 3.95, 6.0); l.rotation_degrees.x = -90; l.light_volumetric_fog_energy = 0.8; add_child(l)
	for x in [-16.0, -8.0, 8.0, 16.0]:   # amber wall washers under the gallery: the lab is a home, not a server room
		var w := SpotLight3D.new(); w.light_color = Color(1.0, 0.68, 0.38); w.light_energy = 7.0; w.spot_range = 9.0; w.spot_angle = 55.0
		w.position = Vector3(x, 6.6, -11.2); w.rotation_degrees.x = -70; w.light_volumetric_fog_energy = 1.0; add_child(w)
	var key := SpotLight3D.new(); key.light_color = Color(0.92, 0.95, 1.0); key.light_energy = 22.0; key.spot_range = 22.0; key.spot_angle = 18.0; key.shadow_enabled = true
	key.position = DAIS + Vector3(3.0, 14.0, 4.0); key.light_volumetric_fog_energy = 2.0; add_child(key); key.look_at(DAIS + Vector3(0, 1.2, 0))
	var rim := SpotLight3D.new(); rim.light_color = Color(0.3, 0.85, 0.8); rim.light_energy = 6.0; rim.spot_range = 16.0; rim.spot_angle = 30.0
	rim.position = DAIS + Vector3(-4.0, 6.0, -5.0); add_child(rim); rim.look_at(DAIS + Vector3(0, 1.5, 0))
	for f in [Vector3(-8, 6, 0), Vector3(8, 6, 0), Vector3(0, 6, 8), Vector3(0, 9, -8), Vector3(-14, 4, 6), Vector3(14, 4, 6)]:   # cool fill so the room reads
		var o := OmniLight3D.new(); o.light_color = Color(0.7, 0.82, 1.0); o.light_energy = 2.2; o.omni_range = 14.0; o.position = f; add_child(o)
	var rp := ReflectionProbe.new(); rp.size = Vector3(44, 20, 26); rp.position = Vector3(0, 10, 0); rp.box_projection = true; rp.interior = true; rp.update_mode = ReflectionProbe.UPDATE_ONCE; add_child(rp)

# ---- the rig: dais, gas cylinder with screw piston, coils, gauge, wheels, dewar of liquid N2O4, argon, fume hood -----------------------------------
func _build_rig() -> void:
	var d := DAIS
	# the dais: two stepped discs with an LED ring
	_cyl(4.2, 0.3, Vector3(d.x, 0.15, d.z), _paint(Color(0.16, 0.17, 0.19)), self, -1.0, 64)
	_cyl(3.2, 0.3, Vector3(d.x, 0.45, d.z), _paint(Color(0.2, 0.21, 0.23)), self, -1.0, 64)
	_torus(3.21, 0.02, Vector3(d.x, 0.6, d.z), _flat(Color.WHITE, 0, 0.4, Color(0.18, 0.77, 0.71), 5.0))
	_torus(4.21, 0.02, Vector3(d.x, 0.3, d.z), _flat(Color.WHITE, 0, 0.4, Color(0.18, 0.77, 0.71), 3.0))
	var n0 := get_child_count()
	# base plinth and the jacket: copper heating coil (glows with T) and a cooling coil (frosts when cold)
	var by := d.y
	_cyl(CR + 0.22, 0.35, Vector3(d.x, by + 0.175, d.z), M.steel, self, -1.0, 48)
	m_coil = _flat(Color(0.72, 0.42, 0.25), 1.0, 0.32, Color(1.0, 0.35, 0.08), 0.0)
	for i in 9: _torus(CR + 0.05, 0.022, Vector3(d.x, by + 0.42 + i * 0.055, d.z), m_coil)
	m_glass_frost = _shader("steel", {"albedo": Color(0.7, 0.85, 0.95), "metallic": 0.6, "rough_base": 0.2, "frost": 0.0, "frost_h": 2.0})
	for i in 6: _torus(CR + 0.05, 0.018, Vector3(d.x, by + 1.95 + i * 0.05, d.z), m_glass_frost)
	coil_light = OmniLight3D.new(); coil_light.light_color = Color(1.0, 0.45, 0.12); coil_light.light_energy = 0.0; coil_light.omni_range = 3.0; coil_light.position = Vector3(d.x, by + 0.6, d.z + CR + 0.3); add_child(coil_light)
	# the glass cylinder (thick borosilicate), the brown gas inside, the steel piston on a screw
	var gl := _cyl(CR, 2.4, Vector3(d.x, by + 0.35 + 1.2, d.z), M.glass, self, -1.0, 64); gl.name = "cylinder"
	m_gas = StandardMaterial3D.new(); m_gas.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; m_gas.albedo_color = Color(0.55, 0.24, 0.05, 0.5)
	m_gas.roughness = 1.0; m_gas.shading_mode = BaseMaterial3D.SHADING_MODE_PER_PIXEL; m_gas.cull_mode = BaseMaterial3D.CULL_DISABLED; m_gas.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_ALWAYS
	m_gas.render_priority = 10   # drawn after the refracting glass, which samples the screen before transparents
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
	# everything built since n0 moves under a pivot scaled about the dais centre (local positions stay as written)
	pivot = Node3D.new(); pivot.name = "rig"; add_child(pivot)
	pivot.transform = Transform3D(Basis.from_scale(Vector3.ONE * RIG_S), Vector3(d.x, 0, d.z) * (1.0 - RIG_S))
	var kids := get_children().slice(n0, get_child_count() - 1)
	for k in kids: remove_child(k); pivot.add_child(k)
	for r in ["wheel_v", "wheel_t", "gauge", "feed", "argon"]: anchors[r] = pivot.transform * anchors[r]; radius[r] = float(radius[r]) * RIG_S
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

# ---- glassware racks, benches, a tesla-style coil, cable trays: the lab is full ----------------------------------------------------------------
func _build_racks() -> void:
	var cols := [Color(0.25, 0.55, 1.0, 0.6), Color(0.95, 0.75, 0.15, 0.55), Color(0.2, 0.85, 0.5, 0.5), Color(0.9, 0.2, 0.5, 0.55), Color(0.9, 0.95, 1.0, 0.3), Color(0.6, 0.3, 0.9, 0.5)]
	var erl := PackedVector2Array([Vector2(0, 0), Vector2(0.075, 0), Vector2(0.08, 0.01), Vector2(0.03, 0.15), Vector2(0.022, 0.2), Vector2(0.025, 0.205)])
	var erl_l := PackedVector2Array([Vector2(0, 0.004), Vector2(0.071, 0.004), Vector2(0.075, 0.012), Vector2(0.05, 0.075), Vector2(0, 0.075)])
	var liq := []
	for c in cols: liq.append(_shader("liquid", {"col": c, "glow": 0.15}))
	# two tall racks against the side walls, five shelves of glassware each (MultiMesh-free but few: 6 per shelf)
	for side in [-1.0, 1.0]:
		var x0: float = side * 19.6
		for z in [-6.0, 0.0, 6.0]:
			_box(Vector3(0.6, 4.2, 3.6), Vector3(x0, 2.1, z), _paint(Color(0.1, 0.11, 0.12)))
			for k in 5:
				var y := 0.5 + k * 0.8
				_box(Vector3(0.62, 0.03, 3.6), Vector3(x0 - side * 0.02, y, z), M.glass)
				_box(Vector3(0.02, 0.02, 3.5), Vector3(x0 - side * 0.3, y + 0.75, z), _flat(Color.WHITE, 0, 0.4, Color(0.7, 0.85, 1.0), 2.0))
				for j in 6:
					var p := Vector3(x0 - side * 0.05, y + 0.015, z - 1.5 + j * 0.6)
					_lathe(erl_l, 16, liq[(k * 6 + j) % liq.size()], p)
					_lathe(erl, 16, M.glass, p)
	# benches in front with distillation glassware under the pendants
	for x in [-14.0, -7.0, 7.0, 14.0]:
		_box(Vector3(4.0, 0.06, 1.2), Vector3(x, 0.93, 6.0), _flat(Color(0.18, 0.19, 0.2), 0, 0.3))
		_box(Vector3(3.9, 0.88, 1.1), Vector3(x, 0.45, 6.0), _paint(Color(0.14, 0.15, 0.17)))
		var fp := Vector3(x - 0.8, 0.96, 6.0)
		_lathe(PackedVector2Array([Vector2(0.0, 0.0), Vector2(0.06, 0.0), Vector2(0.11, 0.03), Vector2(0.14, 0.09), Vector2(0.145, 0.15), Vector2(0.12, 0.22), Vector2(0.07, 0.27), Vector2(0.03, 0.3), Vector2(0.03, 0.42)]), 24, M.glass, fp)
		_lathe(PackedVector2Array([Vector2(0, 0.006), Vector2(0.055, 0.006), Vector2(0.105, 0.035), Vector2(0.133, 0.09), Vector2(0.137, 0.12), Vector2(0, 0.12)]), 24, liq[int(absf(x)) % liq.size()], fp)
		_cyl(0.16, 0.08, fp + Vector3(0, -0.02, 0), _flat(Color(0.2, 0.2, 0.2), 0.5, 0.4, Color(1.0, 0.3, 0.05), 0.6))   # hot plate
		_seg(fp + Vector3(0, 0.42, 0), fp + Vector3(1.2, 0.6, 0), 0.015, M.glass)                                          # condenser
		_seg(fp + Vector3(1.2, 0.6, 0), fp + Vector3(1.6, 0.2, 0), 0.012, M.glass)
		_lathe(erl, 16, M.glass, fp + Vector3(1.6, 0.0, 0))
		_seg(fp + Vector3(-0.3, 0, 0), fp + Vector3(-0.3, 0.8, 0), 0.006, M.steel)
	# a big coil and a glass column on the far side of the dais, for the sense of a working lab
	var cpos := Vector3(9.0, 0, -5.5)
	_cyl(0.6, 0.4, cpos + Vector3(0, 0.2, 0), M.steel_dull)
	for i in 40: _torus(0.42, 0.012, cpos + Vector3(0, 0.5 + i * 0.07, 0), M.brass)
	_cyl(0.38, 2.9, cpos + Vector3(0, 1.9, 0), _paint(Color(0.1, 0.1, 0.12)))
	_torus(0.5, 0.18, cpos + Vector3(0, 3.6, 0), M.steel)
	var col := Vector3(-9.0, 0, -6.0)
	_cyl(0.35, 6.0, col + Vector3(0, 3.0, 0), M.glass, self, -1.0, 32)
	for i in 12: _cyl(0.33, 0.03, col + Vector3(0, 0.6 + i * 0.45, 0), M.steel_dull, self, -1.0, 32)
	_lathe(PackedVector2Array([Vector2(0, 0), Vector2(0.33, 0), Vector2(0.33, 1.2), Vector2(0, 1.2)]), 32, _shader("liquid", {"col": Color(0.3, 0.75, 0.6, 0.35), "glow": 0.25}), col + Vector3(0, 0.1, 0))
	for y in [0.2, 6.2]: _cyl(0.42, 0.2, col + Vector3(0, y, 0), M.steel)
	# cable trays overhead
	for z in [-5.0, 5.0]: _box(Vector3(40, 0.08, 0.5), Vector3(0, 9.5, z), M.steel_dull)

# ---- live state ---------------------------------------------------------------------------------------------------------------------------------
func setup(role_ids: Dictionary) -> void:
	ids = role_ids
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
		argon_on = yar > 1e-4
		if P > 0.0 and T > 0.0:
			P_bar = P / 1e5
			var c := y * P / (R * T)
			if c_book <= 0.0: c_book = c if absf(T - 400.0) < 1.0 and absf(flask_V - V_BOOK) < 1e-6 and not argon_on else 0.0
			var ref := c_book if c_book > 0.0 else 260.0   # mol/m3 of NO2 in the notebook flask (alpha ~0.5 at 9.15 bar, 400 K) until the first book run is seen
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
	var h_to := clampf(GAS_H * flask_V / V_BOOK, 0.25, 2.2)
	_gas_h = lerpf(_gas_h, h_to, clampf(dt * 3.0, 0, 1))
	if gas:
		gas.scale = Vector3(1, _gas_h, 1); gas.position.y = DAIS.y + 0.37 + _gas_h * 0.5
		piston.position = Vector3(DAIS.x, DAIS.y + 0.37 + _gas_h + 0.06, DAIS.z)
		var a := 1.0 - exp(-1.1 * maxf(c_show, 0.0))   # absorbance across the cylinder ~ NO2 concentration (notebook flask = 1): 0.2 cold, 0.67 at 1, 0.79 after halving V, 0.89 at the instant of compression
		var col := Color(0.55, 0.36, 0.14).lerp(Color(0.16, 0.06, 0.015), clampf(a, 0.0, 1.0))
		m_gas.albedo_color = Color(col.r, col.g, col.b, clampf(a, 0.03, 0.97))   # NO2 brown: paler and thinner when it shifts to N2O4, deeper when NO2 rises
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
	_cam_step(dt)
	_ft_tick(dt)

# ---- wheels: drag to turn (left press on a wheel, drag sideways, release commits) ----------------------------------------------------------------
func _unhandled_input(e: InputEvent) -> void:
	if e is InputEventMouseButton and (e as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
		var mb := e as InputEventMouseButton
		if mb.pressed:
			var r := pick(mb.position)
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

func pick(p: Vector2) -> String:
	var r := super(p)
	return "flask" if r == "bench" else r

# ---- camera -------------------------------------------------------------------------------------------------------------------------------------
const L14_PRESETS := {
	"wide": [Vector3(0, 3.2, -2.0), 0.3, -0.07, 13.5],
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
