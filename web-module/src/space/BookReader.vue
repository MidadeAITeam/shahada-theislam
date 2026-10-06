<template>
  <section ref="root" class="lsp-book" :aria-labelledby="`${uid}-h`">
    <div class="lsp-book__bar">
      <button v-if="canBack" type="button" class="lsp-btn lsp-btn--ghost lsp-btn--sm" @click="$emit('close')">
        <SpaceIcon name="back" :size="16" />{{ tr('bookBack') }}
      </button>
      <button type="button" class="lsp-btn lsp-btn--sm" :class="page ? 'lsp-btn--secondary' : 'lsp-btn--primary'" :aria-current="page ? undefined : 'page'" @click="go(null)">
        <SpaceIcon name="path" :size="16" />{{ tr('bookContents') }}
      </button>
      <form class="lsp-book__jump" @submit.prevent="jump">
        <label :for="`${uid}-jump`">{{ tr('bookJump') }}</label>
        <input
          :id="`${uid}-jump`"
          v-model="jumpTo"
          class="lsp-input"
          type="number"
          inputmode="numeric"
          :min="toc?.pages?.[0]"
          :max="toc?.pages?.at(-1)"
          :aria-describedby="`${uid}-range`"
          :aria-invalid="jumpError ? 'true' : undefined"
        />
        <button type="submit" class="lsp-btn lsp-btn--secondary lsp-btn--sm" :disabled="!jumpTo">{{ tr('bookJumpGo') }}</button>
        <span :id="`${uid}-range`" class="lsp-sr">{{ toc ? tr('bookJumpRange', { first: toc.pages[0], last: toc.pages.at(-1) }) : '' }}</span>
      </form>
    </div>
    <p v-if="jumpError" class="shd-error lsp-small" role="alert">{{ jumpError }}</p>
    <p v-if="toc?.translated" class="lsp-note lsp-note--info"><SpaceIcon name="globe" :size="18" />{{ tr('bookTranslated') }}</p>

    <div v-if="error" class="lsp-card lsp-state">
      <p class="shd-error" role="alert">{{ tr('errorGeneric') }}</p>
      <button type="button" class="lsp-btn lsp-btn--primary" @click="load">{{ tr('retry') }}</button>
    </div>

    <div v-else-if="loading && !shown" class="lsp-reader-skel" role="status" :aria-label="tr('loading')">
      <div class="lsp-skel lsp-skel--title"></div>
      <div class="lsp-skel lsp-skel--block"></div>
      <div class="lsp-skel lsp-skel--block"></div>
    </div>

    <!-- Contents: the introduction, each unit with its lessons and pages, the end of the book. -->
    <nav v-else-if="!page && toc" class="lsp-book__toc" :aria-labelledby="`${uid}-h`">
      <header class="lsp-book__head">
        <span class="lsp-chip lsp-chip--violet"><SpaceIcon name="book" :size="14" />{{ tr('bookContents') }}</span>
        <h1 :id="`${uid}-h`" ref="heading" tabindex="-1" dir="auto">{{ toc.title }}</h1>
      </header>
      <section v-if="toc.intro.length" class="lsp-card lsp-book__unit">
        <h2>{{ tr('bookIntro') }}</h2>
        <ul class="lsp-book__lessons">
          <li>
            <button type="button" class="lsp-book__lesson" @click="go(toc.intro[0])">
              <span class="lsp-book__ltitle">{{ tr('bookIntro') }}</span>
              <span class="lsp-book__pp">{{ pagesLabel([toc.intro[0], toc.intro.at(-1)]) }}</span>
            </button>
          </li>
        </ul>
      </section>
      <section v-for="u in toc.units" :key="u.id" class="lsp-card lsp-book__unit" :aria-labelledby="`${uid}-${u.id}`">
        <h2 :id="`${uid}-${u.id}`"><span class="lsp-finished__n">{{ u.index }}</span><span dir="auto">{{ u.title }}</span></h2>
        <ul class="lsp-book__lessons">
          <li v-if="u.title_page">
            <button type="button" class="lsp-book__lesson lsp-book__lesson--quiet" @click="go(u.title_page)">
              <span class="lsp-book__ltitle">{{ tr('bookUnitPage') }}</span>
              <span class="lsp-book__pp">{{ tr('bookPage', { n: u.title_page }) }}</span>
            </button>
          </li>
          <li v-for="l in u.lessons" :key="l.id">
            <button type="button" class="lsp-book__lesson" :class="{ 'is-current': l.id === currentLessonId }" :disabled="!l.pages" @click="go(l.pages[0])">
              <span class="lsp-book__ltitle" dir="auto">{{ l.title }}</span>
              <span v-if="l.id === currentLessonId" class="lsp-chip lsp-chip--violet">{{ tr('currentMark') }}</span>
              <span v-if="l.pages" class="lsp-book__pp">{{ pagesLabel(l.pages) }}</span>
            </button>
          </li>
        </ul>
      </section>
      <section v-if="toc.end.length" class="lsp-card lsp-book__unit">
        <h2>{{ tr('bookEnd') }}</h2>
        <ul class="lsp-book__lessons">
          <li>
            <button type="button" class="lsp-book__lesson" @click="go(toc.end[0])">
              <span class="lsp-book__ltitle">{{ tr('bookEnd') }}</span>
              <span class="lsp-book__pp">{{ pagesLabel([toc.end[0], toc.end.at(-1)]) }}</span>
            </button>
          </li>
        </ul>
      </section>
    </nav>

    <!-- One printed page, in reading order, with the lesson it belongs to. -->
    <article v-else-if="page && shown" class="lsp-book__page" :aria-busy="loading ? 'true' : undefined">
      <header class="lsp-book__head">
        <p class="lsp-reader__crumbs">
          <span class="lsp-chip lsp-chip--violet"><SpaceIcon name="book" :size="14" />{{ tr('bookName') }}</span>
          <span v-if="shown.lesson?.unit" class="lsp-reader__unit" dir="auto">{{ tr('bookUnit', { n: shown.lesson.unit.index }) }} · {{ shown.lesson.unit.title }}</span>
        </p>
        <h1 :id="`${uid}-h`" ref="heading" tabindex="-1">{{ tr('bookPage', { n: shown.page }) }}</h1>
      </header>

      <div v-if="shown.lesson" class="lsp-book__lessonbar">
        <span dir="auto"><SpaceIcon name="bookOpen" :size="16" />{{ tr('bookInLesson', { title: shown.lesson.title }) }}</span>
        <button type="button" class="lsp-btn lsp-btn--secondary lsp-btn--sm" @click="$emit('open-lesson', shown.lesson.id)">
          {{ tr('bookGoLesson') }}<SpaceIcon name="next" :size="16" />
        </button>
      </div>

      <nav class="lsp-book__pager" :aria-label="tr('bookPageNav')">
        <button type="button" class="lsp-btn lsp-btn--ghost lsp-btn--sm" :disabled="!shown.prev" @click="go(shown.prev)">
          <SpaceIcon name="back" :size="16" />{{ tr('bookPrev') }}
        </button>
        <span class="lsp-book__of" aria-hidden="true">{{ shown.page }}</span>
        <button type="button" class="lsp-btn lsp-btn--ghost lsp-btn--sm" :disabled="!shown.next" @click="go(shown.next)">
          {{ tr('bookNext') }}<SpaceIcon name="next" :size="16" />
        </button>
      </nav>

      <div class="lsp-card lsp-book__text" :lang="shown.lang" :dir="isRtl(shown.lang) ? 'rtl' : 'ltr'">
        <section v-for="p in shown.passages" :key="p.id" class="lsp-book__passage" :class="{ 'is-exercise': p.exercise }">
          <h2 v-if="p.heading || p.exercise" class="lsp-book__ph">
            <InlineText v-if="p.heading" :text="clean(p.heading)" />
            <span v-if="p.exercise" class="lsp-chip lsp-chip--amber" :lang="lang">{{ tr('bookExercise') }}</span>
          </h2>
          <PassageText :text="p.text" />
        </section>
      </div>

      <nav class="lsp-book__pager" :aria-label="tr('bookPageNav')">
        <button type="button" class="lsp-btn lsp-btn--ghost lsp-btn--sm" :disabled="!shown.prev" @click="go(shown.prev, { fromBottom: true })">
          <SpaceIcon name="back" :size="16" />{{ tr('bookPrev') }}
        </button>
        <span class="lsp-book__of" aria-hidden="true">{{ shown.page }}</span>
        <button type="button" class="lsp-btn lsp-btn--ghost lsp-btn--sm" :disabled="!shown.next" @click="go(shown.next, { fromBottom: true })">
          {{ tr('bookNext') }}<SpaceIcon name="next" :size="16" />
        </button>
      </nav>
    </article>
  </section>
