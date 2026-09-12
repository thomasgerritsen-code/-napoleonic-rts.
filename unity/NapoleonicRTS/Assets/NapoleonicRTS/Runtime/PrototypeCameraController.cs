using NapoleonicRTS.Simulation;
using UnityEngine;

namespace NapoleonicRTS.Runtime
{
    [RequireComponent(typeof(Camera))]
    public sealed class PrototypeCameraController : MonoBehaviour
    {
        [SerializeField] private float moveSpeed = 28f;
        [SerializeField] private float zoomFactor = .90f;
        [SerializeField] private float minSize = 7f;
        [SerializeField] private float maxSize = 31f;
        private Camera _camera;

        private void Awake()
        {
            _camera = GetComponent<Camera>();
            ClampToMap();
        }

        private void Update()
        {
#if ENABLE_LEGACY_INPUT_MANAGER
            var x = 0f;
            var y = 0f;
            if (Input.GetKey(KeyCode.A) || Input.GetKey(KeyCode.LeftArrow)) x -= 1f;
            if (Input.GetKey(KeyCode.D) || Input.GetKey(KeyCode.RightArrow)) x += 1f;
            if (Input.GetKey(KeyCode.S) || Input.GetKey(KeyCode.DownArrow)) y -= 1f;
            if (Input.GetKey(KeyCode.W) || Input.GetKey(KeyCode.UpArrow)) y += 1f;
            var delta = new Vector3(x, y, 0f).normalized * (moveSpeed * _camera.orthographicSize / 32f * Time.unscaledDeltaTime);
            transform.position += delta;

            var wheel = Input.mouseScrollDelta.y;
            if (Mathf.Abs(wheel) > .01f)
            {
                var before = ScreenToWorld(Input.mousePosition);
                var factor = wheel > 0f ? zoomFactor : 1f / zoomFactor;
                _camera.orthographicSize = Mathf.Clamp(_camera.orthographicSize * factor, minSize, maxSize);
                var after = ScreenToWorld(Input.mousePosition);
                transform.position += new Vector3(before.x - after.x, before.y - after.y, 0f);
            }
            ClampToMap();
#endif
        }

        private Vector3 ScreenToWorld(Vector3 screen)
        {
            var ray = _camera.ScreenPointToRay(screen);
            var t = Mathf.Abs(ray.direction.z) < 1e-5f ? 0f : -ray.origin.z / ray.direction.z;
            return ray.origin + ray.direction * t;
        }

        private void ClampToMap()
        {
            if (_camera == null || !_camera.orthographic) return;
            var worldHalfWidth = BrowserBattlefieldMap.BrowserWidth / BrowserBattlefieldMap.PixelsPerNativeUnit * .5f;
            var worldHalfHeight = BrowserBattlefieldMap.BrowserHeight / BrowserBattlefieldMap.PixelsPerNativeUnit * .5f;
            var visibleHalfHeight = Mathf.Min(worldHalfHeight, _camera.orthographicSize);
            var visibleHalfWidth = Mathf.Min(worldHalfWidth, _camera.orthographicSize * Mathf.Max(.25f, _camera.aspect));
            var limitX = Mathf.Max(0f, worldHalfWidth - visibleHalfWidth);
            var limitY = Mathf.Max(0f, worldHalfHeight - visibleHalfHeight);
            var p = transform.position;
            p.x = Mathf.Clamp(p.x, -limitX, limitX);
            p.y = Mathf.Clamp(p.y, -limitY, limitY);
            transform.position = p;
        }
    }
}
