/**
 * Small inline icons for the header and the home sections.
 *
 * Drawn inline rather than pulled from an icon package: the site needs three glyphs, each
 * is a few paths, and a dependency would ship an entire set for them. Every icon here is
 * decorative — the visible text beside it names the action — so each is hidden from
 * assistive technology and the caller supplies its size and colour through `className`.
 */
export function PhoneIcon({ className = "h-4 w-4 shrink-0" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5.5 3.5h2l1 2.5-1.4 1a9 9 0 0 0 4.9 4.9l1-1.4 2.5 1v2c0 .8-.7 1.5-1.5 1.5A11.5 11.5 0 0 1 4 5c0-.8.7-1.5 1.5-1.5Z" />
    </svg>
  );
}

export function MapPinIcon({ className = "h-4 w-4 shrink-0" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 17s5.5-4.4 5.5-8.5a5.5 5.5 0 0 0-11 0C4.5 12.6 10 17 10 17Z" />
      <circle cx="10" cy="8.5" r="2" />
    </svg>
  );
}

export function ChildChairIcon({ className = "h-5 w-5 shrink-0" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 3.5h8" />
      <path d="M7 3.5V9h6V3.5" />
      <path d="M5 9h10" />
      <path d="M7 9l-2 7.5" />
      <path d="M13 9l2 7.5" />
      <path d="M8 13.5h4" />
    </svg>
  );
}
