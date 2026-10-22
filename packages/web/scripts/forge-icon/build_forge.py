"""The Forge tile's icon: a Stardust gem lit by the forge fire, two twinkles.
Brush style (organic.py shapes, stipple and grain filters) in palette colours, a dark
outline and extruded edge like the wallet and the sword, so one image suits both themes.

    python scripts/forge-icon/build_forge.py <tmp dir>
    node scripts/forge-icon/render.ts <tmp dir> src/art
"""
import sys, organic
from organic import soft_poly, star, tapered
FILTERS = '''<filter id="dither" filterUnits="userSpaceOnUse" x="0" y="0" width="400" height="400">
  <feGaussianBlur in="SourceAlpha" stdDeviation="9" result="b"/>
  <feTurbulence type="fractalNoise" baseFrequency="0.95" numOctaves="1" seed="3" result="n"/>
  <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" result="nA"/>
  <feComposite in="b" in2="nA" operator="arithmetic" k1="0" k2="1.3" k3="0.9" k4="-1.0" result="mix"/>
  <feComponentTransfer in="mix" result="mask"><feFuncA type="discrete" tableValues="0 1"/></feComponentTransfer>
  <feComposite in="SourceGraphic" in2="mask" operator="in"/>
</filter>
<filter id="grain" filterUnits="userSpaceOnUse" x="0" y="0" width="400" height="400">
  <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="5" result="n"/>
  <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.4 1.25" result="specks"/>
  <feFlood flood-color="#000" flood-opacity="0.22" result="ink"/>
  <feComposite in="ink" in2="specks" operator="in" result="inkSpecks"/>
  <feComposite in="inkSpecks" in2="SourceAlpha" operator="in" result="grainIn"/>
  <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="grainIn"/></feMerge>
</filter>'''

OUT = '#2f251d'          # lava-900: outline and extruded edge
CREAM, CREAM_SH, CREAM_DEEP, GLOSS = '#e8e8ce', '#b3b5a0', '#8c8d76', '#ffffe5'
LAVA, LAVA_SH, EMBER, EMBER_LT = '#a85b37', '#7a421f', '#e69c74', '#fddfcf'


class Icon:
    def __init__(self, seed):
        organic.R.seed(seed)
        self.defs, self.body, self.n = [FILTERS], [], 0

    def solid(self, d, base, tones=(), lines='', edge=(4, 6), outline=7):
        """Extruded dark edge, dark outline, the fill, stippled tones and lines clipped to it."""
        if edge:
            self.body.append(f'<path d="{d}" fill="{OUT}" stroke="{OUT}" stroke-width="{outline}" stroke-linejoin="round" transform="translate({edge[0]},{edge[1]})"/>')
        if outline:
            self.body.append(f'<path d="{d}" fill="{OUT}" stroke="{OUT}" stroke-width="{outline}" stroke-linejoin="round"/>')
        self.n += 1; sid = f's{self.n}'
        self.defs.append(f'<clipPath id="c-{sid}"><path d="{d}"/></clipPath>')
        self.body.append(f'<path d="{d}" fill="{base}"/>')
        inner = ''.join(f'<path d="{p}" fill="{c}" filter="url(#dither)"/>' for p, c in tones) + lines
        if inner: self.body.append(f'<g clip-path="url(#c-{sid})">{inner}</g>')

    def raw(self, svg): self.body.append(svg)

    def svg(self):
        return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">'
                f'<defs>{"".join(self.defs)}</defs><g filter="url(#grain)">{"".join(self.body)}</g></svg>')


def gloss(pts, w=(6, 5, 3.5)):
    return f'<path d="{tapered(pts, list(w))}" fill="{GLOSS}" opacity="0.9"/>'


def gem():
    """A Stardust gem (what the Forge spends) lit from the right as if by the forge fire."""
    ic = Icon(23)
    gem_pts = [(134, 210), (266, 210), (308, 250), (200, 352), (92, 250)]
    gem = soft_poly(gem_pts, radius=9, wobble=0.6, bow=1.5)
    table = 'M134,210 L266,210 L240,250 L160,250 Z'
    ic.solid(gem, CREAM, tones=[
        ('M190,250 L240,250 L308,250 L200,360 Z', CREAM_SH),          # the middle facets in shade
        (table, GLOSS),                                                  # the bright table
        # a fire to its right: ember over the right facets, deeper lava at the edge
        ('M206,200 C214,240 204,290 176,360 L340,360 L340,200 Z', EMBER_LT),
        ('M238,200 C246,240 236,290 206,360 L340,360 L340,200 Z', EMBER),
        ('M276,214 C284,240 276,272 250,320 L340,320 L340,214 Z', LAVA),
    ], lines=''.join(f'<path d="{tapered(p, [3, 3])}" fill="{CREAM_DEEP}"/>' for p in (
        [(92, 250), (232, 250)], [(160, 250), (200, 352)],
        [(160, 250), (134, 210)]))
        # the facet lines inside the glow, in the fire's own shade
        + ''.join(f'<path d="{tapered(p, [3, 3])}" fill="{LAVA_SH}"/>' for p in (
            [(232, 250), (308, 250)], [(240, 250), (200, 352)], [(240, 250), (266, 210)]))
        # the firelit rim down the right edge
        + f'<path d="{tapered([(270, 214), (300, 244), (262, 290), (214, 342)], [5, 6, 5, 3])}" fill="{EMBER_LT}"/>'
        + gloss([(112, 248), (140, 284), (172, 318)], (5, 4, 2.5)))
    ic.raw(f'<path d="{star(106, 196, 26, 7, points=4, rot=-90, radius=2)}" fill="{EMBER}" stroke="{OUT}" stroke-width="4" stroke-linejoin="round"/>')
    ic.raw(f'<path d="{star(318, 280, 15, 5, points=4, rot=-90, radius=1.5)}" fill="{EMBER}" stroke="{OUT}" stroke-width="3.5" stroke-linejoin="round"/>')
    return ic.svg()


if __name__ == '__main__':
    with open(f'{sys.argv[1]}/forge.svg', 'w', encoding='utf-8') as fh:
        fh.write(gem())
    print('built')