// The converter shell in x-ray: the same steel turned to glass so the beds and their glow show.
shader_type spatial;
render_mode depth_draw_never, cull_back;
#include "res://look2/shaders/steel.gdshaderinc"
void fragment() {
	vec3 a; float m; float r; vec3 e = vec3(0.0); vec3 n = NORMAL;
	steel_surface(a, m, r, e, n, 1.0);
	float fr = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 2.5);
	ALBEDO = vec3(0.35, 0.45, 0.5);
	METALLIC = 0.0; ROUGHNESS = 0.04; SPECULAR = 1.0;
	EMISSION = e * 0.5 + vec3(0.05, 0.22, 0.24) * fr * 0.6;   // faint teal rim: the player's instruments
	ALPHA = clamp(0.07 + fr * 0.55, 0.0, 0.85);
}
