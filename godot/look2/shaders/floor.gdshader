// Wet concrete: two scales of one texture blended (no visible repeat), puddles where the roughness drops to a mirror so SSR has something to reflect.
shader_type spatial;
#include "res://look2/shaders/noise.gdshaderinc"
uniform sampler2D diff : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D rgh : filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D nor : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform float tile_m = 2.5;
uniform vec3 tint : source_color = vec3(0.72, 0.74, 0.76);
uniform float desat = 0.8;
uniform float wet = 0.55;          // 0 dry, 1 flooded
uniform float puddle_scale = 0.11;
uniform float base_rough = 1.0;
uniform float contrast = 1.0;      // 0.12 (Sigrid: the hall floor's noise was too contrasty): pulls the texture toward its mean; 1 = as authored
varying vec3 wp;
void vertex() { wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz; }
void fragment() {
	vec2 uv1 = wp.xz / tile_m;
	vec2 uv2 = mat2(vec2(0.8, 0.6), vec2(-0.6, 0.8)) * wp.xz / (tile_m * 2.71);
	float k = smoothstep(0.3, 0.7, vnoise(vec3(wp.xz * 0.35, 1.0)));
	vec3 c = mix(texture(diff, uv1).rgb, texture(diff, uv2).rgb, k);
	float rr = mix(texture(rgh, uv1).r, texture(rgh, uv2).r, k);
	vec3 nn = mix(texture(nor, uv1).rgb, texture(nor, uv2).rgb, k);
	float g = dot(c, vec3(0.3, 0.59, 0.11));
	c = mix(c, vec3(g), desat) * tint;
	c = mix(vec3(0.42) * tint, c, contrast);
	float pm = fbm3(vec3(wp.xz * puddle_scale, 4.0));
	float pud = smoothstep(0.52 - wet * 0.22, 0.60 - wet * 0.22, pm);
	float damp = smoothstep(0.30 - wet * 0.2, 0.60 - wet * 0.2, pm);
	c *= mix(1.0, 0.55, damp) * mix(1.0, 0.7, pud);
	float rgn = clamp(rr * base_rough, 0.0, 1.0);
	rgn = mix(rgn, rgn * 0.45, damp);
	rgn = mix(rgn, 0.035, pud);
	ALBEDO = c;
	ROUGHNESS = rgn;
	SPECULAR = 0.55;
	NORMAL_MAP = nn;
	NORMAL_MAP_DEPTH = mix(1.0, 0.04, pud);
}
