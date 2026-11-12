// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // Las Edge Functions corren en Deno (imports por URL) y usan `deno lint`
    ignores: ['dist/*', 'supabase/functions/**'],
  },
]);
