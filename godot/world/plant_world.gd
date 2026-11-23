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
signal deco_clicked(what: String)   ## F33: a click on a display scene's object (L39: "suction", "discharge", "pump")
signal pipe_hover(id: String, pos: Vector2)
signal pipe_clicked(id: String)
signal port_clicked(unit: String, port: String, inlet: bool)
signal chain_ended()               ## a click or drop on empty ground while a chained pipe (F25) was in hand: the hub drops it
signal unit_hover(id: String)   ## the unit under the cursor ("" = none); the paper layer lights its free ports
var _hover_unit := ""
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
var board_cover := 0.0              # px of the right side a board level's worksheet covers (the display scene frames itself in the rest)
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
func set_cover_bottom(px: float) -> void:
	var was := _cam_untouched() and absf(px - cover_bottom) > 4.0 and _fit_n >= 0
	cover_bottom = px; _apply()
	if was and not (_units.is_empty() and _deco_level == ""): fit_view()   # the console arrived after the first fit: frame again until the player has touched the camera
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
	ensure_footprints()
	if not gallery:
		set_units(p.get("units", []))
		pipes.set_pipes(p.get("streams", []), _unit_state)
		_sync_display_scene(p)

## Board levels have no engine units: a display-only scene stands on the slab instead (ui scene per level id).
var _deco: DisplayScene
var _deco_level := ""
func _sync_display_scene(p: Dictionary) -> void:
	var lid := str(app.b.g.get("level", "")) if app != null and app.b != null else ""
	var want := lid if DisplayScene.UNITS.has(lid) else ""   # the carrier feed and tank of a board level are hidden behind its scene
	for id in _units: (_units[id] as Node3D).visible = want == ""
	if want == _deco_level: return
	_deco_level = want
	var bc := 0.0
	if want != "" and app.get("lvbay") != null: bc = minf(820.0, get_viewport().get_visible_rect().size.x * 0.45)
	board_cover = bc; _apply()
	if _deco == null: _deco = DisplayScene.new(); _deco.world = self; _deco.name = "DisplayScene"; add_child(_deco)
	_deco.clear()
	if want != "":
		_deco.build(want); fit_deco(want)
func deco_level() -> String: return _deco_level
func deco() -> DisplayScene: return _deco
func fit_deco(id: String) -> void:
	var pts: Array = []
	for u in DisplayScene.UNITS[id]:
		var fp := UnitModels.footprint(str(u[0]), int(u[3]))
		pts.append([Vector2i(int(u[1]), int(u[2])), fp])
	_fit_boxes(pts)

## Engine footprints from the palette query ({cats:[{items:[{type,w,h}]}]}).
func set_footprints(pal: Dictionary) -> void:
	for c in pal.get("cats", []):
		for it in c.get("items", []): fp_table[str(it.type)] = Vector2i(int(it.w), int(it.h))

## The grid follows the ENGINE: every footprint the ghost, the free-spot search and the click test use is the one `placeUnit` checks (the models are drawn smaller or larger,
## never the rule). Loaded once from the palette query; a model-sized guess is only the fallback before the engine has answered.
var _fp_loaded := false
func ensure_footprints() -> void:
	if _fp_loaded or app == null or app.b == null: return
	var pal = PaperStrings.q(app, "palette")
	if pal is Dictionary and not (pal as Dictionary).is_empty() and (pal as Dictionary).has("cats"):
		set_footprints(pal); _fp_loaded = true
		for id in _units.keys():   # models built before the table existed are fitted to it now
			var st: Array = _unit_state.get(id, [])
			if not st.is_empty(): _fit(_units[id], str(st[0])); (_units[id] as UnitModel).position = tile_to_world(Vector2i(st[1], st[2]), footprint_of(st[0], st[3]))

func footprint_of(type: String, rot := 0) -> Vector2i:
	var t: Vector2i = fp_table.get(type, UnitModels.footprint(type, 0))
	return t if rot % 2 == 0 else Vector2i(t.y, t.x)

func _fit(m: UnitModel, type: String) -> void:   ## models drawn for their own footprint shrink to the engine's when it is smaller
	var f: Vector2i = fp_table.get(type, m.tiles)
	var k := minf(1.0, minf(float(f.x) / m.tiles.x, float(f.y) / m.tiles.y))
	m.scale = Vector3(k, k, k)

## Every feed says what it carries: its tank bands take the species colour and a tag over it names it (AIR, or the dominant species), so air and fuel never look alike.
var _feed_ms := 0
func _feed_species(g: Dictionary) -> void:
	var now := Time.get_ticks_msec()
	if now - _feed_ms < 400 or app == null: return
	_feed_ms = now
	var sp: Array = g.get("species", []); var cols: Array = g.get("colours", [])
	var li = PaperStrings.q(app, "levelInfo")
	var masked: Array = li.get("masked", []) if li is Dictionary and li.get("masked") is Array else []
	for u in g.get("units", []):
		if str(u.get("type", "")) != "feed" or not _units.has(str(u.get("id", ""))): continue
		var id := str(u.id)
		var c = PaperStrings.q(app, "unitCard", [id])
		var f = c.get("feed") if c is Dictionary else null
		if not (f is Dictionary) or not (f.get("x") is Array): continue
		var x: Array = f.x; var bi := -1; var bv := 0.0; var o2 := 0.0; var n2 := 0.0
		for i in range(mini(x.size(), sp.size())):
			if float(x[i]) > bv: bv = float(x[i]); bi = i
			if str(sp[i]) == "O2": o2 = float(x[i])
			if str(sp[i]) == "N2": n2 = float(x[i])
		if bi < 0: continue
		var air := o2 > 0.15 and n2 > 0.5
		var col_i := bi
		if air: col_i = sp.find("O2")
		var txt := "AIR" if air else EqStrings.formula(str(sp[bi]))
		if masked.has(id): txt = "FUEL ?"; col_i = -1   # an unknown fuel (L03) is never named by its tag
		var m: UnitModel = _units[id]
		if col_i >= 0 and col_i < cols.size(): m.set_display({"color": Color(str(cols[col_i]))})
		var lb: Label3D = m.get_node_or_null("SpeciesTag")
		if lb == null:
			lb = Label3D.new(); lb.name = "SpeciesTag"; lb.billboard = BaseMaterial3D.BILLBOARD_ENABLED; lb.no_depth_test = true; lb.fixed_size = true
			lb.pixel_size = 0.0011; lb.font_size = 34; lb.outline_size = 10; lb.outline_modulate = Color(0, 0, 0, 0.9); lb.font = EqTheme.font("semi"); lb.render_priority = 6; lb.outline_render_priority = 5
			lb.position = Vector3(0, m.height + 1.0, 0); Tag3D.setup(lb); m.add_child(lb)
		lb.text = "%s · %s" % [id, txt]
		lb.modulate = Color(str(cols[col_i])).lightened(0.35) if col_i >= 0 and col_i < cols.size() else Color("#FFD27A")
		if col_i < 0: m.set_display({"color": Color("#E9C46A")})

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
	_feed_species(g)
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
	_mark_nodes.clear(); _hot_port = -1; _marks = list; _caps.clear()
	var per_unit := {}   # unit -> marks seen so far (stagger index) and total (crowded = captions only on hover)
	var total := {}
	for it in list: if not bool(it.get("subtle", false)): total[str(it.unit)] = int(total.get(str(it.unit), 0)) + 1
	for it in list:
		var f := port_frame(str(it.unit), str(it.port), bool(it.inlet))
		if f.is_empty(): continue
		var mi := MeshInstance3D.new(); var hot: bool = bool(it.get("hot", false))
		var sub: bool = bool(it.get("subtle", false))   # a resting pip of an unselected unit in DESIGN: smaller, dimmer, no caption
		var r := 0.42 if hot else (0.2 if sub else 0.3)
		if bool(it.inlet): var bm := BoxMesh.new(); bm.size = Vector3(r, r, r) * 1.7; mi.mesh = bm
		else: var sm := SphereMesh.new(); sm.radius = r; sm.height = r * 2.0; mi.mesh = sm
		var col := Color("#FFB703") if bool(it.inlet) else TEAL
		if sub: col.a = 0.6
		var m := StandardMaterial3D.new(); m.albedo_color = col; m.emission_enabled = true; m.emission = col; m.emission_energy_multiplier = 2.5 if hot else (0.5 if sub else 1.1)
		m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; m.no_depth_test = true; m.render_priority = 10
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA   # drawn in the transparent pass after the unit and its (translucent) alarm-beacon bars: nothing sits over a port pip
		# the pip rides toward the camera (and a little up) so a port on the far side of a tank is not buried in its body
		var toward := cam.global_transform.basis.z.normalized()
		mi.material_override = m; mi.position = f.pos + f.dir * 0.3 + toward * 1.2 + Vector3(0, 0.25, 0); add_child(mi); _mark_nodes.append(mi)
		var cap := str(it.get("label", ""))
		var ix := int(per_unit.get(str(it.unit), 0)); per_unit[str(it.unit)] = ix + 1
		var um: Node = _units.get(str(it.unit))
		if um != null and um.get_node_or_null("Cap_" + str(it.port)) != null: cap = ""   # a nozzle with a permanent tag (exchanger) needs no second one on top of it
		if cap != "":   # tiny caps beside the pip: V / L / OUT / IN, staggered in height per port so neighbours never overprint
			var lb := Label3D.new(); lb.text = cap; lb.billboard = BaseMaterial3D.BILLBOARD_ENABLED; lb.no_depth_test = true; lb.fixed_size = true; lb.pixel_size = 0.0011; lb.font_size = 40
			lb.outline_size = 12; lb.outline_modulate = Color(0, 0, 0, 0.85); lb.modulate = Color("#F4F1DE"); lb.render_priority = 6; lb.outline_render_priority = 5
			lb.font = EqTheme.font("semi"); lb.position = Vector3(0, r * 2.2 + 0.2 + 0.75 * float(ix % 3), 0); Tag3D.setup(lb); mi.add_child(lb)
			if int(total.get(str(it.unit), 0)) > 4: lb.visible = false; _caps.append([lb, mi])   # crowded unit: a caption shows when the cursor is near its pip

