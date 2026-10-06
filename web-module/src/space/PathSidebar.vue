<template>
  <nav class="lsp-path" :aria-label="tr('pathTitle')">
    <div class="lsp-path__brand">
      <span class="lsp-logo" aria-hidden="true">
        <svg width="34" height="34" viewBox="0 0 32 32" focusable="false">
          <rect width="32" height="32" rx="10" fill="#6150EA" />
          <path d="M20.5 8.5a8 8 0 1 0 3 12.6A6.6 6.6 0 1 1 20.5 8.5z" fill="#2EF2C2" />
        </svg>
      </span>
      <span class="lsp-path__brandtext">
        <strong>{{ tr('spaceTitle') }}</strong>
        <span>{{ tr('spaceSub') }}</span>
      </span>
    </div>

    <div class="lsp-ring" role="img" :aria-label="tr('ringLabel', { done, total })">
      <svg viewBox="0 0 120 120" width="112" height="112" aria-hidden="true">
        <circle cx="60" cy="60" r="50" class="lsp-ring__track" />
        <circle cx="60" cy="60" r="50" class="lsp-ring__fill" :style="{ strokeDasharray: `${C}`, strokeDashoffset: `${C * (1 - pct)}` }" />
      </svg>
      <span class="lsp-ring__n" aria-hidden="true"><strong>{{ done }}</strong><span>{{ tr('ringOf', { total }) }}</span></span>
    </div>

    <div v-if="loading" class="lsp-path__units" role="status" :aria-label="tr('loading')">
      <div v-for="i in 6" :key="i" class="lsp-skel lsp-skel--dark"></div>
    </div>
    <div v-else class="lsp-path__units">
      <section v-for="(unit, ui) in units" :key="unit.id" class="lsp-unit" :class="{ 'is-complete': unitDone(unit) }">
        <h3 class="lsp-unit__title">
          <span class="lsp-unit__n">{{ unit.index ?? ui + 1 }}</span>
          <span>{{ label(unit.title) }}</span>
          <SpaceIcon v-if="unitDone(unit)" name="check" :size="16" class="lsp-unit__check" />
        </h3>
        <ul>
          <li v-for="l in unit.lessons" :key="l.id">
            <button
              type="button"
              class="lsp-lesson-link"
              :class="{ 'is-done': l.done, 'is-current': l.id === currentId, 'is-next': l.id === nextId && l.id !== currentId }"
              :aria-current="l.id === currentId ? 'page' : undefined"
              :disabled="disabled"
              @click="$emit('open', l.id)"
            >
              <span class="lsp-lesson-link__mark" aria-hidden="true">
                <SpaceIcon v-if="l.done" name="check" :size="13" />
                <span v-else-if="l.id === currentId" class="lsp-lesson-link__pulse"></span>
              </span>
              <span class="lsp-lesson-link__title">{{ label(l.title) }}</span>
              <!-- Not reviewed yet in this language: the lesson shows the book's own words only. -->
              <span v-if="l.reviewed === false && !l.done && l.id !== currentId" class="lsp-tag lsp-tag--book" :title="tr('unreviewedBadge')">{{ tr('bookTextTag') }}</span>
              <span v-if="l.id === currentId" class="lsp-tag lsp-tag--now">{{ tr('currentMark') }}</span>
              <span v-else-if="l.id === nextId" class="lsp-tag">{{ tr('nextMark') }}</span>
              <span v-if="l.done" class="lsp-sr">{{ tr('doneMark') }}</span>
            </button>
          </li>
        </ul>
      </section>
    </div>

    <div class="lsp-path__foot">
      <button type="button" class="lsp-tool" :disabled="disabled" @click="$emit('book')">
        <SpaceIcon name="book" :size="18" /><span>{{ tr('bookBrowse') }}</span>
      </button>
      <button type="button" class="lsp-tool" :disabled="disabled" @click="$emit('save')">
        <SpaceIcon :name="account ? 'user' : 'save'" :size="18" /><span>{{ account ? tr('signedIn', { who: account }) : tr('saveProgress') }}</span>
      </button>
      <button type="button" class="lsp-tool lsp-tool--accent" @click="$emit('handoff')">
        <SpaceIcon name="users" :size="18" /><span>{{ tr('talkHuman') }}</span>
      </button>
    </div>
  </nav>
</template>

<script setup>
// The journey at a glance: a progress ring, the book's units with their lessons (done, now, next),
// the whole book, and the two ways out of the lesson: save progress, and a person.
import { computed } from 'vue';
import SpaceIcon from './SpaceIcon.vue';
import { apiLang, useT } from '../i18n.js';

const props = defineProps({
  lang: { type: String, default: 'en' },
  index: { type: Object, default: null }, // GET /lessons
  progress: { type: Object, default: null },
  currentId: { type: String, default: null },
  account: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
});
defineEmits(['open', 'save', 'book', 'handoff']);

const tr = useT(() => props.lang);
const C = 2 * Math.PI * 50;
const loading = computed(() => !props.index);
const units = computed(() => props.index?.units || []);
const allLessons = computed(() => units.value.flatMap((u) => u.lessons || []));
const total = computed(() => props.progress?.position?.total || allLessons.value.length || 19);
const done = computed(() => props.progress?.position?.done ?? allLessons.value.filter((l) => l.done).length);
const pct = computed(() => (total.value ? Math.min(1, done.value / total.value) : 0));
const nextId = computed(() => props.progress?.next?.id || props.index?.next || null);
const unitDone = (u) => (u.lessons || []).length > 0 && u.lessons.every((l) => l.done);
const label = (x) => (x && typeof x === 'object' ? x[apiLang(props.lang)] || x.en || Object.values(x)[0] : x);
</script>
