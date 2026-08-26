type CommunityStampProps = {
  logo?: string;
  name?: string;
  className?: string;
};

export function CommunityStamp({ logo, name, className = "" }: CommunityStampProps) {
  if (!logo) return null;

  const label = name ? `${name} community stamp` : "Community stamp";

  return (
    <span
      role="img"
      aria-label={label}
      title={name}
      data-community-stamp
      className={`pointer-events-none inline-flex h-[72px] w-[64px] rotate-[4deg] select-none flex-col items-center justify-center overflow-hidden rounded-[5px] bg-[#f7f0e3] px-2 pb-1.5 pt-2 text-black shadow-[0_5px_14px_rgba(0,0,0,.28)] ring-1 ring-inset ring-black/25 transition-transform duration-300 ease-out group-hover:rotate-0 group-hover:scale-[1.04] motion-reduce:transition-none ${className}`}
    >
      <span aria-hidden className="absolute inset-[4px] rounded-[2px] border border-dashed border-black/35" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logo} alt="" className="relative z-10 size-10 object-contain drop-shadow-sm" />
      {name ? (
        <span className="relative z-10 mt-1 max-w-full truncate text-[7px] font-extrabold uppercase tracking-[.12em] text-black/65">
          {name}
        </span>
      ) : null}
    </span>
  );
}
