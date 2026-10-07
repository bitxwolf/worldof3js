import os
import sys
import base64
import json
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

BRAIN_DIR = r"C:\Users\vantr\.gemini\antigravity\brain\31169f3a-aba0-43bd-bfa2-a299bfa605ea"
ASSETS_DIR = r"c:\antigravity\world of 3js\assets\presets"
OUT_TS = r"c:\antigravity\world of 3js\src\renderer\engine\presets\presetData.ts"

os.makedirs(ASSETS_DIR, exist_ok=True)
os.makedirs(os.path.dirname(OUT_TS), exist_ok=True)

def generate_normal_map(gray_img, strength=2.5):
    """Generates an accurate tangent-space normal map from grayscale height/luminance."""
    h, w = gray_img.shape
    # Sobel filters for X and Y derivatives
    sobel_x = cv2.Sobel(gray_img, cv2.CV_32F, 1, 0, ksize=3)
    sobel_y = cv2.Sobel(gray_img, cv2.CV_32F, 0, 1, ksize=3)

    # Invert Y so up in image corresponds to positive tangent-space Y
    dx = -sobel_x * (strength / 255.0)
    dy = sobel_y * (strength / 255.0)
    dz = np.ones((h, w), dtype=np.float32)

    norm = np.sqrt(dx**2 + dy**2 + dz**2)
    norm = np.maximum(norm, 1e-6)
    nx = dx / norm
    ny = dy / norm
    nz = dz / norm

    # Map from [-1, 1] to [0, 255]
    r = ((nx * 0.5 + 0.5) * 255).astype(np.uint8)
    g = ((ny * 0.5 + 0.5) * 255).astype(np.uint8)
    b = ((nz * 0.5 + 0.5) * 255).astype(np.uint8)

    normal_map = np.stack([b, g, r], axis=2) # BGR for OpenCV
    return normal_map

