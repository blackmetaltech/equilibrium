class_name LabWorld
extends Node3D
## LOOK2 slice world (docs/LOOK2.md): the genius's process hall at 02:40 with the ammonia loop of L00 at pilot scale, a lab bench in front, and the
## plant at night through a glass wall. Procedural geometry, CC0 textures (docs/ASSETS.md) and the shaders in look2/shaders. It reads the engine
## snapshot only and never calls an engine action. World units are metres; the hall spans x -30..30, z -15..15, y 0..18; the glass wall is z = -15.
signal picked(role: String)
signal control_changed(key: String, value: float)   ## the player dragged an in-world control: "T" (kelvin) on the cooler's handwheel
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
var drift := 0.0      ## rad/s of slow yaw (the title backdrop)
var anchors := {}       ## role -> Vector3 (HUD anchor)
var radius := {}        ## role -> m (pick radius)
var streams := {}       ## role key -> stream id: conv_out, liq, purge, cool_out
var _nh3_i := -1
var _T0 := 0.0          ## converter outlet at the start of the shift (K)
var heat := 0.0; var heat_to := 0.0
var cw_on := 1.0; var cw_to := 1.0
var flare := 0.15; var flare_to := 0.15
var level := 0.55; var level_to := 0.55; var _liq0 := 0.0
var pink := 0.0; var pink_to := 0.0; var nh3_out := 0.0   ## converter outlet NH3 mole fraction (the HUD may read it)
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
var _stage := OS.get_environment("CB_STAGE") != "0"   ## the world moves the camera to the two story beats (CB_STAGE=0 for fixed screenshots)
var wheel: Node3D; var wheel_k := 0.0; var _wh_drag := false; var _wh_val := 0.0   ## the handwheel: drag it to set the cooler (control_changed on release)   ## the lit handwheel on the cooler mirrors the dial

# ---------------------------------------------------------------------------------------------------------------------------------------------
func _ready() -> void:
	_build_env(); _build_hall(); _build_loop(); _build_bench(); _build_outside()
	cam = Camera3D.new(); cam.fov = 50.0; cam.near = 0.05; cam.far = 3000.0; add_child(cam)
	set_camera("wide"); _snap_cam()
	print("LOOK2 world: %d mesh instances, %d lights" % [find_children("*", "MeshInstance3D", true, false).size(), find_children("*", "Light3D", true, false).size()])
	if OS.get_environment("CB_FRAMETIME") == "1": _ft_start()

func setup(role_ids: Dictionary) -> void:
	ids = role_ids
	for r in tags: (tags[r] as Label3D).text = str(ids.get(r, ""))
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
	if detail_out != null: detail_out.visible = not compat   # the outdoor structure is the first thing the iGPU tier drops
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
	# lights: shadows only on ultra; below it the far plant lights outside the glass go dark (their emissive bulbs stay) and the reflection probe is off on compat
	for l in find_children("*", "Light3D", true, false):
		var li := l as Light3D
		if not li.has_meta("shadow0"): li.set_meta("shadow0", li.shadow_enabled)
		li.shadow_enabled = bool(li.get_meta("shadow0")) and (ultra or (t == "high" and li is DirectionalLight3D))
		if li is OmniLight3D and li.global_position.z < -20.0 and li != flare_light: li.visible = ultra
	for r in find_children("*", "ReflectionProbe", true, false): (r as ReflectionProbe).visible = not compat
	# 3D render scale: full on ultra, FSR at 77 % on high, 60 % on compat (the HUD stays at full resolution)
	var vp := get_viewport()
	# AA (phase B): ultra = native, MSAA 2x for edges plus TAA; high = FSR2 at 77 % (temporal upscale doubles as AA); compat = FSR1 at 60 % with FXAA
	var rd := RenderingServer.get_rendering_device() != null
	vp.scaling_3d_mode = Viewport.SCALING_3D_MODE_BILINEAR if (ultra or not rd) else (Viewport.SCALING_3D_MODE_FSR2 if t == "high" else Viewport.SCALING_3D_MODE_FSR)
	vp.scaling_3d_scale = 1.0 if ultra else (0.77 if t == "high" else 0.6)
	vp.msaa_3d = Viewport.MSAA_2X if ultra else Viewport.MSAA_DISABLED
	vp.use_taa = ultra
	vp.screen_space_aa = Viewport.SCREEN_SPACE_AA_FXAA if compat else Viewport.SCREEN_SPACE_AA_DISABLED

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
	var m := StandardMaterial3D.new(); m.albedo_color = c; m.metallic = 0.1; m.roughness = 0.55   # flat paint: the tread-plate normal map read as checker plate on walls
	m.roughness_texture = _tex("metal_plate_rough"); m.uv1_triplanar = true; m.uv1_world_triplanar = true; m.uv1_scale = Vector3.ONE * 0.6; return m
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
	M.steel = _shader("steel", {"rough_base": 0.34, "metallic": 0.8, "blotch": 0.4})
	M.steel_dull = _shader("steel", {"rough_base": 0.45, "albedo": Color(0.62, 0.64, 0.66)})
	M.clad = _flat(Color(0.78, 0.8, 0.82), 0.6, 0.42)                       # aluminium jacketing on insulated lines
	M.paint_green = _paint(Color(0.36, 0.5, 0.42))
	M.paint_blue = _paint(Color(0.3, 0.36, 0.42))
	M.paint_grey = _paint(Color(0.55, 0.56, 0.56))
	M.yellow = _flat(Color(0.74, 0.58, 0.14), 0.15, 0.6)   # muted safety yellow
	M.red = _flat(Color(0.72, 0.08, 0.06), 0.2, 0.45)
	M.black = _flat(Color(0.05, 0.05, 0.055), 0.5, 0.5)
	M.plate = _pbr("metal_plate", 0.5, Color(0.8, 0.8, 0.8), true)
	M.wall = _pbr("concrete_slab_wall", 0.12, Color(0.78, 0.77, 0.75))
	M.rust = _pbr("rusty_metal_02", 0.2)
	M.corr = _pbr("corrugated_iron", 0.25, Color(0.55, 0.58, 0.6), true)
	M.glass = _shader("glass", {"tint": Color(0.75, 0.86, 0.92, 0.07)})
	M.brass = _flat(Color(0.78, 0.6, 0.3), 1.0, 0.3)
	M.concrete_out = _pbr("concrete_floor_worn_02", 0.06, Color(0.42, 0.42, 0.43))
	# round 3 (phase B): each vessel its own finish, not one blotchy steel everywhere
	M.heat_paint = _flat(Color(0.6, 0.61, 0.6), 0.55, 0.48)                    # silicone aluminium heat-resistant paint on the fired heater
	M.refractory = _flat(Color(0.42, 0.2, 0.12), 0.0, 0.9)                     # burner tile
	M.enamel_green = _flat(Color(0.24, 0.42, 0.36), 0.05, 0.32)                # the cooler's glossy machinery green
	M.enamel_blue = _flat(Color(0.18, 0.3, 0.5), 0.05, 0.35)

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
	if a.distance_to(b) < 1e-4: b = a + Vector3(0, 1e-3, 0)   # a zero-length segment cannot be oriented (playtest log)
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
var tags := {}   ## role -> Label3D painted on the equipment (text set from the engine ids in setup)
func _stencil(role: String, pos: Vector3, facing: Vector3, px := 0.006) -> void:
	var l := Label3D.new(); l.text = role; l.billboard = BaseMaterial3D.BILLBOARD_DISABLED; l.shaded = true; l.double_sided = false
	l.font = load("res://ui/fonts/Archivo-Variable.ttf"); l.font_size = 96; l.pixel_size = px; l.outline_size = 0
	l.modulate = Color(0.08, 0.09, 0.1, 0.85); l.render_priority = 1
	add_child(l); l.look_at_from_position(pos, pos - facing, Vector3.UP)
	tags[role] = l
