"use client";

import * as React from "react";

interface DownloadQRProps {
  url: string;
}

// Generates QR via Google Charts API (no client-side dep, no API key).
// Background: transparent, foreground: dark navy for contrast on light QR bg.
export function DownloadQR({ url }: DownloadQRProps) {
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=4&data=${encodeURIComponent(url)}`;
  return (
    <div className="flex-shrink-0 p-2 rounded-2xl bg-white ring-1 ring-white/15 shadow-xl shadow-black/30">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qrSrc} alt="QR-код для скачивания на телефон" width={140} height={140} className="block" />
    </div>
  );
}
