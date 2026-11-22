class_name Tag3D
extends RefCounted
## F32 (0.9 readability): every name tag, nozzle cap and species tag standing on the plant (a Label3D with fixed_size, so its pixel_size is a fraction of HALF the
## window height) is at least MIN_PX on screen at any window size, and wears a heavy, opaque dark outline (the plate) so it reads against the grey deck, the
## beige pad and the sea. `setup` registers the label; PlantWorld calls `refit` every frame (a window resize or a Settings > text size change needs no rebuild).
const MIN_PX := 17.0          ## em size on screen; the 16 px floor with a pixel of margin
const OUTLINE := Color(0.04, 0.06, 0.07, 1.0)
const GROUP := "eq_tag3d"

## On-screen em size of a fixed-size label in the window `vp` (window pixels: the 3D view is not scaled by the UI scale).
static func window_h(vp: Viewport) -> float:
	return vp.get_visible_rect().size.y * vp.get_final_transform().get_scale().y

static func screen_px(lb: Label3D, vp: Viewport) -> float:
	return float(lb.font_size) * lb.pixel_size * window_h(vp) * 0.5

## Register a label made by the caller (its font_size and pixel_size are the design size, used when the window is big enough); heavier outline = the plate.
static func setup(lb: Label3D) -> Label3D:
	lb.set_meta("ps0", lb.pixel_size)
	lb.outline_size = maxi(lb.outline_size, 14)
	lb.outline_modulate = OUTLINE
	lb.add_to_group(GROUP)
	return lb

static func refit(tree: SceneTree, vp: Viewport) -> void:
	var h := window_h(vp)
	if h < 1.0: return
	for n in tree.get_nodes_in_group(GROUP):
		var lb := n as Label3D
		if lb == null or not lb.has_meta("ps0"): continue
		var want := maxf(float(lb.get_meta("ps0")), MIN_PX / (float(lb.font_size) * h * 0.5))
		if absf(lb.pixel_size - want) > 1e-6: lb.pixel_size = want
