class_name UnitModels
extends RefCounted
## Factory and footprint table for the plant models. Type names are the engine's (feed, mixer, splitter, heater, cooler, hx, compressor,
## valve, sink, product, vent) plus the ones coming with the engine lanes (eq_reactor, packed_bed, multibed, cstr, flash, nh3_sep, boiler,
## absorber, stack, relief, flare); unknown types fall back to a small box labelled by nothing (never a crash).
const ALIAS := {"mixer3": "mixer", "mixer4": "mixer", "purge": "splitter", "eq_reactor": "converter", "stoich_reactor": "converter", "converter": "converter",
	"packed_bed": "multibed", "eq_bed": "multibed", "co_burner": "gasifier", "nh3_sep": "flash", "sink": "product", "vent": "stack",
	"lab_flask": "flask", "bomb_calorimeter": "bomb", "gas_burette": "burette", "gauze_burner": "gauze"}
## Own models: boiler, burner (sulfur), gasifier (+ co_burner), multibed (+ packed_bed, eq_bed), cstr, absorber, column, fermenter, chiller,
## reformer, gauze, flask (lab_flask), bomb (calorimeter), burette (gas burette). column, fermenter, chiller, reformer, gauze_burner, bomb_calorimeter, gas_burette are not engine types yet (footprints are my guess).
const TYPES: Array[String] = ["feed", "compressor", "heater", "cooler", "hx", "converter", "flash", "splitter", "mixer", "flare", "stack", "product", "relief", "valve",
	"boiler", "burner", "gasifier", "co_burner", "multibed", "packed_bed", "cstr", "absorber", "column", "fermenter", "chiller", "reformer", "gauze_burner",
	"lab_flask", "bomb_calorimeter", "gas_burette"]

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
		"boiler": m = UMBoiler.new()
		"burner": m = UMBurner.new()
		"gasifier": m = UMGasifier.new()
		"multibed": m = UMMultibed.new()
		"cstr": m = UMCstr.new()
		"absorber": m = UMAbsorber.new()
		"column": m = UMColumn.new()
		"fermenter": m = UMFermenter.new()
		"chiller": m = UMChiller.new()
		"reformer": m = UMReformer.new()
		"gauze": m = UMGauze.new()
		"flask": m = UMFlask.new()
		"bomb": m = UMBomb.new()
		"burette": m = UMBurette.new()
		_: m = UMValve.new()
	return m.setup(id, type)

static func footprint(type: String, rot := 0) -> Vector2i:
	var t := Vector2i(2, 2)
	match kind(type):
		"feed", "cooler", "hx", "boiler", "chiller": t = Vector2i(4, 2)
		"compressor": t = Vector2i(3, 2)
		"heater": t = Vector2i(3, 3)
		"converter", "product", "burner", "gasifier", "multibed", "cstr", "absorber", "reformer": t = Vector2i(4, 4)
		"relief", "valve": t = Vector2i(1, 1)
	return t if rot % 2 == 0 else Vector2i(t.y, t.x)
