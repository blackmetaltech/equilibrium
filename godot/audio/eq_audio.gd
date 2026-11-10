class_name EqAudio
extends Node
## EQUILIBRIUM audio layer. Everything is synthesised (no audio files, nothing to license) and deterministic.
## Industrial, mechanical, 1970s control room: warm, nothing above ~5 kHz.
##
## Own one EqAudio in the scene tree (add_child) and call:
##   Plant bed (continuous, AudioStreamGenerator; each setter clamps to 0..1 and eases in ~150 ms):
##     set_compressor(power01)  drone, pitch = compressor_hz() = 60 + 80 * power^0.3 Hz, slight beating; silent at 0
##     set_furnace(duty01)      band-passed brown-noise roar
##     set_flow(01)             soft pipe hiss
##     set_cooling(01)          cooling-tower hiss (high-passed noise, slow swell)
##     set_flare(01)            low rumble with flicker
##   One-shots (pool of 10 voices on the SFX bus): play(kind), kind in ONE_SHOTS.
##   Alarms: alarm("low"|"high"|"critical") raises (loops its tone), ack_alarm() silences tones but keeps the state,
##     clear_alarm(level := "") drops one level (or all). alarm_audible() is the one level currently sounding
##     (highest priority that is not acknowledged); alarm_state(level) is "off" | "active" | "acked".
##   Music (three pieces, each rendered once on a worker thread): start_music() / stop_music(fade)
##     set_title(bool)   title piece (slow, warm, plant hum underneath); false returns to the last level piece
##     set_piece("design"|"shift")  design: 84 BPM A minor marimba + pad; shift: 112 BPM pulse
##     set_stress(0..1)  percussion stem fades in above 0.4
##     set_critical(bool) tense drone replaces the beat
##   apply_volumes()     re-read CbSettings master/music/sfx.
## Headless (dummy audio driver) or CB_NOAUDIO: state setters/alarm logic work, nothing is played, no threads start.
## The synthesis lives in static functions so render_samples.gd renders the exact same samples to WAV.

const RATE := 22050        ## one-shot sample rate
const BED_RATE := 16000    ## plant bed generator rate
const MRATE := 12000       ## music rate
const PEAK_N6 := 0.5012    ## -6 dBFS
const COMP_MIN_HZ := 60.0
const COMP_SPAN_HZ := 80.0
const COMP_EXP := 0.3
const ONE_SHOTS := ["key", "knob_tick", "valve", "pipe_connect", "lock", "slip", "intercom", "typewriter", "printer", "tear", "stamp",
	"relief_pop", "vent_whoosh", "surge_thump", "catalyst_crack", "ack", "place", "molecule_pop", "cat_meow"]
const ALARM_LEVELS := ["low", "high", "critical"]
const PIECES := ["title", "design", "shift"]
const KIND_DB := {"key": -4.0, "knob_tick": -10.0, "valve": -5.0, "pipe_connect": -6.0, "lock": -7.0, "slip": -8.0, "intercom": -9.0,
	"typewriter": -9.0, "printer": -11.0, "tear": -9.0, "stamp": -5.0, "relief_pop": -5.0, "vent_whoosh": -8.0, "surge_thump": -4.0,
	"catalyst_crack": -6.0, "ack": -9.0, "place": -6.0, "molecule_pop": -14.0, "cat_meow": -12.0}
const ALARM_DB := {"low": -10.0, "high": -9.0, "critical": -8.0}
const MIN_GAP_MS := {"molecule_pop": 140, "cat_meow": 600, "knob_tick": 15}

var comp_power := 0.0
var furnace_duty := 0.0
var flow_level := 0.0
var cooling_level := 0.0
var flare_level := 0.0
var stress := 0.0
var critical := false
var title_on := false
var piece := "design"
var muted := false
var headless := DisplayServer.get_name() == "headless" or OS.has_environment("CB_NOAUDIO")
var _alarms := {"low": "off", "high": "off", "critical": "off"}
var _alarm_playing := ""
var _alarm_player: AudioStreamPlayer
var _alarm_streams := {}
var _bed := BedSynth.new()
var _bed_player: AudioStreamPlayer
var _bed_pb: AudioStreamGeneratorPlayback
var _voices: Array[AudioStreamPlayer] = []
var _streams := {}
var _last_play := {}
var _pop_n := 0
var _players := {}          # "piece/stem" -> AudioStreamPlayer
var _gain_db := {}          # "piece/stem" -> current dB
var _thread: Thread
var _music_wanted := false
var _mutex := Mutex.new()
var _cache := {}            # piece -> {base, perc, tense}

# ---------------------------------------------------------------- public API: bed
func set_compressor(p: float) -> void:
	comp_power = clampf(p, 0.0, 1.0); _bed.comp_t = comp_power

func set_furnace(d: float) -> void:
	furnace_duty = clampf(d, 0.0, 1.0); _bed.furn_t = furnace_duty

func set_flow(f: float) -> void:
	flow_level = clampf(f, 0.0, 1.0); _bed.flow_t = flow_level

func set_cooling(c: float) -> void:
	cooling_level = clampf(c, 0.0, 1.0); _bed.cool_t = cooling_level

func set_flare(f: float) -> void:
	flare_level = clampf(f, 0.0, 1.0); _bed.flare_t = flare_level

## Compressor drone frequency for a shaft-power fraction: 60 + 80 * p^0.3 Hz (pitch truth, what the audio tests assert).
static func hz_for_power(p: float) -> float:
	return COMP_MIN_HZ + COMP_SPAN_HZ * pow(clampf(p, 0.0, 1.0), COMP_EXP)

func compressor_hz() -> float:
	return hz_for_power(comp_power)

# ---------------------------------------------------------------- public API: one-shots
func play(kind: String) -> void:
	if not (kind in ONE_SHOTS): return
	if muted or headless or _voices.is_empty() or not is_inside_tree(): return
	var t := Time.get_ticks_msec()
	if t - int(_last_play.get(kind, -10000)) < int(MIN_GAP_MS.get(kind, 25)): return
	_last_play[kind] = t
	if not _streams.has(kind): _streams[kind] = to_wav(render_oneshot(kind), RATE, false)
	var p: AudioStreamPlayer = null
	for v in _voices:
		if not v.playing: p = v; break
	if p == null: p = _voices[0]
	p.pitch_scale = 1.0
	if kind == "molecule_pop": p.pitch_scale = 0.9 + 0.05 * float(_pop_n % 5); _pop_n += 1
	p.stream = _streams[kind]; p.volume_db = float(KIND_DB.get(kind, -8.0)); p.play()

