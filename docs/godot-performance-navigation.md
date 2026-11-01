# Godot: prestaties en beweging, november 2026

De native pc-versie zoekt vijanden via een gedeelde ruimtelijke index, plant
routes rond gebouwen en boomstammen, en pauzeert ongeziene 3D-animaties.
De bestaande Blender-modellen, texturen, belichting, schaduwen en resolutie
blijven behouden. Dit is geen wijziging aan de browsergame.

## Wat er is veranderd

- `BattleSpace` hergebruikt vakken van 128 spelpixels. Verplaatsingen werken de
  index meteen bij; ook sterven, herstellen en het laden van een slag worden
  verwerkt. Eenheden blijven vóór gebouwen gaan bij doelkeuze. Bereik en de
  prioriteit bij gelijke afstanden blijven behouden.
- `Regiment.living()` hergebruikt een lijst totdat de bezetting verandert.
  Bij verandering wordt de lijst vervangen, zodat een lopende gevechtslus zijn
  eigen geldige momentopname houdt. Netwerksnapshots vernieuwen de lijst ook.
- De rivierhoogte wordt met een binaire zoekstap opgezocht in dezelfde 255
  punten. Een regressie vergelijkt de uitkomst met de oude volledige scan.
- `GroundNavigation` behoudt de bestaande brugkeuze. Een vrije rechte route
  heeft geen A* nodig; bij obstakels deelt de slag één native `AStarGrid2D`
  met cellen van 16 spelpixels. Nieuwe/verwoeste gebouwen en gekapte stammen
  werken de bezette vakken bij. Kruinen en ondergroei blokkeren geen voetgangers.
- Kleine verschuivingen van een marcherende formatie maken niet langer ieder
  frame een volledig nieuwe route. Een expliciete nieuwe order, andere taak,
  gewijzigde bouwplaats of geblokkeerd traject vernieuwt de route wel.
- Bevriende troepen houden rechts bij het passeren. Het opsplitsen van
  overlappende lichamen is deterministisch, ook bij exact gelijke posities.
  Een correctie duwt niemand een gebouw of het water in.
- Het beeld volgt de posities ná de botsingscorrectie. Zo wisselt een soldaat
  niet zichtbaar tussen zijn looppositie en de daaropvolgende correctie.
- Een charge houdt een levend doel kort vast (0,2 seconde), kiest onmiddellijk
  een ander als dat doel valt, en nadert tot contactafstand. Bij contact blijft
  de soldaat staan voor een bajonetstoot of sabelslag. Herhaalde slagen starten
  de bestaande Blender-animatie opnieuw. Het bestaande bereik van 18 pixels,
  schade, verliezen en carréverdediging blijven gelden.
- In 3D spelen de verborgen 2D-spriteanimaties niet mee. Buiten de camera, met
  een ruime schermmarge, pauzeren de Blender-animaties. De modellen blijven
  beschikbaar; terugkeren hervat de beweging. Een buiten beeld gesneuvelde man
  verschijnt in zijn gevallen houding. F3 herstelt de actuele 2D-animaties.

## Meting met 400 eenheden

De oorspronkelijke code van `de94463` en de gewijzigde versie zijn lokaal,
afzonderlijk, met hetzelfde script, dezelfde kaart, seed en Godot 4.6.3
gemeten. De opstelling heeft 400 eenheden: boeren, tien infanteriebataljons en
cavalerie. Elke fase heeft 30 opwarmstappen en 300 gemeten stappen van 1/60 s.
De derde fase laat de bataljons daadwerkelijk op elkaar vuren; slachtoffers
zijn onderdeel van de simulatie.

| Simulatiestap, p95 | Oorspronkelijk | Gewijzigd |
| --- | ---: | ---: |
| Stilstand | 26,164 ms | 12,946 ms |
| Marcheren | 22,546 ms | 14,508 ms |
| Vuurgevecht | 21,264 ms | 14,764 ms |

Een reeks van 2000 doelzoekvragen duurde 116,428 ms vóór en 20,107 ms na de
wijziging. De gedeelde index en navigatie kostten in deze opstelling ongeveer
13 MiB extra. Dit zijn lokale CPU-simulatiemetingen; ze betekenen niet dat elke
Windows-pc een bepaalde beeldsnelheid haalt.

Ook is een duurmeting met 6000 stappen per fase uitgevoerd: circa vijf minuten
gesimuleerde speeltijd, met 400 eenheden bij aanvang en 380 overlevenden na de
gevechtsfase. Het gemeten statische geheugen ging van 576,344 naar 577,039 MiB
tijdens de drie fasen. Importeren en laden vallen buiten deze meting. Dit is
geen vijf minuten durende meting van het totale GPU-geheugen of de live renderer.

## Grafische controle

De echte OpenGL-renderer is getest met 400 volledige Blender-modellen, inclusief
cavalerie en kanonnen met bediening. Boven het leger waren 388 animaties actief;
bij de basis 6. Alle 400 modellen bleven beschikbaar, herhaalde contactslagen
startten opnieuw en terugkeren naar 2D herstelde de 399 levende animaties na
één gesimuleerd slachtoffer. De lokale renderer gebruikt Mesa llvmpipe; dit
controleert de werking en het beeld, niet de snelheid van een fysieke videokaart.

## Controles herhalen

Vanuit de hoofdmap, na de Godot-import:

```sh
godot --headless --path godot --import
godot --headless --path godot --script res://tests/navigation_test.gd
godot --headless --path godot --script res://tests/smoke_test.gd
godot --headless --path godot --script res://tests/large_battle_benchmark.gd
RTS_BENCH_STEPS=6000 godot --headless --path godot --script res://tests/large_battle_benchmark.gd
godot --path godot --rendering-driver opengl3 --audio-driver Dummy --script res://tests/render_regression.gd
```

De CI controleert de navigatie, de simulatiebenchmark en de echte 3D-renderer
voordat de Windows-versie wordt gepubliceerd. Het benchmarkscript drukt
`GODOT_BENCH` met JSON af; er is geen vaste tijdsgrens die afhankelijk is van
het type CI-computer. Voor spelen op een echte pc: Singleplayer → Testveld
en F3 voor 3D; controleer ook normale opbouw, brugverkeer en een langere slag.
