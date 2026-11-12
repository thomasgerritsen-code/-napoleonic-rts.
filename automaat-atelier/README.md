# Automaat Atelier

Browser-app om bewegende 3D-printbare dieren (kinetische automaten) te ontwerpen, het mechanisme te simuleren en de onderdelen als STL te exporteren.

- Open `index.html` in een browser (internet nodig voor Three.js via CDN).
- `app.html` is dezelfde pagina zonder HTML-skelet (bron voor de gepubliceerde artifact-versie).

Mechanisme: een motor draait een nokas met excentrische nokken; elke nok duwt een volger op en neer, en stangen brengen die beweging over op de scharnierende vleugelsegmenten (vierstangenmechanisme). De simulatie lost per krukhoek de vleugelstand op en controleert blokkeren, overbrengingshoek, botsingen en of de onderdelen op het printbed passen.
