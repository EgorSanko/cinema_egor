"use client";

import { useEffect, useRef, useState } from "react";

// Кот-маскот в углу сайта. Исходник — обычный mp4 (h264) на зелёнке; зелёный
// кеится ВЖИВУЮ в WebGL-шейдере, поэтому прозрачность работает во ВСЕХ
// браузерах, включая iOS Safari (webm-с-альфой Safari не проигрывает).
//   • Два инстанса (left/right) сидят в нижних углах, pointer-events:none.
//   • prefers-reduced-motion / нет WebGL → просто не рендерим (котов нет).
export function CornerCat({ side, src }: { side: "left" | "right"; src: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ok, setOk] = useState(true);

  useEffect(() => {
    try {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setOk(false);
        return;
      }
    } catch {}

    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", {
      premultipliedAlpha: false,
      alpha: true,
      antialias: true,
    });
    if (!gl) {
      setOk(false);
      return;
    }

    const video = document.createElement("video");
    video.src = src;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.autoplay = true;
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");

    const vs = `attribute vec2 p; varying vec2 uv;
      void main(){ uv = (p + 1.0) / 2.0; gl_Position = vec4(p, 0.0, 1.0); }`;
    // key = «зелёность» пикселя; зелёный фон → alpha 0, кот → alpha 1.
    // Мягкий край (smoothstep) + подавление зелёного ореола на шерсти (spill).
    const fs = `precision mediump float; uniform sampler2D t; varying vec2 uv;
      void main(){
        vec4 c = texture2D(t, uv);
        float key = c.g - max(c.r, c.b);
        float a = 1.0 - smoothstep(0.06, 0.22, key);
        float spill = max(0.0, c.g - max(c.r, c.b));
        c.g -= spill * 0.7;
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
    if (play && play.catch) play.catch(() => {});
    draw();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [src]);

  if (!ok) return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed bottom-0 -z-10 select-none"
      style={
        {
          [side]: 0,
          width: "clamp(70px, 13vw, 160px)",
          height: "auto",
        } as React.CSSProperties
      }
    />
  );
}
