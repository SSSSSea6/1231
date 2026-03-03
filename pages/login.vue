<script setup lang="ts">
import type { HTTPError } from 'ky';
import type BasicRequest from '~/src/types/requestTypes/BasicRequest';
import TotoroApiWrapper from '~/src/wrappers/TotoroApiWrapper';
import normalizeSession from '~/src/utils/normalizeSession';

const route = useRoute();
const router = useRouter();
const redirect = computed(() => (route.query.redirect as string) || '/scanned');
const { data, refresh, pending } = await useFetch<{ uuid: string; imgUrl: string }>(
  '/api/scanQr',
);
const message = ref('');
const snackbar = ref(false);
const isLoading = ref(false);
const schoolNoticeDialog = ref(false);
const session = useSession();
const NUAA_NAME = '南京航空航天大学';
const NUAA_ALLOWED_CAMPUS_KEYWORDS = ['将军路', '天目湖', '明故宫'];

const shouldShowOtherSchoolNotice = (payload: Record<string, any>) => {
  const schoolName = String(payload?.schoolName ?? '').trim();
  const campusName = String(payload?.campusName ?? '').trim();
  const isNuaaBySchool = schoolName.includes(NUAA_NAME);
  const isNuaaByCampus = NUAA_ALLOWED_CAMPUS_KEYWORDS.some((keyword) => campusName.includes(keyword));
  return !(isNuaaBySchool || isNuaaByCampus);
};

const isKyHttpError = (error: unknown): error is HTTPError =>
  !!error &&
  typeof error === 'object' &&
  'response' in error &&
  typeof (error as Record<string, any>).response?.status === 'number';

const runPostLoginPrefetch = (req: BasicRequest) => {
  const optionalCalls: Array<{ label: string; run: () => Promise<unknown> }> = [
    { label: 'getAppFrontPage', run: () => TotoroApiWrapper.getAppFrontPage(req) },
    { label: 'getAppSlogan', run: () => TotoroApiWrapper.getAppSlogan(req) },
    { label: 'updateAppVersion', run: () => TotoroApiWrapper.updateAppVersion(req) },
    { label: 'getAppNotice', run: () => TotoroApiWrapper.getAppNotice(req) },
  ];

  Promise.allSettled(optionalCalls.map(({ run }) => run()))
    .then((results) => {
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.warn(`[totoro-prefetch] ${optionalCalls[index]!.label} failed`, result.reason);
        }
      });
    })
    .catch((error) => console.error('[totoro-prefetch] unexpected failure', error));
};

const fireAndForgetAppAd = (code: string) => {
  TotoroApiWrapper.getAppAd(code).catch((error) =>
    console.warn('[totoro-login] getAppAd failed', error),
  );
};

const syncPendingMorningTasks = async (userId: string, token: string) => {
  try {
    await $fetch('/api/mornsign/sync-token', {
      method: 'POST',
      body: { userId, token },
    });
  } catch (error) {
    console.warn('[mornsign] sync token failed', error);
  }
};

const handleScanned = async () => {
  if (isLoading.value) return;
  message.value = '';

  const uuid = data.value?.uuid;
  if (!uuid) {
    message.value = '二维码无效，请刷新后重试';
    snackbar.value = true;
    await refresh();
    return;
  }

  isLoading.value = true;
  try {
    const scanRes = await $fetch<{ code: string | null; message: string | null }>(
      `/api/scanQr/${uuid}`,
    );
    if (!scanRes.code) {
      message.value = scanRes.message ?? '扫码失败，请稍后再试';
      snackbar.value = true;
      return;
    }

    const lesseeServer = await TotoroApiWrapper.getLesseeServer(scanRes.code);
    fireAndForgetAppAd(scanRes.code);

    if (!lesseeServer.token) {
      message.value = (lesseeServer.message as string) ?? '登录失败，请重试';
      snackbar.value = true;
      return;
    }

    const personalInfo = await TotoroApiWrapper.login({ token: lesseeServer.token });
    const normalized = normalizeSession({ ...personalInfo, token: lesseeServer.token, code: scanRes.code });
    if (shouldShowOtherSchoolNotice(normalized as Record<string, any>)) {
      session.value = {};
      schoolNoticeDialog.value = true;
      return;
    }
    session.value = normalized as any;
    await syncPendingMorningTasks(personalInfo.stuNumber, lesseeServer.token);

    const breq: BasicRequest = {
      token: lesseeServer.token,
      campusId: personalInfo.campusId,
      schoolId: personalInfo.schoolId,
      stuNumber: personalInfo.stuNumber,
    };

    runPostLoginPrefetch(breq);
    await router.push(redirect.value);
  } catch (error) {
    console.error('[totoro-login] handleScanned failed', error);
    if (isKyHttpError(error)) {
      if (error.response.status === 504) {
        message.value = '龙猫服务器响应超时，请稍后重试';
      } else if (error.response.status === 502) {
        message.value = '龙猫服务器连接失败，请稍后再试';
      } else {
        message.value = '龙猫服务器错误';
      }
    } else {
      message.value = '龙猫服务器错误';
    }
    snackbar.value = true;
  } finally {
    isLoading.value = false;
  }
};

const closeSchoolNotice = () => {
  schoolNoticeDialog.value = false;
};
</script>
<template>
  <div class="flex flex-col items-center gap-4 py-10">
    <h1 class="text-2xl font-bold text-primary">扫码登录 Totoro</h1>
    <p class="text-body-2 text-gray-600">微信扫码后点击“下一步”，等待约 10 秒即可。</p>
    <VCard :height="220" :width="220" class="flex items-center justify-center">
      <img v-if="data?.imgUrl" :src="data.imgUrl" class="w-100" referrerpolicy="no-referrer" />
      <div v-else class="text-center text-body-2 text-gray-500">正在加载二维码...</div>
    </VCard>
    <div class="flex items-center gap-3">
      <VBtn
        color="primary"
        append-icon="i-mdi-arrow-right"
        :loading="isLoading"
        :disabled="isLoading"
        @click="handleScanned"
      >
        下一步
      </VBtn>
      <VBtn variant="text" color="secondary" :loading="pending" @click="refresh">
        刷新二维码
      </VBtn>
    </div>
    <div class="text-caption text-gray-500">
      登录成功后将自动跳转到 {{ redirect }}
    </div>
    <VDialog v-model="schoolNoticeDialog" max-width="520" persistent>
      <VCard title="提示">
        <VCardText class="leading-7">
          <span>同学你好，由于使用人数较多，南航同学使用体验不能保证，外校同学请转向</span>
          <span class="font-bold text-orange-600">nuaaguide.icu</span>
          <span>以继续使用</span>
        </VCardText>
        <VCardActions>
          <VSpacer />
          <VBtn color="primary" @click="closeSchoolNotice">我知道了</VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
    <VSnackbar v-model="snackbar" :timeout="3000">
      {{ message }}
    </VSnackbar>
  </div>
</template>