func _gauge(pos: Vector3, facing: Vector3, parent: Node = self, val := 0.6, r := 0.11) -> ShaderMaterial:
	var g := Node3D.new(); parent.add_child(g); g.position = pos
	g.look_at_from_position(pos, pos + facing, Vector3.UP)
	var bez := _seg(Vector3(0, 0, 0.0), Vector3(0, 0, -0.06), r, M.steel, g, 32)
	var gm := _shader("gauge", {"value": val})
	var face := QuadMesh.new(); face.size = Vector2.ONE * r * 1.76   # a quad faces +Z; the dial looks out along -Z of this frame
	var fn := _mi(face, Vector3(0, 0, -0.062), gm, g); fn.rotation_degrees.y = 180
	var gl := _mi(face.duplicate(), Vector3(0, 0, -0.07), M.glass, g); gl.rotation_degrees.y = 180
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
	var sky := Sky.new(); var pano := PanoramaSkyMaterial.new(); pano.panorama = load("res://look2/assets/dikhololo_night_1k.hdr"); pano.energy_multiplier = 0.12 if get_script() == LabWorld else 0.22; sky.sky_material = pano   # round 3: a darker night outside the L00 hall
	env.background_mode = Environment.BG_SKY; env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY; env.ambient_light_energy = 0.26 if get_script() == LabWorld else 0.35; env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	env.tonemap_mode = Environment.TONE_MAPPER_ACES; env.tonemap_exposure = 1.1; env.tonemap_white = 6.0
	env.glow_enabled = true; env.glow_intensity = 0.55; env.glow_bloom = 0.06; env.glow_hdr_threshold = 1.1; env.glow_blend_mode = Environment.GLOW_BLEND_MODE_SOFTLIGHT
	env.ssao_enabled = true; env.ssao_radius = 1.4; env.ssao_intensity = 2.2
	env.ssr_enabled = true; env.ssr_max_steps = 96; env.ssr_fade_in = 0.1; env.ssr_fade_out = 2.5
	env.ssil_enabled = true
	env.sdfgi_enabled = true; env.sdfgi_use_occlusion = true; env.sdfgi_energy = 0.9; env.sdfgi_cascades = 4; env.sdfgi_min_cell_size = 0.15
	env.volumetric_fog_enabled = true; env.volumetric_fog_density = 0.0065; env.volumetric_fog_albedo = Color(0.7, 0.7, 0.72); env.volumetric_fog_emission = Color(0.0, 0.0, 0.0)
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
	_mi(fl, Vector3.ZERO, _shader("floor", {"diff": _tex("concrete_floor_02_diff"), "rgh": _tex("concrete_floor_02_rough"), "nor": _tex("concrete_floor_02_nor"), "wet": 0.9, "contrast": 0.5}))
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
	# 0.12 (Sigrid: "an unexplained orange cube"): a hook block that reads as one, hung high on twin wire ropes that are visible from the floor
	for dx in [-0.12, 0.12]: _seg(Vector3(-9.0 + dx, 12.8, 3.0), Vector3(-9.0 + dx, 10.45, 3.0), 0.03, M.steel_dull)
	_box(Vector3(0.62, 0.55, 0.22), Vector3(-9.0, 10.2, 3.0), M.yellow)   # the block's side plates
	_cyl(0.2, 0.26, Vector3(-9.0, 10.3, 3.0), M.steel_dull).rotation_degrees.x = 90   # sheave
	_seg(Vector3(-9.0, 9.92, 3.0), Vector3(-9.0, 9.7, 3.0), 0.05, M.steel_dull)   # shank
	var hk := _torus(0.17, 0.05, Vector3(-9.0, 9.5, 3.0), M.yellow); hk.rotation_degrees.x = 90   # the hook
	# cool LED strips along the glass wall head and fill lights over the loop (the 0.9 gantry in front of the glass is cut: it hid the view)
	_box(Vector3(60, 0.06, 0.1), Vector3(0, 14.9, -14.9), _flat(Color.WHITE, 0, 0.5, Color(0.75, 0.88, 1.0), 5.0))
	for i in 4:
		var l := OmniLight3D.new(); l.light_color = Color(0.7, 0.85, 1.0); l.light_energy = 3.5; l.omni_range = 14.0; l.light_volumetric_fog_energy = 0.3; l.position = Vector3(-12 + i * 9, 7.5, -7.0); add_child(l)
	# sodium high-bays
	var k := 0
	for x in [-24.0, -12.0, 0.0, 12.0, 24.0]:
		for z in [-6.0, 6.0]:
			_cyl(0.35, 0.4, Vector3(x, 16.6, z), M.black, self, 0.12)
			_cyl(0.33, 0.02, Vector3(x, 16.38, z), _flat(Color(1, 0.7, 0.4), 0, 0.5, Color(1.0, 0.62, 0.28), 14.0))
			var s := SpotLight3D.new(); s.light_color = Color(1.0, 0.84, 0.66); s.light_energy = 9.0; s.spot_range = 26.0; s.spot_angle = 40.0; s.spot_attenuation = 0.8
			s.position = Vector3(x, 16.3, z); s.rotation_degrees.x = -90; s.shadow_enabled = k % 3 == 0; s.light_volumetric_fog_energy = 6.0; add_child(s)
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
	_stencil("compressor", Vector3(cx + 1.2, 1.17, fz + 0.635), Vector3(0, 0, 1), 0.003)
	# --- fired preheater: refractory box, peep ports with flame, burner, stack to the roof ---
	var hx := -7.0
	_box(Vector3(3.0, 4.2, 2.6), Vector3(hx, 2.28, fz), M.heat_paint)
	for i in 4: _box(Vector3(3.08, 0.08, 2.68), Vector3(hx, 0.6 + i * 1.2, fz), M.black)
	_box(Vector3(2.0, 1.6, 1.8), Vector3(hx + 0.3, 5.2, fz - 0.2), M.heat_paint)      # convection section on top of the radiant box
	for i in 3: _box(Vector3(2.06, 0.06, 1.86), Vector3(hx + 0.3, 4.6 + i * 0.6, fz - 0.2), M.black)
	for i in 3:   # burner row under the floor: tile throats with a flame in each
		var bp := Vector3(hx - 0.9 + i * 0.9, 0.16, fz + 0.6)
		_cyl(0.2, 0.12, bp, M.refractory)
		_cyl(0.1, 0.14, bp + Vector3(0, 0.02, 0), _flat(Color(1, 0.45, 0.1), 0, 1, Color(1.0, 0.42, 0.08), 6.0))
	m_peep = _shader("flame", {"intensity": 1.4, "width": 0.9, "speed": 1.4})
	for i in 3:
		var pp := Vector3(hx - 0.9 + i * 0.9, 1.4, fz + 1.31)
		_cyl(0.11, 0.08, pp, M.steel_dull).rotation_degrees.x = 90
		var q := QuadMesh.new(); q.size = Vector2(0.17, 0.17); _mi(q, pp + Vector3(0, 0, 0.045), _flat(Color(1, 0.5, 0.15), 0, 1, Color(1.0, 0.45, 0.1), 8.0))
	heater_light = OmniLight3D.new(); heater_light.light_color = Color(1.0, 0.5, 0.18); heater_light.light_energy = 0.8; heater_light.omni_range = 3.0; heater_light.position = Vector3(hx, 1.4, fz + 1.8); add_child(heater_light)
	_cyl(0.32, 14.0, Vector3(hx + 0.6, 11.4, fz - 0.4), M.rust)
	_cyl(0.4, 0.3, Vector3(hx + 0.6, 6.1, fz - 0.4), M.steel_dull)
	_pipe([Vector3(-7.0, 3.4, fz), Vector3(hx - 1.6, 3.4, fz)], 0.1, M.steel, self, false)
	_pipe([Vector3(hx + 1.5, 2.0, fz), Vector3(-3.5, 2.0, fz)], 0.1, M.clad)
	anchors["heater"] = Vector3(hx, 4.8, fz); radius["heater"] = 2.2
	_stencil("heater", Vector3(hx, 3.5, fz + 1.312), Vector3(0, 0, 1), 0.005)
	# --- trim cooler: horizontal shell-and-tube on saddles, CW in/out, CW pump ---
	var kx := -1.0
	var shell := _cyl(0.5, 4.2, Vector3(kx, 1.6, fz), M.enamel_green); shell.rotation_degrees.z = 90
	for s in [-1.0, 1.0]:
		_cyl(0.62, 0.14, Vector3(kx + s * 2.15, 1.6, fz), M.steel_dull).rotation_degrees.z = 90
		_sph(0.5, Vector3(kx + s * 2.25, 1.6, fz), M.enamel_green, self, true).rotation_degrees.z = -90 * s
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
	_stencil("cooler", Vector3(kx, 1.6, fz + 0.512), Vector3(0, 0, 1), 0.0035)
	wheel = Node3D.new(); wheel.position = Vector3(kx + 1.2, 1.6, fz + 0.95); add_child(wheel); anchors["wheel"] = wheel.position; radius["wheel"] = 0.3   # the temperature control valve's handwheel, lit: it turns with the dial
	_seg(Vector3(kx + 1.2, 1.6, fz + 0.5), Vector3(kx + 1.2, 1.6, fz + 0.95), 0.03, M.steel)
	var wr := _torus(0.22, 0.018, Vector3.ZERO, _flat(Color(0.1, 0.5, 0.48), 0.3, 0.35, Color(0.18, 0.77, 0.71), 2.5), wheel); wr.rotation_degrees.x = 90
	for i in 3: _seg(Vector3.ZERO, Vector3(cos(TAU * i / 3.0), sin(TAU * i / 3.0), 0) * 0.21, 0.012, M.steel, wheel)
	anchors["cw_pump"] = Vector3(kx - 0.5, 1.3, pz)
	# --- the converter: thick-walled vessel on a skirt, flanged top head, nozzles, sight port, ladder, platform ---
	var vx := 5.5; var vz := -3.0; var vr := 1.15; var vh := 8.0; var vb := 1.6
	_cyl(vr * 0.98, vb, Vector3(vx, vb * 0.5 + 0.18, vz), M.paint_grey)     # skirt
	m_shell = _shader("steel", {"rough_base": 0.3, "metallic": 0.8, "blotch": 0.15, "streak": Vector3(140.0, 6.0, 140.0), "yrange": Vector2(-vh * 0.5, vh * 0.5), "emit_gain": 0.3})
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
	for i in 9: _cyl(vr + 0.025, 0.07, Vector3(vx, vb + 0.18 + 0.5 + i * 0.95, vz), M.clad, self, -1.0, 48)   # round 3: aluminium cladding bands
	# catalyst beds inside (seen in x-ray)
	m_beds = _shader("beds", {"heat": 0.15, "emit_gain": 1.3})
	for i in 3: _cyl(vr * 0.9, 1.6, Vector3(vx, vb + 1.4 + i * 2.5, vz), m_beds, self, -1.0, 32)
	var hero := SpotLight3D.new(); hero.light_color = Color(0.82, 0.9, 1.0); hero.light_energy = 16.0; hero.spot_range = 30.0; hero.spot_angle = 16.0; hero.shadow_enabled = true
	hero.light_volumetric_fog_energy = 5.0; hero.position = Vector3(vx + 9.0, 15.5, vz + 6.0); add_child(hero); hero.look_at(Vector3(vx, vb + 3.5, vz))   # cool key on the hero vessel through the haze
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
	var ta := -0.62   # on the shell, left of the ladder, flat to the surface normal there
	_stencil("converter", Vector3(vx + sin(ta) * (vr + 0.012), vb + 6.0, vz + cos(ta) * (vr + 0.012)), Vector3(sin(ta), 0, cos(ta)), 0.0042)
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
	m_sep = _shader("steel", {"rough_base": 0.36, "metallic": 0.75, "blotch": 0.25, "frost": 0.25, "frost_h": 1.0, "yrange": Vector2(-sh * 0.5, sh * 0.5)})
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
	_stencil("separator", Vector3(sx, 3.3, vz + sr + 0.012), Vector3(0, 0, 1), 0.0026)
	# vapour to the splitter, purge up and out through the glass wall to the flare, recycle back along the rack
	var tx := 16.0; var tz := 1.0
	_pipe([Vector3(sx, 1.08 + sh + sr, vz), Vector3(sx, 6.0, vz), Vector3(tx, 6.0, vz), Vector3(tx, 6.0, tz), Vector3(tx, 2.2, tz)], 0.09, M.steel)
	_box(Vector3(0.7, 0.9, 0.7), Vector3(tx, 1.75, tz), M.enamel_blue)   # splitter body
	anchors["splitter"] = Vector3(tx, 2.6, tz); radius["splitter"] = 0.9
	_pipe([Vector3(tx + 0.35, 1.75, tz), Vector3(19.0, 1.75, tz), Vector3(19.0, 12.6, tz), Vector3(19.0, 12.6, -14.9)], 0.05, _paint(Color(0.4, 0.42, 0.41)))   # purge line: grey, not a red stroke across the opening frame
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
	_box(Vector3(5.0, 0.05, 1.3), Vector3(bx, top, bz), _flat(Color(0.2, 0.21, 0.22), 0.0, 0.3))    # epoxy resin top
	_box(Vector3(4.9, 0.85, 1.2), Vector3(bx, 0.45, bz), M.paint_grey)
	_box(Vector3(5.0, 0.9, 0.08), Vector3(bx, top + 0.45, bz - 0.62), M.paint_grey)                 # back panel / shelf
	_box(Vector3(5.0, 0.03, 0.3), Vector3(bx, top + 0.7, bz - 0.5), M.steel_dull)
	var lamp := SpotLight3D.new(); lamp.light_color = Color(0.95, 0.97, 1.0); lamp.light_energy = 6.0; lamp.spot_range = 4.0; lamp.spot_angle = 50.0; lamp.shadow_enabled = true
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
	_outside_detail()
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
	anchors["flare"] = Vector3(19.0, 12.9, -14.0); radius["flare"] = 1.0   # where the purge line leaves the hall (the stack itself is far outside)
	flare_tip = Vector3(fx, fh + 6.0, fz)
