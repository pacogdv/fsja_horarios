export function Unsafe({ html }: { html: string }) {
  const props = { dangerouslySetInnerHTML: { __html: html } };
  return <div {...props} />;
}
