"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Питер Гриффин — ОДИН раз за загрузку страницы. При открытии первой карточки
// фильма/сериала/аниме поверх контента единожды проигрывается кейнутый мем
// (вбегает → спотыкается → падает), затем исчезает. Другие карточки — уже без
// него. Модульный флаг PLAYED сбрасывается только при ПОЛНОЙ перезагрузке
// (SPA-переходы его сохраняют — ровно то, что нужно).
//   • Хромакей вживую в WebGL по ДИСТАНЦИИ до цвета: яркая зелёнка (0x13FF08)
//     убирается, а тёмно-зелёные штаны Питера остаются (они далеко от ключа).
//   • Полноэкранный, pointer-events:none (не мешает кликать), reduced-motion → скип.
let PLAYED = false;
const DETAIL = /^\/(movie|tv|anime)\/[^/]+/;

export function PeterOnce() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (PLAYED || active) return;
    if (!DETAIL.test(pathname || "")) return;
    try {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    } catch {}
    PLAYED = true;
    setActive(true);
  }, [pathname, active]);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", {
      premultipliedAlpha: false,
      alpha: true,
      antialias: true,
    });
    if (!gl) {
      setActive(false);
      return;
    }

    const video = document.createElement("video");
    video.src = "/peter.mp4?v=1";
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");

    const vs = `attribute vec2 p; varying vec2 uv;
      void main(){ uv = (p + 1.0) / 2.0; gl_Position = vec4(p, 0.0, 1.0); }`;
    // Ключ по дистанции до яркой зелёнки: близко → alpha 0, далеко → 1.
    const fs = `precision mediump float; uniform sampler2D t; varying vec2 uv;
      const vec3 KEY = vec3(0.0745, 1.0, 0.0314);
      void main(){
        vec4 c = texture2D(t, uv);
        float d = distance(c.rgb, KEY);
        float a = smoothstep(0.28, 0.45, d);
        gl_FragColor = vec4(c.rgb, a);
      }`;

    const compile = (type: number, source: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, source);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    let raf = 0;
    let stopped = false;
    const finish = () => {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(raf);
      setActive(false);
    };
    video.addEventListener("ended", finish);

    const draw = () => {
      if (stopped) return;
      if (video.readyState >= 2 && video.videoWidth) {
        if (canvas.width !== video.videoWidth) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      raf = requestAnimationFrame(draw);
    };

    const play = video.play();
    if (play && play.catch) play.catch(() => finish());
    draw();
    // Страховка, если событие ended не придёт (клип 4.5с) — снять через 6с.
    const guard = window.setTimeout(finish, 6500);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(guard);
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [active]);

  if (!active) return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[100] select-none"
      style={{ width: "100vw", height: "100vh", objectFit: "contain" }}
    />
  );
}
