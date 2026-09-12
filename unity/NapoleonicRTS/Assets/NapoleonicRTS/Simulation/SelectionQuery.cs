using System;
using System.Collections.Generic;

namespace NapoleonicRTS.Simulation
{
    public static class SelectionQuery
    {
        public static void RegimentsInRect(SimulationWorld world, ArmySide side, Float2 a, Float2 b, List<int> result)
        {
            if (world == null) throw new ArgumentNullException(nameof(world));
            if (result == null) throw new ArgumentNullException(nameof(result));
            result.Clear();
            var minX = MathF.Min(a.X, b.X);
            var maxX = MathF.Max(a.X, b.X);
            var minY = MathF.Min(a.Y, b.Y);
            var maxY = MathF.Max(a.Y, b.Y);

            foreach (var regiment in world.Regiments)
            {
                if (regiment.Side != side) continue;
                var hit = false;
                for (var i = 0; i < regiment.UnitIndices.Count; i++)
                {
                    var unit = world.Units[regiment.UnitIndices[i]];
                    if (!unit.Alive) continue;
                    var p = unit.Position;
                    if (p.X < minX || p.X > maxX || p.Y < minY || p.Y > maxY) continue;
                    hit = true;
                    break;
                }
                if (hit) result.Add(regiment.Id);
            }
            result.Sort();
        }
    }
}
