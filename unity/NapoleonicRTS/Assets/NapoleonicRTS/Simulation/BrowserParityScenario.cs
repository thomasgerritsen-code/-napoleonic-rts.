using System;

namespace NapoleonicRTS.Simulation
{
    public static class BrowserParityScenario
    {
        public static void PopulateMovement(SimulationWorld world)
        {
            if (world == null) throw new ArgumentNullException(nameof(world));
            for (var i = 0; i < 4; i++)
            {
                var y = 620f + i * 210f;
                SpawnInfantryRegiment(world, ArmySide.France, BrowserBattlefieldMap.MapToNative(900f, y), 0f);
                SpawnInfantryRegiment(world, ArmySide.Britain, BrowserBattlefieldMap.MapToNative(3400f, y), MathF.PI);
            }
            SpawnTypedRegiment(world, ArmySide.France, BrowserBattlefieldMap.MapToNative(1050f, 1550f), 8, UnitKind.Cavalry, FormationKind.Column, 0f, 1.96f);
            SpawnTypedRegiment(world, ArmySide.Britain, BrowserBattlefieldMap.MapToNative(3250f, 1550f), 8, UnitKind.Cavalry, FormationKind.Column, MathF.PI, 1.96f);
            SpawnTypedRegiment(world, ArmySide.France, BrowserBattlefieldMap.MapToNative(850f, 430f), 3, UnitKind.Artillery, FormationKind.Line, 0f, .62f);
            SpawnTypedRegiment(world, ArmySide.Britain, BrowserBattlefieldMap.MapToNative(3450f, 430f), 3, UnitKind.Artillery, FormationKind.Line, MathF.PI, .62f);
        }

        public static BrowserParityWorld CreateGameplayWorld(StrategicMap map)
        {
            var movement = new SimulationWorld(map);
            PopulateMovement(movement);
            var parity = new BrowserParityWorld(movement, map, new StrategicRoutePlanner(map));
            SeedEconomy(parity);
            parity.Combat.SyncUnits();
            for (var i = 0; i < movement.Regiments.Count; i++) parity.Combat.RegisterRegiment(movement.Regiments[i]);
            return parity;
        }

        public static void SeedEconomy(BrowserParityWorld world)
        {
            var fTc = world.AddBuilding(ArmySide.France, BuildingKind.TownCenter, BrowserBattlefieldMap.MapToNative(650f, 900f));
            var bTc = world.AddBuilding(ArmySide.Britain, BuildingKind.TownCenter, BrowserBattlefieldMap.MapToNative(3650f, 900f));
            world.AddBuilding(ArmySide.France, BuildingKind.Barracks, BrowserBattlefieldMap.MapToNative(820f, 1160f));
            world.AddBuilding(ArmySide.Britain, BuildingKind.Barracks, BrowserBattlefieldMap.MapToNative(3480f, 1160f));
            world.AddBuilding(ArmySide.France, BuildingKind.House, BrowserBattlefieldMap.MapToNative(700f, 1260f));
            world.AddBuilding(ArmySide.Britain, BuildingKind.House, BrowserBattlefieldMap.MapToNative(3600f, 1260f));

            // Resources must exist before initial worker assignment. This keeps both the human
            // and AI economy active immediately instead of relying on the AI idle-worker fallback.
            AddResourceCluster(world, ResourceKind.Wood, 520f, 580f);
            AddResourceCluster(world, ResourceKind.Food, 760f, 620f);
            AddResourceCluster(world, ResourceKind.Wood, 3780f, 580f);
            AddResourceCluster(world, ResourceKind.Food, 3540f, 620f);
            AddResourceCluster(world, ResourceKind.Wood, 2050f, 370f);
            AddResourceCluster(world, ResourceKind.Food, 2200f, 1750f);

            for (var i = 0; i < 8; i++)
            {
                var fy = (i - 3.5f) * .55f;
                var fw = world.AddWorker(ArmySide.France, fTc.Position + new Float2(1.3f + (i % 2) * .35f, fy));
                var bw = world.AddWorker(ArmySide.Britain, bTc.Position + new Float2(-1.3f - (i % 2) * .35f, fy));
                world.AssignWorkerToNearestResource(fw.Id, i % 2 == 0 ? ResourceKind.Food : ResourceKind.Wood);
                world.AssignWorkerToNearestResource(bw.Id, i % 2 == 0 ? ResourceKind.Food : ResourceKind.Wood);
            }

            world.RecalculatePopulationCap(ArmySide.France);
            world.RecalculatePopulationCap(ArmySide.Britain);
        }

        private static void SpawnInfantryRegiment(SimulationWorld world, ArmySide side, Float2 anchor, float facing)
        {
            var reg = world.SpawnRegiment(side, anchor, 20, FormationKind.Line, facing);
            reg.Speed = 1.14f;
            var count = reg.UnitIndices.Count;
            world.Units[reg.UnitIndices[count - 2]].Kind = UnitKind.Officer;
            world.Units[reg.UnitIndices[count - 1]].Kind = UnitKind.Drummer;
        }

        private static void SpawnTypedRegiment(SimulationWorld world, ArmySide side, Float2 anchor, int count, UnitKind kind, FormationKind formation, float facing, float speed)
        {
            var reg = world.SpawnRegiment(side, anchor, count, formation, facing);
            reg.Speed = speed;
            for (var i = 0; i < reg.UnitIndices.Count; i++) world.Units[reg.UnitIndices[i]].Kind = kind;
        }

        private static void AddResourceCluster(BrowserParityWorld world, ResourceKind kind, float browserX, float browserY)
        {
            for (var i = 0; i < 6; i++)
            {
                var angle = i / 6f * MathF.PI * 2f;
                world.AddResource(kind, BrowserBattlefieldMap.MapToNative(browserX + MathF.Cos(angle) * 75f, browserY + MathF.Sin(angle) * 55f), 650f);
            }
        }
    }
}
