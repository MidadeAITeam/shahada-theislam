<template>
  <article class="shd-card shd-lesson" :aria-labelledby="titleId">
    <header class="shd-lesson__head">
      <p class="shd-eyebrow">
        {{ tr('unitLesson', { u: lesson.unit?.index ?? '', l: lessonNumber }) }}<template v-if="lesson.unit?.title"> · {{ lesson.unit.title }}</template>
      </p>
      <h3 :id="titleId" dir="auto">{{ lesson.title }}</h3>
      <div v-if="lesson.position?.total" class="shd-progress">
        <div
          class="shd-progress__track"
          role="progressbar"
          :aria-label="tr('progressLabel')"
          :aria-valuenow="lesson.position.done"
          aria-valuemin="0"
          :aria-valuemax="lesson.position.total"
        >
          <div class="shd-progress__bar" :style="{ width: `${progressPct}%` }"></div>
        </div>
        <span>{{ tr('progress', { done: lesson.position.done, total: lesson.position.total }) }}</span>
      </div>
      <span v-if="lesson.translated_explanation" class="shd-badge">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 8 6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6" /></svg>
        {{ tr('translatedBadge') }}
      </span>
    </header>

    <!-- Reviewed lessons: a short summary, every sentence with its source marker. -->
    <ul v-if="lesson.reviewed && lesson.summary?.length" class="shd-summary">
      <SourcedSentence
        v-for="(s, i) in lesson.summary"
        :key="`s${i}`"
        tag="li"
        :text="s.text"
        :sources="s.sources || []"
        :source-map="sourceMap"
        :numbers="numbers"
        :lang="lang"
      />
    </ul>

    <!-- Not yet reviewed: the book's own words and page, nothing generated around them. -->
    <template v-if="!lesson.reviewed">
      <p class="shd-muted">{{ tr('unreviewed') }}</p>
      <figure v-for="src in lesson.sources || []" :key="src.id" class="shd-quote">
        <blockquote style="margin: 0; white-space: pre-line" :lang="src.lang" :dir="isRtl(src.lang) ? 'rtl' : 'ltr'">{{ src.text }}</blockquote>
        <cite>{{ tr('sourceRef', { book: tr('bookName'), page: src.page }) }}</cite>
      </figure>
    </template>

    <!-- Acts of worship: every step, verbatim and in the book's order. -->
    <section v-if="lesson.steps?.length">
      <h4 class="shd-eyebrow">{{ tr('stepsTitle') }}</h4>
      <ol class="shd-steps">
        <SourcedSentence
          v-for="(st, i) in lesson.steps"
          :key="`st${i}`"
          tag="li"
          :text="st.text"
          :sources="st.source ? [st.source] : []"
          :source-map="sourceMap"
          :numbers="numbers"
          :lang="lang"
        />
      </ol>
    </section>

    <section v-if="lesson.background_note" class="shd-card shd-card--soft">
      <h4 class="shd-eyebrow">{{ tr('backgroundNote') }}</h4>
      <SourcedSentence
        :text="lesson.background_note.text"
        :sources="lesson.background_note.sources || []"
        :source-map="sourceMap"
        :numbers="numbers"
        :lang="lang"
      />
    </section>

    <VerseList :verses="lesson.verses || []" :lang="lang" />

    <section v-if="lesson.audio && lesson.audio.length" class="shd-audio" :aria-label="tr('audioTitle')">
      <h4 class="shd-audio__title">{{ tr('audioTitle') }}</h4>
      <div v-for="a in lesson.audio" :key="a.surah" class="shd-audio__item">
        <p class="shd-audio__name">{{ a.title }}</p>
        <label class="shd-audio__label">{{ tr('audioTeaching') }}
          <audio :src="a.teaching.url" controls preload="none" :title="a.teaching.label"></audio>
        </label>
        <label class="shd-audio__label">{{ tr('audioMurattal') }}
          <audio :src="a.murattal.url" controls preload="none" :title="a.murattal.label"></audio>
        </label>
      </div>
      <p class="shd-audio__credit">mp3quran.net</p>
    </section>

    <!-- Optional: skipping is as good as answering, and nothing is graded. -->
    <section v-if="lesson.reviewed && lesson.check_question && !checkSkipped" class="shd-card shd-card--soft">
      <fieldset class="shd-options">
        <legend class="shd-eyebrow" style="margin-bottom: 0.25rem">{{ tr('checkTitle') }}</legend>
        <p style="font-weight: 600; margin-bottom: 0.3rem">{{ lesson.check_question.question }}</p>
        <label
          v-for="(opt, i) in lesson.check_question.options"
          :key="i"
          class="shd-option"
          :class="optionClass(i)"
        >
          <input v-model="selected" type="radio" :name="`${titleId}-check`" :value="i" :disabled="checked" />
          <span>{{ opt }}</span>
        </label>
      </fieldset>
      <div v-if="checked" role="status" :class="isCorrect ? 'shd-success' : ''">
        {{ isCorrect ? tr('correct') : tr('incorrect', { a: lesson.check_question.options[lesson.check_question.answer_index] }) }}
        <SourcedSentence
          v-if="lesson.check_question.source"
          tag="span"
          text=""
          :sources="[lesson.check_question.source]"
          :source-map="sourceMap"
          :numbers="numbers"
          :lang="lang"
        />
      </div>
      <div v-if="!checked" class="shd-actions">
        <button type="button" class="shd-btn shd-btn--small" :disabled="selected === null" @click="checked = true">{{ tr('check') }}</button>
        <button type="button" class="shd-btn shd-btn--quiet shd-btn--small" @click="checkSkipped = true">{{ tr('skip') }}</button>
      </div>
    </section>

    <!-- Ask about this lesson: the tutor is restricted to this lesson's passages. -->
    <section class="shd-ask">
      <h4 class="shd-eyebrow">{{ tr('askLessonTitle') }}</h4>
      <p class="shd-muted">{{ tr('askLessonHint') }}</p>
      <div v-for="(item, i) in asked" :key="`a${i}`" class="shd-ask__item">
        <p class="shd-bubble" dir="auto">{{ item.question }}</p>
        <AnswerCard
          :answer="item.answer"
          :question="item.question"
          :loading="item.loading"
          :stage="item.stage"
          :error="item.error"
          :lang="lang"
          @retry="runAsk(item)"
          @handoff="$emit('handoff', $event)"
          @open-lesson="$emit('open-lesson', $event)"
        />
      </div>
      <form class="shd-row" @submit.prevent="askLesson">
        <label :for="`${titleId}-ask`" class="shd-sr">{{ tr('askLessonTitle') }}</label>
        <input :id="`${titleId}-ask`" v-model="question" class="shd-input" type="text" :placeholder="tr('askPlaceholder')" maxlength="500" />
        <button type="submit" class="shd-btn" :disabled="!question.trim()">{{ tr('ask') }}</button>
      </form>
    </section>

    <footer v-if="active" class="shd-actions">
      <button type="button" class="shd-btn shd-btn--primary" :disabled="busy" @click="$emit('next', checkAnswer)">
        <span v-if="busy" class="shd-spinner" aria-hidden="true"></span>
        {{ first ? tr('continueCurriculum') : tr('nextLesson') }}
      </button>
      <button v-if="first" type="button" class="shd-btn" @click="$emit('ask-general')">{{ tr('haveQuestion') }}</button>
      <button v-else type="button" class="shd-btn" @click="$emit('index')">{{ tr('index') }}</button>
      <button type="button" class="shd-btn" @click="$emit('handoff', { reason: 'user_request', question: '' })">{{ tr('talkHuman') }}</button>
    </footer>
    <ReportMistake :target="`lesson:${lesson.id}`" :lang="lang" />
  </article>
