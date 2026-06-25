"use client";

import { Download, Check, Smartphone, Tv } from "lucide-react";
import * as React from "react";

interface DownloadButtonProps {
  href: string;
  sizeMb: number;
  version: string;
  label?: string;
  downloadName?: string;
  variant?: "primary" | "secondary";
  icon?: "download" | "phone" | "tv";
}

const ICONS = { download: Download, phone: Smartphone, tv: Tv } as const;

export function DownloadButton({
  href,
  sizeMb,
  version,
  label = "Скачать APK",
  downloadName = "sapkefly.apk",
  variant = "primary",
  icon = "download",
}: DownloadButtonProps) {
  const Icon = ICONS[icon];
  const [clicked, setClicked] = React.useState(false);

  const onClick = () => {
    setClicked(true);
    setTimeout(() => setClicked(false), 3000);
  };

  const base =
    "group relative inline-flex items-center gap-3 h-14 px-7 rounded-full text-[15px] font-bold transition-all hover:scale-[1.02] active:scale-[0.98]";
  const styles =
    variant === "primary"
      ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-2xl shadow-primary/30 hover:shadow-primary/40"
      : "bg-foreground/[0.06] text-foreground ring-1 ring-primary/30 hover:bg-foreground/[0.10]";

  return (
    <a
      href={href}
      download={downloadName}
      onClick={onClick}
      className={`${base} ${styles}`}
    >
      {clicked ? (
        <Check size={20} className="animate-in zoom-in duration-200" />
      ) : (
        <Icon size={20} className="group-hover:translate-y-0.5 transition-transform" />
      )}
      <span>{clicked ? "Скачивание началось…" : label}</span>
      <span
        className={`hidden sm:inline-block text-[11px] font-semibold opacity-70 px-2 py-0.5 rounded-full ${
          variant === "primary" ? "bg-primary-foreground/15" : "bg-foreground/10"
        }`}
      >
        v{version}
      </span>
    </a>
  );
}