var _caps: Array = []
func _hover_caps() -> void:
	if _caps.is_empty(): return
	var mp := get_viewport().get_mouse_position()
	for c in _caps:
		if not is_instance_valid(c[0]) or not is_instance_valid(c[1]): continue
		var n: Node3D = c[1]
		(c[0] as Label3D).visible = not cam.is_position_behind(n.global_position) and cam.unproject_position(n.global_position).distance_to(mp) < 60.0

const PIPE_START_PX := 14.0       ## a pipe starts only from a press this close to a resting pip: a click on a unit body selects it
const PIPE_START_TOUCH := 24.0
var _hot_port := -1
static var port_hint_shown := false
## The port under the pointer swells and the cursor turns to a hand: a press there starts a pipe and never selects a unit. The first time, a hint says how piping works.
func _hover_port(p: Vector2) -> void:
	if pipe_ghost_active(): return   # a pipe in hand: the snap target (nearest legal port) is the one that swells
	var best := -1; var bd := (30.0 if CbLayout.touch else 20.0)
	for i in range(_mark_nodes.size()):
		var n: Node3D = _mark_nodes[i]
		if not is_instance_valid(n) or cam.is_position_behind(n.global_position): continue
		var d := cam.unproject_position(n.global_position).distance_to(p)
		if d < bd: bd = d; best = i
	if best == _hot_port: return
	if _hot_port >= 0 and _hot_port < _mark_nodes.size() and is_instance_valid(_mark_nodes[_hot_port]): (_mark_nodes[_hot_port] as Node3D).scale = Vector3.ONE
	_hot_port = best
	if best >= 0:
		(_mark_nodes[best] as Node3D).scale = Vector3.ONE * 1.7
		Input.set_default_cursor_shape(Input.CURSOR_POINTING_HAND)
		if not port_hint_shown and app != null and app.has_method("toast"):
			port_hint_shown = true; app.toast(PaperStrings.t("PIPE_HINT"), "info")
	else: Input.set_default_cursor_shape(Input.CURSOR_ARROW)

## A press close to a port of any unit makes that unit "hovered" at once, so its free-port pips exist for the pick (no hover motion needed first).
func _probe_ports(p: Vector2) -> void:
	if not _pick_port(p).is_empty() or placing != "" or pipe_ghost_active(): return
	var bd := PIPE_START_TOUCH if CbLayout.touch else PIPE_START_PX   # a press near a pip, never one on the unit's body, makes the unit "hovered"
	var toward := cam.global_transform.basis.z.normalized(); var hit := ""
	for id in _units:
		var m: UnitModel = _units[id]
		if not m.visible: continue
		for pn in m.ports:
			var f := port_frame(str(id), str(pn), false)
			if f.is_empty(): continue
			var w: Vector3 = f.pos + f.dir * 0.3 + toward * 1.2 + Vector3(0, 0.25, 0)
			if not cam.is_position_behind(w) and cam.unproject_position(w).distance_to(p) < bd: bd = cam.unproject_position(w).distance_to(p); hit = str(id)
	if hit != "": _hover_unit = hit; unit_hover.emit(hit)

func _pick_port(p: Vector2) -> Dictionary:
	var best := {}; var bd := (30.0 if CbLayout.touch else 20.0)
	for i in range(mini(_mark_nodes.size(), _marks.size())):
		var n: Node3D = _mark_nodes[i]
		if not is_instance_valid(n) or cam.is_position_behind(n.global_position): continue
		var d := cam.unproject_position(n.global_position).distance_to(p)
		var lim := (PIPE_START_TOUCH if CbLayout.touch else PIPE_START_PX) if bool(_marks[i].get("subtle", false)) and not pipe_ghost_active() else bd
		if d < bd and d <= lim: bd = d; best = _marks[i]
	return best

## How far from a port a click or drop still counts, in screen pixels: generous, and wider the further the camera is out (ports are ~10 px there).
func snap_radius() -> float:
	return (48.0 if CbLayout.touch else 36.0) * clampf(cam_rig._size / 56.0, 1.0, 1.7)

## The legal port nearest to `p` with a pipe in hand: {mark, d, idx}; limited to the snap radius unless `anywhere`. Empty when none.
func snap_legal(p: Vector2, anywhere := false) -> Dictionary:
	if _ghost_from.is_empty(): return {}
	var best := {}; var bd := INF if anywhere else snap_radius()
	for i in range(mini(_mark_nodes.size(), _marks.size())):
		var m: Dictionary = _marks[i]
		if not bool(m.get("hot", false)) or bool(m.inlet) == bool(_ghost_from.inlet): continue
		if str(m.unit) == str(_ghost_from.unit) and str(m.port) == str(_ghost_from.port): continue
		var n: Node3D = _mark_nodes[i]
		if not is_instance_valid(n) or cam.is_position_behind(n.global_position): continue
		var d := cam.unproject_position(n.global_position).distance_to(p)
		if d < bd: bd = d; best = {"mark": m, "d": d, "idx": i}
	return best

var last_pipe_msg := ""
var pipe_chained := false          ## the pipe in hand was re-armed by the piping chain: empty ground ends it (a plain half-made pipe stays and names the nearest inlet)
## A click or drop with a pipe in hand that reached no legal port: say so, name the nearest one, keep the pipe in hand (Esc drops it).
func pipe_missed(p: Vector2) -> void:
	if pipe_chained:
		pipe_chained = false; last_pipe_msg = PaperStrings.t("PIPE_CHAIN_END")
		if app != null and app.has_method("toast"): app.toast(last_pipe_msg, "info")
		chain_ended.emit(); return
	var near := snap_legal(p, true)
	var kind := PaperStrings.t("PIPE_KIND_OUT") if bool(_ghost_from.get("inlet", false)) else PaperStrings.t("PIPE_KIND_IN")
	if near.is_empty(): last_pipe_msg = PaperStrings.t("PIPE_MISS_NONE")
	else: last_pipe_msg = PaperStrings.t("PIPE_MISS") % [kind, str(near.mark.unit), str(near.mark.get("label", near.mark.port))]
	if app != null and app.has_method("toast"): app.toast(last_pipe_msg, "warn")

## Drop what a drag leaves behind: the hovered pipe's tag and unit, and any native tooltip.
func drop_hover() -> void:
	if _hover_pipe != "": _hover_pipe = ""; pipe_hover.emit("", Vector2.ZERO)
	if _hover_unit != "": _hover_unit = ""; unit_hover.emit("")
	var vp := get_viewport()
	if vp != null and vp.has_method("gui_cancel_tooltip"): vp.call("gui_cancel_tooltip")
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

