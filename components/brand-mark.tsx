export function BrandMark({
  brandColor,
  logoUrl,
  mark,
  letter = false,
}: {
  brandColor: string;
  logoUrl?: string;
  mark: string;
  letter?: boolean;
}) {
  if (logoUrl) {
    return (
      <div className="grid h-8 w-8 place-items-center overflow-hidden rounded-lg" style={{ backgroundColor: brandColor }}>
        {/* Client logos are arbitrary https URLs, so they are not run through the image optimizer. */}
        <img src={logoUrl} alt="" className="h-5 w-5 object-contain" />
      </div>
    );
  }
  if (letter) {
    return (
      <div className="grid h-8 w-8 place-items-center rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: brandColor }}>
        {mark.slice(0, 2)}
      </div>
    );
  }
  return (
    <div className="grid h-8 w-8 place-items-center rounded-lg text-white" style={{ backgroundColor: brandColor }}>
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 20V9l8-5 8 5v11" />
        <path d="M9 20v-6h6v6" />
      </svg>
    </div>
  );
}
