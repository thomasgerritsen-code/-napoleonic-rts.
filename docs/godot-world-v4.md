# Godot: weer, seizoenen en bouwplaatsen

Deze uitbreiding geldt voor de native 3D-veldslag (menu *Veldslag in 3D*, of F3).
De bestaande 2D-versie en de browsergame behouden hun eigen weergave.

## Wereld

- Eén riviermesh volgt de bestaande bedding en breedte. Procedurele golven,
  oeverranden en stroming rond bruggen bewegen op de GPU. Winterkleuren aan de
  oever veranderen de begaanbaarheid van water niet.
- Regen en sneeuw gebruiken respectievelijk 1536 en 768 hergebruikte quads.
  Deeltjes vallen rond de camera, met grondhoogte uit de bestaande terreinkaart.
  De oude CPU-regenlaag staat in 3D uit. Er is geen regenobject per druppel.
- Eén ringbuffer van 2048 quads bewaart schoen- en hoefsporen, maximaal 150 s.
  Sporen verschijnen bij bewegende zichtbare eenheden op natte of besneeuwde
  grond, vervagen en worden overschreven. Brugdekken krijgen geen grondsporen.
- Materiaaluniformen voor natheid, sneeuw en bladkleur verversen op 10 Hz.
  Bladgroen verandert in herfstkleur; loofbomen verliezen hun bladeren in de
  winter, naaldbomen blijven groen. Lichte boombeweging gebeurt in de vertexshader.
- De bestaande vier seizoenen duren elk 240 spel-seconden. De laatste 45 s
  mengen naar het volgende seizoen. Dezelfde regenbui verschijnt in de winter
  als sneeuw. Dit is visuele seizoensbedekking, geen fysieke sneeuwsimulatie.
- Zonlicht, omgevingslicht, nevel en hemel volgen de bestaande dag/nachtklok
  en bewolking. Dak- en grondmaterialen bewaren kleur- en schaduwdetail in sneeuw.
  Ramen en de kolenhaard van de gieterij gloeien via het materiaal. Er komen
  daarvoor geen extra lampen per raam bij; bestaande gebouwlampen blijven behouden.

## Bouwplaatsen

Een gebouw heeft tijdens de bouw steeds zijn echte verhoudingen. Een shader
onthult het van onder naar boven: fundering, muren en dak. Een hergebruikte
MultiMesh per actieve bouwplaats draagt houten steigerpalen, werkvloeren,
schoren, ladder en een afnemende houtstapel. Alleen bij een fasewisseling
verandert deze geometrie. Voltooiing of verwoesting ruimt de steiger op.
Steigermateriaal en gebouwen respecteren de bestaande mist van de oorlog.

`Construction3D` verzacht alleen de getoonde voortgang over circa 0,1 s.
Kosten, werkers, bouwtijd, dekking en obstakels blijven door de simulatie bepaald.
Deze weergave is ook bruikbaar na laden of na een online snapshot.

## Grenzen en prestaties

De wereld voegt vier vaste batches toe: water, regen, sneeuw en sporen. Droge
neerslagbatches worden verborgen; de sporenbuffer groeit niet tijdens een lange
veldslag. De materialentabel gebruikt zwakke verwijzingen zodat vervangen of
afgebroken modellen geen oude materialen vasthouden. Bouwplaatsen hebben elk één
extra batch zolang ze bestaan; voltooide gebouwen hebben geen steigerbatch.

De presentatie leest uitsluitend de bestaande spelklok, natheid, regen en
bouwvoortgang. Ze gebruikt geen simulatie-RNG. De huidige host blijft dus
verantwoordelijk voor weer en seizoenen, zonder extra netwerkberichten.
De rivier, bomen, schaduwen en sneeuw veranderen geen navigatie of gevechtsregels.

Dit is gericht op vaste renderkosten en geheugenbegrenzing. De lokaal gebruikte
Mesa-software-renderer bewijst zichtbare rendering, geen FPS op een fysieke GPU.
Veel transparante deeltjes en grote zichtafstanden kunnen op zwakke apparaten
nog steeds extra GPU-tijd kosten.

## Reproduceerbare controles

Voer uit vanuit de repository, na een Godot-import:

```sh
godot --headless --path godot --script res://tests/world_3d_test.gd
godot --path godot --rendering-driver opengl3 --audio-driver Dummy \
  --resolution 1400x860 --script res://tests/world_3d_shots.gd
```

De eerste controle test seizoenovergangen, het verschil tussen regen en sneeuw,
vaste buffers, bruggen, bouwvoortgang, materiaalopruiming en ongewijzigde
autoritatieve spelstand. De tweede tekent regen en sneeuw in een echte renderer
en vergelijkt daadwerkelijk veranderde pixels met een lege viewport. Hij
controleert ook dat sneeuw niet overwegend tot vlak wit overbelicht raakt. Daarnaast
maakt hij beelden van alle seizoenen, regen, sneeuw, nacht, sporen en vijf
bouwfasen. `SHOT_DIR` kiest de uitvoermap. Beide controles zijn verplichte
GitHub-controles vóór de Windows-export en publicatie.

De bestaande regressies voor 400 gedetailleerde 3D-eenheden, navigatie, originele
Blender-modellen en een volledige veldslag met online synchronisatie blijven
eveneens verplicht.
