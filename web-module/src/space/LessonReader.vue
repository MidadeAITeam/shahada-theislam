<template>
  <article class="lsp-reader" :aria-labelledby="titleId">
    <header class="lsp-reader__head">
      <!-- One numbering system: the learner's path first; the book's own unit and lesson only as a reference. -->
      <p class="lsp-reader__crumbs">
        <span v-if="lesson.path_index && lesson.position?.total" class="lsp-chip lsp-chip--violet"><SpaceIcon name="path" :size="14" />{{ tr('lessonOf', { n: lesson.path_index, total: lesson.position.total }) }}</span>
        <span class="lsp-reader__unit" dir="auto">{{ tr('bookPlace', { book: tr('bookName'), u: lesson.unit?.index ?? '', l: lessonNumber }) }}<template v-if="lesson.unit?.title"> · {{ lesson.unit.title }}</template></span>
      </p>
      <h1 :id="titleId" ref="heading" tabindex="-1" dir="auto">{{ lesson.title }}</h1>
      <p class="lsp-reader__meta">
        <span v-if="pagesText"><SpaceIcon name="book" :size="16" />{{ pagesText }}</span>
        <span><SpaceIcon name="clock" :size="16" />{{ tr('readMinutes', { n: minutes }) }}</span>
      </p>
      <p class="lsp-reader__badges">
        <span v-if="lesson.reviewed" class="lsp-chip lsp-chip--teal"><SpaceIcon name="check" :size="14" />{{ tr('reviewedBadge') }}</span>
        <span v-else class="lsp-chip lsp-chip--amber"><SpaceIcon name="book" :size="14" />{{ tr('unreviewedBadge') }}</span>
        <span v-if="lesson.translated_explanation" class="lsp-chip lsp-chip--amber"><SpaceIcon name="globe" :size="14" />{{ tr('translatedBadge') }}</span>
      </p>
    </header>

    <p v-if="firstNote" class="lsp-note lsp-note--info"><SpaceIcon name="path" :size="18" />{{ firstNote }}</p>

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
        <PassageText tag="blockquote" :text="src.text" :lang="src.lang" :dir="isRtl(src.lang) ? 'rtl' : 'ltr'" />
        <figcaption>{{ tr('sourceRef', { book: tr('bookName'), page: src.page }) }}</figcaption>
      </figure>
    </section>

    <!-- Acts of worship: every step, verbatim and in the book's order. -->
    <section v-for="(st, si) in steps" :key="`st${si}`" class="lsp-card lsp-sec lsp-steps" :aria-labelledby="`${titleId}-steps${si}`">
      <div class="lsp-sec__head">
        <h2 :id="`${titleId}-steps${si}`"><SpaceIcon name="file" />{{ tr('stepsTitle') }}</h2>
      </div>
      <template v-for="(row, ri) in st.rows" :key="ri">
        <p v-if="row.intro" class="lsp-steps__intro" dir="auto"><InlineText :text="row.intro" /></p>
      </template>
      <ol class="lsp-steps__list">
        <li v-for="(row, ri) in st.rows.filter((r) => !r.intro)" :key="ri" dir="auto">
          <span class="lsp-steps__n" aria-hidden="true">{{ row.n }}</span>
          <InlineText class="lsp-steps__text" :text="row.text" />
        </li>
      </ol>
      <div v-if="st.source" class="lsp-steps__src">
        <SourcedSentence tag="span" :text="tr('sourceRef', { book: tr('bookName'), page: pageOf(st.source) })" :sources="[st.source]" :source-map="sourceMap" :numbers="numbers" :lang="lang" />
      </div>
    </section>

    <section v-if="backgroundPassages.length || lesson.background_note?.text" class="lsp-card lsp-sec lsp-sec--soft">
      <div class="lsp-sec__head"><h2><SpaceIcon name="heart" />{{ tr('backgroundNote') }}</h2></div>
      <figure v-for="src in backgroundPassages" :key="src.id" class="lsp-bookquote">
        <PassageText tag="blockquote" :text="src.text" :lang="src.lang" :dir="isRtl(src.lang) ? 'rtl' : 'ltr'" />
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

    <section v-if="otherVerses.length" class="lsp-card lsp-sec lsp-verses">
      <VerseList :verses="otherVerses" :lang="lang" />
    </section>

    <ListenRepeat v-if="lesson.audio?.length" :items="lesson.audio" :verses="lesson.verses || []" :lang="lang" />

    <!-- Optional: skipping is as good as answering, and nothing is graded. -->
    <section v-if="lesson.reviewed && lesson.check_question && !checkSkipped" class="lsp-card lsp-sec lsp-check-q" :aria-labelledby="`${titleId}-check`">
      <div class="lsp-sec__head"><h2 :id="`${titleId}-check`"><SpaceIcon name="question" />{{ tr('checkTitle') }}</h2></div>
      <p class="lsp-check-q__q" dir="auto"><InlineText :text="lesson.check_question.question" /></p>
      <div class="lsp-options" role="radiogroup" :aria-labelledby="`${titleId}-check`">
        <label v-for="(opt, i) in lesson.check_question.options" :key="i" class="lsp-option" :class="optionClass(i)">
          <input v-model="selected" type="radio" :name="`${titleId}-check`" :value="i" :disabled="checked" />
          <span class="lsp-option__dot" aria-hidden="true">
            <SpaceIcon v-if="checked && i === lesson.check_question.answer_index" name="check" :size="14" />
            <SpaceIcon v-else-if="checked && i === selected" name="x" :size="14" />
          </span>
          <span dir="auto"><InlineText :text="opt" /></span>
          <span v-if="checked && i === lesson.check_question.answer_index" class="lsp-sr">{{ tr('correctOption') }}</span>
          <span v-else-if="checked && i === selected" class="lsp-sr">{{ tr('yourChoice') }}</span>
        </label>
      </div>
      <div v-if="checked" class="lsp-feedback" :class="isCorrect ? 'is-right' : 'is-wrong'" role="status">
        <strong>{{ isCorrect ? tr('correct') : tr('incorrect', { a: lesson.check_question.options[lesson.check_question.answer_index] }) }}</strong>
        <button v-if="lesson.check_question.source" type="button" class="lsp-srcbtn" :aria-haspopup="openSource ? 'dialog' : undefined" @click="showSource(lesson.check_question.source, $event)">
          <SpaceIcon name="book" :size="15" />{{ tr('sourcePage', { page: pageOf(lesson.check_question.source) }) }}
        </button>
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
      <!-- The learner's next lesson: one button saves it and moves on. An earlier or later lesson
           opened from the path: going on and marking it done are two separate choices. -->
      <button
        v-if="isNext || (!isDone && !hasNext)"
        type="button"
        class="lsp-done"
        :class="{ 'is-saving': completing === 'saving', 'is-done': completing === 'done' }"
        :disabled="!!completing"
        :aria-busy="completing === 'saving' ? 'true' : 'false'"
        :aria-describedby="saveError ? `${titleId}-saveerr` : undefined"
        @click="$emit('next', checkAnswer)"
      >
        <span class="lsp-done__fill" aria-hidden="true"></span>
        <span class="lsp-done__label">
          <template v-if="completing === 'saving'"><span class="shd-spinner lsp-spinner-light" aria-hidden="true"></span>{{ tr('savingProgress') }}</template>
          <template v-else-if="completing === 'done'"><SpaceIcon name="check" :size="22" />{{ tr('doneMark') }}</template>
          <template v-else>{{ tr('doneNext') }} <SpaceIcon name="next" :size="22" /></template>
        </span>
      </button>
      <template v-else>
        <p v-if="isDone" class="lsp-reviewed"><SpaceIcon name="check" :size="18" />{{ tr('alreadyDone') }}</p>
        <div class="lsp-reader__pair">
          <button
            v-if="!isDone"
            type="button"
            class="lsp-btn lsp-btn--secondary lsp-btn--lg"
            :disabled="!!completing"
            :aria-busy="completing === 'saving' ? 'true' : 'false'"
            :aria-describedby="saveError ? `${titleId}-saveerr` : undefined"
            @click="$emit('mark-done', checkAnswer)"
          >
            <span v-if="completing === 'saving'" class="shd-spinner" aria-hidden="true"></span>
            <SpaceIcon v-else name="check" :size="20" />{{ completing === 'saving' ? tr('savingProgress') : tr('markDone') }}
          </button>
          <button type="button" class="lsp-done lsp-done--nav" :disabled="!!completing" @click="$emit('go-next')">
            <span class="lsp-done__label">{{ hasNext ? tr('goNext') : tr('goFinish') }} <SpaceIcon name="next" :size="22" /></span>
          </button>
        </div>
      </template>
      <p v-if="saveError" :id="`${titleId}-saveerr`" class="lsp-save-err" role="alert"><SpaceIcon name="x" :size="16" />{{ tr('notSaved') }}</p>
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
import { computed, inject, ref } from 'vue';
import SourcedSentence from '../SourcedSentence.vue';
import InlineText from '../InlineText.vue';
import PassageText from '../PassageText.vue';
import ListenRepeat from './ListenRepeat.vue';
import VerseList from '../VerseList.vue';
import ExerciseList from '../ExerciseList.vue';
import ReportMistake from '../ReportMistake.vue';
import SpaceIcon from './SpaceIcon.vue';
import { isRtl, useT } from '../i18n.js';
import { clean, words } from '../format.js';

