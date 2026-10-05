<template>
  <div class="lsp-onb">
    <header class="lsp-onb__hero">
      <p class="lsp-eyebrow"><SpaceIcon name="sparkle" :size="16" /> {{ tr('journeyTitle') }}</p>
      <h1 ref="heading" tabindex="-1">{{ tr('onbWelcome') }}</h1>
      <p class="lsp-muted">{{ tr('onbLead') }}</p>
      <ol class="lsp-onb__steps" :aria-label="tr('onbStep', { n: step === 'card' ? 1 : 2 })">
        <li :class="{ on: step === 'card', done: step !== 'card' }" :aria-current="step === 'card' ? 'step' : undefined">
          <span class="lsp-onb__dot"><SpaceIcon v-if="step !== 'card'" name="check" :size="14" /><template v-else>1</template></span>
          {{ tr('onbCardStep') }}
        </li>
        <li class="lsp-onb__bar" aria-hidden="true"></li>
        <li :class="{ on: step === 'choice' }" :aria-current="step === 'choice' ? 'step' : undefined">
          <span class="lsp-onb__dot">2</span>
          {{ tr('onbChoiceStep') }}
        </li>
      </ol>
    </header>

    <!-- Step 1: what we understood, each field beside the user's own words. -->
    <section v-if="step === 'card'" class="lsp-card lsp-onb__card" :aria-labelledby="`${uid}-card`">
      <div class="lsp-card__head">
        <h2 :id="`${uid}-card`"><SpaceIcon name="file" /> {{ tr('cardTitle') }}</h2>
        <p class="lsp-muted lsp-small">{{ tr('cardIntro') }}</p>
      </div>

      <div v-if="!card" class="lsp-skel-grid" role="status" :aria-label="tr('loadingStart')">
        <div v-for="i in 4" :key="i" class="lsp-skel"></div>
        <p class="lsp-muted lsp-small lsp-onb__loading"><span class="shd-spinner" aria-hidden="true"></span>{{ tr('loadingStart') }}</p>
      </div>

      <div v-else class="lsp-facts">
        <div v-for="key in FIELDS" :key="key" class="lsp-fact" :class="{ 'is-deleted': state[key].deleted, 'is-empty': !state[key].original }">
          <div class="lsp-fact__head">
            <span class="lsp-fact__label" :id="`${uid}-${key}`">{{ tr(`field_${key}`) }}</span>
            <div v-if="state[key].original && !state[key].editing" class="lsp-fact__tools">
              <template v-if="!state[key].deleted">
                <button type="button" class="lsp-icon-btn" :aria-label="tr('editField', { field: tr(`field_${key}`) })" :title="tr('edit')" @click="startEdit(key)">
                  <SpaceIcon name="pencil" :size="17" />
                </button>
                <button type="button" class="lsp-icon-btn" :aria-label="tr('deleteField', { field: tr(`field_${key}`) })" :title="tr('delete')" @click="state[key].deleted = true">
                  <SpaceIcon name="trash" :size="17" />
                </button>
              </template>
              <button v-else type="button" class="lsp-btn lsp-btn--ghost lsp-btn--sm" :aria-label="tr('restoreField', { field: tr(`field_${key}`) })" @click="state[key].deleted = false">
                <SpaceIcon name="undo" :size="16" /> {{ tr('restore') }}
              </button>
            </div>
          </div>

          <span v-if="!state[key].original" class="lsp-muted">{{ tr('notStated') }}</span>
          <form v-else-if="state[key].editing" class="lsp-fact__edit" @submit.prevent="commitEdit(key)">
            <select v-if="key === 'language'" v-model="state[key].draft" class="lsp-input" :aria-labelledby="`${uid}-${key}`">
              <option v-for="code in LANGS" :key="code" :value="code">{{ langName(code) }}</option>
            </select>
            <input v-else :ref="(el) => (editInputs[key] = el)" v-model="state[key].draft" class="lsp-input" type="text" maxlength="80" :aria-labelledby="`${uid}-${key}`" />
            <button type="submit" class="lsp-btn lsp-btn--primary lsp-btn--sm">{{ tr('save') }}</button>
            <button type="button" class="lsp-btn lsp-btn--ghost lsp-btn--sm" @click="state[key].editing = false">{{ tr('cancel') }}</button>
          </form>
          <template v-else>
            <span class="lsp-fact__value">{{ display(key) }}</span>
            <span v-if="state[key].deleted" class="lsp-muted lsp-small">{{ tr('deletedNote') }}</span>
            <blockquote v-else-if="state[key].original.evidence" class="lsp-fact__quote" dir="auto">
              <span class="lsp-fact__said">{{ tr('youSaid') }}</span> {{ tr('quoted', { q: state[key].original.evidence }) }}
            </blockquote>
          </template>
        </div>
      </div>

      <template v-if="card && state.previous_religion.original && !state.previous_religion.deleted">
        <label class="lsp-check">
          <input v-model="background" type="checkbox" />
          <span>{{ tr('backgroundToggle') }}</span>
        </label>
        <p class="lsp-privacy"><SpaceIcon name="lock" :size="16" />{{ tr('religionPrivacy') }}</p>
      </template>

      <div class="lsp-card__foot">
        <button type="button" class="lsp-btn lsp-btn--ghost" :disabled="busy || !card" @click="skip">{{ tr('skipCard') }}</button>
        <button type="button" class="lsp-btn lsp-btn--primary lsp-btn--lg" :disabled="busy || !card" @click="submit">
          <span v-if="busy" class="shd-spinner lsp-spinner-light" aria-hidden="true"></span>
          {{ tr('continue') }} <SpaceIcon name="next" :size="18" />
        </button>
      </div>
    </section>

    <!-- Step 2: one tap. The order that follows is computed by the service from fixed rules. -->
    <section v-else class="lsp-onb__choice" :aria-labelledby="`${uid}-choice`">
      <h2 :id="`${uid}-choice`" class="lsp-onb__q">{{ tr('choiceTitle') }}</h2>
      <p class="lsp-muted">{{ tr('choiceHint') }}</p>
      <div class="lsp-choices" role="group" :aria-labelledby="`${uid}-choice`">
        <button
          v-for="c in CHOICES"
          :key="c.id"
          type="button"
          class="lsp-choice"
          :class="`lsp-choice--${c.id}`"
          :aria-pressed="selected === c.id ? 'true' : 'false'"
          :disabled="busy && selected !== c.id"
          @click="!busy && $emit('choose', c.id)"
        >
          <span class="lsp-choice__ic"><SpaceIcon :name="c.icon" :size="30" /></span>
          <span class="lsp-choice__title">{{ tr(`choice_${c.id}`) }}</span>
          <span class="lsp-choice__sub">{{ tr(`choiceSub_${c.id}`) }}</span>
          <span v-if="busy && selected === c.id" class="shd-spinner lsp-choice__spin" aria-hidden="true"></span>
        </button>
      </div>
    </section>
  </div>
