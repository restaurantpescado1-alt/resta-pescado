/**
 * A masked terminal prompt for reading a password in scripts.
 *
 * The password for `scripts/provision-owner.ts` must never appear in a command
 * line (it would land in shell history and in `ps` output), in `.dev.vars`
 * (the file lives inside the project directory, which is synced and backed up),
 * or in any printed output. The only acceptable place to read it is a terminal
 * that the operator is sitting at, with the characters hidden as they are typed.
 *
 * The reader puts the terminal into raw mode itself rather than using
 * `readline`, because `readline`'s mute trick depends on private fields that
 * differ between Node versions. Raw mode with explicit echo of `*` is a public
 * API and behaves the same everywhere.
 *
 * Every function takes its streams as arguments so the unit suite can drive
 * them with fakes: no test ever needs a real TTY, and no test ever types a real
 * password into a real terminal.
 */

/** The streams a prompt reads from and writes to. */
export interface PromptIO {
  input: NodeJS.ReadStream;
  output: NodeJS.WriteStream;
}

/** `process.stdin`/`process.stdout` when there is a terminal attached. */
export function defaultPromptIO(): PromptIO {
  return { input: process.stdin, output: process.stdout };
}

/**
 * True only when both streams are a terminal and raw mode is available.
 *
 * The `setRawMode` check is a runtime check, not a type check: a piped
 * `process.stdin` is typed as a `ReadStream` but is a socket in practice,
 * with no `setRawMode` on it at all.
 */
export function isInteractiveTerminal(io: PromptIO): boolean {
  return Boolean(io.input.isTTY && io.output.isTTY && typeof io.input.setRawMode === "function");
}

/** Raised for any reason a password cannot be read or was not confirmed. */
export class PasswordPromptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PasswordPromptError";
  }
}

/**
 * Fails unless there is a terminal to prompt on.
 *
 * Checked before any remote call so a non-interactive `--apply` stops locally,
 * without touching a database it could never write to anyway.
 */
export function assertInteractiveTerminal(io: PromptIO): void {
  if (!isInteractiveTerminal(io)) {
    throw new PasswordPromptError(
      [
        "This session has no interactive terminal, so a password cannot be read.",
        "Run the command from a terminal. Passwords are never accepted from",
        "arguments, environment variables, or files.",
      ].join(" "),
    );
  }
}

/**
 * Reads one line without echoing it, showing `*` per character instead.
 *
 * Handles backspace, ignores other control characters, accepts pasted input,
 * and treats Ctrl+C as a cancellation. The terminal's previous raw-mode state
 * is restored on every exit path.
 */
export function readHiddenLine(question: string, io: PromptIO): Promise<string> {
  if (!isInteractiveTerminal(io)) {
    return Promise.reject(
      new PasswordPromptError(
        "This session has no interactive terminal, so a password cannot be read. " +
          "Run the command from a terminal; passwords are never accepted from arguments, environment variables, or files.",
      ),
    );
  }

  const input = io.input;
  const wasRaw = input.isRaw;

  io.output.write(question);
  input.setRawMode(true);
  input.resume();
  input.setEncoding("utf8");

  return new Promise<string>((resolve, reject) => {
    let buffer = "";
    let settled = false;

    const cleanup = () => {
      input.removeListener("data", onData);
      input.removeListener("close", onClose);
      input.removeListener("end", onClose);
      input.setRawMode(wasRaw);
      input.pause();
    };

    const finish = (action: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      action();
    };

    const onClose = () =>
      finish(() => reject(new PasswordPromptError("Terminal input closed before a password was read.")));

    const onData = (chunk: string | Buffer) => {
      const text = typeof chunk === "string" ? chunk : String(chunk);
      for (const char of text) {
        if (settled) {
          return;
        }
        if (char === "\r" || char === "\n") {
          io.output.write("\n");
          finish(() => resolve(buffer));
          return;
        }
        if (char === "\u0003") {
          io.output.write("\n");
          finish(() => reject(new PasswordPromptError("Cancelled; no password was read.")));
          return;
        }
        if (char === "\u007f" || char === "\b") {
          if (buffer.length > 0) {
            buffer = buffer.slice(0, -1);
            io.output.write("\b \b");
          }
          continue;
        }
        if (char < " ") {
          continue;
        }
        buffer += char;
        io.output.write("*");
      }
    };

    input.on("data", onData);
    input.on("close", onClose);
    input.on("end", onClose);
  });
}

/** How many times a mismatched confirmation is retried before giving up. */
export const PASSWORD_PROMPT_ATTEMPTS = 3;

/**
 * Reads a new password twice and returns it only when the two entries match.
 *
 * The confirmation exists because a raw-mode prompt shows nothing of what was
 * typed: a typo would otherwise be provisioned silently. After
 * `PASSWORD_PROMPT_ATTEMPTS` mismatches it fails instead of looping forever,
 * and the caller has written nothing at that point.
 */
export async function promptForNewPassword(io: PromptIO = defaultPromptIO()): Promise<string> {
  assertInteractiveTerminal(io);

  for (let attempt = 1; attempt <= PASSWORD_PROMPT_ATTEMPTS; attempt += 1) {
    const password = await readHiddenLine("Password: ", io);
    const confirmation = await readHiddenLine("Confirm password: ", io);

    if (password === confirmation) {
      return password;
    }

    const hint = attempt < PASSWORD_PROMPT_ATTEMPTS ? " Try again." : "";
    io.output.write(`Passwords do not match.${hint}\n`);
  }

  throw new PasswordPromptError(
    `The password confirmation did not match ${PASSWORD_PROMPT_ATTEMPTS} times. Nothing was written.`,
  );
}
