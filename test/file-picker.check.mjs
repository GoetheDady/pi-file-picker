// Self-check for extensions/file-picker.ts. Run with: npm test
// Fakes the extension API so the pick/insert/quote/platform logic runs
// without a TUI or a real file dialog.

import ext from "../extensions/file-picker.ts";

const reg = { commands: {}, shortcuts: {} };
let execResult = { stdout: "", stderr: "", code: 0, killed: false };
let execCalls = [];
let editorText = "";
let wrote = null;
let notified = [];

const pi = {
	registerCommand: (name, opts) => (reg.commands[name] = opts),
	registerShortcut: (key, opts) => (reg.shortcuts[key] = opts),
	exec: async (cmd, args) => {
		execCalls.push({ cmd, args });
		return execResult;
	},
};

const ctx = {
	hasUI: true,
	ui: {
		getEditorText: () => editorText,
		setEditorText: (t) => (wrote = t),
		notify: (m, level) => notified.push({ m, level }),
	},
};

ext(pi);

if (!reg.commands.pick) throw new Error("missing /pick command");
if (!reg.shortcuts["ctrl+shift+o"]) throw new Error("missing ctrl+shift+o shortcut");
console.log("registered: /pick, ctrl+shift+o");

const run = () => reg.shortcuts["ctrl+shift+o"].handler(ctx);

// process.platform is read-only but configurable — stub it, restore at the end.
const realPlatform = process.platform;
const setPlatform = (p) => Object.defineProperty(process, "platform", { value: p, configurable: true });
const reset = () => {
	execCalls = [];
	editorText = "";
	wrote = null;
	notified = [];
};

// 1. macOS: two files, one with a space
setPlatform("darwin");
execResult = { stdout: "/tmp/a b.txt\n/etc/hosts\n", stderr: "", code: 0, killed: false };
reset();
await run();
if (execCalls.length !== 1 || execCalls[0].cmd !== "osascript") throw new Error("darwin must call osascript");
if (wrote !== '@"/tmp/a b.txt" @/etc/hosts') throw new Error("bad path quoting");
if (notified.length !== 1) throw new Error("must notify once so the TUI repaints");
console.log("1: osascript quoting ok");

// 2. macOS: appends to existing draft
execResult = { stdout: "/etc/hosts\n", stderr: "", code: 0, killed: false };
reset();
editorText = "look at these";
await run();
if (wrote !== "look at these @/etc/hosts") throw new Error("bad append");
console.log("2: append ok");

// 3. macOS: cancel (osascript exits 1) leaves the editor alone
execResult = { stdout: "", stderr: "execution error: User canceled. (-128)", code: 1, killed: false };
editorText = "keep me";
reset();
await run();
if (wrote !== null || notified.length !== 0) throw new Error("cancel should not write");
console.log("3: mac cancel ok");

// 4. Windows: paths with spaces and backslashes (PowerShell pipes emit CRLF)
setPlatform("win32");
execResult = { stdout: "C:\\Program Files\\a b.txt\r\nD:\\x.txt\r\n", stderr: "", code: 0, killed: false };
reset();
await run();
if (execCalls.length !== 1 || execCalls[0].cmd !== "powershell") throw new Error("win32 must call powershell");
if (wrote !== '@"C:\\Program Files\\a b.txt" @D:\\x.txt') throw new Error("bad windows path quoting");
console.log("4: powershell quoting ok");

// 5. Windows: cancel exits 1
execResult = { stdout: "", stderr: "", code: 1, killed: false };
reset();
editorText = "keep me";
await run();
if (wrote !== null || notified.length !== 0) throw new Error("windows cancel should not write");
console.log("5: windows cancel ok");

// 6. Linux: unsupported → notify, never exec
setPlatform("linux");
execResult = { stdout: "/etc/hosts\n", stderr: "", code: 0, killed: false };
reset();
await run();
if (execCalls.length !== 0) throw new Error("unsupported platform should not exec");
if (notified.length !== 1 || notified[0].level !== "error") throw new Error("must notify unsupported platform");
console.log("6: unsupported platform notified");

// 7. no UI (print mode) does nothing
setPlatform("darwin");
execResult = { stdout: "/etc/hosts\n", stderr: "", code: 0, killed: false };
wrote = null;
await reg.commands.pick.handler("", { ...ctx, hasUI: false });
if (wrote !== null) throw new Error("no-ui should not write");
console.log("7: no-ui ok");

setPlatform(realPlatform);
console.log("PASS");
