"use client";

import { Heart } from "lucide-react";
import { useState, useEffect } from "react";
import { isFavorite, toggleFavorite, type FavoriteItem } from "@/lib/storage";

interface FavoriteButtonProps {
  item: FavoriteItem;
  className?: string;
  size?: "sm" | "md";
}

export function FavoriteButton({ item, className = "", size = "sm" }: FavoriteButtonProps) {
  const [fav, setFav] = useState(false);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    setFav(isFavorite(item.id, item.type));
  }, [item.id, item.type]);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const result = toggleFavorite(item);
    setFav(result);
    if (result) {
      setAnimate(true);
      setTimeout(() => setAnimate(false), 300);
    }
    // Dispatch event so other components can react
    window.dispatchEvent(new CustomEvent("favorites-changed"));
  };

  const iconSize = size === "sm" ? 16 : 20;

  return (
    <button
      onClick={handleClick}
      className={`transition-all duration-200 ${animate ? "scale-125" : "scale-100"} ${className}`}
      title={fav ? "Убрать из избранного" : "В избранное"}
    >
      <Heart
        size={iconSize}
        className={`transition-colors ${fav ? "text-red-500 fill-red-500" : "text-white/70 hover:text-red-400"}`}
        fill={fav ? "currentColor" : "none"}
      />
    </button>
  );
}
