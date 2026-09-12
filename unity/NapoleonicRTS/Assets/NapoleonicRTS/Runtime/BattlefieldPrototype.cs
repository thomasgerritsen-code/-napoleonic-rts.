using System.Collections.Generic;
using NapoleonicRTS.Simulation;
using UnityEngine;

namespace NapoleonicRTS.Runtime
{
    public sealed class BattlefieldPrototype : MonoBehaviour
    {
        private readonly HashSet<int> _selectedRegiments = new HashSet<int>();
        private readonly HashSet<int> _selectedWorkers = new HashSet<int>();
        private readonly List<int> _selectionBuffer = new List<int>();
        private readonly List<int> _commandBuffer = new List<int>();
        private readonly List<int> _workerBuffer = new List<int>();
        private SimulationWorld _world;
        private BrowserParityWorld _gameplay;
        private PlayerLooseProductionSystem _playerProduction;
        private StrategicMap _map;
        private StrategicRoutePlanner _planner;
        private BattlefieldEnvironmentRenderer _environmentRenderer;
        private InstancedUnitRenderer _renderer;
        private ParityEntityRenderer _parityRenderer;
        private float _accumulator;
        private float _alpha;
        private int _lastSteps;
        private int _selectedBuildingId;
        private BuildingKind? _placementKind;
        private string _scenarioName = "browser parity battle";
        private bool _stressMode;

        public SimulationWorld World => _world;
        public BrowserParityWorld Gameplay => _gameplay;
        public StrategicMap Map => _map;
        public ISet<int> SelectedRegiments => _selectedRegiments;
        public ISet<int> SelectedWorkers => _selectedWorkers;
        public int SelectedBuildingId => _selectedBuildingId;
        public bool PlacementActive => _placementKind.HasValue;
        public bool StressMode => _stressMode;

        private void Awake()
        {
            Application.targetFrameRate = -1;
            QualitySettings.vSyncCount = 0;
            _map = BrowserBattlefieldMap.Create();
            _planner = new StrategicRoutePlanner(_map);
            _environmentRenderer = new BattlefieldEnvironmentRenderer();
            _renderer = new InstancedUnitRenderer();
            _parityRenderer = new ParityEntityRenderer();
            LoadGameplayScenario();
        }

        public void LoadGameplayScenario()
        {
            _gameplay = BrowserParityScenario.CreateGameplayWorld(_map);
            _playerProduction = new PlayerLooseProductionSystem(_gameplay);
            _world = _gameplay.Movement;
            ClearSelection();
            _placementKind = null;
            _accumulator = 0f;
            _stressMode = false;
            _scenarioName = "browser parity battle";
        }

        public void LoadStressScenario()
        {
            _gameplay = null;
            _playerProduction = null;
            _world = new SimulationWorld();
            ScaleScenario.Populate(_world, 100, 50);
            ClearSelection();
            _placementKind = null;
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
                if (_gameplay != null)
                {
                    _playerProduction?.Step(SimulationWorld.FixedStepSeconds);
                    WorkerOrderService.StepMoveTasks(_gameplay, SimulationWorld.FixedStepSeconds);
                    _gameplay.Step(SimulationWorld.FixedStepSeconds);
                }
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
            if (_gameplay != null) _environmentRenderer?.Render(_gameplay);
            _renderer?.Render(_world, _alpha, _selectedRegiments, _gameplay);
            if (_gameplay != null) _parityRenderer?.Render(_gameplay, _selectedWorkers, _selectedBuildingId);
        }

        private void OnDestroy()
        {
            _environmentRenderer?.Dispose();
            _renderer?.Dispose();
            _parityRenderer?.Dispose();
        }

