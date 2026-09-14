using System;
using System.Collections.Generic;

namespace NapoleonicRTS.Simulation
{
    public enum VillageStructureKind { Cottage, Farmhouse, Barn, Inn, Chapel }

    public sealed class VillageStructureState
    {
        public string Id;
        public string Hamlet;
        public VillageStructureKind Kind;
        public Float2 Position;
        public float Width;
        public float Height;
        public float AngleRadians;
        public Float2 AccessPoint;
        public float CollisionRadius;
    }

    public sealed class NativeVillageLayout
    {
        private readonly struct Hamlet
        {
            public readonly string Name;
            public readonly float X, Y;
            public Hamlet(string name, float x, float y) { Name = name; X = x; Y = y; }
        }

        private readonly struct RoadHit
        {
            public readonly Float2 Point;
            public readonly Float2 Tangent;
            public readonly RoadDefinition Road;
            public readonly float Distance;
            public RoadHit(Float2 point, Float2 tangent, RoadDefinition road, float distance)
            { Point = point; Tangent = tangent; Road = road; Distance = distance; }
        }

        private static readonly Hamlet[] Hamlets =
        {
            new Hamlet("Les Quatre Chemins",1900,890), new Hamlet("St.-Martin",700,900), new Hamlet("La Croix",2820,895),
            new Hamlet("Bois-Hameau",590,430), new Hamlet("Ferme du Sud",650,1650), new Hamlet("Ferme de l’Est",3240,1580)
        };

        public List<VillageStructureState> Structures { get; } = new List<VillageStructureState>();

        public static NativeVillageLayout Create(StrategicMap map)
        {
            if (map == null) throw new ArgumentNullException(nameof(map));
            var result = new NativeVillageLayout();
            for (var h = 0; h < Hamlets.Length; h++) result.BuildHamlet(map, Hamlets[h], h);
            return result;
        }

        public bool Collides(Float2 position, float radius, float padding = .10f)
        {
            for (var i = 0; i < Structures.Count; i++)
            {
                var s = Structures[i];
                if (Float2.Distance(position, s.Position) < radius + s.CollisionRadius + padding) return true;
            }
            return false;
        }

        public VillageStructureState Nearest(Float2 position)
        {
            VillageStructureState best = null;
            var distance = float.PositiveInfinity;
            for (var i = 0; i < Structures.Count; i++)
            {
                var d = Float2.Distance(position, Structures[i].Position);
                if (d >= distance) continue;
                distance = d; best = Structures[i];
            }
            return best;
        }

        private void BuildHamlet(StrategicMap map, Hamlet hamlet, int hamletIndex)
        {
            var centre = BrowserBattlefieldMap.MapToNative(hamlet.X, hamlet.Y);
            var seed = Hash(hamlet.Name) ^ (uint)(hamletIndex * 2654435761u);
            var rng = new DeterministicRandom(seed);
            var anchorRoad = NearestRoad(map, centre);
            if (anchorRoad.Road == null) return;

            var agrarian = hamlet.Name.Contains("Ferme", StringComparison.OrdinalIgnoreCase);
            var woodland = hamlet.Name.Contains("Bois", StringComparison.OrdinalIgnoreCase);
            var parish = hamlet.Name.StartsWith("St.", StringComparison.OrdinalIgnoreCase);
            var crossroad = hamlet.Name.Contains("Quatre", StringComparison.OrdinalIgnoreCase) || hamlet.Name.Contains("Croix", StringComparison.OrdinalIgnoreCase);
            var count = agrarian ? 11 : crossroad ? 14 : parish ? 13 : woodland ? 10 : 12;

            for (var slot = 0; slot < count; slot++)
            {
                var kind = PickKind(slot, agrarian, parish, rng);
                var size = Size(kind, rng);
                VillageStructureState accepted = null;

                for (var attempt = 0; attempt < 80 && accepted == null; attempt++)
                {
                    var side = ((slot + attempt / 20) & 1) == 0 ? -1f : 1f;
                    var direction = (((slot / 2) + attempt / 12) & 1) == 0 ? -1f : 1f;
                    var pair = slot / 2;
                    var spacing = agrarian ? 1.75f : crossroad ? 1.18f : 1.42f;
                    var along = .85f + pair * spacing + (slot % 2) * .48f + (rng.Next() - .5f) * .55f;
                    var depth = anchorRoad.Road.Width * .5f + .62f + (slot > count * .62f ? 1.00f : 0f) + rng.Next() * (agrarian ? 1.45f : .92f);
                    if (woodland) depth += .28f;

                    var tangent = anchorRoad.Tangent;
                    var right = new Float2(-tangent.Y, tangent.X);
                    var candidate = centre + tangent * (direction * along) + right * (side * depth);
                    var nearest = NearestRoad(map, candidate);
                    if (nearest.Road == null) continue;
                    var halfDiagonal = MathF.Sqrt(size.width * size.width + size.height * size.height) * .5f;
                    var roadClearance = nearest.Distance - nearest.Road.Width * .5f;
                    if (roadClearance < halfDiagonal + .18f) continue;
                    if (nearest.Distance > (agrarian ? 3.8f : 2.9f)) continue;

                    var angle = MathF.Atan2(nearest.Tangent.Y, nearest.Tangent.X) + (rng.Next() - .5f) * (woodland ? .15f : .07f);
                    if (kind == VillageStructureKind.Barn && rng.Next() > .58f) angle += MathF.PI * .5f;
                    var structure = new VillageStructureState
                    {
                        Id = $"{Slug(hamlet.Name)}-{slot}", Hamlet = hamlet.Name, Kind = kind,
                        Position = candidate, Width = size.width, Height = size.height,
                        AngleRadians = angle, AccessPoint = nearest.Point,
                        CollisionRadius = halfDiagonal * .54f
                    };
                    if (!Clear(structure, agrarian ? .26f : .20f)) continue;
                    accepted = structure;
                }

                if (accepted != null) Structures.Add(accepted);
            }
        }

