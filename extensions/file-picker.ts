/**
 * Native file picker (macOS).
 *
 * Opens the real Finder file dialog and inserts `@path` references into the
 * editor — handy when a fullscreen terminal makes drag-and-drop awkward.
 *
 *   /pick          command
 *   ctrl+shift+o   shortcut
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const SCRIPT = [
	'set fs to choose file with multiple selections allowed',
	'set out to ""',
	'repeat with f in fs',
	"  set out to out & POSIX path of f & linefeed",
	"end repeat",
	"return out",
].join("\n");

export default function (pi: ExtensionAPI) {
	async function pick(ctx: ExtensionContext) {
		if (!ctx.hasUI) return;
		const r = await pi.exec("osascript", ["-e", SCRIPT]);
		if (r.code !== 0) return; // user cancelled
		const refs = r.stdout
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean)
			.map((p) => (p.includes(" ") ? `@"${p}"` : `@${p}`));
		if (refs.length === 0) return;
		const current = ctx.ui.getEditorText().trimEnd();
		ctx.ui.setEditorText(current ? `${current} ${refs.join(" ")}` : refs.join(" "));
		// setEditorText only mutates editor state; notify() is what repaints the TUI.
		ctx.ui.notify(`Inserted ${refs.length} file reference(s)`, "info");
	}

	pi.registerCommand("pick", {
		description: "Pick file(s) in a native dialog and insert @path references",
		handler: async (_args, ctx) => pick(ctx),
	});

	pi.registerShortcut("ctrl+shift+o", {
		description: "Pick file(s) in a native dialog",
		handler: (ctx) => pick(ctx),
	});
}
