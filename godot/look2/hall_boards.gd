class_name HallBoards
extends RefCounted
## 0.14 (D-14-1): the subject of each board level, standing in the hall beside its display plant (GenWorld.board_plant). The worksheet stays over the hall;
## what you set on it shows here, read from the engine's levelView: the drum's level, the controller's faceplate, the sensors and their votes, the cards'
## valves, the blinds and locks, the meters, the crane, the pump legs, the Career's four plants.
## build(gw, lid) runs once per rebuild, after the units stand; live(gw, view, running, g) runs on every snapshot.

func build(_gw: GenWorld, _lid: String) -> void:
	pass

## The hero view: {} for the default, else {"ids": [unit ids to frame], "yaw": rad, "frac": 0..1 of the frame height, "extra_ids": [], "third": false, "front": false}.
func hero(_gw: GenWorld, _lid: String) -> Dictionary:
	return {}

func live(_gw: GenWorld, _view: Dictionary, _running: bool, _g: Dictionary) -> void:
	pass
