/** The CORE ring has six subtle star points, with one pointing straight up. */
export function CoreSymbol({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className}
      width="64"
      height="64"
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="miter"
    >
      <path d="M32 2Q47.51 5.137 57.981 17Q63.019 32 57.981 47Q47.51 58.863 32 62Q16.49 58.863 6.019 47Q.981 32 6.019 17Q16.49 5.137 32 2Z" />
      <path d="M32 2v60M6.019 17l51.962 30M6.019 47l51.962-30" />
    </svg>
  );
}
