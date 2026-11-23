class_name SiteModel
extends Node3D
## 0.13 the Works as a scale model on the planning table: a painted site board (land, a sea strip with a jetty, a main road, a pipe rack along the route) and one small
## building model per chapter stop, each with its signature equipment in miniature. A stop that is open has warm windows and a small light, a locked one is grey clay with no
## light, a finished one carries a brass flag and its pipe is laid in copper. The selected stop wears an amber ring and a bobbing marker.
## Built from boxes and cylinders only (no textures). Origin = the board's centre on the table top; the front of every building faces +z (the camera).
const GROUND := 0.04                       ## land surface above the board's underside
const BOARD := Vector2(6.5, 2.95)
const PAD := Vector2(0.95, 0.75)
## Board (x, z) of each chapter's stop, in WorksMap.CHAPTERS order. A front row left to right (0..5), a back row right to left (6..11) along the sea.
const STOPS: Array[Vector2] = [
	Vector2(-2.75, 0.90), Vector2(-1.65, 0.82), Vector2(-0.55, 0.88), Vector2(0.55, 0.80), Vector2(1.65, 0.88), Vector2(2.65, 0.84),
	Vector2(2.65, -0.42), Vector2(1.50, -0.48), Vector2(0.40, -0.40), Vector2(-0.70, -0.46), Vector2(-1.75, -0.40), Vector2(-2.75, -0.45)]
const HEIGHT := [0.46, 0.46, 0.82, 0.66, 0.74, 0.50, 0.68, 0.76, 0.58, 0.60, 0.50, 0.66]   ## top of each building above its pad (the marker floats over it)
const ROAD_Z := 0.2
const PIPE_Z := -0.01
const NAMES := ["The gate", "QC lab", "Burner house", "Converter house", "Catalyst house", "The loop", "Containment yard", "Integrated Works", "Control room", "Turnaround yard", "Pump house", "Plant manager's office"]

var states: Array = []          ## "locked" | "open" | "done" per chapter
var stops: Array = []           ## the Node3D of each stop (named Stop_N)
var sel := -1
var _lit := false
var _mats := {}
var _marker: MeshInstance3D
var _ring: MeshInstance3D
var _t := 0.0
var _ring_pos := Vector3.ZERO

# ---- materials and parts -------------------------------------------------------------------------------------------------------------------------
func _mat(c: Color, metal := 0.0, rough := 0.7, emit := Color.BLACK, e := 0.0) -> StandardMaterial3D:
	if not _lit:   # locked: grey clay, matte, dark windows (an emissive part goes dark)
		var g := c.get_luminance() * 0.5 + 0.34
		c = Color(g, g, g * 1.03); metal = 0.0; rough = 0.88; e = 0.0
	var k := "%s|%.2f|%.2f|%.1f|%s" % [c.to_html(), metal, rough, e, emit.to_html()]
	if _mats.has(k): return _mats[k]
	var m := StandardMaterial3D.new(); m.albedo_color = c; m.metallic = metal; m.roughness = rough
	if e > 0.0: m.emission_enabled = true; m.emission = emit; m.emission_energy_multiplier = e
	_mats[k] = m
	return m

func _plain(c: Color, metal := 0.0, rough := 0.7, emit := Color.BLACK, e := 0.0) -> StandardMaterial3D:   # a material that does not go grey (land, sea, roads, brass)
	var k := "P|%s|%.2f|%.2f|%.1f|%s" % [c.to_html(), metal, rough, e, emit.to_html()]
	if _mats.has(k): return _mats[k]
	var m := StandardMaterial3D.new(); m.albedo_color = c; m.metallic = metal; m.roughness = rough
	if e > 0.0: m.emission_enabled = true; m.emission = emit; m.emission_energy_multiplier = e
	_mats[k] = m
	return m

func _mi(mesh: Mesh, pos: Vector3, mat: Material, parent: Node3D) -> MeshInstance3D:
	var m := MeshInstance3D.new(); m.mesh = mesh; m.material_override = mat; m.position = pos; parent.add_child(m); return m

## A box standing on `pos` (its base centre).
func _b(p: Node3D, size: Vector3, pos: Vector3, mat: Material) -> MeshInstance3D:
	var bm := BoxMesh.new(); bm.size = size; return _mi(bm, pos + Vector3(0, size.y * 0.5, 0), mat, p)

## A cylinder standing on `pos` (its base centre); `top` < 0 = the same radius, 0 = a cone.
func _c(p: Node3D, r: float, h: float, pos: Vector3, mat: Material, top := -1.0, seg := 20) -> MeshInstance3D:
	var cm := CylinderMesh.new(); cm.bottom_radius = r; cm.top_radius = r if top < 0.0 else top; cm.height = h; cm.radial_segments = seg; cm.rings = 1
	return _mi(cm, pos + Vector3(0, h * 0.5, 0), mat, p)

func _dome(p: Node3D, r: float, pos: Vector3, mat: Material, sy := 1.0) -> MeshInstance3D:
	var s := SphereMesh.new(); s.radius = r; s.height = r; s.is_hemisphere = true; s.radial_segments = 20; s.rings = 8
	var m := _mi(s, pos, mat, p); m.scale = Vector3(1, sy, 1); return m

