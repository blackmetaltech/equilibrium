#include "res://look2/shaders/noise.gdshaderinc"
uniform vec3 albedo : source_color = vec3(0.78, 0.80, 0.82);
uniform float metallic = 1.0;
uniform float rough_base = 0.30;
uniform vec3 streak = vec3(90.0, 3.0, 90.0);   // brushing noise frequency in local space (long axis = local y)
uniform float heat_lo = 0.0;                   // glow at the bottom of yrange (0..1.3)
uniform float heat_hi = 0.0;
uniform vec2 yrange = vec2(-4.0, 4.0);
uniform float emit_gain = 1.6;
uniform float frost = 0.0;                     // 0..1 frost cover
uniform float frost_h = 3.0;                   // frost is heaviest in the first metres above the floor
varying vec3 lp;
varying vec3 wp;
void vertex() {
	lp = VERTEX;
	wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}
void steel_surface(inout vec3 alb, inout float met, inout float rgh, inout vec3 emis, inout vec3 nrm, float xray, mat4 vm) {
	float s = vnoise(lp * streak);
	float p = vnoise(lp * 7.0 + 3.0);
	float r = clamp(rough_base + (s - 0.5) * 0.20 + (p - 0.5) * 0.16, 0.06, 1.0);
	alb = albedo * (0.90 + 0.2 * p);
	met = metallic;
	rgh = r;
	if (frost > 0.001) {
		float f = fbm3(wp * 13.0);
		float cover = frost * (0.62 + 0.7 * (1.0 - smoothstep(0.0, frost_h, wp.y)));
		float m = smoothstep(0.40, 0.62, f + cover - 0.5);
		vec3 e = vec3(0.012, 0.0, 0.0);
		vec3 g = vec3(fbm3(wp * 13.0 + e.xyy) - fbm3(wp * 13.0 - e.xyy), fbm3(wp * 13.0 + e.yxy) - fbm3(wp * 13.0 - e.yxy), fbm3(wp * 13.0 + e.yyx) - fbm3(wp * 13.0 - e.yyx));
		nrm = normalize(nrm + m * 0.9 * (vm * vec4(g, 0.0)).xyz * 8.0);
		alb = mix(alb, vec3(0.86, 0.91, 0.96), m);
		met = mix(met, 0.0, m);
		rgh = mix(rgh, 0.35 + 0.4 * f, m);
	}
	float hh = mix(heat_lo, heat_hi, clamp((lp.y - yrange.x) / (yrange.y - yrange.x), 0.0, 1.0));
	if (hh > 0.002) {
		float v = 0.78 + 0.45 * fbm3(vec3(lp.x * 2.0, lp.y * 3.0, lp.z * 2.0) + vec3(0.0, TIME * 0.06, 0.0));
		emis = heat_color(hh * v) * emit_gain * (1.0 - xray * 0.7);
	}
}
