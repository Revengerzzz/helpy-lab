// Серверная функция Vercel: принимает заявку с формы, пишет её в Supabase и шлёт в Telegram.
// Переменные окружения (Vercel → Settings → Environment Variables):
//   TELEGRAM_BOT_TOKEN — токен от @BotFather
//   TELEGRAM_CHAT_ID   — твой chat_id (кому слать заявки)
//   SUPABASE_URL       — адрес проекта, https://<id>.supabase.co
//   SUPABASE_SECRET_KEY — секретный ключ (Project Settings → API Keys), только на сервере

const clean = (v, max) => String(v ?? '').trim().slice(0, max);

// запрос к таблице leads; ключ sb_secret_… идёт только в apikey, старый JWT — ещё и в Authorization
async function supabase(path, method, payload) {
  const { SUPABASE_URL: url, SUPABASE_SECRET_KEY: key } = process.env;
  if (!url || !key) throw new Error('SUPABASE_URL или SUPABASE_SECRET_KEY не заданы');
  const headers = { apikey: key, 'Content-Type': 'application/json', Prefer: 'return=representation' };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  const r = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 150)}`);
  return r.json();
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false });
  }

  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chatId } = process.env;

  let body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  // ловушка для ботов: людям это поле не видно
  if (body.website) return res.status(200).json({ ok: true });

  const name = clean(body.name, 100);
  const contact = clean(body.contact, 100);
  const biz = clean(body.biz, 300);
  const pain = clean(body.pain, 1500);
  if (!name || !contact || !biz) return res.status(400).json({ ok: false });

  // 1. база: если не вышло — запоминаем причину и всё равно шлём в Telegram
  let leadId = null;
  let dbError = null;
  try {
    const [row] = await supabase('leads', 'POST', { name, contact, biz, pain: pain || null });
    leadId = row.id;
  } catch (err) {
    dbError = err.name === 'TimeoutError' ? 'база не ответила за 5 секунд' : err.message;
    console.error('Заявка не записалась в базу', err);
  }

  // первая строка — то, что видно в уведомлении сразу
  const text = [
    `🔥 Заявка: ${name}, ${contact}`,
    `Бизнес: ${biz}`,
    `Запрос: ${pain || '—'}`,
    ...(dbError ? [`⚠️ В базу не записалась: ${dbError}`] : []),
  ].join('\n');

  // 2. Telegram
  let tgSent = false;
  if (!token || !chatId) {
    console.error('TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID не заданы');
  } else {
    try {
      const tg = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      });
      tgSent = tg.ok;
      if (!tg.ok) console.error('Telegram ответил ошибкой', tg.status, await tg.text());
    } catch (err) {
      console.error('Не удалось достучаться до Telegram', err);
    }
  }

  // 3. отметка в базе, что сообщение дошло
  if (leadId && tgSent) {
    try {
      await supabase(`leads?id=eq.${leadId}`, 'PATCH', { telegram_sent: true });
    } catch (err) {
      console.error('Не удалось отметить telegram_sent', err);
    }
  }

  // клиенту — успех, если заявка попала хотя бы в одно место
  if (leadId || tgSent) return res.status(200).json({ ok: true });
  return res.status(502).json({ ok: false });
};