func _ball(p: Node3D, r: float, pos: Vector3, mat: Material) -> MeshInstance3D:
	var s := SphereMesh.new(); s.radius = r; s.height = r * 2.0; s.radial_segments = 20; s.rings = 10
	return _mi(s, pos, mat, p)

## A rod from a to b.
func _tube(p: Node3D, a: Vector3, b: Vector3, r: float, mat: Material, seg := 8) -> MeshInstance3D:
	var d := b - a
	if d.length() < 1e-4: return null
	var cm := CylinderMesh.new(); cm.top_radius = r; cm.bottom_radius = r; cm.height = d.length(); cm.radial_segments = seg; cm.rings = 1
	var m := _mi(cm, (a + b) * 0.5, mat, p)
	var dn := d.normalized()
	if absf(dn.dot(Vector3.UP)) < 0.9999: m.basis = Basis(Quaternion(Vector3.UP, dn))
	elif dn.y < 0.0: m.rotation.x = PI
	return m

## A cylinder lying along x (a drum, a pump, a burner barrel), centred on `pos`.
func _lie(p: Node3D, r: float, ln: float, pos: Vector3, mat: Material, along_z := false) -> MeshInstance3D:
	var cm := CylinderMesh.new(); cm.bottom_radius = r; cm.top_radius = r; cm.height = ln; cm.radial_segments = 20; cm.rings = 1
	var m := _mi(cm, pos, mat, p)
	if along_z: m.rotation.x = PI * 0.5
	else: m.rotation.z = PI * 0.5
	return m

func _win(p: Node3D, size: Vector3, pos: Vector3) -> void:   # a window: warm and glowing when lit, dark glass when not
	var m := _plain(Color(1.0, 0.76, 0.42), 0.0, 0.4, Color(1.0, 0.72, 0.36), 2.4) if _lit else _plain(Color(0.2, 0.22, 0.25), 0.0, 0.3)
	_b(p, size, pos, m)

func _lamp(p: Node3D, pos: Vector3, col: Color) -> void:   # a small bright lamp head (lit only)
	if _lit: _ball(p, 0.018, pos, _plain(col, 0.0, 0.3, col, 4.0))
	else: _ball(p, 0.018, pos, _plain(Color(0.35, 0.36, 0.38), 0.0, 0.8))

# ---- colours --------------------------------------------------------------------------------------------------------------------------------------
const STEEL := Color(0.74, 0.77, 0.80)
const WHITE := Color(0.92, 0.91, 0.86)
const CREAM := Color(0.90, 0.84, 0.70)
const BRICK := Color(0.66, 0.36, 0.27)
const CONC := Color(0.62, 0.61, 0.57)
const YEL := Color(0.92, 0.72, 0.10)
const RED := Color(0.74, 0.15, 0.11)
const BLUE := Color(0.18, 0.38, 0.66)
const GLASS := Color(0.22, 0.32, 0.42)
const DARK := Color(0.20, 0.21, 0.24)
const BRASS := Color(0.86, 0.66, 0.26)
const TEAL := Color(0.18, 0.55, 0.52)

# ---- the site ----------------------------------------------------------------------------------------------------------------------------------------
func shore(x: float) -> float: return -1.02 + 0.07 * sin(x * 1.7 + 0.5) + (0.10 if x > 2.0 else 0.0) * smoothstep(2.0, 2.6, x)

## chapter_states: "locked" | "open" | "done" per chapter (12). ship: the sulfur ship at the jetty.
func build(chapter_states: Array, ship: bool) -> void:
	states = chapter_states.duplicate()
	name = "SiteModel"
	_site(ship)
	for n in STOPS.size():
		var st := Node3D.new(); st.name = "Stop_%d" % n; st.position = Vector3(STOPS[n].x, GROUND, STOPS[n].y); add_child(st); stops.append(st)
		_lit = str(states[n]) != "locked"
		_pad(st, n)
		match n:
			0: _gate(st)
			1: _lab(st)
			2: _burner(st)
			3: _converter(st)
			4: _catalyst(st)
			5: _loop(st)
			6: _yard(st)
			7: _works(st)
			8: _control(st)
			9: _turnaround(st)
			10: _pumps(st)
			11: _office(st)
		if _lit:
			var o := OmniLight3D.new(); o.light_color = Color(1.0, 0.78, 0.5); o.light_energy = 0.55; o.omni_range = 1.25; o.position = Vector3(0, 0.34, 0.42); o.shadow_enabled = false; st.add_child(o)
		if str(states[n]) == "done": _flag(st)
	_lit = true
	_ring = _mi(_ring_mesh(), Vector3(0, GROUND + 0.012, 0), _plain(Color(1.0, 0.5, 0.08), 0.0, 0.4, Color(1.0, 0.42, 0.04), 3.0), self); _ring.scale = Vector3(1, 1, 0.8); _ring.visible = false
	var cone := CylinderMesh.new(); cone.top_radius = 0.0; cone.bottom_radius = 0.075; cone.height = 0.17; cone.radial_segments = 16; cone.rings = 1
	_marker = _mi(cone, Vector3.ZERO, _plain(Color(1.0, 0.7, 0.15), 0.0, 0.4, Color(1.0, 0.62, 0.1), 2.2), self); _marker.rotation.z = PI; _marker.visible = false
	set_process(true)

