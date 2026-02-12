"use client";

import { useState, useEffect } from "react";
import { X, AlertTriangle } from "lucide-react";

export function ImageFixBanner() {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if already dismissed
    

    // Test if TMDB images load
    const img = new Image();
    img.onload = () => setShow(false);
    img.onerror = () => setShow(true);
    img.src = "https://image.tmdb.org/t/p/w92/wwemzKWzjKYJFfCeiB57q3r4Bcm.png";

    const timeout = setTimeout(() => {
      if (!img.complete || img.naturalWidth === 0) setShow(true);
    }, 5000);

    return () => clearTimeout(timeout);
  }, []);

  const dismiss = () => {
    setDismissed(true);
    setShow(false);
    
  };

  if (!show || dismissed) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-[9998] md:bottom-6 md:left-auto md:right-6 md:max-w-md animate-in slide-in-from-bottom-4">
      <div className="bg-gray-900/95 backdrop-blur-lg border border-amber-500/30 rounded-2xl p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="bg-amber-500/20 rounded-full p-2 shrink-0 mt-0.5">
            <AlertTriangle size={18} className="text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm">Не загружаются постеры?</p>
            <p className="text-gray-400 text-xs mt-1 leading-relaxed">
              Ваш провайдер блокирует сервер картинок. Установите бесплатное приложение для решения проблемы:
            </p>
            <div className="flex gap-2 mt-3">
              <a href="https://apps.apple.com/app/id1423538627" target="_blank" rel="noopener noreferrer"
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors">
                iPhone
              </a>
              <a href="https://play.google.com/store/apps/details?id=com.cloudflare.onedotonedotonedotone" target="_blank" rel="noopener noreferrer"
                className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-medium rounded-lg transition-colors">
                Android
              </a>
              <a href="https://xbox-dns.ru/#setup" target="_blank" rel="noopener noreferrer"
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-medium rounded-lg transition-colors">
                Инструкция
              </a>
            </div>
          </div>
          <button onClick={dismiss} className="text-gray-500 hover:text-gray-300 shrink-0">
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