# ---------------------------------------------------------------- public API: alarms
func alarm(level: String) -> void:
	if not (level in ALARM_LEVELS): return
	if _alarms[level] == "off": _alarms[level] = "active"
	_refresh_alarm()

## Acknowledge: every active alarm goes silent but stays raised (the beacon is the UI's job).
func ack_alarm() -> void:
	for k in ALARM_LEVELS:
		if _alarms[k] == "active": _alarms[k] = "acked"
	_refresh_alarm()
	play("ack")

## Drop one level (or all when level is empty): the condition cleared.
func clear_alarm(level := "") -> void:
	for k in ALARM_LEVELS:
		if level == "" or level == k: _alarms[k] = "off"
	_refresh_alarm()

func alarm_state(level: String) -> String:
	return String(_alarms.get(level, "off"))

## The single level whose tone is audible: highest priority among the active, unacknowledged. "" if none.
func alarm_audible() -> String:
	for i in range(ALARM_LEVELS.size() - 1, -1, -1):
		if _alarms[ALARM_LEVELS[i]] == "active": return ALARM_LEVELS[i]
	return ""

func has_thread() -> bool:
	return _thread != null

# ---------------------------------------------------------------- public API: music
func start_music() -> void:
	_music_wanted = true
	if headless or CbSettings.music_mode == "off": return
	if _thread == null and _cache.size() < PIECES.size():
		_thread = Thread.new(); _thread.start(_render_all)
	for p in _players.values():
		if not p.playing: p.play()

func stop_music(fade := 1.0) -> void:
	_music_wanted = false
	for p in _players.values():
		if p.playing:
			var tw := create_tween(); tw.tween_property(p, "volume_db", -80.0, fade); tw.tween_callback(p.stop)

func set_stress(s: float) -> void:
	stress = clampf(s, 0.0, 1.0)

func set_critical(on: bool) -> void:
	critical = on

func set_title(on: bool) -> void:
	title_on = on

func set_piece(name: String) -> void:
	if name == "design" or name == "shift": piece = name

func current_piece() -> String:
	return "title" if title_on else piece

func apply_volumes() -> void:
	_set_bus("Music", CbSettings.music_volume * (0.0 if CbSettings.music_mode == "off" else 1.0), -6.0)
	_set_bus("SFX", CbSettings.sfx_volume, 0.0)

# ---------------------------------------------------------------- node plumbing
func _ready() -> void:
	for n in ["Music", "SFX"]:
		if AudioServer.get_bus_index(n) == -1:
			AudioServer.add_bus(); var i := AudioServer.get_bus_count() - 1
			AudioServer.set_bus_name(i, n); AudioServer.set_bus_send(i, "Master")
	var mi := AudioServer.get_bus_index("Music")
	if mi != -1 and AudioServer.get_bus_effect_count(mi) == 0:
		var rv := AudioEffectReverb.new(); rv.room_size = 0.55; rv.wet = 0.14; rv.dry = 0.92; AudioServer.add_bus_effect(mi, rv)
	for i in 10:
		var p := AudioStreamPlayer.new(); p.bus = "SFX"; add_child(p); _voices.append(p)
	var g := AudioStreamGenerator.new(); g.mix_rate = BED_RATE; g.buffer_length = 0.25
	_bed_player = AudioStreamPlayer.new(); _bed_player.stream = g; _bed_player.bus = "SFX"; _bed_player.volume_db = -4.0
	add_child(_bed_player)
	_alarm_player = AudioStreamPlayer.new(); _alarm_player.bus = "SFX"; add_child(_alarm_player)
	if not headless:
		_bed_player.play(); _bed_pb = _bed_player.get_stream_playback() as AudioStreamGeneratorPlayback
	apply_volumes()

func _exit_tree() -> void:
	if _thread != null and _thread.is_started(): _thread.wait_to_finish()

func _set_bus(n: String, lin: float, trim_db: float) -> void:
	var i := AudioServer.get_bus_index(n)
	if i != -1: AudioServer.set_bus_volume_db(i, linear_to_db(maxf(lin, 0.0001)) + trim_db)

func _refresh_alarm() -> void:
	var want := alarm_audible()
	if want == _alarm_playing: return
	_alarm_playing = want
	if headless or _alarm_player == null or not is_inside_tree(): return
	if want == "":
		_alarm_player.stop(); return
	if not _alarm_streams.has(want): _alarm_streams[want] = to_wav(render_alarm(want), RATE, true)
	_alarm_player.stream = _alarm_streams[want]; _alarm_player.volume_db = float(ALARM_DB[want]); _alarm_player.play()

func _render_all() -> void:
	var order := PIECES.duplicate()
	var first := current_piece()
	order.erase(first); order.push_front(first)
	for pc in order:
		var st := render_piece(pc)
		_mutex.lock(); _cache[pc] = st; _mutex.unlock()

func _process(delta: float) -> void:
	if _bed_pb != null:
		var n := mini(_bed_pb.get_frames_available(), 4096)
		if n > 0:
			var s := _bed.fill(n); var v := PackedVector2Array(); v.resize(n)
			for i in n: v[i] = Vector2(s[i], s[i])
			_bed_pb.push_buffer(v)
	if _thread != null and _thread.is_started() and not _thread.is_alive():
		_thread.wait_to_finish()
	if headless: return
	_mutex.lock()
	for pc in _cache:
		if not _players.has(pc + "/base"): _build_players(pc)
	_mutex.unlock()
	if _music_wanted and not _players.is_empty():
		var cur := current_piece(); var g := stem_gains(stress, critical)
		for k in _players:
			var parts: PackedStringArray = k.split("/")
			var gain := float(g[parts[1]]) * (1.0 if parts[0] == cur else 0.0)
			var tgt := -80.0 if gain < 0.002 else linear_to_db(gain)
			var was := float(_gain_db.get(k, -80.0))
			var now := move_toward(was, tgt, 24.0 * delta)
			if was <= -79.0 and now > -79.0: _players[k].play(0.0)
			_gain_db[k] = now; _players[k].volume_db = now

func _build_players(pc: String) -> void:
	for k in ["base", "perc", "tense"]:
		var p := AudioStreamPlayer.new(); p.bus = "Music"; p.volume_db = -80.0
		p.stream = to_wav(_cache[pc][k], MRATE, true); add_child(p)
		_players["%s/%s" % [pc, k]] = p; _gain_db["%s/%s" % [pc, k]] = -80.0
		if _music_wanted: p.play()

