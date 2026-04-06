// ============================================================
//  Store — Persist settings and recent papers
// ============================================================

import { load } from '@tauri-apps/plugin-store';

let _store = null;

async function getStore() {
  if (!_store) {
    _store = await load('paper-translator-state.json', { autoSave: true });
  }
  return _store;
}

export async function getLibraryPath() {
  const store = await getStore();
  return (await store.get('library_path')) || null;
}

export async function setLibraryPath(path) {
  const store = await getStore();
  await store.set('library_path', path);
}

export async function getRecentPapers() {
  const store = await getStore();
  return (await store.get('recent_papers')) || [];
}

export async function getFontSize() {
  const store = await getStore();
  return (await store.get('font_size')) || null;
}

export async function setFontSize(size) {
  const store = await getStore();
  await store.set('font_size', size);
}

export async function addRecentPaper({ folderPath, title }) {
  const store = await getStore();
  const recent = (await store.get('recent_papers')) || [];

  // Remove duplicate
  const filtered = recent.filter(r => r.folderPath !== folderPath);

  // Add to front
  filtered.unshift({
    folderPath,
    title,
    openedAt: Date.now(),
  });

  // Keep max 20
  const trimmed = filtered.slice(0, 20);
  await store.set('recent_papers', trimmed);
  return trimmed;
}
