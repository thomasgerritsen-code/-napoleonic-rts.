using System;
using System.Collections.Generic;

namespace NapoleonicRTS.Simulation
{
    public sealed class BrowserParityWorld
    {
        private sealed class PendingMoveOrder
        {
            public float ExecuteAt;
            public Float2 Target;
            public readonly List<int> RegimentIds = new List<int>();
        }

        private readonly List<PendingMoveOrder> _pendingOrders = new List<PendingMoveOrder>();
        private readonly Dictionary<ArmySide, Dictionary<UnitKind, int>> _reserves = new Dictionary<ArmySide, Dictionary<UnitKind, int>>();
        private readonly Random _random = new Random(1805);
        private int _nextWorkerId = 1;
        private int _nextResourceId = 1;
        private int _nextBuildingId = 1;
        private float _objectiveClock;

        public BrowserParityWorld(SimulationWorld movement, StrategicMap map, StrategicRoutePlanner planner)
        {
            Movement = movement ?? throw new ArgumentNullException(nameof(movement));
            Map = map ?? throw new ArgumentNullException(nameof(map));
            Planner = planner ?? throw new ArgumentNullException(nameof(planner));
            FranceEconomy = new EconomyState(1100f, 1100f, 45);
            BritainEconomy = new EconomyState(850f, 850f, 45);
            _reserves[ArmySide.France] = NewReservePool();
            _reserves[ArmySide.Britain] = NewReservePool();
            Objective = CreateObjective();
            Combat = new NativeCombatSystem(this, _random);
            Commander = new NativeCommanderSystem(this, _random);
        }

        public SimulationWorld Movement { get; }
        public StrategicMap Map { get; }
        public StrategicRoutePlanner Planner { get; }
        public NativeCombatSystem Combat { get; }
        public NativeCommanderSystem Commander { get; }
        public EconomyState FranceEconomy { get; }
        public EconomyState BritainEconomy { get; }
        public List<ResourceNodeState> Resources { get; } = new List<ResourceNodeState>();
        public List<WorkerState> Workers { get; } = new List<WorkerState>();
        public List<BuildingState> Buildings { get; } = new List<BuildingState>();
        public ObjectiveState Objective { get; }
        public VictorySide Victory { get; private set; }
        public float Elapsed { get; private set; }
        public string Status { get; set; } = "Gereed";
        public int PendingOrderCount => _pendingOrders.Count;

        public EconomyState Economy(ArmySide side) => side == ArmySide.France ? FranceEconomy : BritainEconomy;

        public void Step(float dt)
        {
            if (!(dt > 0f)) throw new ArgumentOutOfRangeException(nameof(dt));
            Elapsed += dt;
            if (Victory == VictorySide.None)
            {
                ExecutePendingOrders();
                Movement.Step(dt);
                UpdateWorkers(dt);
                UpdateBuildings(dt);
                Combat.Step(dt);
                Commander.Step(dt);
                UpdateObjective(dt);
                CheckVictory();
            }
            else Combat.UpdateParticlesOnly(dt);
        }

        public void QueueMoveCommand(IEnumerable<int> regimentIds, Float2 target)
        {
            var order = new PendingMoveOrder { Target = target };
            var distance = 0f;
            var count = 0;
            var commandBonus = 0f;
            var tc = FindBuilding(ArmySide.France, BuildingKind.TownCenter);
            foreach (var id in regimentIds)
            {
                var reg = Movement.FindRegiment(id);
                if (reg == null || reg.Side != ArmySide.France) continue;
                order.RegimentIds.Add(id);
                distance += tc == null ? 0f : Float2.Distance(reg.Anchor, tc.Position);
                commandBonus = MathF.Max(commandBonus, Combat.CommandBonus(reg));
                count++;
            }
            if (count == 0) return;
            distance /= count;
            var delay = MathF.Max(.35f, .75f + distance / 22f - commandBonus * .35f);
            order.ExecuteAt = Elapsed + delay;
            _pendingOrders.Add(order);
            Status = $"Order onderweg ({delay:0.0} s)";
        }

        public void SetFormation(IEnumerable<int> regimentIds, FormationKind formation)
        {
            foreach (var id in regimentIds)
            {
                var reg = Movement.FindRegiment(id);
                if (reg != null && reg.Side == ArmySide.France) Movement.SetFormation(reg, formation);
            }
        }

