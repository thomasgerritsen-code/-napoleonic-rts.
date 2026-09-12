using System;
using System.Linq;
using NapoleonicRTS.Simulation;

static void Require(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
}

var map = BrowserBattlefieldMap.Create();
var gameplay = BrowserParityScenario.CreateGameplayWorld(map);
Require(gameplay.Movement.Units.Count == 182, $"Expected 182 combat units, got {gameplay.Movement.Units.Count}.");
Require(gameplay.Workers.Count == 16, $"Expected 16 workers, got {gameplay.Workers.Count}.");
Require(gameplay.Buildings.Count == 6, $"Expected 6 buildings, got {gameplay.Buildings.Count}.");
Require(gameplay.Resources.Count == 36, $"Expected 36 resources, got {gameplay.Resources.Count}.");
Require(gameplay.Movement.Units.Count(u => u.Kind == UnitKind.Officer) == 8, "Officer parity missing.");
Require(gameplay.Movement.Units.Count(u => u.Kind == UnitKind.Drummer) == 8, "Drummer parity missing.");
Require(gameplay.Movement.Units.Count(u => u.Kind == UnitKind.Cavalry) == 16, "Cavalry parity missing.");
Require(gameplay.Movement.Units.Count(u => u.Kind == UnitKind.Artillery) == 6, "Artillery parity missing.");

var woodBefore = gameplay.Resources.Where(r => r.Kind == ResourceKind.Wood).Sum(r => r.Amount);
for (var i = 0; i < 60 * 18; i++) gameplay.Step(SimulationWorld.FixedStepSeconds);
var woodAfter = gameplay.Resources.Where(r => r.Kind == ResourceKind.Wood).Sum(r => r.Amount);
Require(woodAfter < woodBefore, "Workers did not gather wood.");
Require(gameplay.Commander.ProductionTicks >= 8, "AI production did not tick.");

var french = gameplay.Movement.Regiments.First(r => r.Side == ArmySide.France && r.UnitIndices.Any(index => gameplay.Movement.Units[index].Kind == UnitKind.Infantry));
var oldAnchor = french.Anchor;
gameplay.QueueMoveCommand(new[] { french.Id }, oldAnchor + new Float2(3f, 0f));
Require(gameplay.PendingOrderCount == 1, "Delayed command was not queued.");
for (var i = 0; i < 180; i++) gameplay.Step(SimulationWorld.FixedStepSeconds);
Require(gameplay.PendingOrderCount == 0, "Delayed command never executed.");
Require(Float2.Distance(french.Anchor, oldAnchor) > .25f, "Queued regiment did not move.");

// Dedicated stationary firefight so combat parity is tested independently of route timings.
var fightMovement = new SimulationWorld(map);
var f = fightMovement.SpawnRegiment(ArmySide.France, new Float2(-1.05f, 0f), 14, FormationKind.Line, 0f);
var b = fightMovement.SpawnRegiment(ArmySide.Britain, new Float2(1.05f, 0f), 14, FormationKind.Line, MathF.PI);
f.Speed = .01f; b.Speed = .01f;
fightMovement.Units[f.UnitIndices[^2]].Kind = UnitKind.Officer;
fightMovement.Units[f.UnitIndices[^1]].Kind = UnitKind.Drummer;
fightMovement.Units[b.UnitIndices[^2]].Kind = UnitKind.Officer;
fightMovement.Units[b.UnitIndices[^1]].Kind = UnitKind.Drummer;
var fight = new BrowserParityWorld(fightMovement, map, new StrategicRoutePlanner(map));
fight.Combat.SyncUnits();
for (var i = 0; i < 60 * 24; i++) fight.Step(SimulationWorld.FixedStepSeconds);
Require(fight.Combat.TotalShotsFired > 0, "Musket volley system never fired.");
Require(fight.Combat.TotalDeaths > 0 || fight.Combat.MeanMorale(ArmySide.France) < 99f || fight.Combat.MeanMorale(ArmySide.Britain) < 99f, "Combat caused neither casualties nor morale loss.");

// Commands unique to the browser game must exist and affect state.
var frenchCavalry = gameplay.Movement.Regiments.First(r => r.Side == ArmySide.France && r.UnitIndices.Any(index => gameplay.Movement.Units[index].Kind == UnitKind.Cavalry));
Require(gameplay.Combat.CavalryCharge(new[] { frenchCavalry.Id }), "Cavalry charge command did not apply.");
Require(frenchCavalry.UnitIndices.Any(index => gameplay.Combat.Get(gameplay.Movement.Units[index].Id).ChargeTimer > 0f), "Charge timer not set.");
var frenchArtillery = gameplay.Movement.Regiments.First(r => r.Side == ArmySide.France && r.UnitIndices.Any(index => gameplay.Movement.Units[index].Kind == UnitKind.Artillery));
Require(gameplay.Combat.ToggleArtillery(new[] { frenchArtillery.Id }), "Artillery ammo toggle did not apply.");
Require(frenchArtillery.UnitIndices.All(index => gameplay.Combat.Get(gameplay.Movement.Units[index].Id).ArtilleryMode == ArtilleryMode.GrapeShot), "Artillery did not switch to grapeshot.");
Require(gameplay.Combat.BayonetCommand(new[] { french.Id }), "Bayonet command did not apply.");

Console.WriteLine($"PASS browser parity core | units={gameplay.Movement.Units.Count} workers={gameplay.Workers.Count} buildings={gameplay.Buildings.Count} resources={gameplay.Resources.Count} shots={fight.Combat.TotalShotsFired} deaths={fight.Combat.TotalDeaths} aiTicks={gameplay.Commander.ProductionTicks} aiState={gameplay.Commander.State}");
