<template>
  <Teleport to="body">
    <div
      v-show="open"
      ref="root"
      class="shd lsp"
      :class="[`lsp--tab-${tab}`, { 'lsp--onb': phase !== 'learn' && phase !== 'done', 'lsp--solo': phase === 'forgotten' || phase === 'signedout', 'lsp--wide': wide }]"
      role="dialog"
      aria-modal="true"
      :aria-label="`${tr('spaceTitle')} · ${tr('spaceSub')}`"
      :dir="isRtl(lang) ? 'rtl' : 'ltr'"
      :lang="lang"
    >
      <!-- Phone header: back, where you are, progress. -->
      <header class="lsp-mhead">
        <button type="button" class="lsp-icon-btn lsp-mhead__back" :aria-label="tr('backToChat')" @click="requestClose">
          <SpaceIcon name="back" :size="22" />
        </button>
        <div class="lsp-mhead__mid">
          <span class="lsp-mhead__title">{{ bookOpen && tab === 'book' ? tr('tabBook') : phase === 'learn' && lesson ? lesson.title : tr('spaceTitle') }}</span>
          <span class="lsp-mhead__bar" aria-hidden="true"><span :style="{ width: `${pct}%` }"></span></span>
        </div>
        <span class="lsp-mhead__count" :aria-label="tr('ringLabel', { done, total })">{{ done }}/{{ total }}</span>
        <AccountMenu :lang="lang" :account="progress?.account || null" @sign-in="openSave" />
      </header>
      <p class="lsp-mtransparency" :title="tr('transparency')"><SpaceIcon name="book" :size="13" /><span>{{ tr('transparencyShort') }}</span></p>

      <aside class="lsp-col lsp-col--path">
        <PathSidebar
          :lang="lang"
          :index="index"
          :progress="progress"
          :current-id="phase === 'learn' ? lesson?.id || null : null"
          :account="accountName"
          :disabled="phase !== 'learn' && phase !== 'done' && phase !== 'badlink'"
          @open="openLesson"
          @save="openSave"
          @book="openBook()"
          @handoff="openHandoff()"
        />
      </aside>

      <main ref="main" class="lsp-col lsp-col--main">
        <div class="lsp-top">
          <button type="button" class="lsp-back" @click="requestClose">
            <SpaceIcon name="back" :size="18" /><span>{{ tr('backToChat') }}</span>
            <kbd class="lsp-kbd" aria-hidden="true">Esc</kbd>
          </button>
          <p class="lsp-transparency"><SpaceIcon name="book" :size="15" />{{ tr('transparency') }}</p>
          <AccountMenu :lang="lang" :account="progress?.account || null" @sign-in="openSave" />
        </div>

        <div class="lsp-main">
          <BookReader
            v-if="bookOpen && (phase === 'learn' || phase === 'done')"
            ref="bookReader"
            v-model:page="bookPage"
            :lang="lang"
            :book-lang="learnerLang"
            :current-lesson-id="phase === 'learn' ? lesson?.id || null : null"
            :can-back="phase === 'learn' && !!lesson"
            @open-lesson="openLesson"
            @close="closeBook"
          />

          <Onboarding
            v-else-if="phase === 'card' || phase === 'choice'"
            :lang="lang"
            :card="card"
            :step="phase"
            :busy="busy"
            :selected="choice"
            @confirm="confirmCard"
            @choose="choose"
          />

          <div v-else-if="phase === 'error'" class="lsp-card lsp-state">
            <p class="shd-error" role="alert">{{ tr('errorGeneric') }}</p>
            <button type="button" class="lsp-btn lsp-btn--primary" @click="retry?.()">{{ tr('retry') }}</button>
          </div>

          <!-- The whole path is done: what was learned, a person for what comes next, every lesson to review. -->
          <div v-else-if="phase === 'done'" class="lsp-finished">
            <section class="lsp-card lsp-state">
              <span class="lsp-finished__ic"><SpaceIcon name="sparkle" :size="34" /></span>
              <h1 tabindex="-1">{{ tr('doneTitle') }}</h1>
              <p class="lsp-muted">{{ tr('finishedSummary', { total, units: finishedUnits.length || 4 }) }}</p>
              <p class="lsp-muted">{{ tr('doneBody') }}</p>
            </section>
            <section class="lsp-card lsp-finished__mentor">
              <span class="lsp-callout__ic"><SpaceIcon name="users" :size="22" /></span>
              <div class="lsp-callout__body">
                <strong>{{ tr('mentorTitle') }}</strong>
                <span>{{ tr('finishedMentor') }}</span>
              </div>
              <button type="button" class="lsp-btn lsp-btn--primary" @click="openHandoff()">{{ tr('talkHuman') }}</button>
            </section>
            <section v-if="finishedUnits.length" class="lsp-card lsp-sec" :aria-labelledby="`${uid}-units`">
              <div class="lsp-sec__head">
                <h2 :id="`${uid}-units`"><SpaceIcon name="path" />{{ tr('finishedUnits') }}</h2>
                <p class="lsp-muted lsp-small">{{ tr('finishedReview') }}</p>
              </div>
              <div v-for="u in finishedUnits" :key="u.id" class="lsp-finished__unit">
                <h3><span class="lsp-finished__n">{{ u.index }}</span><span dir="auto">{{ u.title }}</span></h3>
                <ul>
                  <li v-for="l in u.lessons" :key="l.id">
                    <button type="button" class="lsp-finished__lesson" @click="openLesson(l.id)">
                      <SpaceIcon :name="l.done ? 'check' : 'bookOpen'" :size="16" /><span dir="auto">{{ l.title }}</span>
                    </button>
                  </li>
                </ul>
              </div>
            </section>
          </div>

          <!-- After "Delete my data": nothing left to show, and two calm ways on. -->
          <div v-else-if="phase === 'forgotten'" class="lsp-card lsp-state">
            <span class="lsp-finished__ic"><SpaceIcon name="trash" :size="30" /></span>
            <h1 tabindex="-1">{{ tr('forgottenTitle') }}</h1>
            <p class="lsp-muted">{{ tr('forgottenBody') }}</p>
            <div class="lsp-row">
              <button type="button" class="lsp-btn lsp-btn--primary" @click="startAgain">{{ tr('startAgain') }}</button>
              <button type="button" class="lsp-btn lsp-btn--ghost" @click="requestClose">{{ tr('backToChat') }}</button>
            </div>
          </div>

          <!-- Signed out on this browser: the progress waits in the account, one tap from coming back. -->
          <div v-else-if="phase === 'signedout'" class="lsp-card lsp-state">
            <span class="lsp-finished__ic"><SpaceIcon name="user" :size="30" /></span>
            <h1 tabindex="-1">{{ tr('signedOutTitle') }}</h1>
            <p class="lsp-muted">{{ tr('signedOutBody') }}</p>
            <div class="lsp-row">
              <button type="button" class="lsp-btn lsp-btn--primary" @click="openSave">{{ tr('signInAgain') }}</button>
              <button type="button" class="lsp-btn lsp-btn--ghost" @click="startAgain">{{ tr('startAgain') }}</button>
            </div>
          </div>

          <!-- A ?lesson= link that names no lesson: say so, and offer the way back onto the path. -->
          <div v-else-if="phase === 'badlink'" class="lsp-card lsp-state">
            <span class="lsp-finished__ic lsp-finished__ic--amber"><SpaceIcon name="flag" :size="30" /></span>
            <h1 tabindex="-1">{{ tr('badLinkTitle') }}</h1>
            <p class="lsp-muted">{{ tr('badLinkBody') }}</p>
            <button type="button" class="lsp-btn lsp-btn--primary" @click="goToNext">{{ progress?.next ? tr('goNext') : tr('openPath') }}</button>
          </div>

          <template v-else-if="phase === 'learn'">
            <div v-if="lessonLoading" class="lsp-reader-skel" role="status" :aria-label="tr('loading')">
              <div class="lsp-skel lsp-skel--chip"></div>
              <div class="lsp-skel lsp-skel--title"></div>
              <div class="lsp-skel lsp-skel--block"></div>
              <div class="lsp-skel lsp-skel--block"></div>
            </div>
            <Transition v-else :name="reduceMotion ? '' : 'lsp-slide'" mode="out-in">
              <LessonReader
                v-if="lesson"
                :key="lesson.id + ':' + lessonNonce"
                ref="reader"
                :lesson="lesson"
                :lang="lang"
                :completing="completing"
                :is-next="lesson.id === progress?.next?.id"
                :is-done="(progress?.completed || []).includes(lesson.id)"
                :has-next="!!progress?.next"
                :save-error="saveError"
                :first-note="firstNote"
                :save-hint="saveHint"
                @next="completeLesson"
                @mark-done="(a) => completeLesson(a, { stay: true })"
                @go-next="goToNext"
                @ask="askAboutLesson"
                @handoff="openHandoff()"
                @save="openSave"
                @dismiss-save="saveHintDismissed = true"
              />
            </Transition>
          </template>

          <div v-else class="lsp-reader-skel" role="status" :aria-label="tr('loading')">
            <div class="lsp-skel lsp-skel--title"></div>
            <div class="lsp-skel lsp-skel--block"></div>
          </div>
        </div>
      </main>

      <aside v-if="phase === 'learn' || phase === 'done'" class="lsp-col lsp-col--ask">
        <AskPanel
          ref="askPanel"
          v-model:scope="askScope"
          :lang="lang"
          :thread="thread"
          :signed-in="!!accountName"
          :lesson-title="lesson?.title || ''"
          :wide="wide"
          @ask="ask"
          @retry="runAsk"
          @handoff="openHandoff"
          @open-lesson="openLesson"
          @reply="replyToMentor"
          @save="openSave"
          @toggle-wide="wide = !wide"
        />
      </aside>

      <!-- Phone: one screen at a time. -->
      <nav v-if="phase === 'learn' || phase === 'done'" class="lsp-tabs" :aria-label="tr('spaceTitle')">
        <button v-for="t in TABS" :key="t.id" type="button" class="lsp-tab" :aria-current="tab === t.id ? 'page' : undefined" @click="selectTab(t.id)">
          <span class="lsp-tab__ic">
            <SpaceIcon :name="t.icon" :size="22" />
            <span v-if="t.id === 'ask' && unread" class="lsp-tab__badge">{{ unread }}</span>
          </span>
          <span>{{ tr(t.label) }}</span>
        </button>
      </nav>

      <!-- Side sheet: the original passage behind a source marker, or saving progress. -->
      <Transition :name="reduceMotion ? '' : 'lsp-sheet'">
        <div v-if="sheet" class="lsp-sheet-backdrop" @click.self="closeSheet">
          <div ref="sheetEl" class="lsp-sheet" role="dialog" aria-modal="true" :aria-labelledby="`${uid}-sheet`" tabindex="-1">
            <template v-if="sheet.type === 'source'">
              <div class="lsp-sheet__head">
                <div>
                  <span v-if="sheet.number" class="lsp-chip lsp-chip--violet">{{ tr('sourceNumber', { n: sheet.number }) }}</span>
                  <h2 :id="`${uid}-sheet`">{{ tr('sourceTitle') }}</h2>
                </div>
                <button type="button" class="lsp-icon-btn" :aria-label="tr('close')" @click="closeSheet"><SpaceIcon name="x" /></button>
              </div>
              <p v-if="sheet.source?.heading" class="lsp-sheet__heading" dir="auto">{{ sheet.source.heading }}</p>
              <PassageText
                v-if="sheet.source?.text"
                tag="blockquote"
                class="lsp-sheet__quote"
                :text="sheet.source.text"
                :lang="sheet.source.lang"
                :dir="isRtl(sheet.source.lang) ? 'rtl' : 'ltr'"
              />
              <p class="lsp-sheet__cite"><SpaceIcon name="book" :size="16" />{{ tr('sourceRef', { book: tr('bookName'), page: sheet.page }) }}</p>
              <button v-if="Number(sheet.page) && (phase === 'learn' || phase === 'done')" type="button" class="lsp-btn lsp-btn--secondary lsp-sheet__open" @click="openBook(Number(sheet.page))">
                <SpaceIcon name="bookOpen" :size="18" />{{ tr('bookOpenAt') }}
              </button>
            </template>
            <template v-else-if="sheet.type === 'save'">
              <h2 :id="`${uid}-sheet`" class="lsp-sr">{{ tr(progress?.account ? 'saveTitle' : 'signInTitle') }}</h2>
              <SaveProgress
                :lang="lang"
                :account="progress?.account || null"
                :reminder="progress?.reminder || null"
                @dismiss="closeSheet"
                @forgotten="onForgotten"
              />
            </template>
          </div>
        </div>
      </Transition>

      <!-- A small celebration when a unit is complete. -->
      <Transition name="lsp-pop">
        <div v-if="celebrate" class="lsp-celebrate" role="status" @click="celebrate = null">
          <div class="lsp-celebrate__card">
            <div v-if="!reduceMotion" class="lsp-confetti" aria-hidden="true">
              <i v-for="n in 18" :key="n" :style="{ '--i': n }"></i>
            </div>
            <span class="lsp-celebrate__ic"><SpaceIcon name="check" :size="34" /></span>
            <strong>{{ tr('unitDone', { u: celebrate.index }) }}</strong>
            <span class="lsp-celebrate__unit">{{ celebrate.title }}</span>
            <p>{{ tr('unitDoneBody') }}</p>
          </div>
        </div>
      </Transition>
    </div>
  </Teleport>

  <HandoffDialog
    :open="handoff.open"
    :lang="lang"
    :reason="handoff.reason"
    :question="handoff.question"
    :lesson="lesson ? { id: lesson.id, title: lesson.title } : null"
    :country="confirmedCard?.country || null"
    :learner-lang="learnerLang"
    :signed-in="!!accountName"
    @close="handoff.open = false"
    @sent="onHandoffSent"
    @save="handoff.open = false; openSave()"
  />