        public void SelectAt(Float2 point, bool additive)
        {
            if (_gameplay == null)
            {
                SelectFranceInRect(point - new Float2(1.4f, 1.4f), point + new Float2(1.4f, 1.4f), additive);
                return;
            }

            if (_placementKind.HasValue)
            {
                if (_selectedWorkers.Count == 0)
                {
                    _gameplay.Status = "Selecteer eerst een of meer arbeiders";
                    _placementKind = null;
                    return;
                }
                _workerBuffer.Clear();
                foreach (var id in _selectedWorkers) _workerBuffer.Add(id);
                _workerBuffer.Sort();
                var kind = _placementKind.Value;
                if (_gameplay.BeginConstruction(ArmySide.France, kind, point, _workerBuffer))
                {
                    _gameplay.Status = kind == BuildingKind.House ? "House in aanbouw" : "Barracks in aanbouw";
                    _placementKind = null;
                }
                else _gameplay.Status = "Kan hier niet bouwen";
                return;
            }

            WorkerState nearestWorker = null;
            var workerDistance = .58f;
            for (var i = 0; i < _gameplay.Workers.Count; i++)
            {
                var worker = _gameplay.Workers[i];
                if (!worker.Alive || worker.Side != ArmySide.France) continue;
                var distance = Float2.Distance(point, worker.Position);
                if (distance >= workerDistance) continue;
                workerDistance = distance;
                nearestWorker = worker;
            }
            if (nearestWorker != null)
            {
                if (!additive) ClearSelection();
                _selectedWorkers.Add(nearestWorker.Id);
                _selectedBuildingId = 0;
                _gameplay.Status = $"Arbeider {nearestWorker.Id} geselecteerd";
                return;
            }

            for (var i = _gameplay.Buildings.Count - 1; i >= 0; i--)
            {
                var building = _gameplay.Buildings[i];
                if (building.Destroyed || building.Side != ArmySide.France) continue;
                if (Mathf.Abs(point.X - building.Position.X) > building.Width * .62f + .18f ||
                    Mathf.Abs(point.Y - building.Position.Y) > building.Height * .62f + .18f) continue;
                if (!additive) ClearSelection();
                _selectedBuildingId = building.Id;
                _gameplay.Status = $"{building.Kind} geselecteerd";
                return;
            }

            SelectFranceInRect(point - new Float2(1.4f, 1.4f), point + new Float2(1.4f, 1.4f), additive);
        }

        public void SelectFranceInRect(Float2 a, Float2 b, bool additive)
        {
            SelectionQuery.RegimentsInRect(_world, ArmySide.France, a, b, _selectionBuffer);
            if (!additive) ClearSelection();
            for (var i = 0; i < _selectionBuffer.Count; i++) _selectedRegiments.Add(_selectionBuffer[i]);
            if (_selectionBuffer.Count > 0) _selectedBuildingId = 0;
        }

