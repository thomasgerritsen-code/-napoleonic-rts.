# Opstartprofiel van de game (oktober 2026)

Gemeten op `/?test=smoke`, Chromium headless, lokaal geserveerd, cache uit.

## Bundelen (experiment, STOP)

Proef: alle 135 klassieke scripts uit `index.html` in één bestand (elk bronbestand
als eigen inline script uitgevoerd, zodat de semantiek gelijk blijft: per bestand
`'use strict'`, `const`/`let` pas bestaan na hun eigen bestand, een fout stopt de
volgende bestanden niet). Een eerste versie die de bronnen gewoon aan elkaar plakte,
brak de rivier-code: `typeof` op een `const` uit een later bestand gooit dan een
TDZ-fout.

| Verbinding | index.html | gebundeld | requests |
|---|---|---|---|
| lokaal | 3,7 s | 3,7 s | 143 → 25 |
| 100 ms, 12 Mbit/s | 3,9 s | 3,6 s | 143 → 23 |
| 300 ms, 1,6 Mbit/s | 7,0 s | 8,7 s | 141 → 23 |

Conclusie: veel minder requests, maar nauwelijks sneller en op een trage
verbinding zelfs trager (één groot bestand in plaats van parallelle downloads).
Niet ingevoerd.

## Waar de opstarttijd wel zit

Uitvoertijd per script (tijdens het laden), samen ±2,7 s:

| Script | ms |
|---|---|
| `src/systems/world/village-layout-v6.js` | 871 |
| `src/systems/world/ecology-v1.js` | 844 |
| `src/systems/world/village-collision-v4.js` | 647 |
| `src/v069-map.js` | 247 |
| `src/systems/rendering/map-realism.js` | 34 |
| alle overige ±130 scripts samen | ±130 |

Vier wereldgeneratie-scripts kosten samen ±2,6 s van de ±3,7 s tot het spel klaar is.

## Aanbevolen volgorde

1. **Wereldgeneratie versnellen** (grootste winst, ±2,6 s): de kaart is deterministisch,
   dus het resultaat (dorpsindeling, begroeiing, botsingsvormen) kan bij de build worden
   voorberekend als JSON en bij het laden alleen worden ingelezen. Alternatief: de
   zoeklussen een ruimtelijk raster geven in plaats van alles met alles te vergelijken.
   Altijd met dezelfde uitkomst (vergelijk de gegenereerde wereld byte-voor-byte) en
   de bestaande gates (Golden Battle, 520 units, feature preservation).
2. **Tekenen per frame** (fps bij 520 eenheden): statische lagen vooraf renderen,
   alleen tekenen wat in beeld is.
3. **Patchketens samenvoegen** (`drawUnit` wordt 9× ingepakt, ±48 wrappers): eerst
   meten per frame, dan keten voor keten samenvoegen.
4. Bundelen pas opnieuw bekijken als stap 1 en 2 klaar zijn, en dan met compressie
   en een CDN-meting.

Meetmethode: elk script als inline script in volgorde toevoegen en
`performance.now()` rond elke toevoeging meten.
