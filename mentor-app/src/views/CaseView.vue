<script setup>
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from "vue";
import Icon from "../components/Icon.vue";
import ReasonChip from "../components/ReasonChip.vue";
import StatusPill from "../components/StatusPill.vue";
import EmptyState from "../components/EmptyState.vue";
import ErrorBox from "../components/ErrorBox.vue";
import { t, errorText } from "../i18n.js";
import { api } from "../api.js";
import { langName, countryName, flag, dateTime, ageShort, ageSince, initial } from "../format.js";
import { session, isSupervisor, refreshInbox } from "../store.js";

const props = defineProps({ id: String });
const STATUSES = ["new", "in_progress", "waiting_user", "closed"];

const data = ref(null);
const loadError = ref(null);
const c = computed(() => data.value?.case);
const crisis = computed(() => c.value?.reason === "crisis" && c.value?.status !== "closed");
const textDir = computed(() => (c.value?.lang === "ar" ? "rtl" : "auto"));

async function load(silent = false) {
  try {
    data.value = await api.case(props.id);
    loadError.value = null;
    if (!silent) syncForm();
  } catch (e) {
    if (!silent || e.code === "not_found") loadError.value = e.code;
  }
}

// ---------------------------------------------------------------- reply + canned replies
const reply = ref("");
const replyBusy = ref(false);
const replyMsg = ref({ kind: "", text: "" });
const canned = ref([]);
const cannedOpen = ref(false);
const replyBox = ref(null);
const thread = ref(null);

const cannedForCase = computed(() => {
  const own = canned.value.filter((r) => r.lang === c.value?.lang);
  return own.length ? own : canned.value.filter((r) => r.lang === "en");
});
const cannedLang = computed(() => langName(cannedForCase.value[0]?.lang ?? c.value?.lang));

async function loadCanned() {
  try { canned.value = await api.canned(c.value.lang); } catch { canned.value = []; }
}
function useCanned(r) {
  reply.value = reply.value.trim() ? `${reply.value.trim()}\n\n${r.text}` : r.text;
  cannedOpen.value = false;
  nextTick(() => replyBox.value?.focus());
}
async function sendReply() {
  if (!reply.value.trim()) { replyMsg.value = { kind: "error", text: errorText("empty") }; return; }
  replyBusy.value = true;
  replyMsg.value = { kind: "", text: "" };
  try {
    await api.reply(props.id, reply.value.trim());
    reply.value = "";
    replyMsg.value = { kind: "ok", text: t("sent") };
    await load(true);
    syncForm();
    refreshInbox();
    scrollThread();
  } catch (e) {
    replyMsg.value = { kind: "error", text: errorText(e.code) };
  } finally {
    replyBusy.value = false;
  }
}
function onReplyKey(e) {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendReply(); }
}
function scrollThread() {
  nextTick(() => { if (thread.value) thread.value.scrollTop = thread.value.scrollHeight; });
}

// ---------------------------------------------------------------- assignment
const assignTo = ref("");
const assignBusy = ref(false);
const assignMsg = ref({ kind: "", text: "" });
const mineCase = computed(() => c.value?.assigned_to === session.me?.id);
const mentorGroups = computed(() => {
  const g = c.value?.mentor;
  const ms = session.mentors;
  return [
    { label: t("sameGroup") + ` · ${t(`group.${g}`)}`, items: ms.filter((m) => m.role === "mentor" && m.gender === g) },
    { label: t("otherGroup"), items: ms.filter((m) => m.role === "mentor" && m.gender !== g) },
    { label: t("supervisors"), items: ms.filter((m) => m.role === "supervisor") },
  ].filter((x) => x.items.length);
});
async function assign(mentorId) {
  if (!mentorId) return;
  assignBusy.value = true;
  assignMsg.value = { kind: "", text: "" };
  try {
    await api.assign(props.id, mentorId);
    await load(true);
    syncForm();
    refreshInbox();
    assignMsg.value = { kind: "ok", text: t("saved") };
  } catch (e) {
    assignMsg.value = { kind: "error", text: errorText(e.code) };
  } finally {
    assignBusy.value = false;
  }
}

// ---------------------------------------------------------------- status
const status = ref("new");
const closeReason = ref("");
const statusBusy = ref(false);
const statusMsg = ref({ kind: "", text: "" });
const statusDirty = computed(() => c.value && (status.value !== c.value.status || (status.value === "closed" && closeReason.value.trim() !== (c.value.closed_reason ?? ""))));
async function saveStatus() {
  statusBusy.value = true;
  statusMsg.value = { kind: "", text: "" };
  try {
    await api.setStatus(props.id, status.value, status.value === "closed" ? closeReason.value.trim() || undefined : undefined);
    await load(true);
    syncForm();
    refreshInbox();
    statusMsg.value = { kind: "ok", text: t("saved") };
  } catch (e) {
    statusMsg.value = { kind: "error", text: errorText(e.code) };
  } finally {
    statusBusy.value = false;
  }
}

