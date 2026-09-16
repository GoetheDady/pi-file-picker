// Self-check for extensions/file-picker.ts. Run with: npm test
// Fakes the extension API so the pick/insert/quote/platform logic runs
// without a TUI or a real file dialog.

import ext from "../extensions/file-picker.ts";

// process.platform is read-only but configurable — stub it, restore at the end.
const realPlatform = process.platform;
const setPlatform = (p) => Object.defineProperty(process, "platform", { value: p, configurable: true });

/** Boot the extension against a fake pi and capture what it registers/does. */
function boot() {
	const reg = { commands: {}, shortcuts: {} };
	const s = {
		execResult: { stdout: "", stderr: "", code: 0, killed: false },
		execCalls: [],
		editorText: "",
		wrote: null,
		notified: [],
	};
	const pi = {
		registerCommand: (name, opts) => (reg.commands[name] = opts),
		registerShortcut: (key, opts) => (reg.shortcuts[key] = opts),
		exec: async (cmd, args) => {
			s.execCalls.push({ cmd, args });
			return s.execResult;
		},
	};
	const ctx = {
		hasUI: true,
		ui: {
			getEditorText: () => s.editorText,
			setEditorText: (t) => (s.wrote = t),
			notify: (m, level) => s.notified.push({ m, level }),
		},
	};
	ext(pi);
	return { reg, ctx, s };
}

const reset = (app) => {
	app.s.execCalls = [];
	app.s.editorText = "";
	app.s.wrote = null;
	app.s.notified = [];
};

// --- registration: shortcuts differ per platform ---
setPlatform("darwin");
const mac = boot();
for (const cmd of ["pick", "pickdir"])
	if (!mac.reg.commands[cmd]) throw new Error(`missing /${cmd} command`);
if (!mac.reg.shortcuts["ctrl+shift+e"]) throw new Error("macOS files shortcut must be ctrl+shift+e");
if (!mac.reg.shortcuts["ctrl+shift+d"]) throw new Error("macOS folders shortcut must be ctrl+shift+d");
console.log("1: macOS registers /pick /pickdir ctrl+shift+e ctrl+shift+d");

setPlatform("win32");
const win = boot();
if (!win.reg.shortcuts["ctrl+shift+e"]) throw new Error("Windows files shortcut must be ctrl+shift+e");
if (!win.reg.shortcuts["ctrl+shift+r"]) throw new Error("Windows folders shortcut must be ctrl+shift+r");
if (win.reg.shortcuts["ctrl+shift+d"]) throw new Error("Windows must not use ctrl+shift+d (Windows Terminal owns it)");
console.log("2: Windows registers ctrl+shift+e ctrl+shift+r");

// --- macOS behaviour ---
setPlatform("darwin");
mac.s.execResult = { stdout: "/tmp/a b.txt\n/etc/hosts\n", stderr: "", code: 0, killed: false };
reset(mac);
await mac.reg.shortcuts["ctrl+shift+e"].handler(mac.ctx);
if (mac.s.execCalls.length !== 1 || mac.s.execCalls[0].cmd !== "osascript") throw new Error("darwin must call osascript");
if (!mac.s.execCalls[0].args[1].includes("choose file")) throw new Error("darwin files must use `choose file`");
if (mac.s.wrote !== '@"/tmp/a b.txt" @/etc/hosts') throw new Error("bad path quoting");
if (mac.s.notified.length !== 1) throw new Error("must notify once so the TUI repaints");
console.log("3: osascript quoting ok");

mac.s.execResult = { stdout: "/etc/hosts\n", stderr: "", code: 0, killed: false };
reset(mac);
mac.s.editorText = "look at these";
await mac.reg.shortcuts["ctrl+shift+e"].handler(mac.ctx);
if (mac.s.wrote !== "look at these @/etc/hosts") throw new Error("bad append");
console.log("4: append ok");

mac.s.execResult = { stdout: "", stderr: "execution error: User canceled. (-128)", code: 1, killed: false };
reset(mac);
mac.s.editorText = "keep me";
await mac.reg.shortcuts["ctrl+shift+e"].handler(mac.ctx);
if (mac.s.wrote !== null || mac.s.notified.length !== 0) throw new Error("mac cancel should not write");
console.log("5: mac cancel ok");

// trailing "/" from `choose folder` is stripped
mac.s.execResult = { stdout: "/Users/x/My Documents/\n/tmp/\n", stderr: "", code: 0, killed: false };
reset(mac);
await mac.reg.shortcuts["ctrl+shift+d"].handler(mac.ctx);
if (!mac.s.execCalls[0].args[1].includes("choose folder")) throw new Error("darwin folders must use `choose folder`");
if (mac.s.wrote !== '@"/Users/x/My Documents" @/tmp') throw new Error("bad folder path quoting/trimming");
if (!/folder reference/.test(mac.s.notified[0].m)) throw new Error("notify should say folder");
console.log("6: mac folder ok");

// --- Windows behaviour ---
setPlatform("win32");
// PowerShell pipes emit CRLF
win.s.execResult = { stdout: "C:\\Program Files\\a b.txt\r\nD:\\x.txt\r\n", stderr: "", code: 0, killed: false };
reset(win);
await win.reg.shortcuts["ctrl+shift+e"].handler(win.ctx);
if (win.s.execCalls.length !== 1 || win.s.execCalls[0].cmd !== "powershell") throw new Error("win32 must call powershell");
if (!win.s.execCalls[0].args[3].includes("OpenFileDialog")) throw new Error("win32 files must use OpenFileDialog");
if (win.s.wrote !== '@"C:\\Program Files\\a b.txt" @D:\\x.txt') throw new Error("bad windows path quoting");
console.log("7: powershell quoting ok");

win.s.execResult = { stdout: "C:\\Program Files\\x\r\n", stderr: "", code: 0, killed: false };
reset(win);
await win.reg.shortcuts["ctrl+shift+r"].handler(win.ctx);
if (!win.s.execCalls[0].args[3].includes("FolderBrowserDialog")) throw new Error("win32 folders must use FolderBrowserDialog");
if (win.s.wrote !== '@"C:\\Program Files\\x"') throw new Error("bad windows folder quoting");
console.log("8: windows folder ok");

win.s.execResult = { stdout: "", stderr: "", code: 1, killed: false };
reset(win);
win.s.editorText = "keep me";
await win.reg.shortcuts["ctrl+shift+e"].handler(win.ctx);
if (win.s.wrote !== null || win.s.notified.length !== 0) throw new Error("windows cancel should not write");
console.log("9: windows cancel ok");

// --- unsupported platform / no UI ---
setPlatform("linux");
const linux = boot();
linux.s.execResult = { stdout: "/etc/hosts\n", stderr: "", code: 0, killed: false };
await linux.reg.shortcuts["ctrl+shift+e"].handler(linux.ctx);
if (linux.s.execCalls.length !== 0) throw new Error("unsupported platform should not exec");
if (linux.s.notified.length !== 1 || linux.s.notified[0].level !== "error") throw new Error("must notify unsupported platform");
console.log("10: unsupported platform notified");

setPlatform("darwin");
reset(mac);
await mac.reg.commands.pick.handler("", { ...mac.ctx, hasUI: false });
if (mac.s.wrote !== null) throw new Error("no-ui should not write");
console.log("11: no-ui ok");

setPlatform(realPlatform);
console.log("PASS");
