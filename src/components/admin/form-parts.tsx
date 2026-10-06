"use client";

import type { ActionResult } from "@/lib/action-result";

/**
 * The two pieces every owner form needs: a busy button and a result message.
 *
 * Shared rather than copy-pasted into each form, because the details that matter here are
 * easy to get subtly wrong in twenty places and impossible to review: the busy state has to
 * disable the control that started the work, the message has to be announced rather than
 * silently swapped in, and a failure must never look like a success.
 */

/**
 * A submit button that shows its own progress.
 *
 * The label changes to an ellipsis while the action runs and the button is disabled, so a
 * second tap cannot start the same write twice. Two overlapping saves of the same row would
 * mean the second one refused as stale, which reads to the owner as an unexplained failure.
 */
export function SubmitButton({
  children,
  pending,
  busyLabel = "Enregistrement…",
  className,
  testId,
  tone = "primary",
}: {
  children: React.ReactNode;
  pending: boolean;
  busyLabel?: string;
  className?: string;
  testId?: string;
  tone?: "primary" | "quiet" | "danger";
}) {
  const tones = {
    primary: "bg-marine text-on-ocean hover:bg-ocean",
    quiet: "border border-line-strong text-marine hover:bg-sand",
    danger: "border border-danger text-danger hover:bg-danger/10",
  } as const;

  return (
    <button
      type="submit"
      data-testid={testId}
      data-pending={pending ? "true" : "false"}
      aria-busy={pending}
      disabled={pending}
      className={[
        "rounded px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        tones[tone],
        className ?? "",
      ].join(" ")}
    >
      {pending ? busyLabel : children}
    </button>
  );
}

/**
 * The outcome of the last save.
 *
 * `role="status"` with `aria-live="polite"` so the message is announced when it appears, and
 * the wrapper keeps a fixed height so a result does not shove the form around on a phone.
 */
export function ActionMessage({ result }: { result: ActionResult | null }) {
  return (
    <div aria-live="polite" className="min-h-6">
      {result ? (
        <p
          data-testid="action-message"
          data-ok={result.ok ? "true" : "false"}
          className={result.ok ? "text-sm text-ok" : "text-sm text-danger"}
        >
          {result.message}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A labelled block with its hint text.
 *
 * `aria-describedby` is wired to the hint, so the explanation is read with the field rather
 * than being decoration next to it.
 */
export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-semibold">
        {label}
      </label>
      {hint ? (
        <p id={`${htmlFor}-hint`} className="mt-0.5 text-xs text-ink-soft">
          {hint}
        </p>
      ) : null}
      <div className="mt-1">{children}</div>
    </div>
  );
}

/** Input classes shared by every owner form, so the fields look like one product. */
export const inputClass =
  "w-full rounded border border-line bg-white px-3 py-2 text-sm disabled:opacity-60";

export const textareaClass = `${inputClass} min-h-20 resize-y`;

/**
 * A checkbox that reads as a switch.
 *
 * A real checkbox with a label, not a `div` pretending to be one: it has to work with a
 * keyboard, be announced, and be findable by a screen reader, none of which a styled `div`
 * manages on its own.
 */
export function ToggleField({
  id,
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="mt-1 h-5 w-5 shrink-0 rounded border-line-strong"
      />
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm font-semibold">
          {label}
        </label>
        {hint ? (
          <p id={`${id}-hint`} className="mt-0.5 text-xs text-ink-soft">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}