class_name EqFmt
extends RefCounted
## Display conversion between the engine's SI numbers and what the player reads (the engine's DISPLAY_PAIRS for the units the UI shows).
## Unit symbols come from the string catalogue (UNIT_*), numbers from CbKit formatting.
static func to_disp(v: float, unit: String) -> float:
	match unit:
		"degC": return v - 273.15
		"bar": return v / 1e5
		"kmol/h": return v * 3.6
		"mol%": return v * 100.0
		"kW": return v / 1e3
	return v

static func to_si(v: float, unit: String) -> float:
	match unit:
		"degC": return v + 273.15
		"bar": return v * 1e5
		"kmol/h": return v / 3.6
		"mol%": return v / 100.0
		"kW": return v * 1e3
	return v

static func sym(unit: String) -> String:
	match unit:
		"degC": return tr_("UNIT_DEGC")
		"bar": return tr_("UNIT_BAR")
		"kmol/h": return tr_("UNIT_KMOLH")
		"mol%": return tr_("UNIT_PCT")
		"m²": return tr_("UNIT_M2")
		"kg": return tr_("UNIT_KG")
		"kW": return tr_("UNIT_KW")
		"K": return tr_("UNIT_K")
		"t/h": return tr_("UNIT_TPH")
		"kg/s": return tr_("UNIT_KGS")
	return ""

static func tr_(k: String) -> String: return TranslationServer.translate(k)

static func decimals(v: float) -> int:
	var a := absf(v)
	return 0 if a >= 1000.0 else (1 if a >= 100.0 else (2 if a >= 1.0 else 3))

## A value in SI with its display unit, e.g. text(473.15, "degC") -> "200 °C".
static func text(si: float, unit: String) -> String:
	var d := to_disp(si, unit); var s := sym(unit)
	return CbKit.fmt(d, decimals(d), s)
