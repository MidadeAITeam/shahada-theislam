<template>
  <section class="shd-card" :aria-labelledby="headId">
    <h3 :id="headId">{{ tr('lessonsTitle') }}</h3>
    <div v-if="loading" class="shd-loading" role="status"><span class="shd-spinner" aria-hidden="true"></span>{{ tr('loading') }}</div>
    <template v-else-if="error">
      <p class="shd-error" role="alert">{{ tr('errorGeneric') }}</p>
      <div class="shd-actions"><button type="button" class="shd-btn shd-btn--small" @click="load">{{ tr('retry') }}</button></div>
    </template>
    <div v-else>
      <div v-for="(unit, ui) in units" :key="unit.id" class="shd-index-unit">
        <h4 class="shd-eyebrow">{{ tr('unit', { u: unit.index ?? ui + 1 }) }} · {{ label(unit.title) }}</h4>
        <ul class="shd-index-list">
          <li v-for="l in unit.lessons" :key="l.id">
            <button
              type="button"
              class="shd-index-item"
              :class="{ 'shd-index-item--done': l.done, 'shd-index-item--next': l.id === nextId }"
              :aria-current="l.id === nextId ? 'step' : undefined"
              @click="$emit('open', l.id)"
            >
              <span class="shd-index-item__mark" aria-hidden="true">
                <svg v-if="l.done" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5 9-10" /></svg>
              </span>
              <span>{{ label(l.title) }}</span>
              <span v-if="l.done" class="shd-tag">{{ tr('doneMark') }}</span>
              <span v-else-if="l.id === nextId" class="shd-tag">{{ tr('nextMark') }}</span>
            </button>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<script setup>
// The whole book at a glance: units, lessons, what is done and what comes next on this learner's path.
import { computed, onMounted, ref } from 'vue';
import { api } from './api.js';
import { apiLang, useT } from './i18n.js';

const props = defineProps({
  lang: { type: String, default: 'en' },
  next: { type: String, default: null },
});
defineEmits(['open']);

const tr = useT(() => props.lang);
const headId = `shd-index-${Math.random().toString(36).slice(2, 7)}`;
const data = ref(null);
const loading = ref(true);
const error = ref(false);

const units = computed(() => (Array.isArray(data.value) ? data.value : data.value?.units) || []);
// The service's own idea of "next" wins; otherwise the first undone lesson on the learner's path.
const nextId = computed(() => {
  if (data.value?.next?.id) return data.value.next.id;
  if (props.next) return props.next;
  const done = new Set(units.value.flatMap((u) => u.lessons || []).filter((l) => l.done).map((l) => l.id));
  return (data.value?.path || []).find((id) => !done.has(id)) || null;
});

// Titles may come as one string or as { en, ar, ... } straight from the book structure.
const label = (x) => (x && typeof x === 'object' ? x[apiLang(props.lang)] || x.en || Object.values(x)[0] : x);

async function load() {
  loading.value = true;
  error.value = false;
  try {
    data.value = await api.lessons(apiLang(props.lang));
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}
onMounted(load);
</script>
