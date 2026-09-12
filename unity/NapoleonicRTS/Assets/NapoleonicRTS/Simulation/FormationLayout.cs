using System;

namespace NapoleonicRTS.Simulation
{
    public static class FormationLayout
    {
        public static Float2 Slot(FormationKind formation, int index, int count)
        {
            if (count <= 0) return Float2.Zero;
            return formation switch
            {
                FormationKind.Column => GridSlot(index, count, 3, 1.15f, 1.18f),
                FormationKind.Square => SquareSlot(index, count),
                _ => GridSlot(index, count, Math.Max(1, (count + 1) / 2), 1.15f, 1.05f)
            };
        }

        private static Float2 GridSlot(int index, int count, int files, float lateralSpacing, float depthSpacing)
        {
            files = Math.Clamp(files, 1, count);
            var ranks = (count + files - 1) / files;
            var rank = index / files;
            var file = index % files;
            var actualFiles = Math.Min(files, count - rank * files);
            var lateral = (file - (actualFiles - 1) * 0.5f) * lateralSpacing;
            var depth = ((ranks - 1) * 0.5f - rank) * depthSpacing;
            return new Float2(lateral, depth);
        }

        private static Float2 SquareSlot(int index, int count)
        {
            var side = Math.Max(2, (int)MathF.Ceiling(MathF.Sqrt(count)));
            return GridSlot(index, count, side, 1.08f, 1.08f);
        }
    }
}
