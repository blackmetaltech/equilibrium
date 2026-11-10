extends SceneTree
## Audio truth (DESIGN 5.7): every one-shot renders a non-silent, NaN-free buffer with peak <= -1 dBFS, deterministic; the compressor pitch is
## the formula 60 + 80 p^0.3 (measured on the rendered bed, not just the helper); alarm priority logic; setters clamp; quiet plant is quiet;
## alarm loops are seamless and band-limited; headless creates no threads.
## godot --headless --path godot -s tests/audio_truth.gd
const EA = preload("res://audio/eq_audio.gd")
var fails := 0
var n_checks := 0

func check(ok: bool, msg: String) -> void:
	n_checks += 1
	if not ok: fails += 1; printerr("FAIL: " + msg)

func _stats(b: PackedFloat32Array) -> Dictionary:
	var pk := 0.0; var sq := 0.0; var bad := false
	for v in b:
		if is_nan(v) or is_inf(v): bad = true; continue
		pk = maxf(pk, absf(v)); sq += v * v
	return {"peak": pk, "rms": sqrt(sq / maxf(1.0, b.size())), "bad": bad}

## Strongest frequency in [lo, hi] Hz over the last `secs` s (Goertzel scan).
func _dominant(buf: PackedFloat32Array, rate: int, lo: float, hi: float, step: float, secs := 3.0) -> float:
	var start := maxi(0, buf.size() - int(secs * rate)); var best_f := lo; var best := -1.0
	var f := lo
	while f <= hi:
		var co := 2.0 * cos(TAU * f / rate); var s1 := 0.0; var s2 := 0.0
		for i in range(start, buf.size()):
			var s := buf[i] + co * s1 - s2; s2 = s1; s1 = s
		var p := s1 * s1 + s2 * s2 - co * s1 * s2
		if p > best: best = p; best_f = f
		f += step
	return best_f

## Fraction of energy above fc (Goertzel bank, coarse).
func _hf_fraction(buf: PackedFloat32Array, rate: int, fc: float) -> float:
	var tot := 0.0; var hi := 0.0; var f := 200.0
	var cap := mini(buf.size(), rate)        # first second is enough
	while f < rate / 2.0 - 400.0:
		var co := 2.0 * cos(TAU * f / rate); var s1 := 0.0; var s2 := 0.0
		for i in cap:
			var s := buf[i] + co * s1 - s2; s2 = s1; s1 = s
		var p := s1 * s1 + s2 * s2 - co * s1 * s2
		tot += p
		if f > fc: hi += p
		f += 400.0
	return hi / maxf(tot, 1e-12)

