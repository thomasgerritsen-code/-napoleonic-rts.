# Wegen in de native 3D-weergave

De grote terreinplaat verloor van dichtbij zijn wegdetails. `RoadSurface3D`
voegt bestrate hoofdwegen, grind, onverharde karrensporen en onregelmatige
bermen toe in dezelfde terreinpass. De oorspronkelijke 18 wegen worden niet
verplaatst; ook terrein, bruggen, navigatie, saves en netwerkdata blijven gelijk.

`scripts/export-godot-roadfield.py` maakt twee reproduceerbare data-afbeeldingen
met NumPy en Pillow, zonder Blender opnieuw te renderen. De wegvormen gebruiken
dezelfde twee Chaikin-passes en gladde afstandsminima als de Blender-exporteur
`render-iso-gamemap.py`. `road_field.png` (1423×889, 0,25 m per texel) bevat
afstanden tot hoofd- en zijwegen, de positie over een onverharde weg en de
vervaging van karrensporen bij kruispunten. `road_detail.png` is een naadloze
256×256-tegel met steenkleur, afgerond reliëf, grind en slijtage. Samen zijn de
bestanden circa 250 kB, uitgepakt circa 5,4 MB inclusief detailmipmaps.

De twee bewust bijgehouden `.png.import`-bestanden schakelen alpharandcorrectie
en verliesgevende compressie uit: alpha bevat data, geen transparantie. Alleen
de herhalende detailtegel heeft mipmaps; het afstandsveld wordt lineair gelezen.
De sampler gebruikt werkelijke kaartafmetingen inclusief de afronding naar
hele texels. Er wordt geen afbeelding op de CPU gelezen of opgebouwd per frame.

De bestaande grondshader krijgt één afstandslookup en alleen nabij wegen de
detailtegel en bermtextuur. Afgeronde stenen krijgen subtiel afgeleid
normaalreliëf; de loophoogte verandert niet. Regen maakt lage delen donkerder
en minder ruw, sneeuw bedekt het geheel, en de bestaande mist blijft gelden.
De shader gebruikt geen extra wegmesh, drawcall of individuele wegobjecten.
`field3d.gd` bevat alleen de materiaalhooks; `view3d.gd` configureert alleen de
grondmaterialen, zodat gebouwen en veldwerken hun eigen oppervlak behouden.

`godot/tests/road_render_test.gd` controleert met een echte renderer alle 18
wegcorridors, vijf brug­aansluitingen, zichtbare verandering, regen, sneeuw,
mist, geometriebehoud en de volledige autoritaire spelstatus. De verplichte
CI-stap publiceert `roads_before.png`, `roads_after.png`, `roads_rain.png`,
`roads_winter.png` en `roads_comparison.png`. De vergelijking zet uitsluitend
de nieuwe wegshader uit/aan op dezelfde v74-grond, bij dezelfde camera,
lichtstand en stilgezette simulatie. De 400-eenhedentest blijft verplicht.
