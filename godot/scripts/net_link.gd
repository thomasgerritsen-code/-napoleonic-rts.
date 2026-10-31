class_name NetLink
extends Node
## The line between two players. The host chooses a side and runs the
## battle; the client plays the other side: it sends its orders as commands
## and is shown the host's battle from snapshots about ten times a second.
## Over ENet (Godot's UDP networking, port 47300) between two machines, or
## in a loopback pair inside one program for the tests. It lives at
## /root/Net, so it outlasts the change from the menu to the battle.
##
## A client that loses the line dials again every few seconds; the host
## pauses the battle meanwhile. A player who started the game anew can join
## the running battle again from the menu.

signal joined                     # the other player is here
signal left                       # the other player has gone
signal started(side: String)      # a (new) battle begins; `side` is ours
signal resumed(side: String)      # client: the host lets us back into its battle
signal command_received(data: Dictionary)
signal snapshot_received(data: Dictionary)
signal told(text: String)
signal rematch_asked              # the other player wants to play again

const PORT := 47300
const SNAPSHOT_EVERY := 0.1
const REDIAL_EVERY := 3.0

var role := ""                    # "host" or "client"
var connected := false
## The side the host plays (both ends know it once started).
var host_side := "france"
## Tests: the other end, in this same program (no network).
var loopback: NetLink = null
var _address := ""
var _port := PORT
var _redial := -1.0              # client: seconds to the next dial after a failure
var _signals_hooked := false


static func find(tree: SceneTree) -> NetLink:
	return tree.root.get_node_or_null("Net") as NetLink


## The link at /root/Net, made fresh.
static func make(tree: SceneTree) -> NetLink:
	var old := find(tree)
	if old != null:
		old.close()
		old.name = "NetOld"
		old.queue_free()
	var link := NetLink.new()
	link.name = "Net"
	tree.root.add_child(link)
	return link


static func other(side: String) -> String:
	return "britain" if side == "france" else "france"


func client_side() -> String:
	return other(host_side)


func host(port := PORT) -> Error:
	var peer := ENetMultiplayerPeer.new()
	var err := peer.create_server(port, 1)
	if err != OK:
		return err
	peer.host.compress(ENetConnection.COMPRESS_ZSTD)
	multiplayer.multiplayer_peer = peer
	multiplayer.peer_connected.connect(_on_peer_connected)
	multiplayer.peer_disconnected.connect(_on_peer_disconnected)
	role = "host"
	return OK


func join(address: String, port := PORT) -> Error:
	_address = address
	_port = port
	role = "client"
	if not _signals_hooked:
		_signals_hooked = true
		multiplayer.connected_to_server.connect(_on_peer_connected.bind(1))
		multiplayer.server_disconnected.connect(_on_lost)
		multiplayer.connection_failed.connect(_on_lost)
	return _dial()


func _dial() -> Error:
	var peer := ENetMultiplayerPeer.new()
	var err := peer.create_client(_address, _port)
	if err != OK:
		return err
	peer.host.compress(ENetConnection.COMPRESS_ZSTD)
	multiplayer.multiplayer_peer = peer
	return OK


## Client: the line is gone (or never came); dial again in a moment.
func _on_lost() -> void:
	var was := connected
	connected = false
	_redial = REDIAL_EVERY
	if was:
		left.emit()


func _process(delta: float) -> void:
	if role != "client" or connected or _address == "" or _redial < 0.0:
		return
	_redial -= delta
	if _redial <= 0.0:
		_redial = -1.0
		_dial()


## Two links joined in this program, for the tests.
static func pair(tree: SceneTree) -> Array[NetLink]:
	var a := NetLink.new()
	var b := NetLink.new()
	a.name = "NetHost"
	b.name = "NetClient"
	a.role = "host"
	b.role = "client"
	a.loopback = b
	b.loopback = a
	a.connected = true
	b.connected = true
	tree.root.add_child(a)
	tree.root.add_child(b)
	return [a, b]


func close() -> void:
	connected = false
	_address = ""
	if multiplayer.multiplayer_peer != null and not (multiplayer.multiplayer_peer is OfflineMultiplayerPeer):
		multiplayer.multiplayer_peer.close()
		multiplayer.multiplayer_peer = OfflineMultiplayerPeer.new()


func _on_peer_connected(_id: int) -> void:
	connected = true
	joined.emit()


func _on_peer_disconnected(_id: int) -> void:
	connected = false
	left.emit()


## Tests: as if the line broke, or came back.
func drop() -> void:
	connected = false
	loopback.connected = false
	left.emit()
	loopback.left.emit()


func restore() -> void:
	connected = true
	loopback.connected = true
	joined.emit()
	loopback.joined.emit()


## The host starts a (new) battle on both ends, playing `side`.
func start(side := host_side) -> void:
	host_side = side
	if loopback != null:
		loopback.host_side = side
		started.emit(side)
		loopback.started.emit(other(side))
		return
	_start.rpc(side)


@rpc("authority", "call_local", "reliable")
func _start(side: String) -> void:
	host_side = side
	started.emit(side if role == "host" else other(side))


## Host: let a client that started anew into the running battle.
func resume() -> void:
	if loopback != null:
		loopback.host_side = host_side
		loopback.resumed.emit(client_side())
		return
	_resume.rpc(host_side)


@rpc("authority", "call_remote", "reliable")
func _resume(side: String) -> void:
	host_side = side
	resumed.emit(other(side))


## The client's order, to the host.
func send_command(data: Dictionary) -> void:
	if loopback != null:
		if connected:
			loopback.command_received.emit(data)
		return
	if connected:
		_command.rpc_id(1, var_to_bytes(data))


@rpc("any_peer", "call_remote", "reliable")
func _command(bytes: PackedByteArray) -> void:
	var data: Variant = bytes_to_var(bytes)
	if role == "host" and data is Dictionary:
		command_received.emit(data)


## The battle as it stands, from the host to the client.
func send_snapshot(data: Dictionary) -> void:
	if loopback != null:
		if connected:
			loopback.snapshot_received.emit(data)
		return
	if connected:
		_snapshot.rpc(var_to_bytes(data))


@rpc("authority", "call_remote", "unreliable_ordered")
func _snapshot(bytes: PackedByteArray) -> void:
	var data: Variant = bytes_to_var(bytes)
	if data is Dictionary:
		snapshot_received.emit(data)


## A message for the client's status line.
func tell(text: String) -> void:
	if loopback != null:
		loopback.told.emit(text)
		return
	if connected:
		_tell.rpc(text)


@rpc("authority", "call_remote", "reliable")
func _tell(text: String) -> void:
	told.emit(text)


## This player wants another battle.
func ask_rematch() -> void:
	if loopback != null:
		loopback.rematch_asked.emit()
		return
	if connected:
		_rematch.rpc()


@rpc("any_peer", "call_remote", "reliable")
func _rematch() -> void:
	rematch_asked.emit()
