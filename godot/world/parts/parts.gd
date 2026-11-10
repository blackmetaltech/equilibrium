class_name Parts
extends RefCounted
## The parts library: reusable procedural pieces (vessel shell with heads, skid, motor, nozzle, platform + ladder, pipe stub, stack,
## flange ring, beacon, valve handwheel, control valve). Pure functions that add meshes under a parent; all built from primitives.
## Positions are centres in the parent's space (y up, ground at y = 0) unless a function says otherwise.

static func _mi(parent: Node, mesh: Mesh, pos: Vector3, mat: Material, shadow := true) -> MeshInstance3D:
	var mi := MeshInstance3D.new(); mi.mesh = mesh; mi.position = pos; mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadow else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mi); return mi

static func box(parent: Node, size: Vector3, pos: Vector3, mat: Material, shadow := true) -> MeshInstance3D:
	var bm := BoxMesh.new(); bm.size = size; return _mi(parent, bm, pos, mat, shadow)

## A cylinder (or cone when r_bot differs) centred at pos; `rot` in degrees (Vector3(0,0,90) lays it along x).
static func cyl(parent: Node, r: float, h: float, pos: Vector3, mat: Material, rot := Vector3.ZERO, r_bot := -1.0, seg := 20, shadow := true) -> MeshInstance3D:
	var cm := CylinderMesh.new(); cm.top_radius = r; cm.bottom_radius = r if r_bot < 0.0 else r_bot; cm.height = h; cm.radial_segments = seg; cm.rings = 1
	var mi := _mi(parent, cm, pos, mat, shadow); mi.rotation_degrees = rot; return mi

## A sphere; sy squashes it vertically (0.5 = a 2:1 elliptical vessel head).
static func sphere(parent: Node, r: float, pos: Vector3, mat: Material, sy := 1.0, seg := 24) -> MeshInstance3D:
	var sm := SphereMesh.new(); sm.radius = r; sm.height = 2.0 * r * sy; sm.radial_segments = seg; sm.rings = maxi(8, seg / 2)
	return _mi(parent, sm, pos, mat)

static func torus(parent: Node, r_in: float, r_out: float, pos: Vector3, mat: Material, rot := Vector3.ZERO) -> MeshInstance3D:
	var tm := TorusMesh.new(); tm.inner_radius = r_in; tm.outer_radius = r_out; tm.rings = 20; tm.ring_segments = 8
	var mi := _mi(parent, tm, pos, mat); mi.rotation_degrees = rot; return mi

## A flange ring: a short fat disc on a pipe or nozzle, axis along `rot`.
static func flange(parent: Node, r: float, pos: Vector3, rot := Vector3.ZERO, mat: Material = null) -> MeshInstance3D:
	return cyl(parent, r * 1.45, r * 0.34, pos, mat if mat != null else PMat.dark_metal(), rot, -1.0, 14)

## A pipe between two points.
static func pipe(parent: Node, a: Vector3, b: Vector3, r: float, mat: Material, flanges := false) -> MeshInstance3D:
	var d := b - a; var L := d.length()
	if L < 0.001: return flange(parent, r, a, Vector3.ZERO, mat)   # a degenerate run is a flange, never a zero-height mesh (NaN normals)
	var mi := cyl(parent, r, L, (a + b) * 0.5, mat, Vector3.ZERO, -1.0, 12)
	if L > 0.001:
		var up := d / L; var ax := Vector3.UP.cross(up)
		if ax.length() > 0.0001: mi.basis = Basis(ax.normalized(), acos(clampf(Vector3.UP.dot(up), -1.0, 1.0)))
		elif up.y < 0.0: mi.basis = Basis(Vector3.RIGHT, PI)
	if flanges:
		for p in [a, b]:
			var fl := flange(parent, r, p); fl.basis = mi.basis
	return mi

## A vessel with elliptical heads. base_y is the bottom of the cylindrical shell. Returns the group (shell parts are children).
static func vessel(parent: Node, r: float, h: float, mat: Material, base_y := 0.0, pos_xz := Vector3.ZERO) -> Node3D:
	var g := Node3D.new(); g.position = pos_xz; parent.add_child(g)
	cyl(g, r, h, Vector3(0, base_y + h * 0.5, 0), mat, Vector3.ZERO, -1.0, 28)
	sphere(g, r, Vector3(0, base_y + h, 0), mat, 0.5, 28); sphere(g, r, Vector3(0, base_y, 0), mat, 0.5, 28)
	return g

## A horizontal vessel along x, centre at pos, length L between the tangent lines.
static func vessel_h(parent: Node, r: float, L: float, mat: Material, pos: Vector3) -> Node3D:
	var g := Node3D.new(); g.position = pos; parent.add_child(g)
	cyl(g, r, L, Vector3.ZERO, mat, Vector3(0, 0, 90), -1.0, 28)
	for s in [-1.0, 1.0]:
		var hd := sphere(g, r, Vector3(s * L * 0.5, 0, 0), mat, 0.5, 28); hd.rotation_degrees = Vector3(0, 0, -90.0 * s)
	return g

