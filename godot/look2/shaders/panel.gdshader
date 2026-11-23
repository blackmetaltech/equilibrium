// Painted steel casing panels (the fired heater): grey heat-resistant paint, roughness 0.7, metallic 0.3, with soot rising toward the top.
// World-space 3D noise, so no texture is stretched down a face (0.12: the box showed vertical streaks).
shader_type spatial;
#include "res://look2/shaders/noise.gdshaderinc"
uniform vec3 base : source_color = vec3(0.56, 0.57, 0.57);
uniform float soot_y0 = 3.2;   // world height where the soot begins
uniform float soot_y1 = 5.8;   // and where it is darkest
varying vec3 wp;
void vertex() { wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz; }
void fragment() {
	float n = fbm3(wp * vec3(2.2, 0.9, 2.2));
	float n2 = vnoise(wp * 11.0);
	float soot = smoothstep(soot_y0, soot_y1, wp.y) * (0.55 + 0.45 * n);
	vec3 c = base * (0.86 + 0.28 * n) * (0.96 + 0.08 * n2);
	c = mix(c, vec3(0.055, 0.05, 0.047), clamp(soot, 0.0, 0.9));
	ALBEDO = c;
	ROUGHNESS = mix(0.7, 0.9, clamp(soot, 0.0, 1.0));
	METALLIC = 0.3 * (1.0 - clamp(soot, 0.0, 1.0));
}
