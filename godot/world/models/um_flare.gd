class_name UMFlare
extends UnitModel
## Flare: a stack on a knock-out drum with a pilot. flow 0-1 sizes the flame (about 6 m tall); h2 0-1 is the hydrogen fraction: pure H2
## burns a nearly invisible pale blue (a teaching moment), hydrocarbons burn orange. The pilot is always lit.
var _flame: PFlame
var _pilot: PFlame
const TOP := 9.0

func _build() -> void:
	tiles = Vector2i(2, 2); height = 9.4; beacon_pos = Vector3(0.0, 5.5, 0.0)
	Parts.plinth(body, Vector3(3.6, 0.15, 3.6))
	Parts.vessel_h(body, 0.55, 1.8, PMat.paint("hot"), Vector3(0.5, 0.9, 1.0))
	Parts.cyl(body, 0.5, 1.2, Vector3(0, 0.75, 0), PMat.paint("steel"), Vector3.ZERO, 0.75, 20)
	Parts.stack(body, Vector3(0, 1.3, 0), 0.32, 0.28, TOP - 1.3, PMat.paint("steel"), 0)
	for k in range(3): Parts.box(body, Vector3(0.08, 4.0, 0.08), Vector3(cos(k * TAU / 3) * 0.9, 2.0, sin(k * TAU / 3) * 0.9), PMat.dark_metal(), false)
	Parts.cyl(body, 0.5, 0.3, Vector3(0, TOP + 0.1, 0), PMat.dark_metal(), Vector3.ZERO, 0.28, 16)
	_flame = PFlame.new().setup(6.0, 0.75); _flame.position = Vector3(0, TOP + 0.3, 0); body.add_child(_flame)
	_pilot = PFlame.new().setup(0.9, 0.1, false); _pilot.position = Vector3(0.5, TOP + 0.2, 0); body.add_child(_pilot)
	_pilot.set_flame(1.0, Color("#5AA8FF"), Color("#CFE6FF"), 0.9)
	add_port("in", Vector3(-1.9, 0.9, 0), Vector3.LEFT)
	Parts.pipe(body, Vector3(-1.9, 0.9, 0), Vector3(-0.4, 0.9, 0), 0.22, PMat.paint("process"), true)

func _apply() -> void:
	var h2 := clampf(dv("h2"), 0.0, 1.0); var f := dv("flow")
	var o := Color("#FF7A18").lerp(Color("#6FA8FF"), h2); var i := Color("#FFE08A").lerp(Color("#CFE6FF"), h2)
	_flame.set_flame(f, o, i, lerpf(1.0, 0.22, h2))
