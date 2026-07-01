"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { syncFromServer } from "@/lib/storage";
import { getTvUser, type TvUser } from "@/lib/tv-auth";
import { LogoSplash } from "./logo-splash";
import { StyledQR } from "@/components/styled-qr";

// ════════════════════════════════════════════════════════════════
// TV LOGIN — fully D-pad / keyboard driven on-screen keyboard.
//
// Layout (a single flat list of focusable "cells" navigated as a grid):
//   row 0..n : on-screen keyboard keys
//   then     : action buttons (field switch is implicit — the active field
//              receives typed characters).
//
// We mirror the navigation model of components/tv/tv-home.tsx:
//   - focus held in React state (single source of truth: {row,col}),
//   - a window keydown handler drives it,
//   - BOTH e.key and legacy e.keyCode are handled (arrows 37-40, Enter 13,
//     Back Escape/Backspace 27/8),
//   - OK/Enter "presses" the focused cell.
//
// On successful login we store the user EXACTLY like auth-context does
// (localStorage "user" = {email,name}) and then pull the user's synced
// history via syncFromServer(email) before routing to /tv-home.
// ════════════════════════════════════════════════════════════════

type Field = "email" | "password";

// On-screen keyboard rows. Last row holds editing + submit controls.
const KB_ROWS: string[][] = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l", "@"],
  ["z", "x", "c", "v", "b", "n", "m", ".", "_", "-"],
];

// Special action cells appended as their own rows.
const ROW_EDIT = ["SHIFT", "SPACE", "DEL", "FIELD"]; // case toggle, space, backspace, switch field
const ROW_ACT = ["LOGIN", "REGISTER"]; // submit / toggle register

// Build the full focusable grid: keyboard rows + edit row + action row.
function buildGrid(): string[][] {
  return [...KB_ROWS, ROW_EDIT, ROW_ACT];
}

const KEY_LABEL: Record<string, string> = {
  SPACE: "Пробел",
  DEL: "⌫ Стереть",
  FIELD: "⇄ Поле",
  LOGIN: "Войти",
  REGISTER: "Регистрация",
};

