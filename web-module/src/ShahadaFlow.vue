<template>
  <section class="shd" :dir="isRtl(lang) ? 'rtl' : 'ltr'" :lang="lang" :aria-label="tr('title')">
    <header class="shd-flow__head">
      <h2>{{ tr('title') }}</h2>
    </header>

    <div v-for="item in items" :key="item.key" :ref="(el) => (els[item.key] = el)" class="shd-flow__item">
      <div v-if="item.type === 'loading'" class="shd-loading" role="status">
        <span class="shd-spinner" aria-hidden="true"></span>{{ item.label || tr('loading') }}
      </div>

      <div v-else-if="item.type === 'error'" class="shd-card">
        <p class="shd-error" role="alert">{{ tr('errorGeneric') }}</p>
        <div class="shd-actions"><button type="button" class="shd-btn" @click="item.retry()">{{ tr('retry') }}</button></div>
      </div>

      <p v-else-if="item.type === 'notice'" class="shd-muted">{{ item.text }}</p>

      <StartCard v-else-if="item.type === 'card'" :card="item.card" :lang="lang" :busy="busy" @confirm="confirmCard" />

      <LessonView
        v-else-if="item.type === 'lesson'"
        :lesson="item.lesson"
        :lang="lang"
        :first="item.first"
        :active="item.key === activeLessonKey"
        :busy="busy"
        @next="(answer) => completeLesson(item, answer)"
        @index="showIndex"
        @ask-general="focusAsk"
        @open-lesson="openLesson"
        @handoff="openHandoff"
      />

      <FirstChoice v-else-if="item.type === 'choice'" :lang="lang" :selected="item.selected" :busy="busy" @choose="(c) => choose(item, c)" />

      <SaveProgress
        v-else-if="item.type === 'save'"
        :lang="lang"
        :account="progress?.account || null"
        :reminder="progress?.reminder || null"
        @dismiss="remove(item)"
        @signed-in="(a) => progress && (progress.account = a)"
        @forgotten="onForgotten"
      />

      <LessonIndex v-else-if="item.type === 'index'" :lang="lang" :next="progress?.next?.id || null" @open="openLesson" />

      <template v-else-if="item.type === 'question'">
        <p class="shd-bubble" dir="auto">{{ item.text }}</p>
      </template>

      <AnswerCard
        v-else-if="item.type === 'answer'"
        :answer="item.answer"
        :question="item.question"
        :loading="item.loading"
        :error="item.error"
        :lang="lang"
        @retry="runAsk(item)"
        @handoff="openHandoff"
        @open-lesson="openLesson"
      />

      <div v-else-if="item.type === 'handoff'" class="shd-card shd-card--soft">
        <p class="shd-success">{{ tr('queuedTitle') }}</p>
        <p class="shd-muted">{{ item.message || tr('queuedNote') }}</p>
      </div>

      <article v-else-if="item.type === 'mentor'" class="shd-card shd-mentor">
        <p class="shd-eyebrow">{{ tr('mentorReply') }}<template v-if="item.name"> · {{ item.name }}</template></p>
        <p style="white-space: pre-line" dir="auto">{{ item.text }}</p>
        <p v-for="(s, i) in item.replies" :key="i" class="shd-bubble">{{ s }}</p>
        <form v-if="item.handoffId" class="shd-row" @submit.prevent="replyToMentor(item)">
          <label :for="`shd-reply-${item.key}`" class="shd-sr">{{ tr('writeMentor') }}</label>
          <input :id="`shd-reply-${item.key}`" v-model="item.draft" class="shd-input" type="text" maxlength="2000" :placeholder="tr('writeMentor')" />
          <button type="submit" class="shd-btn" :disabled="!item.draft?.trim()">{{ tr('send') }}</button>
        </form>
      </article>

      <div v-else-if="item.type === 'done'" class="shd-card">
        <h3>{{ tr('doneTitle') }}</h3>
        <p>{{ tr('doneBody') }}</p>
        <div class="shd-actions">
          <button type="button" class="shd-btn shd-btn--primary" @click="openHandoff({ reason: 'user_request', question: '' })">{{ tr('talkHuman') }}</button>
          <button type="button" class="shd-btn" @click="showIndex">{{ tr('index') }}</button>
        </div>
      </div>
    </div>

    <footer class="shd-flow__foot">
      <!-- Free questions, any time: routed, retrieved, generated and checked by the service. -->
      <form v-if="confirmedCard" class="shd-flow__ask" @submit.prevent="submitAsk">
        <label :for="askId" class="shd-field__label">{{ tr('askTitle') }}</label>
        <div class="shd-row">
          <input :id="askId" ref="askInput" v-model="askDraft" class="shd-input" type="text" maxlength="500" :placeholder="tr('askPlaceholder')" />
          <button type="submit" class="shd-btn" :disabled="!askDraft.trim()">{{ tr('ask') }}</button>
        </div>
        <p class="shd-muted">{{ tr('askHint') }}</p>
      </form>
      <div class="shd-actions">
        <button v-if="confirmedCard" type="button" class="shd-btn shd-btn--quiet shd-btn--small" @click="showSave">{{ tr('settings') }}</button>
        <button v-if="confirmedCard" type="button" class="shd-btn shd-btn--quiet shd-btn--small" @click="showIndex">{{ tr('index') }}</button>
      </div>
      <p class="shd-transparency">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" /></svg>
        {{ tr('transparency') }}
      </p>
    </footer>

    <HandoffDialog
      :open="handoff.open"
      :lang="lang"
      :reason="handoff.reason"
      :question="handoff.question"
      :lesson="currentLesson ? { id: currentLesson.id, title: currentLesson.title } : null"
      :country="confirmedCard?.country || null"
      @close="handoff.open = false"
      @sent="onHandoffSent"
    />
  </section>
