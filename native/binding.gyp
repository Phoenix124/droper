{
  "targets": [
    {
      "target_name": "droper_native",
      "conditions": [
        ["OS=='mac'", {
          "sources": ["src/drag_mac.mm"],
          "xcode_settings": {
            "CLANG_ENABLE_OBJC_ARC": "YES",
            "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
            "MACOSX_DEPLOYMENT_TARGET": "11.0"
          },
          "link_settings": { "libraries": ["-framework AppKit", "-framework CoreGraphics"] }
        }],
        ["OS=='win'", {
          "sources": ["src/drag_win.cc"],
          "defines": ["UNICODE", "_UNICODE", "WIN32_LEAN_AND_MEAN"],
          "libraries": ["shell32.lib", "ole32.lib"]
        }]
      ]
    }
  ]
}
