class_name UMFeed
extends UnitModel
## Feed source: a two-tank farm and a pipeline header. A species colour band rings every tank; a level gauge (glass tube) shows the stock.
## display: level 0-1, color (species colour hex or Color).
var _bands: Array[StandardMaterial3D] = []
var _fills: Array[MeshInstance3D] = []
const TH := 4.2          # tank shell height
const GH := 3.2          # gauge height

func _build() -> void:
	tiles = Vector2i(4, 2); height = 5.6; beacon_pos = Vector3(-3.0, 5.3, 0)
	var tank := PMat.paint("tank")
	Parts.plinth(body, Vector3(7.6, 0.18, 3.8))
	for i in range(2):
		var x := -1.9 + i * 3.6
		Parts.cyl(body, 1.4, TH, Vector3(x, 0.18 + TH * 0.5, 0.0), tank, Vector3.ZERO, -1.0, 28)
		Parts.cyl(body, 0.1, 0.3, Vector3(x, 0.18 + TH + 0.6, 0.0), PMat.metal(), Vector3.ZERO, 1.0, 10)
		var roof := Parts.cyl(body, 0.12, 0.9, Vector3(x, 0.18 + TH + 0.45, 0.0), tank, Vector3.ZERO, 1.42, 28)
		roof.rotation_degrees.x = 0.0
		Parts.cyl(body, 1.46, 0.07, Vector3(x, 0.18 + TH * 0.5 + 1.0, 0.0), PMat.metal(), Vector3.ZERO, -1.0, 28)   # stiffening ring
		var bm := PMat.emissive(Color("#9fb4c8"), 0.8); _bands.append(bm)
		Parts.cyl(body, 1.435, 0.55, Vector3(x, 0.18 + TH * 0.62, 0.0), bm, Vector3.ZERO, -1.0, 28)
		# level gauge on the front (+z): frame, empty glass, fill
		var gx := x + 0.0; var gz := 1.5
		Parts.box(body, Vector3(0.34, GH + 0.2, 0.12), Vector3(gx, 0.18 + 0.2 + GH * 0.5, gz - 0.05), PMat.dark_metal(), false)
		Parts.box(body, Vector3(0.2, GH, 0.05), Vector3(gx, 0.18 + 0.2 + GH * 0.5, gz + 0.02), PMat.glass(Color("#9fb4c8")), false)
		var fm := PMat.emissive(Color("#9fb4c8"), 1.6)
		var f := Parts.box(body, Vector3(0.16, 1.0, 0.05), Vector3(gx, 0.4, gz + 0.03), fm, false); _fills.append(f)
		# manway + pipe to the header
		Parts.cyl(body, 0.32, 0.12, Vector3(x + 1.38, 0.18 + 1.0, 0.0), PMat.dark_metal(), Vector3(0, 0, 90), -1.0, 12)
		Parts.pipe(body, Vector3(x, 0.55, 1.35), Vector3(x, 0.55, 1.75), 0.14, PMat.metal())
	# header along the south edge, with a block valve and a ladder
	Parts.pipe(body, Vector3(-1.9, 0.55, 1.75), Vector3(3.6, 0.55, 1.75), 0.14, PMat.paint("process"), true)
	Parts.pipe(body, Vector3(1.7, 0.55, 1.75), Vector3(3.8, 0.55, 1.75), 0.14, PMat.paint("process"), true)
	Parts.handwheel(body, Vector3(2.7, 0.7, 1.75))
	Parts.ladder(body, Vector3(-0.15, 0.18, -1.45), TH, 0.5)
	add_port("out", Vector3(3.8, 0.55, 1.75), Vector3.RIGHT)

func _apply() -> void:
	var col := PMat.species(display.get("color", ""))
	var lv := clampf(dv("level", 0.7), 0.0, 1.0)
	for m in _bands: m.albedo_color = col; m.emission = col
	for f in _fills:
		var h := maxf(0.02, GH * lv); f.scale = Vector3(1.0, h, 1.0); f.position.y = 0.18 + 0.2 + h * 0.5
		(f.material_override as StandardMaterial3D).albedo_color = col; (f.material_override as StandardMaterial3D).emission = col
