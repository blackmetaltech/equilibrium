class_name Scenery
extends Node3D
## Set dressing around the plot (design/equilibrium/UI.md, DESIGN §5.1-5.2): Kestrel Bay Works on a salt-flat coast. Salt pans with
## flamingos, the old rusted Works behind the plot (chimney, tanks, cooling tower) that comes back to life chapter by chapter, the QC lab
## with Mara's cat on the roof (Cute mode; it hides during alarms), a sulfur ship at the jetty and gulls. Also owns the time-of-day light:
## EQUILIBRIUM is daylight-to-dusk (the night belongs to GRID). Nothing here is physics; it never reads engine numbers.
## Use: var s := Scenery.new(); world.add_child(s); s.set_hour(17.5); s.set_revived(chapters_done); s.set_alarm(bool); s.set_cute(bool)

const LAND := Vector2(84.0, 60.0)
const RUST := Color("#6E4632")
const RUST_DARK := Color("#4A3226")
const SALT := Color("#E9DCD3")
const BRINE := Color("#C9A3A0")
const DYKE := Color("#8C7A62")

var _rng := RandomNumberGenerator.new()
var _flamingos: Array[Node3D] = []
var _gulls: Array[Node3D] = []
var _revive: Array = []            # [{node: MeshInstance3D windows, light: OmniLight3D, chapter}]
var _cat: Node3D
var _cat_home := Vector3.ZERO
var _alarm := false
var _t := 0.0
var _hour := 17.5

func _ready() -> void:
	_rng.seed = 7041
	_build_salt_pans()
	_build_old_works()
	_build_qc_lab()
	_build_ship()
	_build_gulls()
	set_hour(_hour)

# ------------------------------------------------------------------ helpers
static func _mat(c: Color, rough := 0.9, metal := 0.0) -> StandardMaterial3D:
	var m := StandardMaterial3D.new(); m.albedo_color = c; m.roughness = rough; m.metallic = metal
	return m

func _box(size: Vector3, pos: Vector3, mat: Material, parent: Node = self, shadow := true) -> MeshInstance3D:
	var bm := BoxMesh.new(); bm.size = size
	var mi := MeshInstance3D.new(); mi.mesh = bm; mi.position = pos; mi.material_override = mat
	if not shadow: mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mi)
	return mi

func _cyl(r_top: float, r_bot: float, h: float, pos: Vector3, mat: Material, parent: Node = self, seg := 20) -> MeshInstance3D:
	var cm := CylinderMesh.new(); cm.top_radius = r_top; cm.bottom_radius = r_bot; cm.height = h; cm.radial_segments = seg
	var mi := MeshInstance3D.new(); mi.mesh = cm; mi.position = pos; mi.material_override = mat
	parent.add_child(mi)
	return mi

func _sphere(r: float, pos: Vector3, mat: Material, parent: Node = self, sy := 1.0) -> MeshInstance3D:
	var sm := SphereMesh.new(); sm.radius = r; sm.height = r * 2.0 * sy; sm.radial_segments = 16; sm.rings = 8
	var mi := MeshInstance3D.new(); mi.mesh = sm; mi.position = pos; mi.material_override = mat
	parent.add_child(mi)
	return mi

# ------------------------------------------------------------------ salt pans + flamingos (−x side, in the shallows)
func _build_salt_pans() -> void:
	var dyke := _mat(DYKE, 1.0)
	var x0 := -LAND.x * 0.5 - 2.0
	for i in range(4):
		for j in range(5):
			var w := 14.0; var d := 11.0
			var c := Vector3(x0 - 8.0 - i * (w + 1.2), -0.82, -24.0 + j * (d + 1.2))
			var tint := SALT.lerp(BRINE, float((i * 3 + j * 2) % 5) / 5.0)
			var pan := _mat(tint, 0.25, 0.0)
			_box(Vector3(w, 0.06, d), c, pan, self, false)
			_box(Vector3(w + 1.2, 0.35, 0.6), c + Vector3(0, 0.1, d * 0.5 + 0.3), dyke)
			_box(Vector3(0.6, 0.35, d + 1.2), c + Vector3(w * 0.5 + 0.3, 0.1, 0), dyke)
	var pink := _mat(Color("#F28AB2"), 0.7)
	var leg := _mat(Color("#C25E86"), 0.8)
	for k in range(9):
		var f := Node3D.new(); add_child(f)
		f.position = Vector3(x0 - 12.0 - _rng.randf() * 52.0, -0.8, -26.0 + _rng.randf() * 56.0)
		f.rotation.y = _rng.randf() * TAU
		_cyl(0.03, 0.03, 1.0, Vector3(0, 0.5, 0), leg, f, 6)
		_sphere(0.32, Vector3(0, 1.15, 0), pink, f, 0.75)
		_cyl(0.05, 0.06, 0.6, Vector3(0.18, 1.45, 0), pink, f, 6).rotation.z = -0.5
		_sphere(0.09, Vector3(0.32, 1.72, 0), pink, f)
		_flamingos.append(f)

