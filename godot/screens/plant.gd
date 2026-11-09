extends CbScreen
## The plant drawer (placeholder for M0.2): the phase of the plant, the works it stands in and what is on the plot. The Plant
## screen proper (build palette, inspect, data drawers) arrives with the design actions in M1/M2. All text is tr() or region data.

func _works() -> String:
	var strings: Dictionary = CbRegion.info.get("strings", {})
	return str(strings.get("works.name", ""))   # the pack's string key, filled by the region pack (never typed here)

func build(b: VBoxContainer) -> void:
	var q = app.b.q("plant")
	if not (q is Dictionary): q = {}
	CbKit.header(b, tr("PLANT_TITLE"), tr("PLANT_HINT"))
	var pw := CbKit.panel(tr("PLANT_STATUS"), true, b); var v: VBoxContainer = pw[1]
	v.add_child(CbKit.kv(tr("PLANT_WORKS"), _works()))
	v.add_child(CbKit.kv(tr("PLANT_PHASE"), tr("PHASE_" + str(q.get("phase", "design")).to_upper()), CbKit.ACC))
	v.add_child(CbKit.kv(tr("PLANT_UNITS"), str((q.get("units", []) as Array).size())))
	v.add_child(CbKit.kv(tr("PLANT_PIPES"), str((q.get("streams", []) as Array).size())))
	v.add_child(CbKit.kv(tr("PLANT_SPECIES"), str((q.get("species", []) as Array).size())))
	b.add_child(CbKit.tip(tr("PLANT_EMPTY")))
	b.add_child(CbKit.label(tr("PLANT_VIEW_HINT"), 14, CbKit.DIM, true))