</template>

<script setup>
// The learning space: the after-Shahada journey as a full-screen place of its own, over the chat.
// Desktop: path · lesson · ask. Phone: one screen with a tab bar. It runs the same journey as the
// service describes (docs/api.md): start card -> what first -> Shahada lesson -> one lesson at a
// time, free questions, and a person always one tap away.
import { computed, nextTick, onBeforeUnmount, onMounted, provide, reactive, ref, watch } from 'vue';
import PathSidebar from './PathSidebar.vue';
import LessonReader from './LessonReader.vue';
import AskPanel from './AskPanel.vue';
import Onboarding from './Onboarding.vue';
import SpaceIcon from './SpaceIcon.vue';
import BookReader from './BookReader.vue';
import AccountMenu from './AccountMenu.vue';
import HandoffDialog from '../HandoffDialog.vue';
import SaveProgress from '../SaveProgress.vue';
import PassageText from '../PassageText.vue';
import { api } from '../api.js';
import { onAccount } from '../returning.js';
import { apiLang, isRtl, useT } from '../i18n.js';
import '../shahada.css';
import './space.css';

const props = defineProps({
  open: { type: Boolean, default: false },
  conversation: { type: Array, default: () => [] },
  lang: { type: String, default: 'en' },
  mode: { type: String, default: 'shahada' }, // 'shahada' | 'resume'
  lessonId: { type: String, default: null },
});
const emit = defineEmits(['close', 'summary']);