// ---------------------------------------------------------------- notes
const note = ref("");
const noteBusy = ref(false);
const noteMsg = ref({ kind: "", text: "" });
async function addNote() {
  if (!note.value.trim()) { noteMsg.value = { kind: "error", text: errorText("empty") }; return; }
  noteBusy.value = true;
  noteMsg.value = { kind: "", text: "" };
  try {
    await api.addNote(props.id, note.value.trim());
    note.value = "";
    await load(true);
  } catch (e) {
    noteMsg.value = { kind: "error", text: errorText(e.code) };
  } finally {
    noteBusy.value = false;
  }
}

// ---------------------------------------------------------------- timeline
function eventText(e) {
  if (e.type === "status" && e.detail) {
    const [s, ...rest] = e.detail.split(": ");
    const label = t(`status.${s}`);
    return t("ev.status", { d: rest.length ? `${label} (${rest.join(": ")})` : label });
  }
  if (e.type === "created") return t("ev.created") + (e.detail ? ` · ${t(`reason.${e.detail}`)}` : "");
  return t(`ev.${e.type}`, { d: e.detail ?? "" });
}

// ---------------------------------------------------------------- emergency number
const copied = ref(false);
async function copyNumber() {
  try {
    await navigator.clipboard.writeText(c.value.emergency_number);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 1800);
  } catch { /* clipboard unavailable: the number is visible anyway */ }
}

function syncForm() {
  if (!c.value) return;
  status.value = c.value.status;
  closeReason.value = c.value.closed_reason ?? "";
  if (!assignTo.value) assignTo.value = c.value.assigned_to ?? "";
}

let timer;
onMounted(async () => {
  await load();
  if (c.value) { loadCanned(); scrollThread(); }
  timer = setInterval(async () => {
    const before = data.value?.messages.length ?? 0;
    await load(true);
    if ((data.value?.messages.length ?? 0) > before) scrollThread();
  }, 15000);
});
onUnmounted(() => clearInterval(timer));
watch(() => props.id, () => load());
</script>

