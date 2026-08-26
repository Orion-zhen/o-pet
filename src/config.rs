use std::{
    fs, io,
    path::{Path, PathBuf},
};

use csscolorparser::parse;
use directories::BaseDirs;
use serde::{Deserialize, Serialize};

use self::body_paint::{BodyPaint, parse_body_paint};

mod body_paint;

pub(crate) const DEFAULT_SIZE: i32 = 120;
pub(crate) const MAX_SIZE: i32 = 1024;
pub(crate) const MIN_SIZE: i32 = 64;

const DEFAULT_BODY_COLOR: &str = "radial-gradient(circle at 28% 20% in oklch, oklch(72% 0.015 85), oklch(59% 0.022 75), oklch(47% 0.028 65))";
const DEFAULT_EYE_COLOR: &str = "#fffaf0";
const DEFAULT_SHAPE: &str = "blob";
const SHAPES: &[&str] = &[
    "blob", "pebble", "bean", "egg", "squircle", "tablet", "capsule", "cylinder", "hex", "gem",
    "crystal", "wedge", "shield", "dome", "arch", "cloud", "teardrop", "leaf",
];

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Config {
    pub size: i32,
    pub renderer: RendererPreferences,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub(crate) struct RendererPreferences {
    pub shape: String,
    pub body_color: BodyPaint,
    pub eye_color: String,
}

#[derive(Deserialize)]
#[serde(default, deny_unknown_fields)]
struct RawConfig {
    size: i32,
    shape: String,
    body_color: String,
    body_blur: Option<u8>,
    eye_color: String,
}

impl Default for RawConfig {
    fn default() -> Self {
        Self {
            size: DEFAULT_SIZE,
            shape: DEFAULT_SHAPE.into(),
            body_color: DEFAULT_BODY_COLOR.into(),
            body_blur: None,
            eye_color: DEFAULT_EYE_COLOR.into(),
        }
    }
}

impl Config {
    pub fn load() -> io::Result<Self> {
        let directories = BaseDirs::new()
            .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "无法确定用户主目录"))?;
        Self::load_from(&config_path(directories.home_dir()))
    }

    fn load_from(path: &Path) -> io::Result<Self> {
        let source = match fs::read_to_string(path) {
            Ok(source) => source,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Self::default()),
            Err(error) => return Err(error),
        };
        let raw = toml::from_str::<RawConfig>(&source)
            .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
        raw.validate()
    }
}

impl Default for Config {
    fn default() -> Self {
        RawConfig::default()
            .validate()
            .expect("内置 o-pet 配置必须有效")
    }
}

impl RawConfig {
    fn validate(self) -> io::Result<Config> {
        if !(MIN_SIZE..=MAX_SIZE).contains(&self.size) {
            return Err(invalid_value(format!(
                "size 必须在 {MIN_SIZE} 到 {MAX_SIZE} 之间"
            )));
        }
        if !SHAPES.contains(&self.shape.as_str()) {
            return Err(invalid_value(format!(
                "shape 必须是以下预设之一: {}",
                SHAPES.join(", ")
            )));
        }
        Ok(Config {
            size: self.size,
            renderer: RendererPreferences {
                shape: self.shape,
                body_color: parse_body_paint(&self.body_color, self.body_blur)
                    .map_err(|error| invalid_value(format!("body_color 无效: {error}")))?,
                eye_color: parse_color("eye_color", &self.eye_color)?,
            },
        })
    }
}

fn parse_color(field: &str, value: &str) -> io::Result<String> {
    parse(value)
        .map(|color| color.to_css_hex())
        .map_err(|error| invalid_value(format!("{field} 不是有效的 CSS 颜色: {error}")))
}

fn invalid_value(message: String) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}

fn config_path(home: &Path) -> PathBuf {
    home.join(".config/o-pet/config.toml")
}

#[cfg(test)]
mod tests {
    use super::{Config, config_path};

    #[test]
    fn uses_the_same_home_relative_path_on_every_platform() {
        assert_eq!(
            config_path(std::path::Path::new("/home/pet")),
            std::path::Path::new("/home/pet/.config/o-pet/config.toml")
        );
    }

    #[test]
    fn uses_warm_gray_radial_gradient_by_default() {
        let config = Config::default();
        let paint = serde_json::to_value(config.renderer.body_color).expect("serialize body paint");

        assert_eq!(paint["kind"], "radial");
        assert_eq!(paint["center"], serde_json::json!([0.28, 0.2]));
        assert_eq!(paint["blur"], 4.0);
        assert_eq!(paint["stops"].as_array().expect("stops").len(), 33);
        assert_eq!(config.renderer.eye_color, "#fffaf0");
    }

    #[test]
    fn loads_partial_config_and_normalizes_css_colors() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let path = directory.path().join("config.toml");
        std::fs::write(
            &path,
            "size = 320\nshape = \"cloud\"\nbody_color = \"rgb(255, 0, 0)\"\neye_color = \"navy\"\n",
        )
        .expect("write config");

        let config = Config::load_from(&path).expect("load config");

        assert_eq!(config.size, 320);
        assert_eq!(config.renderer.shape, "cloud");
        assert_eq!(
            serde_json::to_value(&config.renderer.body_color).expect("serialize body paint"),
            serde_json::json!({ "kind": "solid", "color": "#ff0000" })
        );
        assert_eq!(config.renderer.eye_color, "#000080");
        assert_eq!(
            serde_json::to_value(&config.renderer).expect("serialize renderer preferences"),
            serde_json::json!({
                "shape": "cloud",
                "body_color": { "kind": "solid", "color": "#ff0000" },
                "eye_color": "#000080",
            })
        );
    }

    #[test]
    fn loads_gradient_body_color_and_blur() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let path = directory.path().join("config.toml");
        std::fs::write(
            &path,
            "body_color = \"radial-gradient(circle at 35% 30%, #ffffff, #a855f7, transparent)\"\nbody_blur = 10\n",
        )
        .expect("write gradient config");

        let config = Config::load_from(&path).expect("load gradient config");
        let paint = serde_json::to_value(config.renderer.body_color).expect("serialize body paint");

        assert_eq!(paint["kind"], "radial");
        assert_eq!(paint["center"], serde_json::json!([0.35, 0.3]));
        assert_eq!(paint["blur"], 10.0);
        assert_eq!(paint["stops"].as_array().expect("stops").len(), 3);
    }

    #[test]
    fn rejects_invalid_values_and_unknown_fields() {
        for (source, expected) in [
            ("size = 63\n", "size 必须"),
            ("shape = \"round\"\n", "shape 必须"),
            ("body_color = \"not a color\"\n", "body_color"),
            ("eye_color = \"not a color\"\n", "eye_color"),
            ("body_blur = 33\n", "body_blur"),
            ("unknown = true\n", "unknown field"),
        ] {
            let directory = tempfile::tempdir().expect("temporary directory");
            let path = directory.path().join("config.toml");
            std::fs::write(&path, source).expect("write invalid config");

            let error = Config::load_from(&path).expect_err("invalid config must fail");

            assert_eq!(error.kind(), std::io::ErrorKind::InvalidData);
            assert!(
                error.to_string().contains(expected),
                "unexpected error: {error}"
            );
        }
    }
}
