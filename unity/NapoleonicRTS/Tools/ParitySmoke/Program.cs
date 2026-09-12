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
Require(gameplay.Buildings.Count == 14, $"Expected 14 starting buildings, got {gameplay.Buildings.Count}.");
Require(gameplay.Resources.Count == 36, $"Expected 36 resources, got {gameplay.Resources.Count}.");
Require(gameplay.FranceEconomy.PopulationCap == 120 && gameplay.BritainEconomy.PopulationCap == 120, "Starting houses should provide a real 120 population cap per side.");
Require(gameplay.PopulationUsed(ArmySide.France) <= gameplay.FranceEconomy.PopulationCap, "French starting army exceeds population cap.");
Require(gameplay.PopulationUsed(ArmySide.Britain) <= gameplay.BritainEconomy.PopulationCap, "British starting army exceeds population cap.");
Require(gameplay.Movement.Units.Count(u => u.Kind == UnitKind.Officer) == 8, "Officer parity missing.");
Require(gameplay.Movement.Units.Count(u => u.Kind == UnitKind.Drummer) == 8, "Drummer parity missing.");
Require(gameplay.Movement.Units.Count(u => u.Kind == UnitKind.Cavalry) == 16, "Cavalry parity missing.");
Require(gameplay.Movement.Units.Count(u => u.Kind == UnitKind.Artillery) == 2, "Compound artillery should contain one cannon per side.");
Require(gameplay.Combat.UnitStates.Values.Count(c => c.ArtilleryCrew) == 4, "Each cannon should have two crew members.");

ObjectiveScenarioService.Select(gameplay.Objective, "threePoints");
Require(gameplay.Objective.Points.Count == 3 && gameplay.Objective.TargetScore == 180, "Three-point objective preset failed.");
ObjectiveScenarioService.Select(gameplay.Objective, "crossroads");
Require(gameplay.Objective.Points.Count == 1 && gameplay.Objective.TargetScore == 120, "Crossroads objective preset failed.");

// Worker production must use the Town Center queue rather than instant spawning.
var frenchTown = gameplay.FindBuilding(ArmySide.France, BuildingKind.TownCenter);
var workerCountBeforeTraining = gameplay.Workers.Count(w => w.Alive && w.Side == ArmySide.France);
var foodBeforeTraining = gameplay.FranceEconomy.Food;
Require(gameplay.QueueTraining(ArmySide.France, frenchTown.Id, UnitKind.Worker), "Worker training could not be queued at the Town Center.");
Require(Math.Abs(gameplay.FranceEconomy.Food - (foodBeforeTraining - 50f)) < .001f, "Worker training should cost 50 food.");
for (var i = 0; i < 60 * 6; i++) gameplay.Step(SimulationWorld.FixedStepSeconds);
Require(gameplay.Workers.Count(w => w.Alive && w.Side == ArmySide.France) == workerCountBeforeTraining, "Worker spawned before the 7 second training time.");
for (var i = 0; i < 90; i++) gameplay.Step(SimulationWorld.FixedStepSeconds);
Require(gameplay.Workers.Count(w => w.Alive && w.Side == ArmySide.France) == workerCountBeforeTraining + 1, "Queued worker did not spawn after training.");

// Context orders support both map movement and resource interaction.
var orderWorker = gameplay.Workers.First(w => w.Alive && w.Side == ArmySide.France);
var workerStart = orderWorker.Position;
var groundTarget = frenchTown.Position + new Float2(0f, -5f);
Require(WorkerOrderService.IssueContextOrder(gameplay, new[] { orderWorker.Id }, groundTarget) == 1 && orderWorker.Task == WorkerTask.Move, "Ground context order did not create a worker move task.");
for (var i = 0; i < 60; i++) WorkerOrderService.StepMoveTasks(gameplay, SimulationWorld.FixedStepSeconds);
Require(Float2.Distance(orderWorker.Position, workerStart) > .5f, "Worker move task did not advance the worker.");
var clickedResource = gameplay.Resources.First(r => !r.Depleted);
WorkerOrderService.IssueContextOrder(gameplay, new[] { orderWorker.Id }, clickedResource.Position);
Require(orderWorker.Task == WorkerTask.Gather && orderWorker.ResourceId == clickedResource.Id, "Resource context order did not bind the clicked resource.");

