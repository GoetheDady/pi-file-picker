// Self-check for extensions/file-picker.ts. Run with: npm test
// Fakes the extension API so the pick/insert/quote logic runs without a TUI.

import ext from "../extensions/file-picker.ts";

const reg = { commands: {}, shortcuts: {} };
let execResult = { stdout: "", stderr: "", code: 0, killed: false };
let editorText = "";
let wrote = null;
let notified = [];

const pi = {
	registerCommand: (name, opts) => (reg.commands[name] = opts),
	registerShortcut: (key, opts) => (reg.shortcuts[key] = opts),
	exec: async () => execResult,
};

const ctx = {
	hasUI: true,
	ui: {
		getEditorText: () => editorText,
		setEditorText: (t) => (wrote = t),
		notify: (m) => notified.push(m),
	},
};

ext(pi);

if (!reg.commands.pick) throw new Error("missing /pick command");
if (!reg.shortcuts["ctrl+shift+o"]) throw new Error("missing ctrl+shift+o shortcut");
console.log("registered: /pick, ctrl+shift+o");

const run = () => reg.shortcuts["ctrl+shift+o"].handler(ctx);

// 1. two files, one with a space
execResult = { stdout: "/tmp/a b.txt\n/etc/hosts\n", stderr: "", code: 0, killed: false };
editorText = "";
wrote = null;
notified = [];
await run();
console.log("1:", JSON.stringify(wrote), "| notify:", JSON.stringify(notified));
if (wrote !== '@"/tmp/a b.txt" @/etc/hosts') throw new Error("bad path quoting");
if (notified.length !== 1) throw new Error("must notify once so the TUI repaints");

// 2. appends to existing draft
editorText = "look at these";
wrote = null;
await run();
console.log("2:", JSON.stringify(wrote));
if (wrote !== 'look at these @"/tmp/a b.txt" @/etc/hosts') throw new Error("bad append");

// 3. cancel (osascript exits 1) leaves the editor alone
execResult = { stdout: "", stderr: "execution error: User canceled. (-128)", code: 1, killed: false };
editorText = "keep me";
wrote = null;
notified = [];
await run();
console.log("3:", JSON.stringify(wrote), "| notify:", JSON.stringify(notified));
if (wrote !== null || notified.length !== 0) throw new Error("cancel should not write");

// 4. no UI (print mode) does nothing
execResult = { stdout: "/etc/hosts\n", stderr: "", code: 0, killed: false };
wrote = null;
await reg.commands.pick.handler("", { ...ctx, hasUI: false });
if (wrote !== null) throw new Error("no-ui should not write");
console.log("4: ok");

console.log("PASS");
