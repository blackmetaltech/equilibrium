class_name PlantWorld
extends Node3D
## The world: a coastal plot at night. A fenced 48 x 32 m build plot with a 2 m grid (24 x 16 tiles), a quay and a sea beyond, sodium-lamp
## light, and the plant's units. 1 world unit = 1 m. The camera is PlantCamera (orthographic, 35 deg pitch, 90 deg yaw steps, zoom, pan).
## API for the design UI (M2.3-M2.6):
##   set_units(Array)            units as {id, type, pos:{x,y} (min-corner tile), rot 0-3, display:{T_K, glow, spin, level, alarm, ...}}; diffed by id
##   set_display(id, dict)       live state of one unit;  unit_node(id) -> UnitModel (ports, anchor_top, set_alarm, shake, pop, set_xray)
##   begin_place(type, rot=0) / cancel_place() / rotate_ghost() / place_at(x, y);  signal place_requested(type, x, y, rot)
##   select(id) / selected_id;  signal unit_clicked(id)  (empty string = clicked bare ground)
##   tile_to_world(tile, size_tiles) / world_to_tile(p);  can_place(type, x, y, rot, ignore_id);  anchor_world(id);  port_world(id, port)
##   set_camera(spec)            "overview", "unit:<id>", "yaw0".."yaw3", "rot+", "close|mid|wide", "gallery", "pan:x:z", metres; comma-separated
##   set_cover / set_blocked / set_title (from the shell), pad_move (sticks).
signal place_requested(type: String, x: int, y: int, rot: int)
signal unit_clicked(id: String)
signal pipe_hover(id: String, pos: Vector2)
signal pipe_clicked(id: String)
signal port_clicked(unit: String, port: String, inlet: bool)
const GRID := 2.0
const PLOT := Vector2(48.0, 32.0)          # fenced plot, m (24 x 16 cells)
const NX := 24
const NZ := 16
const LAND := Vector2(84.0, 60.0)          # land incl. the apron around the fence, m
const YAW0 := PlantCamera.YAW0
const PITCH := PlantCamera.PITCH
const LAMP := Color("#FFB35A")
const TEAL := Color("#2EC4B6")
var app
var cover := 0.0
var cover_left := 0.0
var cover_bottom := 0.0
var fp_table := {}                  # unit type -> Vector2i (engine footprint, rot 0): the grid follows the engine, models scale to fit
var place_ignore := ""              # a unit being moved does not block its own ghost
var pipes: PipeLayer
var scenery: Scenery
var critters: Critters
var _marks: Array = []
var _mark_nodes: Array = []
var _hover_pipe := ""
var title_mode := false
var blocked := false
var plant: Dictionary = {}
var cam: Camera3D
var cam_rig: PlantCamera
var selected_id := ""
var placing := ""
var place_rot := 0
var gallery := false
var _units := {}                    # id -> UnitModel
var _unit_state := {}               # id -> [type, x, y, rot]
var _lamps: Array[OmniLight3D] = []
var _ghost: UnitModel
var _ghost_ok := false
var _cursor := Vector2i(NX / 2, NZ / 2)
var _cursor_valid := false
var _pad_t := 0.0
var _foot: MeshInstance3D
var _foot_mat: StandardMaterial3D
var _btns: CamButtons
var _btn_layer: CanvasLayer
var _fps_t := 0.0
var _fps_n := 0
var _fps_sum := 0.0
var _fps_on := OS.get_environment("CB_FPS") != ""

func _ready() -> void:
	_build_environment(); _build_land(); _build_sea(); _build_grid(); _build_fence(); _build_lamps(); _build_camera(); _build_buttons(); pipes = PipeLayer.new(); pipes.world = self; add_child(pipes)
	scenery = Scenery.new(); add_child(scenery)   # salt pans, old Works, QC lab + cat, ship, gulls; owns the time-of-day light
	critters = Critters.new(); add_child(critters)   # Cute mode molecule critters on the pipes
	_apply()

func set_cover(px: float) -> void: cover = 0.0 if app != null and app.is_custom() else px; _apply()   # custom chrome has no side drawer (the blank home screen reports one)
func set_cover_left(px: float) -> void: cover_left = px; _apply()
func set_cover_bottom(px: float) -> void: cover_bottom = px; _apply()
## Cute mode (EqSettings): critters get faces, the cat and flamingos appear.
func set_cute(on: bool) -> void:
	if critters: critters.set_cute(on)
	if scenery: scenery.set_cute(on)
func set_blocked(b: bool) -> void: blocked = b; visible = not b
func set_title(on: bool) -> void: title_mode = on; _apply()
func input_ok() -> bool: return not blocked and visible and app != null and app.modal() == null

## The engine's plant query. Its units (if any) are shown unless the gallery owns the plot.
func set_state(p: Dictionary) -> void:
	plant = p
	if not gallery:
		set_units(p.get("units", []))
		pipes.set_pipes(p.get("streams", []), _unit_state)

