class_name PumpHouse
extends Node3D
## F33 (0.9 plant objects): L39 "Size the Line" as things in the plant. The pump house's suction and discharge lines are drawn at the size chosen (radius from the schedule-40
## inside diameter, scaled up for legibility but in proportion: every line is R_SCALE times its real radius), coloured by the velocity guide (green in the guide, red too fast,
## amber too slow, grey with no flow) with ink bands running along them at a speed that follows the real velocity. The pump wears its name-plate (P1..P5) and, when its NPSH
## margin is under the guide, shakes and throws bubbles at the impeller eye. A sight-glass on the suction line shows NPSH available as a liquid level against the required
## mark, with a red band from required to required + margin that lights when the margin is gone. Every number is the engine's levelView(); `set_view(d)` redraws.
## `pick(screen, cam)` answers "suction" / "discharge" / "pump" for a click near one of them (the board then puts that selector in hand).
const R_SCALE := 2.5               ## world radius = R_SCALE x real inside radius x 2 (a tile is 2 m): 2" -> 0.13, 4" -> 0.26, 8" -> 0.51
const GREEN := Color("#3FAE5E")
const RED := Color("#E63946")
const AMBER := Color("#E9A23B")
const GREY := Color("#6D7480")
const GLASS_H := 4.6               ## the sight-glass: 0 .. NPSH_TOP m of head over this many world metres
const NPSH_TOP := 12.0
var ds: DisplayScene
var view := {}
var _sig := ""
var _legs := {"suction": [], "discharge": []}   ## leg -> [[a, b, MeshInstance3D, ShaderMaterial]]
var _info := {}
var _sel := ""
var _pump: UnitModel
var _pump_home := Vector3.ZERO
var _plate: Label3D
var _cav: Label3D
var _bubbles: Array = []
var _glass_liq: MeshInstance3D
var _glass_band: MeshInstance3D
var _glass_req: MeshInstance3D
var _glass_lbl: Label3D
var _glass_base := Vector3.ZERO
var _t := 0.0
static var _shader: Shader

func setup(scene: DisplayScene) -> void:
	ds = scene; name = "PumpHouse"
	_pump = scene.get_node_or_null("deco_P-301") as UnitModel
	if _pump != null: _pump_home = _pump.position
	_build_glass()
	_plate = _tag("P1", Vector3.ZERO, Color("#2B2416"), 44)
	_plate.outline_modulate = Color("#C9A94B"); _plate.outline_size = 26   # a brass name-plate: dark letters on the plate's brass
	_cav = _tag("CAVITATING", Vector3.ZERO, Color("#FF6B6B"), 34); _cav.visible = false
	for i in 14:
		var b := MeshInstance3D.new(); var sm := SphereMesh.new(); sm.radius = 0.16; sm.height = 0.32; sm.radial_segments = 8; sm.rings = 4; b.mesh = sm
		var m := StandardMaterial3D.new(); m.albedo_color = Color(1, 1, 1, 0.85); m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; m.emission_enabled = true; m.emission = Color.WHITE; m.emission_energy_multiplier = 0.6
		b.material_override = m; b.visible = false; add_child(b); _bubbles.append(b)

func _tag(text: String, pos: Vector3, col: Color, fsz := 34) -> Label3D:
	var lb := Label3D.new(); lb.text = text; lb.billboard = BaseMaterial3D.BILLBOARD_ENABLED; lb.no_depth_test = true; lb.fixed_size = true; lb.pixel_size = 0.0011; lb.font_size = fsz
	lb.outline_size = 10; lb.modulate = col; lb.font = EqTheme.font("semi"); lb.position = pos; Tag3D.setup(lb); add_child(lb)
	return lb

