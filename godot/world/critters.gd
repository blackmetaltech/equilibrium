class_name Critters
extends Node3D
## Cute mode (design/equilibrium/UI.md "Cute mode"): molecule critters that walk along the top of every live pipe. The charm carries
## the physics: the number of critters on a pipe is proportional to its MOLAR flow (same scale for every pipe of the plant), the share
## of each species follows its mole fraction (largest remainder), size follows molar mass^(1/3), pace follows the flow. So 30 kg/h of
## H2 visibly carries three times the critters of 140 kg/h of N2 (L01's lesson). Critters heading into a vent or flare look lost.
## Cute OFF keeps the same counted balls without faces. Display only: no physics is computed here.

const NMAX := 16            ## critters on the plant's biggest stream
const TEX := 64
## Molar masses (g/mol) for the critter SIZE only (cosmetic scaling; the engine owns every physical number shown as text).
const MOLAR := {"H2": 2.0, "N2": 28.0, "NH3": 17.0, "O2": 32.0, "Ar": 40.0, "H2O": 18.0, "CO2": 44.0, "CO": 28.0, "CH4": 16.0,
	"C3H8": 44.1, "SO2": 64.1, "SO3": 80.1, "S": 32.1, "NO": 30.0, "NO2": 46.0, "CH3OH": 32.0, "C2H5OH": 46.1, "H2SO4": 98.1, "Cl2": 70.9}
## Body plans in a 64 px box: [dx, dy, r, tint] per atom; atom 0 carries the face. tint: 0 = species colour, 1 = lighter, 2 = white-ish.
const PLANS := {
	"H2": [[-9, 0, 13, 0], [9, 0, 13, 0]],
	"N2": [[-10, 0, 17, 0], [10, 0, 17, 0]],
	"O2": [[-10, 0, 17, 0], [10, 0, 17, 0]],
	"Cl2": [[-10, 0, 17, 0], [10, 0, 17, 0]],
	"NH3": [[0, -4, 20, 0], [-16, 15, 8, 2], [0, 20, 8, 2], [16, 15, 8, 2]],
	"H2O": [[0, 2, 20, 0], [-17, -12, 9, 2], [17, -12, 9, 2]],
	"CO2": [[0, 0, 14, 0], [-19, 0, 11, 1], [19, 0, 11, 1]],
	"SO2": [[0, 2, 20, 0], [-19, -10, 11, 1], [19, -10, 11, 1]],
	"SO3": [[0, 2, 18, 0], [-19, -10, 10, 1], [19, -10, 10, 1], [0, 21, 10, 1]],
	"CH4": [[0, 0, 19, 0], [-17, -14, 8, 2], [17, -14, 8, 2], [-17, 14, 8, 2], [17, 14, 8, 2]],
	"C3H8": [[0, 0, 14, 0], [-18, 3, 11, 0], [18, 3, 11, 0]],
	"CO": [[-8, 0, 17, 0], [12, 0, 13, 1]],
	"NO": [[-8, 0, 17, 0], [12, 0, 13, 1]],
	"NO2": [[0, 2, 19, 0], [-18, -11, 11, 1], [18, -11, 11, 1]],
}

var cute := true
var _tex := {}              # "sp|mood|cute" -> ImageTexture
var _pipes := {}            # pipe id -> {pts, len, crit:[{sp, t, node}], speed, lost}
var _species: Array = []
var _sig := ""

## pipe_layer: the PipeLayer (polylines via its items); streams/species from the snapshot; sinks: pipe ids that end in a vent or flare.
func update(pipe_layer: PipeLayer, streams: Array, species: Array, lost_pipes: Dictionary) -> void:
	_species = species
	var maxf_ := 0.0
	for s in streams: maxf_ = maxf(maxf_, float(s.get("flow", 0.0)))
	var seen := {}
	for s in streams:
		var id := str(s.get("id", ""))
		if not pipe_layer.has_pipe(id): continue
		var flow := float(s.get("flow", 0.0))
		if flow <= 0.0 or maxf_ <= 0.0: continue
		seen[id] = true
		var n := maxi(1, int(round(NMAX * flow / maxf_)))
		var wanted := _alloc(n, s.get("w", []))
		var pts: Array = pipe_layer._items[id].get("pts_r", pipe_layer._items[id].pts)
		var rad := float(pipe_layer._items[id].get("rad", 0.15))
		_sync_pipe(id, pts, rad, wanted, clampf(0.35 + 0.35 * log(1.0 + flow * 10.0) / log(10.0), 0.3, 1.6), lost_pipes.has(id))
	for id in _pipes.keys():
		if not seen.has(id): _drop(id)

