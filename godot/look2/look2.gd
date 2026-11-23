class_name Look2
extends Node
## LOOK2 phase A glue (docs/LOOK2.md). For the slice level (L00 Night Shift) the old plant view and console are hidden and two new layers take over:
## LabWorld (look2/lab_world.gd: the process hall, the loop, the plant outside) and HoloHud (look2/holo_hud.gd: anchored readouts, the equilibrium
## diagram, the cooler dial, the coach line, the clock, the end card). The engine, the level and its actions are unchanged: this file only routes the
## snapshot to the new layers. CB_LOOK2=0 turns the slice off (the 0.9 look comes back). Quality tier: CB_QUALITY=ultra|high|compat, else auto.
var _rack_off := false   ## 0.12: the parts rack is hidden while the hall shows
const GEN_LEVELS := ["L01", "L02", "L03", "L04", "L05", "L06", "L07", "L08", "L09", "L10", "L11", "L12", "L13", "L15", "L16", "L17", "L18"]   ## D-B4 + D-C2 (chapter 1): build levels: drafting table (the classic build view) + the player's plant generated in the hall (gen_world.gd)
const LEVELS := ["L00", "L14"]   ## L00 Night Shift (the process hall), L14 The Brown Gas (the private lab, look2/flask_lab.gd)
var app
var lab   ## LabWorld (L00) or FlaskLab (L14): the same contract (setup, set_snapshot, anchor_screen, anchor_size, set_camera, key, cam, picked, control_changed)
var hud: HoloHud
var on := false
var tier := ""
var level := ""
var ids := {}   ## role -> engine unit id (found by type in the plant query)
var gen: GenWorld          ## the chapter 3 plant in the hall (gen mode keeps the classic chrome)
var gen_level := ""
var gen_flip := false      ## B: look at the other view (the drafting table after commissioning, or the hall while drafting)
var _banner: CanvasLayer
var pad_i := 0             ## the world control under the pad cursor
var pad_cam := 0
var _padl: CanvasLayer
var _pad_ring: Control
var _pad_lbl: Label
var _banner_lbl: Label

const ROLE_OF_TYPE := {"feed": "feed", "mixer": "mixer", "compressor": "compressor", "heater": "heater", "cooler": "cooler", "eq_reactor": "converter",
	"nh3_sep": "separator", "splitter": "splitter", "valve": "valve", "flare": "flare", "product": "product", "interlock": "interlock",
	"lab_flask": "flask", "vent": "vent"}

static func enabled() -> bool: return OS.get_environment("CB_LOOK2") != "0"

## The tier: ultra on a Forward+ discrete GPU, high on the Mobile renderer (or forced), compat on integrated GPUs and the OpenGL compatibility renderer.
static func auto_tier() -> String:
	var forced := OS.get_environment("CB_QUALITY")
	if forced in ["ultra", "high", "compat"]: return forced
	var method := str(ProjectSettings.get_setting("rendering/renderer/rendering_method", "forward_plus"))
	var rd := RenderingServer.get_rendering_device()
	if rd == null: return "compat"
	if method == "mobile": return "high"
	var dev := RenderingServer.get_video_adapter_type()
	return "ultra" if dev == RenderingDevice.DEVICE_TYPE_DISCRETE_GPU else "compat"   # measured: a 2-CU Radeon iGPU runs high at 76 ms, compat at 28 ms (1280x800)

## Called from main.gd after every engine change. Builds or tears down the slice as the level changes.
## Owner review (11-23): the first screen is the new look. The title shows the night plant hall with the camera drifting; it goes when a level starts.
var title_world: LabWorld
func title_backdrop(show: bool) -> void:
	if show and title_world == null and enabled() and app.plant_world != null:
		title_world = LabWorld.new(); title_world.app = app; title_world.name = "TitleWorld"; app.plant_world.get_parent().add_child(title_world)
		title_world.set_quality(auto_tier()); title_world.set_camera("wide"); title_world.drift = 0.035
		app.plant_world.visible = false; app.plant_world.set_blocked(true); if _parked.is_empty(): _park_env(true)
		title_world.make_current()
	elif not show and title_world != null:
		title_world.queue_free(); title_world = null
		if not on and gen == null:
			if not _parked.is_empty(): _park_env(false)
			app.plant_world.visible = true; app.plant_world.set_blocked(false)
			if app.plant_world.cam != null: app.plant_world.cam.make_current()

