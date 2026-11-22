shader_type canvas_item;
// LOOK2 HUD glass: frosted blur of what is behind (mip-blurred screen texture), a dark tint with a faint inner gradient, a 1 px luminous edge.
uniform sampler2D screen_tex : hint_screen_texture, repeat_disable, filter_linear_mipmap;
uniform vec2 rect_size = vec2(100.0);
uniform float radius = 12.0;
uniform vec4 tint : source_color = vec4(0.028, 0.075, 0.095, 1.0);
uniform vec4 edge_color : source_color = vec4(0.18, 0.77, 0.71, 1.0);
uniform float tint_amount = 0.72;
uniform float blur_lod = 3.0;
uniform float glow = 0.0;

float sdf_round(vec2 p, vec2 b, float r) {
	vec2 q = abs(p) - b + r;
	return length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

void fragment() {
	float alpha_in = COLOR.a;
	vec2 p = (UV - 0.5) * rect_size;
	float d = sdf_round(p, rect_size * 0.5, radius);
	float mask = 1.0 - smoothstep(-0.7, 0.5, d);
	vec2 px = SCREEN_PIXEL_SIZE * 5.0;
	vec3 b = textureLod(screen_tex, SCREEN_UV, blur_lod).rgb * 0.36;
	b += textureLod(screen_tex, SCREEN_UV + vec2(px.x, 0.0), blur_lod).rgb * 0.16;
	b += textureLod(screen_tex, SCREEN_UV - vec2(px.x, 0.0), blur_lod).rgb * 0.16;
	b += textureLod(screen_tex, SCREEN_UV + vec2(0.0, px.y), blur_lod).rgb * 0.16;
	b += textureLod(screen_tex, SCREEN_UV - vec2(0.0, px.y), blur_lod).rgb * 0.16;
	vec3 base = mix(b * 0.55, tint.rgb, tint_amount);
	// subtle vertical gradient, lighter near the top, and a soft inner glow along the border
	base += edge_color.rgb * (0.055 * (1.0 - UV.y) + 0.012);
	float inner = smoothstep(-16.0, 0.0, d);
	base += edge_color.rgb * inner * (0.07 + 0.12 * glow);
	float line = 1.0 - smoothstep(0.0, 1.1, abs(d + 0.55));
	vec3 col = mix(base, edge_color.rgb * 1.15, line * (0.5 + 0.45 * glow));
	COLOR = vec4(col, mask * alpha_in * 0.97);
}
