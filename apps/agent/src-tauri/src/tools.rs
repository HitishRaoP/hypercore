use std::path::{Path, PathBuf};

/// Which build helpers the agent found (bundled copy preferred, PATH fallback).
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolchainStatus {
    pub esbuild: Option<String>,
    pub javy: Option<String>,
}

fn exe_name(base: &str) -> String {
    if cfg!(windows) {
        format!("{base}.exe")
    } else {
        base.to_owned()
    }
}

/// Directories searched (in order) for bundled helper binaries.
///
/// Layouts covered:
/// - Tauri `bundle.resources`: `<resource_dir>/tools/<bin>`
///   (some installers flatten to `<resource_dir>/<bin>`)
/// - Binary-adjacent: `<exe_dir>/tools/<bin>`, `<exe_dir>/<bin>`
/// - macOS bundle: `<exe_dir>/../Resources/...`
/// - Dev checkout: `<repo>/apps/agent/src-tauri/resources/tools`
fn candidate_dirs(explicit_tools_dir: Option<&Path>) -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    if let Some(d) = explicit_tools_dir {
        dirs.push(d.to_owned());
        // Installers may flatten the `tools/` level.
        if let Some(parent) = d.parent() {
            dirs.push(parent.to_owned());
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            dirs.push(dir.join("tools"));
            // Installed layouts that preserve the `resources/` prefix
            // (`<exe>/resources/tools`, e.g. Tauri `bundle.resources`).
            dirs.push(dir.join("resources/tools"));
            dirs.push(dir.to_owned());
            dirs.push(dir.join("../Resources/tools"));
            dirs.push(dir.join("../Resources"));
            // Dev fallback: walk up to the repo checkout.
            for ancestor in dir.ancestors().take(8) {
                let cand = ancestor.join("src-tauri/resources/tools");
                if cand.is_dir() {
                    dirs.push(cand);
                    break;
                }
            }
        }
    }

    dirs
}

fn find_on_path(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        if dir.as_os_str().is_empty() {
            continue;
        }
        let cand = dir.join(name);
        if cand.is_file() {
            return Some(cand);
        }
    }
    None
}

/// Every filesystem location probed for `base` (for diagnostics).
pub fn searched_locations(explicit_tools_dir: Option<&Path>, base: &str) -> Vec<PathBuf> {
    let name = exe_name(base);
    candidate_dirs(explicit_tools_dir)
        .into_iter()
        .map(|dir| dir.join(&name))
        .collect()
}

/// Resolve a helper binary (`"javy"` / `"esbuild"`): bundled copy first,
/// then `PATH`. Returns an absolute path (or bare name when only PATH matches
/// via lookup failure — here always absolute since we check `is_file`).
pub fn resolve_tool(explicit_tools_dir: Option<&Path>, base: &str) -> Option<PathBuf> {
    let name = exe_name(base);
    for dir in candidate_dirs(explicit_tools_dir) {
        let cand = dir.join(&name);
        if cand.is_file() {
            return Some(cand);
        }
    }
    find_on_path(&name)
}

pub fn toolchain_status(explicit_tools_dir: Option<&Path>) -> ToolchainStatus {
    ToolchainStatus {
        esbuild: resolve_tool(explicit_tools_dir, "esbuild")
            .map(|p| p.to_string_lossy().into_owned()),
        javy: resolve_tool(explicit_tools_dir, "javy")
            .map(|p| p.to_string_lossy().into_owned()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The installed layout preserves the `resources/` prefix
    /// (`<install>/resources/tools/javy.exe`) — the search must probe it,
    /// otherwise installs never find the bundled helpers (dev checkouts
    /// mask this via the `src-tauri/resources/tools` ancestor fallback).
    #[test]
    fn candidate_dirs_cover_install_layouts() {
        let explicit = Path::new("/fake/res/tools");
        let dirs = candidate_dirs(Some(explicit));
        assert!(dirs.contains(&PathBuf::from("/fake/res/tools")));
        assert!(dirs.contains(&PathBuf::from("/fake/res")));
        if let Ok(exe) = std::env::current_exe() {
            if let Some(dir) = exe.parent() {
                assert!(dirs.contains(&dir.join("tools")));
                assert!(dirs.contains(&dir.join("resources/tools")));
            }
        }
        let probed = searched_locations(Some(explicit), "javy");
        assert!(probed.contains(&PathBuf::from("/fake/res/tools/javy.exe")));
    }
}