func can_place(type: String, x: int, y: int, rot := 0, ignore := "") -> bool: return place_problem(type, x, y, rot, ignore) == ""

## Why a unit cannot stand here ("" when it can): outside the fence, or on top of another unit (named by its tag).
func place_problem(type: String, x: int, y: int, rot := 0, ignore := "") -> String:
	var fp := footprint_of(type, rot)
	if x < 0 or y < 0 or x + fp.x > NX or y + fp.y > NZ: return "Outside the fenced plot"
	var occ := _occupied(ignore)
	for i in range(fp.x):
		for j in range(fp.y): if occ.has(Vector2i(x + i, y + j)): return "Occupied by %s: pick a free spot" % str(occ[Vector2i(x + i, y + j)])
	return ""

## The free spot nearest to tile (x, y) for this footprint (Manhattan rings outward), or (-1, -1) when the plot has none.
func nearest_free(type: String, x: int, y: int, rot := 0, ignore := "") -> Vector2i:
	var fp := footprint_of(type, rot)
	var occ := _occupied(ignore)
	for r in range(0, maxi(NX, NZ)):
		for dx in range(-r, r + 1):
			for dy in [-(r - absi(dx)), r - absi(dx)]:
				var tx: int = x + dx; var ty: int = y + dy
				if tx < 0 or ty < 0 or tx + fp.x > NX or ty + fp.y > NZ: continue
				var ok := true
				for i in range(fp.x):
					for j in range(fp.y):
						if occ.has(Vector2i(tx + i, ty + j)): ok = false; break
					if not ok: break
				if ok: return Vector2i(tx, ty)
	return Vector2i(-1, -1)

## "Occupied by F-101: pick a free spot" with a concrete one: the nearest free tile for the ghost's footprint, drawn green on the plot.
func place_problem_hint(type: String, x: int, y: int, rot := 0, ignore := "") -> String:
	var why := place_problem(type, x, y, rot, ignore)
	if why == "" or not why.begins_with("Occupied"): return why
	var f := nearest_free(type, x, y, rot, ignore)
	if f.x < 0: return why.replace("pick a free spot", "no free spot is left for this unit")
	return why.replace("pick a free spot", "nearest free spot is the green tile at column %d, row %d" % [f.x, f.y])

## Every anchor tile where this footprint stands inside the fence and clear of every other unit: the same test `placeUnit` applies.
func valid_anchors(type: String, rot := 0, ignore := "") -> Array:
	var fp := footprint_of(type, rot); var occ := _occupied(ignore); var out: Array = []
	for y in range(0, NZ - fp.y + 1):
		for x in range(0, NX - fp.x + 1):
			var ok := true
			for i in range(fp.x):
				for j in range(fp.y):
					if occ.has(Vector2i(x + i, y + j)): ok = false; break
				if not ok: break
			if ok: out.append(Vector2i(x, y))
	return out

## While a big unit (8+ tiles) is in hand every valid anchor is marked faintly at the centre of the footprint it would take, so the player sees where it fits at all.
const ANCHOR_MIN_AREA := 8
var _anchors: MultiMeshInstance3D
var _anchor_sig := ""
func anchor_count() -> int: return _anchors.multimesh.instance_count if _anchors != null and _anchors.visible else 0
func _show_anchors(type: String, rot: int, ignore: String) -> void:
	var fp := footprint_of(type, rot) if type != "" else Vector2i.ZERO
	if type == "" or fp.x * fp.y < ANCHOR_MIN_AREA:
		if _anchors != null: _anchors.visible = false
		_anchor_sig = ""; return
	var a := valid_anchors(type, rot, ignore)
	var sig := "%s|%d|%d|%s" % [type, rot, a.size(), str(a.hash())]
	if sig == _anchor_sig and _anchors != null: _anchors.visible = true; return
	_anchor_sig = sig
	if _anchors == null:
		_anchors = MultiMeshInstance3D.new(); _anchors.name = "Anchors"; _anchors.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		var bm := BoxMesh.new(); bm.size = Vector3(1.0, 0.05, 1.0)
		var mm := MultiMesh.new(); mm.transform_format = MultiMesh.TRANSFORM_3D; mm.mesh = bm; _anchors.multimesh = mm
		var m := StandardMaterial3D.new(); m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; m.albedo_color = Color(0.22, 0.85, 0.42, 0.2)
		_anchors.material_override = m; add_child(_anchors)
	var mm2: MultiMesh = _anchors.multimesh
	mm2.instance_count = a.size()
	for i in a.size():
		var c := tile_to_world(a[i], fp)
		mm2.set_instance_transform(i, Transform3D(Basis.IDENTITY, c + Vector3(0, 0.11, 0)))
	_anchors.visible = a.size() > 0

var _free_foot: MeshInstance3D
func _show_free_foot(type: String, from: Vector2i, rot: int, ignore: String, on: bool) -> void:
	if not on:
		if _free_foot != null: _free_foot.visible = false
		return
	var f := nearest_free(type, from.x, from.y, rot, ignore)
	if f.x < 0:
		if _free_foot != null: _free_foot.visible = false
		return
	var fp := footprint_of(type, rot)
	if _free_foot == null:
		_free_foot = MeshInstance3D.new(); _free_foot.name = "FreeFoot"; _free_foot.mesh = BoxMesh.new(); _free_foot.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		var m := StandardMaterial3D.new(); m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; m.albedo_color = Color(0.22, 0.85, 0.42, 0.45); m.no_depth_test = true
		_free_foot.material_override = m; add_child(_free_foot)
	(_free_foot.mesh as BoxMesh).size = Vector3(fp.x * GRID - 0.1, 0.06, fp.y * GRID - 0.1)
	_free_foot.position = tile_to_world(f, fp) + Vector3(0, 0.14, 0); _free_foot.visible = true

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
			if type == "hx": _label_hx_ports(m)
			if _is_small(type) or _is_named_big(type): _tag_small(m, id, type)
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
	# Frame the plant when a level loads (a jump in unit count: preset plants, a loaded save, a cleared plot), never while the player builds:
	# a camera that drifts on every placement moves the ports under the cursor (playtest finding).
	if not gallery and (_fit_n < 0 or absi(_units.size() - _fit_n) > 1 or _units.is_empty()): fit_view()
	_fit_n = _units.size()

var _fit_n := -1
## Frame the plant: the camera centres on the placed units (plus room to grow) and zooms so they fill the space above the console.
## With nothing placed it frames the whole plot. Called when the unit count changes, so a player's own pan/zoom survives knob changes.
func fit_view() -> void:
	if _units.is_empty():
		if _deco_level != "": fit_deco(_deco_level); return
		cam_rig.look_at_ground(Vector3.ZERO); cam_rig.set_size(46.0); _note_fit(); return
	var pts: Array = []
	for id in _units:
		var st: Array = _unit_state[id]
		pts.append([Vector2i(int(st[1]), int(st[2])), footprint_of(st[0], st[3]), (_units[id] as UnitModel).height * (_units[id] as UnitModel).scale.y])
	if _units.size() < 3 and _big_build(): pts.append([Vector2i.ZERO, Vector2i(NX, NZ)])   # a big build starts nearly empty: frame the whole fenced plot, not the lone feed (L25 opened zoomed on its feed)
	_fit_boxes(pts, _units.size() < 3)

## The level asks for a big build (a build checklist, or six or more parts to place): the player needs the whole plot in view from the start.
func _big_build() -> bool:
	if app == null or app.b == null: return false
	var li = PaperStrings.q(app, "levelInfo")
	if not (li is Dictionary) or (li as Dictionary).is_empty(): return false
	if li.get("buildGuide") is Array and not (li.buildGuide as Array).is_empty(): return true
	var n := 0
	for a in li.get("allowedUnits", []): n += int(a.get("max", 0)) if a.get("max") != null else 0
	return n >= 6