const props = defineProps({
  lesson: { type: Object, required: true },
  lang: { type: String, default: 'en' },
  completing: { type: String, default: '' }, // '' | 'saving' | 'done'
  isNext: { type: Boolean, default: true },
  isDone: { type: Boolean, default: false }, // already completed (reviewing it)
  hasNext: { type: Boolean, default: true }, // the learner still has a next lesson on the path
  saveError: { type: Boolean, default: false }, // the last "done" could not be saved
  firstNote: { type: String, default: '' }, // why this lesson comes before the learner's choice
  saveHint: { type: Boolean, default: false },
});
defineEmits(['next', 'mark-done', 'go-next', 'ask', 'handoff', 'save', 'dismiss-save']);

const tr = useT(() => props.lang);
const titleId = `lsp-lesson-${props.lesson.id}`;
const heading = ref(null);

// The book's passages verbatim: drop Markdown emphasis marks, tags and markers, keep line breaks.
const plain = (t) => clean(t).replace(/^>\s?/gm, '').replace(/\n{2,}/g, '\n').trim();
const openSource = inject('shdOpenSource', null);

const lessonNumber = computed(() => /l(\d+)$/.exec(props.lesson.id)?.[1] ?? props.lesson.index);
const pagesText = computed(() => {
  const p = props.lesson.pages;
  if (!Array.isArray(p) || !p.length) return '';
  return p[0] === p.at(-1) ? tr('sourceRef', { book: tr('bookName'), page: p[0] }) : tr('pagesRef', { from: p[0], to: p.at(-1) });
});
const bookText = computed(() => (props.lesson.book_text?.length ? props.lesson.book_text : props.lesson.sources || []));
const backgroundPassages = computed(() => (Array.isArray(props.lesson.background_note) ? props.lesson.background_note : []));

