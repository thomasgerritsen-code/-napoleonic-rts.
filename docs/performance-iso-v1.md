# Iso-prestaties: obstakels, tekenwerk, taakverdeling en laden

Aanvullend: [GPU-weergave en multiplayerfundament](gpu-and-multiplayer.md).
Booleaanse riviercontroles stoppen nu bij het eerste geblokkeerde punt en
hergebruiken maximaal 512 exacte segmenten. De uitgebreide routecontrole voor
bruggegevens blijft behouden. Reset wist de segmentcache.

## Gedrag

1. **Obstakels:** statische dorpshuizen worden eenmaal opgebouwd en in vakken van
   256 wereldpixels geïndexeerd. Segmenten en punten controleren alleen nabije
   kandidaten, in dezelfde volgorde als voorheen. Gebouwen van spelers blijven
   direct actueel bij plaatsing, verplaatsing en vernietiging. Een nieuwe kaart of
   slag maakt de dorpscache ongeldig.
2. **Tekenen:** geschaalde landschapsafbeeldingen worden hergebruikt, met behoud van
   afzonderlijke dieptevolgorde, transparantie achter soldaten en clipping tijdens
   bouw. De cache gebruikt maximaal 24 MiB op touchapparaten en 48 MiB elders en
   bouwt maximaal twee afbeeldingen per beeldframe op. Wolkencomposities worden
   maximaal 15 keer per seconde vernieuwd en bewegen tussen updates met de camera
   mee. Een nieuw mistmasker, zoom, grote camerabeweging, resize of reset ververst
   de compositie meteen. Zichtregels veranderen niet.
3. **Taken spreiden:** periodieke AI-ontwikkeling en legerorders gaan naar een
   samenvoegende wachtrij met maximaal één taak per beeldframe. Bij onvoldoende
   tijd wacht een taak tot een volgend frame; na 120 ms (ontwikkeling) of 80 ms
   (orders) krijgt hij voorrang. Dit is een coöperatief budget: één lopende functie
   wordt niet halverwege onderbroken, dus extreem dure taken kunnen nog pieken
   veroorzaken. Beweging, gevechten en invoer blijven direct. Deterministische
   tests houden hun synchrone AI. Reset annuleert oude AI-opdrachten.
4. **Vooraf laden:** de slag staat stil achter een voortgangsscherm tot de
   noodzakelijke basisafbeeldingen, gebouwen en grond zijn geladen én gedecodeerd.
   Vier laadstromen bereiden de basis voor; twee achtergrondstromen laden daarna
   extra uniformen en animaties via de framewachtrij. Scherpere afbeeldingen
   worden één voor één voorbereid. De bestaande grenzen voor hoge resolutie
   blijven behouden. Bij een ontbrekend basisbestand blijft de slag gepauzeerd en
   verschijnt een knop om opnieuw te laden.

## Vergelijking met commit 42eeb6e

Lokaal Chromium, 1440×900, vaste random-seed, identieke camera, geladen afbeeldingen
en legers. Twee onafhankelijke rondes met een verse browser per scenario. De
simulatiemeting verwerkt 120 stappen van 1/60 seconde; het tekenen wordt afzonderlijk
gemeten na opwarmen. Dit zijn CPU-/tekentijden, geen beloofde framerates op een
telefoon. Een eerste meting tijdens parallelle tests is buiten de vergelijking
gehouden omdat die door andere processen werd verstoord.

| Onderdeel | Voor | Na | Verschil |
|---|---:|---:|---:|
| Tekenen bij 43 eenheden, gemiddeld per beeld | 16,59 ms | 8,80 ms | circa 47% minder |
| Tekenen bij 323 eenheden, gemiddeld per beeld | 25,09 ms | 20,43 ms | circa 19% minder |
| 120 simulatiestappen bij 323 eenheden | 1872,8 ms | 1537,8 ms | circa 18% minder |

Alle eenheids-id's, posities, levenspunten en doodstatus na dezelfde simulatiestappen
waren identiek tussen voor en na, in beide rondes. De 95e percentiel tekentijd bij
323 eenheden daalde van 41,5–45,9 naar 38,4–40,5 ms. Stabiele 30 fps bij grote
veldslagen is dus nog geen bewezen resultaat; de zwaarste frames blijven een
vervolgpunt. GPU-weergave en het verder opdelen van lange route-/AI-taken kunnen
later extra winst geven.

## Controles en diagnose

### v1.4.2: hetzelfde beeld met minder projectie- en mistwerk

De projectie leest de schermmaten eenmaal per getekend frame. Buiten een frame
(zoals bij tikken en selecteren) gebruikt ze de actuele schermmaten. Camera en
zoom worden steeds actueel gelezen, ook tijdens het bakken van terreintegels.

