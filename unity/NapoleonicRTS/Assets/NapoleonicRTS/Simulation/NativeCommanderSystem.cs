using System;
using System.Collections.Generic;

namespace NapoleonicRTS.Simulation
{
    public sealed class NativeCommanderSystem
    {
        private readonly BrowserParityWorld _world;
        private readonly Random _random;
        private float _productionClock;
        private float _militaryClock;
        private float _stateSince;
        private int _wave;
        private int _flankSide = 1;
        private float _retreatUntil;

        public NativeCommanderSystem(BrowserParityWorld world, Random random)
        {
            _world = world;
            _random = random;
            State = CommanderState.Defend;
        }

        public CommanderState State { get; private set; }
        public string Plan { get; private set; } = "Commandant: verdedigt basis";
        public int Wave => _wave;
        public int ProductionTicks { get; private set; }
        public int OrdersIssued { get; private set; }

        public void Step(float dt)
        {
            _productionClock += dt;
            _militaryClock += dt;
            if (_productionClock >= 2f) { _productionClock -= 2f; DevelopEconomy(); }
            if (_militaryClock >= 8f) { _militaryClock -= 8f; MilitaryOrder(); }
        }

        private void DevelopEconomy()
        {
            ProductionTicks++;
            var side = ArmySide.Britain;
            var economy = _world.BritainEconomy;
            var workers = LivingWorkers(side);
            if (workers.Count < 10 && economy.Food >= 50f && _world.PopulationUsed(side) < economy.PopulationCap)
            {
                economy.Food -= 50f;
                var tc = _world.FindBuilding(side, BuildingKind.TownCenter);
                if (tc != null) _world.AddWorker(side, tc.Position + new Float2(RandomRange(-1f, 1f), RandomRange(-1f, 1f)));
                Plan = "Productie: extra arbeider";
                return;
            }

            var barracks = FindBuildings(side, BuildingKind.Barracks);
            if (barracks.Count == 0 && economy.Wood >= 300f && workers.Count > 0)
            {
                var tc = _world.FindBuilding(side, BuildingKind.TownCenter);
                var ids = WorkerIds(workers, 2);
                if (tc != null && _world.BeginConstruction(side, BuildingKind.Barracks, tc.Position + new Float2(-3.6f, 2.8f), ids))
                { Plan = "Productie: Barracks bouwen"; return; }
            }

            var used = _world.PopulationUsed(side);
            if (economy.PopulationCap - used < 8 && economy.Wood >= 120f && workers.Count > 0)
            {
                var tc = _world.FindBuilding(side, BuildingKind.TownCenter);
                var houses = FindBuildings(side, BuildingKind.House).Count;
                var offsetY = houses % 2 == 0 ? -3f : 3f;
                if (tc != null && _world.BeginConstruction(side, BuildingKind.House, tc.Position + new Float2(-2.4f - houses * .8f, offsetY), WorkerIds(workers, 1)))
                { Plan = "Productie: House bouwen"; return; }
            }

            BuildingState training = null;
            for (var i = 0; i < barracks.Count; i++) if (barracks[i].Complete && !barracks[i].Destroyed && barracks[i].Queue.Count < 2) { training = barracks[i]; break; }
            if (training == null) { Plan = "Productie: Barracks afbouwen"; return; }

            var desired = 4;
            var readiness = ArmyReadiness();
            if (readiness < desired - .01f)
            {
                if (_world.TryFormReserveRegiment(side)) { Plan = "Productie: nieuw regiment gevormd"; return; }
                if (_world.ReserveCount(side, UnitKind.Infantry) < 12)
                {
                    if (_world.QueueTraining(side, training.Id, UnitKind.Infantry)) { Plan = "Productie: infanterie trainen"; return; }
                }
                else if (_world.ReserveCount(side, UnitKind.Officer) < 1)
                {
                    if (_world.QueueTraining(side, training.Id, UnitKind.Officer)) { Plan = "Productie: officier trainen"; return; }
                }
                else if (_world.ReserveCount(side, UnitKind.Drummer) < 1)
                {
                    if (_world.QueueTraining(side, training.Id, UnitKind.Drummer)) { Plan = "Productie: drummer trainen"; return; }
                }
            }
            else if (_world.ReserveCount(side, UnitKind.Infantry) < 6)
            {
                if (_world.QueueTraining(side, training.Id, UnitKind.Infantry)) { Plan = "Productie: reserve aanvullen"; return; }
            }
            Plan = $"Productie: leger gereed ({readiness:0.0}/{desired})";
        }

