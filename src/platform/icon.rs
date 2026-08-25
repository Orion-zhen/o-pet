use std::{io, io::Cursor};

const TRAY_ICON_PNG: &[u8] = include_bytes!("../../assets/icon.iconset/icon_32x32.png");

pub(super) struct RgbaIcon {
    pub(super) pixels: Vec<u8>,
    pub(super) width: u32,
    pub(super) height: u32,
}

pub(super) fn load_tray_icon() -> io::Result<RgbaIcon> {
    let decoder = png::Decoder::new(Cursor::new(TRAY_ICON_PNG));
    let mut reader = decoder
        .read_info()
        .map_err(|error| invalid_icon(error.to_string()))?;
    let buffer_size = reader
        .output_buffer_size()
        .ok_or_else(|| invalid_icon("像素缓冲区过大"))?;
    let mut pixels = vec![0; buffer_size];
    let info = reader
        .next_frame(&mut pixels)
        .map_err(|error| invalid_icon(error.to_string()))?;
    if info.color_type != png::ColorType::Rgba || info.bit_depth != png::BitDepth::Eight {
        return Err(invalid_icon("图标必须使用 8 位 RGBA 格式"));
    }
    pixels.truncate(info.buffer_size());
    Ok(RgbaIcon {
        pixels,
        width: info.width,
        height: info.height,
    })
}

fn invalid_icon(message: impl Into<String>) -> io::Error {
    io::Error::new(
        io::ErrorKind::InvalidData,
        format!("无法读取内嵌托盘图标: {}", message.into()),
    )
}

#[cfg(test)]
mod tests {
    use super::load_tray_icon;

    #[test]
    fn embedded_tray_icon_is_rgba() {
        let icon = load_tray_icon().expect("托盘图标应可解码");
        assert_eq!((icon.width, icon.height), (32, 32));
        assert_eq!(icon.pixels.len(), 32 * 32 * 4);
    }
}
