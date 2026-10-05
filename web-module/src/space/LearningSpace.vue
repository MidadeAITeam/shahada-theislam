<template>
  <Teleport to="body">
    <div
      v-show="open"
      ref="root"
      class="shd lsp"
      :class="[`lsp--tab-${tab}`, { 'lsp--onb': phase !== 'learn', 'lsp--wide': wide }]"
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
          <span class="lsp-mhead__title">{{ phase === 'learn' && lesson ? lesson.title : tr('spaceTitle') }}</span>
          <span class="lsp-mhead__bar" aria-hidden="true"><span :style="{ width: `${pct}%` }"></span></span>
        </div>
        <span class="lsp-mhead__count" :aria-label="tr('ringLabel', { done, total })">{{ done }}/{{ total }}</span>
      </header>
      <p class="lsp-mtransparency"><SpaceIcon name="book" :size="13" />{{ tr('transparency') }}</p>

      <aside class="lsp-col lsp-col--path">
        <PathSidebar
          :lang="lang"
          :index="index"
          :progress="progress"
          :current-id="phase === 'learn' ? lesson?.id || null : null"
          :account="accountName"
          :disabled="phase !== 'learn'"
          @open="openLesson"
          @save="openSave"
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
        </div>

        <div class="lsp-main">
          <Onboarding
            v-if="phase === 'card' || phase === 'choice'"
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

          <div v-else-if="phase === 'done'" class="lsp-card lsp-state lsp-finished">
            <span class="lsp-finished__ic"><SpaceIcon name="sparkle" :size="34" /></span>
            <h1>{{ tr('doneTitle') }}</h1>
            <p class="lsp-muted">{{ tr('doneBody') }}</p>
            <div class="lsp-row">
              <button type="button" class="lsp-btn lsp-btn--primary" @click="openHandoff()">{{ tr('talkHuman') }}</button>
              <button type="button" class="lsp-btn lsp-btn--secondary" @click="tab = 'path'">{{ tr('openPath') }}</button>
            </div>
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
                :save-hint="saveHint"
                @next="completeLesson"
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
          :lesson-title="lesson?.title || ''"
          :wide="wide"
          @ask="ask"
          @retry="runAsk"
          @handoff="openHandoff"
          @open-lesson="openLesson"
          @reply="replyToMentor"
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
                  <span class="lsp-chip lsp-chip--violet">{{ tr('sourceNumber', { n: sheet.number }) }}</span>
                  <h2 :id="`${uid}-sheet`">{{ tr('sourceTitle') }}</h2>
                </div>
                <button type="button" class="lsp-icon-btn" :aria-label="tr('close')" @click="closeSheet"><SpaceIcon name="x" /></button>
              </div>
              <p v-if="sheet.source?.heading" class="lsp-sheet__heading" dir="auto">{{ sheet.source.heading }}</p>
              <blockquote
                v-if="sheet.source?.text"
                class="lsp-sheet__quote"
                :lang="sheet.source.lang"
                :dir="isRtl(sheet.source.lang) ? 'rtl' : 'ltr'"
              >{{ plain(sheet.source.text) }}</blockquote>
              <p class="lsp-sheet__cite"><SpaceIcon name="book" :size="16" />{{ tr('sourceRef', { book: tr('bookName'), page: sheet.page }) }}</p>
            </template>
            <template v-else-if="sheet.type === 'save'">
              <h2 :id="`${uid}-sheet`" class="lsp-sr">{{ tr('saveTitle') }}</h2>
              <SaveProgress
                :lang="lang"
                :account="progress?.account || null"
                :reminder="progress?.reminder || null"
                @dismiss="closeSheet"
                @signed-in="(a) => progress && (progress.account = a)"
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
    @close="handoff.open = false"
    @sent="onHandoffSent"
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
import HandoffDialog from '../HandoffDialog.vue';
import SaveProgress from '../SaveProgress.vue';
import { api } from '../api.js';
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

// Journey state
const phase = ref('loading'); // loading | card | choice | learn | done | error
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
const saveHintDismissed = ref(false);
const celebrate = ref(null);

// Screen state
const tab = ref('lesson');
const wide = ref(false);
const sheet = ref(null);
const askScope = ref('book');
const thread = ref([]);
const unread = ref(0);
const handoff = reactive({ open: false, reason: 'user_request', question: '' });
let seq = 0;

const learnerLang = computed(() => confirmedCard.value?.language?.value || progress.value?.lang || apiLang(props.lang));
const total = computed(() => progress.value?.position?.total || 19);
const done = computed(() => progress.value?.position?.done || 0);
const pct = computed(() => Math.round((100 * done.value) / (total.value || 1)));
const accountName = computed(() => progress.value?.account?.email || progress.value?.account?.name || '');
const saveHint = computed(() => !saveHintDismissed.value && !accountName.value && done.value >= 1 && done.value <= 3);

