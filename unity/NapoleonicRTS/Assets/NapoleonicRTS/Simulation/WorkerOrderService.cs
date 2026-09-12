using System;
using System.Collections.Generic;

namespace NapoleonicRTS.Simulation
{
    public static class WorkerOrderService
    {
        public static int IssueContextOrder(BrowserParityWorld world, IEnumerable<int> workerIds, Float2 target)
        {
            if (world == null || workerIds == null) return 0;
            var resource = ResourceAt(world, target);
            var building = resource == null ? ConstructionAt(world, target) : null;
            var ids = new List<int>();
            foreach (var id in workerIds) ids.Add(id);
            ids.Sort();

            var changed = 0;
            for (var i = 0; i < ids.Count; i++)
            {
                var worker = world.FindWorker(ids[i]);
                if (worker == null || !worker.Alive || worker.Side != ArmySide.France) continue;
                worker.ResourceId = 0;
                worker.BuildingId = 0;
                if (resource != null)
                {
                    worker.ResourceId = resource.Id;
                    worker.Target = resource.Position;
                    worker.Task = WorkerTask.Gather;
                }
                else if (building != null)
                {
                    worker.BuildingId = building.Id;
                    worker.Target = building.Position;
                    worker.Task = WorkerTask.Build;
                }
                else
                {
                    var column = i % 3;
                    var row = i / 3;
                    var offset = new Float2((column - 1) * .28f, row * .28f);
                    worker.Target = target + offset;
                    worker.Task = WorkerTask.Move;
                }
                changed++;
            }
            if (changed > 0)
                world.Status = resource != null ? "Arbeiders naar grondstof" : building != null ? "Arbeiders bouwen" : "Arbeiders verplaatsen";
            return changed;
        }

        public static void StepMoveTasks(BrowserParityWorld world, float dt)
        {
            if (world == null || !(dt > 0f)) return;
            for (var i = 0; i < world.Workers.Count; i++)
            {
                var worker = world.Workers[i];
                if (!worker.Alive || worker.Task != WorkerTask.Move) continue;
                worker.Position = Float2.MoveTowards(worker.Position, worker.Target, 1.44f * dt);
                if (Float2.Distance(worker.Position, worker.Target) <= .035f) worker.Task = WorkerTask.Idle;
            }
        }

        private static ResourceNodeState ResourceAt(BrowserParityWorld world, Float2 target)
        {
            ResourceNodeState best = null;
            var bestDistance = .90f;
            for (var i = 0; i < world.Resources.Count; i++)
            {
                var resource = world.Resources[i];
                if (resource.Depleted) continue;
                var distance = Float2.Distance(resource.Position, target);
                if (distance >= bestDistance) continue;
                bestDistance = distance;
                best = resource;
            }
            return best;
        }

        private static BuildingState ConstructionAt(BrowserParityWorld world, Float2 target)
        {
            BuildingState best = null;
            var bestDistance = 1.6f;
            for (var i = 0; i < world.Buildings.Count; i++)
            {
                var building = world.Buildings[i];
                if (building.Destroyed || building.Complete || building.Side != ArmySide.France) continue;
                var distance = Float2.Distance(building.Position, target);
                if (distance >= bestDistance) continue;
                bestDistance = distance;
                best = building;
            }
            return best;
        }
    }
}