        private float ArmyReadiness()
        {
            var readiness = 0f;
            for (var i = 0; i < _world.Movement.Regiments.Count; i++)
            {
                var reg = _world.Movement.Regiments[i]; if (reg.Side != ArmySide.Britain) continue;
                var infantry = 0; var officer = false; var drummer = false;
                for (var m = 0; m < reg.UnitIndices.Count; m++)
                {
                    var u = _world.Movement.Units[reg.UnitIndices[m]]; if (!u.Alive) continue;
                    if (u.Kind == UnitKind.Infantry) infantry++;
                    else if (u.Kind == UnitKind.Officer) officer = true;
                    else if (u.Kind == UnitKind.Drummer) drummer = true;
                }
                if (infantry == 0) continue;
                readiness += MathF.Min(1f, infantry / 12f) * (officer ? 1f : .82f) * (drummer ? 1f : .93f);
            }
            return readiness;
        }

        private void MilitaryOrder()
        {
            var regs = InfantryRegiments(ArmySide.Britain);
            if (regs.Count == 0) { Transition(CommanderState.Defend); Plan = "Commandant: wacht op gevechtsgereed regiment"; return; }
            var target = StrategicTarget();
            var tc = _world.FindBuilding(ArmySide.Britain, BuildingKind.TownCenter);
            var own = _world.Combat.SideStrength(ArmySide.Britain);
            var enemy = _world.Combat.SideStrength(ArmySide.France);
            var ratio = own / MathF.Max(1f, enemy);
            var morale = _world.Combat.MeanMorale(ArmySide.Britain);
            var age = _world.Elapsed - _stateSince;

            CommanderState next;
            if (BaseThreatened(tc) && State != CommanderState.Retreat) next = CommanderState.Defend;
            else if ((morale < 37f || ratio < .48f) && State != CommanderState.Retreat) { _retreatUntil = _world.Elapsed + 15f; next = CommanderState.Retreat; }
            else if (State == CommanderState.Retreat) next = _world.Elapsed < _retreatUntil ? CommanderState.Retreat : CommanderState.Regroup;
            else if (State == CommanderState.Regroup) next = morale > 62f && age > 8f ? (regs.Count >= 2 ? CommanderState.Mass : CommanderState.Defend) : CommanderState.Regroup;
            else if (_world.Elapsed < 35f || regs.Count < 2) next = CommanderState.Defend;
            else if (State == CommanderState.Defend) next = CommanderState.Mass;
            else if (State == CommanderState.Mass) next = age > 9f ? CommanderState.Advance : CommanderState.Mass;
            else if (State == CommanderState.Advance) next = age > 12f ? CommanderState.Attack : CommanderState.Advance;
            else if (State == CommanderState.Attack) next = age > 18f && HasLivingKind(ArmySide.Britain, UnitKind.Cavalry) ? CommanderState.Flank : age > 28f ? CommanderState.Regroup : CommanderState.Attack;
            else if (State == CommanderState.Flank) next = age > 13f ? CommanderState.Attack : CommanderState.Flank;
            else next = CommanderState.Defend;
            Transition(next);

            if (tc == null) tc = new BuildingState { Position = new Float2(30f, 0f) };
            switch (State)
            {
                case CommanderState.Defend: Defend(regs, tc.Position, target); break;
                case CommanderState.Mass: Mass(regs, tc.Position, target); break;
                case CommanderState.Advance: Advance(regs, tc.Position, target); break;
                case CommanderState.Attack: Attack(regs, tc.Position, target); break;
                case CommanderState.Flank: Flank(regs, tc.Position, target); break;
                case CommanderState.Retreat: Retreat(regs, tc.Position, target); break;
                default: Regroup(regs, tc.Position, target); break;
            }
        }

        private void Transition(CommanderState next)
        {
            if (State == next) return;
            State = next; _stateSince = _world.Elapsed;
            if (next == CommanderState.Attack) _wave++;
            if (next == CommanderState.Flank) _flankSide *= -1;
        }

        private Float2 StrategicTarget()
        {
            var tc = _world.FindBuilding(ArmySide.Britain, BuildingKind.TownCenter);
            var origin = tc == null ? new Float2(30f, 0f) : tc.Position;
            var best = _world.Combat.FindNearestEnemyRegimentAnchor(ArmySide.Britain, origin);
            if (best.HasValue) return best.Value;
            var french = _world.FindBuilding(ArmySide.France, BuildingKind.TownCenter);
            return french == null ? new Float2(-30f, 0f) : french.Position;
        }

