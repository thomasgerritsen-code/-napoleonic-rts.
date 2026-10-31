class_name Sounds
extends Node2D
## Battle sounds made from noise as the web game makes them, without sound
## files: a musket crack (filtered noise, a fifth of a second), a cannon boom
## (dark noise, half a second) and a drum tap. Heard where they happen,
## fainter further from the camera; at most twelve at once. M mutes.

const VOICES := 12
const RATE := 22050

var enabled := true
var _streams := {}
var _players: Array[AudioStreamPlayer2D] = []


func _ready() -> void:
	_streams["musket"] = _make(0.19, 1550.0, 0.55)
	_streams["cannon"] = _make(0.48, 460.0, 1.0)
	_streams["drum"] = _make(0.095, 185.0, 0.4)
	for i in VOICES:
		var player := AudioStreamPlayer2D.new()
		player.max_distance = 2600.0
		player.attenuation = 1.6
		add_child(player)
		_players.append(player)


func play(kind: String, world: Vector2) -> void:
	if not enabled or not _streams.has(kind):
		return
	for player in _players:
		if not player.playing:
			player.stream = _streams[kind]
			player.position = Iso.to_screen(world)
			player.pitch_scale = randf_range(0.9, 1.12)
			player.play()
			return


## Noise through a one-pole low-pass at `cutoff`, with a sharp attack and an
## exponential fall over `seconds`.
func _make(seconds: float, cutoff: float, loudness: float) -> AudioStreamWAV:
	var count := int(seconds * RATE)
	var data := PackedByteArray()
	data.resize(count * 2)
	var alpha := 1.0 - exp(-TAU * cutoff / RATE)
	var low := 0.0
	var noise_state := 10391
	for i in count:
		noise_state = (noise_state * 1664525 + 1013904223) & 0xFFFFFFFF
		var white := float(noise_state) / 2147483648.0 - 1.0
		low += alpha * (white - low)
		var t := float(i) / count
		var envelope := minf(1.0, t * seconds / 0.006) * exp(-5.5 * t)
		data.encode_s16(i * 2, int(clampf(low * envelope * loudness * 3.0, -1.0, 1.0) * 32000.0))
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = RATE
	wav.stereo = false
	wav.data = data
	return wav
