class_name PBeacon
extends Node3D
## An alarm beacon: a dark lens (level 0), a slow amber rotating light (High, 1) or a fast red one (Critical, 2), with a light that sweeps.
var level := 0
var _arm: Node3D
var _dome_mat: StandardMaterial3D
var _arm_mat: StandardMaterial3D
var _light: OmniLight3D

func _init() -> void:
	var base := MeshInstance3D.new(); var bm := CylinderMesh.new(); bm.top_radius = 0.2; bm.bottom_radius = 0.26; bm.height = 0.22; base.mesh = bm; base.material_override = PMat.dark_metal(); base.position.y = 0.11; add_child(base)
	_dome_mat = StandardMaterial3D.new(); _dome_mat.albedo_color = Color("#3A3F48"); _dome_mat.emission_enabled = true; _dome_mat.emission = Color.BLACK; _dome_mat.roughness = 0.2
	var dome := MeshInstance3D.new(); var sm := SphereMesh.new(); sm.radius = 0.22; sm.height = 0.34; dome.mesh = sm; dome.material_override = _dome_mat; dome.position.y = 0.3; add_child(dome)
	_arm = Node3D.new(); _arm.position.y = 0.3; add_child(_arm)
	_arm_mat = StandardMaterial3D.new(); _arm_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; _arm_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; _arm_mat.albedo_color = Color(1, 0.7, 0.1, 0.5)
	_arm_mat.emission_enabled = true; _arm_mat.emission = Color(1, 0.7, 0.1); _arm_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	var bar := MeshInstance3D.new(); var qb := BoxMesh.new(); qb.size = Vector3(1.6, 0.05, 0.28); bar.mesh = qb; bar.material_override = _arm_mat; bar.position.x = 0.8; bar.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; _arm.add_child(bar)
	var bar2 := MeshInstance3D.new(); bar2.mesh = qb; bar2.material_override = _arm_mat; bar2.position.x = -0.8; bar2.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; _arm.add_child(bar2)
	_light = OmniLight3D.new(); _light.omni_range = 7.0; _light.light_energy = 0.0; _light.position.y = 0.6; add_child(_light)
	set_level(0)

func set_level(l: int) -> void:
	level = l
	var col := Color("#FFB703") if l == 1 else Color("#E63946")
	_dome_mat.emission = col if l > 0 else Color.BLACK; _dome_mat.albedo_color = col if l > 0 else Color("#3A3F48")
	_dome_mat.emission_energy_multiplier = 3.0
	_arm_mat.emission = col; _arm_mat.albedo_color = Color(col.r, col.g, col.b, 0.5)
	_light.light_color = col; _arm.visible = l > 0; set_process(l > 0)
	if l == 0: _light.light_energy = 0.0

func _process(dt: float) -> void:
	var rate := 2.6 if level == 1 else 7.5
	_arm.rotation.y += dt * rate
	var pulse := 0.55 + 0.45 * sin(Time.get_ticks_msec() * 0.001 * rate * 2.0)
	_light.light_energy = (2.4 if level == 1 else 3.6) * pulse
	_dome_mat.emission_energy_multiplier = 1.5 + 3.0 * pulse