        private void ExecutePendingOrders()
        {
            for (var i = _pendingOrders.Count - 1; i >= 0; i--)
            {
                var order = _pendingOrders[i];
                if (Elapsed < order.ExecuteAt) continue;
                RegimentCommandService.MoveRegiments(Movement, order.RegimentIds, order.Target, 5.5f, Planner);
                _pendingOrders.RemoveAt(i);
                Status = "Bevel uitgevoerd";
            }
        }

        public BuildingState AddBuilding(ArmySide side, BuildingKind kind, Float2 position, bool complete = true)
        {
            float width, height, hp;
            switch (kind)
            {
                case BuildingKind.Barracks: width = 1.64f; height = 1.20f; hp = 850f; break;
                case BuildingKind.House: width = 1.12f; height = 1.00f; hp = 450f; break;
                default: width = 1.88f; height = 1.56f; hp = 1250f; break;
            }
            var b = new BuildingState
            {
                Id = _nextBuildingId++, Side = side, Kind = kind, Position = position,
                Width = width, Height = height, MaxHitPoints = hp,
                Construction = complete ? 1f : .05f, Complete = complete,
                HitPoints = complete ? hp : hp * .05f
            };
            Buildings.Add(b);
            RecalculatePopulationCap(side);
            return b;
        }

        public ResourceNodeState AddResource(ResourceKind kind, Float2 position, float amount = 650f)
        {
            var r = new ResourceNodeState { Id = _nextResourceId++, Kind = kind, Position = position, Amount = amount, MaxAmount = amount, Radius = .34f };
            Resources.Add(r);
            return r;
        }

        public WorkerState AddWorker(ArmySide side, Float2 position)
        {
            var w = new WorkerState { Id = _nextWorkerId++, Side = side, Position = position, Target = position, Task = WorkerTask.Idle };
            Workers.Add(w);
            return w;
        }

        public bool AssignWorkerToNearestResource(int workerId, ResourceKind preferred)
        {
            var worker = FindWorker(workerId);
            if (worker == null || !worker.Alive) return false;
            var resource = NearestResource(preferred, worker.Position) ?? NearestResource(preferred == ResourceKind.Food ? ResourceKind.Wood : ResourceKind.Food, worker.Position);
            if (resource == null) return false;
            worker.ResourceId = resource.Id;
            worker.Task = WorkerTask.Gather;
            worker.Target = resource.Position;
            return true;
        }

        public bool BeginConstruction(ArmySide side, BuildingKind kind, Float2 position, IList<int> workerIds)
        {
            var woodCost = kind == BuildingKind.Barracks ? 300f : kind == BuildingKind.House ? 120f : 0f;
            var economy = Economy(side);
            if (economy.Wood < woodCost || kind == BuildingKind.TownCenter) return false;
            if (!ValidBuildingSpot(position, kind)) return false;
            economy.Wood -= woodCost;
            var building = AddBuilding(side, kind, position, false);
            for (var i = 0; i < workerIds.Count; i++)
            {
                var w = FindWorker(workerIds[i]);
                if (w == null || !w.Alive || w.Side != side) continue;
                w.Task = WorkerTask.Build;
                w.BuildingId = building.Id;
                w.Target = position;
            }
            return true;
        }

        public bool QueueTraining(ArmySide side, int buildingId, UnitKind kind)
        {
            var building = FindBuilding(buildingId);
            if (building == null || building.Destroyed || !building.Complete || building.Side != side || building.Queue.Count >= 2) return false;
            if (!CanTrain(building.Kind, kind)) return false;
            var economy = Economy(side);
            TrainingCost(kind, out var food, out var wood, out var seconds);
            if (economy.Food < food || economy.Wood < wood || PopulationUsed(side) + PopulationCost(kind) > economy.PopulationCap) return false;
            economy.Food -= food;
            economy.Wood -= wood;
            building.Queue.Enqueue(new TrainingOrder(kind, seconds));
            return true;
        }

