<template>
  <div class="shd-flow">
    <JourneyCard
      ref="card"
      :lang="lang"
      :started="summary.started"
      :resume="mode === 'resume'"
      :done="summary.done"
      :total="summary.total"
      :next-title="summary.nextTitle"
      @open="open = true"
    />
    <LearningSpace
      ref="space"
      :open="open"
      :conversation="conversation"
      :lang="lang"
      :mode="mode"
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
import { nextTick, onMounted, reactive, ref } from 'vue';
import JourneyCard from './space/JourneyCard.vue';
import LearningSpace from './space/LearningSpace.vue';
import './shahada.css';
import './space/space.css';

const props = defineProps({
  // The conversation up to and including the congratulation, as [{ role, text }].
  conversation: { type: Array, default: () => [] },
  // Interface locale of the host page.
  lang: { type: String, default: 'en' },
  // 'shahada': the moment itself, start card first. 'resume': a returning learner (e.g. the
  // reminder email link, ?lesson=<id>); the space opens straight on their lesson.
  mode: { type: String, default: 'shahada' },
  lessonId: { type: String, default: null },
});

const open = ref(false);
const card = ref(null);
const space = ref(null);
const summary = reactive({ started: false, done: 0, total: 19, nextTitle: '' });

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

onMounted(() => {
  if (props.mode === 'resume') open.value = true;
});

defineExpose({ ask, openHandoff });
</script>
