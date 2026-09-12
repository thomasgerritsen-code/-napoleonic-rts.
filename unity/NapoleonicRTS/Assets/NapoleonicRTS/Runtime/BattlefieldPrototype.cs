using NapoleonicRTS.Simulation;
using UnityEngine;

namespace NapoleonicRTS.Runtime
{
    public sealed class BattlefieldPrototype : MonoBehaviour
    {
        private SimulationWorld _world;
        private InstancedUnitRenderer _renderer;
        private float _accumulator;
        private float _alpha;
        private bool _home;
        private int _lastSteps;

        private void Awake()
        {
            Application.targetFrameRate = -1;
            QualitySettings.vSyncCount = 0;
            _world = new SimulationWorld();
            PrototypeScenario.Populate(_world);
            _renderer = new InstancedUnitRenderer();
        }

        private void Update()
        {
            _accumulator += Mathf.Min(Time.unscaledDeltaTime, 0.2f);
            var steps = 0;
            while (_accumulator >= SimulationWorld.FixedStepSeconds && steps < 8)
            {
                _world.Step(SimulationWorld.FixedStepSeconds);
                _accumulator -= SimulationWorld.FixedStepSeconds;
                steps++;
            }
            if (steps == 8 && _accumulator >= SimulationWorld.FixedStepSeconds) _accumulator = 0f;
            _lastSteps = steps;
            _alpha = Mathf.Clamp01(_accumulator / SimulationWorld.FixedStepSeconds);
        }

        private void LateUpdate() => _renderer?.Render(_world, _alpha);

        private void OnDestroy() => _renderer?.Dispose();

        private void OnGUI()
        {
            GUI.Box(new Rect(12, 12, 294, 174), "Napoleonic RTS — Native Prototype");
            GUI.Label(new Rect(24, 42, 260, 22), $"Units: {_world?.Units.Count ?? 0}  Regiments: {_world?.Regiments.Count ?? 0}");
            GUI.Label(new Rect(24, 62, 260, 22), $"Fixed sim: 60 Hz  Tick: {_world?.Tick ?? 0}  Steps/frame: {_lastSteps}");
            GUI.Label(new Rect(24, 82, 260, 22), $"Render: GPU instancing  FPS: {(1f / Mathf.Max(0.0001f, Time.unscaledDeltaTime)):0}");

            if (GUI.Button(new Rect(24, 110, 74, 26), "Line")) _world.SetFormationForAll(FormationKind.Line);
            if (GUI.Button(new Rect(104, 110, 74, 26), "Column")) _world.SetFormationForAll(FormationKind.Column);
            if (GUI.Button(new Rect(184, 110, 74, 26), "Square")) _world.SetFormationForAll(FormationKind.Square);
            if (GUI.Button(new Rect(24, 144, 234, 26), _home ? "March to centre" : "Return home"))
            {
                _home = !_home;
                PrototypeScenario.OrderMarch(_world, _home);
            }
        }
    }
}