static func flow_shader() -> Shader:
	if _shader == null:
		_shader = Shader.new()
		_shader.code = """shader_type spatial;
uniform vec4 base : source_color = vec4(0.4, 0.45, 0.5, 1.0);
uniform float speed = 0.0;
uniform float bands = 1.0;
uniform float sel = 0.0;
void fragment() {
	float s = fract(UV.y * bands + TIME * speed);
	float band = (speed > 0.0001 || speed < -0.0001) ? smoothstep(0.62, 0.70, s) * (1.0 - smoothstep(0.86, 0.94, s)) : 0.0;
	vec3 c = mix(base.rgb, base.rgb * 0.45 + vec3(0.55), band * 0.75);
	ALBEDO = c;
	ROUGHNESS = 0.42; METALLIC = 0.25;
	EMISSION = base.rgb * (0.18 + 0.55 * sel) + vec3(band * 0.18);
}
"""
	return _shader

# ---- the scene ----------------------------------------------------------------------------------------------------------------------------------
func _t3(x: float, z: float, y: float) -> Vector3: return ds._tile(x, z) + Vector3(0, y, 0)

## The route of each leg, from the real nozzles: the tank's bottom outlet to the pump's suction eye (near the tank, or at the foot of the boiler house), and from the pump's
## discharge up the riser to the deaerator's inlet on the deck.
func _routes(far: bool) -> Dictionary:
	if _pump != null: _pump.position = _pump_home + Vector3(GRID_X * (4.0 if far else 0.0), 0, 0)
	var tank := ds.get_node_or_null("deco_T-301") as Node3D
	var drum := ds.get_node_or_null("deco_D-302") as UnitModel
	var tout := (tank.global_position + Vector3(2.6, 0.6, 0.0)) if tank != null else _t3(6.0, 10.0, 0.6)
	var pin := _pump.global_position + _pump.global_transform.basis * Vector3(2.85, 1.1, 0) if _pump != null else _t3(9.0, 10.0, 0.6)
	var pout := _pump.global_position + _pump.global_transform.basis * Vector3(2.6, 3.1, 0) if _pump != null else _t3(11.0, 10.0, 0.8)
	if _pump != null and _pump.ports.has("in"): pin = _pump.port_pos("in"); pout = _pump.port_pos("out")
	var din := drum.port_pos("in") if drum != null and drum.ports.has("in") else _t3(16.0, 5.0, 8.9)
	var rx := din.x - 1.6   # the riser stands short of the deck's edge
	var top := pout.y + 1.2
	return {
		"suction": [[tout, Vector3(pin.x - 0.6, tout.y, tout.z)], [Vector3(pin.x - 0.6, tout.y, tout.z), Vector3(pin.x - 0.6, pin.y, pin.z)], [Vector3(pin.x - 0.6, pin.y, pin.z), pin]],
		"discharge": [[pout, Vector3(pout.x, top, pout.z)], [Vector3(pout.x, top, pout.z), Vector3(rx, top, pout.z)], [Vector3(rx, top, pout.z), Vector3(rx, din.y, pout.z)],
			[Vector3(rx, din.y, pout.z), Vector3(rx, din.y, din.z)], [Vector3(rx, din.y, din.z), din]],
	}

func _pipe_of(nps: String) -> Dictionary:
	for p in view.get("pipes", []):
		if str(p.nps) == nps: return p
	return {}

## World radius of a schedule-40 line of this nominal size (in proportion to its inside diameter).
func radius_of(nps: String) -> float:
	var p := _pipe_of(nps)
	return R_SCALE * float(p.get("idMm", 100.0)) / 1000.0 if not p.is_empty() else 0.22

## The velocity guide's verdict for a leg at the operating point: ok | fast | slow | none.
func verdict(leg: String) -> String:
	var op: Dictionary = view.get("op", {}); var g: Dictionary = view.get("guide", {})
	if not bool(op.get("ok", false)) or float(op.get("q", 0.0)) <= 0.0: return "none"
	var v := float(op.get("vs" if leg == "suction" else "vd", 0.0))
	var hi := float(g.get("vsHi", 1.5)) if leg == "suction" else float(g.get("vdHi", 3.0))
	var lo := 0.0 if leg == "suction" else float(g.get("vdLo", 1.0))
	if v > hi + 1e-9: return "fast"
	if v < lo - 1e-9: return "slow"
	return "ok"