# ---------------------------------------------------------------- plant bed synth
## Streaming plant bed. fill(n) returns n mono samples at BED_RATE. All parameters ease (150 ms).
class BedSynth extends RefCounted:
	var rate := 16000
	var comp := 0.0
	var furn := 0.0
	var flow := 0.0
	var cool := 0.0
	var flare := 0.0
	var comp_t := 0.0
	var furn_t := 0.0
	var flow_t := 0.0
	var cool_t := 0.0
	var flare_t := 0.0
	var ph1 := 0.0
	var ph2 := 0.0
	var f_a := 0.0       # furnace brown-noise filters
	var f_b := 0.0
	var f_c := 0.0
	var h_a := 0.0       # flow hiss
	var h_b := 0.0
	var c_a := 0.0       # cooling tower
	var c_b := 0.0
	var sw := 0.0        # cooling swell phase
	var r_a := 0.0       # flare rumble
	var r_b := 0.0
	var fl1 := 0.0       # flare flicker
	var fl2 := 0.0
	var rng := RandomNumberGenerator.new()

	func _init(r := 16000, seed_ := 11) -> void:
		rate = r; rng.seed = seed_

	func snap() -> void:
		comp = comp_t; furn = furn_t; flow = flow_t; cool = cool_t; flare = flare_t

	func fill(n: int) -> PackedFloat32Array:
		var out := PackedFloat32Array(); out.resize(n)
		var k := 1.0 - exp(-1.0 / (0.15 * rate))
		var k_f1 := 1.0 - exp(-TAU * 400.0 / rate); var k_f2 := 1.0 - exp(-TAU * 90.0 / rate); var k_f0 := 1.0 - exp(-TAU * 30.0 / rate)
		var k_h1 := 1.0 - exp(-TAU * 3800.0 / rate); var k_h2 := 1.0 - exp(-TAU * 1300.0 / rate)
		var k_c1 := 1.0 - exp(-TAU * 4500.0 / rate); var k_c2 := 1.0 - exp(-TAU * 2400.0 / rate)
		var k_r1 := 1.0 - exp(-TAU * 70.0 / rate); var k_r2 := 1.0 - exp(-TAU * 45.0 / rate)
		var k_fl := 1.0 - exp(-TAU * 7.0 / rate); var k_fl2 := 1.0 - exp(-TAU * 1.3 / rate)
		for i in n:
			comp += (comp_t - comp) * k; furn += (furn_t - furn) * k; flow += (flow_t - flow) * k
			cool += (cool_t - cool) * k; flare += (flare_t - flare) * k
			var s := 0.0
			if comp > 0.0005:
				var f := COMP_MIN_HZ + COMP_SPAN_HZ * pow(comp, COMP_EXP)
				ph1 = fposmod(ph1 + f / rate, 1.0); ph2 = fposmod(ph2 + f * 1.006 / rate, 1.0)
				var a1 := TAU * ph1
				var body := sin(a1) + 0.85 * sin(TAU * ph2) + 0.35 * sin(2.0 * a1) + 0.12 * sin(3.0 * a1 + 0.7)
				s += body * 0.10 * minf(1.0, comp * 30.0) * (0.2 + 0.8 * comp)
			if furn > 0.0005:
				f_a += (rng.randf_range(-1.0, 1.0) - f_a) * k_f0                  # brown-ish source
				f_b += (f_a - f_b) * k_f1; f_c += (f_a - f_c) * k_f2
				s += (f_b - f_c) * 4.2 * furn
			if flow > 0.0005:
				var w := rng.randf_range(-1.0, 1.0)
				h_a += (w - h_a) * k_h1; h_b += (h_a - h_b) * k_h2
				s += (h_a - h_b) * 0.34 * flow
			if cool > 0.0005:
				var w2 := rng.randf_range(-1.0, 1.0)
				c_a += (w2 - c_a) * k_c1; c_b += (c_a - c_b) * k_c2
				sw = fposmod(sw + 0.31 / rate, 1.0)
				s += (c_a - c_b) * 0.42 * cool * (0.8 + 0.2 * sin(TAU * sw))
			if flare > 0.0005:
				r_a += (rng.randf_range(-1.0, 1.0) - r_a) * k_r1; r_b += (r_a - r_b) * k_r2
				fl1 += (rng.randf_range(0.0, 1.0) - fl1) * k_fl; fl2 += (fl1 - fl2) * k_fl2
				s += r_b * 3.0 * flare * (0.55 + 0.9 * fl2) * (0.8 + 0.4 * fl1)
			out[i] = tanh(s)
		return out

## Offline: render a steady bed with the given layer levels (compressor, furnace, flow, cooling, flare).
static func render_bed(comp: float, furn: float, flow: float, cool: float, flare: float, seconds: float) -> PackedFloat32Array:
	var b := BedSynth.new(BED_RATE)
	b.comp_t = clampf(comp, 0.0, 1.0); b.furn_t = clampf(furn, 0.0, 1.0); b.flow_t = clampf(flow, 0.0, 1.0)
	b.cool_t = clampf(cool, 0.0, 1.0); b.flare_t = clampf(flare, 0.0, 1.0); b.snap()
	return b.fill(int(seconds * BED_RATE))

# ---------------------------------------------------------------- DSP helpers (static)
static func to_wav(buf: PackedFloat32Array, rate: int, loop: bool) -> AudioStreamWAV:
	var d := PackedByteArray(); d.resize(buf.size() * 2)
	for i in buf.size(): d.encode_s16(i * 2, int(clampf(buf[i], -1.0, 1.0) * 32000.0))
	var s := AudioStreamWAV.new(); s.format = AudioStreamWAV.FORMAT_16_BITS; s.mix_rate = rate; s.data = d
	if loop: s.loop_mode = AudioStreamWAV.LOOP_FORWARD; s.loop_begin = 0; s.loop_end = buf.size()
	return s

static func _buf(seconds: float, rate := RATE) -> PackedFloat32Array:
	var b := PackedFloat32Array(); b.resize(int(seconds * rate)); return b

static func _add(dst: PackedFloat32Array, src: PackedFloat32Array, start_s: float, gain := 1.0, rate := RATE, wrap := false) -> void:
	var s0 := int(start_s * rate); var n := dst.size()
	for i in src.size():
		var j := s0 + i
		if wrap: j = j % n
		elif j >= n: break
		dst[j] += src[i] * gain

static func peak(b: PackedFloat32Array) -> float:
	var p := 0.0
	for v in b: p = maxf(p, absf(v))
	return p

static func normalize(b: PackedFloat32Array, target: float) -> void:
	var p := peak(b)
	if p < 1e-9: return
	var k := target / p
	for i in b.size(): b[i] *= k

