<template>
  <component :is="tag" class="shd-ptext">
    <template v-for="(b, i) in parts" :key="i">
      <ul v-if="b.type === 'ul'" class="shd-ptext__ul">
        <li v-for="(it, j) in b.items" :key="j"><InlineText :text="it.text" /></li>
      </ul>
      <ol v-else-if="b.type === 'ol'" class="shd-ptext__ol">
        <li v-for="(it, j) in b.items" :key="j"><span class="shd-ptext__n" aria-hidden="true">{{ it.n }}.</span><InlineText :text="it.text" /></li>
      </ol>
      <strong v-else-if="b.type === 'h'" class="shd-ptext__h"><InlineText :text="b.text" /></strong>
      <span v-else class="shd-ptext__p"><InlineText :text="b.text" /></span>
    </template>
  </component>
</template>

<script setup>
// A book passage as the learner should read it: lists as lists, headings as a bold line, no raw
// Markdown, tags or verse markers (see format.js). Each block is a span or list, so it fits inside
// a blockquote.
import { computed } from 'vue';
import InlineText from './InlineText.vue';
import { blocks } from './format.js';

const props = defineProps({
  text: { type: String, default: '' },
  tag: { type: String, default: 'div' },
});
const parts = computed(() => blocks(props.text));
</script>

<style>
.shd-ptext { display: flex; flex-direction: column; gap: 0.6em; white-space: normal; }
.shd-ptext__p { display: block; white-space: pre-line; }
.shd-ptext__h { display: block; font-weight: 700; }
.shd-ptext__ul, .shd-ptext__ol { display: flex; flex-direction: column; gap: 0.35em; margin: 0; padding: 0; list-style: none; }
.shd-ptext__ul > li, .shd-ptext__ol > li { position: relative; padding-inline-start: 1.4em; }
.shd-ptext__ul > li::before { content: ''; position: absolute; inset-inline-start: 0.35em; top: 0.75em; width: 0.4em; height: 0.4em; border-radius: 50%; background: currentColor; opacity: 0.55; }
.shd-ptext__n { position: absolute; inset-inline-start: 0; font-variant-numeric: tabular-nums; opacity: 0.7; }
</style>