</template>

<script setup>
// The after-Shahada module, rendered inside the chat right below the congratulation. It runs the
// journey as a thread of its own: start card -> Shahada lesson -> "what first?" -> save progress
// -> one lesson at a time, with free questions and a person always one tap away.
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import StartCard from './StartCard.vue';
import LessonView from './LessonView.vue';
import FirstChoice from './FirstChoice.vue';
import LessonIndex from './LessonIndex.vue';
import AnswerCard from './AnswerCard.vue';
import HandoffDialog from './HandoffDialog.vue';
import SaveProgress from './SaveProgress.vue';
import { api } from './api.js';
import { apiLang, isRtl, useT } from './i18n.js';
import './shahada.css';

const props = defineProps({
  // The conversation up to and including the congratulation, as [{ role, text }].
  conversation: { type: Array, default: () => [] },
  // Interface locale of the host page.
  lang: { type: String, default: 'en' },
  // 'shahada': the moment itself, start card first. 'resume': a returning learner (e.g. the
  // reminder email link); they are not asked again about what they already told us.
  mode: { type: String, default: 'shahada' },
  lessonId: { type: String, default: null },
});

const tr = useT(() => props.lang);
const askId = `shd-ask-${Math.random().toString(36).slice(2, 7)}`;

const items = ref([]);
const els = {};
const busy = ref(false);
const progress = ref(null);
const confirmedCard = ref(null);
const backgroundPassages = ref(false);
const askDraft = ref('');
const askInput = ref(null);
const handoff = reactive({ open: false, reason: 'user_request', question: '' });
let seq = 0;
let firstLesson = null;
let savePromptShown = false;
let pollTimer = null;
let lastMentorAt = null;
const seenMentor = new Set();

// Lessons come in the language the learner confirmed on the card, which may differ from the page.
const learnerLang = computed(() => confirmedCard.value?.language?.value || apiLang(props.lang));
const lessonItems = computed(() => items.value.filter((i) => i.type === 'lesson'));
const activeLessonKey = computed(() => lessonItems.value.at(-1)?.key ?? null);
const currentLesson = computed(() => lessonItems.value.at(-1)?.lesson ?? null);

