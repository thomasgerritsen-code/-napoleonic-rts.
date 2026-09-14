using System;
using System.Diagnostics;
using NapoleonicRTS.Simulation;

static void Require(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
}

const int regimentsPerSide = 100;
const int unitsPerRegiment = 50;
const int measuredTicks = 600;
var world = new SimulationWorld();
var expectedUnits = ScaleScenario.Populate(world, regimentsPerSide, unitsPerRegiment);
Require(expectedUnits == 10_000, $"Scale scenario should contain 10,000 units, got {expectedUnits}.");
Require(world.Units.Count == expectedUnits, "Scale scenario unit count mismatch.");
Require(world.Regiments.Count == regimentsPerSide * 2, "Scale scenario regiment count mismatch.");

for (var i = 0; i < 60; i++) world.Step(SimulationWorld.FixedStepSeconds);
var stopwatch = Stopwatch.StartNew();
for (var tick = 0; tick < measuredTicks; tick++)
{
    if (tick == 200) world.SetFormationForAll(FormationKind.Column);
    if (tick == 400) world.SetFormationForAll(FormationKind.Line);
    world.Step(SimulationWorld.FixedStepSeconds);
}
stopwatch.Stop();

var invalid = 0;
var movingOrProgressed = 0;
foreach (var unit in world.Units)
{
    if (!float.IsFinite(unit.Position.X) || !float.IsFinite(unit.Position.Y)) invalid++;
}
foreach (var regiment in world.Regiments)
{
    if (Float2.Distance(regiment.Anchor, regiment.HomeAnchor) > 10f) movingOrProgressed++;
}
Require(invalid == 0, $"Scale simulation produced {invalid} invalid unit positions.");
Require(movingOrProgressed == world.Regiments.Count, $"Only {movingOrProgressed}/{world.Regiments.Count} regiments made meaningful progress.");
Require(stopwatch.Elapsed.TotalSeconds < 20.0, $"10,000-unit simulation exceeded generous CI ceiling: {stopwatch.Elapsed.TotalSeconds:0.00}s.");

var simulatedSeconds = measuredTicks * SimulationWorld.FixedStepSeconds;
var realtimeFactor = simulatedSeconds / stopwatch.Elapsed.TotalSeconds;
var unitStepsPerSecond = expectedUnits * measuredTicks / stopwatch.Elapsed.TotalSeconds;
Console.WriteLine($"PASS native scale | units={expectedUnits} regiments={world.Regiments.Count} ticks={measuredTicks} wallMs={stopwatch.Elapsed.TotalMilliseconds:0} realtime={realtimeFactor:0.0}x unitStepsPerSec={unitStepsPerSecond:0}");
