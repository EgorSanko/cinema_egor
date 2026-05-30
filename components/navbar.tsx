"use client";

import type React from "react";
import { fetchMoviesBySearchAction, fetchTVBySearchAction } from "@/app/actions";
import { useDebounce } from "@/hooks/use-debounce";
import { getImageUrl } from "@/lib/tmdb";
import {
  Menu, Search, X, User, LogOut, LogIn,
  Home, Tv, Layers, Flame, Users, LayoutGrid,
  Bookmark, ChevronDown, Heart, Clock, Smartphone,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "./auth-context";
import { AuthModal } from "./auth-modal";

type IconType = React.ComponentType<{ size?: number; className?: string }>;
const NAV_LINKS: { label: string; href: string; Icon: IconType }[] = [
  { label: "Главная", href: "/", Icon: Home },
  { label: "Сериалы", href: "/tv", Icon: Tv },
  { label: "Подборки", href: "/collections", Icon: Layers },
  { label: "Свайп", href: "/swipe", Icon: Flame },
  { label: "Вместе", href: "/watch", Icon: Users },
  { label: "Жанры", href: "/genres", Icon: LayoutGrid },
];

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [favCount, setFavCount] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchPanelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const debouncedSearch = useDebounce(searchQuery, 300);

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (debouncedSearch.trim().length > 1) {
        const [movies, tvShows] = await Promise.all([
          fetchMoviesBySearchAction(debouncedSearch, 1),
          fetchTVBySearchAction(debouncedSearch, 1),
        ]);
        const movieResults = movies.slice(0, 4).map((m: any) => ({ ...m, media_type: "movie" }));
        const tvResults = tvShows.slice(0, 3).map((t: any) => ({ ...t, media_type: "tv" }));
        setSuggestions([...movieResults, ...tvResults]);
        setShowSuggestions(true);
      } else { setSuggestions([]); setShowSuggestions(false); }
    };
    fetchSuggestions();
  }, [debouncedSearch]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchPanelRef.current && !searchPanelRef.current.contains(event.target as Node)) {
        setSearchOpen(false);
        setShowSuggestions(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) setShowUserMenu(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const readFavs = () => {
      try {
        const raw = localStorage.getItem("kino_favorites");
        setFavCount(raw ? JSON.parse(raw).length : 0);
      } catch { setFavCount(0); }
    };
    readFavs();
    window.addEventListener("storage", readFavs);
    const interval = setInterval(readFavs, 4000);
    return () => { window.removeEventListener("storage", readFavs); clearInterval(interval); };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      } else if (e.key === "Escape" && searchOpen) {
        setSearchOpen(false);
        setSearchQuery("");
        setShowSuggestions(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery)}`);
      setSearchQuery("");
      setShowSuggestions(false);
      setSearchOpen(false);
      setIsOpen(false);
    }
  };

  const handleSuggestionClick = (item: any) => {
    const path = item.media_type === "tv" ? `/tv/${item.id}` : `/movie/${item.id}`;
    router.push(path);
    setSearchQuery("");
    setShowSuggestions(false);
    setSearchOpen(false);
  };

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const initials = user?.name ? user.name.trim().charAt(0).toUpperCase() : "?";

  // Shared pill-container styles (the frosted-glass capsule)
  const pillContainer =
    "flex items-center gap-1 rounded-full p-1 bg-foreground/[0.04] backdrop-blur-md border border-white/[0.08] dark:bg-white/[0.04]";

  return (
    <>
      <nav
        className={`sticky top-0 z-50 transition-[background-color,border-color] duration-300 backdrop-blur-xl ${
          scrolled
            ? "bg-background/90 border-b border-white/[0.06]"
            : "bg-background/60 border-b border-transparent"
        }`}
      >
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-3">
            {/* Logo */}
            <Link href="/" className="group flex-shrink-0 flex items-center gap-2">
              <img
                src="/logo.png"
                alt="sapkefly kino"
                width={170}
                height={44}
                decoding="async"
                fetchPriority="high"
                className="h-11 w-auto transition-all duration-200 group-hover:scale-[1.03] group-hover:drop-shadow-[0_0_18px_rgba(163,230,53,0.4)]"
              />
            </Link>

            {/* Nav pill (desktop) */}
            <div className={`hidden lg:flex ${pillContainer}`}>
              {NAV_LINKS.map(({ label, href, Icon }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-2 h-8 px-3.5 rounded-full text-[13px] tracking-[0.01em] transition-colors duration-200 ${
                      active
                        ? "bg-primary/15 text-primary font-semibold"
                        : "text-foreground/70 hover:text-foreground hover:bg-foreground/[0.06] font-medium"
                    }`}
                  >
                    <Icon size={15} className={active ? "text-primary" : ""} />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </div>

            {/* Right pill */}
            <div className="hidden sm:flex items-center gap-2" ref={searchPanelRef}>
              {/* Android app download — chip style, primary-tinted */}
              <Link
                href="/download"
                className="hidden lg:inline-flex items-center gap-1.5 h-10 px-3.5 rounded-full bg-primary/12 ring-1 ring-primary/30 text-primary text-[12.5px] font-semibold hover:bg-primary/18 transition-colors"
                title="Скачать приложение для Android"
              >
                <Smartphone size={14} />
                <span>Андроид</span>
              </Link>

              {/* Search — icon in its own pill, dropdown panel below */}
              <div className="relative">
                <button
                  onClick={() => {
                    setSearchOpen((v) => !v);
                    if (!searchOpen) setTimeout(() => searchInputRef.current?.focus(), 50);
                  }}
                  className={`h-10 w-10 rounded-full flex items-center justify-center transition-colors border border-white/[0.08] backdrop-blur-md ${
                    searchOpen
                      ? "bg-foreground/10 text-foreground"
                      : "bg-foreground/[0.04] text-foreground/70 hover:text-foreground hover:bg-foreground/[0.08]"
                  }`}
                  aria-label="Поиск"
                >
                  <Search size={16} />
                </button>
                {searchOpen && (
                  <div className="absolute right-0 top-full mt-2 w-[360px] sm:w-[420px] bg-background/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-2xl shadow-black/60 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                    <form onSubmit={handleSearch} className="p-2">
                      <div className="relative">
                        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground/50" />
                        <input
                          ref={searchInputRef}
                          type="text"
                          placeholder="Поиск фильмов и сериалов..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full h-10 pl-9 pr-12 bg-foreground/[0.04] border border-white/[0.08] rounded-full text-[13px] text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-foreground/30"
                        />
                        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-mono text-foreground/40 bg-foreground/[0.04] border border-white/[0.08] rounded">ESC</kbd>
                      </div>
                    </form>
                    {showSuggestions && suggestions.length > 0 && (
                      <div className="border-t border-white/[0.06] max-h-[60vh] overflow-y-auto">
                        {suggestions.map((item: any) => (
                          <div
                            key={`${item.media_type}-${item.id}`}
                            onClick={() => handleSuggestionClick(item)}
                            className="flex items-center gap-3 px-3 py-2.5 hover:bg-foreground/[0.05] cursor-pointer transition-colors border-b border-white/[0.04] last:border-0"
                          >
                            <div className="relative w-9 h-12 flex-shrink-0 rounded overflow-hidden bg-foreground/5">
                              <Image src={getImageUrl(item.poster_path, "w92") || "/placeholder.svg"} alt={item.title || item.name} fill className="object-cover" sizes="36px" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-[13px] font-medium text-foreground truncate">{item.title || item.name}</h4>
                              <p className="text-[11px] text-foreground/50 mt-0.5">
                                {item.media_type === "tv" ? "Сериал" : "Фильм"} · {new Date(item.release_date || item.first_air_date || "").getFullYear() || "—"}
                                {item.vote_average ? ` · ★ ${item.vote_average.toFixed(1)}` : ""}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Моё + Avatar pill */}
              <div className={pillContainer}>
                <Link
                  href="/favorites"
                  className="flex items-center gap-2 h-8 px-3.5 rounded-full text-[13px] font-medium text-foreground/80 hover:text-foreground hover:bg-foreground/[0.06] transition-colors"
                  title="Моё"
                >
                  <Bookmark size={15} />
                  <span>Моё</span>
                  {favCount > 0 && (
                    <span className="ml-0.5 min-w-[18px] h-[18px] px-1 bg-primary/20 text-primary text-[10px] font-bold rounded-full flex items-center justify-center">
                      {favCount > 99 ? "99+" : favCount}
                    </span>
                  )}
                </Link>

                {user ? (
                  <div className="relative" ref={userMenuRef}>
                    <button
                      onClick={() => setShowUserMenu(!showUserMenu)}
                      className="flex items-center gap-1.5 h-8 pl-1 pr-2 rounded-full hover:bg-foreground/[0.06] transition-colors"
                      title={user.name}
                    >
                      <span className="h-7 w-7 rounded-full bg-gradient-to-br from-primary/40 to-primary/10 ring-1 ring-white/15 flex items-center justify-center text-foreground text-[12px] font-semibold">
                        {initials}
                      </span>
                      <ChevronDown size={14} className={`text-foreground/60 transition-transform duration-200 ${showUserMenu ? "rotate-180" : ""}`} />
                    </button>
                    {showUserMenu && (
                      <div className="absolute right-0 top-full mt-2 bg-background/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-2xl shadow-black/60 overflow-hidden z-50 min-w-[220px] animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.06]">
                          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/40 to-primary/10 ring-1 ring-white/15 flex items-center justify-center text-foreground text-sm font-semibold">{initials}</div>
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-foreground truncate">{user.name}</p>
                            <p className="text-[11px] text-foreground/50 truncate">{user.email}</p>
                          </div>
                        </div>
                        <Link href="/profile" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-foreground/80 hover:text-foreground hover:bg-foreground/5 transition-colors">
                          <User size={15} /> Профиль
                        </Link>
                        <Link href="/favorites" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-foreground/80 hover:text-foreground hover:bg-foreground/5 transition-colors">
                          <Heart size={15} /> Избранное
                        </Link>
                        <Link href="/history" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-foreground/80 hover:text-foreground hover:bg-foreground/5 transition-colors">
                          <Clock size={15} /> История
                        </Link>
                        <Link href="/wrapped" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-primary/90 hover:text-primary hover:bg-primary/5 transition-colors font-semibold">
                          <span className="text-base leading-none">🎬</span> Год в кино
                        </Link>
                        <Link href="/lists" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-foreground/80 hover:text-foreground hover:bg-foreground/5 transition-colors">
                          <span className="text-base leading-none">📋</span> Мои списки
                        </Link>
                        <Link href="/downloads" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-foreground/80 hover:text-foreground hover:bg-foreground/5 transition-colors">
                          <span className="text-base leading-none">⬇️</span> Загрузки
                        </Link>
                        {(process.env.NEXT_PUBLIC_ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase()).includes(user.email?.toLowerCase() || "") && (
                          <Link href="/admin/logs" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-amber-300/90 hover:text-amber-300 hover:bg-amber-400/5 transition-colors border-t border-white/[0.06]">
                            <span className="text-base leading-none">⚙️</span> Админ-логи
                          </Link>
                        )}
                        <button onClick={() => { logout(); setShowUserMenu(false); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-red-400/90 hover:text-red-400 hover:bg-red-400/5 transition-colors border-t border-white/[0.06]">
                          <LogOut size={15} /> Выйти
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAuth(true)}
                    className="flex items-center gap-1.5 h-8 px-3.5 rounded-full bg-primary text-primary-foreground text-[13px] font-semibold hover:bg-primary/90 transition-colors"
                  >
                    <LogIn size={14} /> Войти
                  </button>
                )}
              </div>
            </div>

            {/* Mobile toggle */}
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="lg:hidden p-2 rounded-lg hover:bg-foreground/5 transition-colors"
              aria-label="Меню"
            >
              {isOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>

          {/* Mobile menu */}
          {isOpen && (
            <div
              className="lg:hidden border-t border-white/[0.06] py-3 pb-20 space-y-1 animate-in slide-in-from-top-5 duration-300 max-h-[calc(100vh-4rem)] overflow-y-auto"
              style={{ overscrollBehavior: "contain" }}
            >
              <form onSubmit={handleSearch} className="px-1 pb-2">
                <div className="relative">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground/50" />
                  <input
                    type="text"
                    placeholder="Поиск..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-foreground/[0.04] border border-white/[0.08] rounded-full text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-foreground/30"
                  />
                </div>
              </form>
              {NAV_LINKS.map(({ label, href, Icon }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-3 px-3 py-2.5 text-[15px] rounded-lg transition-colors ${
                      active ? "bg-primary/15 text-primary font-semibold" : "text-foreground/75 hover:text-foreground hover:bg-foreground/5"
                    }`}
                    onClick={() => setIsOpen(false)}
                  >
                    <Icon size={17} /> {label}
                  </Link>
                );
              })}
              <div className="pt-2 mt-2 border-t border-white/[0.06] space-y-1">
                <Link
                  href="/favorites"
                  className="flex items-center justify-between px-3 py-2.5 text-[15px] text-foreground/80 hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors"
                  onClick={() => setIsOpen(false)}
                >
                  <span className="flex items-center gap-3"><Bookmark size={17} /> Моё</span>
                  {favCount > 0 && (
                    <span className="text-[11px] px-1.5 py-0.5 bg-primary/15 text-primary rounded-full font-semibold">{favCount}</span>
                  )}
                </Link>
                <Link
                  href="/history"
                  className="flex items-center gap-3 px-3 py-2.5 text-[15px] text-foreground/80 hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors"
                  onClick={() => setIsOpen(false)}
                >
                  <Clock size={17} /> История
                </Link>
                <Link
                  href="/download"
                  className="flex items-center gap-3 px-3 py-2.5 text-[15px] text-primary font-semibold bg-primary/10 hover:bg-primary/15 rounded-lg transition-colors"
                  onClick={() => setIsOpen(false)}
                >
                  <Smartphone size={17} /> Приложение для Android
                </Link>

                {user ? (
                  <>
                    <Link
                      href="/profile"
                      onClick={() => setIsOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 text-[15px] text-foreground/80 hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors"
                    >
                      <div className="h-7 w-7 rounded-full bg-gradient-to-br from-primary/40 to-primary/10 ring-1 ring-white/15 flex items-center justify-center text-foreground text-xs font-semibold">{initials}</div>
                      <span className="flex-1 truncate">{user.name}</span>
                    </Link>
                    <button
                      onClick={() => { logout(); setIsOpen(false); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-[15px] text-red-400/90 hover:text-red-400 hover:bg-red-400/5 rounded-lg transition-colors"
                    >
                      <LogOut size={17} /> Выйти
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => { setShowAuth(true); setIsOpen(false); }}
                    className="w-full flex items-center justify-center gap-2 mt-2 h-11 bg-primary text-primary-foreground rounded-full text-[14px] font-semibold hover:bg-primary/90 transition-colors"
                  >
                    <LogIn size={16} /> Войти / Регистрация
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </nav>
      <AuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} />
    </>
  );
}
