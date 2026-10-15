# pi-file-picker

[![npm](https://img.shields.io/npm/v/pi-file-picker.svg)](https://www.npmjs.com/package/pi-file-picker)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**English** | [简体中文](README.zh-CN.md)

![pi-file-picker dialog](https://raw.githubusercontent.com/GoetheDady/pi-file-picker/main/assets/demo.png)

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

Picked paths are appended to the current draft as `@` references — relative to the project when the file lives inside it (`@src/a.ts`, same as pi's own `@` completion), absolute otherwise (`@/tmp/other.txt`). Paths containing spaces are quoted (`@"a b.txt"`). Your draft is left exactly as you typed it: a single space is added as a separator only when one isn't already there. Cancelling the dialog changes nothing.

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
- Both dialogs open in the session's working directory, not in whatever directory was visited last.
- No npm dependencies, and no shell in between — `pi.exec` spawns the process directly.
- PowerShell's piped output is CRLF-terminated, so only the trailing `\r` is dropped. The line is not trimmed: the path *is* the whole line, and macOS allows a file name to end with a space — trimming it would leave the reference pointing at a different file.
- Cancelling is silent, but a real failure (no GUI session, blocked permission, broken WinForms) surfaces as an error notification with the underlying message instead of doing nothing.
- Paths with spaces need the `@"a b"` form; a path that contains a double quote cannot be quoted, because pi has no escape convention for it. Such a path is inserted raw and a warning names it, so you can fix that one reference by hand.
- `ctx.ui.setEditorText()` only mutates editor state and does not repaint, so the insert is followed by `ctx.ui.notify()` (`notify → showStatus → ui.requestRender()`). Without that call the new text stays invisible until the next keypress.

## Limitations

- No directory picking on Windows beyond one folder at a time — `FolderBrowserDialog` is single-select and the multi-select folder picker (`IFileDialog`) would need inline C# COM interop. macOS picks multiple folders.
- Linux is not supported yet.
- Not available in RPC mode. There `ctx.hasUI` is true but `getEditorText()` always returns `""` (the client owns the editor), so appending is impossible and `setEditorText()` would replace your draft with nothing but the references — and the dialog would open on the machine running pi, not at the client. `/pick` reports this instead of clobbering. JSON and print modes have no UI at all.

## Development

```bash
npm test
```

`test/file-picker.check.mjs` drives the extension through a faked pi API and covers eighteen cases (per-platform shortcut registration, file and folder insert on both platforms, relative vs absolute paths, path quoting, quote-in-name handling, script escaping of the working directory, trailing-slash trimming, silent cancel vs reported failure, unsupported platform, no UI, preservation of the draft's trailing whitespace, the RPC-mode refusal, and a file name ending in a space) — no terminal or real dialog needed. `tsc -p .` type-checks the extension against `@earendil-works/pi-coding-agent`. CI runs the same suite on ubuntu / macos / windows × node 22 / 24.

## License

MIT
