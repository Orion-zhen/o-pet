use std::io::Cursor;

const TRAY_ICON_PNG: &[u8] = include_bytes!("../../assets/icon.iconset/icon_32x32.png");

pub(super) struct RgbaIcon {
    pub(super) pixels: Vec<u8>,
    pub(super) width: u32,
    pub(super) height: u32,
}

pub(super) fn load_tray_icon() -> RgbaIcon {
    let decoder = png::Decoder::new(Cursor::new(TRAY_ICON_PNG));
    let mut reader = decoder.read_info().expect("内嵌托盘图标必须是有效 PNG");
    let buffer_size = reader
        .output_buffer_size()
        .expect("内嵌托盘图标像素缓冲区大小必须有效");
    let mut pixels = vec![0; buffer_size];
    let info = reader
        .next_frame(&mut pixels)
        .expect("内嵌托盘图标必须是有效 PNG");
    assert_eq!(info.color_type, png::ColorType::Rgba);
    assert_eq!(info.bit_depth, png::BitDepth::Eight);
    pixels.truncate(info.buffer_size());
    RgbaIcon {
        pixels,
        width: info.width,
        height: info.height,
    }
}

#[cfg(test)]
mod tests {
    use super::load_tray_icon;

    #[test]
    fn embedded_tray_icon_is_rgba() {
        let icon = load_tray_icon();
        assert_eq!((icon.width, icon.height), (32, 32));
        assert_eq!(icon.pixels.len(), 32 * 32 * 4);
    }
}
