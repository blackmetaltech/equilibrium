// Bourdon pressure gauge face drawn from the value: ticks over 270 degrees, a red zone, a needle.
shader_type spatial;
uniform float value = 0.5;     // 0..1 of full scale
uniform float redfrom = 0.8;
uniform vec3 face : source_color = vec3(0.92, 0.92, 0.88);
const float PI = 3.14159265;
float seg(vec2 p, vec2 a, vec2 b, float w) {
	vec2 pa = p - a, ba = b - a;
	float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
	return 1.0 - smoothstep(w * 0.6, w, length(pa - ba * h));
}
void fragment() {
	vec2 p = (UV - 0.5) * 2.0;
	p.y = -p.y;
	float r = length(p);
	float ang = atan(p.x, p.y);              // 0 up, clockwise positive
	float a0 = -0.75 * PI, a1 = 0.75 * PI;   // scale start/end
	vec3 c = face;
	float on = step(a0, ang) * step(ang, a1);
	float u = (ang - a0) / (a1 - a0);
	float ring = smoothstep(0.78, 0.8, r) * (1.0 - smoothstep(0.84, 0.86, r)) * on;
	if (u > redfrom) c = mix(c, vec3(0.8, 0.1, 0.08), ring); else c = mix(c, vec3(0.08), ring * 0.8);
	float minor = smoothstep(0.88, 0.95, abs(fract(u * 50.0 + 0.5) - 0.5) * 2.0 * -1.0 + 1.0);
	float tick_min = on * step(0.66, r) * step(r, 0.76) * step(0.9, 1.0 - abs(fract(u * 50.0 + 0.5) - 0.5) * 2.0);
	float tick_maj = on * step(0.58, r) * step(r, 0.76) * step(0.94, 1.0 - abs(fract(u * 10.0 + 0.5) - 0.5) * 2.0);
	c = mix(c, vec3(0.05), clamp(tick_min + tick_maj, 0.0, 1.0));
	float na = a0 + (a1 - a0) * clamp(value, 0.0, 1.0);
	vec2 dir = vec2(sin(na), cos(na));
	float nd = max(seg(p, -dir * 0.15, dir * 0.74, 0.035), 0.0);
	c = mix(c, vec3(0.9, 0.12, 0.05), nd);
	c = mix(c, vec3(0.08), 1.0 - smoothstep(0.08, 0.1, r));
	float inside = 1.0 - smoothstep(0.97, 1.0, r);
	ALBEDO = c * 0.9;
	EMISSION = c * 0.12;   // faces are matte but the hall is dim: a little self-light so the numbers read
	ROUGHNESS = 0.5;
	ALPHA = inside;
	ALPHA_SCISSOR_THRESHOLD = 0.5;
}
