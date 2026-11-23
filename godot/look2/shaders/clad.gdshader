shader_type spatial;
// 0.14 material library: aluminium jacketing on insulated vessels and lines.
// Circumferential seams every 1 m along the local long axis (y), a band strap on each seam, a lap line along the length, and a stucco-embossed finish.
#include "res://look2/shaders/noise.gdshaderinc"
uniform vec3 albedo : source_color = vec3(0.66, 0.68, 0.7);
uniform float metallic = 0.7;
uniform float rough = 0.42;
uniform float pitch = 1.0;   // seam spacing in metres (model scale is 1 unit = 1 m)
varying vec3 lp;
varying vec3 wp;
void vertex() {
	lp = VERTEX;
	wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}
void fragment() {
	float y = lp.y / pitch;
	float fy = fract(y);
	float d = min(fy, 1.0 - fy) * pitch;
	float seam = 1.0 - smoothstep(0.004, 0.014, d);              // the overlap line
	float strap = 1.0 - smoothstep(0.022, 0.034, abs(d - 0.07));    // the band strap just beside it
	float emb = vnoise(lp * vec3(90.0, 90.0, 90.0));             // stucco embossing
	float ang = atan(lp.x, lp.z);
	float lap = 1.0 - smoothstep(0.0, 0.02, abs(ang - 2.2));      // the long lap seam
	vec3 a = albedo * (0.9 + 0.2 * emb);
	float f = fbm3(wp * 2.5);
	a *= 0.9 + 0.2 * f;
	a = mix(a, a * 0.55, max(seam, lap) * 0.8);
	a = mix(a, vec3(0.5, 0.51, 0.53), strap);
	// dirt toward the floor
	float g = (1.0 - smoothstep(0.0, 0.7, wp.y)) * (0.5 + 0.5 * f);
	a = mix(a, a * vec3(0.4, 0.37, 0.34), clamp(g, 0.0, 0.8));
	ALBEDO = min(a, vec3(0.8));
	METALLIC = mix(metallic, 0.9, strap);
	ROUGHNESS = clamp(mix(rough + (emb - 0.5) * 0.14, 0.32, strap) + g * 0.3, 0.1, 1.0);
}
