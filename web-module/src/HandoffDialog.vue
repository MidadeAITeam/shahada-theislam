<template>
  <Teleport to="body">
    <div v-if="open" class="shd shd-dialog-backdrop" :dir="isRtl(lang) ? 'rtl' : 'ltr'" :lang="lang" @click.self="close" @keydown.esc="close">
      <div ref="dialog" class="shd-dialog" role="dialog" aria-modal="true" :aria-labelledby="headId" tabindex="-1" @keydown.tab="trapTab">
        <div class="shd-dialog__head">
          <h2 :id="headId">{{ sent ? tr('queuedTitle') : tr('handoffTitle') }}</h2>
          <button type="button" class="shd-icon-btn" :aria-label="tr('close')" @click="close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>

        <template v-if="!sent">
          <p>{{ tr('handoffIntro') }}</p>

          <fieldset class="shd-options" style="gap: 0.5rem">
            <legend class="shd-field__label" style="margin-bottom: 0.35rem">{{ tr('chooseMentor') }}</legend>
            <div class="shd-mentors">
              <button
                v-for="m in ['brother', 'sister']"
                :key="m"
                type="button"
                class="shd-choice"
                :aria-pressed="mentor === m ? 'true' : 'false'"
                @click="mentor = m"
              >
                <span>{{ tr(m) }}</span>
                <span class="shd-muted">{{ tr(`${m}Hint`) }}</span>
              </button>
            </div>
          </fieldset>

          <div>
            <label :for="`${headId}-q`" class="shd-field__label">{{ tr('questionLabel') }}</label>
            <textarea :id="`${headId}-q`" v-model="text" class="shd-textarea" rows="2" maxlength="1000"></textarea>
          </div>

          <!-- Exactly what leaves this screen: nothing about the person beyond what they chose to state. -->
          <section class="shd-card shd-card--soft" :aria-label="tr('cardPreview')">
            <h3 class="shd-eyebrow">{{ tr('cardPreview') }}</h3>
            <dl class="shd-referral">
              <dt>{{ tr('cardLanguage') }}</dt><dd>{{ languageName }}</dd>
              <dt>{{ tr('cardCountry') }}</dt><dd>{{ country?.label || country?.value || tr('none') }}</dd>
              <dt>{{ tr('cardLesson') }}</dt><dd>{{ lesson?.title || tr('none') }}</dd>
              <dt>{{ tr('cardReason') }}</dt><dd>{{ tr(`reason_${reason}`) }}</dd>
              <dt>{{ tr('cardQuestion') }}</dt><dd>{{ text.trim() || tr('none') }}</dd>
            </dl>
          </section>

          <label class="shd-check">
            <input v-model="consent" type="checkbox" />
            <span>{{ tr('consent') }}</span>
          </label>

          <p v-if="error" class="shd-error" role="alert">{{ tr('errorGeneric') }}</p>
          <div class="shd-actions">
            <button type="button" class="shd-btn shd-btn--primary" :disabled="!consent || !mentor || busy" @click="send">
              <span v-if="busy" class="shd-spinner" aria-hidden="true"></span>{{ tr('sendToMentor') }}
            </button>
            <button type="button" class="shd-btn shd-btn--quiet" @click="close">{{ tr('cancel') }}</button>
          </div>
        </template>

        <template v-else>
          <p v-if="sent.message" role="status">{{ sent.message }}</p>
          <p class="shd-muted">{{ tr('queuedNote') }}</p>
          <div class="shd-actions">
            <button type="button" class="shd-btn shd-btn--primary" @click="close">{{ tr('close') }}</button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
// Referral to a person. The learner picks a brother or a sister, sees the whole card the mentor
// will get, and must consent before anything is sent.
import { computed, nextTick, ref, watch } from 'vue';
import { api } from './api.js';
import { apiLang, isRtl, useT } from './i18n.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  lang: { type: String, default: 'en' },
  reason: { type: String, default: 'user_request' },
  question: { type: String, default: '' },
  lesson: { type: Object, default: null }, // { id, title }
  country: { type: Object, default: null }, // the card's country, only if the user kept it
});
const emit = defineEmits(['close', 'sent']);

const tr = useT(() => props.lang);
const headId = `shd-handoff-${Math.random().toString(36).slice(2, 7)}`;
const dialog = ref(null);
const mentor = ref(null);
const text = ref('');
const consent = ref(false);
const busy = ref(false);
const error = ref(false);
const sent = ref(null);
let returnFocus = null;

const languageName = computed(() => {
  try {
    return new Intl.DisplayNames([props.lang], { type: 'language' }).of(apiLang(props.lang));
  } catch {
    return apiLang(props.lang);
  }
});

watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return;
    // A fresh card every time: consent given for one request is not consent for the next.
    mentor.value = null;
    consent.value = false;
    error.value = false;
    sent.value = null;
    text.value = props.question || '';
    returnFocus = document.activeElement;
    await nextTick();
    dialog.value?.focus();
  },
  { immediate: true },
);

function close() {
  emit('close');
  returnFocus?.focus?.();
}

// Keep Tab inside the dialog while it is open.
function trapTab(e) {
  const nodes = dialog.value?.querySelectorAll('button:not([disabled]), textarea, input, select, a[href]');
  if (!nodes?.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.value)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

async function send() {
  busy.value = true;
  error.value = false;
  try {
    const res = await api.handoff({
      reason: props.reason,
      mentor: mentor.value,
      question: text.value.trim(),
      lesson_id: props.lesson?.id ?? null,
      lang: apiLang(props.lang),
      consent: true,
    });
    sent.value = res || { status: 'queued' };
    emit('sent', { ...sent.value, mentor: mentor.value, question: text.value.trim() });
  } catch {
    error.value = true;
  } finally {
    busy.value = false;
  }
}
</script>
