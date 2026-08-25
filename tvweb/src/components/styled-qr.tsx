
import * as React from "react";
import qrcode from "qrcode-generator";

/**
 * QR-код для входа с телефона.
 *
 * Раньше здесь рисовала библиотека qr-code-styling — красивые круглые точки,
 * но она опирается на современные возможности браузера. На телевизоре Егора
 * (Samsung, Tizen 5.0) код просто НЕ ПОЯВЛЯЛСЯ: файл библиотеки загружался
 * (виден в логах), а на экране оставалась пустота. Отладить это на телевизоре
 * нечем — консоли там нет.
 *
 * Поэтому рисуем сами: обычный SVG из чёрных квадратов. Никакого холста,
 * никаких новых API — такой код отображает любой движок, включая прошивки
 * 2016 года. Логотип накладываем сверху отдельной картинкой.
 */
export function StyledQR({
  value,
  size = 260,
  logo = null,
  className,
}: {
  value: string;
  size?: number;
  logo?: string | null;
  className?: string;
}) {
  const svg = React.useMemo(() => {
    if (!value) return null;
    try {
      // 0 = автоподбор размера под длину строки; «M» — средняя коррекция
      // ошибок: её хватает, чтобы код читался даже с логотипом по центру.
      const qr = qrcode(0, "M");
      qr.addData(value);
      qr.make();
      const count = qr.getModuleCount();
      const cells: string[] = [];
      for (let r = 0; r < count; r++) {
        for (let c = 0; c < count; c++) {
          if (qr.isDark(r, c)) cells.push(`M${c} ${r}h1v1h-1z`);
        }
      }
      return { path: cells.join(""), count };
    } catch {
      return null;
    }
  }, [value]);

  if (!svg) {
    // Не смогли построить код — показываем адрес текстом, чтобы человек всё
    // равно мог войти, набрав его на телефоне.
    return (
      <div className={className} style={{ width: size, wordBreak: "break-all", fontSize: 14 }}>
        {value}
      </div>
    );
  }

  return (
    <div className={className} style={{ position: "relative", width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${svg.count} ${svg.count}`}
        shapeRendering="crispEdges"
        style={{ display: "block", background: "#ffffff", borderRadius: 12 }}
      >
        <path d={svg.path} fill="#0a0a0b" />
      </svg>
      {logo ? (
        <img
          src={logo}
          alt=""
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: Math.round(size * 0.22),
            height: Math.round(size * 0.22),
            marginLeft: -Math.round(size * 0.11),
            marginTop: -Math.round(size * 0.11),
            background: "#ffffff",
            borderRadius: 8,
            padding: 4,
          }}
        />
      ) : null}
    </div>
  );
}
