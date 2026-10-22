"""Forge icon for Elomental's Home tile: a hammer resting on an anvil, one spark.
Brush style, app palette only; one SVG per theme (anvil cream on dark, crimson on light,
like the Setup cog)."""
import sys, organic
from organic import blob, soft_poly, star, wobbly_ellipse, tapered

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

THEMES = {
    # palette.css ramps
    'dark': dict(anvil='#e8e8ce', anvil_sh='#b3b5a0', anvil_deep='#8c8d76', anvil_rim='#ffffe5',
                 handle='#945856', handle_sh='#623432', handle_lt='#c48481',
                 spark='#e69c74', spark_core='#ffffe5'),
    'light': dict(anvil='#794341', anvil_sh='#623432', anvil_deep='#462e2d', anvil_rim='#945856',
                  handle='#7a421f', handle_sh='#5e381b', handle_lt='#a85b37',
                  spark='#d18159', spark_core='#fddfcf'),
}
HEAD, HEAD_SH, HEAD_LT = '#a85b37', '#7a421f', '#e69c74'


def build(theme):
    organic.R.seed(11)  # the same shapes in both themes, only the colours change
    c = THEMES[theme]
    defs, body = [FILTERS], []
    n = [0]

    def shape(d, base, tones=(), lines=''):
        n[0] += 1; sid = f's{n[0]}'
        defs.append(f'<clipPath id="c-{sid}"><path d="{d}"/></clipPath>')
        body.append(f'<path d="{d}" fill="{base}"/>')
        inner = ''.join(f'<path d="{p}" fill="{col}" filter="url(#dither)"/>' for p, col in tones) + lines
        if inner: body.append(f'<g clip-path="url(#c-{sid})">{inner}</g>')

    # --- the spark, behind everything: one ember starburst where the hammer struck
    shape(star(122, 134, 40, 15, points=8, rot=-80, jitter=0.2, radius=3), c['spark'],
          tones=[('M122,134 L190,134 L190,200 L100,200 Z', HEAD)])
    shape(wobbly_ellipse(121, 135, 9, 8, n=8), c['spark_core'])

    # --- the anvil: horn to the left, flat face, waist, wide foot
    anvil = soft_poly([
        (40, 196), (112, 176), (338, 172), (342, 212), (296, 220), (262, 244),
        (288, 276), (306, 306), (124, 308), (146, 276), (172, 246), (128, 222), (78, 208),
    ], radius=11, wobble=1.2, bow=3)
    shape(anvil, c['anvil'], tones=[
        # under the face: the waist in its shade
        ('M40,214 C140,226 250,226 345,216 L345,330 L30,330 Z', c['anvil_sh']),
        # the far (right) side and the foot's underside, deeper
        ('M236,200 C268,240 286,270 300,320 L360,320 L360,180 Z', c['anvil_deep']),
        ('M110,292 C180,298 250,298 320,290 L320,330 L100,330 Z', c['anvil_deep']),
        # the hammer head's cast shadow on the face
        (wobbly_ellipse(212, 181, 48, 10, rot=-3, n=9), c['anvil_deep']),
    ], lines=
        # a light rim along the lit top edge of the face and the horn
        f'<path d="{tapered([(52, 196), (110, 180), (200, 176), (300, 174), (334, 176)], [3, 4, 3.6, 3, 2])}" fill="{c["anvil_rim"]}"/>'
        # the hardy hole near the heel
        + f'<path d="{soft_poly([(300, 178), (318, 178), (318, 190), (300, 190)], radius=3, wobble=0.5, bow=0.6)}" fill="{c["anvil_deep"]}"/>')

    # --- the hammer, just struck: the head upright with its face flat on the anvil, the
    #     handle at right angles to it, rising a little to the right
    handle = tapered([(208, 132), (250, 123), (294, 113), (332, 104), (356, 98)], [26, 25, 24, 23, 22], wobble=0.4)
    shape(handle, c['handle'], tones=[
        ('M200,144 C262,131 314,119 370,107 L370,150 L200,175 Z', c['handle_sh']),
    ], lines=f'<path d="{tapered([(240, 118), (290, 107), (340, 95)], [3.6, 3, 2])}" fill="{c["handle_lt"]}"/>')

    head = soft_poly([(156, 90), (212, 80), (224, 176), (170, 184)], radius=10, wobble=0.8, bow=2)
    shape(head, HEAD, tones=[
        # the far side of the head in its shade
        ('M202,72 C210,120 214,150 218,192 L270,192 L270,72 Z', HEAD_SH),
    ], lines=
        f'<path d="{tapered([(166, 100), (170, 132), (175, 164)], [5, 4.2, 2.8])}" fill="{HEAD_LT}"/>'
        # the striking face, a band a shade darker where it meets the anvil
        + f'<path d="{soft_poly([(166, 166), (222, 158), (225, 188), (168, 194)], radius=3, wobble=0.5, bow=1)}" fill="{HEAD_SH}" opacity="0.6"/>')

    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">'
            f'<defs>{"".join(defs)}</defs><g filter="url(#grain)">{"".join(body)}</g></svg>')


if __name__ == '__main__':
    out = sys.argv[1]
    for t in THEMES:
        with open(f'{out}/forge-{t}.svg', 'w', encoding='utf-8') as fh:
            fh.write(build(t))
    print('built')
