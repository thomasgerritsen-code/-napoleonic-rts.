using System;

namespace UnityEngine
{
    public class Object
    {
        public string name { get; set; }
        public HideFlags hideFlags { get; set; }
        public static void Destroy(Object value) { }
        public static void DestroyImmediate(Object value) { }
        public static T FindFirstObjectByType<T>() where T : Object => null;
    }

    public class Component : Object
    {
        public GameObject gameObject { get; internal set; } = new GameObject(false);
        public Transform transform => gameObject.transform;
        public T GetComponent<T>() where T : Component => null;
    }

    public class Behaviour : Component { }
    public class MonoBehaviour : Behaviour { }

    public sealed class GameObject : Object
    {
        public Transform transform { get; } = new Transform();
        public string tag { get; set; }
        public GameObject(string name = "") { this.name = name; }
        internal GameObject(bool initialize) { }
        public T AddComponent<T>() where T : Component, new()
        {
            var c = new T();
            c.gameObject = this;
            return c;
        }
    }

    public sealed class Transform
    {
        public Vector3 position;
        public void SetParent(Transform parent, bool worldPositionStays) { }
    }

    public sealed class Camera : Behaviour
    {
        public static Camera main => null;
        public bool orthographic { get; set; }
        public float orthographicSize { get; set; }
        public float aspect { get; set; } = 16f / 9f;
        public CameraClearFlags clearFlags { get; set; }
        public Color backgroundColor { get; set; }
        public Ray ScreenPointToRay(Vector3 position) => new Ray { origin = transform.position, direction = new Vector3(0f, 0f, 1f) };
        public Ray ScreenPointToRay(Vector2 position) => ScreenPointToRay((Vector3)position);
    }

    public struct Ray { public Vector3 origin; public Vector3 direction; }

    public struct Vector2
    {
        public float x, y;
        public Vector2(float x, float y) { this.x = x; this.y = y; }
        public float sqrMagnitude => x * x + y * y;
        public static Vector2 operator -(Vector2 a, Vector2 b) => new Vector2(a.x - b.x, a.y - b.y);
        public static implicit operator Vector2(Vector3 value) => new Vector2(value.x, value.y);
        public static implicit operator Vector3(Vector2 value) => new Vector3(value.x, value.y, 0f);
    }

    public struct Vector3
    {
        public float x, y, z;
        public Vector3(float x, float y, float z) { this.x = x; this.y = y; this.z = z; }
        public Vector3 normalized
        {
            get
            {
                var m = MathF.Sqrt(x * x + y * y + z * z);
                return m <= 1e-6f ? new Vector3() : new Vector3(x / m, y / m, z / m);
            }
        }
        public static Vector3 zero => new Vector3(0f, 0f, 0f);
        public static Vector3 operator +(Vector3 a, Vector3 b) => new Vector3(a.x + b.x, a.y + b.y, a.z + b.z);
        public static Vector3 operator -(Vector3 a, Vector3 b) => new Vector3(a.x - b.x, a.y - b.y, a.z - b.z);
        public static Vector3 operator *(Vector3 a, float b) => new Vector3(a.x * b, a.y * b, a.z * b);
        public static Vector3 operator *(float b, Vector3 a) => a * b;
    }

    public struct Quaternion
    {
        public static Quaternion identity => new Quaternion();
        public static Quaternion Euler(float x, float y, float z) => new Quaternion();
    }

    public struct Matrix4x4
    {
        public static Matrix4x4 TRS(Vector3 position, Quaternion rotation, Vector3 scale) => new Matrix4x4();
    }

    public struct Color
    {
        public float r, g, b, a;
        public Color(float r, float g, float b, float a = 1f) { this.r = r; this.g = g; this.b = b; this.a = a; }
    }

    public struct Bounds
    {
        public Vector3 center, size;
        public Bounds(Vector3 center, Vector3 size) { this.center = center; this.size = size; }
    }

    public struct Rect
    {
        public float x, y, width, height;
        public Rect(float x, float y, float width, float height) { this.x = x; this.y = y; this.width = width; this.height = height; }
    }

