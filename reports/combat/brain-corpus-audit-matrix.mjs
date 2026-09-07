import fs from 'node:fs';
const dir = process.argv[2];
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort();
const VERBS = ['move','moveTo','stop','face','faceAt','use','ready','cooldown','los','ray','pathTo','rand','remember','recall','forget','say'];
const rows = [];
for (const f of files) {
  const src = fs.readFileSync(`${dir}/${f}`, 'utf8');
  const meta = JSON.parse(fs.readFileSync(`${dir}/${f.replace(/\.js$/, '.meta.json')}`, 'utf8'));
  const verbs = VERBS.filter(v => new RegExp(`\\bapi\\.${v}\\s*\\(`).test(src));
  const uses = [...src.matchAll(/api\.use\(([^)]*)\)/g)].map(m => m[1].trim());
  const useArgs = { none: 0, pair: 0, single: 0 };
  for (const u of uses) {
    const parts = u.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length <= 1) useArgs.none++; else if (parts.length === 2) useArgs.single++; else useArgs.pair++;
  }
  const useNames = [...new Set(uses.map(u => u.split(',')[0].trim()))];
  const litNames = useNames.filter(n => /^['"`]/.test(n)).map(n => n.replace(/['"`]/g, ''));
  const kitNames = (meta.kit || []).map((k, i) => `k${i+1}`);
  const feat = {
    file: f, id: meta.id, name: meta.name, model: meta.brain_model, state: meta.state, rating: Math.round(meta.rating), fights: meta.fights,
    kit: (meta.kit||[]).map(k => `${k.delivery}[${k.effects.join('+')}${k.channel? ':'+k.channel:''}]`).join(' '),
    len: src.length,
    verbs: verbs.join(','),
    useArgs: `${useArgs.none}/${useArgs.single}/${useArgs.pair}`,
    useLits: litNames.join(','),
    deadLits: kitNames.filter(k => !src.includes(`'${k}'`) && !src.includes(`"${k}"`) && !src.includes('`'+k+'`')).join(','),
    readsKit: /\bkit\b/.test(src) ? ( /self\.kit|me\.kit|p\.self\.kit|s\.kit|\.kit\[|\.kit\b/.test(src) ? 'Y' : '?') : 'N',
    enemyKit: /enemy\.kit|en\.kit|e\.kit|foe\.kit|opp\.kit/.test(src) ? 'Y':'N',
    lead: /V\.lead/.test(src) ? 'Y':'N',
    enemyStarted: /enemyStarted/.test(src) ? 'Y':'N',
    telegraph: /telegraph/.test(src) ? 'Y':'N',
    enemyCasting: /enemy\.casting|en\.casting|e\.casting|foe\.casting|opp\.casting/.test(src) ? 'Y':'N',
    projectiles: /projectiles/.test(src) ? 'Y':'N',
    zones: /\.zones/.test(src) ? 'Y':'N',
    visible: /\.visible/.test(src) ? 'Y':'N',
    los: /api\.los/.test(src)?'Y':'N', pathTo: /api\.pathTo/.test(src)?'Y':'N', ray: /api\.ray/.test(src)?'Y':'N', obstacles: /obstacles/.test(src)?'Y':'N',
    blinded: /blinded/.test(src)?'Y':'N', silenced: /silenced/.test(src)?'Y':'N', rooted: /rooted/.test(src)?'Y':'N', stunned: /stunned/.test(src)?'Y':'N',
    refused: /refused/.test(src)?'Y':'N', missed: /'missed'|"missed"/.test(src)?'Y':'N', damaged: /'damaged'|"damaged"/.test(src)?'Y':'N', dealt: /'dealt'|"dealt"/.test(src)?'Y':'N',
    busy: /\.busy/.test(src)?'Y':'N', ready: /api\.ready/.test(src)?'Y':'N', cooldownField: /\.cooldowns\b/.test(src)?'Y':'N',
    burn: /\.burn\b|burnStartsIn|timeLeft/.test(src)?'Y':'N',
    airborne: /airborne/.test(src)?'Y':'N',
    memApi: /api\.remember|api\.recall/.test(src)?'Y':'N',
    closureState: /^(let|var)\s+\w+/m.test(src)?'Y':'N',
    cyrillicSay: /api\.say\([^)]*[Ѐ-ӿ]/.test(src) || /[Ѐ-ӿ]/.test(src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm,'')) ? 'Y':'N',
    cyrillicAny: /[Ѐ-ӿ]/.test(src)?'Y':'N',
    hardDist: (src.match(/dist\s*(<|>|<=|>=)\s*\d+(\.\d+)?/g)||[]).length,
    useJump: /api\.use\(\s*['"]jump['"]/.test(src)?'Y':'N',
    tryCatch: /try\s*\{/.test(src)?'Y':'N',
    faceBeforeUse: /faceAt|api\.face\(/.test(src)?'Y':'N',
    hp: /maxHp/.test(src)?'Y':'N',
    tactics: (meta.tactics_card||'').slice(0,0),
  };
  rows.push(feat);
}
const cols = Object.keys(rows[0]).filter(c => c !== 'tactics');
console.log(cols.join('\t'));
for (const r of rows) console.log(cols.map(c => r[c]).join('\t'));
