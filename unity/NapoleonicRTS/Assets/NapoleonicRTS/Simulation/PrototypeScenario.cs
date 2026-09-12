using System;

namespace NapoleonicRTS.Simulation
{
    public static class PrototypeScenario
    {
        public const int RegimentCountPerSide = 10;
        public const int UnitsPerRegiment = 50;
        public const int TotalUnits = RegimentCountPerSide * UnitsPerRegiment * 2;

        public static void Populate(SimulationWorld world)
        {
            if (world == null) throw new ArgumentNullException(nameof(world));
            for (var i = 0; i < RegimentCountPerSide; i++)
            {
                var y = -27f + i * 6f;
                var french = world.SpawnRegiment(ArmySide.France, new Float2(-42f, y), UnitsPerRegiment, FormationKind.Line, 0f);
                var british = world.SpawnRegiment(ArmySide.Britain, new Float2(42f, y), UnitsPerRegiment, FormationKind.Line, MathF.PI);
                world.SetDestination(french, new Float2(-6f, y));
                world.SetDestination(british, new Float2(6f, y));
            }
        }

        public static void OrderMarch(SimulationWorld world, bool home)
        {
            foreach (var regiment in world.Regiments)
            {
                var target = home
                    ? regiment.HomeAnchor
                    : new Float2(regiment.Side == ArmySide.France ? -6f : 6f, regiment.HomeAnchor.Y);
                world.SetDestination(regiment, target);
            }
        }
    }
}
