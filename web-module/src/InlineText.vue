<template>
  <span><template v-for="(s, i) in segs" :key="i"><span v-if="s.saw" class="shd-saw">ﷺ</span><template v-else>{{ s.text }}</template></template></span>
</template>

<script setup>
// A line of text with ﷺ set in a font and size that render it clearly (it is tiny in most UI fonts).
import { computed } from 'vue';
import { segments } from './format.js';

const props = defineProps({ text: { type: String, default: '' } });
const segs = computed(() => segments(props.text));
</script>

<style>
.shd-saw { font-family: 'Amiri', 'Noto Naskh Arabic', 'Scheherazade New', 'Traditional Arabic', serif; font-size: 1.3em; line-height: 1; font-weight: 400; vertical-align: -0.08em; }
</style>
