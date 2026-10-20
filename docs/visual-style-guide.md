# Napoleonic RTS — visuele stijl

## Definitieve richting (20 oktober 2026)

**Schilderachtig historisch realisme**: historisch semi-realistisch met een lichte
*painterly* afwerking. Strikt orthografische **2D-bovenaanzicht**-game; geen
isometrische gebouwen, 3D-terrein of fotorealistische effecten.

Prioriteiten:
1. **Speelbaarheid** op telefoon en desktop: regiment, richting, weg, brug en
   selectierand blijven in een oogopslag herkenbaar.
2. **Historische sfeer** via rustige, natuurlijk verweerde materialen, niet via
   felle/gameachtige randen of verzadigde kleuren.
3. **Consistentie** in landschap, gebouwen, uniformen, rook en HUD.
4. **Prestaties**: vooraf bepaalde wereldcoördinaten, viewport-culling,
   herbruikbare Canvas-/GPU-terreintegels; geen realtime procedurale generatie.

## Kleuren (v318 / v1.3.66)

| Motief | Basiskleur | Afwerking |
| --- | --- | --- |
| Weide/gras | `#6d7959` | olijfkleurige transparante kwastvegen, mosgroene schaduw en spaarzame okergele uitdroging |
| Leem/aarde | warme bruin-oker | zachte vervaging, geen harde vierkante stippen |
| Hoofdweg | `rgba(184,158,116,.94)` | verbleekte stoflaag, zachte berm, parallelle karrensporen die bochten volgen |
| Nevenweg | `rgba(164,135,98,.88)` | subtiel donkerdere bedding |
| Karrenspoor | `rgba(138,110,77,.81)` | onregelmatige sporen, leesbaar op mobiele zoom |
| Oevers | mos, leem en sediment | geleidelijk in het gras en water laten overgaan |
| Rivier | grijsgroen ondiep naar blauwgrijs midden | bestaande stroming, meanders en brugkolken behouden |
| Franse eenheden | Napoleontisch donkerblauw | duidelijke rolverschillen |
| Britse eenheden | mat uniformrood | duidelijk contrast met Frankrijk |
| Gebouwen | verweerd hout, krijt/steen, kleidak | exact bovenaanzicht van herkenbare gebouwen |
| Rook | licht warmgrijs | zachte contour, zichtbaarheid van soldaten behouden |
| HUD | ingetogen donker hout/grafiet, messing | duidelijke contrasten en tastbare mobiele knoppen |

## Vervolgwerk

1. **v318 terrein**: vaste, getoonde penseelvegen; natuurlijke aarde/wegtonen;
   tangentvolgende karrensporen; blauwgrijze rivier met behouden 2D-stroming.
2. **Gebouwen**: typespecifieke dakmaterialen, dorpserven, Frans/Brits verschil;
   herkenbaar bij laag zoomniveau.
3. **Eenheden**: bovenaanzicht silhouetten, historisch passende uniformdetails;
   groepen blijven leesbaar als colonnes vier breed.
4. **Effecten**: kruitrook, stofsporen, schaduwen; geen wijziging aan schotfysica.
5. **HUD**: historisch passend, maar bediening op telefoon gaat vóór decoratie.

**Onveranderlijk uitgangspunt:** visuele updates veranderen nooit padvinding,
rivier- en brugcollision, economie, selectie, aanraakbesturing of gevechtsregels.
