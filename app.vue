<script setup lang="ts">
// import '@unocss/reset/tailwind.css';

const route = useRoute();
const router = useRouter();

useHead({
  title: '龙猫乐园',
});

const legacyEntryDialog = ref(false);
const legacyEntryUrl = 'https://1231-4hk.pages.dev/';
const legacyEntrySources = new Set([
  'nuaaguide-shop',
  'nuaaguide.shop',
  'www.nuaaguide.shop',
  'legacy',
]);

const normalizeLegacySource = (value: string | string[] | null | undefined) => {
  const firstValue = Array.isArray(value) ? value[0] : value;
  return String(firstValue ?? '').trim().toLowerCase();
};

const shouldShowLegacyEntryDialog = (value: string | string[] | null | undefined) =>
  legacyEntrySources.has(normalizeLegacySource(value));

const clearLegacySourceQuery = async () => {
  if (!('from' in route.query)) return;
  const nextQuery = { ...route.query };
  delete nextQuery.from;
  await router.replace({
    path: route.path,
    query: nextQuery,
    hash: route.hash,
  });
};

const closeLegacyEntryDialog = async () => {
  legacyEntryDialog.value = false;
  await clearLegacySourceQuery();
};

watch(
  () => route.query.from,
  (from) => {
    legacyEntryDialog.value = shouldShowLegacyEntryDialog(from);
  },
  { immediate: true },
);
</script>
<script lang="ts">
window.global = window;
</script>
<template>
  <VApp>
    <VAppBar color="primary">
      <VAppBarTitle class="text-2xl font-bold flex-1 text-center">
        <NuxtLink to="/" class="no-underline text-white bg-green px-2 py-1 rounded-lg inline-block text-2xl gont-blod">
          龙猫乐园
        </NuxtLink>
      </VAppBarTitle>
      <template #append>
        <VAppBarNavIcon
          v-ripple icon="i-mdi-github" href="https://github.com/BeiyanYunyi/totoro-paradise"
          rel="noreferrer noopener" target="_blank"
        />
      </template>
    </VAppBar>
    <VMain>
      <div class="p-4">
        <NuxtPage />
        <!--p class="mt-4 text-xs">
          Powered by totoro-paradise v{{ appConfig.version }}
        </p> -->
      </div>
    </VMain>

    <VDialog v-model="legacyEntryDialog" max-width="520" persistent>
      <VCard title="入口迁移提示">
        <VCardText class="leading-7">
          <div>你当前是从旧入口跳转过来的。</div>
          <div class="mt-2">以后请直接使用下面的新入口访问网站：</div>
          <div class="mt-3 break-all rounded-lg bg-orange-50 px-4 py-3 font-bold text-orange-700">
            {{ legacyEntryUrl }}
          </div>
          <div class="mt-3 text-sm text-gray-600">
            建议收藏这个新地址，后续将以新入口为准。
          </div>
        </VCardText>
        <VCardActions>
          <VSpacer />
          <VBtn variant="text" :href="legacyEntryUrl" target="_blank" rel="noopener">
            打开新入口
          </VBtn>
          <VBtn color="primary" @click="closeLegacyEntryDialog">我知道了</VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </VApp>
</template>
