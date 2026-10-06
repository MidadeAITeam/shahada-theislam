<template>
  <div ref="root" class="lsp-acct" @keydown.esc="onEsc" @focusout="onFocusOut">
    <!-- Not signed in: one clear way in (the sheet serves both "save my progress" and "I have an account"). -->
    <button v-if="!who" type="button" class="lsp-acct__signin" :class="{ 'lsp-acct__signin--icon': compact }" :title="compact ? tr('signIn') : undefined" @click="$emit('sign-in', $event)">
      <SpaceIcon name="user" :size="18" /><span :class="{ 'lsp-sr': compact }">{{ tr('signIn') }}</span>
    </button>

    <template v-else>
      <button
        ref="toggle"
        type="button"
        class="lsp-acct__avatar"
        :aria-expanded="open ? 'true' : 'false'"
        :aria-controls="panelId"
        :aria-label="`${tr('accountMenu')}: ${who}`"
        :title="who"
        @click="open ? close(true) : show()"
      >
        <span aria-hidden="true">{{ initial }}</span>
      </button>
      <div v-show="open" :id="panelId" class="lsp-acct__panel">
        <p class="lsp-acct__who">
          <span class="lsp-muted lsp-small">{{ tr('signedInAs') }}</span>
          <strong dir="ltr">{{ who }}</strong>
        </p>
        <slot :close="() => close(false)" />
        <button ref="signOutBtn" type="button" class="lsp-acct__item" :disabled="busy" @click="signOut">
          <SpaceIcon name="logout" :size="18" /><span>{{ tr('signOut') }}</span>
        </button>
        <p v-if="error" class="shd-error lsp-small" role="alert">{{ tr('errorGeneric') }}</p>
      </div>
    </template>
  </div>
</template>

<script setup>
// Who is signed in, at the top of the learning space (and in the host chat's header): "Sign in"
// when nobody is, otherwise the account's initial with a small menu to see who and to sign out.
import { computed, nextTick, ref } from 'vue';
import SpaceIcon from './SpaceIcon.vue';
import { api } from '../api.js';
import { announceAccount, forgetReturning } from '../returning.js';
import { useT } from '../i18n.js';

const props = defineProps({
  lang: { type: String, default: 'en' },
  account: { type: Object, default: null }, // { email?, name? }
  compact: { type: Boolean, default: false }, // "Sign in" as an icon only (a crowded host header on a phone)
});
const emit = defineEmits(['sign-in', 'signed-out']);

const tr = useT(() => props.lang);
const panelId = `lsp-acct-${Math.random().toString(36).slice(2, 7)}`;
const root = ref(null);
const toggle = ref(null);
const signOutBtn = ref(null);
const open = ref(false);
const busy = ref(false);
const error = ref(false);
const who = computed(() => props.account?.email || props.account?.name || '');
const initial = computed(() => (props.account?.name || props.account?.email || '?').trim().charAt(0).toUpperCase());

async function show() {
  open.value = true;
  error.value = false;
  await nextTick();
  root.value?.querySelector('.lsp-acct__panel button')?.focus();
}
function close(refocus) {
  if (!open.value) return;
  open.value = false;
  if (refocus) toggle.value?.focus();
}
// Esc closes the menu only (not the learning space behind it).
function onEsc(e) {
  if (!open.value) return;
  e.stopPropagation();
  close(true);
}
// Clicking or tabbing anywhere else closes the menu.
function onFocusOut(e) {
  if (open.value && !root.value?.contains(e.relatedTarget)) close(false);
}

async function signOut() {
  busy.value = true;
  error.value = false;
  try {
    await api.logout();
    // This browser is a new anonymous learner now: the host page should not offer "welcome back".
    forgetReturning();
    open.value = false;
    emit('signed-out');
    announceAccount(null);
  } catch {
    error.value = true;
  } finally {
    busy.value = false;
  }
}
</script>

<style>
.lsp-acct { position: relative; flex: none; }
.lsp-acct__signin {
  display: inline-flex; align-items: center; gap: 7px; min-height: 40px; padding: 0 14px; border: 0; border-radius: 999px;
  background: var(--violet-50, #efedfe); color: var(--violet-ink, #4f3fd6); font: inherit; font-size: 0.9rem; font-weight: 500; cursor: pointer; white-space: nowrap;
}
.lsp-acct__signin--icon { width: 40px; padding: 0; justify-content: center; }
.lsp-acct__signin:hover { background: var(--violet-100, #e1ddfd); }
.lsp-acct__avatar {
  width: 40px; height: 40px; display: grid; place-items: center; border: 0; border-radius: 50%; cursor: pointer;
  background: var(--violet, #6150ea); color: #fff; font: inherit; font-weight: 600; font-size: 1rem;
}
.lsp-acct__avatar[aria-expanded='true'] { box-shadow: 0 0 0 3px var(--violet-100, #e1ddfd); }
.lsp-acct__panel {
  position: absolute; top: calc(100% + 8px); inset-inline-end: 0; z-index: 20; width: max-content; min-width: 220px; max-width: min(320px, calc(100vw - 24px));
  display: flex; flex-direction: column; gap: 6px; padding: 12px; border-radius: 14px; background: #fff; color: var(--ink, #12183f);
  box-shadow: 0 0 0 1px var(--line, #e7e9f3), 0 14px 34px rgba(18, 24, 63, 0.18); text-align: start;
}
.lsp-acct__who { display: flex; flex-direction: column; gap: 2px; padding: 2px 4px 8px; border-bottom: 1px solid var(--line, #e7e9f3); }
.lsp-acct__who strong { font-weight: 600; overflow-wrap: anywhere; text-align: start; unicode-bidi: plaintext; }
.lsp-acct__item {
  display: flex; align-items: center; gap: 10px; width: 100%; min-height: 42px; padding: 0 10px; border: 0; border-radius: 10px;
  background: transparent; color: inherit; font: inherit; font-size: 0.92rem; text-align: start; cursor: pointer;
}
.lsp-acct__item:hover:not(:disabled) { background: var(--slate-50, #eef0f6); }
.lsp-acct__item:disabled { opacity: 0.6; cursor: default; }
.lsp-acct button:focus-visible { outline: none; box-shadow: 0 0 0 3px #fff, 0 0 0 5px var(--violet, #6150ea); }
@media (max-width: 899px) {
  .lsp-acct__signin { min-height: 36px; padding: 0 10px; font-size: 0.82rem; }
  .lsp-acct__avatar { width: 36px; height: 36px; font-size: 0.92rem; }
}
</style>
