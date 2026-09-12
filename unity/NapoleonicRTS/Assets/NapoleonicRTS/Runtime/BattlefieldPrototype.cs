using System.Collections.Generic;
using NapoleonicRTS.Simulation;
using UnityEngine;

namespace NapoleonicRTS.Runtime
{
    public sealed class BattlefieldPrototype : MonoBehaviour
    {
        private readonly HashSet<int> _selectedRegiments = new HashSet<int>();
        private readonly List<int> _selectionBuffer = new List<int>();
        private readonly List<int> _commandBuffer = new List<int>();
        private SimulationWorld _world;
        private InstancedUnitRenderer _renderer;
        private float _accumulator;
        private float _alpha;
        private bool _home;
        private int _lastSteps;

        public SimulationWorld World => _world;
        public ISet<int> SelectedRegiments => _selectedRegiments;

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

        private void LateUpdate() => _renderer?.Render(_world, _alpha, _selectedRegiments);
        private void OnDestroy() => _renderer?.Dispose();

        public void SelectFranceInRect(Float2 a, Float2 b, bool additive)
        {
            SelectionQuery.RegimentsInRect(_world, ArmySide.France, a, b, _selectionBuffer);
            if (!additive) _selectedRegiments.Clear();
            for (var i = 0; i < _selectionBuffer.Count; i++) _selectedRegiments.Add(_selectionBuffer[i]);
        }

        public void MoveSelection(Float2 target)
        {
            CopySelectionToCommandBuffer();
            RegimentCommandService.MoveRegiments(_world, _commandBuffer, target, 9f);
        }

        public void SetSelectionFormation(FormationKind formation)
        {
            CopySelectionToCommandBuffer();
            if (_commandBuffer.Count == 0) _world.SetFormationForAll(formation);
            else RegimentCommandService.SetFormation(_world, _commandBuffer, formation);
        }

        private void CopySelectionToCommandBuffer()
        {
            _commandBuffer.Clear();
            foreach (var id in _selectedRegiments) _commandBuffer.Add(id);
            _commandBuffer.Sort();
        }

        private void OnGUI()
        {
            GUI.Box(new Rect(12, 12, 312, 194), "Napoleonic RTS — Native Prototype");
            GUI.Label(new Rect(24, 42, 280, 22), $"Units: {_world?.Units.Count ?? 0}  Regiments: {_world?.Regiments.Count ?? 0}");
            GUI.Label(new Rect(24, 62, 280, 22), $"Selected regiments: {_selectedRegiments.Count}");
            GUI.Label(new Rect(24, 82, 280, 22), $"Fixed sim: 60 Hz  Tick: {_world?.Tick ?? 0}  Steps/frame: {_lastSteps}");
            GUI.Label(new Rect(24, 102, 280, 22), $"GPU instances · FPS: {(1f / Mathf.Max(0.0001f, Time.unscaledDeltaTime)):0}");

            if (GUI.Button(new Rect(24, 130, 82, 26), "Line")) SetSelectionFormation(FormationKind.Line);
            if (GUI.Button(new Rect(112, 130, 82, 26), "Column")) SetSelectionFormation(FormationKind.Column);
            if (GUI.Button(new Rect(200, 130, 82, 26), "Square")) SetSelectionFormation(FormationKind.Square);
            if (GUI.Button(new Rect(24, 164, 258, 26), _home ? "March to centre" : "Return home"))
            {
                _home = !_home;
                PrototypeScenario.OrderMarch(_world, _home);
            }
        }
    }
}