        public bool TryFormReserveRegiment(ArmySide side)
        {
            var pool = _reserves[side];
            if (pool[UnitKind.Infantry] < 12 || pool[UnitKind.Officer] < 1 || pool[UnitKind.Drummer] < 1) return false;
            pool[UnitKind.Infantry] -= 12; pool[UnitKind.Officer]--; pool[UnitKind.Drummer]--;
            var tc = FindBuilding(side, BuildingKind.TownCenter);
            var anchor = tc != null ? tc.Position + new Float2(side == ArmySide.France ? 2.4f : -2.4f, 1.8f) : Float2.Zero;
            var facing = side == ArmySide.France ? 0f : MathF.PI;
            var reg = Movement.SpawnRegiment(side, anchor, 14, FormationKind.Line, facing);
            Movement.SetDestination(reg, anchor);
            var indices = reg.UnitIndices;
            Movement.Units[indices[indices.Count - 2]].Kind = UnitKind.Officer;
            Movement.Units[indices[indices.Count - 1]].Kind = UnitKind.Drummer;
            Combat.SyncUnits();
            Combat.RegisterRegiment(reg);
            Status = side == ArmySide.France ? $"Regiment {reg.Id} gevormd" : "Britse reserves vormen een regiment";
            return true;
        }

        public int ReserveCount(ArmySide side, UnitKind kind) => _reserves[side][kind];

        private void UpdateWorkers(float dt)
        {
            for (var i = 0; i < Workers.Count; i++)
            {
                var w = Workers[i];
                if (!w.Alive) continue;
                if (w.Task == WorkerTask.Idle)
                {
                    if (w.Side == ArmySide.Britain) AssignWorkerToNearestResource(w.Id, BritainEconomy.Wood < BritainEconomy.Food ? ResourceKind.Wood : ResourceKind.Food);
                    continue;
                }
                if (w.Task == WorkerTask.Gather)
                {
                    var r = FindResource(w.ResourceId);
                    if (r == null || r.Depleted) { w.Task = WorkerTask.Idle; continue; }
                    if (Float2.Distance(w.Position, r.Position) > r.Radius + .22f)
                    {
                        w.Position = Float2.MoveTowards(w.Position, r.Position, 1.44f * dt); continue;
                    }
                    w.GatherClock += dt;
                    if (w.GatherClock >= .45f)
                    {
                        w.GatherClock = 0f;
                        var take = MathF.Min(5f, MathF.Min(r.Amount, 25f - w.Carry));
                        r.Amount -= take; w.Carry += take; w.CarryKind = r.Kind;
                        if (w.Carry >= 25f || r.Depleted)
                        {
                            w.Task = WorkerTask.Return;
                            var tc = FindBuilding(w.Side, BuildingKind.TownCenter);
                            if (tc != null) w.Target = tc.Position;
                        }
                    }
                    continue;
                }
                if (w.Task == WorkerTask.Return)
                {
                    var tc = FindBuilding(w.Side, BuildingKind.TownCenter);
                    if (tc == null) { w.Task = WorkerTask.Idle; continue; }
                    if (Float2.Distance(w.Position, tc.Position) > 1.24f)
                    {
                        w.Position = Float2.MoveTowards(w.Position, tc.Position, 1.44f * dt); continue;
                    }
                    var economy = Economy(w.Side);
                    if (w.CarryKind == ResourceKind.Food) economy.Food += w.Carry; else economy.Wood += w.Carry;
                    w.Carry = 0f;
                    w.Task = WorkerTask.Idle;
                    AssignWorkerToNearestResource(w.Id, w.CarryKind);
                    continue;
                }
                if (w.Task == WorkerTask.Build)
                {
                    var b = FindBuilding(w.BuildingId);
                    if (b == null || b.Destroyed || b.Complete) { w.Task = WorkerTask.Idle; continue; }
                    if (Float2.Distance(w.Position, b.Position) > MathF.Max(b.Width, b.Height) * .75f)
                    {
                        w.Position = Float2.MoveTowards(w.Position, b.Position, 1.44f * dt); continue;
                    }
                    b.Construction = MathF.Min(1f, b.Construction + dt * .20f);
                    b.HitPoints = b.MaxHitPoints * b.Construction;
                    if (b.Construction >= 1f)
                    {
                        b.Complete = true; b.HitPoints = b.MaxHitPoints; w.Task = WorkerTask.Idle;
                        RecalculatePopulationCap(b.Side);
                    }
                }
            }
        }

