# Native Blender-modellen, november 2026

De gieterij, dorpskerk en herberg hebben eigen modellen. De gieterij heeft
bakstenen muren, een schoorsteen, leien dak, werkafdak, aambeeld, geschutkogels,
een gegoten loop en nationale kleuren. De kerk heeft steunberen, hoge ramen,
een klokkentoren met klok en een spits. De herberg heeft twee verdiepingen,
vakwerk, een pannendak, een uithangbord, bank en vaten.

`scripts/godot_architecture.py` beschrijft deze originele modellen in Blender.
Iedere gebouwvariant wordt één mesh met één 1024px-kleurtextuur. Er zijn vier
nieuwe gebouwbestanden: Franse/Britse gieterij, kerk en herberg. De koppeling
houdt de bestaande veldafmetingen, dorpsposities en zichtregels aan.

De 3D-soldaten gebruiken nu dezelfde uiterlijkkeuze als de sprites: drie
varianten lijninfanterie, grenadiers, voltigeurs/licht voetvolk, Franse garde
en sappeurs en Britse riflemen. Cavalerie krijgt herkenbare Franse kurassiers
en lansiers, Britse Scots Greys en bereden officieren van beide landen.
Uniformen, wapens en paarden komen rechtstreeks uit de bestaande originele
Blender-rigs; alle mars-, vuur-, melee- en valanimaties blijven beschikbaar.
De wijziging raakt uitsluitend de weergave, niet de troepstatistieken.

Alle twintig nieuwe bestanden samen zijn 9.198.348 bytes (8,77 MiB).
PackedScenes, meshes en materialen worden per uiterlijk gedeeld; de bestaande
camera-afhankelijke animatiepauze blijft actief.

Reproduceer vanuit de hoofdmap met Blender 4.3 of nieuwer:

```sh
blender -b --python scripts/export-godot-3d.py -- --only foundry_fr foundry_br chapel inn
blender -b --python scripts/export-godot-3d.py -- --only infantry4_fr infantry5_fr infantry6_fr infantry7_fr infantry6_br
blender -b --python scripts/export-godot-3d.py -- --only mounted_fr mounted_br cuirassier_fr lancer_fr greys_br
```

`infantry2_fr`/`infantry3_fr` en hun Britse equivalenten leveren de variatie
bij gewone lijninfanterie; `infantry4_br`/`infantry5_br` de Britse compagnieën.
De native exporter bouwt de uiteindelijke eenvoudige kleurmaterialen direct,
zodat Blender4 en nieuwere versies dezelfde materiaalkeuze exporteren.
De browser-spritegeneratoren en hun materiaalprocedures zijn niet gewijzigd.

`godot/tests/native_art_test.gd` controleert de modellen, textuurbudgetten,
animaties en troepkoppelingen. `godot/tests/art_gallery.gd` maakt de echte
Godot-beelden `new_buildings.png` en `new_troops.png` (map via `SHOT_DIR`).
De CI draait de modelcontrole vóór de Windows-export.
