using System;
using System.Collections.Generic;

namespace NapoleonicRTS.Simulation
{
    public static class RegimentCommandService
    {
        public static void SetFormation(SimulationWorld world, IReadOnlyList<int> regimentIds, FormationKind formation)
        {
            if (world == null) throw new ArgumentNullException(nameof(world));
            if (regimentIds == null) throw new ArgumentNullException(nameof(regimentIds));
            for (var i = 0; i < regimentIds.Count; i++)
            {
                var regiment = world.FindRegiment(regimentIds[i]);
                if (regiment != null) world.SetFormation(regiment, formation);
            }
        }

        public static void MoveRegiments(SimulationWorld world, IReadOnlyList<int> regimentIds, Float2 centre, float spacing = 8f)
        {
            if (world == null) throw new ArgumentNullException(nameof(world));
            if (regimentIds == null) throw new ArgumentNullException(nameof(regimentIds));
            var count = regimentIds.Count;
            if (count == 0) return;
            var files = Math.Max(1, (int)MathF.Ceiling(MathF.Sqrt(count)));
            var ranks = (count + files - 1) / files;

            for (var i = 0; i < count; i++)
            {
                var regiment = world.FindRegiment(regimentIds[i]);
                if (regiment == null) continue;
                var row = i / files;
                var col = i % files;
                var actualFiles = Math.Min(files, count - row * files);
                var x = (col - (actualFiles - 1) * 0.5f) * spacing;
                var y = (row - (ranks - 1) * 0.5f) * spacing;
                world.SetDestination(regiment, centre + new Float2(x, y));
            }
        }
    }
}
