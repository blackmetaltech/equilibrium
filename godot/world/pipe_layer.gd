class_name PipeLayer
extends Node3D
## Pipes of the plant. Routing: PipeRouter (A* on the 2 m grid) between port stubs; geometry: a rounded tube per pipe riding at its own rack
## height with risers to the ports; look: one shader per pipe. The state is never colour alone: width = flow, chevrons run downstream
## (speed = flow), stripes along the pipe show the top-3 composition (dominant on top), hot pipes carry lagging rings and glow, cold pipes
## carry frost dots, an unsolved pipe is thin and dashed. API: set_pipes(world, pipes), set_streams(streams, colours), pick(), select().
const SHADER := "
shader_type spatial;
render_mode cull_disabled;
uniform vec4 c1 : source_color = vec4(0.6,0.6,0.6,1.0);
uniform vec4 c2 : source_color = vec4(0.6,0.6,0.6,1.0);
uniform vec4 c3 : source_color = vec4(0.6,0.6,0.6,1.0);
uniform float f1 = 1.0;
uniform float f2 = 0.0;
uniform float speed = 0.0;
uniform float heat = 0.0;
uniform float cold = 0.0;
uniform float live = 0.0;
uniform float sel = 0.0;
uniform float len = 1.0;
varying float vx;
void vertex() { vx = UV.x; }
void fragment() {
	float a = abs(UV.y - 0.5) * 2.0;
	vec3 base = a < f1 ? c1.rgb : (a < f1 + f2 ? c2.rgb : c3.rgb);
	float shade = 0.55 + 0.45 * (1.0 - a * 0.7);
	vec3 col = base * shade;
	float emis = 0.0;
	if (live < 0.5) {
		float dash = step(0.5, fract(vx / 0.9));
		col = mix(vec3(0.16,0.17,0.2), vec3(0.42,0.44,0.5), dash);
		ALBEDO = col; ROUGHNESS = 0.8; METALLIC = 0.3; EMISSION = vec3(0.0);
	} else {
		float ph = fract(vx / 1.6 - TIME * speed + a * 0.32);
		float chev = smoothstep(0.0, 0.04, ph) * (1.0 - smoothstep(0.1, 0.15, ph));
		col = mix(col, vec3(1.0), chev * 0.85 * (1.0 - a));
		float ring = step(0.93, fract(vx / 2.2)) * heat;
		col = mix(col, vec3(0.1, 0.07, 0.06), ring * 0.8);
		float frost = step(0.78, fract(sin(floor(vx * 2.0) * 12.9 + floor(UV.y * 8.0) * 78.2) * 43758.5)) * cold;
		col = mix(col, vec3(0.9, 0.97, 1.0), frost * 0.8);
		emis = heat * 0.9 * (0.5 + 0.5 * (1.0 - a)) + chev * 0.35 + cold * 0.1;
		ALBEDO = col; ROUGHNESS = 0.45; METALLIC = 0.45;
		EMISSION = mix(col, vec3(1.0, 0.45, 0.12), heat) * emis;
	}
	EMISSION += vec3(0.2, 0.85, 0.8) * sel * (0.55 + 0.45 * sin(TIME * 6.0));
}
"
const TUBE_SIDES := 10
const RACK_Y := 1.5
const RACK_STEP := 0.55
var world                          # PlantWorld
var router := PipeRouter.new(24, 16)
var last_route_ms := 0.0
var last_route_count := 0
var _shader: Shader
var _items := {}                   # pipe id -> {node, mat, pts(world polyline), from, to, rad}
var _sig := ""
var selected := ""

func _ready() -> void:
	_shader = Shader.new(); _shader.code = SHADER

func clear() -> void:
	for id in _items: (_items[id].node as Node).queue_free()
	_items.clear(); _sig = ""

## pipes: [{id, from:{unit,port}, to:{unit,port}}]; unit_state: id -> [type,x,y,rot] (world's own table). Re-routes only on a topology change.
func set_pipes(pipes: Array, unit_state: Dictionary) -> void:
	var sig := str(unit_state.hash()) + "|" + str(pipes.hash())
	if sig == _sig: return
	_sig = sig
	for id in _items: (_items[id].node as Node).queue_free()
	_items.clear()
	if pipes.is_empty(): last_route_count = 0; return
	var t0 := Time.get_ticks_usec()
	router.clear()
	for id in unit_state:
		var s: Array = unit_state[id]; var fp: Vector2i = world.footprint_of(s[0], s[3])
		router.block_rect(s[1], s[2], fp.x, fp.y)
	var jobs := []; var frames := {}
	for p in pipes:
		var fa: Dictionary = world.port_frame(p.from.unit, p.from.port, false)
		var fb: Dictionary = world.port_frame(p.to.unit, p.to.port, true)
		if fa.is_empty() or fb.is_empty(): continue
		var sa := _stub(fa); var sb := _stub(fb)
		frames[p.id] = [fa, fb, sa, sb]
		jobs.append({"id": p.id, "a": sa, "ad": PipeRouter.dir_of(fa.dir), "b": sb, "bd": PipeRouter.dir_of(-fb.dir)})
	var routes := router.route_all(jobs)
	last_route_ms = (Time.get_ticks_usec() - t0) / 1000.0; last_route_count = jobs.size()
	var idx := 0
	for p in pipes:
		if not frames.has(p.id): continue
		var fr: Array = frames[p.id]; var tiles: Array = routes.get(p.id, [])
		var pts := _polyline(fr[0], fr[1], tiles, RACK_Y + RACK_STEP * (idx % 4)); idx += 1
		var node := MeshInstance3D.new(); node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		var mat := ShaderMaterial.new(); mat.shader = _shader
		node.material_override = mat; add_child(node)
		_items[p.id] = {"node": node, "mat": mat, "pts": pts, "from": p.from, "to": p.to, "rad": 0.14, "routed": not tiles.is_empty()}
		_mesh(p.id, 0.14)