const tr = useT(() => props.lang);
const uid = `lsp-${Math.random().toString(36).slice(2, 7)}`;
const TABS = [
  { id: 'lesson', icon: 'bookOpen', label: 'tabLesson' },
  { id: 'book', icon: 'book', label: 'tabBook' },
  { id: 'ask', icon: 'message', label: 'tabAsk' },
  { id: 'path', icon: 'path', label: 'tabPath' },
  { id: 'mentor', icon: 'users', label: 'tabMentor' },
];
const reduceMotion = ref(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

const root = ref(null);
const main = ref(null);
const reader = ref(null);
const askPanel = ref(null);
const sheetEl = ref(null);
const bookReader = ref(null);

// Journey state
const phase = ref('loading'); // loading | card | choice | learn | done | error | badlink | forgotten | signedout
const retry = ref(null);
const busy = ref(false);
const card = ref(null);
const confirmedCard = ref(null);
const backgroundPassages = ref(false);
const choice = ref(null);
const progress = ref(null);
const index = ref(null);
const lesson = ref(null);
const lessonNonce = ref(0);
const lessonLoading = ref(false);
const completing = ref('');
const saveError = ref(false);
const saveHintDismissed = ref(false);
const celebrate = ref(null);

// Screen state
const tab = ref('lesson');
const wide = ref(false);
const sheet = ref(null);
const askScope = ref('book');
// The whole book, over the lesson (on a phone: its own tab). The page is kept while it is closed.
const bookOpen = ref(false);
const bookPage = ref(null);
const thread = ref([]);
const handoff = reactive({ open: false, reason: 'user_request', question: '' });
let seq = 0;

const learnerLang = computed(() => confirmedCard.value?.language?.value || progress.value?.lang || apiLang(props.lang));
const total = computed(() => progress.value?.position?.total || 19);
const done = computed(() => progress.value?.position?.done || 0);
const pct = computed(() => Math.round((100 * done.value) / (total.value || 1)));
const accountName = computed(() => progress.value?.account?.email || progress.value?.account?.name || '');
const saveHint = computed(() => !saveHintDismissed.value && !accountName.value && done.value >= 1 && done.value <= 3);

// The Shahada lesson always comes first; a learner who picked something else is told why, and
// whether their choice is the very next lesson or comes a little later (prayer follows purification).
const CHOICE_LESSON = { wudu: 'u3l3', prayer: 'u3l6', fatiha: 'u2l2' };
const firstNote = computed(() => {
  const c = progress.value?.choice || choice.value;
  if (!lesson.value || lesson.value.id !== 'u1l3' || !CHOICE_LESSON[c] || (progress.value?.completed || []).includes('u1l3')) return '';
  const path = progress.value?.path || index.value?.path || [];
  return tr(path[1] === CHOICE_LESSON[c] ? 'firstNoteNext' : 'firstNoteLater', { choice: tr(`choice_${c}`) });
});
// The finished screen lists the units and their lessons (titles as the service sends them, translated).
const label = (x) => (x && typeof x === 'object' ? x[apiLang(props.lang)] || x.en || Object.values(x)[0] : x);
const finishedUnits = computed(() =>
  (index.value?.units || []).map((u) => ({ ...u, title: label(u.title), lessons: (u.lessons || []).map((l) => ({ ...l, title: label(l.title) })) })),
);

// What the chat's journey card shows.
watch(
  () => ({ started: phase.value === 'learn' || phase.value === 'done', done: done.value, total: total.value, nextTitle: progress.value?.next?.title || '' }),
  (s) => emit('summary', s),
  { immediate: true },
);

// ------------------------------------------------------------------ journey
async function guard(fn) {
  try {
    await fn();
  } catch {
    retry.value = () => {
      phase.value = 'loading';
      guard(fn);
    };
    phase.value = 'error';
  }
}

function start() {
  phase.value = 'card';
  loadIndex();
  return guard(async () => {
    const res = await api.start(apiLang(props.lang), props.conversation);
    card.value = res.card || {};
    phase.value = 'card';
  });
}

function resume() {
  return guard(async () => {
    progress.value = await api.progress();
    // A returning learner already confirmed their card; only the language and country matter from it.
    const country = progress.value?.country;
    confirmedCard.value = {
      language: progress.value?.lang ? { value: progress.value.lang } : null,
      country: country && typeof country === 'object' ? country : country ? { value: country, label: country } : null,
    };
    phase.value = 'learn';
    loadIndex();
    const id = props.lessonId || progress.value?.next?.id;
    if (id) await loadLesson(id);
    else phase.value = 'done';
  });
}

async function confirmCard({ card: c, background_passages }) {
  busy.value = true;
  try {
    progress.value = await api.profile({ lang: c.language?.value || apiLang(props.lang), choice: null, card: c, background_passages });
    confirmedCard.value = c;
    backgroundPassages.value = background_passages;
    phase.value = 'choice';
    loadIndex();
  } catch {
    retry.value = () => {
      phase.value = 'card';
    };
    phase.value = 'error';
  } finally {
    busy.value = false;
  }
}

async function choose(id) {
  choice.value = id;
  busy.value = true;
  try {
    progress.value = await api.profile({ lang: learnerLang.value, choice: id, card: confirmedCard.value, background_passages: backgroundPassages.value });
    loadIndex();
    phase.value = 'learn';
    await loadLesson(progress.value?.next?.id || 'u1l3');
  } catch {
    choice.value = null;
    retry.value = () => {
      phase.value = 'choice';
    };
    phase.value = 'error';
  } finally {
    busy.value = false;
  }
}

async function loadIndex() {
  try {
    index.value = await api.lessons(learnerLang.value);
  } catch {
    // The path is a convenience; the lesson itself still works without it.
  }
}

async function loadLesson(id) {
  lessonLoading.value = true;
  tab.value = 'lesson';
  bookOpen.value = false;
  saveError.value = false;
  try {
    const background = backgroundPassages.value ? confirmedCard.value?.previous_religion?.value ?? null : null;
    lesson.value = await api.lesson(id, learnerLang.value, background);
    lessonNonce.value++;
    if (phase.value !== 'learn') phase.value = 'learn';
  } catch (e) {
    // No such lesson (an old or mistyped ?lesson= link): trying again would only fail again.
    if (e?.status === 404) {
      lesson.value = null;
      phase.value = 'badlink';
      return;
    }
    retry.value = () => {
      phase.value = 'learn';
      loadLesson(id);
    };
    phase.value = 'error';
  } finally {
    lessonLoading.value = false;
  }
  await nextTick();
  main.value?.scrollTo({ top: 0 });
  if (props.open) reader.value?.focus();
}

function openLesson(id) {
  sheet.value = null;
  return loadLesson(id);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, reduceMotion.value ? 0 : ms));

