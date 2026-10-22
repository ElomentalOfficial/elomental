import math, random
R = random.Random(11)   # change the seed per icon
def j(v, amt): return v + R.uniform(-amt, amt)
def f(x): return f"{x:.1f}"

def blob(pts, wobble=0.0, tension=1.0):
    """Smooth closed shape through points (Catmull-Rom)."""
    pts = [(j(x, wobble), j(y, wobble)) for x, y in pts]; n = len(pts)
    d = f"M{f(pts[0][0])},{f(pts[0][1])}"
    for i in range(n):
        p0, p1, p2, p3 = pts[i-1], pts[i], pts[(i+1) % n], pts[(i+2) % n]
        c1 = (p1[0]+(p2[0]-p0[0])/6*tension, p1[1]+(p2[1]-p0[1])/6*tension)
        c2 = (p2[0]-(p3[0]-p1[0])/6*tension, p2[1]-(p3[1]-p1[1])/6*tension)
        d += f" C{f(c1[0])},{f(c1[1])} {f(c2[0])},{f(c2[1])} {f(p2[0])},{f(p2[1])}"
    return d + " Z"

def soft_poly(pts, radius=8, wobble=1.5, bow=2.5):
    """Polygon with rounded, uneven corners and slightly bowed sides."""
    pts = [(j(x, wobble), j(y, wobble)) for x, y in pts]; n = len(pts); segs = []
    for i in range(n):
        a, v, b = pts[i-1], pts[i], pts[(i+1) % n]
        r = j(radius, radius*0.35)
        ta = min(0.45, r/math.dist(a, v)); tb = min(0.45, r/math.dist(v, b))
        segs.append(((v[0]+(a[0]-v[0])*ta, v[1]+(a[1]-v[1])*ta), v, (v[0]+(b[0]-v[0])*tb, v[1]+(b[1]-v[1])*tb)))
    d = f"M{f(segs[0][2][0])},{f(segs[0][2][1])}"
    for i in range(1, n+1):
        pe = segs[i-1][2]; p1, v, p2 = segs[i % n]
        mx, my = (pe[0]+p1[0])/2, (pe[1]+p1[1])/2; dx, dy = p1[0]-pe[0], p1[1]-pe[1]
        L = math.hypot(dx, dy) or 1; k = R.uniform(-bow, bow)
        d += f" Q{f(mx-dy/L*k)},{f(my+dx/L*k)} {f(p1[0])},{f(p1[1])} Q{f(v[0])},{f(v[1])} {f(p2[0])},{f(p2[1])}"
    return d + " Z"

def star(cx, cy, r_out, r_in, points=5, rot=-90, jitter=0.12, radius=6):
    pts = []
    for i in range(points*2):
        r = (r_out if i % 2 == 0 else r_in)*(1+R.uniform(-jitter, jitter))
        a = math.radians(rot + i*180/points + R.uniform(-6, 6))
        pts.append((cx+r*math.cos(a), cy+r*math.sin(a)))
    return soft_poly(pts, radius=radius, wobble=0.8, bow=1.5)

def wobbly_ellipse(cx, cy, rx, ry, rot=0, n=10, wobble=0.06):
    t = math.radians(rot); pts = []
    for i in range(n):
        a = 2*math.pi*i/n; k = 1+R.uniform(-wobble, wobble)
        x, y = rx*k*math.cos(a), ry*k*math.sin(a)
        pts.append((cx+x*math.cos(t)-y*math.sin(t), cy+x*math.sin(t)+y*math.cos(t)))
    return blob(pts)

def _resample(pts, steps=6):
    out = []; n = len(pts)
    for i in range(n-1):
        p0, p1, p2, p3 = pts[max(i-1, 0)], pts[i], pts[i+1], pts[min(i+2, n-1)]
        for s in range(steps):
            t = s/steps; t2, t3 = t*t, t*t*t
            out.append(tuple(0.5*((2*p1[c])+(-p0[c]+p2[c])*t+(2*p0[c]-5*p1[c]+4*p2[c]-p3[c])*t2+(-p0[c]+3*p1[c]-3*p2[c]+p3[c])*t3) for c in (0, 1)))
    out.append(pts[-1]); return out

def tapered(center, widths, wobble=0.6, round_ends=True):
    """Filled stroke along a centerline with varying width and rounded ends."""
    C = _resample(center); m = len(C)-1; W = []
    for k in range(len(C)):
        u = k/m*(len(widths)-1); i = min(int(u), len(widths)-2); t = u-i
        W.append((widths[i]*(1-t)+widths[i+1]*t)*(1+R.uniform(-0.04, 0.04)))
    left, right = [], []
    for k in range(len(C)):
        a, b = C[max(k-1, 0)], C[min(k+1, m)]; dx, dy = b[0]-a[0], b[1]-a[1]
        L = math.hypot(dx, dy) or 1; nx, ny = -dy/L, dx/L; w = W[k]/2
        left.append((C[k][0]+nx*w, C[k][1]+ny*w)); right.append((C[k][0]-nx*w, C[k][1]-ny*w))
    tip, prev = C[-1], C[-2]; dx, dy = tip[0]-prev[0], tip[1]-prev[1]; L = math.hypot(dx, dy) or 1
    pts = left + [(tip[0]+dx/L*W[-1]*0.45, tip[1]+dy/L*W[-1]*0.45)] + right[::-1]
    if round_ends:
        base, nxt = C[0], C[1]; dx, dy = base[0]-nxt[0], base[1]-nxt[1]; L = math.hypot(dx, dy) or 1
        pts.append((base[0]+dx/L*W[0]*0.45, base[1]+dy/L*W[0]*0.45))
    pts = pts[::2] if len(pts) > 40 else pts
    return blob(pts, wobble=wobble)
