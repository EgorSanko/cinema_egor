
import { useEffect, useRef } from "react";

/**
 * Branded, decorative QR code (kozakdenys/qr-code-styling) — rounded dots with a
 * dark→emerald gradient, lime brand corners, and the SAPKEFLY logo in the middle,
 * sitting on a white rounded card so a phone camera reads it reliably even off a
 * TV screen. Used by the QR-login flow (TV + website) and reusable anywhere.
 *
 * qr-code-styling touches the DOM, so it's created client-side only (dynamic
 * import inside the effect keeps it out of the SSR/standalone server bundle).
 */
export function StyledQR({
  value,
  size = 260,
  logo = "/logo-192.png",
  className,
}: {
  value: string;
  size?: number;
  logo?: string | null;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Keep the instance across renders so we can `update()` instead of rebuilding.
  const qrRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const QRCodeStyling = (await import("qr-code-styling")).default;
      if (cancelled || !ref.current) return;

      const options: any = {
        width: size,
        height: size,
        type: "svg",
        data: value,
        margin: 8,
        qrOptions: { errorCorrectionLevel: "H" }, // H → survives the center logo
        dotsOptions: {
          type: "rounded",
          gradient: {
            type: "linear",
            rotation: Math.PI / 4,
            colorStops: [
              { offset: 0, color: "#0b0b12" },
              { offset: 1, color: "#14532d" },
            ],
          },
        },
        cornersSquareOptions: { type: "extra-rounded", color: "#a3e635" },
        cornersDotOptions: { type: "dot", color: "#16a34a" },
        backgroundOptions: { color: "#ffffff" },
        ...(logo
          ? {
              image: logo,
              imageOptions: {
                crossOrigin: "anonymous",
                margin: 6,
                imageSize: 0.34,
                hideBackgroundDots: true,
              },
            }
          : {}),
      };

      if (!qrRef.current) {
        qrRef.current = new QRCodeStyling(options);
        ref.current.innerHTML = "";
        qrRef.current.append(ref.current);
      } else {
        qrRef.current.update(options);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [value, size, logo]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: 20,
        overflow: "hidden",
        background: "#fff",
        boxShadow: "0 10px 40px -8px rgba(0,0,0,0.55)",
      }}
      aria-label="QR-код для входа"
    />
  );
}