## Largest-remainder split of n critters over the stream's (top-3) mole fractions; returns species ids in an interleaved order.
func _alloc(n: int, w: Array) -> Array:
	var tot := 0.0
	for e in w: tot += float(e[1])
	if tot <= 0.0: return []
	var counts := []; var rem := []; var used := 0
	for e in w:
		var exact := n * float(e[1]) / tot
		counts.append(int(floor(exact))); rem.append(exact - floor(exact)); used += int(floor(exact))
	while used < n:
		var bi := 0
		for i in range(rem.size()):
			if rem[i] > rem[bi]: bi = i
		counts[bi] += 1; rem[bi] = -1.0; used += 1
	var out := []; var left: Array = counts.duplicate()
	while out.size() < n:   # interleave so species mix along the pipe
		for i in range(w.size()):
			if left[i] > 0:
				var ci := int(w[i][0])
				out.append(str(_species[ci]) if ci < _species.size() else "?"); left[i] -= 1
	return out

func _sync_pipe(id: String, pts: Array, rad: float, wanted: Array, speed: float, lost: bool) -> void:
	var p: Dictionary = _pipes.get(id, {})
	var key := "%s|%s|%s|%s" % [str(wanted), str(pts.size()), str(lost), str(cute)]
	if not p.is_empty() and p.key == key:
		p.speed = speed; return
	if not p.is_empty(): _drop(id)
	var cum := [0.0]
	for i in range(1, pts.size()): cum.append(float(cum[i - 1]) + (pts[i] as Vector3).distance_to(pts[i - 1]))
	var length := float(cum[cum.size() - 1])
	var crit := []
	for k in range(wanted.size()):
		var sp: String = wanted[k]
		var sc := pow(float(MOLAR.get(sp, 28.0)) / 28.0, 1.0 / 3.0)
		var spr := Sprite3D.new()
		spr.texture = _texture(sp, "lost" if lost else "happy")
		spr.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		spr.shaded = false; spr.no_depth_test = false; spr.alpha_cut = SpriteBase3D.ALPHA_CUT_DISCARD
		spr.pixel_size = 0.024 * sc
		add_child(spr)
		crit.append({"sp": sp, "t": float(k) / wanted.size(), "node": spr, "lift": rad + TEX * 0.5 * spr.pixel_size * 0.8, "ph": float(k) * 1.7})
	_pipes[id] = {"key": key, "pts": pts, "cum": cum, "len": maxf(length, 0.01), "crit": crit, "speed": speed, "lost": lost}
	_place(_pipes[id], 0.0)

func _drop(id: String) -> void:
	for c in _pipes[id].crit: (c.node as Node).queue_free()
	_pipes.erase(id)

func clear() -> void:
	for id in _pipes.keys(): _drop(id)

func set_cute(on: bool) -> void:
	if on == cute: return
	cute = on
	for id in _pipes:
		for c in _pipes[id].crit: (c.node as Sprite3D).texture = _texture(c.sp, "lost" if _pipes[id].lost else "happy")

func _process(dt: float) -> void:
	for id in _pipes: _place(_pipes[id], dt)
	for id in _rx: _rx_step(_rx[id], dt)

func _place(p: Dictionary, dt: float) -> void:
	var L: float = p.len; var pts: Array = p.pts; var cum: Array = p.cum
	var now := Time.get_ticks_msec() * 0.001
	for c in p.crit:
		c.t = fmod(float(c.t) + dt * float(p.speed) / L, 1.0)
		var d := float(c.t) * L
		var i := 1
		while i < cum.size() - 1 and float(cum[i]) < d: i += 1
		var a: Vector3 = pts[i - 1]; var b: Vector3 = pts[i]
		var seg := maxf(float(cum[i]) - float(cum[i - 1]), 0.0001)
		var pos := a.lerp(b, clampf((d - float(cum[i - 1])) / seg, 0.0, 1.0))
		var hop := absf(sin(now * 7.0 * float(p.speed) + float(c.ph))) * 0.12 if cute else 0.0
		(c.node as Sprite3D).position = pos + Vector3(0, float(c.lift) + hop, 0)

# ---------------------------------------------------------------- textures
func _texture(sp: String, mood: String) -> ImageTexture:
	var k := "%s|%s|%s" % [sp, mood, cute]
	if _tex.has(k): return _tex[k]
	var t := ImageTexture.create_from_image(paint(sp, mood, cute))
	_tex[k] = t
	return t