// `stay`: an earlier lesson marked done while reviewing it; the learner stays on it.
async function completeLesson(checkAnswer, { stay = false } = {}) {
  const L = lesson.value;
  if (!L || completing.value) return;
  const unitId = L.unit?.id;
  const unitBefore = index.value?.units?.find((u) => u.id === unitId);
  const wasComplete = unitBefore ? unitBefore.lessons.every((l) => l.done) : true;
  completing.value = 'saving';
  saveError.value = false;
  let res;
  try {
    [res] = await Promise.all([api.complete(L.id, learnerLang.value, checkAnswer), sleep(700)]);
  } catch {
    // Keep the learner on the lesson and say so beside the button, which is ready to try again.
    completing.value = '';
    saveError.value = true;
    return;
  }
  try {
    progress.value = res;
    completing.value = 'done';
    await Promise.all([loadIndex(), sleep(stay ? 0 : 650)]);
    const unitAfter = index.value?.units?.find((u) => u.id === unitId);
    if (!wasComplete && unitAfter?.lessons?.every((l) => l.done)) {
      celebrate.value = { index: unitAfter.index, title: label(unitAfter.title) };
      setTimeout(() => (celebrate.value = null), reduceMotion.value ? 2500 : 3200);
    }
    if (stay) return;
    await goToNext();
  } finally {
    completing.value = '';
  }
}

