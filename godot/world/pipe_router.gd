class_name PipeRouter
extends RefCounted
## Orthogonal pipe auto-router: A* over (tile, heading) states on the 2 m build grid. Cost = 1 per tile, BEND_COST per turn, a rack-lane
## discount on the lane rows (every 4th row runs between unit rows), CROSS_COST for crossing a pipe at right angles and PARALLEL_COST for
## running on top of another pipe (so parallel pipes spread over neighbouring tiles). Unit footprints are walls. Pure data in, tiles out.
## Jobs are routed shortest-first and each routed pipe loads the usage map for the next one.
const BEND_COST := 3.0
const CROSS_COST := 4.0
const PARALLEL_COST := 9.0
const LANE_COST := 0.75
const LANE_EVERY := 4
const SKIRT_COST := 5.0     ## stepping onto the ring of tiles around a unit: allowed (ports sit there) but a pipe prefers to keep a tile clear of every model
const DIRS: Array[Vector2i] = [Vector2i(1, 0), Vector2i(0, 1), Vector2i(-1, 0), Vector2i(0, -1)]
var nx := 24
var nz := 16
var blocked := {}        # Vector2i -> true
var skirt := {}           # Vector2i -> true: the 1-tile ring around every blocked footprint (a soft wall, see SKIRT_COST)
var usage := {}          # Vector2i -> bit 1 (runs along x) | bit 2 (runs along z)
var last_expanded := 0
var _heap_k := PackedFloat32Array()
var _heap_v := PackedInt32Array()

func _init(w := 24, h := 16) -> void: nx = w; nz = h

func clear() -> void: blocked.clear(); skirt.clear(); usage.clear()

func block_rect(x: int, y: int, w: int, h: int) -> void:
	for i in range(w):
		for j in range(h): blocked[Vector2i(x + i, y + j)] = true
	for i in range(-1, w + 1):
		for j in range(-1, h + 1):
			if i >= 0 and i < w and j >= 0 and j < h: continue
			skirt[Vector2i(x + i, y + j)] = true

## The nearest free tile to `t` (breadth-first over the 4-neighbourhood); `t` itself when it is free, (-1,-1) when the grid is full.
func nearest_free(t: Vector2i) -> Vector2i:
	if not blocked.has(t): return t
	var seen := {t: true}; var q: Array[Vector2i] = [t]; var head := 0
	while head < q.size():
		var c := q[head]; head += 1
		for d in DIRS:
			var n := c + d
			if n.x < 0 or n.y < 0 or n.x >= nx or n.y >= nz or seen.has(n): continue
			if not blocked.has(n): return n
			seen[n] = true; q.append(n)
	return Vector2i(-1, -1)

static func dir_of(v: Vector3) -> int:   ## heading index (0 +x, 1 +z, 2 -x, 3 -z) closest to a world vector
	if absf(v.x) >= absf(v.z): return 0 if v.x >= 0.0 else 2
	return 1 if v.z >= 0.0 else 3

func _push(k: float, v: int) -> void:
	_heap_k.append(k); _heap_v.append(v)
	var i := _heap_k.size() - 1
	while i > 0:
		var p := (i - 1) >> 1
		if _heap_k[p] <= _heap_k[i]: break
		var tk := _heap_k[p]; _heap_k[p] = _heap_k[i]; _heap_k[i] = tk
		var tv := _heap_v[p]; _heap_v[p] = _heap_v[i]; _heap_v[i] = tv
		i = p

func _pop() -> int:
	var top := _heap_v[0]
	var n := _heap_k.size() - 1
	_heap_k[0] = _heap_k[n]; _heap_v[0] = _heap_v[n]; _heap_k.resize(n); _heap_v.resize(n)
	var i := 0
	while true:
		var l := 2 * i + 1; var r := l + 1; var m := i
		if l < n and _heap_k[l] < _heap_k[m]: m = l
		if r < n and _heap_k[r] < _heap_k[m]: m = r
		if m == i: break
		var tk := _heap_k[m]; _heap_k[m] = _heap_k[i]; _heap_k[i] = tk
		var tv := _heap_v[m]; _heap_v[m] = _heap_v[i]; _heap_v[i] = tv
		i = m
	return top