static func _rng(seed_: int) -> RandomNumberGenerator:
	var r := RandomNumberGenerator.new(); r.seed = seed_; return r

static func _nb(rng: RandomNumberGenerator, dur: float, decay: float, amp: float, rate := RATE) -> PackedFloat32Array:
	var b := _buf(dur, rate)
	for i in b.size():
		var t := float(i) / rate
		b[i] = rng.randf_range(-1.0, 1.0) * amp * exp(-t * decay) * minf(1.0, t / 0.0006)
	return b

static func _noise(rng: RandomNumberGenerator, dur: float, rate := RATE) -> PackedFloat32Array:
	var b := _buf(dur, rate)
	for i in b.size(): b[i] = rng.randf_range(-1.0, 1.0)
	return b

static func _modal(freq: float, decay: float, amp: float, dur: float, rate := RATE) -> PackedFloat32Array:
	var b := _buf(dur, rate)
	for i in b.size():
		var t := float(i) / rate
		b[i] = sin(TAU * freq * t) * amp * exp(-t * decay) * minf(1.0, t / 0.0015)
	return b

static func _thump(f0: float, f1: float, glide: float, decay: float, amp: float, dur: float, rate := RATE) -> PackedFloat32Array:
	var b := _buf(dur, rate); var ph := 0.0
	for i in b.size():
		var t := float(i) / rate
		ph += (f1 + (f0 - f1) * exp(-t * glide)) / rate
		b[i] = sin(TAU * ph) * amp * exp(-t * decay) * minf(1.0, t / 0.001)
	return b

## RBJ band-pass (0 dB peak), centre sweeps f0 -> f1 over the buffer.
static func _bp(x: PackedFloat32Array, f0: float, f1: float, q: float, rate := RATE) -> PackedFloat32Array:
	var y := PackedFloat32Array(); y.resize(x.size())
	var x1 := 0.0; var x2 := 0.0; var y1 := 0.0; var y2 := 0.0
	var b0 := 0.0; var a1 := 0.0; var a2 := 0.0
	for i in x.size():
		if i % 8 == 0:
			var f := lerpf(f0, f1, float(i) / maxf(1.0, float(x.size())))
			var w := TAU * f / rate; var al := sin(w) / (2.0 * q); var a0 := 1.0 + al
			b0 = al / a0; a1 = -2.0 * cos(w) / a0; a2 = (1.0 - al) / a0
		var o := b0 * (x[i] - x2) - a1 * y1 - a2 * y2
		x2 = x1; x1 = x[i]; y2 = y1; y1 = o; y[i] = o
	return y

static func _lp(x: PackedFloat32Array, fc: float, rate := RATE) -> PackedFloat32Array:
	var y := PackedFloat32Array(); y.resize(x.size())
	var k := 1.0 - exp(-TAU * fc / rate); var s := 0.0
	for i in x.size():
		s += (x[i] - s) * k; y[i] = s
	return y

static func _hp(x: PackedFloat32Array, fc: float, rate := RATE) -> PackedFloat32Array:
	var l := _lp(x, fc, rate); var y := PackedFloat32Array(); y.resize(x.size())
	for i in x.size(): y[i] = x[i] - l[i]
	return y

## Warmth: two cascaded one-poles at 4.8 kHz (about -12 dB/oct above), so nothing harsh survives above 5 kHz.
static func _warm(x: PackedFloat32Array, rate := RATE) -> PackedFloat32Array:
	return _lp(_lp(x, 4800.0, rate), 4800.0, rate)

