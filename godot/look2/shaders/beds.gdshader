// Catalyst bed: dark pellets, the glow follows the bed temperature.
shader_type spatial;
#include "res://look2/shaders/noise.gdshaderinc"
uniform float heat = 0.3;
uniform float emit_gain = 2.4;
varying vec3 wp;
void vertex() { wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz; }
void fragment() {
	vec3 p = wp * 26.0;
	float a = vnoise(p);
	float b = vnoise(p * 2.3 + 5.0);
	float pel = smoothstep(0.35, 0.7, a);
	ALBEDO = mix(vec3(0.03), vec3(0.11, 0.1, 0.09), pel);
	ROUGHNESS = 0.7;
	METALLIC = 0.3;
	float hot = heat * (0.55 + 0.9 * b * pel + 0.35 * fbm3(wp * 3.0 + TIME * 0.05));
	EMISSION = heat_color(hot) * emit_gain * (0.4 + 0.6 * pel);
}
