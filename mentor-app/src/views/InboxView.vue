<script setup>
import { computed, reactive, ref, watch } from "vue";
import Icon from "../components/Icon.vue";
import ReasonChip from "../components/ReasonChip.vue";
import StatusPill from "../components/StatusPill.vue";
import EmptyState from "../components/EmptyState.vue";
import ErrorBox from "../components/ErrorBox.vue";
import { t } from "../i18n.js";
import { langName, countryName, flag, ageShort, firstLine, clock } from "../format.js";
import { inbox, refreshInbox, session } from "../store.js";
import { api } from "../api.js";

const STATUSES = ["new", "in_progress", "waiting_user", "closed"];
const REASONS = ["crisis", "fatwa_personal", "practical_need", "not_in_book", "user_request", "unsure", "failed"];

// Filters are kept for the visit (sessionStorage) so going into a case and back keeps the view.
const KEY = "mentor.inboxFilters";
const defaults = { status: "open", reason: "", gender: "", lang: "", mine: false };
const f = reactive({ ...defaults, ...(() => { try { return JSON.parse(sessionStorage.getItem(KEY) ?? "{}"); } catch { return {}; } })() });
watch(f, () => { try { sessionStorage.setItem(KEY, JSON.stringify(f)); } catch { /* ignore */ } });

const all = computed(() => inbox.data?.cases ?? []);
const langs = computed(() => [...new Set(all.value.map((c) => c.lang).filter(Boolean))].sort());
const cases = computed(() => all.value.filter((c) =>
  (f.status === "" || (f.status === "open" ? c.status !== "closed" : c.status === f.status))
  && (!f.reason || c.reason === f.reason)
  && (!f.gender || c.mentor === f.gender)
  && (!f.lang || c.lang === f.lang)
  && (!f.mine || c.assigned_to === session.me?.id)));
const filtered = computed(() => f.status !== "open" || f.reason || f.gender || f.lang || f.mine);
const activeFilters = computed(() => [f.status !== "open", f.reason, f.gender, f.lang, f.mine].filter(Boolean).length);
// On a phone the filters fold away so the first case is visible without scrolling.
const filtersOpen = ref(false);
const counts = computed(() => inbox.data?.counts ?? {});
const crisisFree = computed(() => inbox.data?.crisis_unassigned ?? 0);

function pickStatus(s) {
  f.status = f.status === s ? "open" : s;
}
function showUnassignedCrisis() {
  Object.assign(f, { ...defaults, reason: "crisis" });
}
function clear() {
  Object.assign(f, defaults);
}
const isCrisis = (c) => c.reason === "crisis" && c.status !== "closed";

// Supervisors can tick several open cases and close them together (for example test cases), with one reason.
const isSupervisor = computed(() => session.me?.role === "supervisor");
const picked = reactive(new Set());
const bulk = reactive({ reason: "", busy: false, error: "" });
async function closePicked() {
  if (!picked.size || !bulk.reason.trim()) return;
  bulk.busy = true; bulk.error = "";
  try {
    await api.bulkClose([...picked], bulk.reason.trim());
    picked.clear(); bulk.reason = "";
    await refreshInbox();
  } catch (e) {
    bulk.error = e?.code || "network";
  } finally {
    bulk.busy = false;
  }
}
</script>