## Frame tile boxes [[tile, footprint, height?]]: F32 (0.9): the camera frames the equipment's bounding box (ground footprint and standing height, projected through the
## camera's own yaw and pitch) so it fills about 90 % of the space above the console and left of any board, centred in it. A lone feed keeps some plot around it.
const FIT_FILL := 0.9
func _fit_boxes(boxes: Array, keep_plot := false) -> void:
	var yaw := deg_to_rad(cam_rig._yaw_to)
	var bs := Basis.from_euler(Vector3(-deg_to_rad(PITCH), yaw, 0.0))
	var right := bs.x; var up := bs.y
	var lo := Vector2(1e9, 1e9); var hi := Vector2(-1e9, -1e9)
	for bx in boxes:
		var c0 := tile_to_world(bx[0], bx[1]); var half := Vector3(bx[1].x * GRID * 0.5, 0, bx[1].y * GRID * 0.5)
		var top: float = float(bx[2]) if bx.size() > 2 else 4.0
		top += 1.6   # the name tag stands above the model
		for x in [-half.x, half.x]:
			for z in [-half.z, half.z]:
				for y in [0.0, top]:
					var p := c0 + Vector3(x, y, z)
					var q := Vector2(p.dot(right), p.dot(up))
					lo = Vector2(minf(lo.x, q.x), minf(lo.y, q.y)); hi = Vector2(maxf(hi.x, q.x), maxf(hi.y, q.y))
	var cc := (lo + hi) * 0.5
	if keep_plot: cc = cc.lerp(Vector2.ZERO, 0.4)
	# the ground point whose projection is the box centre: pan . right = cc.x, pan . up = cc.y with pan.y = 0
	var det := right.x * up.z - right.z * up.x
	var pan := Vector3.ZERO
	if absf(det) > 1e-4: pan = Vector3((cc.x * up.z - right.z * cc.y) / det, 0.0, (right.x * cc.y - cc.x * up.x) / det)
	var vr := get_viewport().get_visible_rect().size
	var free_w := maxf(vr.x - board_cover - cover_left * 0.0, 1.0) / maxf(vr.y, 1.0)
	var free_h := clampf((vr.y - cover_bottom) / maxf(vr.y, 1.0), 0.4, 1.0)
	var need_w := (hi.x - lo.x) / (FIT_FILL * free_w)
	var need_h := (hi.y - lo.y) / (FIT_FILL * free_h)
	cam_rig.look_at_ground(pan)
	cam_rig.set_size(clampf(maxf(maxf(need_h, need_w), 35.0), PlantCamera.ZMIN, PlantCamera.ZMAX))
	_note_fit()

var _fit_pan := Vector3.ZERO
var _fit_size := 0.0
func _note_fit() -> void: _fit_pan = cam_rig._pan_to; _fit_size = cam_rig._size_to
## After a commission the plant is framed again unless the player has moved the camera since the last frame.
func reframe_if_untouched() -> void:
	if _cam_untouched() and not (_units.is_empty() and _deco_level == ""): fit_view()
func _cam_untouched() -> bool: return cam_rig._pan_to.is_equal_approx(_fit_pan) and absf(cam_rig._size_to - _fit_size) < 0.01

const HX_CAPS := {"hot_in": "HOT IN", "hot_out": "HOT OUT", "cold_in": "COLD IN", "cold_out": "COLD OUT"}
## Exchanger nozzles carry permanent tags, so hot and cold sides are never guessed.
func _label_hx_ports(m: UnitModel) -> void:
	for pn in m.ports:
		var cap: String = HX_CAPS.get(str(pn), str(pn).replace("_", " ").to_upper())
		var lb := Label3D.new(); lb.name = "Cap_" + str(pn); lb.text = cap; lb.billboard = BaseMaterial3D.BILLBOARD_ENABLED; lb.no_depth_test = true; lb.fixed_size = true; lb.pixel_size = 0.0009; lb.font_size = 34
		lb.outline_size = 10; lb.outline_modulate = Color(0, 0, 0, 0.85); lb.modulate = Color("#FF9A8A") if str(pn).begins_with("hot") else Color("#8AD7FF"); lb.font = EqTheme.font("semi")
		lb.render_priority = 6; lb.outline_render_priority = 5
		var pdir: Vector3 = (m.ports[pn] as Marker3D).get_meta("dir", Vector3.ZERO)
		var hot := str(pn).begins_with("hot")   # hot tags ride high, cold tags low, pushed outward along the nozzle: no two tags overlap
		lb.position = (m.ports[pn] as Marker3D).position + pdir * 0.9 + Vector3(0, 1.9 if hot else 0.7, 0); Tag3D.setup(lb); m.add_child(lb)

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
	cancel_place(); ensure_footprints()
	placing = type; place_rot = rot % 4
	_ghost = UnitModels.create(type, "ghost"); _ghost.make_ghost(Color("#38D96B")); add_child(_ghost); _fit(_ghost, type)
	_foot = MeshInstance3D.new(); var bm := BoxMesh.new(); bm.size = Vector3(1, 0.06, 1); _foot.mesh = bm
	_foot_mat = StandardMaterial3D.new(); _foot_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; _foot_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_foot.material_override = _foot_mat; _foot.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; add_child(_foot)
	_update_ghost()

## The refusal a click on a taken tile put on the intercom ("Occupied by X: pick a free spot") is withdrawn once the placement works, the tool changes or the ghost sits on a free spot.
var _place_toast := ""
func _clear_place_toast() -> void:
	if _place_toast == "": return
	var ch = app.get("chrome") if app != null else null
	if ch != null and ch.get("intercom") != null: ch.intercom.drop_text(_place_toast)
	_place_toast = ""

func cancel_place() -> void:
	placing = ""
	_clear_place_toast()
	_show_free_foot("", Vector2i.ZERO, 0, "", false); _show_anchors("", 0, "")
	if _why_tag != null: _why_tag.visible = false
	if _ghost != null: _ghost.queue_free(); _ghost = null
	if _foot != null: _foot.queue_free(); _foot = null

func rotate_ghost() -> void:
	if placing != "": place_rot = (place_rot + 1) % 4; _update_ghost()

func place_at(x: int, y: int) -> bool:
	if placing == "": return false
	var why := place_problem_hint(placing, x, y, place_rot, place_ignore)
	if why != "":
		if app != null and app.has_method("toast"):
			_clear_place_toast()   # a new refusal replaces the old one: the intercom never keeps a tile hint the banner no longer shows
			_place_toast = why; app.toast(why, "warn")
		return false
	place_requested.emit(placing, x, y, place_rot); return true

func _update_ghost() -> void:
	if _ghost == null: return
	var fp := footprint_of(placing, place_rot)
	var t := Vector2i(clampi(_cursor.x, 0, NX - fp.x), clampi(_cursor.y, 0, NZ - fp.y))
	var why := place_problem_hint(placing, t.x, t.y, place_rot, place_ignore)
	_cursor_valid = why == ""
	_show_anchors(placing, place_rot, place_ignore)
	_show_free_foot(placing, t, place_rot, place_ignore, not _cursor_valid and why.begins_with("Occupied"))
	if _place_toast != "" and why != _place_toast: _clear_place_toast()   # a toast about another tile is withdrawn the moment the ghost moves on
	var col := Color("#38D96B") if _cursor_valid else Color("#E63946")
	_ghost_why(why, t, fp)
	_ghost.position = tile_to_world(t, fp); _ghost.rotation_degrees.y = -90.0 * place_rot; _ghost.tint_ghost(col)
	_foot.position = _ghost.position + Vector3(0, 0.12, 0); (_foot.mesh as BoxMesh).size = Vector3(fp.x * GRID - 0.1, 0.06, fp.y * GRID - 0.1)
	_foot_mat.albedo_color = Color(col.r, col.g, col.b, 0.38)
	_cursor = t

## The red ghost says why: a banner on the screen (never a tag in the 3D scene, which the screen edge cut and which sat on the plant being placed). It is a 2D panel
## inside the plant area (clear of the drawer, the console and the top bar), at the top edge, and it hops to the bottom edge when the ghost would be under it.
## It never takes the mouse, so a click through it still places.
var _why_tag: PanelContainer
var _why_lbl: Label
func ghost_reason() -> String: return _why_lbl.text if _why_tag != null and _why_tag.visible else ""
func _plant_area() -> Rect2:
	var vr := get_viewport().get_visible_rect().size
	var l := cover_left + 8.0; var r := vr.x - (cover + board_cover) - 8.0; var top := 64.0; var bot := vr.y - cover_bottom - 8.0
	return Rect2(l, top, maxf(120.0, r - l), maxf(60.0, bot - top))