def extract_contour_and_alpha(img_bgr, bg_color_thresh=245):
    """Separates white background and returns RGBA image and normalized contour."""
    h, w = img_bgr.shape[:2]
    # Check distance from white / light background
    diff_from_white = 255 - np.mean(img_bgr, axis=2)
    
    # Simple flood fill from corners if white
    mask = np.zeros((h + 2, w + 2), np.uint8)
    corner_seeds = [(5, 5), (w - 6, 5), (5, h - 6), (w - 6, h - 6)]
    flood = img_bgr.copy()
    for sx, sy in corner_seeds:
        cv2.floodFill(flood, mask, (sx, sy), (255, 255, 255), (15, 15, 15), (15, 15, 15), cv2.FLOODFILL_FIXED_RANGE)

    # Alpha: foreground is where flood fill did not touch and diff_from_white > 18
    is_bg = (mask[1:-1, 1:-1] == 1) | (diff_from_white < 16)
    alpha = np.where(is_bg, 0, 255).astype(np.uint8)

    # Clean up small noise with morphological close
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    alpha = cv2.morphologyDefault(alpha, cv2.MORPH_CLOSE, kernel) if hasattr(cv2, 'morphologyDefault') else cv2.morphologyEx(alpha, cv2.MORPH_CLOSE, kernel)
    alpha = cv2.GaussianBlur(alpha, (3, 3), 0)

    # Find largest contour
    contours, _ = cv2.findContours(alpha, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    norm_contour = []
    if contours:
        largest = max(contours, key=cv2.contourArea)
        # Approximate contour for smooth polygon
        epsilon = 0.005 * cv2.arcLength(largest, True)
        approx = cv2.approxPolyDP(largest, epsilon, True)
        for pt in approx:
            px, py = pt[0]
            norm_contour.append([round(float(px) / w, 4), round(float(py) / h, 4)])

    # Construct RGBA
    b, g, r = cv2.split(img_bgr)
    rgba = cv2.merge([b, g, r, alpha])
    return rgba, norm_contour

def img_to_base64_png(bgr_or_rgba):
    success, buf = cv2.imencode('.png', bgr_or_rgba)
    if not success:
        return ""
    return "data:image/png;base64," + base64.b64encode(buf).decode('ascii')

# 1. Process 3 Nano Banana Generated Images
nano_banana_assets = [
    {
        "id": "npc_cyber_cyborg",
        "name": "Cyborg Scout Lyra-9",
        "type": "npc",
        "category": "NPCs",
        "file": os.path.join(BRAIN_DIR, "npc_cyber_cyborg_1791385944267.jpg"),
        "dominantColor": "#06b6d4",
        "targetHeight": 1.85,
        "depth": 0.14,
        "description": "Cybernetic scout featuring optic visor, combat exoskeleton armor, and precision telemetry."
    },
    {
        "id": "npc_arcane_mystic",
        "name": "Arcanist Elenya",
        "type": "npc",
        "category": "NPCs",
        "file": os.path.join(BRAIN_DIR, "npc_arcane_mystic_1791385981154.jpg"),
        "dominantColor": "#3b82f6",
        "targetHeight": 1.80,
        "depth": 0.12,
        "description": "High-elven mystic in ornate sapphire robes bearing luminous arcane crystal staff."
    },
    {
        "id": "npc_desert_scavenger",
        "name": "Nomad Scavenger Kael",
        "type": "npc",
        "category": "NPCs",
        "file": os.path.join(BRAIN_DIR, "npc_desert_scavenger_1791386028356.jpg"),
        "dominantColor": "#d97706",
        "targetHeight": 1.88,
        "depth": 0.15,
        "description": "Battle-tested wasteland survivor with weathered sand cloak, tactical pouches, and brass goggles."
    }
]

presets_output = []

for item in nano_banana_assets:
    print(f"Processing Nano Banana image: {item['id']}")
    src_img = cv2.imread(item['file'])
    if src_img is None:
        print(f"Failed to read {item['file']}")
        continue

    # Resize to standard 512x512
    src_img = cv2.resize(src_img, (512, 512), interpolation=cv2.INTER_AREA)

    rgba, contour = extract_contour_and_alpha(src_img)
    gray = cv2.cvtColor(src_img, cv2.COLOR_BGR2GRAY)
    normal = generate_normal_map(gray, strength=2.2)

    # Save PNGs to assets/presets/
    albedo_path = os.path.join(ASSETS_DIR, f"{item['id']}_albedo.png")
    normal_path = os.path.join(ASSETS_DIR, f"{item['id']}_normal.png")
    cv2.imwrite(albedo_path, rgba)
    cv2.imwrite(normal_path, normal)

    item["albedoBase64"] = img_to_base64_png(rgba)
    item["normalBase64"] = img_to_base64_png(normal)
    item["contour"] = contour if len(contour) >= 4 else [
        [0.5, 0.0], [0.65, 0.1], [0.75, 0.3], [0.7, 0.6], [0.65, 0.98],
        [0.52, 0.98], [0.5, 0.65], [0.48, 0.98], [0.35, 0.98], [0.3, 0.6],
        [0.25, 0.3], [0.35, 0.1]
    ]
    presets_output.append(item)

# 2. Synthesize NPC Archetype 4: Forest Guardian (Bioluminescent Faerie/Creature)
print("Synthesizing NPC: Forest Guardian")
fg_img = np.zeros((512, 512, 4), dtype=np.uint8)
# Create stylized organic forest guardian silhouette
fg_bgr = np.zeros((512, 512, 3), dtype=np.uint8)
# Draw gradient body
for y in range(512):
    t = y / 512.0
    fg_bgr[y, :] = [int(30 + 40 * t), int(90 + 80 * (1 - t)), int(20 + 30 * t)]

# Antlers and fae features
cv2.ellipse(fg_bgr, (256, 120), (55, 65), 0, 0, 360, (40, 160, 80), -1)
# Head
cv2.circle(fg_bgr, (256, 120), 45, (80, 200, 130), -1)
# Antler branches
for side in [-1, 1]:
    cv2.line(fg_bgr, (256 + side * 30, 90), (256 + side * 90, 30), (45, 120, 60), 8)
    cv2.line(fg_bgr, (256 + side * 60, 60), (256 + side * 110, 45), (60, 210, 180), 5)
    cv2.circle(fg_bgr, (256 + side * 110, 45), 9, (200, 255, 230), -1) # Glowing buds
# Body torso & robe
pts_torso = np.array([[220, 160], [292, 160], [330, 340], [350, 490], [162, 490], [182, 340]], np.int32)
cv2.fillPoly(fg_bgr, [pts_torso], (35, 110, 50))
# Luminous runes
cv2.putText(fg_bgr, "*", (248, 220), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (180, 255, 220), 2)
cv2.putText(fg_bgr, "~", (250, 270), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (180, 255, 220), 2)
cv2.putText(fg_bgr, "*", (248, 320), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (180, 255, 220), 2)

# Make mask
fg_mask = np.zeros((512, 512), dtype=np.uint8)
cv2.ellipse(fg_mask, (256, 120), (60, 70), 0, 0, 360, 255, -1)
for side in [-1, 1]:
    cv2.line(fg_mask, (256 + side * 30, 90), (256 + side * 90, 30), 255, 12)
    cv2.line(fg_mask, (256 + side * 60, 60), (256 + side * 110, 45), 255, 9)
    cv2.circle(fg_mask, (256 + side * 110, 45), 12, 255, -1)
cv2.fillPoly(fg_mask, [pts_torso], 255)
fg_mask = cv2.GaussianBlur(fg_mask, (3, 3), 0)

fg_b, fg_g, fg_r = cv2.split(fg_bgr)
fg_rgba = cv2.merge([fg_b, fg_g, fg_r, fg_mask])
fg_gray = cv2.cvtColor(fg_bgr, cv2.COLOR_BGR2GRAY)
fg_normal = generate_normal_map(fg_gray, strength=2.4)

fg_contours, _ = cv2.findContours(fg_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
fg_c_pts = []
if fg_contours:
    largest = max(fg_contours, key=cv2.contourArea)
    approx = cv2.approxPolyDP(largest, 0.006 * cv2.arcLength(largest, True), True)
    for p in approx:
        fg_c_pts.append([round(float(p[0][0]) / 512, 4), round(float(p[0][1]) / 512, 4)])

cv2.imwrite(os.path.join(ASSETS_DIR, "npc_forest_guardian_albedo.png"), fg_rgba)
cv2.imwrite(os.path.join(ASSETS_DIR, "npc_forest_guardian_normal.png"), fg_normal)

presets_output.append({
    "id": "npc_forest_guardian",
    "name": "Sylva Forest Guardian",
    "type": "npc",
    "category": "NPCs",
    "dominantColor": "#10b981",
    "targetHeight": 1.95,
    "depth": 0.15,
    "description": "Ancient fae sentinel adorned with bioluminescent antler crowns and bark armor.",
    "albedoBase64": img_to_base64_png(fg_rgba),
    "normalBase64": img_to_base64_png(fg_normal),
    "contour": fg_c_pts
})

# 3. Synthesize NPC Archetype 5: Steam Alchemist
print("Synthesizing NPC: Steam Alchemist")
sa_bgr = np.zeros((512, 512, 3), dtype=np.uint8)
for y in range(512):
    t = y / 512.0
    sa_bgr[y, :] = [int(20 + 30 * t), int(45 + 50 * t), int(90 + 70 * (1 - t))]

# Head & brass goggles
cv2.circle(sa_bgr, (256, 130), 48, (120, 160, 200), -1)
cv2.circle(sa_bgr, (238, 120), 16, (30, 160, 220), -1) # Brass rim left
cv2.circle(sa_bgr, (274, 120), 16, (30, 160, 220), -1) # Brass rim right
cv2.circle(sa_bgr, (238, 120), 10, (220, 200, 50), -1)  # Luminous lens
cv2.circle(sa_bgr, (274, 120), 10, (220, 200, 50), -1)
# Braided beard
pts_beard = np.array([[220, 150], [292, 150], [280, 240], [256, 260], [232, 240]], np.int32)
cv2.fillPoly(sa_bgr, [pts_beard], (40, 80, 160))
# Heavy coat & bronze chest plate
pts_coat = np.array([[195, 175], [317, 175], [350, 360], [365, 495], [147, 495], [162, 360]], np.int32)
cv2.fillPoly(sa_bgr, [pts_coat], (30, 50, 110))
cv2.rectangle(sa_bgr, (225, 220), (287, 320), (50, 140, 210), -1) # Bronze plate

# Steam tank on back
cv2.rectangle(sa_bgr, (150, 200), (190, 330), (70, 150, 190), -1)
cv2.circle(sa_bgr, (170, 200), 20, (80, 160, 200), -1)

sa_mask = np.zeros((512, 512), dtype=np.uint8)
cv2.circle(sa_mask, (256, 130), 52, 255, -1)
cv2.fillPoly(sa_mask, [pts_beard], 255)
cv2.fillPoly(sa_mask, [pts_coat], 255)
cv2.rectangle(sa_mask, (145, 195), (195, 335), 255, -1)
sa_mask = cv2.GaussianBlur(sa_mask, (3, 3), 0)

sa_b, sa_g, sa_r = cv2.split(sa_bgr)
sa_rgba = cv2.merge([sa_b, sa_g, sa_r, sa_mask])
sa_gray = cv2.cvtColor(sa_bgr, cv2.COLOR_BGR2GRAY)
sa_normal = generate_normal_map(sa_gray, strength=2.5)

sa_contours, _ = cv2.findContours(sa_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
sa_c_pts = []
if sa_contours:
    largest = max(sa_contours, key=cv2.contourArea)
    approx = cv2.approxPolyDP(largest, 0.006 * cv2.arcLength(largest, True), True)
    for p in approx:
        sa_c_pts.append([round(float(p[0][0]) / 512, 4), round(float(p[0][1]) / 512, 4)])

cv2.imwrite(os.path.join(ASSETS_DIR, "npc_steam_alchemist_albedo.png"), sa_rgba)
cv2.imwrite(os.path.join(ASSETS_DIR, "npc_steam_alchemist_normal.png"), sa_normal)

presets_output.append({
    "id": "npc_steam_alchemist",
    "name": "Baron Torvald Alchemist",
    "type": "npc",
    "category": "NPCs",
    "dominantColor": "#b45309",
    "targetHeight": 1.72,
    "depth": 0.16,
    "description": "Dwarven master artisan with brass pressure goggles, mechanical gauntlet, and steam core.",
    "albedoBase64": img_to_base64_png(sa_rgba),
    "normalBase64": img_to_base64_png(sa_normal),
    "contour": sa_c_pts
})

# 4. Environment: Layered Broadleaf Tree
print("Synthesizing Environment: Layered Broadleaf Tree")
tree_bgr = np.zeros((512, 512, 3), dtype=np.uint8)
tree_mask = np.zeros((512, 512), dtype=np.uint8)

# Trunk
cv2.rectangle(tree_bgr, (230, 240), (282, 512), (30, 55, 90), -1)
cv2.rectangle(tree_mask, (230, 240), (282, 512), 255, -1)
# Roots
cv2.line(tree_bgr, (230, 500), (190, 512), (30, 55, 90), 16)
cv2.line(tree_bgr, (282, 500), (322, 512), (30, 55, 90), 16)
cv2.line(tree_mask, (230, 500), (190, 512), 255, 18)
cv2.line(tree_mask, (282, 500), (322, 512), 255, 18)

# Layered Canopy Foliage (overlapping organic spheres with texture)
canopy_spheres = [
    (256, 170, 110, (40, 130, 50)),
    (195, 190, 85, (35, 115, 45)),
    (317, 190, 85, (45, 145, 55)),
    (256, 95, 75, (55, 165, 70)),
    (220, 120, 65, (50, 150, 60)),
    (292, 120, 65, (50, 155, 65)),
]
for cx, cy, r, col in canopy_spheres:
    cv2.circle(tree_bgr, (cx, cy), r, col, -1)
    cv2.circle(tree_mask, (cx, cy), r, 255, -1)

# Organic leaf dapples
np.random.seed(42)
for _ in range(600):
    lx = int(np.random.normal(256, 80))
    ly = int(np.random.normal(160, 60))
    if 0 <= lx < 512 and 0 <= ly < 512 and tree_mask[ly, lx] == 255:
        cv2.circle(tree_bgr, (lx, ly), 5, (60, 180, 80), -1)

tree_b, tree_g, tree_r = cv2.split(tree_bgr)
tree_rgba = cv2.merge([tree_b, tree_g, tree_r, tree_mask])
tree_gray = cv2.cvtColor(tree_bgr, cv2.COLOR_BGR2GRAY)
tree_normal = generate_normal_map(tree_gray, strength=2.8)

cv2.imwrite(os.path.join(ASSETS_DIR, "tree_layered_canopy_albedo.png"), tree_rgba)
cv2.imwrite(os.path.join(ASSETS_DIR, "tree_layered_canopy_normal.png"), tree_normal)

tree_contours, _ = cv2.findContours(tree_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
tree_c_pts = []
if tree_contours:
    largest = max(tree_contours, key=cv2.contourArea)
    approx = cv2.approxPolyDP(largest, 0.008 * cv2.arcLength(largest, True), True)
    for p in approx:
        tree_c_pts.append([round(float(p[0][0]) / 512, 4), round(float(p[0][1]) / 512, 4)])

presets_output.append({
    "id": "tree_layered_canopy",
    "name": "Ancient Canopy Oak",
    "type": "foliage",
    "category": "Flora",
    "dominantColor": "#15803d",
    "targetHeight": 5.2,
    "depth": 0.35,
    "description": "Multi-tier voluminous hardwood tree with organic root flare and high-density canopy.",
    "albedoBase64": img_to_base64_png(tree_rgba),
    "normalBase64": img_to_base64_png(tree_normal),
    "contour": tree_c_pts
})

# 5. Environment: Dense Grass Clump
print("Synthesizing Environment: Dense Grass Clump")
grass_bgr = np.zeros((512, 512, 3), dtype=np.uint8)
grass_mask = np.zeros((512, 512), dtype=np.uint8)

# Draw 40 individual grass blades with varied curve & height
np.random.seed(1337)
for i in range(45):
    base_x = 256 + np.random.randint(-180, 180)
    base_y = 512
    tip_x = base_x + np.random.randint(-90, 90)
    tip_y = np.random.randint(90, 260)
    ctrl_x = (base_x + tip_x) // 2 + np.random.randint(-40, 40)
    ctrl_y = (base_y + tip_y) // 2

    blade_pts = []
    for t in np.linspace(0, 1, 20):
        # Quadratic bezier
        bx = int((1 - t)**2 * base_x + 2 * (1 - t) * t * ctrl_x + t**2 * tip_x)
        by = int((1 - t)**2 * base_y + 2 * (1 - t) * t * ctrl_y + t**2 * tip_y)
        blade_pts.append((bx, by))

    shade = np.random.randint(20, 60)
    col = (int(30 + shade * 0.4), int(120 + shade * 1.8), int(45 + shade * 0.6))
    for p_idx in range(len(blade_pts) - 1):
        thickness = max(1, int(10 * (1 - p_idx / len(blade_pts))))
        cv2.line(grass_bgr, blade_pts[p_idx], blade_pts[p_idx + 1], col, thickness)
        cv2.line(grass_mask, blade_pts[p_idx], blade_pts[p_idx + 1], 255, thickness)

grass_b, grass_g, grass_r = cv2.split(grass_bgr)
grass_rgba = cv2.merge([grass_b, grass_g, grass_r, grass_mask])
grass_gray = cv2.cvtColor(grass_bgr, cv2.COLOR_BGR2GRAY)
grass_normal = generate_normal_map(grass_gray, strength=3.0)

cv2.imwrite(os.path.join(ASSETS_DIR, "grass_tuft_dense_albedo.png"), grass_rgba)
cv2.imwrite(os.path.join(ASSETS_DIR, "grass_tuft_dense_normal.png"), grass_normal)

grass_contours, _ = cv2.findContours(grass_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
grass_c_pts = []
if grass_contours:
    largest = max(grass_contours, key=cv2.contourArea)
    approx = cv2.approxPolyDP(largest, 0.008 * cv2.arcLength(largest, True), True)
    for p in approx:
        grass_c_pts.append([round(float(p[0][0]) / 512, 4), round(float(p[0][1]) / 512, 4)])

presets_output.append({
    "id": "grass_tuft_dense",
    "name": "Wild Alpine Grass Clump",
    "type": "foliage",
    "category": "Flora",
    "dominantColor": "#4ade80",
    "targetHeight": 0.85,
    "depth": 0.35,
    "description": "Multi-dimensional layered wild grass clump with organic blade curvature.",
    "albedoBase64": img_to_base64_png(grass_rgba),
    "normalBase64": img_to_base64_png(grass_normal),
    "contour": grass_c_pts
})

# 6. Environment: Ancient Rune Obelisk Prop
print("Synthesizing Environment: Rune Obelisk Prop")
obelisk_bgr = np.zeros((512, 512, 3), dtype=np.uint8)
obelisk_mask = np.zeros((512, 512), dtype=np.uint8)

# Chiseled stone pillar
pts_pillar = np.array([[210, 480], [302, 480], [285, 90], [256, 40], [227, 90]], np.int32)
cv2.fillPoly(obelisk_bgr, [pts_pillar], (110, 115, 120))
cv2.fillPoly(obelisk_mask, [pts_pillar], 255)

# Glowing runes carved in stone
cv2.putText(obelisk_bgr, "Y", (246, 160), cv2.FONT_HERSHEY_SIMPLEX, 1.4, (240, 200, 40), 3)
cv2.putText(obelisk_bgr, "X", (246, 230), cv2.FONT_HERSHEY_SIMPLEX, 1.4, (240, 200, 40), 3)
cv2.putText(obelisk_bgr, "O", (246, 300), cv2.FONT_HERSHEY_SIMPLEX, 1.4, (240, 200, 40), 3)
cv2.putText(obelisk_bgr, "#", (246, 370), cv2.FONT_HERSHEY_SIMPLEX, 1.4, (240, 200, 40), 3)

ob_b, ob_g, ob_r = cv2.split(obelisk_bgr)
ob_rgba = cv2.merge([ob_b, ob_g, ob_r, obelisk_mask])
ob_gray = cv2.cvtColor(obelisk_bgr, cv2.COLOR_BGR2GRAY)
ob_normal = generate_normal_map(ob_gray, strength=3.2)

cv2.imwrite(os.path.join(ASSETS_DIR, "prop_rune_obelisk_albedo.png"), ob_rgba)
cv2.imwrite(os.path.join(ASSETS_DIR, "prop_rune_obelisk_normal.png"), ob_normal)

ob_contours, _ = cv2.findContours(obelisk_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
ob_c_pts = []
if ob_contours:
    largest = max(ob_contours, key=cv2.contourArea)
    approx = cv2.approxPolyDP(largest, 0.005 * cv2.arcLength(largest, True), True)
    for p in approx:
        ob_c_pts.append([round(float(p[0][0]) / 512, 4), round(float(p[0][1]) / 512, 4)])

presets_output.append({
    "id": "prop_rune_obelisk",
    "name": "Ancient Runestone Obelisk",
    "type": "prop",
    "category": "Architecture",
    "dominantColor": "#78716c",
    "targetHeight": 3.8,
    "depth": 0.45,
    "description": "Weathered megalithic stone pillar engraved with glowing runic inscriptions.",
    "albedoBase64": img_to_base64_png(ob_rgba),
    "normalBase64": img_to_base64_png(ob_normal),
    "contour": ob_c_pts
})

# 7. Environment: Mossy Stone Terrain Texture (Seamless Tile)
print("Synthesizing Environment: Mossy Stone Terrain Texture")
terrain_bgr = np.zeros((512, 512, 3), dtype=np.uint8)
for y in range(512):
    for x in range(512):
        noise = (np.sin(x * 0.08) * np.cos(y * 0.08) + np.sin(x * 0.2 + y * 0.15)) * 0.5
        moss = (np.sin(x * 0.03 + y * 0.05) + np.cos(x * 0.06 - y * 0.04)) * 0.5
        gray_stone = 90 + int(noise * 30)
        green_moss = 110 + int(moss * 40)
        terrain_bgr[y, x] = [
            int(50 + noise * 15),
            int(green_moss if moss > 0.1 else gray_stone),
            int(60 + noise * 20 if moss > 0.1 else gray_stone + 5)
        ]

terrain_normal = generate_normal_map(cv2.cvtColor(terrain_bgr, cv2.COLOR_BGR2GRAY), strength=3.0)
cv2.imwrite(os.path.join(ASSETS_DIR, "terrain_surface_stone_albedo.png"), terrain_bgr)
cv2.imwrite(os.path.join(ASSETS_DIR, "terrain_surface_stone_normal.png"), terrain_normal)

presets_output.append({
    "id": "terrain_surface_stone",
    "name": "Mossy Forest Stone Surface",
    "type": "terrain",
    "category": "Terrain",
    "dominantColor": "#4d5b41",
    "targetHeight": 1.0,
    "depth": 1.0,
    "description": "High-detail tiled terrain surface with mineral grit, moss, and normal relief.",
    "albedoBase64": img_to_base64_png(terrain_bgr),
    "normalBase64": img_to_base64_png(terrain_normal),
    "contour": [[0,0], [1,0], [1,1], [0,1]]
})

# Write TypeScript file
print(f"Writing {OUT_TS} with {len(presets_output)} presets...")
ts_content = """// Auto-generated preset library data
// Contains high-detail 3D assets converted from Nano Banana concept art and environment maps.

export interface RawPresetData {
  id: string;
  name: string;
  type: 'npc' | 'foliage' | 'terrain' | 'prop';
  category: string;
  dominantColor: string;
  targetHeight: number;
  depth: number;
  description: string;
  albedoBase64: string;
  normalBase64: string;
  contour: Array<[number, number]>;
}

export const PRESET_CATALOG: RawPresetData[] = """ + json.dumps(presets_output, indent=2) + ";\n"

with open(OUT_TS, "w", encoding="utf-8") as f:
    f.write(ts_content)

print("Done! All presets successfully generated and packaged.")
