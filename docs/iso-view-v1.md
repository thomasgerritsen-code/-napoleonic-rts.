# Iso-weergave v1 — de game in de Graphics Lab-stijl (opt-in)

`/?view=iso` toont de echte game in de 30°-camera van de Graphics Lab, met de
Blender-sprites uit `graphics-lab/assets/`. Zonder die parameter laadt het bestand
wel, maar doet het niets: de game blijft precies zoals hij is.

**PRESERVATION IMPACT: none.** De simulatie (beweging, routes, bruggen, gevecht,
moraal, AI, economie) wordt alleen gelezen, nooit veranderd. Het is een andere
weergave van dezelfde wereld.

## Wat er te zien is

- **Terrein**: het eigen statische terrein van de game (wegen, rivier, bruggen,
  dorpen, velden) wordt in tegels gebakken en plat op de grond gelegd, half zo hoog
  als breed, zoals in het lab. De tegels worden per zoomniveau (¼, ½ of volle
  resolutie) gemaakt, drie per frame, het midden van het scherm eerst; hoogstens 96
  blijven bewaard.
- **Eenheden** in 8 richtingen:
  - musketiers in vijf uiterlijken, met mars, stilstaan, richten, vuren, herladen,
    vluchten en de bajonetcharge;
  - officieren en tamboers, die commando geven zolang hun regiment vuurt;
  - cavalerie met stap, draf en galop (op snelheid) en de sabelhouw;
  - kanonnen (rollen, vuren) en hun bediening (laden, aanzetten, klaarstaan);
  - boeren nog als eenvoudige getekende figuurtjes (er zijn geen sprites voor).
- **Sneuvelen**: wie valt, speelt een van de drie vallen en blijft liggen (hoogstens 320).
- **Gebouwen en grondstoffen**: hoofdgebouw en kazerne als Blender-kazerne, woningen
  als huisje, graanakkers als veld, bomen als eik of populier, bessen als struik met
  bessen, ijzer als rots. Gebouwen in aanbouw zijn doorschijnend.
- **Rook en kogels**: rook bij elk schot (een grote wolk bij kanonnen), kogels als
  stipjes op schouderhoogte.
- **Mist van oorlog** volgt de zichtradius van de Franse eenheden en gebouwen; Britten
  buiten zicht worden niet getekend, net als in 2D.
- Selectieringen, het sleepkader en de minimap van de game.

## Schaal

In linie staan de mannen in de game 18 px uit elkaar en in het lab 0,8 m: 1 m is
22,5 game-pixels. Gebouwen in de game zijn kleiner dan op ware schaal; hun props
worden op de voetafdruk van het gebouw geschaald.

## Bediening

Alles van de game blijft werken: selecteren, slepen, rechtsklik, formaties, de
knoppen, touch en sneltoetsen. Tijdens de iso-weergave rekenen `screenToWorld` en
`worldToScreen` in de iso-projectie. Omdat die alleen de hoogte halveert, blijft een
kader op het scherm een rechthoek in de wereld. Een klik op het lichaam van een
soldaat (boven zijn voeten) selecteert hem.

Met de knop **🗺 2D-kaart / 🏰 Iso-weergave** rechtsboven schakel je tussen de twee
weergaven; terug in 2D begint de terreincache opnieuw.

## Techniek

- `src/systems/rendering/iso-view-v1.js` neemt `renderStableFrameV1` over (het haakje
  waarmee de game elk frame tekent). Eens per seconde draait ook de 2D-tekenaar mee,
  met de 2D-projectie, zodat effecten die hij bijhoudt worden opgeruimd. Zijn beeld
  wordt overgeschilderd.
- Andere canvaslagen (statisch terrein, GPU-lagen) worden verborgen zolang de
  iso-weergave aan staat; de minimap blijft.
- `window.__ISO_VIEW_V1__`: `isOn()`, `setOn(bool)`, `stats()` (getekende eenheden,
  sprites, props, tegels, lijken, rook, tekentijd), `screenOf(x,y)`, `bodyOf(unit)`.
- Test: `tests/iso-view-v1.spec.js`.

## Nog niet (volgende stappen)

1. Terrein en dorpen opnieuw in Blender renderen; de huizen zijn nu nog platte daken
   van de 2D-kaart.
2. De bediening uit het lab (vlaggetjes, draaien, aanvalsdoel) koppelen aan de bevelen
   van de game, en het pannen met slepen ook verticaal op iso-snelheid.
3. Boeren-sprites, geluid uit het lab, en tekenen via de GPU voor 520 eenheden op
   zwakke telefoons.
