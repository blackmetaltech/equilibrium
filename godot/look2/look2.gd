class_name Look2
extends Node
## LOOK2 phase A glue (docs/LOOK2.md). For the slice level (L00 Night Shift) the old plant view and console are hidden and two new layers take over:
## LabWorld (look2/lab_world.gd: the process hall, the loop, the plant outside) and HoloHud (look2/holo_hud.gd: anchored readouts, the equilibrium
## diagram, the cooler dial, the coach line, the clock, the end card). The engine, the level and its actions are unchanged: this file only routes the
## snapshot to the new layers. CB_LOOK2=0 turns the slice off (the 0.9 look comes back). Quality tier: CB_QUALITY=ultra|high|compat, else auto.
const LEVELS := ["L00", "L14"]   ## L00 Night Shift (the process hall), L14 The Brown Gas (the private lab, look2/flask_lab.gd)
var app
var lab   ## LabWorld (L00) or FlaskLab (L14): the same contract (setup, set_snapshot, anchor_screen, anchor_size, set_camera, key, cam, picked, control_changed)
var hud: HoloHud
var on := false
var tier := ""
var level := ""
var ids := {}   ## role -> engine unit id (found by type in the plant query)

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
		if app.plant_world != null: app.plant_world.set_blocked(false); app.plant_world.cam.make_current()
		if app.chrome != null and app.chrome_shown(): app.chrome.visible = true
		_hide_paper(false)

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
	if not on or lab == null: return false
	lab.set_camera(spec); return true

func key(e: InputEventKey) -> bool:
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
