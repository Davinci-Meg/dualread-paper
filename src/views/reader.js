// ============================================================
//  Reader View — Paper reading with translation panel
//  Extracted from viewer.html renderPaper() and interaction
// ============================================================

import { el, esc, cap } from '../lib/converter.js';

let paperData = null;
let selectedId = null;
let sentenceMap = {};
let sentenceIds = [];
let glossary = [];
let history = [];
const MAX_HIST = 30;

let keyHandler = null;

export function renderReader(container, data, onBack) {
  paperData = data;
  sentenceMap = {};
  sentenceIds = [];
  selectedId = null;
  history = [];
  glossary = data.glossary || [];

  // Normalize: support both content[] and legacy sentences[]
  for (const sec of data.sections) {
    if (!sec.content) {
      sec.content = (sec.sentences || []).map(s => ({ type: 'sentence', ...s }));
    }
  }

  for (const sec of data.sections)
    for (const it of sec.content)
      if (it.type !== 'image') { sentenceMap[it.id] = it; sentenceIds.push(it.id); }

  container.innerHTML = '';
  container.classList.add('app');

  // Main panel
  const main = el('div', 'main-panel');
  main.id = 'mainPanel';

  // Back button
  if (onBack) {
    const backBtn = el('button', 'back-btn');
    backBtn.innerHTML = '&larr; ライブラリ';
    backBtn.addEventListener('click', onBack);
    main.appendChild(backBtn);
  }

  const hdr = el('div', 'paper-header');
  const m = data.metadata || {};
  hdr.innerHTML = `<div class="paper-title">${esc(m.title || 'Untitled')}</div>
    ${m.title_ja ? `<div class="paper-title-ja">${esc(m.title_ja)}</div>` : ''}`;
  main.appendChild(hdr);

  for (const sec of data.sections) {
    const sEl = el('div', 'section');
    if (sec.heading) {
      sEl.innerHTML += `<div class="section-heading">${esc(sec.heading)}</div>
        ${sec.heading_ja ? `<div class="section-heading-ja">${esc(sec.heading_ja)}</div>` : ''}`;
    }
    const body = el('div', 'section-body');

    for (const it of sec.content) {
      if (it.type === 'image') {
        const fig = document.createElement('figure');
        fig.className = 'paper-figure';
        if (it.src) {
          const img = document.createElement('img');
          img.src = it.src;
          img.alt = it.alt || '';
          img.style.maxWidth = it.width || '80%';
          img.onerror = () => { fig.className = 'paper-figure placeholder'; fig.textContent = it.alt || '[Image]'; };
          fig.appendChild(img);
          if (it.alt && !/^!\[/.test(it.alt)) {
            const capEl = document.createElement('figcaption');
            capEl.textContent = it.alt;
            fig.appendChild(capEl);
          }
        } else {
          fig.className = 'paper-figure placeholder';
          fig.textContent = it.alt || '[Image]';
        }
        body.appendChild(fig);
      } else {
        const span = document.createElement('span');
        span.className = 'sentence';
        span.dataset.id = it.id;
        span.textContent = it.original + ' ';
        span.addEventListener('click', () => selectSentence(it.id));
        body.appendChild(span);
      }
    }
    sEl.appendChild(body);
    main.appendChild(sEl);
  }

  const divider = el('div', 'divider');
  const side = el('div', 'side-panel');
  side.id = 'sidePanel';
  const hasGl = glossary.length > 0;

  side.innerHTML = `
    <div class="side-tabs">
      <button class="side-tab active" data-tab="translation">翻訳</button>
      ${hasGl ? '<button class="side-tab" data-tab="glossary">用語集</button>' : ''}
    </div>
    <div class="side-content" id="sideContent">
      <div class="tab-pane active" id="paneTranslation">
        <div class="translation-empty" id="trEmpty">文をクリックすると<br>ここに翻訳が表示されます</div>
        <div id="trCurrent" style="display:none">
          <div class="translation-label">原文</div>
          <div class="translation-original" id="trOrig"></div>
          <div class="translation-label">翻訳</div>
          <div class="translation-text" id="trText"></div>
          <button class="copy-btn" id="copyBtn">コピー</button>
          <div class="matched-terms" id="matchTerms" style="display:none">
            <div class="matched-terms-title">関連用語</div>
            <div id="matchList"></div>
          </div>
        </div>
        <div class="history-section" id="histSec" style="display:none">
          <div class="history-title">履歴</div><div id="histList"></div>
        </div>
      </div>
      ${hasGl ? `<div class="tab-pane" id="paneGlossary">
        <input type="text" class="glossary-search" id="glSearch" placeholder="用語を検索...">
        <div id="glWrap"></div>
      </div>` : ''}
    </div>
    <div class="keyboard-hint"><kbd>&uarr;</kbd><kbd>&darr;</kbd> 前後の文 &nbsp; <kbd>Esc</kbd> 選択解除</div>`;

  container.appendChild(main);
  container.appendChild(divider);
  container.appendChild(side);

  // Tabs
  side.querySelectorAll('.side-tab[data-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      side.querySelectorAll('.side-tab').forEach(t => t.classList.remove('active'));
      side.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('pane' + cap(tab.dataset.tab))?.classList.add('active');
    });
  });

  document.getElementById('copyBtn').addEventListener('click', () => {
    if (selectedId && sentenceMap[selectedId]) {
      navigator.clipboard.writeText(sentenceMap[selectedId].translation);
      const b = document.getElementById('copyBtn');
      b.textContent = 'コピー済み';
      setTimeout(() => b.textContent = 'コピー', 1200);
    }
  });

  if (hasGl) {
    renderGl(glossary);
    document.getElementById('glSearch').addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      renderGl(glossary.filter(g => g.en.toLowerCase().includes(q) || g.ja.includes(q) || (g.note && g.note.includes(q))));
    });
  }

  setupDivider(divider, side);

  // Keyboard navigation
  keyHandler = (e) => {
    if (!paperData || e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const idx = selectedId ? sentenceIds.indexOf(selectedId) : -1;
      const next = e.key === 'ArrowDown' ? Math.min(idx + 1, sentenceIds.length - 1) : Math.max(idx - 1, 0);
      selectSentence(sentenceIds[next]);
    }
    if (e.key === 'Escape') {
      selectedId = null;
      document.querySelector('.sentence.active')?.classList.remove('active');
      document.getElementById('trEmpty').style.display = 'block';
      document.getElementById('trCurrent').style.display = 'none';
      document.getElementById('matchTerms').style.display = 'none';
    }
  };
  document.addEventListener('keydown', keyHandler);
}