var flare_tip := Vector3.ZERO
var detail_out: Node3D   ## round 2: structure on the outdoor plant (hidden on compat)

## One MultiMesh for many copies of a part (bolts of the outdoor plant): one draw call.
func _mm(mesh: Mesh, xf: Array, mat: Material, parent: Node) -> MultiMeshInstance3D:
	var mm := MultiMesh.new(); mm.transform_format = MultiMesh.TRANSFORM_3D; mm.mesh = mesh; mm.instance_count = xf.size()
	for i in xf.size(): mm.set_instance_transform(i, xf[i])
	var mi := MultiMeshInstance3D.new(); mi.multimesh = mm; mi.material_override = mat; parent.add_child(mi); return mi

## A unit box stretched from a to b (a strut), as a transform for _mm.
func _strut(a: Vector3, b: Vector3, w: float) -> Transform3D:
	var d := b - a; var up := d.normalized()
	var x := up.cross(Vector3.FORWARD if absf(up.dot(Vector3.FORWARD)) < 0.9 else Vector3.RIGHT).normalized(); var z := x.cross(up)
	return Transform3D(Basis(x * w, d, z * w), (a + b) * 0.5)

func _outside_detail() -> void:
	detail_out = Node3D.new(); detail_out.name = "outside_detail"; add_child(detail_out)
	var box := BoxMesh.new(); box.size = Vector3.ONE
	var legs := []; var rails := []; var plats := []; var steps := []
	# cooling towers: the X-braced ring of legs at the base, a lip, a ladder and a lit service platform at the top
	for t in [[-60.0, -150.0, 1.0], [-10.0, -170.0, 1.1], [45.0, -160.0, 0.95]]:
		var c := Vector3(t[0], 0, t[1]); var sc: float = t[2]; var r0 := 22.0 * sc
		for k in 40:
			var a0 := TAU * k / 40.0; var a1 := TAU * (k + 1) / 40.0
			legs.append(_strut(c + Vector3(cos(a0) * r0, 0, sin(a0) * r0), c + Vector3(cos(a1) * r0, 4.0 * sc, sin(a1) * r0), 0.6))
			legs.append(_strut(c + Vector3(cos(a1), 0, sin(a1)) * r0, c + Vector3(cos(a0) * r0, 4.0 * sc, sin(a0) * r0), 0.6))
		var top := 60.0 * sc; var rt: float = sc * (22.0 - 14.0 * sin(PI * 0.62) + 3.0)
		_torus(rt + 0.3, 0.5, c + Vector3(0, top, 0), M.concrete_out, detail_out)
		_torus(rt + 0.2, 0.08, c + Vector3(0, top + 1.1, 0), M.steel_dull, detail_out)
		for k in 30: steps.append(_strut(c + Vector3(r0 * 0.98, k * 2.0, 0), c + Vector3(r0 * 0.98, k * 2.0 + 0.1, 0.8), 0.08))
	# distillation columns: insulation, platforms with handrails every 6 m, a caged ladder, a riser pipe, a davit at the top
	for i in 4:
		var p := Vector3(-40.0 + i * 25.0, 0, -55.0); var h := 28.0 + i * 6.0
		_cyl(1.75, h - 2.0, p + Vector3(0, h * 0.5, 0), M.clad, detail_out, -1.0, 24)
		for k in int(h / 6.0):
			var y := 6.0 + k * 6.0
			_cyl(2.8, 0.12, p + Vector3(0, y, 0), M.plate, detail_out, -1.0, 24)
			_torus(2.75, 0.04, p + Vector3(0, y + 1.05, 0), M.yellow, detail_out)
			for a in 8: rails.append(_strut(p + Vector3(cos(TAU * a / 8.0) * 2.75, y, sin(TAU * a / 8.0) * 2.75), p + Vector3(cos(TAU * a / 8.0) * 2.75, y + 1.05, sin(TAU * a / 8.0) * 2.75), 0.05))
		for k in int(h / 0.4): steps.append(_strut(p + Vector3(-2.15, k * 0.4, -0.25), p + Vector3(-2.15, k * 0.4 + 0.03, 0.25), 0.04))
		_seg(p + Vector3(-2.15, 0, -0.27), p + Vector3(-2.15, h, -0.27), 0.03, M.yellow, detail_out); _seg(p + Vector3(-2.15, 0, 0.27), p + Vector3(-2.15, h, 0.27), 0.03, M.yellow, detail_out)
		_seg(p + Vector3(1.95, 0.5, 0.9), p + Vector3(1.95, h + 1.0, 0.9), 0.22, M.steel_dull, detail_out)
		_seg(p + Vector3(0, h, 0), p + Vector3(0, h + 3.0, 0), 0.1, M.yellow, detail_out); _seg(p + Vector3(0, h + 3.0, 0), p + Vector3(2.0, h + 3.0, 0), 0.08, M.yellow, detail_out)
		var bl := OmniLight3D.new(); bl.light_color = Color(1.0, 0.2, 0.12); bl.light_energy = 3.0; bl.omni_range = 5.0; bl.position = p + Vector3(0, h + 3.4, 0); detail_out.add_child(bl)
		_sph(0.25, bl.position, _flat(Color.WHITE, 0, 0.5, Color(1.0, 0.2, 0.12), 14.0), detail_out)
	# tanks: a spiral stair, wind girder, roof handrail, a lit stair head
	for i in 7:
		var p := Vector3(-110.0 + i * 34.0, 0, -80.0 - (i % 3) * 22.0)
		_torus(10.15, 0.18, p + Vector3(0, 11.0, 0), M.steel_dull, detail_out)
		_torus(9.9, 0.05, p + Vector3(0, 15.4, 0), M.yellow, detail_out)
		for k in 36:
			var a := 0.3 + k * 0.05; var y := k * 0.39
			steps.append(Transform3D(Basis(Vector3.UP, -a) * Basis.from_scale(Vector3(0.25, 0.06, 1.0)), p + Vector3(sin(a) * 10.55, y, cos(a) * 10.55)))
			rails.append(_strut(p + Vector3(sin(a) * 11.05, y, cos(a) * 11.05), p + Vector3(sin(a) * 11.05, y + 1.0, cos(a) * 11.05), 0.04))
		var sl := OmniLight3D.new(); sl.light_color = Color(1.0, 0.8, 0.55); sl.light_energy = 1.5; sl.omni_range = 9.0; var ea := 0.3 + 35 * 0.05; sl.position = p + Vector3(sin(ea) * 11.0, 15.6, cos(ea) * 11.0); detail_out.add_child(sl)
	_mm(box, legs, M.concrete_out, detail_out)
	_mm(box, rails, M.yellow, detail_out)
	_mm(box, steps, M.steel_dull, detail_out)