func sync() -> void:
	if title_world != null and app != null and app.started: title_backdrop(false)
	if get_parent() != null and get_index() != get_parent().get_child_count() - 1 and (on or gen != null): get_parent().move_child.call_deferred(self, -1)   # first to see a pad button (see _input)
	var lid := str(app.b.g.get("level", "")) if app != null and app.b != null and app.started else ""
	var gen_want: bool = enabled() and lid in GEN_LEVELS and app.chrome != null
	if gen != null and (not gen_want or lid != gen_level): _gen_off()
	if gen_want: _gen_sync(lid)
	var want: bool = enabled() and lid in LEVELS and app.chrome != null and app.chrome_shown()
	if on and want and lid != level: _set_on(false)   # Next from L00 to L14: a different world
	if want != on: _set_on(want)
	if not on: return
	app.chrome.visible = false   # the shell re-shows the console after a dialog; the slice keeps it hidden
	app.plant_world.visible = false
	if not Notebook.started.get(lid, false): Notebook.started[lid] = true; Notebook.close(app)   # the slice's brief replaces the paper notebook (L14 opens it at tick 0)
	if lab.cam != null and not lab.cam.current: lab.cam.make_current()   # the plant camera takes the view back on some refreshes
	_hide_paper(true)
	var p = app.b.q("plant")
	if p is Dictionary and ids.is_empty():
		for u in p.get("units", []):
			var r: String = ROLE_OF_TYPE.get(str(u.get("type", "")), "")
			if r == "feed" and ids.has("feed"): r = "argon"   # L14: the second feed bank is the argon
			if r != "" and not ids.has(r): ids[r] = str(u.get("id", ""))
		lab.setup(ids); hud.setup(ids)
	lab.set_snapshot(app.b.g)
	hud.refresh()

func _set_on(v: bool) -> void:
	on = v
	if v:
		tier = auto_tier()
		print("LOOK2 on: tier=%s method=%s adapter=%s" % [tier, RenderingServer.get_current_rendering_method(), RenderingServer.get_video_adapter_name()])
		ids = {}
		level = str(app.b.g.get("level", ""))
		lab = (FlaskLab.new() if level == "L14" else LabWorld.new()); lab.app = app; lab.name = "LabWorld"; app.plant_world.get_parent().add_child(lab); lab.set_quality(tier)
		hud = HoloHud.new(); hud.app = app; hud.lab = lab; hud.name = "HoloHud"; app.chrome.get_parent().add_child(hud); hud.build()
		app.plant_world.set_blocked(true)
		_park_env(true)
		app.chrome.visible = false
		lab.make_current()
	else:
		if lab != null: lab.queue_free(); lab = null
		if hud != null: hud.queue_free(); hud = null
		ids = {}
		_park_env(false)
		app.get_viewport().scaling_3d_scale = 1.0; app.get_viewport().scaling_3d_mode = Viewport.SCALING_3D_MODE_BILINEAR
		app.get_viewport().msaa_3d = Viewport.MSAA_DISABLED; app.get_viewport().use_taa = false; app.get_viewport().screen_space_aa = Viewport.SCREEN_SPACE_AA_DISABLED
		if app.plant_world != null: app.plant_world.set_blocked(false); app.plant_world.cam.make_current()
		if app.chrome != null and app.chrome_shown(): app.chrome.visible = true
		_hide_paper(false)

## D-B4 gen mode: the chrome and the classic build stay; the hall shows the player's plant once it is commissioned (or on B).
func _gen_sync(lid: String) -> void:
	if gen == null:
		tier = auto_tier(); gen_level = lid; gen_flip = false
		gen = GenWorld.new(); gen.app = app; gen.name = "GenWorld"; app.plant_world.get_parent().add_child(gen); gen.set_quality(tier); gen.setup({})
		_banner = CanvasLayer.new(); _banner.layer = 5; app.add_child(_banner)
		_banner_lbl = HoloTheme.label("", 16, HoloTheme.INK, 600); _banner_lbl.position = Vector2(400, 10); _banner.add_child(_banner_lbl)
		print("LOOK2 gen on: %s tier=%s" % [lid, tier])
	var li = app.b.q("levelInfo")
	var phase := str(li.get("phase", "design")) if li is Dictionary else "design"
	var show := (phase != "design") != gen_flip
	var g: Dictionary = app.b.g.duplicate(); g["phase"] = phase
	gen.set_snapshot(g)
	if show != _rack_off and app.chrome != null:   # 0.12 (Sigrid): the parts rack is a drafting-table tool; it covered the plant in the hall
		_rack_off = show; app.chrome.hall_hold = show; app.chrome.layout()
	if show:
		gen.visible = true; app.plant_world.visible = false; app.plant_world.set_blocked(true)
		if _parked.is_empty(): _park_env(true)
		gen.make_current()
		var built: bool = gen.anchors.size() > 0   # playtest: a drawn plant that is not commissioned yet is not "nothing built"
		_b_state = "hall" if phase != "design" else ("ready" if built else "empty")
	else:
		gen.visible = false; app.plant_world.visible = true; app.plant_world.set_blocked(false)
		if not _parked.is_empty(): _park_env(false)
		if app.plant_world.cam != null: app.plant_world.cam.make_current()
		_b_state = "table"
	_banner_refresh()
	_banner_lbl.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.8)); _banner_lbl.add_theme_constant_override("outline_size", 6)

