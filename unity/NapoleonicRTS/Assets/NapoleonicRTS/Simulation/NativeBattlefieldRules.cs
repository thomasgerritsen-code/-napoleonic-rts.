using System;
using System.Collections.Generic;

namespace NapoleonicRTS.Simulation
{
    public sealed class NativeBattlefieldRules
    {
        private readonly BrowserParityWorld _world;
        private readonly Dictionary<int, float> _baseSpeeds = new Dictionary<int, float>();
        private readonly Dictionary<int, SightingState> _frenchSightings = new Dictionary<int, SightingState>();
        private float _disciplineClock;

        private readonly struct RectArea
        {
            public readonly float X, Y, W, H;
            public RectArea(float x, float y, float w, float h) { X = x; Y = y; W = w; H = h; }
            public bool Contains(Float2 p) => p.X >= X && p.Y >= Y && p.X <= X + W && p.Y <= Y + H;
        }
        private readonly struct EllipseArea
        {
            public readonly float X, Y, Rx, Ry;
            public EllipseArea(float x, float y, float rx, float ry) { X = x; Y = y; Rx = rx; Ry = ry; }
            public bool Contains(Float2 p)
            {
                var dx = (p.X - X) / Rx; var dy = (p.Y - Y) / Ry;
                return dx * dx + dy * dy <= 1f;
            }
        }

        private static readonly RectArea[] Woods =
        {
            RectFromBrowser(250,390,720,430), RectFromBrowser(1320,250,540,430),
            RectFromBrowser(2350,360,720,440), RectFromBrowser(2350,1190,760,430),
            RectFromBrowser(3150,1480,500,420)
        };
        private static readonly EllipseArea[] Hills =
        {
            EllipseFromBrowser(1540,1160,340,230), EllipseFromBrowser(2150,520,300,200), EllipseFromBrowser(3260,980,260,190)
        };

        public NativeBattlefieldRules(BrowserParityWorld world) => _world = world;

        public WeatherKind Weather { get; private set; } = WeatherKind.Clear;
        public TimeOfDayKind TimeOfDay { get; private set; } = TimeOfDayKind.Morning;
        public Float2 Wind { get; private set; } = new Float2(.08f, -.02f);
        public float VisionFactor => Weather == WeatherKind.Mist ? .68f : Weather == WeatherKind.Rain ? .90f : 1f;
        public float MovementWeatherFactor => Weather == WeatherKind.Rain ? .90f : 1f;
        public List<BattlefieldScarState> Scars { get; } = new List<BattlefieldScarState>();

        public void Step(float dt, NativeCombatSystem combat)
        {
            UpdateWeather();
            UpdateStamina(dt, combat);
            UpdateSightings();
            _disciplineClock += dt;
            if (_disciplineClock >= 2f)
            {
                _disciplineClock -= 2f;
                UpdateRegimentDiscipline(combat);
            }
        }

        private void UpdateWeather()
        {
            var t = _world.Elapsed;
            TimeOfDay = t < 180f ? TimeOfDayKind.Morning : t < 420f ? TimeOfDayKind.Midday : TimeOfDayKind.Evening;
            Weather = t < 210f ? WeatherKind.Clear : t < 330f ? WeatherKind.Rain : t < 450f ? WeatherKind.Mist : WeatherKind.Clear;
        }

        private void UpdateStamina(float dt, NativeCombatSystem combat)
        {
            for (var i = 0; i < _world.Movement.Units.Count; i++)
            {
                var unit = _world.Movement.Units[i];
                if (!unit.Alive || unit.Kind == UnitKind.Worker) continue;
                var state = combat.Get(unit.Id);
                if (state == null) continue;
                var moved = Float2.Distance(unit.PreviousPosition, unit.Position) > .0015f;
                var drain = state.ChargeTimer > 0f ? 10f : moved ? (unit.Kind == UnitKind.Cavalry ? 4.5f : 2.8f) : -7.5f;
                state.Stamina = Math.Clamp(state.Stamina - drain * dt, 0f, 100f);
            }

            for (var i = 0; i < _world.Movement.Regiments.Count; i++)
            {
                var regiment = _world.Movement.Regiments[i];
                if (!_baseSpeeds.TryGetValue(regiment.Id, out var baseSpeed))
                {
                    baseSpeed = MathF.Max(.01f, regiment.Speed);
                    _baseSpeeds[regiment.Id] = baseSpeed;
                }
                var sum = 0f; var living = 0;
                for (var m = 0; m < regiment.UnitIndices.Count; m++)
                {
                    var unit = _world.Movement.Units[regiment.UnitIndices[m]];
                    if (!unit.Alive) continue;
                    var state = combat.Get(unit.Id); if (state == null) continue;
                    sum += state.Stamina; living++;
                }
                var average = living == 0 ? 100f : sum / living;
                var staminaFactor = .68f + .32f * average / 100f;
                regiment.Speed = baseSpeed * staminaFactor * MovementWeatherFactor * TerrainSpeedFactor(regiment.Anchor, PrimaryKind(regiment));
            }
        }

