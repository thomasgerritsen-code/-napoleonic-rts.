"""Original native 3D architecture: forge/foundry, village chapel and inn.

Metres, Blender Z up; one baked mesh per building. Reuses the existing
Blender primitive kit; no extra runtime materials, downloaded art or assets.
"""
from godot_mine import material
from iso_blender_common import part, prism


def box(root, name, size, at, mat, rot=(0, 0, 0)):
    return part("box", size, at, mat, root, rot=rot, name=name)


def roof(root, width, depth, z, height, mat):
    prism("gable_roof", width, depth, height, mat, (0, 0, z), root)
    box(root, "ridge", (width + 0.08, 0.16, 0.15), (0, 0, z + height), mat)
    # Real roof courses rather than a smooth solid roof at close range.
    for side in (-1, 1):
        for row in range(1, 9):
            y = side * depth * row / 18.0
            top = z + height * (1.0 - abs(y) / (depth / 2))
            box(root, "roof_course", (width, 0.07, 0.045), (0, y, top + 0.025), mat)


def window(root, x, y, z, wood, glass, size=(0.75, 1.1)):
    w, h = size
    box(root, "window_frame", (w + 0.18, 0.12, h + 0.18), (x, y, z), wood)
    box(root, "window_glass", (w, 0.14, h), (x, y - 0.02, z), glass)
    box(root, "mullion", (0.055, 0.17, h), (x, y - 0.04, z), wood)
    box(root, "transom", (w, 0.17, 0.055), (x, y - 0.04, z + h * 0.1), wood)


def doorway(root, x, y, z, width, height, wood, stone):
    box(root, "door_stone", (width + 0.32, 0.16, height + 0.22), (x, y, z + height / 2), stone)
    box(root, "door", (width, 0.18, height), (x, y - 0.04, z + height / 2), wood)
    box(root, "door_latch", (0.16, 0.2, 0.05), (x + width * 0.28, y - 0.13, z + height * 0.45), stone)


def build_foundry(root, side):
    brick = material("#92573e", pattern="wall", alt="#624b40")
    stone = material("#b0a58c", pattern="wall", alt="#827b69")
    slate = material("#4c5961", pattern="wall", alt="#36424d")
    timber = material("#60452f", pattern="planks", alt="#3c2c21")
    iron = material("#414744", rough=0.55, metal=0.7)
    dark = material("#171c1c")
    brass = material("#ad8b46", rough=0.4, metal=0.5)
    box(root, "stone_plinth", (8.2, 5.5, 0.45), (0, 0, 0.225), stone)
    box(root, "brick_workshop", (7.8, 5.0, 3.6), (0, 0, 2.05), brick)
    roof(root, 8.7, 6.0, 3.9, 1.65, slate)
    # Brick courses and quoins make the silhouette readable in direct light.
    for z in (0.65, 1.4, 2.15, 2.9, 3.65):
        for x in (-3.88, 3.88):
            box(root, "corner_quoin", (0.32, 5.04, 0.12), (x, 0, z), stone)
    doorway(root, -1.55, -2.58, 0.45, 2.0, 2.65, timber, stone)
    for x in (1.1, 2.7):
        window(root, x, -2.59, 2.35, timber, dark)
    # A tall square chimney and its open black flue.
    box(root, "chimney", (1.25, 1.25, 5.7), (2.6, 1.4, 4.0), brick)
    for z in (6.35, 6.65, 6.9):
        box(root, "chimney_cap", (1.46, 1.46, 0.14), (2.6, 1.4, z), stone)
    box(root, "open_flue", (0.9, 0.9, 0.03), (2.6, 1.4, 6.98), dark)
    # Outside casting shed, furnace mouth, anvil and cast shot.
    box(root, "shed_roof", (2.5, 2.3, 0.12), (-2.25, -3.55, 2.65), timber, (12, 0, 0))
    for x in (-3.3, -1.2):
        box(root, "shed_post", (0.15, 0.15, 2.4), (x, -4.35, 1.2), timber)
    box(root, "forge_base", (1.25, 0.95, 0.85), (-2.4, -3.5, 0.9), brick)
    box(root, "forge_coals", (0.86, 0.65, 0.05), (-2.4, -3.55, 1.36), dark)
    box(root, "anvil_base", (0.62, 0.55, 0.62), (0.0, -3.45, 0.55), timber)
    box(root, "anvil", (0.85, 0.4, 0.18), (0.0, -3.45, 0.96), iron)
    box(root, "anvil_horn", (0.48, 0.2, 0.1), (0.53, -3.45, 0.98), iron, (0, -8, 0))
    for row in range(3):
        for k in range(4 - row):
            part("ball", (0.17,), (1.2 + k * 0.34 + row * 0.17, -3.45, 0.25 + row * 0.29), iron, root,
                 segments=10, name="cast_shot")
    # Cannon casting, equipment wheel and a side-coloured hanging sign.
    part("cyl", (0.24, 1.6), (2.6, -3.7, 0.33), brass, root, rot=(0, 90, 0), name="cast_barrel")
    part("cyl", (0.7, 0.12), (-4.2, -1.1, 0.77), timber, root, rot=(90, 0, 0), name="wheel")
    part("cyl", (0.58, 0.14), (-4.2, -1.1, 0.77), iron, root, rot=(90, 0, 0), name="wheel_inner")
    colours = ("#24315c", "#efe6ce", "#a7332e") if side == "fr" else ("#b33032", "#24315c", "#b33032")
    for i, color in enumerate(colours):
        box(root, "national_sign", (0.25, 0.13, 0.8), (0.0 + i * 0.25, -2.65, 3.25), material(color))


