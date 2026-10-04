<template>
  <section class="shd-card" :aria-labelledby="headId">
    <div>
      <h3 :id="headId">{{ tr('cardTitle') }}</h3>
      <p class="shd-muted">{{ tr('cardIntro') }}</p>
    </div>

    <div>
      <div
        v-for="key in FIELDS"
        :key="key"
        class="shd-field"
        :class="{ 'shd-field--deleted': state[key].deleted }"
      >
        <div class="shd-field__head">
          <span class="shd-field__label" :id="`${headId}-${key}`">{{ tr(`field_${key}`) }}</span>
          <div v-if="state[key].original && !state[key].editing" class="shd-actions">
            <template v-if="!state[key].deleted">
              <button type="button" class="shd-btn shd-btn--quiet shd-btn--small" :aria-label="tr('editField', { field: tr(`field_${key}`) })" @click="startEdit(key)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" /></svg>
                {{ tr('edit') }}
              </button>
              <button type="button" class="shd-btn shd-btn--quiet shd-btn--small" :aria-label="tr('deleteField', { field: tr(`field_${key}`) })" @click="state[key].deleted = true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
                {{ tr('delete') }}
              </button>
            </template>
            <button v-else type="button" class="shd-btn shd-btn--quiet shd-btn--small" :aria-label="tr('restoreField', { field: tr(`field_${key}`) })" @click="state[key].deleted = false">
              {{ tr('restore') }}
            </button>
          </div>
        </div>

        <template v-if="!state[key].original">
          <span class="shd-muted">{{ tr('notStated') }}</span>
        </template>
        <form v-else-if="state[key].editing" class="shd-row" @submit.prevent="commitEdit(key)">
          <select v-if="key === 'language'" v-model="state[key].draft" class="shd-select" :aria-labelledby="`${headId}-${key}`" style="flex: 1 1 auto">
            <option v-for="code in LANGS" :key="code" :value="code">{{ langName(code) }}</option>
          </select>
          <input v-else ref="editInput" v-model="state[key].draft" class="shd-input" type="text" maxlength="80" :aria-labelledby="`${headId}-${key}`" />
          <button type="submit" class="shd-btn shd-btn--small">{{ tr('save') }}</button>
          <button type="button" class="shd-btn shd-btn--quiet shd-btn--small" @click="state[key].editing = false">{{ tr('cancel') }}</button>
        </form>
        <template v-else>
          <span class="shd-field__value">{{ display(key) }}</span>
          <span v-if="state[key].deleted" class="shd-muted">{{ tr('deletedNote') }}</span>
          <span v-else-if="state[key].original.evidence" class="shd-field__evidence">
            {{ tr('youSaid') }} <q>{{ state[key].original.evidence }}</q>
          </span>
        </template>
      </div>
    </div>

    <template v-if="state.previous_religion.original && !state.previous_religion.deleted">
      <label class="shd-check">
        <input v-model="background" type="checkbox" />
        <span>{{ tr('backgroundToggle') }}</span>
      </label>
      <p class="shd-muted">{{ tr('religionPrivacy') }}</p>
    </template>

    <div class="shd-actions">
      <button type="button" class="shd-btn shd-btn--primary" :disabled="busy" @click="submit">
        <span v-if="busy" class="shd-spinner" aria-hidden="true"></span>{{ tr('continue') }}
      </button>
      <button type="button" class="shd-btn shd-btn--quiet" :disabled="busy" @click="skip">{{ tr('skipCard') }}</button>
    </div>
  </section>
</template>

<script setup>
// "What we understood from you". Each field was filled only from a sentence the user wrote, and
// that sentence is shown beside it. Edits and deletions stay in the browser until Continue.
import { nextTick, reactive, ref } from 'vue';
import { useT } from './i18n.js';

const props = defineProps({
  card: { type: Object, required: true },
  lang: { type: String, default: 'en' },
  busy: { type: Boolean, default: false },
});
const emit = defineEmits(['confirm']);

const FIELDS = ['language', 'previous_religion', 'country', 'asked_about'];
const LANGS = ['en', 'ar', 'fr', 'es', 'pt', 'id', 'ru', 'tr', 'de', 'ur', 'hi', 'bn', 'zh', 'ja', 'ko', 'vi', 'th', 'tl', 'sw', 'bs', 'fa'];

const tr = useT(() => props.lang);
const headId = `shd-card-${Math.random().toString(36).slice(2, 7)}`;
const editInput = ref(null);
const background = ref(true);

const state = reactive(
  Object.fromEntries(
    FIELDS.map((k) => [k, { original: props.card?.[k] || null, current: props.card?.[k] ? { ...props.card[k] } : null, deleted: false, editing: false, draft: '' }]),
  ),
);

function langName(code) {
  try {
    return new Intl.DisplayNames([props.lang], { type: 'language' }).of(code) || code;
  } catch {
    return code;
  }
}

function display(key) {
  const f = state[key].current;
  if (!f) return '';
  if (key === 'language') return langName(f.value);
  return f.label || f.value;
}

async function startEdit(key) {
  const f = state[key].current;
  state[key].draft = key === 'language' ? f.value : f.label || f.value;
  state[key].editing = true;
  await nextTick();
  editInput.value?.[0]?.focus?.();
}

function commitEdit(key) {
  const draft = String(state[key].draft || '').trim();
  if (!draft) return;
  const f = state[key].current;
  // An edited country has no code any more; the label is what the user typed and the service
  // falls back to the general emergency number for it.
  state[key].current = key === 'language' ? { ...f, value: draft } : { ...f, value: draft, label: draft, edited: true };
  state[key].editing = false;
}

function result(all) {
  return Object.fromEntries(FIELDS.map((k) => [k, all && !state[k].deleted ? state[k].current : null]));
}

function submit() {
  const card = result(true);
  emit('confirm', { card, background_passages: Boolean(card.previous_religion) && background.value });
}

// Skipping keeps nothing but the language the conversation was already in.
function skip() {
  const card = result(false);
  if (state.language.current) card.language = state.language.current;
  emit('confirm', { card, background_passages: false });
}
</script>