# ---------------------------------------------------------------- one-shots
## Render one SFX to float samples at RATE, low-passed, peak-normalised to -6 dBFS, deterministic.
static func render_oneshot(kind: String) -> PackedFloat32Array:
	var r := _rng(hash(kind) & 0x7fffffff)
	var b: PackedFloat32Array
	match kind:
		"key":             # heavy key-switch: click, low thud, bottoming-out rebound
			b = _buf(0.30)
			_add(b, _thump(120.0, 52.0, 28.0, 20.0, 1.0, 0.25), 0.0)
			_add(b, _bp(_nb(r, 0.03, 220.0, 1.0), 2100.0, 2100.0, 1.4), 0.0)
			_add(b, _modal(640.0, 80.0, 0.35, 0.1), 0.0); _add(b, _modal(1020.0, 110.0, 0.2, 0.08), 0.0)
			_add(b, _bp(_nb(r, 0.02, 260.0, 0.45), 1500.0, 1500.0, 1.2), 0.07)
		"knob_tick":       # Bakelite detent: dry, bright-ish, tiny
			b = _buf(0.05)
			_add(b, _bp(_nb(r, 0.012, 420.0, 1.0), 2400.0, 2400.0, 2.5), 0.0)
			_add(b, _modal(1700.0, 260.0, 0.45, 0.04), 0.0); _add(b, _modal(2650.0, 320.0, 0.25, 0.03), 0.0)
		"valve":           # chunk
			b = _buf(0.28)
			_add(b, _thump(88.0, 42.0, 24.0, 17.0, 1.0, 0.25), 0.0)
			_add(b, _bp(_nb(r, 0.07, 60.0, 0.7), 650.0, 380.0, 0.9), 0.0)
			_add(b, _modal(310.0, 45.0, 0.4, 0.15), 0.0); _add(b, _modal(190.0, 38.0, 0.3, 0.18), 0.0)
		"pipe_connect":    # clunk then a short hiss of air
			b = _buf(0.5)
			_add(b, _thump(150.0, 70.0, 30.0, 22.0, 0.9, 0.2), 0.0)
			_add(b, _modal(430.0, 55.0, 0.45, 0.15), 0.0); _add(b, _modal(980.0, 80.0, 0.2, 0.1), 0.0)
			var hs := _bp(_nb(r, 0.35, 11.0, 0.55), 3200.0, 1800.0, 0.7)
			_add(b, hs, 0.05)
		"lock":            # soft major chord, three partials, slow attack
			b = _buf(1.1)
			for f in [523.25, 659.25, 783.99]:
				for i in b.size():
					var t := float(i) / RATE
					b[i] += sin(TAU * f * t) * minf(1.0, t / 0.09) * exp(-maxf(0.0, t - 0.1) * 3.4) * 0.5
		"slip":            # minor-second rub: two close tones beat, wobble, a bit of friction
			b = _buf(0.75)
			for i in b.size():
				var t := float(i) / RATE
				var env := minf(1.0, t / 0.03) * exp(-maxf(0.0, t - 0.1) * 2.6)
				var wob := 1.0 + 0.012 * sin(TAU * 6.0 * t)
				var a := sin(TAU * 440.0 * wob * t) + 0.35 * sin(TAU * 880.0 * wob * t)
				var c := sin(TAU * 466.16 * wob * t) + 0.35 * sin(TAU * 932.3 * wob * t)
				b[i] = (a + c) * 0.35 * env * (0.75 + 0.25 * sin(TAU * 26.0 * t))
			_add(b, _bp(_nb(r, 0.4, 5.0, 0.12), 1200.0, 800.0, 1.0), 0.0)
		"intercom":        # click, band-limited crackle, then a quiet carrier hush before the line
			b = _buf(0.45)
			_add(b, _modal(900.0, 150.0, 0.5, 0.05), 0.0); _add(b, _bp(_nb(r, 0.015, 400.0, 1.0), 1500.0, 1500.0, 1.5), 0.0)
			var cr := _buf(0.3)
			for i in cr.size():
				var t := float(i) / RATE
				var env := minf(1.0, t / 0.02) * minf(1.0, (0.3 - t) / 0.08)
				if r.randf() < 0.012: cr[i] = r.randf_range(-1.0, 1.0) * 1.6 * env
				cr[i] += r.randf_range(-1.0, 1.0) * 0.13 * env
			_add(b, _bp(cr, 1400.0, 1400.0, 0.7), 0.04)
			_add(b, _bp(_nb(r, 0.03, 160.0, 0.5), 1100.0, 1100.0, 1.2), 0.36)
		"typewriter":      # three type-bar clacks
			b = _buf(0.3)
			var tm := [0.0, 0.075, 0.16]
			for j in 3:
				var g := 1.0 - 0.15 * float(j)
				_add(b, _bp(_nb(r, 0.02, 250.0, 0.9), 1800.0 + 250.0 * j, 1800.0, 1.1), float(tm[j]), g)
				_add(b, _modal(820.0 + 70.0 * j, 120.0, 0.35, 0.05), float(tm[j]), g)
				_add(b, _thump(160.0, 100.0, 40.0, 60.0, 0.5, 0.04), float(tm[j]), g)
		"printer":         # dot-matrix chatter, 0.8 s: carriage buzz in line bursts + feed ratchet
			b = _buf(0.8)
			var seg := [[0.0, 0.2], [0.24, 0.2], [0.48, 0.2]]
			for si in seg.size():
				var st: float = seg[si][0]; var d: float = seg[si][1]
				var bz := _buf(d); var ph := 0.0
				for i in bz.size():
					var t := float(i) / RATE
					ph += (170.0 + 12.0 * float(si)) / RATE
					var pulse := 1.0 if fposmod(ph * 9.0, 1.0) < 0.35 else -0.4     # 9-pin firing pattern
					var jit := 0.7 + 0.3 * (1.0 if r.randf() < 0.6 else 0.0)
					bz[i] = pulse * jit * minf(1.0, t / 0.01) * minf(1.0, (d - t) / 0.015)
				_add(b, _bp(bz, 1700.0 + 200.0 * si, 1700.0 + 200.0 * si, 0.6), st)
			for j in 5: _add(b, _bp(_nb(r, 0.015, 300.0, 0.5), 1000.0, 1000.0, 1.5), 0.68 + 0.025 * j)
		"tear":            # paper tear: ripping noise with ragged bursts
			b = _buf(0.5)
			var tn := _buf(0.5)
			for i in tn.size():
				var t := float(i) / RATE
				var rag := 0.45 + 0.55 * (1.0 if fposmod(t * 53.0 + 0.3 * sin(TAU * 7.0 * t), 1.0) < 0.55 else 0.25)
				tn[i] = r.randf_range(-1.0, 1.0) * rag * minf(1.0, t / 0.01) * minf(1.0, (0.5 - t) / 0.12)
			_add(b, _bp(tn, 1400.0, 3200.0, 0.8), 0.0)
			_add(b, _hp(_nb(r, 0.5, 10.0, 0.18), 700.0), 0.0)
		"stamp":           # rubber stamp on paper: dull thud + soft slap
			b = _buf(0.3)
			_add(b, _thump(115.0, 58.0, 33.0, 24.0, 1.0, 0.25), 0.0)
			_add(b, _bp(_nb(r, 0.05, 80.0, 0.75), 1100.0, 1100.0, 0.6), 0.0)
			_add(b, _lp(_nb(r, 0.1, 38.0, 0.25), 2300.0), 0.0); _add(b, _modal(230.0, 42.0, 0.3, 0.12), 0.0)
		"relief_pop":      # pop, then a 1.5 s roaring hiss that dies away
			b = _buf(1.7)
			_add(b, _thump(260.0, 70.0, 60.0, 40.0, 1.0, 0.12), 0.0)
			_add(b, _bp(_nb(r, 0.05, 90.0, 0.9), 1200.0, 1200.0, 0.7), 0.0)
			var rn := _noise(r, 1.6)
			for i in rn.size():
				var t := float(i) / RATE
				rn[i] *= minf(1.0, t / 0.05) * exp(-maxf(0.0, t - 0.25) * 1.9) * 0.9 * (0.9 + 0.1 * sin(TAU * 17.0 * t))
			_add(b, _bp(rn, 2200.0, 1500.0, 0.55), 0.03, 0.8); _add(b, _bp(rn, 650.0, 500.0, 0.8), 0.03, 0.9)
		"vent_whoosh":     # steam vent: noise swelling and sweeping up then falling
			b = _buf(1.2)
			var wn := _noise(r, 1.2)
			for i in wn.size():
				var u := float(i) / float(wn.size())
				wn[i] *= pow(sin(PI * pow(u, 0.7)), 2.0)
			_add(b, _bp(wn, 600.0, 2600.0, 0.7), 0.0); _add(b, _lp(wn, 400.0), 0.0, 0.5)
		"surge_thump":     # compressor surge: deep thump, a smaller echo, rumble
			b = _buf(0.95)
			_add(b, _thump(75.0, 30.0, 15.0, 6.5, 1.0, 0.7), 0.0)
			_add(b, _thump(65.0, 28.0, 15.0, 7.5, 0.5, 0.5), 0.3)
			_add(b, _lp(_nb(r, 0.8, 4.0, 0.6), 160.0), 0.0, 1.2)
		"catalyst_crack":  # sharp crack, ceramic ringing, a few trailing ticks
			b = _buf(0.55)
			_add(b, _bp(_nb(r, 0.03, 160.0, 1.0), 2600.0, 2600.0, 0.9), 0.0)
			_add(b, _modal(1250.0, 60.0, 0.4, 0.2), 0.0); _add(b, _modal(1930.0, 80.0, 0.3, 0.15), 0.0); _add(b, _modal(2780.0, 100.0, 0.18, 0.12), 0.0)
			for j in 4: _add(b, _bp(_nb(r, 0.012, 380.0, 0.5 - 0.1 * j), 2100.0 + 250.0 * j, 2100.0, 1.5), 0.09 + 0.07 * j + 0.02 * r.randf())
			_add(b, _thump(140.0, 80.0, 40.0, 30.0, 0.4, 0.1), 0.0)
		"ack":             # annunciator acknowledge: one short soft beep
			b = _buf(0.14)
			for i in b.size():
				var t := float(i) / RATE
				b[i] = (sin(TAU * 880.0 * t) + 0.25 * sin(TAU * 1760.0 * t)) * minf(1.0, t / 0.006) * minf(1.0, (0.14 - t) / 0.03)
		"place":           # a unit set down: metal on concrete
			b = _buf(0.4)
			_add(b, _thump(165.0, 78.0, 38.0, 28.0, 1.0, 0.25), 0.0)
			_add(b, _bp(_nb(r, 0.025, 180.0, 0.8), 1000.0, 1000.0, 0.8), 0.0)
			_add(b, _modal(780.0, 38.0, 0.35, 0.3), 0.0); _add(b, _modal(1230.0, 50.0, 0.25, 0.25), 0.0); _add(b, _modal(2110.0, 65.0, 0.15, 0.2), 0.0)
		"molecule_pop":    # tiny bubbly pop
			b = _buf(0.13)
			var ph2 := 0.0
			for i in b.size():
				var t := float(i) / RATE
				ph2 += lerpf(1500.0, 620.0, minf(1.0, t / 0.05)) / RATE
				b[i] = sin(TAU * ph2) * exp(-t * 40.0) * minf(1.0, t / 0.002)
			var ph3 := 0.0
			for i in b.size():
				var t := float(i) / RATE
				if t < 0.03: continue
				ph3 += lerpf(1900.0, 900.0, minf(1.0, (t - 0.03) / 0.04)) / RATE
				b[i] += sin(TAU * ph3) * exp(-(t - 0.03) * 55.0) * 0.5
		"cat_meow":        # gentle "mee-ow": additive voice, two sweeping formants
			b = _buf(0.4)
			var ph4 := 0.0
			for i in b.size():
				var t := float(i) / RATE; var u := t / 0.4
				var f0 := 520.0 + 300.0 * sin(PI * pow(u, 0.8)) - 60.0 * u
				ph4 += f0 * (1.0 + 0.01 * sin(TAU * 6.0 * t)) / RATE
				var fm1 := lerpf(450.0, 950.0, minf(1.0, u * 1.6)); var fm2 := lerpf(2600.0, 1400.0, u)
				var acc := 0.0
				for h in range(1, 13):
					var fh := f0 * float(h)
					if fh > 4400.0: break
					var wgt := exp(-pow((fh - fm1) / 280.0, 2.0)) + 0.5 * exp(-pow((fh - fm2) / 450.0, 2.0))
					acc += sin(TAU * ph4 * float(h)) * wgt / float(h)
				b[i] = acc * minf(1.0, t / 0.04) * minf(1.0, (0.4 - t) / 0.12)
		_:
			b = _buf(0.05)
	b = _warm(b)
	normalize(b, PEAK_N6)
	return b

