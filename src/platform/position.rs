use std::{
    fs::{self, File},
    io::{self, Write},
    path::{Path, PathBuf},
};

use directories::ProjectDirs;
use serde::{Deserialize, Serialize};

pub(super) const DEFAULT_MARGIN: i32 = 32;
pub(super) const DEFAULT_SIZE: i32 = 240;
const MAX_SIZE: i32 = 1024;
const MIN_SIZE: i32 = 64;

#[cfg(any(test, target_os = "macos", target_os = "windows"))]
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct MonitorGeometry {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
}

#[cfg(any(test, target_os = "macos", target_os = "windows"))]
impl MonitorGeometry {
    pub fn logical_size(self) -> (i32, i32) {
        (
            physical_to_logical(self.width, self.scale_factor),
            physical_to_logical(self.height, self.scale_factor),
        )
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub(super) struct WindowPlacement {
    pub width: i32,
    pub height: i32,
    pub monitor: String,
    pub right: i32,
    pub bottom: i32,
}

impl WindowPlacement {
    pub fn default_for(monitor: String) -> Self {
        Self {
            width: DEFAULT_SIZE,
            height: DEFAULT_SIZE,
            monitor,
            right: DEFAULT_MARGIN,
            bottom: DEFAULT_MARGIN,
        }
    }

    pub fn validate(self) -> io::Result<Self> {
        if self.monitor.is_empty()
            || !(MIN_SIZE..=MAX_SIZE).contains(&self.width)
            || !(MIN_SIZE..=MAX_SIZE).contains(&self.height)
            || self.right < 0
            || self.bottom < 0
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "o-pet 窗口位置配置无效",
            ));
        }
        Ok(self)
    }

    pub fn clamp_to(&mut self, monitor_width: i32, monitor_height: i32) {
        self.right = self
            .right
            .clamp(0, monitor_width.saturating_sub(self.width).max(0));
        self.bottom = self
            .bottom
            .clamp(0, monitor_height.saturating_sub(self.height).max(0));
    }

    #[cfg(any(test, target_os = "macos", target_os = "windows"))]
    pub fn physical_origin(&self, monitor: MonitorGeometry) -> (i32, i32) {
        let occupied_width = logical_to_physical(self.width + self.right, monitor.scale_factor);
        let occupied_height = logical_to_physical(self.height + self.bottom, monitor.scale_factor);
        (
            checked_coordinate(
                i64::from(monitor.x) + i64::from(monitor.width) - i64::from(occupied_width),
            ),
            checked_coordinate(
                i64::from(monitor.y) + i64::from(monitor.height) - i64::from(occupied_height),
            ),
        )
    }

    #[cfg(any(test, target_os = "macos", target_os = "windows"))]
    pub fn update_from_physical(
        &mut self,
        monitor_id: String,
        monitor: MonitorGeometry,
        window_x: i32,
        window_y: i32,
        window_width: u32,
        window_height: u32,
    ) {
        self.monitor = monitor_id;
        let right = (i64::from(monitor.x) + i64::from(monitor.width)
            - i64::from(window_x)
            - i64::from(window_width))
        .max(0);
        let bottom = (i64::from(monitor.y) + i64::from(monitor.height)
            - i64::from(window_y)
            - i64::from(window_height))
        .max(0);
        self.right = logical_offset(right, monitor.scale_factor);
        self.bottom = logical_offset(bottom, monitor.scale_factor);
        let (monitor_width, monitor_height) = monitor.logical_size();
        self.clamp_to(monitor_width, monitor_height);
    }
}

pub(super) struct PlacementStore {
    path: PathBuf,
}

impl PlacementStore {
    pub fn for_application() -> io::Result<Self> {
        let directories = ProjectDirs::from("works.earendil", "", "o-pet")
            .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "无法确定 o-pet 配置目录"))?;
        Ok(Self {
            path: directories.config_dir().join("window.json"),
        })
    }

    #[cfg(test)]
    fn at(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn load(&self) -> io::Result<Option<WindowPlacement>> {
        match fs::read(&self.path) {
            Ok(bytes) => serde_json::from_slice::<WindowPlacement>(&bytes)
                .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))
                .and_then(WindowPlacement::validate)
                .map(Some),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(error),
        }
    }

    pub fn save(&self, placement: &WindowPlacement) -> io::Result<()> {
        placement.clone().validate()?;
        let parent = self.path.parent().ok_or_else(|| {
            io::Error::new(io::ErrorKind::InvalidInput, "o-pet 配置路径缺少父目录")
        })?;
        fs::create_dir_all(parent)?;
        let temporary = temporary_path(&self.path);
        let bytes = serde_json::to_vec(placement).map_err(io::Error::other)?;
        let result = (|| {
            let mut file = File::create(&temporary)?;
            file.write_all(&bytes)?;
            file.sync_all()?;
            replace_file(&temporary, &self.path)
        })();
        if result.is_err() {
            let _ = fs::remove_file(&temporary);
        }
        result
    }
}

#[cfg(any(test, target_os = "macos", target_os = "windows"))]
fn physical_to_logical(value: u32, scale_factor: f64) -> i32 {
    (f64::from(value) / scale_factor).round() as i32
}

