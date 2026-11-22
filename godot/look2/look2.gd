class_name Look2
extends Node
## LOOK2 phase A glue (docs/LOOK2.md). For the slice level (L00 Night Shift) the old plant view and console are hidden and two new layers take over:
## LabWorld (look2/lab_world.gd: the process hall, the loop, the plant outside) and HoloHud (look2/holo_hud.gd: anchored readouts, the equilibrium
## diagram, the cooler dial, the coach line, the clock, the end card). The engine, the level and its actions are unchanged: this file only routes the
## snapshot to the new layers. CB_LOOK2=0 turns the slice off (the 0.9 look comes back). Quality tier: CB_QUALITY=ultra|high|compat, else auto.
const GEN_LEVELS := ["L10", "L11", "L12", "L13"]   ## D-B4: chapter 3 build levels: drafting table (the classic build view) + the player's plant generated in the hall (gen_world.gd)
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
func sync() -> void:
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
	if show:
		gen.visible = true; app.plant_world.visible = false; app.plant_world.set_blocked(true)
		if _parked.is_empty(): _park_env(true)
		gen.make_current()
		_banner_lbl.text = "New look: your plant in the hall.  B: the drafting table" if phase != "design" else "New look: the hall (nothing built yet).  B: back to the drafting table"
	else:
		gen.visible = false; app.plant_world.visible = true; app.plant_world.set_blocked(false)
		if not _parked.is_empty(): _park_env(false)
		if app.plant_world.cam != null: app.plant_world.cam.make_current()
		_banner_lbl.text = "Drafting table (classic view). Commission and your plant stands in the hall.  B: the hall"
	_banner_lbl.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.8)); _banner_lbl.add_theme_constant_override("outline_size", 6)

func _gen_off() -> void:
	if gen != null: gen.queue_free(); gen = null
	if _banner != null: _banner.queue_free(); _banner = null
	gen_level = ""
	if not _parked.is_empty(): _park_env(false)
	if app.plant_world != null:
		app.plant_world.visible = true; app.plant_world.set_blocked(false)
		if app.plant_world.cam != null: app.plant_world.cam.make_current()
	app.get_viewport().scaling_3d_scale = 1.0; app.get_viewport().scaling_3d_mode = Viewport.SCALING_3D_MODE_BILINEAR
	app.get_viewport().msaa_3d = Viewport.MSAA_DISABLED; app.get_viewport().use_taa = false; app.get_viewport().screen_space_aa = Viewport.SCREEN_SPACE_AA_DISABLED

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
	if on: _hide_paper(true)
