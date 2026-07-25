export function Logo({ className = "h-8 w-auto" }: { className?: string }) {
  return (
    <img
      src="/atd-logo.png"
      alt="Anytime Diesel"
      className={`max-w-full object-contain ${className}`}
    />
  );
}
