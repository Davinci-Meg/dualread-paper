// ============================================================
//  Markdown → Data Converter
//  Extracted from viewer.html
// ============================================================

const ABBREVS = new Set([
  'e.g.','i.e.','et al.','etc.','Fig.','Figs.','Eq.','Eqs.','Sec.',
  'Ref.','Refs.','Tab.','vs.','Dr.','Mr.','Mrs.','Prof.','Jr.','Sr.',
  'approx.','dept.','vol.','no.','pp.','ed.','cf.','ibid.','resp.','incl.','est.',
]);

export function parseMdSections(text) {
  const lines = text.split('\n'), out = [];
  let h = '', lv = 0, buf = [];
  for (const l of lines) {
    const m = l.match(/^(#{1,4})\s+(.*)/);
    if (m) {
      const b = buf.join('\n').trim();
      if (b || h) out.push({ heading: h, level: lv, text: b });
      lv = m[1].length;
      h = m[2].trim();
      buf = [];
    } else {
      buf.push(l);
    }
  }
  const b = buf.join('\n').trim();
  if (b || h) out.push({ heading: h, level: lv, text: b });
  return out;
}

function isImg(l) { return /^\s*!\[/.test(l); }
function isTbl(l) { const s = l.trim(); return s.startsWith('|') && s.endsWith('|'); }

export function splitBlocks(text) {
  const raws = text.split(/\n\s*\n/), blocks = [];
  for (const raw of raws) {
    const t = raw.trim();
    if (!t) continue;
    const lines = t.split('\n');
    let txtBuf = [];
    for (const l of lines) {
      const im = l.match(/^\s*!\[(.*?)\]\((.*?)\)(?:\{width=(\d+)%\})?/);
      if (im) {
        if (txtBuf.length) {
          const tx = txtBuf.filter(x => x.trim() && !isTbl(x)).map(x => x.trim()).join(' ');
          if (tx) blocks.push({ type: 'text', text: tx });
          txtBuf = [];
        }
        blocks.push({ type: 'image', alt: im[1], src: im[2], width: im[3] ? im[3] + '%' : '80%' });
      } else if (l.trim() && !isTbl(l)) {
        txtBuf.push(l);
      }
    }
    if (txtBuf.length) {
      const tx = txtBuf.map(x => x.trim()).join(' ');
      if (tx) blocks.push({ type: 'text', text: tx });
    }
  }
  return blocks;
}

export function splitParas(text) {
  return text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
    .map(p => p.split('\n').filter(l => l.trim() && !isImg(l) && !isTbl(l)).map(l => l.trim()).join(' '))
    .filter(Boolean);
}

export function splitEn(text) {
  if (!text.trim()) return [];
  let s = text;
  for (const a of ABBREVS) s = s.replaceAll(a, a.replaceAll('.', '\x00'));
  return s.split(/(?<=[.!?])\s+(?=[A-Z"'\(\[])/).map(p => p.replaceAll('\x00', '.').trim()).filter(Boolean);
}

export function splitJa(text) {
  if (!text.trim()) return [];
  return text.split(/(?<=[。．])\s*/).map(s => s.trim()).filter(Boolean);
}

export function align(en, ja) {
  if (!en.length && !ja.length) return [];
  if (!en.length) return ja.map(s => ['', s]);
  if (!ja.length) return en.map(s => [s, '']);
  if (en.length === ja.length) return en.map((e, i) => [e, ja[i]]);
  if (Math.abs(en.length - ja.length) <= 2) {
    const p = [], mn = Math.min(en.length, ja.length);
    for (let i = 0; i < mn; i++) p.push([en[i], ja[i]]);
    for (let i = mn; i < en.length; i++) p.push([en[i], '']);
    if (ja.length > mn && p.length) {
      const x = ja.slice(mn).join(' '), l = p[p.length - 1];
      p[p.length - 1] = [l[0], l[1] ? l[1] + ' ' + x : x];
    }
    return p;
  }
  return [[en.join(' '), ja.join(' ')]];
}

export function parseGlossary(text) {
  const g = [];
  for (const l of text.split('\n')) {
    const m = l.match(/\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.*?)\s*\|/);
    if (!m) continue;
    const en = m[1].trim(), ja = m[2].trim(), note = m[3].trim();
    if (/^(english|---|-+|\s*)$/i.test(en) || /^-+$/.test(en)) continue;
    g.push({ en, ja, note });
  }
  return g;
}

export function convertMd(enText, jaText, glossaryText, imageMap = {}) {
  const enSecs = parseMdSections(enText);
  const jaSecs = parseMdSections(jaText);
  const gl = glossaryText ? parseGlossary(glossaryText) : [];
  const title = enSecs.length ? enSecs[0].heading : 'Untitled';
  const jaByH = {};
  for (const s of jaSecs) jaByH[s.heading] = s;

  const sections = [];
  let cnt = 1;
  for (const es of enSecs) {
    const js = jaByH[es.heading];
    const enBlocks = splitBlocks(es.text);
    const jaParas = js ? splitParas(js.text) : [];
    const content = [];
    let jpi = 0;

    for (const blk of enBlocks) {
      if (blk.type === 'image') {
        const src = imageMap[blk.src] || imageMap['images/' + blk.src.split('/').pop()] || '';
        content.push({ type: 'image', src, alt: blk.alt, width: blk.width });
      } else {
        const eS = splitEn(blk.text);
        const jT = jpi < jaParas.length ? jaParas[jpi] : '';
        jpi++;
        const jS = splitJa(jT);
        for (const [o, t] of align(eS, jS)) {
          if (!o) continue;
          content.push({ type: 'sentence', id: 's' + cnt++, original: o, translation: t || '（対応する訳なし）' });
        }
      }
    }
    if (content.length) sections.push({ heading: es.heading, heading_ja: '', content });
  }
  return { metadata: { title, title_ja: '' }, glossary: gl, sections };
}

// DOM utilities
export function el(tag, cls) {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}

export function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

export function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
