using System;
using System.Collections.Generic;
using NapoleonicRTS.Simulation;

static void Require(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
}

var world = new SimulationWorld();
PrototypeScenario.Populate(world);
Require(world.Units.Count == PrototypeScenario.TotalUnits, $"Expected {PrototypeScenario.TotalUnits} units, got {world.Units.Count}.");
Require(world.Regiments.Count == PrototypeScenario.RegimentCountPerSide * 2, "Unexpected regiment count.");

var selected = new List<int>();
SelectionQuery.RegimentsInRect(world, ArmySide.France, new Float2(-60f, -10f), new Float2(-30f, 10f), selected);
Require(selected.Count > 0, "Data selection did not find French regiments.");
foreach (var id in selected) Require(world.FindRegiment(id)?.Side == ArmySide.France, "Selection crossed army ownership.");
RegimentCommandService.SetFormation(world, selected, FormationKind.Column);
RegimentCommandService.MoveRegiments(world, selected, new Float2(-12f, 0f), 9f);

var first = world.FindRegiment(selected[0]);
Require(first != null, "Selected regiment disappeared.");
var start = first.Anchor;
for (var i = 0; i < 600; i++) world.Step(SimulationWorld.FixedStepSeconds);
Require(Float2.Distance(start, first.Anchor) > 20f, "Regiment anchor did not make meaningful progress after command.");

var worstSlotError = 0f;
foreach (var unit in world.Units)
{
    Require(float.IsFinite(unit.Position.X) && float.IsFinite(unit.Position.Y), $"Unit {unit.Id} has invalid coordinates.");
    var error = Float2.Distance(unit.Position, world.GetSlotTarget(unit));
    if (error > worstSlotError) worstSlotError = error;
}
Require(worstSlotError < 3.0f, $"Formation cohesion exceeded smoke threshold: {worstSlotError:0.00}.");
Require(MathF.Abs(world.Units[first.UnitIndices[0]].SlotOffset.X) <= 1.2f, "Column layout did not become narrow.");

world.SetFormationForAll(FormationKind.Line);
PrototypeScenario.OrderMarch(world, true);
for (var i = 0; i < 1200; i++) world.Step(SimulationWorld.FixedStepSeconds);
Require(Float2.Distance(first.Anchor, first.HomeAnchor) < 0.1f, "Regiment did not return home.");

Console.WriteLine($"PASS native simulation smoke | units={world.Units.Count} regiments={world.Regiments.Count} selected={selected.Count} ticks={world.Tick} worstSlotError={worstSlotError:0.00}");
