import { PassThrough } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import {
  PASSWORD_PROMPT_ATTEMPTS,
  PasswordPromptError,
  assertInteractiveTerminal,
  isInteractiveTerminal,
  promptForNewPassword,
  readHiddenLine,
  type PromptIO,
} from "../../scripts/prompt-password";

/**
 * The prompt is where the password enters the process, so these tests pin the
 * three properties that matter: nothing is echoed but `*`, a mismatched
 * confirmation never becomes the password, and a session without a terminal is
 * refused rather than silently reading a piped value.
 *
 * The streams are fakes on purpose — no test needs a real TTY, and no test
 * types a password into a real terminal.
 */

interface FakeTerminal {
  io: PromptIO;
  input: PassThrough;
  written(): string;
  setRawMode: ReturnType<typeof vi.fn>;
}

function fakeTerminal(options: { inputTty?: boolean; outputTty?: boolean } = {}): FakeTerminal {
  const input = new PassThrough();
  const state = input as PassThrough & { isTTY?: boolean; isRaw?: boolean; setRawMode?: unknown };
  state.isTTY = options.inputTty ?? true;
  state.isRaw = false;
  const setRawMode = vi.fn((mode: boolean) => {
    state.isRaw = mode;
    return input;
  });
  state.setRawMode = setRawMode;

  let written = "";
  const output = {
    isTTY: options.outputTty ?? true,
    write: (chunk: string) => {
      written += chunk;
      return true;
    },
  } as unknown as NodeJS.WriteStream;

  return { io: { input: input as unknown as NodeJS.ReadStream, output }, input, written: () => written, setRawMode };
}

/** Lets the prompt's second read attach its listeners before the next line. */
function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe("readHiddenLine", () => {
  it("returns the typed line and echoes only asterisks", async () => {
    const terminal = fakeTerminal();
    const pending = readHiddenLine("Password: ", terminal.io);
    terminal.input.write("hunter2\r");

    await expect(pending).resolves.toBe("hunter2");
    // One `*` per character, the prompt, and the newline that ends the line —
    // never a letter.
    expect(terminal.written()).toBe("Password: *******\n");
    expect(terminal.written()).not.toContain("hunter2");
  });

  it("supports backspace without echoing the character", async () => {
    const terminal = fakeTerminal();
    const pending = readHiddenLine("Password: ", terminal.io);
    terminal.input.write("abcd\be\r");

    await expect(pending).resolves.toBe("abce");
    // Prompt, four asterisks, one erase, one more asterisk, then the newline —
    // never a letter.
    expect(terminal.written()).toBe("Password: ****\b \b*\n");
  });

  it("treats Ctrl+C as a cancellation", async () => {
    const terminal = fakeTerminal();
    // Handled here so the rejection can never surface as an unhandled promise
    // rejection between the write above and the assertions below.
    const outcome = readHiddenLine("Password: ", terminal.io)
      .then(() => null)
      .catch((error: unknown) => error as Error);
    terminal.input.write("ab\u0003");

    const error = await outcome;
    expect(error).toBeInstanceOf(PasswordPromptError);
    expect((error as Error).message).toMatch(/Cancelled/);
    expect(terminal.written()).not.toContain("ab");
  });

  it("restores the terminal's raw-mode state afterwards", async () => {
    const terminal = fakeTerminal();
    const pending = readHiddenLine("Password: ", terminal.io);
    terminal.input.write("x\r");
    await pending;

    expect(terminal.setRawMode).toHaveBeenLastCalledWith(false);
  });

  it("refuses a stream that is not a terminal", async () => {
    const terminal = fakeTerminal({ inputTty: false });

    await expect(readHiddenLine("Password: ", terminal.io)).rejects.toThrow(
      /no interactive terminal/,
    );
    expect(terminal.written()).toBe("");
    expect(isInteractiveTerminal(terminal.io)).toBe(false);
    expect(() => assertInteractiveTerminal(terminal.io)).toThrow(PasswordPromptError);
  });
});

describe("promptForNewPassword", () => {
  it("asks twice, accepts a match, and never echoes the password", async () => {
    const terminal = fakeTerminal();
    const pending = promptForNewPassword(terminal.io);
    terminal.input.write("correct horse battery\r");
    await flush();
    terminal.input.write("correct horse battery\r");

    await expect(pending).resolves.toBe("correct horse battery");
    expect(terminal.written()).toContain("Password: ");
    expect(terminal.written()).toContain("Confirm password: ");
    expect(terminal.written()).not.toContain("correct horse battery");
    expect(terminal.written()).toContain("*");
  });

  it("reports a mismatch and accepts the password on the next attempt", async () => {
    const terminal = fakeTerminal();
    const pending = promptForNewPassword(terminal.io);

    terminal.input.write("first-attempt-x\r");
    await flush();
    terminal.input.write("second-attempt-y\r");
    await flush();
    expect(terminal.written()).toContain("Passwords do not match. Try again.");

    terminal.input.write("agreed-upon-pass\r");
    await flush();
    terminal.input.write("agreed-upon-pass\r");

    await expect(pending).resolves.toBe("agreed-upon-pass");
  });

  it(`gives up after ${PASSWORD_PROMPT_ATTEMPTS} mismatches`, async () => {
    const terminal = fakeTerminal();
    // Attach the handler immediately; the rejection lands in a microtask that
    // runs before the final `flush()` resolves, so awaiting `.rejects` here
    // would let Node see it as unhandled in between.
    const outcome = promptForNewPassword(terminal.io)
      .then(() => null)
      .catch((error: unknown) => error as Error);

    for (let attempt = 0; attempt < PASSWORD_PROMPT_ATTEMPTS; attempt += 1) {
      terminal.input.write(`left-${attempt}\r`);
      await flush();
      terminal.input.write(`right-${attempt}\r`);
      await flush();
    }

    const error = await outcome;
    expect(error).toBeInstanceOf(PasswordPromptError);
    expect((error as Error).message).toMatch(/did not match 3 times/);
    expect(terminal.written()).not.toContain("left-0");
    expect(terminal.written()).not.toContain("right-0");
  });

  it("refuses to start without a terminal", async () => {
    const terminal = fakeTerminal({ outputTty: false });

    await expect(promptForNewPassword(terminal.io)).rejects.toThrow(/no interactive terminal/);
    expect(terminal.written()).toBe("");
  });
});
