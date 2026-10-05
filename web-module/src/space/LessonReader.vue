<template>
  <article class="lsp-reader" :aria-labelledby="titleId">
    <header class="lsp-reader__head">
      <p class="lsp-reader__crumbs">
        <span class="lsp-chip lsp-chip--violet">{{ tr('unitLesson', { u: lesson.unit?.index ?? '', l: lessonNumber }) }}</span>
        <span v-if="lesson.unit?.title" class="lsp-reader__unit" dir="auto">{{ lesson.unit.title }}</span>
      </p>
      <h1 :id="titleId" ref="heading" tabindex="-1" dir="auto">{{ lesson.title }}</h1>
      <p class="lsp-reader__meta">
        <span v-if="pagesText"><SpaceIcon name="book" :size="16" />{{ pagesText }}</span>
        <span><SpaceIcon name="clock" :size="16" />{{ tr('readMinutes', { n: minutes }) }}</span>
        <span v-if="lesson.path_index && lesson.position?.total"><SpaceIcon name="path" :size="16" />{{ tr('lessonOf', { n: lesson.path_index, total: lesson.position.total }) }}</span>
      </p>
      <p class="lsp-reader__badges">
        <span v-if="lesson.reviewed" class="lsp-chip lsp-chip--teal"><SpaceIcon name="check" :size="14" />{{ tr('reviewedBadge') }}</span>
        <span v-else class="lsp-chip lsp-chip--amber"><SpaceIcon name="book" :size="14" />{{ tr('unreviewedBadge') }}</span>
        <span v-if="lesson.translated_explanation" class="lsp-chip lsp-chip--amber"><SpaceIcon name="globe" :size="14" />{{ tr('translatedBadge') }}</span>
      </p>
    </header>

    <aside v-if="saveHint" class="lsp-callout" :aria-label="tr('saveTitle')">
      <span class="lsp-callout__ic"><SpaceIcon name="save" :size="22" /></span>
      <div class="lsp-callout__body">
        <strong>{{ tr('saveTitle') }}</strong>
        <span>{{ tr('saveHintBody') }}</span>
      </div>
      <div class="lsp-callout__actions">
        <button type="button" class="lsp-btn lsp-btn--primary lsp-btn--sm" @click="$emit('save')">{{ tr('saveProgress') }}</button>
        <button type="button" class="lsp-icon-btn" :aria-label="tr('notNow')" :title="tr('notNow')" @click="$emit('dismiss-save')"><SpaceIcon name="x" :size="18" /></button>
      </div>
    </aside>

    <!-- Reviewed lessons: a short summary, every sentence with its source marker. -->
    <section v-if="lesson.reviewed && lesson.summary?.length" class="lsp-card lsp-sec" :aria-labelledby="`${titleId}-sum`">
      <div class="lsp-sec__head">
        <h2 :id="`${titleId}-sum`"><SpaceIcon name="bookOpen" />{{ tr('summaryTitle') }}</h2>
        <p class="lsp-muted lsp-small">{{ tr('tapMarker') }}</p>
      </div>
      <ul class="lsp-summary">
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
    </section>

    <!-- Not yet reviewed: the book's own words and page, nothing generated around them. -->
    <section v-if="!lesson.reviewed" class="lsp-card lsp-sec">
      <p class="lsp-note"><SpaceIcon name="book" :size="18" />{{ tr('unreviewed') }}</p>
      <figure v-for="src in bookText" :key="src.id" class="lsp-bookquote">
        <blockquote :lang="src.lang" :dir="isRtl(src.lang) ? 'rtl' : 'ltr'">{{ plain(src.text) }}</blockquote>
        <figcaption>{{ tr('sourceRef', { book: tr('bookName'), page: src.page }) }}</figcaption>
      </figure>
    </section>

    <!-- Acts of worship: every step, verbatim and in the book's order. -->
    <section v-for="(st, si) in steps" :key="`st${si}`" class="lsp-card lsp-sec lsp-steps" :aria-labelledby="`${titleId}-steps${si}`">
      <div class="lsp-sec__head">
        <h2 :id="`${titleId}-steps${si}`"><SpaceIcon name="file" />{{ tr('stepsTitle') }}</h2>
      </div>
      <template v-for="(row, ri) in st.rows" :key="ri">
        <p v-if="row.intro" class="lsp-steps__intro" dir="auto">{{ row.intro }}</p>
      </template>
      <ol class="lsp-steps__list">
        <li v-for="(row, ri) in st.rows.filter((r) => !r.intro)" :key="ri" dir="auto">
          <span class="lsp-steps__n" aria-hidden="true">{{ row.n }}</span>
          <span class="lsp-steps__text">{{ row.text }}</span>
        </li>
      </ol>
      <div v-if="st.source" class="lsp-steps__src">
        <SourcedSentence tag="span" :text="tr('sourceRef', { book: tr('bookName'), page: pageOf(st.source) })" :sources="[st.source]" :source-map="sourceMap" :numbers="numbers" :lang="lang" />
      </div>
    </section>

    <section v-if="backgroundPassages.length || lesson.background_note?.text" class="lsp-card lsp-sec lsp-sec--soft">
      <div class="lsp-sec__head"><h2><SpaceIcon name="heart" />{{ tr('backgroundNote') }}</h2></div>
      <figure v-for="src in backgroundPassages" :key="src.id" class="lsp-bookquote">
        <blockquote :lang="src.lang" :dir="isRtl(src.lang) ? 'rtl' : 'ltr'">{{ plain(src.text) }}</blockquote>
        <figcaption>{{ tr('sourceRef', { book: tr('bookName'), page: src.page }) }}</figcaption>
      </figure>
      <SourcedSentence
        v-if="!backgroundPassages.length"
        :text="lesson.background_note.text"
        :sources="lesson.background_note.sources || []"
        :source-map="sourceMap"
        :numbers="numbers"
        :lang="lang"
      />
    </section>

    <section v-if="lesson.verses?.length" class="lsp-card lsp-sec lsp-verses">
      <VerseList :verses="lesson.verses" :lang="lang" />
    </section>

    <section v-if="lesson.audio?.length" class="lsp-card lsp-sec lsp-audio" :aria-labelledby="`${titleId}-audio`">
      <div class="lsp-sec__head"><h2 :id="`${titleId}-audio`"><SpaceIcon name="headphones" />{{ tr('audioTitle') }}</h2></div>
      <div v-for="a in lesson.audio" :key="a.surah" class="lsp-audio__item">
        <p class="lsp-audio__name">{{ a.title }}</p>
        <div class="lsp-audio__pair">
          <label class="lsp-audio__label">{{ tr('audioTeaching') }}
            <audio :src="a.teaching.url" controls preload="none" :title="a.teaching.label"></audio>
          </label>
          <label class="lsp-audio__label">{{ tr('audioMurattal') }}
            <audio :src="a.murattal.url" controls preload="none" :title="a.murattal.label"></audio>
          </label>
        </div>
      </div>
      <p class="lsp-muted lsp-small">mp3quran.net</p>
    </section>

    <!-- Optional: skipping is as good as answering, and nothing is graded. -->
    <section v-if="lesson.reviewed && lesson.check_question && !checkSkipped" class="lsp-card lsp-sec lsp-check-q" :aria-labelledby="`${titleId}-check`">
      <div class="lsp-sec__head"><h2 :id="`${titleId}-check`"><SpaceIcon name="question" />{{ tr('checkTitle') }}</h2></div>
      <p class="lsp-check-q__q" dir="auto">{{ lesson.check_question.question }}</p>
      <div class="lsp-options" role="radiogroup" :aria-labelledby="`${titleId}-check`">
        <label v-for="(opt, i) in lesson.check_question.options" :key="i" class="lsp-option" :class="optionClass(i)">
          <input v-model="selected" type="radio" :name="`${titleId}-check`" :value="i" :disabled="checked" />
          <span class="lsp-option__dot" aria-hidden="true"></span>
          <span dir="auto">{{ opt }}</span>
        </label>
      </div>
      <div v-if="checked" class="lsp-feedback" :class="isCorrect ? 'is-right' : 'is-wrong'" role="status">
        <strong>{{ isCorrect ? tr('correct') : tr('incorrect', { a: lesson.check_question.options[lesson.check_question.answer_index] }) }}</strong>
        <SourcedSentence v-if="lesson.check_question.source" tag="span" text="" :sources="[lesson.check_question.source]" :source-map="sourceMap" :numbers="numbers" :lang="lang" />
      </div>
      <div v-else class="lsp-row">
        <button type="button" class="lsp-btn lsp-btn--secondary" :disabled="selected === null" @click="checked = true">{{ tr('check') }}</button>
        <button type="button" class="lsp-btn lsp-btn--ghost" @click="checkSkipped = true">{{ tr('skip') }}</button>
      </div>
    </section>

    <section v-if="lesson.exercises?.length" class="lsp-card lsp-sec lsp-exercises">
      <ExerciseList :exercises="lesson.exercises" :lang="lang" />
    </section>

    <footer class="lsp-reader__foot">
      <button
        type="button"
        class="lsp-done"
        :class="{ 'is-saving': completing === 'saving', 'is-done': completing === 'done' }"
        :disabled="!!completing"
        :aria-busy="completing === 'saving' ? 'true' : 'false'"
        @click="$emit('next', checkAnswer)"
      >
        <span class="lsp-done__fill" aria-hidden="true"></span>
        <span class="lsp-done__label">
          <template v-if="completing === 'saving'"><span class="shd-spinner lsp-spinner-light" aria-hidden="true"></span>{{ tr('savingProgress') }}</template>
          <template v-else-if="completing === 'done'"><SpaceIcon name="check" :size="22" />{{ tr('doneMark') }}</template>
          <template v-else>{{ isNext || !lesson.next ? tr('doneNext') : tr('doneReview') }} <SpaceIcon name="next" :size="22" /></template>
        </span>
      </button>
      <div class="lsp-reader__more">
        <button type="button" class="lsp-btn lsp-btn--secondary" @click="$emit('ask')"><SpaceIcon name="message" :size="18" />{{ tr('askLessonTitle') }}</button>
        <button type="button" class="lsp-btn lsp-btn--ghost" @click="$emit('handoff')"><SpaceIcon name="users" :size="18" />{{ tr('talkHuman') }}</button>
      </div>
      <ReportMistake :target="`lesson:${lesson.id}`" :lang="lang" />
    </footer>
  </article>
