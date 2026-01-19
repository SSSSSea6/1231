<script setup lang="ts">
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { SunRunRecord } from '~/src/types/responseTypes/SunRunSportResponse';
import { supabase, supabaseReady } from '~/src/services/supabaseClient';
import TotoroApiWrapper from '~/src/wrappers/TotoroApiWrapper';
import normalizeSession from '~/src/utils/normalizeSession';

const sunrunPaper = useSunRunPaper();
const session = useSession();
const route = useRoute();
const hydratedSession = computed(() => normalizeSession(session.value || {}));

const selectValue = ref('');
const customDates = ref<string[]>([]);
const customPeriod = ref<'AM' | 'PM'>('AM');
const showBackfill = ref(false);
const credits = ref(0);
const loadingCredits = ref(false);
const redeemDialog = ref(false);
const redeemCode = ref('');
const submitted = ref(false);
const calendarMonthOffset = ref(0);
const completedDates = ref<string[]>([]);
const runRecords = ref<SunRunRecord[]>([]);
const loadingRecords = ref(false);
const recordMessage = ref('');
const recordDialog = ref(false);
const isSubmitting = ref(false);
const statusMessage = ref('');
const resultLog = ref('');
const taskId = ref<number | null>(null);
const realtimeChannel = ref<RealtimeChannel | null>(null);
const queueCount = ref<number | null>(null);
const estimatedWaitMs = ref<number | null>(null);
const isQueueLoading = ref(false);
const selectedDates = computed(() => Array.from(new Set(customDates.value)).sort());

const supabaseEnabled = computed(() => supabaseReady && Boolean(supabase));
const target = computed(() =>
  sunrunPaper.value?.runPointList?.find((r: any) => r.pointId === selectValue.value),
);
const routeList = computed(() => sunrunPaper.value?.runPointList || []);
const formatDateOnly = (date: Date) => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
const getShanghaiDateStr = () => {
  const now = new Date();
  const offsetMs = (8 * 60 + now.getTimezoneOffset()) * 60 * 1000;
  const shanghaiNow = new Date(now.getTime() + offsetMs);
  return formatDateOnly(shanghaiNow);
};
const customDateMin = computed(() => {
  const start = sunrunPaper.value?.startDate;
  if (!start) return '';
  return formatDateOnly(new Date(`${start}T00:00`));
});
const customDateMax = computed(() => getShanghaiDateStr());
const todayStr = computed(() => getShanghaiDateStr());
const startDateObj = computed(() => {
  const s = sunrunPaper.value?.startDate;
  return s ? new Date(`${s}T00:00:00+08:00`) : null;
});
const endDateObj = computed(() => {
  const e = sunrunPaper.value?.endDate;
  return e ? new Date(`${e}T23:59:59+08:00`) : null;
});
const startMonthFloor = computed(() => {
  if (!startDateObj.value) return null;
  return new Date(startDateObj.value.getFullYear(), startDateObj.value.getMonth(), 1);
});
const endMonthFloor = computed(() => {
  if (!endDateObj.value) return null;
  return new Date(endDateObj.value.getFullYear(), endDateObj.value.getMonth(), 1);
});

const monthToRender = computed(() => {
  const start = startDateObj.value;
  const end = endDateObj.value;
  // 初始月优先用学期开始月，超出学期则回落到可选范围
  let base = start ? new Date(start.getFullYear(), start.getMonth(), 1) : new Date();
  if (end && base > end) base = new Date(end.getFullYear(), end.getMonth(), 1);
  const monthBase = new Date(base);
  monthBase.setMonth(monthBase.getMonth() + calendarMonthOffset.value);
  return monthBase;
});
const monthStart = computed(() => new Date(monthToRender.value));
const prevDisabled = computed(() => {
  if (!startMonthFloor.value) return false;
  const prev = new Date(monthToRender.value);
  prev.setMonth(prev.getMonth() - 1);
  return prev < startMonthFloor.value;
});
const nextDisabled = computed(() => {
  if (!endMonthFloor.value) return false;
  const next = new Date(monthToRender.value);
  next.setMonth(next.getMonth() + 1);
  return next > endMonthFloor.value;
});
const monthLabel = computed(() => {
  const m = monthToRender.value;
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
});

