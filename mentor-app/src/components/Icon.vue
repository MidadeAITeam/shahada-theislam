<script setup>
// Small stroke icon set (24×24). Decorative by default; pass `label` to expose it to screen readers.
defineProps({ name: { type: String, required: true }, size: { type: [Number, String], default: 20 }, label: String });
const P = {
  inbox: "M3 13h5l1.5 3h5L16 13h5M5 5h14l2 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z",
  flag: "M5 21V4m0 0h11l-2 4 2 4H5",
  chart: "M4 20V10m6 10V4m6 16v-7m4 7H3",
  logout: "M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h10",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm-9 9h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0",
  bellOff: "M6 16V11a6 6 0 0 1 9.5-4.9M18 11v5l1.5 2H8M10 20a2 2 0 0 0 4 0M4 4l16 16",
  refresh: "M20 11a8 8 0 0 0-14.5-4.5L4 8m0-4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16m0 4v-4h-4",
  back: "M15 6l-6 6 6 6",
  alert: "M12 4l9 16H3zM12 10v4m0 3v.01",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9a7 7 0 0 1 14 0",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4v5l3 2",
  book: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zm0 0v16M8 7h7",
  message: "M4 5h16v11H9l-5 4z",
  send: "M4 12l16-8-6 16-2-7z",
  note: "M5 3h10l4 4v14H5zM14 3v5h5M8 13h8M8 17h5",
  check: "M5 12l4 4 10-10",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  eyeOff: "M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3.2 3.7M6.1 7.4A17 17 0 0 0 2 12s4 6 10 6a9.6 9.6 0 0 0 4.4-1M9.9 9.9a3 3 0 0 0 4.2 4.2",
  x: "M6 6l12 12M18 6L6 18",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z",
  sparkle: "M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5m7 7L18 18M6 18l2.5-2.5m7-7L18 6",
  lock: "M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3",
  timeline: "M6 4v16M6 7h.01M6 12h.01M6 17h.01M10 7h9M10 12h7M10 17h9",
  hand: "M8 13V6a1.5 1.5 0 0 1 3 0v5m0-6.5a1.5 1.5 0 0 1 3 0V11m0-4a1.5 1.5 0 0 1 3 0v6a7 7 0 0 1-7 7h-.5A6.5 6.5 0 0 1 5 16l-1.5-3a1.5 1.5 0 0 1 2.6-1.5L8 14",
  filter: "M4 5h16l-6 7v6l-4 2v-8z",
};
</script>

<template>
  <svg
    :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
    stroke-linecap="round" stroke-linejoin="round" :class="['icon', { flip: name === 'back' || name === 'send' }]"
    :role="label ? 'img' : undefined" :aria-label="label" :aria-hidden="label ? undefined : 'true'" focusable="false"
  ><path :d="P[name]" /></svg>
</template>
