/** Замена next/link: обычная ссылка на хеш-маршрут. */
import * as React from "react";

export default function Link(
  props: { href: string; children?: React.ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>,
) {
  const { href, children, ...rest } = props;
  return (
    <a href={"#" + href} {...rest}>
      {children}
    </a>
  );
}