const calendarDays = computed(() => {
  const start = startDateObj.value;
  const end = endDateObj.value;
  if (!start || !end) return [];
  const days: Array<{
    date: Date;
    label: string;
    iso: string;
    disabled: boolean;
    selected: boolean;
    completed: boolean;
  }> = [];
  const monthStart = new Date(monthToRender.value);
  const firstWeekday = monthStart.getDay() || 7;
  // pad previous month days
  for (let i = 1; i < firstWeekday; i += 1) {
    days.push({
      date: new Date(0),
      label: '',
      iso: '',
      disabled: true,
      selected: false,
      completed: false,
    });
  }
  const cursor = new Date(monthStart);
  while (cursor <= end) {
    const iso = formatDateOnly(cursor);
    const completed = completedDates.value.includes(iso);
    const disabled =
      cursor < start ||
      cursor > end ||
      iso >= todayStr.value ||
      completed;
    const selected = selectedDates.value.includes(iso);
    days.push({
      date: new Date(cursor),
      label: String(cursor.getDate()),
      iso,
      disabled,
      selected: selected && !completed,
      completed,
    });
    cursor.setDate(cursor.getDate() + 1);
    if (cursor.getDate() === 1) break; // next month reached
  }
  return days;
});

const displayCampus = computed(
  () =>
    hydratedSession.value?.campusName ||
    (session.value as any)?.campusName ||
    (session.value as any)?.schoolName ||
    '-',
);
const displayCollege = computed(
  () =>
    hydratedSession.value?.collegeName ||
    (session.value as any)?.collegeName ||
    (session.value as any)?.naturalName ||
    '-',
);
const displayStuNumber = computed(
  () => hydratedSession.value?.stuNumber || (session.value as any)?.stuNumber || '-',
);
const displayStuName = computed(
  () => hydratedSession.value?.stuName || (session.value as any)?.stuName || '-',
);

const cleanupRealtime = () => {
  if (supabase && realtimeChannel.value) {
    supabase.removeChannel(realtimeChannel.value);
    realtimeChannel.value = null;
  }
};

const formatWait = (ms: number | null) => {
  if (!ms || ms <= 0) return '未知';
  const totalSec = Math.ceil(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min === 0) return `${sec}秒`;
  return `${min}分${sec}秒`;
};

const refreshQueueEstimate = async () => {
  if (!supabase) return;
  isQueueLoading.value = true;
  try {
    const { count, error } = await supabase
      .from('Tasks')
      .select('id', { head: true, count: 'exact' })
      .eq('status', 'PENDING');
    if (error) throw error;
    queueCount.value = count ?? 0;
    estimatedWaitMs.value = (count ?? 0) * 2.8 * 1000;
  } catch (error) {
    console.warn('[queue-estimate] failed', error);
    queueCount.value = null;
    estimatedWaitMs.value = null;
  } finally {
    isQueueLoading.value = false;
  }
};

const handleStatusUpdate = (task: { status: string; result_log?: string }) => {
  if (!task) return;
  resultLog.value = task.result_log ?? '';
  if (task.status === 'PROCESSING') {
    statusMessage.value = '任务正在执行中，请稍候...';
    return;
  }
  if (task.status === 'SUCCESS') {
    statusMessage.value = '任务执行成功';
    cleanupRealtime();
    return;
  }
  if (task.status === 'FAILED') {
    statusMessage.value = '任务执行失败';
    cleanupRealtime();
  }
};