</template>

<script setup>
// The lesson, top to bottom as in the user journey: where you are, what the book says (each
// sentence traceable), the steps verbatim, background passages, verses, listen-and-repeat, an
// optional check, exercises, and one big way onward.
import { computed, onMounted, ref } from 'vue';
import SourcedSentence from '../SourcedSentence.vue';
import VerseList from '../VerseList.vue';
import ExerciseList from '../ExerciseList.vue';
import ReportMistake from '../ReportMistake.vue';
import SpaceIcon from './SpaceIcon.vue';
import { isRtl, useT } from '../i18n.js';

const props = defineProps({
  lesson: { type: Object, required: true },
  lang: { type: String, default: 'en' },
  completing: { type: String, default: '' }, // '' | 'saving' | 'done'
  isNext: { type: Boolean, default: true },
  saveHint: { type: Boolean, default: false },
});
defineEmits(['next', 'ask', 'handoff', 'save', 'dismiss-save']);

const tr = useT(() => props.lang);
const titleId = `lsp-lesson-${props.lesson.id}`;
const heading = ref(null);

// The book's passages verbatim: drop Markdown emphasis marks, keep line breaks.
const plain = (t) => (t || '').replace(/\*\*?|__/g, '').replace(/^>\s?/gm, '').replace(/\n{2,}/g, '\n').trim();