    public sealed class GUIContent
    {
        public static GUIContent none => new GUIContent();
    }

    public static class GUI
    {
        public static bool enabled { get; set; } = true;
        public static void Box(Rect rect, string text) { }
        public static void Box(Rect rect, GUIContent content) { }
        public static void Label(Rect rect, string text) { }
        public static bool Button(Rect rect, string text) => false;
    }

    public class Shader : Object
    {
        public static Shader Find(string name) => new Shader();
    }

    public class Material : Object
    {
        public bool enableInstancing { get; set; }
        public Material(Shader shader) { }
        public Material(Material other) { }
        public void SetColor(string name, Color color) { }
    }

    public class Mesh : Object
    {
        public Vector3[] vertices { get; set; }
        public int[] triangles { get; set; }
        public void RecalculateBounds() { }
    }

    public struct RenderParams
    {
        public Material material;
        public Bounds worldBounds;
        public RenderParams(Material material) { this.material = material; worldBounds = default; }
    }

    public static class Graphics
    {
        public static void RenderMeshInstanced(RenderParams renderParams, Mesh mesh, int submeshIndex, Matrix4x4[] instanceData, int instanceCount = -1, int startInstance = 0) { }
    }

    public sealed class LineRenderer : Component
    {
        public bool useWorldSpace { get; set; }
        public int positionCount { get; set; }
        public float startWidth { get; set; }
        public float endWidth { get; set; }
        public int numCapVertices { get; set; }
        public int numCornerVertices { get; set; }
        public int sortingOrder { get; set; }
        public Material material { get; set; }
        public void SetPosition(int index, Vector3 position) { }
    }

    public static class Mathf
    {
        public const float PI = MathF.PI;
        public const float Rad2Deg = 57.2957795f;
        public static float Abs(float value) => MathF.Abs(value);
        public static float Max(float a, float b) => MathF.Max(a, b);
        public static float Min(float a, float b) => MathF.Min(a, b);
        public static float Clamp(float value, float min, float max) => Math.Clamp(value, min, max);
        public static float Clamp01(float value) => Math.Clamp(value, 0f, 1f);
        public static float Sin(float value) => MathF.Sin(value);
        public static float Cos(float value) => MathF.Cos(value);
    }

    public static class Input
    {
        public static Vector3 mousePosition => Vector3.zero;
        public static Vector2 mouseScrollDelta => new Vector2();
        public static bool GetMouseButtonDown(int button) => false;
        public static bool GetMouseButton(int button) => false;
        public static bool GetMouseButtonUp(int button) => false;
        public static bool GetKey(KeyCode key) => false;
        public static bool GetKeyDown(KeyCode key) => false;
    }

    public enum KeyCode
    {
        A, B, C, D, G, S, W,
        LeftArrow, RightArrow, DownArrow, UpArrow,
        LeftShift, RightShift, Escape,
        Alpha1, Alpha2, Alpha3
    }

    public static class Screen
    {
        public static int width => 1920;
        public static int height => 1080;
    }

    public static class Time
    {
        public static float unscaledDeltaTime => 1f / 60f;
    }

    public static class Application
    {
        public static int targetFrameRate { get; set; }
        public static bool isPlaying => true;
    }

    public static class QualitySettings
    {
        public static int vSyncCount { get; set; }
    }

    public enum HideFlags { DontSave }
    public enum CameraClearFlags { SolidColor }

    [AttributeUsage(AttributeTargets.Class, AllowMultiple = true)]
    public sealed class RequireComponent : Attribute
    {
        public RequireComponent(Type type) { }
    }

    [AttributeUsage(AttributeTargets.Field)]
    public sealed class SerializeField : Attribute { }

    [AttributeUsage(AttributeTargets.Method)]
    public sealed class RuntimeInitializeOnLoadMethodAttribute : Attribute
    {
        public RuntimeInitializeOnLoadMethodAttribute(RuntimeInitializeLoadType loadType) { }
    }

    public enum RuntimeInitializeLoadType { AfterSceneLoad }
}
