using System;
using System.Collections.Generic;

namespace NapoleonicRTS.Simulation
{
    public sealed class NativeCombatSystem
    {
        private readonly BrowserParityWorld _world;
        private readonly Random _random;
        private readonly Dictionary<int, CombatUnitState> _combat = new Dictionary<int, CombatUnitState>();
        private readonly Dictionary<int, RegimentBattleState> _regiments = new Dictionary<int, RegimentBattleState>();
        private readonly Dictionary<long, List<int>> _grid = new Dictionary<long, List<int>>();
        private readonly Dictionary<int, UnitState> _unitsById = new Dictionary<int, UnitState>();
        private int _nextProjectileId = 1;
        private float _volleyClock;
        private const float GridCell = 2.6f;

        public NativeCombatSystem(BrowserParityWorld world, Random random)
        {
            _world = world;
            _random = random;
        }

        public List<ProjectileState> Projectiles { get; } = new List<ProjectileState>();
        public List<ParticleState> Particles { get; } = new List<ParticleState>();
        public IReadOnlyDictionary<int, CombatUnitState> UnitStates => _combat;
        public IReadOnlyDictionary<int, RegimentBattleState> RegimentStates => _regiments;
        public int TotalShotsFired { get; private set; }
        public int TotalDeaths { get; private set; }

        public void SyncUnits()
        {
            for (var i = 0; i < _world.Movement.Units.Count; i++)
            {
                var u = _world.Movement.Units[i];
                _unitsById[u.Id] = u;
                if (!_combat.ContainsKey(u.Id))
                {
                    var profile = CombatProfile.For(u.Kind);
                    _combat[u.Id] = new CombatUnitState { HitPoints = profile.MaxHp, MaxHitPoints = profile.MaxHp };
                }
            }
            for (var i = 0; i < _world.Movement.Regiments.Count; i++) RegisterRegiment(_world.Movement.Regiments[i]);
        }

        public void RegisterRegiment(RegimentState regiment)
        {
            if (regiment == null || _regiments.ContainsKey(regiment.Id)) return;
            _regiments[regiment.Id] = new RegimentBattleState { InitialStrength = regiment.UnitIndices.Count };
        }

        public CombatUnitState Get(int unitId)
        {
            _combat.TryGetValue(unitId, out var state);
            return state;
        }

        public RegimentBattleState GetRegiment(int regimentId)
        {
            _regiments.TryGetValue(regimentId, out var state);
            return state;
        }

        public float CommandBonus(RegimentState regiment)
        {
            if (regiment == null) return 0f;
            var best = float.PositiveInfinity;
            for (var i = 0; i < _world.Movement.Units.Count; i++)
            {
                var u = _world.Movement.Units[i];
                if (!u.Alive || u.Side != regiment.Side || u.Kind != UnitKind.Officer) continue;
                var c = Get(u.Id); if (c != null && c.Routing) continue;
                best = MathF.Min(best, Float2.Distance(u.Position, regiment.Anchor));
            }
            return best <= 5.2f ? 1f : best <= 8.6f ? .5f : 0f;
        }

        public void Step(float dt)
        {
            SyncUnits();
            _volleyClock = (_volleyClock + dt) % 3.1f;
            BuildSpatialGrid();

            for (var i = 0; i < _world.Movement.Units.Count; i++)
            {
                var unit = _world.Movement.Units[i];
                if (!unit.Alive) continue;
                var state = _combat[unit.Id];
                state.ReloadRemaining -= dt;
                state.RecentHit = MathF.Max(0f, state.RecentHit - dt);
                state.ChargeTimer = MathF.Max(0f, state.ChargeTimer - dt);

                if (state.Routing)
                {
                    state.RoutingTimer += dt;
                    if (state.RoutingTimer > 12f || MathF.Abs(unit.Position.X) > 41.5f) Kill(unit, state, false);
                    continue;
                }

                var nearby = FindNearestEnemyUnit(unit, 3.6f);
                var reg = _world.Movement.FindRegiment(unit.RegimentId);
                var support = reg == null ? 0f : CommandBonus(reg) * .75f + HasLivingKind(reg, UnitKind.Drummer) * .45f;
                state.Morale = MathF.Min(100f, state.Morale + (nearby != null ? .2f : 1.2f + support) * dt);
                if (state.Morale < 22f) { RouteUnit(unit, state); continue; }

                var profile = CombatProfile.For(unit.Kind);
                var range = profile.Range;
                if (unit.Kind == UnitKind.Artillery && state.ArtilleryMode == ArtilleryMode.GrapeShot) range = 2.90f;
                if (unit.Kind == UnitKind.Infantry && state.AttackMode == AttackMode.Bayonet) range = .32f;
                var enemy = FindNearestEnemyUnit(unit, range);
                if (enemy == null || state.ReloadRemaining > 0f) continue;

                var volleyUnit = unit.Kind == UnitKind.Infantry || unit.Kind == UnitKind.Officer;
                if (!volleyUnit || _volleyClock < .18f || state.AttackMode == AttackMode.Bayonet) Fire(unit, state, enemy);
            }

            UpdateProjectiles(dt);
            UpdateParticlesOnly(dt);
            UpdateRegimentMorale();
        }

