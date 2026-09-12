using UnityEngine;

namespace NapoleonicRTS.Runtime
{
    [RequireComponent(typeof(Camera))]
    public sealed class PrototypeCameraController : MonoBehaviour
    {
        [SerializeField] private float moveSpeed = 28f;
        [SerializeField] private float zoomSpeed = 5f;
        [SerializeField] private float minSize = 8f;
        [SerializeField] private float maxSize = 55f;
        private Camera _camera;

        private void Awake() => _camera = GetComponent<Camera>();

        private void Update()
        {
            var x = 0f;
            var y = 0f;
            if (Input.GetKey(KeyCode.A) || Input.GetKey(KeyCode.LeftArrow)) x -= 1f;
            if (Input.GetKey(KeyCode.D) || Input.GetKey(KeyCode.RightArrow)) x += 1f;
            if (Input.GetKey(KeyCode.S) || Input.GetKey(KeyCode.DownArrow)) y -= 1f;
            if (Input.GetKey(KeyCode.W) || Input.GetKey(KeyCode.UpArrow)) y += 1f;
            var delta = new Vector3(x, y, 0f).normalized * (moveSpeed * _camera.orthographicSize / 32f * Time.unscaledDeltaTime);
            transform.position += delta;
            var wheel = Input.mouseScrollDelta.y;
            if (Mathf.Abs(wheel) > 0.01f)
                _camera.orthographicSize = Mathf.Clamp(_camera.orthographicSize - wheel * zoomSpeed, minSize, maxSize);
        }
    }
}
