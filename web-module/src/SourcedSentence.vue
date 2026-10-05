<template>
  <component :is="tag" class="shd-sentence" dir="auto">
    <span>{{ text }}</span>
    <button
      v-for="id in sources"
      :key="id"
      type="button"
      class="shd-marker"
      :aria-expanded="sheet ? undefined : open.has(id) ? 'true' : 'false'"
      :aria-haspopup="sheet ? 'dialog' : undefined"
      :aria-label="tr('showSource', { n: numberOf(id) })"
      @click="toggle(id, $event)"
    >{{ numberOf(id) }}</button>
    <div v-for="id in openIds" :key="`src-${id}`" class="shd-source">
      <blockquote v-if="sourceOf(id)?.text" :lang="sourceOf(id).lang" :dir="isRtl(sourceOf(id).lang) ? 'rtl' : 'ltr'">{{ sourceOf(id).text }}</blockquote>
      <cite>{{ tr('sourceRef', { book: tr('bookName'), page: pageOf(id) }) }}</cite>
    </div>
  </component>
</template>

<script setup>
// One sentence of a summary, step or answer with its numbered source markers. A marker opens the
// original passage from the book with its page, so every claim can be checked where it is made.
import { computed, inject, reactive } from 'vue';
import { isRtl, useT } from './i18n.js';

const props = defineProps({
  text: { type: String, required: true },
  sources: { type: Array, default: () => [] },
  // id -> SourceRef ({ id, page, lang, text, ... }) for the lesson or answer this sentence belongs to.
  sourceMap: { type: Object, default: () => ({}) },
  // id -> marker number, shared across the whole lesson so the same passage keeps the same number.
  numbers: { type: Object, default: () => ({}) },
  lang: { type: String, default: 'en' },
  tag: { type: String, default: 'div' },
});

const tr = useT(() => props.lang);
const open = reactive(new Set());
const openIds = computed(() => props.sources.filter((id) => open.has(id)));

// Inside the learning space the original text opens in a side sheet instead of beneath the sentence.
const sheet = inject('shdOpenSource', null);
function toggle(id, event) {
  if (sheet) return sheet({ id, number: numberOf(id), page: pageOf(id), source: sourceOf(id), trigger: event?.currentTarget });
  return open.has(id) ? open.delete(id) : open.add(id);
}
const sourceOf = (id) => props.sourceMap[id] || null;
const numberOf = (id) => props.numbers[id] ?? props.sources.indexOf(id) + 1;
// Passage ids encode the page (wajeez:en:p63:c3), which still gives a page when the passage
// itself was not sent along.
const pageOf = (id) => sourceOf(id)?.page ?? (/:p(\d+)/.exec(id)?.[1] || '?');
</script>