        private bool Clear(VillageStructureState candidate, float gap)
        {
            for (var i = 0; i < Structures.Count; i++)
            {
                var other = Structures[i];
                if (Float2.Distance(candidate.Position, other.Position) < candidate.CollisionRadius + other.CollisionRadius + gap) return false;
            }
            return true;
        }

        private static VillageStructureKind PickKind(int slot, bool agrarian, bool parish, DeterministicRandom rng)
        {
            if (slot == 0) return parish ? VillageStructureKind.Chapel : rng.Next() > .48f ? VillageStructureKind.Inn : VillageStructureKind.Chapel;
            if (agrarian && slot % 4 == 2) return VillageStructureKind.Barn;
            if (agrarian || rng.Next() < .25f) return VillageStructureKind.Farmhouse;
            return VillageStructureKind.Cottage;
        }

        private static (float width, float height) Size(VillageStructureKind kind, DeterministicRandom rng)
        {
            float minW, maxW, minH, maxH;
            switch (kind)
            {
                case VillageStructureKind.Farmhouse: minW=.88f; maxW=1.18f; minH=.46f; maxH=.62f; break;
                case VillageStructureKind.Barn: minW=.74f; maxW=1.04f; minH=.40f; maxH=.56f; break;
                case VillageStructureKind.Inn: minW=1.08f; maxW=1.32f; minH=.58f; maxH=.74f; break;
                case VillageStructureKind.Chapel: minW=1.16f; maxW=1.40f; minH=.46f; maxH=.60f; break;
                default: minW=.60f; maxW=.84f; minH=.36f; maxH=.52f; break;
            }
            return (minW + rng.Next() * (maxW-minW), minH + rng.Next() * (maxH-minH));
        }

        private static RoadHit NearestRoad(StrategicMap map, Float2 position)
        {
            var bestDistance = float.PositiveInfinity;
            var bestPoint = Float2.Zero;
            var bestTangent = new Float2(1f,0f);
            RoadDefinition bestRoad = null;
            for (var r = 0; r < map.Roads.Count; r++)
            {
                var road = map.Roads[r];
                for (var p = 1; p < road.Points.Length; p++)
                {
                    var a = road.Points[p-1]; var b = road.Points[p];
                    var ab = b-a; var len2 = ab.LengthSquared;
                    if (len2 <= 1e-8f) continue;
                    var ap = position-a;
                    var t = Math.Clamp((ap.X*ab.X+ap.Y*ab.Y)/len2,0f,1f);
                    var point = a+ab*t;
                    var distance = Float2.Distance(position,point);
                    if (distance >= bestDistance) continue;
                    bestDistance=distance; bestPoint=point; bestTangent=ab/MathF.Sqrt(len2); bestRoad=road;
                }
            }
            return new RoadHit(bestPoint,bestTangent,bestRoad,bestDistance);
        }

        private static uint Hash(string text)
        {
            uint h=2166136261;
            for(var i=0;i<text.Length;i++){h^=text[i];h*=16777619;}
            return h;
        }

        private static string Slug(string value) => value.ToLowerInvariant().Replace(" ","-").Replace(".","").Replace("’","");

        private sealed class DeterministicRandom
        {
            private uint _state;
            public DeterministicRandom(uint seed) => _state = seed == 0 ? 1u : seed;
            public float Next() { _state = unchecked(_state * 1664525u + 1013904223u); return _state / 4294967296f; }
        }
    }
}