        public void MoveSelection(Float2 target)
        {
            CopySelectionToCommandBuffer();
            if (_commandBuffer.Count > 0)
            {
                if (_gameplay != null) _gameplay.QueueMoveCommand(_commandBuffer, target);
                else RegimentCommandService.MoveRegiments(_world, _commandBuffer, target, 5.5f, null);
            }
            if (_gameplay != null && _selectedWorkers.Count > 0)
                WorkerOrderService.IssueContextOrder(_gameplay, _selectedWorkers, target);
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

        public void BeginPlacement(BuildingKind kind)
        {
            if (_gameplay == null || kind == BuildingKind.TownCenter) return;
            if (_selectedWorkers.Count == 0)
            {
                _gameplay.Status = "Selecteer eerst een arbeider";
                return;
            }
            _placementKind = kind;
            _gameplay.Status = kind == BuildingKind.House ? "Plaats House op de kaart" : "Plaats Barracks op de kaart";
        }

        public void CancelPlacement()
        {
            if (!_placementKind.HasValue) return;
            _placementKind = null;
            if (_gameplay != null) _gameplay.Status = "Bouwen geannuleerd";
        }

        private void QuickTrain(UnitKind kind)
        {
            if (_gameplay == null || _playerProduction == null) return;
            if (_selectedBuildingId == 0)
            {
                _gameplay.Status = "Selecteer eerst het juiste productiegebouw";
                return;
            }
            if (_playerProduction.QueueTraining(_selectedBuildingId, kind)) return;
            _gameplay.Status = "Productie niet mogelijk: controleer gebouw, grondstoffen, queue en popcap";
        }

        private void FormSelectedLooseRegiment()
        {
            if (_gameplay == null || _playerProduction == null) return;
            CopySelectionToCommandBuffer();
            if (_playerProduction.TryFormRegiment(_commandBuffer))
            {
                _selectedRegiments.Clear();
                return;
            }
            _gameplay.Status = "Selecteer 12 losse musketiers + 1 officier + 1 drummer";
        }

        private void CycleObjective()
        {
            if (_gameplay == null) return;
            var presets = ObjectiveScenarioService.Presets;
            var current = 0;
            for (var i = 0; i < presets.Count; i++) if (presets[i] == _gameplay.Objective.Scenario) { current = i; break; }
            ObjectiveScenarioService.Select(_gameplay.Objective, presets[(current + 1) % presets.Count]);
            _gameplay.Status = $"Scenario: {_gameplay.Objective.Name}";
        }

        private void CopySelectionToCommandBuffer()
        {
            _commandBuffer.Clear();
            foreach (var id in _selectedRegiments) _commandBuffer.Add(id);
            _commandBuffer.Sort();
        }

        private void ClearSelection()
        {
            _selectedRegiments.Clear();
            _selectedWorkers.Clear();
            _selectedBuildingId = 0;
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

        private string SelectionLabel()
        {
            if (_gameplay == null) return $"Regiments {_selectedRegiments.Count}";
            if (_selectedBuildingId != 0)
            {
                var b = _gameplay.FindBuilding(_selectedBuildingId);
                if (b != null)
                {
                    var playerQueue = _playerProduction?.QueueCount(b.Id) ?? 0;
                    var progress = playerQueue > 0 ? $" · Productie {(_playerProduction.QueueProgress(b.Id) * 100f):0}%" : "";
                    return $"{b.Kind} · HP {b.HitPoints:0}/{b.MaxHitPoints:0} · Queue {playerQueue}{progress}";
                }
            }
            if (_selectedWorkers.Count > 0) return $"Workers geselecteerd: {_selectedWorkers.Count}";
            if (_selectedRegiments.Count > 0 && _playerProduction != null)
            {
                var loose = 0;
                foreach (var id in _selectedRegiments) if (_playerProduction.IsLooseRegiment(id)) loose++;
                if (loose > 0) return $"Losse troepen: {loose} · regimenten: {_selectedRegiments.Count - loose}";
            }
            return $"Regiments geselecteerd: {_selectedRegiments.Count}";
        }

        private void DrawProductionActions()
        {
            if (_selectedBuildingId == 0 || _gameplay == null) return;
            var building = _gameplay.FindBuilding(_selectedBuildingId);
            if (building == null || building.Destroyed || !building.Complete) return;
            if (building.Kind == BuildingKind.TownCenter)
            {
                if (GUI.Button(new Rect(24, 328, 108, 26), "Boer · 50 food")) QuickTrain(UnitKind.Worker);
            }
            else if (building.Kind == BuildingKind.Barracks)
            {
                if (GUI.Button(new Rect(24, 328, 108, 26), "Musketier")) QuickTrain(UnitKind.Infantry);
                if (GUI.Button(new Rect(140, 328, 108, 26), "Officier")) QuickTrain(UnitKind.Officer);
                if (GUI.Button(new Rect(256, 328, 108, 26), "Drummer")) QuickTrain(UnitKind.Drummer);
            }
        }

        private void OnGUI()
        {
            if (_world == null) return;
            var maxCompression = 0f;
            for (var i = 0; i < _world.Regiments.Count; i++) if (_world.Regiments[i].BridgeCompression > maxCompression) maxCompression = _world.Regiments[i].BridgeCompression;

            GUI.Box(new Rect(12, 12, 408, _gameplay != null ? 548 : 256), "Napoleonic RTS — Unity Native");
            GUI.Label(new Rect(24, 42, 376, 22), $"Scenario: {_scenarioName}");
            GUI.Label(new Rect(24, 62, 376, 22), $"Units: {_world.Units.Count}  Regiments: {_world.Regiments.Count}  {SelectionLabel()}");
            GUI.Label(new Rect(24, 82, 376, 22), $"Fixed sim 60 Hz · Tick {_world.Tick} · Steps/frame {_lastSteps} · FPS {(1f / Mathf.Max(.0001f, Time.unscaledDeltaTime)):0}");
            GUI.Label(new Rect(24, 102, 376, 22), $"Bridge compression: {maxCompression * 100f:0}% · GPU-instanced rendering");

            if (_gameplay == null)
            {
                if (GUI.Button(new Rect(24, 138, 165, 28), "Load gameplay")) LoadGameplayScenario();
                if (GUI.Button(new Rect(199, 138, 165, 28), "Reload 10k stress")) LoadStressScenario();
                GUI.Label(new Rect(24, 178, 350, 44), "10,000 soldaten / 200 regimenten\nMovement + formation GPU stress test");
                return;
            }

            var e = _gameplay.FranceEconomy;
            var rules = _gameplay.Combat.Rules;
            var workers = 0;
            for (var i = 0; i < _gameplay.Workers.Count; i++) if (_gameplay.Workers[i].Alive && _gameplay.Workers[i].Side == ArmySide.France) workers++;
            GUI.Label(new Rect(24, 130, 376, 22), $"🇫🇷 Food {e.Food:0} · Wood {e.Wood:0} · Pop {_gameplay.PopulationUsed(ArmySide.France)}/{e.PopulationCap} · Workers {workers}");
            GUI.Label(new Rect(24, 150, 376, 22), $"Morale {SelectedMorale():0}% · Shots {_gameplay.Combat.TotalShotsFired} · Losses {_gameplay.Combat.TotalDeaths}");
            GUI.Label(new Rect(24, 170, 376, 22), $"Objective {_gameplay.Objective.Name}: 🇫🇷 {_gameplay.Objective.FranceScore}/{_gameplay.Objective.TargetScore} · 🇬🇧 {_gameplay.Objective.BritainScore}/{_gameplay.Objective.TargetScore}");
            GUI.Label(new Rect(24, 190, 376, 22), $"Weather {rules.Weather} · {rules.TimeOfDay} · Sightings {rules.ScoutReport().Count}");
            GUI.Label(new Rect(24, 210, 376, 22), $"AI: {_gameplay.Commander.State} · {_gameplay.Commander.Plan}");
            GUI.Label(new Rect(24, 230, 376, 22), $"Status: {_gameplay.Status} · Pending orders {_gameplay.PendingOrderCount}");

            if (GUI.Button(new Rect(24, 260, 108, 26), "Line [1]")) SetSelectionFormation(FormationKind.Line);
            if (GUI.Button(new Rect(140, 260, 108, 26), "Column [2]")) SetSelectionFormation(FormationKind.Column);
            if (GUI.Button(new Rect(256, 260, 108, 26), "Square [3]")) SetSelectionFormation(FormationKind.Square);

            if (GUI.Button(new Rect(24, 294, 108, 26), "Bayonet [B]")) BayonetCommand();
            if (GUI.Button(new Rect(140, 294, 108, 26), "Cavalry [C]")) CavalryCharge();
            if (GUI.Button(new Rect(256, 294, 108, 26), "Round/Grape [G]")) ToggleArtillery();

            DrawProductionActions();

            if (GUI.Button(new Rect(24, 362, 108, 26), "Place House")) BeginPlacement(BuildingKind.House);
            if (GUI.Button(new Rect(140, 362, 108, 26), "Place Barracks")) BeginPlacement(BuildingKind.Barracks);
            if (GUI.Button(new Rect(256, 362, 108, 26), "Maak regiment")) FormSelectedLooseRegiment();

            if (GUI.Button(new Rect(24, 396, 165, 26), "Next objective")) CycleObjective();
            GUI.Label(new Rect(199, 396, 165, 26), _playerProduction == null ? "" : $"Los: I{_playerProduction.LooseCount(UnitKind.Infantry)} O{_playerProduction.LooseCount(UnitKind.Officer)} D{_playerProduction.LooseCount(UnitKind.Drummer)}");

            if (GUI.Button(new Rect(24, 436, 165, 28), "Reset battle")) LoadGameplayScenario();
            if (GUI.Button(new Rect(199, 436, 165, 28), "Stress 10k")) LoadStressScenario();

            GUI.Label(new Rect(24, 474, 370, 42), _placementKind.HasValue ? $"PLAATSING: {_placementKind.Value} — klik kaart, Esc annuleert" : "Klik/drag: units · klik worker/gebouw · rechtsklik: contextorder");
            if (_gameplay.Victory != VictorySide.None)
                GUI.Label(new Rect(24, 516, 350, 28), _gameplay.Victory == VictorySide.France ? "FRANSE OVERWINNING" : "BRITSE OVERWINNING");
        }
    }
}