        private bool BaseThreatened(BuildingState tc)
        {
            if (tc == null) return false;
            for (var i = 0; i < _world.Movement.Units.Count; i++)
            {
                var u = _world.Movement.Units[i]; if (!u.Alive || u.Side != ArmySide.France) continue;
                var c = _world.Combat.Get(u.Id); if (c != null && c.Routing) continue;
                if (Float2.Distance(u.Position, tc.Position) < 12.4f) return true;
            }
            return false;
        }

        private void Defend(List<RegimentState> regs, Float2 tc, Float2 target)
        {
            var d = Direction(tc, target);
            for (var i = 0; i < regs.Count; i++) OrderRegiment(regs[i], Offset(tc, d, -4.6f, (i - (regs.Count - 1) * .5f) * 2.5f), FormationKind.Line);
            OrderSupport(tc - d * 2.6f, false);
            Plan = $"Commandant: verdedigt basis · {regs.Count} regimenten";
        }
        private void Mass(List<RegimentState> regs, Float2 tc, Float2 target)
        {
            var d = Direction(tc, target); var rally = tc + d * 6f;
            for (var i = 0; i < regs.Count; i++) OrderRegiment(regs[i], Offset(rally, d, 0f, (i - (regs.Count - 1) * .5f) * 2.3f), FormationKind.Column);
            OrderSupport(rally - d * 3.4f, false);
            Plan = $"Commandant: verzamelt aanvalsgolf {_wave + 1}";
        }
        private void Advance(List<RegimentState> regs, Float2 tc, Float2 target)
        {
            var d = Direction(tc, target); var stage = target - d * 10.4f;
            for (var i = 0; i < regs.Count; i++) OrderRegiment(regs[i], Offset(stage, d, -i * .9f, (i - (regs.Count - 1) * .5f) * 2.4f), FormationKind.Column);
            OrderSupport(target - d * 13.8f, false);
            Plan = "Commandant: leger rukt in marsorde op";
        }
        private void Attack(List<RegimentState> regs, Float2 tc, Float2 target)
        {
            var d = Direction(tc, target);
            for (var i = 0; i < regs.Count; i++) OrderRegiment(regs[i], Offset(target, d, -2.9f, (i - (regs.Count - 1) * .5f) * 2.7f), FormationKind.Line);
            OrderSupport(target - d * 7.8f, true);
            Plan = $"Commandant: aanvalsgolf {Math.Max(1, _wave)} in linie";
        }
        private void Flank(List<RegimentState> regs, Float2 tc, Float2 target)
        {
            var d = Direction(tc, target);
            var mainCount = Math.Max(1, regs.Count - 1);
            for (var i = 0; i < mainCount; i++) OrderRegiment(regs[i], Offset(target, d, -3.3f, (i - (mainCount - 1) * .5f) * 2.6f), FormationKind.Line);
            for (var i = mainCount; i < regs.Count; i++) OrderRegiment(regs[i], Offset(target, d, -5f, _flankSide * 6.6f), FormationKind.Column);
            OrderSupport(Offset(target, d, .7f, _flankSide * 7.8f), true);
            Plan = _flankSide > 0 ? "Commandant: rechter flankaanval" : "Commandant: linker flankaanval";
        }
        private void Retreat(List<RegimentState> regs, Float2 tc, Float2 target)
        {
            var d = Direction(target, tc); var safe = tc - d * 2.4f;
            for (var i = 0; i < regs.Count; i++) OrderRegiment(regs[i], Offset(safe, d, i * .7f, (i - (regs.Count - 1) * .5f) * 2f), FormationKind.Column);
            OrderSupport(safe + new Float2(0f, 3f), false);
            Plan = "Commandant: gecontroleerde terugtocht";
        }
        private void Regroup(List<RegimentState> regs, Float2 tc, Float2 target)
        {
            var d = Direction(tc, target); var rally = tc + d * 3.5f;
            for (var i = 0; i < regs.Count; i++) OrderRegiment(regs[i], Offset(rally, d, 0f, (i - (regs.Count - 1) * .5f) * 2.3f), FormationKind.Line);
            Plan = "Commandant: hergroepeert en laat reserves aansluiten";
        }

