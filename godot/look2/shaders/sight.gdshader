// Sight glass on the cold ammonia separator: liquid below `level`, a bright meniscus, a dark mist above, frost at the edges.
shader_type spatial;
#include "res://look2/shaders/noise.gdshaderinc"
uniform float level = 0.5;
uniform float frost = 0.5;
void fragment() {
	vec2 uv = UV;
	float wob = 0.006 * sin(uv.x * 30.0 + TIME * 1.7) + 0.004 * sin(uv.x * 71.0 - TIME * 2.3);
	float lv = level + wob;
	float below = 1.0 - smoothstep(lv - 0.004, lv + 0.004, uv.y);
	float men = exp(-pow((uv.y - lv) * 55.0, 2.0));
	float bub = smoothstep(0.82, 0.9, vnoise(vec3(uv.x * 50.0, uv.y * 30.0 - TIME * 1.6, 1.0))) * below;
	vec3 liq = mix(vec3(0.25, 0.42, 0.55), vec3(0.62, 0.82, 0.95), 0.5 + 0.5 * vnoise(vec3(uv * 6.0, TIME * 0.2)));
	vec3 vap = vec3(0.03, 0.05, 0.07) + 0.03 * vnoise(vec3(uv * 9.0, TIME * 0.3));
	vec3 c = mix(vap, liq, below) + men * vec3(0.9, 0.97, 1.0) + bub * 0.5;
	float edge = max(abs(uv.x - 0.5) * 2.0, 0.0);
	float fr = smoothstep(0.78, 1.0, edge) * frost + smoothstep(0.93, 1.0, uv.y) * frost;
	c = mix(c, vec3(0.85, 0.9, 0.96), clamp(fr, 0.0, 1.0));
	ALBEDO = c * 0.8;
	EMISSION = c * 0.55;
	ROUGHNESS = 0.06;
	SPECULAR = 0.9;
}
