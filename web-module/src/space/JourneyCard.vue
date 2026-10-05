<template>
  <section class="shd lsp-journey" :dir="isRtl(lang) ? 'rtl' : 'ltr'" :lang="lang" :aria-labelledby="headId">
    <div class="lsp-journey__glow" aria-hidden="true"></div>
    <div class="lsp-journey__top">
      <span class="lsp-journey__logo" aria-hidden="true">
        <svg width="40" height="40" viewBox="0 0 32 32" focusable="false">
          <rect width="32" height="32" rx="10" fill="#6150EA" />
          <path d="M20.5 8.5a8 8 0 1 0 3 12.6A6.6 6.6 0 1 1 20.5 8.5z" fill="#2EF2C2" />
        </svg>
      </span>
      <div>
        <p class="lsp-journey__eyebrow">{{ tr('spaceTitle') }} · {{ tr('spaceSub') }}</p>
        <h3 :id="headId" class="lsp-journey__title">{{ started && resume ? tr('journeyResumeTitle') : tr('journeyTitle') }}</h3>
      </div>
    </div>

    <ul v-if="!started" class="lsp-journey__points">
      <li><span class="lsp-journey__ic"><SpaceIcon name="bookOpen" :size="18" /></span>{{ tr('journeyLine1', { n: total }) }}</li>
      <li><span class="lsp-journey__ic"><SpaceIcon name="file" :size="18" /></span>{{ tr('journeyLine2') }}</li>
      <li><span class="lsp-journey__ic"><SpaceIcon name="users" :size="18" /></span>{{ tr('journeyLine3') }}</li>
    </ul>

    <div v-else class="lsp-journey__progress">
      <div class="lsp-journey__meter" role="progressbar" :aria-label="tr('progressLabel')" :aria-valuenow="done" aria-valuemin="0" :aria-valuemax="total">
        <span :style="{ width: `${pct}%` }"></span>
      </div>
      <p>{{ tr('journeyDone', { done, total }) }}<template v-if="nextTitle"> · {{ tr('journeyNext', { title: nextTitle }) }}</template></p>
    </div>

    <button ref="btn" type="button" class="lsp-journey__btn" @click="$emit('open')">
      <span>{{ started ? tr('journeyContinue') : tr('journeyStart') }}</span>
      <SpaceIcon name="next" :size="20" />
    </button>
    <p class="lsp-journey__fine">
      <SpaceIcon name="book" :size="14" />
      {{ tr('transparency') }}
    </p>
  </section>
</template>

<script setup>
// The one thing left in the chat after the congratulation: an invitation into the learning space,
// and later a way back to it with the learner's progress.
import { computed, ref } from 'vue';
import SpaceIcon from './SpaceIcon.vue';
import { isRtl, useT } from '../i18n.js';

const props = defineProps({
  lang: { type: String, default: 'en' },
  started: { type: Boolean, default: false },
  resume: { type: Boolean, default: false },
  done: { type: Number, default: 0 },
  total: { type: Number, default: 19 },
  nextTitle: { type: String, default: '' },
});
defineEmits(['open']);

const tr = useT(() => props.lang);
const headId = `lsp-journey-${Math.random().toString(36).slice(2, 7)}`;
const btn = ref(null);
const pct = computed(() => (props.total ? Math.round((100 * props.done) / props.total) : 0));

defineExpose({ focus: () => btn.value?.focus() });
</script>
