/**
 * Native file/folder picker (macOS / Windows).
 *
 * Opens the OS dialog (AppleScript on macOS, WinForms on Windows) and inserts
 * `@path` references into the editor — handy when a fullscreen terminal makes
 * drag-and-drop awkward.
 *
 *   /pick          command, pick files
 *   /pickdir       command, pick folders
 *   ctrl+shift+o   shortcut, pick files
 *   ctrl+shift+d   shortcut, pick folders
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const applescript = (what: "file" | "folder") =>
	[
		`set fs to choose ${what} with multiple selections allowed`,
		'set out to ""',
		"repeat with f in fs",
		"  set out to out & POSIX path of f & linefeed",
		"end repeat",
		"return out",
	].join("\n");

// WinForms needs STA (powershell.exe defaults to STA); UTF-8 output so
// non-ASCII (Chinese) paths survive the pipe; [char]10 avoids double quotes
// inside the script; exit 1 = user cancelled.
const POWERSHELL_FILES = [
	"[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
	"Add-Type -AssemblyName System.Windows.Forms",
	"$d = New-Object System.Windows.Forms.OpenFileDialog",
	"$d.Multiselect = $true",
	"$d.Title = 'Pick files for pi'",
	"if ($d.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit 1 }",
	"Write-Output ($d.FileNames -join [char]10)",
].join("\n");

// FolderBrowserDialog is single-select — the .NET folder dialog has no
// multi-select; the modern IFileDialog would need inline C# COM interop.
const POWERSHELL_FOLDERS = [
	"[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
	"Add-Type -AssemblyName System.Windows.Forms",
	"$d = New-Object System.Windows.Forms.FolderBrowserDialog",
	"$d.Description = 'Pick a folder for pi'",
	"if ($d.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit 1 }",
	"Write-Output $d.SelectedPath",
].join("\n");

type Kind = "files" | "folders";

/** Pick the right dialog command for this OS; null = unsupported. */
function pickerFor(kind: Kind): { cmd: string; args: string[] } | null {
	if (process.platform === "darwin")
		return { cmd: "osascript", args: ["-e", applescript(kind === "files" ? "file" : "folder")] };
	if (process.platform === "win32")
		return {
			cmd: "powershell",
			args: [
				"-NoProfile",
				"-NonInteractive",
				"-Command",
				kind === "files" ? POWERSHELL_FILES : POWERSHELL_FOLDERS,
			],
		};
	return null;
}

export default function (pi: ExtensionAPI) {
	async function pick(ctx: ExtensionContext, kind: Kind) {
		if (!ctx.hasUI) return;
		const job = pickerFor(kind);
		if (!job) {
			ctx.ui.notify("File picker supports macOS and Windows only", "error");
			return;
		}
		const r = await pi.exec(job.cmd, job.args);
		if (r.code !== 0) return; // user cancelled
		const refs = r.stdout
			.split("\n")
			.map((line) => line.trim()) // PowerShell pipes use CRLF; trim drops \r
			.filter(Boolean)
			.map((p) => (p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p)) // macOS folder dialog adds "/"
			.map((p) => (p.includes(" ") ? `@"${p}"` : `@${p}`));
		if (refs.length === 0) return;
		const current = ctx.ui.getEditorText().trimEnd();
		ctx.ui.setEditorText(current ? `${current} ${refs.join(" ")}` : refs.join(" "));
		// setEditorText only mutates editor state; notify() is what repaints the TUI.
		ctx.ui.notify(`Inserted ${refs.length} ${kind === "files" ? "file" : "folder"} reference(s)`, "info");
	}

	pi.registerCommand("pick", {
		description: "Pick file(s) in a native dialog and insert @path references",
		handler: async (_args, ctx) => pick(ctx, "files"),
	});

	pi.registerCommand("pickdir", {
		description: "Pick folder(s) in a native dialog and insert @path references",
		handler: async (_args, ctx) => pick(ctx, "folders"),
	});

	pi.registerShortcut("ctrl+shift+o", {
		description: "Pick file(s) in a native dialog",
		handler: (ctx) => pick(ctx, "files"),
	});

	pi.registerShortcut("ctrl+shift+d", {
		description: "Pick folder(s) in a native dialog",
		handler: (ctx) => pick(ctx, "folders"),
	});
}