        public void UpdateParticlesOnly(float dt)
        {
            for (var i = Particles.Count - 1; i >= 0; i--)
            {
                var p = Particles[i];
                p.Life -= dt;
                if (p.Life <= 0f) { Particles.RemoveAt(i); continue; }
                p.Position += p.Velocity * dt;
                p.Velocity *= .97f;
            }
        }

        public bool BayonetCommand(IEnumerable<int> regimentIds)
        {
            var list = new List<int>();
            Float2 centre = Float2.Zero; var n = 0;
            foreach (var id in regimentIds)
            {
                var reg = _world.Movement.FindRegiment(id);
                if (reg == null || reg.Side != ArmySide.France) continue;
                list.Add(id); centre += reg.Anchor; n++;
                for (var i = 0; i < reg.UnitIndices.Count; i++)
                {
                    var u = _world.Movement.Units[reg.UnitIndices[i]];
                    if (!u.Alive || (u.Kind != UnitKind.Infantry && u.Kind != UnitKind.Officer)) continue;
                    var c = Get(u.Id); c.AttackMode = AttackMode.Bayonet; c.ChargeTimer = 6f; c.Morale = MathF.Min(100f, c.Morale + 8f);
                }
            }
            if (n == 0) return false;
            centre /= n;
            var target = FindNearestEnemyRegimentAnchor(ArmySide.France, centre);
            if (target.HasValue) RegimentCommandService.MoveRegiments(_world.Movement, list, target.Value, 4.8f, _world.Planner);
            _world.Status = "Bajonetten vooruit!";
            return true;
        }

        public bool CavalryCharge(IEnumerable<int> regimentIds)
        {
            var changed = false;
            foreach (var id in regimentIds)
            {
                var reg = _world.Movement.FindRegiment(id); if (reg == null || reg.Side != ArmySide.France) continue;
                for (var i = 0; i < reg.UnitIndices.Count; i++)
                {
                    var u = _world.Movement.Units[reg.UnitIndices[i]]; if (!u.Alive || u.Kind != UnitKind.Cavalry) continue;
                    var c = Get(u.Id); c.ChargeTimer = 7f; c.Morale = MathF.Min(100f, c.Morale + 10f); changed = true;
                }
            }
            if (changed) _world.Status = "Cavaleriecharge!";
            return changed;
        }

        public bool ToggleArtillery(IEnumerable<int> regimentIds)
        {
            var changed = false; ArtilleryMode next = ArtilleryMode.RoundShot; var decided = false;
            foreach (var id in regimentIds)
            {
                var reg = _world.Movement.FindRegiment(id); if (reg == null || reg.Side != ArmySide.France) continue;
                for (var i = 0; i < reg.UnitIndices.Count; i++)
                {
                    var u = _world.Movement.Units[reg.UnitIndices[i]]; if (!u.Alive || u.Kind != UnitKind.Artillery) continue;
                    var c = Get(u.Id);
                    if (!decided) { next = c.ArtilleryMode == ArtilleryMode.RoundShot ? ArtilleryMode.GrapeShot : ArtilleryMode.RoundShot; decided = true; }
                    c.ArtilleryMode = next; changed = true;
                }
            }
            if (changed) _world.Status = next == ArtilleryMode.GrapeShot ? "Grapeshot geladen" : "Ronde kogel geladen";
            return changed;
        }

