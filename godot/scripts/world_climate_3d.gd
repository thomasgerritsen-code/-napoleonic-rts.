class_name WorldClimate3D
extends RefCounted
## Read-only visual climate. Uses the battle clock and the host's weather;
## never advances a season, consumes game randomness or changes wetness.

const TRANSITION := 45.0
## Calibrated with lit grey/white surfaces in the shipped GL renderer.
## Leave highlight room instead of pushing several materials to flat white.
const DAY_SUN := 0.65
const NIGHT_SUN := 0.12
const DAY_AMBIENT := 0.24
const NIGHT_AMBIENT := 0.12


static func sunlight_energy(dark: float, cloud: float) -> float:
	return lerpf(DAY_SUN, NIGHT_SUN, dark) * (1.0 - 0.5 * cloud)


static func sample(seconds: float, raining: bool, wetness: float) -> Dictionary:
	var year := fposmod(seconds, Weather.SEASON * 4.0)
	var season := int(year / Weather.SEASON)
	var local := fposmod(year, Weather.SEASON)
	var blend := smoothstep(Weather.SEASON - TRANSITION, Weather.SEASON, local)
	var weights := Vector4.ZERO
	weights[season] = 1.0 - blend
	weights[(season + 1) % 4] += blend
	var hour := DayNight.hour_at(seconds)
	var dark := DayNight.darkness_at(seconds)
	var dawn := DayNight._smooth(5.0, 8.0, hour)
	var dusk := DayNight._smooth(17.0, 20.0, hour)
	var warm := maxf(4.0 * dawn * (1.0 - dawn), 4.0 * dusk * (1.0 - dusk))
	var cloud := 1.0 if raining else clampf(wetness, 0.0, 1.0) * 0.2
	var sunlight := Color(1.0, 0.95, 0.86).lerp(Color(1.0, 0.7, 0.46), warm)
	sunlight = sunlight.lerp(Color(0.53, 0.65, 0.94), dark)
	sunlight = sunlight.lerp(Color(0.79, 0.84, 0.91), cloud * 0.22)
	# Visual air temperature only: gradual seasons, cooler nights/cloud.
	# No new weather simulation, save field or gameplay modifier.
	var temperature := weights.dot(Vector4(12.0,24.0,10.0,-2.0)) \
		+ 4.0*sin((hour-8.0)*TAU/24.0)-cloud*2.0
	return {"season": season, "weights": weights, "blend": blend, "snow": weights.w,
		"temperature": temperature,
		"autumn": weights.z, "summer": weights.y, "wetness": clampf(wetness, 0.0, 1.0),
		"rain": (1.0 - weights.w) if raining else 0.0, "snowfall": weights.w if raining else 0.0,
		"dark": dark, "cloud": cloud, "sun_color": sunlight,
		"sun_energy": sunlight_energy(dark, cloud),
		"ambient_color": Color(1.0, 0.97, 0.91).lerp(Color(0.4, 0.52, 0.75), dark),
		"ambient_energy": lerpf(DAY_AMBIENT, NIGHT_AMBIENT, dark) + 0.03 * cloud * (1.0 - dark),
		"exposure": lerpf(0.82, 0.92, dark), "white_point": lerpf(2.0, 1.0, dark)}
