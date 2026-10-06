<template>
  <section class="lsp-ask" :aria-labelledby="`${uid}-h`">
    <header class="lsp-ask__head">
      <h2 :id="`${uid}-h`"><SpaceIcon name="message" />{{ tr('askPanelTitle') }}</h2>
      <button type="button" class="lsp-icon-btn lsp-ask__widen" :aria-pressed="wide ? 'true' : 'false'" :aria-label="wide ? tr('narrow') : tr('widen')" :title="wide ? tr('narrow') : tr('widen')" @click="$emit('toggle-wide')">
        <SpaceIcon :name="wide ? 'shrink' : 'expand'" :size="18" />
      </button>
    </header>

    <div ref="scroller" class="lsp-ask__thread" aria-live="polite">
      <div v-if="!thread.length" class="lsp-ask__empty">
        <span class="lsp-ask__empty-ic"><SpaceIcon name="sparkle" :size="28" /></span>
        <p class="lsp-ask__empty-title">{{ tr('askEmptyTitle') }}</p>
        <p class="lsp-muted lsp-small">{{ tr('askEmptyBody') }}</p>
        <div class="lsp-sugg">
          <button v-for="k in ['sugg1', 'sugg2', 'sugg3']" :key="k" type="button" class="lsp-sugg__btn" @click="$emit('ask', tr(k))">{{ tr(k) }}</button>
        </div>
      </div>

      <template v-for="item in thread" :key="item.key">
        <div v-if="item.type === 'q'" class="lsp-bubble lsp-bubble--me" dir="auto">
          <span class="lsp-bubble__who">{{ tr('you') }}<template v-if="item.lessonTitle"> · {{ item.lessonTitle }}</template></span>
          <p>{{ item.question }}</p>
        </div>

        <div v-else-if="item.type === 'a'" class="lsp-answer" :class="{ 'is-loading': item.loading }">
          <span class="lsp-bubble__who lsp-answer__who"><SpaceIcon name="book" :size="14" />{{ tr('tutor') }}</span>
          <!-- Live stages while the service routes, retrieves and checks; nothing is shown before the checker. -->
          <ol v-if="item.loading" class="lsp-stages" role="status">
            <li v-for="(s, i) in STAGES" :key="s" :class="{ done: item.stageIdx > i, on: item.stageIdx === i }">
              <span class="lsp-stages__dot" aria-hidden="true">
                <SpaceIcon v-if="item.stageIdx > i" name="check" :size="12" />
                <span v-else-if="item.stageIdx === i" class="shd-spinner"></span>
              </span>
              <span>{{ i === 1 && item.pages?.length ? `${tr('stage2')} · ${tr('stage2Found', { pages: item.pages.join(isRtl(lang) ? '، ' : ', ') })}` : tr(s) }}</span>
            </li>
          </ol>
          <AnswerCard
            v-else
            :answer="item.answer"
            :question="item.question"
            :error="item.error"
            :lang="lang"
            @retry="$emit('retry', item)"
            @handoff="$emit('handoff', $event)"
            @open-lesson="$emit('open-lesson', $event)"
          />
        </div>

        <div v-else-if="item.type === 'handoff'" class="lsp-sysmsg" role="status">
          <span class="lsp-sysmsg__ic"><SpaceIcon name="check" :size="16" /></span>
          <div>
            <strong>{{ tr('queuedTitle') }}</strong>
            <p class="lsp-small">{{ item.message || tr('queuedNote') }}</p>
          </div>
        </div>

        <!-- A conversation with the team: the whole thread from the service, one box to answer in. -->
        <article v-else-if="item.type === 'case'" class="lsp-case" :data-case="item.case.id" :aria-labelledby="`${uid}-c-${item.case.id}`">
          <header class="lsp-case__head">
            <span :id="`${uid}-c-${item.case.id}`" class="lsp-bubble__who lsp-case__title">
              <SpaceIcon name="users" :size="14" />{{ tr(item.case.mentor === 'sister' ? 'caseWithSister' : 'caseWithBrother') }}
            </span>
            <span class="lsp-case__state" :class="`is-${caseState(item.case)}`">
              <SpaceIcon v-if="caseState(item.case) === 'replied'" name="check" :size="12" />{{ tr(`caseState_${caseState(item.case)}`) }}
            </span>
          </header>
          <template v-for="m in item.case.messages" :key="m.id">
            <div v-if="m.author === 'mentor'" class="lsp-bubble lsp-bubble--mentor">
              <span class="lsp-bubble__who"><SpaceIcon name="users" :size="14" /><span>{{ tr('mentorReply') }}<template v-if="m.mentor_name"> · <bdi>{{ m.mentor_name }}</bdi></template></span></span>
              <p dir="auto">{{ m.text }}</p>
            </div>
            <div v-else class="lsp-bubble lsp-bubble--mine">
              <span class="lsp-bubble__who">{{ tr('you') }}</span>
              <p dir="auto">{{ m.text }}</p>
            </div>
          </template>
          <div v-if="caseState(item.case) === 'sent'" class="lsp-case__wait">
            <p>{{ tr(item.case.mentor === 'sister' ? 'queuedWhenSister' : 'queuedWhenBrother') }} {{ tr('queuedWhere') }}</p>
            <button v-if="!signedIn" type="button" class="lsp-linkbtn" @click="$emit('save')">{{ tr('queuedSave') }}</button>
          </div>
          <form class="lsp-composer lsp-composer--inline" @submit.prevent="$emit('reply', item.case)">
            <label :for="`${uid}-r-${item.case.id}`" class="lsp-sr">{{ tr('writeMentor') }}</label>
            <input :id="`${uid}-r-${item.case.id}`" v-model="item.case.draft" type="text" maxlength="2000" :placeholder="tr('writeMentor')" />
            <button type="submit" class="lsp-send" :disabled="!item.case.draft?.trim() || item.case.sending" :aria-label="tr('send')"><SpaceIcon name="send" :size="18" /></button>
          </form>
          <p v-if="item.case.failed" class="shd-error" role="alert">{{ tr('errorGeneric') }}</p>
        </article>
      </template>
    </div>

    <form class="lsp-ask__form" @submit.prevent="submit">
      <div v-if="lessonTitle" class="lsp-scope" role="radiogroup" :aria-label="tr('askScope')">
        <span class="lsp-scope__label">{{ tr('askScope') }}</span>
        <label :class="{ on: scope === 'lesson' }">
          <input type="radio" :checked="scope === 'lesson'" :name="`${uid}-scope`" @change="$emit('update:scope', 'lesson')" />
          <span class="lsp-scope__text">{{ tr('askScopeLesson') }}</span>
        </label>
        <label :class="{ on: scope === 'book' }">
          <input type="radio" :checked="scope === 'book'" :name="`${uid}-scope`" @change="$emit('update:scope', 'book')" />
          <span class="lsp-scope__text">{{ tr('askScopeBook') }}</span>
        </label>
      </div>
      <div class="lsp-composer">
        <label :for="`${uid}-q`" class="lsp-sr">{{ tr('askTitle') }}</label>
        <textarea
          :id="`${uid}-q`"
          ref="input"
          v-model="draft"
          rows="1"
          maxlength="500"
          :placeholder="tr('askPlaceholder')"
          @keydown.enter.exact.prevent="submit"
          @input="grow"
        ></textarea>
        <button type="submit" class="lsp-send" :disabled="!draft.trim()" :aria-label="tr('ask')"><SpaceIcon name="send" :size="20" /></button>
      </div>
      <p class="lsp-ask__hint"><SpaceIcon name="book" :size="14" />{{ tr('askHint') }}</p>
    </form>
  </section>
