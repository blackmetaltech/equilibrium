class_name PShimmer
extends MeshInstance3D
## Heat shimmer: a vertical sheet that refracts the picture behind it with a rising wobble. Off (hidden) below amount 0.03.
static var _shader: Shader
var _m: ShaderMaterial

static func shader() -> Shader:
	if _shader == null:
		_shader = Shader.new()
		_shader.code = "shader_type spatial;\nrender_mode unshaded, cull_disabled, depth_draw_never;\nuniform sampler2D scr : hint_screen_texture, filter_linear, repeat_disable;\nuniform float amount = 0.5;\nvoid fragment() {\n\tvec2 uv = SCREEN_UV;\n\tfloat w = sin(uv.y * 90.0 - TIME * 5.0) * 0.5 + sin(uv.y * 41.0 - TIME * 3.1 + uv.x * 30.0) * 0.5;\n\tfloat edge = smoothstep(0.0, 0.25, UV.x) * smoothstep(1.0, 0.75, UV.x) * smoothstep(0.0, 0.2, UV.y) * smoothstep(1.0, 0.45, UV.y);\n\tuv.x += w * 0.0035 * amount * edge;\n\tuv.y += w * 0.0012 * amount * edge;\n\tALBEDO = texture(scr, uv).rgb;\n\tALPHA = clamp(edge * 2.0, 0.0, 1.0);\n}\n"
	return _shader

func setup(w: float, h: float) -> PShimmer:
	var q := QuadMesh.new(); q.size = Vector2(w, h); mesh = q
	_m = ShaderMaterial.new(); _m.shader = shader(); material_override = _m
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; visible = false
	position.y = h * 0.5
	return self

func set_amount(a: float) -> void:
	visible = a > 0.03
	if _m != null: _m.set_shader_parameter("amount", clampf(a, 0.0, 1.5))
