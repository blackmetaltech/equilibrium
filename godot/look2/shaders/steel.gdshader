shader_type spatial;
#include "res://look2/shaders/steel.gdshaderinc"
void fragment() {
	vec3 a; float m; float r; vec3 e = vec3(0.0); vec3 n = NORMAL;
	steel_surface(a, m, r, e, n, 0.0, VIEW_MATRIX);
	ALBEDO = a; METALLIC = m; ROUGHNESS = r; EMISSION = e; NORMAL = n;
}
