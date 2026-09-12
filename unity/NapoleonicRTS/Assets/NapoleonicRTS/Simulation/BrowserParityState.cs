using System;
using System.Collections.Generic;

namespace NapoleonicRTS.Simulation
{
    public enum ResourceKind { Food, Wood }
    public enum BuildingKind { TownCenter, Barracks, House }
    public enum WorkerTask { Idle, Gather, Return, Build }
    public enum AttackMode { Fire, Bayonet }
    public enum ArtilleryMode { RoundShot, GrapeShot }
    public enum CommanderState { Defend, Mass, Advance, Attack, Flank, Retreat, Regroup }
    public enum DisciplineState { Steady, Shaken, Wavering, Routing }
    public enum VictorySide { None, France, Britain }
    public enum WeatherKind { Clear, Rain, Mist }
    public enum TimeOfDayKind { Morning, Midday, Evening }
    public enum TacticalTerrainKind { Open, Road, Woods, Hill, Village }

    public sealed class EconomyState
    {
        public float Food;
        public float Wood;
        public int PopulationCap;
        public EconomyState(float food, float wood, int populationCap) { Food = food; Wood = wood; PopulationCap = populationCap; }
    }

    public sealed class CombatUnitState
    {
        public float HitPoints;
        public float MaxHitPoints;
        public float Morale = 100f;
        public float Stamina = 100f;
        public float ReloadRemaining;
        public float RecentHit;
        public float ChargeTimer;
        public float RoutingTimer;
        public AttackMode AttackMode = AttackMode.Fire;
        public ArtilleryMode ArtilleryMode = ArtilleryMode.RoundShot;
        public bool Routing;
        public bool ArtilleryCrew;
        public int ShotsFired;
        public int Kills;
    }

    public sealed class RegimentBattleState
    {
        public float Morale = 100f;
        public float MeanStamina = 100f;
        public float DisciplineFactor = 1f;
        public DisciplineState Discipline = DisciplineState.Steady;
        public float CommandBonus;
        public int InitialStrength;
    }

    public sealed class ResourceNodeState
    {
        public int Id;
        public ResourceKind Kind;
        public Float2 Position;
        public float Amount;
        public float MaxAmount;
        public float Radius;
        public bool Depleted => Amount <= 0f;
    }

    public sealed class WorkerState
    {
        public int Id;
        public ArmySide Side;
        public Float2 Position;
        public Float2 Target;
        public WorkerTask Task;
        public int ResourceId;
        public int BuildingId;
        public ResourceKind CarryKind;
        public float Carry;
        public float GatherClock;
        public bool Alive = true;
    }

    public sealed class TrainingOrder
    {
        public UnitKind Kind;
        public float Remaining;
        public TrainingOrder(UnitKind kind, float remaining) { Kind = kind; Remaining = remaining; }
    }

    public sealed class BuildingState
    {
        public int Id;
        public ArmySide Side;
        public BuildingKind Kind;
        public Float2 Position;
        public float Width;
        public float Height;
        public float HitPoints;
        public float MaxHitPoints;
        public float Construction = 1f;
        public bool Complete = true;
        public bool Destroyed;
        public readonly Queue<TrainingOrder> Queue = new Queue<TrainingOrder>();
    }

    public sealed class ProjectileState
    {
        public int Id;
        public ArmySide Side;
        public Float2 Position;
        public int TargetUnitId;
        public int TargetBuildingId;
        public float Damage;
        public float Speed;
        public bool Artillery;
        public bool Dead;
    }

    public sealed class ParticleState
    {
        public Float2 Position;
        public Float2 Velocity;
        public float Life;
        public float MaxLife;
        public float Size;
        public bool Impact;
    }

    public sealed class BattlefieldScarState
    {
        public Float2 Position;
        public ArmySide Side;
        public float CreatedAt;
    }

    public sealed class SightingState
    {
        public int Id;
        public bool Building;
        public Float2 Position;
        public float SeenAt;
        public UnitKind UnitKind;
        public BuildingKind BuildingKind;
    }

    public sealed class ObjectivePointState
    {
        public string Id;
        public string Label;
        public Float2 Position;
        public ArmySide? Owner;
        public float Progress;
    }

    public sealed class ObjectiveState
    {
        public string Scenario = "crossroads";
        public string Name = "Kruispunt";
        public int TargetScore = 120;
        public int FranceScore;
        public int BritainScore;
        public readonly List<ObjectivePointState> Points = new List<ObjectivePointState>();
    }

    public readonly struct CombatProfile
    {
        public readonly float MaxHp, Range, Damage, Reload, ProjectileSpeed, Shock;
        public CombatProfile(float hp, float range, float damage, float reload, float projectileSpeed, float shock)
        { MaxHp = hp; Range = range; Damage = damage; Reload = reload; ProjectileSpeed = projectileSpeed; Shock = shock; }

        public static CombatProfile For(UnitKind kind)
        {
            switch (kind)
            {
                case UnitKind.Worker: return new CombatProfile(65f, .24f, 7f, 1.1f, 0f, 5f);
                case UnitKind.Officer: return new CombatProfile(125f, 1.80f, 24f, 2.6f, 8.0f, 10f);
                case UnitKind.Drummer: return new CombatProfile(80f, .22f, 5f, 1.0f, 0f, 7f);
                case UnitKind.Cavalry: return new CombatProfile(155f, .36f, 30f, .9f, 0f, 12f);
                case UnitKind.Artillery: return new CombatProfile(195f, 6.10f, 82f, 5.0f, 5.6f, 24f);
                default: return new CombatProfile(100f, 2.44f, 20f, 3.0f, 8.2f, 10f);
            }
        }
    }
}
