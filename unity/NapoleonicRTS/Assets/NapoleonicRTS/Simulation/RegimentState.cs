using System.Collections.Generic;

namespace NapoleonicRTS.Simulation
{
    public enum FormationKind { Line, Column, Square }

    public sealed class RegimentState
    {
        public int Id { get; internal set; }
        public ArmySide Side { get; internal set; }
        public FormationKind Formation { get; internal set; }
        public Float2 Anchor { get; internal set; }
        public Float2 PreviousAnchor { get; internal set; }
        public Float2 HomeAnchor { get; internal set; }
        public Float2 Destination { get; internal set; }
        public float FacingRadians { get; internal set; }
        public float Speed { get; set; } = 4.2f;
        public bool Moving { get; internal set; }
        public List<int> UnitIndices { get; } = new List<int>();
        public List<Float2> Route { get; } = new List<Float2>();
        public int RouteIndex { get; internal set; }
        public List<string> RouteCrossingIds { get; } = new List<string>();
        public int RouteCrossingIndex { get; internal set; }
        public int CrossingInitialSide { get; internal set; }
        public float BridgeCompression { get; internal set; }
        public float PeakBridgeCompression { get; internal set; }
        public string ActiveCrossingId { get; internal set; }
    }
}
