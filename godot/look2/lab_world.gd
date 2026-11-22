class_name LabWorld
extends Node3D
## LOOK2 slice world (docs/LOOK2.md): the genius's process hall at 02:40 with the ammonia loop of L00 at pilot scale, a lab bench in front, and the
## plant at night through a glass wall. Procedural geometry, CC0 textures (docs/ASSETS.md) and the shaders in look2/shaders. It reads the engine
## snapshot only and never calls an engine action. World units are metres; the hall spans x -30..30, z -15..15, y 0..18; the glass wall is z = -15.
signal picked(role: String)
var app
var ids := {}
var cam: Camera3D
var tier := "ultra"
var env: Environment

# ---- camera rig ----
var focus := Vector3(0, 3.5, -2); var yaw := 0.0; var pitch := -0.22; var dist := 30.0
var t_focus := focus; var t_yaw := yaw; var t_pitch := pitch; var t_dist := dist
const HALL_MIN := Vector3(-28.8, 0.35, -13.3)   # inside the crane columns (z = +-14.3) and the end walls
const HALL_MAX := Vector3(28.8, 15.5, 13.3)
var _drag := 0          ## 0 none, 1 orbit, 2 pan
var _drag_moved := 0.0
var xray := false

# ---- live state (eased) ----
var anchors := {}       ## role -> Vector3 (HUD anchor)
var radius := {}        ## role -> m (pick radius)
var streams := {}       ## role key -> stream id: conv_out, liq, purge, cool_out
var _nh3_i := -1
var _T0 := 0.0          ## converter outlet at the start of the shift (K)
var heat := 0.0; var heat_to := 0.0
var cw_on := 1.0; var cw_to := 1.0
var flare := 0.15; var flare_to := 0.15
var level := 0.55; var level_to := 0.55; var _liq0 := 0.0
var pink := 0.0; var pink_to := 0.0
var run := 1.0; var run_to := 1.0
var alarm := 0          ## 0 none, 2 high, 3 critical/tripped
var tripped := false

# ---- nodes driven by state ----
var m_shell: ShaderMaterial; var m_shell_x: ShaderMaterial; var m_beds: ShaderMaterial; var m_sep: ShaderMaterial; var m_sight: ShaderMaterial
var m_shimmer: ShaderMaterial; var m_liquid_pink: ShaderMaterial; var m_flare: ShaderMaterial; var m_peep: ShaderMaterial; var m_cw_ret: ShaderMaterial
var shell_node: MeshInstance3D; var shell_x_node: MeshInstance3D; var shimmer_node: MeshInstance3D
var comp_body: Node3D; var comp_shaft: Node3D; var pump_body: Node3D; var pump_shaft: Node3D
var flare_light: OmniLight3D; var flare_flame: MeshInstance3D; var conv_light: OmniLight3D; var heater_light: OmniLight3D
var steam_cw: GPUParticles3D; var tower_plumes: Array[GPUParticles3D] = []; var flare_smoke: GPUParticles3D; var bubbles: GPUParticles3D
var beacons: Array[SpotLight3D] = []; var beacon_mats: Array[StandardMaterial3D] = []
var gauge_mats: Array[ShaderMaterial] = []
var _t := 0.0

# ---------------------------------------------------------------------------------------------------------------------------------------------
func _ready() -> void:
	_build_env(); _build_hall(); _build_loop(); _build_bench(); _build_outside()
	cam = Camera3D.new(); cam.fov = 50.0; cam.near = 0.05; cam.far = 3000.0; add_child(cam)
	set_camera("wide"); _snap_cam()
	if OS.get_environment("CB_FRAMETIME") == "1": _ft_start()

func setup(role_ids: Dictionary) -> void:
	ids = role_ids
	var p = app.b.q("plant") if app != null and app.b != null else null
	if not (p is Dictionary): return
	var sp: Array = p.get("species", [])
	_nh3_i = sp.find("NH3")
	for s in p.get("streams", []):
		var fu := str(s.get("from", {}).get("unit", "")); var tu := str(s.get("to", {}).get("unit", "")); var fp := str(s.get("from", {}).get("port", ""))
		if fu == str(ids.get("converter", "-")): streams["conv_out"] = str(s.id)
		if fu == str(ids.get("cooler", "-")): streams["cool_out"] = str(s.id)
		if fu == str(ids.get("separator", "-")) and fp == "liq": streams["liq"] = str(s.id)
		if tu == str(ids.get("flare", "-")): streams["purge"] = str(s.id)

func make_current() -> void: cam.make_current()

func set_quality(t: String) -> void:
	tier = t
	if env == null: return
	var ultra := t == "ultra"; var compat := t == "compat"
	env.sdfgi_enabled = ultra
	env.ssr_enabled = ultra
	env.ssil_enabled = ultra
	env.ssao_enabled = not compat
	env.volumetric_fog_enabled = not compat
	env.fog_enabled = compat or t == "high"
	env.glow_enabled = true
	var attrs := cam.attributes if cam != null else null
	if attrs is CameraAttributesPractical: (attrs as CameraAttributesPractical).dof_blur_far_enabled = ultra
	for n in [steam_cw, flare_smoke, bubbles] + tower_plumes:
		if n != null: n.amount_ratio = 1.0 if ultra else (0.5 if t == "high" else 0.3)

# ---- materials -------------------------------------------------------------------------------------------------------------------------------
const TEX := "res://look2/assets/tex/"
func _tex(n: String) -> Texture2D: return load(TEX + n + ".jpg") as Texture2D
func _pbr(n: String, uv := 0.25, tint := Color.WHITE, metal := false, tri := true) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_texture = _tex(n + "_diff"); m.albedo_color = tint
	m.normal_enabled = true; m.normal_texture = _tex(n + "_nor")
	m.roughness_texture = _tex(n + "_rough"); m.roughness = 1.0
	if metal: m.metallic_texture = _tex(n + "_metal"); m.metallic = 1.0
	m.uv1_triplanar = tri; m.uv1_scale = Vector3.ONE * uv; m.uv1_world_triplanar = tri
	m.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
	return m
func _paint(c: Color) -> StandardMaterial3D:   ## painted carbon steel: the plate's normal and roughness for wear, a flat paint colour
	var m := _pbr("metal_plate", 0.6, c); m.albedo_texture = null; m.metallic = 0.15; return m
func _flat(c: Color, metal := 0.0, rough := 0.6, emit := Color.BLACK, e := 0.0) -> StandardMaterial3D:
	var m := StandardMaterial3D.new(); m.albedo_color = c; m.metallic = metal; m.roughness = rough
	if e > 0.0: m.emission_enabled = true; m.emission = emit; m.emission_energy_multiplier = e
	return m
func _shader(path: String, params := {}) -> ShaderMaterial:
	var m := ShaderMaterial.new(); m.shader = load("res://look2/shaders/" + path + ".gdshader")
	for k in params: m.set_shader_parameter(k, params[k])
	return m
var M := {}
func _mats() -> void:
	M.steel = _shader("steel", {"rough_base": 0.34, "metallic": 0.8})
	M.steel_dull = _shader("steel", {"rough_base": 0.45, "albedo": Color(0.62, 0.64, 0.66)})
	M.clad = _flat(Color(0.78, 0.8, 0.82), 0.6, 0.42)                       # aluminium jacketing on insulated lines
	M.paint_green = _paint(Color(0.36, 0.5, 0.42))
	M.paint_blue = _paint(Color(0.25, 0.38, 0.6))
	M.paint_grey = _paint(Color(0.55, 0.56, 0.56))
	M.yellow = _flat(Color(0.95, 0.72, 0.08), 0.2, 0.5)
	M.red = _flat(Color(0.72, 0.08, 0.06), 0.2, 0.45)
	M.black = _flat(Color(0.05, 0.05, 0.055), 0.5, 0.5)
	M.plate = _pbr("metal_plate", 0.5, Color(0.8, 0.8, 0.8), true)
	M.wall = _pbr("concrete_slab_wall", 0.12, Color(0.78, 0.77, 0.75))
	M.rust = _pbr("rusty_metal_02", 0.2)
	M.corr = _pbr("corrugated_iron", 0.25, Color(0.55, 0.58, 0.6), true)
	M.glass = _shader("glass", {"tint": Color(0.75, 0.86, 0.92, 0.07)})
	M.brass = _flat(Color(0.78, 0.6, 0.3), 1.0, 0.3)
	M.concrete_out = _pbr("concrete_floor_worn_02", 0.06, Color(0.42, 0.42, 0.43))

# ---- primitives ------------------------------------------------------------------------------------------------------------------------------
func _mi(mesh: Mesh, pos: Vector3, mat: Material, parent: Node = self) -> MeshInstance3D:
	var n := MeshInstance3D.new(); n.mesh = mesh; n.position = pos; n.material_override = mat; parent.add_child(n); return n
func _box(size: Vector3, pos: Vector3, mat: Material, parent: Node = self) -> MeshInstance3D:
	var b := BoxMesh.new(); b.size = size; return _mi(b, pos, mat, parent)
func _cyl(r: float, h: float, pos: Vector3, mat: Material, parent: Node = self, top := -1.0, seg := 32) -> MeshInstance3D:
	var c := CylinderMesh.new(); c.bottom_radius = r; c.top_radius = r if top < 0.0 else top; c.height = h; c.radial_segments = seg; c.rings = 1
	return _mi(c, pos, mat, parent)
func _sph(r: float, pos: Vector3, mat: Material, parent: Node = self, hemi := false) -> MeshInstance3D:
	var s := SphereMesh.new(); s.radius = r; s.height = r * (1.0 if hemi else 2.0); s.is_hemisphere = hemi; s.radial_segments = 32; s.rings = 12
	return _mi(s, pos, mat, parent)
