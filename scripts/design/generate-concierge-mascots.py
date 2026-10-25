"""Build the editable, self-contained Tiger345 concierge SVG collection."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/brand/tiger345/concierge'
OUT.mkdir(parents=True, exist_ok=True)
DEFS = '''<defs>
 <radialGradient id="fur" cx="35%" cy="25%" r="80%"><stop stop-color="#fffdf5"/><stop offset=".55" stop-color="#fff1d9"/><stop offset=".88" stop-color="#f3d9b4"/><stop offset="1" stop-color="#dfb88c"/></radialGradient>
 <radialGradient id="face" cx="40%" cy="22%" r="85%"><stop stop-color="#fff9eb"/><stop offset=".7" stop-color="#ffeaca"/><stop offset="1" stop-color="#efcc9c"/></radialGradient>
 <radialGradient id="orange" cx="30%" cy="20%" r="85%"><stop stop-color="#ffb354"/><stop offset=".55" stop-color="#ff8a3c"/><stop offset="1" stop-color="#e86a1b"/></radialGradient>
 <radialGradient id="pink"><stop stop-color="#f6a58c" stop-opacity=".75"/><stop offset="1" stop-color="#f6a58c" stop-opacity="0"/></radialGradient>
 <linearGradient id="hat" x1="0" y1="0" x2=".7" y2="1"><stop stop-color="#fffefa"/><stop offset=".55" stop-color="#fff8ec"/><stop offset="1" stop-color="#dfc6aa"/></linearGradient>
 <linearGradient id="navy" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#425675"/><stop offset=".5" stop-color="#293d5b"/><stop offset="1" stop-color="#1f2d4d"/></linearGradient>
 <radialGradient id="eye" cx="35%" cy="25%"><stop stop-color="#59463b"/><stop offset=".6" stop-color="#2e2723"/><stop offset="1" stop-color="#161a20"/></radialGradient>
 <linearGradient id="heart" x2=".7" y2="1"><stop stop-color="#ff9b89"/><stop offset=".5" stop-color="#ff695f"/><stop offset="1" stop-color="#dc4248"/></linearGradient>
 <filter id="shadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#9c693d" flood-opacity=".16"/></filter>
 <filter id="soft"><feGaussianBlur stdDeviation="5"/></filter>
 <filter id="plush" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".72" numOctaves="3" stitchTiles="stitch" result="noise"/><feColorMatrix in="noise" type="saturate" values="0"/><feComposite in2="SourceAlpha" operator="in"/><feBlend in="SourceGraphic" mode="soft-light"/></filter>
</defs>'''

def eye(x, y, closed=False):
    if closed:
        return f'<path d="M{x-8} {y+2}q8-13 16 0" fill="none" stroke="#322a24" stroke-width="4.5" stroke-linecap="round"/>'
    return f'<ellipse cx="{x}" cy="{y}" rx="7.8" ry="10.2" fill="url(#eye)"/><ellipse cx="{x-2}" cy="{y-4}" rx="2" ry="2.6" fill="#fff" opacity=".55"/>'

def heart(x,y,s=1):
    return f'<path transform="translate({x} {y}) scale({s})" d="M0 9C-19-6-25-18-16-25-8-31-1-26 0-21 7-33 24-29 23-16 22-5 10 3 0 9Z" fill="url(#heart)"/>'

def head(mood):
    eyes=eye(155,215,mood in ('happy','love','sorry'))+eye(239,215,mood in ('happy','love','sorry','wink'))
    if mood=='surprised':
        mouth='<ellipse cx="198" cy="238" rx="7" ry="10" fill="#49342a"/><path d="M194 244q4-4 8 0" stroke="#ee9b86" stroke-width="4"/>'
    elif mood=='happy':
        mouth='<path d="M185 232q13 24 26 0Z" fill="#49342a"/><path d="M190 242q8-7 16 0" stroke="#fba18c" stroke-width="5"/>'
    elif mood in ('thinking','curious'):
        mouth='<path d="M191 239q7-5 14 0" fill="none" stroke="#392c24" stroke-width="3.5" stroke-linecap="round"/>'
    elif mood=='sorry':
        mouth='<path d="M189 239q9-7 18 0" fill="none" stroke="#392c24" stroke-width="3.5" stroke-linecap="round"/>'
    else:
        mouth='<path d="M186 233q12 13 25-2" fill="none" stroke="#322a24" stroke-width="4" stroke-linecap="round"/>'
    return f'''<g filter="url(#shadow)">
 <g><ellipse cx="102" cy="150" rx="31" ry="34" transform="rotate(-25 102 150)" fill="url(#orange)"/><ellipse cx="102" cy="151" rx="19" ry="22" fill="#ffc393"/><ellipse cx="292" cy="149" rx="30" ry="34" transform="rotate(22 292 149)" fill="url(#orange)"/><ellipse cx="292" cy="151" rx="18" ry="22" fill="#ffc393"/></g>
 <path d="M83 209C79 152 123 124 194 124 267 121 309 151 313 209 319 267 285 290 204 294 124 297 87 275 83 209Z" fill="url(#fur)" stroke="#f5dfc0" stroke-width="1.5"/>
 <path d="M111 214C109 176 142 161 198 161 254 160 285 179 285 218 285 259 253 277 199 277 144 278 113 260 111 214Z" fill="url(#face)" stroke="#edcda5" stroke-width="1.3"/>
 <path d="M115 203C118 177 149 168 192 168" fill="none" stroke="#fffdf4" stroke-width="4" stroke-linecap="round" opacity=".8"/>
 <g fill="url(#orange)"><path d="M174 132q24-7 45-1l-1 8-13 2 1 7 12-1 1 8q-22 7-44 1l1-8 12-1-1-7-13 1Z"/>
 <path d="M85 211q-4-16 5-17l10 2 1 17Z"/><path d="M88 231l13-3 3 11-12 7Z"/><path d="M102 258l10-7 8 10-10 7Z"/>
 <path d="M301 184q12-2 12 14l-13-4Z"/><path d="M302 212l13 3-1 13-13-5Z"/><path d="M297 243l11 5-6 11-11-8Z"/></g>
 <ellipse cx="139" cy="239" rx="24" ry="22" fill="url(#pink)"/><ellipse cx="257" cy="239" rx="24" ry="22" fill="url(#pink)"/>
 {eyes}{mouth}
 <g transform="rotate(-7 193 115)"><path d="M136 109q-5-31 15-35l95 2q17 9 7 37l-4 13q-53-8-110 4Z" fill="url(#hat)" stroke="#f4e6d5"/>
 <ellipse cx="140" cy="79" rx="25" ry="29" transform="rotate(-20 140 79)" fill="url(#hat)"/>
 <ellipse cx="164" cy="65" rx="28" ry="35" transform="rotate(-13 164 65)" fill="url(#hat)"/>
 <ellipse cx="197" cy="58" rx="30" ry="37" fill="url(#hat)"/>
 <ellipse cx="229" cy="64" rx="27" ry="33" transform="rotate(15 229 64)" fill="url(#hat)"/>
 <path d="M141 111q51-16 109 0l-2 17q-53-8-109 4Z" fill="url(#hat)"/>
 <path d="M148 114q46-11 93-1" fill="none" stroke="#fffdf7" stroke-width="3" opacity=".85"/></g></g>'''

def body(mood):
    wave=mood in ('greeting','wink','surprised')
    return f'''<ellipse cx="201" cy="415" rx="92" ry="9" fill="#ba926c" opacity=".18" filter="url(#soft)"/>
 <path d="M266 363q49 0 35-30-8-16-20-4" fill="none" stroke="#efcc9c" stroke-width="22" stroke-linecap="round"/>
 <path d="M286 333l12 4m-9 13 12 3" stroke="#f69a45" stroke-width="7"/>
 <ellipse cx="167" cy="388" rx="31" ry="26" fill="url(#fur)"/><ellipse cx="234" cy="388" rx="30" ry="26" fill="url(#fur)"/>
 <path d="M145 275q-22 38-10 102 64 32 128-1 10-62-16-102Z" fill="url(#fur)"/>
 <path d="M150 278l-7 54 15 3 8-55m69-1 8 57 15-3-10-58" fill="url(#navy)"/>
 <path d="M149 323q47 14 97 0l13 51q-62 26-122-1Z" fill="url(#navy)" stroke="#253751" stroke-width="1.5"/>
 <path d="M149 333q46 11 94 0m-97 32q52 19 103 0" fill="none" stroke="#71829a" stroke-width="1" opacity=".4"/>
 <text x="197" y="352" text-anchor="middle" font-family="Trebuchet MS,Arial,sans-serif" font-weight="900" font-size="20" fill="#fff8e9" transform="rotate(-5 197 352)">Tiger<tspan x="197" dy="19">345</tspan></text>
 <ellipse cx="126" cy="328" rx="22" ry="39" transform="rotate(29 126 328)" fill="url(#fur)"/>
 {'<ellipse cx="299" cy="278" rx="24" ry="42" transform="rotate(31 299 278)" fill="url(#fur)"/><g fill="#f6b58b"><ellipse cx="307" cy="251" rx="4" ry="6" transform="rotate(-23 307 251)"/><ellipse cx="316" cy="258" rx="4" ry="6"/><ellipse cx="298" cy="258" rx="4" ry="6"/><ellipse cx="306" cy="268" rx="7" ry="6"/></g>' if wave else '<ellipse cx="270" cy="328" rx="22" ry="38" transform="rotate(-25 270 328)" fill="url(#fur)"/>'}
 <path d="M142 277q55 16 110-1l-4 16q-51 20-104 0Z" fill="url(#orange)"/>
 <path d="M198 295q-25 11-20 39 19 4 27-32m0-4q23 2 34 24-15 14-32-17" fill="url(#orange)" stroke="#eb7d2d" stroke-width="1"/><ellipse cx="201" cy="295" rx="12" ry="14" fill="url(#orange)"/>'''

def decoration(mood):
    if mood=='greeting': return '<g fill="url(#orange)"><ellipse cx="337" cy="205" rx="5" ry="14" transform="rotate(28 337 205)"/><ellipse cx="351" cy="223" rx="5" ry="11" transform="rotate(60 351 223)"/></g>'
    if mood=='curious': return '<text x="309" y="134" font-family="Arial,sans-serif" font-size="53" font-weight="900" fill="#5294ed" transform="rotate(12 309 134)">?</text><ellipse cx="224" cy="279" rx="20" ry="28" transform="rotate(-25 224 279)" fill="url(#fur)" filter="url(#shadow)"/>'
    if mood=='thinking': return '<g fill="#f2dec2"><circle cx="292" cy="139" r="4"/><circle cx="305" cy="127" r="6"/><ellipse cx="331" cy="103" rx="27" ry="23"/></g><g fill="#957b65"><circle cx="318" cy="104" r="2.5"/><circle cx="331" cy="104" r="2.5"/><circle cx="344" cy="104" r="2.5"/></g><ellipse cx="219" cy="277" rx="20" ry="28" transform="rotate(-25 219 277)" fill="url(#fur)" filter="url(#shadow)"/>'
    if mood=='love': return heart(204,346,1.55)+heart(309,198,.45)+heart(95,286,.35)+'<ellipse cx="161" cy="337" rx="17" ry="27" transform="rotate(-35 161 337)" fill="url(#fur)"/><ellipse cx="248" cy="337" rx="17" ry="27" transform="rotate(35 248 337)" fill="url(#fur)"/>'
    if mood=='surprised': return '<g fill="#ff8a3c"><rect x="321" y="135" width="7" height="26" rx="3.5" transform="rotate(15 321 135)"/><circle cx="319" cy="169" r="4"/></g>'
    if mood=='wink': return '<path d="m332 150 5 12 14 1-10 9 3 14-12-7-12 7 3-14-10-9 14-1Z" fill="#ffbf45"/>'
    if mood=='sorry': return '<path d="M313 171q-16 23-3 25 16 0 3-25Z" fill="#72aaf0"/>'
    if mood=='menu': return '<g transform="rotate(10 261 321)" filter="url(#shadow)"><rect x="230" y="274" width="66" height="94" rx="6" fill="url(#navy)" stroke="#65718b" stroke-width="2"/><path d="M239 284h47v73h-47Z" fill="none" stroke="#c5a166" stroke-width=".8"/><text x="263" y="310" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-size="13" fill="#f4cf84">MENU</text><path d="M247 324h31m-31 7h23m-23 7h28" stroke="#bba67e" stroke-width="1"/></g><ellipse cx="282" cy="338" rx="15" ry="23" fill="url(#fur)"/>'
    if mood=='serving': return '<g filter="url(#shadow)"><ellipse cx="290" cy="326" rx="55" ry="9" fill="#b78350"/><path d="M251 298h79q-3 31-39 31-35 0-40-31" fill="url(#navy)"/><ellipse cx="291" cy="298" rx="40" ry="10" fill="#f4ca84"/><g fill="#6a9c34"><circle cx="274" cy="292" r="10"/><circle cx="300" cy="291" r="10"/><circle cx="285" cy="286" r="9"/></g><g fill="#ff9b35"><ellipse cx="285" cy="298" rx="10" ry="6"/><ellipse cx="309" cy="296" rx="9" ry="6"/></g><ellipse cx="254" cy="332" rx="28" ry="15" fill="url(#fur)"/></g><path d="M283 270q-10-9 0-18t0-17m20 37q-9-8 0-17t0-17" fill="none" stroke="#f3c58c" stroke-width="4" stroke-linecap="round"/>'
    return ''

def svg(mood, mode='full', bg=None):
    view='0 0 400 440' if mode=='full' else '64 15 272 295'
    content=body(mood)+head(mood)+decoration(mood) if mode=='full' else head(mood)
    if bg:
        view='0 0 400 400'
        content=f'<rect width="400" height="400" rx="80" fill="{bg}"/><g transform="translate(-35 0) scale(1.18)">{head(mood)}</g>'
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}" fill="none" role="img" aria-labelledby="title"><title id="title">Tiger345 · {mood}</title>{DEFS}{content}</svg>'''

labels={'greeting':'Chào hỏi','happy':'Vui vẻ','curious':'Tò mò','wink':'Nháy mắt','surprised':'Ngạc nhiên','love':'Yêu thích','thinking':'Suy nghĩ','sorry':'Xin lỗi','idle':'Sẵn sàng','menu':'Xem menu','serving':'Mang món'}
assets=[]
for mood,label in labels.items():
    name=f'tiger-{mood}.svg'
    (OUT/name).write_text(svg(mood))
    assets.append({'id':mood,'label':label,'file':name})
for name,bg in [('orange','#ff8a3c'),('navy','#1f2d4d'),('cream','#fff4e6')]:
    (OUT/f'tiger-app-{name}.svg').write_text(svg('idle',bg=bg))
(OUT/'tiger-avatar.svg').write_text(svg('idle',mode='avatar'))
# Circular launcher: all geometry remains editable vector paths.
launcher=svg('greeting').replace('viewBox="0 0 400 440"','viewBox="0 0 400 400"')
launcher=launcher.replace('</defs>','<clipPath id="circle"><circle cx="200" cy="205" r="167"/></clipPath></defs>')
start=launcher.index('</defs>')+len('</defs>')
launcher=launcher[:start]+'''<circle cx="200" cy="205" r="175" fill="#fff9ef"/><circle cx="200" cy="205" r="169" stroke="#fff" stroke-width="9"/><g clip-path="url(#circle)" transform="translate(0 36)">'''+launcher[start:-6]+'''</g><path d="M300 25h57q31 0 31 30v25q0 30-31 30h-28l-24 15 4-18q-34-3-34-29V55q0-30 25-30Z" fill="url(#orange)" stroke="#fff" stroke-width="4"/><g fill="#fff"><circle cx="306" cy="68" r="5"/><circle cx="331" cy="68" r="5"/><circle cx="356" cy="68" r="5"/></g></svg>'''
(OUT/'tiger-chat-launcher.svg').write_text(launcher)
(OUT/'manifest.json').write_text(json.dumps({'name':'Tiger345 Concierge Mascots','version':1,'type':'editable-vector','palette':['#FFF4E6','#FF8A3C','#1F2D4D','#E8DCC8'],'expressions':assets,'icons':['tiger-avatar.svg','tiger-chat-launcher.svg','tiger-app-orange.svg','tiger-app-navy.svg','tiger-app-cream.svg']},ensure_ascii=False,indent=2)+'\n')
print(f'Generated {len(list(OUT.glob("*.svg")))} SVG assets in {OUT.relative_to(ROOT)}')