<template>
  <a href="#/cases" class="back-link"><Icon name="back" :size="18" />{{ t("back") }}</a>

  <ErrorBox v-if="loadError && loadError !== 'not_found'" :code="loadError" @retry="load()" />
  <EmptyState v-else-if="loadError === 'not_found'" icon="inbox" :title="t('caseNotFound')" :lead="t('caseNotFoundLead')">
    <a href="#/cases" class="btn btn-ghost btn-sm">{{ t("back") }}</a>
  </EmptyState>
  <div v-else-if="!c" class="skeleton-case" aria-hidden="true"><div></div><div></div><div></div></div>

  <template v-else>
    <div v-if="crisis" class="crisis-banner" role="region" :aria-label="t('crisisBanner')">
      <span class="crisis-banner-icon"><Icon name="alert" :size="26" /></span>
      <div class="crisis-banner-text">
        <strong>{{ t("crisisBanner") }}</strong>
        <span>{{ t("crisisBannerLead") }}</span>
      </div>
      <div class="emergency">
        <label for="em-number">{{ t("emergencyNumber") }}<template v-if="c.country"> · {{ countryName(c.country) }}</template></label>
        <div class="emergency-row">
          <input id="em-number" :value="c.emergency_number" readonly dir="ltr" />
          <button type="button" class="btn btn-light btn-sm" @click="copyNumber">
            <Icon :name="copied ? 'check' : 'copy'" :size="16" />{{ copied ? t("copied") : t("copy") }}
          </button>
        </div>
      </div>
    </div>

    <header class="case-head">
      <div class="case-head-main">
        <div class="case-tags">
          <ReasonChip :reason="c.reason" />
          <StatusPill :status="c.status" />
          <span v-if="c.overdue" class="late-tag" :class="{ 'late-crisis': c.reason === 'crisis' }">{{ t("overdue") }}</span>
        </div>
        <h1>{{ t(`reason.${c.reason}`) }} <span class="case-id" dir="ltr">#{{ c.id.slice(-6) }}</span></h1>
      </div>
      <div class="case-head-side">
        <span><Icon name="clock" :size="16" />{{ ageShort(c.age_minutes) }}</span>
        <span><Icon name="user" :size="16" />{{ c.assigned_name || t("unassigned") }}</span>
      </div>
    </header>

    <div class="case-grid">
      <!-- 1. Referral card -->
      <section class="card referral" aria-labelledby="ref-h">
        <h2 id="ref-h"><Icon name="note" />{{ t("referral") }}</h2>
        <p class="muted small">{{ t("referralLead") }}</p>
        <dl class="facts">
          <div><dt>{{ t("cReason") }}</dt><dd><ReasonChip :reason="c.reason" /></dd></div>
          <div><dt>{{ t("cLang") }}</dt><dd>{{ langName(c.lang) }}</dd></div>
          <div><dt>{{ t("cCountry") }}</dt><dd><template v-if="c.country"><span aria-hidden="true">{{ flag(c.country) }}</span> {{ countryName(c.country) }}</template><span v-else class="muted">{{ t("cNoCountry") }}</span></dd></div>
          <div><dt>{{ t("cLesson") }}</dt><dd>{{ c.lesson_title || t("noLesson") }}</dd></div>
          <div><dt>{{ t("cGroup") }}</dt><dd>{{ t(`group.${c.mentor}`) }}</dd></div>
          <div><dt>{{ t("cCreated") }}</dt><dd>{{ dateTime(c.created_at) }}</dd></div>
        </dl>
        <div class="question">
          <h3>{{ t("cQuestion") }}</h3>
          <blockquote :dir="textDir">{{ c.question || "—" }}</blockquote>
        </div>
      </section>

      <!-- 2. Conversation -->
      <section class="card conversation" aria-labelledby="conv-h">
        <h2 id="conv-h"><Icon name="message" />{{ t("conversation") }}</h2>
        <p class="muted small">{{ t("conversationLead") }}</p>
        <ol ref="thread" class="thread" tabindex="0" :aria-label="t('conversation')">
          <li v-if="!data.messages.length" class="muted thread-empty">{{ t("noMessages") }}</li>
          <li v-for="m in data.messages" :key="m.id" class="bubble" :class="m.author === 'mentor' ? 'from-team' : 'from-learner'">
            <span class="bubble-who">{{ m.author === "mentor" ? t("mentorSide") : t("learner") }}</span>
            <p :dir="textDir">{{ m.text }}</p>
            <time :datetime="m.created_at">{{ dateTime(m.created_at) }}</time>
          </li>
        </ol>

        <form class="reply" @submit.prevent="sendReply">
          <div class="reply-top">
            <label for="reply">{{ t("replyLabel") }}</label>
            <button type="button" class="btn btn-ghost btn-sm" :aria-expanded="cannedOpen" aria-controls="canned-list" @click="cannedOpen = !cannedOpen">
              <Icon name="sparkle" :size="16" />{{ t("canned") }}
            </button>
          </div>
          <div v-if="cannedOpen" id="canned-list" class="canned">
            <p class="canned-head">{{ t("cannedFor", { l: cannedLang }) }}</p>
            <p v-if="!cannedForCase.length" class="muted small">{{ t("cannedEmpty") }}</p>
            <ul v-else>
              <li v-for="r in cannedForCase" :key="r.id">
                <button type="button" class="canned-item" @click="useCanned(r)">
                  <strong :dir="r.lang === 'ar' ? 'rtl' : 'ltr'">{{ r.title }}</strong>
                  <span :dir="r.lang === 'ar' ? 'rtl' : 'ltr'">{{ r.text }}</span>
                </button>
              </li>
            </ul>
          </div>
          <textarea id="reply" ref="replyBox" v-model="reply" rows="4" :dir="textDir" :placeholder="t('replyPlaceholder')" aria-describedby="reply-hint reply-msg" @keydown="onReplyKey"></textarea>
          <div class="reply-foot">
            <span id="reply-hint" class="muted small">{{ t("sendHint") }}</span>
            <button type="submit" class="btn btn-primary" :disabled="replyBusy">
              <Icon name="send" :size="18" />{{ replyBusy ? t("sending") : t("send") }}
            </button>
          </div>
          <p id="reply-msg" class="form-msg" :class="replyMsg.kind" role="status">{{ replyMsg.text }}</p>
        </form>
      </section>

      <!-- 3. Actions -->
      <div class="actions-col">
        <section class="card" aria-labelledby="as-h">
          <h2 id="as-h"><Icon name="user" />{{ t("assign") }}</h2>
          <p class="assignee-now" :class="{ none: !c.assigned_name }">
            <span class="avatar sm" aria-hidden="true">{{ initial(c.assigned_name || "?") }}</span>
            {{ c.assigned_name || t("unassigned") }}
            <span v-if="mineCase" class="you-tag">{{ t("assignedToYou") }}</span>
          </p>
          <form v-if="isSupervisor" class="inline-form" @submit.prevent="assign(assignTo)">
            <div class="field">
              <label for="assign-to">{{ t("assignTo") }}</label>
              <select id="assign-to" v-model="assignTo" dir="auto">
                <option value="" disabled>—</option>
                <optgroup v-for="g in mentorGroups" :key="g.label" :label="g.label">
                  <option v-for="m in g.items" :key="m.id" :value="m.id">{{ m.name }}</option>
                </optgroup>
              </select>
            </div>
            <button type="submit" class="btn btn-primary btn-sm btn-block" :disabled="assignBusy || !assignTo || assignTo === c.assigned_to">{{ t("assignBtn") }}</button>
          </form>
          <button v-if="!mineCase" type="button" class="btn btn-secondary btn-block btn-sm" :disabled="assignBusy" @click="assign(session.me.id)">
            <Icon name="hand" :size="18" />{{ t("take") }}
          </button>
          <p class="form-msg" :class="assignMsg.kind" role="status">{{ assignMsg.text }}</p>
        </section>

        <section class="card" aria-labelledby="st-h">
          <h2 id="st-h"><Icon name="check" />{{ t("changeStatus") }}</h2>
          <form @submit.prevent="saveStatus">
            <fieldset class="segmented">
              <legend class="sr-only">{{ t("changeStatus") }}</legend>
              <label v-for="s in STATUSES" :key="s" :class="[`seg-${s}`, { on: status === s }]">
                <input v-model="status" type="radio" name="status" :value="s" />
                <span>{{ t(`status.${s}`) }}</span>
              </label>
            </fieldset>
            <div v-if="status === 'closed'" class="field">
              <label for="close-reason">{{ t("closeReason") }}</label>
              <input id="close-reason" v-model="closeReason" type="text" maxlength="300" :placeholder="t('closeReasonPh')" />
              <div class="presets">
                <button v-for="p in t('closePresets')" :key="p" type="button" class="preset" :aria-pressed="closeReason === p" @click="closeReason = p">{{ p }}</button>
              </div>
            </div>
            <p v-if="c.status === 'closed' && c.closed_reason" class="muted small">{{ t("closedBecause", { r: c.closed_reason }) }}</p>
            <button type="submit" class="btn btn-primary btn-sm btn-block" :disabled="statusBusy || !statusDirty">{{ t("saveStatus") }}</button>
            <p class="form-msg" :class="statusMsg.kind" role="status">{{ statusMsg.text }}</p>
          </form>
        </section>

        <section class="card" aria-labelledby="nt-h">
          <h2 id="nt-h"><Icon name="lock" />{{ t("notes") }}</h2>
          <p class="muted small">{{ t("notesLead") }}</p>
          <ul v-if="data.notes.length" class="notes">
            <li v-for="n in data.notes" :key="n.id">
              <p>{{ n.text }}</p>
              <span class="muted small">{{ n.name }} · {{ dateTime(n.created_at) }}</span>
            </li>
          </ul>
          <p v-else class="muted small">{{ t("noNotes") }}</p>
          <form @submit.prevent="addNote">
            <label for="note" class="sr-only">{{ t("noteLabel") }}</label>
            <textarea id="note" v-model="note" rows="2" :placeholder="t('notePh')"></textarea>
            <button type="submit" class="btn btn-ghost btn-sm" :disabled="noteBusy">{{ t("addNote") }}</button>
            <p class="form-msg" :class="noteMsg.kind" role="status">{{ noteMsg.text }}</p>
          </form>
        </section>

        <section class="card" aria-labelledby="tl-h">
          <h2 id="tl-h"><Icon name="timeline" />{{ t("timeline") }}</h2>
          <ol class="timeline">
            <li v-for="(e, i) in [...data.events].reverse()" :key="i" :class="`ev-${e.type}`">
              <span class="tl-dot" aria-hidden="true"></span>
              <span class="tl-text">{{ eventText(e) }}</span>
              <span class="muted small">{{ e.actor ? t("by", { a: e.actor }) : ["created", "learner_message"].includes(e.type) ? t("learner") : t("system") }} · <time :datetime="e.created_at" :title="dateTime(e.created_at)">{{ ageShort(ageSince(e.created_at)) }}</time></span>
            </li>
          </ol>
        </section>
      </div>
    </div>
  </template>
</template>