func _torus(r: float, t: float, pos: Vector3, mat: Material, parent: Node = self) -> MeshInstance3D:
	var o := TorusMesh.new(); o.inner_radius = r - t; o.outer_radius = r + t; o.rings = 48; o.ring_segments = 8
	return _mi(o, pos, mat, parent)
## A cylinder from a to b (pipes, struts, rails).
func _seg(a: Vector3, b: Vector3, r: float, mat: Material, parent: Node = self, seg := 16) -> MeshInstance3D:
	var c := CylinderMesh.new(); c.top_radius = r; c.bottom_radius = r; c.height = a.distance_to(b); c.radial_segments = seg; c.rings = 1
	var n := MeshInstance3D.new(); n.mesh = c; n.material_override = mat; parent.add_child(n)
	var d := (b - a).normalized()
	var up := Vector3.UP if absf(d.dot(Vector3.UP)) < 0.99 else Vector3.RIGHT
	var x := up.cross(d).normalized(); var z := x.cross(d).normalized()
	n.transform = Transform3D(Basis(x, d, z), (a + b) * 0.5)
	return n
## A flange pair with a bolt ring at p along direction d.
func _flange(p: Vector3, d: Vector3, r: float, parent: Node = self) -> void:
	var f := _seg(p - d * 0.04, p + d * 0.04, r * 1.75, M.steel_dull, parent, 24)
	var n := 8 if r < 0.12 else 12
	var up := Vector3.UP if absf(d.dot(Vector3.UP)) < 0.99 else Vector3.RIGHT
	var x := up.cross(d).normalized(); var y := d.cross(x).normalized()
	for i in n:
		var a := TAU * i / n
		var q := p + (x * cos(a) + y * sin(a)) * r * 1.45
		_seg(q - d * 0.07, q + d * 0.07, r * 0.09 + 0.006, M.black, parent, 6)
	f.name = "flange"
## A pipe run through points: straight cylinders, elbow spheres, flanges at the ends and every ~6 m; `clad` jackets it as insulated.
func _pipe(pts: Array, r: float, mat: Material = null, parent: Node = self, flanges := true) -> void:
	var m: Material = mat if mat != null else M.clad
	for i in pts.size() - 1:
		var a: Vector3 = pts[i]; var b: Vector3 = pts[i + 1]
		_seg(a, b, r, m, parent)
		if flanges:
			var L := a.distance_to(b); var d := (b - a).normalized()
			var k := int(L / 6.0)
			for j in range(1, k + 1): _flange(a + d * (L * j / (k + 1)), d, r, parent)
		if i > 0: _sph(r * 1.02, a, m, parent)
	if flanges and pts.size() > 1:
		_flange((pts[0] as Vector3).lerp(pts[1], 0.0) + ((pts[1] as Vector3) - (pts[0] as Vector3)).normalized() * 0.15, ((pts[1] as Vector3) - (pts[0] as Vector3)).normalized(), r, parent)
		var e: Vector3 = pts[pts.size() - 1]; var e2: Vector3 = pts[pts.size() - 2]
		_flange(e - (e - e2).normalized() * 0.15, (e - e2).normalized(), r, parent)
## A lathe (surface of revolution) from (radius, height) pairs.
func _lathe(prof: PackedVector2Array, seg: int, mat: Material, pos: Vector3, parent: Node = self, smooth := true) -> MeshInstance3D:
	var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	if smooth: st.set_smooth_group(0)
	for i in prof.size() - 1:
		for s in seg:
			var a0 := TAU * s / seg; var a1 := TAU * (s + 1) / seg
			var p00 := Vector3(prof[i].x * cos(a0), prof[i].y, prof[i].x * sin(a0)); var p01 := Vector3(prof[i].x * cos(a1), prof[i].y, prof[i].x * sin(a1))
			var p10 := Vector3(prof[i + 1].x * cos(a0), prof[i + 1].y, prof[i + 1].x * sin(a0)); var p11 := Vector3(prof[i + 1].x * cos(a1), prof[i + 1].y, prof[i + 1].x * sin(a1))
			st.set_uv(Vector2(float(s) / seg, prof[i].y)); st.add_vertex(p00); st.set_uv(Vector2(float(s) / seg, prof[i + 1].y)); st.add_vertex(p10); st.set_uv(Vector2(float(s + 1) / seg, prof[i + 1].y)); st.add_vertex(p11)
			st.set_uv(Vector2(float(s) / seg, prof[i].y)); st.add_vertex(p00); st.set_uv(Vector2(float(s + 1) / seg, prof[i + 1].y)); st.add_vertex(p11); st.set_uv(Vector2(float(s + 1) / seg, prof[i].y)); st.add_vertex(p01)
	st.generate_normals(); st.generate_tangents()
	return _mi(st.commit(), pos, mat, parent)
func _gauge(pos: Vector3, facing: Vector3, parent: Node = self, val := 0.6, r := 0.11) -> ShaderMaterial:
	var g := Node3D.new(); parent.add_child(g); g.position = pos
	g.look_at_from_position(pos, pos + facing, Vector3.UP)
	var bez := _seg(Vector3(0, 0, 0.0), Vector3(0, 0, -0.06), r, M.steel, g, 32)
	var gm := _shader("gauge", {"value": val})
	var face := CylinderMesh.new(); face.top_radius = r * 0.88; face.bottom_radius = r * 0.88; face.height = 0.004; face.radial_segments = 32
	var fn := _mi(face, Vector3(0, 0, -0.062), gm, g); fn.rotation_degrees.x = 90
	var gl := _mi(face.duplicate(), Vector3(0, 0, -0.068), M.glass, g); gl.rotation_degrees.x = 90
	_seg(Vector3(0, -r, 0.03), Vector3(0, -r - 0.18, 0.03), 0.012, M.steel, g, 8)
	bez.name = "bezel"; gauge_mats.append(gm)
	return gm
func _particles(pos: Vector3, amount: int, life: float, vel: Vector3, spread: float, size: float, col: Color, parent: Node = self, grow := 3.0) -> GPUParticles3D:
	var p := GPUParticles3D.new(); p.amount = amount; p.lifetime = life; p.position = pos; p.visibility_aabb = AABB(Vector3(-40, -5, -40), Vector3(80, 80, 80))
	var pm := ParticleProcessMaterial.new(); pm.direction = vel.normalized(); pm.spread = spread; pm.initial_velocity_min = vel.length() * 0.6; pm.initial_velocity_max = vel.length()
	pm.gravity = Vector3(0.25, 0.35, 0.0); pm.damping_min = 0.2; pm.damping_max = 0.6
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE; pm.emission_sphere_radius = size * 0.4
	var sc := Curve.new(); sc.add_point(Vector2(0, 0.35)); sc.add_point(Vector2(1, grow)); var sct := CurveTexture.new(); sct.curve = sc; pm.scale_curve = sct
	var gr := Gradient.new(); gr.set_color(0, Color(col, 0.0)); gr.set_color(1, Color(col, 0.0)); gr.add_point(0.15, col); gr.add_point(0.6, Color(col, col.a * 0.5))
	var gt := GradientTexture1D.new(); gt.gradient = gr; pm.color_ramp = gt
	pm.angle_min = 0; pm.angle_max = 360
	p.process_material = pm
	var q := QuadMesh.new(); q.size = Vector2.ONE * size
	var m := StandardMaterial3D.new(); m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; m.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	m.vertex_color_use_as_albedo = true; m.shading_mode = BaseMaterial3D.SHADING_MODE_PER_PIXEL; m.roughness = 1.0; m.proximity_fade_enabled = true; m.proximity_fade_distance = 1.0
	var rad := GradientTexture2D.new(); rad.fill = GradientTexture2D.FILL_RADIAL; rad.fill_from = Vector2(0.5, 0.5); rad.fill_to = Vector2(1.0, 0.5)
	var rg := Gradient.new(); rg.set_color(0, Color(1, 1, 1, 1)); rg.set_color(1, Color(1, 1, 1, 0)); rg.add_point(0.45, Color(1, 1, 1, 0.55)); rad.gradient = rg; rad.width = 64; rad.height = 64
	m.albedo_texture = rad; q.material = m; p.draw_pass_1 = q
	parent.add_child(p); return p

# ---- environment -----------------------------------------------------------------------------------------------------------------------------
func _build_env() -> void:
	_mats()
	env = Environment.new()
	var sky := Sky.new(); var pano := PanoramaSkyMaterial.new(); pano.panorama = load("res://look2/assets/dikhololo_night_1k.hdr"); pano.energy_multiplier = 0.22; sky.sky_material = pano
	env.background_mode = Environment.BG_SKY; env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY; env.ambient_light_energy = 0.35; env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	env.tonemap_mode = Environment.TONE_MAPPER_ACES; env.tonemap_exposure = 1.05; env.tonemap_white = 6.0
	env.glow_enabled = true; env.glow_intensity = 0.55; env.glow_bloom = 0.06; env.glow_hdr_threshold = 1.1; env.glow_blend_mode = Environment.GLOW_BLEND_MODE_SOFTLIGHT
	env.ssao_enabled = true; env.ssao_radius = 1.4; env.ssao_intensity = 2.2
	env.ssr_enabled = true; env.ssr_max_steps = 96; env.ssr_fade_in = 0.1; env.ssr_fade_out = 2.5
	env.ssil_enabled = true
	env.sdfgi_enabled = true; env.sdfgi_use_occlusion = true; env.sdfgi_energy = 0.9; env.sdfgi_cascades = 4; env.sdfgi_min_cell_size = 0.15
	env.volumetric_fog_enabled = true; env.volumetric_fog_density = 0.0025; env.volumetric_fog_albedo = Color(0.82, 0.8, 0.78); env.volumetric_fog_emission = Color(0.0, 0.0, 0.0)
	env.volumetric_fog_anisotropy = 0.55; env.volumetric_fog_length = 90.0; env.volumetric_fog_sky_affect = 0.15
	env.fog_light_color = Color(0.2, 0.2, 0.24); env.fog_density = 0.004
	env.adjustment_enabled = true; env.adjustment_contrast = 1.08; env.adjustment_saturation = 1.05
	if OS.get_environment("CB_L2DBG") == "1": env.tonemap_exposure = 6.0; env.volumetric_fog_enabled = false; env.glow_enabled = false; env.ssao_enabled = false; env.sdfgi_enabled = false; env.ssr_enabled = false
	var we := WorldEnvironment.new(); we.environment = env; add_child(we)
	var moon := DirectionalLight3D.new(); moon.light_color = Color(0.55, 0.65, 0.9); moon.light_energy = 0.35; moon.shadow_enabled = true; moon.rotation_degrees = Vector3(-38, 200, 0)
	moon.directional_shadow_max_distance = 120.0; moon.light_volumetric_fog_energy = 0.6; add_child(moon)