/** On to the learner's next lesson on the path, or the finished screen when there is none. */
async function goToNext() {
  const next = progress.value?.next;
  if (next?.id) return loadLesson(next.id);
  phase.value = 'done';
  tab.value = 'lesson';
  await nextTick();
  main.value?.scrollTo({ top: 0 });
  root.value?.querySelector('.lsp-finished h1')?.focus({ preventScroll: true });
}

// ------------------------------------------------------------------ questions
function ask(question, { lessonBound } = {}) {
  const useLesson = lessonBound ?? (askScope.value === 'lesson' && !!lesson.value);
  // The last two exchanges go with the question, so "why?" or "and for women?" is understood.
  const history = thread.value
    .filter((t) => t.type === 'a' && t.answer)
    .slice(-2)
    .map((t) => `Learner: ${t.question}\nTutor: ${(t.answer.text || '').slice(0, 500)}`)
    .join('\n');
  thread.value.push(reactive({ key: `t${++seq}`, type: 'q', question, lessonTitle: useLesson ? lesson.value?.title : '' }));
  const item = reactive({ key: `t${++seq}`, type: 'a', question, history, lessonId: useLesson ? lesson.value?.id : null, answer: null, loading: true, error: false, stageIdx: 0, pages: [] });
  thread.value.push(item);
  if (tab.value !== 'ask' && isPhone()) tab.value = 'ask';
  runAsk(item);
}

