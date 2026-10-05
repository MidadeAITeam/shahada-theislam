<script setup>
import { computed, ref, onMounted } from "vue";
import Icon from "../components/Icon.vue";
import StatusPill from "../components/StatusPill.vue";
import EmptyState from "../components/EmptyState.vue";
import ErrorBox from "../components/ErrorBox.vue";
import { t, errorText } from "../i18n.js";
import { api } from "../api.js";
import { langName, dateTime } from "../format.js";

const STATUSES = ["new", "reviewing", "fixed", "not_an_error"];
const reports = ref(null);
const error = ref(null);
const filter = ref("open");
const busy = ref({});
const rowMsg = ref({});

async function load() {
  try {
    reports.value = await api.reports();
    error.value = null;
  } catch (e) {
    error.value = e.code;
  }
}
onMounted(load);

const counts = computed(() => Object.fromEntries(STATUSES.map((s) => [s, (reports.value ?? []).filter((r) => r.status === s).length])));
const shown = computed(() => (reports.value ?? []).filter((r) =>
  filter.value === "" || (filter.value === "open" ? ["new", "reviewing"].includes(r.status) : r.status === filter.value)));

function target(r) {
  const [kind, ...rest] = String(r.target ?? "").split(":");
  const ref = rest.join(":");
  if (kind === "lesson") return { icon: "book", kind: t("rLesson"), ref };
  if (kind === "answer") return { icon: "message", kind: t("rAnswer"), ref };
  return { icon: "flag", kind: t("rOther"), ref: r.target };
}

async function setStatus(r, status) {
  busy.value = { ...busy.value, [r.id]: true };
  rowMsg.value = { ...rowMsg.value, [r.id]: "" };
  try {
    await api.setReport(r.id, status);
    await load();
  } catch (e) {
    rowMsg.value = { ...rowMsg.value, [r.id]: errorText(e.code) };
  } finally {
    busy.value = { ...busy.value, [r.id]: false };
  }
}
</script>

<template>
  <header class="page-head">
    <div>
      <h1>{{ t("reportsTitle") }}</h1>
      <p class="muted">{{ t("reportsLead") }}</p>
    </div>
  </header>

  <div class="tabs" role="group" :aria-label="t('rStatus')">
    <button type="button" class="tab" :aria-pressed="filter === 'open'" @click="filter = 'open'">{{ t("allOpen") }} <span class="tab-n">{{ counts.new + counts.reviewing }}</span></button>
    <button v-for="s in STATUSES" :key="s" type="button" class="tab" :aria-pressed="filter === s" @click="filter = s">{{ t(`reportStatus.${s}`) }} <span class="tab-n">{{ counts[s] }}</span></button>
    <button type="button" class="tab" :aria-pressed="filter === ''" @click="filter = ''">{{ t("all") }} <span class="tab-n">{{ reports?.length ?? 0 }}</span></button>
  </div>

  <ErrorBox v-if="error" :code="error" @retry="load" />
  <div v-else-if="!reports" class="skeleton-list" aria-hidden="true"><div v-for="i in 3" :key="i" class="skeleton-row"></div></div>
  <EmptyState v-else-if="!reports.length" icon="flag" :title="t('noReports')" :lead="t('noReportsLead')" />
  <EmptyState v-else-if="!shown.length" icon="check" :title="t('noReportsFiltered')" tone="positive" />
  <ul v-else class="report-list">
    <li v-for="r in shown" :key="r.id" class="card report">
      <div class="report-head">
        <span class="report-target"><Icon :name="target(r).icon" :size="18" /><strong>{{ target(r).kind }}</strong><code dir="ltr">{{ target(r).ref }}</code></span>
        <StatusPill :status="r.status" kind="report" />
      </div>
      <p class="report-note" dir="auto">{{ r.note || "—" }}</p>
      <div class="report-foot">
        <span class="muted small">{{ langName(r.lang) }} · {{ dateTime(r.created_at) }}<template v-if="r.reviewer"> · {{ t("rReviewer", { n: r.reviewer }) }}</template></span>
        <div class="field field-inline">
          <label :for="`rs-${r.id}`">{{ t("rStatus") }}</label>
          <select :id="`rs-${r.id}`" :value="r.status" :disabled="busy[r.id]" @change="setStatus(r, $event.target.value)">
            <option v-for="s in STATUSES" :key="s" :value="s">{{ t(`reportStatus.${s}`) }}</option>
          </select>
        </div>
      </div>
      <p v-if="rowMsg[r.id]" class="form-msg error" role="alert">{{ rowMsg[r.id] }}</p>
    </li>
  </ul>
</template>
