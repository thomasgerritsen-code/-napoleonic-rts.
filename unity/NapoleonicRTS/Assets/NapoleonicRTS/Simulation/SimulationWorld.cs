using System;
using System.Collections.Generic;

namespace NapoleonicRTS.Simulation
{
    public sealed class SimulationWorld
    {
        public const float FixedStepSeconds = 1f / 60f;
        private const float RegimentTurnRateRadians = 0.82f;
        private const float BridgeCompressionStart = 1.80f;
        private const float BridgeCompressionFull = 0.48f;
        private const float BridgeReleaseDistance = 1.80f;
        private readonly StrategicMap _map;
        private int _nextUnitId = 1;
        private int _nextRegimentId = 1;

        public SimulationWorld(StrategicMap map = null) => _map = map;

        public List<UnitState> Units { get; } = new List<UnitState>();
        public List<RegimentState> Regiments { get; } = new List<RegimentState>();
        public long Tick { get; private set; }

        public RegimentState SpawnRegiment(ArmySide side, Float2 anchor, int unitCount, FormationKind formation, float facingRadians)
        {
            var regiment = new RegimentState
            {
                Id = _nextRegimentId++, Side = side, Formation = formation,
                Anchor = anchor, PreviousAnchor = anchor, HomeAnchor = anchor, Destination = anchor,
                FacingRadians = facingRadians, Moving = false
            };
            for (var i = 0; i < unitCount; i++)
            {
                var slot = FormationLayout.Slot(formation, i, unitCount);
                var position = TransformSlot(anchor, facingRadians, slot);
                var unit = new UnitState
                {
                    Id = _nextUnitId++, RegimentId = regiment.Id, Side = side, Kind = UnitKind.Infantry,
                    Position = position, PreviousPosition = position, SlotOffset = slot, FacingRadians = facingRadians
                };
                regiment.UnitIndices.Add(Units.Count);
                Units.Add(unit);
            }
            Regiments.Add(regiment);
            return regiment;
        }

        public void SetDestination(RegimentState regiment, Float2 destination)
        {
            regiment.Route.Clear();
            regiment.RouteCrossingIds.Clear();
            regiment.RouteIndex = 0;
            regiment.RouteCrossingIndex = 0;
            ClearBridgeState(regiment);
            regiment.Destination = destination;
            regiment.Moving = Float2.Distance(regiment.Anchor, destination) > 0.05f;
        }

        public void SetRoute(RegimentState regiment, RoutePlan plan)
        {
            regiment.Route.Clear();
            regiment.RouteCrossingIds.Clear();
            regiment.RouteIndex = 0;
            regiment.RouteCrossingIndex = 0;
            ClearBridgeState(regiment);
            if (plan == null || !plan.IsValid || plan.Points.Count == 0) { regiment.Moving = false; return; }
            for (var i = 0; i < plan.Points.Count; i++) regiment.Route.Add(plan.Points[i]);
            for (var i = 0; i < plan.CrossingIds.Count; i++) regiment.RouteCrossingIds.Add(plan.CrossingIds[i]);
            regiment.Destination = plan.Points[plan.Points.Count - 1];
            regiment.Moving = true;
            PrepareActiveCrossing(regiment);
        }

        public void SetFormation(RegimentState regiment, FormationKind formation)
        {
            regiment.Formation = formation;
            for (var i = 0; i < regiment.UnitIndices.Count; i++)
                Units[regiment.UnitIndices[i]].SlotOffset = FormationLayout.Slot(formation, i, regiment.UnitIndices.Count);
        }

        public void SetFormationForAll(FormationKind formation) { foreach (var regiment in Regiments) SetFormation(regiment, formation); }

        public Float2 GetSlotTarget(UnitState unit)
        {
            var regiment = FindRegiment(unit.RegimentId);
            if (regiment == null) return unit.Position;
            var index = regiment.UnitIndices.IndexOf(Units.IndexOf(unit));
            if (index < 0) return unit.Position;
            return EffectiveSlotTarget(regiment, unit, index);
        }

        public RegimentState FindRegiment(int id)
        {
            for (var i = 0; i < Regiments.Count; i++) if (Regiments[i].Id == id) return Regiments[i];
            return null;
        }

