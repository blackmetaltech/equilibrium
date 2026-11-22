class_name HoloHud
extends Control
## CONTRACT STUB (filled by the HUD programmer, see docs/LOOK2.md). The inventor's instrumentation for the slice.
var app
var lab: LabWorld
var ids := {}

func build() -> void: set_anchors_preset(Control.PRESET_FULL_RECT); mouse_filter = Control.MOUSE_FILTER_IGNORE
func setup(role_ids: Dictionary) -> void: ids = role_ids
func refresh() -> void: pass
func layout() -> void: pass
func toast(_text: String, _level: String) -> void: pass
func end_card() -> bool: return false
func key(_e: InputEventKey) -> bool: return false
