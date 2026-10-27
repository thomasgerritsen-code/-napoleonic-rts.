# Gebouwen en bouwanimatie

De isometrische gebouwen hebben vier zichtbare bouwfasen: fundering, houten
draagwerk, muren en dak. Materialen verdwijnen geleidelijk uit de voorraadstapels
op de bouwplaats. Steigers, schoren, dakspanten en een ladder geven de bouw meer
diepte. De afbeelding groeit in verspringende stroken mee met de werkelijke
bouwvoortgang; er staat geen volledig doorzichtige eindversie op een lege fundering.

Bouwende boeren gebruiken hun bestaande richtingsafhankelijke hamersprites met
een ritme van heffen, slaan en herstellen. Kleine materiaalpufjes verschijnen bij
de slag. Alleen boeren die werkelijk aan een onvoltooid gebouw werken doen dit;
lopen, stoppen of voltooien beëindigt het bouwgebaar. De beelden blijven plaatselijk:
er worden geen bouweenheden verplaatst of extra personen toegevoegd.

Stallen gebruiken een schuur met drinkbak, voer en een aanbindhek. Geschutgieterijen
hebben een leien dak, stenen schoorsteen, kolen, een aambeeld en een wagenwiel. Ze gebruiken
geen woningafbeelding meer. Woningen krijgen daktextuur, een stenen stoep en
brandhout; kazernes uitrusting en voorraadkisten; het hoofdgebouw een klok en
entreeaccenten; hospitalen medische voorraad. Mijn en houthakkerskamp krijgen
extra houtnerf, steenaders, metaalbeslag en gereedschapsdetails.

De details worden eenmaal uit de bestaande afbeeldingen samengesteld. Er zijn
geen nieuwe downloads of timers. De detailcache is begrensd op 6 MiB en maakt
hoogstens twee beelden per frame. Afbeeldingen die recent in beeld zijn worden
niet steeds vervangen; bij een volle cache blijft de oorspronkelijke afbeelding
beschikbaar. Ver weg en in overzichtsmodus vervallen fijne details. Gebouwen
buiten beeld worden vroeg overgeslagen. Beide mobiele renderers worden ondersteund.

Dit is uitsluitend presentatie. Kosten, bouwwerkers, bouwtijd, grondstoffen,
voetenafdruk en multiplayerregels blijven van de bestaande simulatie. Online
volgen de beelden de zichtbare servervoortgang; verborgen vijandelijke taken
worden niet opgevraagd. De server installeert de presentatiemodule niet.

Validatie: `building-presentation.spec.js` controleert de vier fasen op mobiel met
GPU en Canvas, hamerframes, stilstaande bouwplaatsen, onveranderde speltoestand,
hergebruik en geheugenlimieten. `building-presentation-online.spec.js` bouwt met
twee verbonden spelers via de echte server en controleert alle fasen en kosten.