## Engine footprints from the palette query ({cats:[{items:[{type,w,h}]}]}).
func set_footprints(pal: Dictionary) -> void:
	for c in pal.get("cats", []):
		for it in c.get("items", []): fp_table[str(it.type)] = Vector2i(int(it.w), int(it.h))

func footprint_of(type: String, rot := 0) -> Vector2i:
	var t: Vector2i = fp_table.get(type, UnitModels.footprint(type, 0))
	return t if rot % 2 == 0 else Vector2i(t.y, t.x)

func _fit(m: UnitModel, type: String) -> void:   ## models drawn for their own footprint shrink to the engine's when it is smaller
	var f: Vector2i = fp_table.get(type, m.tiles)
	var k := minf(1.0, minf(float(f.x) / m.tiles.x, float(f.y) / m.tiles.y))
	m.scale = Vector3(k, k, k)

## Live display from the engine snapshot: stream looks, unit heat and alarms.
func set_snapshot(g: Dictionary) -> void:
	var al := {}
	for a in g.get("alarms", []): al[str(a.get("unit", ""))] = maxi(int(al.get(str(a.get("unit", "")), 0)), int(a.get("tier", 0)) if int(a.get("rtn", 0)) == 0 else 0)
	for u in g.get("units", []):
		var id := str(u.get("id", ""))
		if not _units.has(id): continue
		var d := {"alarm": 2 if bool(u.get("failed", false)) else clampi(int(al.get(id, 0)), 0, 2)}
		if float(u.get("T", 0.0)) > 0.0: d["T_K"] = float(u["T"]); d["glow"] = float(u.get("glow", 0.0))
		(_units[id] as UnitModel).set_display(d)
	pipes.set_streams(g.get("streams", []), g.get("colours", []))
	if critters: critters.update(pipes, g.get("streams", []), g.get("species", []), _lost_pipes())
	if critters: critters.update_reactors(self, g.get("streams", []), g.get("species", []))

# ---- ports (pipe mode) ----------------------------------------------------------------------------------------------------

## World frame {pos, dir (horizontal, unit length)} of a unit port. Models without that port get a nozzle on the left (inlets) or right (outlets).
func port_frame(id: String, port: String, inlet: bool) -> Dictionary:
	if not _units.has(id): return {}
	var m: UnitModel = _units[id]
	var pos: Vector3; var dir: Vector3
	if m.ports.has(port):
		pos = m.port_pos(port); dir = m.port_dir(port)
	else:
		var n := absi(port.hash()) % 3 - 1
		var half := Vector3(m.tiles.x * GRID * 0.5 + 0.1, 0.0, 0.0) * (-1.0 if inlet else 1.0)
		var lp := half + Vector3(0, 1.0, n * 0.5)
		pos = m.to_global(lp); dir = (m.global_transform.basis * Vector3(-1.0 if inlet else 1.0, 0, 0))
	dir.y = 0.0
	if dir.length() < 0.3:
		dir = pos - m.global_position; dir.y = 0.0
		if dir.length() < 0.3: dir = m.global_transform.basis * Vector3(-1.0 if inlet else 1.0, 0, 0)
	return {"pos": pos, "dir": dir.normalized()}

## Show port markers: [{unit, port, inlet, hot}]. Outlets are spheres, inlets cubes, legal targets are larger and brighter.
func show_ports(list: Array) -> void:
	for n in _mark_nodes: (n as Node).queue_free()
	_mark_nodes.clear(); _marks = list
	for it in list:
		var f := port_frame(str(it.unit), str(it.port), bool(it.inlet))
		if f.is_empty(): continue
		var mi := MeshInstance3D.new(); var hot: bool = bool(it.get("hot", false))
		var r := 0.42 if hot else 0.3
		if bool(it.inlet): var bm := BoxMesh.new(); bm.size = Vector3(r, r, r) * 1.7; mi.mesh = bm
		else: var sm := SphereMesh.new(); sm.radius = r; sm.height = r * 2.0; mi.mesh = sm
		var col := Color("#FFB703") if bool(it.inlet) else TEAL
		var m := StandardMaterial3D.new(); m.albedo_color = col; m.emission_enabled = true; m.emission = col; m.emission_energy_multiplier = 2.5 if hot else 1.1
		m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; m.no_depth_test = true; m.render_priority = 5
		mi.material_override = m; mi.position = f.pos + f.dir * 0.3 + Vector3(0, 0.0, 0); add_child(mi); _mark_nodes.append(mi)

func _pick_port(p: Vector2) -> Dictionary:
	var best := {}; var bd := (30.0 if CbLayout.touch else 20.0)
	for i in range(_mark_nodes.size()):
		var n: Node3D = _mark_nodes[i]
		if cam.is_position_behind(n.global_position): continue
		var d := cam.unproject_position(n.global_position).distance_to(p)
		if d < bd: bd = d; best = _marks[i]
	return best
