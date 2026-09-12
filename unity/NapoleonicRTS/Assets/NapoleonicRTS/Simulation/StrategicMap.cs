using System;
using System.Collections.Generic;

namespace NapoleonicRTS.Simulation
{
    public enum RoadClass { Chaussee, Secondary, Track }
    public enum CrossingType { Bridge, Ford }
    public enum UnitTravelKind { Infantry, Cavalry, Artillery }

    public sealed class RoadDefinition
    {
        public string Id { get; }
        public string Name { get; }
        public RoadClass RoadClass { get; }
        public float Width { get; }
        public Float2[] Points { get; }
        public RoadDefinition(string id, string name, RoadClass roadClass, float width, params Float2[] points)
        { Id = id; Name = name; RoadClass = roadClass; Width = width; Points = points; }
    }

    public sealed class CrossingDefinition
    {
        public string Id { get; }
        public string Name { get; }
        public CrossingType Type { get; }
        public Float2 Centre { get; }
        public float AngleRadians { get; }
        public float Length { get; }
        public float Width { get; }
        public CrossingDefinition(string id, string name, CrossingType type, Float2 centre, float angleRadians, float length, float width)
        { Id = id; Name = name; Type = type; Centre = centre; AngleRadians = angleRadians; Length = length; Width = width; }
    }

    public sealed class WaterSegmentHit
    {
        public bool TouchesRiver { get; internal set; }
        public bool Blocked { get; internal set; }
        public CrossingDefinition Crossing { get; internal set; }
    }

    public sealed class StrategicMap
    {
        public IReadOnlyList<RoadDefinition> Roads { get; }
        public IReadOnlyList<CrossingDefinition> Crossings { get; }
        public Float2[] RiverPoints { get; }
        public float RiverNavigationHalfWidth { get; }

        public StrategicMap(IReadOnlyList<RoadDefinition> roads, IReadOnlyList<CrossingDefinition> crossings, Float2[] riverPoints, float riverNavigationHalfWidth)
        { Roads = roads; Crossings = crossings; RiverPoints = riverPoints; RiverNavigationHalfWidth = riverNavigationHalfWidth; }

        public bool IsWater(Float2 point)
        {
            if (DistanceToRiver(point) > RiverNavigationHalfWidth) return false;
            for (var i = 0; i < Crossings.Count; i++) if (CrossingContains(Crossings[i], point)) return false;
            return true;
        }

        public float DistanceToRiver(Float2 point)
        {
            var best = float.PositiveInfinity;
            for (var i = 1; i < RiverPoints.Length; i++)
            {
                var d = NavigationGeometry.DistanceToSegment(point, RiverPoints[i - 1], RiverPoints[i]);
                if (d < best) best = d;
            }
            return best;
        }

        public bool CrossingContains(CrossingDefinition crossing, Float2 point)
        {
            var delta = point - crossing.Centre;
            var cos = MathF.Cos(crossing.AngleRadians);
            var sin = MathF.Sin(crossing.AngleRadians);
            var along = delta.X * cos + delta.Y * sin;
            var perpendicular = -delta.X * sin + delta.Y * cos;
            return MathF.Abs(along) <= crossing.Length * 0.5f && MathF.Abs(perpendicular) <= crossing.Width * 0.5f;
        }

        public WaterSegmentHit SegmentWaterCrossing(Float2 a, Float2 b)
        {
            var distance = Float2.Distance(a, b);
            var samples = Math.Max(1, (int)MathF.Ceiling(distance / 0.24f));
            var result = new WaterSegmentHit();
            for (var i = 0; i <= samples; i++)
            {
                var p = Float2.Lerp(a, b, i / (float)samples);
                if (DistanceToRiver(p) > RiverNavigationHalfWidth) continue;
                result.TouchesRiver = true;
                CrossingDefinition legal = null;
                for (var c = 0; c < Crossings.Count; c++) if (CrossingContains(Crossings[c], p)) { legal = Crossings[c]; break; }
                if (legal != null) result.Crossing = legal;
                else result.Blocked = true;
            }
            return result.TouchesRiver ? result : null;
        }

        public CrossingDefinition NearestCrossing(Float2 point)
        {
            CrossingDefinition best = null;
            var bestDistance = float.PositiveInfinity;
            for (var i = 0; i < Crossings.Count; i++)
            {
                var d = Float2.Distance(point, Crossings[i].Centre);
                if (d < bestDistance) { bestDistance = d; best = Crossings[i]; }
            }
            return best;
        }
    }

    public static class NavigationGeometry
    {
        public static float DistanceToSegment(Float2 point, Float2 a, Float2 b)
        {
            var ab = b - a;
            var lengthSquared = ab.LengthSquared;
            if (lengthSquared <= 1e-8f) return Float2.Distance(point, a);
            var ap = point - a;
            var t = Math.Clamp((ap.X * ab.X + ap.Y * ab.Y) / lengthSquared, 0f, 1f);
            return Float2.Distance(point, a + ab * t);
        }
    }
}