        private void UpdateBuildings(float dt)
        {
            for (var i = 0; i < Buildings.Count; i++)
            {
                var b = Buildings[i];
                if (b.Destroyed || !b.Complete || b.Queue.Count == 0) continue;
                var order = b.Queue.Peek();
                order.Remaining -= dt;
                if (order.Remaining > 0f) continue;
                b.Queue.Dequeue();
                if (order.Kind == UnitKind.Worker)
                {
                    var worker = AddWorker(b.Side, b.Position + new Float2(b.Side == ArmySide.France ? 1.2f : -1.2f, 0f));
                    if (b.Side == ArmySide.Britain) AssignWorkerToNearestResource(worker.Id, BritainEconomy.Wood < BritainEconomy.Food ? ResourceKind.Wood : ResourceKind.Food);
                }
                else if (order.Kind == UnitKind.Infantry || order.Kind == UnitKind.Officer || order.Kind == UnitKind.Drummer)
                    _reserves[b.Side][order.Kind]++;
                else
                    SpawnSupportUnit(b.Side, order.Kind, b.Position);
                if (b.Side == ArmySide.Britain) TryFormReserveRegiment(ArmySide.Britain);
            }
        }

        private void SpawnSupportUnit(ArmySide side, UnitKind kind, Float2 near)
        {
            if (kind == UnitKind.Artillery)
            {
                var reg = Movement.SpawnRegiment(side, near + new Float2(side == ArmySide.France ? 2f : -2f, 0f), 3, FormationKind.Line, side == ArmySide.France ? 0f : MathF.PI);
                reg.Speed = .62f;
                Movement.Units[reg.UnitIndices[0]].Kind = UnitKind.Artillery;
                Movement.Units[reg.UnitIndices[1]].Kind = UnitKind.Infantry;
                Movement.Units[reg.UnitIndices[2]].Kind = UnitKind.Infantry;
                Combat.SyncUnits(); Combat.RegisterRegiment(reg);
                return;
            }
            var formation = kind == UnitKind.Cavalry ? FormationKind.Column : FormationKind.Line;
            var count = kind == UnitKind.Cavalry ? 4 : 1;
            var support = Movement.SpawnRegiment(side, near + new Float2(side == ArmySide.France ? 2f : -2f, 0f), count, formation, side == ArmySide.France ? 0f : MathF.PI);
            for (var i = 0; i < support.UnitIndices.Count; i++) Movement.Units[support.UnitIndices[i]].Kind = kind;
            support.Speed = kind == UnitKind.Cavalry ? 1.96f : 1.14f;
            Combat.SyncUnits(); Combat.RegisterRegiment(support);
        }

        private void UpdateObjective(float dt)
        {
            _objectiveClock += dt;
            if (_objectiveClock < 1f) return;
            _objectiveClock -= 1f;
            for (var p = 0; p < Objective.Points.Count; p++)
            {
                var point = Objective.Points[p];
                var france = CombatUnitsNear(ArmySide.France, point.Position, 2.5f);
                var britain = CombatUnitsNear(ArmySide.Britain, point.Position, 2.5f);
                if (france > 0 && britain == 0) { point.Progress = MathF.Min(10f, point.Progress + 1f); if (point.Progress >= 4f) point.Owner = ArmySide.France; }
                else if (britain > 0 && france == 0) { point.Progress = MathF.Max(-10f, point.Progress - 1f); if (point.Progress <= -4f) point.Owner = ArmySide.Britain; }
                else if (france > 0 && britain > 0) point.Progress *= .8f;
                if (point.Owner == ArmySide.France) Objective.FranceScore++;
                else if (point.Owner == ArmySide.Britain) Objective.BritainScore++;
            }
            if (Objective.FranceScore >= Objective.TargetScore) Victory = VictorySide.France;
            else if (Objective.BritainScore >= Objective.TargetScore) Victory = VictorySide.Britain;
        }

        private int CombatUnitsNear(ArmySide side, Float2 point, float radius)
        {
            var n = 0; var r2 = radius * radius;
            for (var i = 0; i < Movement.Units.Count; i++)
            {
                var u = Movement.Units[i];
                if (!u.Alive || u.Side != side) continue;
                var c = Combat.Get(u.Id);
                if (c != null && c.Routing) continue;
                if ((u.Position - point).LengthSquared < r2) n++;
            }
            return n;
        }

        private void CheckVictory()
        {
            if (Victory != VictorySide.None) return;
            var frenchTc = FindBuilding(ArmySide.France, BuildingKind.TownCenter);
            var britishTc = FindBuilding(ArmySide.Britain, BuildingKind.TownCenter);
            if (britishTc == null || britishTc.Destroyed) Victory = VictorySide.France;
            else if (frenchTc == null || frenchTc.Destroyed) Victory = VictorySide.Britain;
        }