# ---------------------------------------------------------------- alarms (loop buffers, seamless)
## One loop period of an alarm tone at RATE, peak -6 dBFS. low: a single soft chime (4 s period); high: two-tone beep
## (0.5 s period); critical: klaxon sweep (1.2 s period, exactly 900 cycles of the fundamental so the loop is click-free).
static func render_alarm(level: String) -> PackedFloat32Array:
	var b: PackedFloat32Array
	match level:
		"low":
			b = _buf(4.0)
			for pr in [[523.25, 1.0], [784.0, 0.5], [1046.5, 0.25]]:
				for i in int(1.6 * RATE):
					var t := float(i) / RATE
					b[i] += sin(TAU * float(pr[0]) * t) * float(pr[1]) * minf(1.0, t / 0.015) * exp(-t * 3.2)
		"high":
			b = _buf(0.5)
			for bp in [[880.0, 0.0], [660.0, 0.25]]:
				for i in int(0.13 * RATE):
					var t := float(i) / RATE
					var j := i + int(float(bp[1]) * RATE)
					b[j] += (sin(TAU * float(bp[0]) * t) + 0.3 * sin(TAU * 3.0 * float(bp[0]) * t)) * minf(1.0, t / 0.008) * minf(1.0, (0.13 - t) / 0.02)
		_:
			b = _buf(1.2)
			var ph := 0.0
			for i in b.size():
				var t := float(i) / RATE
				ph += (600.0 + 300.0 * (0.5 - 0.5 * cos(TAU * t / 1.2))) / RATE
				var a := TAU * ph
				b[i] = sin(a) + 0.5 * sin(2.0 * a) + 0.3 * sin(3.0 * a) + 0.15 * sin(4.0 * a)
	normalize(b, PEAK_N6)
	return b

# ---------------------------------------------------------------- music
## Stem gains for the active piece. Percussion fades in above stress 0.4; Critical replaces the beat with the tense drone.
static func stem_gains(stress_v: float, critical_v: bool) -> Dictionary:
	var perc := smoothstep(0.4, 0.7, stress_v) * 0.9
	return {"base": 0.6 if critical_v else 1.0, "perc": 0.0 if critical_v else perc, "tense": 1.0 if critical_v else 0.0}

static func _mf(midi: float) -> float:
	return 440.0 * pow(2.0, (midi - 69.0) / 12.0)

## Snap a frequency to a whole number of cycles over `loop_s` seconds so the sine loops seamlessly.
static func _snap(f: float, loop_s: float) -> float:
	return roundf(f * loop_s) / loop_s

## Crossfade the tail beyond n samples into the head so noise layers loop without a click.
static func _loopify(x: PackedFloat32Array, n: int) -> PackedFloat32Array:
	var y := PackedFloat32Array(); y.resize(n)
	var m := x.size() - n
	for i in n: y[i] = x[i]
	for i in m:
		var w := float(i) / float(m)
		y[i] = x[i] * w + x[n + i] * (1.0 - w)
	return y

