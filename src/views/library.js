// ============================================================
//  Library View — Paper card grid and recent papers
// ============================================================

import { el, esc } from '../lib/converter.js';

export function renderLibrary(container, { papers, recentPapers, libraryPath, onOpenPaper, onPickFolder, onChangeLibrary }) {
  container.innerHTML = '';
  container.classList.remove('app');

  const lib = el('div', 'library');

  // Toolbar
  const toolbar = el('div', 'library-toolbar');
  toolbar.innerHTML = `<h1>Dualread Paper</h1><div class="toolbar-spacer"></div>`;

  const openBtn = document.createElement('button');
  openBtn.className = 'toolbar-btn';
  openBtn.textContent = 'フォルダを開く';
  openBtn.addEventListener('click', onPickFolder);
  toolbar.appendChild(openBtn);

  lib.appendChild(toolbar);

  // Library path bar
  if (libraryPath) {
    const pathBar = el('div', 'library-path-bar');
    pathBar.innerHTML = `<span>ライブラリ:</span> <code>${esc(libraryPath)}</code>`;
    const changeBtn = document.createElement('button');
    changeBtn.className = 'library-path-btn';
    changeBtn.textContent = '変更';
    changeBtn.addEventListener('click', onChangeLibrary);
    pathBar.appendChild(changeBtn);
    lib.appendChild(pathBar);
  }

  // Body
  const body = el('div', 'library-body');

  // Paper grid
  if (papers && papers.length > 0) {
    const sectionTitle = el('div', 'library-section-title');
    sectionTitle.textContent = `ライブラリ (${papers.length}件)`;
    body.appendChild(sectionTitle);

    const grid = el('div', 'paper-grid');
    for (const paper of papers) {
      const card = el('div', 'paper-card');
      card.addEventListener('click', () => onOpenPaper(paper.folder_path));

      const title = el('div', 'paper-card-title');
      title.textContent = paper.title;
      card.appendChild(title);

      const meta = el('div', 'paper-card-meta');
      meta.innerHTML = `<span>${paper.section_count} セクション</span><span>${formatDate(paper.modified_at)}</span>`;
      card.appendChild(meta);

      const badges = el('div', 'paper-card-badges');
      if (paper.has_glossary) {
        const b = el('span', 'badge glossary');
        b.textContent = '用語集';
        badges.appendChild(b);
      }
      if (paper.has_summary) {
        const b = el('span', 'badge summary');
        b.textContent = 'サマリー';
        badges.appendChild(b);
      }
      if (badges.children.length) card.appendChild(badges);

      grid.appendChild(card);
    }
    body.appendChild(grid);
  } else if (libraryPath) {
    const empty = el('div', 'library-empty');
    empty.textContent = 'このフォルダに翻訳済みの論文はありません。/paper-translate で論文を翻訳してください。';
    body.appendChild(empty);
  }

  // Recent papers
  if (recentPapers && recentPapers.length > 0) {
    const sectionTitle = el('div', 'library-section-title');
    sectionTitle.textContent = '最近開いた論文';
    body.appendChild(sectionTitle);

    const list = el('div', 'recent-list');
    for (const r of recentPapers) {
      const item = el('div', 'recent-item');
      item.addEventListener('click', () => onOpenPaper(r.folderPath));

      const titleEl = el('div', 'recent-item-title');
      titleEl.textContent = r.title;
      item.appendChild(titleEl);

      const timeEl = el('div', 'recent-item-time');
      timeEl.textContent = formatRelativeTime(r.openedAt);
      item.appendChild(timeEl);

      list.appendChild(item);
    }
    body.appendChild(list);
  }

  lib.appendChild(body);
  container.appendChild(lib);
}

export function renderSetup(container, { onSetLibrary }) {
  container.innerHTML = '';
  container.classList.remove('app');

  const setup = el('div', 'welcome-setup');
  setup.innerHTML = `
    <h1>Dualread Paper</h1>
    <p><code>/paper-translate</code> で翻訳した論文を、文をクリックして日本語訳を確認しながら読めるビューアです。</p>
    <p>翻訳済み論文が入っているフォルダをライブラリとして設定してください。</p>
  `;

  const btn = document.createElement('button');
  btn.className = 'setup-btn';
  btn.textContent = 'ライブラリフォルダを選択';
  btn.addEventListener('click', onSetLibrary);
  setup.appendChild(btn);

  container.appendChild(setup);
}

function formatDate(unixSeconds) {
  if (!unixSeconds) return '';
  const d = new Date(unixSeconds * 1000);
  return d.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function formatRelativeTime(ms) {
  if (!ms) return '';
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'たった今';
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}日前`;
  return new Date(ms).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
}
