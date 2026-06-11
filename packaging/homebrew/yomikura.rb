class Yomikura < Formula
  desc "Mihon-inspired Suwayomi desktop manga reader"
  homepage "https://github.com/Yumekaz/Yomikura"
  version "1.0.0"
  url "https://github.com/Yumekaz/Yomikura/releases/download/v1.0.0/Yomikura_1.0.0_aarch64.dmg"
  sha256 "PLACEHOLDER_UPDATE_ON_RELEASE"
  license "MIT"

  depends_on :macos

  app "Yomikura.app"

  zap trash: [
    "~/Library/Application Support/app.yomikura",
  ]
end