func _ring_mesh() -> TorusMesh:
	var o := TorusMesh.new(); o.inner_radius = 0.58; o.outer_radius = 0.65; o.rings = 56; o.ring_segments = 6; return o

func _site(ship: bool) -> void:
	# a foam-core slab with a pale edge, then the land (a polygon with a wavy shore), the sea strip below it, the jetty and the road
	_b(self, Vector3(BOARD.x + 0.22, 0.016, BOARD.y + 0.22), Vector3(0, 0, 0), _plain(Color(0.92, 0.91, 0.86), 0.0, 0.7))
	_b(self, Vector3(BOARD.x, 0.014, 0.9), Vector3(0, 0.016, -BOARD.y * 0.5 + 0.45), _plain(Color(0.20, 0.44, 0.56), 0.0, 0.12))   # the sea, lower than the land
	for i in 7:   # wave ticks
		_b(self, Vector3(0.34 + (i % 3) * 0.12, 0.003, 0.012), Vector3(-2.7 + i * 0.9 + 0.1 * (i % 2), 0.03, -1.30 + (i % 3) * 0.05), _plain(Color(0.7, 0.86, 0.92), 0.0, 0.3))
	var skirt := _plain(Color(0.46, 0.52, 0.40), 0.0, 0.9)   # the land's cut edge: front and both sides
	_b(self, Vector3(BOARD.x, GROUND, 0.012), Vector3(0, 0, BOARD.y * 0.5), skirt)
	for sx in [-1.0, 1.0]: _b(self, Vector3(0.012, GROUND, BOARD.y * 0.5 + 1.0), Vector3(sx * BOARD.x * 0.5, 0, (BOARD.y * 0.5 - 1.0) * 0.5), skirt)
	var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var x := -BOARD.x * 0.5; var zf := BOARD.y * 0.5
	while x < BOARD.x * 0.5 - 0.001:
		var x2 := minf(x + 0.1, BOARD.x * 0.5)
		var a := Vector3(x, GROUND, shore(x)); var b := Vector3(x2, GROUND, shore(x2)); var c := Vector3(x2, GROUND, zf); var d := Vector3(x, GROUND, zf)
		for v in [a, b, c, a, c, d]: st.set_normal(Vector3.UP); st.add_vertex(v)
		x = x2
	var land := MeshInstance3D.new(); land.mesh = st.commit(); land.material_override = _plain(Color(0.55, 0.62, 0.47), 0.0, 0.9); add_child(land); land.name = "Land"
	# the beach: a pale strip along the shore
	var sb := SurfaceTool.new(); sb.begin(Mesh.PRIMITIVE_TRIANGLES)
	x = -BOARD.x * 0.5
	while x < BOARD.x * 0.5 - 0.001:
		var x2 := minf(x + 0.1, BOARD.x * 0.5)
		var a := Vector3(x, GROUND + 0.002, shore(x)); var b := Vector3(x2, GROUND + 0.002, shore(x2)); var c := Vector3(x2, GROUND + 0.002, shore(x2) + 0.09); var d := Vector3(x, GROUND + 0.002, shore(x) + 0.09)
		for v in [a, b, c, a, c, d]: sb.set_normal(Vector3.UP); sb.add_vertex(v)
		x = x2
	var beach := MeshInstance3D.new(); beach.mesh = sb.commit(); beach.material_override = _plain(Color(0.84, 0.78, 0.60), 0.0, 0.95); add_child(beach)
	# main road with a dashed centre line, and a spur to every stop
	var road := _plain(Color(0.23, 0.24, 0.27), 0.0, 0.9)
	_b(self, Vector3(BOARD.x, 0.008, 0.30), Vector3(0, GROUND, ROAD_Z), road)
	for i in 22: _b(self, Vector3(0.12, 0.002, 0.012), Vector3(-3.05 + i * 0.29, GROUND + 0.008, ROAD_Z), _plain(Color(0.86, 0.84, 0.74), 0.0, 0.8))
	for n in STOPS.size():
		var z1: float = STOPS[n].y
		_b(self, Vector3(0.2, 0.007, absf(z1 - ROAD_Z)), Vector3(STOPS[n].x, GROUND, (ROAD_Z + z1) * 0.5), road)
	# the pipe rack along the route: copper where the chapter before it is done, dull where not
	for n in range(STOPS.size() - 1):
		var laid := str(states[n]) == "done"
		var pm := _plain(Color(0.86, 0.52, 0.28), 0.9, 0.3) if laid else _plain(Color(0.46, 0.41, 0.37), 0.1, 0.7)
		var a := STOPS[n]; var b := STOPS[n + 1]
		var y := GROUND + 0.085
		_tube(self, Vector3(a.x, y, PIPE_Z), Vector3(b.x, y, PIPE_Z), 0.022, pm)
		_tube(self, Vector3(a.x, y, a.y), Vector3(a.x, y, PIPE_Z), 0.022, pm)
		_tube(self, Vector3(b.x, y, b.y), Vector3(b.x, y, PIPE_Z), 0.022, pm)
		var steps := int(absf(b.x - a.x) / 0.36)
		for i in range(steps + 1):
			var sx := a.x + (b.x - a.x) * (float(i) + 0.5) / float(steps + 1)
			_b(self, Vector3(0.03, 0.075, 0.07), Vector3(sx, GROUND, PIPE_Z), _plain(Color(0.5, 0.5, 0.5), 0.0, 0.8))
	# the jetty and the sulfur ship
	var wood := _plain(Color(0.50, 0.36, 0.22), 0.0, 0.8)
	_b(self, Vector3(0.26, 0.014, 0.62), Vector3(2.15, 0.036, -1.18), wood)
	for i in 3:
		for sx in [-1.0, 1.0]: _b(self, Vector3(0.025, 0.05, 0.025), Vector3(2.15 + sx * 0.12, 0.0, -1.38 + i * 0.2), wood)
	if ship:
		var hull := _b(self, Vector3(0.55, 0.07, 0.17), Vector3(2.62, 0.03, -1.22), _plain(Color(0.18, 0.22, 0.32), 0.0, 0.5))
		_b(self, Vector3(0.55, 0.018, 0.175), Vector3(2.62, 0.10, -1.22), _plain(RED, 0.0, 0.5))
		_b(self, Vector3(0.14, 0.09, 0.14), Vector3(2.82, 0.118, -1.22), _plain(Color(0.9, 0.9, 0.86), 0.0, 0.5))
		for i in 2: _c(self, 0.07, 0.05, Vector3(2.5 - i * 0.19 + 0.12, 0.118, -1.22), _plain(Color(0.9, 0.78, 0.2), 0.0, 0.8), 0.0, 12)
		hull.name = "Ship"