# ------------------------------------------------------------------ the old Works (behind the plot, −z), dark until revived
func _build_old_works() -> void:
	_box(Vector3(LAND.x + 40.0, 3.0, 40.0), Vector3(0, -1.5, -LAND.y * 0.5 - 20.0), _mat(Color("#8A7F6C"), 1.0))
	var rust := _mat(RUST, 0.95, 0.2)
	var rust_d := _mat(RUST_DARK, 0.95, 0.2)
	var z := -LAND.y * 0.5 - 14.0
	# tank row
	for i in range(4):
		var p := Vector3(-34.0 + i * 9.0, 0.0, z - 4.0)
		_cyl(3.4, 3.4, 7.0, p + Vector3(0, 3.5, 0), rust if i % 2 == 0 else rust_d)
		_cyl(3.5, 3.5, 0.3, p + Vector3(0, 7.1, 0), rust_d)
		_add_revive(p + Vector3(0, 7.6, 0), 1 + i % 3)
	# the big chimney with bands
	var cp := Vector3(10.0, 0.0, z - 10.0)
	_cyl(1.3, 2.2, 38.0, cp + Vector3(0, 19.0, 0), rust)
	for k in range(3): _cyl(1.55 - k * 0.05, 1.6 - k * 0.05, 1.2, cp + Vector3(0, 30.0 + k * 3.0, 0), _mat(Color("#B33A2E"), 0.9))
	_add_revive(cp + Vector3(0, 38.5, 0), 2)
	# cooling tower (hyperbolic shell approximated by two frusta)
	var tp := Vector3(32.0, 0.0, z - 8.0)
	var conc := _mat(Color("#7B776E"), 1.0)
	_cyl(7.0, 9.0, 12.0, tp + Vector3(0, 6.0, 0), conc, self, 28)
	_cyl(8.0, 7.0, 8.0, tp + Vector3(0, 16.0, 0), conc, self, 28)
	_add_revive(tp + Vector3(0, 20.5, 0), 3)
	# a dead pipe rack linking them
	var steel := _mat(Color("#4E4A44"), 0.8, 0.5)
	for i in range(10):
		var x := -30.0 + i * 7.0
		_box(Vector3(0.4, 5.0, 0.4), Vector3(x, 2.5, z + 6.0), steel)
	_box(Vector3(66.0, 0.3, 1.6), Vector3(4.5, 5.0, z + 6.0), steel)
	for k in range(3): _cyl(0.35, 0.35, 66.0, Vector3(4.5, 5.5, z + 5.5 + k * 0.5), rust_d).rotation.z = PI * 0.5

## A revivable lamp/window cluster: dark now, warm once its chapter is done.
func _add_revive(pos: Vector3, chapter: int) -> void:
	var m := StandardMaterial3D.new(); m.albedo_color = Color("#1A1A1A"); m.emission_enabled = true; m.emission = Color("#FFC27A"); m.emission_energy_multiplier = 0.0
	var mi := _box(Vector3(1.2, 0.5, 1.2), pos, m, self, false)
	var l := OmniLight3D.new(); l.light_color = Color("#FFC27A"); l.light_energy = 0.0; l.omni_range = 14.0; l.position = pos; add_child(l)
	_revive.append({"mat": m, "light": l, "chapter": chapter})

func set_revived(chapters_done: int) -> void:
	for r in _revive:
		var on: bool = chapters_done >= int(r.chapter)
		(r.mat as StandardMaterial3D).emission_energy_multiplier = 4.0 if on else 0.0
		(r.light as OmniLight3D).light_energy = 1.6 if on else 0.0