# ---- live state ------------------------------------------------------------------------------------------------------------------------------
## Phase C sound: drive the shell's synthesised plant bed (EqAudio: compressor drone, furnace roar, pipe hiss, flare rumble) from the world's
## live state. Each 0..1; all zero silences the plant. No human has listened to the mix yet (CRITIQUE-0.11).
func _sound_bed(comp: float, furn: float, flow: float, flare: float) -> void:
	if app == null or not ("audio_eq" in app) or app.audio_eq == null: return
	var on := visible and is_inside_tree()
	app.audio_eq.set_compressor(comp if on else 0.0); app.audio_eq.set_furnace(furn if on else 0.0)
	app.audio_eq.set_flow(flow if on else 0.0); app.audio_eq.set_flare(flare if on else 0.0)
func _sfx(k: String) -> void:
	if app != null and app.has_method("sfx"): app.sfx(k)
func _exit_tree() -> void: _sound_bed(0, 0, 0, 0)

func set_snapshot(g: Dictionary) -> void:
	var st := {}
	for s in g.get("streams", []): st[str(s.get("id", ""))] = s
	var us := {}
	for u in g.get("units", []): us[str(u.get("id", ""))] = u
	var sh = g.get("shift", null)
	var trips: Array = sh.get("trips", []) if sh is Dictionary else []
	var evs: Array = sh.get("events", []) if sh is Dictionary else []
	var was_tripped := tripped
	tripped = not trips.is_empty()
	if tripped and not was_tripped and _stage: set_camera("flare")   # the loop dumps to flare: show it
	var cw_trip := false
	for e in evs: if str(e.get("type", "")) == "cw_pump_trip": cw_trip = true
	if cw_trip and cw_to > 0.5 and _stage: set_camera("cooler")   # the water goes quiet: show the pump and the cooler
	cw_to = 0.0 if cw_trip else 1.0
	var cu2 = us.get(str(ids.get("cooler", "")), null)
	var co = st.get(str(streams.get("conv_out", "")), null)
	if co is Dictionary:
		var T := float(co.get("T", 0.0))
		if T > 0.0 and _T0 <= 0.0: _T0 = T
		if _T0 > 0.0: heat_to = clampf((T - _T0 - 4.0) / 60.0, 0.0, 1.3)   # nominal: no glow; +10 K a dull red, +40 K orange, +64 K bright
		# the snapshot lists the top three components; with this loop's four species, NH3 is the remainder when it is not among them
		var x := -1.0; var sum := 0.0
		for w in co.get("w", []):
			sum += float(w[1])
			if int(w[0]) == _nh3_i: x = float(w[1])
		if x < 0.0: x = maxf(1.0 - sum, 0.0)
		nh3_out = x
		pink_to = clampf(x / 0.11, 0.0, 1.0)
		run_to = 1.0 if float(co.get("flow", 0.0)) > 1e-6 and not tripped else 0.15
	if get_script() == LabWorld:   # phase C sound (L00): the loop compressor while it runs, the converter's fire by its heat, the flare roars on a trip; the cooling water hiss stops with the CW pump
		_sound_bed(0.8 if run_to > 0.5 else 0.1, clampf(0.25 + heat_to * 0.6, 0.0, 1.0), 0.5, 0.9 if tripped else 0.0)
		if app != null and "audio_eq" in app and app.audio_eq != null: app.audio_eq.set_cooling(0.5 * cw_to if visible else 0.0)
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
	var pq = app.b.q("plant") if app != null and app.b != null else null
	if pq is Dictionary:
		for u in pq.get("units", []):
			if str(u.get("id", "")) == str(ids.get("cooler", "-")): wheel_k = float(u.get("params", {}).get("T", 700.0))
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
		m_shell.set_shader_parameter("heat_lo", minf(h, 0.3)); m_shell.set_shader_parameter("heat_hi", minf(h, 0.3) * 0.25)   # a bare shell at ~620 C is dull red, never white
		m_shell_x.set_shader_parameter("heat_lo", h * 1.05); m_shell_x.set_shader_parameter("heat_hi", h * 0.35)
		m_beds.set_shader_parameter("heat", 0.16 + heat * 0.55); m_peep.set_shader_parameter("heat", 0.4 + heat * 0.6)
		m_shimmer.set_shader_parameter("strength", clampf(heat, 0.0, 1.2) * 0.02)
		conv_light.light_energy = h * 1.2 + (1.5 if xray else 0.0) * (0.3 + heat)   # a glow on the floor, not a red floodlight on the steel
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
		flare_light.light_energy = 1.0 + fl * 14.0
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
	if wheel and not _wh_drag: wheel.rotation.z = lerp_angle(wheel.rotation.z, (700.0 - wheel_k) / 100.0 * PI, clampf(dt * 4.0, 0, 1))
	_cam_step(dt)
	_ft_tick(dt)