# ---- the hall --------------------------------------------------------------------------------------------------------------------------------
func _build_hall() -> void:
	var fl := PlaneMesh.new(); fl.size = Vector2(60, 30); fl.subdivide_width = 1; fl.subdivide_depth = 1
	_mi(fl, Vector3.ZERO, _shader("floor", {"diff": _tex("concrete_floor_02_diff"), "rgh": _tex("concrete_floor_02_rough"), "nor": _tex("concrete_floor_02_nor"), "wet": 0.6}))
	# painted walkway lines and a drain channel
	for x in [-26.0, 26.0]: _box(Vector3(0.12, 0.004, 26), Vector3(x, 0.003, 0), M.yellow)
	_box(Vector3(52, 0.004, 0.12), Vector3(0, 0.003, 7.2), M.yellow)
	_box(Vector3(52, 0.004, 0.12), Vector3(0, 0.003, -11.2), M.yellow)
	_box(Vector3(50, 0.02, 0.35), Vector3(0, 0.0, 8.0), M.black)
	# walls: front (z=15) and ends concrete; back (z=-15) is the glass wall in a steel frame
	_box(Vector3(60, 18, 0.6), Vector3(0, 9, 15.3), M.wall)
	_box(Vector3(0.6, 18, 31), Vector3(-30.3, 9, 0), M.wall)
	_box(Vector3(0.6, 18, 31), Vector3(30.3, 9, 0), M.wall)
	_box(Vector3(60, 1.2, 0.6), Vector3(0, 0.6, -15.3), M.wall)            # upstand
	_box(Vector3(60, 3.0, 0.6), Vector3(0, 16.5, -15.3), M.wall)           # head beam
	var glass := BoxMesh.new(); glass.size = Vector3(60, 13.8, 0.03); _mi(glass, Vector3(0, 8.1, -15.2), M.glass)
	for i in 13:
		var x := -30.0 + i * 5.0
		_box(Vector3(0.22, 13.8, 0.35), Vector3(x, 8.1, -15.2), M.black)
	for y in [5.0, 10.0]: _box(Vector3(60, 0.14, 0.3), Vector3(0, y, -15.2), M.black)
	# roof: dark cladding with steel trusses every 6 m and roof lights
	_box(Vector3(61, 0.3, 31), Vector3(0, 18.2, 0), M.corr)
	for i in 11:
		var x := -30.0 + i * 6.0
		_truss(x)
	# crane rails along both long walls and an overhead crane
	for z in [-13.8, 13.8]:
		_box(Vector3(60, 0.6, 0.4), Vector3(0, 13.2, z), M.paint_grey)
		for i in 11: _box(Vector3(0.45, 13.0, 0.45), Vector3(-30.0 + i * 6.0, 6.5, z + signf(z) * 0.5), M.paint_grey)
	_box(Vector3(1.0, 1.1, 27.6), Vector3(-9.0, 13.9, 0), M.yellow)
	_box(Vector3(1.6, 0.9, 1.4), Vector3(-9.0, 13.2, 3.0), M.paint_grey)
	_seg(Vector3(-9.0, 12.8, 3.0), Vector3(-9.0, 7.5, 3.0), 0.015, M.black)
	_box(Vector3(0.5, 0.4, 0.3), Vector3(-9.0, 7.3, 3.0), M.yellow)
	# cool LED strips along the glass wall head and fill lights over the loop (the 0.9 gantry in front of the glass is cut: it hid the view)
	_box(Vector3(60, 0.06, 0.1), Vector3(0, 14.9, -14.9), _flat(Color.WHITE, 0, 0.5, Color(0.75, 0.88, 1.0), 5.0))
	for i in 4:
		var l := OmniLight3D.new(); l.light_color = Color(0.78, 0.88, 1.0); l.light_energy = 3.0; l.omni_range = 14.0; l.position = Vector3(-12 + i * 9, 7.5, -7.0); add_child(l)
	# sodium high-bays
	var k := 0
	for x in [-24.0, -12.0, 0.0, 12.0, 24.0]:
		for z in [-6.0, 6.0]:
			_cyl(0.35, 0.4, Vector3(x, 16.6, z), M.black, self, 0.12)
			_cyl(0.33, 0.02, Vector3(x, 16.38, z), _flat(Color(1, 0.7, 0.4), 0, 0.5, Color(1.0, 0.62, 0.28), 14.0))
			var s := SpotLight3D.new(); s.light_color = Color(1.0, 0.84, 0.66); s.light_energy = 7.0; s.spot_range = 26.0; s.spot_angle = 52.0; s.spot_attenuation = 0.8
			s.position = Vector3(x, 16.3, z); s.rotation_degrees.x = -90; s.shadow_enabled = k % 3 == 0; s.light_volumetric_fog_energy = 0.5; add_child(s)
			k += 1
	var rp := ReflectionProbe.new(); rp.size = Vector3(60, 18, 30); rp.position = Vector3(0, 9, 0); rp.box_projection = true; rp.interior = true
	rp.update_mode = ReflectionProbe.UPDATE_ONCE; rp.ambient_mode = ReflectionProbe.AMBIENT_ENVIRONMENT; add_child(rp)
	# clutter: drums, a pallet, a cable tray, hazard signs, fire extinguisher, eyewash
	for i in 5: _cyl(0.29, 0.88, Vector3(-27.0 + (i % 3) * 0.62, 0.44, 11.5 + (i / 3) * 0.62), M.paint_blue if i % 2 == 0 else M.red)
	_box(Vector3(1.2, 0.14, 1.0), Vector3(-24.5, 0.07, 12.0), _flat(Color(0.5, 0.38, 0.24), 0, 0.85))
	_box(Vector3(56, 0.06, 0.45), Vector3(0, 12.0, 14.2), M.steel_dull)
	for x in [-28.5, 28.5]: _cyl(0.09, 0.55, Vector3(x, 1.0, 13.0), M.red)
	_box(Vector3(0.8, 1.2, 0.05), Vector3(28.0, 1.8, 14.95), M.yellow)

func _truss(x: float) -> void:
	var y0 := 15.0; var y1 := 17.8
	_box(Vector3(0.25, 0.3, 30), Vector3(x, y1, 0), M.paint_grey)
	_box(Vector3(0.25, 0.3, 30), Vector3(x, y0, 0), M.paint_grey)
	for i in 10:
		var z0 := -15.0 + i * 3.0; var z1 := z0 + 3.0
		_seg(Vector3(x, y0, z0), Vector3(x, y1, z1), 0.06, M.paint_grey, self, 6)
		_seg(Vector3(x, y0, z1), Vector3(x, y1, z1), 0.05, M.paint_grey, self, 6)