func _pad(p: Node3D, n: int) -> void:
	_b(p, Vector3(PAD.x, 0.03, PAD.y), Vector3(0, 0, 0), _mat(CONC, 0.0, 0.85))
	if n == 6: _b(p, Vector3(PAD.x - 0.08, 0.003, PAD.y - 0.08), Vector3(0, 0.03, 0), _mat(Color(0.62, 0.64, 0.6), 0.0, 0.95))

func _flag(p: Node3D) -> void:   # a finished chapter: a brass flag on the pad's front corner and a brass tag on its front edge
	var br := _plain(BRASS, 0.9, 0.28, BRASS, 0.5)
	_c(p, 0.014, 0.56, Vector3(0.40, 0.03, 0.30), br, -1.0, 8)
	_b(p, Vector3(0.24, 0.13, 0.012), Vector3(0.52, 0.46, 0.30), br)
	_ball(p, 0.03, Vector3(0.40, 0.60, 0.30), br)
	_b(p, Vector3(0.24, 0.012, 0.07), Vector3(-0.10, 0.03, 0.42), br)

# ---- the stops ------------------------------------------------------------------------------------------------------------------------------------
func _gate(p: Node3D) -> void:
	var y := 0.03
	_b(p, Vector3(0.30, 0.20, 0.24), Vector3(0.22, y, -0.06), _mat(CREAM, 0.0, 0.7))        # the gatehouse
	_b(p, Vector3(0.36, 0.025, 0.30), Vector3(0.22, y + 0.20, -0.06), _mat(DARK, 0.0, 0.6))
	_win(p, Vector3(0.20, 0.07, 0.01), Vector3(0.22, y + 0.08, 0.065))
	for sx in [-0.34, -0.02]: _b(p, Vector3(0.035, 0.24, 0.035), Vector3(sx, y, 0.18), _mat(STEEL, 0.5, 0.4))   # the gate posts and the sign beam
	_b(p, Vector3(0.40, 0.045, 0.03), Vector3(-0.18, y + 0.24, 0.18), _mat(DARK, 0.0, 0.5))
	if _lit: _ball(p, 0.03, Vector3(-0.18, y + 0.30, 0.18), _plain(Color(0.96, 0.93, 0.78), 0.0, 0.4, Color(0.98, 0.94, 0.7), 2.0))   # the night shift's moon
	for i in 4: _b(p, Vector3(0.085, 0.022, 0.022), Vector3(-0.40 + i * 0.085 + 0.04, y + 0.10, 0.18), _mat(RED if i % 2 == 0 else WHITE, 0.0, 0.5))   # the barrier arm
	_lamp(p, Vector3(0.22, y + 0.26, 0.04), Color(1.0, 0.8, 0.45))

func _lab(p: Node3D) -> void:
	var y := 0.03
	_b(p, Vector3(0.66, 0.24, 0.42), Vector3(-0.05, y, -0.02), _mat(WHITE, 0.0, 0.55))      # the lab block
	_b(p, Vector3(0.70, 0.02, 0.46), Vector3(-0.05, y + 0.24, -0.02), _mat(TEAL, 0.0, 0.5))
	for i in 5: _win(p, Vector3(0.075, 0.09, 0.01), Vector3(-0.30 + i * 0.125, y + 0.09, 0.19))
	_b(p, Vector3(0.20, 0.07, 0.16), Vector3(-0.2, y + 0.26, -0.02), _mat(STEEL, 0.6, 0.4))  # fume hood housing on the roof
	_c(p, 0.025, 0.2, Vector3(-0.2, y + 0.33, -0.02), _mat(STEEL, 0.7, 0.3))
	_b(p, Vector3(0.20, 0.13, 0.26), Vector3(0.40, y, -0.02), _mat(CREAM, 0.0, 0.6))       # the annex with its glass dome
	_dome(p, 0.08, Vector3(0.40, y + 0.13, -0.02), _mat(GLASS, 0.3, 0.15))
	_c(p, 0.03, 0.14, Vector3(0.1, y + 0.26, -0.12), _mat(WHITE, 0.0, 0.5), 0.02)

