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
        private readonly Dictionary<int, UnitState> _unitsById = new Dictionary<int, UnitState>();
        private readonly Dictionary<long, List<int>> _grid = new Dictionary<long, List<int>>();
        private const float GridCell = 2.6f;
        private int _nextProjectileId = 1;
        private float _volleyClock;

        public NativeCombatSystem(BrowserParityWorld world, Random random)
        {
            _world = world ?? throw new ArgumentNullException(nameof(world));
            _random = random ?? throw new ArgumentNullException(nameof(random));
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
            if (regiment != null && !_regiments.ContainsKey(regiment.Id))
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
                var combat = Get(u.Id);
                if (combat != null && combat.Routing) continue;
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
                var regiment = _world.Movement.FindRegiment(unit.RegimentId);
                var support = regiment == null ? 0f : CommandBonus(regiment) * .75f + HasLivingKind(regiment, UnitKind.Drummer) * .45f;
                state.Morale = MathF.Min(100f, state.Morale + (nearby != null ? .2f : 1.2f + support) * dt);
                if (state.Morale < 22f) { RouteUnit(unit, state); continue; }

                var profile = CombatProfile.For(unit.Kind);
                var range = profile.Range;
                if (unit.Kind == UnitKind.Artillery && state.ArtilleryMode == ArtilleryMode.GrapeShot) range = 2.90f;
                if (unit.Kind == UnitKind.Infantry && state.AttackMode == AttackMode.Bayonet) range = .32f;
                var enemy = FindNearestEnemyUnit(unit, range);
                if (enemy == null || state.ReloadRemaining > 0f) continue;

                var volleyUnit = unit.Kind == UnitKind.Infantry || unit.Kind == UnitKind.Officer;
                if (!volleyUnit || _volleyClock < .18f || state.AttackMode == AttackMode.Bayonet)
                    Fire(unit, state, enemy);
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
            var selected = new List<int>();
            var centre = Float2.Zero;
            var count = 0;
            foreach (var id in regimentIds)
            {
                var reg = _world.Movement.FindRegiment(id);
                if (reg == null || reg.Side != ArmySide.France) continue;
                selected.Add(id); centre += reg.Anchor; count++;
                for (var i = 0; i < reg.UnitIndices.Count; i++)
                {
                    var u = _world.Movement.Units[reg.UnitIndices[i]];
                    if (!u.Alive || (u.Kind != UnitKind.Infantry && u.Kind != UnitKind.Officer)) continue;
                    var state = Get(u.Id);
                    state.AttackMode = AttackMode.Bayonet;
                    state.ChargeTimer = 6f;
                    state.Morale = MathF.Min(100f, state.Morale + 8f);
                }
            }
            if (count == 0) return false;
            centre /= count;
            var target = FindNearestEnemyRegimentAnchor(ArmySide.France, centre);
            if (target.HasValue) RegimentCommandService.MoveRegiments(_world.Movement, selected, target.Value, 4.8f, _world.Planner);
            _world.Status = "Bajonetten vooruit!";
            return true;
        }

        public bool CavalryCharge(IEnumerable<int> regimentIds)
        {
            var changed = false;
            foreach (var id in regimentIds)
            {
                var reg = _world.Movement.FindRegiment(id);
                if (reg == null || reg.Side != ArmySide.France) continue;
                for (var i = 0; i < reg.UnitIndices.Count; i++)
                {
                    var u = _world.Movement.Units[reg.UnitIndices[i]];
                    if (!u.Alive || u.Kind != UnitKind.Cavalry) continue;
                    var state = Get(u.Id);
                    state.ChargeTimer = 7f;
                    state.Morale = MathF.Min(100f, state.Morale + 10f);
                    changed = true;
                }
            }
            if (changed) _world.Status = "Cavaleriecharge!";
            return changed;
        }

        public bool ToggleArtillery(IEnumerable<int> regimentIds)
        {
            var changed = false;
            var decided = false;
            var next = ArtilleryMode.RoundShot;
            foreach (var id in regimentIds)
            {
                var reg = _world.Movement.FindRegiment(id);
                if (reg == null || reg.Side != ArmySide.France) continue;
                for (var i = 0; i < reg.UnitIndices.Count; i++)
                {
                    var u = _world.Movement.Units[reg.UnitIndices[i]];
                    if (!u.Alive || u.Kind != UnitKind.Artillery) continue;
                    var state = Get(u.Id);
                    if (!decided)
                    {
                        next = state.ArtilleryMode == ArtilleryMode.RoundShot ? ArtilleryMode.GrapeShot : ArtilleryMode.RoundShot;
                        decided = true;
                    }
                    state.ArtilleryMode = next;
                    changed = true;
                }
            }
            if (changed) _world.Status = next == ArtilleryMode.GrapeShot ? "Grapeshot geladen" : "Ronde kogel geladen";
            return changed;
        }

        private void Fire(UnitState shooter, CombatUnitState state, UnitState enemy)
        {
            var profile = CombatProfile.For(shooter.Kind);
            state.ReloadRemaining = profile.Reload * (.9f + (float)_random.NextDouble() * .25f);
            state.ShotsFired++;
            TotalShotsFired++;

            if (shooter.Kind == UnitKind.Cavalry || shooter.Kind == UnitKind.Drummer || state.AttackMode == AttackMode.Bayonet)
            {
                var charge = shooter.Kind == UnitKind.Cavalry && state.ChargeTimer > 0f ? 2f : 1f;
                ApplyDamage(enemy, profile.Damage * charge * RandomRange(.85f, 1.15f), state.ChargeTimer > 0f ? 24f : 7f, shooter.Id);
                SpawnImpact(enemy.Position, 3);
                return;
            }

            if (shooter.Kind == UnitKind.Artillery && state.ArtilleryMode == ArtilleryMode.GrapeShot)
            {
                var forward = Float2.FromAngle(shooter.FacingRadians);
                for (var i = 0; i < _world.Movement.Units.Count; i++)
                {
                    var other = _world.Movement.Units[i];
                    if (!other.Alive || other.Side == shooter.Side) continue;
                    var delta = other.Position - shooter.Position;
                    var distance = delta.Length;
                    if (distance > 2.90f || distance < .001f) continue;
                    var direction = delta / distance;
                    var dot = forward.X * direction.X + forward.Y * direction.Y;
                    if (dot > MathF.Cos(.28f))
                        ApplyDamage(other, 24f * MathF.Max(.15f, 1f - distance / 3.8f), 18f, shooter.Id);
                }
                SpawnSmoke(shooter.Position + forward * .24f, 14);
                return;
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
                var projectile = Projectiles[i];
                if (projectile.Dead) { Projectiles.RemoveAt(i); continue; }
                if (!_unitsById.TryGetValue(projectile.TargetUnitId, out var target) || !target.Alive)
                {
                    Projectiles.RemoveAt(i);
                    continue;
                }

                var delta = target.Position - projectile.Position;
                var distance = delta.Length;
                var hitRadius = projectile.Artillery ? .24f : .12f;
                var travelThisTick = projectile.Speed * dt;

                // Continuous collision: a fast projectile that reaches or passes the target
                // during this fixed step resolves its impact immediately instead of requiring
                // the target to remain inside a tiny hit circle on the following tick.
                if (distance <= hitRadius + travelThisTick)
                {
                    ResolveProjectileImpact(projectile, target);
                    Projectiles.RemoveAt(i);
                    continue;
                }

                if (distance > .0001f)
                    projectile.Position += delta / distance * travelThisTick;
            }
        }

        private void ResolveProjectileImpact(ProjectileState projectile, UnitState target)
        {
            if (projectile.Artillery)
            {
                SpawnImpact(target.Position, 16);
                SpawnSmoke(target.Position, 12);
                for (var i = 0; i < _world.Movement.Units.Count; i++)
                {
                    var other = _world.Movement.Units[i];
                    if (!other.Alive || other.Side == projectile.Side) continue;
                    var distance = Float2.Distance(other.Position, target.Position);
                    if (distance < .84f)
                        ApplyDamage(other, projectile.Damage * MathF.Max(.22f, 1f - distance / 1f), 24f, 0);
                }
            }
            else
            {
                ApplyDamage(target, projectile.Damage * RandomRange(.75f, 1.25f), 10f, 0);
                SpawnImpact(target.Position, 3);
            }
        }

        public void DamageBuilding(BuildingState building, float damage)
        {
            if (building == null || building.Destroyed) return;
            building.HitPoints -= damage;
            if (building.HitPoints <= 0f)
            {
                building.HitPoints = 0f;
                building.Destroyed = true;
            }
        }

        private void ApplyDamage(UnitState victim, float damage, float shock, int attackerId)
        {
            if (!victim.Alive) return;
            var state = Get(victim.Id);
            if (state == null) return;
            state.HitPoints -= damage;
            state.Morale = MathF.Max(0f, state.Morale - shock - damage * .08f);
            state.RecentHit = 2f;

            var regiment = _world.Movement.FindRegiment(victim.RegimentId);
            if (regiment != null)
            {
                for (var i = 0; i < regiment.UnitIndices.Count; i++)
                {
                    var other = _world.Movement.Units[regiment.UnitIndices[i]];
                    if (!other.Alive || other.Id == victim.Id || Float2.Distance(other.Position, victim.Position) >= 1.6f) continue;
                    var otherState = Get(other.Id);
                    otherState.Morale = MathF.Max(0f, otherState.Morale - shock * .16f);
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
            unit.Alive = false;
            state.HitPoints = 0f;
            state.Morale = 0f;
            TotalDeaths++;
            if (!moraleShock) return;

            var regiment = _world.Movement.FindRegiment(unit.RegimentId);
            if (regiment == null) return;
            for (var i = 0; i < regiment.UnitIndices.Count; i++)
            {
                var other = _world.Movement.Units[regiment.UnitIndices[i]];
                if (!other.Alive) continue;
                var otherState = Get(other.Id);
                otherState.Morale = MathF.Max(0f, otherState.Morale - 5f);
            }
        }

        private void RouteUnit(UnitState unit, CombatUnitState state)
        {
            if (state.Routing) return;
            state.Routing = true;
            state.AttackMode = AttackMode.Fire;
            state.ChargeTimer = 0f;
            var regiment = _world.Movement.FindRegiment(unit.RegimentId);
            if (regiment != null)
                _world.Movement.SetDestination(regiment, new Float2(unit.Side == ArmySide.France ? -42f : 42f, regiment.Anchor.Y));
        }

        private void UpdateRegimentMorale()
        {
            for (var r = 0; r < _world.Movement.Regiments.Count; r++)
            {
                var regiment = _world.Movement.Regiments[r];
                RegisterRegiment(regiment);
                var sum = 0f;
                var living = 0;
                var routed = 0;
                for (var i = 0; i < regiment.UnitIndices.Count; i++)
                {
                    var unit = _world.Movement.Units[regiment.UnitIndices[i]];
                    if (!unit.Alive) continue;
                    var combat = Get(unit.Id);
                    sum += combat.Morale;
                    living++;
                    if (combat.Routing) routed++;
                }

                var state = _regiments[regiment.Id];
                state.Morale = living == 0 ? 0f : sum / living;
                state.CommandBonus = CommandBonus(regiment);
                state.Discipline = state.Morale > 75f ? DisciplineState.Steady :
                    state.Morale > 50f ? DisciplineState.Shaken :
                    state.Morale > 25f ? DisciplineState.Wavering : DisciplineState.Routing;

                if (routed <= 0) continue;
                var loss = routed * .025f;
                for (var i = 0; i < regiment.UnitIndices.Count; i++)
                {
                    var unit = _world.Movement.Units[regiment.UnitIndices[i]];
                    if (!unit.Alive) continue;
                    var combat = Get(unit.Id);
                    combat.Morale = MathF.Max(0f, combat.Morale - loss);
                }
            }
        }

        private void BuildSpatialGrid()
        {
            _grid.Clear();
            for (var i = 0; i < _world.Movement.Units.Count; i++)
            {
                var unit = _world.Movement.Units[i];
                if (!unit.Alive) continue;
                var key = GridKey(unit.Position);
                if (!_grid.TryGetValue(key, out var bucket))
                {
                    bucket = new List<int>();
                    _grid[key] = bucket;
                }
                bucket.Add(i);
            }
        }

        private UnitState FindNearestEnemyUnit(UnitState source, float maxRange)
        {
            var cx = (int)MathF.Floor(source.Position.X / GridCell);
            var cy = (int)MathF.Floor(source.Position.Y / GridCell);
            var radius = Math.Max(1, (int)MathF.Ceiling(maxRange / GridCell));
            UnitState best = null;
            var bestDistanceSquared = maxRange * maxRange;

            for (var y = cy - radius; y <= cy + radius; y++)
            for (var x = cx - radius; x <= cx + radius; x++)
            {
                if (!_grid.TryGetValue(GridKey(x, y), out var bucket)) continue;
                for (var b = 0; b < bucket.Count; b++)
                {
                    var other = _world.Movement.Units[bucket[b]];
                    if (!other.Alive || other.Side == source.Side) continue;
                    var combat = Get(other.Id);
                    if (combat != null && combat.Routing) continue;
                    var distanceSquared = (other.Position - source.Position).LengthSquared;
                    if (distanceSquared < bestDistanceSquared)
                    {
                        bestDistanceSquared = distanceSquared;
                        best = other;
                    }
                }
            }
            return best;
        }

        public Float2? FindNearestEnemyRegimentAnchor(ArmySide sourceSide, Float2 from)
        {
            var enemySide = sourceSide == ArmySide.France ? ArmySide.Britain : ArmySide.France;
            Float2? best = null;
            var bestDistance = float.PositiveInfinity;
            for (var i = 0; i < _world.Movement.Regiments.Count; i++)
            {
                var regiment = _world.Movement.Regiments[i];
                if (regiment.Side != enemySide || LivingMembers(regiment) == 0) continue;
                var distance = Float2.Distance(from, regiment.Anchor);
                if (distance < bestDistance) { bestDistance = distance; best = regiment.Anchor; }
            }
            return best;
        }

        public float SideStrength(ArmySide side)
        {
            var total = 0f;
            for (var i = 0; i < _world.Movement.Units.Count; i++)
            {
                var unit = _world.Movement.Units[i];
                if (!unit.Alive || unit.Side != side) continue;
                var combat = Get(unit.Id);
                if (combat == null || combat.Routing) continue;
                var weight = unit.Kind == UnitKind.Artillery ? 3f : unit.Kind == UnitKind.Cavalry ? 1.8f : unit.Kind == UnitKind.Officer ? 1.35f : 1f;
                total += weight * Math.Clamp(combat.HitPoints / MathF.Max(1f, combat.MaxHitPoints), 0f, 1f) * Math.Clamp(combat.Morale / 100f, 0f, 1f);
            }
            return total;
        }

        public float MeanMorale(ArmySide side)
        {
            var sum = 0f;
            var count = 0;
            foreach (var pair in _combat)
            {
                if (!_unitsById.TryGetValue(pair.Key, out var unit) || !unit.Alive || unit.Side != side) continue;
                sum += pair.Value.Morale;
                count++;
            }
            return count == 0 ? 100f : sum / count;
        }

        public int LivingMembers(RegimentState regiment)
        {
            var count = 0;
            for (var i = 0; i < regiment.UnitIndices.Count; i++)
                if (_world.Movement.Units[regiment.UnitIndices[i]].Alive) count++;
            return count;
        }

        private float HasLivingKind(RegimentState regiment, UnitKind kind)
        {
            for (var i = 0; i < regiment.UnitIndices.Count; i++)
            {
                var unit = _world.Movement.Units[regiment.UnitIndices[i]];
                if (unit.Alive && unit.Kind == kind && !Get(unit.Id).Routing) return 1f;
            }
            return 0f;
        }

        private long GridKey(Float2 position) => GridKey((int)MathF.Floor(position.X / GridCell), (int)MathF.Floor(position.Y / GridCell));
        private static long GridKey(int x, int y) => ((long)x << 32) ^ (uint)y;
        private float RandomRange(float min, float max) => min + (float)_random.NextDouble() * (max - min);

        private void SpawnSmoke(Float2 position, int count)
        {
            for (var i = 0; i < count; i++)
                Particles.Add(new ParticleState
                {
                    Position = position,
                    Velocity = new Float2(RandomRange(-.24f, .24f), RandomRange(.08f, .28f)),
                    Life = RandomRange(.7f, 1.5f), MaxLife = 1.5f,
                    Size = RandomRange(.08f, .24f), Impact = false
                });
        }

        private void SpawnImpact(Float2 position, int count)
        {
            for (var i = 0; i < count; i++)
                Particles.Add(new ParticleState
                {
                    Position = position,
                    Velocity = new Float2(RandomRange(-.9f, .9f), RandomRange(-.9f, .9f)),
                    Life = RandomRange(.25f, .6f), MaxLife = .6f,
                    Size = RandomRange(.04f, .10f), Impact = true
                });
        }
    }
}
