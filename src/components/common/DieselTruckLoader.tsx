import { cn } from "@/lib/utils";
import { useId } from "react";

export function DieselTruckLoader({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const instanceId = useId().replace(/:/g, "");
  const yellowGradientId = `delivery-yellow-${instanceId}`;
  const windowGradientId = `delivery-window-${instanceId}`;

  return (
    <div
      className={cn(
        "diesel-loader",
        compact ? "diesel-loader--compact" : "diesel-loader--standard",
        className,
      )}
      aria-hidden="true"
    >
      <div className="diesel-loader__scene">
        <div className="diesel-loader__drive">
          <div className="diesel-loader__truck">
            <svg viewBox="0 0 300 122" role="presentation">
              <defs>
                <linearGradient id={yellowGradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#ffe83d" />
                  <stop offset=".58" stopColor="#ffd914" />
                  <stop offset="1" stopColor="#efbb00" />
                </linearGradient>
                <linearGradient id={windowGradientId} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#d9f3ff" />
                  <stop offset="1" stopColor="#547b88" />
                </linearGradient>
              </defs>

              <rect x="24" y="86" width="256" height="12" rx="4" fill="#222936" />

              <rect
                x="116"
                y="19"
                width="161"
                height="73"
                rx="5"
                fill={`url(#${yellowGradientId})`}
              />
              <path d="M116 19h161v17H116z" fill="#d93625" />
              <text
                x="196"
                y="32"
                fill="#fff4b2"
                fontFamily="Arial, sans-serif"
                fontSize="10"
                fontWeight="800"
                textAnchor="middle"
              >
                DOORSTEP DIESEL DELIVERY
              </text>
              <rect x="127" y="43" width="139" height="39" rx="3" fill="#fff3a6" opacity=".38" />
              <image
                href="/atd-logo.png"
                xlinkHref="/atd-logo.png"
                x="145"
                y="49"
                width="105"
                height="27"
                preserveAspectRatio="xMidYMid meet"
              />

              <path
                d="M22 82V68l15-7 17-31h53c8 0 14 6 14 14v49H29c-4 0-7-4-7-11Z"
                fill={`url(#${yellowGradientId})`}
              />
              <path d="M58 37h42v27H45l13-27Z" fill={`url(#${windowGradientId})`} />
              <path d="M85 37h5v27h-5z" fill="#263744" opacity=".55" />
              <path d="M43 67h65v25H34V78l9-11Z" fill="#ffd914" />
              <rect x="92" y="69" width="17" height="4" rx="2" fill="#5c4a20" />
              <path d="M41 78H23v-8l18-6v14Z" fill="#f4c400" />
              <rect x="22" y="75" width="7" height="9" rx="2" fill="#f8f0c1" />
              <rect x="108" y="43" width="7" height="34" rx="2" fill="#c79f00" />
              <path d="M36 86h230v6H36z" fill="#151b25" />

              <g className="diesel-loader__wheel">
                <circle cx="67" cy="94" r="21" fill="#151b25" />
                <circle cx="67" cy="94" r="11" fill="#c2c8cf" />
                <circle cx="67" cy="94" r="3" fill="#4b5563" />
                <path
                  d="M67 84v20M57 94h20M60 87l14 14M74 87l-14 14"
                  stroke="#657182"
                  strokeWidth="2"
                />
              </g>
              <g className="diesel-loader__wheel">
                <circle cx="230" cy="94" r="21" fill="#151b25" />
                <circle cx="230" cy="94" r="11" fill="#c2c8cf" />
                <circle cx="230" cy="94" r="3" fill="#4b5563" />
                <path
                  d="M230 84v20M220 94h20M223 87l14 14M237 87l-14 14"
                  stroke="#657182"
                  strokeWidth="2"
                />
              </g>
            </svg>
          </div>
        </div>
      </div>
      <div className="diesel-loader__road">
        <span className="diesel-loader__lane" />
      </div>
    </div>
  );
}