function push(item) {
  const entry = reactive({ key: `i${++seq}`, ...item });
  items.value.push(entry);
  scrollTo(entry.key);
  return entry;
}
function remove(item) {
  items.value = items.value.filter((i) => i !== item);
}
async function scrollTo(key) {
  await nextTick();
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  els[key]?.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

// An error in the thread with a retry that replaces it.
function fail(retry) {
  const err = push({ type: 'error', retry: () => (remove(err), retry()) });
}

// Show a spinner in place, then swap in the result or a retry.
async function step(label, fn) {
  const spinner = push({ type: 'loading', label });
  try {
    await fn();
  } catch {
    fail(() => step(label, fn));
  } finally {
    remove(spinner);
  }
}

function start() {
  return step(tr('loadingStart'), async () => {
    const res = await api.start(apiLang(props.lang), props.conversation);
    firstLesson = res.first_lesson;
    push({ type: 'card', card: res.card || {} });
  });
}

function resume() {
  return step(tr('loading'), async () => {
    progress.value = await api.progress();
    // A returning learner already confirmed their card; only the language matters from it.
    confirmedCard.value = { language: progress.value?.lang ? { value: progress.value.lang } : null };
    const id = props.lessonId || progress.value?.next?.id;
    if (id) await loadLesson(id);
    else push({ type: 'done' });
  });
}

async function confirmCard({ card, background_passages }) {
  busy.value = true;
  try {
    progress.value = await api.profile({
      lang: card.language?.value || apiLang(props.lang),
      choice: null,
      card,
      background_passages,
    });
    confirmedCard.value = card;
    backgroundPassages.value = background_passages;
    items.value = items.value.filter((i) => i.type !== 'card');
    // The first lesson is fetched again so it can carry the passages chosen for the stated former belief.
    if (firstLesson && !(background_passages && card.previous_religion)) push({ type: 'lesson', lesson: firstLesson, first: true });
    else await loadLesson('u1l3', true);
  } catch {
    fail(() => confirmCard({ card, background_passages }));
  } finally {
    busy.value = false;
  }
}

async function loadLesson(id, first = false) {
  await step(tr('loading'), async () => {
    const background = backgroundPassages.value ? confirmedCard.value?.previous_religion?.value ?? null : null;
    const lesson = await api.lesson(id, learnerLang.value, background);
    push({ type: 'lesson', lesson, first });
  });
}

async function completeLesson(item, checkAnswer) {
  busy.value = true;
  try {
    progress.value = await api.complete(item.lesson.id, learnerLang.value, checkAnswer);
    if (item.first && !progress.value?.choice) {
      push({ type: 'choice', selected: null });
    } else {
      await advance();
    }
  } catch {
    fail(() => completeLesson(item, checkAnswer));
  } finally {
    busy.value = false;
  }
}

async function choose(item, choice) {
  item.selected = choice;
  busy.value = true;
  try {
    progress.value = await api.profile({
      lang: learnerLang.value,
      choice,
      card: confirmedCard.value,
      background_passages: backgroundPassages.value,
    });
    if (!savePromptShown) showSave();
    await advance();
  } catch {
    item.selected = null;
    fail(() => choose(item, choice));
  } finally {
    busy.value = false;
  }
}

async function advance() {
  const next = progress.value?.next;
  if (next?.id) await loadLesson(next.id);
  else push({ type: 'done' });
}

function openLesson(id) {
  return loadLesson(id);
}

function showIndex() {
  const last = items.value.at(-1);
  if (last?.type === 'index') return scrollTo(last.key);
  push({ type: 'index' });
}

function showSave() {
  savePromptShown = true;
  const existing = items.value.find((i) => i.type === 'save');
  if (existing) remove(existing);
  push({ type: 'save' });
}

async function focusAsk() {
  await nextTick();
  askInput.value?.focus();
  askInput.value?.scrollIntoView?.({ block: 'center' });
}

function submitAsk() {
  const q = askDraft.value.trim();
  if (!q) return;
  askDraft.value = '';
  ask(q);
}

/** Ask a free question (also called by the host page's own composer). */
function ask(question) {
  push({ type: 'question', text: question });
  const item = push({ type: 'answer', question, answer: null, loading: true, error: false });
  runAsk(item);
}

async function runAsk(item) {
  item.loading = true;
  item.error = false;
  try {
    item.answer = await api.ask(item.question, learnerLang.value, null);
  } catch {
    item.error = true;
  } finally {
    item.loading = false;
    scrollTo(item.key);
  }
}

/** Open the referral dialog (also called by the host page's "Talk to a human" button). */
function openHandoff({ reason = 'user_request', question = '' } = {}) {
  handoff.reason = reason;
  handoff.question = question;
  handoff.open = true;
}

function onHandoffSent(res) {
  push({ type: 'handoff', id: res.id, message: res.message });
  startPolling();
}

// Mentor replies arrive whenever the learner is here; they are fetched, not pushed.
async function pollMentor() {
  try {
    const res = await api.handoffMessages(lastMentorAt || undefined);
    const list = Array.isArray(res) ? res : res?.messages || [];
    for (const m of list) {
      const id = m.id ?? `${m.handoff_id}:${m.created_at}`;
      if (seenMentor.has(id)) continue;
      seenMentor.add(id);
      if (m.created_at && (!lastMentorAt || m.created_at > lastMentorAt)) lastMentorAt = m.created_at;
      push({ type: 'mentor', text: m.text, name: m.mentor_name || '', handoffId: m.handoff_id || null, replies: [], draft: '' });
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
  // The server has forgotten everything; the screen forgets the card too.
  confirmedCard.value = null;
  progress.value = null;
  items.value = items.value.filter((i) => i.type === 'save');
}

onMounted(() => {
  (props.mode === 'resume' ? resume() : start());
  pollMentor();
});
onBeforeUnmount(() => clearInterval(pollTimer));

defineExpose({ ask, openHandoff });
</script>

<style scoped>
.shd-flow__head h2 { color: var(--shd-accent-ink); }
.shd-flow__item { scroll-margin-top: 1rem; }
.shd-flow__foot { display: flex; flex-direction: column; gap: 0.5rem; padding-top: 0.25rem; }
.shd-flow__ask { display: flex; flex-direction: column; gap: 0.35rem; }
</style>
