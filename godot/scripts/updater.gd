class_name Updater
extends Node
## The game updates itself from the menu. Every passing build on GitHub is
## put on the release "godot-latest" with a version.json naming its build
## number; the game knows its own from res://version.json (written by the
## build). Updating downloads the new NapoleonicRTS.exe beside the running
## one, moves the running one aside (Windows lets a running program be
## renamed, not overwritten), puts the new one in its place and starts it.
## The next start clears the old copy away.

signal checked(remote: Dictionary)   # {} when the check failed
signal progress(share: float)
signal failed(text: String)

const RELEASE := "https://github.com/thomasgerritsen-code/-napoleonic-rts./releases/download/godot-latest/"
const VERSION_URL := RELEASE + "version.json"
const EXE_URL := RELEASE + "NapoleonicRTS.exe"
const MIN_EXE_BYTES := 10 * 1024 * 1024

var _request: HTTPRequest
var _downloading := false
var _fresh := ""


## This build's {build, commit, date}; build 0 for a copy not built by GitHub.
static func current() -> Dictionary:
	if not FileAccess.file_exists("res://version.json"):
		return {"build": 0, "commit": "", "date": ""}
	var data: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://version.json"))
	return data if data is Dictionary else {"build": 0, "commit": "", "date": ""}


static func label(v: Dictionary) -> String:
	if int(v.get("build", 0)) <= 0:
		return "ontwikkelversie"
	return "build %d (%s)" % [int(v["build"]), v.get("date", "")]


static func newer(remote: Dictionary, local: Dictionary) -> bool:
	return int(remote.get("build", 0)) > int(local.get("build", 0))


## Only the exported Windows program can replace itself.
static func can_install() -> bool:
	return OS.has_feature("template") and OS.get_name() == "Windows"


## At start: the copy an update moved aside goes.
static func clean_up() -> void:
	if not OS.has_feature("template"):
		return
	var old := OS.get_executable_path() + ".old"
	if FileAccess.file_exists(old):
		DirAccess.remove_absolute(old)


func _ready() -> void:
	_request = HTTPRequest.new()
	_request.timeout = 30.0
	add_child(_request)
	_request.request_completed.connect(_on_completed)


func check() -> void:
	if _request.get_http_client_status() != HTTPClient.STATUS_DISCONNECTED:
		return
	_downloading = false
	_request.download_file = ""
	if _request.request(VERSION_URL) != OK:
		checked.emit({})


func install() -> void:
	if not can_install():
		failed.emit("Bijwerken kan alleen in het Windows-programma (NapoleonicRTS.exe).")
		return
	_fresh = OS.get_executable_path().get_base_dir().path_join("NapoleonicRTS.new.exe")
	_downloading = true
	_request.download_file = _fresh
	_request.timeout = 0.0
	if _request.request(EXE_URL) != OK:
		failed.emit("Downloaden lukt niet.")


func _process(_delta: float) -> void:
	if _downloading and _request.get_body_size() > 0:
		progress.emit(float(_request.get_downloaded_bytes()) / _request.get_body_size())


func _on_completed(result: int, code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	if not _downloading:
		var data: Variant = JSON.parse_string(body.get_string_from_utf8()) if result == HTTPRequest.RESULT_SUCCESS and code == 200 else null
		checked.emit(data if data is Dictionary else {})
		return
	_downloading = false
	if result != HTTPRequest.RESULT_SUCCESS or code != 200:
		failed.emit("Downloaden mislukt (%s)." % (code if code != 0 else result))
		return
	_swap_and_restart()


## The new program in the old one's place, and started.
func _swap_and_restart() -> void:
	var file := FileAccess.open(_fresh, FileAccess.READ)
	var whole := file != null and file.get_length() >= MIN_EXE_BYTES and file.get_buffer(2) == "MZ".to_ascii_buffer()
	if file != null:
		file.close()
	if not whole:
		DirAccess.remove_absolute(_fresh)
		failed.emit("De download is niet compleet; probeer het opnieuw.")
		return
	var exe := OS.get_executable_path()
	var old := exe + ".old"
	if FileAccess.file_exists(old):
		DirAccess.remove_absolute(old)
	if DirAccess.rename_absolute(exe, old) != OK:
		failed.emit("De map van het spel is niet beschrijfbaar; zet het spel bijvoorbeeld in Documenten.")
		return
	if DirAccess.rename_absolute(_fresh, exe) != OK:
		DirAccess.rename_absolute(old, exe)
		failed.emit("De nieuwe versie kon niet op zijn plaats gezet worden.")
		return
	OS.create_process(exe, [])
	get_tree().quit()