static func saddle(parent: Node, x: float, r: float, y_centre: float, width := 0.5) -> void:
	var m := PMat.concrete()
	box(parent, Vector3(width, y_centre - r * 0.55, r * 2.0), Vector3(x, (y_centre - r * 0.55) * 0.5, 0), m)
	box(parent, Vector3(width + 0.2, 0.12, r * 2.3), Vector3(x, 0.06, 0), PMat.dark_metal())

## A steel skid frame: base plate, two longitudinal I-beams, cross members. size = (length x, height y, width z), centre at pos.
static func skid(parent: Node, size: Vector3, pos: Vector3, mat: Material = null) -> Node3D:
	var g := Node3D.new(); g.position = pos; parent.add_child(g)
	var m: Material = mat if mat != null else PMat.paint("steel")
	box(g, Vector3(size.x, size.y * 0.35, size.z), Vector3(0, size.y * 0.175, 0), m)
	for s in [-1.0, 1.0]:
		box(g, Vector3(size.x, size.y * 0.65, 0.16), Vector3(0, size.y * 0.675, s * (size.z * 0.5 - 0.1)), m)
	var n := int(size.x / 0.9)
	for i in range(n + 1):
		box(g, Vector3(0.12, size.y * 0.6, size.z - 0.2), Vector3(-size.x * 0.5 + 0.06 + i * (size.x - 0.12) / maxf(1.0, n), size.y * 0.65, 0), m)
	return g

## An electric motor along x: finned body, end cowl with a fan, terminal box. Returns the group; `fan` meta holds the rotating node.
static func motor(parent: Node, pos: Vector3, r: float, L: float, mat: Material = null) -> Node3D:
	var g := Node3D.new(); g.position = pos; parent.add_child(g)
	var m: Material = mat if mat != null else PMat.paint("motor")
	cyl(g, r, L, Vector3.ZERO, m, Vector3(0, 0, 90), -1.0, 24)
	for i in range(6): cyl(g, r * 1.07, 0.07, Vector3(-L * 0.4 + i * L * 0.16, 0, 0), m, Vector3(0, 0, 90), -1.0, 24)
	cyl(g, r * 0.95, L * 0.18, Vector3(-L * 0.58, 0, 0), PMat.dark_metal(), Vector3(0, 0, 90), r * 1.05, 24)
	box(g, Vector3(r * 0.8, r * 0.5, r * 0.8), Vector3(L * 0.1, r * 1.05, 0), PMat.dark_metal())
	var fan := Node3D.new(); fan.position = Vector3(-L * 0.68, 0, 0); g.add_child(fan)
	for k in range(4):
		var b := box(fan, Vector3(0.05, r * 1.7, r * 0.34), Vector3.ZERO, PMat.metal(), false); b.rotation_degrees.x = 45.0 * k
	g.set_meta("fan", fan)
	return g

## A nozzle: a stub from `base` along `dir` with a flange at the end. Returns the end point.
static func nozzle(parent: Node, base: Vector3, dir: Vector3, r: float, L: float, mat: Material = null) -> Vector3:
	var e := base + dir.normalized() * L
	pipe(parent, base, e, r, mat if mat != null else PMat.metal())
	var fl := flange(parent, r, e - dir.normalized() * 0.04)
	var up := dir.normalized(); var ax := Vector3.UP.cross(up)
	if ax.length() > 0.0001: fl.basis = Basis(ax.normalized(), acos(clampf(Vector3.UP.dot(up), -1.0, 1.0)))
	return e

## A round grating platform around a vessel at height y, with posts and a top rail. r = vessel radius.
static func platform(parent: Node, r: float, y: float, width := 0.9, pos_xz := Vector3.ZERO) -> Node3D:
	var g := Node3D.new(); g.position = Vector3(pos_xz.x, y, pos_xz.z); parent.add_child(g)
	var n := 12; var rm := r + width * 0.5; var seg_w := TAU * rm / n * 1.08
	var m := PMat.dark_metal(); var rail := PMat.safety()
	for i in range(n):
		var a := TAU * i / n; var p := Vector3(cos(a) * rm, 0, sin(a) * rm)
		var s := box(g, Vector3(seg_w, 0.07, width), p, m); s.rotation.y = -a - PI * 0.5
		var ro := r + width
		var po := Vector3(cos(a) * ro, 0.55, sin(a) * ro)
		box(g, Vector3(0.05, 1.1, 0.05), po, rail, false)
		var tr := box(g, Vector3(TAU * ro / n * 1.04, 0.05, 0.05), Vector3(cos(a + PI / n) * ro, 1.1, sin(a + PI / n) * ro), rail, false); tr.rotation.y = -(a + PI / n) - PI * 0.5
	return g

