<script setup>
import { computed, ref, onMounted } from "vue";
import Icon from "../components/Icon.vue";
import EmptyState from "../components/EmptyState.vue";
import ErrorBox from "../components/ErrorBox.vue";
import { t } from "../i18n.js";
import { api } from "../api.js";
import { langName, duration } from "../format.js";
import { isSupervisor } from "../store.js";

const STATUSES = ["new", "in_progress", "waiting_user", "closed"];
const s = ref(null);
const error = ref(null);
async function load() {
  try { s.value = await api.stats(); error.value = null; } catch (e) { error.value = e.code; }
}
onMounted(() => { if (isSupervisor.value) load(); });

const fmt = (n) => new Intl.NumberFormat("en").format(n ?? 0);
const byStatus = computed(() => Object.fromEntries((s.value?.by_status ?? []).map((x) => [x.status, x.n])));
const closed = computed(() => byStatus.value.closed ?? 0);
const open = computed(() => (s.value?.cases_total ?? 0) - closed.value);
const closedPct = computed(() => (s.value?.cases_total ? Math.round((closed.value / s.value.cases_total) * 100) : null));

function bars(rows, key, label) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  const total = rows.reduce((a, r) => a + r.n, 0) || 1;
  return rows.map((r) => ({ key: r[key], label: label(r[key]), n: r.n, w: (r.n / max) * 100, pct: Math.round((r.n / total) * 100) }));
}
const reasonBars = computed(() => bars(s.value?.by_reason ?? [], "reason", (k) => t(`reason.${k}`)));
const langBars = computed(() => bars(s.value?.by_lang ?? [], "lang", (k) => langName(k)));
const statusBars = computed(() => bars(STATUSES.map((st) => ({ status: st, n: byStatus.value[st] ?? 0 })), "status", (k) => t(`status.${k}`)));
</script>

<template>
  <header class="page-head">
    <div>
      <h1>{{ t("statsTitle") }}</h1>
      <p class="muted">{{ t("statsLead") }}</p>
    </div>
    <button v-if="isSupervisor" type="button" class="btn btn-ghost btn-sm" @click="load"><Icon name="refresh" :size="18" />{{ t("refresh") }}</button>
  </header>

  <EmptyState v-if="!isSupervisor" icon="lock" :title="t('supervisorOnly')" />
  <ErrorBox v-else-if="error" :code="error" @retry="load" />
  <div v-else-if="!s" class="skeleton-list" aria-hidden="true"><div v-for="i in 3" :key="i" class="skeleton-row"></div></div>

  <template v-else>
    <section class="kpis">
      <div class="kpi card"><span class="kpi-label">{{ t("sTotal") }}</span><span class="kpi-n">{{ fmt(s.cases_total) }}</span></div>
      <div class="kpi card"><span class="kpi-label">{{ t("sOpen") }}</span><span class="kpi-n">{{ fmt(open) }}</span></div>
      <div class="kpi card kpi-good">
        <span class="kpi-label">{{ t("sClosedRate") }}</span>
        <span class="kpi-n">{{ closedPct == null ? "—" : `${closedPct}%` }}</span>
        <span v-if="closedPct != null" class="meter" aria-hidden="true"><span :style="{ width: closedPct + '%' }"></span></span>
      </div>
      <div class="kpi card"><span class="kpi-label">{{ t("sFirstReply") }}</span><span class="kpi-n">{{ duration(s.median_first_reply_minutes) ?? "—" }}</span><span v-if="s.median_first_reply_minutes == null" class="muted small">{{ t("sNoData") }}</span></div>
      <a href="#/reports" class="kpi card kpi-link"><span class="kpi-label">{{ t("sReportsOpen") }}</span><span class="kpi-n">{{ fmt(s.reports_open) }}</span></a>
    </section>

    <div class="stats-grid">
      <section class="card" aria-labelledby="by-reason">
        <h2 id="by-reason">{{ t("sByReason") }}</h2>
        <p v-if="!reasonBars.length" class="muted small">{{ t("sNoData") }}</p>
        <ul class="bars">
          <li v-for="b in reasonBars" :key="b.key" :class="`bar-${b.key}`">
            <span class="bar-label">{{ b.label }}</span>
            <span class="bar-track" aria-hidden="true"><span v-if="b.n" class="bar-fill" :style="{ width: b.w + '%' }"></span></span>
            <span class="bar-n">{{ fmt(b.n) }} <span class="muted">· {{ b.pct }}%</span></span>
          </li>
        </ul>
      </section>

      <section class="card" aria-labelledby="by-status">
        <h2 id="by-status">{{ t("sByStatus") }}</h2>
        <ul class="bars">
          <li v-for="b in statusBars" :key="b.key" :class="`bar-st-${b.key}`">
            <span class="bar-label">{{ b.label }}</span>
            <span class="bar-track" aria-hidden="true"><span v-if="b.n" class="bar-fill" :style="{ width: b.w + '%' }"></span></span>
            <span class="bar-n">{{ fmt(b.n) }}</span>
          </li>
        </ul>
      </section>

      <section class="card" aria-labelledby="by-lang">
        <h2 id="by-lang">{{ t("sByLang") }}</h2>
        <p v-if="!langBars.length" class="muted small">{{ t("sNoData") }}</p>
        <ul class="bars">
          <li v-for="b in langBars" :key="b.key">
            <span class="bar-label">{{ b.label }}</span>
            <span class="bar-track" aria-hidden="true"><span v-if="b.n" class="bar-fill" :style="{ width: b.w + '%' }"></span></span>
            <span class="bar-n">{{ fmt(b.n) }} <span class="muted">· {{ b.pct }}%</span></span>
          </li>
        </ul>
      </section>

      <section class="card" aria-labelledby="journey">
        <h2 id="journey">{{ t("sJourney") }}</h2>
        <dl class="journey">
          <div><dt>{{ t("jOpened") }}</dt><dd>{{ fmt(s.journey.opened_curriculum) }}</dd></div>
          <div><dt>{{ t("jPrayer") }}</dt><dd>{{ fmt(s.journey.completed_prayer) }}</dd></div>
          <div><dt>{{ t("jReturned") }}</dt><dd>{{ fmt(s.journey.returned_another_day) }}</dd></div>
        </dl>
      </section>
    </div>
  </template>
</template>