</template>

<script setup>
// The two-step welcome inside the learning space: "what we understood from you" (each field only
// from a sentence the user wrote, shown beside it, editable and deletable; nothing is saved until
// Continue), then "what would you like to learn first?".
import { nextTick, onMounted, reactive, ref, watch } from 'vue';
import SpaceIcon from './SpaceIcon.vue';
import { useT } from '../i18n.js';

const props = defineProps({
  lang: { type: String, default: 'en' },
  card: { type: Object, default: null },
  step: { type: String, default: 'card' }, // 'card' | 'choice'
  busy: { type: Boolean, default: false },
  selected: { type: String, default: null },
});
const emit = defineEmits(['confirm', 'choose']);

const FIELDS = ['language', 'previous_religion', 'country', 'asked_about'];
const LANGS = ['en', 'ar', 'fr', 'es', 'pt', 'id', 'ru', 'tr', 'de', 'ur', 'hi', 'bn', 'zh', 'ja', 'ko', 'vi', 'th', 'tl', 'sw', 'bs', 'fa'];
const CHOICES = [
  { id: 'wudu', icon: 'drop' },
  { id: 'prayer', icon: 'mosque' },
  { id: 'fatiha', icon: 'bookOpen' },
  { id: 'unsure', icon: 'question' },
];

const tr = useT(() => props.lang);
const uid = `lsp-onb-${Math.random().toString(36).slice(2, 7)}`;
const heading = ref(null);
const editInputs = {};
const background = ref(true);
const state = reactive({});

function reset(card) {
  for (const k of FIELDS) state[k] = { original: card?.[k] || null, current: card?.[k] ? { ...card[k] } : null, deleted: false, editing: false, draft: '' };
}
reset(props.card);
watch(() => props.card, reset);

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
  return key === 'language' ? langName(f.value) : f.label || f.value;
}
async function startEdit(key) {
  const f = state[key].current;
  state[key].draft = key === 'language' ? f.value : f.label || f.value;
  state[key].editing = true;
  await nextTick();
  editInputs[key]?.focus?.();
}
function commitEdit(key) {
  const draft = String(state[key].draft || '').trim();
  if (!draft) return;
  const f = state[key].current;
  // An edited country has no code any more; the service falls back to the general emergency number.
  state[key].current = key === 'language' ? { ...f, value: draft } : { ...f, value: draft, label: draft, edited: true };
  state[key].editing = false;
}
const result = (all) => Object.fromEntries(FIELDS.map((k) => [k, all && !state[k].deleted ? state[k].current : null]));
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

watch(() => props.step, async () => {
  await nextTick();
  heading.value?.focus({ preventScroll: true });
});
onMounted(() => heading.value?.focus({ preventScroll: true }));
</script>
