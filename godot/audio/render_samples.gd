extends SceneTree
## Render every EQUILIBRIUM sound to WAV for listening checks, and assert basic sanity.
## godot --headless --path godot -s audio/render_samples.gd [-- out_dir]
const OUT := "/home/ixaxaar/src/ORGS/cobanana/.qa/equilibrium/audio/"
const EA = preload("res://audio/eq_audio.gd")
var fails := 0

func _init() -> void:
	var out := OUT
	var args := OS.get_cmdline_user_args()
	if args.size() > 0: out = args[0] if args[0].ends_with("/") else args[0] + "/"
	DirAccess.make_dir_recursive_absolute(out)
	for k in EA.ONE_SHOTS:
		var a := EA.render_oneshot(k)
		_report("sfx_" + k, a, EA.RATE, out)
	for lv in EA.ALARM_LEVELS:        # three loop repeats so the loop point can be heard
		var al := EA.render_alarm(lv); var rep := PackedFloat32Array()
		var reps := 3 if lv != "low" else 2
		for i in reps: rep.append_array(al)
		_report("alarm_" + lv, rep, EA.RATE, out)
	_report("bed_idle", EA.render_bed(0.0, 0.0, 0.1, 0.0, 0.0, 6.0), EA.BED_RATE, out)
	_report("bed_compressor_p0.1", EA.render_bed(0.1, 0, 0, 0, 0, 6.0), EA.BED_RATE, out)
	_report("bed_compressor_p1.0", EA.render_bed(1.0, 0, 0, 0, 0, 6.0), EA.BED_RATE, out)
	_report("bed_furnace", EA.render_bed(0, 1.0, 0, 0, 0, 6.0), EA.BED_RATE, out)
	_report("bed_flow", EA.render_bed(0, 0, 1.0, 0, 0, 6.0), EA.BED_RATE, out)
	_report("bed_cooling", EA.render_bed(0, 0, 0, 1.0, 0, 6.0), EA.BED_RATE, out)
	_report("bed_flare", EA.render_bed(0, 0, 0, 0, 1.0, 6.0), EA.BED_RATE, out)
	_report("bed_typical_running", EA.render_bed(0.6, 0.5, 0.5, 0.4, 0.0, 10.0), EA.BED_RATE, out)
	_report("bed_everything", EA.render_bed(1, 1, 1, 1, 1, 6.0), EA.BED_RATE, out)
	for pc in EA.PIECES:
		var t0 := Time.get_ticks_msec()
		var st := EA.render_piece(pc)
		print("render_piece(%s): %d ms, loop %.2f s" % [pc, Time.get_ticks_msec() - t0, float(st.base.size()) / EA.MRATE])
		_check(st.base.size() == st.perc.size() and st.base.size() == st.tense.size(), pc + " stems equal length")
		_check(st.base == EA.render_piece(pc).base, pc + " deterministic")
		_report("music_%s_calm" % pc, EA.mix_music(st, 20.0, 0.0, false), EA.MRATE, out)
		_report("music_%s_stress" % pc, EA.mix_music(st, 20.0, 1.0, false), EA.MRATE, out)
		_report("music_%s_critical" % pc, EA.mix_music(st, 20.0, 1.0, true), EA.MRATE, out)
	print("RESULT: %s (%d failures)" % ["PASS" if fails == 0 else "FAIL", fails])
	quit(1 if fails > 0 else 0)

func _check(ok: bool, msg: String) -> void:
	if not ok: fails += 1; printerr("FAIL: " + msg)

func _report(name: String, buf: PackedFloat32Array, rate: int, dir: String) -> void:
	var pk := 0.0; var sq := 0.0; var bad := false
	for v in buf:
		if is_nan(v) or is_inf(v): bad = true; continue
		pk = maxf(pk, absf(v)); sq += v * v
	var rms := sqrt(sq / maxf(1.0, buf.size()))
	_check(not bad, name + " has NaN/inf"); _check(pk <= 0.95, name + " clips (peak %.3f)" % pk)
	_write_wav(dir + name + ".wav", buf, rate)
	print("%-26s %6.2fs peak %.3f (%.1f dBFS) rms %.4f (%.1f dBFS)" % [name, float(buf.size()) / rate, pk, 20.0 * log(maxf(pk, 1e-9)) / log(10.0), rms, 20.0 * log(maxf(rms, 1e-9)) / log(10.0)])

func _write_wav(path: String, buf: PackedFloat32Array, rate: int) -> void:
	var d := PackedByteArray(); d.resize(buf.size() * 2)
	for i in buf.size(): d.encode_s16(i * 2, int(clampf(buf[i], -1.0, 1.0) * 32000.0))
	var f := FileAccess.open(path, FileAccess.WRITE)
	if f == null: _check(false, "cannot write " + path); return
	f.store_buffer("RIFF".to_ascii_buffer()); f.store_32(36 + d.size()); f.store_buffer("WAVEfmt ".to_ascii_buffer())
	f.store_32(16); f.store_16(1); f.store_16(1); f.store_32(rate); f.store_32(rate * 2); f.store_16(2); f.store_16(16)
	f.store_buffer("data".to_ascii_buffer()); f.store_32(d.size()); f.store_buffer(d); f.close()
