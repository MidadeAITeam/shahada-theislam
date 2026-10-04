<template>
  <section class="shd-card" :aria-labelledby="headId">
    <div>
      <h3 :id="headId">{{ tr('choiceTitle') }}</h3>
      <p class="shd-muted">{{ tr('choiceHint') }}</p>
    </div>
    <div class="shd-choices" role="group" :aria-labelledby="headId">
      <button
        v-for="c in CHOICES"
        :key="c.id"
        type="button"
        class="shd-choice"
        :aria-pressed="selected === c.id ? 'true' : 'false'"
        :disabled="busy || (selected && selected !== c.id)"
        @click="$emit('choose', c.id)"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" v-html="c.icon"></svg>
        <span>{{ tr(`choice_${c.id}`) }}</span>
        <span v-if="busy && selected === c.id" class="shd-spinner" aria-hidden="true"></span>
      </button>
    </div>
  </section>
</template>

<script setup>
// One tap. The order of lessons that follows is computed by the service from fixed rules, not by
// a model (content/structure.json, path_rules).
import { useT } from './i18n.js';

const props = defineProps({
  lang: { type: String, default: 'en' },
  selected: { type: String, default: null },
  busy: { type: Boolean, default: false },
});
defineEmits(['choose']);

const tr = useT(() => props.lang);
const headId = `shd-choice-${Math.random().toString(36).slice(2, 7)}`;

// Static, trusted markup for the icons only.
const CHOICES = [
  { id: 'wudu', icon: '<path d="M12 2.7C9 7 6 10.3 6 14a6 6 0 0 0 12 0c0-3.7-3-7-6-11.3Z"/>' },
  { id: 'prayer', icon: '<path d="M4 20h16M6 20V10l6-6 6 6v10M10 20v-5h4v5"/>' },
  { id: 'fatiha', icon: '<path d="M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2zM22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z"/>' },
  { id: 'unsure', icon: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5h.01"/>' },
];
</script>
