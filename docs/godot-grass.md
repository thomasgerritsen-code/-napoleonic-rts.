# Fijne bodemstructuur en echt 3D-gras

De uitgerekte Blender-kaart blijft de brede schaduw, bospatronen, erven en
het reliëf leveren. `GrassSurface3D` voegt dichtbij fijne grassprietjes,
bodemvezels en normaalreliëf toe in dezelfde terreinpass. Het mengt twee
wereldgebonden, gedraaide schalen van een naadloze 512px-tegel en behoudt
de grote kleurvariatie. De bestaande oevers en bermen gebruiken die fijne
structuur ook. Wegen, modder en water houden hun eigen oppervlak.

`Grass3D` tekent daarnaast echte, taps toelopende en gebogen sprieten in één
vaste MultiMesh: 5184 graspollen van acht sprieten. Elke gedeelde pol heeft
56 geïndexeerde vertices en 40 driehoeken. Dat begrenst de hele laag op
41.472 sprieten en 207.360 driehoeken, onafhankelijk van het aantal soldaten.
De kleine bladeren gebruiken zachte, naar boven gerichte verzamelingsnormalen
om licht te verstrooien en schaduwacne tegen de bodem te beperken. Ze ontvangen
wereldlicht en schaduwen, maar werpen zelf geen dure schaduwpassage.

De GPU verplaatst het raster rond de camera, met wereldvaste willekeurige
posities, hoogtes, richtingen en kleuren. De CPU hoeft daarvoor geen pollen
te verplaatsen of buffers opnieuw te uploaden. Wind buigt de sprieten; aan
de rand van het detailgebied en bij uitzoomen worden ze geleidelijk korter.
De langere sprieten hebben drie buigsegmenten. Reizende windvlagen sturen
een cirkelboog vanaf de vaste wortel aan, met lichte verschillen per spriet.
Die boog behoudt de lengte; de top buigt met de wind mee en veert terug.
Bij windstilte stopt de animatie. Bovenkant en bladnormalen bewegen samen,
zodat de vlagen ook door veranderend licht zichtbaar worden.
Vanaf 95 m cameraafstand wordt de geometrie niet getekend. Sneeuw begraaft de
sprieten. Regen en seizoenen beïnvloeden kleur en oppervlakteruwheid.
Sprieten stoppen bij de werkelijke laatste terreintriangles, ook waar de
logische kaart nog een gedeeltelijke cel verder doorloopt.

Wortels gebruiken exact dezelfde twee grondtriangles per reliëfcel als het
terrein, niet alleen een bilineair benaderde hoogte. Het bestaande
wegafstandsveld en rivierprofiel houden bestrating, bruggen en water vrij.
Een 0,5m-masker uit de oorspronkelijke kaart voorkomt gras op kale erven.
Een hergebruikt tweede masker volgt de echte gedraaide modelomvang van
dorpshuizen en zichtbare spelersgebouwen, plus loopgraven en kraters.
Alleen een gewijzigde indeling bouwt dat masker opnieuw op. Verborgen of
verwijderde gebouwen veroorzaken geen nieuwe kale vlekken. De mist werkt
ook op de sprieten. Er zijn geen eenhedenscans, CPU-deeltjes, extra
spelregels, aangepaste navigatie of nieuwe netwerk- en savevelden.

`scripts/export-godot-grass.py` maakt de twee reproduceerbare PNG's met NumPy
en Pillow. De bedekkingskaart bemonstert de oorspronkelijke Blender-plaat
met de bestaande reliëfprojectie; de tegel bevat vezelkleur in RGB en
reliëf in alpha. De bijgehouden `.import`-instellingen houden die data
verliesvrij en schakelen alpha-randcorrectie uit. Alleen de detailtegel
heeft mipmaps, zodat fijne vezels bij uitzoomen niet gaan flikkeren.

`grass_render_test.gd` gebruikt de echte renderer en dezelfde scène/camera
om de grond uit versie 77 met de nieuwe structuur en geometrie te vergelijken.
Een aparte bovenaanzicht-viewport gebruikt de echte grasshader en buffer,
zonder grond of huizen die fout geplaatste sprieten kunnen verbergen. Die
controleert open gras, bestrating, rivier, funderingen, plaatsing, verborgen
en verwijderde huizen, loopgraven, kraters, mist en sneeuw. Daarnaast worden
camera-/bufferhergebruik, windbeweging, RNG-behoud, de volledige autoritaire
spelstatus en ver uitzoomen gecontroleerd. De CI-stap is verplicht en
publiceert `grass_before.png`, `grass_ground.png`, `grass_after.png` en
`grass_comparison.png`. De bestaande 400-eenhedencontrole blijft verplicht en
controleert ook een normale cameraafstand met volledige grasgeometrie.

`grass_wind_test.gd` meet daarnaast de pixelposities van echte wortel- en
tipmarkeringen door de productie-GPU-shader. Wortels blijven stil, toppen
bewegen zichtbaar, windstilte stopt ze en sterkere wind geeft meer buiging.
De bewaarde versie-79-shader en het oorspronkelijke zes-sprietenmodel
leveren de linkerhelft van een bewegende vergelijking, bij exact dezelfde
camera, bodem, windinvoer en stilgezette simulatie. De rechterhelft toont de
nieuwe sprieten. De 32 echte frameparen vormen een GIF en MP4 van vier
seconden. `grass_wind_comparison.png`, `.gif` en `.mp4` worden gepubliceerd.
Er worden geen beelden geïnterpoleerd of bewegingen achteraf verzonnen.
