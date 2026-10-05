<template>
  <article class="shd-card shd-answer" :aria-busy="loading ? 'true' : 'false'">
    <div v-if="loading" class="shd-loading" role="status">
      <span class="shd-spinner" aria-hidden="true"></span>{{ stageText }}
    </div>

    <template v-else-if="error">
      <p class="shd-error" role="alert">{{ tr('errorGeneric') }}</p>
      <div class="shd-actions">
        <button type="button" class="shd-btn shd-btn--small" @click="$emit('retry')">{{ tr('retry') }}</button>
      </div>
    </template>

    <template v-else-if="answer">
      <!-- Danger to life comes before anything else, and is not something to scroll past. -->
      <div v-if="emergencyText" class="shd-emergency" role="alert">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
        <span>{{ emergencyText }}</span>
      </div>

      <template v-if="answer.status === 'answered'">
        <span v-if="answer.translatedExplanation" class="shd-badge">{{ tr('translatedBadge') }}</span>
        <div class="shd-summary">
          <SourcedSentence
            v-for="(s, i) in answer.sentences || []"
            :key="i"
            :text="s.text"
            :sources="s.sources || []"
            :source-map="sourceMap"
            :numbers="numbers"
            :lang="lang"
          />
          <p v-if="!(answer.sentences || []).length">{{ answer.text }}</p>
        </div>

        <figure v-for="(qt, i) in answer.quotes || []" :key="`q${i}`" class="shd-quote">
          <blockquote style="margin: 0">“{{ qt.text }}”</blockquote>
          <cite>{{ tr('sourceRef', { book: tr('bookName'), page: qt.page }) }}</cite>
        </figure>

        <VerseList :verses="answer.verses || []" :lang="lang" />

        <p v-if="answer.lesson" class="shd-from-lesson">
          {{ tr('fromLesson', { title: answer.lesson.title }) }}
          <button type="button" class="shd-btn shd-btn--small" @click="$emit('open-lesson', answer.lesson.id)">
            {{ tr('open') }} <span aria-hidden="true">{{ arrow }}</span>
          </button>
        </p>

        <ReportMistake :target="`answer:${answerId}`" :lang="lang" />
      </template>

      <!-- Fixed texts (not generated): nothing to cite, so the way forward is a person. -->
      <template v-else>
        <p style="white-space: pre-line">{{ mainText }}</p>
        <div v-if="answer.status !== 'social'" class="shd-actions">
          <button type="button" class="shd-btn shd-btn--primary" @click="$emit('handoff', { reason, question })">
            {{ tr('talkHuman') }}
          </button>
        </div>
      </template>
    </template>
  </article>
</template>

<script setup>
// A checked answer from /ask. Every sentence on screen has passed the service's checker; the
// card only lays it out: sentences with their sources, exact quotes, verses and the lesson link.
import { computed } from 'vue';
import SourcedSentence from './SourcedSentence.vue';
import VerseList from './VerseList.vue';
import ReportMistake from './ReportMistake.vue';
import { isRtl, useT } from './i18n.js';

const props = defineProps({
  answer: { type: Object, default: null },
  question: { type: String, default: '' },
  lang: { type: String, default: 'en' },
  loading: { type: Boolean, default: false },
  stage: { type: Object, default: null },
  error: { type: Boolean, default: false },
});
defineEmits(['handoff', 'open-lesson', 'retry']);

const tr = useT(() => props.lang);

// Live progress while the service routes, retrieves and checks (the answer itself waits for the checker).
const stageText = computed(() => {
  const st = props.stage;
  if (!st) return tr('thinking');
  if (st.stage === 'routing') return tr('stageRouting');
  if (st.stage === 'found') return tr('stageFound', { pages: (st.pages || []).join(isRtl(props.lang) ? '، ' : ', ') });
  return tr('stageChecking');
});
const arrow = computed(() => (isRtl(props.lang) ? '←' : '→'));

const sourceMap = computed(() => Object.fromEntries((props.answer?.sources || []).map((s) => [s.id, s])));
const numbers = computed(() => {
  const n = {};
  for (const s of props.answer?.sentences || []) for (const id of s.sources || []) n[id] ??= Object.keys(n).length + 1;
  return n;
});

// The service puts the emergency message first in `text`, separated by a blank line.
const parts = computed(() => {
  const text = props.answer?.text || '';
  if (!props.answer?.route?.emergency) return { emergency: '', main: text };
  const [first, ...rest] = text.split(/\n\s*\n/);
  return { emergency: first.trim(), main: rest.join('\n\n').trim() };
});
const emergencyText = computed(() => parts.value.emergency);
const mainText = computed(() => parts.value.main);

const REASONS = ['fatwa_personal', 'crisis', 'practical_need', 'unsure'];
const reason = computed(() => {
  const a = props.answer;
  if (!a) return 'user_request';
  if (a.status === 'not_in_book') return 'not_in_book';
  if (a.route?.emergency) return 'crisis';
  return REASONS.includes(a.route?.label) ? a.route.label : 'unsure';
});

// AnswerResult has no id of its own yet; fall back to a short fingerprint of the question so a
// report still points at something a reviewer can find.
const answerId = computed(() => {
  if (props.answer?.id) return props.answer.id;
  let h = 0;
  for (const ch of props.question) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return `q${h.toString(36)}`;
});
</script>

<style scoped>
.shd-from-lesson { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; font-size: 14px; color: var(--shd-muted); }
</style>
