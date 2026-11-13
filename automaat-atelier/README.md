# Automaat Atelier

Browser-app om bewegende 3D-printbare dieren (kinetische automaten) te ontwerpen, het mechanisme te simuleren en de onderdelen als STL te exporteren.

- Open `index.html` in een browser (internet nodig voor Three.js via CDN).
- `app.html` is dezelfde pagina zonder HTML-skelet (bron voor de gepubliceerde artifact-versie).

Mechanisme: een motor draait een nokas met excentrische nokken; elke nok duwt een volger op en neer, en stangen brengen die beweging over op de scharnierende vleugelsegmenten (vierstangenmechanisme). De simulatie lost per krukhoek de vleugelstand op en controleert blokkeren, overbrengingshoek, botsingen en of de onderdelen op het printbed passen.

Paard (galop): een N20-motor in het lijf drijft via tandwielen (10:20) een dwarse krukas aan. Per kant zit een gestapelde krukas met vier geprinte krukarmen; vier stangen bewegen onderarm/schenkel en knie/sprong van het voor- en achterbeen. De fase van elk been volgt de transversale galop (achter links, achter rechts, voor links, voor rechts, dan een zweeffase). Een pen op het tandwiel kantelt het lijf om een pen in de paal. De kniestangen worden numeriek ontworpen, zodat het been gestrekt is in de steunfase en het meest gebogen in de zwaaifase. De analyse toont een hoefslagdiagram en vergelijkt het ontwerp met meetwaarden uit de literatuur.
