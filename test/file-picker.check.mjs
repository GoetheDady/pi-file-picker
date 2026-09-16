// Self-check for extensions/file-picker.ts. Run with: npm test
// Fakes the extension API so the pick/insert/quote/platform logic runs
// without a TUI or a real file dialog.

import ext from "../extensions/file-picker.ts";

// process.platform is read-only but configurable — stub it, restore at the end.
const realPlatform = process.platform;
const setPlatform = (p) => Object.defineProperty(process, "platform", { value: p, configurable: true });

/** Boot the extension against a fake pi and capture what it registers/does. */
function boot(cwd) {
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
		cwd,
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
const scriptOf = (app) => app.s.execCalls[0].args.at(-1);

// --- registration: shortcuts differ per platform ---
setPlatform("darwin");
const MAC = "/Users/x/proj";
let mac = boot(MAC);
for (const cmd of ["pick", "pickdir"])
	if (!mac.reg.commands[cmd]) throw new Error(`missing /${cmd} command`);
if (!mac.reg.shortcuts["ctrl+shift+e"]) throw new Error("macOS files shortcut must be ctrl+shift+e");
if (!mac.reg.shortcuts["ctrl+shift+d"]) throw new Error("macOS folders shortcut must be ctrl+shift+d");
console.log("1: macOS registers /pick /pickdir ctrl+shift+e ctrl+shift+d");

setPlatform("win32");
const WIN = "C:\\proj";
let win = boot(WIN);
if (!win.reg.shortcuts["ctrl+shift+e"]) throw new Error("Windows files shortcut must be ctrl+shift+e");
if (!win.reg.shortcuts["ctrl+shift+r"]) throw new Error("Windows folders shortcut must be ctrl+shift+r");
if (win.reg.shortcuts["ctrl+shift+d"]) throw new Error("Windows must not use ctrl+shift+d (Windows Terminal owns it)");
console.log("2: Windows registers ctrl+shift+e ctrl+shift+r");

// --- macOS behaviour ---
setPlatform("darwin");
mac.s.execResult = { stdout: `${MAC}/src/a b.ts\n/tmp/other.txt\n`, stderr: "", code: 0, killed: false };
reset(mac);
await mac.reg.shortcuts["ctrl+shift+e"].handler(mac.ctx);
if (mac.s.execCalls.length !== 1 || mac.s.execCalls[0].cmd !== "osascript") throw new Error("darwin must call osascript");
if (!scriptOf(mac).includes("choose file")) throw new Error("darwin files must use `choose file`");
if (!scriptOf(mac).includes(`default location (POSIX file "${MAC}")`)) throw new Error("dialog must open in cwd");
// in-project file goes relative, outside the project stays absolute
if (mac.s.wrote !== '@"src/a b.ts" @/tmp/other.txt') throw new Error(`bad refs: ${mac.s.wrote}`);
if (mac.s.notified.length !== 1) throw new Error("must notify once so the TUI repaints");
console.log("3: relative in-project refs + absolute outside, quoting ok");

mac.s.execResult = { stdout: `${MAC}/README.md\n`, stderr: "", code: 0, killed: false };
reset(mac);
mac.s.editorText = "look at these";
await mac.reg.shortcuts["ctrl+shift+e"].handler(mac.ctx);
if (mac.s.wrote !== "look at these @README.md") throw new Error(`bad append: ${mac.s.wrote}`);
console.log("4: append ok");

mac.s.execResult = { stdout: "", stderr: "execution error: User canceled. (-128)", code: 1, killed: false };
reset(mac);
mac.s.editorText = "keep me";
await mac.reg.shortcuts["ctrl+shift+e"].handler(mac.ctx);
if (mac.s.wrote !== null || mac.s.notified.length !== 0) throw new Error("mac cancel must stay silent");
console.log("5: mac cancel silent ok");

// cancel is localised — a Chinese macOS reports "用户取消。 (-128)", so only -128 is reliable
mac.s.execResult = { stdout: "", stderr: "11:13: execution error: 用户取消。 (-128)", code: 1, killed: false };
reset(mac);
await mac.reg.shortcuts["ctrl+shift+e"].handler(mac.ctx);
if (mac.s.wrote !== null || mac.s.notified.length !== 0) throw new Error("localised cancel must stay silent");
console.log("5b: localised cancel silent ok");

// real failure (no GUI session, permissions) must surface, not disappear
mac.s.execResult = { stdout: "", stderr: "execution error: No user interaction allowed. (-1713)", code: 1, killed: false };
reset(mac);
await mac.reg.shortcuts["ctrl+shift+e"].handler(mac.ctx);
if (mac.s.wrote !== null) throw new Error("failure must not write");
if (mac.s.notified.length !== 1 || mac.s.notified[0].level !== "error") throw new Error("real failure must be notified");
if (!/-1713/.test(mac.s.notified[0].m)) throw new Error("error notification should carry stderr");
console.log("6: real mac failure notified ok");

// trailing "/" from `choose folder` is stripped; folder inside cwd goes relative
mac.s.execResult = { stdout: `${MAC}/My Docs/\n/tmp/\n`, stderr: "", code: 0, killed: false };
reset(mac);
await mac.reg.shortcuts["ctrl+shift+d"].handler(mac.ctx);
if (!scriptOf(mac).includes("choose folder")) throw new Error("darwin folders must use `choose folder`");
if (mac.s.wrote !== '@"My Docs" @/tmp') throw new Error(`bad folder refs: ${mac.s.wrote}`);
if (!/folder reference/.test(mac.s.notified[0].m)) throw new Error("notify should say folder");
console.log("7: mac folder ok");

// cwd containing a quote must be escaped for AppleScript
mac = boot('/Users/x/we"ird');
mac.s.execResult = { stdout: "", stderr: "User canceled", code: 1, killed: false };
await mac.reg.shortcuts["ctrl+shift+e"].handler(mac.ctx);
if (!scriptOf(mac).includes('POSIX file "/Users/x/we\\"ird"')) throw new Error("AppleScript cwd must be escaped");
console.log("8: AppleScript escaping ok");

// --- Windows behaviour ---
setPlatform("win32");
// PowerShell pipes emit CRLF
win.s.execResult = { stdout: `${WIN}\\src\\a b.ts\r\nD:\\x.txt\r\n`, stderr: "", code: 0, killed: false };
reset(win);
await win.reg.shortcuts["ctrl+shift+e"].handler(win.ctx);
if (win.s.execCalls.length !== 1 || win.s.execCalls[0].cmd !== "powershell") throw new Error("win32 must call powershell");
if (!scriptOf(win).includes("OpenFileDialog")) throw new Error("win32 files must use OpenFileDialog");
if (!scriptOf(win).includes(`$d.InitialDirectory = '${WIN}'`)) throw new Error("windows dialog must open in cwd");
if (win.s.wrote !== '@"src\\a b.ts" @D:\\x.txt') throw new Error(`bad windows refs: ${win.s.wrote}`);
console.log("9: powershell quoting + initial dir ok");

win.s.execResult = { stdout: `${WIN}\\docs\r\n`, stderr: "", code: 0, killed: false };
reset(win);
await win.reg.shortcuts["ctrl+shift+r"].handler(win.ctx);
if (!scriptOf(win).includes("FolderBrowserDialog")) throw new Error("win32 folders must use FolderBrowserDialog");
if (win.s.wrote !== "@docs") throw new Error(`bad windows folder ref: ${win.s.wrote}`);
console.log("10: windows folder ok");

win.s.execResult = { stdout: "", stderr: "", code: 1, killed: false };
reset(win);
win.s.editorText = "keep me";
await win.reg.shortcuts["ctrl+shift+e"].handler(win.ctx);
if (win.s.wrote !== null || win.s.notified.length !== 0) throw new Error("windows cancel must stay silent");
console.log("11: windows cancel ok");

// cwd containing a quote must be escaped for PowerShell (' -> '')
win = boot("C:\\it's proj");
win.s.execResult = { stdout: "", stderr: "", code: 1, killed: false };
await win.reg.shortcuts["ctrl+shift+e"].handler(win.ctx);
if (!scriptOf(win).includes("InitialDirectory = 'C:\\it''s proj'")) throw new Error("PowerShell cwd must be escaped");
console.log("12: PowerShell escaping ok");

// --- quoting edge cases ---
setPlatform("darwin");
mac = boot(MAC);
// a quote is fine unquoted; a quote plus a space cannot be expressed at all
mac.s.execResult = { stdout: `/tmp/a"b.txt\n/tmp/a"b c.txt\n`, stderr: "", code: 0, killed: false };
reset(mac);
await mac.reg.shortcuts["ctrl+shift+e"].handler(mac.ctx);
if (mac.s.wrote !== '@/tmp/a"b.txt @/tmp/a"b c.txt') throw new Error(`bad quote handling: ${mac.s.wrote}`);
const warn = mac.s.notified.find((n) => n.level === "warning");
if (!warn) throw new Error("unquotable path must warn");
if (!warn.m.includes('/tmp/a"b c.txt')) throw new Error("warning should name the offending path");
console.log("13: quote-in-name handled and warned");

// --- unsupported platform / no UI ---
setPlatform("linux");
const linux = boot("/home/u/proj");
linux.s.execResult = { stdout: "/etc/hosts\n", stderr: "", code: 0, killed: false };
await linux.reg.shortcuts["ctrl+shift+e"].handler(linux.ctx);
if (linux.s.execCalls.length !== 0) throw new Error("unsupported platform should not exec");
if (linux.s.notified.length !== 1 || linux.s.notified[0].level !== "error") throw new Error("must notify unsupported platform");
console.log("14: unsupported platform notified");

setPlatform("darwin");
reset(mac);
await mac.reg.commands.pick.handler("", { ...mac.ctx, hasUI: false });
if (mac.s.wrote !== null) throw new Error("no-ui should not write");
console.log("15: no-ui ok");

setPlatform(realPlatform);
console.log("PASS");
