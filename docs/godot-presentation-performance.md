# Alleen de gekozen weergave bijwerken

Godot gebruikt één gedeelde veldslagsimulatie. `Unit`, `Building`, de economie,
navigatie, gevechten, mist en weerregels blijven actief in 3D. Het zijn geen
twee afzonderlijke spellen. `Presentation2D` schakelt alleen het overbodige
2D-beeldwerk uit wanneer `View3D` de veldslag toont:

- Soldaten, paarden, kanonniers, wild en brancarddragers laden hun sprite-atlassen
  pas wanneer de speler daadwerkelijk naar 2D schakelt. Nieuwe rekruten starten
  in 3D met een uitgeschakelde, lege animatienode.
- 2D-rook en lichtflitsen worden niet meer naast de 3D-effecten aangemaakt.
  De verborgen 2D-effecten en lampen krijgen geen procesupdates. Hun oude
  effecten verouderen bij terugschakelen in één stap.
- De 2D-camera leest geen toetsen, muis of aanrakingen meer tijdens 3D.
  `focus()` blijft beschikbaar voor de minimap en selectie; de 3D-camera volgt
  die bestemming zoals voorheen.
- 2D-sortering op diepte, daglichtberekening, hospitaaltekens en het hertekenen
  van de verborgen overlay stoppen. Marker- en beveltimers blijven lopen.
- Loopgraven berekenen hun gedeelde leunhouding voor de 3D-soldaten, zonder
  2D-banksprites, revetment, silhouetpolygonen en knipshaders bij te werken.
- De CPU-regen in 2D staat volledig uit. Regen, natheid en seizoenen blijven
  veranderen; de 3D-atmosfeer blijft ze tekenen.

Niet alle `Node2D`-ouders mogen worden stilgezet. Bomen gebruiken hun
zichtbaarheidsgegevens ook voor de 3D-boslaag, gewonden moeten hun dragers
blijven volgen en vertraagde granaatschade moet doorgaan. De 3D-granaattimer
is daarom aan de veldslag gebonden en maakt geen verborgen 2D-projectiel aan.
`Smoke3D` gebruikt daarnaast een eigen RNG voor cosmetische deeltjes, zodat
het verwijderen van verborgen beeldwerk de toevalsreeks van gevechten niet
hoeft te verbruiken.

F3 herstelt de 2D-presentatie op aanvraag: huidige richting, lopende houding,
kanonniers, dieren, dragers, licht en invoer. Een soldaat die in 3D al gevallen
is, komt als liggend lichaam terug. Er veranderen geen save- of netwerkvelden.

De veldslag laadt de presentatiehelper op zijn bestandspad nadat het eigen
script is gecompileerd. Een bestaande Xogot-installatie hoeft de nieuwe globale
klassenaam daardoor niet eerst in zijn klasse-index te hebben geregistreerd.
`scripts/check-godot-presentation-cache.py` maakt een geïsoleerde oude index
zonder die registratie en controleert zowel het parsen als de volledige
presentatie-/gameplaytest. De werkende projectcache wordt daarbij niet gewijzigd.

## Metingen en controles

Bij dezelfde lokale headless-opstelling, direct na het klaarzetten van 400
eenheden (340 extra infanteristen, 32 cavaleristen, 16 kanonnen en de 12
oorspronkelijke boeren), daalde het gemeten statische procesgeheugen van
649,1 naar 213,4 MiB. Het aantal geladen 2D-atlassensets daalde van 19 naar 0.
Dit is een meting van opstart-/presentatiegeheugen met Godot 4.6.3, niet van
de GPU of de framerate op een iPhone. De bestaande complete 400-modeltest
wordt daarnaast met de echte renderer uitgevoerd.

De verplichte `presentation_3d_test.gd` controleert lege 2D-atlassen, slapende
animaties en callbacks, exclusieve 3D-effecten, behoud van gevechts-RNG en
volledige autoritaire toestand, regen/natheid, lopende soldaten, gewondenvervoer,
vertraagde granaatschade en twee richtingen van de weergavewissel. De bestaande
400-eenheden-, loopgraaf-, veldslag-, klimaat- en telefooncontroles blijven staan.
