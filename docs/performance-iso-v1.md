# Iso-prestaties: obstakels, tekenwerk, taakverdeling en laden

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
