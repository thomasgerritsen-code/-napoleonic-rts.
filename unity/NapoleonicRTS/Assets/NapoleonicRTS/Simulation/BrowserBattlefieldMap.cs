using System.Collections.Generic;

namespace NapoleonicRTS.Simulation
{
    public static class BrowserBattlefieldMap
    {
        public const float BrowserWidth = 4300f;
        public const float BrowserHeight = 2500f;
        public const float PixelsPerNativeUnit = 50f;

        public static Float2 MapToNative(float x, float y) => new Float2((x - BrowserWidth * 0.5f) / PixelsPerNativeUnit, -(y - BrowserHeight * 0.5f) / PixelsPerNativeUnit);
        private static float S(float value) => value / PixelsPerNativeUnit;
        private static Float2 P(float x, float y) => MapToNative(x, y);

        public static StrategicMap Create()
        {
            var roads = new List<RoadDefinition>
            {
                new RoadDefinition("grande-chaussee", "Grande Chaussée", RoadClass.Chaussee, S(78), P(70,930),P(420,915),P(700,900),P(1050,895),P(1350,900),P(1620,895),P(1900,890),P(2200,895),P(2500,900),P(2820,895),P(3150,900),P(3450,920),P(3740,955)),
                new RoadDefinition("route-du-nord", "Route du Nord", RoadClass.Chaussee, S(66), P(1910,55),P(1885,300),P(1875,540),P(1885,720),P(1900,890),P(1930,1120),P(1980,1390),P(2040,1640),P(2110,1900),P(2180,2160)),
                new RoadDefinition("route-sud-ouest", "Route du Sud-Ouest", RoadClass.Chaussee, S(60), P(180,2040),P(410,1840),P(650,1650),P(900,1510),P(1160,1430),P(1390,1360),P(1600,1240),P(1760,1080),P(1900,890)),
                new RoadDefinition("route-nord-est", "Route du Nord-Est", RoadClass.Chaussee, S(60), P(1900,890),P(2140,775),P(2390,665),P(2640,565),P(2920,470),P(3220,360),P(3500,270),P(3760,205)),
                new RoadDefinition("chemin-du-bois", "Chemin du Bois", RoadClass.Secondary, S(44), P(700,900),P(620,790),P(560,665),P(545,545),P(590,430),P(690,330),P(830,250)),
                new RoadDefinition("chemin-des-fermes-est", "Chemin des Fermes Est", RoadClass.Secondary, S(44), P(2820,895),P(2910,1040),P(3000,1210),P(3110,1390),P(3240,1580),P(3410,1750),P(3630,1920),P(3780,2020)),
                new RoadDefinition("chemin-des-fermes-sud", "Chemin des Fermes Sud", RoadClass.Secondary, S(42), P(650,1650),P(930,1680),P(1220,1690),P(1510,1710),P(1780,1690),P(2040,1640),P(2300,1650),P(2580,1660),P(2870,1640),P(3240,1580)),
                new RoadDefinition("voie-du-moulin", "Voie du Moulin", RoadClass.Track, S(26), P(390,1145),P(330,1320),P(350,1490),P(470,1640),P(650,1650))
            };

            var crossings = new List<CrossingDefinition>
            {
                new CrossingDefinition("pont-chaussee", "Pont de la Chaussée", CrossingType.Bridge, P(1500,900), 0f, S(270), S(112)),
                new CrossingDefinition("pont-crete", "Pont de la Crête", CrossingType.Bridge, P(1510,1065), 0.08f, S(250), S(98)),
                new CrossingDefinition("gue-colline", "Gué de la Colline", CrossingType.Ford, P(1530,1280), 0.52f, S(310), S(154)),
                new CrossingDefinition("pont-fermes", "Pont des Fermes", CrossingType.Bridge, P(1645,1700), 0.074f, S(270), S(98))
            };

            var river = new[]
            {
                P(1510,0),P(1490,260),P(1475,520),P(1490,760),P(1500,900),P(1510,1065),P(1420,1160),P(1530,1280),P(1580,1450),P(1645,1700),P(1665,1950),P(1700,2200)
            };
            return new StrategicMap(roads, crossings, river, S(72));
        }
    }
}