        public void Step(float dt)
        {
            if (!(dt > 0f) || float.IsNaN(dt) || float.IsInfinity(dt)) throw new ArgumentOutOfRangeException(nameof(dt));
            Tick++;
            foreach (var regiment in Regiments)
            {
                regiment.PreviousAnchor = regiment.Anchor;
                UpdateBridgeFlow(regiment);
                var cohesionFactor = CohesionSpeedFactor(regiment);
                AdvanceRegiment(regiment, dt, cohesionFactor);
                UpdateBridgeFlow(regiment);
                for (var i = 0; i < regiment.UnitIndices.Count; i++)
                {
                    var unit = Units[regiment.UnitIndices[i]];
                    if (!unit.Alive) continue;
                    unit.PreviousPosition = unit.Position;
                    var facing = EffectiveFormationFacing(regiment);
                    unit.FacingRadians = facing;
                    var target = EffectiveSlotTarget(regiment, unit, i);
                    target = SafeFollowerTarget(regiment, unit, target);
                    var error = Float2.Distance(unit.Position, target);
                    var followerSpeed = MathF.Max(regiment.Speed * 1.55f, regiment.Speed + error * 2.65f);
                    followerSpeed = MathF.Min(followerSpeed, regiment.Speed * 4.15f);
                    unit.Position = Float2.MoveTowards(unit.Position, target, followerSpeed * dt);
                }
            }
        }

        private float CohesionSpeedFactor(RegimentState regiment)
        {
            if (regiment.UnitIndices.Count == 0) return 1f;
            var sum = 0f;
            var max = 0f;
            var living = 0;
            for (var i = 0; i < regiment.UnitIndices.Count; i++)
            {
                var unit = Units[regiment.UnitIndices[i]];
                if (!unit.Alive) continue;
                var target = EffectiveSlotTarget(regiment, unit, i);
                var error = Float2.Distance(unit.Position, target);
                sum += error;
                if (error > max) max = error;
                living++;
            }
            if (living == 0) return 1f;
            var mean = sum / living;
            var factor = 1f;
            if (mean > 1.15f) factor = MathF.Min(factor, MathF.Max(0.70f, 1f - (mean - 1.15f) / 6f));
            if (max > 3.2f) factor = MathF.Min(factor, 0.82f);
            return MathF.Max(0.66f, factor);
        }

        private static void AdvanceRegiment(RegimentState regiment, float dt, float cohesionFactor)
        {
            if (!regiment.Moving) return;
            var remainingStep = regiment.Speed * cohesionFactor * dt;
            var guard = 0;
            while (remainingStep > 0f && guard++ < 4)
            {
                var target = regiment.Route.Count > 0 && regiment.RouteIndex < regiment.Route.Count ? regiment.Route[regiment.RouteIndex] : regiment.Destination;
                var delta = target - regiment.Anchor;
                var distance = delta.Length;
                if (distance <= 0.03f)
                {
                    regiment.Anchor = target;
                    if (regiment.Route.Count > 0 && regiment.RouteIndex + 1 < regiment.Route.Count) { regiment.RouteIndex++; continue; }
                    regiment.Moving = false;
                    return;
                }
                var direction = delta / distance;
                var desiredFacing = MathF.Atan2(direction.Y, direction.X);
                regiment.FacingRadians = RotateTowardsAngle(regiment.FacingRadians, desiredFacing, RegimentTurnRateRadians * dt);
                var move = MathF.Min(remainingStep, distance);
                regiment.Anchor += direction * move;
                remainingStep -= move;
                if (move + 1e-5f < distance) return;
                regiment.Anchor = target;
                if (regiment.Route.Count > 0 && regiment.RouteIndex + 1 < regiment.Route.Count) regiment.RouteIndex++;
                else { regiment.Moving = false; return; }
            }
        }

        private void PrepareActiveCrossing(RegimentState regiment)
        {
            if (_map == null || regiment.RouteCrossingIndex >= regiment.RouteCrossingIds.Count) return;
            var crossing = FindCrossing(regiment.RouteCrossingIds[regiment.RouteCrossingIndex]);
            if (crossing == null) return;
            regiment.ActiveCrossingId = crossing.Id;
            var localAlong = LocalAlong(crossing, regiment.Anchor);
            regiment.CrossingInitialSide = localAlong >= 0f ? 1 : -1;
        }

        private void UpdateBridgeFlow(RegimentState regiment)
        {
            if (_map == null || string.IsNullOrEmpty(regiment.ActiveCrossingId)) { regiment.BridgeCompression = 0f; return; }
            var crossing = FindCrossing(regiment.ActiveCrossingId);
            if (crossing == null) { ClearBridgeState(regiment); return; }
            var signedAlong = LocalAlong(crossing, regiment.Anchor) * regiment.CrossingInitialSide;
            var half = crossing.Length * 0.5f;
            float compression;
            if (signedAlong >= half + BridgeCompressionStart) compression = 0f;
            else if (signedAlong > half + BridgeCompressionFull)
                compression = Smooth01((half + BridgeCompressionStart - signedAlong) / (BridgeCompressionStart - BridgeCompressionFull));
            else if (signedAlong >= -half) compression = 1f;
            else
            {
                var release = -signedAlong - half;
                compression = 1f - Smooth01(release / BridgeReleaseDistance);
                if (release >= BridgeReleaseDistance)
                {
                    regiment.RouteCrossingIndex++;
                    ClearBridgeState(regiment);
                    PrepareActiveCrossing(regiment);
                    return;
                }
            }
            regiment.BridgeCompression = Math.Clamp(compression, 0f, 1f);
            if (regiment.BridgeCompression > regiment.PeakBridgeCompression) regiment.PeakBridgeCompression = regiment.BridgeCompression;
        }

