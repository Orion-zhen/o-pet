use std::f32::consts::{PI, TAU};

use csscolorparser::{Color, parse};
use serde::Serialize;

const OKLCH_INTERVALS_PER_SEGMENT: usize = 16;
const DEFAULT_BODY_BLUR: u8 = 4;
const MAX_BLUR: u8 = 32;

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub(crate) enum BodyPaint {
    Solid {
        color: String,
    },
    Linear {
        angle: f64,
        stops: Vec<GradientStop>,
        accent: String,
    },
    Radial {
        center: [f64; 2],
        stops: Vec<GradientStop>,
        accent: String,
        blur: f64,
    },
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub(crate) struct GradientStop {
    offset: f64,
    color: String,
    opacity: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum Interpolation {
    Srgb,
    Oklch,
}

pub(crate) fn parse_body_paint(value: &str, blur: Option<u8>) -> Result<BodyPaint, String> {
    if blur.is_some_and(|value| value > MAX_BLUR) {
        return Err(format!("body_blur 必须在 0 到 {MAX_BLUR} 之间"));
    }

    let value = value.trim();
    if let Some(inner) = function_body(value, "linear-gradient")? {
        if blur.unwrap_or(0) != 0 {
            return Err("body_blur 仅可用于 radial-gradient".into());
        }
        return parse_linear(inner);
    }
    if let Some(inner) = function_body(value, "radial-gradient")? {
        return parse_radial(inner, f32::from(blur.unwrap_or(DEFAULT_BODY_BLUR)));
    }
    if blur.unwrap_or(0) != 0 {
        return Err("body_blur 仅可用于 radial-gradient".into());
    }

    parse_color(value).map(|color| BodyPaint::Solid {
        color: color.to_css_hex(),
    })
}

fn parse_linear(inner: &str) -> Result<BodyPaint, String> {
    let parts = split_top_level(inner)?;
    if parts.len() < 3 {
        return Err("linear-gradient 需要角度和 2 或 3 个颜色".into());
    }
    let (angle, interpolation) = parse_linear_header(parts[0])?;
    let colors = parse_colors(&parts[1..])?;
    let accent = accent_color(&colors, interpolation).to_css_hex();
    Ok(BodyPaint::Linear {
        angle,
        stops: gradient_stops(&colors, interpolation),
        accent,
    })
}

fn parse_radial(inner: &str, blur: f32) -> Result<BodyPaint, String> {
    let parts = split_top_level(inner)?;
    if parts.len() < 2 {
        return Err("radial-gradient 需要 2 或 3 个颜色".into());
    }

    let first_is_color = parse(parts[0]).is_ok();
    let (center, interpolation, color_parts) = if first_is_color {
        ([0.5, 0.5], Interpolation::Srgb, &parts[..])
    } else {
        let (center, interpolation) = parse_radial_header(parts[0])?;
        (center, interpolation, &parts[1..])
    };
    let colors = parse_colors(color_parts)?;
    let accent = accent_color(&colors, interpolation).to_css_hex();
    Ok(BodyPaint::Radial {
        center,
        stops: gradient_stops(&colors, interpolation),
        accent,
        blur: f64::from(blur),
    })
}

fn function_body<'a>(value: &'a str, name: &str) -> Result<Option<&'a str>, String> {
    let Some(prefix) = value.get(..name.len()) else {
        return Ok(None);
    };
    if !prefix.eq_ignore_ascii_case(name) {
        return Ok(None);
    }
    let rest = &value[name.len()..];
    if !rest.starts_with('(') || !rest.ends_with(')') {
        return Err(format!("{name} 语法无效"));
    }
    Ok(Some(&rest[1..rest.len() - 1]))
}

fn split_top_level(value: &str) -> Result<Vec<&str>, String> {
    let mut parts = Vec::new();
    let mut depth = 0_u32;
    let mut start = 0;
    for (index, character) in value.char_indices() {
        match character {
            '(' => depth += 1,
            ')' => {
                depth = depth
                    .checked_sub(1)
                    .ok_or_else(|| "渐变中的括号不匹配".to_string())?;
            }
            ',' if depth == 0 => {
                let part = value[start..index].trim();
                if part.is_empty() {
                    return Err("渐变参数不能为空".into());
                }
                parts.push(part);
                start = index + 1;
            }
            _ => {}
        }
    }
    if depth != 0 {
        return Err("渐变中的括号不匹配".into());
    }
    let last = value[start..].trim();
    if last.is_empty() {
        return Err("渐变参数不能为空".into());
    }
    parts.push(last);
    Ok(parts)
}

