import { createElement } from "react";

export function Unsafe({ html }: { html: string }) {
  return createElement("div", { dangerouslySetInnerHTML: { __html: html } });
}
