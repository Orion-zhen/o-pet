pkgname=o-pet
pkgver=0.1.0
pkgrel=1
pkgdesc='Cross-platform desktop pet for Pi'
arch=('x86_64')
url='https://github.com/Orion-zhen/o-pet'
license=('AGPL-3.0-only')
depends=('gtk4' 'gtk4-layer-shell' 'webkitgtk-6.0')
makedepends=('cargo')
source=()

# 本文件随源码仓库分发，直接构建当前检出的工作区。
# 隔离 makepkg 目录，避免默认 srcdir 与 Rust 的 src/ 冲突。
_repo="$(pwd -P)"
BUILDDIR="$_repo/.makepkg"

build() {
	cd "$_repo"
	CARGO_TARGET_DIR="$BUILDDIR/cargo-target" cargo build --release
}

check() {
	cd "$_repo"
	CARGO_TARGET_DIR="$BUILDDIR/cargo-target" cargo test --release
}

package() {
	install -Dm755 "$BUILDDIR/cargo-target/release/o-pet" \
		"$pkgdir/usr/bin/o-pet"
	install -Dm644 "$_repo/assets/app-icon-256.png" \
		"$pkgdir/usr/share/icons/hicolor/256x256/apps/o-pet.png"
	install -Dm644 "$_repo/LICENSE" \
		"$pkgdir/usr/share/licenses/$pkgname/LICENSE"

	install -dm755 "$pkgdir/usr/share/applications"
	cat >"$pkgdir/usr/share/applications/o-pet.desktop" <<'EOF'
[Desktop Entry]
Version=1.0
Type=Application
Name=o-pet
Comment=Desktop pet for Pi
Exec=o-pet
Icon=o-pet
Terminal=false
Categories=Utility;
StartupNotify=false
EOF
}