async function runAsk(item) {
  item.loading = true;
  item.error = false;
  item.stageIdx = 0;
  item.pages = [];
  try {
    item.answer = await api.askStream(item.question, learnerLang.value, item.lessonId, item.history, (st) => {
      if (st.stage === 'routing') item.stageIdx = 0;
      else if (st.stage === 'found') {
        item.stageIdx = 1;
        item.pages = st.pages || [];
      } else item.stageIdx = 2;
    });
  } catch {
    item.error = true;
  } finally {
    item.loading = false;
  }
}

async function askAboutLesson() {
  askScope.value = 'lesson';
  tab.value = 'ask';
  await nextTick();
  askPanel.value?.focus();
}

// ------------------------------------------------------------------ people
function openHandoff({ reason = 'user_request', question = '' } = {}) {
  handoff.reason = reason;
  handoff.question = question;
  handoff.open = true;
}

// The learner's conversations with the team: one per referral, rebuilt from the service with both
// sides, so a reload (or another device signed in to the same account) shows the whole thread, and
// one box per conversation to answer in. Polled by message id, which only grows, so two replies sent
// in the same second are never missed. Replies already read are remembered in this browser.
const SEEN_KEY = 'shd.mentorSeen';
const cases = reactive({}); // handoff id -> { id, mentor, status, created_at, messages, draft, sending, failed }
const caseList = computed(() => Object.values(cases).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))));
const seenMentorId = ref(readSeen());
const mentorIds = () => caseList.value.flatMap((c) => c.messages.filter((m) => m.author === 'mentor').map((m) => m.id));
const unread = computed(() => mentorIds().filter((id) => id > seenMentorId.value).length);
let lastMessageId = 0;
let pollTimer = null;
let polling = false;

