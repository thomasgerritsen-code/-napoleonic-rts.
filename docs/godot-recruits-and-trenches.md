# Godot: verzamelrijen en rustige loopgraafbezetting

## Rekruten bij de kazerne

Opgeleide militairen kregen voorheen willekeurige doelen in hetzelfde kleine
gebied. De gewone botsingsafstand is voor gevechtscontact bedoeld en maakte
daar geen nette verzamelplaats van.

`RecruitAssembly` kiest nu vrije plaatsen in zeven files rondom het verzamelpunt.
Voetsoldaten krijgen doelen met 28 gamepixels tussenruimte; paarden en kanonnen
krijgen ruimere plekken. Zowel aanwezige eenheden als de doelen van vrije
militairen die nog onderweg zijn tellen mee. Bij elkaar gelegen kazernes
reserveren daardoor niet dezelfde plek. De uitgang blijft vrij.

Doelen moeten buiten gebouwen, boomstammen en water liggen en bereikbaar zijn.
Een verzamelvlag in een gebouw of rivier wordt naar toegankelijke grond gebracht.
Bij een afgesloten verzamelgebied wordt ook ruimte buiten de uitgang gezocht.
De zoekactie heeft een vaste limiet op routecontroles en gebruikt lokale
bezettingsvakken. Dit gebeurt alleen wanneer een opleiding eindigt.

Een wachtplek moet ook rondom voldoende vrije grond hebben. Alleen een geldig
route-eindpunt was niet genoeg: vlak tegen een gebouwhoek kon de eerste
aangekomen soldaat volgende rekruten ophouden. Vier lokale ruimtecontroles
houden de doorgang langs muren vrij, zonder botsingen of loopgedrag te wijzigen.
De verplichte controle gebruikt acht vaste variaties in de uitgangspositie;
alle 36 gewone en 14 naar een geblokkeerde vlag gestuurde rekruten moeten in
iedere variatie aankomen. De oorspronkelijke hoekopstelling faalde in vier
van deze acht gevallen; met de ruimtecontrole slagen ze alle acht.

De Britse computer gebruikt dezelfde verdeling bij zijn eigen verzamelpunt.
Boeren blijven hun bestaande werk- en grondstoforders gebruiken. Automatisch
bataljons vormen, officieren/tamboers en opleidingskosten blijven behouden.
De afzonderlijke doelen staan al in de opgeslagen spelstand; er zijn geen nieuwe
reserveringstellers of netwerkberichten nodig.

Bestaande handmatige posities en orders worden niet automatisch verplaatst.
Een al samengeklonterde vrije groep kan met een nieuwe gezamenlijke loopopdracht
opnieuw worden uitgespreid; nieuwe rekruten krijgen direct vrije plekken.

## Stil blijven staan in een loopgraaf

De voorste rij werd binnen zes pixels al als opgesteld op het vuurplateau
getekend, terwijl lopen nog naar de gewone driepixelgrens corrigeerde. Kleine
duwtjes konden daardoor opnieuw de loopanimatie starten. Een stilstaand
bataljon in zijn loopgraaf gebruikt nu dezelfde zes-pixelgrens voor beide.
Nieuwe marsorders, charges en vluchten vallen buiten deze rustregel.

De korte rustanimatie wordt in 2D en 3D over een rustige ademcyclus van 3,2 s
gespeeld. Schieten, terugslag en de logische herlaadtijden worden niet vertraagd.
De driehoekvolgorde van het 3D-loopgraafvlak is gecorrigeerd: het keek omlaag
en was daardoor van boven onzichtbaar. De bedding en aarden wal zijn nu zichtbaar.

## Controles

Verplichte controles vóór Windows-export:

- `tests/recruitment_test.gd`: 36 nog niet aangekomen rekruten reserveren aparte
  plekken en bereiken die allemaal, met minimaal ongeveer 24 pixels werkelijke
  tussenruimte. Veertien man verzamelen zich rond een geblokkeerde vlag,
  opslaan/laden behoudt de doelen en een nieuwe rekruut gebruikt geen bezette
  plek. Ook het vormen van een bataljon blijft mogelijk. De oorspronkelijke
  implementatie faalde op vijf van deze controles.
- `tests/trench_stationary_test.gd`: een kleine correctie start geen lopen,
  de ademcyclus duurt in beide weergaven 3,2 s, terugslag blijft op normale
  snelheid, het 3D-grondvlak wijst omhoog en marsen/vluchten blijven werken.

Met `SHOT_DIR` en een echte renderer produceren deze tests daarnaast de beelden
`recruit_muster.png` en `trench_stationary.png`.
