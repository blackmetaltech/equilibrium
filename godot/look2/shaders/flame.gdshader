// A flame sheet: y-axis billboard, noise-eroded tongue, white-yellow core to red tip. Additive.
shader_type spatial;
render_mode unshaded, blend_add, cull_disabled, depth_draw_never;
#include "res://look2/shaders/noise.gdshaderinc"
uniform float intensity = 1.0;
uniform float speed = 1.0;
uniform float width = 0.5;
uniform vec3 core : source_color = vec3(1.0, 0.85, 0.5);
uniform vec3 tip : source_color = vec3(1.0, 0.25, 0.03);
void vertex() {
	MODELVIEW_MATRIX = VIEW_MATRIX * mat4(INV_VIEW_MATRIX[0], MODEL_MATRIX[1], INV_VIEW_MATRIX[2], MODEL_MATRIX[3]);
}
void fragment() {
	vec2 uv = vec2(UV.x * 2.0 - 1.0, 1.0 - UV.y);   // y: 0 base .. 1 tip
	float t = TIME * speed;
	float n = fbm3(vec3(uv.x * 2.5, uv.y * 3.0 - t * 2.2, t * 0.3));
	float w = width * pow(1.0 - uv.y, 0.7) * (0.75 + 0.5 * n);
	float shape = 1.0 - smoothstep(w * 0.55, w, abs(uv.x + (n - 0.5) * 0.5 * uv.y));
	float fade = smoothstep(0.0, 0.05, uv.y) * (1.0 - smoothstep(0.55 + 0.3 * n, 1.0, uv.y));
	float a = shape * fade;
	vec3 c = mix(core, tip, smoothstep(0.0, 0.8, uv.y + (1.0 - n) * 0.2));
	ALBEDO = c * intensity * a * 1.8;
	ALPHA = clamp(a, 0.0, 1.0);
}