// The player-side browser flow must visibly stage loose troops before a regiment is created.
var productionMovement = new SimulationWorld(map);
var productionWorld = new BrowserParityWorld(productionMovement, map, new StrategicRoutePlanner(map));
productionWorld.FranceEconomy.Food = 6000f;
productionWorld.FranceEconomy.Wood = 6000f;
productionWorld.AddBuilding(ArmySide.France, BuildingKind.TownCenter, new Float2(-30f, 0f));
productionWorld.AddBuilding(ArmySide.Britain, BuildingKind.TownCenter, new Float2(30f, 0f));
var productionBarracks = productionWorld.AddBuilding(ArmySide.France, BuildingKind.Barracks, new Float2(-27f, 2f));
for (var h = 0; h < 4; h++) productionWorld.AddBuilding(ArmySide.France, BuildingKind.House, new Float2(-32f + h * 1.5f, -4f));
productionWorld.RecalculatePopulationCap(ArmySide.France);
var playerProduction = new PlayerLooseProductionSystem(productionWorld);
Require(playerProduction.QueueTraining(productionBarracks.Id, UnitKind.Infantry), "Browser-style loose infantry could not be queued.");
for (var i = 0; i < 60 * 5; i++) playerProduction.Step(SimulationWorld.FixedStepSeconds);
Require(playerProduction.LooseCount(UnitKind.Infantry) == 0, "Loose infantry spawned before its six second training time.");
for (var i = 0; i < 75; i++) playerProduction.Step(SimulationWorld.FixedStepSeconds);
Require(playerProduction.LooseCount(UnitKind.Infantry) == 1, "Finished infantry was not represented as a visible loose unit.");
Require(productionMovement.Units.Count(u => u.Alive && u.Kind == UnitKind.Infantry) == 1, "Loose production did not enter the authoritative movement world.");

for (var n = 1; n < 12; n++)
{
    Require(playerProduction.QueueTraining(productionBarracks.Id, UnitKind.Infantry), $"Loose infantry queue failed at {n + 1}/12.");
    for (var i = 0; i < 60 * 7; i++) playerProduction.Step(SimulationWorld.FixedStepSeconds);
}
Require(playerProduction.QueueTraining(productionBarracks.Id, UnitKind.Officer), "Loose officer could not be queued.");
for (var i = 0; i < 60 * 11; i++) playerProduction.Step(SimulationWorld.FixedStepSeconds);
Require(playerProduction.QueueTraining(productionBarracks.Id, UnitKind.Drummer), "Loose drummer could not be queued.");
for (var i = 0; i < 60 * 8; i++) playerProduction.Step(SimulationWorld.FixedStepSeconds);
Require(playerProduction.LooseCount(UnitKind.Infantry) == 12 && playerProduction.LooseCount(UnitKind.Officer) == 1 && playerProduction.LooseCount(UnitKind.Drummer) == 1, "Loose 12+1+1 regiment material was not produced.");
Require(playerProduction.TryFormRegiment(playerProduction.LooseRegiments), "Twelve musketeers plus officer and drummer did not form a regiment.");
Require(playerProduction.LooseCount(UnitKind.Infantry) == 0 && playerProduction.LooseCount(UnitKind.Officer) == 0 && playerProduction.LooseCount(UnitKind.Drummer) == 0, "Loose material remained after regiment formation.");
Require(productionMovement.Regiments.Any(r => r.UnitIndices.Count == 14 && r.UnitIndices.Count(i => productionMovement.Units[i].Alive) == 14), "Formed regiment was not created in the authoritative movement world.");
Require(productionWorld.PopulationUsed(ArmySide.France) == 14, "Regiment formation changed committed population.");
Require(!playerProduction.QueueTraining(productionBarracks.Id, UnitKind.Cavalry) && !playerProduction.QueueTraining(productionBarracks.Id, UnitKind.Artillery), "Player Barracks should expose only browser-supported troop training.");

var woodBefore = gameplay.Resources.Where(r => r.Kind == ResourceKind.Wood).Sum(r => r.Amount);
for (var i = 0; i < 60 * 18; i++) gameplay.Step(SimulationWorld.FixedStepSeconds);
var woodAfter = gameplay.Resources.Where(r => r.Kind == ResourceKind.Wood).Sum(r => r.Amount);
Require(woodAfter < woodBefore, "Workers did not gather wood.");
Require(gameplay.Commander.ProductionTicks >= 8, "AI production did not tick.");
Require(gameplay.Combat.Rules.Weather == WeatherKind.Clear, "Initial weather should be clear.");

var french = gameplay.Movement.Regiments.First(r => r.Side == ArmySide.France && r.UnitIndices.Any(index => gameplay.Movement.Units[index].Kind == UnitKind.Infantry) && !r.UnitIndices.Any(index => gameplay.Movement.Units[index].Kind == UnitKind.Artillery));
var oldAnchor = french.Anchor;
var staminaBefore = french.UnitIndices.Average(index => gameplay.Combat.Get(gameplay.Movement.Units[index].Id).Stamina);
gameplay.QueueMoveCommand(new[] { french.Id }, oldAnchor + new Float2(3f, 0f));
Require(gameplay.PendingOrderCount == 1, "Delayed command was not queued.");
for (var i = 0; i < 180; i++) gameplay.Step(SimulationWorld.FixedStepSeconds);
Require(gameplay.PendingOrderCount == 0, "Delayed command never executed.");
Require(Float2.Distance(french.Anchor, oldAnchor) > .25f, "Queued regiment did not move.");
var staminaAfter = french.UnitIndices.Average(index => gameplay.Combat.Get(gameplay.Movement.Units[index].Id).Stamina);
Require(staminaAfter < staminaBefore, "Marching did not drain stamina.");
Require(gameplay.Combat.GetRegiment(french.Id).DisciplineFactor >= .35f, "Regiment discipline was not calculated.");

