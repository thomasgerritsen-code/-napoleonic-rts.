using System;
using NapoleonicRTS.Simulation;
using UnityEngine;

namespace NapoleonicRTS.Runtime
{
    public sealed class BattlefieldEnvironmentRenderer : IDisposable
    {
        private readonly struct RectVisual
        {
            public readonly Float2 Centre;
            public readonly Vector3 Scale;
            public RectVisual(Float2 centre, Vector3 scale) { Centre = centre; Scale = scale; }
        }

        private readonly struct HillVisual
        {
            public readonly Float2 Centre;
            public readonly Vector3 Scale;
            public HillVisual(Float2 centre, Vector3 scale) { Centre = centre; Scale = scale; }
        }

        private readonly Matrix4x4[] _woodsMatrices = new Matrix4x4[5];
        private readonly Matrix4x4[] _hillMatrices = new Matrix4x4[3];
        private readonly Matrix4x4[] _weatherMatrices = new Matrix4x4[72];
        private readonly Mesh _quad;
        private readonly Mesh _circle;
        private readonly Material _woods;
        private readonly Material _hill;
        private readonly Material _mist;
        private readonly Material _rain;
        private readonly Material _evening;
        private readonly Bounds _bounds = new Bounds(Vector3.zero, new Vector3(100f, 70f, 10f));

        private static readonly RectVisual[] Woods =
        {
            BrowserRect(250,390,720,430), BrowserRect(1320,250,540,430),
            BrowserRect(2350,360,720,440), BrowserRect(2350,1190,760,430),
            BrowserRect(3150,1480,500,420)
        };

        private static readonly HillVisual[] Hills =
        {
            BrowserHill(1540,1160,340,230), BrowserHill(2150,520,300,200), BrowserHill(3260,980,260,190)
        };

        public BattlefieldEnvironmentRenderer()
        {
            _quad = CreateQuad();
            _circle = CreateCircle(36);
            var shader = Shader.Find("NapoleonicRTS/InstancedUnit");
            if (shader == null) throw new InvalidOperationException("NapoleonicRTS/InstancedUnit shader not found.");
            _woods = CreateMaterial(shader, new Color(.12f, .25f, .10f, .28f));
            _hill = CreateMaterial(shader, new Color(.52f, .44f, .27f, .20f));
            _mist = CreateMaterial(shader, new Color(.82f, .84f, .82f, .14f));
            _rain = CreateMaterial(shader, new Color(.78f, .86f, .92f, .34f));
            _evening = CreateMaterial(shader, new Color(.31f, .22f, .20f, .10f));

            for (var i = 0; i < Woods.Length; i++)
                _woodsMatrices[i] = Matrix4x4.TRS(new Vector3(Woods[i].Centre.X, Woods[i].Centre.Y, -.30f), Quaternion.identity, Woods[i].Scale);
            for (var i = 0; i < Hills.Length; i++)
                _hillMatrices[i] = Matrix4x4.TRS(new Vector3(Hills[i].Centre.X, Hills[i].Centre.Y, -.31f), Quaternion.identity, Hills[i].Scale);
            BuildRainMatrices();
        }

        public void Render(BrowserParityWorld world)
        {
            if (world == null) return;
            Graphics.RenderMeshInstanced(new RenderParams(_woods) { worldBounds = _bounds }, _quad, 0, _woodsMatrices, _woodsMatrices.Length);
            Graphics.RenderMeshInstanced(new RenderParams(_hill) { worldBounds = _bounds }, _circle, 0, _hillMatrices, _hillMatrices.Length);

            var rules = world.Combat.Rules;
            if (rules.Weather == WeatherKind.Mist)
            {
                _weatherMatrices[0] = Matrix4x4.TRS(new Vector3(0f, 0f, .42f), Quaternion.identity,
                    new Vector3(BrowserBattlefieldMap.BrowserWidth / BrowserBattlefieldMap.PixelsPerNativeUnit,
                        BrowserBattlefieldMap.BrowserHeight / BrowserBattlefieldMap.PixelsPerNativeUnit, 1f));
                Graphics.RenderMeshInstanced(new RenderParams(_mist) { worldBounds = _bounds }, _quad, 0, _weatherMatrices, 1);
            }
            else if (rules.Weather == WeatherKind.Rain)
            {
                Graphics.RenderMeshInstanced(new RenderParams(_rain) { worldBounds = _bounds }, _quad, 0, _weatherMatrices, 64);
            }

            if (rules.TimeOfDay == TimeOfDayKind.Evening)
            {
                _weatherMatrices[70] = Matrix4x4.TRS(new Vector3(0f, 0f, .43f), Quaternion.identity,
                    new Vector3(BrowserBattlefieldMap.BrowserWidth / BrowserBattlefieldMap.PixelsPerNativeUnit,
                        BrowserBattlefieldMap.BrowserHeight / BrowserBattlefieldMap.PixelsPerNativeUnit, 1f));
                Graphics.RenderMeshInstanced(new RenderParams(_evening) { worldBounds = _bounds }, _quad, 0, _weatherMatrices, 1, 70);
            }
        }

