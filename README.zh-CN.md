# pi-file-picker

[![npm](https://img.shields.io/npm/v/pi-file-picker.svg)](https://www.npmjs.com/package/pi-file-picker)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[English](README.md) | **简体中文**

给 [pi](https://github.com/earendil-works/pi) 加一个**真正的系统文件选择窗口**（macOS / Windows）：点选文件，路径自动以 `@path` 的形式插进输入框。

解决什么问题：终端全屏时只能靠 `@` 手动敲文件名，从 Finder / 资源管理器拖文件很别扭。这个扩展直接弹出系统的文件对话框，鼠标点选即可，支持多选。

## 安装

```bash
pi install npm:pi-file-picker
```

或从 GitHub 装：

```bash
pi install git:github.com/GoetheDady/pi-file-picker
```

装完重启 pi（或 `/reload`）。

## 用法

| 操作 | 说明 |
| --- | --- |
| `/pick` | 弹出文件对话框 |
| `Ctrl+Shift+O` | 同上 |

选中后会在当前草稿后面追加 `@` 引用，含空格的路径自动加引号（`@"a b.txt"`，与 pi 自带 `@` 补全格式一致）。取消对话框不会有任何改动。

## 要求

- macOS 或 Windows；Linux 上 `/pick` 会提示不支持
- Node ≥ 22

## 实现说明

- **macOS**：`osascript -e 'choose file with multiple selections allowed'`
- **Windows**：PowerShell 调 WinForms `OpenFileDialog`，脚本内把 stdout 切到 UTF-8，非 ASCII（中文）路径不乱码
- 不依赖任何 npm 依赖，也不经过 shell——`pi.exec` 直接 spawn 进程
- Windows 的 PowerShell 管道输出是 CRLF，逐行 `trim()` 兼顾了这一层
- `ctx.ui.setEditorText()` 只改编辑器状态、不触发重绘，所以插入后跟了一句 `ctx.ui.notify()`（`notify → showStatus → ui.requestRender()`），否则要等下次按键才看得到内容

## 限制

- 只选文件，不支持选目录
- Linux 暂不支持

## 开发

```bash
npm test
```

`test/file-picker.check.mjs` 用假的 pi API 跑七个场景（mac/win 插入、路径引号、两个平台各自的取消、不支持平台、无 UI），不需要真实终端或真实对话框；`tsc -p .` 对 `@earendil-works/pi-coding-agent` 的类型做静态检查。CI 在 ubuntu / macos / windows × node 22 / 24 三平台矩阵跑同一套。

## License

MIT