var woodPoint = BrowserBattlefieldMap.MapToNative(300, 450);
Require(gameplay.Combat.Rules.TerrainAt(woodPoint) == TacticalTerrainKind.Woods, "Browser woods were not ported to native terrain.");
Require(Math.Abs(gameplay.Combat.Rules.CoverFactor(woodPoint) - .82f) < .001f, "Woodland cover factor should be 0.82.");

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
fight.AddBuilding(ArmySide.France, BuildingKind.TownCenter, new Float2(-35f, -18f));
fight.AddBuilding(ArmySide.Britain, BuildingKind.TownCenter, new Float2(35f, 18f));
fight.Combat.SyncUnits();
for (var i = 0; i < 60 * 24; i++) fight.Step(SimulationWorld.FixedStepSeconds);
Require(fight.Combat.TotalShotsFired > 0, "Musket volley system never fired.");
Require(fight.Combat.TotalDeaths > 0 || fight.Combat.MeanMorale(ArmySide.France) < 99f || fight.Combat.MeanMorale(ArmySide.Britain) < 99f, "Combat caused neither casualties nor morale loss.");
Require(fight.Combat.Rules.Scars.Count == fight.Combat.TotalDeaths, "Battlefield death scars are not tracking casualties.");

// Compound artillery and building destruction are exercised separately.
var gunMovement = new SimulationWorld(map);
var battery = gunMovement.SpawnRegiment(ArmySide.France, new Float2(0f, 0f), 3, FormationKind.Line, 0f);
gunMovement.Units[battery.UnitIndices[0]].Kind = UnitKind.Artillery;
gunMovement.Units[battery.UnitIndices[1]].Kind = UnitKind.Infantry;
gunMovement.Units[battery.UnitIndices[2]].Kind = UnitKind.Infantry;
battery.Speed = .01f;
var siege = new BrowserParityWorld(gunMovement, map, new StrategicRoutePlanner(map));
siege.AddBuilding(ArmySide.France, BuildingKind.TownCenter, new Float2(-20f, -10f));
var targetTown = siege.AddBuilding(ArmySide.Britain, BuildingKind.TownCenter, new Float2(3.4f, 0f));
siege.Combat.SyncUnits();
Require(siege.Combat.CanArtilleryOperate(gunMovement.Units[battery.UnitIndices[0]]), "Artillery should operate with two living crew.");
var townHp = targetTown.HitPoints;
for (var i = 0; i < 60 * 8; i++) siege.Step(SimulationWorld.FixedStepSeconds);
Require(targetTown.HitPoints < townHp, "Native artillery did not attack an enemy building.");
gunMovement.Units[battery.UnitIndices[1]].Alive = false;
Require(!siege.Combat.CanArtilleryOperate(gunMovement.Units[battery.UnitIndices[0]]), "Artillery should stop operating after losing one of two required crew.");

// Commands unique to the browser game must exist and affect state.
var frenchCavalry = gameplay.Movement.Regiments.First(r => r.Side == ArmySide.France && r.UnitIndices.Any(index => gameplay.Movement.Units[index].Kind == UnitKind.Cavalry));
Require(gameplay.Combat.CavalryCharge(new[] { frenchCavalry.Id }), "Cavalry charge command did not apply.");
Require(frenchCavalry.UnitIndices.Any(index => gameplay.Combat.Get(gameplay.Movement.Units[index].Id).ChargeTimer > 0f), "Charge timer not set.");
var frenchArtillery = gameplay.Movement.Regiments.First(r => r.Side == ArmySide.France && r.UnitIndices.Any(index => gameplay.Movement.Units[index].Kind == UnitKind.Artillery));
Require(gameplay.Combat.ToggleArtillery(new[] { frenchArtillery.Id }), "Artillery ammo toggle did not apply.");
Require(frenchArtillery.UnitIndices.Where(index => gameplay.Movement.Units[index].Kind == UnitKind.Artillery).All(index => gameplay.Combat.Get(gameplay.Movement.Units[index].Id).ArtilleryMode == ArtilleryMode.GrapeShot), "Artillery did not switch to grapeshot.");
Require(gameplay.Combat.BayonetCommand(new[] { french.Id }), "Bayonet command did not apply.");

Console.WriteLine($"PASS browser parity core | units={gameplay.Movement.Units.Count} workers={gameplay.Workers.Count} buildings={gameplay.Buildings.Count} pop={gameplay.PopulationUsed(ArmySide.France)}/{gameplay.FranceEconomy.PopulationCap} looseFormation=14 resources={gameplay.Resources.Count} shots={fight.Combat.TotalShotsFired} deaths={fight.Combat.TotalDeaths} scars={fight.Combat.Rules.Scars.Count} artilleryBuildingDamage={townHp-targetTown.HitPoints:0.0} aiTicks={gameplay.Commander.ProductionTicks} aiState={gameplay.Commander.State}");