        private void UpdateRegimentDiscipline(NativeCombatSystem combat)
        {
            for (var i = 0; i < _world.Movement.Regiments.Count; i++)
            {
                var reg = _world.Movement.Regiments[i];
                var state = combat.GetRegiment(reg.Id); if (state == null) continue;
                var stamina = 0f; var living = 0; var recentHits = 0;
                for (var m = 0; m < reg.UnitIndices.Count; m++)
                {
                    var unit = _world.Movement.Units[reg.UnitIndices[m]]; if (!unit.Alive) continue;
                    var c = combat.Get(unit.Id); if (c == null) continue;
                    stamina += c.Stamina; living++; if (c.RecentHit > 0f) recentHits++;
                }
                var avg = living == 0 ? 0f : stamina / living;
                var hitRatio = living == 0 ? 0f : recentHits / (float)living;
                state.MeanStamina = avg;
                state.DisciplineFactor = Math.Clamp(.55f + avg / 220f - hitRatio * .25f, .35f, 1f);
            }
        }

        public TacticalTerrainKind TerrainAt(Float2 position)
        {
            for (var i = 0; i < Hills.Length; i++) if (Hills[i].Contains(position)) return TacticalTerrainKind.Hill;
            for (var i = 0; i < Woods.Length; i++) if (Woods[i].Contains(position)) return TacticalTerrainKind.Woods;
            for (var i = 0; i < _world.Map.Roads.Count; i++)
            {
                var road = _world.Map.Roads[i];
                for (var p = 1; p < road.Points.Length; p++)
                    if (NavigationGeometry.DistanceToSegment(position, road.Points[p - 1], road.Points[p]) <= road.Width * .5f) return TacticalTerrainKind.Road;
            }
            for (var i = 0; i < _world.Buildings.Count; i++)
            {
                var b = _world.Buildings[i]; if (b.Destroyed) continue;
                if (MathF.Abs(position.X - b.Position.X) <= b.Width && MathF.Abs(position.Y - b.Position.Y) <= b.Height) return TacticalTerrainKind.Village;
            }
            return TacticalTerrainKind.Open;
        }

        public float CoverFactor(Float2 position)
        {
            var terrain = TerrainAt(position);
            return terrain == TacticalTerrainKind.Woods ? .82f : terrain == TacticalTerrainKind.Village ? .88f : 1f;
        }

        public float TerrainSpeedFactor(Float2 position, UnitKind kind)
        {
            var terrain = TerrainAt(position);
            if (terrain == TacticalTerrainKind.Woods)
            {
                if (kind == UnitKind.Cavalry) return .66f;
                if (kind == UnitKind.Artillery) return .70f;
                return .88f;
            }
            if (terrain == TacticalTerrainKind.Hill) return kind == UnitKind.Artillery ? .80f : .90f;
            return 1f;
        }

        public bool HasLineOfSight(Float2 a, Float2 b)
        {
            var distance = Float2.Distance(a, b);
            var steps = Math.Max(2, (int)MathF.Ceiling(distance / .72f));
            var woods = 0;
            for (var i = 1; i < steps; i++)
            {
                var p = Float2.Lerp(a, b, i / (float)steps);
                if (TerrainAt(p) == TacticalTerrainKind.Woods && ++woods >= 2) return false;
            }
            return true;
        }

        public float VisionRange(UnitState unit)
        {
            var baseRange = unit.Kind == UnitKind.Cavalry ? 8.6f : unit.Kind == UnitKind.Officer ? 5.7f : 4.6f;
            if (TerrainAt(unit.Position) == TacticalTerrainKind.Woods) baseRange *= .72f;
            return baseRange * VisionFactor;
        }

        public bool CanSee(ArmySide side, UnitState target)
        {
            if (target == null || !target.Alive || target.Side == side) return true;
            for (var i = 0; i < _world.Movement.Units.Count; i++)
            {
                var source = _world.Movement.Units[i]; if (!source.Alive || source.Side != side) continue;
                if (Float2.Distance(source.Position, target.Position) <= VisionRange(source) && HasLineOfSight(source.Position, target.Position)) return true;
            }
            for (var i = 0; i < _world.Buildings.Count; i++)
            {
                var b = _world.Buildings[i]; if (b.Destroyed || !b.Complete || b.Side != side) continue;
                if (Float2.Distance(b.Position, target.Position) <= 5.0f && HasLineOfSight(b.Position, target.Position)) return true;
            }
            return false;
        }