const plain = (t) => (t || '').replace(/\*\*?|__/g, '').replace(/^>\s?/gm, '').replace(/\n{2,}/g, '\n').trim();

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
  try {
    const background = backgroundPassages.value ? confirmedCard.value?.previous_religion?.value ?? null : null;
    lesson.value = await api.lesson(id, learnerLang.value, background);
    lessonNonce.value++;
    if (phase.value !== 'learn') phase.value = 'learn';
  } catch {
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

async function completeLesson(checkAnswer) {
  const L = lesson.value;
  if (!L || completing.value) return;
  const unitId = L.unit?.id;
  const unitBefore = index.value?.units?.find((u) => u.id === unitId);
  const wasComplete = unitBefore ? unitBefore.lessons.every((l) => l.done) : true;
  completing.value = 'saving';
  try {
    const [res] = await Promise.all([api.complete(L.id, learnerLang.value, checkAnswer), sleep(700)]);
    progress.value = res;
    completing.value = 'done';
    await Promise.all([loadIndex(), sleep(650)]);
    const unitAfter = index.value?.units?.find((u) => u.id === unitId);
    if (!wasComplete && unitAfter?.lessons?.every((l) => l.done)) {
      celebrate.value = { index: unitAfter.index, title: unitAfter.title };
      setTimeout(() => (celebrate.value = null), reduceMotion.value ? 2500 : 3200);
    }
    const next = progress.value?.next;
    if (next?.id) await loadLesson(next.id);
    else phase.value = 'done';
  } catch {
    // Keep the learner on the lesson; the button is ready to try again.
  } finally {
    completing.value = '';
  }
}

// ------------------------------------------------------------------ questions
function ask(question, { lessonBound } = {}) {
  const useLesson = lessonBound ?? (askScope.value === 'lesson' && !!lesson.value);
  thread.value.push(reactive({ key: `t${++seq}`, type: 'q', question, lessonTitle: useLesson ? lesson.value?.title : '' }));
  const item = reactive({ key: `t${++seq}`, type: 'a', question, lessonId: useLesson ? lesson.value?.id : null, answer: null, loading: true, error: false, stageIdx: 0, pages: [] });
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
    item.answer = await api.askStream(item.question, learnerLang.value, item.lessonId, (st) => {
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

function onHandoffSent(res) {
  thread.value.push({ key: `t${++seq}`, type: 'handoff', message: res.message });
  startPolling();
}

let pollTimer = null;
let lastMentorAt = null;
const seenMentor = new Set();
async function pollMentor() {
  try {
    const res = await api.handoffMessages(lastMentorAt || undefined);
    const list = Array.isArray(res) ? res : res?.messages || [];
    for (const m of list) {
      const id = m.id ?? `${m.handoff_id}:${m.created_at}`;
      if (seenMentor.has(id)) continue;
      seenMentor.add(id);
      if (m.created_at && (!lastMentorAt || m.created_at > lastMentorAt)) lastMentorAt = m.created_at;
      // The thread also holds the learner's own words (the referral question, their replies).
      if (m.author && m.author !== 'mentor') continue;
      thread.value.push(reactive({ key: `t${++seq}`, type: 'mentor', text: m.text, name: m.mentor_name || '', handoffId: m.handoff_id || null, replies: [], draft: '' }));
      if (tab.value !== 'ask') unread.value++;
    }
    if (list.length) startPolling();
  } catch {
    // Best effort: a failed poll must not interrupt a lesson.
  }
}
function startPolling() {
  if (!pollTimer) pollTimer = setInterval(pollMentor, 15000);
}
async function replyToMentor(item) {
  const text = item.draft.trim();
  if (!text) return;
  item.draft = '';
  try {
    await api.handoffSend(item.handoffId, text);
    item.replies.push(text);
  } catch {
    item.draft = text;
  }
}

function onForgotten() {
  // The server has forgotten everything; the screen forgets the card and the path too.
  confirmedCard.value = null;
  progress.value = null;
  lesson.value = null;
  index.value = null;
  thread.value = [];
}

// ------------------------------------------------------------------ screen
const isPhone = () => window.matchMedia?.('(max-width: 899px)').matches;

function selectTab(id) {
  if (id === 'mentor') return openHandoff();
  tab.value = id;
  if (id === 'ask') unread.value = 0;
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

onMounted(() => {
  loadFonts();
  window.addEventListener('keydown', onKey);
  document.addEventListener('focusin', onFocusIn);
  if (props.mode === 'resume') resume();
  else start();
  pollMentor();
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  document.removeEventListener('focusin', onFocusIn);
  document.documentElement.classList.remove('lsp-locked');
  clearInterval(pollTimer);
});

defineExpose({ ask, openHandoff });
</script>