</template>

<script setup>
// The whole book, not only the passages a lesson or an answer cites: its contents (units, lessons,
// pages), then one printed page at a time with the page before and after, a page number to jump to,
// and the way back to the lesson on the learner's path. Pages are those of the learner's edition.
import { computed, nextTick, ref, watch } from 'vue';
import SpaceIcon from './SpaceIcon.vue';
import PassageText from '../PassageText.vue';
import InlineText from '../InlineText.vue';
import { api } from '../api.js';
import { clean } from '../format.js';
import { isRtl, useT } from '../i18n.js';

const props = defineProps({
  lang: { type: String, default: 'en' }, // interface
  bookLang: { type: String, default: 'en' }, // the learner's language (the service picks the edition)
  page: { type: Number, default: null }, // null: the contents
  currentLessonId: { type: String, default: null },
  canBack: { type: Boolean, default: true },
});
const emit = defineEmits(['update:page', 'open-lesson', 'close']);

const tr = useT(() => props.lang);
const uid = `lsp-book-${Math.random().toString(36).slice(2, 7)}`;
const root = ref(null);
const heading = ref(null);
const toc = ref(null);
const pages = new Map(); // `${lang}:${page}` -> page
const shown = ref(null);
const loading = ref(false);
const error = ref(false);
const jumpTo = ref('');
const jumpError = ref('');

