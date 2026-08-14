export class UnrecognizedLogFormatError extends Error {
  readonly path: string;

  constructor(path: string, detail?: string) {
    const extra = detail ? ` (${detail})` : "";
    super(
      `unrecognized log format, please open an issue: ${path}${extra}`,
    );
    this.name = "UnrecognizedLogFormatError";
    this.path = path;
  }
}
