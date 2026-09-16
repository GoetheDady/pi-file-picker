# pi-file-picker

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

给 [pi](https://github.com/earendil-works/pi) 加一个**真正的 macOS 文件选择窗口**：点选文件，路径自动以 `@path` 的形式插进输入框。

解决什么问题：终端全屏时只能靠 `@` 手动敲文件名，从 Finder 拖文件很别扭。这个扩展直接弹出系统的文件对话框，鼠标点选即可，支持多选。

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

## 实现说明

- 通过 `osascript -e 'choose file with multiple selections allowed'` 调用系统对话框，不依赖任何 npm 依赖
- `ctx.ui.setEditorText()` 只改编辑器状态、不触发重绘，所以插入后跟了一句 `ctx.ui.notify()`（`notify → showStatus → ui.requestRender()`），否则要等下次按键才看得到内容

## 限制

- 仅 macOS（依赖 `osascript`）
- 只选文件，不支持选目录

## 开发

```bash
npm test
```

`test/file-picker.check.mjs` 用假的扩展 API 跑插入/引号/取消/无 UI 四种情况，不需要真实终端、不需要 macOS；`tsc -p .` 负责对 `@earendil-works/pi-coding-agent` 的类型做静态检查。需要 Node ≥ 22。

## License

MIT
