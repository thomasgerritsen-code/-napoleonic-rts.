# Gedetailleerde native huizen

`scripts/godot_house_details.py` werkt de bestaande Blender-modellen voor
woonhuis, boerderij, schuur, herberg en kerk verder uit. Het voegt verdiepte
ramen, stijlen en dorpels, vensterbanken, luikbeslag, deurhengsels, dakranden,+nokstukken, hoekstenen en boerderijschoren toe. De materialen bevatten
metselwerk, dakbedekking, houtstructuur, lichte verwering en beperkte lokale
occlusie. Het zonlicht wordt niet in de textuur vastgelegd.

De nieuwe modellen staan in `godot/assets3d/houses/`. De vijf oorspronkelijke
GLB's blijven beschikbaar voor een echte vergelijking met pc-versie 75.
Alleen de modelkeuze in `View3D._scene()` verandert; dezelfde modellen worden
gebruikt voor dorpsgebouwen en de overeenkomstige spelersgebouwen. De
gecombineerde MultiMeshes, funderingen, bouwsteigers en mistmaterialen blijven
in gebruik. De nachtshader herkent de donkere blauwe vensterglazen nog steeds.

Elke GLB bevat één mesh, één oppervlak en één ingebakken 1024px-atlas. Samen
zijn de vijf modellen ongeveer 5,5 MB en 11.632 driehoeken, verdeeld als
1520/3764/584/3284/2480 voor woonhuis/boerderij/schuur/herberg/kerk. Er komen
geen afzonderlijke raamobjecten, extra materiaalpassages of updates per huis
bij. De oorspronkelijke horizontale omvang en lage funderingsgeometrie
blijven behouden; terrein, navigatie, saves en netwerkregels veranderen niet.
De uitgepakte GPU-texturen vragen wel meer geheugen dan de oude atlas van
512px voor het kleine woonhuis. De overige huistypen gebruikten al 1024px.

Opnieuw bouwen met Blender 4.3 of nieuwer:

```sh
blender -b -t 2 --python scripts/export-godot-3d.py -- \
  --out godot/assets3d/houses --only cottage farmhouse barn inn chapel \
  --house-details
```

De detailoptie gebruikt een eigen Blender 4+-materiaalpalet en verandert de
websprites niet. Godot haalt de ingebedde albedo-afbeeldingen bij import uit
de GLB's; die gegenereerde afbeeldingen staan daarom in `.gitignore`.

`house_details_test.gd` vergelijkt alle vijf modelbases met de echte oude
modellen, controleert materiaal- en driehoeklimieten en de volledige
autoritaire spelstatus. Met een echte renderer vervangt de vergelijking
alleen de vijf dorpsmeshes en hun texturen, bij dezelfde camera, plaatsing,
funderingen, weg, lichtstand en stilgezette tijd. De verplichte CI-stap
publiceert `houses_before.png`, `houses_after.png` en `houses_comparison.png`.
De bestaande controles voor 400 eenheden, gebouwen op hellingen, constructie,
mist, verlichting en seizoenen blijven verplicht.