const lessonNumber = computed(() => /l(\d+)$/.exec(props.lesson.id)?.[1] ?? props.lesson.index);
const pagesText = computed(() => {
  const p = props.lesson.pages;
  if (!Array.isArray(p) || !p.length) return '';
  return p[0] === p.at(-1) ? tr('sourceRef', { book: tr('bookName'), page: p[0] }) : tr('pagesRef', { from: p[0], to: p.at(-1) });
});
const bookText = computed(() => (props.lesson.book_text?.length ? props.lesson.book_text : props.lesson.sources || []));
const backgroundPassages = computed(() => (Array.isArray(props.lesson.background_note) ? props.lesson.background_note : []));

// Reading time from the words on the page; Arabic is read a little slower.
const minutes = computed(() => {
  const L = props.lesson;
  const text = [
    ...(L.summary || []).map((s) => s.text),
    ...(L.steps || []).map((s) => s.text),
    ...(!L.reviewed ? bookText.value.map((s) => s.text) : []),
  ].join(' ');
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / (isRtl(props.lang) ? 130 : 180)));
});

// Steps arrive as the book's numbered list; keep its numbers and wording, lay it out as a list.
const steps = computed(() =>
  (props.lesson.steps || []).map((st) => {
    const rows = [];
    for (const line of plain(st.text).split('\n').map((l) => l.trim()).filter(Boolean)) {
      const m = /^([0-9٠-٩]+)\s*[.)\-–]\s*(.*)$/.exec(line);
      if (m) rows.push({ n: m[1], text: m[2] });
      else if (rows.length && !rows.at(-1).intro) rows.at(-1).text += `\n${line}`;
      else rows.push({ intro: line });
    }
    return { rows, source: st.source || null };
  }),
);

const sourceMap = computed(() => Object.fromEntries((props.lesson.sources || []).map((s) => [s.id, s])));
// Number passages in reading order so the same passage keeps its number across the lesson.
const numbers = computed(() => {
  const n = {};
  const add = (id) => id && (n[id] ??= Object.keys(n).length + 1);
  (props.lesson.summary || []).forEach((s) => (s.sources || []).forEach(add));
  (props.lesson.steps || []).forEach((s) => add(s.source));
  (props.lesson.background_note?.sources || []).forEach(add);
  add(props.lesson.check_question?.source);
  return n;
});
const pageOf = (id) => sourceMap.value[id]?.page ?? (/:p(\d+)/.exec(id)?.[1] || '?');

const selected = ref(null);
const checked = ref(false);
const checkSkipped = ref(false);
const isCorrect = computed(() => selected.value === props.lesson.check_question?.answer_index);
const checkAnswer = computed(() => (checked.value ? selected.value : null));
function optionClass(i) {
  const cls = { 'is-picked': selected.value === i };
  if (!checked.value) return cls;
  if (i === props.lesson.check_question.answer_index) cls['is-right'] = true;
  else if (i === selected.value) cls['is-wrong'] = true;
  return cls;
}

defineExpose({ focus: () => heading.value?.focus({ preventScroll: true }) });
onMounted(() => {});
</script>