</template>

<script setup>
// One lesson card, top to bottom as in the user journey: where you are, what the book says
// (each sentence traceable), the steps verbatim, verses, an optional check, a lesson-bound
// question box, and the ways onward.
import { computed, reactive, ref } from 'vue';
import SourcedSentence from './SourcedSentence.vue';
import VerseList from './VerseList.vue';
import AnswerCard from './AnswerCard.vue';
import ReportMistake from './ReportMistake.vue';
import { api } from './api.js';
import { apiLang, isRtl, useT } from './i18n.js';

const props = defineProps({
  lesson: { type: Object, required: true },
  lang: { type: String, default: 'en' },
  // Only the newest lesson in the conversation carries the buttons that move the path on.
  active: { type: Boolean, default: true },
  // The Shahada lesson ends in "continue the curriculum / I have a question" instead.
  first: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
});
defineEmits(['next', 'index', 'handoff', 'ask-general', 'open-lesson']);

const tr = useT(() => props.lang);
const titleId = `shd-lesson-${props.lesson.id}-${Math.random().toString(36).slice(2, 7)}`;

// Lesson number within its unit, as the book counts it ("u3l3" is lesson 3 of unit 3).
const lessonNumber = computed(() => /l(\d+)$/.exec(props.lesson.id)?.[1] ?? props.lesson.index);
const progressPct = computed(() => {
  const p = props.lesson.position;
  return p?.total ? Math.round((100 * p.done) / p.total) : 0;
});