        private void Fire(UnitState shooter, CombatUnitState state, UnitState enemy)
        {
            var profile = CombatProfile.For(shooter.Kind);
            state.ReloadRemaining = profile.Reload * (.9f + (float)_random.NextDouble() * .25f);
            state.ShotsFired++; TotalShotsFired++;

            if (shooter.Kind == UnitKind.Cavalry || shooter.Kind == UnitKind.Drummer || state.AttackMode == AttackMode.Bayonet)
            {
                var charge = shooter.Kind == UnitKind.Cavalry && state.ChargeTimer > 0f ? 2f : 1f;
                ApplyDamage(enemy, profile.Damage * charge * RandomRange(.85f, 1.15f), state.ChargeTimer > 0f ? 24f : 7f, shooter.Id);
                SpawnImpact(enemy.Position, 3); return;
            }

            if (shooter.Kind == UnitKind.Artillery && state.ArtilleryMode == ArtilleryMode.GrapeShot)
            {
                var forward = Float2.FromAngle(shooter.FacingRadians);
                for (var i = 0; i < _world.Movement.Units.Count; i++)
                {
                    var other = _world.Movement.Units[i]; if (!other.Alive || other.Side == shooter.Side) continue;
                    var delta = other.Position - shooter.Position; var distance = delta.Length; if (distance > 2.90f || distance < .001f) continue;
                    var norm = delta / distance; var dot = forward.X * norm.X + forward.Y * norm.Y;
                    if (dot > MathF.Cos(.28f)) ApplyDamage(other, 24f * MathF.Max(.15f, 1f - distance / 3.8f), 18f, shooter.Id);
                }
                SpawnSmoke(shooter.Position + forward * .24f, 14); return;
            }

            Projectiles.Add(new ProjectileState
            {
                Id = _nextProjectileId++, Side = shooter.Side, Position = shooter.Position,
                TargetUnitId = enemy.Id, Damage = profile.Damage, Speed = profile.ProjectileSpeed,
                Artillery = shooter.Kind == UnitKind.Artillery
            });
            SpawnSmoke(shooter.Position + Float2.FromAngle(shooter.FacingRadians) * .18f, shooter.Kind == UnitKind.Artillery ? 10 : 4);
        }

        private void UpdateProjectiles(float dt)
        {
            for (var i = Projectiles.Count - 1; i >= 0; i--)
            {
                var p = Projectiles[i];
                if (p.Dead) { Projectiles.RemoveAt(i); continue; }
                if (!_unitsById.TryGetValue(p.TargetUnitId, out var target) || !target.Alive) { Projectiles.RemoveAt(i); continue; }
                var delta = target.Position - p.Position; var distance = delta.Length; var hit = p.Artillery ? .24f : .12f;
                if (distance <= hit)
                {
                    if (p.Artillery)
                    {
                        SpawnImpact(target.Position, 16); SpawnSmoke(target.Position, 12);
                        for (var u = 0; u < _world.Movement.Units.Count; u++)
                        {
                            var other = _world.Movement.Units[u]; if (!other.Alive || other.Side == p.Side) continue;
                            var d = Float2.Distance(other.Position, target.Position);
                            if (d < .84f) ApplyDamage(other, p.Damage * MathF.Max(.22f, 1f - d / 1f), 24f, 0);
                        }
                    }
                    else { ApplyDamage(target, p.Damage * RandomRange(.75f, 1.25f), 10f, 0); SpawnImpact(target.Position, 3); }
                    Projectiles.RemoveAt(i); continue;
                }
                var step = MathF.Min(distance, p.Speed * dt);
                p.Position += delta / MathF.Max(.0001f, distance) * step;
            }
        }

        public void DamageBuilding(BuildingState building, float damage)
        {
            if (building == null || building.Destroyed) return;
            building.HitPoints -= damage;
            if (building.HitPoints <= 0f) { building.HitPoints = 0f; building.Destroyed = true; }
        }