## 0.13: the banner over the hall: short and plain, and it says what the camera does (LabWorld: right or middle drag orbits, the wheel zooms; pad: right stick orbits, LT/RT zoom).
var _b_state := ""
static func banner_text(state: String, pad: bool) -> String:
	var flip := "X" if pad else "B"
	match state:
		"hall": return "Your plant in the hall  ·  %s: drafting table\n%s" % [flip, _orbit_hint(pad)]
		"ready": return "Your plant, not commissioned yet  ·  %s: drafting table\n%s" % [flip, _orbit_hint(pad)]
		"empty": return "The hall, nothing built yet  ·  %s: drafting table\n%s" % [flip, _orbit_hint(pad)]
	return "Drafting table  ·  %s: the hall" % ("R3" if pad else "B")
static func _orbit_hint(pad: bool) -> String:
	return "Right stick: orbit  ·  LT / RT: zoom" if pad else "Right-drag: orbit  ·  wheel: zoom"
func _banner_refresh() -> void:
	if _banner_lbl == null: return
	var t := banner_text(_b_state, CbKit.pad_mode)
	if _banner_lbl.text != t: _banner_lbl.text = t

func _gen_off() -> void:
	if _rack_off and app.chrome != null: _rack_off = false; app.chrome.hall_hold = false; app.chrome.layout()   # leaving the hall gives the rack back
	if gen != null: gen.queue_free(); gen = null
	if _banner != null: _banner.queue_free(); _banner = null
	gen_level = ""
	if not _parked.is_empty(): _park_env(false)
	if app.plant_world != null:
		app.plant_world.visible = true; app.plant_world.set_blocked(false)
		if app.plant_world.cam != null: app.plant_world.cam.make_current()
	app.get_viewport().scaling_3d_scale = 1.0; app.get_viewport().scaling_3d_mode = Viewport.SCALING_3D_MODE_BILINEAR
	app.get_viewport().msaa_3d = Viewport.MSAA_DISABLED; app.get_viewport().use_taa = false; app.get_viewport().screen_space_aa = Viewport.SCREEN_SPACE_AA_DISABLED

## Phase B: the pad works the world's own controls. D-pad left/right picks a control (a ring marks it), up/down turns a wheel, A presses a lever,
## valve or clamp (or opens the keypad for the Call box), LB/RB step the camera presets, X flips the drafting table and the hall (gen) or the x-ray (L00).
## Sticks and triggers move the camera (LabWorld._cam_step). Called from main._input before the shell's pad handling sees the button.
func pad(e: InputEventJoypadButton) -> bool:
	if not e.pressed or app.modal() != null: return false
	if on and hud != null and ((hud._brief != null and hud._brief.shown and not hud._brief_done) or (hud._end != null and hud._end.shown)): return false   # the brief's Begin and the end card's buttons keep the pad (focus + A)
	var w = null
	if gen != null: w = gen if gen.visible else null
	elif on: w = lab
	# D-C2: the drafting table uses X (turn a part), so the hall flip is R3; X also flips back while the hall hides the table
	if gen != null and (e.button_index == JOY_BUTTON_RIGHT_STICK or (e.button_index == JOY_BUTTON_X and gen.visible)): gen_flip = not gen_flip; sync(); return true
	if w == null: return false
	var cams: Array = w.pad_cams()
	match e.button_index:
		JOY_BUTTON_LEFT_SHOULDER, JOY_BUTTON_RIGHT_SHOULDER:
			pad_cam = posmod(pad_cam + (1 if e.button_index == JOY_BUTTON_RIGHT_SHOULDER else -1), cams.size()); w.set_camera(cams[pad_cam]); return true
		JOY_BUTTON_X:
			if w.has_method("set_xray") and level == "L00": w.set_xray(not w.xray); return true
			return false
	var ctl: Array = w.pad_controls()
	if ctl.is_empty(): return false
	pad_i = clampi(pad_i, 0, ctl.size() - 1)
	var id: String = ctl[pad_i][0]
	match e.button_index:
		JOY_BUTTON_DPAD_LEFT: pad_i = posmod(pad_i - 1, ctl.size()); return true
		JOY_BUTTON_DPAD_RIGHT: pad_i = posmod(pad_i + 1, ctl.size()); return true
		JOY_BUTTON_DPAD_UP: w.pad_turn(id, 1); return true
		JOY_BUTTON_DPAD_DOWN: w.pad_turn(id, -1); return true
		JOY_BUTTON_A:
			if id == "call" and hud != null and hud.get("_fl") != null:
				var fl = hud._fl
				Knob.keypad(app, "CALL KP", "bar", "", 0.0, 100000.0, func(v: float): fl.call_kp(v), false, false); return true
			if id in ["lever", "argon_valve", "clamp"]: w.press_control(id); return true
	return false

