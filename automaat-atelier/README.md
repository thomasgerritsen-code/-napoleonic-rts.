# Automaat Atelier

Browser-app om bewegende 3D-printbare dieren (kinetische automaten) te ontwerpen, het mechanisme te simuleren en de onderdelen als STL te exporteren.

- Open `index.html` in een browser (internet nodig voor Three.js via CDN).
- `app.html` is dezelfde pagina zonder HTML-skelet (bron voor de gepubliceerde artifact-versie).

Mechanisme: een motor draait een nokas met excentrische nokken; elke nok duwt een volger op en neer, en stangen brengen die beweging over op de scharnierende vleugelsegmenten (vierstangenmechanisme). De simulatie lost per krukhoek de vleugelstand op en controleert blokkeren, overbrengingshoek, botsingen en of de onderdelen op het printbed passen.

Manta 1.0 / 2.0 / 3.0: 1.0 heeft een vaste vinpunt; 2.0 laat alleen de punt om een pen langs de spanwijdte draaien (±27°); 3.0 hangt elk buitensegment met een kruisstuk (cardan) aan het vorige op één rechte draaias, met kogelogen voor de vleugelstangen en kleine draaistangetjes tussen de segmenten, zodat de draaiing zich over de segmenten opbouwt (standaardvleugel: ongeveer −48° … +43° aan de punt; bron: −50° … +70° bij 0,85 halve span). Meer draaiing ging alleen met draaiwerk dat de vleugelstangen raakt.

Paard (galop): een N20-motor in het lijf drijft via tandwielen (10:20) een dwarse krukas aan. Per kant zit een gestapelde krukas met vier geprinte krukarmen; vier stangen bewegen onderarm/schenkel en knie/sprong van het voor- en achterbeen. De fase van elk been volgt de transversale galop (achter links, achter rechts, voor links, voor rechts, dan een zweeffase). Een pen op het tandwiel kantelt het lijf; een deinkruk op de as laat het lijf met een sleuf langs de paal op en neer gaan (hoogste punt in de zweeffase). De hals scharniert aan het lijf; een schuifblok op de paal en een hoofdstang vormen een parallellogram, zodat het hoofd niet meekantelt (zoals bij een echt paard). De kniestangen worden numeriek ontworpen, zodat het been gestrekt is in de steunfase en het meest gebogen in de zwaaifase. De analyse toont een hoefslagdiagram en vergelijkt het ontwerp met meetwaarden uit de literatuur.
