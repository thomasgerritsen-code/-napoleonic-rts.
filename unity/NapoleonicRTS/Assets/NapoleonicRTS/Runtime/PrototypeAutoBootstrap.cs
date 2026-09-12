using UnityEngine;

namespace NapoleonicRTS.Runtime
{
    public static class PrototypeAutoBootstrap
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Boot()
        {
            var battlefield = Object.FindFirstObjectByType<BattlefieldPrototype>();
            if (battlefield == null)
            {
                var host = new GameObject("Napoleonic RTS Native Prototype");
                battlefield = host.AddComponent<BattlefieldPrototype>();
            }

            var mapRenderer = battlefield.GetComponent<StrategicMapRenderer>();
            if (mapRenderer == null)
            {
                mapRenderer = battlefield.gameObject.AddComponent<StrategicMapRenderer>();
                mapRenderer.Initialize(battlefield.Map);
            }

            var camera = Camera.main;
            if (camera == null)
            {
                var cameraObject = new GameObject("Main Camera") { tag = "MainCamera" };
                camera = cameraObject.AddComponent<Camera>();
                camera.transform.position = new Vector3(0f, 0f, -10f);
            }
            camera.orthographic = true;
            camera.orthographicSize = 31f;
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(0.26f, 0.34f, 0.20f, 1f);
            if (camera.GetComponent<PrototypeCameraController>() == null) camera.gameObject.AddComponent<PrototypeCameraController>();

            var input = battlefield.GetComponent<BattlefieldInputController>();
            if (input == null) input = battlefield.gameObject.AddComponent<BattlefieldInputController>();
            input.Initialize(battlefield, camera);
        }
    }
}