## Look2 keeps itself the app's last child while a new-look world is up, so it sees a pad button before the shell's pad node (Godot runs _input from
## the last child back): LB/RB would otherwise switch the hidden console's drawers.
func _input(e: InputEvent) -> void:
	if not (e is InputEventJoypadButton) or app == null or not CbPad.enabled or not app.started: return
	if (e as InputEventJoypadButton).button_index == JOY_BUTTON_A and app.chrome != null and app.chrome.annunciator.unacked() > 0: return   # A acknowledges first
	if pad(e as InputEventJoypadButton): get_viewport().set_input_as_handled()

func _pad_draw() -> void:
	var w = (gen if gen != null and gen.visible else null) if gen != null else (lab if on else null)
	var hover := ""
	if w != null and not CbKit.pad_mode and app.modal() == null:   # playtest: point at a world control and the ring and its name line appear
		var hp: String = w.pick_control(app.get_viewport().get_mouse_position())
		for c in w.pad_controls(): if str(c[0]) == hp: hover = hp
		if hover == "" and w.get("_wdrag") != null and str(w._wdrag) != "": hover = "wheel_v" if str(w._wdrag) == "V" else "wheel_t"
	var show: bool = w != null and (CbKit.pad_mode or hover != "") and app.modal() == null and not (w.pad_controls() as Array).is_empty()
	if show and _padl == null:
		_padl = CanvasLayer.new(); _padl.layer = 6; app.add_child(_padl)
		_pad_ring = PadRing.new(); _pad_ring.mouse_filter = Control.MOUSE_FILTER_IGNORE; _padl.add_child(_pad_ring)
		_pad_lbl = HoloTheme.label("", 18, HoloTheme.INK, 600); _pad_lbl.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.85)); _pad_lbl.add_theme_constant_override("outline_size", 6); var plate := StyleBoxFlat.new(); plate.bg_color = Color(0.02, 0.06, 0.07, 0.82); plate.set_corner_radius_all(6); plate.content_margin_left = 10; plate.content_margin_right = 10; plate.content_margin_top = 4; plate.content_margin_bottom = 4; _pad_lbl.add_theme_stylebox_override("normal", plate);   # playtest: readable on the bright lab floor
		_padl.add_child(_pad_lbl)
	if _padl == null: return
	_padl.visible = show
	if not show: return
	var ctl: Array = w.pad_controls(); pad_i = clampi(pad_i, 0, ctl.size() - 1)
	if hover != "":
		for i in ctl.size(): if str(ctl[i][0]) == hover: pad_i = i
	var id: String = ctl[pad_i][0]
	var p: Vector2 = w.anchor_screen("flask" if id == "call" else id)
	_pad_ring.visible = p.x > -9000.0; _pad_ring.position = p - Vector2(28, 28)
	var vr: Rect2 = app.get_viewport().get_visible_rect()
	_pad_lbl.text = ("%s: %s      ◀ ▶ choose   LB/RB camera   sticks move" if CbKit.pad_mode else "%s: %s") % [ctl[pad_i][1], w.pad_value(id)]
	var lp := (p + Vector2(36, -16)) if p.x > -9000.0 else Vector2(vr.size.x * 0.5 - _pad_lbl.size.x * 0.5, 80.0)   # beside the ring, above the HUD
	var fit := func(q: Vector2) -> Vector2: return Vector2(clampf(q.x, 16.0, maxf(16.0, vr.size.x - _pad_lbl.size.x - 16.0)), clampf(q.y, 16.0, vr.size.y - 40.0))
	var pos: Vector2 = fit.call(lp)
	if p.x > -9000.0:   # playtest: the name line must not sit on a HUD card (the Call box); try right, left, above, below the ring
		var cards: Array = _hud_rects()
		for q in [lp, p + Vector2(-36.0 - _pad_lbl.size.x, -16), p + Vector2(-_pad_lbl.size.x * 0.5, -64), p + Vector2(-_pad_lbl.size.x * 0.5, 40)]:
			var c: Vector2 = fit.call(q); var r := Rect2(c, _pad_lbl.size); var hit := false
			for hr in cards: if (hr as Rect2).intersects(r): hit = true; break
			if not hit: pos = c; break
	_pad_lbl.position = pos

