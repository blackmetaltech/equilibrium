shader_type spatial;
// 0.14 material library: painted carbon steel and matte instrument enamel.
// Paint colour with chipped edges that show bare steel, vertical drip streaks, and grime that darkens toward the floor (contact darkening).
// Albedo is clamped to 0.8 so nothing reads chalk-white under a key light.
#include "res://look2/shaders/noise.gdshaderinc"
uniform vec3 paint : source_color = vec3(0.5, 0.5, 0.5);
uniform float rough = 0.55;
uniform float metallic = 0.1;
uniform float wear = 0.5;      // 0 = enamel, no chips; 1 = heavily chipped
uniform float grime = 0.6;     // 0..1 darkening toward the floor
uniform float grime_h = 0.8;   // metres above the floor over which the grime fades out
uniform float peel = 0.03;     // orange-peel roughness noise (enamel)
varying vec3 lp;
varying vec3 wp;
void vertex() {
	lp = VERTEX;
	wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}
void fragment() {
	float n = fbm3(wp * 9.0);
	float f = fbm3(wp * 3.0 + 7.0);
	vec3 a = paint * (0.94 + 0.12 * f);
	float r = rough + (vnoise(wp * 40.0) - 0.5) * peel * 2.0;
	float m = metallic;
	// chips: bare steel where a high-frequency noise passes a threshold; more of it low down where kicks and trolleys land
	float low = 1.0 - smoothstep(0.0, 1.6, wp.y);
	float chip = smoothstep(0.70, 0.74, n + wear * 0.12 + low * 0.08 * wear) * wear;
	a = mix(a, vec3(0.46, 0.46, 0.47), chip);
	m = mix(m, 0.85, chip); r = mix(r, 0.42, chip);
	// drip streaks, then contact grime: dark, slightly rusty, rough
	float streak = vnoise(vec3(wp.x * 28.0 + wp.z * 28.0, wp.y * 1.5, 0.0));
	float g = grime * (1.0 - smoothstep(0.0, grime_h, wp.y)) * (0.55 + 0.45 * streak);
	g += grime * 0.12 * smoothstep(0.4, 0.8, streak) * (1.0 - smoothstep(0.0, 3.0, wp.y));
	a = mix(a, a * vec3(0.38, 0.34, 0.3), clamp(g, 0.0, 0.85));
	r = mix(r, 0.85, clamp(g, 0.0, 1.0));
	ALBEDO = min(a, vec3(0.8));
	METALLIC = m; ROUGHNESS = clamp(r, 0.05, 1.0);
}