## Read-only helpers for the paper UI (faceplates, tags, rack). Screen positions are in the viewport's logical pixels, the same space as Control positions.
func world_to_screen(p: Vector3) -> Vector2: return cam.unproject_position(p) if not cam.is_position_behind(p) else Vector2(-9999.0, -9999.0)
func pick(screen_pos: Vector2) -> String: return _pick_unit(screen_pos)
func unit_screen_pos(id: String) -> Vector2: return world_to_screen(anchor_world(id)) if _units.has(id) else Vector2(-9999.0, -9999.0)
func unit_count() -> int: return _units.size()
func lamp_count() -> int: return _lamps.size()
func yaw_degrees() -> float: return cam_rig.yaw_degrees()
func ortho_size() -> float: return cam.size
func rotate_view(dir: int) -> void: cam_rig.rotate_view(dir)
var yaw_step: int:
	get: return cam_rig.yaw_step

# ---- camera specs -----------------------------------------------------------------------------------------------------------

## CB_CAM / game_camera: comma-separated tokens, e.g. "gallery,close,yaw1" or "unit:cv2,close".
func set_camera(spec: String) -> void:
	for tok in spec.split(",", false):
		_cam_token(tok.strip_edges())
	cam_rig.snap(); _apply()

func _cam_token(t: String) -> void:
	match t:
		"rot", "rot+": cam_rig.rotate_view(1)
		"rot-": cam_rig.rotate_view(-1)
		"close": cam_rig.set_zoom_index(0)
		"mid": cam_rig.set_zoom_index(1)
		"wide": cam_rig.set_zoom_index(2)
		"overview": cam_rig.set_zoom_index(2); cam_rig.look_at_ground(Vector3.ZERO)
		"gallery": show_gallery()
		_:
			if t.begins_with("yaw") and t.substr(3).is_valid_int(): cam_rig.set_yaw_step(int(t.substr(3)))
			elif t.begins_with("unit:"): focus_unit(t.substr(5))
			elif t.begins_with("ui:") and app != null: PartsRack.gallery.call_deferred(app, t.substr(3))   # paper-UI gallery for screenshots (CB_CAM=ui:rack|faceplate|tag|notebook|pass|fail)
			elif t.begins_with("pan:"):
				var p := t.split(":"); if p.size() >= 3: cam_rig.look_at_ground(Vector3(float(p[1]), 0, float(p[2])))
			elif t.is_valid_float(): cam_rig.set_size(float(t))

func focus_unit(id: String) -> void:
	if _units.has(id): cam_rig.look_at_ground((_units[id] as UnitModel).position + Vector3(0, 0, 0))

# ---- tiles ------------------------------------------------------------------------------------------------------------------

func tile_to_world(tile: Vector2i, size_tiles: Vector2i) -> Vector3:
	return Vector3(-PLOT.x * 0.5 + GRID * (tile.x + size_tiles.x * 0.5), 0.0, -PLOT.y * 0.5 + GRID * (tile.y + size_tiles.y * 0.5))

func world_to_tile(p: Vector3) -> Vector2i:
	return Vector2i(floori((p.x + PLOT.x * 0.5) / GRID), floori((p.z + PLOT.y * 0.5) / GRID))

func _occupied(ignore := "") -> Dictionary:
	var occ := {}
	for id in _unit_state:
		if id == ignore: continue
		var s: Array = _unit_state[id]; var fp := footprint_of(s[0], s[3])
		for i in range(fp.x):
			for j in range(fp.y): occ[Vector2i(s[1] + i, s[2] + j)] = id
	return occ

func can_place(type: String, x: int, y: int, rot := 0, ignore := "") -> bool:
	var fp := footprint_of(type, rot)
	if x < 0 or y < 0 or x + fp.x > NX or y + fp.y > NZ: return false
	var occ := _occupied(ignore)
	for i in range(fp.x):
		for j in range(fp.y): if occ.has(Vector2i(x + i, y + j)): return false
	return true

# ---- units ------------------------------------------------------------------------------------------------------------------

func set_units(arr: Array) -> void:
	var seen := {}
	for u in arr:
		if not (u is Dictionary): continue
		var id := str(u.get("id", "")); if id == "": continue
		seen[id] = true
		var type := str(u.get("type", "valve")); var pos: Dictionary = u.get("pos", {}); var x := int(pos.get("x", 0)); var y := int(pos.get("y", 0)); var rot := posmod(int(u.get("rot", 0)), 4)
		var st: Array = _unit_state.get(id, [])
		if st.is_empty() or st[0] != type:
			if _units.has(id): (_units[id] as Node).queue_free()
			var m := UnitModels.create(type, id); add_child(m); _units[id] = m; _fit(m, type)
			if id == selected_id: m.set_selected(true)
			st = []
		_unit_state[id] = [type, x, y, rot]
		var mm: UnitModel = _units[id]
		var fp := footprint_of(type, rot)
		mm.position = tile_to_world(Vector2i(x, y), fp); mm.rotation_degrees.y = -90.0 * rot
		if u.has("display") and u["display"] is Dictionary: mm.set_display(u["display"])
	for id in _units.keys():
		if not seen.has(id):
			(_units[id] as Node).queue_free(); _units.erase(id); _unit_state.erase(id)
			if id == selected_id: selected_id = ""
	if _units.size() != _fit_n and not gallery: _fit_n = _units.size(); fit_view()

