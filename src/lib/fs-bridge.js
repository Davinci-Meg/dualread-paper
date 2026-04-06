// ============================================================
//  File System Bridge — Tauri IPC + Dialog wrappers
// ============================================================

import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { convertMd } from './converter.js';

export async function pickFolder() {
  const selected = await open({
    directory: true,
    title: 'フォルダを選択',
  });
  return selected || null;
}

export async function isPaperFolder(folderPath) {
  try {
    const meta = await invoke('get_paper_metadata', { folderPath });
    return !!meta;
  } catch {
    return false;
  }
}

export async function loadPaperFolder(folderPath) {
  // Read all files via Rust command (avoids fs scope issues)
  const files = await invoke('read_paper_files', { folderPath });

  // Build image map using asset protocol
  const imageMap = {};
  for (const img of files.image_paths) {
    const url = convertFileSrc(img.path);
    imageMap['images/' + img.name] = url;
    imageMap[img.name] = url;
  }

  return convertMd(files.en_text, files.ja_text, files.glossary_text, imageMap);
}
