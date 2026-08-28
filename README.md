# Napoleonic RTS — v0.3.1

Browser-RTS geïnspireerd door klassieke Napoleontische strategiespellen. De game draait volledig in HTML5 Canvas + JavaScript.

## ▶ Speel nu

GitHub Pages:

https://thomasgerritsen-code.github.io/-napoleonic-rts./

## Bugfix v0.3.1

Deze versie repareert twee belangrijke gameplayproblemen uit v0.3:

- Barracks-productieknoppen blijven nu stabiel bestaan en worden niet meer ieder frame vervangen.
- Startende population cap verhoogd van 20 naar 40; de startpopulatie is 30/40, waardoor je direct nieuwe musketiers kunt trainen.
- House verhoogt de population cap met 15.
- Formatieknoppen hebben nu een duidelijke actieve status.
- Linie, colonne en carré worden direct op de geselecteerde eenheden toegepast, in plaats van pas merkbaar te worden bij een later bevel.
- De Barracks toont na voltooiing expliciet dat je erop kunt klikken om productie te starten.

## Getest

De volgende flow is geautomatiseerd getest:

1. Barracks selecteren.
2. Musketierknop blijft bestaan tijdens meerdere game-updates tussen `mousedown` en `click`.
3. Musketier in de productiequeue plaatsen.
4. Kosten van 80 voedsel en 20 hout worden afgeschreven.
5. Na de productietijd verschijnt daadwerkelijk een extra Franse musketier.
6. Colonne selecteren: status, actieve knop en formatieposities veranderen direct.
7. Carré selecteren: status en actieve knop veranderen correct.

## Gameplay

- Town Center en Barracks
- boeren, hout en voedsel
- gebouwen bouwen
- musketiers produceren
- population cap en Houses
- linie, colonne en carré
- musket-salvo's en herladen
- morale en vluchtgedrag
- bajonetaanval
- cavaleriecharge
- ronde kogel en grapeshot voor artillerie
- Britse AI

## Besturing

- Linkermuisknop slepen: eenheden selecteren
- Klik op eigen gebouw: gebouw selecteren
- Rechtermuisknop: bewegen of grondstof verzamelen
- Barracks/House: selecteer boeren, kies gebouw en klik op de kaart
- Formatieknoppen: geselecteerde groep direct herschikken
- WASD / pijltjestoetsen: camera
- Muiswiel: zoom
- Esc: bouwen annuleren