## Detuned warm pad note (sines with soft harmonics), long attack and release.
static func _pad_note(f: float, dur: float, att: float, r: RandomNumberGenerator, amp: float) -> PackedFloat32Array:
	var nb := int(dur * MRATE); var note := PackedFloat32Array(); note.resize(nb)
	var p1 := r.randf(); var p2 := r.randf()
	for i in nb:
		var t := float(i) / MRATE
		var env := minf(1.0, t / att) * minf(1.0, (dur - t) / att)
		p1 += f / MRATE; p2 += f * 1.0045 / MRATE
		note[i] = (sin(TAU * p1) + sin(TAU * p2) + 0.25 * sin(TAU * 2.0 * p1) + 0.08 * sin(TAU * 3.0 * p2)) * env * amp
	return note

## FM marimba pluck: modulator at ~4x carrier with a fast-falling index, woody decay.
static func _marimba(f: float, dur: float) -> PackedFloat32Array:
	var b := _buf(dur, MRATE)
	for i in b.size():
		var t := float(i) / MRATE
		var idx := 2.6 * exp(-t * 22.0)
		b[i] = (sin(TAU * f * t + idx * sin(TAU * f * 3.99 * t)) + 0.25 * sin(TAU * f * 2.0 * t) * exp(-t * 20.0)) * exp(-t * 6.0) * minf(1.0, t / 0.002)
	return b

## Saw through a one-pole whose cutoff falls from c0 to c1 (acid-ish pluck/bass).
static func _saw_pluck(f: float, dur: float, c0: float, c1: float, decay: float) -> PackedFloat32Array:
	var b := _buf(dur, MRATE); var ph := 0.0; var s := 0.0
	for i in b.size():
		var t := float(i) / MRATE
		ph = fposmod(ph + f / MRATE, 1.0)
		var fc := c1 + (c0 - c1) * exp(-t * decay)
		s += ((ph * 2.0 - 1.0) - s) * (1.0 - exp(-TAU * fc / MRATE))
		b[i] = s * minf(1.0, t / 0.004) * minf(1.0, (dur - t) / 0.02)
	return b

static func _tense(root_hz: float, loop_s: float, r: RandomNumberGenerator) -> PackedFloat32Array:
	var n := int(loop_s * MRATE); var out := _buf(loop_s, MRATE)
	var f0 := _snap(root_hz, loop_s); var f1 := _snap(root_hz * 1.0595, loop_s); var f2 := _snap(root_hz * 1.4142, loop_s)   # minor second + tritone
	var lfo := 4.0 / loop_s
	for i in n:
		var t := float(i) / MRATE
		var trem := 0.65 + 0.35 * sin(TAU * lfo * t)
		out[i] = (sin(TAU * f0 * t) + 0.8 * sin(TAU * f1 * t) + 0.5 * sin(TAU * f2 * t) + 0.25 * sin(TAU * 2.0 * f0 * t)) * trem
	var nz := _noise(r, loop_s + 0.5, MRATE)
	nz = _loopify(_lp(nz, 180.0, MRATE), n)
	for i in n: out[i] += nz[i] * 5.0
	normalize(out, 0.5)
	return out

## Render one piece as {base, perc, tense}; all three stems have identical length and loop seamlessly.
static func render_piece(name: String) -> Dictionary:
	match name:
		"title": return _piece_title()
		"shift": return _piece_shift()
		_: return _piece_design()

## TITLE: 60 BPM, 8 bars, D, slow and warm. Wide pad chords, a plant hum underneath (55 Hz + noise breathing), sparse glass bells. No beat
## until stressed (then only a heartbeat-like soft thud on 1).
static func _piece_title() -> Dictionary:
	var r := _rng(60)
	var bar := 4.0; var loop_s := 8.0 * bar; var n := int(loop_s * MRATE)
	var base := _buf(loop_s, MRATE); var perc := _buf(loop_s, MRATE)
	var chords := [[50, 57, 62, 65, 69], [46, 53, 62, 65, 69], [43, 50, 58, 62, 65], [45, 52, 59, 62, 67],
		[50, 57, 62, 65, 69], [46, 53, 62, 65, 69], [48, 55, 60, 64, 67], [45, 52, 57, 61, 64]]      # Dm9 Bbmaj7 Gm7 Asus4 | Dm9 Bbmaj7 C A
	for bi in 8:
		for m in chords[bi]:
			_add(base, _pad_note(_mf(float(m)), bar * 1.4, 1.4, r, 0.07), bi * bar, 1.0, MRATE, true)
	var hum := _buf(loop_s, MRATE)
	var f1 := _snap(55.0, loop_s); var f2 := _snap(110.3, loop_s)
	for i in n:
		var t := float(i) / MRATE
		hum[i] = (sin(TAU * f1 * t) * 0.8 + sin(TAU * f2 * t) * 0.35 + sin(TAU * 165.0 * t) * 0.08) * (0.8 + 0.2 * sin(TAU * 2.0 / loop_s * t))
	var hn := _loopify(_bp(_noise(r, loop_s + 0.5, MRATE), 220.0, 220.0, 0.8, MRATE), n)
	for i in n: hum[i] += hn[i] * 2.0
	normalize(hum, 0.6)
	for i in n: base[i] += hum[i] * 0.55
	var bells := [74, 77, 81, 79, 86, 84, 77, 72]
	for bi in 8:
		var bt := bi * bar + (1.0 if bi % 2 == 0 else 2.5)
		var f := _mf(float(bells[bi]))
		var bb := _buf(3.0, MRATE)
		_add(bb, _modal(f, 1.6, 1.0, 3.0, MRATE), 0.0); _add(bb, _modal(f * 2.756, 4.0, 0.25, 1.5, MRATE), 0.0); _add(bb, _modal(f * 5.4, 9.0, 0.08, 0.8, MRATE), 0.0)
		_add(base, bb, bt, 0.12, MRATE, true)
	for bi in 8:        # soft heartbeat thuds
		_add(perc, _thump(70.0, 40.0, 20.0, 8.0, 0.8, 0.5, MRATE), bi * bar, 1.0, MRATE, true)
		_add(perc, _thump(60.0, 38.0, 20.0, 9.0, 0.5, 0.4, MRATE), bi * bar + 0.45, 1.0, MRATE, true)
	normalize(base, 0.6); normalize(perc, 0.5)
	return {"base": base, "perc": perc, "tense": _tense(36.7, loop_s, r)}

