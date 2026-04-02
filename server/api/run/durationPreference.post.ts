import { getSupabaseAdminClient, isSupabaseConfigured } from '../../utils/supabaseAdminClient';

const PREFERENCE_TABLE = 'sunrun_duration_preferences';

const isMissingPreferenceTable = (message: string) =>
  /sunrun_duration_preferences|relation .* does not exist|table .* does not exist/i.test(message);

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const action = String(body?.action || '').trim();
  const userId = String(body?.userId || '').trim();
  const durationSeconds = Number(body?.preferredDurationSeconds);

  if (!userId) {
    return { success: false, message: '缺少 userId' };
  }

  if (!isSupabaseConfigured()) {
    return { success: false, message: 'Supabase 未配置' };
  }

  const supabase = getSupabaseAdminClient();

  if (action === 'get') {
    const { data, error } = await supabase
      .from(PREFERENCE_TABLE)
      .select('preferred_duration_seconds, updated_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: true, preferredDurationSeconds: null };
      }
      if (isMissingPreferenceTable(error.message || '')) {
        return {
          success: false,
          code: 'MISSING_TABLE',
          message: '缺少 sunrun_duration_preferences 表，请先执行 SQL',
        };
      }
      return { success: false, message: error.message };
    }

    const preferredDurationSeconds = Number(data?.preferred_duration_seconds);
    return {
      success: true,
      preferredDurationSeconds:
        Number.isFinite(preferredDurationSeconds) && preferredDurationSeconds > 0
          ? Math.round(preferredDurationSeconds)
          : null,
      updatedAt: data?.updated_at ?? null,
    };
  }

  if (action === 'set') {
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      return { success: false, message: 'preferredDurationSeconds 不合法' };
    }

    const { error } = await supabase
      .from(PREFERENCE_TABLE)
      .upsert({
        user_id: userId,
        preferred_duration_seconds: Math.round(durationSeconds),
        updated_at: new Date().toISOString(),
      });

    if (error) {
      if (isMissingPreferenceTable(error.message || '')) {
        return {
          success: false,
          code: 'MISSING_TABLE',
          message: '缺少 sunrun_duration_preferences 表，请先执行 SQL',
        };
      }
      return { success: false, message: error.message };
    }

    return {
      success: true,
      preferredDurationSeconds: Math.round(durationSeconds),
    };
  }

  return { success: false, message: '未知操作' };
});