</template>

<script setup>
// The tutor: a fixed question box and the questions asked in this space. Every answer shows its
// live stages (understanding → found on pages → checking), then the checked answer with sources.
import { nextTick, ref, watch } from 'vue';
import AnswerCard from '../AnswerCard.vue';
import SpaceIcon from './SpaceIcon.vue';
import { isRtl, useT } from '../i18n.js';

const props = defineProps({
  lang: { type: String, default: 'en' },
  thread: { type: Array, default: () => [] },
  scope: { type: String, default: 'book' },
  lessonTitle: { type: String, default: '' },
  wide: { type: Boolean, default: false },
  signedIn: { type: Boolean, default: false },
});
const emit = defineEmits(['ask', 'retry', 'handoff', 'open-lesson', 'reply', 'save', 'update:scope', 'toggle-wide']);

const STAGES = ['stage1', 'stage2', 'stage3'];
const tr = useT(() => props.lang);
const uid = `lsp-ask-${Math.random().toString(36).slice(2, 7)}`;
const draft = ref('');
const input = ref(null);
const scroller = ref(null);

// Sent (waiting for the team) -> Replied; a closed conversation still takes a new message.
function caseState(c) {
  if (c.status === 'closed') return 'closed';
  return c.messages.some((m) => m.author === 'mentor') ? 'replied' : 'sent';
}

function grow() {
  const el = input.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
}
function submit() {
  const q = draft.value.trim();
  if (!q) return;
  draft.value = '';
  nextTick(grow);
  emit('ask', q);
}

async function scrollToEnd() {
  await nextTick();
  const el = scroller.value;
  if (!el) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  // Show the newest question with the start of its answer, not the bottom of a long answer.
  const items = el.querySelectorAll('.lsp-bubble--me');
  const last = items[items.length - 1];
  const top = last ? last.offsetTop - 12 : el.scrollHeight;
  el.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
}
watch(() => props.thread.length, scrollToEnd);
watch(() => props.thread.map((i) => i.loading).join(), scrollToEnd);

defineExpose({ focus: () => input.value?.focus() });
</script>