function readSeen() {
  try {
    return Number(localStorage.getItem(SEEN_KEY)) || 0;
  } catch {
    return 0;
  }
}

// What the chat's journey card shows about the team: unread replies, and whether the latest request
// is still waiting ("sent") or has an answer ("replied").
watch(
  () => {
    const last = caseList.value[caseList.value.length - 1];
    return {
      mentorUnread: unread.value,
      mentorCases: caseList.value.length,
      mentorState: last ? (last.messages.some((m) => m.author === 'mentor') ? 'replied' : 'sent') : null,
      mentorWho: last?.mentor || null,
    };
  },
  (s) => emit('summary', s),
  { immediate: true },
);

function caseFor(h) {
  if (!cases[h.id]) {
    cases[h.id] = { id: h.id, mentor: h.mentor, status: h.status, created_at: h.created_at, messages: [], draft: '', sending: false, failed: false };
    thread.value.push(reactive({ key: `case-${h.id}`, type: 'case', case: cases[h.id] }));
  }
  return cases[h.id];
}

function onHandoffSent(res) {
  if (res?.id) caseFor({ id: res.id, mentor: res.mentor, status: 'new', created_at: new Date().toISOString().replace('T', ' ') });
  pollMentor();
}

async function pollMentor() {
  if (polling || (pollTimer && document.hidden)) return;
  polling = true;
  try {
    const res = await api.handoffMessages(lastMessageId);
    for (const h of res?.handoffs || []) Object.assign(caseFor(h), { status: h.status, mentor: h.mentor, created_at: h.created_at });
    for (const m of res?.messages || []) {
      lastMessageId = Math.max(lastMessageId, m.id);
      const c = cases[m.handoff_id];
      if (c && !c.messages.some((x) => x.id === m.id)) c.messages.push(m);
    }
    if (caseList.value.length) startPolling();
  } catch {
    // Best effort: a failed poll must not interrupt a lesson.
  } finally {
    polling = false;
  }
}
function startPolling() {
  if (!pollTimer) pollTimer = setInterval(pollMentor, 15000);
}

async function replyToMentor(c) {
  const text = c.draft.trim();
  if (!text || c.sending) return;
  c.sending = true;
  c.failed = false;
  try {
    const res = await api.handoffSend(c.id, text);
    c.draft = '';
    if (res?.id && !c.messages.some((m) => m.id === res.id)) c.messages.push({ id: res.id, handoff_id: c.id, author: 'learner', text, created_at: new Date().toISOString() });
    if (c.status !== 'new') c.status = 'in_progress';
  } catch {
    c.failed = true;
  } finally {
    c.sending = false;
  }
}

// A reply counts as read once the conversation is on screen (on a phone: the Ask tab).
watch(
  () => [props.open, tab.value, phase.value, unread.value],
  () => {
    if (!unread.value || !props.open || !(phase.value === 'learn' || phase.value === 'done')) return;
    if (isPhone() && tab.value !== 'ask') return;
    seenMentorId.value = Math.max(seenMentorId.value, ...mentorIds());
    try {
      localStorage.setItem(SEEN_KEY, String(seenMentorId.value));
    } catch {
      // Storage unavailable: the badge only lives for this visit.
    }
  },
);

/** Show the conversation with the newest reply (from the journey card's "read the reply"). */
async function openMentor() {
  const target = caseList.value.find((c) => c.messages.some((m) => m.author === 'mentor' && m.id > seenMentorId.value)) || caseList.value[caseList.value.length - 1];
  const ready = () => phase.value === 'learn' || phase.value === 'done';
  // A returning learner's space may still be loading their lesson; the conversation shows once it is in.
  if (!ready()) {
    await new Promise((resolve) => {
      const stop = watch(phase, () => {
        if (!ready()) return;
        stop();
        resolve();
      });
    });
  }
  tab.value = 'ask';
  await nextTick();
  if (target) root.value?.querySelector(`[data-case="${target.id}"]`)?.scrollIntoView({ block: 'start', behavior: reduceMotion.value ? 'auto' : 'smooth' });
}

function onForgotten() {
  // The server has forgotten everything; the screen forgets the card and the path too.
  confirmedCard.value = null;
  progress.value = null;
  lesson.value = null;
  index.value = null;
  thread.value = [];
  for (const k of Object.keys(cases)) delete cases[k];
  lastMessageId = 0;
  // A calm screen of its own instead of an empty lesson and a path that never loads.
  choice.value = null;
  card.value = null;
  sheet.value = null;
  phase.value = 'forgotten';
  nextTick(() => root.value?.querySelector('.lsp-main h1')?.focus({ preventScroll: true }));
}