func _ghost_screen_rect(t: Vector2i, fp: Vector2i) -> Rect2:
	var lo := Vector2(INF, INF); var hi := Vector2(-INF, -INF)
	for c in [Vector2i(0, 0), Vector2i(fp.x, 0), Vector2i(0, fp.y), Vector2i(fp.x, fp.y)]:
		var w := Vector3(-PLOT.x * 0.5 + GRID * (t.x + c.x), 0.0, -PLOT.y * 0.5 + GRID * (t.y + c.y))
		for h in [0.0, 5.0]:
			var q := cam.unproject_position(w + Vector3(0, h, 0)); lo = lo.min(q); hi = hi.max(q)
	return Rect2(lo, hi - lo)
func _ghost_why(why: String, t: Vector2i, fp: Vector2i) -> void:
	if why == "":
		if _why_tag != null: _why_tag.visible = false
		return
	if _why_tag == null:
		var cl := CanvasLayer.new(); cl.name = "PlaceBannerLayer"; cl.layer = 9; add_child(cl)
		_why_tag = PanelContainer.new(); _why_tag.name = "GhostWhy"; _why_tag.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var sb := StyleBoxFlat.new(); sb.bg_color = Color("#2A1214E6"); sb.border_color = Color("#FF8A92"); sb.set_border_width_all(2); sb.set_corner_radius_all(4); sb.set_content_margin_all(8)
		_why_tag.add_theme_stylebox_override("panel", sb)
		_why_lbl = Label.new(); _why_lbl.mouse_filter = Control.MOUSE_FILTER_IGNORE; _why_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		_why_lbl.label_settings = EqStrings.ls(16, Color("#FF8A92"), "semi"); _why_tag.add_child(_why_lbl); cl.add_child(_why_tag)
	var area := _plant_area()
	_why_lbl.text = why; _why_lbl.custom_minimum_size.x = clampf(area.size.x - 24.0, 120.0, 520.0); _why_lbl.size = Vector2(_why_lbl.custom_minimum_size.x, 0)
	_why_tag.reset_size(); _why_tag.visible = true
	var sz := _why_tag.get_combined_minimum_size()
	var x := clampf(area.position.x + (area.size.x - sz.x) * 0.5, area.position.x, maxf(area.position.x, area.end.x - sz.x))
	var top := Rect2(Vector2(x, area.position.y), sz); var bot := Rect2(Vector2(x, area.end.y - sz.y), sz)
	var g := _ghost_screen_rect(t, fp)
	var ot := top.intersection(g).get_area() if top.intersects(g) else 0.0; var ob := bot.intersection(g).get_area() if bot.intersects(g) else 0.0
	_why_tag.position = top.position if ot <= ob else bot.position; _why_tag.size = sz

func _ground_at(p: Vector2) -> Variant:
	var o := cam.project_ray_origin(p); var n := cam.project_ray_normal(p)
	if absf(n.y) < 0.0001: return null
	var t := -o.y / n.y
	return o + n * t

## Small units (relief valve, valve, interlock, purge, splitter) are easy to lose in a plant: they carry a permanent tag and a bigger pick target.
const SMALL_TYPES := ["relief", "valve", "interlock", "purge", "splitter", "sink", "vent", "flare"]
func _is_small(type: String) -> bool:
	var f := footprint_of(type, 0)
	return SMALL_TYPES.has(type) or f.x * f.y <= 2
## L00: the two units the coach names (the converter and the inlet-trim cooler) carry a name label like the small units do, so "Tap the converter R-106" can be found on the plant.
func _is_named_big(type: String) -> bool:
	return (type == "eq_reactor" or type == "cooler") and app != null and app.b != null and str(app.b.g.get("level", "")) == "L00"
func _tag_small(m: UnitModel, id: String, type: String) -> void:
	var lb := Label3D.new(); lb.name = "SmallTag"; lb.text = "%s %s" % [type.replace("_", " ").to_upper(), id]; lb.billboard = BaseMaterial3D.BILLBOARD_ENABLED; lb.no_depth_test = true; lb.fixed_size = true
	lb.pixel_size = 0.0010; lb.font_size = 32; lb.outline_size = 10; lb.outline_modulate = Color(0, 0, 0, 0.9); lb.modulate = Color("#FFD27A"); lb.font = EqTheme.font("semi")
	lb.render_priority = 6; lb.outline_render_priority = 5; lb.position = Vector3(0, m.height + 1.0, 0); Tag3D.setup(lb); m.add_child(lb)

## The unit under a screen point. A tall model (stack, converter) would otherwise hide its neighbours behind its whole height: a unit whose body (the lowest
## PICK_LOW metres) is hit wins over one that is only hit high up, then the nearest entry wins.
const PICK_LOW := 3.2
func _pick_unit(p: Vector2) -> String:
	var o := cam.project_ray_origin(p); var n := cam.project_ray_normal(p)
	var best_low := ""; var bt_low := INF; var best_hi := ""; var bt_hi := INF
	for id in _units:
		var m: UnitModel = _units[id]; var st: Array = _unit_state[id]
		var fp := footprint_of(st[0], st[3]); var c := m.position
		var top := m.height * m.scale.y
		for tier in range(2):
			var h := minf(top, PICK_LOW) if tier == 0 else top
			if tier == 1 and top <= PICK_LOW: break
			var mg := 1.1 if _is_small(str(st[0])) else 0.0   # a small unit is hit within a metre of its body
			var lo := Vector3(c.x - fp.x * GRID * 0.5 - mg, 0.0, c.z - fp.y * GRID * 0.5 - mg); var hi := Vector3(c.x + fp.x * GRID * 0.5 + mg, h + mg, c.z + fp.y * GRID * 0.5 + mg)
			var t0 := -INF; var t1 := INF; var ok := true
			for a in range(3):
				var oa := o[a]; var na := n[a]
				if absf(na) < 0.00001:
					if oa < lo[a] or oa > hi[a]: ok = false; break
				else:
					var ta := (lo[a] - oa) / na; var tb := (hi[a] - oa) / na
					t0 = maxf(t0, minf(ta, tb)); t1 = minf(t1, maxf(ta, tb))
			if ok and t0 <= t1 and t1 > 0.0:
				if tier == 0 and t0 < bt_low: bt_low = t0; best_low = id
				if tier == 1 and t0 < bt_hi: bt_hi = t0; best_hi = id
				if tier == 0: break
	return best_low if best_low != "" else best_hi

## A finger is not a mouse: the nearest unit within a generous radius (about 48 dp) wins, the exact hit first; tapping the same spot again steps to the next one.
const TOUCH_RADIUS := 62.0
var _cyc_pos := Vector2(-9999, -9999)
var _cyc_ids: Array = []
var _cyc_i := 0
var _cyc_ms := 0
func touch_candidates(p: Vector2, exact := "") -> Array:
	var c: Array = []
	for id in _units:
		var m: UnitModel = _units[id]
		if not m.visible: continue
		var sp := world_to_screen(m.global_position + Vector3(0, minf(m.height * m.scale.y, 1.6) * 0.5, 0))
		var d := sp.distance_to(p)
		var d2 := unit_screen_pos(str(id)).distance_to(p)
		d = minf(d, d2)
		if str(id) == exact: d = -1.0
		if d <= TOUCH_RADIUS: c.append([d, str(id)])
	c.sort_custom(func(a, b): return a[0] < b[0])
	return c.map(func(x): return x[1])
func _touch_pick(p: Vector2, exact: String) -> String:
	var ids := touch_candidates(p, exact)
	if ids.is_empty(): return exact
	var now := Time.get_ticks_msec()
	if p.distance_to(_cyc_pos) < 44.0 and now - _cyc_ms < 4000 and _cyc_ids == ids and ids.size() > 1: _cyc_i = (_cyc_i + 1) % ids.size()
	else: _cyc_i = 0
	_cyc_pos = p; _cyc_ids = ids; _cyc_ms = now
	return str(ids[_cyc_i])