<template>
  <header class="page-head">
    <div>
      <h1>{{ t("inboxTitle") }}</h1>
      <p class="muted">{{ t("inboxLead") }}</p>
    </div>
    <div class="head-actions">
      <span v-if="inbox.updatedAt" class="updated" aria-live="off">{{ t("updatedAt", { t: clock(inbox.updatedAt) }) }}</span>
      <button type="button" class="btn btn-ghost btn-sm" :disabled="inbox.loading" @click="refreshInbox">
        <Icon name="refresh" :size="18" :class="{ spin: inbox.loading }" />{{ t("refresh") }}
      </button>
    </div>
  </header>

  <button v-if="crisisFree" type="button" class="crisis-strip" @click="showUnassignedCrisis">
    <span class="crisis-strip-badge">{{ crisisFree }}</span>
    <span>{{ crisisFree === 1 ? t("crisisUnassignedOne") : t("crisisUnassigned", { n: crisisFree }) }}</span>
    <Icon name="back" :size="18" class="strip-arrow" />
  </button>

  <section class="counters" :aria-label="t('fStatus')">
    <button v-for="s in STATUSES" :key="s" type="button" class="counter" :class="[`counter-${s}`, { on: f.status === s }]" :aria-pressed="f.status === s" @click="pickStatus(s)">
      <span class="counter-n">{{ counts[s] ?? "–" }}</span>
      <span class="counter-label">{{ t(`status.${s}`) }}</span>
    </button>
  </section>

  <button type="button" class="btn btn-ghost btn-sm filters-toggle" :aria-expanded="filtersOpen" aria-controls="inbox-filters" @click="filtersOpen = !filtersOpen">
    <Icon name="filter" :size="16" />{{ t("filters") }}<template v-if="activeFilters"> ({{ activeFilters }})</template>
  </button>
  <section id="inbox-filters" class="filters card" :class="{ open: filtersOpen }" :aria-label="t('filters')">
    <div class="field">
      <label for="f-status">{{ t("fStatus") }}</label>
      <select id="f-status" v-model="f.status">
        <option value="open">{{ t("allOpen") }}</option>
        <option value="">{{ t("all") }}</option>
        <option v-for="s in STATUSES" :key="s" :value="s">{{ t(`status.${s}`) }}</option>
      </select>
    </div>
    <div class="field">
      <label for="f-reason">{{ t("fReason") }}</label>
      <select id="f-reason" v-model="f.reason">
        <option value="">{{ t("all") }}</option>
        <option v-for="r in REASONS" :key="r" :value="r">{{ t(`reason.${r}`) }}</option>
      </select>
    </div>
    <div class="field">
      <label for="f-group">{{ t("fGroup") }}</label>
      <select id="f-group" v-model="f.gender">
        <option value="">{{ t("all") }}</option>
        <option value="brother">{{ t("group.brother") }}</option>
        <option value="sister">{{ t("group.sister") }}</option>
      </select>
    </div>
    <div class="field">
      <label for="f-lang">{{ t("fLang") }}</label>
      <select id="f-lang" v-model="f.lang">
        <option value="">{{ t("all") }}</option>
        <option v-for="l in langs" :key="l" :value="l">{{ langName(l) }}</option>
      </select>
    </div>
    <label class="check">
      <input v-model="f.mine" type="checkbox" />
      <span>{{ t("fMine") }}</span>
    </label>
    <button v-if="filtered" type="button" class="btn btn-link btn-sm" @click="clear">{{ t("clearFilters") }}</button>
  </section>

  <ErrorBox v-if="inbox.error" :code="inbox.error" @retry="refreshInbox" />

  <div v-if="!inbox.data && !inbox.error" class="skeleton-list" aria-hidden="true">
    <div v-for="i in 4" :key="i" class="skeleton-row"></div>
  </div>

  <template v-else-if="inbox.data">
    <p class="list-meta" aria-live="polite">{{ t("shown", { n: cases.length, total: all.length }) }}</p>
    <form v-if="isSupervisor && picked.size" class="bulk-bar card" @submit.prevent="closePicked">
      <strong>{{ t("bulkPicked", { n: picked.size }) }}</strong>
      <label class="sr-only" for="bulk-reason">{{ t("bulkReason") }}</label>
      <input id="bulk-reason" v-model="bulk.reason" type="text" maxlength="300" :placeholder="t('bulkReason')" required />
      <button type="submit" class="btn btn-primary btn-sm" :disabled="bulk.busy || !bulk.reason.trim()">{{ t("bulkClose") }}</button>
      <button type="button" class="btn btn-link btn-sm" @click="picked.clear()">{{ t("bulkCancel") }}</button>
      <span v-if="bulk.error" class="error" role="alert">{{ t("bulkFailed") }}</span>
    </form>
    <EmptyState v-if="!all.length" icon="inbox" :title="t('emptyInbox')" :lead="t('emptyInboxLead')" />
    <EmptyState v-else-if="!cases.length" icon="filter" :title="t('emptyFiltered')" :lead="t('emptyFilteredLead')">
      <button type="button" class="btn btn-ghost btn-sm" @click="clear">{{ t("clearFilters") }}</button>
    </EmptyState>
    <ul v-else class="case-list">
      <li v-for="c in cases" :key="c.id" :class="{ pickable: isSupervisor && c.status !== 'closed' }">
        <label v-if="isSupervisor && c.status !== 'closed'" class="pick">
          <input type="checkbox" :checked="picked.has(c.id)" @change="picked.has(c.id) ? picked.delete(c.id) : picked.add(c.id)" />
          <span class="sr-only">{{ t("bulkSelect") }}</span>
        </label>
        <a :href="`#/cases/${c.id}`" class="case-row" :class="{ crisis: isCrisis(c), closed: c.status === 'closed', overdue: c.overdue }">
          <div class="case-main">
            <div class="case-tags">
              <ReasonChip :reason="c.reason" />
              <StatusPill :status="c.status" />
              <span v-if="c.awaiting_reply" class="unread" :class="{ awaiting: c.overdue }" :title="t('awaitingReply')">
                <span class="unread-dot" aria-hidden="true"></span>{{ t("awaitingReply") }} · {{ ageShort(c.awaiting_minutes) }}
              </span>
            </div>
            <p class="case-text"><span v-if="c.last_author === 'mentor'" class="from-us">{{ t("mentorSide") }}: </span><bdi :dir="c.lang === 'ar' ? 'rtl' : 'auto'">{{ firstLine(c.last_message || c.question) }}</bdi></p>
            <div class="case-meta">
              <span><Icon name="globe" :size="15" />{{ langName(c.lang) }}<template v-if="c.country"> · <span aria-hidden="true">{{ flag(c.country) }}</span> {{ countryName(c.country) }}</template></span>
              <span><Icon name="book" :size="15" />{{ c.lesson_title || t("noLesson") }}</span>
              <span><Icon name="user" :size="15" />{{ t(`group.${c.mentor}`) }}</span>
            </div>
          </div>
          <div class="case-side">
            <span class="age" :class="{ late: c.overdue }">
              <Icon name="clock" :size="15" />{{ ageShort(c.age_minutes) }}
              <span v-if="c.overdue" class="late-tag">{{ t("overdue") }}</span>
            </span>
            <span class="assignee" :class="{ none: !c.assigned_name }">
              <span class="sr-only">{{ t("assignedTo") }}: </span><bdi>{{ c.assigned_name || t("unassigned") }}</bdi>
            </span>
          </div>
        </a>
      </li>
    </ul>
  </template>
</template>

<style scoped>
.pickable { display: flex; align-items: stretch; gap: 0.5rem; }
.pickable > .case-row { flex: 1; min-width: 0; }
.pick { display: flex; align-items: center; padding-inline: 0.25rem; cursor: pointer; }
.pick input { width: 18px; height: 18px; }
.bulk-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; padding: 0.75rem 1rem; margin-bottom: 0.75rem; position: sticky; top: 0.5rem; z-index: 2; }
.bulk-bar input[type="text"] { flex: 1; min-width: 12rem; }
</style>
