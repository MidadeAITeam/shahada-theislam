<template>
  <section v-if="exercises.length" class="shd-ex" :aria-label="tr('exTitle')">
    <h4 class="shd-ex__title">{{ tr('exTitle') }}</h4>
    <p class="shd-ex__hint">{{ tr('exHint') }}</p>
    <div v-for="(ex, i) in exercises" :key="i" class="shd-ex__item">
      <p class="shd-ex__prompt">{{ i + 1 }}. <span class="shd-ex__text">{{ ex.prompt }}</span></p>

      <div v-if="ex.type !== 'open'" class="shd-ex__options" role="group" :aria-label="ex.prompt">
        <button
          v-for="(opt, k) in ex.options"
          :key="k"
          type="button"
          class="shd-ex__opt"
          :class="optClass(i, k, ex)"
          :aria-pressed="picked[i] === k"
          :disabled="picked[i] !== undefined"
          @click="picked[i] = k"
        >{{ opt }}</button>
      </div>

      <div v-else>
        <label class="shd-ex__label" :for="`ex-${uid}-${i}`">{{ tr('exYourAnswer') }}</label>
        <textarea :id="`ex-${uid}-${i}`" v-model="drafts[i]" rows="2" class="shd-ex__area"></textarea>
        <button v-if="!shown[i]" type="button" class="shd-btn shd-btn--small shd-btn--quiet" @click="shown[i] = true">{{ tr('exShow') }}</button>
      </div>

      <div v-if="picked[i] !== undefined || shown[i]" class="shd-ex__feedback" role="status">
        <strong v-if="ex.type !== 'open'">{{ picked[i] === ex.answer_index ? tr('exRight') : tr('exWrong') }}</strong>
        <p v-for="(s, j) in ex.explanation" :key="j" class="shd-ex__exp">
          {{ s.text }} <span class="shd-ex__src">({{ pagesOf(s.sources) }})</span>
        </p>
      </div>
    </div>
  </section>
</template>

<script setup>
// Interactive version of the assessment questions printed in Al-Wajeez. Nothing is stored:
// the learner tries, then sees the answer from the lesson with its page numbers.
import { reactive } from 'vue';
import { isRtl, useT } from './i18n.js';

const props = defineProps({
  exercises: { type: Array, default: () => [] },
  lang: { type: String, default: 'en' },
});
const tr = useT(() => props.lang);
const uid = Math.random().toString(36).slice(2, 8);
const picked = reactive({});
const shown = reactive({});
const drafts = reactive({});

function optClass(i, k, ex) {
  if (picked[i] === undefined) return '';
  if (k === ex.answer_index) return 'is-right';
  return picked[i] === k ? 'is-wrong' : '';
}
function pagesOf(ids) {
  const pages = [...new Set((ids || []).map((id) => id.split(':p')[1]?.split(':')[0]).filter(Boolean))];
  return `${tr('bookShort')} ${pages.join(isRtl(props.lang) ? '، ' : ', ')}`;
}
</script>

<style scoped>
.shd-ex { margin-top: 1rem; padding: 0.75rem 1rem; border-radius: 12px; background: #fff; border: 1px solid #e3e6f5; }
.shd-ex__title { font-size: 1rem; font-weight: 700; margin: 0; }
.shd-ex__hint { font-size: 0.85rem; color: #5b6080; margin: 0.25rem 0 0.5rem; }
.shd-ex__item { padding: 0.6rem 0; border-top: 1px solid #eef0f8; }
.shd-ex__prompt { margin: 0 0 0.4rem; font-weight: 600; }
.shd-ex__text { white-space: pre-line; font-weight: 500; }
.shd-ex__options { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.shd-ex__opt { border: 1px solid #ccd2ee; background: #f7f8ff; border-radius: 999px; padding: 0.35rem 0.9rem; font: inherit; cursor: pointer; }
.shd-ex__opt:focus-visible { outline: 3px solid #2ef2c2; outline-offset: 2px; }
.shd-ex__opt.is-right { background: #dff8ef; border-color: #2a9d74; }
.shd-ex__opt.is-wrong { background: #fde8e8; border-color: #c0392b; }
.shd-ex__label { display: block; font-size: 0.85rem; color: #5b6080; }
.shd-ex__area { width: 100%; border: 1px solid #ccd2ee; border-radius: 10px; padding: 0.4rem; font: inherit; margin: 0.25rem 0; }
.shd-ex__feedback { margin-top: 0.4rem; background: #f2f4ff; border-radius: 10px; padding: 0.5rem 0.75rem; }
.shd-ex__exp { margin: 0.2rem 0; }
.shd-ex__src { color: #5b6080; font-size: 0.8rem; }
</style>
