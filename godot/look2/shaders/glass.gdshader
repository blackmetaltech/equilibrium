shader_type spatial;
render_mode cull_disabled, depth_draw_opaque;
uniform vec4 tint : source_color = vec4(0.85, 0.92, 0.95, 0.10);
uniform float fres = 3.0;
void fragment() {
	float f = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), fres);
	ALBEDO = tint.rgb;
	ALPHA = clamp(tint.a + f * 0.6, 0.0, 1.0);
	ROUGHNESS = 0.03;
	SPECULAR = 1.0;
	METALLIC = 0.0;
}