const sourceMap = computed(() => Object.fromEntries((props.lesson.sources || []).map((s) => [s.id, s])));
// Number passages in reading order so the same passage keeps its number across the card.
const numbers = computed(() => {
  const n = {};
  const add = (id) => id && (n[id] ??= Object.keys(n).length + 1);
  (props.lesson.summary || []).forEach((s) => (s.sources || []).forEach(add));
  (props.lesson.steps || []).forEach((s) => add(s.source));
  (props.lesson.background_note?.sources || []).forEach(add);
  add(props.lesson.check_question?.source);
  return n;
});

const selected = ref(null);
const checked = ref(false);
const checkSkipped = ref(false);
const isCorrect = computed(() => selected.value === props.lesson.check_question?.answer_index);
const checkAnswer = computed(() => (checked.value ? selected.value : null));
function optionClass(i) {
  if (!checked.value) return '';
  if (i === props.lesson.check_question.answer_index) return 'shd-option--right';
  return i === selected.value ? 'shd-option--wrong' : '';
}

const question = ref('');
const asked = ref([]);
function askLesson() {
  const q = question.value.trim();
  if (!q) return;
  question.value = '';
  const item = reactive({ question: q, answer: null, loading: true, error: false, stage: null });
  asked.value.push(item);
  runAsk(item);
}
async function runAsk(item) {
  item.loading = true;
  item.error = false;
  try {
    item.stage = null;
    item.answer = await api.askStream(item.question, apiLang(props.lang), props.lesson.id, (st) => (item.stage = st));
  } catch {
    item.error = true;
  } finally {
    item.loading = false;
  }
}
</script>

<style scoped>
.shd-audio { margin-top: 1rem; padding: 0.75rem 1rem; border-radius: 12px; background: #f2f4ff; }
.shd-audio__title { font-size: 1rem; font-weight: 700; margin: 0 0 0.5rem; }
.shd-audio__item { padding: 0.5rem 0; border-top: 1px solid #e3e6f5; }
.shd-audio__item:first-of-type { border-top: 0; }
.shd-audio__name { font-weight: 600; margin: 0 0 0.25rem; }
.shd-audio__label { display: block; font-size: 0.85rem; color: #4a5070; margin: 0.25rem 0; }
.shd-audio__label audio { display: block; width: 100%; margin-top: 0.2rem; }
.shd-audio__credit { font-size: 0.75rem; color: #6b7090; margin: 0.25rem 0 0; }
.shd-lesson__head { display: flex; flex-direction: column; gap: 0.35rem; }
.shd-ask { display: flex; flex-direction: column; gap: 0.5rem; padding-top: 0.6rem; border-top: 1px solid var(--shd-line); }
.shd-ask__item { display: flex; flex-direction: column; gap: 0.5rem; }
</style>
