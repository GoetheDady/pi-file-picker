# pi-file-picker

[![npm](https://img.shields.io/npm/v/pi-file-picker.svg)](https://www.npmjs.com/package/pi-file-picker)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[English](README.md) | **简体中文**

![pi-file-picker 对话框](https://raw.githubusercontent.com/GoetheDady/pi-file-picker/main/assets/demo.png)

给 [pi](https://github.com/earendil-works/pi) 加一个**真正的系统文件/文件夹选择窗口**（macOS / Windows）：点选文件或目录，路径自动以 `@path` 的形式插进输入框。

解决什么问题：终端全屏时只能靠 `@` 手动敲文件名，从 Finder / 资源管理器拖文件很别扭。这个扩展直接弹出系统的对话框，鼠标点选即可。

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
| `/pick` | 弹出文件对话框（可多选） |
| `Ctrl+Shift+E` | 同上 |
| `/pickdir` | 弹出文件夹对话框 |
| `Ctrl+Shift+D`（macOS）/ `Ctrl+Shift+R`（Windows） | 同上 |

选中后会在当前草稿后面追加 `@` 引用：文件在项目内时用相对路径（`@src/a.ts`，与 pi 自带 `@` 补全一致），在项目外时用绝对路径（`@/tmp/other.txt`）；含空格的路径加引号（`@"a b.txt"`）。你写的内容原样保留，只在缺分隔符时补一个空格。取消对话框不会有任何改动。

### 为什么是这几个键

两个平台的键位都避开了 pi 自身和终端的占用：

- `Ctrl+Shift+O` 原本是 pi 的 session tree filter 键，`Ctrl+Shift+F` 是转录搜索——都不用
- Windows Terminal 默认抢走一整片 `Ctrl+Shift+<字母>`，其中 `Ctrl+Shift+D` 是“复制标签页”，所以 Windows 的目录用 `Ctrl+Shift+R`
- 想改键：`extensions/file-picker.ts` 里的 `keys`

## 要求

- macOS 或 Windows；Linux 上 `/pick`、`/pickdir` 会提示不支持
- Node ≥ 22

## 实现说明

- **macOS**：`osascript -e 'choose file with multiple selections allowed'`，选目录用 `choose folder`；目录对话框返回的路径带结尾 `/`，已剥掉
- **Windows**：PowerShell 调 WinForms `OpenFileDialog`（文件）或 `FolderBrowserDialog`（目录），脚本内把 stdout 切到 UTF-8，非 ASCII（中文）路径不乱码
- 两个平台的对话框都开在会话的工作目录，而不是上次访问的位置
- 不依赖任何 npm 依赖，也不经过 shell——`pi.exec` 直接 spawn 进程
- Windows 的 PowerShell 管道输出是 CRLF，只去掉行尾那个 `\r`。不能整行 `trim()`：路径就是整行，而 macOS 允许文件名以空格结尾，trim 会把它吃掉，引用就指到别的文件上去了
- 取消对话框是静默的；但真失败（无 GUI 会话、权限被拦、WinForms 不可用）会把底层错误用 `notify(..., "error")` 报出来，不再石沉大海
- 含空格的路径需要用 `@"a b"` 形式；路径里含双引号时无法套引号（pi 没有转义约定），这类路径会原样插入并用 warning 点名，由你手动修那一条
- `ctx.ui.setEditorText()` 只改编辑器状态、不触发重绘，所以插入后跟了一句 `ctx.ui.notify()`（`notify → showStatus → ui.requestRender()`），否则要等下次按键才看得到内容

## 限制

- Windows 选目录一次只能选一个：`FolderBrowserDialog` 不支持多选，而支持多选的 `IFileDialog` 要在 PowerShell 里内联 C# 做 COM 互操作。macOS 可多选
- Linux 暂不支持
- RPC 模式下不可用：那里 `ctx.hasUI` 是 true，但 `getEditorText()` 恒返回 `""`（编辑器归客户端所有），所以「追加」做不到，`setEditorText()` 只会把你的草稿替换成孤零零的引用；对话框也会弹在跑 pi 的那台机器上，而不是客户端这边。`/pick` 会直接说明这一点，而不是把你的草稿冲掉。JSON 和 print 模式本来就没有 UI

## 开发

```bash
npm test
```

`test/file-picker.check.mjs` 用假的 pi API 跑十八个场景（两端各自注册的快捷键、两端的文件/目录插入、相对 vs 绝对路径、路径引号、含引号文件名、工作目录在脚本里的转义、结尾斜杠剥离、取消静默 vs 失败上报、不支持平台、无 UI、草稿结尾空白保留、RPC 模式拒绝、文件名结尾空格保留），不需要真实终端或真实对话框；`tsc -p .` 对 `@earendil-works/pi-coding-agent` 的类型做静态检查。CI 在 ubuntu / macos / windows × node 22 / 24 三平台矩阵跑同一套。

## License

MIT