        private void ApplyDamage(UnitState victim, float damage, float shock, int attackerId)
        {
            if (!victim.Alive) return;
            var state = Get(victim.Id); if (state == null) return;
            state.HitPoints -= damage;
            state.Morale = MathF.Max(0f, state.Morale - shock - damage * .08f);
            state.RecentHit = 2f;
            var reg = _world.Movement.FindRegiment(victim.RegimentId);
            if (reg != null)
            {
                for (var i = 0; i < reg.UnitIndices.Count; i++)
                {
                    var other = _world.Movement.Units[reg.UnitIndices[i]]; if (!other.Alive || other.Id == victim.Id) continue;
                    if (Float2.Distance(other.Position, victim.Position) < 1.6f) Get(other.Id).Morale = MathF.Max(0f, Get(other.Id).Morale - shock * .16f);
                }
            }
            if (state.HitPoints <= 0f)
            {
                if (attackerId != 0 && _combat.TryGetValue(attackerId, out var attacker)) attacker.Kills++;
                Kill(victim, state, true);
            }
        }

        private void Kill(UnitState unit, CombatUnitState state, bool moraleShock)
        {
            if (!unit.Alive) return;
            unit.Alive = false; state.HitPoints = 0f; state.Morale = 0f; TotalDeaths++;
            if (!moraleShock) return;
            var reg = _world.Movement.FindRegiment(unit.RegimentId); if (reg == null) return;
            for (var i = 0; i < reg.UnitIndices.Count; i++)
            {
                var other = _world.Movement.Units[reg.UnitIndices[i]]; if (!other.Alive) continue;
                Get(other.Id).Morale = MathF.Max(0f, Get(other.Id).Morale - 5f);
            }
        }

        private void RouteUnit(UnitState unit, CombatUnitState state)
        {
            if (state.Routing) return;
            state.Routing = true; state.AttackMode = AttackMode.Fire; state.ChargeTimer = 0f;
            var reg = _world.Movement.FindRegiment(unit.RegimentId);
            if (reg != null)
            {
                var x = unit.Side == ArmySide.France ? -42f : 42f;
                _world.Movement.SetDestination(reg, new Float2(x, reg.Anchor.Y));
            }
        }

        private void UpdateRegimentMorale()
        {
            for (var r = 0; r < _world.Movement.Regiments.Count; r++)
            {
                var reg = _world.Movement.Regiments[r]; RegisterRegiment(reg);
                var sum = 0f; var living = 0; var routed = 0;
                for (var i = 0; i < reg.UnitIndices.Count; i++)
                {
                    var u = _world.Movement.Units[reg.UnitIndices[i]]; if (!u.Alive) continue;
                    var c = Get(u.Id); sum += c.Morale; living++; if (c.Routing) routed++;
                }
                var state = _regiments[reg.Id];
                state.Morale = living == 0 ? 0f : sum / living;
                state.CommandBonus = CommandBonus(reg);
                state.Discipline = state.Morale > 75f ? DisciplineState.Steady : state.Morale > 50f ? DisciplineState.Shaken : state.Morale > 25f ? DisciplineState.Wavering : DisciplineState.Routing;
                if (routed > 0)
                {
                    var loss = routed * .025f;
                    for (var i = 0; i < reg.UnitIndices.Count; i++)
                    {
                        var u = _world.Movement.Units[reg.UnitIndices[i]]; if (u.Alive) Get(u.Id).Morale = MathF.Max(0f, Get(u.Id).Morale - loss);
                    }
                }
            }
        }

        private void BuildSpatialGrid()
        {
            _grid.Clear();
            for (var i = 0; i < _world.Movement.Units.Count; i++)
            {
                var u = _world.Movement.Units[i]; if (!u.Alive) continue;
                var key = GridKey(u.Position);
                if (!_grid.TryGetValue(key, out var bucket)) { bucket = new List<int>(); _grid[key] = bucket; }
                bucket.Add(i);
            }
        }

