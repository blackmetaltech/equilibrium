extends SceneTree
## Phase B (texture aliasing): every texture the 3D look uses is imported with mipmaps and VRAM compression; normal maps as RGTC (normal_map=1).
## A texture without mipmaps aliases when minified (grain and sparkle on the vessels). Fails if any 3D texture import regresses.
var fails := 0; var checks := 0
func check(c: bool, msg: String) -> void:
	checks += 1
	if not c: fails += 1; print("FAIL: ", msg)
func _initialize() -> void:
	for dir in ["res://look2/assets/tex", "res://look2/assets"]:
		for f in DirAccess.get_files_at(dir):
			if not f.ends_with(".import"): continue
			var cf := ConfigFile.new(); cf.load(dir + "/" + f)
			if str(cf.get_value("remap", "importer", "")) != "texture": continue
			check(bool(cf.get_value("params", "mipmaps/generate", false)), "%s has mipmaps" % f)
			if not f.contains(".hdr"):
				check(int(cf.get_value("params", "compress/mode", 0)) == 2, "%s is VRAM compressed" % f)
				if f.contains("_nor."): check(int(cf.get_value("params", "compress/normal_map", 0)) == 1, "%s is imported as a normal map (RGTC)" % f)
	var pc := ConfigFile.new(); pc.load("res://project.godot")
	var d = pc.get_value("importer_defaults", "texture", {})
	check(d is Dictionary and bool(d.get("mipmaps/generate", false)), "project.godot importer_defaults turn mipmaps on for new textures")
	check(bool(ProjectSettings.get_setting("rendering/anti_aliasing/screen_space_roughness_limiter/enabled", false)), "the screen-space roughness limiter is on")
	print("TEXTURES-FLOW checks=%d" % checks)
	print("TEXTURES-FLOW OK" if fails == 0 else "TEXTURES-FLOW FAILED %d" % fails)
	quit(1 if fails else 0)