func _initialize() -> void:
	# --- one-shots
	for k in EA.ONE_SHOTS:
		var a: PackedFloat32Array = EA.render_oneshot(k)
		var st := _stats(a)
		check(a.size() > 0, "%s renders samples" % k)
		check(not st.bad, "%s has no NaN/inf" % k)
		check(st.peak > 0.3 and st.rms > 0.005, "%s non-silent (peak %.3f rms %.4f)" % [k, st.peak, st.rms])
		check(st.peak <= 0.8913, "%s peak <= -1 dBFS (%.3f)" % [k, st.peak])
		check(a == EA.render_oneshot(k), "%s deterministic" % k)
		check(float(a.size()) / EA.RATE < 2.0, "%s shorter than 2 s" % k)
	check("molecule_pop" in EA.ONE_SHOTS and "cat_meow" in EA.ONE_SHOTS, "cute one-shots registered")
	check(float(EA.render_oneshot("printer").size()) / EA.RATE > 0.79 and float(EA.render_oneshot("printer").size()) / EA.RATE < 0.85, "printer is ~0.8 s")
	check(float(EA.render_oneshot("relief_pop").size()) / EA.RATE >= 1.6, "relief pop carries a 1.5 s roar")
	for k in ["key", "relief_pop", "catalyst_crack", "pipe_connect"]:
		check(_hf_fraction(EA.render_oneshot(k), EA.RATE, 5000.0) < 0.06, "%s is low-passed (%.3f of energy above 5 kHz)" % [k, _hf_fraction(EA.render_oneshot(k), EA.RATE, 5000.0)])
	# --- pitch truth: formula, and the rendered drone really is at that pitch
	var a = EA.new()
	var truth := {0.0: 60.0, 1.0: 140.0}
	for p in [0.0, 0.1, 0.25, 0.5, 0.75, 1.0]:
		a.set_compressor(p)
		var want := 60.0 + 80.0 * pow(p, 0.3)
		check(absf(a.compressor_hz() - want) < 1e-9, "compressor_hz(%.2f) = %.3f" % [p, a.compressor_hz()])
	for k in truth: check(absf(EA.hz_for_power(k) - float(truth[k])) < 1e-9, "range end %.0f -> %.0f Hz" % [k, truth[k]])
	var prev := 0.0
	for p in [0.05, 0.2, 0.5, 1.0]:
		check(EA.hz_for_power(p) > prev, "pitch monotone in power"); prev = EA.hz_for_power(p)
	for p in [0.3, 1.0]:
		var bed := EA.render_bed(p, 0, 0, 0, 0, 5.0)
		var want := EA.hz_for_power(p)
		var got := _dominant(bed, EA.BED_RATE, 50.0, 150.0, 0.25)
		check(absf(got - want) < 1.5, "rendered drone at p=%.1f: %.2f Hz vs formula %.2f" % [p, got, want])
	# --- quiet plant is quiet; layers add; nothing clips
	var q := _stats(EA.render_bed(0, 0, 0, 0, 0, 1.0))
	check(q.peak < 1e-6, "all-zero bed is silent (peak %.6f)" % q.peak)
	for lay in [[1, 0, 0, 0, 0], [0, 1, 0, 0, 0], [0, 0, 1, 0, 0], [0, 0, 0, 1, 0], [0, 0, 0, 0, 1]]:
		var full := _stats(EA.render_bed(lay[0], lay[1], lay[2], lay[3], lay[4], 4.0))
		var low := _stats(EA.render_bed(0.1 * lay[0], 0.1 * lay[1], 0.1 * lay[2], 0.1 * lay[3], 0.1 * lay[4], 4.0))
		check(not full.bad and full.rms > 0.01, "layer %s audible at full (rms %.4f)" % [str(lay), full.rms])
		check(full.peak <= 0.95, "layer %s peak <= 0.95 (%.3f)" % [str(lay), full.peak])
		check(low.rms < full.rms * 0.5, "layer %s quiet at 10 pct (%.4f vs %.4f)" % [str(lay), low.rms, full.rms])
	var all := _stats(EA.render_bed(1, 1, 1, 1, 1, 4.0))
	check(not all.bad and all.peak <= 0.95, "full plant bed bounded (peak %.3f)" % all.peak)
	# --- setters clamp
	a.set_compressor(7.0); check(a.comp_power == 1.0, "compressor clamps high")
	a.set_compressor(-3.0); check(a.comp_power == 0.0, "compressor clamps low")
	a.set_furnace(2.0); a.set_flow(2.0); a.set_cooling(2.0); a.set_flare(2.0)
	check(a.furnace_duty == 1.0 and a.flow_level == 1.0 and a.cooling_level == 1.0 and a.flare_level == 1.0, "layer setters clamp high")
	a.set_furnace(-1.0); a.set_flow(-1.0); a.set_cooling(-1.0); a.set_flare(-1.0)
	check(a.furnace_duty == 0.0 and a.flow_level == 0.0 and a.cooling_level == 0.0 and a.flare_level == 0.0, "layer setters clamp low")
	a.set_stress(5.0); check(a.stress == 1.0, "stress clamps high")
	a.set_stress(-5.0); check(a.stress == 0.0, "stress clamps low")
	# --- alarm priority logic
	check(a.alarm_audible() == "", "no alarm: silent")
	a.alarm("low"); check(a.alarm_audible() == "low", "low sounds alone")
	a.alarm("high"); check(a.alarm_audible() == "high", "high masks low")
	a.alarm("critical"); check(a.alarm_audible() == "critical", "critical masks high")
	check(a.alarm_state("high") == "active" and a.alarm_state("low") == "active", "masked alarms stay active")
	a.ack_alarm()
	check(a.alarm_audible() == "", "ack silences every tone")
	check(a.alarm_state("critical") == "acked" and a.alarm_state("high") == "acked" and a.alarm_state("low") == "acked", "ack keeps the state raised")
	a.alarm("critical"); check(a.alarm_audible() == "", "re-raising an acked alarm does not re-sound it")
	a.clear_alarm("critical"); check(a.alarm_state("critical") == "off" and a.alarm_state("high") == "acked", "clear drops only that level")
	a.alarm("critical"); check(a.alarm_audible() == "critical", "after clear a new raise sounds again")
	a.clear_alarm(); check(a.alarm_audible() == "" and a.alarm_state("low") == "off" and a.alarm_state("high") == "off", "clear all")
	a.alarm("bogus"); check(a.alarm_audible() == "", "unknown level ignored")
	a.alarm("high"); a.alarm("low"); check(a.alarm_audible() == "high", "high still masks a later low")
	# --- alarm tones: period, seamless loop, band-limited
	for pr in [["low", 4.0], ["high", 0.5], ["critical", 1.2]]:
		var al: PackedFloat32Array = EA.render_alarm(pr[0])
		var st := _stats(al)
		check(absf(float(al.size()) / EA.RATE - float(pr[1])) < 0.002, "%s alarm period %.3f" % [pr[0], float(al.size()) / EA.RATE])
		check(not st.bad and st.peak <= 0.8913 and st.peak > 0.3, "%s alarm level (peak %.3f)" % [pr[0], st.peak])
		var maxd := 0.0
		for i in range(1, al.size()): maxd = maxf(maxd, absf(al[i] - al[i - 1]))
		var wrap_d := absf(al[0] - al[al.size() - 1])
		check(wrap_d <= maxd * 1.05 + 1e-6, "%s loop seam step %.3f <= largest in-loop step %.3f" % [pr[0], wrap_d, maxd])
		check(_hf_fraction(al, EA.RATE, 5000.0) < 0.05, "%s alarm has no harsh content above 5 kHz" % pr[0])
	var hz := _dominant(EA.render_alarm("critical"), EA.RATE, 500.0, 1000.0, 5.0, 1.2)
	check(hz > 520.0 and hz < 950.0, "klaxon sweeps within 600-900 Hz band (%.0f)" % hz)
	# --- music: structure
	var g0 := EA.stem_gains(0.0, false); var g3 := EA.stem_gains(0.4, false); var g1 := EA.stem_gains(1.0, false); var gc := EA.stem_gains(1.0, true)
	check(g0.perc == 0.0 and g3.perc == 0.0 and g1.perc > 0.5, "percussion enters above stress 0.4")
	check(gc.perc == 0.0 and gc.tense == 1.0 and g1.tense == 0.0, "critical: tense drone replaces the beat")
	# --- headless: no threads, no voices playing
	check(a.headless, "running headless")
	root.add_child(a)
	a.start_music(); a.play("key"); a.set_title(true); a.set_piece("shift")
	check(not a.has_thread(), "headless start_music creates no thread")
	check(a.current_piece() == "title", "title state overrides the level piece")
	a.set_title(false); check(a.current_piece() == "shift", "leaving the title returns to the level piece")
	a.set_piece("bogus"); check(a.current_piece() == "shift", "unknown piece ignored")
	print("AUDIO-TRUTH: %s (%d checks, %d failures)" % ["PASS" if fails == 0 else "FAIL", n_checks, fails])
	quit(1 if fails > 0 else 0)