        private void OrderSupport(Float2 position, bool chargeCavalry)
        {
            for (var i = 0; i < _world.Movement.Regiments.Count; i++)
            {
                var reg = _world.Movement.Regiments[i]; if (reg.Side != ArmySide.Britain || _world.Combat.LivingMembers(reg) == 0) continue;
                var kind = PrimaryKind(reg);
                if (kind != UnitKind.Artillery && kind != UnitKind.Cavalry) continue;
                var offset = kind == UnitKind.Cavalry ? new Float2(0f, _flankSide * 4f) : Float2.Zero;
                OrderRegiment(reg, position + offset, FormationKind.Column);
                if (kind == UnitKind.Cavalry && chargeCavalry)
                {
                    for (var m = 0; m < reg.UnitIndices.Count; m++)
                    {
                        var u = _world.Movement.Units[reg.UnitIndices[m]]; var c = _world.Combat.Get(u.Id); if (c != null) c.ChargeTimer = MathF.Max(c.ChargeTimer, 8f);
                    }
                }
            }
        }

        private void OrderRegiment(RegimentState reg, Float2 target, FormationKind formation)
        {
            _world.Movement.SetFormation(reg, formation);
            var plan = _world.Planner.Plan(reg.Anchor, target, TravelKind(reg));
            if (plan.IsValid) _world.Movement.SetRoute(reg, plan); else _world.Movement.SetDestination(reg, target);
            OrdersIssued++;
        }

        private List<RegimentState> InfantryRegiments(ArmySide side)
        {
            var result = new List<RegimentState>();
            for (var i = 0; i < _world.Movement.Regiments.Count; i++)
            {
                var reg = _world.Movement.Regiments[i]; if (reg.Side != side || _world.Combat.LivingMembers(reg) == 0) continue;
                var kind = PrimaryKind(reg); if (kind == UnitKind.Infantry || kind == UnitKind.Officer || kind == UnitKind.Drummer) result.Add(reg);
            }
            return result;
        }

        private UnitKind PrimaryKind(RegimentState reg)
        {
            for (var i = 0; i < reg.UnitIndices.Count; i++)
            {
                var u = _world.Movement.Units[reg.UnitIndices[i]]; if (u.Alive && u.Kind != UnitKind.Officer && u.Kind != UnitKind.Drummer) return u.Kind;
            }
            return UnitKind.Infantry;
        }

        private UnitTravelKind TravelKind(RegimentState reg)
        {
            var kind = PrimaryKind(reg);
            return kind == UnitKind.Cavalry ? UnitTravelKind.Cavalry : kind == UnitKind.Artillery ? UnitTravelKind.Artillery : UnitTravelKind.Infantry;
        }

        private bool HasLivingKind(ArmySide side, UnitKind kind)
        {
            for (var i = 0; i < _world.Movement.Units.Count; i++) if (_world.Movement.Units[i].Alive && _world.Movement.Units[i].Side == side && _world.Movement.Units[i].Kind == kind) return true;
            return false;
        }

        private List<WorkerState> LivingWorkers(ArmySide side)
        {
            var result = new List<WorkerState>(); for (var i = 0; i < _world.Workers.Count; i++) if (_world.Workers[i].Alive && _world.Workers[i].Side == side) result.Add(_world.Workers[i]); return result;
        }
        private List<BuildingState> FindBuildings(ArmySide side, BuildingKind kind)
        {
            var result = new List<BuildingState>(); for (var i = 0; i < _world.Buildings.Count; i++) { var b = _world.Buildings[i]; if (!b.Destroyed && b.Side == side && b.Kind == kind) result.Add(b); } return result;
        }
        private static List<int> WorkerIds(List<WorkerState> workers, int max)
        {
            var result = new List<int>(); for (var i = 0; i < workers.Count && result.Count < max; i++) if (workers[i].Task != WorkerTask.Build) result.Add(workers[i].Id); return result;
        }

        private static Float2 Direction(Float2 a, Float2 b) { var d = b - a; return d.Length > .001f ? d / d.Length : new Float2(-1f, 0f); }
        private static Float2 Offset(Float2 p, Float2 d, float forward, float lateral) => new Float2(p.X + d.X * forward - d.Y * lateral, p.Y + d.Y * forward + d.X * lateral);
        private float RandomRange(float a, float b) => a + (float)_random.NextDouble() * (b - a);
    }
}
