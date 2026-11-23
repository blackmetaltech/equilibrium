class_name EqVerb
extends RefCounted
## "Tap" is a touch word. The same line says "click" under a mouse, "tap" on a touch screen and "press A" with a pad, by the device the player used last.
## The pad case is the core's own flag (CbKit.pad_mode: on at the first pad input, off at the next mouse or key); touch vs mouse is noted here from the input events
## (main.gd `_input` calls `note`). Text is written once with "tap"; `adapt` turns it into the device's word where it is shown.
static var _touch := CbLayout.is_mobile()   ## the last pointer input was a touch (a mouse event made by the touch itself does not count as a mouse)
static var forced := ""      ## tests: "mouse" | "touch" | "pad"

static func note(e: InputEvent) -> void:
	if e is InputEventScreenTouch or e is InputEventScreenDrag: _touch = true
	elif (e is InputEventMouseButton or e is InputEventMouseMotion) and e.device != InputEvent.DEVICE_ID_EMULATION: _touch = false

## "mouse", "touch" or "pad".
static func device() -> String:
	if forced != "": return forced
	if CbKit.pad_mode: return "pad"
	return "touch" if _touch else "mouse"

## "tap to enter" -> "click to enter" / "tap to enter" / "press A to enter"; "Tap the converter" -> "Click the converter" / "Press A on the converter".
static func adapt(text: String) -> String:
	if not text.to_lower().contains("tap"): return text
	var d := device()
	if d == "touch": return text
	var re := RegEx.new(); re.compile("\\b([Tt])ap\\b( to\\b)?")
	var out := text; var ms := re.search_all(text); ms.reverse()
	for m in ms:
		var cap := m.get_string(1) == "T"; var to := m.get_string(2) != ""
		var w := "click" if d == "mouse" else "press A"
		if d == "pad" and not to: w += " on"
		if to: w += " to"
		if cap: w = w.left(1).to_upper() + w.substr(1)
		out = out.substr(0, m.get_start()) + w + out.substr(m.get_end())
	return out
