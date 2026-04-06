use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

pub struct LibraryWatcher {
    inner: Mutex<Option<RecommendedWatcher>>,
}

impl LibraryWatcher {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(None),
        }
    }

    pub fn start(&self, app: AppHandle, library_path: String) -> Result<(), String> {
        // Stop existing watcher if any
        self.stop();

        let app_clone = app.clone();
        let watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                if matches!(event.kind, EventKind::Create(_)) {
                    for path in &event.paths {
                        if path.is_dir()
                            && path.join("paper.md").exists()
                            && path.join("paper.ja.md").exists()
                        {
                            let _ = app_clone.emit("library-changed", ());
                        }
                    }
                }
            }
        })
        .map_err(|e| e.to_string())?;

        let mut guard = self.inner.lock().map_err(|e| e.to_string())?;
        let w = guard.insert(watcher);
        w.watch(Path::new(&library_path), RecursiveMode::NonRecursive)
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    pub fn stop(&self) {
        if let Ok(mut guard) = self.inner.lock() {
            *guard = None;
        }
    }
}