        private UnitState FindNearestEnemyUnit(UnitState source, float maxRange)
        {
            var cx = (int)MathF.Floor(source.Position.X / GridCell); var cy = (int)MathF.Floor(source.Position.Y / GridCell);
            var radius = Math.Max(1, (int)MathF.Ceiling(maxRange / GridCell));
            UnitState best = null; var bestD2 = maxRange * maxRange;
            for (var y = cy - radius; y <= cy + radius; y++)
            for (var x = cx - radius; x <= cx + radius; x++)
            {
                if (!_grid.TryGetValue(GridKey(x, y), out var bucket)) continue;
                for (var b = 0; b < bucket.Count; b++)
                {
                    var other = _world.Movement.Units[bucket[b]]; if (!other.Alive || other.Side == source.Side) continue;
                    var state = Get(other.Id); if (state != null && state.Routing) continue;
                    var d2 = (other.Position - source.Position).LengthSquared;
                    if (d2 < bestD2) { bestD2 = d2; best = other; }
                }
            }
            return best;
        }

        public Float2? FindNearestEnemyRegimentAnchor(ArmySide sourceSide, Float2 from)
        {
            var enemy = sourceSide == ArmySide.France ? ArmySide.Britain : ArmySide.France;
            Float2? best = null; var bestDistance = float.PositiveInfinity;
            for (var i = 0; i < _world.Movement.Regiments.Count; i++)
            {
                var reg = _world.Movement.Regiments[i]; if (reg.Side != enemy || LivingMembers(reg) == 0) continue;
                var d = Float2.Distance(from, reg.Anchor); if (d < bestDistance) { bestDistance = d; best = reg.Anchor; }
            }
            return best;
        }

        public float SideStrength(ArmySide side)
        {
            var sum = 0f;
            for (var i = 0; i < _world.Movement.Units.Count; i++)
            {
                var u = _world.Movement.Units[i]; if (!u.Alive || u.Side != side) continue;
                var c = Get(u.Id); if (c == null || c.Routing) continue;
                var weight = u.Kind == UnitKind.Artillery ? 3f : u.Kind == UnitKind.Cavalry ? 1.8f : u.Kind == UnitKind.Officer ? 1.35f : 1f;
                sum += weight * Math.Clamp(c.HitPoints / MathF.Max(1f, c.MaxHitPoints), 0f, 1f) * Math.Clamp(c.Morale / 100f, 0f, 1f);
            }
            return sum;
        }

        public float MeanMorale(ArmySide side)
        {
            var sum = 0f; var n = 0;
            foreach (var pair in _combat)
            {
                if (!_unitsById.TryGetValue(pair.Key, out var u) || !u.Alive || u.Side != side) continue;
                sum += pair.Value.Morale; n++;
            }
            return n == 0 ? 100f : sum / n;
        }

        public int LivingMembers(RegimentState reg)
        {
            var n = 0; for (var i = 0; i < reg.UnitIndices.Count; i++) if (_world.Movement.Units[reg.UnitIndices[i]].Alive) n++; return n;
        }

        private float HasLivingKind(RegimentState reg, UnitKind kind)
        {
            for (var i = 0; i < reg.UnitIndices.Count; i++)
            {
                var u = _world.Movement.Units[reg.UnitIndices[i]]; if (u.Alive && u.Kind == kind && !Get(u.Id).Routing) return 1f;
            }
            return 0f;
        }

        private long GridKey(Float2 p) => GridKey((int)MathF.Floor(p.X / GridCell), (int)MathF.Floor(p.Y / GridCell));
        private static long GridKey(int x, int y) => ((long)x << 32) ^ (uint)y;
        private float RandomRange(float a, float b) => a + (float)_random.NextDouble() * (b - a);

        private void SpawnSmoke(Float2 position, int count)
        {
            for (var i = 0; i < count; i++) Particles.Add(new ParticleState
            {
                Position = position, Velocity = new Float2(RandomRange(-.24f, .24f), RandomRange(.08f, .28f)),
                Life = RandomRange(.7f, 1.5f), MaxLife = 1.5f, Size = RandomRange(.08f, .24f), Impact = false
            });
        }
        private void SpawnImpact(Float2 position, int count)
        {
            for (var i = 0; i < count; i++) Particles.Add(new ParticleState
            {
                Position = position, Velocity = new Float2(RandomRange(-.9f, .9f), RandomRange(-.9f, .9f)),
                Life = RandomRange(.25f, .6f), MaxLife = .6f, Size = RandomRange(.04f, .10f), Impact = true
            });
        }
    }
}