func _click_at(p: Vector2) -> void:
	if placing != "":
		var g = _ground_at(p)
		if g != null:
			var fp := footprint_of(placing, place_rot); var t := world_to_tile(g)
			_cursor = Vector2i(t.x - fp.x / 2, t.y - fp.y / 2); _update_ghost()
			place_at(_cursor.x, _cursor.y)
		return
	var finger := CbLayout.touch or CbLayout.phone
	if not finger or selected_id != "" or pipe_ghost_active(): _probe_ports(p)    # a finger taps a unit first (its pips then show); only a pipe in hand or the selected unit's pips take a tap
	# the pips of a unit that is not selected or hovered yet (a first press right after placing parts): light them before picking
	_press_port = {}   # a stale press (its release went to a panel) never turns a later click into a drag
	var pk := _pick_port(p)
	if finger and not pk.is_empty() and not pipe_ghost_active() and str(pk.unit) != selected_id: pk = {}
	if not pk.is_empty():
		# a pipe already half made: this press finishes it (click, click) and its release must do nothing; else this press starts a pipe and the release may finish it (drag)
		if not pipe_ghost_active() or (bool(pk.inlet) == bool(_ghost_from.get("inlet", false)) and not (str(pk.unit) == str(_ghost_from.get("unit", "")) and str(pk.port) == str(_ghost_from.get("port", "")))): _press_port = pk; _press_at = p   # F25: a press on another outlet while a pipe is in hand (the chain's, or a click's left half) starts a fresh pipe there, so a drag from it still works (it did only for the chain's: a half-made pipe made the drag a silent no-op)
		port_clicked.emit(str(pk.unit), str(pk.port), bool(pk.inlet)); return
	if pipe_ghost_active():   # a pipe in hand: the nearest legal port within the snap radius takes the click
		var sn := snap_legal(p)
		if not sn.is_empty(): port_clicked.emit(str(sn.mark.unit), str(sn.mark.port), bool(sn.mark.inlet)); return
	if _deco != null and _deco_level != "" and placing == "" and not pipe_ghost_active():
		var dk := _deco.pick(p, cam)
		if dk != "": deco_clicked.emit(dk); return
	var id := _pick_unit(p)
	if CbLayout.touch or CbLayout.phone: id = _touch_pick(p, id)
	if pipe_ghost_active() and id == "": pipe_missed(p); return   # F25: a click that is on no port and no unit always answers, even when a pipe's line runs under it (a dense plant: L25 never said "Dropped on nothing" there)
	var pid := pipes.pick(p, cam, 12.0 if id == "" else 6.0)   # over a unit only a click right on the pipe's line picks the pipe: ports, then units, then loose pipes
	if pid != "": select(""); pipes.select(pid); pipe_clicked.emit(pid); return
	pipes.select(""); select(id); unit_clicked.emit(id)

## A pipe in front of a unit wins when the cursor is on its centre line closer than the unit's screen centre (pipes ride above the ground).
func pipes_over(_pid: String, _uid: String, _p: Vector2) -> bool: return true


## Where a drag from `from` ended: a pip right under the pointer wins; a pip a little way off counts only when it belongs to the unit under the pointer (or no
## unit is); letting go over a unit's body takes its one lit inlet. Never a port of another unit than the one under the release point, never the start port.
func release_target(p: Vector2, from: Dictionary) -> Dictionary:
	var ru := _pick_unit(p)
	var near := 18.0 if CbLayout.touch else 14.0; var far := 40.0 if CbLayout.touch else 30.0
	var best := {}; var bs := INF; var body := []
	for i in range(_mark_nodes.size()):
		var n: Node3D = _mark_nodes[i]
		if not is_instance_valid(n) or cam.is_position_behind(n.global_position): continue
		var m: Dictionary = _marks[i]
		if str(m.unit) == str(from.unit) and str(m.port) == str(from.port): continue
		if bool(m.inlet) == bool(from.inlet): continue
		var d := cam.unproject_position(n.global_position).distance_to(p)
		if ru != "" and str(m.unit) == ru and bool(m.get("hot", false)): body.append([d, m])
		if d > far: continue
		if d > near and ru != "" and str(m.unit) != ru: continue
		var sc := d - (8.0 if bool(m.get("hot", false)) else 0.0)
		if sc < bs: bs = sc; best = m
	if best.is_empty() and ru != "" and ru != str(from.unit) and not body.is_empty():
		body.sort_custom(func(a, b): return a[0] < b[0]); best = body[0][1]
	if best.is_empty() and (ru == "" or ru == str(from.unit)):
		var sn := snap_legal(p)   # a drop a little way off any port: the nearest legal one within the snap radius
		if not sn.is_empty(): best = sn.mark
	return best

var _press_at := Vector2.ZERO
var _press_port := {}           ## the port a left press started on: releasing over another port finishes a drag-to-connect
## A port drag ends where the button goes up. This runs before the GUI sees the release (a panel or the console under the cursor would swallow it from `_unhandled_input`),
## so a drag released over empty ground, over a panel or off the plot always gets its answer: the pipe connects, or "Dropped on nothing".
func _input(e: InputEvent) -> void:
	if not (e is InputEventMouseButton) or e.pressed or e.button_index != MOUSE_BUTTON_LEFT or _press_port.is_empty(): return
	if not input_ok(): _press_port = {}; return
	var from := _press_port; _press_port = {}
	if e.position.distance_to(_press_at) < 10.0: return   # a click, not a drag: the pipe stays in hand for the second click (a port that sits over another unit's body must not connect to that unit)
	var rel := release_target(e.position, from)
	drop_hover()
	if not rel.is_empty(): port_clicked.emit(str(rel.unit), str(rel.port), bool(rel.inlet))
	elif pipe_ghost_active(): pipe_missed(e.position)

func _unhandled_input(e: InputEvent) -> void:
	if not input_ok(): _press_port = {}; return
	if e is InputEventMouseMotion and e.button_mask != 0 and e.device != InputEvent.DEVICE_ID_EMULATION: drop_hover()   # mid-drag (a pan, a pipe): no tooltip or tag lingers under it
	elif e is InputEventMouseButton and not e.pressed and e.button_index != MOUSE_BUTTON_LEFT and e.device != InputEvent.DEVICE_ID_EMULATION: drop_hover()
	if e is InputEventMouseMotion and e.button_mask == 0 and placing == "" and e.device != InputEvent.DEVICE_ID_EMULATION: _hover_port(e.position)
	if e is InputEventMouseMotion and e.button_mask == 0 and placing == "" and e.device != InputEvent.DEVICE_ID_EMULATION:
		var h := pipes.pick(e.position, cam)
		if h != _hover_pipe or h != "": _hover_pipe = h; pipe_hover.emit(h, e.position)
		var hu := _pick_unit(e.position)
		if hu != _hover_unit: _hover_unit = hu; unit_hover.emit(hu)
	if e is InputEventMouseMotion and placing != "" and e.device != InputEvent.DEVICE_ID_EMULATION and (e.button_mask & (MOUSE_BUTTON_MASK_RIGHT | MOUSE_BUTTON_MASK_MIDDLE)) == 0:
		var g = _ground_at(e.position)
		if g != null:
			var fp := footprint_of(placing, place_rot); var t := world_to_tile(g); _cursor = Vector2i(t.x - fp.x / 2, t.y - fp.y / 2); _update_ghost()
	elif e is InputEventMouseButton and e.pressed and e.device != InputEvent.DEVICE_ID_EMULATION:
		if e.button_index == MOUSE_BUTTON_LEFT:
			var fo := get_viewport().gui_get_focus_owner()
			if fo is LineEdit or fo is TextEdit: fo.release_focus()   # a click on the plot takes the keys back from a field left in focus (WASD pans again)
			_click_at(e.position)
		elif e.button_index == MOUSE_BUTTON_RIGHT and placing != "": cancel_place()
	elif e is InputEventKey and e.pressed and not e.echo and (e.keycode == KEY_F or e.keycode == KEY_HOME) and not (e.ctrl_pressed or e.alt_pressed or e.meta_pressed) and not _focus_typing(): frame_plot()
	elif e is InputEventKey and e.pressed and not e.echo and e.keycode == KEY_R and not (e.ctrl_pressed or e.alt_pressed) and not _focus_typing(): rotate_ghost()
	elif e is InputEventJoypadButton and e.pressed and CbPad.enabled and placing != "":
		match e.button_index:
			JOY_BUTTON_A: pad_place()
			JOY_BUTTON_X: rotate_ghost()
			JOY_BUTTON_B: cancel_place()

func _focus_typing() -> bool:
	var f := get_viewport().gui_get_focus_owner()
	return f is LineEdit or f is TextEdit or f is SpinBox