# ---- camera ----------------------------------------------------------------------------------------------------------------------------------
const PRESETS := {
	"wide": [Vector3(3.0, 4.6, -3.0), PI * 0.5 + 0.42, -0.1, 21.0],   # the establishing view: down the length of the hall from the east end
	"front": [Vector3(1, 3.2, -4), 0.12, -0.2, 18.5],
	"loop": [Vector3(-3, 2.5, -4), -0.45, -0.32, 20.0],
	"converter": [Vector3(5.5, 6.0, -3.0), 0.35, -0.08, 11.0],
	"gauge": [Vector3(6.25, 4.2, -1.6), 0.25, -0.05, 0.85],
	"bench": [Vector3(-1.5, 1.1, 10.4), -0.35, -0.3, 2.3],
	"outside": [Vector3(20, 14, -60), 0.25, 0.04, 70.0],
	"xray": [Vector3(5.5, 5.8, -3.0), 0.35, -0.06, 9.5],
	"cooler": [Vector3(-1.5, 1.4, -5.6), 0.55, -0.22, 7.5],
}
func _look_from(eye: Vector3, target: Vector3) -> void:
	var d := eye - target
	t_focus = target; t_dist = d.length(); t_yaw = atan2(d.x, d.z); t_pitch = -asin(clampf(d.y / t_dist, -1.0, 1.0))
