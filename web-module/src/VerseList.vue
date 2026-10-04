<template>
  <section v-if="verses.length" class="shd-verses" :aria-label="tr('versesTitle')">
    <h4 class="shd-eyebrow">{{ tr('versesTitle') }}</h4>
    <figure v-for="v in verses" :key="v.ref" class="shd-verse" style="margin: 0">
      <!-- The Arabic is the Tanzil text as served; the model never writes verse text. -->
      <p class="shd-verse__ar" lang="ar" dir="rtl">{{ v.arabic }}</p>
      <p v-if="v.meaning" class="shd-verse__meaning" :lang="v.meaningLang || undefined" :dir="isRtl(v.meaningLang) ? 'rtl' : 'ltr'">
        <strong>{{ tr('verseMeaning') }}:</strong> {{ v.meaning }}
      </p>
      <figcaption class="shd-verse__ref">{{ v.ref }}<template v-if="v.source"> · {{ v.source }}</template></figcaption>
    </figure>
  </section>
</template>

<script setup>
import { isRtl, useT } from './i18n.js';

const props = defineProps({
  verses: { type: Array, default: () => [] },
  lang: { type: String, default: 'en' },
});
const tr = useT(() => props.lang);
</script>

<style scoped>
.shd-verses { display: flex; flex-direction: column; gap: 0.5rem; }
</style>