var _fit_n := -1
## Frame the plant: the camera centres on the placed units (plus room to grow) and zooms so they fill the space above the console.
## With nothing placed it frames the whole plot. Called when the unit count changes, so a player's own pan/zoom survives knob changes.
func fit_view() -> void:
	if _units.is_empty():
		cam_rig.look_at_ground(Vector3.ZERO); cam_rig.set_size(46.0); return
	var lo := Vector3(1e9, 0, 1e9); var hi := Vector3(-1e9, 0, -1e9)
	for id in _units:
		var p: Vector3 = (_units[id] as Node3D).position
		lo.x = minf(lo.x, p.x); lo.z = minf(lo.z, p.z); hi.x = maxf(hi.x, p.x); hi.z = maxf(hi.z, p.z)
	var c := (lo + hi) * 0.5; var ext := maxf(hi.x - lo.x, hi.z - lo.z)
	c = c.lerp(Vector3.ZERO, clampf(1.0 - _units.size() / 6.0, 0.0, 0.6))   # a lone first unit: keep the plot in view
	cam_rig.look_at_ground(c)
	cam_rig.set_size(clampf(ext * 0.9 + 16.0, 34.0, 50.0))   # never closer than a third of the plot: the player needs room to build

func set_display(id: String, d: Dictionary) -> void:
	if _units.has(id): (_units[id] as UnitModel).set_display(d)

func unit_node(id: String) -> UnitModel: return _units.get(id)
func unit_ids() -> Array: return _units.keys()
func anchor_world(id: String) -> Vector3: return (_units[id] as UnitModel).anchor_top.global_position if _units.has(id) else Vector3.ZERO
func port_world(id: String, port: String) -> Vector3: return (_units[id] as UnitModel).port_pos(port) if _units.has(id) and (_units[id] as UnitModel).ports.has(port) else Vector3.ZERO

func select(id: String) -> void:
	if selected_id != "" and _units.has(selected_id): (_units[selected_id] as UnitModel).set_selected(false)
	selected_id = id
	if id != "" and _units.has(id): (_units[id] as UnitModel).set_selected(true)

func show_gallery() -> void:
	gallery = true
	set_units(_gallery_units())

func _gallery_units() -> Array:
	var U := func(id: String, type: String, x: int, y: int, rot: int, d: Dictionary) -> Dictionary: return {"id": id, "type": type, "pos": {"x": x, "y": y}, "rot": rot, "display": d}
	return [
		U.call("cv1", "converter", 1, 1, 0, {"beds": 3, "bands": [690.0, 760.0, 720.0], "health": 1.0, "T_K": 740.0, "glow": 0.45}),
		U.call("cv2", "converter", 6, 1, 0, {"bands": [800.0, 860.0], "health": 0.35, "glow": 0.8, "runaway": 0.8, "alarm": 2}),
		U.call("pr1", "product", 11, 1, 0, {"level": 0.62, "color": "#9D4EDD"}),
		U.call("ht1", "heater", 16, 1, 0, {"flame": 0.8, "glow": 0.5, "plume": 0.7}),
		U.call("fl1", "flare", 20, 1, 0, {"flow": 0.7, "h2": 0.0}),
		U.call("st1", "stack", 22, 1, 0, {"plume": 0.7, "plume_color": "#8B4513", "lamp": 2}),
		U.call("fd1", "feed", 1, 6, 0, {"level": 0.75, "color": "#5B7DB1"}),
		U.call("cp1", "compressor", 6, 6, 0, {"spin": 0.7, "glow": 0.35}),
		U.call("ck1", "cooler", 10, 6, 0, {"spin": 0.8, "T_K": 330.0}),
		U.call("hx1", "hx", 15, 6, 0, {"grad": [650.0, 330.0]}),
		U.call("fs1", "flash", 20, 6, 0, {"level": 0.55, "T_K": 240.0, "alarm": 1}),
		U.call("rv1", "relief", 22, 6, 0, {"lift": 0.0}),
		U.call("vl1", "valve", 23, 6, 0, {"stem": 0.3}),
		U.call("sp1", "splitter", 1, 10, 0, {"stem": 0.2}),
		U.call("mx1", "mixer", 4, 10, 0, {}),
		U.call("fs2", "flash", 7, 10, 0, {"level": 0.2, "T_K": 300.0}),
		U.call("ht2", "heater", 10, 10, 0, {"flame": 0.25, "glow": 0.9}),
		U.call("hx2", "hx", 14, 12, 0, {"grad": [450.0, 380.0]}),
		U.call("pr2", "product", 19, 10, 0, {"level": 0.25, "color": "#C8B88A"}),
		U.call("fl2", "flare", 14, 9, 0, {"flow": 0.8, "h2": 1.0}),
		U.call("fd2", "feed", 1, 13, 0, {"level": 0.3, "color": "#E8F1FF"}),
		U.call("cp2", "compressor", 6, 13, 1, {"spin": 0.2}),
		U.call("st2", "stack", 17, 9, 0, {"plume": 0.5, "plume_color": "#F1F1F4", "lamp": 1}),
	]