#[cfg(any(test, target_os = "macos", target_os = "windows"))]
fn logical_to_physical(value: i32, scale_factor: f64) -> i32 {
    (f64::from(value) * scale_factor).round() as i32
}

#[cfg(any(test, target_os = "macos", target_os = "windows"))]
fn logical_offset(value: i64, scale_factor: f64) -> i32 {
    (value as f64 / scale_factor).round() as i32
}

#[cfg(any(test, target_os = "macos", target_os = "windows"))]
fn checked_coordinate(value: i64) -> i32 {
    i32::try_from(value).expect("显示器坐标必须在平台坐标范围内")
}

fn temporary_path(path: &Path) -> PathBuf {
    let mut name = path.as_os_str().to_owned();
    name.push(".tmp");
    PathBuf::from(name)
}

#[cfg(not(windows))]
fn replace_file(source: &Path, destination: &Path) -> io::Result<()> {
    fs::rename(source, destination)
}

#[cfg(windows)]
fn replace_file(source: &Path, destination: &Path) -> io::Result<()> {
    use std::{iter, os::windows::ffi::OsStrExt};
    use windows::{
        Win32::Storage::FileSystem::{
            MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH, MoveFileExW,
        },
        core::PCWSTR,
    };

    let source: Vec<u16> = source
        .as_os_str()
        .encode_wide()
        .chain(iter::once(0))
        .collect();
    let destination: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(iter::once(0))
        .collect();
    unsafe {
        MoveFileExW(
            PCWSTR(source.as_ptr()),
            PCWSTR(destination.as_ptr()),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    }
    .map_err(io::Error::other)
}

#[cfg(test)]
mod tests {
    use super::{DEFAULT_MARGIN, DEFAULT_SIZE, MonitorGeometry, PlacementStore, WindowPlacement};

    #[test]
    fn placement_is_saved_and_loaded_atomically() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let path = directory.path().join("nested/window.json");
        let store = PlacementStore::at(path.clone());
        let placement = WindowPlacement {
            width: 280,
            height: 260,
            monitor: "DP-1".into(),
            right: 48,
            bottom: 20,
        };

        assert_eq!(store.load().expect("missing placement"), None);
        store.save(&placement).expect("save placement");
        assert_eq!(store.load().expect("load placement"), Some(placement));
        assert!(!path.with_file_name("window.json.tmp").exists());
    }

    #[test]
    fn repeated_saves_replace_the_previous_placement() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let store = PlacementStore::at(directory.path().join("window.json"));
        let first = WindowPlacement::default_for("first".into());
        let second = WindowPlacement::default_for("second".into());

        store.save(&first).expect("save first placement");
        store.save(&second).expect("replace placement");

        assert_eq!(store.load().expect("load placement"), Some(second));
    }

    #[test]
    fn invalid_persisted_values_are_rejected() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let path = directory.path().join("window.json");
        std::fs::write(
            &path,
            br#"{"width":0,"height":240,"monitor":"DP-1","right":32,"bottom":32}"#,
        )
        .expect("write invalid fixture");

        let error = PlacementStore::at(path)
            .load()
            .expect_err("invalid placement must fail");
        assert_eq!(error.kind(), std::io::ErrorKind::InvalidData);
    }

    #[test]
    fn clamps_offsets_without_changing_logical_size() {
        let mut placement = WindowPlacement::default_for("DP-1".into());
        placement.right = 2_000;
        placement.bottom = 2_000;
        placement.clamp_to(1920, 1080);

        assert_eq!(placement.width, DEFAULT_SIZE);
        assert_eq!(placement.height, DEFAULT_SIZE);
        assert_eq!(placement.right, 1920 - DEFAULT_SIZE);
        assert_eq!(placement.bottom, 1080 - DEFAULT_SIZE);

        let small = WindowPlacement::default_for("DP-1".into());
        assert_eq!(small.right, DEFAULT_MARGIN);
        assert_eq!(small.bottom, DEFAULT_MARGIN);
    }

    #[test]
    fn converts_right_bottom_offsets_across_scaled_displays() {
        let monitor = MonitorGeometry {
            x: -2560,
            y: 180,
            width: 2560,
            height: 1440,
            scale_factor: 2.0,
        };
        let placement = WindowPlacement {
            width: 240,
            height: 200,
            monitor: "display-2".into(),
            right: 40,
            bottom: 24,
        };

        let origin = placement.physical_origin(monitor);
        assert_eq!(origin, (-560, 1172));

        let mut restored = WindowPlacement::default_for("display-1".into());
        restored.width = placement.width;
        restored.height = placement.height;
        restored.update_from_physical("display-2".into(), monitor, origin.0, origin.1, 480, 400);
        assert_eq!(restored, placement);
    }

    #[test]
    fn updates_monitor_identity_and_clamps_partly_offscreen_drag() {
        let monitor = MonitorGeometry {
            x: 1920,
            y: 0,
            width: 1920,
            height: 1080,
            scale_factor: 1.0,
        };
        let mut placement = WindowPlacement::default_for("display-1".into());

        placement.update_from_physical("display-2".into(), monitor, 3700, 900, 240, 240);

        assert_eq!(placement.monitor, "display-2");
        assert_eq!(placement.right, 0);
        assert_eq!(placement.bottom, 0);
    }
}