        public int PopulationUsed(ArmySide side)
        {
            var count = 0;
            for (var i = 0; i < Workers.Count; i++) if (Workers[i].Alive && Workers[i].Side == side) count++;
            for (var i = 0; i < Movement.Units.Count; i++)
            {
                var u = Movement.Units[i]; if (!u.Alive || u.Side != side) continue;
                count += PopulationCost(u.Kind);
            }
            foreach (var pair in _reserves[side]) count += pair.Value * PopulationCost(pair.Key);
            for (var i = 0; i < Buildings.Count; i++)
            {
                var b = Buildings[i]; if (b.Destroyed || b.Side != side) continue;
                foreach (var order in b.Queue) count += PopulationCost(order.Kind);
            }
            return count;
        }

        public void RecalculatePopulationCap(ArmySide side)
        {
            var cap = 45;
            for (var i = 0; i < Buildings.Count; i++)
            {
                var b = Buildings[i]; if (b.Destroyed || !b.Complete || b.Side != side) continue;
                if (b.Kind == BuildingKind.House) cap += 15;
            }
            Economy(side).PopulationCap = cap;
        }

        public BuildingState FindBuilding(int id)
        {
            for (var i = 0; i < Buildings.Count; i++) if (Buildings[i].Id == id) return Buildings[i];
            return null;
        }
        public BuildingState FindBuilding(ArmySide side, BuildingKind kind)
        {
            for (var i = 0; i < Buildings.Count; i++)
            {
                var b = Buildings[i]; if (!b.Destroyed && b.Complete && b.Side == side && b.Kind == kind) return b;
            }
            return null;
        }
        public WorkerState FindWorker(int id) { for (var i = 0; i < Workers.Count; i++) if (Workers[i].Id == id) return Workers[i]; return null; }
        public ResourceNodeState FindResource(int id) { for (var i = 0; i < Resources.Count; i++) if (Resources[i].Id == id) return Resources[i]; return null; }

        public ResourceNodeState NearestResource(ResourceKind kind, Float2 position)
        {
            ResourceNodeState best = null; var bestD = float.PositiveInfinity;
            for (var i = 0; i < Resources.Count; i++)
            {
                var r = Resources[i]; if (r.Kind != kind || r.Depleted) continue;
                var d = Float2.Distance(position, r.Position); if (d < bestD) { bestD = d; best = r; }
            }
            return best;
        }

        public bool ValidBuildingSpot(Float2 position, BuildingKind kind)
        {
            var size = kind == BuildingKind.Barracks ? 1.64f : 1.12f;
            for (var i = 0; i < Buildings.Count; i++)
            {
                var b = Buildings[i]; if (b.Destroyed) continue;
                if (Float2.Distance(position, b.Position) < (size + MathF.Max(b.Width, b.Height)) * .75f) return false;
            }
            return !Map.IsWater(position);
        }

        private static bool CanTrain(BuildingKind building, UnitKind kind)
        {
            if (building == BuildingKind.TownCenter) return kind == UnitKind.Worker;
            if (building != BuildingKind.Barracks) return false;
            return kind == UnitKind.Infantry || kind == UnitKind.Officer || kind == UnitKind.Drummer || kind == UnitKind.Cavalry || kind == UnitKind.Artillery;
        }

        private static void TrainingCost(UnitKind kind, out float food, out float wood, out float seconds)
        {
            switch (kind)
            {
                case UnitKind.Worker: food = 50f; wood = 0f; seconds = 7f; break;
                case UnitKind.Officer: food = 160f; wood = 60f; seconds = 10f; break;
                case UnitKind.Drummer: food = 90f; wood = 20f; seconds = 7f; break;
                case UnitKind.Cavalry: food = 180f; wood = 30f; seconds = 12f; break;
                case UnitKind.Artillery: food = 120f; wood = 180f; seconds = 16f; break;
                default: food = 80f; wood = 20f; seconds = 6f; break;
            }
        }
        private static int PopulationCost(UnitKind kind) => kind == UnitKind.Artillery ? 3 : kind == UnitKind.Cavalry ? 2 : 1;

        private static Dictionary<UnitKind, int> NewReservePool()
        {
            return new Dictionary<UnitKind, int>
            {
                [UnitKind.Infantry] = 0, [UnitKind.Officer] = 0, [UnitKind.Drummer] = 0,
                [UnitKind.Cavalry] = 0, [UnitKind.Artillery] = 0
            };
        }

        private static ObjectiveState CreateObjective()
        {
            var o = new ObjectiveState();
            ObjectiveScenarioService.Select(o, "crossroads");
            return o;
        }
    }
}
