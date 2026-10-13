"""Park trees, low-poly but true to their kinds in outline: a trunk, a few main branches and lumpy
clumps of leaves (or a conifer's tiers, a willow's curtain). Near the road a tree gets its branches
and rounder clumps; further off two coarse clumps on a bare trunk, which is all that reads there.

tree(kind, base, rng, near) -> [(part, material role, smooth, crown centre)], in game space. The
leaves carry their crown's centre: their normals are bent toward it (see Mesh.add), so a crown lights
as one soft mass, not a heap of facets.
"""
import math

from mathutils import Vector

from .mesh import blob, cone, material, tube

# leaves' own colours (the moon and the lanterns light them)
SPECIES = {
    # broad, low-domed crowns
    'oak': dict(trunk=(2.6, 3.6), girth=(0.32, 0.46), crown=(6.0, 8.5), height=(5.0, 7.0), clumps=(5, 6), leaves='leaves.oak'),
    # the plane trees along the avenue and the promenade: tall, wide, lifted crowns
    'plane': dict(trunk=(4.0, 5.2), girth=(0.3, 0.4), crown=(5.5, 7.5), height=(6.5, 8.5), clumps=(5, 6), leaves='leaves.plane'),
    # limes: tall ovals
    'lime': dict(trunk=(2.4, 3.2), girth=(0.24, 0.34), crown=(3.6, 5.0), height=(7.5, 10.5), clumps=(4, 5), leaves='leaves.lime'),
    # birches: slender, pale bark, small crowns
    'birch': dict(trunk=(3.0, 4.0), girth=(0.13, 0.19), crown=(2.4, 3.4), height=(5.5, 7.5), clumps=(3, 4), leaves='leaves.birch', bark='bark.birch'),
    # Lombardy poplars: columns
    'poplar': dict(trunk=(1.2, 1.8), girth=(0.22, 0.3), crown=(1.6, 2.2), height=(12.0, 16.0), clumps=(3, 4), leaves='leaves.poplar'),
    'pine': dict(trunk=(1.4, 2.2), girth=(0.22, 0.3), crown=(3.0, 4.2), height=(9.0, 13.0), tiers=(4, 5), leaves='leaves.pine'),
    'willow': dict(trunk=(1.8, 2.4), girth=(0.34, 0.48), crown=(5.0, 6.5), height=(5.0, 6.5), clumps=(5, 6), leaves='leaves.willow'),
}

LEAF_COLORS = {
    'leaves.oak': (0.068, 0.11, 0.045),
    'leaves.plane': (0.085, 0.125, 0.05),
    'leaves.lime': (0.095, 0.14, 0.05),
    'leaves.birch': (0.11, 0.15, 0.06),
    'leaves.poplar': (0.075, 0.12, 0.05),
    'leaves.pine': (0.04, 0.075, 0.05),
    'leaves.willow': (0.115, 0.16, 0.065),
}


def materials():
    m = {name: material(name, col, rough=0.9) for name, col in LEAF_COLORS.items()}
    m['bark'] = material('bark', (0.06, 0.05, 0.042), rough=0.95)
    m['bark.birch'] = material('bark.birch', (0.42, 0.4, 0.37), rough=0.9)
    return m


def _span(rng, lo_hi):
    lo, hi = lo_hi
    return lo + (hi - lo) * rng.random()


