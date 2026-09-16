/**
 * Native file/folder picker (macOS / Windows).
 *
 * Opens the OS dialog (AppleScript on macOS, WinForms on Windows) and inserts
 * `@path` references into the editor — handy when a fullscreen terminal makes
 * drag-and-drop awkward.
 *
 *   /pick          command, pick files
 *   /pickdir       command, pick folders
 *   ctrl+shift+e   shortcut, pick files
 *   ctrl+shift+d   shortcut, pick folders (macOS)
 *   ctrl+shift+r   shortcut, pick folders (Windows — see below)
 *
 * Shortcuts avoid pi's own bindings (ctrl+shift+o is "tree filter: cycle
 * backward", ctrl+shift+f is transcript search) and the terminal's: on
 * Windows, Windows Terminal owns ctrl+shift+d (duplicate tab) among others,
 * so folders sit on ctrl+shift+r there.
 */

import { posix, win32 } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

type Kind = "files" | "folders";

/** Escape a path for an AppleScript string literal. */
const forAppleScript = (s: string) => s.replaceAll("\\", "\\\\").replaceAll('"', '\\"');

/** Escape a path for a PowerShell single-quoted string literal. */
const forPowerShell = (s: string) => s.replaceAll("'", "''");

const applescript = (what: "file" | "folder", cwd: string) =>
	[
		`set fs to choose ${what} with prompt "Pick ${what}s for pi" default location (POSIX file "${forAppleScript(cwd)}") with multiple selections allowed`,
		'set out to ""',
		"repeat with f in fs",
		"  set out to out & POSIX path of f & linefeed",
		"end repeat",
		"return out",
	].join("\n");

// WinForms needs STA (powershell.exe defaults to STA); UTF-8 output so
// non-ASCII (Chinese) paths survive the pipe; [char]10 avoids double quotes
// inside the script; exit 1 = user cancelled.
const powershellFiles = (cwd: string) =>
	[
		"[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
		"Add-Type -AssemblyName System.Windows.Forms",
		"$d = New-Object System.Windows.Forms.OpenFileDialog",
		"$d.Multiselect = $true",
		"$d.Title = 'Pick files for pi'",
		`$d.InitialDirectory = '${forPowerShell(cwd)}'`,
		"if ($d.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit 1 }",
		"Write-Output ($d.FileNames -join [char]10)",
	].join("\n");

// FolderBrowserDialog is single-select — the .NET folder dialog has no
// multi-select; the modern IFileDialog would need inline C# COM interop.
const powershellFolders = (cwd: string) =>
	[
		"[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
		"Add-Type -AssemblyName System.Windows.Forms",
		"$d = New-Object System.Windows.Forms.FolderBrowserDialog",
		"$d.Description = 'Pick a folder for pi'",
		`$d.SelectedPath = '${forPowerShell(cwd)}'`,
		"if ($d.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit 1 }",
		"Write-Output $d.SelectedPath",
	].join("\n");

/** Pick the right dialog command for this OS; null = unsupported. */
function pickerFor(kind: Kind, cwd: string): { cmd: string; args: string[] } | null {
	if (process.platform === "darwin")
		return { cmd: "osascript", args: ["-e", applescript(kind === "files" ? "file" : "folder", cwd)] };
	if (process.platform === "win32")
		return {
			cmd: "powershell",
			args: [
				"-NoProfile",
				"-NonInteractive",
				"-Command",
				kind === "files" ? powershellFiles(cwd) : powershellFolders(cwd),
			],
		};
	return null;
}

/**
 * Render absolute paths as `@` references: relative to the cwd when the file
 * lives inside it (matching pi's own `@` completion), absolute otherwise.
 * Paths with spaces get the `@"a b"` form; a path containing `"` cannot be
 * quoted at all — pi has no escape convention — so it goes in raw and the
 * caller warns about it.
 */
function toRefs(paths: string[], cwd: string) {
	// Explicit posix/win32 instead of the default: node:path binds to the real
	// platform, which would make the Windows branch untestable from macOS CI.
	const api = process.platform === "win32" ? win32 : posix;
	const unquotable: string[] = [];
	const refs = paths.map((absolute) => {
		const rel = api.relative(cwd, absolute);
		const shown = rel && !rel.startsWith("..") ? rel : absolute;
		if (!shown.includes(" ") || shown.includes('"')) {
			if (shown.includes(" ") && shown.includes('"')) unquotable.push(shown);
			return `@${shown}`;
		}
		return `@"${shown}"`;
	});
	return { refs, unquotable };
}

export default function (pi: ExtensionAPI) {
	async function pick(ctx: ExtensionContext, kind: Kind) {
		if (!ctx.hasUI) return;
		const job = pickerFor(kind, ctx.cwd);
		if (!job) {
			ctx.ui.notify("File picker supports macOS and Windows only", "error");
			return;
		}
		const r = await pi.exec(job.cmd, job.args);
		if (r.code !== 0) {
			// Cancel is silent: macOS reports AppleScript error -128 (localised, so
			// match the code — "User canceled" / "用户取消"), the Windows script exits
			// 1 with no output. Anything else is a real failure (no GUI session,
			// permissions, missing WinForms) and must not be swallowed.
			const stderr = r.stderr.trim();
			const cancelled = stderr === "" || /-128\b/.test(stderr) || /user cancel/i.test(stderr);
			if (!cancelled) {
				ctx.ui.notify(`File picker failed: ${stderr.split("\n")[0]}`, "error");
			}
			return;
		}
		const picked = r.stdout
			.split("\n")
			.map((line) => line.trim()) // PowerShell pipes use CRLF; trim drops \r
			.filter(Boolean)
			.map((p) => (p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p)); // macOS folder dialog adds "/"
		if (picked.length === 0) return;

		const { refs, unquotable } = toRefs(picked, ctx.cwd);
		const current = ctx.ui.getEditorText().trimEnd();
		ctx.ui.setEditorText(current ? `${current} ${refs.join(" ")}` : refs.join(" "));
		// setEditorText only mutates editor state; notify() is what repaints the TUI.
		ctx.ui.notify(`Inserted ${refs.length} ${kind === "files" ? "file" : "folder"} reference(s)`, "info");
		if (unquotable.length > 0) {
			ctx.ui.notify(
				`${unquotable.length} path(s) contain both a space and a quote, which @ references cannot express — fix manually: ${unquotable[0]}`,
				"warning",
			);
		}
	}

	pi.registerCommand("pick", {
		description: "Pick file(s) in a native dialog and insert @path references",
		handler: async (_args, ctx) => pick(ctx, "files"),
	});

	pi.registerCommand("pickdir", {
		description: "Pick folder(s) in a native dialog and insert @path references",
		handler: async (_args, ctx) => pick(ctx, "folders"),
	});

	// Windows Terminal swallows ctrl+shift+d (duplicate tab); ctrl+shift+e is
	// free on both platforms. Resolved at registration so tests can stub the OS.
	const keys =
		process.platform === "win32"
			? ({ files: "ctrl+shift+e", folders: "ctrl+shift+r" } as const)
			: ({ files: "ctrl+shift+e", folders: "ctrl+shift+d" } as const);

	pi.registerShortcut(keys.files, {
		description: "Pick file(s) in a native dialog",
		handler: (ctx) => pick(ctx, "files"),
	});

	pi.registerShortcut(keys.folders, {
		description: "Pick folder(s) in a native dialog",
		handler: (ctx) => pick(ctx, "folders"),
	});
}
