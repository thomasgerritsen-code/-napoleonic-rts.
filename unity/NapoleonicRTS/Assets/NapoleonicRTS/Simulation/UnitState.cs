namespace NapoleonicRTS.Simulation
{
    public enum ArmySide { France, Britain }
    public enum UnitKind { Infantry, Officer, Drummer, Cavalry, Artillery }

    public sealed class UnitState
    {
        public int Id { get; internal set; }
        public int RegimentId { get; internal set; }
        public ArmySide Side { get; internal set; }
        public UnitKind Kind { get; internal set; }
        public bool Alive { get; set; } = true;
        public Float2 Position { get; internal set; }
        public Float2 PreviousPosition { get; internal set; }
        public Float2 SlotOffset { get; internal set; }
        public float FacingRadians { get; internal set; }
    }
}
