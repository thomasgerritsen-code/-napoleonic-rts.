# Godot: daglicht zonder uitgebleekte materialen

De combinatie van direct zonlicht (1,18), omgevingslicht (0,57) en een
filmisch witpunt van 1 liet lichte materialen in de pc-renderer wit uitslaan.
In de oorspronkelijke gerenderde proef werden de grijstinten 0,75 en 0,90
allebei volledig wit. Zelfs middengrijs verloor al detail in twee kanalen.

`WorldClimate3D` bepaalt nu de gezamenlijke lichtbalans. Overdag is de zon
0,65, het omgevingslicht 0,24, de belichting 0,82 en het witpunt 2.
`View3D` gebruikt dezelfde zonberekening als het klimaat, met behoud van de
geleidelijke bewolking. Zo zijn er geen verschillende zonwaarden meer in
de renderer en de klimaatgegevens. De eerste frame gebruikt ook deze balans.
De sneeuwkleur is op de nieuwe lichtsterkte afgestemd zodat sneeuw koel wit
blijft en de terreinstructuur zichtbaar is.

Tijdens de schemering lopen belichting en witpunt vloeiend terug naar de
bestaande nachtinstellingen. Maanlicht, warme ramen en schotlichten behouden
hun bestaande nachtsterkte. De correctie verandert geen spelregels, zicht,
opgeslagen spelstanden of multiplayerberichten en voegt geen renderpass toe.
De 2D-weergave en de oorspronkelijke Blender-materialen blijven behouden.

`godot/tests/lighting_render_test.gd` gebruikt de werkelijke omgeving en zon
van een geladen veldslag. Vier matte meetvlakken worden met de pc-renderer
getekend en op hun pixels gecontroleerd. De lichte tinten moeten verschillend
blijven, hooglichten houden ruimte en middentonen blijven leesbaar. De test
controleert middagzon en winter, zachter daglicht bij regen en leesbaar blauw
maanlicht bij nacht. Met `SHOT_DIR` bewaart hij ook de veldslag en meetvlakken.
Deze controle is verplicht vóór de Windows-export.