# ---- placement --------------------------------------------------------------------------------------------------------------

func begin_place(type: String, rot := 0) -> void:
	cancel_place()
	placing = type; place_rot = rot % 4
	_ghost = UnitModels.create(type, "ghost"); _ghost.make_ghost(Color("#38D96B")); add_child(_ghost); _fit(_ghost, type)
	_foot = MeshInstance3D.new(); var bm := BoxMesh.new(); bm.size = Vector3(1, 0.06, 1); _foot.mesh = bm
	_foot_mat = StandardMaterial3D.new(); _foot_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; _foot_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_foot.material_override = _foot_mat; _foot.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; add_child(_foot)
	_update_ghost()

func cancel_place() -> void:
	placing = ""
	if _ghost != null: _ghost.queue_free(); _ghost = null
	if _foot != null: _foot.queue_free(); _foot = null

func rotate_ghost() -> void:
	if placing != "": place_rot = (place_rot + 1) % 4; _update_ghost()

func place_at(x: int, y: int) -> bool:
	if placing == "" or not can_place(placing, x, y, place_rot, place_ignore): return false
	place_requested.emit(placing, x, y, place_rot); return true

func _update_ghost() -> void:
	if _ghost == null: return
	var fp := footprint_of(placing, place_rot)
	var t := Vector2i(clampi(_cursor.x, 0, NX - fp.x), clampi(_cursor.y, 0, NZ - fp.y))
	_cursor_valid = can_place(placing, t.x, t.y, place_rot, place_ignore)
	var col := Color("#38D96B") if _cursor_valid else Color("#E63946")
	_ghost.position = tile_to_world(t, fp); _ghost.rotation_degrees.y = -90.0 * place_rot; _ghost.tint_ghost(col)
	_foot.position = _ghost.position + Vector3(0, 0.12, 0); (_foot.mesh as BoxMesh).size = Vector3(fp.x * GRID - 0.1, 0.06, fp.y * GRID - 0.1)
	_foot_mat.albedo_color = Color(col.r, col.g, col.b, 0.38)
	_cursor = t

func _ground_at(p: Vector2) -> Variant:
	var o := cam.project_ray_origin(p); var n := cam.project_ray_normal(p)
	if absf(n.y) < 0.0001: return null
	var t := -o.y / n.y
	return o + n * t

func _pick_unit(p: Vector2) -> String:
	var o := cam.project_ray_origin(p); var n := cam.project_ray_normal(p)
	var best := ""; var bt := INF
	for id in _units:
		var m: UnitModel = _units[id]; var st: Array = _unit_state[id]
		var fp := footprint_of(st[0], st[3]); var c := m.position
		var lo := Vector3(c.x - fp.x * GRID * 0.5, 0.0, c.z - fp.y * GRID * 0.5); var hi := Vector3(c.x + fp.x * GRID * 0.5, m.height * m.scale.y, c.z + fp.y * GRID * 0.5)
		var t0 := -INF; var t1 := INF; var ok := true
		for a in range(3):
			var oa := o[a]; var na := n[a]
			if absf(na) < 0.00001:
				if oa < lo[a] or oa > hi[a]: ok = false; break
			else:
				var ta := (lo[a] - oa) / na; var tb := (hi[a] - oa) / na
				t0 = maxf(t0, minf(ta, tb)); t1 = minf(t1, maxf(ta, tb))
		if ok and t0 <= t1 and t1 > 0.0 and t0 < bt: bt = t0; best = id
	return best

func _click_at(p: Vector2) -> void:
	if placing != "":
		var g = _ground_at(p)
		if g != null:
			var fp := footprint_of(placing, place_rot); var t := world_to_tile(g)
			_cursor = Vector2i(t.x - fp.x / 2, t.y - fp.y / 2); _update_ghost()
			place_at(_cursor.x, _cursor.y)
		return
	var pk := _pick_port(p)
	if not pk.is_empty(): port_clicked.emit(str(pk.unit), str(pk.port), bool(pk.inlet)); return
	var pid := pipes.pick(p, cam) if _mark_nodes.is_empty() or true else ""
	var id := _pick_unit(p)
	if pid != "" and (id == "" or pipes_over(pid, id, p)): select(""); pipes.select(pid); pipe_clicked.emit(pid); return
	pipes.select(""); select(id); unit_clicked.emit(id)