func _burner(p: Node3D) -> void:
	var y := 0.03
	_b(p, Vector3(0.46, 0.22, 0.40), Vector3(-0.2, y, -0.08), _mat(BRICK, 0.0, 0.8))
	_b(p, Vector3(0.50, 0.02, 0.44), Vector3(-0.2, y + 0.22, -0.08), _mat(DARK, 0.0, 0.7))
	for i in 2: _win(p, Vector3(0.07, 0.08, 0.01), Vector3(-0.32 + i * 0.12, y + 0.08, 0.125))
	_lie(p, 0.085, 0.36, Vector3(-0.2, y + 0.30, 0.04), _mat(STEEL, 0.75, 0.3))              # the burner barrel on the roof
	_ball(p, 0.085, Vector3(0.0, y + 0.30, 0.04), _mat(STEEL, 0.75, 0.3))
	var sc := _c(p, 0.037, 0.74, Vector3(0.22, y, -0.1), _mat(Color(0.82, 0.82, 0.8), 0.5, 0.4), 0.026)   # the stack: white with red bands
	_c(p, 0.04, 0.07, Vector3(0.22, y + 0.60, -0.1), _mat(RED, 0.0, 0.5), 0.036); _c(p, 0.045, 0.07, Vector3(0.22, y + 0.37, -0.1), _mat(RED, 0.0, 0.5), 0.04)
	_c(p, 0.12, 0.09, Vector3(0.28, y, 0.2), _mat(Color(0.9, 0.78, 0.2), 0.0, 0.9), 0.0, 16)   # the sulfur heap
	if _lit: _ball(p, 0.022, Vector3(0.22, y + 0.76, -0.1), _plain(Color(1.0, 0.5, 0.2), 0.0, 0.5, Color(1.0, 0.45, 0.15), 3.0))
	sc.name = "Stack"

func _converter(p: Node3D) -> void:
	var y := 0.03
	_b(p, Vector3(0.30, 0.20, 0.36), Vector3(-0.26, y, -0.1), _mat(CREAM, 0.0, 0.6))
	_win(p, Vector3(0.18, 0.07, 0.01), Vector3(-0.26, y + 0.09, 0.085))
	_c(p, 0.13, 0.48, Vector3(0.10, y, -0.05), _mat(STEEL, 0.75, 0.3)); _dome(p, 0.13, Vector3(0.10, y + 0.48, -0.05), _mat(STEEL, 0.75, 0.3))   # the converter vessel
	for i in 3: _c(p, 0.137, 0.018, Vector3(0.10, y + 0.1 + i * 0.14, -0.05), _mat(DARK, 0.4, 0.5))
	_c(p, 0.085, 0.30, Vector3(0.34, y, 0.1), _mat(STEEL, 0.75, 0.3)); _dome(p, 0.085, Vector3(0.34, y + 0.30, 0.1), _mat(STEEL, 0.75, 0.3))   # the exchanger beside it
	_tube(p, Vector3(0.10, y + 0.26, 0.08), Vector3(0.34, y + 0.2, 0.1), 0.02, _mat(DARK, 0.5, 0.4))
	_tube(p, Vector3(-0.1, y + 0.18, -0.05), Vector3(-0.03, y + 0.18, -0.05), 0.02, _mat(DARK, 0.5, 0.4))
	_c(p, 0.015, 0.12, Vector3(0.10, y + 0.60, -0.05), _mat(DARK, 0.4, 0.5))

func _catalyst(p: Node3D) -> void:
	var y := 0.03
	for k in 2:
		var x := -0.20 + k * 0.40
		_c(p, 0.115, 0.58, Vector3(x, y + 0.06, -0.02), _mat(Color(0.7, 0.74, 0.78), 0.75, 0.3)); _dome(p, 0.115, Vector3(x, y + 0.64, -0.02), _mat(Color(0.7, 0.74, 0.78), 0.75, 0.3))
		for i in 3: _c(p, 0.122, 0.022, Vector3(x, y + 0.2 + i * 0.15, -0.02), _mat(BRASS, 0.8, 0.35))   # the bands: gold
		for a in 4: _b(p, Vector3(0.02, 0.07, 0.02), Vector3(x + cos(a * PI * 0.5 + 0.8) * 0.09, y, -0.02 + sin(a * PI * 0.5 + 0.8) * 0.09), _mat(DARK, 0.3, 0.6))
	_tube(p, Vector3(-0.08, y + 0.2, -0.02), Vector3(0.28, y + 0.2, -0.02), 0.022, _mat(DARK, 0.4, 0.5))
	_b(p, Vector3(0.18, 0.10, 0.14), Vector3(0.0, y, 0.2), _mat(CREAM, 0.0, 0.6)); _win(p, Vector3(0.10, 0.04, 0.01), Vector3(0.0, y + 0.04, 0.275))
	_lamp(p, Vector3(-0.20, y + 0.76, -0.02), Color(1.0, 0.4, 0.3)); _lamp(p, Vector3(0.20, y + 0.76, -0.02), Color(1.0, 0.4, 0.3))

