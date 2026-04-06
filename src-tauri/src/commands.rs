use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

use serde::Serialize;
use tauri::{AppHandle, State};

use crate::watcher::LibraryWatcher;

#[derive(Serialize, Clone)]
pub struct PaperMeta {
    pub folder_path: String,
    pub title: String,
    pub section_count: usize,
    pub has_glossary: bool,
    pub has_summary: bool,
    pub modified_at: u64,
}

fn extract_title_and_sections(paper_md_path: &Path) -> (String, usize) {
    let content = fs::read_to_string(paper_md_path).unwrap_or_default();
    let mut title = String::new();
    let mut section_count = 0;
    for line in content.lines() {
        if title.is_empty() {
            if let Some(t) = line.strip_prefix("# ") {
                title = t.trim().to_string();
            }
        }
        if line.starts_with("## ") {
            section_count += 1;
        }
    }
    if title.is_empty() {
        title = paper_md_path
            .parent()
            .and_then(|p| p.file_name())
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "Untitled".to_string());
    }
    (title, section_count)
}

fn get_metadata_for_folder(folder: &Path) -> Option<PaperMeta> {
    let paper_md = folder.join("paper.md");
    let paper_ja_md = folder.join("paper.ja.md");

    if !paper_md.exists() || !paper_ja_md.exists() {
        return None;
    }

    let (title, section_count) = extract_title_and_sections(&paper_md);
    let has_glossary = folder.join("glossary.md").exists();
    let has_summary = folder.join("paper.summary.ja.md").exists();

    let modified_at = paper_md
        .metadata()
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);

    Some(PaperMeta {
        folder_path: folder.to_string_lossy().to_string(),
        title,
        section_count,
        has_glossary,
        has_summary,
        modified_at,
    })
}

#[tauri::command]
pub fn scan_library(library_path: String) -> Result<Vec<PaperMeta>, String> {
    let path = Path::new(&library_path);
    if !path.is_dir() {
        return Err(format!("{} is not a directory", library_path));
    }

    let mut papers = Vec::new();
    let entries = fs::read_dir(path).map_err(|e| e.to_string())?;

    for entry in entries.flatten() {
        let entry_path = entry.path();
        if entry_path.is_dir() {
            if let Some(meta) = get_metadata_for_folder(&entry_path) {
                papers.push(meta);
            }
        }
    }

    // Sort by modification time, newest first
    papers.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
    Ok(papers)
}

#[tauri::command]
pub fn get_paper_metadata(folder_path: String) -> Result<PaperMeta, String> {
    let path = Path::new(&folder_path);
    get_metadata_for_folder(path).ok_or_else(|| {
        format!(
            "{} does not contain paper.md and paper.ja.md",
            folder_path
        )
    })
}

#[derive(Serialize)]
pub struct PaperFiles {
    pub en_text: String,
    pub ja_text: String,
    pub glossary_text: String,
    pub image_paths: Vec<ImageEntry>,
}

#[derive(Serialize)]
pub struct ImageEntry {
    pub name: String,
    pub path: String,
}

#[tauri::command]
pub fn read_paper_files(folder_path: String) -> Result<PaperFiles, String> {
    let folder = Path::new(&folder_path);
    let paper_md = folder.join("paper.md");
    let paper_ja_md = folder.join("paper.ja.md");
    let glossary_md = folder.join("glossary.md");
    let images_dir = folder.join("images");

    let en_text = fs::read_to_string(&paper_md).map_err(|e| format!("paper.md: {}", e))?;
    let ja_text = fs::read_to_string(&paper_ja_md).map_err(|e| format!("paper.ja.md: {}", e))?;
    let glossary_text = if glossary_md.exists() {
        fs::read_to_string(&glossary_md).unwrap_or_default()
    } else {
        String::new()
    };

    let mut image_paths = Vec::new();
    if images_dir.is_dir() {
        if let Ok(entries) = fs::read_dir(&images_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.ends_with(".png")
                    || name.ends_with(".jpg")
                    || name.ends_with(".jpeg")
                    || name.ends_with(".gif")
                    || name.ends_with(".svg")
                    || name.ends_with(".webp")
                {
                    image_paths.push(ImageEntry {
                        name: name.clone(),
                        path: entry.path().to_string_lossy().to_string(),
                    });
                }
            }
        }
    }

    Ok(PaperFiles {
        en_text,
        ja_text,
        glossary_text,
        image_paths,
    })
}

#[tauri::command]
pub fn start_watching(
    app: AppHandle,
    library_path: String,
    state: State<'_, LibraryWatcher>,
) -> Result<(), String> {
    state.start(app, library_path)
}

#[tauri::command]
pub fn stop_watching(state: State<'_, LibraryWatcher>) -> Result<(), String> {
    state.stop();
    Ok(())
}
