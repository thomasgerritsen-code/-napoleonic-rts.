using System;
using System.Collections.Generic;
using NapoleonicRTS.Simulation;

static void Require(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
}

var map = BrowserBattlefieldMap.Create();
var planner = new StrategicRoutePlanner(map);
Require(map.Roads.Count == 8, $"Expected 8 active V7 roads, got {map.Roads.Count}.");
Require(map.Crossings.Count == 4, "Expected four legal river crossings.");
Require(planner.NodeCount > 40, "Road graph did not build enough strategic nodes.");

var blockedA = BrowserBattlefieldMap.MapToNative(1300, 1450);
var blockedB = BrowserBattlefieldMap.MapToNative(1900, 1450);
Require(map.SegmentWaterCrossing(blockedA, blockedB)?.Blocked == true, "Deep-water segment was not blocked.");

var west = BrowserBattlefieldMap.MapToNative(1050, 895);
var east = BrowserBattlefieldMap.MapToNative(2500, 900);
var bridgePlan = planner.Plan(west, east, UnitTravelKind.Infantry);
Require(bridgePlan.IsValid, "Planner could not cross the river on the main road.");
Require(bridgePlan.CrossingIds.Contains("pont-chaussee"), "Main east-west route did not use Pont de la Chaussée.");
var previousPoint = west;
foreach (var point in bridgePlan.Points)
{
    Require(map.SegmentWaterCrossing(previousPoint, point)?.Blocked != true, "Planned route contains an illegal water segment.");
    previousPoint = point;
}

var bridgeWorld = new SimulationWorld(map);
var bridgeRegiment = bridgeWorld.SpawnRegiment(ArmySide.France, west, 32, FormationKind.Line, 0f);
bridgeWorld.SetRoute(bridgeRegiment, bridgePlan);
var maxBridgeCompression = 0f;
for (var tick = 0; tick < 720; tick++)
{
    bridgeWorld.Step(SimulationWorld.FixedStepSeconds);
    maxBridgeCompression = MathF.Max(maxBridgeCompression, bridgeRegiment.BridgeCompression);
    foreach (var unitIndex in bridgeRegiment.UnitIndices)
    {
        var unit = bridgeWorld.Units[unitIndex];
        Require(!map.IsWater(unit.Position), $"Bridge follower {unit.Id} entered blocked water at tick {tick}.");
    }
}
Require(maxBridgeCompression > 0.95f, $"Bridge formation never fully compressed: {maxBridgeCompression:0.00}.");
Require(bridgeRegiment.PeakBridgeCompression > 0.95f, "Bridge compression peak was not retained for diagnostics.");
Require(bridgeRegiment.BridgeCompression < 0.05f, "Regiment did not redeploy after clearing the bridge.");
Require(string.IsNullOrEmpty(bridgeRegiment.ActiveCrossingId), "Crossing ownership was released before all members cleared or was never released.");
Require(Float2.Distance(bridgeRegiment.Anchor, east) < 0.15f, "Bridge regiment did not finish its legal route.");
var finalBridgeSlotError = 0f;
foreach (var unitIndex in bridgeRegiment.UnitIndices)
{
    var unit = bridgeWorld.Units[unitIndex];
    finalBridgeSlotError = MathF.Max(finalBridgeSlotError, Float2.Distance(unit.Position, bridgeWorld.GetSlotTarget(unit)));
}
Require(finalBridgeSlotError < 3.0f, $"Bridge regiment did not reform after clearing: {finalBridgeSlotError:0.00}.");

var world = new SimulationWorld(map);
PrototypeScenario.Populate(world);
Require(world.Units.Count == PrototypeScenario.TotalUnits, $"Expected {PrototypeScenario.TotalUnits} units, got {world.Units.Count}.");
Require(world.Regiments.Count == PrototypeScenario.RegimentCountPerSide * 2, "Unexpected regiment count.");

var selected = new List<int>();
SelectionQuery.RegimentsInRect(world, ArmySide.France, new Float2(-60f, -10f), new Float2(-30f, 10f), selected);
Require(selected.Count > 0, "Data selection did not find French regiments.");
foreach (var id in selected) Require(world.FindRegiment(id)?.Side == ArmySide.France, "Selection crossed army ownership.");
RegimentCommandService.SetFormation(world, selected, FormationKind.Column);
RegimentCommandService.MoveRegiments(world, selected, new Float2(-12f, 0f), 5.5f, planner);

var first = world.FindRegiment(selected[0]);
Require(first != null, "Selected regiment disappeared.");
Require(first.Route.Count > 0, "Native regiment command did not receive a strategic route.");
var start = first.Anchor;
for (var i = 0; i < 600; i++) world.Step(SimulationWorld.FixedStepSeconds);
Require(Float2.Distance(start, first.Anchor) > 10f, "Regiment anchor did not make meaningful routed progress.");

var worstSlotError = 0f;
foreach (var unit in world.Units)
{
    Require(float.IsFinite(unit.Position.X) && float.IsFinite(unit.Position.Y), $"Unit {unit.Id} has invalid coordinates.");
    var error = Float2.Distance(unit.Position, world.GetSlotTarget(unit));
    if (error > worstSlotError) worstSlotError = error;
}
Require(worstSlotError < 3.0f, $"Formation cohesion exceeded smoke threshold: {worstSlotError:0.00}.");
Require(MathF.Abs(world.Units[first.UnitIndices[0]].SlotOffset.X) <= 1.2f, "Column layout did not become narrow.");

Console.WriteLine($"PASS native simulation smoke | units={world.Units.Count} regiments={world.Regiments.Count} roads={map.Roads.Count} crossing={bridgePlan.CrossingIds[0]} bridgeCompression={maxBridgeCompression:0.00} bridgeFinalError={finalBridgeSlotError:0.00} selected={selected.Count} ticks={world.Tick} worstSlotError={worstSlotError:0.00}");
