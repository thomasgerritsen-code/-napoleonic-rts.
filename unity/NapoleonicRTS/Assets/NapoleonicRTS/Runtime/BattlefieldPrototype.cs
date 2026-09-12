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
        private readonly List<int> _workerBuffer = new List<int>();
        private SimulationWorld _world;
        private BrowserParityWorld _gameplay;
        private StrategicMap _map;
        private StrategicRoutePlanner _planner;
        private InstancedUnitRenderer _renderer;
        private ParityEntityRenderer _parityRenderer;
        private float _accumulator;
        private float _alpha;
        private int _lastSteps;
        private string _scenarioName = "browser parity battle";
        private bool _stressMode;

        public SimulationWorld World => _world;
        public BrowserParityWorld Gameplay => _gameplay;
        public StrategicMap Map => _map;
        public ISet<int> SelectedRegiments => _selectedRegiments;
        public bool StressMode => _stressMode;

        private void Awake()
        {
            Application.targetFrameRate = -1;
            QualitySettings.vSyncCount = 0;
            _map = BrowserBattlefieldMap.Create();
            _planner = new StrategicRoutePlanner(_map);
            _renderer = new InstancedUnitRenderer();
            _parityRenderer = new ParityEntityRenderer();
            LoadGameplayScenario();
        }

        public void LoadGameplayScenario()
        {
            _gameplay = BrowserParityScenario.CreateGameplayWorld(_map);
            _world = _gameplay.Movement;
            _selectedRegiments.Clear();
            _accumulator = 0f;
            _stressMode = false;
            _scenarioName = "browser parity battle";
        }

        public void LoadStressScenario()
        {
            _gameplay = null;
            _world = new SimulationWorld();
            ScaleScenario.Populate(_world, 100, 50);
            _selectedRegiments.Clear();
            _accumulator = 0f;
            _stressMode = true;
            _scenarioName = "10k render/sim stress";
        }

        private void Update()
        {
            if (_world == null) return;
            _accumulator += Mathf.Min(Time.unscaledDeltaTime, 0.2f);
            var steps = 0;
            while (_accumulator >= SimulationWorld.FixedStepSeconds && steps < 8)
            {
                if (_gameplay != null) _gameplay.Step(SimulationWorld.FixedStepSeconds);
                else _world.Step(SimulationWorld.FixedStepSeconds);
                _accumulator -= SimulationWorld.FixedStepSeconds;
                steps++;
            }
            if (steps == 8 && _accumulator >= SimulationWorld.FixedStepSeconds) _accumulator = 0f;
            _lastSteps = steps;
            _alpha = Mathf.Clamp01(_accumulator / SimulationWorld.FixedStepSeconds);
        }

        private void LateUpdate()
        {
            _renderer?.Render(_world, _alpha, _selectedRegiments);
            if (_gameplay != null) _parityRenderer?.Render(_gameplay);
        }

        private void OnDestroy()
        {
            _renderer?.Dispose();
            _parityRenderer?.Dispose();
        }

        public void SelectFranceInRect(Float2 a, Float2 b, bool additive)
        {
            SelectionQuery.RegimentsInRect(_world, ArmySide.France, a, b, _selectionBuffer);
            if (!additive) _selectedRegiments.Clear();
            for (var i = 0; i < _selectionBuffer.Count; i++) _selectedRegiments.Add(_selectionBuffer[i]);
        }

        public void MoveSelection(Float2 target)
        {
            CopySelectionToCommandBuffer();
            if (_commandBuffer.Count == 0) return;
            if (_gameplay != null) _gameplay.QueueMoveCommand(_commandBuffer, target);
            else RegimentCommandService.MoveRegiments(_world, _commandBuffer, target, 5.5f, null);
        }

        public void SetSelectionFormation(FormationKind formation)
        {
            CopySelectionToCommandBuffer();
            if (_commandBuffer.Count == 0)
            {
                if (_gameplay == null) _world.SetFormationForAll(formation);
                return;
            }
            if (_gameplay != null) _gameplay.SetFormation(_commandBuffer, formation);
            else RegimentCommandService.SetFormation(_world, _commandBuffer, formation);
        }

        public void BayonetCommand()
        {
            if (_gameplay == null) return;
            CopySelectionToCommandBuffer();
            _gameplay.Combat.BayonetCommand(_commandBuffer);
        }

        public void CavalryCharge()
        {
            if (_gameplay == null) return;
            CopySelectionToCommandBuffer();
            _gameplay.Combat.CavalryCharge(_commandBuffer);
        }

        public void ToggleArtillery()
        {
            if (_gameplay == null) return;
            CopySelectionToCommandBuffer();
            _gameplay.Combat.ToggleArtillery(_commandBuffer);
        }

        private void QuickTrain(UnitKind kind)
        {
            if (_gameplay == null) return;
            BuildingState building = null;
            for (var i = 0; i < _gameplay.Buildings.Count; i++)
            {
                var candidate = _gameplay.Buildings[i];
                if (candidate.Destroyed || !candidate.Complete || candidate.Side != ArmySide.France) continue;
                if (kind == UnitKind.Worker && candidate.Kind == BuildingKind.TownCenter) { building = candidate; break; }
                if (kind != UnitKind.Worker && candidate.Kind == BuildingKind.Barracks) { building = candidate; break; }
            }
            if (building == null) return;
            if (kind == UnitKind.Worker)
            {
                var e = _gameplay.FranceEconomy;
                if (e.Food < 50f || _gameplay.PopulationUsed(ArmySide.France) >= e.PopulationCap) return;
                e.Food -= 50f;
                _gameplay.AddWorker(ArmySide.France, building.Position + new Float2(1.2f, 0f));
                _gameplay.Status = "Arbeider getraind";
                return;
            }
            if (_gameplay.QueueTraining(ArmySide.France, building.Id, kind))
                _gameplay.Status = $"{kind} in trainingswachtrij";
        }

        private void QuickBuild(BuildingKind kind)
        {
            if (_gameplay == null) return;
            _workerBuffer.Clear();
            for (var i = 0; i < _gameplay.Workers.Count && _workerBuffer.Count < 2; i++)
            {
                var worker = _gameplay.Workers[i];
                if (worker.Alive && worker.Side == ArmySide.France && worker.Task != WorkerTask.Build)
                    _workerBuffer.Add(worker.Id);
            }
            var tc = _gameplay.FindBuilding(ArmySide.France, BuildingKind.TownCenter);
            if (tc == null || _workerBuffer.Count == 0) return;
            var count = 0;
            for (var i = 0; i < _gameplay.Buildings.Count; i++) if (!_gameplay.Buildings[i].Destroyed && _gameplay.Buildings[i].Side == ArmySide.France && _gameplay.Buildings[i].Kind == kind) count++;
            var position = tc.Position + new Float2(2.8f + count * 1.4f, kind == BuildingKind.Barracks ? 3.2f : -3.0f);
            if (_gameplay.BeginConstruction(ArmySide.France, kind, position, _workerBuffer))
                _gameplay.Status = kind == BuildingKind.House ? "House in aanbouw" : "Barracks in aanbouw";
        }

        private void CopySelectionToCommandBuffer()
        {
            _commandBuffer.Clear();
            foreach (var id in _selectedRegiments) _commandBuffer.Add(id);
            _commandBuffer.Sort();
        }

        private float SelectedMorale()
        {
            if (_gameplay == null || _selectedRegiments.Count == 0) return 100f;
            var sum = 0f; var n = 0;
            foreach (var id in _selectedRegiments)
            {
                var state = _gameplay.Combat.GetRegiment(id);
                if (state == null) continue;
                sum += state.Morale; n++;
            }
            return n == 0 ? 100f : sum / n;
        }

        private void OnGUI()
        {
            if (_world == null) return;
            var maxCompression = 0f;
            for (var i = 0; i < _world.Regiments.Count; i++) if (_world.Regiments[i].BridgeCompression > maxCompression) maxCompression = _world.Regiments[i].BridgeCompression;

            GUI.Box(new Rect(12, 12, 392, _gameplay != null ? 466 : 256), "Napoleonic RTS — Unity Native");
            GUI.Label(new Rect(24, 42, 360, 22), $"Scenario: {_scenarioName}");
            GUI.Label(new Rect(24, 62, 360, 22), $"Units: {_world.Units.Count}  Regiments: {_world.Regiments.Count}  Selected: {_selectedRegiments.Count}");
            GUI.Label(new Rect(24, 82, 360, 22), $"Fixed sim 60 Hz · Tick {_world.Tick} · Steps/frame {_lastSteps} · FPS {(1f / Mathf.Max(.0001f, Time.unscaledDeltaTime)):0}");
            GUI.Label(new Rect(24, 102, 360, 22), $"Bridge compression: {maxCompression * 100f:0}% · GPU-instanced rendering");

            if (_gameplay == null)
            {
                if (GUI.Button(new Rect(24, 138, 165, 28), "Load gameplay")) LoadGameplayScenario();
                if (GUI.Button(new Rect(199, 138, 165, 28), "Reload 10k stress")) LoadStressScenario();
                GUI.Label(new Rect(24, 178, 350, 44), "10,000 soldaten / 200 regimenten\nMovement + formation GPU stress test");
                return;
            }

            var e = _gameplay.FranceEconomy;
            GUI.Label(new Rect(24, 130, 360, 22), $"🇫🇷 Food {e.Food:0} · Wood {e.Wood:0} · Pop {_gameplay.PopulationUsed(ArmySide.France)}/{e.PopulationCap} · Workers {_gameplay.Workers.FindAll(w => w.Alive && w.Side == ArmySide.France).Count}");
            GUI.Label(new Rect(24, 150, 360, 22), $"Selected morale {SelectedMorale():0}% · Shots {_gameplay.Combat.TotalShotsFired} · Losses {_gameplay.Combat.TotalDeaths}");
            GUI.Label(new Rect(24, 170, 360, 22), $"Objective: 🇫🇷 {_gameplay.Objective.FranceScore}/{_gameplay.Objective.TargetScore} · 🇬🇧 {_gameplay.Objective.BritainScore}/{_gameplay.Objective.TargetScore}");
            GUI.Label(new Rect(24, 190, 360, 22), $"AI: {_gameplay.Commander.State} · {_gameplay.Commander.Plan}");
            GUI.Label(new Rect(24, 210, 360, 22), $"Status: {_gameplay.Status} · Pending orders {_gameplay.PendingOrderCount}");

            if (GUI.Button(new Rect(24, 240, 108, 26), "Line [1]")) SetSelectionFormation(FormationKind.Line);
            if (GUI.Button(new Rect(140, 240, 108, 26), "Column [2]")) SetSelectionFormation(FormationKind.Column);
            if (GUI.Button(new Rect(256, 240, 108, 26), "Square [3]")) SetSelectionFormation(FormationKind.Square);

            if (GUI.Button(new Rect(24, 274, 108, 26), "Bayonet [B]")) BayonetCommand();
            if (GUI.Button(new Rect(140, 274, 108, 26), "Cavalry [C]")) CavalryCharge();
            if (GUI.Button(new Rect(256, 274, 108, 26), "Round/Grape [G]")) ToggleArtillery();

            if (GUI.Button(new Rect(24, 308, 82, 26), "Worker")) QuickTrain(UnitKind.Worker);
            if (GUI.Button(new Rect(112, 308, 82, 26), "Infantry")) QuickTrain(UnitKind.Infantry);
            if (GUI.Button(new Rect(200, 308, 82, 26), "Officer")) QuickTrain(UnitKind.Officer);
            if (GUI.Button(new Rect(288, 308, 76, 26), "Drummer")) QuickTrain(UnitKind.Drummer);

            if (GUI.Button(new Rect(24, 342, 108, 26), "Build House")) QuickBuild(BuildingKind.House);
            if (GUI.Button(new Rect(140, 342, 108, 26), "Build Barracks")) QuickBuild(BuildingKind.Barracks);
            if (GUI.Button(new Rect(256, 342, 108, 26), "Form reserve")) _gameplay.TryFormReserveRegiment(ArmySide.France);

            if (GUI.Button(new Rect(24, 382, 165, 28), "Reset battle")) LoadGameplayScenario();
            if (GUI.Button(new Rect(199, 382, 165, 28), "Stress 10k")) LoadStressScenario();

            if (_gameplay.Victory != VictorySide.None)
                GUI.Label(new Rect(24, 420, 350, 28), _gameplay.Victory == VictorySide.France ? "FRANSE OVERWINNING" : "BRITSE OVERWINNING");
        }
    }
}
