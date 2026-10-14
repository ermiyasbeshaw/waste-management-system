/**
 * A photo slot for the public home page. The image comes from `public/home/<name>`; when the file is not there
 * yet, the dark gradient underneath shows instead of a broken image. Photos only (no video), decorative text in
 * `label` for screen readers.
 */
export function Photo({
  src,
  label,
  className = "",
  children,
}: {
  src: string;
  label: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      role="img"
      aria-label={label}
      className={`relative overflow-hidden bg-cover bg-center ${className}`}
      style={{
        backgroundImage: `url(${src}), linear-gradient(135deg, #0f2a22 0%, #111116 55%, #0b1d17 100%)`,
      }}
    >
      {children}
    </div>
  );
}