def tree(kind, base, rng, near=True, scale=1.0, min_leaf=None):
    """The parts of one tree standing at base (game space). min_leaf: no leaves lower than this
    above the base (a tree whose crown reaches over the road: the trunk grows taller instead)."""
    sp = SPECIES[kind]
    bx, by, bz = base
    s = scale * (0.85 + 0.3 * rng.random())
    parts = []
    bark = sp.get('bark', 'bark')
    leaves = sp['leaves']
    trunk_h = _span(rng, sp['trunk']) * s
    girth = _span(rng, sp['girth']) * s
    crown_r = _span(rng, sp.get('crown', (3, 4))) * s
    height = _span(rng, sp['height']) * s
    if min_leaf is not None and kind != 'willow':
        # (a cautious guess at the lowest leaves: the crown's bottom clumps, lumps and all)
        low = trunk_h if kind == 'pine' else trunk_h + (height - trunk_h) * 0.19 - 0.45 * crown_r
        if low < min_leaf:
            trunk_h += min_leaf - low
            height += min_leaf - low
    lean = (rng.uniform(-0.12, 0.12), rng.uniform(-0.12, 0.12))
    top = Vector((bx + lean[0] * trunk_h, by + trunk_h, bz + lean[1] * trunk_h))
    sides = 7 if near else 5
    if kind == 'pine':
        parts.append((tube((bx, by - 0.3, bz), (top.x, by + height * 0.85, top.z), girth, girth * 0.25, sides, caps=False), bark, True))
        tiers = rng.randint(*sp['tiers']) if near else 3
        r0 = crown_r
        for k in range(tiers):
            f = k / max(1, tiers - 1)
            y = by + trunk_h + (height - trunk_h) * f * 0.82
            r = r0 * (1.0 - 0.72 * f)
            h = (height - trunk_h) * (0.42 - 0.12 * f)
            parts.append((cone((top.x, y, top.z), h, r, 8 if near else 6, rng.random() * 6.3), leaves, False))
        return parts
    # the trunk, and its main branches up into the crown
    parts.append((tube((bx, by - 0.3, bz), tuple(top), girth, girth * 0.7, sides, caps=False), bark, True))
    crown_y = by + trunk_h + (height - trunk_h) * 0.5
    crown_h = (height - trunk_h) * 0.5
    nb = rng.randint(3, 4) if near else 0
    for k in range(nb):
        a = 2 * math.pi * (k + rng.random() * 0.5) / nb
        reach = crown_r * (0.45 + 0.2 * rng.random())
        end = (top.x + math.cos(a) * reach, crown_y + crown_h * rng.uniform(-0.1, 0.4), top.z + math.sin(a) * reach)
        parts.append((tube(tuple(top), end, girth * 0.55, girth * 0.22, 5, caps=False), bark, True))
    centre = (top.x, crown_y, top.z)
    if kind == 'willow':
        # a dome, and the curtain of long drooping strands round its edge
        parts.append((blob((top.x, crown_y + crown_h * 0.3, top.z), (crown_r * 0.8, crown_h * 0.75, crown_r * 0.8), 1 if near else 0, 0.16, rng.random() * 50, squash_bottom=0.5), leaves, True, centre))
        strands = rng.randint(*sp['clumps']) + (4 if near else 0)
        for k in range(strands):
            a = 2 * math.pi * (k + rng.random() * 0.4) / strands
            r = crown_r * (0.75 + 0.2 * rng.random())
            cx, cz = top.x + math.cos(a) * r, top.z + math.sin(a) * r
            hang = crown_y - (by + 1.3 + rng.random() * 0.8)
            parts.append((blob((cx, crown_y - hang * 0.45, cz), (crown_r * 0.32, hang * 0.6, crown_r * 0.32), 1 if near else 0, 0.22, rng.random() * 50), leaves, True, (top.x, crown_y - hang * 0.3, top.z)))
        return parts
    clumps = rng.randint(*sp['clumps']) if near else 2
    if not near:
        # two big clumps where the crown is
        for k in range(2):
            off = (rng.uniform(-0.25, 0.25) * crown_r, (0.15 if k else -0.1) * crown_h, rng.uniform(-0.25, 0.25) * crown_r)
            parts.append((blob((top.x + off[0], crown_y + off[1], top.z + off[2]), (crown_r * 0.85, crown_h * 0.95, crown_r * 0.85), 0, 0.2, rng.random() * 50), leaves, True, centre))
        return parts
    # a crown of clumps: one high in the middle, the rest round a shell, fuller below than above
    parts.append((blob((top.x, crown_y + crown_h * 0.35, top.z), (crown_r * 0.6, crown_h * 0.75, crown_r * 0.6), 1, 0.2, rng.random() * 50), leaves, True, centre))
    for k in range(clumps - 1):
        a = 2 * math.pi * (k + rng.random() * 0.6) / (clumps - 1)
        r = crown_r * (0.55 + 0.25 * rng.random())
        y = crown_y + crown_h * rng.uniform(-0.45, 0.25)
        cr = crown_r * (0.38 + 0.18 * rng.random())
        parts.append((blob((top.x + math.cos(a) * r, y, top.z + math.sin(a) * r), (cr, cr * 0.8, cr), 1, 0.22, rng.random() * 50, squash_bottom=0.25), leaves, True, centre))
    return parts


def crown_of(kind, scale=1.0):
    """Rough crown radius and height of a kind (for spacing and clearance)."""
    sp = SPECIES[kind]
    return sp['crown'][1] * scale * 1.15, sp['height'][1] * scale * 1.15