func _hud_rects() -> Array:
	var out := []
	if hud == null: return out
	for c in hud.get_children():
		if not (c is Control) or not (c as Control).visible or (c as Control).size.x <= 40.0: continue
		var r := (c as Control).get_global_rect(); var vs: Vector2 = app.get_viewport().get_visible_rect().size
		if r.size.x > vs.x * 0.8 and r.size.y > vs.y * 0.8: continue   # full-screen layers (the leader lines) are not cards
		out.append(r)
	return out

class PadRing extends Control:
	func _init() -> void: custom_minimum_size = Vector2(56, 56); size = Vector2(56, 56)
	func _process(_d: float) -> void: queue_redraw()
	func _draw() -> void:
		var t := Time.get_ticks_msec() * 0.004
		draw_arc(Vector2(28, 28), 22.0 + sin(t) * 2.0, 0.0, TAU, 40, Color(1.0, 0.82, 0.3, 0.95), 3.0, true)

## The 0.9 paper layers that live on the app root (the notebook tab, the faceplate hub, the stream tag) are hidden while the slice is on.
const PAPER := ["NotebookWatch", "PaperHub", "StreamTag"]
func _hide_paper(h: bool) -> void:
	for n in PAPER:
		var c = app.root.get_node_or_null(n)
		if c is CanvasItem: (c as CanvasItem).visible = not h
	var slot = app.get("hud_top_left") if "hud_top_left" in app else app.root.find_child("hud_top_left", true, false)
	if slot is CanvasItem: (slot as CanvasItem).visible = not h
	for c in app.root.get_children():   # the notebook tab sits on the root when no slot exists
		if c is Notebook.Tab: (c as CanvasItem).visible = not h

func relayout() -> void:
	if on and hud != null: hud.layout()

## Toasts and coach lines go to the HUD while the slice is on.
func toast(text: String, lvl: String) -> bool:
	if not on or hud == null: return false
	hud.toast(text, lvl); return true

## The level's end: the HUD's end card replaces the paper printout.
func end_screen() -> bool:
	if not on or hud == null: return false
	return hud.end_card()

func camera(spec: String) -> bool:
	if gen != null:
		if spec == "plant" or spec == "hall": gen_flip = str(app.b.q("levelInfo").get("phase", "design")) == "design"; sync()
		gen.set_camera(spec); return true
	if not on or lab == null: return false
	lab.set_camera(spec); return true

func key(e: InputEventKey) -> bool:
	if gen != null:
		if e.keycode == KEY_B: gen_flip = not gen_flip; sync(); return true
		if gen.visible: return gen.key(e)
		return false
	if not on: return false
	if hud != null and hud.key(e): return true
	return lab != null and lab.key(e)

## A scene has one environment: the plant world's WorldEnvironment (fog, sky, tonemap tuned for the 0.9 look) is parked while the slice is on.
var _parked := {}
func _park_env(park: bool) -> void:
	if app.plant_world == null: return
	if park:
		for w in app.plant_world.find_children("*", "WorldEnvironment", true, false):
			_parked[w] = (w as WorldEnvironment).environment; (w as WorldEnvironment).environment = null
	else:
		for w in _parked:
			if is_instance_valid(w): (w as WorldEnvironment).environment = _parked[w]
		_parked = {}

## The notebook tab and the paper hub can appear a frame after the last engine change: keep them hidden while the slice is on.
func _process(_dt: float) -> void:
	_pad_draw()
	if app != null: app.set_meta("cb_pad_hint_off", gen != null and gen.visible)   # 0.13: the drafting table's pad row ("LB/RB tray ...") does nothing over the hall
	if gen != null: _banner_refresh()
	if on: _hide_paper(true)
