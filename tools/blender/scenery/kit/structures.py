"""The park's buildings and big pieces, each in its own frame and placed by the design:
the glasshouse, the bandstand, the stone bridge, the pitches' floodlight masts and goals, the
paddock's pit building and stand.

Every function returns (parts, lights): parts are (part, role, smooth) in game space; lights as
in props.py ({'p', 'color', 'power', 'kind'}; a floodlight also has 'aim' and 'spot', its cone).
"""
import math

from mathutils import Vector

from .mesh import box, lathe, material, prism, tube

WARM = (1.0, 0.8, 0.56)
FLOOD = (0.86, 0.92, 1.0)
WINDOW = (1.0, 0.86, 0.66)


def materials():
    return {
        'stone': material('stone', (0.3, 0.28, 0.25), rough=0.9),
        'stone.dark': material('stone.dark', (0.17, 0.16, 0.15), rough=0.9),
        'white': material('white', (0.62, 0.63, 0.6), rough=0.5),
        'glass': material('glass', (0.5, 0.55, 0.5), rough=0.1, emission=(1.0, 0.82, 0.6), strength=2.5),
        'roof': material('roof', (0.08, 0.085, 0.09), rough=0.6),
        'steel': material('steel', (0.2, 0.21, 0.22), rough=0.5, metal=0.5),
        'concrete': material('concrete', (0.26, 0.26, 0.25), rough=0.9),
        'paint': material('paint', (0.34, 0.35, 0.36), rough=0.6),
        # dark cladding: lit windows show against it
        'cladding': material('cladding', (0.12, 0.125, 0.13), rough=0.6),
        'window': material('window', (0.6, 0.55, 0.5), rough=0.2, emission=WINDOW, strength=4.0),
        # an office's window, lit dimmer than a garage; one whose lights are off
        'window.dim': material('window.dim', (0.6, 0.55, 0.5), rough=0.2, emission=WINDOW, strength=1.6),
        # a garage's lit workshop, cool white
        'window.garage': material('window.garage', (0.6, 0.6, 0.6), rough=0.2, emission=(0.92, 0.95, 1.0), strength=4.0),
        'tint': material('tint', (0.03, 0.035, 0.04), rough=0.15),
        'flood': material('flood', (0.9, 0.95, 1.0), rough=0.2, emission=FLOOD, strength=12.0),
        'seat': material('seat', (0.07, 0.12, 0.3), rough=0.6),
        'brick': material('brick', (0.22, 0.1, 0.07), rough=0.9),
    }


class Frame:
    """A local frame: x along, y up, z across, origin o, turned by yaw (game space)."""

    def __init__(self, o, yaw):
        self.o = Vector(o)
        self.c, self.s = math.cos(yaw), math.sin(yaw)
        self.yaw = yaw

    def p(self, x, y, z):
        return (self.o.x + x * self.c + z * self.s, self.o.y + y, self.o.z - x * self.s + z * self.c)

    def part(self, part):
        verts, faces = part
        return [self.p(*v) for v in verts], faces

    def box(self, center, size):
        return box(self.p(*center), size, self.yaw)


def _arch_points(span, rise, n):
    """(along, up) points of a segmental arch from -span/2 to +span/2 rising `rise`."""
    r = (span * span / 4 + rise * rise) / (2 * rise)
    a = math.asin(min(1.0, span / 2 / r))
    pts = []
    for k in range(n + 1):
        t = -a + 2 * a * k / n
        pts.append((r * math.sin(t), rise - r + r * math.cos(t)))
    return pts