# ---- the loop --------------------------------------------------------------------------------------------------------------------------------
func _build_loop() -> void:
	# plinth slab under the equipment
	_box(Vector3(46, 0.18, 9), Vector3(0, 0.09, -3.0), _pbr("concrete_floor_worn_02", 0.2, Color(0.6, 0.6, 0.6)))
	var Y := 1.4   ## pipe rack height across the loop
	# --- feed: a bank of six gas bottles in a cage, a manifold ---
	var fx := -22.0; var fz := -4.0
	for i in 6:
		var p := Vector3(fx - 1.0 + (i % 3) * 0.55, 0.18, fz - 0.3 + (i / 3) * 0.6)
		_cyl(0.23, 1.6, p + Vector3(0, 0.98, 0), M.paint_blue)
		_sph(0.23, p + Vector3(0, 1.78, 0), M.paint_blue, self, true)
		_cyl(0.05, 0.2, p + Vector3(0, 2.0, 0), M.brass)
	_box(Vector3(2.1, 0.06, 1.7), Vector3(fx - 0.45, 2.4, fz), M.paint_grey)
	_pipe([Vector3(fx - 1.3, 2.15, fz), Vector3(fx + 0.6, 2.15, fz), Vector3(fx + 0.6, Y, fz), Vector3(-18.0, Y, fz)], 0.05, M.steel)
	anchors["feed"] = Vector3(fx - 0.4, 2.8, fz); radius["feed"] = 1.6
	# --- mixer: a tee with a static-mixer housing ---
	_seg(Vector3(-18.5, Y, fz), Vector3(-16.5, Y, fz), 0.12, M.steel)
	_flange(Vector3(-18.5, Y, fz), Vector3.RIGHT, 0.12); _flange(Vector3(-16.5, Y, fz), Vector3.RIGHT, 0.12)
	_seg(Vector3(-18.2, 0.18, fz), Vector3(-18.2, Y, fz), 0.05, M.paint_grey); _seg(Vector3(-16.8, 0.18, fz), Vector3(-16.8, Y, fz), 0.05, M.paint_grey)
	anchors["mixer"] = Vector3(-17.5, Y + 0.6, fz); radius["mixer"] = 1.0
	# --- recycle compressor: skid, motor, coupling guard, casing with suction/discharge ---
	var cx := -13.0
	_box(Vector3(5.2, 0.25, 2.0), Vector3(cx, 0.3, fz), M.paint_grey)
	comp_body = Node3D.new(); comp_body.position = Vector3(cx, 0.42, fz); add_child(comp_body)
	_cyl(0.55, 1.8, Vector3(-1.4, 0.6, 0), M.paint_green, comp_body).rotation_degrees.z = 90   # motor
	for i in 10: _torus(0.56, 0.02, Vector3(-2.15 + i * 0.16, 0.6, 0), M.paint_green, comp_body).rotation_degrees.z = 90   # cooling fins
	_box(Vector3(0.7, 0.5, 0.5), Vector3(-0.15, 0.6, 0), M.yellow, comp_body)   # coupling guard
	comp_shaft = _cyl(0.06, 0.5, Vector3(-0.15, 0.6, 0), M.steel, comp_body); comp_shaft.rotation_degrees.z = 90
	_cyl(0.62, 1.6, Vector3(1.2, 0.75, 0), M.paint_blue, comp_body).rotation_degrees.z = 90   # barrel casing
	_cyl(0.7, 0.12, Vector3(0.45, 0.75, 0), M.steel_dull, comp_body).rotation_degrees.z = 90
	_cyl(0.7, 0.12, Vector3(1.95, 0.75, 0), M.steel_dull, comp_body).rotation_degrees.z = 90
	_pipe([Vector3(-16.5, Y, fz), Vector3(cx + 0.9, Y, fz), Vector3(cx + 0.9, 1.75, fz)], 0.12, M.steel)
	_pipe([Vector3(cx + 1.6, 1.75, fz), Vector3(cx + 1.6, 3.4, fz), Vector3(-7.0, 3.4, fz)], 0.1, M.steel)
	_gauge(Vector3(cx + 1.6, 2.6, fz + 0.18), Vector3(0, 0, 1), self, 0.72)
	anchors["compressor"] = Vector3(cx, 2.3, fz); radius["compressor"] = 2.0
	# --- fired preheater: refractory box, peep ports with flame, burner, stack to the roof ---
	var hx := -7.0
	_box(Vector3(3.0, 4.2, 2.6), Vector3(hx, 2.28, fz), M.paint_grey)
	for i in 4: _box(Vector3(3.08, 0.08, 2.68), Vector3(hx, 0.6 + i * 1.2, fz), M.black)
	m_peep = _shader("flame", {"intensity": 1.4, "width": 0.9, "speed": 1.4})
	for i in 3:
		var pp := Vector3(hx - 0.9 + i * 0.9, 1.4, fz + 1.31)
		_cyl(0.11, 0.08, pp, M.steel_dull).rotation_degrees.x = 90
		var q := QuadMesh.new(); q.size = Vector2(0.17, 0.17); _mi(q, pp + Vector3(0, 0, 0.045), _flat(Color(1, 0.5, 0.15), 0, 1, Color(1.0, 0.45, 0.1), 8.0))
	heater_light = OmniLight3D.new(); heater_light.light_color = Color(1.0, 0.5, 0.18); heater_light.light_energy = 0.8; heater_light.omni_range = 3.0; heater_light.position = Vector3(hx, 1.4, fz + 1.8); add_child(heater_light)
	_cyl(0.32, 14.0, Vector3(hx + 0.6, 11.4, fz - 0.4), M.rust)
	_cyl(0.4, 0.3, Vector3(hx + 0.6, 4.55, fz - 0.4), M.steel_dull)
	_pipe([Vector3(-7.0, 3.4, fz), Vector3(hx - 1.6, 3.4, fz)], 0.1, M.steel, self, false)
	_pipe([Vector3(hx + 1.5, 2.0, fz), Vector3(-3.5, 2.0, fz)], 0.1, M.clad)
	anchors["heater"] = Vector3(hx, 4.8, fz); radius["heater"] = 2.2
	# --- trim cooler: horizontal shell-and-tube on saddles, CW in/out, CW pump ---
	var kx := -1.0
	var shell := _cyl(0.5, 4.2, Vector3(kx, 1.6, fz), M.steel); shell.rotation_degrees.z = 90
	for s in [-1.0, 1.0]:
		_cyl(0.62, 0.14, Vector3(kx + s * 2.15, 1.6, fz), M.steel_dull).rotation_degrees.z = 90
		_sph(0.5, Vector3(kx + s * 2.25, 1.6, fz), M.steel_dull, self, true).rotation_degrees.z = -90 * s
		_box(Vector3(0.35, 1.1, 1.0), Vector3(kx + s * 1.3, 0.75, fz), M.paint_grey)
	_pipe([Vector3(-3.5, 2.0, fz), Vector3(kx - 1.6, 2.0, fz), Vector3(kx - 1.6, 2.1, fz)], 0.1, M.clad, self, false)
	# cooling water: supply from the pump, return to the wall (outside to the towers)
	var pz := fz - 3.2
	pump_body = Node3D.new(); pump_body.position = Vector3(kx - 0.5, 0.18, pz); add_child(pump_body)
	_box(Vector3(2.2, 0.2, 0.8), Vector3(0, 0.1, 0), M.paint_grey, pump_body)
	_cyl(0.3, 0.9, Vector3(-0.5, 0.5, 0), M.paint_blue, pump_body).rotation_degrees.z = 90
	pump_shaft = _box(Vector3(0.3, 0.25, 0.25), Vector3(0.1, 0.5, 0), M.yellow, pump_body)
	_sph(0.32, Vector3(0.6, 0.5, 0), M.paint_green, pump_body)
	_pipe([Vector3(kx + 0.1, 0.68, pz), Vector3(kx + 0.1, 0.68, fz - 0.9), Vector3(kx + 1.2, 0.68, fz - 0.9), Vector3(kx + 1.2, 1.15, fz - 0.4)], 0.09, M.paint_green, self, false)
	_pipe([Vector3(kx + 1.6, 0.68, pz), Vector3(-6.0, 0.68, pz), Vector3(-6.0, 0.68, -14.9)], 0.1, M.paint_green)   # supply from the wall
	var ret := [Vector3(kx - 1.2, 2.15, fz - 0.4), Vector3(kx - 1.2, 2.9, fz - 0.4), Vector3(kx - 1.2, 2.9, -12.0), Vector3(2.0, 2.9, -12.0), Vector3(2.0, 2.9, -14.9)]
	m_cw_ret = _shader("steel", {"rough_base": 0.5, "albedo": Color(0.36, 0.5, 0.42), "metallic": 0.2})
	_pipe(ret, 0.1, m_cw_ret)
	steam_cw = _particles(Vector3(2.0, 3.1, -12.0), 40, 3.5, Vector3(0, 0.8, 0), 18.0, 0.7, Color(0.9, 0.92, 0.95, 0.35))
	steam_cw.emitting = false
	_box(Vector3(0.12, 0.6, 0.12), Vector3(2.0, 3.25, -12.0), M.steel_dull)   # tundish / vent on the CW return
	_gauge(Vector3(kx - 0.5, 1.2, pz + 0.35), Vector3(0, 0, 1), self, 0.55)
	anchors["cooler"] = Vector3(kx, 2.4, fz); radius["cooler"] = 2.3
	anchors["cw_pump"] = Vector3(kx - 0.5, 1.3, pz)
	# --- the converter: thick-walled vessel on a skirt, flanged top head, nozzles, sight port, ladder, platform ---
	var vx := 5.5; var vz := -3.0; var vr := 1.15; var vh := 8.0; var vb := 1.6
	_cyl(vr * 0.98, vb, Vector3(vx, vb * 0.5 + 0.18, vz), M.paint_grey)     # skirt
	m_shell = _shader("steel", {"rough_base": 0.3, "metallic": 0.8, "yrange": Vector2(-vh * 0.5, vh * 0.5), "emit_gain": 0.9})
	shell_node = _cyl(vr, vh, Vector3(vx, vb + vh * 0.5 + 0.18, vz), m_shell, self, -1.0, 48)
	m_shell_x = _shader("steel_glass", {"yrange": Vector2(-vh * 0.5, vh * 0.5)})
	shell_x_node = _cyl(vr, vh, shell_node.position, m_shell_x, self, -1.0, 48); shell_x_node.visible = false
	var bot := _sph(vr, Vector3(vx, vb + 0.18, vz), m_shell, self, true); bot.rotation_degrees.x = 180
	var top := _sph(vr, Vector3(vx, vb + vh + 0.18, vz), m_shell, self, true)
	_cyl(vr * 1.12, 0.22, Vector3(vx, vb + vh + 0.18, vz), M.steel_dull, self, -1.0, 48)
	for i in 24:
		var a := TAU * i / 24.0
		_cyl(0.035, 0.42, Vector3(vx + cos(a) * vr * 1.06, vb + vh + 0.18, vz + sin(a) * vr * 1.06), M.black, self, -1.0, 6)
	for i in 4: _torus(vr + 0.01, 0.012, Vector3(vx, vb + 0.18 + 1.6 + i * 1.8, vz), M.steel_dull)   # girth welds
	# catalyst beds inside (seen in x-ray)
	m_beds = _shader("beds", {"heat": 0.35})
	for i in 3: _cyl(vr * 0.9, 1.6, Vector3(vx, vb + 1.4 + i * 2.5, vz), m_beds, self, -1.0, 32)
	conv_light = OmniLight3D.new(); conv_light.light_color = Color(1.0, 0.35, 0.1); conv_light.light_energy = 0.0; conv_light.omni_range = 6.0; conv_light.position = Vector3(vx, vb + 5.0, vz + 1.6); add_child(conv_light)
	# heat shimmer above the head
	m_shimmer = _shader("shimmer", {"strength": 0.0})
	shimmer_node = _cyl(vr * 1.3, 3.0, Vector3(vx, vb + vh + 1.9, vz), m_shimmer, self, vr * 0.6)
	# nozzles: inlet at the top, outlet at the bottom side
	_pipe([Vector3(kx + 2.25, 1.6, fz), Vector3(3.0, 1.6, fz), Vector3(3.0, vb + vh + 1.2, fz), Vector3(vx, vb + vh + 1.2, vz), Vector3(vx, vb + vh + 0.4, vz)], 0.12, M.clad)
	_pipe([Vector3(vx + vr, vb + 0.8, vz), Vector3(vx + 2.6, vb + 0.8, vz), Vector3(vx + 2.6, 1.2, vz), Vector3(10.6, 1.2, vz)], 0.12, M.clad)
	# sight port with a glow behind it
	var sp := Vector3(vx, vb + 4.0, vz + vr + 0.05)
	_cyl(0.2, 0.16, sp, M.steel_dull).rotation_degrees.x = 90
	m_peep = _shader("beds", {"heat": 0.4, "emit_gain": 3.0})
	var spq := CylinderMesh.new(); spq.top_radius = 0.14; spq.bottom_radius = 0.14; spq.height = 0.02
	_mi(spq, sp + Vector3(0, 0, 0.08), m_peep).rotation_degrees.x = 90
	# ladder and a platform at the top head
	for s in [-0.25, 0.25]: _seg(Vector3(vx + s, 0.18, vz + vr + 0.35), Vector3(vx + s, vb + vh + 0.9, vz + vr + 0.35), 0.025, M.yellow)
	for i in int((vb + vh) / 0.3): _seg(Vector3(vx - 0.25, 0.4 + i * 0.3, vz + vr + 0.35), Vector3(vx + 0.25, 0.4 + i * 0.3, vz + vr + 0.35), 0.015, M.yellow)
	_lathe(PackedVector2Array([Vector2(vr + 0.1, 0), Vector2(vr + 1.2, 0), Vector2(vr + 1.2, 0.06), Vector2(vr + 0.1, 0.06)]), 48, M.plate, Vector3(vx, vb + vh - 0.4, vz), self, false)
	_torus(vr + 1.18, 0.025, Vector3(vx, vb + vh + 0.65, vz), M.yellow)
	_torus(vr + 1.18, 0.02, Vector3(vx, vb + vh + 0.15, vz), M.yellow)
	for i in 12:
		var a := TAU * i / 12.0
		_seg(Vector3(vx + cos(a) * (vr + 1.18), vb + vh - 0.4, vz + sin(a) * (vr + 1.18)), Vector3(vx + cos(a) * (vr + 1.18), vb + vh + 0.65, vz + sin(a) * (vr + 1.18)), 0.02, M.yellow)
	# the gauge on the converter (the "gauge" camera preset frames it)
	_gauge(Vector3(vx + 0.75, vb + 2.6, vz + vr + 0.22), Vector3(0.35, 0, 1).normalized(), self, 0.62, 0.13)
	_gauge(Vector3(vx - 0.75, vb + 2.6, vz + vr + 0.22), Vector3(-0.35, 0, 1).normalized(), self, 0.48, 0.13)
	gauge_pos = Vector3(vx + 0.75, vb + 2.6, vz + vr + 0.22)
	# interlock cabinet and beacons
	_box(Vector3(0.8, 1.4, 0.4), Vector3(vx + 2.4, 0.9, vz + 2.2), M.paint_grey)
	_box(Vector3(0.5, 0.3, 0.02), Vector3(vx + 2.4, 1.2, vz + 2.41), _flat(Color(0.05, 0.1, 0.1), 0.0, 0.3, Color(0.2, 0.9, 0.8), 1.5))
	anchors["interlock"] = Vector3(vx + 2.4, 1.9, vz + 2.2); radius["interlock"] = 0.8
	for bp in [Vector3(vx + 2.4, 1.75, vz + 2.2), Vector3(-26.0, 6.0, 14.6), Vector3(26.0, 6.0, 14.6), Vector3(4.0, 14.6, -14.6)]:
		var bm := _flat(Color(1, 0.55, 0.1), 0, 0.3, Color(1.0, 0.5, 0.05), 0.0)
		_cyl(0.09, 0.18, bp, bm).name = "beacon"
		beacon_mats.append(bm)
		var sl := SpotLight3D.new(); sl.light_color = Color(1.0, 0.5, 0.05); sl.light_energy = 0.0; sl.spot_range = 14.0; sl.spot_angle = 22.0; sl.position = bp; sl.light_volumetric_fog_energy = 1.0; add_child(sl)
		beacons.append(sl)
	anchors["converter"] = Vector3(vx, vb + vh * 0.62, vz); radius["converter"] = 2.6
	conv_top = Vector3(vx, vb + vh, vz)
	# --- ammonia separator: cold vertical drum with frost and a sight glass ---
	var sx := 11.5; var sr := 0.8; var sh := 4.2
	_cyl(sr * 0.9, 0.9, Vector3(sx, 0.63, vz), M.paint_grey)
	m_sep = _shader("steel", {"rough_base": 0.36, "metallic": 0.75, "frost": 0.25, "frost_h": 1.0, "yrange": Vector2(-sh * 0.5, sh * 0.5)})
	_cyl(sr, sh, Vector3(sx, 1.08 + sh * 0.5, vz), m_sep)
	_sph(sr, Vector3(sx, 1.08 + sh, vz), m_sep, self, true)
	var sb := _sph(sr, Vector3(sx, 1.08, vz), m_sep, self, true); sb.rotation_degrees.x = 180
	# sight glass: a vertical gauge glass on two nozzles
	var gx := sx + sr + 0.25
	_seg(Vector3(sx + sr, 1.6, vz), Vector3(gx, 1.6, vz), 0.04, M.steel); _seg(Vector3(sx + sr, 3.9, vz), Vector3(gx, 3.9, vz), 0.04, M.steel)
	_box(Vector3(0.14, 2.5, 0.14), Vector3(gx, 2.75, vz), M.steel_dull)
	m_sight = _shader("sight", {"level": 0.55, "frost": 0.6})
	var sg := BoxMesh.new(); sg.size = Vector3(0.06, 2.2, 0.03); _mi(sg, Vector3(gx, 2.75, vz + 0.075), m_sight)
	_pipe([Vector3(10.6, 1.2, vz), Vector3(sx - sr - 0.1, 1.2, vz)], 0.12, M.clad, self, false)
	anchors["separator"] = Vector3(sx, 5.0, vz); radius["separator"] = 1.6
	# vapour to the splitter, purge up and out through the glass wall to the flare, recycle back along the rack
	var tx := 16.0; var tz := 1.0
	_pipe([Vector3(sx, 1.08 + sh + sr, vz), Vector3(sx, 6.0, vz), Vector3(tx, 6.0, vz), Vector3(tx, 6.0, tz), Vector3(tx, 2.2, tz)], 0.09, M.steel)
	_box(Vector3(0.7, 0.9, 0.7), Vector3(tx, 1.75, tz), M.steel)   # splitter body
	anchors["splitter"] = Vector3(tx, 2.6, tz); radius["splitter"] = 0.9
	_pipe([Vector3(tx + 0.35, 1.75, tz), Vector3(19.0, 1.75, tz), Vector3(19.0, 9.5, tz), Vector3(19.0, 9.5, -14.9)], 0.05, M.red)
	_pipe([Vector3(tx, 1.3, tz), Vector3(tx, 0.9, tz), Vector3(tx, 0.9, 3.5), Vector3(-18.0, 0.9, 3.5), Vector3(-18.0, 0.9, fz + 0.2), Vector3(-17.5, Y - 0.12, fz + 0.2)], 0.08, M.steel)
	# recycle valve with handwheel and actuator
	var vp := Vector3(4.0, 0.9, 3.5)
	_box(Vector3(0.5, 0.4, 0.4), vp, M.paint_blue)
	_cyl(0.18, 0.5, vp + Vector3(0, 0.45, 0), M.steel)
	_cyl(0.3, 0.25, vp + Vector3(0, 0.8, 0), M.paint_blue)
	_torus(0.22, 0.015, vp + Vector3(0.0, 0.3, 0.35), M.red).rotation_degrees.x = 90
	anchors["valve"] = vp + Vector3(0, 1.2, 0); radius["valve"] = 0.8
	# product: liquid ammonia to a small tank
	_pipe([Vector3(sx, 0.4, vz + 0.6), Vector3(sx, 0.4, 5.5), Vector3(19.5, 0.4, 5.5)], 0.05, M.steel, self, false)
	_cyl(0.9, 2.6, Vector3(20.5, 1.48, 5.5), M.paint_grey)
	_sph(0.9, Vector3(20.5, 2.78, 5.5), M.paint_grey, self, true)
	_box(Vector3(0.9, 0.5, 0.02), Vector3(20.5, 1.7, 6.41), _flat(Color(0.95, 0.95, 0.9), 0, 0.6))
	anchors["product"] = Vector3(20.5, 3.4, 5.5); radius["product"] = 1.3
	# pipe supports under the low rack
	for x in range(-20, 18, 4): _box(Vector3(0.12, 1.25, 0.12), Vector3(float(x), 0.8, fz + 0.0) if absf(float(x) - (-13.0)) > 2.5 else Vector3(float(x), -5, 0), M.paint_grey)
