# Godot: natuurlijker rivierwater

`RiverSurface3D` tekent dezelfde rivier als één ondoorzichtig oppervlak met
510 hoekpunten. De stromingscoördinaten volgen de 255 kaartpunten, ook in
bochten. Fijne, onregelmatige rimpels vervangen de brede herhalende strepen.
Een donkerder groenblauw midden en een ondiepe bodemkleur langs de rand geven
dieptewerking. Glans verandert met de kijkhoek; regen geeft kleine rimpels,
bruggen verstoren de stroming plaatselijk en winter vertraagt het water.

De turquoise rivierkleur in de gebakken grondafbeelding wordt alleen aan de
zichtbare waterrand naar vochtige aarde omgezet. Daken en bomen doen niet mee.
De oorspronkelijke bruggen, riviermiddellijn en navigatieregels blijven behouden.
De rivier gebruikt geen extra tekenlaag, schermreflectie, deeltjes of spelstatus.
Water, regen, sneeuw en sporen blijven samen vier vaste GPU-batches.

De verplichte `river_render_test.gd` meet echte veranderde waterpixels,
stromingsanimatie, mist, de geometriebegroting en onveranderde netwerkstatus.
Hij tekent ook een vastgelegde versie-70-referentie en de nieuwe rivier met
dezelfde camera, zon, spelklok, eenheden en stilgezette shader-tijd. De beelden
`river_before.png`, `river_after.png` en de naast-elkaar-figuur
`river_comparison.png` worden bij de bestaande schermafbeeldingen gepubliceerd.
De vergelijking gebruikt de echte spelbeelden, zonder opnieuw getekende inhoud.