export function TvLogin() {
  const router = useRouter();

  // Launch splash (animated logo) — plays once per session over a black screen,
  // then fades and lets the rest proceed.
  const [splash, setSplash] = useState(true);
  useEffect(() => {
    try {
      if (sessionStorage.getItem("tv_splash_shown")) setSplash(false);
      else sessionStorage.setItem("tv_splash_shown", "1"); // play once per session
    } catch {}
  }, []);

  // If already logged in, skip straight to the home screen (after the splash).
  useEffect(() => {
    if (splash) return;
    const u = getTvUser();
    if (u) router.replace("/tv-home");
  }, [splash, router]);

  // ── Form state ──
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState(""); // register only
  const [activeField, setActiveField] = useState<Field>("email");
  const [shift, setShift] = useState(false); // sticky upper-case toggle

  // Register flow: "login" -> normal; "register" -> collecting name/email/pw;
  // "verify" -> entering the 6-digit code emailed to the user.
  const [mode, setMode] = useState<"login" | "register" | "verify">("login");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  // ── QR device-link login (scan with phone → TV logs in) ──
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState<string>("");

  // ── D-pad focus ──
  const grid = buildGrid();
  const [focus, setFocus] = useState({ row: 0, col: 0 });
  const cellRefs = useRef<(HTMLButtonElement | null)[][]>([]);

  // Drive real DOM focus from the focus state.
  useEffect(() => {
    const el = cellRefs.current[focus.row]?.[focus.col];
    if (el) el.focus({ preventScroll: true });
  }, [focus]);

  // The active editable field for the current mode.
  // register adds a "name" step but we keep it simple: name uses the email
  // text box visually; activeField cycles email -> password (-> name in register).
  const fieldOrder: Field[] = mode === "verify" ? [] : ["email", "password"];

  const typeChar = useCallback(
    (ch: string) => {
      setError("");
      if (mode === "verify") {
        if (/[0-9]/.test(ch)) setCode((c) => (c + ch).slice(0, 6));
        return;
      }
      if (mode === "register" && activeField === "email" && nameStep.current) {
        setName((v) => (v + ch).slice(0, 40));
        return;
      }
      if (activeField === "email") setEmail((v) => (v + ch).slice(0, 80));
      else setPassword((v) => (v + ch).slice(0, 64));
    },
    [activeField, mode]
  );

  // In register mode we collect name first, then email, then password — but to
  // keep the on-screen field count at two, we use a small flag for the name step.
  const nameStep = useRef(false);

  const del = useCallback(() => {
    setError("");
    if (mode === "verify") { setCode((c) => c.slice(0, -1)); return; }
    if (mode === "register" && activeField === "email" && nameStep.current) {
      setName((v) => v.slice(0, -1));
      return;
    }
    if (activeField === "email") setEmail((v) => v.slice(0, -1));
    else setPassword((v) => v.slice(0, -1));
  }, [activeField, mode]);

  const switchField = useCallback(() => {
    setError("");
    if (mode === "verify") return;
    if (mode === "register") {
      // cycle name -> email -> password -> name
      if (nameStep.current) { nameStep.current = false; setActiveField("email"); }
      else if (activeField === "email") setActiveField("password");
      else { nameStep.current = true; setActiveField("email"); }
      return;
    }
    setActiveField((f) => (f === "email" ? "password" : "email"));
  }, [activeField, mode]);

  // ── Auth actions ──
  async function postAuth(payload: Record<string, unknown>) {
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.json();
  }

  // Store the user EXACTLY like auth-context.completeAuth, then pull history.
  async function completeAuth(u: TvUser) {
    localStorage.setItem("user", JSON.stringify(u));
    setInfo("Загружаем вашу историю…");
    try { await syncFromServer(u.email); } catch {}
    router.push("/tv-home");
  }

  // Create a QR link-code once the splash is gone, then poll until the phone
  // confirms. Codes expire in 5 min → refresh the code when that happens.
  useEffect(() => {
    if (splash) return;
    let alive = true;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const startPolling = (code: string) => {
      pollTimer = setInterval(async () => {
        try {
          const res = await fetch("/api/tv-link", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "status", code }),
          });
          const data = await res.json();
          if (!alive) return;
          if (data.status === "authorized" && data.user?.email) {
            if (pollTimer) clearInterval(pollTimer);
            setInfo("Вход подтверждён с телефона…");
            completeAuth({ email: data.user.email, name: data.user.name || data.user.email.split("@")[0] });
          } else if (data.status === "expired") {
            if (pollTimer) clearInterval(pollTimer);
            create(); // code died → mint a fresh one
          }
        } catch {}
      }, 2000);
    };

    const create = async () => {
      try {
        const res = await fetch("/api/tv-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "create", intent: "tv" }),
        });
        const data = await res.json();
        if (!alive || !data.code) return;
        setLinkCode(data.code);
        setLinkUrl(`${window.location.origin}/link/${data.code}`);
        startPolling(data.code);
      } catch {}
    };

    create();
    return () => { alive = false; if (pollTimer) clearInterval(pollTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splash]);

  const doLogin = useCallback(async () => {
    if (busy) return;
    setError(""); setInfo("");
    const e = email.trim().toLowerCase();
    if (!e || !password) { setError("Введите email и пароль"); return; }
    setBusy(true);
    try {
      const data = await postAuth({ action: "login", email: e, password });
      if (data.success && data.user) {
        await completeAuth({ email: data.user.email, name: data.user.name });
      } else {
        setError(data.error || "Ошибка входа");
      }
    } catch {
      setError("Нет связи с сервером");
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, password, busy]);

  const doRegister = useCallback(async () => {
    if (busy) return;
    setError(""); setInfo("");
    const e = email.trim().toLowerCase();
    if (!name.trim()) { setError("Введите имя"); return; }
    if (!e) { setError("Введите email"); return; }
    if (password.length < 6) { setError("Пароль минимум 6 символов"); return; }
    setBusy(true);
    try {
      const data = await postAuth({ action: "register", name: name.trim(), email: e, password });
      if (data.pending) {
        setMode("verify");
        setCode("");
        setDevCode(data.devCode || null);
        setInfo(
          data.emailSent
            ? "Код отправлен на ваш email. Введите его."
            : "Введите код подтверждения."
        );
        setFocus({ row: 0, col: 0 });
      } else {
        setError(data.error || "Ошибка регистрации");
      }
    } catch {
      setError("Нет связи с сервером");
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, password, name, busy]);

  const doVerify = useCallback(async () => {
    if (busy) return;
    setError(""); setInfo("");
    const e = email.trim().toLowerCase();
    if (code.length < 4) { setError("Введите код из письма"); return; }
    setBusy(true);
    try {
      const data = await postAuth({ action: "verify", email: e, code });
      if (data.success && data.user) {
        await completeAuth({ email: data.user.email, name: data.user.name });
      } else {
        setError(data.error || "Неверный код");
      }
    } catch {
      setError("Нет связи с сервером");
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, code, busy]);

  const press = useCallback(
    (cell: string) => {
      switch (cell) {
        case "SHIFT": setShift((s) => !s); break;
        case "SPACE": typeChar(" "); break;
        case "DEL": del(); break;
        case "FIELD": switchField(); break;
        case "LOGIN":
          if (mode === "verify") doVerify();
          else if (mode === "register") doRegister();
          else doLogin();
          break;
        case "REGISTER":
          setError(""); setInfo("");
          if (mode === "login") {
            setMode("register");
            nameStep.current = true; // start with name
            setActiveField("email");
            setInfo("Регистрация: имя → email → пароль (кнопка ⇄ Поле).");
          } else {
            setMode("login");
            nameStep.current = false;
            setActiveField("email");
            setCode("");
          }
          break;
        default:
          // upper-case letters when Shift is on (passwords are case-sensitive)
          typeChar(shift && /^[a-z]$/.test(cell) ? cell.toUpperCase() : cell);
      }
    },
    [typeChar, del, switchField, mode, doLogin, doRegister, doVerify, shift]
  );

  // ── D-pad handler — mirror tv-home's model. ──
  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      const code2 = ev.keyCode;
      const key = ev.key;

      const isLeft = key === "ArrowLeft" || code2 === 37;
      const isUp = key === "ArrowUp" || code2 === 38;
      const isRight = key === "ArrowRight" || code2 === 39;
      const isDown = key === "ArrowDown" || code2 === 40;
      const isEnter = key === "Enter" || code2 === 13;
      const isBack = key === "Escape" || key === "Backspace" || code2 === 27 || code2 === 8;

      if (isBack) {
        ev.preventDefault();
        del(); // Back acts as delete-char (most useful on a login keyboard)
        return;
      }
      if (!isLeft && !isUp && !isRight && !isDown && !isEnter) return;
      ev.preventDefault();

      setFocus((prev) => {
        let { row, col } = prev;
        if (isEnter) {
          press(grid[row]?.[col]);
          return prev;
        }
        if (isLeft) col = Math.max(0, col - 1);
        else if (isRight) col = Math.min((grid[row]?.length ?? 1) - 1, col + 1);
        else if (isUp) {
          row = Math.max(0, row - 1);
          col = Math.min(col, (grid[row]?.length ?? 1) - 1);
        } else if (isDown) {
          row = Math.min(grid.length - 1, row + 1);
          col = Math.min(col, (grid[row]?.length ?? 1) - 1);
        }
        return { row, col };
      });
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [grid, press, del]);

  // Focus first cell on mount.
  useEffect(() => {
    const el = cellRefs.current[0]?.[0];
    if (el) el.focus({ preventScroll: true });
  }, []);

  const maskedPw = "•".repeat(password.length);

  // Which "field" is currently receiving input — for the highlight.
  const emailActive = mode !== "verify" && activeField === "email" && !nameStep.current;
  const nameActive = mode === "register" && activeField === "email" && nameStep.current;
  const pwActive = mode !== "verify" && activeField === "password";

  return (
    <main
      className="h-screen overflow-hidden bg-background text-foreground select-none flex flex-row items-center justify-center gap-[4vw] px-[3vw] py-[3vh]"
      style={{ background: "var(--background)" }}
    >
      {splash && <LogoSplash onDone={() => setSplash(false)} />}

      {/* QR column — scan with phone to sign in without the on-screen keyboard */}
      {!splash && (
        <aside className="hidden md:flex flex-col items-center shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[var(--primary)] text-xs font-black tracking-widest uppercase">Быстрый вход</span>
          </div>
          {linkUrl ? (
            <StyledQR value={linkUrl} size={288} />
          ) : (
            <div style={{ width: 288, height: 288, borderRadius: 20, background: "#fff" }} className="opacity-20" />
          )}
          <p className="mt-4 text-lg font-bold text-center max-w-[300px]">Отсканируйте телефоном</p>
          <p className="mt-1 text-sm text-muted-foreground text-center max-w-[300px]">
            Наведите камеру — и подтвердите вход в приложении. Без ввода почты и пароля пультом.
          </p>
          <div className="mt-5 flex items-center gap-2 text-muted-foreground text-sm">
            <span className="h-px w-10 bg-white/10" /> или введите вручную <span className="text-[var(--primary)]">→</span>
          </div>
        </aside>
      )}

      {/* Login column — the classic D-pad keyboard */}
      <div className="flex flex-col items-center">
      {/* Logo */}
      <header className="pb-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="SAPKEFLY KINO"
          draggable={false}
          className="h-10 w-auto"
          style={{ filter: "drop-shadow(0 0 22px rgba(163,230,53,0.45))" }}
        />
      </header>

      <h1 className="text-2xl font-bold mb-1">
        {mode === "verify" ? "Подтверждение" : mode === "register" ? "Регистрация" : "Вход"}
      </h1>
      <p className="text-muted-foreground mb-3 text-base">
        {mode === "verify"
          ? "Введите код из письма"
          : "Войдите, чтобы смотреть"}
      </p>

      {/* Fields */}
      <div className="w-full max-w-2xl px-8 space-y-2 mb-3">
        {mode === "register" && (
          <FieldBox label="Имя" value={name || " "} active={nameActive} />
        )}
        {mode !== "verify" && (
          <>
            <FieldBox label="Email" value={email || " "} active={emailActive} />
            <FieldBox label="Пароль" value={password ? maskedPw : " "} active={pwActive} />
          </>
        )}
        {mode === "verify" && (
          <FieldBox label="Код" value={code || " "} active />
        )}
      </div>

      {/* Messages */}
      <div className="h-7 mb-3 text-center">
        {error && <p className="text-red-400 text-lg">{error}</p>}
        {!error && info && <p className="text-[var(--primary)] text-lg">{info}</p>}
        {!error && !info && devCode && (
          <p className="text-muted-foreground">Код (dev): {devCode}</p>
        )}
      </div>

      {/* On-screen keyboard grid */}
      <div className="flex flex-col items-center gap-1">
        {grid.map((cells, rIdx) => {
          const isActionRow = rIdx >= KB_ROWS.length;
          return (
            <div key={rIdx} className="flex gap-1">
              {cells.map((cell, cIdx) => {
                const focused = focus.row === rIdx && focus.col === cIdx;
                const label =
                  cell === "SHIFT"
                    ? shift ? "⇧ ABC" : "⇧ abc"
                    : KEY_LABEL[cell] ?? (shift ? cell.toUpperCase() : cell);
                const shiftActive = cell === "SHIFT" && shift;
                const wide = isActionRow;
                return (
                  <button
                    key={cell}
                    ref={(node) => {
                      if (!cellRefs.current[rIdx]) cellRefs.current[rIdx] = [];
                      cellRefs.current[rIdx][cIdx] = node;
                    }}
                    tabIndex={focused ? 0 : -1}
                    disabled={busy}
                    onClick={() => { setFocus({ row: rIdx, col: cIdx }); press(cell); }}
                    onFocus={() => setFocus({ row: rIdx, col: cIdx })}
                    className="rounded-lg font-semibold outline-none transition-transform duration-100"
                    style={{
                      minWidth: wide ? 150 : 46,
                      height: 44,
                      paddingInline: wide ? 16 : 0,
                      fontSize: wide ? 16 : 18,
                      background: focused
                        ? "var(--primary)"
                        : shiftActive ? "rgba(163,230,53,0.22)" : "var(--card)",
                      color: focused ? "var(--primary-foreground)" : "var(--foreground)",
                      transform: focused ? "scale(1.08)" : "scale(1)",
                      boxShadow: focused
                        ? "0 0 0 4px var(--primary), 0 10px 28px rgba(0,0,0,0.55)"
                        : shiftActive
                          ? "0 0 0 2px var(--primary)"
                          : "0 2px 10px rgba(0,0,0,0.4)",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      </div>
    </main>
  );
}

function FieldBox({ label, value, active }: { label: string; value: string; active: boolean }) {
  return (
    <div
      className="rounded-xl px-4 py-2 flex items-center gap-3"
      style={{
        background: "var(--card)",
        boxShadow: active ? "0 0 0 3px var(--primary)" : "0 0 0 1px rgba(255,255,255,0.08)",
      }}
    >
      <span className="text-muted-foreground w-24 shrink-0 text-lg">{label}</span>
      <span className="text-xl font-mono truncate flex-1">{value}</span>
    </div>
  );
}