var gauge_pos := Vector3.ZERO
var conv_top := Vector3.ZERO

# ---- the bench -------------------------------------------------------------------------------------------------------------------------------
func _build_bench() -> void:
	var bx := -2.0; var bz := 10.5; var top := 0.92
	_box(Vector3(5.0, 0.05, 1.3), Vector3(bx, top, bz), _flat(Color(0.08, 0.09, 0.1), 0.0, 0.25))    # epoxy resin top
	_box(Vector3(4.9, 0.85, 1.2), Vector3(bx, 0.45, bz), M.paint_grey)
	_box(Vector3(5.0, 0.9, 0.08), Vector3(bx, top + 0.45, bz - 0.62), M.steel_dull)                 # back panel / shelf
	_box(Vector3(5.0, 0.03, 0.3), Vector3(bx, top + 0.7, bz - 0.5), M.steel_dull)
	var lamp := SpotLight3D.new(); lamp.light_color = Color(0.95, 0.97, 1.0); lamp.light_energy = 3.0; lamp.spot_range = 3.5; lamp.spot_angle = 50.0; lamp.shadow_enabled = true
	lamp.position = Vector3(bx, top + 1.6, bz + 0.1); lamp.rotation_degrees.x = -90; add_child(lamp)
	_box(Vector3(4.6, 0.04, 0.08), Vector3(bx, top + 1.65, bz + 0.1), _flat(Color.WHITE, 0, 0.5, Color(0.9, 0.95, 1.0), 5.0))
	# the sample bulb: a round flask of indicator water, gas bubbling through from a dip tube; pink follows the outlet NH3
	var fp := Vector3(bx + 0.6, top + 0.025, bz + 0.05)
	var flask := PackedVector2Array([Vector2(0.0, 0.0), Vector2(0.06, 0.0), Vector2(0.11, 0.03), Vector2(0.14, 0.09), Vector2(0.145, 0.15), Vector2(0.12, 0.22), Vector2(0.07, 0.27), Vector2(0.03, 0.30), Vector2(0.03, 0.42), Vector2(0.035, 0.43)])
	var liquid := PackedVector2Array([Vector2(0.0, 0.006), Vector2(0.055, 0.006), Vector2(0.105, 0.035), Vector2(0.133, 0.09), Vector2(0.137, 0.15), Vector2(0.125, 0.19), Vector2(0.0, 0.19)])
	m_liquid_pink = _shader("liquid", {"col": Color(0.95, 0.97, 1.0, 0.25)})
	_lathe(liquid, 40, m_liquid_pink, fp)
	_lathe(flask, 40, M.glass, fp)
	_seg(fp + Vector3(0.0, 0.03, 0), fp + Vector3(0.0, 0.62, 0), 0.006, M.glass)
	bubbles = _particles(fp + Vector3(0, 0.04, 0), 24, 0.9, Vector3(0, 0.18, 0), 12.0, 0.012, Color(1, 1, 1, 0.8), self, 1.2)
	(bubbles.process_material as ParticleProcessMaterial).gravity = Vector3(0, 0.1, 0)
	_box(Vector3(0.2, 0.012, 0.2), fp + Vector3(0, -0.01, 0), M.steel_dull)
	# a retort stand and clamp
	_box(Vector3(0.22, 0.015, 0.16), fp + Vector3(-0.26, -0.005, 0), M.black)
	_seg(fp + Vector3(-0.3, 0, 0), fp + Vector3(-0.3, 0.75, 0), 0.006, M.steel)
	_seg(fp + Vector3(-0.3, 0.5, 0), fp + Vector3(0.0, 0.5, 0), 0.005, M.steel)
	# supply line from the converter sample point (a thin steel tube running up the back panel)
	_pipe([fp + Vector3(0.0, 0.62, 0), fp + Vector3(0.0, 0.8, 0), fp + Vector3(0.0, 0.8, -0.5), Vector3(fp.x, top + 0.9, bz - 0.58)], 0.008, M.steel, self, false)
	# other glassware: erlenmeyers, beakers, a graduated cylinder, reagent bottles
	var erl := PackedVector2Array([Vector2(0, 0), Vector2(0.075, 0), Vector2(0.08, 0.01), Vector2(0.03, 0.15), Vector2(0.022, 0.2), Vector2(0.025, 0.205)])
	var erl_l := PackedVector2Array([Vector2(0, 0.004), Vector2(0.071, 0.004), Vector2(0.075, 0.012), Vector2(0.05, 0.075), Vector2(0, 0.075)])
	var cols := [Color(0.25, 0.55, 1.0, 0.55), Color(0.95, 0.75, 0.15, 0.5), Color(0.2, 0.85, 0.5, 0.45)]
	for i in 3:
		var p := Vector3(bx - 1.6 + i * 0.32, top + 0.025, bz + 0.15 - (i % 2) * 0.12)
		_lathe(erl_l, 32, _shader("liquid", {"col": cols[i], "glow": 0.05}), p)
		_lathe(erl, 32, M.glass, p)
	var beak := PackedVector2Array([Vector2(0, 0), Vector2(0.06, 0), Vector2(0.062, 0.005), Vector2(0.062, 0.14), Vector2(0.066, 0.145)])
	_lathe(beak, 32, M.glass, Vector3(bx - 0.4, top + 0.025, bz + 0.1))
	_lathe(PackedVector2Array([Vector2(0, 0.004), Vector2(0.058, 0.004), Vector2(0.058, 0.06), Vector2(0, 0.06)]), 32, _shader("liquid", {"col": Color(0.9, 0.95, 1.0, 0.2)}), Vector3(bx - 0.4, top + 0.025, bz + 0.1))
	_lathe(PackedVector2Array([Vector2(0, 0), Vector2(0.02, 0), Vector2(0.02, 0.32), Vector2(0.024, 0.325)]), 24, M.glass, Vector3(bx + 0.1, top + 0.025, bz - 0.15))
	for i in 4:
		var p := Vector3(bx - 2.1 + i * 0.16, top + 0.735, bz - 0.5)
		_cyl(0.05, 0.16, p + Vector3(0, 0.08, 0), _flat(Color(0.35, 0.18, 0.06), 0.0, 0.15) if i % 2 == 0 else M.glass)
		_cyl(0.025, 0.03, p + Vector3(0, 0.175, 0), M.black)
	# a notebook and a pen, a tablet showing a trace
	_box(Vector3(0.3, 0.012, 0.22), Vector3(bx + 1.5, top + 0.031, bz + 0.2), _flat(Color(0.92, 0.9, 0.84), 0, 0.85))
	_seg(Vector3(bx + 1.4, top + 0.04, bz + 0.25), Vector3(bx + 1.58, top + 0.04, bz + 0.12), 0.004, M.black)
	_box(Vector3(0.34, 0.012, 0.24), Vector3(bx + 1.95, top + 0.031, bz + 0.05), _flat(Color(0.02, 0.06, 0.07), 0.2, 0.2, Color(0.1, 0.6, 0.55), 0.6))
	anchors["bench"] = fp + Vector3(0, 0.5, 0)
	bench_pos = fp