static func verdict_color(vd: String) -> Color:
	match vd:
		"ok": return GREEN
		"fast": return RED
		"slow": return AMBER
	return GREY

func set_view(d: Dictionary) -> void:
	view = d
	var ch: Dictionary = d.get("choice", {}); var op: Dictionary = d.get("op", {})
	var sig := JSON.stringify([ch, op.get("ok"), op.get("q"), op.get("vs"), op.get("vd"), op.get("npsha"), op.get("npshr"), _sel])
	if sig == _sig: return
	_sig = sig
	var far := str(ch.get("place", "near")) == "far"
	var rt := _routes(far)
	for leg in ["suction", "discharge"]:
		for seg in _legs[leg]: (seg[2] as Node).queue_free()
		_legs[leg] = []
		var nps := str(ch.get(leg, "4")); var r := radius_of(nps); var vd := verdict(leg)
		var v := float(op.get("vs" if leg == "suction" else "vd", 0.0)) if vd != "none" else 0.0
		for ab in rt[leg]:
			if ((ab[1] as Vector3) - (ab[0] as Vector3)).length() < 0.05: continue
			var mi := _seg(ab[0], ab[1], r, verdict_color(vd), v, leg == _sel)
			_legs[leg].append([ab[0], ab[1], mi, mi.material_override])
		_info[leg] = {"nps": nps, "radius": r, "color": verdict_color(vd), "verdict": vd, "v": v}
	_place_tags()
	_update_glass()
	var margin := float(op.get("margin", 99.0)); var need := float(d.get("guide", {}).get("margin", 1.0))
	var cav := bool(op.get("ok", false)) and float(op.get("q", 0.0)) > 0.0 and margin < need
	_info["cavitating"] = cav
	_cav.visible = cav
	if _pump != null: _pump.shake_hold(0.0 if (not cav or CbSettings.reduced_motion) else 0.035)
	_plate.text = " %s " % str(ch.get("pump", "P1"))
	_info["plate"] = str(ch.get("pump", "P1"))
const GRID_X := 2.0

func _seg(a: Vector3, b: Vector3, r: float, col: Color, v: float, selected: bool) -> MeshInstance3D:
	var d := b - a; var l := d.length()
	var mi := MeshInstance3D.new(); var cm := CylinderMesh.new(); cm.top_radius = r; cm.bottom_radius = r; cm.height = l; cm.radial_segments = 14; mi.mesh = cm
	var sm := ShaderMaterial.new(); sm.shader = flow_shader()
	sm.set_shader_parameter("base", col)
	sm.set_shader_parameter("bands", maxf(1.0, l / 1.6))
	sm.set_shader_parameter("speed", 0.0 if CbSettings.reduced_motion else v * 0.9)   # bands per second: the faster the water, the faster the ink runs
	sm.set_shader_parameter("sel", 1.0 if selected else 0.0)
	mi.material_override = sm; add_child(mi)
	mi.position = (a + b) * 0.5
	var up := d.normalized(); var axis := up.cross(Vector3.UP)
	# the cylinder's +Y (its top, UV.y = 0) points at b: the bands run from a to b, the way the water goes
	if axis.length() > 0.001: mi.basis = Basis(axis.normalized(), -Vector3.UP.angle_to(up))
	elif up.y < 0.0: mi.basis = Basis(Vector3.RIGHT, PI)
	return mi

func _place_tags() -> void:
	if _pump == null: return
	_plate.position = _pump.position + Vector3(-1.2, _pump.height * 0.55, 1.4)
	_cav.position = _pump.position + Vector3(0.0, _pump.height + 2.3, 0.0)   # above the P-301 tag, clear of the local panel

