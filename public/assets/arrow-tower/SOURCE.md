# Arrow tower validation assets

Created for this project on 2026-10-01 with Blender 5.1.2.
Original procedural geometry and simple PBR materials; no third-party models or textures used.

Generator: tools/blender/build_arrow_tower.py
Editable scene: assets-source/arrow-tower/arrow-tower.blend

- arrow-tower.glb: tower, rotating mount, bow and Shoot animation.
- bow.glb: standalone bow, its string rig and Shoot animation.
- arrow.glb: standalone projectile, no animation or physics.

Units: metres. Blender: Z up, -Y forward. glTF/Three.js: Y up, +Z forward.
TowerRoot is at the ground-centre. TurretYaw is the aiming pivot.
BowRoot is at the grip-centre. Muzzle is the spawn transform for ArrowRoot
in the released/ready pose; it is an arrow-centre socket, not an arrow-tip socket.
ArrowRoot is the projectile reference point; ArrowTip marks its point.

Shoot: 1 second at 30 fps; draw, hold, release at 0.5 s, settle.
Only the bowstring is deformed. Arrow flight and target tracking belong to runtime code.
The presentation arrow in the .blend and renders is staged for the demonstration;
the exported arrow asset has its root at the origin.