var bench_pos := Vector3.ZERO

# ---- outside: the plant at night to the horizon --------------------------------------------------------------------------------------------
func _build_outside() -> void:
	var g := PlaneMesh.new(); g.size = Vector2(1600, 1200)
	_mi(g, Vector3(0, -0.02, -600), M.concrete_out)
	# cooling towers (hyperboloids) with plumes
	for t in [[-60.0, -150.0, 1.0], [-10.0, -170.0, 1.1], [45.0, -160.0, 0.95]]:
		var s: float = t[2]
		var prof := PackedVector2Array()
		for i in 13:
			var y := i / 12.0
			prof.append(Vector2(s * (22.0 - 14.0 * sin(y * PI * 0.62) + 3.0 * y * y), y * 60.0 * s))
		var tw := _lathe(prof, 48, _pbr("concrete_slab_wall", 0.04, Color(0.55, 0.55, 0.55)), Vector3(t[0], 0, t[1]))
		tw.name = "tower"
		var pl := _particles(Vector3(t[0], 60.0 * s, t[1]), 60, 12.0, Vector3(0, 4.0, 0), 10.0, 26.0, Color(0.6, 0.62, 0.66, 0.45), self, 3.0)
		(pl.process_material as ParticleProcessMaterial).gravity = Vector3(1.2, 0.6, 0)
		pl.visibility_aabb = AABB(Vector3(-120, -10, -120), Vector3(240, 260, 240))
		tower_plumes.append(pl)
		for k in 6:
			var l := OmniLight3D.new(); l.light_color = Color(1.0, 0.25, 0.15); l.light_energy = 2.0; l.omni_range = 4.0; l.position = Vector3(t[0] + cos(k) * 9.0 * s, 60.0 * s + 0.5, t[1] + sin(k) * 9.0 * s); add_child(l)
	# pipe racks running away from the hall
	for r in 3:
		var z0 := -30.0 - r * 3.5
		for i in 30:
			var x := -90.0 + i * 6.0
			_box(Vector3(0.3, 7.0, 0.3), Vector3(x, 3.5, z0), M.rust)
			_box(Vector3(0.25, 0.25, 3.0), Vector3(x, 6.8, z0 + 1.2), M.rust)
		for k in 4: _seg(Vector3(-90.0, 6.95 + 0.0, z0 + 0.2 + k * 0.6), Vector3(90.0, 6.95, z0 + 0.2 + k * 0.6), 0.18 + k * 0.04, M.clad if k % 2 == 0 else M.steel_dull, self, 12)
	# tanks, columns, sheds, lights
	for i in 7:
		var p := Vector3(-110.0 + i * 34.0, 0, -80.0 - (i % 3) * 22.0)
		_cyl(10.0, 14.0, p + Vector3(0, 7, 0), _pbr("painted_metal_shutter", 0.08, Color(0.75, 0.75, 0.73)), self, -1.0, 48)
		_cyl(10.2, 0.6, p + Vector3(0, 14.2, 0), M.steel_dull, self, 9.0, 48)
	for i in 4:
		var p := Vector3(-40.0 + i * 25.0, 0, -55.0)
		var h := 28.0 + i * 6.0
		_cyl(1.6, h, p + Vector3(0, h * 0.5, 0), M.steel_dull)
		for k in int(h / 6.0): _torus(2.2, 0.06, p + Vector3(0, 4.0 + k * 6.0, 0), M.yellow)
		for k in int(h / 8.0):
			var l := OmniLight3D.new(); l.light_color = Color(1.0, 0.75, 0.45); l.light_energy = 1.6; l.omni_range = 8.0; l.position = p + Vector3(2.6, 4.0 + k * 8.0, 0); add_child(l)
			_sph(0.15, l.position, _flat(Color.WHITE, 0, 0.5, Color(1.0, 0.75, 0.45), 12.0))
	_box(Vector3(60, 9, 18), Vector3(-70, 4.5, -45), M.corr)
	_box(Vector3(40, 12, 22), Vector3(80, 6, -50), M.corr)
	for i in 40:   # far plant lights to the horizon
		var p := Vector3(-400.0 + fmod(i * 97.3, 800.0), 2.0 + fmod(i * 13.7, 18.0), -260.0 - fmod(i * 53.1, 300.0))
		_sph(0.6, p, _flat(Color.WHITE, 0, 0.5, Color(1.0, 0.7, 0.4) if i % 3 else Color(0.8, 0.9, 1.0), 18.0))
	# the flare stack: derrick, tip, pilot flame, the big flame when the loop dumps
	var fx := 40.0; var fz := -95.0; var fh := 55.0
	_cyl(1.0, fh, Vector3(fx, fh * 0.5, fz), M.rust)
	for k in 9:
		for a in 3:
			var ang := TAU * a / 3.0
			_seg(Vector3(fx + cos(ang) * 4.0, k * 6.0, fz + sin(ang) * 4.0), Vector3(fx + cos(ang) * 4.0, (k + 1) * 6.0, fz + sin(ang) * 4.0), 0.15, M.rust)
			_seg(Vector3(fx + cos(ang) * 4.0, k * 6.0, fz + sin(ang) * 4.0), Vector3(fx + cos(ang + TAU / 3.0) * 4.0, (k + 1) * 6.0, fz + sin(ang + TAU / 3.0) * 4.0), 0.1, M.rust)
	m_flare = _shader("flame", {"intensity": 1.0, "width": 0.6, "speed": 1.8})
	var q := QuadMesh.new(); q.size = Vector2(6, 14)
	flare_flame = _mi(q, Vector3(fx, fh + 6.0, fz), m_flare)
	flare_light = OmniLight3D.new(); flare_light.light_color = Color(1.0, 0.55, 0.2); flare_light.light_energy = 2.0; flare_light.omni_range = 160.0; flare_light.omni_attenuation = 0.6; flare_light.position = Vector3(fx, fh + 6.0, fz); flare_light.shadow_enabled = true; add_child(flare_light)
	flare_smoke = _particles(Vector3(fx, fh + 12.0, fz), 50, 8.0, Vector3(0, 5.0, 0), 12.0, 12.0, Color(0.12, 0.1, 0.09, 0.5), self, 3.5)
	flare_smoke.visibility_aabb = AABB(Vector3(-100, -10, -100), Vector3(200, 200, 200))
	flare_smoke.emitting = false
	anchors["flare"] = Vector3(19.0, 9.8, -14.0); radius["flare"] = 1.0   # where the purge line leaves the hall (the stack itself is far outside)
	flare_tip = Vector3(fx, fh + 6.0, fz)
