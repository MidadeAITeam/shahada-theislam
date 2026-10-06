<template>
  <component :is="tag" class="shd-ptext">
    <template v-for="(b, i) in parts" :key="i">
      <ul v-if="b.type === 'ul'" class="shd-ptext__ul">
        <li v-for="(it, j) in b.items" :key="j"><InlineText :text="it.text" /></li>
      </ul>
      <ol v-else-if="b.type === 'ol'" class="shd-ptext__ol">
        <li v-for="(it, j) in b.items" :key="j"><span class="shd-ptext__n" aria-hidden="true">{{ it.n }}.</span><InlineText :text="it.text" /></li>
      </ol>
      <!-- Wider than a phone: the table scrolls on its own, never the page. -->
      <div v-else-if="b.type === 'table'" class="shd-ptext__table" tabindex="0">
        <table>
          <thead v-if="b.head"><tr><th v-for="(c, j) in b.head" :key="j" scope="col"><InlineText :text="c" /></th></tr></thead>
          <tbody><tr v-for="(r, j) in b.rows" :key="j"><td v-for="(c, k) in r" :key="k"><InlineText :text="c" /></td></tr></tbody>
        </table>
      </div>
      <strong v-else-if="b.type === 'h'" class="shd-ptext__h"><InlineText :text="b.text" /></strong>
      <span v-else class="shd-ptext__p"><InlineText :text="b.text" /></span>
    </template>
  </component>
</template>

<script setup>
// A book passage as the learner should read it: lists as lists, headings as a bold line, no raw
// Markdown, tags or verse markers (see format.js). Each block is a span or list, so it fits inside
// a blockquote; a table sits in a box that scrolls sideways on its own.
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
.shd-ptext__table { display: block; max-width: 100%; overflow-x: auto; border-radius: 10px; box-shadow: inset 0 0 0 1px #e7e9f3; }
.shd-ptext__table table { width: 100%; border-collapse: collapse; font-size: 0.92em; line-height: 1.5; }
.shd-ptext__table th, .shd-ptext__table td { padding: 0.45em 0.7em; text-align: start; vertical-align: top; white-space: pre-line; min-width: 7em; border-bottom: 1px solid #e7e9f3; }
.shd-ptext__table th { font-weight: 600; background: rgba(97, 80, 234, 0.06); }
.shd-ptext__table tr:last-child td { border-bottom: 0; }
.shd-ptext__n { position: absolute; inset-inline-start: 0; font-variant-numeric: tabular-nums; opacity: 0.7; }
</style>
