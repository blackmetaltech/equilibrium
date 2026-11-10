class_name PaperStrings
extends RefCounted
## Player-facing text of the paper layer (parts rack, faceplates, tags, notebook, printout) and a few shared helpers. One dict, keys UPPER_SNAKE.
## Numbers never live here: they come from the engine (unitCard, stream, levelInfo, resultCard).
const S := {
	"RACK_TITLE": "PARTS", "RACK_LOCKED": "Not on this job", "RACK_LIMIT": "All %d placed", "RACK_PRICE": "$%s",
	"FP_WHY": "Why?", "FP_LENS": "Lens", "FP_WINDOW": "Window", "FP_PIN": "Pin", "FP_UNPIN": "Unpin", "FP_CLOSE": "Close",
	"FP_PV": "PV", "FP_SP": "SP", "FP_NOSOLVE": "Commission to read the meters", "FP_FLOW": "FLOW", "FP_MASS": "MASS", "FP_DUTY": "DUTY", "FP_WORK": "SHAFT",
	"FP_OUT": "OUT", "FP_KMOLH": "kmol/h", "FP_KGH": "kg/h", "FP_FAILED": "FAILED",
	"PIPE_FROM": "Pipe from %s: pick a lit inlet", "PIPE_NONE": "No free inlet fits %s %s", "PIPE_DONE": "Piped %s to %s",
	"TAG_FLOW": "FLOW", "TAG_T": "T", "TAG_P": "P", "TAG_NODATA": "No flow yet: commission the plant", "TAG_KMOL": "kmol/h", "TAG_KG": "kg/h",
	"NB_TAB": "NOTEBOOK", "NB_GOALS": "GOALS", "NB_BUDGET": "Budget", "NB_SPENT": "spent", "NB_STARS": "FLASKS", "NB_CALLIT": "CALL IT", "NB_START": "Start work", "NB_RESUME": "Back to work",
	"NB_MODE": "MODE", "NB_LEARNER": "Learner", "NB_ENGINEER": "Engineer", "NB_ANSWER": "answer", "NB_LOCKED": "locked in", "NB_TAP": "tap to enter",
	"PR_HEAD": "KESTREL BAY WORKS", "PR_RUN": "RUN %03d", "PR_PASS": "PASS", "PR_FAIL": "FAIL", "PR_ABORT": "*** RUN ABORTED ***", "PR_DONE": "*** RUN COMPLETE ***",
	"PR_YOU": "◄ YOU", "PR_CALLIT": "CALL IT", "PR_MARA": "MARA", "PR_RETRY": "Retry", "PR_NEXT": "Next job", "PR_COPY": "Copy design code", "PR_COPIED": "Design code copied",
	"PR_METRICS": "METRICS", "PR_HIST": "WORKS RUNS", "PR_CAUSE": "CAUSE", "PR_LESSON": "NOTE", "PR_STARS": "FLASKS", "PR_WENT": "SHEET %d",
	"KEYPAD_OK": "Enter", "KEYPAD_CLEAR": "Clear", "KEYPAD_RANGE": "%s to %s",
}
## One solved stream (flow mol/s, mass kg/s, T K, P Pa, top-3) from `streamTable`, or {} when the plant is not solved.
static func stream_row(app, id: String) -> Dictionary:
	var t = q(app, "streamTable", [{"ids": [id]}])
	if t is Dictionary and bool(t.get("ok", false)):
		for r in t.rows: if str(r.id) == id: return r
	return {}

## Dymo-tape names for the rack (short, caps on tape only); an unknown type falls back to the engine's label, or its id.
const SHORT := {"feed": "FEED BANK", "mixer": "MIXER", "mixer3": "MIXER 3", "mixer4": "MIXER 4", "splitter": "SPLITTER", "purge": "PURGE", "heater": "HEATER", "cooler": "COOLER", "hx": "EXCHANGER",
	"compressor": "COMPRESSOR", "valve": "VALVE", "flash": "FLASH DRUM", "nh3_sep": "NH3 SEP", "boiler": "BOILER", "absorber": "ABSORBER", "stack": "STACK", "relief": "RELIEF", "flare": "FLARE",
	"interlock": "INTERLOCK", "sink": "SINK", "product": "TANK", "vent": "VENT", "eq_reactor": "EQ REACTOR", "eq_bed": "EQ BED", "packed_bed": "PACKED BED", "multibed": "MULTIBED", "cstr": "CSTR",
	"stoich_reactor": "REACTOR", "burner": "BURNER", "gasifier": "GASIFIER", "co_burner": "CO BURNER", "lab_flask": "FLASK", "batch": "BATCH"}
static func short(type: String, label: String) -> String:
	if SHORT.has(type): return SHORT[type]
	return type.replace("_", " ").to_upper() if label.begins_with("label.") else label.to_upper()

static var _missing := {}
static func t(k: String) -> String: return S.get(k, k)

## Engine query that never returns null (a missing query or a failed one gives {}).
static func q(app, name: String, args: Array = []) -> Variant:
	if app == null or app.b == null: return {}
	var known: Array = app.b.init_data.get("queries", []) if app.b.init_data is Dictionary else []
	if not known.is_empty() and not known.has(name): return {}   # an engine without the level contract: use stubs
	var r = app.b.q(name, args)   # null outside a level (title, sandbox) is normal; ask again next time
	return r if r != null else {}

## Unit symbol for display: the shell's catalogue symbol when it has one, else the engine's own label (kg/h, m³, ...).
const UNIT_SYM := {"degC": "°C", "bar": "bar", "kmol/h": "kmol/h", "mol%": "%", "m²": "m²", "kg": "kg", "kW": "kW", "K": "K", "t/h": "t/h", "kg/s": "kg/s", "kg/h": "kg/h", "m³": "m³"}
static func usym(unit: String) -> String: return UNIT_SYM.get(unit, unit)

## Display number of a knob/readout in display units with the engine-given decimals rule.
static func num(v: float, int_only := false) -> String:
	if int_only: return str(int(round(v)))
	return CbKit.num(v, EqFmt.decimals(v))

static func rect_fit(r: Rect2, aspect: float) -> Rect2:
	var w := minf(r.size.x, r.size.y * aspect); var h := w / aspect
	return Rect2(r.position + (r.size - Vector2(w, h)) * 0.5, Vector2(w, h))

## Colour of a unit type's tile accent (category-free: a pen-blue enamel bias, only used on the rack).
static func disp_name(label: String) -> String: return label.to_upper()
