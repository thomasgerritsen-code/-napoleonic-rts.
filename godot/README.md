# Napoleonic RTS in Godot

De Godot-versie van het spel, stap voor stap opgebouwd naast de webversie.
Open deze map (`godot/`) in Godot 4.7 of nieuwer: *Import* → `project.godot`,
en druk op F5.

**Versie 0.1** – de kaart, de soldaten en de bomen van de webversie (de
plaatjes in `assets/` komen uit `graphics-lab/assets`), drie Franse en drie
Britse bataljons in linie, selecteren, marcheren (rechts slepen zet de
richting), salvo's met kruitdamp, verliezen, vluchten en de uitslag.

Besturing: klik of sleep om te selecteren (Shift voegt toe), rechtsklik om te
marcheren, WASD/pijltjes of de middelste muisknop om te schuiven, het wieltje
om te zoomen, R voor een nieuwe slag na afloop.

GitHub controleert het project bij elke wijziging (`tests/smoke_test.gd`,
headless) en maakt een Windows-`.exe` (workflow *Godot*).