func set_camera(spec: String) -> void:
	for part in spec.split(","):
		var p := part.strip_edges()
		if p == "flare": _look_from(Vector3(16.0, 2.2, -13.6), flare_tip + Vector3(0, 4, 0)); set_xray(false); continue
		if p == "rot+": t_yaw += PI / 8.0; continue
		if p == "rot-": t_yaw -= PI / 8.0; continue
		if not PRESETS.has(p): continue
		var v: Array = PRESETS[p]
		t_focus = v[0]; t_yaw = v[1]; t_pitch = v[2]; t_dist = v[3]
		set_xray(p == "xray")
	if OS.has_environment("CB_SHOT"): _snap_cam()
func _snap_cam() -> void: focus = t_focus; yaw = t_yaw; pitch = t_pitch; dist = t_dist; _apply_cam()
## The HUD's dial mirrored onto the handwheel (the HUD calls this; the wheel's own drag emits control_changed).
func set_control_value(k: String, v: float) -> void:
	if k == "T": wheel_k = v
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
	if OS.has_environment("CB_ORBIT"): t_yaw += dt * float(OS.get_environment("CB_ORBIT"))   # captures: a slow orbit
	if drift != 0.0 and not CbSettings.reduced_motion: t_yaw += dt * drift   # the title: the camera drifts slowly round the hall
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
			if mb.pressed and wheel != null and pick(mb.position) == "wheel":   # grab the handwheel: drag sideways to turn it, release to commit
				_wh_drag = true; _wh_val = wheel_k; get_viewport().set_input_as_handled(); return
			if not mb.pressed and _wh_drag:
				_wh_drag = false; wheel_k = _wh_val; control_changed.emit("T", _wh_val); get_viewport().set_input_as_handled(); return
			if mb.pressed: _drag = 2; _drag_moved = 0.0
			else:
				if _drag == 2 and _drag_moved < 6.0:
					var r := pick(mb.position)
					if r != "": picked.emit(r)
				_drag = 0
	elif e is InputEventMouseMotion and _wh_drag:
		var dx := (e as InputEventMouseMotion).relative.x
		_wh_val = clampf(snappedf(_wh_val - dx * 0.5, 1.0), 400.0, 800.0); wheel.rotation.z -= dx * 0.015; get_viewport().set_input_as_handled()
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


