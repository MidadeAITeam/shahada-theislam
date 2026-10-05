<script setup>
defineProps({ light: Boolean });
</script>
<template>
  <span class="logo" :class="{ light }">
    <svg width="34" height="34" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="10" fill="#6150EA" />
      <path d="M20.5 8.5a8 8 0 1 0 3 12.6A6.6 6.6 0 1 1 20.5 8.5z" fill="#2EF2C2" />
    </svg>
    <span class="logo-text" dir="ltr">theislam<span>.chat</span></span>
  </span>
</template>
