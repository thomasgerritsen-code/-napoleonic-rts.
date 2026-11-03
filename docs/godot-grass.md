# Fijne bodemstructuur en echt 3D-gras

De uitgerekte Blender-kaart blijft de brede schaduw, bospatronen, erven en
het reliëf leveren. `GrassSurface3D` voegt dichtbij fijne grassprietjes,
bodemvezels en normaalreliëf toe in dezelfde terreinpass. Het mengt twee
wereldgebonden, gedraaide schalen van een naadloze 512px-tegel en behoudt
de grote kleurvariatie. De bestaande oevers en bermen gebruiken die fijne
structuur ook. Wegen, modder en water houden hun eigen oppervlak.

`Grass3D` tekent daarnaast echte, taps toelopende en gebogen sprieten in één
vaste MultiMesh: 5184 graspollen van zes sprieten. Elke gedeelde pol heeft
30 geïndexeerde vertices en 18 driehoeken. Dat begrenst de hele laag op
31.104 sprieten en 93.312 driehoeken, onafhankelijk van het aantal soldaten.
De kleine bladeren gebruiken zachte, naar boven gerichte verzamelingsnormalen
om licht te verstrooien en schaduwacne tegen de bodem te beperken. Ze ontvangen
wereldlicht en schaduwen, maar werpen zelf geen dure schaduwpassage.

De GPU verplaatst het raster rond de camera, met wereldvaste willekeurige
posities, hoogtes, richtingen en kleuren. De CPU hoeft daarvoor geen pollen
te verplaatsen of buffers opnieuw te uploaden. Wind buigt de sprieten; aan
de rand van het detailgebied en bij uitzoomen worden ze geleidelijk korter.
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
`grass_comparison.png`. De bestaande 400-eenhedencontrole blijft verplicht.
