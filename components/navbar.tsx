"use client";

import type React from "react";
import { fetchMoviesBySearchAction, fetchTVBySearchAction } from "@/app/actions";
import { useDebounce } from "@/hooks/use-debounce";
import type { Movie, TVShow } from "@/lib/tmdb";
import { getImageUrl } from "@/lib/tmdb";
import { Menu, Search, X, User, LogOut, LogIn, Heart, Clock } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "./auth-context";
import { AuthModal } from "./auth-modal";
import { ThemeToggle } from "./theme-toggle";

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
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
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) setShowSuggestions(false);
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) setShowUserMenu(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) { router.push(`/search?q=${encodeURIComponent(searchQuery)}`); setSearchQuery(""); setShowSuggestions(false); setIsOpen(false); }
  };

  const handleSuggestionClick = (item: any) => {
    const path = item.media_type === "tv" ? `/tv/${item.id}` : `/movie/${item.id}`;
    router.push(path); setSearchQuery(""); setShowSuggestions(false);
  };

  const navLinks = [
    { label: "\u0413\u043B\u0430\u0432\u043D\u0430\u044F", href: "/" },
    { label: "\u0421\u0435\u0440\u0438\u0430\u043B\u044B", href: "/tv" },
    { label: "\u041F\u043E\u0434\u0431\u043E\u0440\u043A\u0438", href: "/collections" },
    { label: "\uD83D\uDD25 \u0421\u0432\u0430\u0439\u043F", href: "/swipe" },
    { label: "\u0416\u0430\u043D\u0440\u044B", href: "/genres" },
  ];

  return (
    <>
      <nav className="sticky top-0 z-50 bg-background/95 backdrop-blur-lg border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex-shrink-0 font-bold text-xl text-primary hover:text-accent transition-all duration-300">
              {"\u041A\u0438\u043D\u043E\u0442\u0435\u0430\u0442\u0440 \u0415\u0433\u043E\u0440\u0430"}
            </Link>
            <div className="hidden md:flex items-center gap-6">
              {navLinks.map((link) => (
                <Link key={link.href} href={link.href} className="text-foreground hover:text-primary transition-all duration-300 text-sm font-medium">
                  {link.label}
                </Link>
              ))}
            </div>
            <div className="hidden sm:flex flex-1 max-w-xs mx-4 lg:mx-8 relative" ref={searchRef}>
              <form onSubmit={handleSearch} className="w-full">
                <div className="w-full relative">
                  <input type="text" placeholder={"\u041F\u043E\u0438\u0441\u043A \u0444\u0438\u043B\u044C\u043C\u043E\u0432 \u0438 \u0441\u0435\u0440\u0438\u0430\u043B\u043E\u0432..."} value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                    className="w-full px-4 py-2 bg-card border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary transition-all" />
                  <button type="submit" className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-primary transition-all">
                    <Search size={18} />
                  </button>
                </div>
              </form>
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-lg shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  {suggestions.map((item: any) => (
                    <div key={`${item.media_type}-${item.id}`} onClick={() => handleSuggestionClick(item)}
                      className="flex items-center gap-3 p-3 hover:bg-primary/10 cursor-pointer transition-colors border-b border-border last:border-0">
                      <div className="relative w-10 h-14 flex-shrink-0 rounded overflow-hidden bg-muted">
                        <Image src={getImageUrl(item.poster_path, "w92") || "/placeholder.svg"} alt={item.title || item.name} fill className="object-cover" sizes="40px" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium text-foreground truncate">{item.title || item.name}</h4>
                        <p className="text-xs text-muted-foreground">
                          {item.media_type === "tv" ? "\uD83D\uDCFA \u0421\u0435\u0440\u0438\u0430\u043B" : "\uD83C\uDFAC \u0424\u0438\u043B\u044C\u043C"} {"\u2022"} {new Date(item.release_date || item.first_air_date || "").getFullYear() || ""} {"\u2022"} {item.vote_average?.toFixed(1)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="hidden sm:flex items-center gap-1">
              <ThemeToggle />
              <Link href="/favorites" className="p-2 text-muted-foreground hover:text-red-400 transition-colors" title={"\u0418\u0437\u0431\u0440\u0430\u043D\u043D\u043E\u0435"}>
                <Heart size={20} />
              </Link>
              <Link href="/history" className="p-2 text-muted-foreground hover:text-primary transition-colors" title={"\u0418\u0441\u0442\u043E\u0440\u0438\u044F"}>
                <Clock size={20} />
              </Link>
              {user ? (
                <div className="relative" ref={userMenuRef}>
                  <button onClick={() => setShowUserMenu(!showUserMenu)}
                    className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg hover:border-primary transition-colors">
                    <User size={16} className="text-primary" />
                    <span className="text-sm text-foreground max-w-[100px] truncate">{user.name}</span>
                  </button>
                  {showUserMenu && (
                    <div className="absolute right-0 top-full mt-2 bg-card border border-border rounded-lg shadow-xl overflow-hidden z-50 min-w-[160px]">
                      <div className="px-4 py-3 border-b border-border">
                        <p className="text-sm font-medium text-foreground">{user.name}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                      <Link href="/favorites" className="flex items-center gap-2 px-4 py-3 text-sm text-foreground hover:bg-primary/10 transition-colors border-b border-border">
                        <Heart size={16} /> {"\u0418\u0437\u0431\u0440\u0430\u043D\u043D\u043E\u0435"}
                      </Link>
                      <Link href="/history" className="flex items-center gap-2 px-4 py-3 text-sm text-foreground hover:bg-primary/10 transition-colors border-b border-border">
                        <Clock size={16} /> {"\u0418\u0441\u0442\u043E\u0440\u0438\u044F"}
                      </Link>
                      <button onClick={() => { logout(); setShowUserMenu(false); }}
                        className="w-full flex items-center gap-2 px-4 py-3 text-sm text-red-400 hover:bg-red-400/10 transition-colors">
                        <LogOut size={16} /> {"\u0412\u044B\u0439\u0442\u0438"}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button onClick={() => setShowAuth(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-medium transition-colors">
                  <LogIn size={16} /> {"\u0412\u043E\u0439\u0442\u0438"}
                </button>
              )}
            </div>

            <button onClick={() => setIsOpen(!isOpen)} className="md:hidden p-2 hover:bg-card rounded-lg transition-all">
              {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
          {isOpen && (
            <div className="md:hidden border-t border-border p-4 space-y-4 animate-in slide-in-from-top-5 duration-300">
              <form onSubmit={handleSearch}>
                <div className="relative">
                  <input type="text" placeholder={"\u041F\u043E\u0438\u0441\u043A..."} value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-4 py-3 bg-card border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary text-base" />
                  <button type="submit" className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-primary p-2">
                    <Search size={20} />
                  </button>
                </div>
              </form>
              <div className="space-y-2">
                {navLinks.map((link) => (
                  <Link key={link.href} href={link.href}
                    className="block px-4 py-3 text-lg text-foreground hover:bg-card rounded-lg transition-all"
                    onClick={() => setIsOpen(false)}>
                    {link.label}
                  </Link>
                ))}
                <Link href="/favorites"
                  className="flex items-center gap-3 px-4 py-3 text-lg text-foreground hover:bg-card rounded-lg transition-all"
                  onClick={() => setIsOpen(false)}>
                  <Heart size={20} className="text-red-400" /> {"\u0418\u0437\u0431\u0440\u0430\u043D\u043D\u043E\u0435"}
                </Link>
                <Link href="/history"
                  className="flex items-center gap-3 px-4 py-3 text-lg text-foreground hover:bg-card rounded-lg transition-all"
                  onClick={() => setIsOpen(false)}>
                  <Clock size={20} className="text-primary" /> {"\u0418\u0441\u0442\u043E\u0440\u0438\u044F"}
                </Link>
                {user ? (
                  <button onClick={() => { logout(); setIsOpen(false); }}
                    className="block w-full text-left px-4 py-3 text-lg text-red-400 hover:bg-card rounded-lg">
                    {"\u0412\u044B\u0439\u0442\u0438"} ({user.name})
                  </button>
                ) : (
                  <button onClick={() => { setShowAuth(true); setIsOpen(false); }}
                    className="block w-full text-left px-4 py-3 text-lg text-primary hover:bg-card rounded-lg">
                    {"\u0412\u043E\u0439\u0442\u0438 / \u0420\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044F"}
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
