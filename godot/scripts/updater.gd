class_name Updater
extends Node
## The game updates itself from the menu. Every passing build on GitHub is
## put on the release "godot-latest" with a version.json naming its build
## number; the game knows its own from res://version.json (written by the
## build). Updating downloads the new NapoleonicRTS.exe beside the running
## one, moves the running one aside (Windows lets a running program be
## renamed, not overwritten), puts the new one in its place and starts it.
## The next start clears the old copy away.
##
## On a phone or tablet the game runs as a project in Xogot (Godot on iOS):
## there updating downloads the project zip the build puts on the same
## release and unpacks it over the project's own folder; started again,
## Xogot opens the new version.

signal checked(remote: Dictionary)   # {} when the check failed
signal progress(share: float)
signal failed(text: String)
signal done(text: String)

const RELEASE := "https://github.com/thomasgerritsen-code/-napoleonic-rts./releases/download/godot-latest/"
const VERSION_URL := RELEASE + "version.json"
const EXE_URL := RELEASE + "NapoleonicRTS.exe"
const PROJECT_URL := RELEASE + "NapoleonicRTS-project.zip"
const PROJECT_ZIP := "user://update-project.zip"
const PROJECT_DIR := "NapoleonicRTS/"
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


## The exported Windows program replaces itself; a project run in Xogot
## on an iPhone or iPad (or another phone's Godot) has its files replaced.
static func can_install() -> bool:
	return (OS.has_feature("template") and OS.get_name() == "Windows") or project_mode()


## Run as a project (not exported) on a phone or tablet: Xogot.
static func project_mode() -> bool:
	return not OS.has_feature("template") and OS.get_name() in ["iOS", "Android"]


## The project zip's files (all under NapoleonicRTS/) over the folder `dest`.
## "" when done, else what went wrong (and then nothing is written).
static func unpack_project(zip_path: String, dest: String) -> String:
	var zip := ZIPReader.new()
	if zip.open(zip_path) != OK:
		return "De download is geen geldig zip-bestand; probeer het opnieuw."
	var files := zip.get_files()
	if not files.has(PROJECT_DIR + "project.godot") or not files.has(PROJECT_DIR + "version.json"):
		zip.close()
		return "De download is niet compleet; probeer het opnieuw."
	for name_: String in files:
		if not name_.begins_with(PROJECT_DIR) or name_.ends_with("/") or ".." in name_:
			continue
		var target := dest.path_join(name_.trim_prefix(PROJECT_DIR))
		DirAccess.make_dir_recursive_absolute(target.get_base_dir())
		var out := FileAccess.open(target, FileAccess.WRITE)
		if out == null:
			zip.close()
			return "De map van het spel is niet beschrijfbaar (%s)." % name_
		out.store_buffer(zip.read_file(name_))
		out.close()
	zip.close()
	return ""


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
		failed.emit("Bijwerken kan alleen in het Windows-programma (NapoleonicRTS.exe) of in Xogot.")
		return
	if project_mode():
		_fresh = PROJECT_ZIP
		_downloading = true
		_request.download_file = _fresh
		_request.timeout = 0.0
		if _request.request(PROJECT_URL) != OK:
			failed.emit("Downloaden lukt niet.")
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
	if project_mode():
		_unpack()
		return
	_swap_and_restart()


## Xogot: the new project over this one; the player starts it again.
func _unpack() -> void:
	var error := unpack_project(_fresh, ProjectSettings.globalize_path("res://"))
	DirAccess.remove_absolute(ProjectSettings.globalize_path(_fresh))
	if error != "":
		failed.emit(error)
		return
	done.emit("Bijgewerkt naar %s. Stop het spel (■) en start het opnieuw (▶︎) in Xogot." % label(current()))


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