fn parse_linear_header(value: &str) -> Result<(f64, Interpolation), String> {
    let mut tokens = value.split_whitespace().collect::<Vec<_>>();
    let interpolation = take_interpolation(&mut tokens)?;
    if tokens.len() != 1 {
        return Err("线性渐变头部应为 <角度>deg 或 <角度>deg in oklch".into());
    }
    let angle = parse_degrees(tokens[0])?;
    Ok((angle, interpolation))
}

fn parse_radial_header(value: &str) -> Result<([f64; 2], Interpolation), String> {
    let mut tokens = value.split_whitespace().collect::<Vec<_>>();
    let interpolation = take_interpolation(&mut tokens)?;
    let center = match tokens.as_slice() {
        [] | ["circle"] => [0.5, 0.5],
        [shape, at, x, y]
            if shape.eq_ignore_ascii_case("circle") && at.eq_ignore_ascii_case("at") =>
        {
            [parse_percentage(x)?, parse_percentage(y)?]
        }
        _ => {
            return Err("径向渐变头部应为 circle、circle at <x>% <y>%，可追加 in oklch".into());
        }
    };
    Ok((center, interpolation))
}

fn take_interpolation(tokens: &mut Vec<&str>) -> Result<Interpolation, String> {
    if tokens.len() < 2 || !tokens[tokens.len() - 2].eq_ignore_ascii_case("in") {
        return Ok(Interpolation::Srgb);
    }
    let interpolation = match tokens[tokens.len() - 1].to_ascii_lowercase().as_str() {
        "srgb" => Interpolation::Srgb,
        "oklch" => Interpolation::Oklch,
        _ => return Err("渐变插值空间仅支持 srgb 或 oklch".into()),
    };
    tokens.truncate(tokens.len() - 2);
    Ok(interpolation)
}

fn parse_degrees(value: &str) -> Result<f64, String> {
    let number = value
        .get(..value.len().saturating_sub(3))
        .filter(|_| value.get(value.len().saturating_sub(3)..) == Some("deg"))
        .ok_or_else(|| "线性渐变角度必须使用 deg".to_string())?
        .parse::<f64>()
        .map_err(|_| "线性渐变角度无效".to_string())?;
    if !number.is_finite() {
        return Err("线性渐变角度必须是有限数字".into());
    }
    Ok(number.rem_euclid(360.0))
}

fn parse_percentage(value: &str) -> Result<f64, String> {
    let number = value
        .strip_suffix('%')
        .ok_or_else(|| "径向渐变中心必须使用百分比".to_string())?
        .parse::<f64>()
        .map_err(|_| "径向渐变中心无效".to_string())?;
    if !number.is_finite() || !(0.0..=100.0).contains(&number) {
        return Err("径向渐变中心必须在 0% 到 100% 之间".into());
    }
    Ok(number / 100.0)
}

fn parse_colors(values: &[&str]) -> Result<Vec<Color>, String> {
    if !(2..=3).contains(&values.len()) {
        return Err("渐变只支持 2 或 3 个颜色".into());
    }
    values.iter().map(|value| parse_color(value)).collect()
}

fn parse_color(value: &str) -> Result<Color, String> {
    parse(value).map_err(|error| format!("{value:?} 不是有效的 CSS 颜色: {error}"))
}

fn accent_color(colors: &[Color], interpolation: Interpolation) -> Color {
    if colors.len() == 3 {
        return colors[1].clone();
    }
    interpolate(&colors[0], &colors[1], 0.5, interpolation)
}

fn gradient_stops(colors: &[Color], interpolation: Interpolation) -> Vec<GradientStop> {
    if interpolation == Interpolation::Srgb {
        let denominator = (colors.len() - 1) as f32;
        return colors
            .iter()
            .enumerate()
            .map(|(index, color)| gradient_stop(index as f32 / denominator, color))
            .collect();
    }

    let segments = colors.len() - 1;
    let mut stops = Vec::with_capacity(segments * OKLCH_INTERVALS_PER_SEGMENT + 1);
    for segment in 0..segments {
        let start = usize::from(segment != 0);
        for step in start..=OKLCH_INTERVALS_PER_SEGMENT {
            let progress = step as f32 / OKLCH_INTERVALS_PER_SEGMENT as f32;
            let offset = (segment as f32 + progress) / segments as f32;
            stops.push(gradient_stop(
                offset,
                &interpolate(
                    &colors[segment],
                    &colors[segment + 1],
                    progress,
                    interpolation,
                ),
            ));
        }
    }
    stops
}

