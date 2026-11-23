class_name BriefLines
extends RefCounted
## The level brief as short plain lines (0.12): the setter's note comes from the engine as one or two long paragraphs, and the last one carries the Call-it rule that the
## notebook's Call-it box prints again. `split` takes the note lines and that rule and returns the first few sentences (the goal and what to do) and the rest, with the
## rule taken out and no sentence twice. The engine's text is not changed and nothing the engine checks depends on it.
const FIRST := 3        ## sentences shown at once
const PER_PARA := 2     ## sentences in a paragraph behind "more"

static func sentences(text: String) -> Array:
	var re := RegEx.new(); re.compile("(?<=[.!?])\\s+(?=[A-Z0-9(])")
	var out: Array = []; var from := 0
	for m in re.search_all(text):
		out.append(text.substr(from, m.get_start() - from).strip_edges()); from = m.get_end()
	out.append(text.substr(from).strip_edges())
	return out.filter(func(s): return str(s) != "")

## {first: [sentence], more: [paragraph]}
static func split(lines: Array, predict_note := "") -> Dictionary:
	var all: Array = []; var seen := {}
	for ln in lines:
		var t := str(ln)
		if predict_note != "": t = t.replace(predict_note, "")   # the Call-it rule has its own place on the page
		for s in sentences(t):
			var k := str(s).to_lower()
			if seen.has(k): continue
			seen[k] = true; all.append(s)
	var first: Array = all.slice(0, FIRST); var rest: Array = all.slice(FIRST)
	var more: Array = []
	var i := 0
	while i < rest.size():
		more.append(" ".join(rest.slice(i, i + PER_PARA))); i += PER_PARA
	return {"first": first, "more": more}
