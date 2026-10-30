class_name NetLink
extends Node
## The line between two players. The host plays France and runs the battle;
## the client plays Britain: it sends its orders as commands and is shown
## the host's battle from snapshots about ten times a second. Over ENet
## (Godot's UDP networking, port 47300) between two machines, or in a
## loopback pair inside one program for the tests. It lives at /root/Net,
## so it outlasts the change from the menu to the battle.

signal joined                     # the other player is here
signal left                       # the other player has gone
signal started                    # the host started the battle
signal command_received(data: Dictionary)
signal snapshot_received(data: Dictionary)
signal told(text: String)

const PORT := 47300
const SNAPSHOT_EVERY := 0.1

var role := ""                    # "host" or "client"
var connected := false
## Tests: the other end, in this same program (no network).
var loopback: NetLink = null


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
	var peer := ENetMultiplayerPeer.new()
	var err := peer.create_client(address, port)
	if err != OK:
		return err
	peer.host.compress(ENetConnection.COMPRESS_ZSTD)
	multiplayer.multiplayer_peer = peer
	multiplayer.connected_to_server.connect(_on_peer_connected.bind(1))
	multiplayer.server_disconnected.connect(_on_peer_disconnected.bind(1))
	multiplayer.connection_failed.connect(_on_peer_disconnected.bind(1))
	role = "client"
	return OK


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
	if multiplayer.multiplayer_peer != null and not (multiplayer.multiplayer_peer is OfflineMultiplayerPeer):
		multiplayer.multiplayer_peer.close()
		multiplayer.multiplayer_peer = OfflineMultiplayerPeer.new()


func _on_peer_connected(_id: int) -> void:
	connected = true
	joined.emit()


func _on_peer_disconnected(_id: int) -> void:
	connected = false
	left.emit()


## The host starts the battle on both ends.
func start() -> void:
	if loopback != null:
		started.emit()
		loopback.started.emit()
		return
	_start.rpc()


@rpc("authority", "call_local", "reliable")
func _start() -> void:
	started.emit()


## The client's order, to the host.
func send_command(data: Dictionary) -> void:
	if loopback != null:
		loopback.command_received.emit(data)
		return
	_command.rpc_id(1, var_to_bytes(data))


@rpc("any_peer", "call_remote", "reliable")
func _command(bytes: PackedByteArray) -> void:
	var data: Variant = bytes_to_var(bytes)
	if role == "host" and data is Dictionary:
		command_received.emit(data)


## The battle as it stands, from the host to the client.
func send_snapshot(data: Dictionary) -> void:
	if loopback != null:
		loopback.snapshot_received.emit(data)
		return
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
	_tell.rpc(text)


@rpc("authority", "call_remote", "reliable")
func _tell(text: String) -> void:
	told.emit(text)
