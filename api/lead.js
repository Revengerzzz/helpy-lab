// Серверная функция Vercel: принимает заявку с формы и шлёт её в Telegram.
// Переменные окружения (Vercel → Settings → Environment Variables):
//   TELEGRAM_BOT_TOKEN — токен от @BotFather
//   TELEGRAM_CHAT_ID   — твой chat_id (кому слать заявки)

const clean = (v, max) => String(v ?? '').trim().slice(0, max);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false });
  }

  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chatId } = process.env;
  if (!token || !chatId) {
    console.error('TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID не заданы');
    return res.status(500).json({ ok: false });
  }

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

  // первая строка — то, что видно в уведомлении сразу
  const text = [
    `🔥 Заявка: ${name}, ${contact}`,
    `Бизнес: ${biz}`,
    `Запрос: ${pain || '—'}`,
  ].join('\n');

  try {
    const tg = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    if (!tg.ok) {
      console.error('Telegram ответил ошибкой', tg.status, await tg.text());
      return res.status(502).json({ ok: false });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Не удалось достучаться до Telegram', err);
    return res.status(502).json({ ok: false });
  }
};
