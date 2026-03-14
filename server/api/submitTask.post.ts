import { fetchSunRunHistory } from '../utils/sunrunHistory';
import { getSupabaseAdminClient, isSupabaseConfigured } from '../utils/supabaseAdminClient';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const normalizeText = (raw: unknown) => (typeof raw === 'string' ? raw.trim() : '');

const isDateOnly = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const getShanghaiDateStr = () => {
  const now = new Date();
  const offsetMs = (8 * 60 + now.getTimezoneOffset()) * 60 * 1000;
  const shanghaiNow = new Date(now.getTime() + offsetMs);
  const y = shanghaiNow.getFullYear();
  const m = String(shanghaiNow.getMonth() + 1).padStart(2, '0');
  const d = String(shanghaiNow.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const toShanghaiDateStr = (input: string | null | undefined) => {
  if (!input) return '';
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return '';
  const offsetMs = (8 * 60 + date.getTimezoneOffset()) * 60 * 1000;
  const shanghaiDate = new Date(date.getTime() + offsetMs);
  const y = shanghaiDate.getFullYear();
  const m = String(shanghaiDate.getMonth() + 1).padStart(2, '0');
  const d = String(shanghaiDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const resolveTaskTargetDate = (task: { user_data?: Record<string, any> | null; created_at?: string | null }) => {
  const userData = task.user_data || {};
  const targetDate = normalizeText(userData.targetDate);
  if (isDateOnly(targetDate)) return targetDate;

  const customDate = normalizeText(userData.customDate);
  if (isDateOnly(customDate)) return customDate;

  return toShanghaiDateStr(task.created_at ?? null);
};

export default defineEventHandler(async (event) => {
  if (getMethod(event) === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const userData = await readBody(event);
    if (!userData || typeof userData !== 'object') {
      return new Response(JSON.stringify({ success: false, error: '请求体为空或格式错误' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (!isSupabaseConfigured()) {
      return new Response(JSON.stringify({ success: false, error: '缺少 Supabase 环境变量' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const session = (userData as Record<string, any>).session || {};
    const stuNumber = normalizeText(session.stuNumber);
    const token = normalizeText(session.token);
    const schoolId = normalizeText(session.schoolId);
    const campusId = normalizeText(session.campusId);
    if (!stuNumber || !token || !schoolId) {
      return new Response(
        JSON.stringify({ success: false, error: '缺少 session.stuNumber / token / schoolId' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      );
    }

    const customDate = normalizeText((userData as Record<string, any>).customDate);
    const isBackfill = isDateOnly(customDate);
    const targetDate = isBackfill ? customDate : getShanghaiDateStr();
    const taskUserData = {
      ...userData,
      runMode: isBackfill ? 'backfill' : 'normal',
      targetDate,
    };

    const history = await fetchSunRunHistory({
      session: { stuNumber, token, schoolId, campusId },
      startDate: targetDate,
      endDate: targetDate,
    });
    if (!history.success) {
      return new Response(
        JSON.stringify({ success: false, error: `运动记录检查失败: ${history.message}` }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      );
    }
    if (Array.isArray(history.dates) && history.dates.includes(targetDate)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: isBackfill ? `日期 ${targetDate} 已有运动记录` : '今天已有运动记录',
        }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      );
    }

    const supabase = getSupabaseAdminClient();
    const { data: duplicateTasks, error: duplicateError } = await supabase
      .from('Tasks')
      .select('id, user_data, created_at')
      .in('status', ['PENDING', 'PROCESSING', 'SUCCESS'])
      .contains('user_data', { session: { stuNumber } });

    if (duplicateError) {
      return new Response(
        JSON.stringify({ success: false, error: `重复任务检查失败: ${duplicateError.message}` }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      );
    }

    const duplicated = Array.isArray(duplicateTasks)
      && duplicateTasks.some((task) => resolveTaskTargetDate(task as any) === targetDate);
    if (duplicated) {
      return new Response(
        JSON.stringify({
          success: false,
          error: isBackfill ? `日期 ${targetDate} 已存在任务` : '今天已存在任务',
        }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      );
    }

    const { data, error } = await supabase
      .from('Tasks')
      .insert([{ user_data: taskUserData, status: 'PENDING' }])
      .select()
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, status: 'PENDING', taskId: data.id }), {
      status: 202,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: `龙猫服务器错误 (Cloudflare): ${(error as Error).message}` }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
});
