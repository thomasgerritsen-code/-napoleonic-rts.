# Schoorsteenrook bij koud weer

`WorldClimate3D.sample()` geeft nu ook een visuele luchttemperatuur terug.
Die volgt de bestaande seizoenovergangen en dag/nachtklok, met koelere
nachten en bewolkte uren. Het zijn geen nieuwe spelregels: regen, sneeuw,
voorraden, navigatie, netwerkberichten en saves veranderen niet.

`ChimneySmoke3D` laat verwarmingsrook geleidelijk toenemen tussen 12 en 1 °C.
Onder 1 °C is de rooksterkte volledig; boven 12 °C dooft hij rustig uit.
De rook stijgt op, zet uit, verwaait met de bestaande wind en verdwijnt.
De kleur volgt dag- en nachtlicht. Beide mistmonsters, bij de schoorsteen
en bij de afgedreven rook, verhinderen dat verborgen of eerder verkende
gebouwen door hun rook worden verraden.

De emitterpunten staan in lokale Godot-coördinaten boven op de echte
Blender-schoorsteenkappen van woonhuizen, boerderijen, herbergen, kazernes
en gieterijen. Dorpsbronnen gebruiken de uiteindelijke, op de heuvel
ondersteunde gebouwtransformaties. Spelersgebouwen gebruiken hun actuele
modeltransformatie en roken pas na voltooiing. Verborgen, verwijderde en
verwoeste gebouwen worden overgeslagen. Schuren, kerktorens en tenten
hebben geen schoorsteen en krijgen ook geen rook.

Alle pluimen gebruiken één extra MultiMesh-laag met maximaal 96
schoorstenen en 12 zachte GPU-wolkjes per schoorsteen: 1152 vaste slots.
De shader berekent alle beweging; er zijn geen CPU-deeltjes, losse nodes
per pluim of eenhedenscans. Alleen gewijzigde bronlijsten uploaden de
hergebruikte buffer opnieuw. Een bereik rond de camera beperkt bronnen
op afstand; bij overbelasting krijgen de dichtstbijzijnde voorrang.
Bij warm weer stopt het tekenen van de rooklaag. De bestaande vier
weereffectlagen en drie gevechtseffectlagen blijven intact.

`godot/tests/chimney_smoke_test.gd` controleert echte kapvertices,
temperatuurgrenzen en vloeiende seizoenovergangen, RNG-behoud, de volledige
autoritaire spelstatus, zichtbare rook en windbeweging, mist, warm weer,
bouw/zichtbaarheid/verwoesting/verwijdering en de vaste limiet bij 160
schoorstenen. De verplichte renderercontrole publiceert de winterbeelden
`chimneys_before.png`, `chimneys_after.png` en `chimneys_comparison.png`.
Dezelfde scène, lichtstand en stilgezette simulatie worden gebruikt; alleen
de nieuwe rooklaag wordt uit- en aangezet voor de vergelijking.
