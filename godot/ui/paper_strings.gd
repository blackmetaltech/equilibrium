class_name PaperStrings
extends RefCounted
## Player-facing text of the paper layer (parts rack, faceplates, tags, notebook, printout) and a few shared helpers. One dict, keys UPPER_SNAKE.
## Numbers never live here: they come from the engine (unitCard, stream, levelInfo, resultCard).
const S := {
	"RACK_TITLE": "PARTS", "RACK_LOCKED": "Not on this job", "RACK_LIMIT": "All %d placed", "RACK_LIMIT1": "Already on site: this job allows one", "RACK_ONSITE": "already on site", "RACK_NOKEY": "No part on key %d on this job: the parts shown in the rack are numbered left to right.", "RACK_RUNNING": "Parts go down in DESIGN: stop the plant first (the key, or STOP + EDIT).", "RACK_UNAVAIL": "%s is not available right now.", "NB_PENDING": "pending", "RACK_PRICE": "$%s",
	"FP_WHY": "Why?", "FP_CATALYST": "Catalyst", "FP_LIGHTOFF": "light-off", "FP_PRICE": "price", "FP_LENS": "Lens", "FP_WINDOW": "Window", "FP_PIN": "Pin", "FP_UNPIN": "Unpin", "FP_CLOSE": "Close",
	"FP_PV": "PV", "FP_SP": "SP", "FP_NOSOLVE": "Commission to read the meters", "FP_FLOW": "FLOW", "FP_LAG": "Reactor flow follows the feed through the hold-up (about 72 s): for a minute after every feed change the two flows differ. That is the transient, not a fault.", "FP_MASS": "MASS", "FP_DUTY": "DUTY", "FP_WORK": "SHAFT",
	"FP_OUT": "OUT", "FP_BANK_KG": "Bank flow", "FP_MASKED": "FUEL · unknown", "FP_KMOLH": "kmol/h", "FP_KGH": "kg/h", "FP_FAILED": "FAILED",
	"PIPE_HINT": "Piping: drag from an outlet (OUT, a teal ball) to a lit inlet (an amber square) and let go.", "PIPE_FROM": "Pipe from %s: drag on to a lit inlet (an amber square) and let go, or Esc to drop it", "PIPE_FROM_IN": "Pipe into %s: drag on from a lit outlet (a teal ball) and let go, or Esc to drop it", "RIG_LINE": "%s · k now %s", "RIG_OK": "\u2713 fast enough (needs k of at least %s)", "RIG_SLOW": "\u2717 too slow (needs k of at least %s)", "ILK_RESET": "RESET", "ILK_RESET_TIP": "Release the tripped interlock (the reactor must be back below the trip point)", "PIPE_WHICH": "%s has more than one port that fits: drop the pipe on a lit one", "PIPE_NONE": "No free inlet fits %s %s", "PIPE_DONE": "Piped %s to %s",
	"TAG_FLOW": "FLOW", "TAG_T": "T", "TAG_P": "P", "TAG_NODATA": "No flow yet: commission the plant", "TAG_KMOL": "kmol/h", "TAG_KG": "kg/h",
	"BC_TITLE": "BUILD ORDER", "BC_NEED": "Place the parts of this line first, then come back to it.", "NB_TAB": "NOTEBOOK", "NB_GOALS": "GOALS", "NB_BUDGET": "Budget", "NB_SPENT": "spent", "NB_STARS": "FLASKS", "NB_CALLIT": "CALL IT", "NB_START": "Start work", "NB_RESUME": "Back to work",
	"NB_PREDICTED": "predicted: %s %s", "NB_NAMED": "limiting:", "NB_NAMED_FIRST": "Pick the limiting reagent first (the chip), then type the number: both lock together.", "NB_NOW": "now %s", "NB_TARGET": "target %s", "NB_MODE": "MODE", "NB_LEARNER": "Learner", "NB_ENGINEER": "Engineer", "NB_ANSWER": "answer", "NB_LOCKED": "locked in", "NB_TAP": "tap to enter",
	"PR_HEAD": "KESTREL BAY WORKS", "PR_RUN": "RUN %03d", "PR_PASS": "PASS", "PR_FAIL": "FAIL", "PR_ABORT": "*** RUN ABORTED ***", "PR_NOTMET": "*** GOALS NOT MET YET ***", "PR_DONE": "*** RUN COMPLETE ***",
	"PR_YOU": "◄ YOU", "PR_CALLIT": "CALL IT", "PR_HIST_AXIS": " other runs at this value (bar = how many)", "PR_MARA": "MARA", "PR_RETRY": "Retry", "PR_KEEP": "Keep improving", "PRD_TITLE": "You haven't predicted yet", "PRD_BODY": "This job asks you to call the answer before the first commission. Write your prediction in the notebook first, or run without one.", "PRD_NOW": "Predict now", "PRD_RUN": "Run anyway", "CLOCK_PAUSED": "PAUSED · 1x", "PR_NEXT": "Next job", "PR_COPY": "Copy design code", "PR_COPIED": "Design code copied",
	"PR_METRICS": "METRICS", "PR_HIST": "WORKS RUNS", "PR_CAUSE": "CAUSE", "PR_LESSON": "NOTE", "PR_STARS": "FLASKS", "PR_WENT": "SHEET %d",
	"FP_LAST_RUN": "READINGS: LAST RUN", "FP_CLOSE_ALL": "close all", "FP_TRIPPED": "Plant tripped: reset the interlock first",
	"DEL_ASK": "Delete %s and its %d pipes?", "DEL_ASK1": "Delete %s and its pipe?", "DEL_YES": "Delete", "DEL_NO": "Keep", "DEL_TIP": "Delete (Del)",
	"IC_GOAL_MET": "Goal met: %s", "IC_FIRSTRUN": "First run: the plant is making product. Watch the recorder.", "IC_EDITED": "Design changed. Commission to test it.",
	"IC_BANKS_SAME": "Both banks carry %s: switch one to %s with its chip.", "FAIL_AT": "%s failed to solve: %s",
	"NB_REFUSED": "Not accepted: %s", "REC_RUN": "RUN %d",
	"RST_TITLE": "Restart this job?", "RST_BODY": "The shift clock and the recorder start again. Your Call it answers are kept.", "RST_KEEP": "Restart, keep my build",
	"RST_CLEAR": "Restart and clear the plot", "RST_CANCEL": "Cancel",
	"IC_RUNNING": "Commissioned and RUNNING: the shift clock is on. Turn the key again to STOP and edit (your build is kept).",
	"IC_RETRY_KEPT": "Retry: your build and your settings are kept. Change something, then commission again.", "IC_STOPPED": "Stopped. Back in DESIGN with your plant as you built it; the shift clock is reset.", "IC_STOP_FAIL": "Stopped. Not put back: %s. Check the plant.",
	"IC_DIAL_RESET": "You turned a dial: the run was cleared. Commission again to test the new setting.",
	"IC_NO_RUN": "This job has no shift to run: it is judged on the commission. Turn the key back to DESIGN to change the plant.", "IC_FIRST_EDIT": "The first run is on show: change anything in the design to stop it.", "KH_DESIGN": "COMMISSION", "KH_COMMISSIONED": "RUN", "KH_BACK": "BACK TO DESIGN", "KH_RUN": "STOP + EDIT", "KH_TURN": "TURN FOR",
	"HX_HOT_IN": "HOT IN", "HX_HOT_OUT": "HOT OUT", "HX_COLD_IN": "COLD IN", "HX_COLD_OUT": "COLD OUT",
	"UT_FIRED": "fired", "UT_STEAM": "steam", "UT_CW": "cooling water", "UT_REFRIG": "refrigerant", "UT_NONE": "none (adiabatic)", "UT_ZERO": "This heater does 0 kW: pick a utility and a duty.", "UT_COLD": "Cooling water cannot heat anything. A heater needs fired or steam.", "UT_HOT": "Fired heat or steam cannot cool anything. A cooler needs water or refrigerant.",
	"KEYPAD_OK": "Enter", "KEYPAD_CLEAR": "Clear", "KEYPAD_IN": "in %s", "KEYPAD_NONUM": "Type a number first.", "KEYPAD_REJECT1": "%s is outside the scale.", "KEYPAD_REJECT": "%s is outside the scale (%s to %s).", "KEYPAD_RANGE": "%s to %s",
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

## Plain-words fallbacks for solver codes when the engine sent only the code (a raw NO_EXIT never reaches the player). Unknown codes are spelled out.
const FAILS := {
	"NO_EXIT": "Something enters the loop and nothing takes it out. Add a purge or a separator.",
	"NO_INLET": "A unit has no feed. Pipe something into it.", "TOPOLOGY_OPEN_PORT": "A pipe or port is left open. Connect every inlet and outlet that matters.",
	"TOPOLOGY_DOUBLE_INLET": "Two pipes go into one inlet. Use a mixer.", "TOPOLOGY_DOUBLE_OUTLET": "Two pipes leave one outlet. Use a splitter.",
	"ZERO_FLOW": "No flow reaches this unit. Check the feed.", "NO_CONVERGE": "The solver could not settle this plant. Ease a recycle or a spec.",
	"ACCUMULATION": "Something builds up forever in the loop. Add a purge.", "EXPLOSIVE_MIXTURE": "That mixture is in its explosive range. Change the ratio.",
	"INSUFFICIENT_O2": "Not enough air for the fuel. Raise the air feed.", "DUTY_UNREACHABLE": "This utility cannot reach that temperature. Pick another utility.",
	"UTILITY_CANNOT_REACH": "This utility cannot reach that temperature. Pick another utility.", "VALVE_P_RISE": "A valve cannot raise pressure. Use a compressor.",
	"TEMPERATURE_CROSS": "The cold side would end hotter than the hot side. Change the temperatures or the flow.", "HYDROGEN_SHORT": "Not enough hydrogen for this reaction.",
	"SPEC_MISSING": "A setting is missing. Open the unit and set it.", "FEED_SPEC": "A feed is not set. Open it and give it a flow.",
}
static func fail_text(code: String) -> String:
	if FAILS.has(code): return FAILS[code]
	if code == "": return "The plant did not solve."
	var w := code.replace("_", " ").to_lower()
	return w.substr(0, 1).to_upper() + w.substr(1)

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
