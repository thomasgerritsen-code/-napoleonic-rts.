using System;
using NapoleonicRTS.Simulation;

static void Require(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
}

var world = new SimulationWorld();
PrototypeScenario.Populate(world);
Require(world.Units.Count == PrototypeScenario.TotalUnits, $"Expected {PrototypeScenario.TotalUnits} units, got {world.Units.Count}.");
Require(world.Regiments.Count == PrototypeScenario.RegimentCountPerSide * 2, "Unexpected regiment count.");

var first = world.Regiments[0];
var start = first.Anchor;
for (var i = 0; i < 600; i++) world.Step(SimulationWorld.FixedStepSeconds);
Require(Float2.Distance(start, first.Anchor) > 20f, "Regiment anchor did not make meaningful progress.");

var worstSlotError = 0f;
foreach (var unit in world.Units)
{
    Require(float.IsFinite(unit.Position.X) && float.IsFinite(unit.Position.Y), $"Unit {unit.Id} has invalid coordinates.");
    var error = Float2.Distance(unit.Position, world.GetSlotTarget(unit));
    if (error > worstSlotError) worstSlotError = error;
}
Require(worstSlotError < 3.0f, $"Formation cohesion exceeded smoke threshold: {worstSlotError:0.00}.");

world.SetFormationForAll(FormationKind.Column);
for (var i = 0; i < 180; i++) world.Step(SimulationWorld.FixedStepSeconds);
var changedSlot = world.Units[0].SlotOffset;
Require(MathF.Abs(changedSlot.X) <= 1.2f, "Column layout did not become narrow.");

PrototypeScenario.OrderMarch(world, true);
for (var i = 0; i < 900; i++) world.Step(SimulationWorld.FixedStepSeconds);
Require(Float2.Distance(first.Anchor, first.HomeAnchor) < 0.1f, "Regiment did not return home.");

Console.WriteLine($"PASS native simulation smoke | units={world.Units.Count} regiments={world.Regiments.Count} ticks={world.Tick} worstSlotError={worstSlotError:0.00}");
