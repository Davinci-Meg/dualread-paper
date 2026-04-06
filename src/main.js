// ============================================================
//  Dualread Paper — App Entry Point
// ============================================================

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

import { renderLibrary, renderSetup } from './views/library.js';
import { renderReader, destroyReader } from './views/reader.js';
import { pickFolder, loadPaperFolder, isPaperFolder } from './lib/fs-bridge.js';
import { getLibraryPath, setLibraryPath, getRecentPapers, addRecentPaper } from './lib/store.js';

const appEl = document.getElementById('app');
let currentView = null;

// ============================================================
//  Navigation
// ============================================================

async function navigate(view, params = {}) {
  // Cleanup previous view
  if (currentView === 'reader') destroyReader();
  currentView = view;

  if (view === 'library') {
    await getCurrentWindow().setTitle('Dualread Paper');
    await showLibrary();
  } else if (view === 'reader') {
    await showReader(params.folderPath);
  } else if (view === 'setup') {
    await getCurrentWindow().setTitle('Dualread Paper');
    renderSetup(appEl, { onSetLibrary: handleSetLibrary });
  }
}

// ============================================================
//  Library
// ============================================================

async function showLibrary() {
  const libraryPath = await getLibraryPath();
  const recentPapers = await getRecentPapers();

  let papers = [];
  if (libraryPath) {
    try {
      papers = await invoke('scan_library', { libraryPath });
    } catch (e) {
      console.error('scan_library failed:', e);
    }
  }

  renderLibrary(appEl, {
    papers,
    recentPapers,
    libraryPath,
    onOpenPaper: (folderPath) => navigate('reader', { folderPath }),
    onPickFolder: handlePickFolder,
    onChangeLibrary: handleSetLibrary,
  });
}

async function handleSetLibrary() {
  const folder = await pickFolder();
  if (!folder) return;

  await setLibraryPath(folder);

  // Start watching
  try {
    await invoke('start_watching', { libraryPath: folder });
  } catch (e) {
    console.error('start_watching failed:', e);
  }

  await navigate('library');
}

async function handlePickFolder() {
  const folder = await pickFolder();
  if (!folder) return;

  // Check if it's a paper folder
  if (await isPaperFolder(folder)) {
    await navigate('reader', { folderPath: folder });
    return;
  }

  // Maybe it's a library folder — set it and go to library
  await setLibraryPath(folder);
  try {
    await invoke('start_watching', { libraryPath: folder });
  } catch (e) {
    console.error('start_watching failed:', e);
  }
  await navigate('library');
}

// ============================================================
//  Reader
// ============================================================

async function showReader(folderPath) {
  appEl.innerHTML = '<div class="loading">読み込み中...</div>';

  try {
    const data = await loadPaperFolder(folderPath);
    renderReader(appEl, data, () => navigate('library'));

    await getCurrentWindow().setTitle('Dualread Paper — ' + (data.metadata?.title || 'Untitled'));
    await addRecentPaper({ folderPath, title: data.metadata?.title || 'Untitled' });
  } catch (e) {
    console.error('loadPaperFolder failed:', e);
    appEl.innerHTML = `<div class="welcome-setup">
      <h1>読み込みエラー</h1>
      <p>${e.message || e}</p>
      <button class="setup-btn" id="errorBack">ライブラリに戻る</button>
    </div>`;
    document.getElementById('errorBack')?.addEventListener('click', () => navigate('library'));
  }
}

// ============================================================
//  Init
// ============================================================

async function init() {
  const libraryPath = await getLibraryPath();

  if (libraryPath) {
    // Start watching
    try {
      await invoke('start_watching', { libraryPath });
    } catch (e) {
      console.error('start_watching failed:', e);
    }
    await navigate('library');
  } else {
    await navigate('setup');
  }

  // Listen for library changes from folder watcher
  await listen('library-changed', () => {
    if (currentView === 'library') {
      showLibrary();
    }
  });
}

init();