fn interpolate(first: &Color, second: &Color, progress: f32, space: Interpolation) -> Color {
    if space == Interpolation::Srgb {
        return first.interpolate_rgb(second, progress);
    }

    let [l1, c1, mut h1, a1] = first.to_oklcha();
    let [l2, c2, mut h2, a2] = second.to_oklcha();
    if c1 < 1e-6 {
        h1 = h2;
    }
    if c2 < 1e-6 {
        h2 = h1;
    }
    let mut hue_delta = (h2 - h1).rem_euclid(TAU);
    if hue_delta > PI {
        hue_delta -= TAU;
    }
    Color::from_oklcha(
        lerp(l1, l2, progress),
        lerp(c1, c2, progress),
        h1 + hue_delta * progress,
        lerp(a1, a2, progress),
    )
}

fn lerp(first: f32, second: f32, progress: f32) -> f32 {
    first + (second - first) * progress
}

fn gradient_stop(offset: f32, color: &Color) -> GradientStop {
    let [red, green, blue, _] = color.to_rgba8();
    GradientStop {
        offset: f64::from(offset),
        color: format!("#{red:02x}{green:02x}{blue:02x}"),
        opacity: f64::from((color.a.clamp(0.0, 1.0) * 1000.0).round() / 1000.0),
    }
}

#[cfg(test)]
mod tests {
    use super::{BodyPaint, parse_body_paint};

    #[test]
    fn parses_supported_body_paints() {
        let solid = parse_body_paint("rgb(255, 0, 0)", None).expect("solid");
        assert_eq!(
            solid,
            BodyPaint::Solid {
                color: "#ff0000".into()
            }
        );

        let linear = parse_body_paint(
            "linear-gradient(450deg, rgb(255, 0, 0), #00ff00, hsl(240 100% 50%))",
            None,
        )
        .expect("linear");
        let value = serde_json::to_value(linear).expect("serialize linear");
        assert_eq!(value["kind"], "linear");
        assert_eq!(value["angle"], 90.0);
        assert_eq!(value["accent"], "#00ff00");
        assert_eq!(value["stops"].as_array().expect("stops").len(), 3);
        assert_eq!(value["stops"][1]["offset"], 0.5);

        let centered_radial =
            parse_body_paint("radial-gradient(red, blue)", None).expect("centered radial");
        let value = serde_json::to_value(centered_radial).expect("serialize centered radial");
        assert_eq!(value["center"], serde_json::json!([0.5, 0.5]));
        assert_eq!(value["blur"], 4.0);

        let radial = parse_body_paint(
            "radial-gradient(circle at 35% 30% in oklch, oklch(70% 0.2 20), transparent)",
            Some(10),
        )
        .expect("radial");
        let value = serde_json::to_value(radial).expect("serialize radial");
        assert_eq!(value["kind"], "radial");
        assert_eq!(value["center"], serde_json::json!([0.35, 0.3]));
        assert_eq!(value["blur"], 10.0);
        assert_eq!(value["stops"].as_array().expect("stops").len(), 17);
    }

    #[test]
    fn rejects_unsupported_gradient_syntax() {
        for (value, blur, expected) in [
            ("linear-gradient(to right, red, blue)", None, "deg"),
            ("linear-gradient(90deg, red)", None, "2 或 3"),
            (
                "linear-gradient(90deg, red, green, blue, black)",
                None,
                "2 或 3",
            ),
            (
                "radial-gradient(circle at 120% 50%, red, blue)",
                None,
                "0% 到 100%",
            ),
            ("radial-gradient(ellipse, red, blue)", None, "径向渐变头部"),
            ("linear-gradient(90deg, red, blue)", Some(1), "仅可用于"),
            ("radial-gradient(red, blue)", Some(33), "0 到 32"),
        ] {
            let error = parse_body_paint(value, blur).expect_err("invalid paint");
            assert!(error.contains(expected), "unexpected error: {error}");
        }
    }
}
