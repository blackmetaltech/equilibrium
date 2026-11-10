class_name UMStack
extends UnitModel
## Chimney with an analyser hut. plume 0-1 sizes the plume and plume_color colours it (brown NO2, white steam, faint grey otherwise); lamp
## 0 off, 1 green, 2 red on the hut. Also serves as the vent.
var _plume: PPlume
var _lamp: StandardMaterial3D

func _build() -> void:
	tiles = Vector2i(2, 2); height = 9.4; beacon_pos = Vector3(0.0, 9.4, 0)
	Parts.plinth(body, Vector3(3.6, 0.15, 3.6))
	Parts.stack(body, Vector3(0, 0.15, 0), 0.95, 0.6, 8.6, PMat.paint("tank"), 3)
	Parts.cyl(body, 0.7, 0.18, Vector3(0, 8.8, 0), PMat.dark_metal(), Vector3.ZERO, -1.0, 20)
	Parts.platform(body, 0.8, 4.0, 0.6)
	Parts.ladder(body, Vector3(0, 0.15, 1.0), 4.0, 0.5)
	# analyser hut
	Parts.box(body, Vector3(1.5, 1.6, 1.3), Vector3(1.2, 0.95, 0.9), PMat.white())
	Parts.box(body, Vector3(1.7, 0.12, 1.5), Vector3(1.2, 1.8, 0.9), PMat.dark_metal())
	Parts.box(body, Vector3(0.5, 1.1, 0.05), Vector3(1.0, 0.7, 1.57), PMat.paint("steel"), false)
	_lamp = PMat.emissive(Color("#222222"), 3.5)
	Parts.sphere(body, 0.14, Vector3(1.75, 1.95, 1.4), _lamp)
	Parts.pipe(body, Vector3(0.55, 1.6, 0.55), Vector3(0.9, 1.6, 0.9), 0.05, PMat.metal())
	_plume = PPlume.new().setup(Color(0.7, 0.7, 0.72), 1.8, 3.6, 0.9, 3.6, 20, 12.0, 0.1); _plume.position = Vector3(0, 8.9, 0); body.add_child(_plume)
	add_port("in", Vector3(-1.9, 0.9, 0), Vector3.LEFT)
	Parts.pipe(body, Vector3(-1.9, 0.9, 0), Vector3(-0.8, 0.9, 0), 0.25, PMat.paint("process"), true)

func _apply() -> void:
	var col := PMat.species(display.get("plume_color", "#B8B8BE")); col.a = 1.0
	_plume.set_level(dv("plume", 0.2), col)
	var l := int(dv("lamp"))
	var c := Color("#222222") if l == 0 else (Color("#38D96B") if l == 1 else Color("#E63946"))
	_lamp.albedo_color = c; _lamp.emission = c