func _loop(p: Node3D) -> void:
	var y := 0.03
	var pm := _mat(STEEL, 0.8, 0.3)
	var lx := 0.34; var lz := 0.24; var ly := y + 0.19
	for q in [Vector3(-lx, ly, -lz), Vector3(lx, ly, -lz), Vector3(lx, ly, lz), Vector3(-lx, ly, lz)]: _b(p, Vector3(0.03, 0.19, 0.03), Vector3(q.x, y, q.z), _mat(DARK, 0.3, 0.6))
	var pts := [Vector3(-lx, ly, -lz), Vector3(lx, ly, -lz), Vector3(lx, ly, lz), Vector3(-lx, ly, lz), Vector3(-lx, ly, -lz)]
	for i in 4: _tube(p, pts[i], pts[i + 1], 0.03, pm)
	for q in pts: _ball(p, 0.03, q, pm)
	_b(p, Vector3(0.24, 0.17, 0.18), Vector3(0.0, y, -0.02), _mat(CREAM, 0.0, 0.6)); _b(p, Vector3(0.26, 0.015, 0.20), Vector3(0.0, y + 0.17, -0.02), _mat(DARK, 0.0, 0.7))   # the compressor house in the loop
	_win(p, Vector3(0.14, 0.05, 0.01), Vector3(0.0, y + 0.07, 0.075))
	_lie(p, 0.045, 0.2, Vector3(0.0, y + 0.23, -0.02), _mat(BLUE, 0.4, 0.4))
	_lie(p, 0.06, 0.30, Vector3(-0.0, y + 0.07, 0.34), _mat(STEEL, 0.75, 0.3), false)   # an exchanger shell on its saddles
	_c(p, 0.03, 0.22, Vector3(-0.38, y, 0.30), _mat(Color(0.85, 0.85, 0.82), 0.4, 0.5), 0.022)

func _yard(p: Node3D) -> void:
	var y := 0.03
	var w := _mat(CONC, 0.0, 0.8)
	var hx := 0.40; var hz := 0.31
	_b(p, Vector3(hx * 2, 0.07, 0.03), Vector3(0, y, hz), w); _b(p, Vector3(hx * 2, 0.07, 0.03), Vector3(0, y, -hz), w)   # the bund wall
	_b(p, Vector3(0.03, 0.07, hz * 2), Vector3(hx, y, 0), w); _b(p, Vector3(0.03, 0.07, hz * 2), Vector3(-hx, y, 0), w)
	for i in 2:
		var x := -0.22 + i * 0.26
		_c(p, 0.10, 0.26, Vector3(x, y, 0.06), _mat(WHITE, 0.2, 0.4)); _dome(p, 0.10, Vector3(x, y + 0.26, 0.06), _mat(WHITE, 0.2, 0.4), 0.6)
	_ball(p, 0.11, Vector3(0.3, y + 0.19, -0.12), _mat(Color(0.86, 0.88, 0.9), 0.5, 0.3))   # a sphere on legs
	for a in 3: _tube(p, Vector3(0.3 + cos(a * 2.1) * 0.08, y, -0.12 + sin(a * 2.1) * 0.08), Vector3(0.3 + cos(a * 2.1) * 0.08, y + 0.17, -0.12 + sin(a * 2.1) * 0.08), 0.01, _mat(DARK, 0.3, 0.6))
	_c(p, 0.014, 0.62, Vector3(-0.30, y, -0.18), _mat(DARK, 0.3, 0.6))   # the flare
	if _lit: _c(p, 0.026, 0.07, Vector3(-0.30, y + 0.62, -0.18), _plain(Color(1.0, 0.5, 0.15), 0.0, 0.5, Color(1.0, 0.45, 0.1), 3.5), 0.0, 8)
	_tube(p, Vector3(-0.22, y + 0.12, 0.06), Vector3(0.04, y + 0.12, 0.06), 0.012, _mat(DARK, 0.4, 0.5))

