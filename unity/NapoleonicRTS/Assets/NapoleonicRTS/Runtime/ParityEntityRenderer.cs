using System;
using System.Collections.Generic;
using NapoleonicRTS.Simulation;
using UnityEngine;

namespace NapoleonicRTS.Runtime
{
    public sealed class ParityEntityRenderer : IDisposable
    {
        private const int BatchSize = 1023;
        private readonly Matrix4x4[] _matrices = new Matrix4x4[BatchSize];
        private readonly Mesh _quad;
        private readonly Material _wood;
        private readonly Material _food;
        private readonly Material _franceWorker;
        private readonly Material _britainWorker;
        private readonly Material _franceBuilding;
        private readonly Material _britainBuilding;
        private readonly Material _projectile;
        private readonly Material _smoke;
        private readonly Material _impact;
        private readonly Material _objective;
        private readonly Bounds _bounds = new Bounds(Vector3.zero, new Vector3(220f, 160f, 20f));

        public ParityEntityRenderer()
        {
            _quad = CreateQuad();
            var shader = Shader.Find("NapoleonicRTS/InstancedUnit");
            if (shader == null) throw new InvalidOperationException("NapoleonicRTS/InstancedUnit shader not found.");
            _wood = CreateMaterial(shader, new Color(.18f, .38f, .16f, 1f));
            _food = CreateMaterial(shader, new Color(.78f, .64f, .22f, 1f));
            _franceWorker = CreateMaterial(shader, new Color(.30f, .48f, .86f, 1f));
            _britainWorker = CreateMaterial(shader, new Color(.82f, .30f, .27f, 1f));
            _franceBuilding = CreateMaterial(shader, new Color(.33f, .42f, .62f, 1f));
            _britainBuilding = CreateMaterial(shader, new Color(.58f, .31f, .27f, 1f));
            _projectile = CreateMaterial(shader, new Color(.95f, .86f, .57f, 1f));
            _smoke = CreateMaterial(shader, new Color(.58f, .58f, .55f, .72f));
            _impact = CreateMaterial(shader, new Color(.74f, .58f, .35f, .9f));
            _objective = CreateMaterial(shader, new Color(.95f, .78f, .18f, .88f));
        }

        public void Render(BrowserParityWorld world)
        {
            if (world == null) return;
            RenderResources(world);
            RenderWorkers(world);
            RenderBuildings(world);
            RenderProjectiles(world.Combat.Projectiles);
            RenderParticles(world.Combat.Particles, false);
            RenderParticles(world.Combat.Particles, true);
            RenderObjectives(world.Objective);
        }

        private void RenderResources(BrowserParityWorld world)
        {
            RenderList(world.Resources, _wood, r => !r.Depleted && r.Kind == ResourceKind.Wood,
                r => Matrix4x4.TRS(V(r.Position, .03f), Quaternion.identity, new Vector3(.44f, .44f, 1f)));
            RenderList(world.Resources, _food, r => !r.Depleted && r.Kind == ResourceKind.Food,
                r => Matrix4x4.TRS(V(r.Position, .03f), Quaternion.identity, new Vector3(.36f, .28f, 1f)));
        }

        private void RenderWorkers(BrowserParityWorld world)
        {
            RenderList(world.Workers, _franceWorker, w => w.Alive && w.Side == ArmySide.France,
                w => Matrix4x4.TRS(V(w.Position, .11f), Quaternion.identity, new Vector3(.25f, .25f, 1f)));
            RenderList(world.Workers, _britainWorker, w => w.Alive && w.Side == ArmySide.Britain,
                w => Matrix4x4.TRS(V(w.Position, .11f), Quaternion.identity, new Vector3(.25f, .25f, 1f)));
        }

        private void RenderBuildings(BrowserParityWorld world)
        {
            RenderList(world.Buildings, _franceBuilding, b => !b.Destroyed && b.Side == ArmySide.France,
                b => Matrix4x4.TRS(V(b.Position, .02f), Quaternion.identity, new Vector3(b.Width, b.Height, 1f)));
            RenderList(world.Buildings, _britainBuilding, b => !b.Destroyed && b.Side == ArmySide.Britain,
                b => Matrix4x4.TRS(V(b.Position, .02f), Quaternion.identity, new Vector3(b.Width, b.Height, 1f)));
        }

        private void RenderProjectiles(List<ProjectileState> projectiles)
        {
            RenderList(projectiles, _projectile, p => !p.Dead,
                p => Matrix4x4.TRS(V(p.Position, .22f), Quaternion.identity, new Vector3(p.Artillery ? .16f : .07f, p.Artillery ? .16f : .07f, 1f)));
        }

        private void RenderParticles(List<ParticleState> particles, bool impacts)
        {
            RenderList(particles, impacts ? _impact : _smoke, p => p.Life > 0f && p.Impact == impacts,
                p => Matrix4x4.TRS(V(p.Position, .25f), Quaternion.identity, new Vector3(Mathf.Max(.05f, p.Size), Mathf.Max(.05f, p.Size), 1f)));
        }

        private void RenderObjectives(ObjectiveState objective)
        {
            if (objective == null) return;
            RenderList(objective.Points, _objective, p => true,
                p => Matrix4x4.TRS(V(p.Position, -.02f), Quaternion.Euler(0f, 0f, 45f), new Vector3(.72f, .72f, 1f)));
        }

        private void RenderList<T>(IList<T> source, Material material, Func<T, bool> include, Func<T, Matrix4x4> matrix)
        {
            var count = 0;
            var renderParams = new RenderParams(material) { worldBounds = _bounds };
            for (var i = 0; i < source.Count; i++)
            {
                var item = source[i];
                if (!include(item)) continue;
                _matrices[count++] = matrix(item);
                if (count != BatchSize) continue;
                Graphics.RenderMeshInstanced(renderParams, _quad, 0, _matrices, count);
                count = 0;
            }
            if (count > 0) Graphics.RenderMeshInstanced(renderParams, _quad, 0, _matrices, count);
        }

        private static Vector3 V(Float2 p, float z) => new Vector3(p.X, p.Y, z);

        private static Material CreateMaterial(Shader shader, Color color)
        {
            var material = new Material(shader) { enableInstancing = true, hideFlags = HideFlags.DontSave };
            material.SetColor("_Color", color);
            return material;
        }

        private static Mesh CreateQuad()
        {
            var mesh = new Mesh { name = "Runtime Parity Quad", hideFlags = HideFlags.DontSave };
            mesh.vertices = new[]
            {
                new Vector3(-.5f,-.5f,0f), new Vector3(.5f,-.5f,0f),
                new Vector3(.5f,.5f,0f), new Vector3(-.5f,.5f,0f)
            };
            mesh.triangles = new[] { 0,1,2, 0,2,3 };
            mesh.RecalculateBounds();
            return mesh;
        }

        public void Dispose()
        {
            Destroy(_wood); Destroy(_food); Destroy(_franceWorker); Destroy(_britainWorker);
            Destroy(_franceBuilding); Destroy(_britainBuilding); Destroy(_projectile);
            Destroy(_smoke); Destroy(_impact); Destroy(_objective); Destroy(_quad);
        }

        private static void Destroy(UnityEngine.Object value)
        {
            if (value == null) return;
            if (Application.isPlaying) UnityEngine.Object.Destroy(value);
            else UnityEngine.Object.DestroyImmediate(value);
        }
    }
}
