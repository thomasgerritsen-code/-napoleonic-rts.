using System;
using System.Collections.Generic;

namespace NapoleonicRTS.Simulation
{
    public sealed class SimulationWorld
    {
        public const float FixedStepSeconds = 1f / 60f;
        private int _nextUnitId = 1;
        private int _nextRegimentId = 1;

        public List<UnitState> Units { get; } = new List<UnitState>();
        public List<RegimentState> Regiments { get; } = new List<RegimentState>();
        public long Tick { get; private set; }

        public RegimentState SpawnRegiment(ArmySide side, Float2 anchor, int unitCount, FormationKind formation, float facingRadians)
        {
            var regiment = new RegimentState
            {
                Id = _nextRegimentId++,
                Side = side,
                Formation = formation,
                Anchor = anchor,
                PreviousAnchor = anchor,
                HomeAnchor = anchor,
                Destination = anchor,
                FacingRadians = facingRadians,
                Moving = false
            };

            for (var i = 0; i < unitCount; i++)
            {
                var slot = FormationLayout.Slot(formation, i, unitCount);
                var position = TransformSlot(anchor, facingRadians, slot);
                var unit = new UnitState
                {
                    Id = _nextUnitId++,
                    RegimentId = regiment.Id,
                    Side = side,
                    Kind = UnitKind.Infantry,
                    Position = position,
                    PreviousPosition = position,
                    SlotOffset = slot,
                    FacingRadians = facingRadians
                };
                regiment.UnitIndices.Add(Units.Count);
                Units.Add(unit);
            }

            Regiments.Add(regiment);
            return regiment;
        }

        public void SetDestination(RegimentState regiment, Float2 destination)
        {
            regiment.Destination = destination;
            regiment.Moving = Float2.Distance(regiment.Anchor, destination) > 0.05f;
        }

        public void SetFormation(RegimentState regiment, FormationKind formation)
        {
            regiment.Formation = formation;
            for (var i = 0; i < regiment.UnitIndices.Count; i++)
                Units[regiment.UnitIndices[i]].SlotOffset = FormationLayout.Slot(formation, i, regiment.UnitIndices.Count);
        }

        public void SetFormationForAll(FormationKind formation)
        {
            foreach (var regiment in Regiments) SetFormation(regiment, formation);
        }

        public Float2 GetSlotTarget(UnitState unit)
        {
            var regiment = FindRegiment(unit.RegimentId);
            return regiment == null ? unit.Position : TransformSlot(regiment.Anchor, regiment.FacingRadians, unit.SlotOffset);
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
                if (regiment.Moving)
                {
                    var delta = regiment.Destination - regiment.Anchor;
                    var distance = delta.Length;
                    if (distance <= 0.02f)
                    {
                        regiment.Anchor = regiment.Destination;
                        regiment.Moving = false;
                    }
                    else
                    {
                        var direction = delta / distance;
                        regiment.FacingRadians = MathF.Atan2(direction.Y, direction.X);
                        var step = regiment.Speed * dt;
                        if (step >= distance)
                        {
                            regiment.Anchor = regiment.Destination;
                            regiment.Moving = false;
                        }
                        else regiment.Anchor += direction * step;
                    }
                }

                for (var i = 0; i < regiment.UnitIndices.Count; i++)
                {
                    var unit = Units[regiment.UnitIndices[i]];
                    if (!unit.Alive) continue;
                    unit.PreviousPosition = unit.Position;
                    unit.FacingRadians = regiment.FacingRadians;
                    var target = TransformSlot(regiment.Anchor, regiment.FacingRadians, unit.SlotOffset);
                    var error = Float2.Distance(unit.Position, target);
                    var followerSpeed = MathF.Max(regiment.Speed * 1.45f, regiment.Speed + error * 2.2f);
                    followerSpeed = MathF.Min(followerSpeed, regiment.Speed * 3.25f);
                    unit.Position = Float2.MoveTowards(unit.Position, target, followerSpeed * dt);
                }
            }
        }

        public static Float2 TransformSlot(Float2 anchor, float facingRadians, Float2 slot)
        {
            var forward = Float2.FromAngle(facingRadians);
            var right = new Float2(-forward.Y, forward.X);
            return anchor + right * slot.X + forward * slot.Y;
        }
    }
}
