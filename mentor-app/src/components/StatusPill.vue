<script setup>
import { t } from "../i18n.js";
defineProps({ status: String, kind: { type: String, default: "status" } });
</script>
<template>
  <span class="pill" :class="`${kind}-${status}`"><span class="dot" aria-hidden="true"></span>{{ t(`${kind === 'report' ? 'reportStatus' : 'status'}.${status}`) }}</span>
</template>
