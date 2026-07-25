import { cn } from "@/lib/utils";

export function DieselTruckLoader({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "diesel-loader",
        compact ? "diesel-loader--compact" : "diesel-loader--standard",
        className,
      )}
      aria-hidden="true"
    >
      <div className="diesel-loader__sky">
        <span className="diesel-loader__cloud diesel-loader__cloud--one" />
        <span className="diesel-loader__cloud diesel-loader__cloud--two" />
        <div className="diesel-loader__truck">
          <svg viewBox="0 0 220 104" role="presentation">
            <path
              d="M18 67h118V23H51C35 23 23 35 23 51v16Z"
              fill="currentColor"
              className="text-primary"
            />
            <path d="M136 39h37l28 27v16h-65V39Z" fill="currentColor" className="text-primary/90" />
            <path d="M151 45h18l17 18h-35V45Z" fill="#dff3ff" />
            <path d="M29 32h101v29H29V32Z" fill="#fff" opacity=".13" />
            <path
              d="M42 43h71"
              fill="none"
              stroke="#fff"
              strokeLinecap="round"
              strokeWidth="4"
              opacity=".82"
            />
            <text
              x="77"
              y="57"
              fill="#fff"
              fontFamily="Arial, sans-serif"
              fontSize="12"
              fontWeight="700"
              textAnchor="middle"
            >
              DIESEL DELIVERY
            </text>
            <path d="M8 70h199v12H8z" fill="#273142" />
            <path d="M176 69h26v7h-26z" fill="#ffb21c" />
            <g className="diesel-loader__wheel">
              <circle cx="53" cy="82" r="17" fill="#17202d" />
              <circle cx="53" cy="82" r="8" fill="#c9d2dc" />
              <path d="M53 74v16M45 82h16" stroke="#657182" strokeWidth="2" />
            </g>
            <g className="diesel-loader__wheel">
              <circle cx="169" cy="82" r="17" fill="#17202d" />
              <circle cx="169" cy="82" r="8" fill="#c9d2dc" />
              <path d="M169 74v16M161 82h16" stroke="#657182" strokeWidth="2" />
            </g>
            <circle cx="204" cy="72" r="3" fill="#ffe46b" />
          </svg>
        </div>
      </div>
      <div className="diesel-loader__road">
        <span className="diesel-loader__lane" />
      </div>
    </div>
  );
}