def build_chapel(root):
    plaster = material("#ded3b6", pattern="wall", alt="#bdb399")
    stone = material("#a39b85", pattern="wall", alt="#7c7d72")
    roof_mat = material("#555b65", pattern="wall", alt="#373e4a")
    wood = material("#5e432d", pattern="planks", alt="#3c2c21")
    glass = material("#3d515c", rough=0.35)
    bronze = material("#987c43", rough=0.4, metal=0.7)
    box(root, "foundation", (10.6, 6.3, 0.45), (0, 0, 0.225), stone)
    box(root, "nave", (10.0, 5.7, 4.2), (0, 0, 2.5), plaster)
    roof(root, 10.8, 6.5, 4.6, 2.0, roof_mat)
    for x in (-3.4, -0.8, 1.8, 4.1):
        for y in (-2.87, 2.87):
            window(root, x, y, 2.7, stone, glass, (0.72, 1.75))
            box(root, "buttress", (0.35, 0.55, 3.8), (x + 0.7, y, 2.1), stone)
    # Bell tower on the entrance end, with open belfry and a visible bell.
    box(root, "tower", (2.7, 2.7, 6.4), (-3.25, 0, 3.4), plaster)
    box(root, "belfry_dark", (2.3, 2.3, 1.25), (-3.25, 0, 7.1), wood)
    for x in (-4.53, -1.97):
        for y in (-1.28, 1.28):
            box(root, "belfry_pillar", (0.22, 0.22, 1.6), (x, y, 7.15), stone)
    part("cyl", (0.36, 0.6, 0.12), (-3.25, -1.0, 7.1), bronze, root, name="bell")
    part("cyl", (1.95, 2.6, 0.02), (-3.25, 0, 9.05), roof_mat, root, segments=4, name="spire", rot=(0, 0, 45))
    box(root, "cross_vertical", (0.11, 0.11, 1.0), (-3.25, 0, 10.75), bronze)
    box(root, "cross_horizontal", (0.65, 0.11, 0.11), (-3.25, 0, 10.95), bronze)
    doorway(root, -3.25, -1.42, 0.45, 1.35, 2.5, wood, stone)
    for i in range(3):
        box(root, "entrance_step", (1.9 + i * 0.22, 0.5, 0.15), (-3.25, -1.7 - i * 0.4, 0.35 - i * 0.1), stone)


def build_inn(root):
    wall = material("#d9c6a2", pattern="wall", alt="#bda78a")
    stone = material("#8f8d7d", pattern="wall", alt="#6e736a")
    wood = material("#57402e", pattern="planks", alt="#3e2d20")
    tile = material("#a25d3f", pattern="wall", alt="#774b3c")
    glass = material("#334b51", rough=0.35)
    sign = material("#c7a766", pattern="planks")
    box(root, "stone_ground_floor", (11.4, 6.4, 2.6), (0, 0, 1.3), stone)
    box(root, "plaster_upper_floor", (11.7, 6.65, 2.8), (0, 0, 4.0), wall)
    roof(root, 12.5, 7.5, 5.45, 2.5, tile)
    for z in (2.65, 5.25):
        for y in (-3.36, 3.36):
            box(root, "floor_beam", (11.8, 0.14, 0.18), (0, y, z), wood)
    for x in (-5.6, -2.8, 0, 2.8, 5.6):
        for y in (-3.37, 3.37):
            box(root, "upright", (0.15, 0.15, 2.6), (x, y, 3.95), wood)
            if abs(x) < 5.5:
                box(root, "diagonal_brace", (1.95, 0.13, 0.12), (x + 0.7, y, 3.9), wood, (0, 52, 0))
    for x in (-4.2, -1.4, 1.4, 4.2):
        for y in (-3.45, 3.45):
            window(root, x, y, 4.05, wood, glass)
            if abs(x) > 2.0:
                window(root, x, y, 1.5, wood, glass)
    doorway(root, 0, -3.3, 0.12, 1.65, 2.25, wood, wall)
    box(root, "chimney", (0.8, 0.8, 2.5), (3.5, 0.8, 7.2), stone)
    box(root, "chimney_cap", (1.0, 1.0, 0.16), (3.5, 0.8, 8.48), tile)
    # Hanging mug sign, a bench and ale casks on the entrance side.
    box(root, "sign_bracket", (0.1, 1.1, 0.1), (-2.4, -3.8, 3.0), wood)
    box(root, "hanging_sign", (0.95, 0.15, 0.9), (-2.4, -4.25, 2.45), sign)
    box(root, "mug_crest", (0.34, 0.18, 0.4), (-2.4, -4.36, 2.43), wall)
    box(root, "mug_handle", (0.13, 0.19, 0.22), (-2.15, -4.36, 2.44), wall)
    box(root, "bench_seat", (2.3, 0.5, 0.12), (3.7, -3.9, 0.65), wood)
    for x in (2.8, 4.6):
        box(root, "bench_leg", (0.12, 0.45, 0.6), (x, -3.9, 0.3), wood)
    for x in (-4.7, -3.8):
        part("cyl", (0.36, 0.9), (x, -3.9, 0.45), wood, root, segments=12, name="cask")
        for z in (0.17, 0.7):
            part("cyl", (0.37, 0.07), (x, -3.9, z), stone, root, segments=12, name="cask_hoop")


BUILDERS = {"foundry_fr": lambda root: build_foundry(root, "fr"),
            "foundry_br": lambda root: build_foundry(root, "br"),
            "chapel": build_chapel, "inn": build_inn}