// Reading time from everything the lesson asks the learner to read: summary, steps, the book's
// passages, the check and the exercises. Arabic is read a little slower; never under two minutes.
const minutes = computed(() => {
  const L = props.lesson;
  const cq = L.check_question;
  const texts = [
    ...(L.summary || []).map((s) => s.text),
    ...(L.steps || []).map((s) => s.text),
    ...bookText.value.map((s) => s.text),
    ...backgroundPassages.value.map((s) => s.text),
    L.background_note?.text,
    cq?.question,
    ...(cq?.options || []),
    ...(L.exercises || []).flatMap((e) => [e.prompt, ...(e.options || []), ...(e.explanation || []).map((x) => x.text)]),
    ...(L.verses || []).flatMap((v) => [v.arabic, v.meaning]),
  ];
  const n = texts.reduce((sum, t) => sum + (typeof t === 'string' ? words(t) : 0), 0);
  return Math.max(2, Math.ceil(n / (isRtl(props.lang) ? 130 : 180)));
});
// Verses of a surah played in "listen and repeat" are shown beside the player, not twice.
const audioSurahs = computed(() => new Set((props.lesson.audio || []).map((a) => String(a.surah))));
const otherVerses = computed(() => (props.lesson.verses || []).filter((v) => !audioSurahs.value.has(String(v.ref || '').split(':')[0])));

// Steps arrive as the book's numbered list; keep its numbers and wording, lay it out as a list.
const steps = computed(() =>
  (props.lesson.steps || []).map((st) => {
    const rows = [];
    // Headings lose their "#", sub-points their "- " (a bullet instead).
    const lines = plain(st.text).split('\n').map((l) => l.trim().replace(/^#{1,6}\s+/, '').replace(/^[-*]\s+/, '• '));
    for (const line of lines.filter(Boolean)) {
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
function showSource(id, event) {
  openSource?.({ id, number: numbers.value[id], page: pageOf(id), source: sourceMap.value[id] || null, trigger: event?.currentTarget });
}

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
</script>
