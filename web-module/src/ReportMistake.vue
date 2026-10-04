<template>
  <div class="shd-report">
    <button v-if="!open && !done" type="button" class="shd-btn shd-btn--quiet shd-btn--small" :aria-expanded="'false'" @click="openForm">
      {{ tr('reportMistake') }}
    </button>
    <form v-else-if="!done" class="shd-report__form" @submit.prevent="submit">
      <label :for="fieldId" class="shd-field__label">{{ tr('reportMistake') }}</label>
      <textarea :id="fieldId" ref="input" v-model="note" class="shd-textarea" rows="2" :placeholder="tr('reportPlaceholder')" required></textarea>
      <div class="shd-actions">
        <button type="submit" class="shd-btn shd-btn--small" :disabled="busy || !note.trim()">{{ tr('send') }}</button>
        <button type="button" class="shd-btn shd-btn--quiet shd-btn--small" @click="open = false">{{ tr('cancel') }}</button>
      </div>
      <p v-if="error" class="shd-error" role="alert">{{ tr('errorGeneric') }}</p>
    </form>
    <p v-else class="shd-success" role="status">{{ tr('reportThanks') }}</p>
  </div>
</template>

<script setup>
// "Report a mistake": goes to the mentor panel's report list, tagged with what it is about.
import { nextTick, ref } from 'vue';
import { api } from './api.js';
import { apiLang, useT } from './i18n.js';

const props = defineProps({
  target: { type: String, required: true }, // "lesson:u3l3" | "answer:<id>"
  lang: { type: String, default: 'en' },
});
const tr = useT(() => props.lang);
const fieldId = `shd-report-${Math.random().toString(36).slice(2, 8)}`;
const open = ref(false);
const done = ref(false);
const busy = ref(false);
const error = ref(false);
const note = ref('');
const input = ref(null);

async function openForm() {
  open.value = true;
  await nextTick();
  input.value?.focus();
}

async function submit() {
  busy.value = true;
  error.value = false;
  try {
    await api.report(props.target, note.value.trim(), apiLang(props.lang));
    done.value = true;
  } catch {
    error.value = true;
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.shd-report__form { display: flex; flex-direction: column; gap: 0.4rem; }
</style>