export function destroyReader() {
  if (keyHandler) {
    document.removeEventListener('keydown', keyHandler);
    keyHandler = null;
  }
  paperData = null;
  sentenceMap = {};
  sentenceIds = [];
  selectedId = null;
  history = [];
  glossary = [];
}

// --- Private helpers ---

function selectSentence(id) {
  if (!sentenceMap[id]) return;
  document.querySelector('.sentence.active')?.classList.remove('active');
  const e = document.querySelector(`.sentence[data-id="${id}"]`);
  if (e) {
    e.classList.add('active');
    const r = e.getBoundingClientRect(), p = document.getElementById('mainPanel').getBoundingClientRect();
    if (r.top < p.top || r.bottom > p.bottom) e.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  selectedId = id;
  showTr(sentenceMap[id]);
  addHist(sentenceMap[id]);

  const sp = document.getElementById('sidePanel');
  sp?.querySelectorAll('.side-tab').forEach(t => t.classList.remove('active'));
  sp?.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  sp?.querySelector('.side-tab[data-tab="translation"]')?.classList.add('active');
  document.getElementById('paneTranslation')?.classList.add('active');
}

function showTr(s) {
  document.getElementById('trEmpty').style.display = 'none';
  document.getElementById('trCurrent').style.display = 'block';
  document.getElementById('trOrig').textContent = s.original;
  document.getElementById('trText').textContent = s.translation;
  const mt = matchTerms(s), mtEl = document.getElementById('matchTerms'), ml = document.getElementById('matchList');
  if (mt.length) {
    mtEl.style.display = 'block';
    ml.innerHTML = mt.map(g =>
      `<span class="term-chip"><span class="term-en">${esc(g.en)}</span><span class="term-ja">${esc(g.ja)}</span>${g.note ? `<span class="term-note">(${esc(g.note)})</span>` : ''}</span>`
    ).join('');
  } else {
    mtEl.style.display = 'none';
  }
}

function addHist(s) {
  if (history.length && history[0].id === s.id) return;
  history.unshift(s);
  if (history.length > MAX_HIST) history.pop();
  renderHist();
}

function renderHist() {
  const sec = document.getElementById('histSec'), list = document.getElementById('histList');
  if (history.length <= 1) { sec.style.display = 'none'; return; }
  sec.style.display = 'block';
  list.innerHTML = '';
  for (let i = 1; i < history.length; i++) {
    const it = history[i], d = document.createElement('div');
    d.className = 'history-item';
    d.innerHTML = `<div class="history-original">${esc(it.original)}</div><div class="history-translation">${esc(it.translation)}</div>`;
    d.addEventListener('click', () => selectSentence(it.id));
    list.appendChild(d);
  }
}

function renderGl(items) {
  const w = document.getElementById('glWrap');
  if (!items.length) { w.innerHTML = '<div class="glossary-empty">該当なし</div>'; return; }
  w.innerHTML = '<table class="glossary-table"><thead><tr><th>English</th><th>日本語</th><th>備考</th></tr></thead><tbody>'
    + items.map(g => `<tr><td class="gl-en">${esc(g.en)}</td><td>${esc(g.ja)}</td><td class="gl-note">${esc(g.note || '')}</td></tr>`).join('')
    + '</tbody></table>';
}

function matchTerms(s) {
  if (!glossary.length) return [];
  const t = s.original.toLowerCase();
  return glossary.filter(g => t.includes(g.en.toLowerCase()));
}

function setupDivider(div, side) {
  let d = false;
  div.addEventListener('mousedown', e => {
    d = true;
    div.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!d) return;
    side.style.width = Math.max(280, Math.min(600, document.body.clientWidth - e.clientX - 2)) + 'px';
  });
  document.addEventListener('mouseup', () => {
    if (d) {
      d = false;
      div.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });
}
