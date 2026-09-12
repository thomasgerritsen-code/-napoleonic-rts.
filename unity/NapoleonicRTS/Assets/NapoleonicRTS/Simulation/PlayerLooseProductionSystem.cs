using System;
using System.Collections.Generic;

namespace NapoleonicRTS.Simulation
{
    public sealed class PlayerLooseProductionSystem
    {
        private sealed class LooseOrder
        {
            public UnitKind Kind;
            public float Remaining;
            public float Total;
        }

        private readonly BrowserParityWorld _world;
        private readonly Dictionary<int, Queue<LooseOrder>> _queues = new Dictionary<int, Queue<LooseOrder>>();
        private readonly HashSet<int> _looseRegiments = new HashSet<int>();

        public PlayerLooseProductionSystem(BrowserParityWorld world) => _world = world ?? throw new ArgumentNullException(nameof(world));

        public IReadOnlyCollection<int> LooseRegiments => _looseRegiments;

        public int QueueCount(int buildingId) => _queues.TryGetValue(buildingId, out var queue) ? queue.Count : 0;

        public float QueueProgress(int buildingId)
        {
            if (!_queues.TryGetValue(buildingId, out var queue) || queue.Count == 0) return 0f;
            var order = queue.Peek();
            return order.Total <= 0f ? 1f : Math.Clamp(1f - order.Remaining / order.Total, 0f, 1f);
        }

        public bool QueueTraining(int buildingId, UnitKind kind)
        {
            var building = _world.FindBuilding(buildingId);
            if (building == null || building.Destroyed || !building.Complete || building.Side != ArmySide.France) return false;
            if (!CanTrain(building.Kind, kind)) return false;
            if (!_queues.TryGetValue(building.Id, out var queue))
            {
                queue = new Queue<LooseOrder>();
                _queues[building.Id] = queue;
            }
            if (queue.Count >= 2) return false;

            Cost(kind, out var food, out var wood, out var seconds);
            var economy = _world.FranceEconomy;
            if (economy.Food < food || economy.Wood < wood) return false;
            if (PopulationCommitted() + PopulationCost(kind) > economy.PopulationCap) return false;
            economy.Food -= food;
            economy.Wood -= wood;
            queue.Enqueue(new LooseOrder { Kind = kind, Remaining = seconds, Total = seconds });
            _world.Status = $"{Label(kind)} toegevoegd aan productie";
            return true;
        }

        public void Step(float dt)
        {
            if (!(dt > 0f)) return;
            var buildingIds = new List<int>(_queues.Keys);
            for (var i = 0; i < buildingIds.Count; i++)
            {
                var buildingId = buildingIds[i];
                var building = _world.FindBuilding(buildingId);
                var queue = _queues[buildingId];
                if (building == null || building.Destroyed)
                {
                    queue.Clear();
                    continue;
                }
                if (!building.Complete || queue.Count == 0) continue;
                var order = queue.Peek();
                order.Remaining -= dt;
                if (order.Remaining > 0f) continue;
                if (_world.PopulationUsed(ArmySide.France) + PopulationCost(order.Kind) > _world.FranceEconomy.PopulationCap)
                {
                    order.Remaining = 0f;
                    continue;
                }
                queue.Dequeue();
                Spawn(building, order.Kind);
            }
        }

        private void Spawn(BuildingState building, UnitKind kind)
        {
            var sideOffset = new Float2(1.45f, .72f + (building.Id % 3) * .28f);
            var spawn = building.Position + sideOffset;
            if (kind == UnitKind.Worker)
            {
                _world.AddWorker(ArmySide.France, spawn);
                _world.Status = "Boer is klaar";
                return;
            }

            var regiment = _world.Movement.SpawnRegiment(ArmySide.France, spawn, 1, FormationKind.Line, 0f);
            regiment.Speed = Speed(kind);
            var unit = _world.Movement.Units[regiment.UnitIndices[0]];
            unit.Kind = kind;
            _looseRegiments.Add(regiment.Id);
            _world.Combat.SyncUnits();
            _world.Combat.RegisterRegiment(regiment);
            _world.Status = $"{Label(kind)} is klaar";
        }

        public bool IsLooseRegiment(int regimentId) => _looseRegiments.Contains(regimentId);

