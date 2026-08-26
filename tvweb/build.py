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

# ── УБИРАЕМ :where() ИЗ СЕЛЕКТОРОВ ───────────────────────────────────────
#
# Tailwind пишет сброс стилей так:
#     button, input:where([type=button]), … { background-color: transparent }
#
# `:where()` поддерживается с Chrome 88. На движке телевизора этот селектор
# недопустим, а по правилам CSS недопустимый селектор в перечислении выбрасывает
# ВСЁ правило целиком. Значит стандартный фон кнопок не сбрасывался — а каждая
# карточка у нас кнопка. На экране получались белые прямоугольники с невидимым
# текстом: те самые «белые полоски под карточками» с фото Егора.
#
# Смысл :where() — обнулять важность селектора. Нам это безразлично: правила
# сброса и так идут первыми. Поэтому просто разворачиваем :where(X) в X.
#
# Чиним И страницу, И скрипты: Vite кладёт оформление в оба места — часть
# внедряется из скрипта уже во время работы.
def развернуть_where(текст):
    было = текст.count(":where(")
    пред = None
    while пред != текст:
        пред = текст
        # Допускаем один уровень вложенных скобок: в сбросе есть
        # [hidden]:where(:not([hidden=until-found])) — с простым шаблоном
        # такое не разворачивалось.
        текст = re.sub(r":where\(((?:[^()]|\([^()]*\))*)\)", lambda m: m.group(1), текст)
    return текст, было

всего = 0
цели = [html_path] + [os.path.join("dist", "assets", f)
                      for f in os.listdir(os.path.join("dist", "assets")) if f.endswith(".js")]
for файл in цели:
    т = io.open(файл, encoding="utf-8").read()
    if ":where(" not in т:
        continue
    т, n = развернуть_where(т)
    io.open(файл, "w", encoding="utf-8", newline="").write(т)
    всего += n
    print("  развёрнуто :where() в %s: %d" % (os.path.basename(файл), n))
print("всего развёрнуто :where(): %d" % всего)

html = io.open(html_path, encoding="utf-8").read()

# ── КОНТРОЛЬ СОВМЕСТИМОСТИ ОФОРМЛЕНИЯ ────────────────────────────────────
#
# Свойства новее Chrome 63 телевизоры либо игнорируют (и вёрстка рассыпается),
# либо считают ошибкой и выбрасывают правило целиком. Ниже — те, что уже нас
# подводили. Сборка с ними не выкатывается.
#
# `gap` в перечень не входит намеренно: он закрыт подпоркой на полях, см.
# index.html. Всё остальное должно отсутствовать.
# Ориентир — Deeplex: в их оформлении НОЛЬ свойств новее Chrome 63 (проверено
# скачиванием их main.css). Держим ту же планку.
#
# Ищем по образцу, а не по подстроке: «inset:» встречается внутри имени
# переменной --tw-ring-inset, а «aspect-ratio» — в имени класса .aspect-*.
# Ложные срабатывания заставляли бы отключать проверку, а это худшее, что может
# случиться с проверкой.
запрещено = [
    (r":where\(", 88), (r":is\(", 88), (r"color-mix\(", 111), (r"oklch\(", 111),
    (r"(?<![-\w])aspect-ratio\s*:", 88), (r"@layer", 99), (r"@container", 105),
    (r":has\(", 105), (r"(?<![-\w])inset\s*:", 87), (r"(?<![-\w])text-wrap\s*:", 114),
]
найдено = []
проверяемое = ""
for файл in цели:
    проверяемое += io.open(файл, encoding="utf-8").read()
for образец, версия in запрещено:
    if re.search(образец, проверяемое):
        найдено.append("%s (нужен Chrome %d)" % (образец, версия))
if найдено:
    raise SystemExit("в оформлении осталось несовместимое: " + ", ".join(найдено))
print("контроль оформления: пройден")
html = io.open(html_path, encoding="utf-8").read()

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
