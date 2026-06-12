export type Direction = "S" | "C" | "!";

export interface TranscriptEntry {
	at: number;
	dir: Direction;
	data: string;
}

function printable(data: string): string {
	return data
		.replace(/\\/g, "\\\\")
		.replace(/\r/g, "\\r")
		.replace(/\n/g, "\\n")
		// eslint-disable-next-line no-control-regex
		.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, (c) => {
			return `\\x${c.charCodeAt(0).toString(16).padStart(2, "0")}`;
		});
}

export class Transcript {
	private entries: TranscriptEntry[] = [];
	private epoch = Date.now();

	public record(dir: Direction, data: Buffer | string): void {
		this.entries.push({
			at: Date.now() - this.epoch,
			dir,
			data: typeof data === "string" ? data : data.toString("latin1"),
		});
	}

	public format(): string {
		if (!this.entries.length) return "(empty transcript)";
		return this.entries
			.map((e) => `[+${e.at}ms] ${e.dir}: ${printable(e.data)}`)
			.join("\n");
	}

	/** Returns only the client-direction (`C:`) entries, formatted the same way as format(). */
	public clientLines(): string {
		const lines = this.entries
			.filter((e) => e.dir === "C")
			.map((e) => `[+${e.at}ms] C: ${printable(e.data)}`);
		return lines.join("\n");
	}
}