var flare_tip := Vector3.ZERO

# ---- live state ------------------------------------------------------------------------------------------------------------------------------
func set_snapshot(g: Dictionary) -> void:
	var st := {}
	for s in g.get("streams", []): st[str(s.get("id", ""))] = s
	var us := {}
	for u in g.get("units", []): us[str(u.get("id", ""))] = u
	var sh = g.get("shift", null)
	var trips: Array = sh.get("trips", []) if sh is Dictionary else []
	var evs: Array = sh.get("events", []) if sh is Dictionary else []
	tripped = not trips.is_empty()
	var cw_trip := false
	for e in evs: if str(e.get("type", "")) == "cw_pump_trip": cw_trip = true
	cw_to = 0.0 if cw_trip else 1.0
	var co = st.get(str(streams.get("conv_out", "")), null)
	if co is Dictionary:
		var T := float(co.get("T", 0.0))
		if T > 0.0 and _T0 <= 0.0: _T0 = T
		if _T0 > 0.0: heat_to = clampf((T - _T0 - 4.0) / 60.0, 0.0, 1.3)   # nominal: no glow; +10 K a dull red, +40 K orange, +64 K bright
		var x := 0.0
		for w in co.get("w", []): if int(w[0]) == _nh3_i: x = float(w[1])
		pink_to = clampf(x / 0.18, 0.0, 1.0)
		run_to = 1.0 if float(co.get("flow", 0.0)) > 1e-6 and not tripped else 0.15
	var lq = st.get(str(streams.get("liq", "")), null)
	if lq is Dictionary:
		var f := float(lq.get("flow", 0.0))
		if f > 0.0 and _liq0 <= 0.0: _liq0 = f
		level_to = clampf(0.25 + 0.3 * (f / maxf(_liq0, 1e-9)), 0.1, 0.85) if _liq0 > 0.0 else 0.3
	flare_to = 1.0 if tripped else 0.15
	var worst := 0
	for a in g.get("alarms", []):
		if int(a.get("rtn", 0)) == 0: worst = maxi(worst, int(a.get("tier", 0)))
	alarm = 3 if tripped or worst >= 3 else (2 if worst >= 2 else 0)
	var cu = us.get(str(ids.get("compressor", "")), null)
	if cu is Dictionary and float(cu.get("P", 0.0)) > 0.0 and gauge_mats.size() > 0: (gauge_mats[0] as ShaderMaterial).set_shader_parameter("value", clampf(float(cu.P) / 2.0e7, 0.0, 1.0))

func _process(dt: float) -> void:
	_t += dt
	if cam != null and not cam.current and visible: cam.make_current()
	var k := clampf(dt * 1.6, 0.0, 1.0)
	heat = lerpf(heat, heat_to, k); cw_on = lerpf(cw_on, cw_to, clampf(dt * 0.8, 0, 1)); flare = lerpf(flare, flare_to, clampf(dt * 1.2, 0, 1))
	level = lerpf(level, level_to, k * 0.5); pink = lerpf(pink, pink_to, k * 0.5); run = lerpf(run, run_to, clampf(dt * 0.7, 0, 1))
	# converter: shell glow climbs from the bottom (hot outlet at the bottom bed), shimmer and a red light on the floor
	if m_shell:
		var h := maxf(heat - 0.12, 0.0)
		m_shell.set_shader_parameter("heat_lo", minf(h, 0.62)); m_shell.set_shader_parameter("heat_hi", minf(h, 0.62) * 0.3)   # a bare shell at ~620 C is dull red, never white
		m_shell_x.set_shader_parameter("heat_lo", h * 1.05); m_shell_x.set_shader_parameter("heat_hi", h * 0.35)
		m_beds.set_shader_parameter("heat", 0.35 + heat * 0.65); m_peep.set_shader_parameter("heat", 0.4 + heat * 0.6)
		m_shimmer.set_shader_parameter("strength", clampf(heat, 0.0, 1.2) * 0.02)
		conv_light.light_energy = h * 6.0 + (1.5 if xray else 0.0) * (0.3 + heat)
	# compressor and CW pump vibrate while they run
	if comp_body: comp_body.position.y = 0.42 + sin(_t * 95.0) * 0.0025 * run; comp_shaft.rotate_x(dt * 60.0 * run)
	if pump_body:
		pump_body.position.x = -1.5 + sin(_t * 120.0) * 0.002 * cw_on; pump_shaft.rotate_x(dt * 80.0 * cw_on)
		steam_cw.emitting = cw_on < 0.6
		m_cw_ret.set_shader_parameter("heat_lo", (1.0 - cw_on) * 0.0)
	for p in tower_plumes: p.amount_ratio = (0.35 + 0.65 * cw_on) * (1.0 if tier == "ultra" else 0.5)
	if m_sight: m_sight.set_shader_parameter("level", level); m_sep.set_shader_parameter("frost", 0.2 + 0.2 * run)
	if m_liquid_pink:
		m_liquid_pink.set_shader_parameter("col", Color(0.95, 0.97, 1.0, 0.22).lerp(Color(0.95, 0.12, 0.55, 0.75), pink))
		bubbles.amount_ratio = 0.2 + 0.8 * run
	# flare: pilot to a roaring flame; flickering light into the hall
	if m_flare:
		var fl := flare * (0.85 + 0.15 * sin(_t * 13.0) * sin(_t * 7.3))
		m_flare.set_shader_parameter("intensity", 0.6 + fl * 2.2)
		flare_flame.scale = Vector3.ONE * (0.35 + flare * 1.6)
		flare_flame.position.y = flare_tip.y + (0.35 + flare * 1.6) * 6.0
		flare_light.light_energy = 1.0 + fl * 40.0
		flare_smoke.emitting = flare > 0.5
		flare_flame.look_at(Vector3(cam.global_position.x, flare_flame.global_position.y, cam.global_position.z), Vector3.UP)
	# beacons rotate on alarm
	for i in beacons.size():
		var on := alarm >= 2
		var b: SpotLight3D = beacons[i]
		b.light_color = Color(1.0, 0.1, 0.05) if alarm >= 3 else Color(1.0, 0.5, 0.05)
		b.light_energy = 12.0 if on else 0.0
		b.rotation = Vector3(-0.35, _t * 6.0 + i, 0.0)
		beacon_mats[i].emission_energy_multiplier = (6.0 + 4.0 * sin(_t * 12.0)) if on else 0.0
		beacon_mats[i].emission = b.light_color
	_cam_step(dt)
	_ft_tick(dt)

