// Menyusun ChatContext dari GameState: apa yang "diketahui" kucing saat diajak ngobrol.

import { formatClock, formatDay, nextReminderAt } from "./assistant";
import { ACCESSORY_BY_ID, COAT_BY_ID } from "./data";
import type { ChatContext } from "./dialogue";
import { hearts, isHungry } from "./economy";
import type { Game } from "./game";
import { cityHour, currentWeather, isDark, sunFor } from "./weather";

export interface ChatExtras {
  mood: ChatContext["mood"];
  /** Pemain sedang banyak mengetik akhir-akhir ini. */
  typingBusy: boolean;
  rand?: () => number;
}

export function chatContext(game: Game, catId: string, now: number, extras: ChatExtras): ChatContext | null {
  const s = game.state;
  const cat = s.cats.find((c) => c.id === catId);
  if (!cat) return null;
  const phase = game.phase(now);
  const w = s.weather;
  const cw = currentWeather(w, now);
  const sun = sunFor(now, w.last);
  const a = s.assistant;

  // Pengingat aktif terdekat yang belum lewat.
  let reminder: ChatContext["reminder"] = null;
  let soonest = Infinity;
  for (const r of a.reminders) {
    const at = nextReminderAt(r);
    if (at !== null && at > now && at < soonest) {
      soonest = at;
      reminder = { text: r.text, clock: formatClock(at), day: formatDay(at, now) };
    }
  }

  const open = a.todos.filter((t) => !t.done);
  const focus = a.focus;
  const feedable = s.cats.some((c) => c.hunger < 0.999) && s.fish >= game.feedPrice(now);

  return {
    name: cat.name,
    trait: cat.trait,
    hearts: hearts(cat),
    hungry: isHungry(cat),
    mood: extras.mood,
    facility: cat.facility !== null && s.facilities[cat.facility] > 0 ? cat.facility : null,
    accessory: cat.accessory ? (ACCESSORY_BY_ID[cat.accessory]?.name.toLowerCase() ?? null) : null,
    coatName: COAT_BY_ID[cat.coat]?.name ?? "kucing",
    player: s.chat.playerName,
    askedName: s.chat.askedName,
    phase,
    clock: formatClock(now),
    hour: cityHour(now, sun.utcOffset),
    weather: {
      enabled: w.enabled,
      kind: cw.kind,
      temp: cw.temp,
      source: cw.source,
      place: w.place?.name ?? null,
      night: isDark(phase),
    },
    others: s.cats.filter((c) => c.id !== catId).map((c) => c.name),
    focus: {
      phase: focus.phase,
      minutesLeft: focus.phase === "idle" ? 0 : Math.max(0, (focus.endsAt - now) / 60_000),
      focusMinutes: focus.focusMinutes,
    },
    todos: { open: open.length, top: open[0]?.text ?? null },
    reminder,
    typing: { enabled: s.typing.enabled, today: game.tapsToday(now), busy: extras.typingBusy },
    treats: s.inventory.treats,
    canFeed: feedable,
    rand: extras.rand ?? Math.random,
  };
}