## Sticks (called by CbPad only when controllers are enabled): while placing, the left stick moves the cursor one tile per step.
func pad_move(left: Vector2, right: Vector2, _trigger: float, dt: float) -> void:
	if placing != "":
		_pad_t -= dt
		if left.length() > 0.55 and _pad_t <= 0.0: _pad_t = 0.17; pad_nudge(left)
		cam_rig.pad_move(Vector2.ZERO, right, dt, false)
	else:
		cam_rig.pad_move(left, right, dt)

## Move the placement cursor one tile the way a stick (or the D-pad) points on the screen (the camera's yaw is respected).
func pad_nudge(dir: Vector2) -> void:
	if placing == "": return
	var r := Vector3.RIGHT.rotated(Vector3.UP, deg_to_rad(cam_rig._yaw_to)); var f := Vector3.FORWARD.rotated(Vector3.UP, deg_to_rad(cam_rig._yaw_to))
	var d := r * dir.x - f * dir.y
	var on_x: bool = absf(d.x) > absf(d.z)
	if absf(absf(d.x) - absf(d.z)) < 0.05: on_x = absf(dir.x) > absf(dir.y)   # a camera turned 45 degrees points both sideways and forward between the axes: sideways input moves x, forward input z (it moved z for both, so a stick or the D-pad could never go along x)
	var step := Vector2i(int(signf(d.x)), 0) if on_x else Vector2i(0, int(signf(d.z)))
	_cursor += step; _update_ghost()

## Pad A while a part is in hand: the part goes where the cursor is (a refusal says why and keeps the part in hand).
func pad_place() -> bool: return place_at(_cursor.x, _cursor.y)

## A part just came off the tray by pad: the cursor starts on the nearest free spot to where it was, so the ghost is green, not a red slab on whatever it sat over.
func pad_seed_cursor() -> void:
	if placing == "": return
	var t := nearest_free(placing, _cursor.x, _cursor.y, place_rot, place_ignore)
	if t.x >= 0: _cursor = t
	_update_ghost()

## Frame the plot: the whole fenced plot in view, whatever the pan and zoom were.
## F frames the equipment on the sheet (the lone-feed start keeps some plot around it); an empty sheet shows the whole plot.
func frame_plot() -> void:
	if _units.is_empty(): _fit_boxes([[Vector2i.ZERO, Vector2i(NX, NZ)]])
	else: fit_view()
	cam_rig._instant = false

func _on_btn(which: String) -> void:
	match which:
		"frame": frame_plot()
		"zoom_in": cam_rig.zoom_by(1.0 / 1.3)
		"zoom_out": cam_rig.zoom_by(1.3)
		"rot_l": cam_rig.rotate_view(-1)
		"rot_r": cam_rig.rotate_view(1)

## A pipe being made: a ghost line from the chosen outlet (or inlet) follows the cursor and snaps to a lit port under it.
var _ghost_line: MeshInstance3D
var _ghost_im: ImmediateMesh
var _ghost_from := {}
func set_pipe_ghost(unit: String, port: String, inlet: bool) -> void:
	_ghost_from = {} if unit == "" else {"unit": unit, "port": port, "inlet": inlet}
	if unit == "" and _ghost_line != null: _ghost_line.visible = false
func pipe_ghost_active() -> bool: return not _ghost_from.is_empty()
func _tick_ghost() -> void:
	if _ghost_from.is_empty(): return
	var f := port_frame(str(_ghost_from.unit), str(_ghost_from.port), bool(_ghost_from.inlet))
	if f.is_empty(): return
	if _ghost_line == null:
		_ghost_im = ImmediateMesh.new(); _ghost_line = MeshInstance3D.new(); _ghost_line.mesh = _ghost_im
		var m := StandardMaterial3D.new(); m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; m.albedo_color = Color("#FFB703"); m.no_depth_test = true; m.render_priority = 7
		_ghost_line.material_override = m; _ghost_line.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; add_child(_ghost_line)
	var mp := get_viewport().get_mouse_position()
	var a: Vector3 = f.pos + Vector3(0, 0.4, 0)
	var b := a
	var sn := snap_legal(mp)
	_pulse_hot(sn.get("idx", -1))
	if not sn.is_empty():
		var snap: Dictionary = sn.mark
		var sf := port_frame(str(snap.unit), str(snap.port), bool(snap.inlet))
		if not sf.is_empty(): b = sf.pos + Vector3(0, 0.4, 0)
	else:
		var g = _ground_at(mp)
		if g != null: b = Vector3(g.x, 0.9, g.z)
	_ghost_im.clear_surfaces()
	# dashed: short segments along the line, so it never reads as a laid pipe
	var d := b - a; var n := int(d.length() / 0.7)
	_ghost_im.surface_begin(Mesh.PRIMITIVE_LINES)
	for i in range(0, maxi(n, 1), 2):
		_ghost_im.surface_add_vertex(a + d * (float(i) / maxf(n, 1))); _ghost_im.surface_add_vertex(a + d * (minf(float(i + 1), maxf(n, 1)) / maxf(n, 1)))
	_ghost_im.surface_end()
	_ghost_line.visible = true

## With a pipe in hand every legal port pulses (bigger the further out the camera is) and the one a click would take swells.
var _snap_idx := -1
func snap_index() -> int: return _snap_idx
func _pulse_hot(snap: int) -> void:
	_snap_idx = snap
	var far := clampf(cam_rig._size / 40.0, 1.0, 2.2)
	var beat := 1.0 + 0.14 * sin(Time.get_ticks_msec() * 0.008)
	for i in range(mini(_mark_nodes.size(), _marks.size())):
		var n: Node3D = _mark_nodes[i]
		if not is_instance_valid(n) or not bool(_marks[i].get("hot", false)): continue
		n.scale = Vector3.ONE * far * (beat if i != snap else 1.9)

func _process(dt: float) -> void:
	Tag3D.refit(get_tree(), get_viewport())
	_coach_tick(); _tick_ghost(); _hover_caps()
	if _btn_layer != null:
		var show_btn: bool = (CbLayout.touch or OS.get_environment("CB_CAM_BUTTONS") != "") and input_ok() and not title_mode and app.started
		_btn_layer.visible = show_btn
		if show_btn:
			_btns.size_px = maxf(CbLayout.tap(), 62.4 if CbLayout.phone else 48.0); _btns.cols = 2 if (CbLayout.phone and get_viewport().get_visible_rect().size.x > get_viewport().get_visible_rect().size.y) else 1; _btns.relayout()
			var vr := get_viewport().get_visible_rect().size
			var ins: Vector4 = app.inset
			if _btns.cols == 2:   # landscape phone: a 2x2 pad at the bottom right, just above the console (the instrument window keeps the top right)
				_btns.position = Vector2(vr.x - ins.z - cover - _btns.size.x - 12.0, vr.y - ins.w - cover_bottom - _btns.size.y - 12.0)
			else:
				_btns.position = Vector2(vr.x - ins.z - cover - _btns.size.x - 16.0, vr.y * 0.5 - _btns.size.y * 0.5 - 20.0)
	if _fps_on:
		_fps_t += dt; _fps_n += 1
		if _fps_t >= 5.0: print("FPS avg=%.1f over %.1fs (%d frames)" % [_fps_n / _fps_t, _fps_t, _fps_n]); _fps_t = 0.0; _fps_n = 0

func _apply() -> void:
	if cam_rig == null: return
	var vr := get_viewport().get_visible_rect().size
	cam_rig.h_shift_px = -vr.x * 0.2 if title_mode else (cover + board_cover - cover_left) * 0.5   # the title menu sits on the left; a drawer covers the right
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
		m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; m.no_depth_test = true; m.render_priority = 3   # never hidden behind a neighbouring model
		_coach_mark = MeshInstance3D.new(); _coach_mark.mesh = cm; _coach_mark.material_override = m
		_coach_mark.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; add_child(_coach_mark)
	_coach_mark.visible = _coach_unit != ""

## A failed solve: a red chevron pulses over the unit that failed ("" hides it).
var _fail_mark: MeshInstance3D
var _fail_unit := ""
func set_fail_focus(id: String) -> void:
	_fail_unit = id if _units.has(id) else ""
	if _fail_mark == null:
		var cm := CylinderMesh.new(); cm.top_radius = 1.0; cm.bottom_radius = 0.0; cm.height = 1.6; cm.radial_segments = 4
		var m := StandardMaterial3D.new(); m.albedo_color = Color("#FF3B47"); m.emission_enabled = true; m.emission = Color("#FF3B47"); m.emission_energy_multiplier = 2.6
		m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; m.no_depth_test = true; m.render_priority = 4
		_fail_mark = MeshInstance3D.new(); _fail_mark.mesh = cm; _fail_mark.material_override = m
		_fail_mark.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; add_child(_fail_mark)
	_fail_mark.visible = _fail_unit != ""
