class_name PPlume
extends GPUParticles3D
## A soft billboard plume (steam, smoke, fume, relief jet). Level 0..1 sets how much is emitted; colour and speed are live.
static var _tex: GradientTexture2D
var _pm: ParticleProcessMaterial
var _mat: StandardMaterial3D
var _ramp: Gradient
var _gt: GradientTexture1D
var base_speed := 1.4
var _want := false

func _enter_tree() -> void:
	emitting = _want

static func soft_tex() -> GradientTexture2D:
	if _tex == null:
		var g := Gradient.new(); g.set_color(0, Color(1, 1, 1, 1)); g.set_color(1, Color(1, 1, 1, 0))
		_tex = GradientTexture2D.new(); _tex.gradient = g; _tex.fill = GradientTexture2D.FILL_RADIAL
		_tex.fill_from = Vector2(0.5, 0.5); _tex.fill_to = Vector2(0.5, 0.0); _tex.width = 64; _tex.height = 64
	return _tex

## speed m/s, life s, size m (start), grow factor over life, amount puffs, spread degrees.
func setup(col: Color, speed := 1.4, life := 3.0, size := 0.6, grow := 3.0, n := 18, spread := 14.0, lift := 0.0) -> PPlume:
	base_speed = speed
	_pm = ParticleProcessMaterial.new()
	_pm.direction = Vector3(0, 1, 0); _pm.spread = spread
	_pm.initial_velocity_min = speed * 0.7; _pm.initial_velocity_max = speed * 1.2
	_pm.gravity = Vector3(0.0, lift, 0.0)
	_pm.scale_min = size * 0.8; _pm.scale_max = size * 1.2
	var c := Curve.new(); c.add_point(Vector2(0, 0.45)); c.add_point(Vector2(1, grow * 0.45))
	var ct := CurveTexture.new(); ct.curve = c; _pm.scale_curve = ct
	_ramp = Gradient.new(); _ramp.offsets = PackedFloat32Array([0.0, 0.18, 1.0]); _ramp.colors = PackedColorArray([Color(1, 1, 1, 0), Color(1, 1, 1, 0.55), Color(1, 1, 1, 0)])
	_gt = GradientTexture1D.new(); _gt.gradient = _ramp; _pm.color_ramp = _gt
	_pm.color = col
	process_material = _pm
	var q := QuadMesh.new(); q.size = Vector2(1, 1)
	_mat = StandardMaterial3D.new(); _mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; _mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_mat.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES; _mat.vertex_color_use_as_albedo = true; _mat.albedo_texture = soft_tex()
	_mat.particles_anim_h_frames = 1; _mat.particles_anim_v_frames = 1; _mat.no_depth_test = false
	q.material = _mat; draw_pass_1 = q
	lifetime = life; amount = n; local_coords = false; emitting = false; cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	visibility_aabb = AABB(Vector3(-6, -2, -6), Vector3(12, 16, 12)); one_shot = false; explosiveness = 0.0; preprocess = life * 0.8
	return self

func set_level(l: float, col := Color(-1, 0, 0)) -> void:
	var on := l > 0.02
	_want = on
	if is_inside_tree() and emitting != on: emitting = on
	amount_ratio = clampf(l, 0.05, 1.0)
	if _pm != null:
		_pm.initial_velocity_min = base_speed * (0.5 + 0.5 * l); _pm.initial_velocity_max = base_speed * (0.8 + 0.5 * l)
		if col.r >= 0.0: _pm.color = col

## One-shot burst (relief jet): seconds of emission at full level.
func burst(sec: float) -> void:
	amount_ratio = 1.0; emitting = true
	get_tree().create_timer(sec).timeout.connect(func() -> void:
		if is_instance_valid(self): emitting = false)