# ---- vessel kit (phase C, owner: "real vessel models") ------------------------------------------------------------------------------------------
## A 2:1 ellipsoidal dished head (the standard pressure-vessel end) as a lathe profile: radius r, depth r/2, facing +Y (up=true) or -Y.
func _dished(r: float, pos: Vector3, mat: Material, parent: Node, up := true) -> void:
	var prof := PackedVector2Array()
	for i in 13:
		var a := PI * 0.5 * float(i) / 12.0
		prof.append(Vector2(r * cos(a), (r * 0.5) * sin(a) * (1.0 if up else -1.0)))
	prof.append(Vector2(0.0, (r * 0.5) * (1.0 if up else -1.0)))
	_lathe(prof, 40, mat, pos, parent, true)

## A vertical pressure vessel: shell, two dished heads, insulation cladding with seams, nozzles with flanges, a manway with its davit,
## a skirt (or four legs), and optionally a caged ladder with a top platform. Returns the shell top Y.
func _vessel(c: Vector3, r: float, h: float, shell: Material, parent: Node, opts := {}) -> float:
	var base := float(opts.get("base", 0.9))
	var y0 := c.y + base
	var clad: bool = opts.get("clad", false)
	var sm: Material = M.clad if clad else shell
	_cyl(r, h, Vector3(c.x, y0 + h * 0.5, c.z), sm, parent, -1.0, 40)
	_dished(r, Vector3(c.x, y0 + h, c.z), sm, parent, true)
	_dished(r, Vector3(c.x, y0, c.z), sm, parent, false)
	if clad:   # jacketing seams: circumferential bands every 0.9 m and one vertical seam line
		var n := int(h / 0.9)
		for i in n: _cyl(r + 0.012, 0.03, Vector3(c.x, y0 + 0.45 + i * 0.9, c.z), M.steel_dull, parent, -1.0, 40)
		_box(Vector3(0.02, h, 0.02), Vector3(c.x + r * 0.71, y0 + h * 0.5, c.z + r * 0.71), M.steel_dull, parent)
	if bool(opts.get("legs", false)):
		for a in 4:
			var ang := TAU * a / 4.0 + PI / 4.0
			var lp := Vector3(c.x + cos(ang) * r * 0.85, 0.0, c.z + sin(ang) * r * 0.85)
			_box(Vector3(0.14, y0 + 0.2, 0.14), lp + Vector3(0, (y0 + 0.2) * 0.5, 0), M.paint_grey, parent)
			_box(Vector3(0.3, 0.03, 0.3), lp + Vector3(0, 0.015, 0), M.paint_grey, parent)
	else:   # skirt with an access opening and an anchor ring
		_cyl(r * 0.98, base - r * 0.25, Vector3(c.x, (base - r * 0.25) * 0.5, c.z), M.paint_grey, parent, -1.0, 40)
		_cyl(r * 1.12, 0.08, Vector3(c.x, 0.04, c.z), M.paint_grey, parent, -1.0, 40)
	# nozzles: top centre, one on the side near the top, one near the bottom; each with a flange pair
	_seg(Vector3(c.x, y0 + h + r * 0.45, c.z), Vector3(c.x, y0 + h + r * 0.75, c.z), r * 0.14, M.steel_dull, parent)
	_flange(Vector3(c.x, y0 + h + r * 0.75, c.z), Vector3.UP, r * 0.14, parent)
	for nz in [[y0 + h - 0.4, 0.0], [y0 + 0.5, PI]]:
		var d := Vector3(cos(float(nz[1])), 0, sin(float(nz[1])))
		var a0 := Vector3(c.x, float(nz[0]), c.z) + d * r
		_seg(a0, a0 + d * 0.35, r * 0.11, M.steel_dull, parent); _flange(a0 + d * 0.35, d, r * 0.11, parent)
	# manway: a round cover with a bolt ring and a davit arm
	var md := Vector3(cos(PI * 0.5), 0, sin(PI * 0.5)); var mp := Vector3(c.x, y0 + 1.0, c.z) + md * r
	_seg(mp, mp + md * 0.22, 0.28, sm if not clad else M.steel_dull, parent); _flange(mp + md * 0.22, md, 0.2, parent)
	_seg(mp + md * 0.3 + Vector3(0.32, 0, 0), mp + md * 0.3 + Vector3(0.32, 0.55, 0), 0.025, M.steel_dull, parent)
	_seg(mp + md * 0.3 + Vector3(0.32, 0.55, 0), mp + md * 0.3 + Vector3(0.0, 0.55, 0), 0.02, M.steel_dull, parent)
	if bool(opts.get("ladder", false)):   # caged ladder up the side and a ring platform under the top head
		var ld := Vector3(cos(-PI * 0.5), 0, sin(-PI * 0.5)); var lb := Vector3(c.x, 0, c.z) + ld * (r + 0.35)
		var top := y0 + h + 0.1
		for sx in [-0.22, 0.22]: _seg(lb + Vector3(sx, 0, 0), lb + Vector3(sx, top + 1.0, 0), 0.022, M.yellow, parent)
		for i in int(top / 0.3): _seg(lb + Vector3(-0.22, 0.3 + i * 0.3, 0), lb + Vector3(0.22, 0.3 + i * 0.3, 0), 0.012, M.yellow, parent)
		for i in int((top - 2.2) / 0.9): _torus(0.4, 0.012, lb + ld * 0.2 + Vector3(0, 2.4 + i * 0.9, 0), M.yellow, parent)
		_lathe(PackedVector2Array([Vector2(r + 0.05, 0), Vector2(r + 1.0, 0), Vector2(r + 1.0, 0.05), Vector2(r + 0.05, 0.05)]), 40, M.plate, Vector3(c.x, top, c.z), parent, false)
		_torus(r + 1.0, 0.02, Vector3(c.x, top + 1.05, c.z), M.yellow, parent); _torus(r + 1.0, 0.016, Vector3(c.x, top + 0.55, c.z), M.yellow, parent)
		for i in 12:
			var a := TAU * i / 12.0
			_seg(Vector3(c.x + cos(a) * (r + 1.0), top, c.z + sin(a) * (r + 1.0)), Vector3(c.x + cos(a) * (r + 1.0), top + 1.05, c.z + sin(a) * (r + 1.0)), 0.016, M.yellow, parent)
	return y0 + h

