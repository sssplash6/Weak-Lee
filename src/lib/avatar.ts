// Fun preset avatars — auto-assigned per user (deterministic from a seed so a
// person always gets the same one). No profile customization yet; this is just
// a playful stand-in for the plain initial.

type Avatar = { emoji: string; bg: string };

const AVATARS: Avatar[] = [
  { emoji: "🦊", bg: "bg-orange-100" },
  { emoji: "🐼", bg: "bg-slate-100" },
  { emoji: "🐸", bg: "bg-green-100" },
  { emoji: "🐙", bg: "bg-purple-100" },
  { emoji: "🦉", bg: "bg-amber-100" },
  { emoji: "🐲", bg: "bg-emerald-100" },
  { emoji: "🦄", bg: "bg-pink-100" },
  { emoji: "🐢", bg: "bg-teal-100" },
  { emoji: "🐝", bg: "bg-yellow-100" },
  { emoji: "🦁", bg: "bg-rose-100" },
  { emoji: "🐧", bg: "bg-sky-100" },
  { emoji: "🦖", bg: "bg-lime-100" },
  { emoji: "🦥", bg: "bg-red-100" },
  { emoji: "🦦", bg: "bg-blue-100" },
  { emoji: "🦫", bg: "bg-indigo-100" },
  { emoji: "🦨", bg: "bg-violet-100" },
  { emoji: "🦡", bg: "bg-fuchsia-100" },
  { emoji: "🦩", bg: "bg-cyan-100" },
  { emoji: "🦔", bg: "bg-stone-100" },
  { emoji: "🦘", bg: "bg-zinc-100" },
  { emoji: "🐌", bg: "bg-neutral-100" },
  { emoji: "🦙", bg: "bg-gray-100" },
];

/** Deterministically pick a preset avatar for a seed (e.g. user id or email). */
export function presetAvatar(seed: string | null | undefined): Avatar {
  const s = seed ?? "";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATARS[h % AVATARS.length];
}
