<template>
  <button type="button" class="shd-demo-btn" :lang="lang" :dir="isRtl(lang) ? 'rtl' : 'ltr'" @click="$emit('start')">
    <span>{{ t(lang, 'tryDemo') }}</span>
    <small>{{ t(lang, 'tryDemoHint') }}</small>
  </button>
</template>

<script setup>
// The shortcut past the pre-Shahada conversation, for visitors and judges.
import { isRtl, t } from './i18n.js';
import './shahada.css';

defineProps({ lang: { type: String, default: 'en' } });
defineEmits(['start']);
</script>