# ------------------------------------------------------------------ QC lab (lit) + the cat
func _build_qc_lab() -> void:
	var p := Vector3(-33.0, 0.0, 21.0)
	var wall := _mat(Color("#D9D2C0"), 0.9)
	_box(Vector3(9.0, 4.0, 6.0), p + Vector3(0, 2.0, 0), wall)
	_box(Vector3(9.6, 0.35, 6.6), p + Vector3(0, 4.15, 0), _mat(Color("#3E635C"), 0.8))
	var win := StandardMaterial3D.new(); win.albedo_color = Color("#FFE2A8"); win.emission_enabled = true; win.emission = Color("#FFD48A"); win.emission_energy_multiplier = 1.6
	for i in range(3): _box(Vector3(1.6, 1.1, 0.08), p + Vector3(-3.0 + i * 3.0, 2.3, 3.02), win, self, false)
	_box(Vector3(1.2, 2.2, 0.08), p + Vector3(3.6, 1.1, -3.02), _mat(Color("#2C4A45"), 0.7))
	# fume-hood stack
	_cyl(0.25, 0.25, 2.0, p + Vector3(2.8, 5.2, -1.5), _mat(Color("#8E98A6"), 0.4, 0.8))
	# the cat (black, sitting on the roof edge)
	_cat = Node3D.new(); add_child(_cat)
	_cat_home = p + Vector3(-2.5, 4.35, 2.4)
	_cat.position = _cat_home
	var fur := _mat(Color("#1E1C1F"), 0.9)
	_sphere(0.32, Vector3(0, 0.3, 0), fur, _cat, 1.2)
	_sphere(0.22, Vector3(0, 0.78, 0.06), fur, _cat)
	for s in [-1, 1]:
		var ear := _cyl(0.0, 0.08, 0.18, Vector3(s * 0.11, 0.98, 0.06), fur, _cat, 4)
		ear.rotation.z = s * -0.25
		var eye := StandardMaterial3D.new(); eye.albedo_color = Color("#E6D35A"); eye.emission_enabled = true; eye.emission = Color("#E6D35A"); eye.emission_energy_multiplier = 1.5
		_sphere(0.04, Vector3(s * 0.08, 0.8, 0.25), eye, _cat)
	var tail := _cyl(0.04, 0.04, 0.6, Vector3(-0.25, 0.15, -0.15), fur, _cat, 6)
	tail.rotation.z = 1.2

func set_cute(on: bool) -> void:
	if _cat: _cat.visible = on
	for f in _flamingos: f.visible = on

func set_alarm(on: bool) -> void: _alarm = on

# ------------------------------------------------------------------ ship + gulls
func _build_ship() -> void:
	var hull := _mat(Color("#2E3B4E"), 0.6, 0.3)
	var p := Vector3(LAND.x * 0.5 + 18.0, -0.6, -19.0)
	_box(Vector3(30.0, 3.0, 7.0), p + Vector3(0, 0.6, 0), hull)
	_box(Vector3(30.2, 0.4, 7.2), p + Vector3(0, 2.0, 0), _mat(Color("#8C2F2A"), 0.7))
	_box(Vector3(6.0, 4.5, 6.0), p + Vector3(11.0, 4.3, 0), _mat(Color("#E7E3D8"), 0.8))
	var sulfur := _mat(Color("#E8D44D"), 1.0)
	for i in range(2):
		var pile := _cyl(0.4, 3.0, 2.2, p + Vector3(-8.0 + i * 8.0, 3.2, 0), sulfur, self, 12)
		pile.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF

func _build_gulls() -> void:
	var white := _mat(Color("#F2F2EE"), 0.7)
	for i in range(5):
		var g := Node3D.new(); add_child(g)
		for s in [-1, 1]:
			var w := _box(Vector3(0.9, 0.05, 0.25), Vector3(s * 0.4, 0, 0), white, g, false)
			w.rotation.z = s * 0.35
		g.set_meta("r", 10.0 + i * 3.0); g.set_meta("ph", i * 1.3); g.set_meta("h", 14.0 + i * 1.5)
		_gulls.append(g)

