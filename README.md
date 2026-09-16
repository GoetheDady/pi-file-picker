# pi-file-picker

[![npm](https://img.shields.io/npm/v/pi-file-picker.svg)](https://www.npmjs.com/package/pi-file-picker)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**English** | [简体中文](README.zh-CN.md)

A [pi](https://github.com/earendil-works/pi) extension that opens the **real system file/folder dialog** (macOS / Windows) and inserts what you pick into the editor as `@path` references.

Why: in a fullscreen terminal the only way in is typing `@` paths by hand, and dragging files out of Finder or Explorer is awkward. This extension opens the native dialog instead — click a file or folder and the references land in your prompt.

## Install

```bash
pi install npm:pi-file-picker
```

Or from GitHub:

```bash
pi install git:github.com/GoetheDady/pi-file-picker
```

Restart pi afterwards (or run `/reload`).

## Usage

| Action | What it does |
| --- | --- |
| `/pick` | Open the file dialog |
| `Ctrl+Shift+E` | Same |
| `/pickdir` | Open the folder dialog |
| `Ctrl+Shift+D` (macOS) / `Ctrl+Shift+R` (Windows) | Same |

Picked paths are appended to the current draft as `@` references. Paths containing spaces are quoted (`@"a b.txt"`), matching pi's built-in `@` completion format. Cancelling the dialog changes nothing.

### Why these keys

Both are checked against pi's own bindings and the terminal's:

- `Ctrl+Shift+O` was pi's tree-filter key, and `Ctrl+Shift+F` is transcript search — avoided.
- Windows Terminal owns a block of `Ctrl+Shift+<letter>` shortcuts by default, including `Ctrl+Shift+D` (duplicate tab), which is why folders use `Ctrl+Shift+R` on Windows.
- All shortcuts live in `keys` in `extensions/file-picker.ts` if you want different ones.

## Requirements

- macOS or Windows; on Linux `/pick` and `/pickdir` report that the platform is unsupported
- Node ≥ 22

## How it works

- **macOS**: `osascript -e 'choose file with multiple selections allowed'`, or `choose folder` for `/pickdir`. The folder dialog returns paths with a trailing `/`, which is stripped.
- **Windows**: PowerShell driving the WinForms `OpenFileDialog` (files) or `FolderBrowserDialog` (folders). The script switches stdout to UTF-8 so non-ASCII (e.g. Chinese) paths survive the pipe.
- No npm dependencies, and no shell in between — `pi.exec` spawns the process directly.
- PowerShell's piped output is CRLF-terminated, so lines are trimmed rather than split naively.
- `ctx.ui.setEditorText()` only mutates editor state and does not repaint, so the insert is followed by `ctx.ui.notify()` (`notify → showStatus → ui.requestRender()`). Without that call the new text stays invisible until the next keypress.

## Limitations

- No directory picking on Windows beyond one folder at a time — `FolderBrowserDialog` is single-select and the multi-select folder picker (`IFileDialog`) would need inline C# COM interop. macOS picks multiple folders.
- Linux is not supported yet.

## Development

```bash
npm test
```

`test/file-picker.check.mjs` drives the extension through a faked pi API and covers eleven cases (per-platform shortcut registration, file and folder insert on both platforms, path quoting, trailing-slash trimming, cancel, unsupported platform, no UI) — no terminal or real dialog needed. `tsc -p .` type-checks the extension against `@earendil-works/pi-coding-agent`. CI runs the same suite on ubuntu / macos / windows × node 22 / 24.

## License

MIT
