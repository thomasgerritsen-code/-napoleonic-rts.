using System;
using System.Collections.Generic;

namespace NapoleonicRTS.Simulation
{
    public sealed class NativeVillageNavigation
    {
        private readonly NativeVillageLayout _layout;

        public NativeVillageNavigation(NativeVillageLayout layout) => _layout = layout ?? throw new ArgumentNullException(nameof(layout));
        public int ObstacleCount => _layout.Structures.Count;

        public float RouteMargin(UnitTravelKind kind) => kind == UnitTravelKind.Cavalry ? .40f : kind == UnitTravelKind.Artillery ? .46f : .30f;

        public Float2 NearestOpenPoint(Float2 point, UnitTravelKind kind)
        {
            var p = point;
            var margin = RouteMargin(kind) + .12f;
            for (var pass = 0; pass < 12; pass++)
            {
                var moved = false;
                for (var i = 0; i < _layout.Structures.Count; i++)
                {
                    var obstacle = _layout.Structures[i];
                    var radius = obstacle.CollisionRadius + margin;
                    var delta = p - obstacle.Position;
                    var distance = delta.Length;
                    if (distance >= radius) continue;
                    var direction = distance > .0001f ? delta / distance : Float2.FromAngle(obstacle.AngleRadians + MathF.PI * .5f);
                    p = obstacle.Position + direction * radius;
                    moved = true;
                }
                if (!moved) break;
            }
            return p;
        }

        public bool SegmentBlocked(Float2 a, Float2 b, UnitTravelKind kind)
        {
            return FirstHit(a, b, kind, out _, out _);
        }

        public List<Float2> AvoidPath(Float2 start, IReadOnlyList<Float2> path, UnitTravelKind kind)
        {
            var result = new List<Float2>();
            var cursor = NearestOpenPoint(start, kind);
            if (path == null) return result;
            for (var i = 0; i < path.Count; i++)
            {
                var goal = NearestOpenPoint(path[i], kind);
                var section = AvoidSegment(cursor, goal, kind);
                for (var p = 0; p < section.Count; p++)
                {
                    if (result.Count == 0 || Float2.Distance(result[result.Count - 1], section[p]) > .04f) result.Add(section[p]);
                    cursor = section[p];
                }
            }
            return result;
        }

        public List<Float2> AvoidSegment(Float2 a, Float2 b, UnitTravelKind kind)
        {
            var result = new List<Float2>();
            var cursor = a;
            var goal = NearestOpenPoint(b, kind);
            for (var guard = 0; guard < 10; guard++)
            {
                if (!FirstHit(cursor, goal, kind, out var obstacle, out _))
                {
                    result.Add(goal);
                    return result;
                }

                var routeRadius = obstacle.CollisionRadius + RouteMargin(kind) + .52f;
                Float2 best = default;
                var bestScore = float.PositiveInfinity;
                for (var sample = 0; sample < 16; sample++)
                {
                    var angle = sample / 16f * MathF.PI * 2f;
                    var candidate = obstacle.Position + Float2.FromAngle(angle) * routeRadius;
                    if (_layout.Collides(candidate, RouteMargin(kind), .08f)) continue;
                    if (FirstHit(cursor, candidate, kind, out var first, out _) && first.Id != obstacle.Id) continue;
                    if (FirstHit(candidate, goal, kind, out var second, out _) && second.Id == obstacle.Id) continue;
                    var score = Float2.Distance(cursor, candidate) + Float2.Distance(candidate, goal);
                    if (score >= bestScore) continue;
                    bestScore = score; best = candidate;
                }
                if (!float.IsFinite(bestScore))
                {
                    var away = cursor - obstacle.Position;
                    if (away.Length < .001f) away = Float2.FromAngle(obstacle.AngleRadians + MathF.PI * .5f);
                    best = obstacle.Position + away / MathF.Max(.001f, away.Length) * routeRadius;
                }
                result.Add(best);
                cursor = best;
            }
            result.Add(goal);
            return result;
        }

        public Float2 ResolveUnitPoint(Float2 point, float unitRadius = .08f)
        {
            var p = point;
            for (var pass = 0; pass < 8; pass++)
            {
                var changed = false;
                for (var i = 0; i < _layout.Structures.Count; i++)
                {
                    var obstacle = _layout.Structures[i];
                    var radius = obstacle.CollisionRadius + unitRadius;
                    var delta = p - obstacle.Position;
                    var distance = delta.Length;
                    if (distance >= radius) continue;
                    var direction = distance > .0001f ? delta / distance : Float2.FromAngle(obstacle.AngleRadians + MathF.PI * .5f);
                    p = obstacle.Position + direction * radius;
                    changed = true;
                }
                if (!changed) break;
            }
            return p;
        }

        private bool FirstHit(Float2 a, Float2 b, UnitTravelKind kind, out VillageStructureState obstacle, out float hitT)
        {
            obstacle = null;
            hitT = float.PositiveInfinity;
            for (var i = 0; i < _layout.Structures.Count; i++)
            {
                var candidate = _layout.Structures[i];
                var radius = candidate.CollisionRadius + RouteMargin(kind);
                var delta = b - a;
                var len2 = delta.LengthSquared;
                var t = len2 <= 1e-8f ? 0f : Math.Clamp(((candidate.Position.X-a.X)*delta.X+(candidate.Position.Y-a.Y)*delta.Y)/len2,0f,1f);
                var nearest = a + delta * t;
                var distance = Float2.Distance(nearest, candidate.Position);
                var startInside = Float2.Distance(a, candidate.Position) < radius;
                var endFurther = Float2.Distance(b, candidate.Position) > Float2.Distance(a, candidate.Position) + .01f;
                if (startInside && endFurther) continue;
                if (distance > radius || t >= hitT) continue;
                obstacle = candidate; hitT = t;
            }
            return obstacle != null;
        }
    }
}