func _build_glass() -> void:
	_glass_base = _t3(7.0, 11.7, 0.25)
	var post := MeshInstance3D.new(); var pb := BoxMesh.new(); pb.size = Vector3(1.1, 0.25, 1.1); post.mesh = pb; post.material_override = ds._mat(Color("#3A3C42")); post.position = _glass_base + Vector3(0, -0.12, 0); add_child(post)
	var tube := MeshInstance3D.new(); var cm := CylinderMesh.new(); cm.top_radius = 0.42; cm.bottom_radius = 0.42; cm.height = GLASS_H; cm.radial_segments = 16; tube.mesh = cm
	var gm := StandardMaterial3D.new(); gm.albedo_color = Color(0.85, 0.95, 1.0, 0.22); gm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; gm.roughness = 0.1; gm.metallic = 0.0
	tube.material_override = gm; tube.position = _glass_base + Vector3(0, GLASS_H * 0.5, 0); add_child(tube)
	for yy in [0.0, GLASS_H]:   # brass caps
		var cap := MeshInstance3D.new(); var cc := CylinderMesh.new(); cc.top_radius = 0.5; cc.bottom_radius = 0.5; cc.height = 0.16; cap.mesh = cc; cap.material_override = ds._mat(Color("#C9A94B")); cap.position = _glass_base + Vector3(0, yy, 0); add_child(cap)
	ds._cyl(_glass_base + Vector3(0, 0.0, -0.6), _t3(7.0, 10.0, 0.6), 0.06, Color("#8C949C"))   # the impulse line from the suction pipe
	_glass_band = MeshInstance3D.new(); var bm := CylinderMesh.new(); bm.top_radius = 0.45; bm.bottom_radius = 0.45; bm.height = 1.0; bm.radial_segments = 16; _glass_band.mesh = bm
	var rm := StandardMaterial3D.new(); rm.albedo_color = Color(RED, 0.35); rm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; rm.emission_enabled = true; rm.emission = RED; rm.emission_energy_multiplier = 0.2
	_glass_band.material_override = rm; add_child(_glass_band)
	_glass_liq = MeshInstance3D.new(); var lm := CylinderMesh.new(); lm.top_radius = 0.32; lm.bottom_radius = 0.32; lm.height = 1.0; lm.radial_segments = 16; _glass_liq.mesh = lm
	_glass_liq.material_override = ds._mat(Color("#3C8DBC"), 0.5); add_child(_glass_liq)
	_glass_req = MeshInstance3D.new(); var qm := CylinderMesh.new(); qm.top_radius = 0.56; qm.bottom_radius = 0.56; qm.height = 0.1; qm.radial_segments = 16; _glass_req.mesh = qm
	_glass_req.material_override = ds._mat(Color("#1E2A2E")); add_child(_glass_req)
	_glass_lbl = _tag("NPSH", _glass_base + Vector3(0, GLASS_H + 0.9, 0), Color("#F4F1DE"), 34)

func _h(npsh: float) -> float: return GLASS_H * clampf(npsh / NPSH_TOP, 0.0, 1.0)

