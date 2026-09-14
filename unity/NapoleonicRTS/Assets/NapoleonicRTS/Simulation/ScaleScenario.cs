using System;

namespace NapoleonicRTS.Simulation
{
    public static class ScaleScenario
    {
        public static int Populate(SimulationWorld world, int regimentsPerSide = 100, int unitsPerRegiment = 50)
        {
            if (world == null) throw new ArgumentNullException(nameof(world));
            if (regimentsPerSide < 1) throw new ArgumentOutOfRangeException(nameof(regimentsPerSide));
            if (unitsPerRegiment < 1) throw new ArgumentOutOfRangeException(nameof(unitsPerRegiment));

            var columns = Math.Max(1, (int)MathF.Ceiling(MathF.Sqrt(regimentsPerSide)));
            for (var i = 0; i < regimentsPerSide; i++)
            {
                var row = i / columns;
                var col = i % columns;
                var y = (row - (columns - 1) * 0.5f) * 12f;
                var depth = col * 7f;
                var france = world.SpawnRegiment(ArmySide.France, new Float2(-72f - depth, y), unitsPerRegiment, FormationKind.Line, 0f);
                var britain = world.SpawnRegiment(ArmySide.Britain, new Float2(72f + depth, y), unitsPerRegiment, FormationKind.Line, MathF.PI);
                world.SetDestination(france, new Float2(france.Anchor.X + 30f, france.Anchor.Y));
                world.SetDestination(britain, new Float2(britain.Anchor.X - 30f, britain.Anchor.Y));
            }
            return regimentsPerSide * unitsPerRegiment * 2;
        }
    }
}
