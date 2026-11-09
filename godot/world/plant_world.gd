class_name PlantWorld
extends Node3D
## The world: a coastal plot at night. A fenced 48 x 32 m build plot with a 2 m grid, a quay and a sea beyond, sodium-lamp light, an
## orthographic camera at 35 degrees pitch and 45 degrees yaw that turns in 90 degree steps. 1 world unit = 1 m. Units, pipes and
## their live state arrive with the design actions (M1/M2); this node only reads the engine's `plant` query.
## The app tells it how much of the right side a drawer covers (set_cover) and whether a full-screen workshop is open (set_blocked).
const GRID := 2.0
const PLOT := Vector2(48.0, 32.0)          # fenced plot, m (24 x 16 cells)
const LAND := Vector2(84.0, 60.0)          # land incl. the apron around the fence, m
const PITCH := 35.0
const YAW0 := 45.0
const ZOOMS: Array[float] = [36.0, 56.0, 80.0]   # orthographic size: metres of view height
const LAMP := Color("#FFB35A")
const TEAL := Color("#2EC4B6")
var app
var cover := 0.0
var title_mode := false
var blocked := false
var plant: Dictionary = {}
var yaw_step := 0
var zoom_i := 1
var cam: Camera3D
var rig: Node3D
var _yaw := YAW0
var _yaw_to := YAW0
var _size := 56.0
var _size_to := 56.0
var _pan := Vector3.ZERO
var _pan_to := Vector3.ZERO
var _instant := true
var _lamps: Array[OmniLight3D] = []

func _ready() -> void:
	_build_environment(); _build_land(); _build_sea(); _build_grid(); _build_fence(); _build_lamps(); _build_camera()
	_apply()

func set_cover(px: float) -> void: cover = px; _apply()
func set_blocked(b: bool) -> void: blocked = b; visible = not b
func set_title(on: bool) -> void: title_mode = on; _apply()

## The engine's plant query (units, pipes, phase, species). Empty at M0.2: only the count is kept for the smoke test.
func set_state(p: Dictionary) -> void: plant = p
func unit_count() -> int: return (plant.get("units", []) as Array).size()

## CB_CAM for screenshots: "rot" / "rot+" / "rot-" / "yaw0".."yaw3" (quarter turns), "close" / "mid" / "wide" or a view height in metres.
func set_camera(spec: String) -> void:
	match spec:
		"rot", "rot+": rotate_view(1)
		"rot-": rotate_view(-1)
		"close": _set_zoom(0)
		"mid": _set_zoom(1)
		"wide": _set_zoom(2)
		_:
			if spec.begins_with("yaw") and spec.substr(3).is_valid_int(): yaw_step = posmod(int(spec.substr(3)), 4); _yaw_to = YAW0 + 90.0 * yaw_step
			elif spec.is_valid_float(): _size_to = clampf(float(spec), 20.0, 90.0)
	_instant = true
	_apply()

func rotate_view(dir: int) -> void:
	yaw_step = posmod(yaw_step + dir, 4); _yaw_to += 90.0 * dir

func yaw_degrees() -> float: return YAW0 + 90.0 * yaw_step
func ortho_size() -> float: return cam.size if cam != null else _size
func lamp_count() -> int: return _lamps.size()

func _set_zoom(i: int) -> void: zoom_i = clampi(i, 0, ZOOMS.size() - 1); _size_to = ZOOMS[zoom_i]

func _process(dt: float) -> void:
	var k := 1.0 - exp(-dt * 9.0)
	_yaw = lerpf(_yaw, _yaw_to, k)
	_pan = _pan.lerp(_pan_to, k)
	if absf(_size - _size_to) > 0.005: _size = lerpf(_size, _size_to, k)
	_apply()

func _unhandled_input(e: InputEvent) -> void:
	if blocked or app == null or app.modal() != null: return
	if e is InputEventMouseButton and e.pressed:
		if e.button_index == MOUSE_BUTTON_WHEEL_UP: _instant = false; _set_zoom(zoom_i - 1)
		elif e.button_index == MOUSE_BUTTON_WHEEL_DOWN: _instant = false; _set_zoom(zoom_i + 1)
	elif e is InputEventMouseMotion and (e.button_mask & (MOUSE_BUTTON_MASK_RIGHT | MOUSE_BUTTON_MASK_MIDDLE)) != 0:
		var mpp := _size / maxf(1.0, get_viewport().get_visible_rect().size.y)   # metres per logical pixel
		var right := Vector3.RIGHT.rotated(Vector3.UP, deg_to_rad(_yaw))
		var fwd := Vector3.FORWARD.rotated(Vector3.UP, deg_to_rad(_yaw))
		_pan_to += (-right * e.relative.x + fwd * e.relative.y / sin(deg_to_rad(PITCH))) * mpp
		_pan_to.x = clampf(_pan_to.x, -PLOT.x * 0.5, PLOT.x * 0.5); _pan_to.z = clampf(_pan_to.z, -PLOT.y * 0.5, PLOT.y * 0.5)
		_instant = false

func _apply() -> void:
	if cam == null: return
	if _instant: _yaw = _yaw_to; _pan = _pan_to; _size = _size_to
	rig.position = _pan
	rig.rotation_degrees = Vector3(-PITCH, _yaw, 0.0)
	cam.size = _size
	var vr := get_viewport().get_visible_rect().size
	var mpp := _size / maxf(1.0, vr.y)
	var shift_px := -vr.x * 0.2 if title_mode else cover * 0.5   # the title menu sits on the left; a drawer covers the right
	cam.h_offset = shift_px * mpp
	_instant = false

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
	_box(Vector3(LAND.x, 3.0, LAND.y), Vector3(0, -1.5, 0), _mat(Color("#2A2823"), 1.0))            # salt-flat apron, quay edge at the sea
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
	rig = Node3D.new(); add_child(rig)
	cam = Camera3D.new(); cam.projection = Camera3D.PROJECTION_ORTHOGONAL; cam.size = _size; cam.near = 0.5; cam.far = 700.0
	cam.position = Vector3(0, 0, 120.0); cam.current = true; rig.add_child(cam)
