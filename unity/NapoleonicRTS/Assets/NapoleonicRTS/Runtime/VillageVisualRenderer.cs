using System;
using System.Collections.Generic;
using NapoleonicRTS.Simulation;
using UnityEngine;

namespace NapoleonicRTS.Runtime
{
    public sealed class VillageVisualRenderer : IDisposable
    {
        private readonly Mesh _quad;
        private readonly Material _yard;
        private readonly Material _cottage;
        private readonly Material _farmhouse;
        private readonly Material _barn;
        private readonly Material _civic;
        private readonly Matrix4x4[] _yards;
        private readonly Matrix4x4[] _cottages;
        private readonly Matrix4x4[] _farmhouses;
        private readonly Matrix4x4[] _barns;
        private readonly Matrix4x4[] _civicBuildings;
        private readonly Bounds _bounds = new Bounds(Vector3.zero, new Vector3(100f, 70f, 10f));

        public NativeVillageLayout Layout { get; }

        public VillageVisualRenderer(StrategicMap map)
        {
            Layout = NativeVillageLayout.Create(map);
            _quad = CreateQuad();
            var shader = Shader.Find("NapoleonicRTS/InstancedUnit");
            if (shader == null) throw new InvalidOperationException("NapoleonicRTS/InstancedUnit shader not found.");
            _yard = CreateMaterial(shader, new Color(.42f, .38f, .25f, .14f));
            _cottage = CreateMaterial(shader, new Color(.45f, .28f, .18f, .96f));
            _farmhouse = CreateMaterial(shader, new Color(.52f, .35f, .21f, .96f));
            _barn = CreateMaterial(shader, new Color(.34f, .19f, .13f, .96f));
            _civic = CreateMaterial(shader, new Color(.58f, .48f, .34f, .98f));

            var yards = new List<Matrix4x4>();
            var cottages = new List<Matrix4x4>();
            var farms = new List<Matrix4x4>();
            var barns = new List<Matrix4x4>();
            var civic = new List<Matrix4x4>();
            for (var i = 0; i < Layout.Structures.Count; i++)
            {
                var s = Layout.Structures[i];
                yards.Add(Matrix4x4.TRS(new Vector3(s.Position.X, s.Position.Y, -.20f), Quaternion.Euler(0f, 0f, s.AngleRadians * Mathf.Rad2Deg), new Vector3(s.Width * 1.65f, s.Height * 2.0f, 1f)));
                var roof = Matrix4x4.TRS(new Vector3(s.Position.X, s.Position.Y, -.10f), Quaternion.Euler(0f, 0f, s.AngleRadians * Mathf.Rad2Deg), new Vector3(s.Width, s.Height, 1f));
                switch (s.Kind)
                {
                    case VillageStructureKind.Barn: barns.Add(roof); break;
                    case VillageStructureKind.Farmhouse: farms.Add(roof); break;
                    case VillageStructureKind.Inn:
                    case VillageStructureKind.Chapel: civic.Add(roof); break;
                    default: cottages.Add(roof); break;
                }
            }
            _yards = yards.ToArray();
            _cottages = cottages.ToArray();
            _farmhouses = farms.ToArray();
            _barns = barns.ToArray();
            _civicBuildings = civic.ToArray();
        }

        public void Render()
        {
            RenderBatch(_yard, _yards);
            RenderBatch(_cottage, _cottages);
            RenderBatch(_farmhouse, _farmhouses);
            RenderBatch(_barn, _barns);
            RenderBatch(_civic, _civicBuildings);
        }

        private void RenderBatch(Material material, Matrix4x4[] matrices)
        {
            if (matrices == null || matrices.Length == 0) return;
            Graphics.RenderMeshInstanced(new RenderParams(material) { worldBounds = _bounds }, _quad, 0, matrices, matrices.Length);
        }

        private static Material CreateMaterial(Shader shader, Color color)
        {
            var material = new Material(shader) { enableInstancing = true, hideFlags = HideFlags.DontSave };
            material.SetColor("_Color", color);
            return material;
        }

        private static Mesh CreateQuad()
        {
            var mesh = new Mesh { name = "Runtime Village Roof", hideFlags = HideFlags.DontSave };
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
            Destroy(_yard); Destroy(_cottage); Destroy(_farmhouse); Destroy(_barn); Destroy(_civic); Destroy(_quad);
        }

        private static void Destroy(UnityEngine.Object value)
        {
            if (value == null) return;
            if (Application.isPlaying) UnityEngine.Object.Destroy(value);
            else UnityEngine.Object.DestroyImmediate(value);
        }
    }
}
