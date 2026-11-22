// Heat haze: a shell around a hot thing that bends whatever is behind it, strongest in the middle of the shell, none at its edge.
shader_type spatial;
render_mode unshaded, depth_draw_never, cull_back;
#include "res://look2/shaders/noise.gdshaderinc"
uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap;
uniform float strength = 0.0;
varying vec3 wp;
void vertex() { wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz; }
void fragment() {
	float nx = vnoise(vec3(wp.x * 3.0, wp.y * 1.4 - TIME * 1.3, wp.z * 3.0)) - 0.5;
	float ny = vnoise(vec3(wp.x * 3.0 + 31.0, wp.y * 1.4 - TIME * 1.1, wp.z * 3.0)) - 0.5;
	vec2 o = vec2(nx, ny) * strength * 0.035;
	ALBEDO = textureLod(screen_tex, SCREEN_UV + o, 0.0).rgb;
	float ndv = clamp(dot(NORMAL, VIEW), 0.0, 1.0);
	ALPHA = smoothstep(0.0, 0.5, ndv) * clamp(strength * 2.0, 0.0, 1.0);
}
