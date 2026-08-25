# -*- coding: utf-8 -*-
"""Собирает пакеты ТВ-клиента под телевизоры.

  .wgt — Samsung (Tizen): обычный zip с config.xml в корне.
  .ipk — LG (webOS): архив ar из debian-binary + control.tar.gz + data.tar.gz.

Ни Tizen Studio, ни webOS CLI не нужны — оба формата собираются здесь. Это
важно: их инструменты весят гигабайты и ставятся только под конкретную ОС.

Что НЕ делается здесь и не может делаться: подпись .wgt. Samsung требует
сертификат, привязанный к конкретному телевизору (DUID), — он выдаётся в
Tizen Studio при подключённом ТВ. Шаги описаны в README.md рядом.

Запуск:  python build.py
Выход:   packaging/dist/sapkeflykino-tv.wgt
         packaging/dist/ru.sapkeflykino.tv_1.0.0_all.ipk
"""
import io, os, shutil, tarfile, time, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)                       # tvapp/
DIST = os.path.join(HERE, "dist")
WEB_FILES = ["index.html", "app.js", "app.css"]
ICON_SRC = os.path.join(APP, "..", "public", "icon-512.png")

WEBOS_ID = "ru.sapkeflykino.tv"
VERSION = "1.0.0"


def stage(extra_files):
    """Готовит папку с содержимым приложения: веб-файлы + значок + манифест."""
    tmp = os.path.join(DIST, "_stage")
    if os.path.isdir(tmp):
        shutil.rmtree(tmp)
    os.makedirs(tmp)
    for f in WEB_FILES:
        shutil.copy(os.path.join(APP, f), os.path.join(tmp, f))
    shutil.copy(ICON_SRC, os.path.join(tmp, "icon.png"))
    for src, dst in extra_files:
        shutil.copy(src, os.path.join(tmp, dst))
    return tmp


def build_wgt():
    src = stage([(os.path.join(HERE, "tizen", "config.xml"), "config.xml")])
    out = os.path.join(DIST, "sapkeflykino-tv.wgt")
    # Файлы кладём в КОРЕНЬ архива: Tizen ищет config.xml именно там.
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for name in sorted(os.listdir(src)):
            z.write(os.path.join(src, name), name)
    shutil.rmtree(src)
    return out


def _ar_member(name, data, mtime):
    """Один элемент архива ar: заголовок 60 байт + данные, выровненные до чётного."""
    header = (
        name.ljust(16)[:16] +
        str(int(mtime)).ljust(12)[:12] +
        "0".ljust(6) + "0".ljust(6) +
        "100644".ljust(8) +
        str(len(data)).ljust(10)[:10] +
        "`\n"
    ).encode("ascii")
    out = header + data
    if len(data) % 2:
        out += b"\n"
    return out


def _tar_gz(entries, base=""):
    """Собирает tar.gz из списка (путь_в_архиве, байты)."""
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as t:
        for path, data in entries:
            info = tarfile.TarInfo(base + path)
            info.size = len(data)
            info.mtime = int(time.time())
            info.mode = 0o644
            t.addfile(info, io.BytesIO(data))
    return buf.getvalue()


def build_ipk():
    src = stage([(os.path.join(HERE, "webos", "appinfo.json"), "appinfo.json")])

    payload = []
    total = 0
    root = "./usr/palm/applications/" + WEBOS_ID + "/"
    for name in sorted(os.listdir(src)):
        data = io.open(os.path.join(src, name), "rb").read()
        total += len(data)
        payload.append((root + name, data))
    data_tar = _tar_gz(payload)

    control = (
        "Package: " + WEBOS_ID + "\n"
        "Version: " + VERSION + "\n"
        "Section: misc\n"
        "Priority: optional\n"
        "Architecture: all\n"
        "Installed-Size: " + str(total) + "\n"
        "Maintainer: sapkeflykino <noreply@sapkeflykino.ru>\n"
        "Description: SAPKEFLY KINO - фильмы и сериалы\n"
        "webOS-Package-Format-Version: 2\n"
        "webOS-Packager-Version: 1.0.0\n"
    ).encode("utf-8")
    control_tar = _tar_gz([("./control", control)])

    mtime = time.time()
    out = os.path.join(DIST, WEBOS_ID + "_" + VERSION + "_all.ipk")
    with io.open(out, "wb") as f:
        f.write(b"!<arch>\n")
        f.write(_ar_member("debian-binary", b"2.0\n", mtime))
        f.write(_ar_member("control.tar.gz", control_tar, mtime))
        f.write(_ar_member("data.tar.gz", data_tar, mtime))
    shutil.rmtree(src)
    return out


if __name__ == "__main__":
    if not os.path.isdir(DIST):
        os.makedirs(DIST)
    w = build_wgt()
    i = build_ipk()
    for p in (w, i):
        print(os.path.basename(p), os.path.getsize(p), "байт")
