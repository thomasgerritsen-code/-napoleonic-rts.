using NapoleonicRTS.Simulation;
using UnityEngine;

namespace NapoleonicRTS.Runtime
{
    public sealed class StrategicMapRenderer : MonoBehaviour
    {
        private Material _material;

        public void Initialize(StrategicMap map)
        {
            var shader = Shader.Find("NapoleonicRTS/InstancedUnit");
            _material = new Material(shader) { hideFlags = HideFlags.DontSave };
            CreateLine("River", map.RiverPoints, map.RiverNavigationHalfWidth * 0.8f, new Color(0.20f, 0.46f, 0.61f, 1f), -20);
            for (var i = 0; i < map.Roads.Count; i++)
            {
                var road = map.Roads[i];
                var color = road.RoadClass == RoadClass.Chaussee ? new Color(0.62f,0.55f,0.40f,1f) : road.RoadClass == RoadClass.Secondary ? new Color(0.51f,0.39f,0.25f,1f) : new Color(0.39f,0.29f,0.20f,1f);
                CreateLine(road.Name, road.Points, road.Width, color, -10);
            }
            for (var i = 0; i < map.Crossings.Count; i++) CreateCrossing(map.Crossings[i]);
        }

        private void CreateCrossing(CrossingDefinition crossing)
        {
            var forward = Float2.FromAngle(crossing.AngleRadians);
            var a = crossing.Centre - forward * (crossing.Length * 0.5f);
            var b = crossing.Centre + forward * (crossing.Length * 0.5f);
            CreateLine(crossing.Name, new[] { a, b }, crossing.Width * 0.72f, crossing.Type == CrossingType.Ford ? new Color(0.61f,0.52f,0.35f,1f) : new Color(0.76f,0.69f,0.52f,1f), -5);
        }

        private void CreateLine(string name, Float2[] points, float width, Color color, int sortingOrder)
        {
            var go = new GameObject(name);
            go.transform.SetParent(transform, false);
            var line = go.AddComponent<LineRenderer>();
            line.useWorldSpace = true;
            line.positionCount = points.Length;
            line.startWidth = width;
            line.endWidth = width;
            line.numCapVertices = 3;
            line.numCornerVertices = 3;
            line.sortingOrder = sortingOrder;
            var material = new Material(_material) { hideFlags = HideFlags.DontSave };
            material.SetColor("_Color", color);
            line.material = material;
            for (var i = 0; i < points.Length; i++) line.SetPosition(i, new Vector3(points[i].X, points[i].Y, 0.15f));
        }

        private void OnDestroy()
        {
            if (_material != null) Destroy(_material);
        }
    }
}