func _stub(f: Dictionary) -> Vector2i:
	var p: Vector3 = f.pos; var d: Vector3 = f.dir
	var t := Vector2i.ZERO
	for k in range(1, 5):
		t = world.world_to_tile(p + d * (0.6 + 0.7 * k))
		t = Vector2i(clampi(t.x, 0, PlantWorld.NX - 1), clampi(t.y, 0, PlantWorld.NZ - 1))
		if not router.blocked.has(t): break
	return t

func _centre(t: Vector2i, y: float) -> Vector3:
	var c: Vector3 = world.tile_to_world(t, Vector2i(1, 1)); c.y = y; return c

func _polyline(fa: Dictionary, fb: Dictionary, tiles: Array, h: float) -> Array[Vector3]:
	var pts: Array[Vector3] = []
	var pa: Vector3 = fa.pos; var pb: Vector3 = fb.pos
	var na: Vector3 = pa + (fa.dir as Vector3) * 0.6; var nb: Vector3 = pb + (fb.dir as Vector3) * 0.6
	pts.append(pa); pts.append(na)
	pts.append(Vector3(na.x, h, na.z))
	if tiles.is_empty():   # no route: a straight rack run between the two nozzles (drawn dashed-red by the caller if needed)
		pts.append(Vector3(nb.x, h, na.z)); pts.append(Vector3(nb.x, h, nb.z))
	else:
		var c0 := _centre(tiles[0], h)
		if absf(fa.dir.x) >= absf(fa.dir.z): pts.append(Vector3(c0.x, h, na.z)); pts.append(c0)
		else: pts.append(Vector3(na.x, h, c0.z)); pts.append(c0)
		for k in range(1, tiles.size()): pts.append(_centre(tiles[k], h))
		var c1: Vector3 = pts[-1]
		if absf(fb.dir.x) >= absf(fb.dir.z): pts.append(Vector3(c1.x, h, nb.z)); pts.append(Vector3(nb.x, h, nb.z))
		else: pts.append(Vector3(nb.x, h, c1.z)); pts.append(Vector3(nb.x, h, nb.z))
	pts.append(nb); pts.append(pb)
	var out: Array[Vector3] = []
	for p in pts: if out.is_empty() or out[-1].distance_to(p) > 0.01: out.append(p)
	return out

## Round the corners (quadratic bezier, radius up to 0.8 m).
static func _round(pts: Array[Vector3]) -> Array[Vector3]:
	if pts.size() < 3: return pts
	var out: Array[Vector3] = [pts[0]]
	for i in range(1, pts.size() - 1):
		var a := pts[i - 1]; var b := pts[i]; var c := pts[i + 1]
		var di := (b - a); var do_ := (c - b)
		if di.normalized().dot(do_.normalized()) > 0.999: out.append(b); continue
		var r := minf(0.8, minf(di.length(), do_.length()) * 0.5)
		var p0 := b - di.normalized() * r; var p2 := b + do_.normalized() * r
		for k in range(0, 6):
			var t := k / 5.0
			out.append(p0.lerp(b, t).lerp(b.lerp(p2, t), t))
	out.append(pts[-1])
	return out