## A pipe in front of a unit wins when the cursor is on its centre line closer than the unit's screen centre (pipes ride above the ground).
func pipes_over(_pid: String, _uid: String, _p: Vector2) -> bool: return true

func _unhandled_input(e: InputEvent) -> void:
	if not input_ok(): return
	if e is InputEventMouseMotion and placing == "" and e.device != InputEvent.DEVICE_ID_EMULATION:
		var h := pipes.pick(e.position, cam)
		if h != _hover_pipe or h != "": _hover_pipe = h; pipe_hover.emit(h, e.position)
	if e is InputEventMouseMotion and placing != "" and e.device != InputEvent.DEVICE_ID_EMULATION and (e.button_mask & (MOUSE_BUTTON_MASK_RIGHT | MOUSE_BUTTON_MASK_MIDDLE)) == 0:
		var g = _ground_at(e.position)
		if g != null:
			var fp := footprint_of(placing, place_rot); var t := world_to_tile(g); _cursor = Vector2i(t.x - fp.x / 2, t.y - fp.y / 2); _update_ghost()
	elif e is InputEventMouseButton and e.pressed and e.device != InputEvent.DEVICE_ID_EMULATION:
		if e.button_index == MOUSE_BUTTON_LEFT: _click_at(e.position)
		elif e.button_index == MOUSE_BUTTON_RIGHT and placing != "": cancel_place()
	elif e is InputEventKey and e.pressed and not e.echo and e.keycode == KEY_R and not (e.ctrl_pressed or e.alt_pressed) and not _focus_typing(): rotate_ghost()
	elif e is InputEventJoypadButton and e.pressed and CbPad.enabled and placing != "":
		match e.button_index:
			JOY_BUTTON_A: place_at(_cursor.x, _cursor.y)
			JOY_BUTTON_X: rotate_ghost()
			JOY_BUTTON_B: cancel_place()

func _focus_typing() -> bool:
	var f := get_viewport().gui_get_focus_owner()
	return f is LineEdit or f is TextEdit or f is SpinBox

## Sticks (called by CbPad only when controllers are enabled): while placing, the left stick moves the cursor one tile per step.
func pad_move(left: Vector2, right: Vector2, _trigger: float, dt: float) -> void:
	if placing != "":
		_pad_t -= dt
		if left.length() > 0.55 and _pad_t <= 0.0:
			_pad_t = 0.17
			var r := Vector3.RIGHT.rotated(Vector3.UP, deg_to_rad(cam_rig._yaw_to)); var f := Vector3.FORWARD.rotated(Vector3.UP, deg_to_rad(cam_rig._yaw_to))
			var d := r * left.x - f * left.y
			var step := Vector2i(int(signf(d.x)) if absf(d.x) > absf(d.z) else 0, int(signf(d.z)) if absf(d.z) >= absf(d.x) else 0)
			_cursor += step; _update_ghost()
		cam_rig.pad_move(Vector2.ZERO, right, dt, false)
	else:
		cam_rig.pad_move(left, right, dt)

func _on_btn(which: String) -> void:
	match which:
		"zoom_in": cam_rig.zoom_step(1)
		"zoom_out": cam_rig.zoom_step(-1)
		"rot_l": cam_rig.rotate_view(-1)
		"rot_r": cam_rig.rotate_view(1)

func _process(dt: float) -> void:
	_coach_tick()
	if _btn_layer != null:
		var show_btn: bool = (CbLayout.touch or OS.get_environment("CB_CAM_BUTTONS") != "") and input_ok() and not title_mode and app.started
		_btn_layer.visible = show_btn
		if show_btn:
			_btns.size_px = maxf(CbLayout.tap(), 48.0); _btns.relayout()
			var vr := get_viewport().get_visible_rect().size
			var ins: Vector4 = app.inset
			_btns.position = Vector2(vr.x - ins.z - cover - _btns.size.x - 16.0, vr.y * 0.5 - _btns.size.y * 0.5 - 20.0)
	if _fps_on:
		_fps_t += dt; _fps_n += 1
		if _fps_t >= 5.0: print("FPS avg=%.1f over %.1fs (%d frames)" % [_fps_n / _fps_t, _fps_t, _fps_n]); _fps_t = 0.0; _fps_n = 0

func _apply() -> void:
	if cam_rig == null: return
	var vr := get_viewport().get_visible_rect().size
	cam_rig.h_shift_px = -vr.x * 0.2 if title_mode else (cover - cover_left) * 0.5   # the title menu sits on the left; a drawer covers the right
	cam_rig.v_shift_px = 0.0 if title_mode else cover_bottom
	cam_rig.apply()

# ---- scene construction -------------------------------------------------------------------------------------------------

