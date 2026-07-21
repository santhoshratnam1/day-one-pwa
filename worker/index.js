export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const headers = {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': env.ALLOWED_ORIGIN || origin || '*',
      'access-control-allow-headers': 'content-type',
      'access-control-allow-methods': 'POST, OPTIONS',
      vary: 'Origin'
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method === 'GET') return json({ ok: true, service: 'day-one-check-in', model: env.OPENAI_MODEL || 'gpt-5.6', key: Boolean(env.OPENAI_API_KEY) }, 200, headers);
    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405, headers);
    if (!env.OPENAI_API_KEY) return json({ error: 'OPENAI_API_KEY is not configured' }, 503, headers);

    try {
      const body = await request.json();
      if (body.mode === 'day') {
        const { date, blocks, entries, kept, total } = body;
        if (!date || !Array.isArray(blocks) || !Array.isArray(entries) || !Number.isFinite(Number(kept)) || !Number.isFinite(Number(total))) return json({ error: 'date, blocks, entries, kept, and total are required' }, 400, headers);
        const safeEntries = entries.slice(0, 40).map(entry => ({ date: entry.date, createdAt: entry.createdAt, block: entry.block, answer: entry.answer, note: String(entry.note || '').slice(0, 300) }));
        const prompt = `Return JSON only with a short readable page about ${date}. Write 2 to 4 short past-tense sentences addressed to “you”. Name at least one real block from the supplied list. If a note exists, quote at most one short line. Say plainly which named blocks were missed when any were missed. Do not praise or give advice. Do not use the words journey, amazing, proud, or keep it up. No em dashes. The page should read like a quiet record of what happened, not a chat response. Kept ${kept} of ${total} blocks. Blocks: ${JSON.stringify(blocks)}. Records: ${JSON.stringify(safeEntries)}. Schema: {"summary":"..."}`;
        const response = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${env.OPENAI_API_KEY}` },
          body: JSON.stringify({ model: env.OPENAI_MODEL || 'gpt-5.6', input: prompt })
        });
        if (!response.ok) return json({ error: 'OpenAI request unavailable' }, 502, headers);
        const payload = await response.json();
        const output = payload.output_text || payload.output?.flatMap(item => item.content || []).map(item => item.text || '').join('') || '';
        const parsed = JSON.parse(output);
        if (!parsed.summary || typeof parsed.summary !== 'string') throw new Error('invalid model payload');
        return json({ summary: parsed.summary.trim().slice(0, 720), source: 'gpt-5.6' }, 200, headers);
      }

      const { block, focus, energy, blockers, streak, time } = body;
      if (!block || !focus) return json({ error: 'block and focus are required' }, 400, headers);

      const prompt = `Return JSON only with one short, concrete check-in question for a person completing a ${block} block in a ${focus} day. Energy is ${energy}/5. Recent blocker: ${blockers || 'none named'}. Streak is ${streak}. Time is ${time}. Ask about observable progress. Do not praise, coach, or use em dashes. Schema: {"question":"..."}`;
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${env.OPENAI_API_KEY}` },
        body: JSON.stringify({ model: env.OPENAI_MODEL || 'gpt-5.6', input: prompt })
      });

      if (!response.ok) return json({ error: 'OpenAI request unavailable' }, 502, headers);
      const payload = await response.json();
      const output = payload.output_text || payload.output?.flatMap(item => item.content || []).map(item => item.text || '').join('') || '';
      const parsed = JSON.parse(output);
      if (!parsed.question || typeof parsed.question !== 'string') throw new Error('invalid model payload');

      return json({ question: parsed.question.trim().slice(0, 180), source: 'gpt-5.6' }, 200, headers);
    } catch {
      return json({ error: 'invalid request or model payload' }, 400, headers);
    }
  }
};

function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers });
}