func _mesh(id: String, radius: float) -> void:
	var it: Dictionary = _items[id]
	var pts := _round(it.pts)
	var verts := PackedVector3Array(); var norms := PackedVector3Array(); var uvs := PackedVector2Array(); var idx := PackedInt32Array()
	var dist := 0.0; var prev_t := Vector3.RIGHT
	for i in range(pts.size()):
		var t: Vector3
		if i == 0: t = (pts[1] - pts[0]).normalized()
		elif i == pts.size() - 1: t = (pts[i] - pts[i - 1]).normalized()
		else: t = ((pts[i + 1] - pts[i]).normalized() + (pts[i] - pts[i - 1]).normalized()).normalized()
		if t.length() < 0.1: t = prev_t
		prev_t = t
		if i > 0: dist += pts[i].distance_to(pts[i - 1])
		var up := Vector3.UP if absf(t.dot(Vector3.UP)) < 0.9 else Vector3.RIGHT
		var side := t.cross(up).normalized(); var nrm := side.cross(t).normalized()   # nrm points up for a horizontal pipe
		for k in range(TUBE_SIDES + 1):
			var ang := TAU * k / TUBE_SIDES   # 0 = bottom
			var n := (-nrm * cos(ang) + side * sin(ang)).normalized()
			verts.append(pts[i] + n * radius); norms.append(n); uvs.append(Vector2(dist, float(k) / TUBE_SIDES))
	var row := TUBE_SIDES + 1
	for i in range(pts.size() - 1):
		for k in range(TUBE_SIDES):
			var a := i * row + k; var b := a + 1; var c := a + row; var d := c + 1
			idx.append_array([a, c, b, b, c, d])
	var arr := []; arr.resize(Mesh.ARRAY_MAX); arr[Mesh.ARRAY_VERTEX] = verts; arr[Mesh.ARRAY_NORMAL] = norms; arr[Mesh.ARRAY_TEX_UV] = uvs; arr[Mesh.ARRAY_INDEX] = idx
	var m := ArrayMesh.new(); m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	(it.node as MeshInstance3D).mesh = m; it.rad = radius; it.pts_r = pts

## streams: snapshot streams [{id, flow, T, P, w:[[i,x]...]}], colours: species colours (hex) by index.
func set_streams(streams: Array, colours: Array) -> void:
	var by := {}
	for s in streams: by[str(s.get("id", ""))] = s
	for id in _items:
		var it: Dictionary = _items[id]; var mat: ShaderMaterial = it.mat
		var s = by.get(id)
		if s == null:
			mat.set_shader_parameter("live", 0.0); it["live"] = false
			if absf(float(it.rad) - 0.1) > 0.001: _mesh(id, 0.1)
			continue
		var flow := float(s.get("flow", 0.0)); var T := float(s.get("T", 300.0))
		var rad := clampf(0.13 + 0.075 * log(1.0 + flow * 10.0) / log(10.0), 0.13, 0.42)
		if absf(rad - float(it.rad)) > 0.01: _mesh(id, rad)
		it["live"] = true; it["s"] = s
		var w: Array = s.get("w", [])
		var cols: Array[Color] = [Color("#888888"), Color("#888888"), Color("#888888")]; var fr: Array[float] = [1.0, 0.0, 0.0]; var tot := 0.0
		for e in w: tot += float(e[1])
		for i in range(mini(3, w.size())):
			var ci := int(w[i][0]); cols[i] = Color(str(colours[ci])) if ci < colours.size() else cols[i]; fr[i] = float(w[i][1]) / maxf(tot, 1e-9)
		if w.size() == 1: cols[1] = cols[0]; cols[2] = cols[0]
		elif w.size() == 2: cols[2] = cols[1]
		mat.set_shader_parameter("live", 1.0 if flow > 0.0 else 0.0)
		mat.set_shader_parameter("c1", cols[0]); mat.set_shader_parameter("c2", cols[1]); mat.set_shader_parameter("c3", cols[2])
		mat.set_shader_parameter("f1", fr[0]); mat.set_shader_parameter("f2", fr[1])
		mat.set_shader_parameter("speed", clampf(0.25 + 0.25 * log(1.0 + flow * 10.0), 0.2, 1.4))
		mat.set_shader_parameter("heat", clampf((T - 450.0) / 550.0, 0.0, 1.0))
		mat.set_shader_parameter("cold", clampf((270.0 - T) / 60.0, 0.0, 1.0))

func select(id: String) -> void:
	if _items.has(selected): (_items[selected].mat as ShaderMaterial).set_shader_parameter("sel", 0.0)
	selected = id
	if _items.has(id): (_items[id].mat as ShaderMaterial).set_shader_parameter("sel", 1.0)

func has_pipe(id: String) -> bool: return _items.has(id)
func pipe_ids() -> Array: return _items.keys()
func endpoints(id: String) -> Array: return [_items[id].from, _items[id].to] if _items.has(id) else []
func stream_of(id: String) -> Dictionary: return _items[id].get("s", {}) if _items.has(id) else {}
func mid_point(id: String) -> Vector3:
	if not _items.has(id): return Vector3.ZERO
	var pts: Array = _items[id].get("pts_r", _items[id].pts)
	return pts[pts.size() / 2]

## The pipe whose centre line passes within `px` screen pixels of `p`, else "".
func pick(p: Vector2, cam: Camera3D, px := 12.0) -> String:
	var best := ""; var bd := px
	for id in _items:
		var pts: Array = _items[id].get("pts_r", _items[id].pts)
		var prev := Vector2.ZERO; var have := false
		for q in pts:
			if cam.is_position_behind(q): have = false; continue
			var s := cam.unproject_position(q)
			if have:
				var d := _seg_dist(p, prev, s)
				if d < bd: bd = d; best = id
			prev = s; have = true
	return best

static func _seg_dist(p: Vector2, a: Vector2, b: Vector2) -> float:
	var ab := b - a; var l2 := ab.length_squared()
	if l2 < 0.0001: return p.distance_to(a)
	return p.distance_to(a + ab * clampf((p - a).dot(ab) / l2, 0.0, 1.0))
