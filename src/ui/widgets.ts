// Komponen kecil yang dipakai bersama oleh panel: harga ikan, tombol beli,
// dan kontrol segmen (sub-tab satu baris).

import { formatFish } from "../core/format";
import type { ObjectId } from "../render/pixelart";
import { objectImageUrl } from "../render/textures";
import { h } from "./dom";

/** Harga dalam ikan: ikon ikan kecil dan angka berhuruf pixel. */
export function price(amount: number): HTMLElement {
  return h("span", { class: "price" }, h("img", { class: "px", src: objectImageUrl("fish", 1), alt: "" }), formatFish(amount));
}

/** Tombol beli: kata kerja di atas, harga di bawah. */
export function buyButton(
  label: string,
  cost: number,
  opts: { disabled: boolean; onclick: () => void; title?: string; primary?: boolean },
): HTMLButtonElement {
  return h(
    "button",
    {
      class: `btn btn-buy${opts.primary ? " primary" : ""}`,
      disabled: opts.disabled,
      title: opts.title,
      onclick: opts.onclick,
    },
    h("span", { class: "buy-label" }, label),
    price(cost),
  );
}

export interface SegItem<T extends string> {
  id: T;
  label: string;
  icon?: ObjectId;
}

/** Kontrol segmen satu baris untuk sub-bagian sebuah tab. */
export function segmented<T extends string>(items: SegItem<T>[], active: T, onPick: (id: T) => void): HTMLElement {
  return h(
    "div",
    { class: "seg", role: "tablist" },
    ...items.map((it) =>
      h(
        "button",
        {
          class: `seg-item${it.id === active ? " active" : ""}`,
          role: "tab",
          "aria-selected": it.id === active ? "true" : "false",
          onclick: () => onPick(it.id),
        },
        it.icon ? h("img", { class: "px", src: objectImageUrl(it.icon, 2), alt: "" }) : null,
        it.label,
      ),
    ),
  );
}
