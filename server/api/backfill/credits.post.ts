import { getSupabaseAdminClient, isSupabaseConfigured } from '../../utils/supabaseAdminClient';

const INITIAL_BONUS = 1; // 新用户首次查询自动赠送 1 次
const CREDIT_OP_RETRY_LIMIT = 6;
const CREDIT_TABLE = 'backfill_run_credits';

export default defineEventHandler(async (event) => {
  if (!isSupabaseConfigured()) {
    return { success: false, message: 'Supabase 未配置' };
  }

  const body = await readBody(event);
  const { action, userId, code, count } = body || {};

  if (!userId) {
    return { success: false, message: '缺少 userId' };
  }

  const supabase = getSupabaseAdminClient();

  const readCreditsRow = async () => {
    const { data, error } = await supabase
      .from(CREDIT_TABLE)
      .select('credits')
      .eq('user_id', userId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      return { data: null as { credits: number } | null, error };
    }

    return {
      data: data ? { credits: Number(data.credits ?? 0) } : null,
      error: null,
    };
  };

  const insertCreditsRow = async (credits: number) => {
    const { data, error } = await supabase
      .from(CREDIT_TABLE)
      .insert({
        user_id: userId,
        credits,
        updated_at: new Date().toISOString(),
      })
      .select('credits')
      .maybeSingle();

    if (error && error.code !== '23505') {
      return { data: null as { credits: number } | null, error };
    }

    return {
      data: data ? { credits: Number(data.credits ?? credits) } : null,
      error,
    };
  };

  const updateCreditsRow = async (currentCredits: number, nextCredits: number) => {
    const { data, error } = await supabase
      .from(CREDIT_TABLE)
      .update({
        credits: nextCredits,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('credits', currentCredits)
      .select('credits')
      .maybeSingle();

    if (error) {
      return { data: null as { credits: number } | null, error };
    }

    return {
      data: data ? { credits: Number(data.credits ?? nextCredits) } : null,
      error: null,
    };
  };

  const getOrCreateCredits = async (initialCredits: number) => {
    for (let attempt = 0; attempt < CREDIT_OP_RETRY_LIMIT; attempt += 1) {
      const { data, error } = await readCreditsRow();
      if (error) return { credits: null as number | null, error };
      if (data) return { credits: data.credits, error: null };

      const inserted = await insertCreditsRow(initialCredits);
      if (!inserted.error && inserted.data) {
        return { credits: inserted.data.credits, error: null };
      }
      if (inserted.error?.code === '23505') continue;
      if (inserted.error) return { credits: null as number | null, error: inserted.error };
    }

    return {
      credits: null as number | null,
      error: new Error('补跑次数更新冲突，请稍后重试'),
    };
  };

  const consumeCredits = async (consumeCount: number) => {
    for (let attempt = 0; attempt < CREDIT_OP_RETRY_LIMIT; attempt += 1) {
      let currentCredits: number;
      const current = await readCreditsRow();
      if (current.error) return { credits: null as number | null, error: current.error };

      if (!current.data) {
        const created = await insertCreditsRow(INITIAL_BONUS);
        if (!created.error && created.data) {
          currentCredits = created.data.credits;
        } else if (created.error?.code === '23505') {
          continue;
        } else {
          return {
            credits: null as number | null,
            error: created.error ?? new Error('初始化补跑次数失败'),
          };
        }
      } else {
        currentCredits = current.data.credits;
      }

      if (currentCredits < consumeCount) {
        return { credits: null as number | null, error: null, message: '补跑次数不足' };
      }

      const updated = await updateCreditsRow(currentCredits, currentCredits - consumeCount);
      if (!updated.error && updated.data) {
        return { credits: updated.data.credits, error: null };
      }
    }

    return {
      credits: null as number | null,
      error: new Error('补跑次数更新冲突，请稍后重试'),
    };
  };

  const addCredits = async (creditDelta: number, initialCreditsOnCreate: number) => {
    for (let attempt = 0; attempt < CREDIT_OP_RETRY_LIMIT; attempt += 1) {
      const current = await readCreditsRow();
      if (current.error) return { credits: null as number | null, error: current.error };

      if (!current.data) {
        const created = await insertCreditsRow(initialCreditsOnCreate);
        if (!created.error && created.data) {
          return { credits: created.data.credits, error: null };
        }
        if (created.error?.code === '23505') continue;
        return {
          credits: null as number | null,
          error: created.error ?? new Error('初始化补跑次数失败'),
        };
      }

      const currentCredits = current.data.credits;
      const updated = await updateCreditsRow(currentCredits, currentCredits + creditDelta);
      if (!updated.error && updated.data) {
        return { credits: updated.data.credits, error: null };
      }
    }

    return {
      credits: null as number | null,
      error: new Error('补跑次数更新冲突，请稍后重试'),
    };
  };

  if (action === 'get') {
    const { credits, error } = await getOrCreateCredits(INITIAL_BONUS);
    if (error) {
      return { success: false, message: error.message };
    }
    return { success: true, credits: credits ?? INITIAL_BONUS };
  }

  if (action === 'consume') {
    const amount = Number(count ?? 1);
    if (!Number.isFinite(amount) || amount < 1) {
      return { success: false, message: '扣减次数不合法' };
    }

    const consumed = await consumeCredits(Math.floor(amount));
    if (consumed.message) {
      return { success: false, message: consumed.message };
    }
    if (consumed.error) {
      return { success: false, message: consumed.error.message };
    }
    return { success: true, credits: consumed.credits ?? 0 };
  }

  if (action === 'refund') {
    const amount = Number(count ?? 1);
    if (!Number.isFinite(amount) || amount < 1) {
      return { success: false, message: '返还次数不合法' };
    }

    const refunded = await addCredits(Math.floor(amount), Math.floor(amount));
    if (refunded.error) {
      return { success: false, message: refunded.error.message };
    }
    return { success: true, credits: refunded.credits ?? Math.floor(amount) };
  }

  if (action === 'redeem') {
    if (!code) {
      return { success: false, message: '缺少兑换码' };
    }

    const { data: codeData, error: codeError } = await supabase
      .from('backfill_redeem_codes')
      .select('code, amount, is_used, used_by, used_at')
      .eq('code', code)
      .eq('is_used', false)
      .single();

    if (codeError || !codeData) {
      return { success: false, message: '兑换码无效或已使用' };
    }

    const { error: markError } = await supabase
      .from('backfill_redeem_codes')
      .update({ is_used: true, used_by: userId, used_at: new Date().toISOString() })
      .eq('code', code);

    if (markError) {
      return { success: false, message: '兑换失败，请重试' };
    }

    const amount = Number(codeData.amount ?? 1);
    const redeemed = await addCredits(amount, INITIAL_BONUS + amount);
    if (redeemed.error) {
      return { success: false, message: '兑换失败，请稍后重试' };
    }

    return {
      success: true,
      message: `成功兑换 ${amount} 次`,
      credits: redeemed.credits ?? INITIAL_BONUS + amount,
    };
  }

  return { success: false, message: '未知操作' };
});
