# pi-file-picker

[![npm](https://img.shields.io/npm/v/pi-file-picker.svg)](https://www.npmjs.com/package/pi-file-picker)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**English** | [简体中文](README.zh-CN.md)

A [pi](https://github.com/earendil-works/pi) extension that opens the **real system file dialog** (macOS / Windows) and inserts the files you pick into the editor as `@path` references.

Why: in a fullscreen terminal the only way in is typing `@` paths by hand, and dragging files out of Finder or Explorer is awkward. This extension opens the native dialog instead — click a file (or several) and the references land in your prompt.

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
| `Ctrl+Shift+O` | Same |

Picked paths are appended to the current draft as `@` references. Paths containing spaces are quoted (`@"a b.txt"`), matching pi's built-in `@` completion format. Cancelling the dialog changes nothing.

## Requirements

- macOS or Windows; on Linux `/pick` reports that the platform is unsupported
- Node ≥ 22

## How it works

- **macOS**: `osascript -e 'choose file with multiple selections allowed'`.
- **Windows**: PowerShell driving the WinForms `OpenFileDialog`. The script switches stdout to UTF-8 so non-ASCII (e.g. Chinese) paths survive the pipe.
- No npm dependencies, and no shell in between — `pi.exec` spawns the process directly.
- PowerShell's piped output is CRLF-terminated, so lines are trimmed rather than split naively.
- `ctx.ui.setEditorText()` only mutates editor state and does not repaint, so the insert is followed by `ctx.ui.notify()` (`notify → showStatus → ui.requestRender()`). Without that call the new text stays invisible until the next keypress.

## Limitations

- Files only, no directory picking.
- Linux is not supported yet.

## Development

```bash
npm test
```

`test/file-picker.check.mjs` drives the extension through a faked pi API and covers seven cases (macOS and Windows insert, path quoting, cancel on both, unsupported platform, no UI) — no terminal or real dialog needed. `tsc -p .` type-checks the extension against `@earendil-works/pi-coding-agent`. CI runs the same suite on ubuntu / macos / windows × node 22 / 24.

## License

MIT