## DESIGN: 84 BPM, 16 bars, A minor. Marimba FM plucks on a 3-3-2 syncopation over a slow pad, plucked bass, shaker, rim, soft kick on 1.
static func _piece_design() -> Dictionary:
	var r := _rng(84)
	var beat := 60.0 / 84.0; var bar := beat * 4.0; var bars := 16; var loop_s := bar * bars
	var base := _buf(loop_s, MRATE); var perc := _buf(loop_s, MRATE)
	var minor := [0, 2, 3, 5, 7, 8, 10]
	var root := 57          # A3
	var prog := [0, 5, 2, 6, 0, 5, 2, 6, 0, 5, 3, 4, 0, 5, 3, 4]   # scale degrees: Am F C G | Am F C G | Am F Dm E | ... (E uses harmonic G#)
	for bi in bars:
		var deg: int = prog[bi]; var t0 := bi * bar
		for k in [0, 2, 4]:
			var m := _scale_midi(root, minor, deg + k, 0)
			if deg == 4 and bi >= 8 and k == 2: m += 1          # E major: raised G
			_add(base, _pad_note(_mf(float(m)), bar * 1.25, 0.8, r, 0.06), t0, 1.0, MRATE, true)
		var bm := _scale_midi(root, minor, deg, -1)
		for st in [0.0, 2.0]:
			_add(base, _modal(_mf(float(bm)), 3.0, 0.6, 1.2, MRATE), t0 + st * beat, 1.0, MRATE, true)
			_add(base, _modal(_mf(float(bm)) * 2.0, 6.0, 0.15, 0.6, MRATE), t0 + st * beat, 1.0, MRATE, true)
		var pat := [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0]
		var arp := [0, 2, 4, 2, 7, 4, 2, 4]
		var ai := (bi * 3) % 8
		for s in 16:
			if pat[s] == 0: continue
			if r.randf() < 0.12: continue
			var dg: int = deg + int(arp[ai % 8]) + (7 if (s > 7 and bi % 4 == 3) else 0)
			ai += 1
			var m := _scale_midi(root, minor, dg, 1)
			if deg == 4 and bi >= 8 and posmod(dg - deg, 7) == 2: m += 1
			_add(base, _marimba(_mf(float(m)), 0.9), t0 + float(s) * beat * 0.25, 0.32, MRATE, true)
		_add(perc, _thump(80.0, 48.0, 22.0, 12.0, 0.7, 0.3, MRATE), t0, 1.0, MRATE, true)
		_add(perc, _bp(_nb(r, 0.04, 140.0, 0.6, MRATE), 1300.0, 1300.0, 3.0, MRATE), t0 + 3.0 * beat, 1.0, MRATE, true)
		for e in 8:
			_add(perc, _hp(_nb(r, 0.07, 60.0, 0.22 if e % 2 == 1 else 0.12, MRATE), 2800.0, MRATE), t0 + e * beat * 0.5, 1.0, MRATE, true)
	normalize(base, 0.6); normalize(perc, 0.5)
	return {"base": base, "perc": perc, "tense": _tense(55.0, loop_s, r)}

static func _scale_midi(root_midi: int, scale: Array, deg: int, oct: int) -> int:
	var o := int(floor(float(deg) / scale.size())); var d := posmod(deg, scale.size())
	return root_midi + int(scale[d]) + 12 * (oct + o)

## SHIFT: 112 BPM, 16 bars, E minor. Driving pulse: filtered saw bass in eighths with octave jumps, offbeat stabs, four-on-the-floor filtered
## kick, clap on 2/4, 16th hats. The base stem carries bass+stabs (always pulsing); the perc stem is kick+clap+hats.
static func _piece_shift() -> Dictionary:
	var r := _rng(112)
	var beat := 60.0 / 112.0; var bar := beat * 4.0; var bars := 16; var loop_s := bar * bars
	var base := _buf(loop_s, MRATE); var perc := _buf(loop_s, MRATE)
	var rootm := [40, 40, 36, 38, 40, 43, 36, 35]            # E E C D | E G C B (per 2 bars)
	var chords := [[64, 67, 71], [64, 67, 71], [60, 64, 67], [62, 66, 69], [64, 67, 71], [67, 71, 74], [60, 64, 67], [59, 63, 66]]
	var bass_pat := [0, 0, 12, 0, 0, 7, 0, 12]
	for bi in bars:
		var t0 := bi * bar; var seg: int = (bi / 2) % 8
		var rm: int = rootm[seg]
		for e in 8:
			var m := rm + int(bass_pat[(e + (bi % 2) * 3) % 8])
			var acc := 1.0 if e % 4 == 0 else 0.7
			_add(base, _saw_pluck(_mf(float(m)), beat * 0.48, 1400.0 + 500.0 * float(bi % 4), 160.0, 14.0), t0 + e * beat * 0.5, 0.5 * acc, MRATE, true)
		for st in [1.5, 3.5]:
			if bi % 4 == 3 and st == 3.5: continue
			for m in chords[seg]:
				_add(base, _saw_pluck(_mf(float(m)), 0.22, 2400.0, 500.0, 18.0), t0 + st * beat, 0.16, MRATE, true)
		for k in 4:
			_add(perc, _thump(135.0, 46.0, 38.0, 13.0, 1.0, 0.3, MRATE), t0 + k * beat, 1.0, MRATE, true)
		for k in [1, 3]:
			_add(perc, _bp(_nb(r, 0.12, 38.0, 0.8, MRATE), 1500.0, 1300.0, 0.9, MRATE), t0 + k * beat, 0.5, MRATE, true)
		for s in 16:
			var open := s % 4 == 2
			var hv := 0.34 if open else (0.14 if s % 2 == 1 else 0.07)
			_add(perc, _hp(_nb(r, 0.14 if open else 0.035, 30.0 if open else 110.0, hv, MRATE), 3200.0, MRATE), t0 + s * beat * 0.25, 1.0, MRATE, true)
	normalize(base, 0.6); normalize(perc, 0.55)
	return {"base": base, "perc": perc, "tense": _tense(41.2, loop_s, r)}

## Mix a piece's stems for `seconds` (looping) at the given stress/critical state, peak 0.8, with fades. For listening checks.
static func mix_music(stems: Dictionary, seconds: float, stress_v: float, critical_v: bool) -> PackedFloat32Array:
	var g := stem_gains(stress_v, critical_v); var n := int(seconds * MRATE)
	var out := PackedFloat32Array(); out.resize(n)
	for k in ["base", "perc", "tense"]:
		var s: PackedFloat32Array = stems[k]; var gk := float(g[k])
		if gk <= 0.0: continue
		for i in n: out[i] += s[i % s.size()] * gk
	normalize(out, 0.8)
	for i in n: out[i] *= minf(1.0, minf(float(i) / (MRATE * 0.5), float(n - i) / (MRATE * 1.0)))
	return out