        private void BuildRainMatrices()
        {
            for (var i = 0; i < 64; i++)
            {
                var x = -42f + ((i * 17) % 84);
                var y = -24f + ((i * 29) % 48);
                _weatherMatrices[i] = Matrix4x4.TRS(new Vector3(x, y, .44f), Quaternion.Euler(0f, 0f, 74f), new Vector3(.035f, 1.5f, 1f));
            }
        }

        private static RectVisual BrowserRect(float x, float y, float w, float h)
        {
            var a = BrowserBattlefieldMap.MapToNative(x, y);
            var b = BrowserBattlefieldMap.MapToNative(x + w, y + h);
            return new RectVisual((a + b) * .5f, new Vector3(Mathf.Abs(b.X - a.X), Mathf.Abs(b.Y - a.Y), 1f));
        }

        private static HillVisual BrowserHill(float x, float y, float rx, float ry)
        {
            var centre = BrowserBattlefieldMap.MapToNative(x, y);
            var edgeX = BrowserBattlefieldMap.MapToNative(x + rx, y);
            var edgeY = BrowserBattlefieldMap.MapToNative(x, y + ry);
            return new HillVisual(centre, new Vector3(Mathf.Abs(edgeX.X - centre.X) * 2f, Mathf.Abs(edgeY.Y - centre.Y) * 2f, 1f));
        }

        private static Material CreateMaterial(Shader shader, Color color)
        {
            var material = new Material(shader) { enableInstancing = true, hideFlags = HideFlags.DontSave };
            material.SetColor("_Color", color);
            return material;
        }

        private static Mesh CreateQuad()
        {
            var mesh = new Mesh { name = "Runtime Environment Quad", hideFlags = HideFlags.DontSave };
            mesh.vertices = new[]
            {
                new Vector3(-.5f,-.5f,0f), new Vector3(.5f,-.5f,0f),
                new Vector3(.5f,.5f,0f), new Vector3(-.5f,.5f,0f)
            };
            mesh.triangles = new[] { 0,1,2, 0,2,3 };
            mesh.RecalculateBounds();
            return mesh;
        }

        private static Mesh CreateCircle(int segments)
        {
            var mesh = new Mesh { name = "Runtime Environment Circle", hideFlags = HideFlags.DontSave };
            var vertices = new Vector3[segments + 1];
            var triangles = new int[segments * 3];
            vertices[0] = Vector3.zero;
            for (var i = 0; i < segments; i++)
            {
                var angle = i / (float)segments * Mathf.PI * 2f;
                vertices[i + 1] = new Vector3(Mathf.Cos(angle) * .5f, Mathf.Sin(angle) * .5f, 0f);
                triangles[i * 3] = 0;
                triangles[i * 3 + 1] = i + 1;
                triangles[i * 3 + 2] = (i + 1) % segments + 1;
            }
            mesh.vertices = vertices;
            mesh.triangles = triangles;
            mesh.RecalculateBounds();
            return mesh;
        }

        public void Dispose()
        {
            Destroy(_woods); Destroy(_hill); Destroy(_mist); Destroy(_rain); Destroy(_evening);
            Destroy(_quad); Destroy(_circle);
        }

        private static void Destroy(UnityEngine.Object value)
        {
            if (value == null) return;
            if (Application.isPlaying) UnityEngine.Object.Destroy(value);
            else UnityEngine.Object.DestroyImmediate(value);
        }
    }
}
