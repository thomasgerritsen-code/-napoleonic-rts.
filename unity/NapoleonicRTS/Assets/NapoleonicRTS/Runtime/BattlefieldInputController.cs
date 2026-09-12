using NapoleonicRTS.Simulation;
using UnityEngine;

namespace NapoleonicRTS.Runtime
{
    public sealed class BattlefieldInputController : MonoBehaviour
    {
        private BattlefieldPrototype _battlefield;
        private Camera _camera;
        private Vector2 _dragStart;
        private Vector2 _dragCurrent;
        private bool _dragging;

        public void Initialize(BattlefieldPrototype battlefield, Camera camera)
        {
            _battlefield = battlefield;
            _camera = camera;
        }

        private void Update()
        {
#if ENABLE_LEGACY_INPUT_MANAGER
            if (_battlefield == null || _camera == null) return;
            if (Input.GetMouseButtonDown(0) && !PointerOverPanel())
            {
                _dragStart = Input.mousePosition;
                _dragCurrent = _dragStart;
                _dragging = true;
            }
            if (_dragging && Input.GetMouseButton(0)) _dragCurrent = Input.mousePosition;
            if (_dragging && Input.GetMouseButtonUp(0))
            {
                _dragCurrent = Input.mousePosition;
                var a = ScreenToBattlefield(_dragStart);
                var b = ScreenToBattlefield(_dragCurrent);
                if ((_dragCurrent - _dragStart).sqrMagnitude < 20f)
                {
                    a -= new Float2(1.4f, 1.4f);
                    b += new Float2(1.4f, 1.4f);
                }
                _battlefield.SelectFranceInRect(a, b, Input.GetKey(KeyCode.LeftShift) || Input.GetKey(KeyCode.RightShift));
                _dragging = false;
            }
            if (Input.GetMouseButtonDown(1) && !PointerOverPanel() && _battlefield.SelectedRegiments.Count > 0)
                _battlefield.MoveSelection(ScreenToBattlefield(Input.mousePosition));

            if (Input.GetKeyDown(KeyCode.Alpha1)) _battlefield.SetSelectionFormation(FormationKind.Line);
            if (Input.GetKeyDown(KeyCode.Alpha2)) _battlefield.SetSelectionFormation(FormationKind.Column);
            if (Input.GetKeyDown(KeyCode.Alpha3)) _battlefield.SetSelectionFormation(FormationKind.Square);
            if (Input.GetKeyDown(KeyCode.B)) _battlefield.BayonetCommand();
            if (Input.GetKeyDown(KeyCode.C)) _battlefield.CavalryCharge();
            if (Input.GetKeyDown(KeyCode.G)) _battlefield.ToggleArtillery();
#endif
        }

        private Float2 ScreenToBattlefield(Vector2 screen)
        {
            var ray = _camera.ScreenPointToRay(screen);
            var t = Mathf.Abs(ray.direction.z) < 1e-5f ? 0f : -ray.origin.z / ray.direction.z;
            var point = ray.origin + ray.direction * t;
            return new Float2(point.x, point.y);
        }

        private static bool PointerOverPanel()
        {
#if ENABLE_LEGACY_INPUT_MANAGER
            var mouse = Input.mousePosition;
            return mouse.x <= 420f && Screen.height - mouse.y <= 500f;
#else
            return false;
#endif
        }

        private void OnGUI()
        {
            if (!_dragging) return;
            var x = Mathf.Min(_dragStart.x, _dragCurrent.x);
            var y = Screen.height - Mathf.Max(_dragStart.y, _dragCurrent.y);
            var width = Mathf.Abs(_dragCurrent.x - _dragStart.x);
            var height = Mathf.Abs(_dragCurrent.y - _dragStart.y);
            GUI.Box(new Rect(x, y, width, height), GUIContent.none);
        }
    }
}
