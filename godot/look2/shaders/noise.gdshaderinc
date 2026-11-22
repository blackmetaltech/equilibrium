// Shared noise and blackbody ramp for the LOOK2 shaders.
float hash31(vec3 p) {
	p = fract(p * 0.1031);
	p += dot(p, p.zyx + 31.32);
	return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 x) {
	vec3 i = floor(x);
	vec3 f = fract(x);
	f = f * f * (3.0 - 2.0 * f);
	float a = mix(hash31(i), hash31(i + vec3(1, 0, 0)), f.x);
	float b = mix(hash31(i + vec3(0, 1, 0)), hash31(i + vec3(1, 1, 0)), f.x);
	float c = mix(hash31(i + vec3(0, 0, 1)), hash31(i + vec3(1, 0, 1)), f.x);
	float d = mix(hash31(i + vec3(0, 1, 1)), hash31(i + vec3(1, 1, 1)), f.x);
	return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);
}
float fbm3(vec3 p) {
	float s = 0.0;
	float a = 0.5;
	for (int i = 0; i < 4; i++) {
		s += a * vnoise(p);
		p = p * 2.03 + 11.7;
		a *= 0.5;
	}
	return s;
}
// heat 0..1.5: black, dull red, red-orange, orange, yellow-white. A display ramp, not a calibrated Planck curve.
vec3 heat_color(float h) {
	h = clamp(h, 0.0, 1.5);
	vec3 c = vec3(0.0);
	c = mix(c, vec3(0.30, 0.015, 0.0), smoothstep(0.0, 0.25, h));
	c = mix(c, vec3(0.95, 0.11, 0.01), smoothstep(0.25, 0.5, h));
	c = mix(c, vec3(1.0, 0.42, 0.06), smoothstep(0.5, 0.75, h));
	c = mix(c, vec3(1.0, 0.82, 0.5), smoothstep(0.75, 1.0, h));
	c = mix(c, vec3(1.0, 0.97, 0.88), smoothstep(1.0, 1.5, h));
	return c;
}
