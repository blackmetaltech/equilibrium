class_name UMRelief
extends UnitModel
## Relief valve: a flanged valve with a spring bonnet and a tailpipe. `pop(sec)` lifts the cap, shakes, flashes and blows a white jet.
## display lift 0-1 holds it open (jet size follows).
var _cap: Node3D
var _jet: PPlume
var _flash: OmniLight3D
var _pop_t := 0.0

func _build() -> void:
	tiles = Vector2i(1, 1); height = 3.4; beacon_pos = Vector3(0, 3.4, 0)
	var pm := PMat.paint("hot")
	Parts.plinth(body, Vector3(1.8, 0.1, 1.8))
	Parts.pipe(body, Vector3(0, 0.1, 0), Vector3(0, 0.8, 0), 0.2, PMat.metal(), true)
	Parts.sphere(body, 0.38, Vector3(0, 1.1, 0), pm, 0.9)
	Parts.cyl(body, 0.22, 1.0, Vector3(0, 1.8, 0), pm)
	Parts.cyl(body, 0.3, 0.12, Vector3(0, 2.3, 0), PMat.dark_metal())
	_cap = Node3D.new(); _cap.position = Vector3(0, 2.4, 0); body.add_child(_cap)
	Parts.sphere(_cap, 0.28, Vector3(0, 0.1, 0), PMat.red(), 0.8); Parts.cyl(_cap, 0.06, 0.4, Vector3(0, 0.45, 0), PMat.metal(), Vector3.ZERO, -1.0, 8, false)
	Parts.pipe(body, Vector3(0.28, 1.1, 0), Vector3(0.9, 1.1, 0), 0.16, PMat.metal(), true)
	Parts.pipe(body, Vector3(0.9, 1.1, 0), Vector3(0.9, 3.0, 0), 0.16, PMat.metal())
	_jet = PPlume.new().setup(Color(0.95, 0.96, 1.0), 7.0, 1.2, 0.5, 4.0, 40, 10.0, 0.0); _jet.position = Vector3(0.9, 3.05, 0); body.add_child(_jet)
	_flash = OmniLight3D.new(); _flash.position = Vector3(0.9, 3.3, 0); _flash.omni_range = 8.0; _flash.light_energy = 0.0; _flash.light_color = Color("#CFE6FF"); body.add_child(_flash)
	add_port("in", Vector3(0, 0.1, 0), Vector3.DOWN)

func pop(sec := 1.4) -> void:
	_pop_t = sec; _jet.burst(sec); shake(0.06)

func _apply() -> void:
	var l := dv("lift")
	if l > 0.02: _jet.set_level(l)
	elif _pop_t <= 0.0: _jet.set_level(0.0)

func _tick(dt: float) -> void:
	if _pop_t > 0.0:
		_pop_t -= dt; _cap.position.y = 2.4 + 0.12 + sin(_t * 70.0) * 0.03; _flash.light_energy = 4.0 * clampf(_pop_t, 0.0, 1.0)
	else:
		_cap.position.y = lerpf(_cap.position.y, 2.4 + 0.12 * dv("lift"), 0.3); _flash.light_energy = 0.0
