using System;
using System.Collections.Generic;
using NapoleonicRTS.Simulation;
using UnityEngine;

namespace NapoleonicRTS.Runtime
{
    public sealed class InstancedUnitRenderer : IDisposable
    {
        private const int BatchSize = 1023;
        private readonly Matrix4x4[] _matrices = new Matrix4x4[BatchSize];
        private readonly Mesh _mesh;
        private readonly Material _france;
        private readonly Material _britain;
        private readonly Material _selected;
        private readonly RenderParams _franceParams;
        private readonly RenderParams _britainParams;
        private readonly RenderParams _selectedParams;

        public InstancedUnitRenderer()
        {
            _mesh = CreateArrowMesh();
            var shader = Shader.Find("NapoleonicRTS/InstancedUnit");
            if (shader == null) throw new InvalidOperationException("NapoleonicRTS/InstancedUnit shader not found.");
            _france = CreateMaterial(shader, new Color(0.18f, 0.34f, 0.78f, 1f));
            _britain = CreateMaterial(shader, new Color(0.74f, 0.16f, 0.15f, 1f));
            _selected = CreateMaterial(shader, new Color(0.96f, 0.78f, 0.18f, 1f));
            var bounds = new Bounds(Vector3.zero, new Vector3(220f, 160f, 10f));
            _franceParams = new RenderParams(_france) { worldBounds = bounds };
            _britainParams = new RenderParams(_britain) { worldBounds = bounds };
            _selectedParams = new RenderParams(_selected) { worldBounds = bounds };
        }

        public void Render(SimulationWorld world, float alpha, ISet<int> selectedRegiments)
        {
            RenderSide(world, ArmySide.France, alpha, _franceParams, selectedRegiments, false);
            RenderSide(world, ArmySide.Britain, alpha, _britainParams, selectedRegiments, false);
            if (selectedRegiments != null && selectedRegiments.Count > 0)
                RenderSide(world, ArmySide.France, alpha, _selectedParams, selectedRegiments, true);
        }

        private void RenderSide(SimulationWorld world, ArmySide side, float alpha, RenderParams renderParams, ISet<int> selectedRegiments, bool selectedOnly)
        {
            var count = 0;
            for (var i = 0; i < world.Units.Count; i++)
            {
                var unit = world.Units[i];
                if (!unit.Alive || unit.Side != side) continue;
                var selected = selectedRegiments != null && selectedRegiments.Contains(unit.RegimentId);
                if (selectedOnly != selected) continue;
                var p = Float2.Lerp(unit.PreviousPosition, unit.Position, alpha);
                var rotation = Quaternion.Euler(0f, 0f, unit.FacingRadians * Mathf.Rad2Deg);
                _matrices[count++] = Matrix4x4.TRS(new Vector3(p.X, p.Y, 0f), rotation, new Vector3(0.85f, 0.58f, 1f));
                if (count == BatchSize)
                {
                    Graphics.RenderMeshInstanced(renderParams, _mesh, 0, _matrices, count);
                    count = 0;
                }
            }
            if (count > 0) Graphics.RenderMeshInstanced(renderParams, _mesh, 0, _matrices, count);
        }

        private static Material CreateMaterial(Shader shader, Color color)
        {
            var material = new Material(shader) { enableInstancing = true, hideFlags = HideFlags.DontSave };
            material.SetColor("_Color", color);
            return material;
        }

        private static Mesh CreateArrowMesh()
        {
            var mesh = new Mesh { name = "Runtime Infantry Marker", hideFlags = HideFlags.DontSave };
            mesh.vertices = new[]
            {
                new Vector3(-0.45f, -0.34f, 0f),
                new Vector3(0.52f, 0f, 0f),
                new Vector3(-0.45f, 0.34f, 0f)
            };
            mesh.triangles = new[] { 0, 1, 2 };
            mesh.RecalculateBounds();
            return mesh;
        }

        public void Dispose()
        {
            if (Application.isPlaying)
            {
                UnityEngine.Object.Destroy(_france);
                UnityEngine.Object.Destroy(_britain);
                UnityEngine.Object.Destroy(_selected);
                UnityEngine.Object.Destroy(_mesh);
            }
            else
            {
                UnityEngine.Object.DestroyImmediate(_france);
                UnityEngine.Object.DestroyImmediate(_britain);
                UnityEngine.Object.DestroyImmediate(_selected);
                UnityEngine.Object.DestroyImmediate(_mesh);
            }
        }
    }
}
