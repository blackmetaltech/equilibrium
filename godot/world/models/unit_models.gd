class_name UnitModels
extends RefCounted
## Factory and footprint table for the plant models. Type names are the engine's (feed, mixer, splitter, heater, cooler, hx, compressor,
## valve, sink, product, vent) plus the ones coming with the engine lanes (eq_reactor, packed_bed, multibed, cstr, flash, nh3_sep, boiler,
## absorber, stack, relief, flare); unknown types fall back to a small box labelled by nothing (never a crash).
const ALIAS := {"mixer3": "mixer", "mixer4": "mixer", "eq_reactor": "converter", "packed_bed": "converter", "multibed": "converter", "cstr": "converter",
	"nh3_sep": "flash", "absorber": "flash", "boiler": "hx", "sink": "product", "vent": "stack", "converter": "converter"}
const TYPES: Array[String] = ["feed", "compressor", "heater", "cooler", "hx", "converter", "flash", "splitter", "mixer", "flare", "stack", "product", "relief", "valve"]

static func kind(type: String) -> String: return ALIAS.get(type, type)

static func create(type: String, id := "") -> UnitModel:
	var k := kind(type); var m: UnitModel
	match k:
		"feed": m = UMFeed.new()
		"compressor": m = UMCompressor.new()
		"heater": m = UMHeater.new()
		"cooler": m = UMCooler.new()
		"hx": m = UMHx.new()
		"converter": m = UMConverter.new()
		"flash": m = UMFlash.new()
		"splitter": m = UMSplitter.new()
		"mixer": m = UMMixer.new()
		"flare": m = UMFlare.new()
		"stack": m = UMStack.new()
		"product": m = UMProduct.new()
		"relief": m = UMRelief.new()
		"valve": m = UMValve.new()
		_: m = UMValve.new()
	return m.setup(id, type)

static func footprint(type: String, rot := 0) -> Vector2i:
	var t := Vector2i(2, 2)
	match kind(type):
		"feed", "cooler", "hx": t = Vector2i(4, 2)
		"compressor": t = Vector2i(3, 2)
		"heater": t = Vector2i(3, 3)
		"converter", "product": t = Vector2i(4, 4)
		"relief", "valve": t = Vector2i(1, 1)
	return t if rot % 2 == 0 else Vector2i(t.y, t.x)
