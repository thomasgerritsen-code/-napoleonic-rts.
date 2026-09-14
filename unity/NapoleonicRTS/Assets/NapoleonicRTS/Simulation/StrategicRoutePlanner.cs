using System;
using System.Collections.Generic;

namespace NapoleonicRTS.Simulation
{
    public sealed class RoutePlan
    {
        public bool IsValid { get; internal set; }
        public List<Float2> Points { get; } = new List<Float2>();
        public List<string> RoadIds { get; } = new List<string>();
        public List<string> CrossingIds { get; } = new List<string>();
        public float EstimatedSeconds { get; internal set; }
    }

    public sealed class StrategicRoutePlanner
    {
        private sealed class Node { public int Id; public Float2 Position; public readonly List<Edge> Edges = new List<Edge>(); }
        private sealed class Edge { public int To; public float Distance; public RoadDefinition Road; public CrossingDefinition Crossing; public bool Blocked; }
        private sealed class Previous { public int From; public Edge Edge; }

        private readonly StrategicMap _map;
        private readonly List<Node> _nodes = new List<Node>();
        private readonly Dictionary<string, int> _nodeByKey = new Dictionary<string, int>();

        public StrategicRoutePlanner(StrategicMap map)
        {
            _map = map ?? throw new ArgumentNullException(nameof(map));
            BuildGraph();
        }

        public int NodeCount => _nodes.Count;

        public RoutePlan Plan(Float2 start, Float2 requestedGoal, UnitTravelKind kind)
        {
            var goal = _map.IsWater(requestedGoal) ? _map.NearestCrossing(requestedGoal)?.Centre ?? requestedGoal : requestedGoal;
            var startNode = FindNearestAccessibleNode(start);
            var goalNode = FindNearestAccessibleNode(goal);
            var result = new RoutePlan();
            if (startNode < 0 || goalNode < 0) return result;

            var distances = new Dictionary<int, float> { [startNode] = Float2.Distance(start, _nodes[startNode].Position) / FieldSpeed(kind) };
            var previous = new Dictionary<int, Previous>();
            var open = new HashSet<int> { startNode };

            while (open.Count > 0)
            {
                var current = -1;
                var currentCost = float.PositiveInfinity;
                foreach (var id in open)
                {
                    var cost = distances[id];
                    if (cost < currentCost) { current = id; currentCost = cost; }
                }
                if (current == goalNode) break;
                open.Remove(current);
                var node = _nodes[current];
                for (var i = 0; i < node.Edges.Count; i++)
                {
                    var edge = node.Edges[i];
                    if (edge.Blocked) continue;
                    var travel = edge.Distance / RoadSpeed(kind, edge.Road.RoadClass) + CrossingDelay(kind, edge.Crossing);
                    var tentative = currentCost + travel;
                    if (distances.TryGetValue(edge.To, out var known) && tentative >= known) continue;
                    distances[edge.To] = tentative;
                    previous[edge.To] = new Previous { From = current, Edge = edge };
                    open.Add(edge.To);
                }
            }

            if (!distances.ContainsKey(goalNode)) return result;
            var nodePath = new List<int>();
            var cursor = goalNode;
            nodePath.Add(cursor);
            while (cursor != startNode)
            {
                if (!previous.TryGetValue(cursor, out var prev)) return new RoutePlan();
                if (!result.RoadIds.Contains(prev.Edge.Road.Id)) result.RoadIds.Add(prev.Edge.Road.Id);
                if (prev.Edge.Crossing != null && !result.CrossingIds.Contains(prev.Edge.Crossing.Id)) result.CrossingIds.Add(prev.Edge.Crossing.Id);
                cursor = prev.From;
                nodePath.Add(cursor);
            }
            nodePath.Reverse();
            for (var i = 0; i < nodePath.Count; i++) result.Points.Add(_nodes[nodePath[i]].Position);
            if (Float2.Distance(result.Points[result.Points.Count - 1], goal) > 0.01f) result.Points.Add(goal);
            result.EstimatedSeconds = distances[goalNode] + Float2.Distance(_nodes[goalNode].Position, goal) / FieldSpeed(kind);
            result.IsValid = true;
            return result;
        }

        private void BuildGraph()
        {
            for (var r = 0; r < _map.Roads.Count; r++)
            {
                var road = _map.Roads[r];
                for (var i = 1; i < road.Points.Length; i++)
                {
                    var a = GetNode(road.Points[i - 1]);
                    var b = GetNode(road.Points[i]);
                    var distance = Float2.Distance(_nodes[a].Position, _nodes[b].Position);
                    var water = _map.SegmentWaterCrossing(_nodes[a].Position, _nodes[b].Position);
                    var forward = new Edge { To = b, Distance = distance, Road = road, Crossing = water?.Crossing, Blocked = water?.Blocked == true };
                    var backward = new Edge { To = a, Distance = distance, Road = road, Crossing = water?.Crossing, Blocked = water?.Blocked == true };
                    _nodes[a].Edges.Add(forward);
                    _nodes[b].Edges.Add(backward);
                }
            }
        }

        private int GetNode(Float2 position)
        {
            var key = $"{MathF.Round(position.X * 1000f)},{MathF.Round(position.Y * 1000f)}";
            if (_nodeByKey.TryGetValue(key, out var existing)) return existing;
            var id = _nodes.Count;
            _nodes.Add(new Node { Id = id, Position = position });
            _nodeByKey[key] = id;
            return id;
        }

        private int FindNearestAccessibleNode(Float2 point)
        {
            var best = -1;
            var bestDistance = float.PositiveInfinity;
            for (var i = 0; i < _nodes.Count; i++)
            {
                var distance = Float2.Distance(point, _nodes[i].Position);
                if (distance >= bestDistance) continue;
                if (_map.SegmentWaterCrossing(point, _nodes[i].Position)?.Blocked == true) continue;
                best = i;
                bestDistance = distance;
            }
            return best;
        }

        private static float RoadSpeed(UnitTravelKind kind, RoadClass roadClass)
        {
            return roadClass switch
            {
                RoadClass.Chaussee => kind == UnitTravelKind.Cavalry ? 1.80f : kind == UnitTravelKind.Artillery ? 0.60f : 1.12f,
                RoadClass.Secondary => kind == UnitTravelKind.Cavalry ? 1.60f : kind == UnitTravelKind.Artillery ? 0.52f : 0.98f,
                _ => kind == UnitTravelKind.Cavalry ? 1.40f : kind == UnitTravelKind.Artillery ? 0.44f : 0.84f
            };
        }

        private static float FieldSpeed(UnitTravelKind kind) => kind == UnitTravelKind.Cavalry ? 1.96f : kind == UnitTravelKind.Artillery ? 0.62f : 1.14f;

        private static float CrossingDelay(UnitTravelKind kind, CrossingDefinition crossing)
        {
            if (crossing == null) return 0f;
            if (crossing.Type == CrossingType.Ford) return kind == UnitTravelKind.Artillery ? 7.5f : kind == UnitTravelKind.Cavalry ? 3.2f : 3.8f;
            return kind == UnitTravelKind.Artillery ? 1.5f : kind == UnitTravelKind.Cavalry ? 1.0f : 0.8f;
        }
    }
}