## A vertical ladder (rails, rungs) from y = 0 to h, facing +z at pos.
static func ladder(parent: Node, pos: Vector3, h: float, width := 0.5) -> Node3D:
	var g := Node3D.new(); g.position = pos; parent.add_child(g)
	var m := PMat.safety()
	for s in [-1.0, 1.0]: box(g, Vector3(0.05, h, 0.05), Vector3(s * width * 0.5, h * 0.5, 0), m, false)
	var n := int(h / 0.38)
	for i in range(1, n + 1): box(g, Vector3(width, 0.04, 0.04), Vector3(0, i * h / (n + 1), 0), m, false)
	return g

## A tapered stack with optional red/white bands. base at pos (y = bottom).
static func stack(parent: Node, pos: Vector3, r_bot: float, r_top: float, h: float, mat: Material, bands := 0) -> Node3D:
	var g := Node3D.new(); g.position = pos; parent.add_child(g)
	cyl(g, r_top, h, Vector3(0, h * 0.5, 0), mat, Vector3.ZERO, r_bot, 20)
	for i in range(bands):
		var t0 := 1.0 - (2 * i + 1.0) / (2.0 * bands + 1.0); var t1 := t0 - 1.0 / (2.0 * bands + 1.0)
		var tm := (t0 + t1) * 0.5; var rr := lerpf(r_top, r_bot, 1.0 - tm) * 1.015
		cyl(g, rr, h / (2.0 * bands + 1.0), Vector3(0, h * tm, 0), PMat.red(), Vector3.ZERO, -1.0, 20, false)
	return g

static func beacon(parent: Node, pos: Vector3) -> PBeacon:
	var b := PBeacon.new(); b.position = pos; parent.add_child(b); return b

## A valve handwheel on a stem.
static func handwheel(parent: Node, pos: Vector3, r := 0.28) -> Node3D:
	var g := Node3D.new(); g.position = pos; parent.add_child(g)
	cyl(g, 0.035, 0.5, Vector3(0, 0.25, 0), PMat.metal(), Vector3.ZERO, -1.0, 8, false)
	var w := Node3D.new(); w.position.y = 0.55; g.add_child(w)
	torus(w, r - 0.03, r, Vector3.ZERO, PMat.red())
	for k in range(2): box(w, Vector3(r * 2.0, 0.03, 0.04), Vector3.ZERO, PMat.red(), false).rotation_degrees.y = 90.0 * k
	g.set_meta("wheel", w)
	return g

## A control valve on a line along x at pos: globe body, flanged pipe ends, bonnet and diaphragm actuator. The stem node moves
## with the valve position (set_stem 0..1). Returns the group; meta "stem" is the moving part.
static func control_valve(parent: Node, pos: Vector3, r := 0.28) -> Node3D:
	var g := Node3D.new(); g.position = pos; parent.add_child(g)
	var body := PMat.paint("process"); var act := PMat.paint("motor")
	pipe(g, Vector3(-0.9, 0, 0), Vector3(0.9, 0, 0), r, PMat.metal(), true)
	sphere(g, r * 1.55, Vector3.ZERO, body)
	cyl(g, r * 0.6, 0.55, Vector3(0, r * 1.5 + 0.2, 0), body)
	cyl(g, r * 1.4, 0.38, Vector3(0, r * 1.5 + 0.7, 0), act)
	sphere(g, r * 1.4, Vector3(0, r * 1.5 + 0.88, 0), act, 0.55)
	var stem := Node3D.new(); stem.position = Vector3(0, r * 1.5 + 0.5, 0); g.add_child(stem)
	cyl(stem, 0.04, 0.5, Vector3(0, 0.1, 0), PMat.metal(), Vector3.ZERO, -1.0, 8, false)
	var yoke := box(stem, Vector3(0.28, 0.07, 0.07), Vector3(0, 0.0, 0), PMat.safety(), false); yoke.name = "yoke"
	g.set_meta("stem", stem)
	return g

static func set_stem(valve: Node3D, v: float) -> void:
	var s: Node3D = valve.get_meta("stem"); s.position.y = lerpf(-0.08, 0.34, clampf(v, 0.0, 1.0)) + 0.5 + 0.0

## A pressure gauge: a small dial on a stub (flat face towards +z).
static func gauge(parent: Node, pos: Vector3, r := 0.22) -> void:
	cyl(parent, 0.035, 0.28, pos - Vector3(0, 0.14, 0), PMat.metal(), Vector3.ZERO, -1.0, 8, false)
	cyl(parent, r, 0.1, pos, PMat.dark_metal(), Vector3(90, 0, 0), -1.0, 16, false)
	cyl(parent, r * 0.84, 0.11, pos + Vector3(0, 0, 0.005), PMat.white(), Vector3(90, 0, 0), -1.0, 16, false)
	var nd := box(parent, Vector3(0.025, r * 0.7, 0.02), pos + Vector3(0.0, 0.0, 0.07), PMat.red(), false); nd.rotation_degrees.z = -50.0

## A concrete plinth under heavy kit.
static func plinth(parent: Node, size: Vector3, pos := Vector3.ZERO) -> MeshInstance3D:
	return box(parent, Vector3(size.x, size.y, size.z), Vector3(pos.x, size.y * 0.5 + pos.y, pos.z), PMat.concrete())