func _mat(col: Color, rough := 0.9, metal := 0.0) -> StandardMaterial3D:
	var m := StandardMaterial3D.new(); m.albedo_color = col; m.roughness = rough; m.metallic = metal; return m

func _box(size: Vector3, pos: Vector3, m: Material, shadow := true) -> MeshInstance3D:
	var mi := MeshInstance3D.new(); var bm := BoxMesh.new(); bm.size = size; mi.mesh = bm; mi.position = pos; mi.material_override = m
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadow else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi); return mi

func _build_environment() -> void:
	var sky_mat := ProceduralSkyMaterial.new()
	sky_mat.sky_top_color = Color("#050A1C"); sky_mat.sky_horizon_color = Color("#6B3A22"); sky_mat.ground_horizon_color = Color("#3A2216"); sky_mat.ground_bottom_color = Color("#06070C")
	sky_mat.sky_curve = 0.25
	var sky := Sky.new(); sky.sky_material = sky_mat
	var env := Environment.new()
	env.background_mode = Environment.BG_SKY; env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR; env.ambient_light_color = Color("#2A3558"); env.ambient_light_energy = 0.9
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC; env.tonemap_exposure = 1.1
	env.glow_enabled = true; env.glow_intensity = 0.7; env.glow_bloom = 0.08; env.glow_hdr_threshold = 0.95
	var we := WorldEnvironment.new(); we.environment = env; add_child(we)
	var moon := DirectionalLight3D.new(); moon.light_color = Color("#8FA6FF"); moon.light_energy = 0.38; moon.rotation_degrees = Vector3(-48.0, -35.0, 0.0)
	moon.shadow_enabled = true; moon.directional_shadow_max_distance = 140.0; add_child(moon)

func _build_land() -> void:
	_box(Vector3(LAND.x, 3.0, LAND.y), Vector3(0, -1.5, 0), _mat(Color("#9C907C"), 1.0))            # salt-flat apron, quay edge at the sea
	var pad := _mat(Color("#3A3C42"), 0.85)
	_box(Vector3(PLOT.x, 0.12, PLOT.y), Vector3(0, 0.0, 0), pad, false)                              # the plot's concrete pad
	# a jetty into the bay on the +x side, with a pier deck and piles
	var wood := _mat(Color("#4A3A2C"), 0.95)
	_box(Vector3(26.0, 0.4, 3.0), Vector3(LAND.x * 0.5 + 13.0, -0.2, -10.0), wood)
	for i in range(7):
		_box(Vector3(0.4, 2.4, 0.4), Vector3(LAND.x * 0.5 + 2.0 + i * 4.0, -1.2, -11.7), wood)
		_box(Vector3(0.4, 2.4, 0.4), Vector3(LAND.x * 0.5 + 2.0 + i * 4.0, -1.2, -8.3), wood)

func _build_sea() -> void:
	var pm := PlaneMesh.new(); pm.size = Vector2(1600.0, 1600.0)
	var mi := MeshInstance3D.new(); mi.mesh = pm; mi.position = Vector3(0, -0.9, 0)
	var m := _mat(Color("#0A1626"), 0.45, 0.0); mi.material_override = m; mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; add_child(mi)

func _build_grid() -> void:
	var verts := PackedVector3Array(); var cols := PackedColorArray()
	var nx := int(PLOT.x / GRID); var nz := int(PLOT.y / GRID); var y := 0.08
	for i in range(nx + 1):
		var x := -PLOT.x * 0.5 + i * GRID; var major := i % 5 == 0
		var c := Color(TEAL.r, TEAL.g, TEAL.b, 0.55 if major else 0.20)
		verts.append(Vector3(x, y, -PLOT.y * 0.5)); verts.append(Vector3(x, y, PLOT.y * 0.5)); cols.append(c); cols.append(c)
	for j in range(nz + 1):
		var z := -PLOT.y * 0.5 + j * GRID; var major := j % 5 == 0
		var c := Color(TEAL.r, TEAL.g, TEAL.b, 0.55 if major else 0.20)
		verts.append(Vector3(-PLOT.x * 0.5, y, z)); verts.append(Vector3(PLOT.x * 0.5, y, z)); cols.append(c); cols.append(c)
	var arr := []; arr.resize(Mesh.ARRAY_MAX); arr[Mesh.ARRAY_VERTEX] = verts; arr[Mesh.ARRAY_COLOR] = cols
	var mesh := ArrayMesh.new(); mesh.add_surface_from_arrays(Mesh.PRIMITIVE_LINES, arr)
	var m := StandardMaterial3D.new(); m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; m.vertex_color_use_as_albedo = true; m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	var mi := MeshInstance3D.new(); mi.mesh = mesh; mi.material_override = m; mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; add_child(mi)

