class_name EqStrings
extends RefCounted
## English catalogue of the console chrome (keys used with EqStrings.T("KEY")). Registered once by load_strings(); kept beside the code so the
## chrome needs no import step and cannot clash with locales/strings.csv. One dict literal: other workers append their keys at the END.
const S := {
	"SPK_MARA": "MARA", "SPK_TOMAS": "TOMAS", "SPK_VICTOR": "VICTOR", "SPK_NOOR": "NOOR",
	"IC_WHY": "why?", "IC_GOT_IT": "got it", "IC_LOG": "log", "IC_LOG_TITLE": "Intercom log", "IC_EMPTY": "The intercom is quiet.", "IC_CLOSE": "Close",
	"IC_IDLE": "Channel open. Waiting for the shift.",
	"ANN_DEMO_1": "VENT FLOW HI", "ANN_DEMO_2": "NH3 OFF SPEC", "ANN_DEMO_3": "H2:N2 RATIO", "ANN_DEMO_4": "SOLVE FAIL",
	"ANN_ACK": "Acknowledge alarms", "ANN_TITLE": "ANNUNCIATOR",
	"REC_TITLE": "Chart recorder", "REC_CLOSE": "Close", "REC_RUN": "run %d", "REC_TARGET": "target", "REC_HINT": "Each commission adds a trace; the paper is your experiment history.",
	"REC_EMPTY": "No runs yet", "KEY_PRUNE": "Delete all unconnected", "CLK_RUN": "SHIFT %s / %s%s", "CLK_IDLE": "SHIFT %s", "CLK_ENDED": "SHIFT OVER %s", "CLK_ETA": "ETA %s", "REC_FIRSTRUN": "First run: made", "REC_FIRSTRUN_T": "First run: printout in %d s", "REC_DEMO_HERO": "NH3 kmol/h", "REC_DEMO_SEC": "vent %",
	"KEY_DESIGN": "DESIGN", "KEY_COMMISSION": "COMMISSION", "KEY_RUN": "RUN", "KEY_HINT": "Turn the key: design, commission, run the shift. Space turns it one step.",
	"KEY_SPEED_HINT": "Plant clock speed during a shift",
	"KEY_NEED_COMMISSION": "Commission the plant before the shift.", "KEY_SHIFT_ON": "The shift is already running.", "KEY_SOLVE_FAIL": "The plant did not solve.",
	"SPEED_0": "‖", "SPEED_1": "1×", "SPEED_2": "4×", "SPEED_3": "16×",
	"TITLE_SUB": "run the plant that feeds the world", "TITLE_CONTINUE": "Continue shift", "TITLE_NEW": "New works", "TITLE_MAP": "Works map", "TITLE_NEWLOOK": "Chapter 3 · The Wall  (new look)", "TITLE_SANDBOX": "Sandbox",
	"TITLE_SETTINGS": "Settings", "TITLE_QUIT": "Quit", "TITLE_FOOT": "Kestrel Bay Works",
	"PAUSE_TITLE": "Paused", "PAUSE_RESUME": "Resume", "PAUSE_RESTART": "Restart job", "PAUSE_NOTEBOOK": "Notebook", "PAUSE_SETTINGS": "Settings",
	"PAUSE_MAP": "Works map", "PAUSE_TITLE_BTN": "Title",
	"CUTE_ON": "Cute mode: on", "CUTE_OFF": "Cute mode: off", "CUTE_HINT": "Molecules become little critters. The count, size and speed still follow the physics.",
	"GEAR_TIP": "Menu (Esc)", "PARTS_TAB": "Parts", "PARTS_TIP": "Show or hide the parts rack",
	# --- keys of other workers below this line ---
}

static var _loaded := false

static func load_strings() -> void:
	if _loaded: return
	_loaded = true
	var t := Translation.new(); t.locale = "en"
	for k in S: t.add_message(k, S[k])
	TranslationServer.add_translation(t)

static func T(key: String) -> String:
	load_strings()
	return TranslationServer.translate(key)

## Console fonts: Barlow has no subscript digits, so formulas (NH₃, H₂:N₂) fall back to Space Mono / Archivo, then the engine's fallback.
## kind: "cap" (Barlow SemiBold, Dymo and annunciator caps), "body" (Barlow Regular).
static var _fonts := {}
static func font(kind: String) -> Font:
	if _fonts.has(kind): return _fonts[kind]
	var fv := FontVariation.new()
	fv.base_font = EqTheme.font("semi" if kind == "cap" else "sans")
	fv.fallbacks = [EqTheme.font("head"), EqTheme.font("mono_bold" if kind == "cap" else "mono"), ThemeDB.fallback_font]
	_fonts[kind] = fv
	return fv

## "NH3" -> "NH₃": digits after a letter become subscripts (formula text for chips, captions and headers).
const _SUB := ["₀", "₁", "₂", "₃", "₄", "₅", "₆", "₇", "₈", "₉"]
static func formula(id: String) -> String:
	var out := ""
	for i in id.length():
		var c := id.substr(i, 1)
		out += _SUB[int(c)] if i > 0 and c >= "0" and c <= "9" else c
	return out

## Plain names of what a feed or bank carries (the engine's species ids -> a Dymo-tape name).
const NAMES := {"S": "SULFUR", "H2": "HYDROGEN", "N2": "NITROGEN", "O2": "OXYGEN", "NH3": "AMMONIA", "H2O": "WATER", "CH4": "METHANE", "C3H8": "PROPANE", "CO": "CARBON MONOXIDE",
	"CO2": "CARBON DIOXIDE", "CH3OH": "METHANOL", "C2H5OH": "ETHANOL", "Ar": "ARGON", "SO2": "SULFUR DIOXIDE", "SO3": "SULFUR TRIOXIDE", "H2SO4": "SULFURIC ACID", "Cl2": "CHLORINE", "NO": "NITRIC OXIDE", "NO2": "NITROGEN DIOXIDE"}
## What a feed carries, from the engine's mole fractions `x` (indexed like `species`): a pure bank by name, air as "AIR (O₂ 21 %)", else the top species with their shares.
static func carries(species: Array, x: Array) -> String:
	var items: Array = []
	for i in mini(species.size(), x.size()): if float(x[i]) > 1e-6: items.append([str(species[i]), float(x[i])])
	if items.is_empty(): return ""
	items.sort_custom(func(a, b): return a[1] > b[1])
	var d := {}; for it in items: d[it[0]] = it[1]
	if items[0][1] >= 0.98: return NAMES.get(items[0][0], formula(items[0][0]))
	if d.has("O2") and d.has("N2") and float(d["O2"]) > 0.15 and float(d["O2"]) < 0.3 and float(d["O2"]) + float(d["N2"]) + float(d.get("Ar", 0.0)) > 0.97: return "AIR (%s %d %%)" % [formula("O2"), int(round(float(d["O2"]) * 100.0))]
	var parts: Array = []
	for it in items.slice(0, 3): parts.append("%s %d %%" % [formula(it[0]), int(round(it[1] * 100.0))])
	return " · ".join(parts)

static var _ls := {}
static func ls(size: int, col: Color, kind := "body") -> LabelSettings:
	size = EqTheme.fs(size)
	var k := "%s|%d|%s" % [kind, size, col.to_html()]
	if _ls.has(k): return _ls[k]
	var s := LabelSettings.new(); s.font = font(kind); s.font_size = size; s.font_color = col
	_ls[k] = s
	return s
