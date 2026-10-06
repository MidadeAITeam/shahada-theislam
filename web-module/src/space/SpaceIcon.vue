<script setup>
// Stroke icons (24×24) in the follow-up platform's style. Decorative unless `label` is given.
defineProps({ name: { type: String, required: true }, size: { type: [Number, String], default: 20 }, label: String });
const P = {
  back: 'M15 6l-6 6 6 6',
  next: 'M9 6l6 6-6 6',
  x: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12l4 4 10-10',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zm0 0v16M8 7h7',
  bookOpen: 'M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2zM22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z',
  drop: 'M12 2.7C9 7 6 10.3 6 14a6 6 0 0 0 12 0c0-3.7-3-7-6-11.3Z',
  mosque: 'M4 21h16M6 21V11l6-6 6 6v10M10 21v-5h4v5M12 5V2',
  question: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5h.01',
  message: 'M4 5h16v11H9l-5 4z',
  send: 'M4 12l16-8-6 16-2-7z',
  path: 'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 17h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9a7 7 0 0 1 14 0',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7.5M18 14a6 6 0 0 1 4 7',
  save: 'M12 3v12m0 0l-4-4m4 4l4-4M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4v5l3 2',
  file: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 3v3M17.5 4.5h3',
  headphones: 'M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v6H5a1 1 0 0 1-1-1zm16 0h-3v6h2a1 1 0 0 0 1-1z',
  pencil: 'M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm-9 9h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z',
  flag: 'M5 21V4m0 0h11l-2 4 2 4H5',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
  expand: 'M15 4h5v5M9 20H4v-5M20 4l-7 7M4 20l7-7',
  shrink: 'M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7',
  pin: 'M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zm0-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  logout: 'M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M9 16l-4-4 4-4M5 12h11',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z',
};
</script>

<template>
  <svg
    :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
    stroke-linecap="round" stroke-linejoin="round" :class="['lsp-icon', { 'lsp-flip': name === 'back' || name === 'next' || name === 'send' || name === 'logout' }]"
    :role="label ? 'img' : undefined" :aria-label="label" :aria-hidden="label ? undefined : 'true'" focusable="false"
  ><path :d="P[name]" /></svg>
</template>
