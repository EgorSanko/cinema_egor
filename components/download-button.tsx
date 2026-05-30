"use client";

import { Download, Check } from "lucide-react";
import * as React from "react";

interface DownloadButtonProps {
  href: string;
  sizeMb: number;
  version: string;
}

export function DownloadButton({ href, sizeMb, version }: DownloadButtonProps) {
  const [clicked, setClicked] = React.useState(false);

  const onClick = () => {
    setClicked(true);
    setTimeout(() => setClicked(false), 3000);
  };

  return (
    <a
      href={href}
      download="sapkefly.apk"
      onClick={onClick}
      className="group relative inline-flex items-center gap-3 h-14 px-7 rounded-full bg-primary text-primary-foreground text-[15px] font-bold hover:bg-primary/90 transition-all shadow-2xl shadow-primary/30 hover:shadow-primary/40 hover:scale-[1.02] active:scale-[0.98]"
    >
      {clicked ? <Check size={20} className="animate-in zoom-in duration-200" /> : <Download size={20} className="group-hover:translate-y-0.5 transition-transform" />}
      <span>{clicked ? "Скачивание началось…" : "Скачать APK"}</span>
      <span className="hidden sm:inline-block text-[11px] font-semibold opacity-70 px-2 py-0.5 rounded-full bg-primary-foreground/15">
        v{version}
      </span>
    </a>
  );
}
