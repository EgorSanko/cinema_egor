# -*- coding: utf-8 -*-
"""Сборка ТВ-обёртки в два прохода.

Телевизорам отдаётся ОДИН скрипт — совместимый. Современный убран: Samsung на
Tizen 5 пытался разобрать его первым, падал на современном синтаксисе, а следом
запускал совместимый, и приложение уходило в сеть дважды. На экране при этом
оставалась мёртвая половина с вечной загрузкой.

Но Vite выпускает файл оформления только вместе с современной сборкой. Поэтому:
  проход 1 — собираем с современной сборкой и забираем оформление;
  проход 2 — собираем только совместимую;
  затем оформление ВШИВАЕМ прямо в страницу.

Вшиваем, а не подключаем файлом, намеренно: одним запросом меньше, и оформление
не может «не доехать» из-за кэша телевизора или неверного типа файла — на этом
мы уже теряли вечер.
"""
import io, os, re, shutil, subprocess, sys, glob

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)

def run(cmd, env=None):
    e = dict(os.environ); e.update(env or {})
    # errors="replace": консоль Windows отдаёт вывод в своей кодировке, и на
    # русских буквах разбор падал прямо посреди успешной сборки.
    p = subprocess.run(cmd, shell=True, env=e, capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if p.returncode:
        sys.stderr.write(p.stdout + p.stderr)
        raise SystemExit("сборка не удалась: " + cmd)
    return p.stdout

# ── проход 1: только ради оформления ─────────────────────────────────────
shutil.rmtree("dist-css", ignore_errors=True)
run("npx vite build --outDir dist-css", {"TV_CSS_PASS": "1"})
css_files = glob.glob("dist-css/assets/*.css")
if not css_files:
    raise SystemExit("оформление не собралось — дальше идти нельзя")
css = io.open(css_files[0], encoding="utf-8").read()
print("проход 1: оформление получено, %d байт" % len(css))

# ── проход 2: боевая сборка, один скрипт ─────────────────────────────────
shutil.rmtree("dist", ignore_errors=True)
run("npx vite build")

html_path = "dist/index.html"
html = io.open(html_path, encoding="utf-8").read()

# Убираем ссылку на файл оформления, если она осталась, и вшиваем содержимое.
html = re.sub(r'<link[^>]+rel="stylesheet"[^>]*>', "", html)
assert "</head>" in html or "<body" in html
tag = "<style>" + css + "</style>"
if "</head>" in html:
    html = html.replace("</head>", tag + "</head>", 1)
else:
    html = html.replace("<body", tag + "<body", 1)
io.open(html_path, "w", encoding="utf-8", newline="").write(html)

# ── проверки, без которых не выкатываем ──────────────────────────────────
scripts = re.findall(r'<script[^>]*>', html)
modern = [t for t in scripts if 'type="module"' in t]
if modern:
    raise SystemExit("остались современные скрипты: %s" % modern)
if "<style>" not in html:
    raise SystemExit("оформление не вшилось")
if 'id="boot"' not in html:
    raise SystemExit("проверка загрузки пропала из страницы")
# ── ГЛАВНАЯ ПРОВЕРКА: всё ли понимает старый телевизор ───────────────────
# Разбираем каждый собранный файл строго по правилам ES5. Именно на этом
# спотыкался Samsung Егора: в логах шли «Unexpected token .» — современный
# синтаксис, который его движок не читает. Тем же способом ловится и сломанный
# встроенный скрипт: однажды в строку попал живой перенос, скрипт падал
# целиком, и проверка загрузки молча не работала полночи.
run("node es5check.cjs")
print("проверка совместимости: пройдена")

shutil.rmtree("dist-css", ignore_errors=True)
print("проход 2: готово. скриптов %d, современных 0, оформление внутри страницы" % len(scripts))
