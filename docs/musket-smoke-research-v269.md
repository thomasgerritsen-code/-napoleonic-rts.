# v269 — historisch geïnspireerde 2D-musketrook

Dit zijn **visuele benaderingen**, geen exacte CFD-berekeningen van uitlaatgassen of historische kruitladingen. De spelmechanica, schietsnelheid, ballistiek en padzoeker zijn ongewijzigd.

## Bronnen en waarnemingen

- National Park Service, *Volley Fire*: groepssalvo's creëren wolken kruitrook die het zicht sterk belemmeren. https://www.nps.gov/media/video/view.htm?id=D0141D4F-557C-45C7-A762-39494B4E9177
- BlackPowderMag, *High Speed Video of a Flintlock*: vertraagde reeks kruitpan → ontsteking in loop → projectiel/uitstoot bij monding; heet gas uit het zundgat. https://www.blackpowdermag.com/high-speed-video-of-a-flintlock/
- US National Institute of Justice, *Evolution of Propellants*: zwartkruit produceert een dikke rookwolk. https://nij.ojp.gov/nij-hosted-online-training-courses/firearms-examiner-training/module-03/evolution-propellants
- Combustion Society of Japan (2018), *An Essay on Smoke Particle Formation in Black Powder Combustion*: rook bestaat vooral uit condensatie-/aerosoldeeltjes van kaliumverbindingen, afhankelijk van samenstelling. https://www.jstage.jst.go.jp/article/jcombsj/60/193/60_163/_article/-char/en

## In het spel

1. **0–0,24 s**, gerichte, korte, sterk gestrekte rookstoot langs de loop, met een kleine aparte kruitpanwolk en zeer korte kruitpanflits.
2. **0,24–1,05 s**, snel groter wordende, onregelmatige wit-/grijsgekleurde billows, met zachte werveling en nog duidelijk voorwaarts zwaartepunt.
3. **1,05–6,1 s**, langzaam vervagende wolk, consistent en zonder teleporteren meegenomen door de reeds bestaande automatische wind. Voor artillerie blijft de wolk langer bestaan.
4. **Salvo's**, schoten uit hetzelfde regiment worden bij elkaar gevoegd tot een steeds bredere rookbank in plaats van een onbegrensde reeks effectobjecten.

Er is geen nieuwe dependency gebruikt: bestaande Canvas2D plus per-schot deterministische ruis zijn voldoende. Rookevents blijven begrensd op 80; maximaal 15 grote billows per zichtbaar event en 7 op lage zoom. De rendering slaat effecten in de 3D-weergave over, maar wijzigt 3D niet. De animatieposities zijn los van echte eenheids-/projectielposities.
