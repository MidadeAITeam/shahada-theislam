<script setup>
import { t } from "../i18n.js";
defineProps({ reason: String });
</script>
<template>
  <span class="chip" :class="`reason-${reason}`">
    <svg v-if="reason === 'crisis'" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 4l9 16H3zM12 10v4m0 3v.01" /></svg>
    {{ t(`reason.${reason}`) }}
  </span>
</template>
