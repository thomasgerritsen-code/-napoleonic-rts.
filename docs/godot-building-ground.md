# Godot: gebouwen bovenop de heuvel

Gebouwen werden op de hoogte van hun middelpunt gezet. Bij de kerk na de
eerste brug reikt de heuvel ongeveer een meter boven die hoogte. De gevel
verdween daardoor deels onder de grond.

`BuildingGround3D` bepaalt de echte onderste modelvoet, zonder dakoverstek.
Hij controleert hoeken, terreinpunten en doorsnijdingen met terreindriehoeken
binnen de gedraaide voetafdruk. De horizontale gebouwvoet staat net boven
het hoogste punt. Aan de lagere kanten sluit een stenen fundering aan op
het terrein. Het landschap, de botsingsvormen en de gameplayposities blijven
behouden. De correctie geldt voor dorpshuizen en door spelers gebouwde
structuren; akkers blijven op hun bestaande terreinhoogte.

Alle dorpsfunderingen gebruiken samen één mesh, en alle zichtbare funderingen
van spelersgebouwen een tweede. Bij ongewijzigde gebouwen wordt deze mesh
hergebruikt. Mist en gebouwzichtbaarheid blijven gelden. Steigers en lampen
volgen de verhoogde modellen. Klikken op de zichtbare gevel of fundering
gebruikt ook de werkelijke modelhoogte.

De verplichte `building_ground_test.gd` controleert alle 54 dorpsgebouwen,
de oorspronkelijke verzakking van de kerk, de twee gedeelde meshes,
bouwplaatsen, selectie, verborgen gebouwen en onveranderde netwerkstatus.
De voor-en-na-afbeelding herstelt voor het linkerbeeld alle oorspronkelijke
versie-73-transformaties en verbergt de nieuwe funderingen; camera, licht
en spelklok zijn gelijk. `building_ground_comparison.png` wordt samen met
de bestaande schermafbeeldingen gepubliceerd.
