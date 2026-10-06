<template>
  <div v-if="ready" class="shd-flow">
    <JourneyCard
      ref="card"
      :lang="lang"
      :started="summary.started"
      :resume="spaceMode === 'resume'"
      :done="summary.done"
      :total="summary.total"
      :next-title="summary.nextTitle"
      :mentor-unread="summary.mentorUnread"
      :mentor-state="summary.mentorState"
      :mentor-who="summary.mentorWho"
      @open="open = true"
      @open-mentor="openMentor"
    />
    <LearningSpace
      ref="space"
      :open="open"
      :conversation="conversation"
      :lang="lang"
      :mode="spaceMode"
      :lesson-id="lessonId"
      @close="close"
      @summary="(s) => Object.assign(summary, s)"
    />
  </div>
</template>

<script setup>
// The after-Shahada module, rendered inside the chat right below the congratulation. In the chat
// it is a single card; the journey itself happens in the learning space (space/), which opens
// full-screen over the chat and closes back to it.
import { nextTick, onMounted, reactive, ref, watch } from 'vue';
import JourneyCard from './space/JourneyCard.vue';
import LearningSpace from './space/LearningSpace.vue';
import { hasBegun, rememberReturning } from './returning.js';
import './shahada.css';
import './space/space.css';

const props = defineProps({
  // The conversation up to and including the congratulation, as [{ role, text }].
  conversation: { type: Array, default: () => [] },
  // Interface locale of the host page.
  lang: { type: String, default: 'en' },
  // 'shahada': the moment itself, start card first. 'resume': a returning learner (e.g. the
  // reminder email link, ?lesson=<id>); the space opens straight on their lesson. 'return': a
  // returning learner on the home page; the card offers the way back (and any reply from the
  // team) without opening the space by itself.
  mode: { type: String, default: 'shahada' },
  lessonId: { type: String, default: null },
});

const open = ref(false);
const card = ref(null);
const space = ref(null);
const summary = reactive({ started: false, done: 0, total: 19, nextTitle: '', mentorUnread: 0, mentorState: null, mentorWho: null, mentorCases: 0 });
// A learner who already went through the start card never sees it again (e.g. the demo replayed).
const ready = ref(props.mode !== 'shahada');
const spaceMode = ref(props.mode === 'shahada' ? 'shahada' : 'resume');

async function close() {
  open.value = false;
  await nextTick();
  card.value?.focus();
}

/** Ask a free question (also called by the host page's own composer). */
function ask(question) {
  open.value = true;
  space.value?.ask(question, { lessonBound: false });
}

/** Open the referral dialog (also called by the host page's "Talk to a human" button). */
function openHandoff(opts) {
  space.value?.openHandoff(opts);
}

/** Into the space, at the conversation with the team's newest reply. */
function openMentor() {
  open.value = true;
  space.value?.openMentor();
}

// Remembered in this browser so the host page offers the way back on the next visit.
watch(
  () => summary.started || summary.mentorCases > 0,
  (back) => back && rememberReturning(),
);

onMounted(async () => {
  if (props.mode === 'shahada') {
    try {
      if (await hasBegun()) spaceMode.value = 'resume';
    } catch {
      // Could not tell: start from the card, as before.
    }
    ready.value = true;
  }
  if (props.mode === 'resume') open.value = true;
});

defineExpose({ ask, openHandoff, openMentor });
</script>