# ------------------------------------------------------------------------------ glasshouse
def glasshouse(center, yaw):
    """A Victorian palm house: a domed octagonal pavilion between two barrel-vaulted wings, white
    cast-iron ribs over warm-lit glass, on a stone plinth. center: the pavilion's middle at the
    ground; yaw: the wings' axis."""
    F = Frame(center, yaw)
    parts = []
    lights = []
    plinth = 0.9
    wing_len, wing_w, wall_h, vault = 15.0, 10.0, 4.2, 3.3
    pav_r = 8.0
    # the pavilion: an octagonal glass drum on a plinth, a ribbed dome, a lantern on top
    parts.append((F.part(lathe([(pav_r + 0.3, -0.5), (pav_r + 0.3, plinth), (pav_r, plinth + 0.05)], (0, 0, 0), 8, math.pi / 8, close_top=True)), 'stone', False))
    drum_h = 6.5
    parts.append((F.part(lathe([(pav_r - 0.05, plinth), (pav_r - 0.05, drum_h)], (0, 0, 0), 8, math.pi / 8, close_top=False, close_bottom=False)), 'glass', False))
    dome = [(pav_r - 0.05, drum_h)]
    for k in range(1, 9):
        a = k / 8 * math.pi / 2
        dome.append(((pav_r - 0.05) * math.cos(a) * (1 - 0.05 * k / 8), drum_h + 6.0 * math.sin(a)))
    parts.append((F.part(lathe(dome, (0, 0, 0), 8, math.pi / 8, close_top=False, close_bottom=False)), 'glass', False))
    # the dome's ribs and the drum's posts, white iron
    for k in range(8):
        a = math.pi / 8 + 2 * math.pi * k / 8
        ca, sa = math.cos(a), math.sin(a)
        prev = None
        for (r, h) in [(pav_r + 0.06, plinth)] + [(r + 0.08, h) for (r, h) in dome]:
            pt = F.p(ca * r, h, sa * r)
            if prev:
                parts.append((tube(prev, pt, 0.09, 0.08, 4, caps=False), 'white', True))
            prev = pt
    for h in (plinth + 0.05, 3.6, drum_h):
        ring = [(pav_r + 0.04, h - 0.08), (pav_r + 0.04, h + 0.08)]
        parts.append((F.part(lathe(ring, (0, 0, 0), 8, math.pi / 8, close_top=False, close_bottom=False)), 'white', False))
    top = drum_h + 6.0
    parts.append((F.part(lathe([(1.4, top - 0.3), (1.4, top + 1.4), (1.7, top + 1.5), (0.4, top + 2.4), (0.08, top + 3.4), (0.0, top + 3.6)], (0, 0, 0), 8, math.pi / 8)), 'white', False))
    # (no lamps inside: the glass is opaque to the bake, its own glow lights the grounds)
    # the wings: glass walls, a barrel vault, ribs every 2.5 m, on a plinth
    for side in (-1, 1):
        x0 = side * (pav_r - 0.6)
        x1 = side * (pav_r - 0.6 + wing_len)
        xm = (x0 + x1) / 2
        parts.append((F.box((xm, plinth / 2 - 0.25, 0), (wing_len, plinth + 0.5, wing_w + 0.6)), 'stone', False))
        # the vault's cross-section: walls up, then a half ellipse over
        prof = [(-wing_w / 2, plinth), (-wing_w / 2, wall_h)]
        for k in range(1, 8):
            a = math.pi * k / 8
            prof.append((-wing_w / 2 * math.cos(a), wall_h + vault * math.sin(a)))
        prof += [(wing_w / 2, wall_h), (wing_w / 2, plinth)]
        # the glass skin: the profile swept along the wing
        verts = []
        faces = []
        for (z, y) in prof:
            verts.append(F.p(x0, y, z))
            verts.append(F.p(x1, y, z))
        for k in range(len(prof) - 1):
            a, b = 2 * k, 2 * k + 2
            faces.append((a, b, b + 1, a + 1) if side > 0 else (a, a + 1, b + 1, b))
        parts.append(((verts, faces), 'glass', False))
        # the end wall's glass, closing the vault
        end = [F.p(x1, y, z) for (z, y) in prof]
        parts.append(((end, [tuple(range(len(end)))[::side]]), 'glass', False))
        nrib = int(wing_len / 2.5)
        for k in range(nrib + 1):
            x = x0 + (x1 - x0) * k / nrib
            for (za, ya), (zb, yb) in zip(prof, prof[1:]):
                f = 1.0 + 0.012
                parts.append((tube(F.p(x, ya * 1.0 + 0.04, za * f), F.p(x, yb + 0.04, zb * f), 0.07, 0.07, 4, caps=False), 'white', True))
        # the ridge and eaves, along the wing
        for (z, y) in (prof[1], prof[len(prof) // 2], prof[-2]):
            parts.append((tube(F.p(x0, y + 0.06, z * 1.012), F.p(x1, y + 0.06, z * 1.012), 0.09, 0.09, 4, caps=False), 'white', True))
        # doors in the far end (dark against the lit glass)
        parts.append((F.box((x1 + side * 0.08, 1.9, 0), (0.12, 2.4, 1.8)), 'steel', False))
    return parts, lights


# ------------------------------------------------------------------------------ bandstand
def bandstand(center):
    """An octagonal bandstand: a stone base with steps, slender iron columns, a bell roof with a
    finial, its eaves strung with warm bulbs."""
    x, y, z = center
    parts = []
    lights = []
    r = 4.6
    parts.append((lathe([(r + 0.3, -0.4), (r + 0.3, 0.9), (r + 0.45, 0.95), (r + 0.45, 1.1), (0.0001, 1.1)], (x, y, z), 8, math.pi / 8), 'stone', False))
    parts.append((box((x + r + 1.0, y + 0.3, z), (1.6, 0.6, 2.2)), 'stone', False))
    parts.append((box((x + r + 0.7, y + 0.65, z), (1.0, 0.4, 2.2)), 'stone', False))
    for k in range(8):
        a = math.pi / 8 + 2 * math.pi * k / 8
        cx, cz = x + math.cos(a) * (r - 0.2), z + math.sin(a) * (r - 0.2)
        parts.append((tube((cx, y + 1.1, cz), (cx, y + 4.2, cz), 0.09, 0.075, 6, caps=False), 'white', True))
        # the railing between this column and the next (not across the steps)
        b = a + 2 * math.pi / 8
        if abs(math.cos((a + b) / 2)) > 0.92 and math.cos((a + b) / 2) > 0:
            continue
        nx, nz = x + math.cos(b) * (r - 0.2), z + math.sin(b) * (r - 0.2)
        for h in (1.95, 2.0):
            parts.append((tube((cx, y + h, cz), (nx, y + h, nz), 0.035, 0.035, 4, caps=False), 'white', True))
    parts.append((lathe([(r + 0.2, 4.15), (r + 0.25, 4.45), (r + 0.55, 4.5)], (x, y, z), 8, math.pi / 8, close_top=False), 'white', False))
    bell = [(r + 0.55, 4.5), (r + 0.4, 4.6), (r * 0.72, 5.25), (r * 0.4, 6.2), (r * 0.18, 7.0), (0.25, 7.3), (0.35, 7.45), (0.1, 8.2), (0.0001, 8.35)]
    parts.append((lathe(bell, (x, y, z), 8, math.pi / 8, close_bottom=True), 'roof', True))
    for k in range(16):
        a = 2 * math.pi * k / 16
        parts.append((box((x + math.cos(a) * (r + 0.45), y + 4.38, z + math.sin(a) * (r + 0.45)), (0.12, 0.12, 0.12)), 'lamp', False))
    lights.append({'p': (x, y + 3.9, z), 'color': WARM, 'power': 0.9, 'kind': 'bandstand'})
    return parts, lights


# ------------------------------------------------------------------------------ bridge
def bridge(track, i, span, rise, bed_y, half):
    """A stone arch carrying the road over a stream at sample i: the arch's barrel under the road,
    its spandrel walls and ring stones on both faces, parapets past the barriers with a lantern on
    each end pier. span: the arch's span along the road; half: the bridge's half width (to the
    spandrels' outer faces)."""
    from .props import lantern

    parts = []
    lights = []
    tx, tz = track.heading(i)
    rx, rz = track.right(i)
    px, py, pz = track.px[i], track.py[i], track.pz[i]

    def P(along, up, lat):
        # along the road, up from the stream bed, out to the right
        return (px + tx * along + rx * lat, bed_y + up, pz + tz * along + rz * lat)

    deck = py - bed_y  # the road's height over the bed
    # (the arch's crown stays under the road, whatever the road's height here)
    rise = min(rise, deck - 0.45)
    arch = _arch_points(span, rise, 12)
    # the barrel: the arch's underside, the bridge's whole width
    verts = []
    for (a, h) in arch:
        verts.append(P(a, h, -half))
        verts.append(P(a, h, half))
    # (wound to face down, into the arch: it's seen from the stream)
    faces = [(2 * k, 2 * k + 2, 2 * k + 3, 2 * k + 1) for k in range(len(arch) - 1)]
    parts.append(((verts, faces), 'stone', False))
    # the spandrel walls on both faces: from the arch (and the banks beyond it) up to the deck
    for side in (-1, 1):
        lat = side * half
        verts = []
        faces = []
        ext = span / 2 + 6.0
        cols = [(-ext, -1.0)] + [(a, h) for (a, h) in arch] + [(ext, -1.0)]
        for (a, h) in cols:
            verts.append(P(a, h, lat))
            verts.append(P(a, deck - 0.05, lat))
        for k in range(len(cols) - 1):
            q = (2 * k, 2 * k + 2, 2 * k + 3, 2 * k + 1)
            faces.append(q if side > 0 else q[::-1])
        parts.append(((verts, faces), 'stone', False))
        # the ring stones: a band standing proud round the arch
        for (a0, h0), (a1, h1) in zip(arch, arch[1:]):
            parts.append((tube(P(a0, h0 + 0.3, lat + side * 0.12), P(a1, h1 + 0.3, lat + side * 0.12), 0.32, 0.32, 4, caps=False), 'stone.dark', False))
        # the parapet, just outside the barrier, and its end piers with lanterns
        plat = side * (track.barrier + 0.95)
        length = span + 10.0
        mid = P(0.0, deck + 0.55, plat)
        yaw = math.atan2(tx, tz)
        parts.append((box(mid, (0.55, 1.3, length), yaw), 'stone', False))
        parts.append((box(P(0.0, deck + 1.25, plat), (0.7, 0.12, length + 0.2), yaw), 'stone.dark', False))
        for e in (-1, 1):
            pier = P(e * (length / 2 + 0.45), deck + 0.75, plat)
            parts.append((box(pier, (0.95, 1.7, 0.95), yaw), 'stone', False))
            lp, light = lantern((pier[0], pier[1] + 0.85, pier[2]), height=2.2)
            parts += lp
            light['power'] = 0.5
            lights.append(light)
    return parts, lights


# ------------------------------------------------------------------------------ the pitches
def floodlight_mast(base, aim, height=26.0):
    """A tapered steel mast with a frame of eight lamps tilted toward aim (game space)."""
    x, y, z = base
    parts = [(tube((x, y - 0.5, z), (x, y + height, z), 0.32, 0.18, 8, caps=False), 'steel', True)]
    d = Vector((aim[0] - x, aim[1] - (y + height), aim[2] - z))
    d.normalize()
    side = Vector((-d.z, 0.0, d.x))
    side.normalize()
    up = side.cross(d)
    c = Vector((x, y + height, z)) + Vector((d.x, 0.0, d.z)).normalized() * 0.6
    yaw = math.atan2(d.x, d.z)
    parts.append((box(tuple(c + Vector((0, 0.9, 0))), (3.4, 0.18, 0.4), yaw + math.pi / 2), 'steel', False))
    parts.append((box(tuple(c - Vector((0, 0.9, 0))), (3.4, 0.18, 0.4), yaw + math.pi / 2), 'steel', False))
    for row in (-0.45, 0.45):
        for k in range(4):
            off = side * ((k - 1.5) * 0.8) + up * row
            p = c + off + d * 0.15
            parts.append((box(tuple(p), (0.62, 0.62, 0.62), yaw), 'flood', False))
    # (six masts' cones overlap over the pitch: each gives a fraction of its light)
    light = {'p': tuple(c + d * 0.6), 'color': FLOOD, 'power': 0.6, 'kind': 'flood', 'aim': tuple(aim), 'spot': math.radians(72)}
    return parts, [light]


def goal(center, yaw):
    """A football goal: white posts and crossbar, the net's frame behind."""
    F = Frame(center, yaw)
    parts = []
    for z in (-3.66, 3.66):
        parts.append((tube(F.p(0, 0, z), F.p(0, 2.44, z), 0.06, 0.06, 6), 'white', False))
        parts.append((tube(F.p(0, 2.44, z), F.p(-1.6, 1.8, z), 0.025, 0.025, 4, caps=False), 'steel', False))
        parts.append((tube(F.p(-1.6, 1.8, z), F.p(-2.0, 0.0, z), 0.025, 0.025, 4, caps=False), 'steel', False))
    parts.append((tube(F.p(0, 2.44, -3.66), F.p(0, 2.44, 3.66), 0.06, 0.06, 6), 'white', False))
    return parts, []


# ------------------------------------------------------------------------------ the paddock
def pit_building(center, yaw, length=96.0, depth=12.0, seed=11):
    """The club's pit building: a row of garages lit inside, set back under the office floor; the
    office floor's glazed front over them (some offices still lit); a flat roof with a parapet, and
    race control's glass box at the middle.
    center: the middle of its front at the ground; it faces -z of its frame (yaw)."""
    import random

    rng = random.Random(seed)
    F = Frame(center, yaw)
    parts = []
    lights = []
    h1, h2 = 4.4, 8.2
    recess = 1.4
    # the shell: the office floor over the whole depth, the ground floor behind the garages' fronts
    parts.append((F.box((0, (h1 + h2) / 2, depth / 2), (length, h2 - h1, depth)), 'cladding', False))
    parts.append((F.box((0, h1 / 2, (depth + recess) / 2), (length, h1, depth - recess)), 'cladding', False))
    parts.append((F.box((0, h2 + 0.45, depth / 2), (length + 0.4, 0.9, depth + 0.4)), 'cladding', False))
    # the garages: their lit backs, the doors' headers, posts between
    n = 12
    bay = length / n
    for k in range(n):
        x = -length / 2 + bay * (k + 0.5)
        parts.append((F.box((x, h1 / 2 - 0.1, recess - 0.06), (bay - 0.7, h1 - 0.2, 0.1)), 'window.garage', False))
        parts.append((F.box((x, h1 - 0.45, 0.05), (bay - 0.7, 0.9, 0.12)), 'steel', False))
        lights.append({'p': F.p(x, 3.4, 0.2), 'color': WINDOW, 'power': 0.5, 'kind': 'garage'})
    for k in range(n + 1):
        x = -length / 2 + bay * k
        parts.append((F.box((x, h1 / 2, recess / 2 - 0.2), (0.7, h1, recess + 0.4)), 'concrete', False))
    # the office floor: a pane between each pair of mullions, the offices behind lit or not
    y_mid = (h1 + h2) / 2 + 0.2
    panes = int(length / 3)
    pitch = (length - 1.0) / panes
    for k in range(panes):
        x = -length / 2 + 0.5 + (k + 0.5) * pitch
        parts.append((F.box((x, y_mid, -0.05), (pitch, 2.6, 0.1)), 'window.dim' if rng.random() < 0.6 else 'tint', False))
    for k in range(panes + 1):
        x = -length / 2 + 0.5 + k * pitch
        parts.append((F.box((x, y_mid, -0.15), (0.14, 2.7, 0.2)), 'steel', False))
    parts.append((F.box((0, h1 + 0.1, -0.6), (length, 0.25, 1.3)), 'cladding', False))
    # race control on the roof, at the middle
    parts.append((F.box((0, h2 + 2.6, depth / 2), (14.0, 4.2, 8.0)), 'cladding', False))
    parts.append((F.box((0, h2 + 2.8, depth / 2 - 4.05), (13.4, 2.6, 0.1)), 'window', False))
    parts.append((F.box((0, h2 + 4.9, depth / 2), (15.0, 0.4, 9.0)), 'cladding', False))
    return parts, lights


def stand(center, yaw, length=56.0, rows=9):
    """A covered stand: stepped seating rising back from the front, a roof on steel columns.
    center: the middle of its front at the ground; it faces -z of its frame."""
    F = Frame(center, yaw)
    parts = []
    tread, riser = 0.85, 0.42
    for k in range(rows):
        z = 0.4 + k * tread
        parts.append((F.box((0, 0.6 + k * riser, z + tread / 2), (length, 0.25, tread)), 'concrete', False))
        parts.append((F.box((0, 0.9 + k * riser, z + tread * 0.6), (length - 1.0, 0.35, 0.4)), 'seat', False))
    back = 0.4 + rows * tread
    hb = 0.6 + rows * riser
    parts.append((F.box((0, hb / 2, back + 0.15), (length, hb, 0.3)), 'concrete', False))
    # the end walls step up with the rows, a rail's height over them
    for e in (-1, 1):
        parts.append((F.box((e * length / 2, 0.75, 0.2), (0.3, 1.5, 0.4)), 'concrete', False))
        for k in range(rows):
            h = 0.6 + k * riser + 1.0
            parts.append((F.box((e * length / 2, h / 2, 0.4 + (k + 0.5) * tread), (0.3, h, tread)), 'concrete', False))
    roof_y = hb + 3.0
    for k in range(5):
        x = -length / 2 + length * k / 4
        parts.append((tube(F.p(x, 0, back), F.p(x, roof_y, back), 0.18, 0.18, 6), 'steel', False))
    parts.append((F.box((0, roof_y + 0.15, back / 2 - 1.0), (length + 2.0, 0.3, back + 4.0)), 'roof', False))
    # lamps under the roof, aimed down at the seats
    lights = [{'p': F.p(x, roof_y - 0.4, back / 2), 'color': WINDOW, 'power': 0.6, 'kind': 'stand', 'aim': F.p(x, hb / 2, back / 2), 'spot': math.radians(110)}
              for x in (-length / 3, 0.0, length / 3)]
    return parts, lights
