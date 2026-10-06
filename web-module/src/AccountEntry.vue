<template>
  <span class="shd-acct-entry" :dir="isRtl(lang) ? 'rtl' : 'ltr'" :lang="lang">
    <AccountMenu :lang="lang" :account="account" :compact="compact" @sign-in="openDialog">
      <template #default="{ close }">
        <button type="button" class="lsp-acct__item" @click="close(); $emit('open-lessons')">
          <SpaceIcon name="bookOpen" :size="18" /><span>{{ t(lang, 'myLessons') }}</span>
        </button>
      </template>
    </AccountMenu>

    <!-- The module's own sign-in sheet: a new learner saves their progress, a returning one signs in. -->
    <Teleport to="body">
      <div v-if="dialog" class="shd shd-dialog-backdrop" :dir="isRtl(lang) ? 'rtl' : 'ltr'" :lang="lang" @click.self="closeDialog" @keydown.esc="closeDialog">
        <div ref="dialogEl" class="shd-dialog shd-acct-dialog" role="dialog" aria-modal="true" :aria-label="t(lang, 'signInTitle')" tabindex="-1" @keydown.tab="trapTab">
          <SaveProgress :lang="lang" :account="null" @dismiss="closeDialog" @forgotten="closeDialog" />
        </div>
      </div>
    </Teleport>
  </span>
</template>

<script setup>
// "Sign in" (or who is signed in) for the host chat's header, where the platform's own login is
// hidden in the demo. Signing in here with an account that already has lessons takes the learner
// straight back to them (Google at once; the email link lands on their next lesson by itself).
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import AccountMenu from './space/AccountMenu.vue';
import SpaceIcon from './space/SpaceIcon.vue';
import SaveProgress from './SaveProgress.vue';
import { api } from './api.js';
import { onAccount } from './returning.js';
import { isRtl, t } from './i18n.js';
import './shahada.css';
import './space/space.css';

defineProps({ lang: { type: String, default: 'en' }, compact: { type: Boolean, default: false } });
const emit = defineEmits(['open-lessons']);

const account = ref(null);
const dialog = ref(false);
const dialogEl = ref(null);
let returnFocus = null;
let stop = null;

async function openDialog(e) {
  returnFocus = e?.currentTarget || document.activeElement;
  dialog.value = true;
  await nextTick();
  dialogEl.value?.focus();
}
function closeDialog() {
  dialog.value = false;
  returnFocus?.focus?.();
}
function trapTab(e) {
  const nodes = dialogEl.value?.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), iframe');
  if (!nodes?.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogEl.value)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

onMounted(async () => {
  stop = onAccount((a) => {
    const fromHere = dialog.value && a;
    account.value = a;
    if (!fromHere) return;
    dialog.value = false;
    emit('open-lessons');
  });
  try {
    const res = await api.account();
    if (res?.signed_in) account.value = { email: res.email, name: res.name };
  } catch {
    // Unknown: offer "Sign in"; signing in again does no harm.
  }
});
onBeforeUnmount(() => stop?.());
</script>

<style>
/* In the host's header: the module's colours for the button and its menu, nothing else. */
.shd-acct-entry {
  --violet: #6150ea; --violet-ink: #4f3fd6; --violet-50: #efedfe; --violet-100: #e1ddfd;
  --ink: #12183f; --muted: #5a6082; --line: #e7e9f3; --slate-50: #eef0f6;
  position: relative; display: inline-flex; align-items: center; color: var(--ink);
  font-family: 'Readex Pro', system-ui, -apple-system, 'Segoe UI', Tahoma, sans-serif; font-size: 15px; line-height: 1.4;
}
.shd-acct-entry p { margin: 0; }
.shd-acct-dialog > .shd-card { padding: 0; box-shadow: none; }
</style>
