<script setup>
import { ref } from "vue";
import Logo from "../components/Logo.vue";
import Icon from "../components/Icon.vue";
import { t, errorText, toggleLang } from "../i18n.js";
import { login } from "../store.js";

const email = ref("");
const password = ref("");
const show = ref(false);
const busy = ref(false);
const error = ref("");

async function submit() {
  if (!email.value.trim() || !password.value) { error.value = errorText("empty"); return; }
  busy.value = true;
  error.value = "";
  try {
    await login(email.value.trim(), password.value);
  } catch (e) {
    error.value = errorText(e.code);
    password.value = "";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="login-page" id="main">
    <button type="button" class="btn btn-ghost btn-sm login-lang" :aria-label="t('switchLangLabel')" @click="toggleLang">
      <Icon name="globe" :size="18" />{{ t("switchLang") }}
    </button>
    <div class="login-card card">
      <Logo />
      <h1>{{ t("loginTitle") }}</h1>
      <p class="muted">{{ t("loginLead") }}</p>
      <form novalidate @submit.prevent="submit">
        <div class="field">
          <label for="email">{{ t("email") }}</label>
          <input id="email" v-model="email" type="email" dir="ltr" autocomplete="username" inputmode="email" required
            :aria-invalid="!!error" aria-describedby="login-error" />
        </div>
        <div class="field">
          <label for="password">{{ t("password") }}</label>
          <div class="input-with-btn">
            <input id="password" v-model="password" :type="show ? 'text' : 'password'" dir="ltr" autocomplete="current-password" required
              :aria-invalid="!!error" aria-describedby="login-error" />
            <button type="button" class="icon-btn" :aria-label="show ? t('hidePassword') : t('showPassword')" :aria-pressed="show" @click="show = !show">
              <Icon :name="show ? 'eyeOff' : 'eye'" :size="18" />
            </button>
          </div>
        </div>
        <p id="login-error" class="form-error" role="alert" aria-live="assertive">{{ error }}</p>
        <button type="submit" class="btn btn-primary btn-block" :disabled="busy">{{ busy ? t("signingIn") : t("signIn") }}</button>
      </form>
      <p class="login-privacy"><Icon name="lock" :size="16" />{{ t("loginPrivacy") }}</p>
    </div>
  </main>
</template>