func _build_fence() -> void:
	var steel := _mat(Color("#5B616B"), 0.5, 0.6)
	var pts: Array[Vector3] = []
	var hx := PLOT.x * 0.5; var hz := PLOT.y * 0.5
	var x := -hx
	while x <= hx + 0.01: pts.append(Vector3(x, 0.9, -hz)); pts.append(Vector3(x, 0.9, hz)); x += GRID
	var z := -hz + GRID
	while z <= hz - GRID + 0.01: pts.append(Vector3(-hx, 0.9, z)); pts.append(Vector3(hx, 0.9, z)); z += GRID
	var bm := BoxMesh.new(); bm.size = Vector3(0.14, 1.8, 0.14)
	var mm := MultiMesh.new(); mm.transform_format = MultiMesh.TRANSFORM_3D; mm.mesh = bm; mm.instance_count = pts.size()
	for i in range(pts.size()): mm.set_instance_transform(i, Transform3D(Basis(), pts[i]))
	var mmi := MultiMeshInstance3D.new(); mmi.multimesh = mm; mmi.material_override = steel; add_child(mmi)
	for yy in [0.55, 1.45]:
		_box(Vector3(PLOT.x, 0.06, 0.06), Vector3(0, yy, -hz), steel); _box(Vector3(PLOT.x, 0.06, 0.06), Vector3(0, yy, hz), steel)
		_box(Vector3(0.06, 0.06, PLOT.y), Vector3(-hx, yy, 0), steel); _box(Vector3(0.06, 0.06, PLOT.y), Vector3(hx, yy, 0), steel)

func _build_lamps() -> void:
	var hx := PLOT.x * 0.5; var hz := PLOT.y * 0.5
	var spots: Array[Vector2] = [Vector2(-hx, -hz), Vector2(hx, -hz), Vector2(-hx, hz), Vector2(hx, hz), Vector2(0, -hz), Vector2(0, hz), Vector2(-hx, 0), Vector2(hx, 0)]
	var pole := _mat(Color("#2B2E34"), 0.6, 0.5)
	var glow := StandardMaterial3D.new(); glow.albedo_color = LAMP; glow.emission_enabled = true; glow.emission = LAMP; glow.emission_energy_multiplier = 4.0; glow.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	for p in spots:
		var inward := Vector3(-signf(p.x) * 0.0, 0.0, 0.0)
		_box(Vector3(0.18, 7.0, 0.18), Vector3(p.x, 3.5, p.y) + inward, pole)
		_box(Vector3(0.9, 0.18, 0.5), Vector3(p.x, 7.05, p.y), glow, false)
		var l := OmniLight3D.new(); l.light_color = LAMP; l.light_energy = 2.6; l.omni_range = 30.0; l.omni_attenuation = 1.2
		l.position = Vector3(p.x, 6.8, p.y); add_child(l); _lamps.append(l)

func _build_camera() -> void:
	cam_rig = PlantCamera.new(); cam_rig.world = self; cam_rig.pan_limit = PLOT * 0.5; add_child(cam_rig); cam = cam_rig.cam

func _build_buttons() -> void:
	_btn_layer = CanvasLayer.new(); _btn_layer.layer = 5; add_child(_btn_layer)
	_btns = CamButtons.new(); _btns.pressed.connect(_on_btn); _btn_layer.add_child(_btns); _btn_layer.visible = false
	cam_rig.tapped.connect(_click_at)

## Pipes that end in a vent, flare or stack: their critters look lost (Cute mode).
func _lost_pipes() -> Dictionary:
	var out := {}
	for id in pipes.pipe_ids():
		var ends: Array = pipes.endpoints(id)
		if ends.size() < 2: continue
		var to = ends[1]
		var uid := str(to.get("unit", "")) if to is Dictionary else str(to)
		var st: Array = _unit_state.get(uid, [])
		if st.size() > 0 and str(st[0]) in ["vent", "flare", "stack"]: out[id] = true
	return out

## The coach points at a unit: a teal chevron bobs above it ("" hides it).
var _coach_mark: MeshInstance3D
var _coach_unit := ""
func set_coach_focus(id: String) -> void:
	_coach_unit = id if _units.has(id) else ""
	if _coach_mark == null:
		var cm := CylinderMesh.new(); cm.top_radius = 0.9; cm.bottom_radius = 0.0; cm.height = 1.4; cm.radial_segments = 4
		var m := StandardMaterial3D.new(); m.albedo_color = TEAL; m.emission_enabled = true; m.emission = TEAL; m.emission_energy_multiplier = 2.2
		m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		_coach_mark = MeshInstance3D.new(); _coach_mark.mesh = cm; _coach_mark.material_override = m
		_coach_mark.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; add_child(_coach_mark)
	_coach_mark.visible = _coach_unit != ""

func _coach_tick() -> void:
	if _coach_mark != null and _coach_mark.visible and _units.has(_coach_unit):
		var t := Time.get_ticks_msec() * 0.001
		_coach_mark.global_position = anchor_world(_coach_unit) + Vector3(0, 2.2 + 0.35 * sin(t * 3.0), 0)
		_coach_mark.rotation.y = t * 1.5
