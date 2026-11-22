// Liquid in glassware: coloured, deeper colour toward the middle of the vessel, a faint meniscus ring and slow swirl.
shader_type spatial;
render_mode cull_back, depth_draw_opaque;
#include "res://look2/shaders/noise.gdshaderinc"
uniform vec4 col : source_color = vec4(0.9, 0.95, 1.0, 0.25);
uniform float glow = 0.0;
varying vec3 lp;
void vertex() { lp = VERTEX; }
void fragment() {
	float rim = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 2.0);
	float sw = 0.5 + 0.5 * vnoise(vec3(lp.x * 40.0, lp.y * 25.0 - TIME * 0.4, lp.z * 40.0));
	vec3 c = col.rgb * (0.85 + 0.2 * sw);
	ALBEDO = c;
	ALPHA = clamp(col.a * (0.7 + 0.5 * (1.0 - rim)) + rim * 0.12, 0.0, 1.0);
	ROUGHNESS = 0.04;
	SPECULAR = 1.0;
	EMISSION = c * glow;
}
