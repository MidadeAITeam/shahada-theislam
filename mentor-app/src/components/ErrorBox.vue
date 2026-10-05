<script setup>
import Icon from "./Icon.vue";
import { t, errorText } from "../i18n.js";
defineProps({ code: String });
defineEmits(["retry"]);
</script>
<template>
  <div class="error-box" role="alert">
    <Icon name="alert" />
    <span>{{ errorText(code) }}</span>
    <button type="button" class="btn btn-ghost btn-sm" @click="$emit('retry')">{{ t("retry") }}</button>
  </div>
</template>