const pagesLabel = (p) => (p[0] === p[1] ? tr('bookPage', { n: p[0] }) : tr('bookPages', { from: p[0], to: p[1] }));
// The edition's own page numbers only (a learner's language without one reads the English pages).
const known = computed(() => new Set(toc.value?.pages || []));

async function load() {
  error.value = false;
  loading.value = true;
  try {
    if (!toc.value || toc.value.for !== props.bookLang) toc.value = { ...(await api.book(props.bookLang)), for: props.bookLang };
    if (props.page) {
      const key = `${props.bookLang}:${props.page}`;
      if (!pages.has(key)) pages.set(key, await api.bookPage(props.page, props.bookLang));
      shown.value = pages.get(key);
      // Read ahead one page, so "next page" turns at once.
      const nx = shown.value?.next;
      if (nx && !pages.has(`${props.bookLang}:${nx}`)) api.bookPage(nx, props.bookLang).then((p) => pages.set(`${props.bookLang}:${nx}`, p)).catch(() => {});
    }
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}

let focusAfter = false;
let toBottom = false;
function go(n, { fromBottom = false } = {}) {
  jumpError.value = '';
  focusAfter = true;
  toBottom = fromBottom;
  emit('update:page', n || null);
}

function jump() {
  const n = Number(String(jumpTo.value).trim());
  if (!known.value.has(n)) {
    jumpError.value = tr('bookNoPage', { n: jumpTo.value, first: toc.value?.pages?.[0] ?? '', last: toc.value?.pages?.at(-1) ?? '' });
    return;
  }
  jumpTo.value = '';
  go(n);
}

watch(
  () => [props.page, props.bookLang],
  async () => {
    await load();
    await nextTick();
    // A new page starts at its top, with focus on its title (so a screen reader hears where it is).
    root.value?.closest('.lsp-col--main')?.scrollTo({ top: 0 });
    if (focusAfter || toBottom) heading.value?.focus({ preventScroll: true });
    focusAfter = false;
    toBottom = false;
  },
  { immediate: true },
);

/** Focus the title (now, or once the contents or page has loaded). */
function focus() {
  if (loading.value) focusAfter = true;
  else heading.value?.focus({ preventScroll: true });
}
defineExpose({ focus });
</script>

<style>
.lsp-book { display: flex; flex-direction: column; gap: 16px; }
.lsp-book__bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.lsp-book__bar .lsp-btn { gap: 6px; }
.lsp-book__jump { display: flex; align-items: center; gap: 6px; margin-inline-start: auto; }
.lsp-book__jump label { font-size: 0.85rem; color: var(--muted); white-space: nowrap; }
.lsp-book__jump .lsp-input { width: 5.5em; min-height: 36px; padding: 4px 8px; }
.lsp-book__head { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
.lsp-book__head h1 { font-size: 1.8rem; font-weight: 600; line-height: 1.25; }
.lsp-book__toc { display: flex; flex-direction: column; gap: 14px; }
.lsp-book__unit { display: flex; flex-direction: column; gap: 10px; padding: 18px 20px; }
.lsp-book__unit h2 { display: flex; align-items: center; gap: 10px; font-size: 1rem; font-weight: 600; }
.lsp-book__lessons { display: flex; flex-direction: column; gap: 4px; }
.lsp-book__lesson {
  width: 100%; display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 8px 12px; border: 0; border-radius: 10px;
  background: var(--soft); color: var(--ink); text-align: start; cursor: pointer; font-size: 0.93rem; line-height: 1.35;
}
.lsp-book__lesson:hover:not(:disabled) { background: var(--violet-50); color: var(--violet-ink); }
.lsp-book__lesson.is-current { box-shadow: inset 0 0 0 2px var(--violet-100); }
.lsp-book__lesson--quiet { background: transparent; color: var(--muted); }
.lsp-book__ltitle { flex: 1; min-width: 0; }
.lsp-book__pp { flex: none; font-size: 0.82rem; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.lsp-book__page { display: flex; flex-direction: column; gap: 14px; }
.lsp-book__page[aria-busy='true'] .lsp-book__text { opacity: 0.55; transition: opacity 0.2s; }
.lsp-book__lessonbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; padding: 10px 14px; border-radius: 12px; background: var(--violet-50); color: #3b3399; font-weight: 500; }
.lsp-book__lessonbar > span { display: inline-flex; align-items: center; gap: 8px; min-width: 0; }
.lsp-book__lessonbar .lsp-btn { gap: 6px; }
.lsp-book__pager { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.lsp-book__pager .lsp-btn { gap: 6px; }
.lsp-book__of { font-variant-numeric: tabular-nums; color: var(--muted); font-weight: 600; }
.lsp-book__text { display: flex; flex-direction: column; gap: 22px; font-size: 1.04rem; line-height: 1.9; overflow-wrap: anywhere; }
.lsp-book__text[lang='ar'] { font-size: 1.12rem; }
.lsp-book__passage { display: flex; flex-direction: column; gap: 8px; }
.lsp-book__passage.is-exercise { padding: 12px 14px; border-radius: 12px; background: var(--soft); box-shadow: inset 0 0 0 1px var(--line); }
.lsp-book__ph { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 1.05rem; font-weight: 600; line-height: 1.5; color: var(--violet-ink); }
.lsp-book__ph .lsp-chip { font-size: 0.72rem; }
@media (max-width: 899px) {
  .lsp-book__head h1 { font-size: 1.45rem; }
  .lsp-book__jump { margin-inline-start: 0; flex: 1 1 100%; }
  .lsp-book__jump .lsp-input { flex: 1; width: auto; min-width: 0; }
  .lsp-book__unit { padding: 14px; }
  .lsp-book__text { font-size: 1rem; }
}
</style>
