using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine.SceneManagement;

namespace NapoleonicRTS.Editor
{
    [InitializeOnLoad]
    public static class PrototypeProjectBootstrap
    {
        private const string ScenePath = "Assets/Scenes/Prototype.unity";

        static PrototypeProjectBootstrap() => EditorApplication.delayCall += EnsurePrototypeScene;

        [MenuItem("Napoleonic RTS/Rebuild Prototype Scene")]
        public static void RebuildPrototypeScene()
        {
            if (!Directory.Exists("Assets/Scenes")) Directory.CreateDirectory("Assets/Scenes");
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            EditorSceneManager.SaveScene(scene, ScenePath);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
            AssetDatabase.SaveAssets();
        }

        private static void EnsurePrototypeScene()
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode) return;
            if (!File.Exists(ScenePath)) RebuildPrototypeScene();
            else if (SceneManager.GetActiveScene().path != ScenePath) EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
        }
    }
}