        private void UpdateSightings()
        {
            for (var i = 0; i < _world.Movement.Units.Count; i++)
            {
                var target = _world.Movement.Units[i];
                if (!target.Alive || target.Side != ArmySide.Britain || !CanSee(ArmySide.France, target)) continue;
                _frenchSightings[target.Id] = new SightingState { Id = target.Id, Position = target.Position, SeenAt = _world.Elapsed, UnitKind = target.Kind, Building = false };
            }
            for (var i = 0; i < _world.Buildings.Count; i++)
            {
                var target = _world.Buildings[i]; if (target.Destroyed || target.Side != ArmySide.Britain) continue;
                var visible = false;
                for (var u = 0; u < _world.Movement.Units.Count && !visible; u++)
                {
                    var source = _world.Movement.Units[u]; if (!source.Alive || source.Side != ArmySide.France) continue;
                    visible = Float2.Distance(source.Position, target.Position) <= VisionRange(source) && HasLineOfSight(source.Position, target.Position);
                }
                if (visible) _frenchSightings[-target.Id] = new SightingState { Id = target.Id, Position = target.Position, SeenAt = _world.Elapsed, BuildingKind = target.Kind, Building = true };
            }
        }

        public List<SightingState> ScoutReport()
        {
            var result = new List<SightingState>(_frenchSightings.Count);
            foreach (var pair in _frenchSightings) result.Add(pair.Value);
            return result;
        }

        public void ApplyParticleWind(ParticleState particle, float dt)
        {
            if (particle == null || particle.Impact) return;
            particle.Velocity += Wind * (dt * .18f);
        }

        public void RecordDeath(UnitState unit)
        {
            if (unit == null) return;
            Scars.Add(new BattlefieldScarState { Position = unit.Position, Side = unit.Side, CreatedAt = _world.Elapsed });
            if (Scars.Count > 220) Scars.RemoveAt(0);
        }

        private UnitKind PrimaryKind(RegimentState regiment)
        {
            for (var i = 0; i < regiment.UnitIndices.Count; i++)
            {
                var unit = _world.Movement.Units[regiment.UnitIndices[i]];
                if (!unit.Alive || unit.Kind == UnitKind.Officer || unit.Kind == UnitKind.Drummer) continue;
                if (combatCrew(unit)) continue;
                return unit.Kind;
            }
            return UnitKind.Infantry;
        }
        private bool combatCrew(UnitState unit)
        {
            for (var r = 0; r < _world.Movement.Regiments.Count; r++)
            {
                var reg = _world.Movement.Regiments[r]; if (reg.Id != unit.RegimentId) continue;
                var hasArtillery = false;
                for (var i = 0; i < reg.UnitIndices.Count; i++) if (_world.Movement.Units[reg.UnitIndices[i]].Kind == UnitKind.Artillery) { hasArtillery = true; break; }
                return hasArtillery && unit.Kind == UnitKind.Infantry;
            }
            return false;
        }

        private static RectArea RectFromBrowser(float x, float y, float w, float h)
        {
            var a = BrowserBattlefieldMap.MapToNative(x, y);
            var b = BrowserBattlefieldMap.MapToNative(x + w, y + h);
            return new RectArea(MathF.Min(a.X, b.X), MathF.Min(a.Y, b.Y), MathF.Abs(b.X - a.X), MathF.Abs(b.Y - a.Y));
        }
        private static EllipseArea EllipseFromBrowser(float x, float y, float rx, float ry)
        {
            var c = BrowserBattlefieldMap.MapToNative(x, y);
            var ex = BrowserBattlefieldMap.MapToNative(x + rx, y);
            var ey = BrowserBattlefieldMap.MapToNative(x, y + ry);
            return new EllipseArea(c.X, c.Y, MathF.Abs(ex.X - c.X), MathF.Abs(ey.Y - c.Y));
        }
    }

    public static class ObjectiveScenarioService
    {
        public static string[] Presets => new[] { "crossroads", "bridge", "threePoints" };

        public static void Select(ObjectiveState state, string preset)
        {
            if (state == null) return;
            state.Points.Clear(); state.FranceScore = 0; state.BritainScore = 0;
            switch (preset)
            {
                case "bridge":
                    state.Scenario = "bridge"; state.Name = "Bruggenhoofd"; state.TargetScore = 150;
                    Add(state, "bridge", "Bruggenhoofd", 1600, 930); break;
                case "threePoints":
                    state.Scenario = "threePoints"; state.Name = "Drie posities"; state.TargetScore = 180;
                    Add(state, "north", "Noord", 1450, 560);
                    Add(state, "center", "Centrum", 1600, 900);
                    Add(state, "south", "Zuid", 1550, 1280); break;
                default:
                    state.Scenario = "crossroads"; state.Name = "Kruispunt"; state.TargetScore = 120;
                    Add(state, "center", "Centraal kruispunt", 1600, 900); break;
            }
        }

        private static void Add(ObjectiveState state, string id, string label, float x, float y) =>
            state.Points.Add(new ObjectivePointState { Id = id, Label = label, Position = BrowserBattlefieldMap.MapToNative(x, y) });
    }
}