func _works(p: Node3D) -> void:
	var y := 0.03
	_b(p, Vector3(0.34, 0.20, 0.30), Vector3(-0.28, y, 0.0), _mat(BRICK, 0.0, 0.8)); _b(p, Vector3(0.38, 0.02, 0.34), Vector3(-0.28, y + 0.20, 0.0), _mat(DARK, 0.0, 0.7))
	for i in 2: _win(p, Vector3(0.07, 0.08, 0.01), Vector3(-0.36 + i * 0.16, y + 0.08, 0.155))
	_c(p, 0.075, 0.62, Vector3(0.12, y, -0.1), _mat(STEEL, 0.75, 0.3)); _dome(p, 0.075, Vector3(0.12, y + 0.62, -0.1), _mat(STEEL, 0.75, 0.3))   # a column
	for i in 3: _c(p, 0.082, 0.014, Vector3(0.12, y + 0.14 + i * 0.16, -0.1), _mat(DARK, 0.4, 0.5))
	_c(p, 0.03, 0.70, Vector3(0.36, y, -0.12), _mat(Color(0.84, 0.84, 0.82), 0.5, 0.4), 0.022)   # the stack
	_c(p, 0.1, 0.20, Vector3(0.28, y, 0.18), _mat(WHITE, 0.2, 0.4)); _dome(p, 0.1, Vector3(0.28, y + 0.20, 0.18), _mat(WHITE, 0.2, 0.4), 0.6)   # a tank
	_tube(p, Vector3(-0.12, y + 0.46, -0.04), Vector3(0.12, y + 0.46, -0.1), 0.02, _mat(DARK, 0.4, 0.5))   # a gantry pipe from the house to the column
	_tube(p, Vector3(-0.12, y + 0.22, -0.04), Vector3(-0.12, y + 0.46, -0.04), 0.012, _mat(DARK, 0.4, 0.5))
	_lie(p, 0.05, 0.22, Vector3(0.0, y + 0.07, 0.2), _mat(BLUE, 0.4, 0.4))
	_lamp(p, Vector3(0.36, y + 0.72, -0.12), Color(1.0, 0.4, 0.3))

func _control(p: Node3D) -> void:
	var y := 0.03
	_b(p, Vector3(0.74, 0.20, 0.40), Vector3(-0.05, y, -0.02), _mat(Color(0.82, 0.84, 0.86), 0.0, 0.5))
	_b(p, Vector3(0.80, 0.022, 0.46), Vector3(-0.05, y + 0.20, -0.02), _mat(DARK, 0.0, 0.6))
	var g := _plain(Color(0.45, 0.78, 0.9), 0.2, 0.1, Color(0.5, 0.85, 0.95), 1.6) if _lit else _plain(Color(0.2, 0.22, 0.25), 0.0, 0.3)   # the glass band
	_b(p, Vector3(0.62, 0.085, 0.01), Vector3(-0.05, y + 0.07, 0.18), g)
	_c(p, 0.012, 0.36, Vector3(0.22, y + 0.22, -0.1), _mat(STEEL, 0.6, 0.4)); _lamp(p, Vector3(0.22, y + 0.60, -0.1), Color(1.0, 0.25, 0.2))
	_dome(p, 0.06, Vector3(-0.25, y + 0.222, -0.05), _mat(WHITE, 0.0, 0.4), 0.9)   # a dish on the roof
	_b(p, Vector3(0.20, 0.05, 0.12), Vector3(0.0, y + 0.222, -0.1), _mat(STEEL, 0.6, 0.4))

func _turnaround(p: Node3D) -> void:
	var y := 0.03
	var sm := _mat(YEL, 0.2, 0.5)
	_c(p, 0.10, 0.34, Vector3(-0.2, y, 0.0), _mat(STEEL, 0.75, 0.3)); _dome(p, 0.10, Vector3(-0.2, y + 0.34, 0.0), _mat(STEEL, 0.75, 0.3))   # a vessel under repair
	for k in 2:   # the scaffold: four posts, three decks, braces
		var x := -0.20 + k * 0.38 - (0.0 if k == 0 else 0.0)
		var s := 0.19 if k == 0 else 0.15
		for cx in [-1.0, 1.0]:
			for cz in [-1.0, 1.0]: _tube(p, Vector3(x + cx * s, y, cz * s), Vector3(x + cx * s, y + 0.46, cz * s), 0.012, sm)
		for l in 3: _b(p, Vector3(s * 2.1, 0.012, s * 2.1), Vector3(x, y + 0.14 + l * 0.15, 0), _mat(Color(0.7, 0.6, 0.3), 0.0, 0.7))
		_tube(p, Vector3(x - s, y + 0.02, s), Vector3(x + s, y + 0.30, s), 0.008, sm)
	_tube(p, Vector3(0.40, y, -0.22), Vector3(0.40, y + 0.74, -0.22), 0.02, sm)   # the crane
	_tube(p, Vector3(0.40, y + 0.74, -0.22), Vector3(-0.06, y + 0.70, -0.22), 0.014, sm)
	_tube(p, Vector3(-0.06, y + 0.70, -0.22), Vector3(-0.06, y + 0.36, -0.22), 0.004, _mat(DARK, 0.2, 0.6))
	_b(p, Vector3(0.03, 0.04, 0.03), Vector3(-0.06, y + 0.32, -0.22), _mat(DARK, 0.3, 0.6))
	_b(p, Vector3(0.12, 0.05, 0.10), Vector3(0.40, y, -0.22), _mat(DARK, 0.3, 0.7))
	_lamp(p, Vector3(0.40, y + 0.77, -0.22), Color(1.0, 0.72, 0.2))

