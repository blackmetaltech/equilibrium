extends Control
## EQUILIBRIUM's "home" screen: nothing. The world is full-bleed and the console is the whole interface, so the shell's home drawer is blank; the shell only needs a
## home id to return to when a dialog closes. Showing it keeps the drawer holder hidden and the world uncovered.
var app

func refresh() -> void:
	if app == null: return
	app.drawer_hidden = true; app.holder.visible = false; app._set_cover(0.0)
	if app.drawer_tab != null: app.drawer_tab.visible = false