func fail_focus() -> String: return _fail_unit

## A refused commission: the open ports it complains about pulse in red for a few seconds. `list` is the engine's openPorts: [{unit, port, dir}].
var _pulse_nodes: Array = []
var _pulse_until := 0
func pulse_ports(list: Array) -> void:
	clear_pulse()
	for it in list:
		var inlet := str(it.get("dir", "in")) == "in"
		var f := port_frame(str(it.unit), str(it.port), inlet)
		if f.is_empty(): continue
		var mi := MeshInstance3D.new()
		if inlet: var bm := BoxMesh.new(); bm.size = Vector3(1, 1, 1) * 0.8; mi.mesh = bm
		else: var sm := SphereMesh.new(); sm.radius = 0.45; sm.height = 0.9; mi.mesh = sm
		var m := StandardMaterial3D.new(); m.albedo_color = Color("#FF3B47"); m.emission_enabled = true; m.emission = Color("#FF3B47"); m.emission_energy_multiplier = 3.0
		m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; m.no_depth_test = true; m.render_priority = 6
		var toward := cam.global_transform.basis.z.normalized()
		mi.material_override = m; mi.position = f.pos + f.dir * 0.3 + toward * 1.2 + Vector3(0, 0.25, 0); mi.name = "Pulse_%s_%s" % [str(it.unit), str(it.port)]
		add_child(mi); _pulse_nodes.append(mi)
	_pulse_until = Time.get_ticks_msec() + 6000
func clear_pulse() -> void:
	for n in _pulse_nodes: if is_instance_valid(n): (n as Node).queue_free()
	_pulse_nodes.clear()
## Build checklist guidance (ui/build_checklist.gd): the two ports of the pipe the notebook wants next pulse until the pipe is made or the guide moves on
## (teal ball = OUT, amber square = IN, larger than a port pip and drawn over it), and the tile a part is suggested on pulses as a green footprint.
var _guide_nodes: Array = []
var _guide_key := ""
func guide_ports(list: Array) -> void:   ## [{unit, port, inlet}]; the same list again changes nothing
	var key := JSON.stringify(list)
	if key == _guide_key and not _guide_nodes.is_empty(): return
	clear_guide_ports(); _guide_key = key
	for it in list:
		var inlet := bool(it.get("inlet", false))
		var f := port_frame(str(it.unit), str(it.port), inlet)
		if f.is_empty(): continue
		var mi := MeshInstance3D.new()
		if inlet: var bm := BoxMesh.new(); bm.size = Vector3(1, 1, 1) * 1.1; mi.mesh = bm
		else: var sm := SphereMesh.new(); sm.radius = 0.62; sm.height = 1.24; mi.mesh = sm
		var col := Color("#FFB703") if inlet else Color("#2EC4B6")
		var m := StandardMaterial3D.new(); m.albedo_color = Color(col, 0.55); m.emission_enabled = true; m.emission = col; m.emission_energy_multiplier = 3.0
		m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; m.no_depth_test = true; m.render_priority = 12; m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		mi.material_override = m; mi.position = pip_world(f); mi.name = "Guide_%s_%s" % [str(it.unit), str(it.port)]
		mi.set_meta("u", str(it.unit)); mi.set_meta("p", str(it.port)); mi.set_meta("i", inlet)
		add_child(mi); _guide_nodes.append(mi)
func clear_guide_ports() -> void:
	for n in _guide_nodes: if is_instance_valid(n): (n as Node).queue_free()
	_guide_nodes.clear(); _guide_key = ""
func guiding() -> Array: return _guide_nodes.filter(func(n): return is_instance_valid(n)).map(func(n): return str(n.name))
## Where a port's pip sits in the world (the pip rides toward the camera, a little up) and where it is on the screen: what a player clicks.
func pip_world(f: Dictionary) -> Vector3: return f.pos + f.dir * 0.3 + cam.global_transform.basis.z.normalized() * 1.2 + Vector3(0, 0.25, 0)
func port_screen(id: String, port: String, inlet: bool) -> Vector2:
	var f := port_frame(id, port, inlet)
	return Vector2(-9999.0, -9999.0) if f.is_empty() else world_to_screen(pip_world(f))

var _suggest: MeshInstance3D
var _suggest_fp := Vector2i.ZERO
var _suggest_at := Vector2i(-1, -1)
## The suggested anchor of the part in hand (or the next part of the build order): a pulsing green footprint. A tile that is not free hides it.
func suggest_place(type: String, at: Vector2i) -> void:
	ensure_footprints()
	var fp := footprint_of(type)
	if not can_place(type, at.x, at.y, 0): clear_suggest(); return
	_suggest_fp = fp; _suggest_at = at; _suggest_type = type
	if _suggest == null:
		_suggest = MeshInstance3D.new(); _suggest.name = "SuggestFoot"; _suggest.mesh = BoxMesh.new(); _suggest.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		var m := StandardMaterial3D.new(); m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; m.albedo_color = Color(0.22, 0.85, 0.42, 0.5); m.no_depth_test = true; m.render_priority = 4
		_suggest.material_override = m; add_child(_suggest)
	(_suggest.mesh as BoxMesh).size = Vector3(fp.x * GRID - 0.1, 0.08, fp.y * GRID - 0.1)
	_suggest.position = tile_to_world(at, fp) + Vector3(0, 0.16, 0); _suggest.visible = true
var _suggest_type := ""
func clear_suggest() -> void:
	_suggest_at = Vector2i(-1, -1)
	if _suggest != null: _suggest.visible = false
func suggested() -> Vector2i: return _suggest_at if _suggest != null and _suggest.visible else Vector2i(-1, -1)
## The tile a click lands on to put the suggested footprint there: the cursor is the centre of the footprint.
func suggest_click_tile() -> Vector2i: return _suggest_at + _suggest_fp / 2

func pulsing() -> Array: return _pulse_nodes.filter(func(n): return is_instance_valid(n)).map(func(n): return str(n.name))

func _coach_tick() -> void:
	if not _guide_nodes.is_empty():
		var tg := Time.get_ticks_msec() * 0.001
		for n in _guide_nodes:
			if not is_instance_valid(n): continue
			(n as Node3D).scale = Vector3.ONE * (1.0 + 0.4 * absf(sin(tg * 4.5)))
			var gf := port_frame(str(n.get_meta("u")), str(n.get_meta("p")), bool(n.get_meta("i")))
			if not gf.is_empty(): (n as Node3D).position = pip_world(gf)
	if _suggest != null and _suggest.visible and _suggest_type != "" and not can_place(_suggest_type, _suggest_at.x, _suggest_at.y, 0): clear_suggest()   # the unit has been placed on the pad (or something else took the spot): the pad goes
	if _suggest != null and _suggest.visible: (_suggest.material_override as StandardMaterial3D).albedo_color.a = 0.25 + 0.4 * absf(sin(Time.get_ticks_msec() * 0.004))
	if not _pulse_nodes.is_empty():
		if Time.get_ticks_msec() > _pulse_until: clear_pulse()
		else:
			var tp := Time.get_ticks_msec() * 0.001
			for n in _pulse_nodes: if is_instance_valid(n): (n as Node3D).scale = Vector3.ONE * (1.0 + 0.45 * absf(sin(tp * 6.0)))
	if _fail_mark != null and _fail_mark.visible:
		if _units.has(_fail_unit):
			var tf := Time.get_ticks_msec() * 0.001
			_fail_mark.global_position = anchor_world(_fail_unit) + Vector3(0, 2.4 + 0.5 * absf(sin(tf * 5.0)), 0)
			_fail_mark.scale = Vector3.ONE * (1.0 + 0.18 * sin(tf * 8.0)); _fail_mark.rotation.y = tf * 1.5
		else: _fail_mark.visible = false
	if _coach_mark != null and _coach_mark.visible and _units.has(_coach_unit):
		var t := Time.get_ticks_msec() * 0.001
		_coach_mark.global_position = anchor_world(_coach_unit) + Vector3(0, 2.2 + 0.35 * sin(t * 3.0), 0)
		_coach_mark.rotation.y = t * 1.5