func _pumps(p: Node3D) -> void:
	var y := 0.03
	_b(p, Vector3(0.30, 0.15, 0.30), Vector3(-0.28, y, -0.05), _mat(CREAM, 0.0, 0.6)); _b(p, Vector3(0.34, 0.018, 0.34), Vector3(-0.28, y + 0.15, -0.05), _mat(DARK, 0.0, 0.7))   # the pump shed
	_win(p, Vector3(0.14, 0.06, 0.01), Vector3(-0.28, y + 0.06, 0.105))
	_b(p, Vector3(0.22, 0.03, 0.12), Vector3(0.02, y, 0.14), _mat(Color(0.6, 0.6, 0.6), 0.0, 0.8))   # a pump on its plinth
	_lie(p, 0.05, 0.14, Vector3(0.0, y + 0.08, 0.14), _mat(BLUE, 0.4, 0.4)); _ball(p, 0.055, Vector3(0.08, y + 0.085, 0.14), _mat(BLUE, 0.4, 0.4))
	_tube(p, Vector3(0.08, y + 0.1, 0.14), Vector3(0.08, y + 0.44, 0.14), 0.016, _mat(STEEL, 0.6, 0.4))
	for sx in [-1.0, 1.0]:   # the deck and the drum on it
		for sz in [-1.0, 1.0]: _tube(p, Vector3(0.22 + sx * 0.14, y, -0.1 + sz * 0.08), Vector3(0.22 + sx * 0.14, y + 0.36, -0.1 + sz * 0.08), 0.01, _mat(DARK, 0.3, 0.6))
	_b(p, Vector3(0.36, 0.014, 0.22), Vector3(0.22, y + 0.36, -0.1), _mat(Color(0.5, 0.5, 0.5), 0.3, 0.6))
	_lie(p, 0.075, 0.30, Vector3(0.22, y + 0.46, -0.1), _mat(STEEL, 0.75, 0.3)); _ball(p, 0.075, Vector3(0.07, y + 0.46, -0.1), _mat(STEEL, 0.75, 0.3)); _ball(p, 0.075, Vector3(0.37, y + 0.46, -0.1), _mat(STEEL, 0.75, 0.3))
	_tube(p, Vector3(0.08, y + 0.44, 0.14), Vector3(0.08, y + 0.44, -0.1), 0.016, _mat(STEEL, 0.6, 0.4)); _tube(p, Vector3(0.08, y + 0.44, -0.1), Vector3(0.12, y + 0.44, -0.1), 0.016, _mat(STEEL, 0.6, 0.4))

func _office(p: Node3D) -> void:
	var y := 0.03
	_b(p, Vector3(0.50, 0.36, 0.34), Vector3(-0.1, y, -0.04), _mat(Color(0.84, 0.80, 0.72), 0.0, 0.5))   # two storeys
	_b(p, Vector3(0.54, 0.02, 0.38), Vector3(-0.1, y + 0.36, -0.04), _mat(DARK, 0.0, 0.6))
	for r in 2: for i in 4: _win(p, Vector3(0.07, 0.09, 0.01), Vector3(-0.27 + i * 0.12, y + 0.05 + r * 0.17, 0.135))
	_b(p, Vector3(0.12, 0.10, 0.02), Vector3(-0.1, y, 0.14), _mat(GLASS, 0.3, 0.2))   # the door
	_c(p, 0.01, 0.52, Vector3(0.28, y, 0.2), _mat(STEEL, 0.6, 0.4), -1.0, 8); _b(p, Vector3(0.15, 0.09, 0.008), Vector3(0.355, y + 0.40, 0.2), _mat(RED, 0.0, 0.7))   # the flag pole and flag
	for q in [Vector3(-0.38, 0, 0.22), Vector3(0.12, 0, 0.26)]: _c(p, 0.012, 0.06, Vector3(q.x, y, q.z), _mat(Color(0.4, 0.3, 0.2), 0.0, 0.9), -1.0, 6); _ball(p, 0.06, Vector3(q.x, y + 0.11, q.z), _plain(Color(0.30, 0.50, 0.30), 0.0, 0.9) if _lit else _mat(Color(0.3, 0.5, 0.3), 0.0, 0.9))
	_lamp(p, Vector3(-0.1, y + 0.40, 0.15), Color(1.0, 0.8, 0.45))

# ---- state --------------------------------------------------------------------------------------------------------------------------------------
func set_selected(n: int) -> void:
	sel = n
	var on := n >= 0 and n < stops.size()
	_ring.visible = on; _marker.visible = on
	if on:
		var sp: Vector3 = (stops[n] as Node3D).position
		_ring.position = Vector3(sp.x, GROUND + 0.012, sp.z); _ring_pos = Vector3(sp.x, GROUND + HEIGHT[n] + 0.17, sp.z)

func _process(dt: float) -> void:
	_t += dt
	if _marker != null and _marker.visible and not CbSettings.reduced_motion:
		_marker.position = _ring_pos + Vector3(0, 0.03 * sin(_t * 3.0), 0)
	elif _marker != null: _marker.position = _ring_pos

## World points of a stop for the labels: the top of its building and the front of its pad.
func top_world(n: int) -> Vector3: return to_global(Vector3(STOPS[n].x, GROUND + HEIGHT[n] + 0.08, STOPS[n].y))
func front_world(n: int) -> Vector3: return to_global(Vector3(STOPS[n].x, GROUND, STOPS[n].y + PAD.y * 0.5 + 0.02))