func _step_cost(t: Vector2i, d: int) -> float:
	var c := LANE_COST if (d % 2 == 0 and t.y % LANE_EVERY == LANE_EVERY - 1) or (d % 2 == 1 and t.x % LANE_EVERY == LANE_EVERY - 1) else 1.0
	if skirt.has(t): c += SKIRT_COST
	var u: int = usage.get(t, 0)
	if u != 0:
		var bit := 1 if d % 2 == 0 else 2
		c += PARALLEL_COST if (u & bit) != 0 else CROSS_COST
	return c

## Route from tile `a` leaving with heading `ad` to tile `b` arriving with heading `bd` (the direction of travel into the inlet).
## Returns the corner tiles (first = a, last = b), or [] when no route exists. The path is added to the usage map.
func route(a: Vector2i, ad: int, b: Vector2i, bd: int) -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	# a port stub that lands inside a footprint (a model bigger than its tiles) starts from the nearest free tile instead of giving up
	if blocked.has(a): a = nearest_free(a)
	if blocked.has(b): b = nearest_free(b)
	if a.x < 0 or b.x < 0: return out
	if a == b: out.append(a); return out
	var W := nx; var H := nz
	var n := W * H * 4
	var g := PackedFloat32Array(); g.resize(n); g.fill(INF)
	var from := PackedInt32Array(); from.resize(n); from.fill(-1)
	_heap_k.clear(); _heap_v.clear()
	var s := ((a.y * W) + a.x) * 4 + ad
	g[s] = 0.0; _push(float(absi(a.x - b.x) + absi(a.y - b.y)), s)
	var goal := -1; var done := PackedByteArray(); done.resize(n); last_expanded = 0
	while _heap_k.size() > 0:
		var cur := _pop()
		if done[cur] == 1: continue
		done[cur] = 1; last_expanded += 1
		var d := cur & 3; var cell := cur >> 2; var cx := cell % W; var cy := cell / W
		if cx == b.x and cy == b.y and d == bd: goal = cur; break
		for nd in [d, (d + 1) & 3, (d + 3) & 3]:
			var v: Vector2i = DIRS[nd]; var tx := cx + v.x; var ty := cy + v.y
			if cx == b.x and cy == b.y: tx = cx; ty = cy   # at the goal tile only a turn is allowed
			if tx < 0 or ty < 0 or tx >= W or ty >= H: continue
			var t := Vector2i(tx, ty)
			if blocked.has(t): continue
			var cost := g[cur]
			if tx == cx and ty == cy:
				if nd == d: continue
				cost += BEND_COST
			else:
				cost += _step_cost(t, nd) + (BEND_COST if nd != d else 0.0)
			var ni: int = (ty * W + tx) * 4 + nd
			if cost < g[ni]:
				g[ni] = cost; from[ni] = cur
				_push(cost + float(absi(tx - b.x) + absi(ty - b.y)), ni)
	if goal < 0: return out
	var tiles: Array[Vector2i] = []; var i := goal
	while i >= 0:
		var cl := i >> 2; tiles.append(Vector2i(cl % W, cl / W)); i = from[i]
	tiles.reverse()
	# collapse repeats and straight runs to corners; record usage on every tile of every run
	var clean: Array[Vector2i] = []
	for t in tiles: if clean.is_empty() or clean[-1] != t: clean.append(t)
	for k in range(clean.size() - 1):
		var p := clean[k]; var q := clean[k + 1]; var bit := 1 if p.y == q.y else 2
		var st := Vector2i(signi(q.x - p.x), signi(q.y - p.y)); var c := p
		while true:
			usage[c] = int(usage.get(c, 0)) | bit
			if c == q: break
			c += st
	for k in range(clean.size()):
		if k == 0 or k == clean.size() - 1 or (clean[k] - clean[k - 1]).sign() != (clean[k + 1] - clean[k]).sign(): out.append(clean[k])
	return out

## Route every job {id, a, ad, b, bd}; returns {id: corner tiles}. Shortest Manhattan distance first (stable by id).
func route_all(jobs: Array) -> Dictionary:
	usage.clear()
	var order := jobs.duplicate()
	order.sort_custom(func(p, q):
		var dp: int = absi(p.a.x - p.b.x) + absi(p.a.y - p.b.y); var dq: int = absi(q.a.x - q.b.x) + absi(q.a.y - q.b.y)
		return dp < dq or (dp == dq and str(p.id) < str(q.id)))
	var res := {}
	for j in order: res[j.id] = route(j.a, j.ad, j.b, j.bd)
	return res
