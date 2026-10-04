<template>
  <section class="shd-card" :aria-labelledby="headId">
    <div class="shd-dialog__head">
      <h3 :id="headId">{{ tr('saveTitle') }}</h3>
      <button type="button" class="shd-icon-btn" :aria-label="tr('close')" @click="$emit('dismiss')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </div>

    <p v-if="forgotten" class="shd-success" role="status">{{ tr('dataDeleted') }}</p>

    <template v-else>
      <!-- Sign in -->
      <p v-if="signedInAs" class="shd-success" role="status">{{ tr('signedIn', { who: signedInAs }) }}</p>
      <template v-else>
        <div v-if="googleClientId" ref="gsiButton" class="shd-gsi"></div>
        <form class="shd-save__email" @submit.prevent="sendLink">
          <label :for="`${headId}-email`" class="shd-field__label">{{ tr('emailLabel') }}</label>
          <div class="shd-row">
            <input :id="`${headId}-email`" v-model="email" class="shd-input" type="email" autocomplete="email" :placeholder="tr('emailPlaceholder')" required />
            <button type="submit" class="shd-btn" :disabled="busy.email || !email.includes('@')">{{ tr('sendLink') }}</button>
          </div>
          <p v-if="linkSent" class="shd-success" role="status">{{ tr('linkSent') }}</p>
        </form>
        <p class="shd-muted">{{ tr('localOnly') }}</p>
      </template>
      <p class="shd-muted">{{ tr('storedOnly') }}</p>

      <!-- Daily reminder -->
      <form class="shd-save__reminder" @submit.prevent="saveReminder">
        <h4 class="shd-eyebrow">{{ tr('reminderTitle') }}</h4>
        <div class="shd-row" style="flex-wrap: wrap; align-items: center">
          <label class="shd-check" style="align-items: center">
            <input v-model="reminderOn" type="checkbox" />
            <span>{{ tr('reminderEnabled') }}</span>
          </label>
          <label :for="`${headId}-hour`" class="shd-muted">{{ tr('reminderAt') }}</label>
          <select :id="`${headId}-hour`" v-model.number="hour" class="shd-select" :disabled="!reminderOn">
            <option v-for="h in 24" :key="h - 1" :value="h - 1">{{ hourLabel(h - 1) }}</option>
          </select>
          <button type="submit" class="shd-btn shd-btn--small" :disabled="busy.reminder">{{ tr('reminderSave') }}</button>
        </div>
        <p class="shd-muted">{{ tz }}</p>
        <p v-if="reminderSaved" class="shd-success" role="status">{{ tr('reminderSaved') }}</p>
      </form>

      <!-- Delete everything, in two deliberate steps. -->
      <div class="shd-actions">
        <button v-if="!confirmDelete" type="button" class="shd-btn shd-btn--danger shd-btn--small" @click="confirmDelete = true">{{ tr('deleteData') }}</button>
        <div v-else class="shd-card shd-card--soft" role="alertdialog" :aria-labelledby="`${headId}-del`" style="width: 100%">
          <p :id="`${headId}-del`">{{ tr('deleteConfirm') }}</p>
          <div class="shd-actions">
            <button type="button" class="shd-btn shd-btn--danger" :disabled="busy.forget" @click="forget">{{ tr('deleteYes') }}</button>
            <button type="button" class="shd-btn shd-btn--quiet" @click="confirmDelete = false">{{ tr('cancel') }}</button>
          </div>
        </div>
      </div>
      <p v-if="error" class="shd-error" role="alert">{{ tr('errorGeneric') }}</p>
    </template>
  </section>
</template>

<script setup>
// Save progress (Google or an email link), the daily reminder, and "delete my data". Without an
// account the learner's progress lives only behind the anonymous cookie in this browser.
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { api } from './api.js';
import { apiLang, useT } from './i18n.js';

const props = defineProps({
  lang: { type: String, default: 'en' },
  account: { type: Object, default: null }, // { email?, name? } from /progress
  reminder: { type: Object, default: null }, // { hour, tz } from /progress
});
const emit = defineEmits(['dismiss', 'signed-in', 'forgotten']);

const tr = useT(() => props.lang);
const headId = `shd-save-${Math.random().toString(36).slice(2, 7)}`;
const googleClientId = import.meta.env?.VITE_GOOGLE_CLIENT_ID || '';
const gsiButton = ref(null);

const account = ref(props.account);
const signedInAs = computed(() => account.value?.email || account.value?.name || '');
const email = ref('');
const linkSent = ref(false);
const busy = reactive({ email: false, reminder: false, forget: false });
const error = ref(false);

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const hour = ref(props.reminder?.hour ?? 20);
const reminderOn = ref(true);
const reminderSaved = ref(false);
const confirmDelete = ref(false);
const forgotten = ref(false);

function hourLabel(h) {
  try {
    return new Intl.DateTimeFormat(props.lang, { hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, h, 0));
  } catch {
    return `${String(h).padStart(2, '0')}:00`;
  }
}

async function run(key, fn) {
  busy[key] = true;
  error.value = false;
  try {
    return await fn();
  } catch {
    error.value = true;
    return undefined;
  } finally {
    busy[key] = false;
  }
}

const sendLink = () =>
  run('email', async () => {
    await api.authEmail(email.value.trim(), apiLang(props.lang));
    linkSent.value = true;
  });

const saveReminder = () =>
  run('reminder', async () => {
    await api.reminder(hour.value, tz, reminderOn.value);
    reminderSaved.value = true;
  });

const forget = () =>
  run('forget', async () => {
    await api.forget();
    forgotten.value = true;
    account.value = null;
    emit('forgotten');
  });

// Google Identity Services, loaded only when a client id is configured and only once per page.
function loadGsi() {
  if (window.google?.accounts?.id) return Promise.resolve();
  let tag = document.getElementById('shd-gsi-script');
  if (!tag) {
    tag = document.createElement('script');
    tag.id = 'shd-gsi-script';
    tag.src = 'https://accounts.google.com/gsi/client';
    tag.async = true;
    tag.defer = true;
    document.head.appendChild(tag);
  }
  return new Promise((resolve, reject) => {
    tag.addEventListener('load', () => resolve(), { once: true });
    tag.addEventListener('error', () => reject(new Error('gsi')), { once: true });
  });
}

async function onGoogleCredential({ credential }) {
  await run('email', async () => {
    const res = await api.authGoogle(credential);
    account.value = res?.account || res || { email: '' };
    emit('signed-in', account.value);
  });
}

onMounted(async () => {
  if (!googleClientId || signedInAs.value) return;
  try {
    await loadGsi();
    await nextTick();
    if (!gsiButton.value) return;
    window.google.accounts.id.initialize({ client_id: googleClientId, callback: onGoogleCredential });
    window.google.accounts.id.renderButton(gsiButton.value, {
      theme: 'outline',
      size: 'large',
      shape: 'pill',
      text: 'continue_with',
      locale: props.lang,
    });
  } catch {
    // Without Google the email link still works; nothing to tell the learner.
  }
});
</script>

<style scoped>
.shd-save__email, .shd-save__reminder { display: flex; flex-direction: column; gap: 0.4rem; }
</style>