## A horizontal drum on two saddles with dished ends (boilers, separators, exchangers lying down).
func _drum(c: Vector3, r: float, length: float, mat: Material, parent: Node, clad := false) -> void:
	var sm: Material = M.clad if clad else mat
	var n := _cyl(r, length, c, sm, parent, -1.0, 36); n.rotation_degrees.z = 90
	for sgn in [-1.0, 1.0]:
		var hd := Node3D.new(); hd.position = c + Vector3(sgn * length * 0.5, 0, 0); hd.rotation_degrees.z = -90.0 * sgn; parent.add_child(hd)
		_dished(r, Vector3.ZERO, sm, hd, true)
		_box(Vector3(0.28, c.y - r * 0.3, r * 1.7), Vector3(c.x + sgn * length * 0.3, (c.y - r * 0.3) * 0.5, c.z), M.paint_grey, parent)
	if clad:
		for i in int(length / 0.8): (_cyl(r + 0.012, 0.03, c + Vector3(-length * 0.5 + 0.4 + i * 0.8, 0, 0), M.steel_dull, parent, -1.0, 36)).rotation_degrees.z = 90

## A gate valve with a handwheel on a horizontal line at p, axis d.
func _valve(p: Vector3, d: Vector3, r: float, parent: Node, col := Color(0.62, 0.12, 0.08)) -> void:
	var body := _paint(col)
	_seg(p - d * r * 1.6, p + d * r * 1.6, r * 1.5, body, parent, 12)
	_flange(p - d * r * 1.7, d, r, parent); _flange(p + d * r * 1.7, d, r, parent)
	_seg(p, p + Vector3(0, r * 4.0, 0), r * 0.35, M.steel_dull, parent, 8)
	_torus(r * 1.6, r * 0.18, p + Vector3(0, r * 4.0, 0), body, parent)

## A two-level pipe rack (steel H-frames every `bay` metres) from a to b along X at height h.
func _rack(a: Vector3, b: Vector3, h: float, parent: Node, bay := 4.0) -> void:
	var n := int(absf(b.x - a.x) / bay) + 1
	var steel := _paint(Color(0.32, 0.36, 0.4))
	for i in n:
		var x := a.x + signf(b.x - a.x) * i * bay
		for z in [a.z - 0.9, a.z + 0.9]: _box(Vector3(0.2, h + 1.0, 0.2), Vector3(x, (h + 1.0) * 0.5, z), steel, parent)
		for lv in [h, h + 0.9]: _box(Vector3(0.18, 0.18, 2.0), Vector3(x, lv, a.z), steel, parent)
		_box(Vector3(0.3, 0.05, 0.3), Vector3(x, 0.025, a.z - 0.9), M.concrete if M.has("concrete") else steel, parent)
	for lv in [h, h + 0.9]:
		for z in [a.z - 0.9, a.z + 0.9]: _box(Vector3(absf(b.x - a.x), 0.16, 0.12), Vector3((a.x + b.x) * 0.5, lv, z), steel, parent)

## Only the world's controls, with a 30 px minimum target (playtest: a wheel rim or the clamp lost to the flask's own anchor).
func pick_control(p: Vector2) -> String:
	var best := ""; var bd := 1e9
	for c in pad_controls():
		var r := str(c[0])
		if not anchors.has(r) or cam.is_position_behind(anchors[r]): continue
		var a: Vector3 = anchors[r]
		var sp := cam.unproject_position(a)
		var rpx := maxf(sp.distance_to(cam.unproject_position(a + cam.global_transform.basis.x * float(radius.get(r, 0.3)))) * 1.15, 30.0)
		var d := sp.distance_to(p)
		if d < rpx and d < bd: bd = d; best = r
	return best

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

# ---- pad (phase B): the world's own controls, one at a time; Look2 draws the cursor -----------------------------------------------------------
func pad_controls() -> Array: return [["wheel", "Cooler handwheel"]] if wheel != null else []
func pad_cams() -> Array: return ["wide", "front", "loop", "converter", "gauge", "bench", "outside"]
func pad_turn(id: String, dir: int) -> void:
	if id == "wheel" and wheel != null:
		wheel_k = clampf(snappedf(wheel_k + 10.0 * dir, 1.0), 400.0, 800.0); wheel.rotation.z -= 0.3 * dir; control_changed.emit("T", wheel_k)
func pad_value(id: String) -> String: return "set %.0f °C  (drag sideways; pad up/down: 10 °C)" % (wheel_k - 273.15) if id == "wheel" else ""
func press_control(_r: String) -> void: pass

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
var _gpu: Array = []
func _ft_start() -> void:
	_ft_t = 0.0
	DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED); Engine.max_fps = 0   # measure the work, not the monitor
	RenderingServer.viewport_set_measure_render_time(get_viewport().get_viewport_rid(), true)
func _ft_tick(dt: float) -> void:
	if _ft_t < 0.0: return
	_ft_t += dt
	if _ft_t > 3.0 and _ft_t < 7.0:
		_ft.append(dt * 1000.0); _gpu.append(RenderingServer.viewport_get_measured_render_time_gpu(get_viewport().get_viewport_rid()))
	elif _ft_t >= 7.0 and not _ft.is_empty():
		var s := _ft.duplicate(); s.sort()
		var avg := 0.0
		for v in s: avg += v
		avg /= s.size()
		var vs := Vector2(DisplayServer.window_get_size())
		var g := 0.0
		for v in _gpu: g += v
		g /= maxf(_gpu.size(), 1)
		print("FRAMETIME avg_ms=%.2f p95_ms=%.2f gpu_ms=%.2f res=%dx%d tier=%s adapter=%s n=%d" % [avg, s[int(s.size() * 0.95)], g, vs.x, vs.y, tier, RenderingServer.get_video_adapter_name(), s.size()])
		_ft.clear(); _ft_t = -1.0
