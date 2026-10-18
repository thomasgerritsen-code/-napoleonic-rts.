# v270 — 2D kleurpalet voor historisch geïnspireerde zwartkruitrook

**Doel:** een volle, overwegend witte kruitrookbank in natuurlijk daglicht. In de Napoleontische 2D-game verandert de tint geleidelijk van warm gebroken wit via neutraal rookgrijs naar licht, koel grijs. Dit is **artistieke kleurafstemming aan foto's**, geen chemische kleurmeting. Belichting, luchtvochtigheid, achtergrond, lading en camera hebben grote invloed op de waarneembare kleur.

## Referentiebeelden
- U.S. National Park Service, een historische musketdemonstratie: https://www.nps.gov/media/photo/gallery-item.htm?gid=3D9A7C3E-155D-451F-676C1188E14ED435&id=3f476c0c-155d-451f-67b3-4c972188c973&pg=3567109
- Jersey Heritage, vuursteengeweer tijdens een demonstratie: https://www.jersey.com/things-to-do/attractions/listings/elizabeth-castle/
- PBS, een historische nabootsing van met zwartkruitvuur en salvo's: https://www.pbs.org/wgbh/americanexperience/features/patriotsday-reenactor-101/

## Exacte CSS-kleuren in `src/systems/rendering/combat-animations.js`

| Leeftijd (seconden) | Donkere kern | Middenlaag | Buitenrand | Gerichte uitstoot | Kruitpan |
|---:|---|---|---|---|---|
| 0 | `#d7d2c5` | `#e9e4d9` | `#f4f1e8` | `#f5f1e7` | `#d9d2c4` |
| 0.25 | `#cdc9be` | `#e6e2d7` | `#f1efe7` | `#f1efe9` | `#d5cdc0` |
| 1.2 | `#c7c7c2` | `#deded8` | `#ebebe7` | `#ebebe6` | `#cbc6bd` |
| 3.0 | `#b7b9b7` | `#d1d4d3` | `#e2e4e3` | `#e2e4e3` | `#bebeb8` |
| 6.5 | `#adb4bb` | `#c6cdd2` | `#d9dfe3` | `#d9dfe3` | `#b9c0c5` |

Alle CSS-kleuren worden per frame lineair in RGB geïnterpoleerd. Kern, middenlaag, buitenrand, korte uitstoot en kruitpan hebben elk een tint. De bestaande fysisch gestuurde simulatie bepaalt wanneer er geschoten wordt; de kruitrook behoudt de huidige puls, verspreidingscurves en de automatische wind. De buitenrand gebruikt **één transparante ellipse per geclusterd event**; de reeds bestaande 7–15 rooklobben krijgen verschillende tinten. Dat betekent geen extra individuele rookdeeltjes, geen extra bibliotheek, geen invloed op trefkans, ballistiek, marsroutes of 3D.

De rook is niet werkelijk blauw: de late koelgrijze fase heeft een **subtiele** blauwe component om zich van de warme beginfase te onderscheiden. Een felle blauwe tint zou voor het beoogde daglichtbeeld juist minder geloofwaardig zijn.
