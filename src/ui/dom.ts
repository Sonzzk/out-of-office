// Tiny helpers for building app windows from template strings safely.
export function esc(text: string | number): string {
  return String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function money(n: number): string {
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US")}`;
}

export const art = {
  portrait: (file: string) => `./art/portraits/${file}`,
  item: (file: string) => `./art/items/${file}`,
  level: (file: string) => `./art/levels/${file}`,
};