        private Float2 EffectiveSlotTarget(RegimentState regiment, UnitState unit, int memberIndex)
        {
            var slot = unit.SlotOffset;
            if (regiment.BridgeCompression > 0.001f)
            {
                var crossing = FindCrossing(regiment.ActiveCrossingId);
                if (crossing != null)
                {
                    var compact = CompactBridgeSlot(unit, memberIndex, regiment.UnitIndices.Count, crossing);
                    slot = Float2.Lerp(slot, compact, regiment.BridgeCompression);
                }
            }
            return TransformSlot(regiment.Anchor, EffectiveFormationFacing(regiment), slot);
        }

        private float EffectiveFormationFacing(RegimentState regiment)
        {
            if (regiment.BridgeCompression <= 0.001f) return regiment.FacingRadians;
            var crossing = FindCrossing(regiment.ActiveCrossingId);
            if (crossing == null) return regiment.FacingRadians;
            var bridgeHeading = crossing.AngleRadians + (regiment.CrossingInitialSide > 0 ? MathF.PI : 0f);
            return LerpAngle(regiment.FacingRadians, bridgeHeading, regiment.BridgeCompression);
        }

        private static Float2 CompactBridgeSlot(UnitState unit, int index, int count, CrossingDefinition crossing)
        {
            var files = unit.Kind == UnitKind.Cavalry ? 1 : crossing.Width >= 2.05f ? 2 : 1;
            var ranks = (count + files - 1) / files;
            var rank = index / files;
            var file = index % files;
            var actualFiles = Math.Min(files, count - rank * files);
            var lateralGap = files == 1 ? 0f : MathF.Min(0.72f, crossing.Width * 0.38f);
            var lateral = (file - (actualFiles - 1) * 0.5f) * lateralGap;
            var longitudinal = ((ranks - 1) * 0.5f - rank) * (unit.Kind == UnitKind.Cavalry ? 0.92f : 0.72f);
            return new Float2(lateral, longitudinal);
        }

        private Float2 SafeFollowerTarget(RegimentState regiment, UnitState unit, Float2 desired)
        {
            if (_map == null || _map.SegmentWaterCrossing(unit.Position, desired)?.Blocked != true) return desired;
            var crossing = FindCrossing(regiment.ActiveCrossingId);
            if (crossing == null) return unit.Position;
            var forward = Float2.FromAngle(crossing.AngleRadians);
            var half = crossing.Length * 0.5f;
            var signedUnitAlong = LocalAlong(crossing, unit.Position) * regiment.CrossingInitialSide;
            if (signedUnitAlong > half)
                return crossing.Centre + forward * (regiment.CrossingInitialSide * (half + 0.18f));
            return crossing.Centre - forward * (regiment.CrossingInitialSide * (half + 0.18f));
        }

        private CrossingDefinition FindCrossing(string id)
        {
            if (_map == null || string.IsNullOrEmpty(id)) return null;
            for (var i = 0; i < _map.Crossings.Count; i++) if (_map.Crossings[i].Id == id) return _map.Crossings[i];
            return null;
        }

        private static float LocalAlong(CrossingDefinition crossing, Float2 point)
        {
            var delta = point - crossing.Centre;
            var forward = Float2.FromAngle(crossing.AngleRadians);
            return delta.X * forward.X + delta.Y * forward.Y;
        }

        private static float Smooth01(float t)
        {
            t = Math.Clamp(t, 0f, 1f);
            return t * t * (3f - 2f * t);
        }

        private static void ClearBridgeState(RegimentState regiment)
        {
            regiment.ActiveCrossingId = null;
            regiment.CrossingInitialSide = 0;
            regiment.BridgeCompression = 0f;
        }

        private static float RotateTowardsAngle(float current, float target, float maxDelta)
        {
            var delta = NormalizeAngle(target - current);
            if (MathF.Abs(delta) <= maxDelta) return target;
            return NormalizeAngle(current + MathF.Sign(delta) * maxDelta);
        }

        private static float LerpAngle(float current, float target, float t) => NormalizeAngle(current + NormalizeAngle(target - current) * Math.Clamp(t, 0f, 1f));

        private static float NormalizeAngle(float angle)
        {
            while (angle > MathF.PI) angle -= MathF.PI * 2f;
            while (angle < -MathF.PI) angle += MathF.PI * 2f;
            return angle;
        }

        public static Float2 TransformSlot(Float2 anchor, float facingRadians, Float2 slot)
        {
            var forward = Float2.FromAngle(facingRadians);
            var right = new Float2(-forward.Y, forward.X);
            return anchor + right * slot.X + forward * slot.Y;
        }
    }
}
