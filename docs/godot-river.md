# Godot: natuurlijker rivierwater

`RiverSurface3D` tekent dezelfde rivier als één ondoorzichtig oppervlak met
1026 hoekpunten. Een gedeeld profiel met 513 monsters volgt de 255 kaartpunten, ook in
bochten. Fijne, onregelmatige rimpels vervangen de brede herhalende strepen.
Een donkerder groenblauw midden en een ondiepe bodemkleur langs de rand geven
dieptewerking. Glans verandert met de kijkhoek; regen geeft kleine rimpels,
bruggen verstoren de stroming plaatselijk en winter vertraagt het water.

`RiverBanks3D` maakt de bedding en oevers in dezelfde terreinmesh. Alleen de
onbegaanbare riviergrond wordt verlaagd; de droge grond houdt zijn oorspronkelijke
hoogte. De waterlijn volgt datzelfde profiel, ligt onder de oever en varieert
licht in breedte. Alleen bij de rivier krijgt het terrein kleinere driehoeken;
het hele terrein blijft één tekenlaag met minder dan 60.000 hoekpunten.

De brede geschilderde oeverbanen krijgen een ruimtelijk begrensde overgang van
vochtige aarde naar een schoon grasdeel uit de bestaande grondatlas. Vier
overlappende UV-verschuivingen mengen de randen van dit grasdeel, zonder nieuwe
textuur of zichtbare tegelnaden. Brugtoegangen behouden hun weg. Daken en bomen doen niet mee.
De oorspronkelijke bruggen, riviermiddellijn en navigatieregels blijven behouden.
De rivier gebruikt geen extra tekenlaag, schermreflectie, deeltjes of spelstatus.
Water, regen, sneeuw en sporen blijven samen vier vaste GPU-batches.

De verplichte `river_render_test.gd` meet echte veranderde waterpixels,
stromingsanimatie, mist, de geometriebegroting en onveranderde netwerkstatus.
Hij controleert ook de echte bedgeometrie, onveranderde droge hoogten en een
vast geometriebudget. Hij tekent een vastgelegde versie-72-referentie en de nieuwe rivier met
dezelfde camera, zon, spelklok, eenheden en stilgezette shader-tijd. De beelden
`river_banks_before.png`, `river_banks_after.png` en de naast-elkaar-figuur
`river_banks_comparison.png` worden bij de bestaande schermafbeeldingen gepubliceerd.
De vergelijking gebruikt de echte spelbeelden, zonder opnieuw getekende inhoud.