const subscribeToTaskUpdates = (id: number) => {
  if (!supabase) return;
  cleanupRealtime();
  realtimeChannel.value = supabase
    .channel(`task-updates-${id}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'Tasks', filter: `id=eq.${id}` },
      (payload) => handleStatusUpdate(payload.new as { status: string; result_log?: string }),
    )
    .subscribe();
};

const randomSelect = () => {
  const list = sunrunPaper.value?.runPointList || [];
  if (!list.length) return;
  const idx = Math.floor(Math.random() * list.length);
  selectValue.value = list[idx]!.pointId;
};

const selectDay = (iso: string, disabled: boolean) => {
  if (disabled || !iso) return;
  const next = new Set(customDates.value);
  if (next.has(iso)) {
    next.delete(iso);
  } else {
    next.add(iso);
  }
  customDates.value = Array.from(next).sort();
};

const openRecordDialog = async () => {
  recordDialog.value = true;
  if (!runRecords.value.length && !loadingRecords.value) {
    await loadRunRecords();
  }
};

const formatRecordDateTime = (record: SunRunRecord) => {
  const day = record.day || record.runTime?.split(' ')?.[0] || '';
  if (!day) return record.runTime || '-';
  const time = record.runTime?.includes(' ')
    ? record.runTime.split(' ')[1]
    : record.runTime;
  return time ? `${day} ${time}` : day;
};

const formatRecordStatus = (record: SunRunRecord) => {
  if (record.status === '1') return '合格';
  if (record.status === '0') return '不合格';
  return record.status || '-';
};

const hasTaskOnDate = async (targetDate: string) => {
  if (!supabaseEnabled.value || !supabase) return false;
  if (!session.value?.stuNumber) return false;
  const dayStart = `${targetDate}T00:00:00+08:00`;
  const dayEnd = `${targetDate}T23:59:59.999+08:00`;
  const query = supabase
    .from('Tasks')
    .select('id', { count: 'exact' })
    .in('status', ['PENDING', 'PROCESSING', 'SUCCESS'])
    .contains('user_data', { session: { stuNumber: session.value.stuNumber } })
    .or(
      `user_data->>customDate.eq.${targetDate},and(created_at.gte.${new Date(dayStart).toISOString()},created_at.lte.${new Date(dayEnd).toISOString()})`,
    )
    .limit(1);

  const { data, error } = await query;
  if (error) {
    console.warn('[queue] duplicate check failed', error);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
};

const fetchCredits = async () => {
  if (!session.value?.stuNumber) return;
  loadingCredits.value = true;
  try {
    const res = await $fetch<{ success?: boolean; credits?: number; message?: string }>(
      '/api/backfill/credits',
      {
        method: 'POST',
        body: { action: 'get', userId: session.value.stuNumber },
      },
    );
    if (typeof res.credits === 'number') credits.value = res.credits;
  } catch (error) {
    console.warn('[backfill] fetchCredits failed', error);
  } finally {
    loadingCredits.value = false;
  }
};

const handleRedeem = async () => {
  if (!session.value?.stuNumber) return;
  if (!redeemCode.value.trim()) return;
  loadingCredits.value = true;
  try {
    const res = await $fetch<{ success?: boolean; credits?: number; message?: string }>(
      '/api/backfill/credits',
      {
        method: 'POST',
        body: { action: 'redeem', userId: session.value.stuNumber, code: redeemCode.value.trim() },
      },
    );
    if (res.success && typeof res.credits === 'number') {
      credits.value = res.credits;
      redeemDialog.value = false;
      redeemCode.value = '';
    }
  } catch (error) {
    console.warn('[backfill] redeem failed', error);
  } finally {
    loadingCredits.value = false;
  }
};

const reserveBackfillCredit = async (
  count = 1,
): Promise<{ ok: boolean; message?: string }> => {
  if (!session.value?.stuNumber) {
    return { ok: false, message: '请先登录' };
  }
  try {
    const res = await $fetch<{ success?: boolean; credits?: number; message?: string }>(
      '/api/backfill/credits',
      {
        method: 'POST',
        body: { action: 'consume', userId: session.value.stuNumber, count },
      },
    );
    if (res.success && typeof res.credits === 'number') {
      credits.value = res.credits;
      return { ok: true };
    }
    return { ok: false, message: res.message || '补跑次数不足' };
  } catch (error) {
    console.warn('[backfill] reserve failed', error);
    return { ok: false, message: '补跑次数扣减失败' };
  }
};

const refundReservedCredit = async (count = 1) => {
  if (!session.value?.stuNumber) return;
  try {
    const res = await $fetch<{ success?: boolean; credits?: number; message?: string }>(
      '/api/backfill/credits',
      {
        method: 'POST',
        body: { action: 'refund', userId: session.value.stuNumber, count },
      },
    );
    if (typeof res.credits === 'number') {
      credits.value = res.credits;
    }
  } catch (error) {
    console.warn('[backfill] refund failed', error);
  }
};

const loadRunRecords = async () => {
  const sessionPayload = hydratedSession.value || session.value;
  if (
    !sessionPayload?.token ||
    !sessionPayload?.stuNumber ||
    !sessionPayload?.schoolId ||
    !sunrunPaper.value?.startDate ||
    !sunrunPaper.value?.endDate
  ) {
    return;
  }
  loadingRecords.value = true;
  recordMessage.value = '';
  try {
    const data = await $fetch<{
      dates?: string[];
      records?: SunRunRecord[];
      message?: string;
    }>('/api/run/history', {
      method: 'POST',
      body: {
        session: {
          stuNumber: sessionPayload.stuNumber,
          token: sessionPayload.token,
          schoolId: sessionPayload.schoolId,
          campusId: sessionPayload.campusId,
        },
        startDate: sunrunPaper.value.startDate,
        endDate: sunrunPaper.value.endDate,
      },
    });
    runRecords.value = Array.isArray(data?.records) ? data.records : [];
    const dates = Array.isArray(data?.dates)
      ? data.dates
      : runRecords.value
          .map((record) => record.day || record.runTime?.split(' ')?.[0] || '')
          .filter((day) => day);
    completedDates.value = dates;
    if (customDates.value.length) {
      customDates.value = customDates.value.filter((date) => !completedDates.value.includes(date));
    }
    if (data?.message) recordMessage.value = data.message;
  } catch (error) {
    console.warn('[history] load failed', error);
    runRecords.value = [];
    completedDates.value = [];
    recordMessage.value = '运动记录获取失败';
  } finally {
    loadingRecords.value = false;
  }
};

const buildJobPayload = (targetDate: string | null, reservedCredit = false) => {
  if (!target.value) throw new Error('未选择路线');
  return {
    routeId: target.value.pointId,
    taskId: target.value.taskId,
    mileage: sunrunPaper.value?.mileage,
    minTime: sunrunPaper.value?.minTime,
    maxTime: sunrunPaper.value?.maxTime,
    runPoint: target.value,
    customDate: showBackfill.value ? targetDate : null,
    customPeriod: showBackfill.value ? customPeriod.value || null : null,
    startDate: sunrunPaper.value?.startDate || null,
    session: {
      campusId: session.value.campusId,
      schoolId: session.value.schoolId,
      stuNumber: session.value.stuNumber,
      token: session.value.token,
      phoneNumber: session.value.phoneNumber,
    },
    reservedCredit,
    reservedCreditCount: reservedCredit ? 1 : 0,
    queuedAt: new Date().toISOString(),
  };
};

const submitJobToQueue = async () => {
  if (!supabaseEnabled.value) {
    statusMessage.value = '队列未配置，无法提交';
    return;
  }
  if (!target.value) {
    statusMessage.value = '请先选择路线';
    return;
  }

  isSubmitting.value = true;
  resultLog.value = '';
  taskId.value = null;
  submitted.value = false;
  cleanupRealtime();

  const isBackfill = showBackfill.value;
  const requestedDates = isBackfill ? selectedDates.value : [getShanghaiDateStr()];
  if (isBackfill && requestedDates.length === 0) {
    statusMessage.value = '请选择至少一个日期';
    isSubmitting.value = false;
    return;
  }

  const availableDates: string[] = [];
  const duplicatedDates: string[] = [];
  try {
    for (const date of requestedDates) {
      const duplicated = await hasTaskOnDate(date);
      if (duplicated) duplicatedDates.push(date);
      else availableDates.push(date);
    }
  } catch (dupErr) {
    console.warn('[queue] duplicate check unexpected failure', dupErr);
    statusMessage.value = '重复日期校验失败，请稍后重试';
    isSubmitting.value = false;
    return;
  }

  if (!availableDates.length) {
    statusMessage.value = '所选日期已存在记录或排队任务';
    isSubmitting.value = false;
    return;
  }

  let reservedCredit = false;
  let reserveNeedsRefund = false;

  if (isBackfill && session.value?.stuNumber) {
    const reserveResult = await reserveBackfillCredit(availableDates.length);
    if (!reserveResult.ok) {
      statusMessage.value = reserveResult.message || '补跑次数不足';
      isSubmitting.value = false;
      return;
    }
    reservedCredit = true;
    reserveNeedsRefund = true;
  }

  statusMessage.value = '正在提交到队列...';

  const successTaskIds: number[] = [];
  const failedDates: string[] = [];

  for (const date of availableDates) {
    try {
      const jobPayload = buildJobPayload(date, reservedCredit);
      const response = await fetch('/api/submitTask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(jobPayload),
      });
      const data = await response.json();
      if (response.status === 202 && data.success) {
        successTaskIds.push(data.taskId);
      } else {
        failedDates.push(date);
      }
    } catch (error) {
      resultLog.value = (error as Error).message;
      failedDates.push(date);
    }
  }

  if (reserveNeedsRefund && failedDates.length > 0) {
    await refundReservedCredit(failedDates.length);
  }

  const successCount = successTaskIds.length;
  const failCount = failedDates.length;
  const skippedCount = duplicatedDates.length;

  if (successCount === 1) {
    taskId.value = successTaskIds[0];
    handleStatusUpdate({ status: 'PENDING', result_log: '' });
    subscribeToTaskUpdates(successTaskIds[0]);
  } else {
    cleanupRealtime();
  }

  if (queueCount.value !== null && successCount > 0) {
    queueCount.value = Math.max(0, queueCount.value - successCount);
  }

  let summary = '';
  if (successCount > 0 && failCount > 0) {
    summary = `已提交 ${successCount} 条，${failCount} 条提交失败`;
  } else if (successCount > 1) {
    summary = `已提交 ${successCount} 条任务`;
  } else if (successCount === 0) {
    summary = '提交失败';
  }

  if (skippedCount > 0) {
    summary = summary
      ? `${summary}，已跳过 ${skippedCount} 条已存在记录/队列的日期`
      : `已跳过 ${skippedCount} 条已存在记录/队列的日期`;
  }

  statusMessage.value = summary;

  submitted.value = successCount > 0;
  isSubmitting.value = false;
  if (reservedCredit) {
    await fetchCredits();
  }
};

const init = async () => {
  if (!session.value?.token) {
    statusMessage.value = '请先登录';
    return;
  }
  try {
    const data = await TotoroApiWrapper.getSunRunPaper({
      token: session.value.token,
      campusId: session.value.campusId,
      schoolId: session.value.schoolId,
      stuNumber: session.value.stuNumber,
    });
    sunrunPaper.value = data;
    const fromQuery = typeof route.query.route === 'string' ? route.query.route : '';
    selectValue.value = fromQuery || data?.runPointList?.[0]?.pointId || '';
    await loadRunRecords();
    await fetchCredits();
  } catch (error) {
    statusMessage.value = '获取路线失败';
    resultLog.value = (error as Error).message;
  }
};

await init();

onMounted(() => {
  if (supabaseEnabled.value && supabase) {
    refreshQueueEstimate();
  }
});

onUnmounted(() => {
  cleanupRealtime();
});
</script>

<template>
  <div class="p-4 space-y-4">
    <div>
      <p>请核对个人信息</p>
      <VTable density="compact" class="mb-6 mt-4">
        <tbody>
          <tr>
            <td>学校</td>
            <td>{{ displayCampus }}</td>
          </tr>
          <tr>
            <td>学院</td>
            <td>{{ displayCollege }}</td>
          </tr>
          <tr>
            <td>学号</td>
            <td>{{ displayStuNumber }}</td>
          </tr>
          <tr>
            <td>姓名</td>
            <td>{{ displayStuName }}</td>
          </tr>
        </tbody>
      </VTable>
    </div>

    <div class="space-y-2">
      <div class="text-body-2 text-gray-600">路线</div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <VBtn
          v-for="routeItem in routeList"
          :key="routeItem.pointId"
          block
          color="primary"
          variant="tonal"
          class="justify-start transition-all"
          :class="routeItem.pointId === selectValue ? 'bg-blue-200 text-blue-900' : 'opacity-80'"
          :elevation="routeItem.pointId === selectValue ? 8 : 0"
          @click="selectValue = routeItem.pointId"
        >
          {{ routeItem.pointName }}
        </VBtn>
      </div>
    </div>

    <div class="flex items-center gap-3">
      <VBtn
        variant="tonal"
        class="bg-violet-100 text-violet-700 hover:bg-violet-200"
        @click="openRecordDialog"
      >
        查看记录
      </VBtn>
      <div v-if="runRecords.length" class="text-caption text-gray-500">
        已加载 {{ runRecords.length }} 条
      </div>
    </div>

    <div class="space-y-3">
      <VRadioGroup v-model="showBackfill" hide-details class="space-y-1">
        <VRadio label="立即开跑" :value="false" />
        <VRadio label="选择日期（可多选，仅本学期）" :value="true" />
      </VRadioGroup>
      <div v-if="showBackfill" class="space-y-3">
        <VCard class="p-3 space-y-2" variant="tonal">
          <div class="flex items-center gap-3">
            <div class="font-medium">次数余额：</div>
            <div class="text-2xl font-bold text-green-600">{{ credits }}</div>
            <VBtn size="small" variant="text" :loading="loadingCredits" @click="fetchCredits"
              >刷新</VBtn
            >
            <VBtn size="small" color="primary" @click="redeemDialog = true">添加次数</VBtn>
          </div>
          <div class="text-caption text-orange-700">
            选择补跑后提交将预扣 1 次（任务失败会返还）
          </div>
        </VCard>
        <div class="flex items-center justify-between max-w-2xl">
          <div class="font-medium">选择日期（可多选，仅本学期）</div>
          <div class="space-x-2">
            <VBtn size="small" variant="text" :disabled="prevDisabled" @click="calendarMonthOffset--"
              >上一月</VBtn
            >
            <VBtn size="small" variant="text" :disabled="nextDisabled" @click="calendarMonthOffset++"
              >下一月</VBtn
            >
          </div>
        </div>
        <div class="text-caption text-gray-500 mb-2">
          已选择 {{ selectedDates.length }} 天，将扣除 {{ selectedDates.length }} 次
        </div>
        <div class="text-sm text-gray-600 mb-2">当前月份：{{ monthLabel }}</div>
        <div class="flex items-center gap-4 text-caption text-gray-500 mb-2">
          <div class="flex items-center gap-1">
            <span
              class="inline-block h-3 w-3 rounded bg-emerald-100 border border-emerald-200"
            ></span>
            已跑过
          </div>
          <div class="flex items-center gap-1">
            <span class="inline-block h-3 w-3 rounded bg-gray-200 border border-gray-200"></span>
            不可选
          </div>
        </div>
        <div class="max-w-2xl border rounded-md p-3">
          <div class="grid grid-cols-7 text-center text-caption text-gray-500 mb-2">
            <div>一</div>
            <div>二</div>
            <div>三</div>
            <div>四</div>
            <div>五</div>
            <div>六</div>
            <div>日</div>
          </div>
          <div class="grid grid-cols-7 gap-1">
            <button
              v-for="day in calendarDays"
              :key="day.iso + day.label"
              class="h-10 rounded text-sm border flex items-center justify-center"
              :class="[
                day.completed
                  ? 'bg-emerald-100 text-emerald-700 cursor-not-allowed'
                  : day.disabled
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-white',
                day.completed
                  ? 'border-emerald-200'
                  : day.selected
                    ? 'border-primary text-primary font-semibold'
                    : 'border-gray-200',
              ]"
              :disabled="day.disabled || !day.iso"
              @click="selectDay(day.iso, day.disabled)"
            >
              {{ day.label }}
            </button>
          </div>
        </div>
        <VSelect
          v-model="customPeriod"
          :items="[
            { title: '上午（07:30-11:30）', value: 'AM' },
            { title: '下午（13:30-21:30）', value: 'PM' },
          ]"
          label="时间段"
          variant="outlined"
          density="comfortable"
          class="max-w-80"
        />
      </div>
    </div>

    <VDialog v-model="recordDialog" max-width="860">
      <VCard title="运动记录">
        <VCardText class="space-y-3">
          <div v-if="recordMessage" class="text-caption text-orange-600">
            {{ recordMessage }}
          </div>
          <div class="max-h-80 overflow-auto">
            <VTable density="compact">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>里程</th>
                  <th>用时</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!runRecords.length">
                  <td colspan="4" class="text-center text-gray-500">暂无记录</td>
                </tr>
                <tr v-for="record in runRecords" :key="record.scoreId">
                  <td>
                    <div class="whitespace-nowrap">{{ formatRecordDateTime(record) }}</div>
                    <div class="text-caption text-gray-500">
                      消耗 {{ record.consume || '-' }} 千卡
                    </div>
                  </td>
                  <td class="whitespace-nowrap">{{ record.mileage }} km</td>
                  <td class="whitespace-nowrap">{{ record.usedTime }}</td>
                  <td class="whitespace-nowrap">{{ formatRecordStatus(record) }}</td>
                </tr>
              </tbody>
            </VTable>
          </div>
        </VCardText>
        <VCardActions>
          <VBtn variant="text" :loading="loadingRecords" @click="loadRunRecords">
            刷新记录
          </VBtn>
          <VSpacer />
          <VBtn variant="text" @click="recordDialog = false">关闭</VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <VDialog v-model="redeemDialog" max-width="420">
      <VCard title="充值次数">
        <VCardText>
          <VTextField
            v-model="redeemCode"
            label="兑换码"
            variant="outlined"
          />
          <div class="text-caption text-gray-600 mt-3 mb-2">购买链接：</div>
          <div class="flex flex-wrap gap-2">
            <VBtn
              size="small"
              variant="tonal"
              color="primary"
              href="https://afdian.com/item/2bd8c944c9dc11f09f995254001e7c00"
              target="_blank"
            >
              获取 1 次
            </VBtn>
            <VBtn
              size="small"
              variant="tonal"
              color="primary"
              href="https://afdian.com/item/bc3973fcc9dd11f0b56352540025c377"
              target="_blank"
            >
              获取 5 次
            </VBtn>
            <VBtn
              size="small"
              variant="tonal"
              color="primary"
              href="https://afdian.com/item/1953981ac9de11f0b69652540025c377"
              target="_blank"
            >
              获取 10 次
            </VBtn>
            <VBtn
              size="small"
              variant="tonal"
              color="primary"
              href="https://afdian.com/item/be460538c9de11f0adee52540025c377"
              target="_blank"
            >
              获取 20 次
            </VBtn>
            <VBtn
              size="small"
              variant="tonal"
              color="primary"
              href="https://afdian.com/item/2f87de74c9df11f09c7c5254001e7c00"
              target="_blank"
            >
              获取 30 次
            </VBtn>
          </div>
        </VCardText>
        <VCardActions>
          <VSpacer />
          <VBtn variant="text" @click="redeemDialog = false">取消</VBtn>
          <VBtn color="primary" :loading="loadingCredits" @click="handleRedeem">兑换</VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <VBtn
      v-if="!submitted"
      block
      color="primary"
      size="large"
      :disabled="!target || isSubmitting || (showBackfill && selectedDates.length === 0)"
      :loading="isSubmitting"
      @click="submitJobToQueue"
    >
      提交到队列
    </VBtn>
    <VAlert
      v-else
      type="success"
      variant="tonal"
      class="mt-2"
    >
      任务已提交，可直接离开，稍后查看进度
    </VAlert>

    <VAlert v-if="statusMessage" type="info" variant="tonal" class="mt-2">
      <div>{{ statusMessage }}</div>
      <div v-if="resultLog" class="text-caption mt-1">详情：{{ resultLog }}</div>
    </VAlert>

    <div v-if="sunrunPaper?.runPointList?.length" class="h-50vh w-full md:w-50vw">
      <ClientOnly>
        <AMap :target="selectValue" @update:target="selectValue = $event" />
      </ClientOnly>
    </div>
  </div>
</template>