        public int LooseCount(UnitKind kind)
        {
            var count = 0;
            foreach (var id in _looseRegiments)
            {
                var regiment = _world.Movement.FindRegiment(id);
                if (regiment == null || regiment.UnitIndices.Count != 1) continue;
                var unit = _world.Movement.Units[regiment.UnitIndices[0]];
                if (unit.Alive && unit.Kind == kind) count++;
            }
            return count;
        }

        public bool TryFormRegiment(IEnumerable<int> selectedRegimentIds = null)
        {
            HashSet<int> allowed = null;
            if (selectedRegimentIds != null) allowed = new HashSet<int>(selectedRegimentIds);
            var infantry = new List<RegimentState>();
            RegimentState officer = null;
            RegimentState drummer = null;

            foreach (var id in _looseRegiments)
            {
                if (allowed != null && !allowed.Contains(id)) continue;
                var regiment = _world.Movement.FindRegiment(id);
                if (regiment == null || regiment.UnitIndices.Count != 1) continue;
                var unit = _world.Movement.Units[regiment.UnitIndices[0]];
                if (!unit.Alive) continue;
                if (unit.Kind == UnitKind.Infantry && infantry.Count < 12) infantry.Add(regiment);
                else if (unit.Kind == UnitKind.Officer && officer == null) officer = regiment;
                else if (unit.Kind == UnitKind.Drummer && drummer == null) drummer = regiment;
            }
            if (infantry.Count < 12 || officer == null || drummer == null) return false;

            var source = new List<RegimentState>(infantry) { officer, drummer };
            var centre = Float2.Zero;
            for (var i = 0; i < source.Count; i++) centre += _world.Movement.Units[source[i].UnitIndices[0]].Position;
            centre /= source.Count;

            // Newly trained loose troops are full-health material. Reconstituting them into the
            // authoritative regiment representation keeps the movement core compact and avoids
            // one GameObject/behaviour per soldier while preserving the browser's visible staging step.
            for (var i = 0; i < source.Count; i++)
            {
                var oldUnit = _world.Movement.Units[source[i].UnitIndices[0]];
                oldUnit.Alive = false;
                _looseRegiments.Remove(source[i].Id);
            }

            var formed = _world.Movement.SpawnRegiment(ArmySide.France, centre, 14, FormationKind.Line, 0f);
            formed.Speed = 1.14f;
            for (var i = 0; i < 12; i++) _world.Movement.Units[formed.UnitIndices[i]].Kind = UnitKind.Infantry;
            _world.Movement.Units[formed.UnitIndices[12]].Kind = UnitKind.Officer;
            _world.Movement.Units[formed.UnitIndices[13]].Kind = UnitKind.Drummer;
            _world.Combat.SyncUnits();
            _world.Combat.RegisterRegiment(formed);
            _world.Status = $"Regiment {formed.Id} gevormd uit losse troepen";
            return true;
        }

        public int PopulationCommitted()
        {
            var committed = _world.PopulationUsed(ArmySide.France);
            foreach (var pair in _queues)
                foreach (var order in pair.Value) committed += PopulationCost(order.Kind);
            return committed;
        }

        private static bool CanTrain(BuildingKind building, UnitKind kind)
        {
            if (building == BuildingKind.TownCenter) return kind == UnitKind.Worker;
            if (building != BuildingKind.Barracks) return false;
            return kind == UnitKind.Infantry || kind == UnitKind.Officer || kind == UnitKind.Drummer;
        }

        private static void Cost(UnitKind kind, out float food, out float wood, out float seconds)
        {
            switch (kind)
            {
                case UnitKind.Worker: food = 50f; wood = 0f; seconds = 7f; break;
                case UnitKind.Officer: food = 160f; wood = 60f; seconds = 10f; break;
                case UnitKind.Drummer: food = 90f; wood = 20f; seconds = 7f; break;
                default: food = 80f; wood = 20f; seconds = 6f; break;
            }
        }

        private static int PopulationCost(UnitKind kind) => kind == UnitKind.Cavalry ? 2 : kind == UnitKind.Artillery ? 3 : 1;
        private static float Speed(UnitKind kind) => kind == UnitKind.Drummer ? 1.22f : kind == UnitKind.Officer ? 1.20f : 1.14f;
        private static string Label(UnitKind kind) => kind == UnitKind.Worker ? "Boer" : kind == UnitKind.Infantry ? "Musketier" : kind == UnitKind.Officer ? "Officier" : kind == UnitKind.Drummer ? "Drummer" : kind.ToString();
    }
}