# ---- camera ----------------------------------------------------------------------------------------------------------------------------------
const PRESETS := {
	"wide": [Vector3(1, 3.2, -4), 0.12, -0.2, 18.5],
	"loop": [Vector3(-3, 2.5, -4), -0.45, -0.32, 20.0],
	"converter": [Vector3(5.5, 6.0, -3.0), 0.35, -0.08, 11.0],
	"gauge": [Vector3(6.25, 4.2, -1.6), 0.25, -0.05, 0.85],
	"bench": [Vector3(-1.4, 1.15, 10.5), -0.25, -0.38, 1.9],
	"outside": [Vector3(20, 14, -60), 0.25, 0.04, 70.0],
	"xray": [Vector3(5.5, 5.8, -3.0), 0.35, -0.06, 9.5],
}
func set_camera(spec: String) -> void:
	for part in spec.split(","):
		var p := part.strip_edges()
		if p == "rot+": t_yaw += PI / 8.0; continue
		if p == "rot-": t_yaw -= PI / 8.0; continue
		if not PRESETS.has(p): continue
		var v: Array = PRESETS[p]
		t_focus = v[0]; t_yaw = v[1]; t_pitch = v[2]; t_dist = v[3]
		set_xray(p == "xray")
	if OS.has_environment("CB_SHOT"): _snap_cam()
func _snap_cam() -> void: focus = t_focus; yaw = t_yaw; pitch = t_pitch; dist = t_dist; _apply_cam()
func set_xray(on: bool) -> void:
	xray = on
	if shell_node: shell_node.visible = not on; shell_x_node.visible = on
func _cam_step(dt: float) -> void:
	var held := Vector3.ZERO
	if not _typing():
		if Input.is_key_pressed(KEY_W): held.z -= 1
		if Input.is_key_pressed(KEY_S): held.z += 1
		if Input.is_key_pressed(KEY_A): held.x -= 1
		if Input.is_key_pressed(KEY_D): held.x += 1
	if held != Vector3.ZERO: t_focus += Basis(Vector3.UP, yaw) * held.normalized() * dt * clampf(dist * 0.6, 1.0, 18.0)
	# pad: left stick pans, right stick orbits, triggers zoom
	var lx := Input.get_joy_axis(0, JOY_AXIS_LEFT_X); var ly := Input.get_joy_axis(0, JOY_AXIS_LEFT_Y)
	var rx := Input.get_joy_axis(0, JOY_AXIS_RIGHT_X); var ry := Input.get_joy_axis(0, JOY_AXIS_RIGHT_Y)
	if Vector2(lx, ly).length() > 0.2: t_focus += Basis(Vector3.UP, yaw) * Vector3(lx, 0, ly) * dt * clampf(dist * 0.6, 1.0, 18.0)
	if Vector2(rx, ry).length() > 0.2: t_yaw -= rx * dt * 1.8; t_pitch = clampf(t_pitch - ry * dt * 1.2, -1.35, 0.25)
	var zt := Input.get_joy_axis(0, JOY_AXIS_TRIGGER_RIGHT) - Input.get_joy_axis(0, JOY_AXIS_TRIGGER_LEFT)
	if absf(zt) > 0.1: t_dist = clampf(t_dist * (1.0 - zt * dt * 1.5), 0.45, 80.0)
	var outside := t_focus.z < -16.0
	if not outside: t_focus = t_focus.clamp(HALL_MIN + Vector3(1, 0, 1), HALL_MAX - Vector3(1, 1, 1))
	var a := clampf(dt * 6.0, 0.0, 1.0)
	focus = focus.lerp(t_focus, a); yaw = lerp_angle(yaw, t_yaw, a); pitch = lerpf(pitch, t_pitch, a); dist = lerpf(dist, t_dist, a)
	_apply_cam()
func _apply_cam() -> void:
	if cam == null: return
	var dir := Basis(Vector3.UP, yaw) * Basis(Vector3.RIGHT, pitch) * Vector3(0, 0, 1)
	var p := focus + dir * dist
	if focus.z > -16.0: p = p.clamp(HALL_MIN, HALL_MAX)   # never outside the hall: the walls are the limit, the glass shows the rest
	else: p = p.clamp(Vector3(-28.0, 1.0, -14.4), Vector3(28.0, 17.0, -14.4))   # the outside view looks through the glass from just inside it
	cam.position = p
	cam.look_at(focus if focus.distance_to(p) > 0.01 else focus + Vector3(0, 0, -1), Vector3.UP)
	if cam.attributes == null and tier == "ultra" and OS.get_environment("CB_NODOF") != "1":
		var at := CameraAttributesPractical.new(); at.dof_blur_far_enabled = true; at.dof_blur_amount = 0.06; cam.attributes = at
	if cam.attributes is CameraAttributesPractical:
		var at2 := cam.attributes as CameraAttributesPractical
		at2.dof_blur_far_distance = dist * 1.6 + 0.5; at2.dof_blur_far_transition = dist * 1.5 + 1.0
		at2.dof_blur_far_enabled = tier == "ultra" and dist < 6.0
func _typing() -> bool:
	var f := get_viewport().gui_get_focus_owner() if is_inside_tree() else null
	return f is LineEdit or f is TextEdit

func _unhandled_input(e: InputEvent) -> void:
	if not visible or (app != null and app.modal() != null): return
	if e is InputEventMouseButton:
		var mb := e as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_WHEEL_UP and mb.pressed: t_dist = clampf(t_dist * 0.88, 0.45, 80.0); get_viewport().set_input_as_handled()
		elif mb.button_index == MOUSE_BUTTON_WHEEL_DOWN and mb.pressed: t_dist = clampf(t_dist / 0.88, 0.45, 80.0); get_viewport().set_input_as_handled()
		elif mb.button_index in [MOUSE_BUTTON_RIGHT, MOUSE_BUTTON_MIDDLE]: _drag = 1 if mb.pressed else 0
		elif mb.button_index == MOUSE_BUTTON_LEFT:
			if mb.pressed: _drag = 2; _drag_moved = 0.0
			else:
				if _drag == 2 and _drag_moved < 6.0:
					var r := pick(mb.position)
					if r != "": picked.emit(r)
				_drag = 0
	elif e is InputEventMouseMotion and _drag != 0:
		var mm := e as InputEventMouseMotion
		_drag_moved += mm.relative.length()
		if _drag == 1: t_yaw -= mm.relative.x * 0.006; t_pitch = clampf(t_pitch - mm.relative.y * 0.005, -1.35, 0.25)
		elif _drag_moved >= 6.0:
			var s := dist * 0.0016
			t_focus += Basis(Vector3.UP, yaw) * Vector3(-mm.relative.x * s, 0, -mm.relative.y * s)
	elif e is InputEventScreenDrag:
		var sd := e as InputEventScreenDrag
		t_yaw -= sd.relative.x * 0.006; t_pitch = clampf(t_pitch - sd.relative.y * 0.005, -1.35, 0.25)
	elif e is InputEventMagnifyGesture: t_dist = clampf(t_dist / (e as InputEventMagnifyGesture).factor, 0.45, 80.0)

func key(e: InputEventKey) -> bool:
	match e.keycode:
		KEY_1: set_camera("wide"); return true
		KEY_2: set_camera("loop"); return true
		KEY_3: set_camera("converter"); return true
		KEY_4: set_camera("gauge"); return true
		KEY_5: set_camera("bench"); return true
		KEY_6: set_camera("outside"); return true
		KEY_X: set_xray(not xray); return true
		KEY_Q: t_yaw -= PI / 8.0; return true
		KEY_E: t_yaw += PI / 8.0; return true
	return false

func pick(p: Vector2) -> String:
	var best := ""; var bd := 1e9
	for r in radius:
		var a: Vector3 = anchors[r]
		if cam.is_position_behind(a): continue
		var sp := cam.unproject_position(a)
		var edge := cam.unproject_position(a + cam.global_transform.basis.x * float(radius[r]))
		var rpx := maxf(sp.distance_to(edge), 18.0)
		var d := sp.distance_to(p)
		if d < rpx and d < bd: bd = d; best = r
	return best

func anchor_screen(role: String) -> Vector2:
	if not anchors.has(role) or cam == null: return Vector2(-9999, -9999)
	var a: Vector3 = anchors[role]
	if cam.is_position_behind(a): return Vector2(-9999, -9999)
	var s := cam.unproject_position(a)
	var vr := get_viewport().get_visible_rect()
	if not vr.grow(-4.0).has_point(s): return Vector2(-9999, -9999)
	return s
## How big a role looks on screen (px radius): the HUD shrinks its cards for small things.
func anchor_size(role: String) -> float:
	if not anchors.has(role) or cam == null or cam.is_position_behind(anchors[role]): return 0.0
	var a: Vector3 = anchors[role]
	return cam.unproject_position(a).distance_to(cam.unproject_position(a + cam.global_transform.basis.x * float(radius.get(role, 1.0))))

# ---- frame time (CB_FRAMETIME=1) -----------------------------------------------------------------------------------------------------------
var _ft: Array = []; var _ft_t := -1.0
func _ft_start() -> void: _ft_t = 0.0
func _ft_tick(dt: float) -> void:
	if _ft_t < 0.0: return
	_ft_t += dt
	if _ft_t > 3.0 and _ft_t < 7.0: _ft.append(dt * 1000.0)
	elif _ft_t >= 7.0 and not _ft.is_empty():
		var s := _ft.duplicate(); s.sort()
		var avg := 0.0
		for v in s: avg += v
		avg /= s.size()
		var vs := get_viewport().get_visible_rect().size
		for w in get_tree().root.find_children("*", "WorldEnvironment", true, false): print("WENV ", w.get_path(), " env=", (w as WorldEnvironment).environment, " vis_world=", (w as Node).get_viewport())
		print("WORLD env=", get_viewport().world_3d.environment, " fallback=", get_viewport().world_3d.fallback_environment, " lab_vis=", is_visible_in_tree())
		print("CAMDBG ", cam.global_position, " cur=", get_viewport().get_camera_3d().get_path(), " focus=", focus, " dist=", dist)
		print("FRAMETIME avg_ms=%.2f p95_ms=%.2f res=%dx%d tier=%s adapter=%s n=%d" % [avg, s[int(s.size() * 0.95)], vs.x, vs.y, tier, RenderingServer.get_video_adapter_name(), s.size()])
		_ft.clear(); _ft_t = -1.0