func _process(dt: float) -> void:
	_t += dt
	var centre := Vector3(LAND.x * 0.5 + 12.0, 0, -14.0)
	for g in _gulls:
		var a := _t * 0.25 + float(g.get_meta("ph"))
		var r := float(g.get_meta("r"))
		g.position = centre + Vector3(cos(a) * r, float(g.get_meta("h")) + sin(_t * 1.1 + a) * 0.6, sin(a) * r)
		g.rotation.y = -a
	for i in range(_flamingos.size()):   # slow wade
		_flamingos[i].rotation.y += dt * 0.05 * (1 if i % 2 == 0 else -1)
	if _cat:   # hides behind the fume-hood stack during alarms, comes back when it clears
		var target := _cat_home + (Vector3(4.6, 0, -3.6) if _alarm else Vector3.ZERO)
		_cat.position = _cat.position.lerp(target, clampf(dt * 2.0, 0.0, 1.0))

# ------------------------------------------------------------------ time of day (daylight → dusk; never full night)
## hour 6..21. Finds the world's WorldEnvironment and DirectionalLight3D (siblings under the same parent).
func set_hour(h: float) -> void:
	_hour = h
	var p := get_parent()
	if p == null: return
	var env: Environment = null; var sun: DirectionalLight3D = null
	for c in p.get_children():
		if c is WorldEnvironment: env = (c as WorldEnvironment).environment
		elif c is DirectionalLight3D and sun == null: sun = c
	var keys := [   # hour, sky top, horizon, sun colour, sun energy, ambient, sun pitch
		[6.0, Color("#3A4F7A"), Color("#F2B48C"), Color("#FFC9A0"), 0.8, Color("#5A6680"), -12.0],
		[10.0, Color("#6FA3D6"), Color("#E3ECEF"), Color("#FFF4E2"), 1.25, Color("#8796A8"), -50.0],
		[15.0, Color("#6E9FD0"), Color("#E8E6DC"), Color("#FFEFD6"), 1.2, Color("#8A94A0"), -42.0],
		[18.0, Color("#41598A"), Color("#F4A261"), Color("#FFB37A"), 0.95, Color("#6E6A80"), -16.0],
		[21.0, Color("#16213E"), Color("#7A4A3A"), Color("#FF9A6A"), 0.35, Color("#3A4260"), -6.0],
	]
	var a: Array = keys[0]; var b: Array = keys[keys.size() - 1]
	for i in range(keys.size() - 1):
		if h >= float(keys[i][0]) and h <= float(keys[i + 1][0]): a = keys[i]; b = keys[i + 1]; break
	var t := 0.0 if b == a else clampf((h - float(a[0])) / (float(b[0]) - float(a[0])), 0.0, 1.0)
	if env:
		if env.sky and env.sky.sky_material is ProceduralSkyMaterial:
			var sm: ProceduralSkyMaterial = env.sky.sky_material
			sm.sky_top_color = (a[1] as Color).lerp(b[1], t); sm.sky_horizon_color = (a[2] as Color).lerp(b[2], t)
			sm.ground_horizon_color = sm.sky_horizon_color.darkened(0.35); sm.ground_bottom_color = Color("#1B2A33")
		env.ambient_light_color = (a[5] as Color).lerp(b[5], t); env.ambient_light_energy = 1.0
	if sun:
		sun.light_color = (a[3] as Color).lerp(b[3], t); sun.light_energy = lerpf(float(a[4]), float(b[4]), t)
		sun.rotation_degrees = Vector3(lerpf(float(a[6]), float(b[6]), t), -35.0, 0.0)
	# the sea and the plot lamps follow: lamps glow only toward dusk
	for c in p.get_children():
		if c is OmniLight3D and c.get_parent() == p: (c as OmniLight3D).light_energy = 2.6 * clampf((h - 17.0) / 3.0, 0.0, 1.0)
		if c is MeshInstance3D and (c as MeshInstance3D).mesh is PlaneMesh and ((c as MeshInstance3D).mesh as PlaneMesh).size.x > 1000.0:
			var sea: StandardMaterial3D = (c as MeshInstance3D).material_override
			if sea: sea.albedo_color = Color("#2B5F78").lerp(Color("#0E2236"), clampf((h - 16.0) / 5.0, 0.0, 1.0))