// Signing in or out (here, or in the host page's header) is announced; the space follows it.
async function onSignedIn() {
  try {
    const p = await api.progress();
    // Signed in on the first screen (or after signing out): back to the account's own lessons.
    const begun = Boolean(p?.choice || p?.completed?.length);
    if (phase.value === 'signedout' || (begun && phase.value !== 'learn' && phase.value !== 'done')) {
      sheet.value = null;
      phase.value = 'loading';
      return begun ? resume() : start();
    }
    progress.value = p;
    loadIndex();
  } catch {
    // The account is saved; the screen catches up on the next load.
  }
}

function onSignedOut() {
  if (phase.value === 'forgotten') return;
  // This browser is a new anonymous learner: nothing of the account stays on screen.
  onForgotten();
  bookOpen.value = false;
  phase.value = 'signedout';
}

function startAgain() {
  saveHintDismissed.value = false;
  backgroundPassages.value = false;
  start();
}

// ------------------------------------------------------------------ screen
const isPhone = () => window.matchMedia?.('(max-width: 899px)').matches;

function selectTab(id) {
  if (id === 'mentor') return openHandoff();
  if (id === 'book') return openBook(bookPage.value);
  if (id === 'lesson') bookOpen.value = false;
  tab.value = id;
}

// ------------------------------------------------------------------ the book
/** Open the book at a page (from a source's "p. N"), or where the learner left it (null: the contents). */
async function openBook(page = bookPage.value) {
  if (sheet.value) sheet.value = null;
  bookPage.value = page || null;
  bookOpen.value = true;
  tab.value = 'book';
  await nextTick();
  main.value?.scrollTo({ top: 0 });
  bookReader.value?.focus();
}
async function closeBook() {
  bookOpen.value = false;
  tab.value = 'lesson';
  await nextTick();
  reader.value?.focus();
}

let sheetReturn = null;
async function openSheet(s) {
  sheetReturn = s.trigger || document.activeElement;
  sheet.value = s;
  await nextTick();
  sheetEl.value?.focus();
}
function closeSheet() {
  sheet.value = null;
  sheetReturn?.focus?.();
}
provide('shdOpenSource', (s) => openSheet({ type: 'source', ...s }));
function openSave() {
  openSheet({ type: 'save' });
}

// Back to the chat: Esc or the back button. (No history entry of our own: the host's router
// treats any popstate as a new chat and would clear the conversation.)
function requestClose() {
  emit('close');
}
function onKey(e) {
  if (!props.open || e.key !== 'Escape') return;
  if (e.target?.closest?.('.shd-dialog-backdrop') || handoff.open) return;
  if (celebrate.value) return (celebrate.value = null);
  if (sheet.value) return closeSheet();
  requestClose();
}
// Keep keyboard focus inside the space while it covers the chat (the referral dialog sits above it).
function onFocusIn(e) {
  if (!props.open || !root.value) return;
  const t = e.target;
  if (root.value.contains(t) || t?.closest?.('.shd-dialog-backdrop') || t?.tagName === 'IFRAME') return;
  root.value.querySelector('h1[tabindex], .lsp-back')?.focus({ preventScroll: true });
}

watch(
  () => props.open,
  async (isOpen) => {
    document.documentElement.classList.toggle('lsp-locked', isOpen);
    if (isOpen) {
      await nextTick();
      (root.value?.querySelector('h1[tabindex]') || root.value?.querySelector('.lsp-back'))?.focus({ preventScroll: true });
    }
  },
  { immediate: true },
);

function loadFonts() {
  if (document.getElementById('lsp-fonts')) return;
  const link = document.createElement('link');
  link.id = 'lsp-fonts';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Readex+Pro:wght@300;400;500;600;700&display=swap';
  document.head.appendChild(link);
}

let stopAccount = null;
onMounted(() => {
  stopAccount = onAccount((a) => (a ? onSignedIn() : onSignedOut()));
  loadFonts();
  window.addEventListener('keydown', onKey);
  document.addEventListener('focusin', onFocusIn);
  if (props.mode === 'resume') resume();
  else start();
  pollMentor();
});
onBeforeUnmount(() => {
  stopAccount?.();
  window.removeEventListener('keydown', onKey);
  document.removeEventListener('focusin', onFocusIn);
  document.documentElement.classList.remove('lsp-locked');
  clearInterval(pollTimer);
});

defineExpose({ ask, openHandoff, openMentor, openBook });
</script>