De bestaande mistlagen voor verkend gebied en huidig zicht worden alleen opnieuw
gerasterd wanneer hun geometrie verandert. De cache vergelijkt alle zichtbare
celcoördinaten en bronposities/radii, camera, zoom, schermmaat en het reliëf.
Veranderingen van weer, eenheidstype, beweging, doodstatus en verkende cellen
werken daardoor door, ook als het aantal bronnen of cellen gelijk blijft.
Resize en een nieuwe slag wissen de opgeslagen geometrie. Alleen de twee laatste
lijsten met getallen worden bewaard; er komen geen beeldbuffers of GPU-contexten
bij. Mistmaskers, zachte randen, crossfades en bewegende wolken behouden hun
bestaande klok. Resolutie, afbeeldingen, animaties en simulatie veranderen niet.

`tests/iso-render-reuse-v142.spec.js` controleert hergebruik, bewegende wolken,
veranderde zichtbronnen, het vervangen van verkende cellen bij gelijkblijvende
setgrootte, pan/zoom, drie schermmaten en reset. Diagnose via
`__ISO_VIEW_V1__.stats()`: `fogSeenBuilds`, `fogSightBuilds`,
`fogGeometryReuses` en `fogGeometryPoints`.

Een reproduceerbare beeld- en timingvergelijking gebruikt dezelfde gepauzeerde
slag, vaste random-seed, volledig geladen afbeeldingen, opgewarmde landschapcache
en een vaste animatieklok. Beide vastgelegde PNG's worden per pixel vergeleken;
ook alle eenheids-id's, posities, levenspunten en doodstatus moeten gelijk zijn.

```sh
git show 1ef9d779506004795f1c5c4751d3d513e16f9b96:src/systems/rendering/iso-view-v1.js > /tmp/iso-v141.js
node scripts/benchmark-iso-render-reuse.js --baseline-source=/tmp/iso-v141.js --url=http://127.0.0.1:4173 --browser=/usr/bin/chromium
```

Het script test een kleine scène, 280 extra infanteristen, bewegende troepen,
pan, zoom, veranderend zicht/verkend gebied, portretstand en reset. Het gebruikt
Chromium met mobiele emulatie (844×390, native DPR 3, bestaande render-DPR 1,5)
en viermaal vertraagde CPU. Dit zijn synthetische tekentijden, geen gemeten
framerates of garantie voor een fysieke iPhone.

De definitieve lokale vergelijking met v1.4.1 meet voor de drie hoofdscènes elk
60 frames na het opwarmen:

| Scène | Voor, gemiddeld | Na, gemiddeld | Kortere tekentijd |
|---|---:|---:|---:|
| Beginscène | 75,69 ms | 59,34 ms | circa 22% |
| 280 extra infanteristen | 161,64 ms | 140,75 ms | circa 13% |
| Dezelfde troepen bewegend | 157,56 ms | 143,20 ms | circa 9% |

De 95e percentiel tekentijd bij het extra leger daalt van 302,8 naar 178,4 ms;
bij bewegende troepen van 319,9 naar 234,2 ms. De overige zes scènes dienen
voor beeldgelijkheid en invalidatie, met slechts vier gemeten frames per scène.
Alle negen scènes hebben nul afwijkende pixels en identieke eenheidsgegevens.
De controles omvatten 189 snelle tests en 32 geselecteerde browsertests voor
mobiel, zicht, weer, invoer, reset, GPU en grote legers.

### Eerdere vergelijking van obstakels, taakverdeling en landschapslagen

De vergelijking is te herhalen met twee lokaal geserveerde checkouts:
`node scripts/benchmark-iso-performance.js --before=http://127.0.0.1:4175 --after=http://127.0.0.1:4173 --browser=/usr/bin/chromium`.
Het script controleert ook of de simulatie-uitkomsten overeenkomen en schrijft
de resultaten standaard onder `test-results/`.

- `tests/headless/frame-work-v1.test.js`: deadlines, maximaal één taak, samenvoegen,
  reset en het behouden van achtergrondlaadwerk.
- `tests/iso-performance-v1.spec.js`: wachten op afbeeldingen, fout/herstel,
  obstakelverversing, cachegrenzen, mistverversing en voortgang van normale AI.
- Bestaande iso-, reset-, mobiele, bewegings-, brug- en 520-eenhedentests blijven
  relevant. Verwachtingen worden niet afgezwakt voor prestatieverbeteringen.
- `__STUCK_RECOVERY_V2__.stats()` bevat cache-opbouw en kandidaat-aantallen;
  `__STATIC_SPRITE_CACHE_V1__.stats()` bevat geheugengebruik en treffers;
  `__FRAME_WORK_V1__.stats()` bevat wachtrij en wachttijd;
  `__ISO_VIEW_V1__.stats()` bevat laadstatus en hergebruik van wolken.

Preservation impact: compatible change. Eenheden, kaart, spelregels en bestaande
bediening blijven behouden; het moment van periodieke AI-beslissingen kan in
normaal spel een fractie van een seconde verschuiven.
