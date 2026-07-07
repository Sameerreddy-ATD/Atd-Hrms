import logoAsset from "@/assets/logo.png.asset.json";

export function Logo({ className = "h-8 w-auto" }: { className?: string }) {
  return <img src={logoAsset.url} alt="Anytime Diesel" className={className} />;
}