static func paint(sp: String, mood: String, with_face: bool) -> Image:
	var img := Image.create(TEX, TEX, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	var base: Color = EqTheme.species(sp)
	var plan: Array = PLANS.get(sp, [[0, 0, 20, 0]])
	var c0 := Vector2(TEX * 0.5, TEX * 0.5)
	# draw from the last atom to the first so atom 0 (the face) sits on top
	for ai in range(plan.size() - 1, -1, -1):
		var a: Array = plan[ai]
		var ctr := c0 + Vector2(float(a[0]), float(a[1])); var r := float(a[2])
		var col: Color = base if int(a[3]) == 0 else (base.lerp(Color.WHITE, 0.45) if int(a[3]) == 1 else Color("#F4F7FB"))
		var edge := base.darkened(0.55)
		for y in range(maxi(0, int(ctr.y - r - 2)), mini(TEX, int(ctr.y + r + 3))):
			for x in range(maxi(0, int(ctr.x - r - 2)), mini(TEX, int(ctr.x + r + 3))):
				var d := Vector2(x + 0.5, y + 0.5).distance_to(ctr)
				if d > r + 1.5: continue
				if d > r - 1.0:
					img.set_pixel(x, y, edge)
				else:
					var lt := clampf(1.0 - (Vector2(x + 0.5, y + 0.5) - (ctr + Vector2(-r * 0.35, -r * 0.4))).length() / (r * 1.6), 0.0, 1.0)
					img.set_pixel(x, y, col.darkened(0.18).lerp(col.lightened(0.25), lt))
	if not with_face: return img
	if plan.size() == 2 and sp in ["H2", "N2", "O2", "Cl2"]:   # twins holding hands: a small face on each
		for a in plan: _face(img, sp, mood, c0 + Vector2(float(a[0]), float(a[1])), float(a[2]) * 0.9)
	else:
		var f: Array = plan[0]
		_face(img, sp, mood, c0 + Vector2(float(f[0]), float(f[1])), float(f[2]))
	return img

static func _face(img: Image, sp: String, mood: String, fc: Vector2, fr: float) -> void:
	var eye_dx := fr * 0.36; var eye_y := fc.y - fr * 0.1
	var ink := Color("#1B1F24")
	if sp == "Ar":   # inert: sunglasses, does nothing
		for x in range(int(fc.x - fr * 0.72), int(fc.x + fr * 0.72)):
			for y in range(int(eye_y - fr * 0.14), int(eye_y + fr * 0.16)): _px(img, x, y, ink)
	else:
		for s in [-1, 1]:
			_disc(img, Vector2(fc.x + s * eye_dx, eye_y), maxf(1.6, fr * 0.13), ink)
			if fr > 12: _disc(img, Vector2(fc.x + s * eye_dx - 0.7, eye_y - 0.9), 0.8, Color.WHITE)
	var my := fc.y + fr * 0.3
	if mood == "lost":   # worried: wobbly mouth, brows raised toward the middle
		for x in range(int(fc.x - fr * 0.22), int(fc.x + fr * 0.22) + 1):
			_px(img, x, int(round(my + sin(x * 1.3) * 1.0)), ink)
		for s in [-1, 1]:
			var bx: float = fc.x + s * eye_dx; var by: float = eye_y - fr * 0.32
			for k in range(-3, 4):
				_px(img, int(bx + k), int(round(by + s * k * 0.45)), ink)
	elif sp == "SO2":   # the grump
		for x in range(int(fc.x - fr * 0.25), int(fc.x + fr * 0.25) + 1): _px(img, x, int(my), ink)
	else:
		var mr := maxf(fr * 0.3, 2.5)
		for x in range(int(fc.x - mr), int(fc.x + mr) + 1):
			var dx := (x - fc.x) / mr
			_px(img, x, int(my + (1.0 - dx * dx) * mr * 0.45), ink)
			if fr > 12: _px(img, x, int(my + (1.0 - dx * dx) * mr * 0.45) + 1, ink)
		for s in [-1, 1]:   # cheeks
			_disc(img, Vector2(fc.x + s * fr * 0.58, my - 1), fr * 0.12, Color(1.0, 0.55, 0.6, 0.55))

static func _px(img: Image, x: int, y: int, c: Color) -> void:
	if x >= 0 and y >= 0 and x < img.get_width() and y < img.get_height():
		if c.a < 1.0: img.set_pixel(x, y, img.get_pixel(x, y).blend(c))
		else: img.set_pixel(x, y, c)

static func _disc(img: Image, ctr: Vector2, r: float, c: Color) -> void:
	for y in range(int(ctr.y - r - 1), int(ctr.y + r + 2)):
		for x in range(int(ctr.x - r - 1), int(ctr.x + r + 2)):
			if Vector2(x + 0.5, y + 0.5).distance_to(ctr) <= r: _px(img, x, y, c)

# ---------------------------------------------------------------- reactions (Cute mode): reactants hug, products pop out
## Balanced equations for the reaction animation (display; the engine computes every number). product -> [[reactant, coeff]...], product coeff.
const EQUATIONS := {
	"NH3": [[["N2", 1], ["H2", 3]], 2],
	"SO2": [[["S", 1], ["O2", 1]], 1],
	"SO3": [[["SO2", 2], ["O2", 1]], 2],
	"CO2": [[["CH4", 1], ["O2", 2]], 1],
	"H2O": [[["H2", 2], ["O2", 1]], 2],
	"CH3OH": [[["CO", 1], ["H2", 2]], 1],
}
const REACTORS := ["stoich_reactor", "eq_reactor", "eq_bed", "packed_bed", "multibed", "cstr", "burner", "gasifier", "co_burner"]
var _rx := {}          # unit id -> {pos, product, t, actors:[{node, from, to}], phase}

## Called by the world after critters.update: finds reactors whose outlet carries a known product and animates its equation there.
func update_reactors(world, streams: Array, species: Array) -> void:
	if not cute:
		for id in _rx.keys(): _rx_clear(id)
		return
	var by := {}
	for s in streams: by[str(s.get("id", ""))] = s
	var seen := {}
	for uid in world.unit_ids():
		var st: Array = world._unit_state.get(uid, [])
		if st.is_empty() or not (str(st[0]) in REACTORS): continue
		var product := ""
		for pid in world.pipes.pipe_ids():
			var ends: Array = world.pipes.endpoints(pid)
			if ends.size() < 2 or not (ends[0] is Dictionary) or str(ends[0].get("unit", "")) != uid: continue
			var s = by.get(pid)
			if s == null: continue
			for e in s.get("w", []):
				var sp := str(species[int(e[0])]) if int(e[0]) < species.size() else ""
				if EQUATIONS.has(sp): product = sp; break
			if product != "": break
		if product == "": continue
		seen[uid] = true
		var pos: Vector3 = world.anchor_world(uid) + Vector3(0, 1.4, 0)
		if not _rx.has(uid) or _rx[uid].product != product:
			if _rx.has(uid): _rx_clear(uid)
			_rx[uid] = {"pos": pos, "product": product, "t": 0.0, "actors": []}
		else:
			_rx[uid].pos = pos
	for id in _rx.keys():
		if not seen.has(id): _rx_clear(id)

func _rx_clear(id: String) -> void:
	for a in _rx[id].actors: (a.node as Node).queue_free()
	_rx.erase(id)

func _rx_sprite(sp: String) -> Sprite3D:
	var spr := Sprite3D.new(); spr.texture = _texture(sp, "happy")
	spr.billboard = BaseMaterial3D.BILLBOARD_ENABLED; spr.shaded = false; spr.alpha_cut = SpriteBase3D.ALPHA_CUT_DISCARD
	spr.pixel_size = 0.024 * pow(float(MOLAR.get(sp, 28.0)) / 28.0, 1.0 / 3.0)
	add_child(spr)
	return spr

## A 2.4 s cycle: reactants fly in from a ring (0-0.9 s), squeeze (0.9-1.2 s), products pop out and drift up (1.2-2.4 s).
func _rx_step(r: Dictionary, dt: float) -> void:
	var T := 2.4
	r.t = float(r.t) + dt
	if float(r.t) >= T or r.actors.is_empty():
		for a in r.actors: (a.node as Node).queue_free()
		r.actors = []; r.t = 0.0
		var eq: Array = EQUATIONS[r.product]
		var reac: Array = eq[0]; var n := 0
		for pair in reac: n += int(pair[1])
		var k := 0
		for pair in reac:
			for j in range(int(pair[1])):
				var ang := TAU * k / n; k += 1
				r.actors.append({"node": _rx_sprite(str(pair[0])), "from": Vector3(cos(ang), 0.2 * sin(ang * 2.0), sin(ang)) * 2.2, "kind": "in"})
		for j in range(int(eq[1])):
			var ang2 := TAU * j / float(eq[1]) + 0.6
			r.actors.append({"node": _rx_sprite(str(r.product)), "from": Vector3.ZERO, "to": Vector3(cos(ang2) * 1.6, 1.4, sin(ang2) * 1.6), "kind": "out"})
	var t := float(r.t)
	for a in r.actors:
		var spr: Sprite3D = a.node
		if a.kind == "in":
			var u := clampf(t / 0.9, 0.0, 1.0); u = u * u * (3.0 - 2.0 * u)
			spr.position = r.pos + (a.from as Vector3) * (1.0 - u)
			spr.visible = t < 1.2
			spr.scale = Vector3.ONE * (1.0 - 0.35 * clampf((t - 0.9) / 0.3, 0.0, 1.0))
		else:
			var v := clampf((t - 1.2) / 1.2, 0.0, 1.0)
			spr.visible = t >= 1.2
			spr.position = r.pos + (a.to as Vector3) * (1.0 - (1.0 - v) * (1.0 - v))
			spr.scale = Vector3.ONE * (0.4 + 0.6 * clampf(v * 3.0, 0.0, 1.0))
