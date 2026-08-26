use std::borrow::Cow;

use rust_embed::RustEmbed;

pub(crate) const DOCUMENT_URL: &str = "o-pet://app/index.html";
pub(crate) const PROTOCOL: &str = "o-pet";

#[derive(RustEmbed)]
#[folder = "renderer/"]
struct RendererAssets;

pub(crate) struct Asset {
    pub(crate) body: Cow<'static, [u8]>,
    pub(crate) content_type: &'static str,
}

pub(crate) fn asset(path: &str) -> Option<Asset> {
    let path = normalize_path(path)?;
    let content_type = content_type(path)?;
    let file = RendererAssets::get(path)?;
    Some(Asset {
        body: file.data,
        content_type,
    })
}

fn normalize_path(path: &str) -> Option<&str> {
    let path = path.strip_prefix('/').unwrap_or(path);
    if path.is_empty() {
        return Some("index.html");
    }
    if path
        .split('/')
        .any(|component| component.is_empty() || component == "." || component == "..")
        || path.contains('\\')
    {
        return None;
    }
    Some(path)
}

fn content_type(path: &str) -> Option<&'static str> {
    match path.rsplit_once('.').map(|(_, extension)| extension) {
        Some("css") => Some("text/css; charset=utf-8"),
        Some("html") => Some("text/html; charset=utf-8"),
        Some("js") => Some("text/javascript; charset=utf-8"),
        Some("json") => Some("application/json; charset=utf-8"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::asset;

    #[test]
    fn embeds_renderer_entrypoint_and_resources() {
        let index = asset("/").expect("缺少渲染页面");
        let index = str::from_utf8(&index.body).expect("渲染页面必须是 UTF-8");
        assert!(index.contains("./style.css"));
        assert!(index.contains("./bootstrap.js"));
        assert!(!index.contains("<style>"));
        assert!(!index.contains("<script>"));
        assert!(!index.contains("unsafe-inline"));

        for path in [
            "/style.css",
            "/bootstrap.js",
            "/start.js",
            "/catalog/action-groups.json",
            "/engine/runtime.js",
            "/view/geometry-data.js",
            "/host.js",
        ] {
            assert!(asset(path).is_some(), "缺少渲染资源 {path}");
        }
    }

    #[test]
    fn rejects_unknown_types_and_non_canonical_paths() {
        for path in [
            "/missing.js",
            "/catalog/action-groups.txt",
            "/../Cargo.toml",
            "/engine/../host.js",
            "/engine\\runtime.js",
            "//host.js",
        ] {
            assert!(asset(path).is_none(), "不应提供渲染资源 {path}");
        }
    }
}
