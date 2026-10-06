<script setup>
import { computed, watch, watchEffect, nextTick } from "vue";
import Logo from "./components/Logo.vue";
import Icon from "./components/Icon.vue";
import ReasonChip from "./components/ReasonChip.vue";
import LoginView from "./views/LoginView.vue";
import InboxView from "./views/InboxView.vue";
import CaseView from "./views/CaseView.vue";
import ReportsView from "./views/ReportsView.vue";
import StatsView from "./views/StatsView.vue";
import { t, toggleLang } from "./i18n.js";
import { langName, firstLine, initial } from "./format.js";
import { session, isSupervisor, route, restoreSession, logout, inbox, crisisAlerts, dismissAlert, toasts, dismissToast, soundOn, toggleSound, go } from "./store.js";

restoreSession();

watchEffect(() => { document.title = `${t("app")} · theislam.chat`; });

const roleLabel = computed(() => {
  const m = session.me;
  if (!m) return "";
  if (m.role === "supervisor") return t("roleSupervisor");
  return m.gender === "sister" ? t("roleMentorSister") : t("roleMentor");
});
const initials = computed(() => initial(session.me?.name));

const nav = computed(() => [
  { key: "cases", href: "#/cases", icon: "inbox", label: t("navCases"), badge: inbox.data?.crisis_unassigned || 0, active: route.value.name === "cases" || route.value.name === "case" },
  { key: "reports", href: "#/reports", icon: "flag", label: t("navReports"), active: route.value.name === "reports" },
  ...(isSupervisor.value ? [{ key: "stats", href: "#/stats", icon: "chart", label: t("navStats"), active: route.value.name === "stats" }] : []),
]);

const view = computed(() => ({ cases: InboxView, case: CaseView, reports: ReportsView, stats: StatsView })[route.value.name] ?? InboxView);

// Move focus to the main region on navigation so keyboard and screen-reader users land on the new page.
watch(() => route.value, async (now, before) => {
  if (!before || now.name === before.name && now.id === before.id) return;
  window.scrollTo(0, 0);
  await nextTick();
  document.getElementById("main")?.focus({ preventScroll: true });
});

function focusMain() {
  document.getElementById("main")?.focus();
}

function openAlert(a) {
  dismissAlert(a.id);
  go(`/cases/${a.id}`);
}
function openToast(x) {
  dismissToast(x.key);
  go(`/cases/${x.id}`);
}
</script>

<template>
  <div v-if="!session.checked" class="boot" role="status" aria-live="polite">
    <span class="spinner" aria-hidden="true"></span><span class="sr-only">{{ t("loading") }}</span>
  </div>

  <LoginView v-else-if="!session.me" />

  <div v-else class="shell">
    <a class="skip-link" href="#main" @click.prevent="focusMain">{{ t("skip") }}</a>

    <aside class="sidebar">
      <div class="brand">
        <Logo light />
        <span class="brand-sub">{{ t("app") }} · {{ t("appSub") }}</span>
      </div>
      <nav :aria-label="t('nav')">
        <ul>
          <li v-for="n in nav" :key="n.key">
            <a :href="n.href" class="nav-link" :class="{ active: n.active }" :aria-current="n.active ? 'page' : undefined">
              <Icon :name="n.icon" />
              <span>{{ n.label }}</span>
              <span v-if="n.badge" class="nav-badge" :aria-label="n.badge === 1 ? t('crisisUnassignedOne') : t('crisisUnassigned', { n: n.badge })">{{ n.badge }}</span>
            </a>
          </li>
        </ul>
      </nav>
      <div class="sidebar-foot">
        <div class="me">
          <span class="avatar" aria-hidden="true">{{ initials }}</span>
          <span class="me-text">
            <span class="me-name"><bdi>{{ session.me.name }}</bdi></span>
            <span class="me-role">{{ roleLabel }}</span>
          </span>
        </div>
        <div class="sidebar-tools">
          <button type="button" class="tool-btn" :aria-label="t('switchLangLabel')" @click="toggleLang">
            <Icon name="globe" :size="18" /><span>{{ t("switchLang") }}</span>
          </button>
          <button type="button" class="tool-btn" :aria-pressed="soundOn" :aria-label="soundOn ? t('soundOn') : t('soundOff')" :title="soundOn ? t('soundOn') : t('soundOff')" @click="toggleSound">
            <Icon :name="soundOn ? 'bell' : 'bellOff'" :size="18" />
          </button>
          <button type="button" class="tool-btn" @click="logout">
            <Icon name="logout" :size="18" /><span>{{ t("logout") }}</span>
          </button>
        </div>
      </div>
    </aside>

    <div class="content">
      <!-- Bottom corner, so an alert never covers the page's own header and buttons. -->
      <div class="alerts" aria-live="assertive">
        <div v-for="a in crisisAlerts" :key="a.id" class="crisis-toast" role="alert">
          <span class="crisis-toast-icon"><Icon name="alert" :size="22" /></span>
          <div class="crisis-toast-body">
            <strong>{{ t("newCrisisTitle") }}</strong>
            <span class="crisis-toast-meta"><ReasonChip reason="crisis" /> {{ langName(a.case.lang) }} · {{ t(`group.${a.case.mentor}`) }}</span>
            <span class="crisis-toast-text" :dir="a.case.lang === 'ar' ? 'rtl' : 'auto'">{{ firstLine(a.case.last_message || a.case.question, 100) }}</span>
          </div>
          <div class="crisis-toast-actions">
            <button type="button" class="btn btn-danger btn-sm" @click="openAlert(a)">{{ t("newCrisisOpen") }}</button>
            <button type="button" class="icon-btn" :aria-label="t('dismiss')" @click="dismissAlert(a.id)"><Icon name="x" :size="18" /></button>
          </div>
        </div>
        <div v-for="x in toasts" :key="x.key" class="toast" role="status">
          <span class="toast-icon"><Icon :name="x.kind === 'case' ? 'inbox' : 'message'" :size="20" /></span>
          <div class="crisis-toast-body">
            <strong>{{ x.kind === "case" ? t("newCaseTitle") : t("newMessageTitle") }}</strong>
            <span class="crisis-toast-meta"><ReasonChip :reason="x.case.reason" /> {{ langName(x.case.lang) }} · {{ t(`group.${x.case.mentor}`) }}</span>
            <span class="crisis-toast-text" :dir="x.case.lang === 'ar' ? 'rtl' : 'auto'">{{ firstLine(x.case.last_message || x.case.question, 100) }}</span>
          </div>
          <div class="crisis-toast-actions">
            <button type="button" class="btn btn-primary btn-sm" @click="openToast(x)">{{ t("newCrisisOpen") }}</button>
            <button type="button" class="icon-btn" :aria-label="t('dismiss')" @click="dismissToast(x.key)"><Icon name="x" :size="18" /></button>
          </div>
        </div>
      </div>

      <main id="main" tabindex="-1">
        <component :is="view" :key="route.name + (route.id ?? '')" :id="route.id" />
      </main>
    </div>
  </div>
</template>
