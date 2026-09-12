using System;
using System.Collections.Generic;
using NapoleonicRTS.Simulation;
using UnityEngine;

namespace NapoleonicRTS.Runtime
{
    public sealed class InstancedUnitRenderer : IDisposable
    {
        private const int BatchSize = 1023;
        private readonly Matrix4x4[][] _batches = new Matrix4x4[6][];
        private readonly int[] _counts = new int[6];
        private readonly Mesh _infantryMesh;
        private readonly Mesh _officerMesh;
        private readonly Mesh _drummerMesh;
        private readonly Mesh _cavalryMesh;
        private readonly Mesh _artilleryMesh;
        private readonly Material _france;
        private readonly Material _britain;
        private readonly Material _selected;
        private readonly RenderParams _franceParams;
        private readonly RenderParams _britainParams;
        private readonly RenderParams _selectedParams;

        public InstancedUnitRenderer()
        {
            for (var i = 0; i < _batches.Length; i++) _batches[i] = new Matrix4x4[BatchSize];
            _infantryMesh = CreateArrowMesh("Infantry", .50f, .34f);
            _officerMesh = CreateDiamondMesh("Officer");
            _drummerMesh = CreateDrumMesh();
            _cavalryMesh = CreateArrowMesh("Cavalry", .62f, .28f);
            _artilleryMesh = CreateArtilleryMesh();

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

        public void Render(SimulationWorld world, float alpha, ISet<int> selectedRegiments, BrowserParityWorld gameplay = null)
        {
            if (world == null) return;
            RenderSide(world, ArmySide.France, alpha, _franceParams, null, false, gameplay);
            RenderSide(world, ArmySide.Britain, alpha, _britainParams, null, false, gameplay);
            if (selectedRegiments != null && selectedRegiments.Count > 0)
                RenderSide(world, ArmySide.France, alpha, _selectedParams, selectedRegiments, true, gameplay);
        }

        private void RenderSide(SimulationWorld world, ArmySide side, float alpha, RenderParams renderParams, ISet<int> selectedRegiments, bool selectedOnly, BrowserParityWorld gameplay)
        {
            Array.Clear(_counts, 0, _counts.Length);
            for (var i = 0; i < world.Units.Count; i++)
            {
                var unit = world.Units[i];
                if (!unit.Alive || unit.Side != side || unit.Kind == UnitKind.Worker) continue;
                if (side == ArmySide.Britain && gameplay != null && !gameplay.Combat.Rules.CanSee(ArmySide.France, unit)) continue;
                if (selectedOnly && (selectedRegiments == null || !selectedRegiments.Contains(unit.RegimentId))) continue;

                var kindIndex = (int)unit.Kind;
                if (kindIndex <= 0 || kindIndex >= _batches.Length) continue;
                var p = Float2.Lerp(unit.PreviousPosition, unit.Position, alpha);
                p = ArtilleryCrewVisualPosition(world, unit, p, alpha, gameplay);
                var scale = ScaleFor(unit.Kind, selectedOnly);
                ApplyMarchVisual(world, unit, gameplay, ref p, ref scale);
                var rotation = Quaternion.Euler(0f, 0f, unit.FacingRadians * Mathf.Rad2Deg);
                var count = _counts[kindIndex];
                _batches[kindIndex][count] = Matrix4x4.TRS(new Vector3(p.X, p.Y, selectedOnly ? .18f : .12f), rotation, scale);
                count++;
                _counts[kindIndex] = count;
                if (count != BatchSize) continue;
                Graphics.RenderMeshInstanced(renderParams, MeshFor(unit.Kind), 0, _batches[kindIndex], count);
                _counts[kindIndex] = 0;
            }

            for (var kindIndex = 1; kindIndex < _counts.Length; kindIndex++)
            {
                var count = _counts[kindIndex];
                if (count <= 0) continue;
                Graphics.RenderMeshInstanced(renderParams, MeshFor((UnitKind)kindIndex), 0, _batches[kindIndex], count);
            }
        }

        private static Float2 ArtilleryCrewVisualPosition(SimulationWorld world, UnitState unit, Float2 fallback, float alpha, BrowserParityWorld gameplay)
        {
            if (gameplay == null) return fallback;
            var combat = gameplay.Combat.Get(unit.Id);
            if (combat == null || !combat.ArtilleryCrew) return fallback;
            var regiment = world.FindRegiment(unit.RegimentId);
            if (regiment == null) return fallback;

            UnitState cannon = null;
            var crewOrdinal = 0;
            var seenCrew = 0;
            for (var i = 0; i < regiment.UnitIndices.Count; i++)
            {
                var member = world.Units[regiment.UnitIndices[i]];
                if (member.Kind == UnitKind.Artillery) cannon = member;
                var memberCombat = gameplay.Combat.Get(member.Id);
                if (memberCombat == null || !memberCombat.ArtilleryCrew) continue;
                if (member.Id == unit.Id) crewOrdinal = seenCrew;
                seenCrew++;
            }
            if (cannon == null) return fallback;

            var cannonPosition = Float2.Lerp(cannon.PreviousPosition, cannon.Position, alpha);
            var moving = regiment.Moving || Float2.Distance(cannon.PreviousPosition, cannon.Position) > .002f;
            var forward = Float2.FromAngle(cannon.FacingRadians);
            var right = new Float2(-forward.Y, forward.X);
            var forwardOffset = moving ? -.56f : -.18f;
            var lateralOffset = (crewOrdinal == 0 ? -1f : 1f) * (moving ? .28f : .48f);
            return cannonPosition + forward * forwardOffset + right * lateralOffset;
        }

        private static void ApplyMarchVisual(SimulationWorld world, UnitState unit, BrowserParityWorld gameplay, ref Float2 position, ref Vector3 scale)
        {
            var moved = Float2.Distance(unit.PreviousPosition, unit.Position);
            if (moved <= .001f || unit.Kind == UnitKind.Artillery) return;
            var combat = gameplay?.Combat.Get(unit.Id);
            if (combat != null && combat.ArtilleryCrew) return;

            var roadMarch = gameplay != null && gameplay.Combat.Rules.TerrainAt(position) == TacticalTerrainKind.Road;
            var time = world.Tick * SimulationWorld.FixedStepSeconds;
            var cadence = unit.Kind == UnitKind.Cavalry ? 9.4f : unit.Kind == UnitKind.Drummer ? 7.8f : 6.8f;
            var identityPhase = roadMarch ? unit.RegimentId * .31f : unit.Id * 1.173f;
            var phase = time * cadence + identityPhase;
            var amplitude = unit.Kind == UnitKind.Cavalry ? .075f : .038f;
            var facing = Float2.FromAngle(unit.FacingRadians);
            var right = new Float2(-facing.Y, facing.X);
            position += right * (Mathf.Sin(phase) * amplitude);
            scale.y *= 1f + Mathf.Cos(phase * 2f) * (unit.Kind == UnitKind.Cavalry ? .055f : .035f);

            if (combat != null && combat.ChargeTimer > 0f)
            {
                position += facing * .035f;
                scale.x *= 1.07f;
            }
        }

        private Mesh MeshFor(UnitKind kind)
        {
            switch (kind)
            {
                case UnitKind.Officer: return _officerMesh;
                case UnitKind.Drummer: return _drummerMesh;
                case UnitKind.Cavalry: return _cavalryMesh;
                case UnitKind.Artillery: return _artilleryMesh;
                default: return _infantryMesh;
            }
        }

        private static Vector3 ScaleFor(UnitKind kind, bool selected)
        {
            Vector3 scale;
            switch (kind)
            {
                case UnitKind.Officer: scale = new Vector3(.74f, .74f, 1f); break;
                case UnitKind.Drummer: scale = new Vector3(.66f, .66f, 1f); break;
                case UnitKind.Cavalry: scale = new Vector3(1.10f, .74f, 1f); break;
                case UnitKind.Artillery: scale = new Vector3(1.05f, .90f, 1f); break;
                default: scale = new Vector3(.82f, .68f, 1f); break;
            }
            return selected ? scale * 1.18f : scale;
        }

        private static Material CreateMaterial(Shader shader, Color color)
        {
            var material = new Material(shader) { enableInstancing = true, hideFlags = HideFlags.DontSave };
            material.SetColor("_Color", color);
            return material;
        }

        private static Mesh CreateArrowMesh(string name, float nose, float halfHeight)
        {
            var mesh = new Mesh { name = $"Runtime {name} Marker", hideFlags = HideFlags.DontSave };
            mesh.vertices = new[]
            {
                new Vector3(-.45f, -halfHeight, 0f),
                new Vector3(nose, 0f, 0f),
                new Vector3(-.45f, halfHeight, 0f)
            };
            mesh.triangles = new[] { 0, 1, 2 };
            mesh.RecalculateBounds();
            return mesh;
        }

        private static Mesh CreateDiamondMesh(string name)
        {
            var mesh = new Mesh { name = $"Runtime {name} Marker", hideFlags = HideFlags.DontSave };
            mesh.vertices = new[]
            {
                new Vector3(.50f,0f,0f), new Vector3(0f,.42f,0f),
                new Vector3(-.50f,0f,0f), new Vector3(0f,-.42f,0f)
            };
            mesh.triangles = new[] { 0,1,2, 0,2,3 };
            mesh.RecalculateBounds();
            return mesh;
        }

        private static Mesh CreateDrumMesh()
        {
            var mesh = new Mesh { name = "Runtime Drummer Marker", hideFlags = HideFlags.DontSave };
            mesh.vertices = new[]
            {
                new Vector3(-.42f,-.34f,0f), new Vector3(.42f,-.34f,0f),
                new Vector3(.42f,.34f,0f), new Vector3(-.42f,.34f,0f)
            };
            mesh.triangles = new[] { 0,1,2, 0,2,3 };
            mesh.RecalculateBounds();
            return mesh;
        }

        private static Mesh CreateArtilleryMesh()
        {
            var mesh = new Mesh { name = "Runtime Artillery Marker", hideFlags = HideFlags.DontSave };
            mesh.vertices = new[]
            {
                new Vector3(-.44f,-.30f,0f), new Vector3(.20f,-.30f,0f), new Vector3(.20f,.30f,0f), new Vector3(-.44f,.30f,0f),
                new Vector3(.12f,-.10f,0f), new Vector3(.66f,-.10f,0f), new Vector3(.66f,.10f,0f), new Vector3(.12f,.10f,0f)
            };
            mesh.triangles = new[] { 0,1,2, 0,2,3, 4,5,6, 4,6,7 };
            mesh.RecalculateBounds();
            return mesh;
        }

        public void Dispose()
        {
            Destroy(_france); Destroy(_britain); Destroy(_selected);
            Destroy(_infantryMesh); Destroy(_officerMesh); Destroy(_drummerMesh); Destroy(_cavalryMesh); Destroy(_artilleryMesh);
        }

        private static void Destroy(UnityEngine.Object value)
        {
            if (value == null) return;
            if (Application.isPlaying) UnityEngine.Object.Destroy(value);
            else UnityEngine.Object.DestroyImmediate(value);
        }
    }
}
