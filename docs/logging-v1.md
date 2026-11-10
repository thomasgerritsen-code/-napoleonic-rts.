# Houthakkerskamp

In de open isometrische wereld is een **voltooid eigen houthakkerskamp** nodig om
hout te winnen. De bomen blijven op de kaart staan en bevatten een eindige voorraad.

Selecteer boeren en kies **Bouwen → Houthakkerskamp**. Een kamp kost **120 hout**
en moet op vrije, droge grond aan de bosrand staan, met minstens drie levende bomen
binnen het werkgebied van 420 wereldeenheden. Bouwen op bomen, wegen, water,
dorpsgebouwen of een bestaande bouwplaats is niet toegestaan.

De bouwers gaan na voltooiing automatisch hout hakken. Met **Werk → Hout hakken**
kun je andere boeren inzetten. Rechtsklikken op een boom binnen het werkgebied of
op een voltooid eigen kamp werkt ook. Iedere boer brengt maximaal 25 hout naar een
eigen voltooid kamp; pas bij aflevering stijgt de houtvoorraad. Het kamp produceert
zelf geen hout. Bij een lege boom kiezen boeren een andere boom binnen het bereik
van een eigen kamp. Als een bos op is, bouw je een kamp bij een ander bos.

Bij vernietiging stopt de winning als er geen ander eigen kamp bij het bos staat.
Gedragen hout blijft behouden en gaat naar een ander eigen kamp of het hoofdgebouw.
Een vijandelijk of onvoltooid kamp geeft geen toegang tot het bos. De
computertegenstander bouwt en betaalt dezelfde kampen. De startvoorraad hout
blijft bestaan, zodat het eerste kamp altijd normaal kan worden betaald.

Deze regels gelden ook op de autoritatieve multiplayerserver. Het bestaande
build-commando accepteert het nieuwe gebouwtype `lumbercamp`; verzamelen gebruikt
het bestaande resource-id. Er worden geen kamp-eigendomsgegevens aan publieke
bomen toegevoegd. De klassieke 2D-scenario's houden hun bestaande economie.

Kampen gebruiken maximaal twee gedeelde afbeeldingen van 256 × 224 pixels,
minder dan 0,5 MB samen, zonder extra downloads of timers. Ze werken met GPU en
mobiele Canvas-rendering. Mijnwerkers en houthakkers delen dezelfde gecachete
toegangs- en afleverroutes in `work-site-navigation-v1.js`; de mijnregels blijven
gelijk.

Validatie: `logging-v1.spec.js` controleert plaatsing, betaalde bouw, toegangsregels,
echte aflevering, vernietiging, eindige bomen, reset, AI en beide mobiele renderers.
`logging-online.spec.js` controleert de UI en echte serverreplicatie met twee
verbonden spelers. De mijnbouw-, burgerstart- en landbouwtests blijven regressies.
