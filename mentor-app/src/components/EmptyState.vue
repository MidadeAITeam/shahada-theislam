<script setup>
import Icon from "./Icon.vue";
defineProps({ icon: { type: String, default: "inbox" }, title: String, lead: String, tone: String });
</script>
<template>
  <div class="empty" :class="tone" role="status">
    <span class="empty-icon"><Icon :name="icon" :size="28" /></span>
    <p class="empty-title">{{ title }}</p>
    <p v-if="lead" class="empty-lead">{{ lead }}</p>
    <slot />
  </div>
</template>
