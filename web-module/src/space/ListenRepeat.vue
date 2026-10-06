<template>
  <section class="lsp-card lsp-sec lsp-listen" :aria-labelledby="`${uid}-title`">
    <div class="lsp-sec__head">
      <h2 :id="`${uid}-title`"><SpaceIcon name="headphones" />{{ tr('audioTitle') }}</h2>
      <p class="lsp-muted lsp-small">{{ tr('audioHint') }}</p>
    </div>

    <!-- One set of settings for every surah: who recites, repeat three times, how fast. -->
    <div class="lsp-listen__opts">
      <div class="lsp-seg" role="group" :aria-label="tr('audioReciter')">
        <button
          v-for="r in RECITERS"
          :key="r"
          type="button"
          class="lsp-seg__btn"
          :aria-pressed="reciter === r ? 'true' : 'false'"
          :title="items[0]?.[r]?.label"
          @click="setReciter(r)"
        >{{ tr(r === 'teaching' ? 'audioTeachingShort' : 'audioMurattalShort') }}</button>
      </div>
      <button type="button" class="lsp-seg__btn lsp-seg__btn--solo" :aria-pressed="loop ? 'true' : 'false'" @click="loop = !loop">
        <SpaceIcon name="undo" :size="16" />{{ tr('audioLoop') }}
      </button>
      <div class="lsp-seg" role="group" :aria-label="tr('audioSpeed')">
        <button v-for="s in SPEEDS" :key="s" type="button" class="lsp-seg__btn" :aria-pressed="speed === s ? 'true' : 'false'" @click="setSpeed(s)">
          {{ fmtSpeed(s) }}
        </button>
      </div>
    </div>

    <ul class="lsp-listen__list">
      <li v-for="a in items" :key="a.surah" class="lsp-listen__item" :class="{ 'is-playing': current === a.surah && playing }">
        <button
          type="button"
          class="lsp-listen__play"
          :aria-label="tr(current === a.surah && playing ? 'audioPause' : 'audioPlay', { name: a.title })"
          @click="toggle(a)"
        >
          <span v-if="current === a.surah && loading" class="shd-spinner lsp-spinner-light" aria-hidden="true"></span>
          <svg v-else-if="current === a.surah && playing" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" /></svg>
          <svg v-else width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
        </button>
        <div class="lsp-listen__body">
          <div class="lsp-listen__row">
            <span class="lsp-listen__name" dir="auto">{{ a.title }}</span>
            <span v-if="current === a.surah" class="lsp-listen__time" aria-hidden="true">
              <template v-if="loop">{{ tr('audioRound', { n: round, total: 3 }) }} · </template>{{ clock(time) }}<template v-if="duration"> / {{ clock(duration) }}</template>
            </span>
          </div>
          <input
            v-if="current === a.surah && duration"
            class="lsp-listen__seek"
            type="range"
            min="0"
            :max="Math.floor(duration)"
            step="1"
            :value="Math.floor(time)"
            :aria-label="tr('audioSeek', { name: a.title })"
            :aria-valuetext="`${clock(time)} / ${clock(duration)}`"
            @input="seek($event.target.value)"
          />
          <p v-if="current === a.surah && failed" class="shd-error lsp-small" role="alert">{{ tr('audioError') }}</p>
          <!-- The surah's verses when the lesson carries them (Tanzil text as served). -->
          <p v-for="v in versesOf(a.surah)" :key="v.ref" class="lsp-listen__ar" lang="ar" dir="rtl">
            {{ v.arabic }} <span class="lsp-listen__ref">﴿{{ v.ref.split(':')[1] }}﴾</span>
          </p>
        </div>
      </li>
    </ul>
    <p class="lsp-muted lsp-small">{{ tr('audioCredit', { src: 'mp3quran.net' }) }}</p>
  </section>
</template>

<script setup>
// Listen and repeat: one play button per surah instead of a row of bare players. A single audio
// element plays one surah at a time, with the reciter (teaching recitation or murattal), a
// three-times loop for memorising, and a slower speed shared by every surah of the lesson.
import { onBeforeUnmount, ref } from 'vue';
import SpaceIcon from './SpaceIcon.vue';
import { useT } from '../i18n.js';

const props = defineProps({
  items: { type: Array, default: () => [] }, // lesson.audio: [{ surah, title, teaching: { url, label }, murattal }]
  verses: { type: Array, default: () => [] }, // lesson.verses: [{ ref: '112:1', arabic }]
  lang: { type: String, default: 'en' },
});

const RECITERS = ['teaching', 'murattal'];
const SPEEDS = [0.75, 1];
const tr = useT(() => props.lang);
const uid = `lsp-listen-${Math.random().toString(36).slice(2, 7)}`;

const reciter = ref('teaching');
const loop = ref(false);
const speed = ref(1);
const current = ref(null);
const playing = ref(false);
const loading = ref(false);
const failed = ref(false);
const time = ref(0);
const duration = ref(0);
const round = ref(1);

const audio = new Audio();
audio.preload = 'none';
audio.addEventListener('timeupdate', () => (time.value = audio.currentTime));
audio.addEventListener('loadedmetadata', () => (duration.value = Number.isFinite(audio.duration) ? audio.duration : 0));
audio.addEventListener('playing', () => {
  loading.value = false;
  playing.value = true;
});
audio.addEventListener('waiting', () => (loading.value = true));
audio.addEventListener('pause', () => (playing.value = false));
audio.addEventListener('error', () => {
  if (!current.value) return;
  failed.value = true;
  loading.value = false;
  playing.value = false;
});
audio.addEventListener('ended', () => {
  if (loop.value && round.value < 3) {
    round.value++;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } else {
    playing.value = false;
    round.value = 1;
  }
});

const versesOf = (n) => props.verses.filter((v) => v.arabic && String(v.ref || '').split(':')[0] === String(n));

function load(a, at = 0) {
  failed.value = false;
  duration.value = 0;
  time.value = at;
  audio.src = a[reciter.value]?.url || '';
  audio.playbackRate = speed.value;
  if (at) audio.addEventListener('loadedmetadata', () => (audio.currentTime = at), { once: true });
}
function play() {
  loading.value = true;
  audio.play().catch(() => {
    loading.value = false;
  });
}
function toggle(a) {
  if (current.value === a.surah) {
    if (playing.value) audio.pause();
    else play();
    return;
  }
  current.value = a.surah;
  round.value = 1;
  load(a);
  play();
}
// Switching the reciter restarts the surah with the other voice (the recordings differ in length).
function setReciter(r) {
  if (reciter.value === r) return;
  reciter.value = r;
  const a = props.items.find((x) => x.surah === current.value);
  if (!a) return;
  const wasPlaying = playing.value;
  round.value = 1;
  load(a);
  if (wasPlaying) play();
}
function setSpeed(s) {
  speed.value = s;
  audio.playbackRate = s;
}
function seek(v) {
  audio.currentTime = Number(v);
  time.value = Number(v);
}
function clock(s) {
  const n = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}
function fmtSpeed(s) {
  try {
    return `${new Intl.NumberFormat(props.lang).format(s)}×`;
  } catch {
    return `${s}×`;
  }
}

onBeforeUnmount(() => {
  audio.pause();
  audio.removeAttribute('src');
});
</script>