func _update_glass() -> void:
	var op: Dictionary = view.get("op", {}); var g: Dictionary = view.get("guide", {})
	var ok := bool(op.get("ok", false))
	var a := float(op.get("npsha", 0.0)) if ok else 0.0; var r := float(op.get("npshr", 0.0)) if ok else 0.0; var need := float(g.get("margin", 1.0))
	var low := ok and a - r < need
	var la := maxf(_h(a), 0.02)
	_glass_liq.scale = Vector3(1, la, 1); _glass_liq.position = _glass_base + Vector3(0, la * 0.5, 0)
	(_glass_liq.material_override as StandardMaterial3D).albedo_color = RED if low else Color("#3C8DBC")
	(_glass_liq.material_override as StandardMaterial3D).emission = RED if low else Color("#3C8DBC")
	_glass_req.position = _glass_base + Vector3(0, _h(r), 0); _glass_req.visible = ok
	var b0 := _h(r); var b1 := _h(r + need)
	_glass_band.scale = Vector3(1, maxf(b1 - b0, 0.02), 1); _glass_band.position = _glass_base + Vector3(0, (b0 + b1) * 0.5, 0); _glass_band.visible = ok
	var bmat := _glass_band.material_override as StandardMaterial3D
	bmat.albedo_color = Color(RED, 0.85 if low else 0.28); bmat.emission_energy_multiplier = 1.6 if low else 0.15
	_glass_lbl.text = ("NPSH %s / %s m" % ["%.1f" % a, "%.1f" % r]) if ok else "NPSH  no flow"
	_glass_lbl.modulate = Color("#FF8A8A") if low else Color("#F4F1DE")
	_info["npsh"] = {"avail": a, "req": r, "level": la, "req_y": _h(r), "band_low": low, "band": [b0, b1]}

func _process(dt: float) -> void:
	_t += dt
	var cav := bool(_info.get("cavitating", false))
	for i in _bubbles.size():
		var b: MeshInstance3D = _bubbles[i]
		b.visible = cav and _pump != null
		if not b.visible: continue
		var ph := fposmod(_t * (0.0 if CbSettings.reduced_motion else 0.9) + float(i) / float(_bubbles.size()), 1.0)
		var eye := _pump.position + Vector3(-1.1, 0.8, 0)   # the impeller eye, where the suction meets the casing
		b.position = eye + Vector3(-0.5 * ph + 0.25 * sin(float(i) * 2.1), 0.2 + 1.3 * ph, 0.35 * cos(float(i) * 1.7))
		b.scale = Vector3.ONE * (0.6 + 1.2 * ph)
		(b.material_override as StandardMaterial3D).albedo_color = Color(1, 1, 1, 0.9 * (1.0 - ph))

# ---- picking and the hand ---------------------------------------------------------------------------------------------------------------------
## The leg (or the pump) under a click: the nearest pipe centre-line within its drawn radius plus a few px, or the pump body.
func pick(p: Vector2, cam: Camera3D) -> String:
	if cam == null: return ""
	var best := ""; var bd := 1e9
	for leg in ["suction", "discharge"]:
		for seg in _legs[leg]:
			var a: Vector3 = seg[0]; var b: Vector3 = seg[1]
			if cam.is_position_behind(a) or cam.is_position_behind(b): continue
			var sa := cam.unproject_position(a); var sb := cam.unproject_position(b)
			var rpx := (cam.unproject_position(a + cam.global_transform.basis.y * float(_info[leg].radius)) - sa).length()
			var d := Geometry2D.get_closest_point_to_segment(p, sa, sb).distance_to(p)
			if d <= rpx + 10.0 and d < bd: bd = d; best = leg
	if best == "" and _pump != null and not cam.is_position_behind(_pump.global_position):
		if cam.unproject_position(_pump.global_position + Vector3(0, 1.0, 0)).distance_to(p) < 46.0: best = "pump"
	return best

## The selector in hand: its pipe glows.
func set_selected(leg: String) -> void:
	_sel = leg
	for l in _legs:
		for seg in _legs[l]: (seg[3] as ShaderMaterial).set_shader_parameter("sel", 1.0 if l == leg else 0.0)

## Tests / QA: what the plant shows. {suction: {nps, radius, color, verdict, v}, discharge: {...}, npsh: {avail, req, level, req_y, band_low}, cavitating, plate}
func info() -> Dictionary: return _info.duplicate(true)

## Screen point of a leg's middle (QA: a click on the pipe).
func leg_screen(leg: String, cam: Camera3D) -> Vector2:
	var segs: Array = _legs.get(leg, [])
	if segs.is_empty() or cam == null: return Vector2(-1, -1)
	var s0: Array = segs[0]
	return cam.unproject_position(((s0[0] as Vector3) + (s0[1] as Vector3)) * 0.5)
