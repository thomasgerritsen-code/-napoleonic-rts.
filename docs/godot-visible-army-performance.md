# Godot: veel zichtbare manschappen

De oorspronkelijke native Blender-eenheden bestonden uit tientallen losse
MeshInstance3D-nodes. Een lijninfanterist had 78 meshes en 94 onderliggende
nodes, een ruiter 159 meshes en 203 nodes. Ook met animaties buiten beeld
gepauzeerd bleef het tekenen van een zichtbaar leger daardoor duur.

## Samengevoegde GPU-rigs

`ActorSkin3D` maakt uit de bestaande geïmporteerde Blender-modellen één
GPU-skinned mesh met een Skeleton3D. Elk origineel onderdeel blijft aan zijn
eigen bone gekoppeld. De oorspronkelijke lokale geometrie, animatiekeys,
interpolatie en overgangen blijven behouden; de animatiepaden wijzen nu naar
bones in plaats van tientallen afzonderlijke Node3D's.

Een gedeeld materiaal leest per vertex de oorspronkelijke kleur, ruwheid,
metaalglans, specular en emissie. De kleurverwerking volgt StandardMaterial3D
in de gebruikte renderer. Er verdwijnen geen uniformen, wapens of gereedschappen.
Nulschalen die een onderdeel verbergen blijven nulschalen; daarvoor wordt geen
singuliere inverse-bindmatrix berekend.

Ook de door Godot geïmporteerde afstandsdetails blijven beschikbaar: hun
oorspronkelijke indexbuffers worden samengevoegd tot maximaal zestien niveaus.
Tussen die niveaus blijft een onderdeel op een fijner niveau staan tot het
volgende niveau bereikt is. De volledige geometrie voor dichtbij is ongewijzigd.
De oorspronkelijke GLB-bestanden en Blender-bronnen blijven gewoon bewerkbaar.

De resulterende PackedScenes, geometrie en materialen worden per model gedeeld
en hergebruikt bij F3-wissels. Iedere eenheid houdt zijn eigen skeleton en
animatietijd. Niet-ondersteunde toekomstige modeltypen gebruiken hun oorspronkelijke
scene; de regressies vereisen dat alle dertig huidige geanimeerde modellen de
samengevoegde route daadwerkelijk gebruiken. De spelregels, beweging, selectie,
brughoogten, mist van de oorlog en online synchronisatie veranderen niet.

## Gemeten renderlast

Dezelfde stilstaande veldslag: 400 zichtbare eenheden (388 infanteristen plus de
twaalf startboeren), zes lijninfanterie-uiterlijken, dezelfde kaart, camera,
640×400-resolutie en echte schaduwen. Tekenopdrachten omvatten ook de omgeving
en de schaduwpassen; actor-meshes omvatten de selectieringen.

| Meting | Oorspronkelijke rigs | GPU-rigs |
| --- | ---: | ---: |
| Actor-meshes | 33.242 | 800 |
| Tekenopdrachten per beeld | 86.128 | 1.246 |
| Nodes in de veldslag | 42.024 | 4.334 |
| Godot statisch geheugen (MiB) | 286,8 | 139,0 |

Dat is ongeveer 98,6% minder tekenopdrachten en 89,7% minder nodes. Met 400
gemengde eenheden, inclusief ruiterij en kanonnen met bemanning, waren er
832 actor-meshes en 1.342 tekenopdrachten. De verplichte rendertest begrenst
dit op 1.000 actor-meshes en 5.000 tekenopdrachten.

De lokale testmachine gebruikt Mesa llvmpipe, een software-renderer. De
structurele afname hierboven is meetbaar, maar is geen FPS-belofte voor een
fysieke Windows-GPU. GPU-skinning verplaatst werk naar de grafische pipeline;
de uiteindelijke snelheid hangt ook af van videokaart, resolutie en simulatie.
Het benchmarkscript rapporteert daarom de renderer en frame-/CPU-tijden.
In de gecontroleerde dertig-beeldenmeting op llvmpipe daalde de mediane
beeldtijd van 834,5 naar 778,4 ms en p95 van 892,4 naar 840,4 ms. Die
softwaretijden zijn geen bruikbare schatting van hardware-GPU-FPS. De
geheugenteller is Godots statische geheugenteller, niet al het procesgeheugen
of videogeheugen.

## Reproduceren en kwaliteit bewaken

Voer beide metingen afzonderlijk uit, zonder andere zware tests tegelijk:

```sh
ORIGINAL_ACTORS=1 godot --path godot --rendering-driver opengl3 \
  --audio-driver Dummy --resolution 640x400 --script res://tests/render_load_benchmark.gd
ORIGINAL_ACTORS=0 godot --path godot --rendering-driver opengl3 \
  --audio-driver Dummy --resolution 640x400 --script res://tests/render_load_benchmark.gd
```

`ORIGINAL_ACTORS` wordt uitsluitend door dit benchmarkscript gelezen. Het spel
zelf heeft hiervoor geen verborgen instelling. Iedere meting warmt vier beelden
op en meet daarna dertig beelden, met de simulatie en het weer stilgezet.

Verplichte controles vóór Windows-export:

- `skin_regression.gd`: alle dertig modellen, ongewijzigde volledige vertex- en
  driehoekaantallen, LOD-buffers, 1.540 poses plus overgangen. De grootste gemeten
  gecombineerde positie-/basisafwijking was 0,0000082. Geometrie wordt gedeeld,
  skeletonposes blijven onafhankelijk.
- `skin_visual_test.gd`: werkelijk gerenderde oorspronkelijke/GPU-beelden van
  lopen, paarden, werken, schieten, vallen, kurassiers en kanonniers. De
  silhouette-overeenkomst was minstens 99%; de gemiddelde kleurafwijking in
  de voorgrond bleef onder 0,7%. Randen kunnen door rasterisatie en de gedeelde
  keuze van afstandsdetails enkele pixels verschillen.
- `render_regression.gd`: 400 gemengde eenheden, renderbudget, herhaalde
  gevechtsanimaties, gevallen houdingen, camerawissels en herstel van 2D.

De bestaande controles voor de vijf bruggen, weer, bouwplaatsen en een volledige
veldslag met opslaan/laden en ENet blijven verplicht.
