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

// ============================================================
//  DP-based Sentence Alignment
//  Handles merges (2:1, 1:2, 2:2) and skips (1:0, 0:1)
// ============================================================

// Score how well English text matches Japanese text
function scoreMatch(e, j) {
  const el = e.length, jl = j.length;
  if (!el || !jl) return -50;

  // Length ratio: Japanese / English typically 0.4–0.9
  const r = jl / el;
  const lenScore = -Math.pow((r - 0.6) / 0.3, 2);

  // Shared number bonus (years, figure numbers, etc.)
  const eNums = e.match(/\d+/g) || [];
  const jNums = new Set(j.match(/\d+/g) || []);
  let numBonus = 0;
  for (const n of eNums) if (jNums.has(n)) numBonus += 2;

  // Base positive score (prefer matching over skipping)
  return 3 + lenScore + numBonus;
}

export function alignSentences(en, ja) {
  const n = en.length, m = ja.length;

  // Trivial cases
  if (!n && !m) return [];
  if (!n) return [{ original: '', translation: ja.join(''), enCount: 0 }];
  if (!m) return en.map(s => ({ original: s, translation: '', enCount: 1 }));

  const SKIP = -6;

  // dp[i][j] = best score for aligning en[0..i-1] with ja[0..j-1]
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(-1e9));
  const bt = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(null));
  dp[0][0] = 0;

  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      if (dp[i][j] <= -1e9) continue;
      const c = dp[i][j];

      const tryUp = (ni, nj, s, di, dj) => {
        if (s > dp[ni][nj]) { dp[ni][nj] = s; bt[ni][nj] = [di, dj]; }
      };

      // 1:1
      if (i < n && j < m)
        tryUp(i + 1, j + 1, c + scoreMatch(en[i], ja[j]), 1, 1);
      // 2:1 — two English → one Japanese
      if (i + 1 < n && j < m)
        tryUp(i + 2, j + 1, c + scoreMatch(en[i] + ' ' + en[i + 1], ja[j]), 2, 1);
      // 1:2 — one English → two Japanese
      if (i < n && j + 1 < m)
        tryUp(i + 1, j + 2, c + scoreMatch(en[i], ja[j] + ja[j + 1]), 1, 2);
      // 2:2 — two English → two Japanese
      if (i + 1 < n && j + 1 < m)
        tryUp(i + 2, j + 2, c + scoreMatch(en[i] + ' ' + en[i + 1], ja[j] + ja[j + 1]), 2, 2);
      // 1:0 — skip English sentence
      if (i < n)
        tryUp(i + 1, j, c + SKIP, 1, 0);
      // 0:1 — skip Japanese sentence
      if (j < m)
        tryUp(i, j + 1, c + SKIP, 0, 1);
    }
  }

  // Backtrack from dp[n][m]
  const raw = [];
  let ci = n, cj = m;
  while (ci > 0 || cj > 0) {
    if (!bt[ci][cj]) break;
    const [di, dj] = bt[ci][cj];
    raw.unshift({
      original: en.slice(ci - di, ci).join(' '),
      translation: ja.slice(cj - dj, cj).join(''),
      enCount: di,
    });
    ci -= di;
    cj -= dj;
  }

  // Post-process: merge orphan Japanese (enCount=0) into adjacent pair
  const result = [];
  for (const p of raw) {
    if (p.enCount === 0 && result.length) {
      result[result.length - 1].translation += p.translation;
    } else {
      result.push(p);
    }
  }
  return result;
}

// Legacy wrapper (kept for reference, no longer used internally)
export function align(en, ja) {
  if (!en.length && !ja.length) return [];
  const pairs = alignSentences(en, ja);
  return pairs.map(p => [p.original, p.translation]);
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

    // Phase 1: Collect all English sentences and image positions
    const enAll = [];
    const images = []; // { afterSentence: N, data: {...} }
    for (const blk of enBlocks) {
      if (blk.type === 'image') {
        const src = imageMap[blk.src] || imageMap['images/' + blk.src.split('/').pop()] || '';
        images.push({
          afterSentence: enAll.length,
          data: { type: 'image', src, alt: blk.alt, width: blk.width },
        });
      } else {
        enAll.push(...splitEn(blk.text));
      }
    }

    // Phase 2: Collect all Japanese sentences in this section
    const jaAll = [];
    if (js) {
      for (const p of splitParas(js.text)) jaAll.push(...splitJa(p));
    }

    // Phase 3: DP alignment at section level
    const aligned = alignSentences(enAll, jaAll);

    // Phase 4: Build content, reinserting images at original positions
    const content = [];
    let enPos = 0;
    let imgIdx = 0;

    for (const pair of aligned) {
      // Insert images that belong before this English position
      while (imgIdx < images.length && images[imgIdx].afterSentence <= enPos) {
        content.push(images[imgIdx].data);
        imgIdx++;
      }
      if (pair.original) {
        content.push({
          type: 'sentence', id: 's' + cnt++,
          original: pair.original,
          translation: pair.translation || '（対応する訳なし）',
        });
      }
      enPos += pair.enCount;
    }
    // Remaining images after all sentences
    while (imgIdx < images.length) {
      content.push(images[imgIdx].data);
      imgIdx++;
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
