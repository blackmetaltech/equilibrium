class_name UnitModel
extends Node3D
## Base of every plant model. A model is built once from parts (rot 0, origin at the footprint centre, ground at y = 0) and then driven
## by `set_display(dict)`: {T_K, glow 0-1, spin 0-1, level 0-1, alarm 0|1|2, ...} plus per-model keys (flame, stem, color, bands, ...).
## Ports are Marker3D children named after the engine's ports (meta "dir" = outward direction in model space); `anchor_top` is where a
## floating holo-card, balance beam or counter hangs. Shake, beacon and the selection outline are handled here.
const G := 2.0                       # grid size, m
var uid := ""
var utype := ""
var tiles := Vector2i(2, 2)          # footprint at rot 0, in tiles
var height := 4.0                    # m, for picking and the anchor
var body: Node3D                     # everything that shakes
var anchor_top: Marker3D
var ports := {}
var display := {}
var alarm := 0
var selected := false
var beacon_pos := Vector3(0, 4.0, 0)
var shell_mats: Array[StandardMaterial3D] = []
var _beacon: PBeacon
var _shake := 0.0
var _shake_hold := 0.0
var _t := 0.0
var _ghost := false
static var _outline: ShaderMaterial

static func outline_mat() -> ShaderMaterial:
	if _outline == null:
		var sh := Shader.new()
		sh.code = "shader_type spatial;\nrender_mode unshaded, cull_front;\nuniform vec4 col : source_color = vec4(0.18, 0.77, 0.71, 1.0);\nvoid vertex() { VERTEX += NORMAL * 0.085; }\nvoid fragment() { ALBEDO = col.rgb; EMISSION = col.rgb * 2.5; }\n"
		_outline = ShaderMaterial.new(); _outline.shader = sh
	return _outline

func setup(id: String, type: String) -> UnitModel:
	uid = id; utype = type; name = id if id != "" else type
	body = Node3D.new(); body.name = "body"; add_child(body)
	_build()
	anchor_top = Marker3D.new(); anchor_top.name = "anchor_top"; anchor_top.position = Vector3(0, height + 1.2, 0); add_child(anchor_top)
	set_display({})
	return self

## Override: build geometry under `body`, register ports with add_port, set `tiles`, `height`, `beacon_pos`.
func _build() -> void: pass
## Override: react to `display` (called after every set_display).
func _apply() -> void: pass
## Override: per-frame animation (spin, flicker); dt in seconds, `_t` is the model clock.
func _tick(_dt: float) -> void: pass

func add_port(pname: String, pos: Vector3, dir: Vector3) -> Marker3D:
	var m := Marker3D.new(); m.name = pname; m.position = pos; m.set_meta("dir", dir.normalized()); add_child(m); ports[pname] = m; return m

func port_names() -> Array: return ports.keys()
func port_pos(pname: String) -> Vector3: return (ports[pname] as Marker3D).global_position
func port_dir(pname: String) -> Vector3: return global_transform.basis * (ports[pname] as Marker3D).get_meta("dir")

func footprint(rot: int) -> Vector2i: return tiles if rot % 2 == 0 else Vector2i(tiles.y, tiles.x)

## A float from the display dict with a default.
func dv(key: String, def := 0.0) -> float:
	var v = display.get(key, def)
	return float(v) if (v is float or v is int) else def

## Glow 0..1: the dict's `glow`, else derived from `T_K` (nothing under 450 K).
func glow() -> float:
	if display.has("glow"): return clampf(dv("glow"), 0.0, 1.0)
	return PMat.heat(dv("T_K", 300.0))

func set_display(d: Dictionary) -> void:
	display.merge(d, true)
	if d.has("alarm"): set_alarm(int(d.get("alarm", 0)))
	var g := glow()
	for m in shell_mats: PMat.set_heat(m, g)
	_apply()

func set_alarm(level: int) -> void:
	alarm = clampi(level, 0, 2)
	if alarm > 0 and _beacon == null and not _ghost: _beacon = Parts.beacon(body, beacon_pos)
	if _beacon != null: _beacon.set_level(alarm); _beacon.visible = alarm > 0 or true

## A one-off jolt of `amount` metres that dies away (an explosion of a relief valve lifting, a surge).
func shake(amount: float) -> void: _shake = maxf(_shake, amount)
## A continuous shake (runaway: amplitude from dT/dt); 0 stops it.
func shake_hold(amount: float) -> void: _shake_hold = amount

func set_selected(on: bool) -> void:
	selected = on
	_overlay(body, outline_mat() if on else null)

func _overlay(n: Node, m: Material) -> void:
	for c in n.get_children():
		if c is MeshInstance3D: (c as MeshInstance3D).material_overlay = m
		_overlay(c, m)

## Turn this model into a placement ghost: one translucent material, no lights or particles.
func make_ghost(col: Color) -> void:
	_ghost = true
	var m := StandardMaterial3D.new(); m.albedo_color = Color(col.r, col.g, col.b, 0.5); m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; m.emission_enabled = true; m.emission = col; m.emission_energy_multiplier = 0.4
	_ghostify(self, m); set_process(false)

func tint_ghost(col: Color) -> void:
	_tint(self, col)

func _tint(n: Node, col: Color) -> void:
	for c in n.get_children():
		if c is MeshInstance3D and (c as MeshInstance3D).material_override is StandardMaterial3D:
			var m := (c as MeshInstance3D).material_override as StandardMaterial3D; m.albedo_color = Color(col.r, col.g, col.b, 0.5); m.emission = col
		_tint(c, col)

func _ghostify(n: Node, m: Material) -> void:
	for c in n.get_children():
		if c is MeshInstance3D:
			(c as MeshInstance3D).material_override = m; (c as MeshInstance3D).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		elif c is GPUParticles3D or c is Light3D or c is PBeacon: (c as Node3D).visible = false
		_ghostify(c, m)
	_clear_lights(n)

func _clear_lights(n: Node) -> void:
	for c in n.get_children():
		if c is Light3D: c.queue_free()
		_clear_lights(c)

## Hide the shells so the internals (beds, trays, levels) show. Models that have internals override.
func set_xray(on: bool) -> void:
	for m in shell_mats:
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA if on else BaseMaterial3D.TRANSPARENCY_DISABLED
		m.albedo_color.a = 0.12 if on else 1.0

func _process(dt: float) -> void:
	_t += dt
	var a := maxf(_shake, _shake_hold)
	body.position = Vector3(randf_range(-1, 1), 0.0, randf_range(-1, 1)) * a if a > 0.002 else Vector3.ZERO
	_shake *= exp(-dt * 6.0)
	_tick(dt)

## Spin a node about an axis at `turns` revolutions per second.
func spin_node(n: Node3D, axis: Vector3, turns: float, dt: float) -> void:
	if n != null: n.rotate_object_local(axis, TAU * turns * dt)
