const KEY = 'dayone.v1';
const API_ENDPOINT = window.DAY_ONE_API_ENDPOINT || '/api/check-in';
const fallbackQuestions = [
  'Did the work move forward?',
  'What is true now that was not true before?',
  'What got in the way, if anything?',
  'Can you name the part you showed up for?'
];
const focusPlans = {
  Job: ['Wake and reset', 'Applications', 'Skill practice', 'Break and walk', 'Follow-ups', 'Admin', 'Close the day'],
  Study: ['Wake and reset', 'Read and review', 'Deep study', 'Break and walk', 'Practice', 'Recall', 'Close the day'],
  Work: ['Wake and reset', 'Plan the day', 'Deep work', 'Break and walk', 'Meetings', 'Finish strong', 'Close the day'],
  Custom: ['Wake and reset', 'First priority', 'Deep work', 'Break and walk', 'Second priority', 'Loose ends', 'Close the day']
};
const defaults = {
  onboarded: false, view: 'onboarding', onbStep: 1, name: '', meal: 'Egg is fine',
  focus: 'Study', wake: '05:40', blocks: [], history: [], journal: [], streak: 0,
  graceUsed: false, lastCountedDate: null, startDate: null, preview: false,
  energy: 3, blockers: '', checkin: null, theme: 'auto', accent: 'iris', sounds: true, focusLabel: '',
  tasks: [], holds: [], memories: [], morningSeenDate: '', closedDate: '', closeNote: '', rescueStartedAt: 0,
  goal: null, goalDraft: null, currencyCode: 'INR'
};
let state = { ...defaults, ...load() };
let timer;
let lastRenderedView = null;
let completingBlock = false;

const launchParams = new URLSearchParams(location.search);
if (launchParams.has('start')) {
  state = { ...state, onboarded: false, view: 'onboarding', onbStep: 1, onbMotion: 'boot' };
  history.replaceState(null, '', location.pathname + location.hash);
}

if (launchParams.has('live') && state.onboarded && state.blocks.length) {
  const liveBlock = state.blocks.find(block => !block.done) || state.blocks.at(-1);
  state = { ...state, view: 'live', activeBlock: liveBlock?.id || state.activeBlock };
  history.replaceState(null, '', location.pathname + location.hash);
}

if (!state.onboarded || !state.blocks.length) {
  state.onboarded = false;
  state.view = 'onboarding';
  state.onbStep = state.onbStep || 1;
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (!saved || typeof saved !== 'object') return {};
    saved.blocks = Array.isArray(saved.blocks) ? saved.blocks : [];
    saved.journal = Array.isArray(saved.journal) ? saved.journal : [];
    saved.tasks = Array.isArray(saved.tasks) ? saved.tasks : [];
    saved.holds = Array.isArray(saved.holds) ? saved.holds : [];
    saved.history = Array.isArray(saved.history) ? saved.history : [];
    return saved;
  } catch { return {}; }
}

function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} }
function esc(value = '') { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
function today() { return new Date().toISOString().slice(0, 10); }
function entryTimestamp(entry) { return entry?.createdAt ? new Date(entry.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''; }
function timeToMinutes(value = '00:00') { const [hours, minutes] = value.split(':').map(Number); return hours * 60 + minutes; }
function formatTime(value) { const hours = Math.floor(value / 60) % 24; return `${String(hours).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`; }
function countdown(value) { let delta = timeToMinutes(value) - (new Date().getHours() * 60 + new Date().getMinutes()); if (delta < 0) delta += 1440; return `${Math.floor(delta / 60)}h ${String(delta % 60).padStart(2, '0')}m`; }
function blockTiming(index) {
  const blocks = state.blocks; const block = blocks[index]; if (!block) return { label: '', time: '', live: false, remaining: 0 };
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
  const start = timeToMinutes(block.time); const end = blocks[index + 1] ? timeToMinutes(blocks[index + 1].time) : 1440;
  const live = !block.done && start <= nowMins && nowMins < end; const held = !block.done && !live && start <= nowMins;
  return {
    label: block.done ? 'Completed block' : live ? `Now · block ${index + 1}` : held ? `Still open · block ${index + 1}` : `Up next · block ${index + 1}`,
    time: block.done ? 'done' : live ? `${end - nowMins}m left` : held ? 'held' : countdown(block.time),
    live, remaining: Math.max(0, end - nowMins),
  };
}
function currentIndex() {
  if (!state.blocks.length) return 0;
  const now = new Date().getHours() * 60 + new Date().getMinutes();
  const active = state.blocks.map((block, index) => ({ block, index })).filter(item => !item.block.done && timeToMinutes(item.block.time) <= now);
  if (active.length) return active.at(-1).index;
  const next = state.blocks.findIndex(block => !block.done);
  return next < 0 ? state.blocks.length - 1 : next;
}
function focusDisplayLabel() { return state.focusLabel || ({ Work: 'Building projects', Job: 'Job hunt', Custom: 'Getting fit' }[state.focus] || state.focus || 'Study'); }
function focusPlanKey() { return ({ 'Building projects': 'Work', 'Job hunt': 'Job', Study: 'Study', 'Getting fit': 'Custom' }[focusDisplayLabel()] || state.focus || 'Study'); }
function generateBlocks() {
  const names = focusPlans[focusPlanKey()] || focusPlans.Custom;
  const offsets = [0, 50, 150, 270, 330, 450, 660];
  const moves = ['Put both feet on the floor.', 'Open the document and write one line.', 'Set a 25-minute timer.', 'Fill a glass of water.', 'Choose the smallest next action.', 'Send one clear message.', 'Put the day down gently.'];
  return names.map((name, index) => ({ id: `b${index}`, name, time: formatTime(timeToMinutes(state.wake) + offsets[index]), done: false, firstMove: moves[index] }));
}
function icon(name) {
  const paths = {
    flame: '<path d="M12 3c1.7 2.3 3.5 4.1 3.5 7.2A3.5 3.5 0 0 1 12 13.7a3.5 3.5 0 0 1-3.5-3.5c0-1.8 1-3.2 2.1-4.6.3 1.6 1.1 2.5 1.9 3.1.7-1.8.6-3.3-.5-5.7Z"/><path d="M8.7 14.5A4.1 4.1 0 0 0 12 21a4.1 4.1 0 0 0 3.3-6.5"/>',
    shield: '<path d="M12 3 19 6v5.2c0 4.4-2.8 7.2-7 9.8-4.2-2.6-7-5.4-7-9.8V6l7-3Z"/><path d="m9 12 2 2 4-4"/>',
    moon: '<path d="M20.5 15.3A8.5 8.5 0 0 1 8.7 3.5 8.5 8.5 0 1 0 20.5 15.3Z"/>',
    gear: '<circle cx="12" cy="12" r="3.8"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9 7 7m10 10 2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>',
    calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>',
    arrow: '<path d="M5 12h13M13 7l5 5-5 5"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    note: '<path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/>',
    dish: '<path d="M5 3v8M8 3v8M5 7h3M6.5 11v10M17 3v18c-2-2.2-2.4-5.5-.3-7.1"/>',
    run: '<circle cx="15.5" cy="5.5" r="2"/><path d="m13 8-2 4 3 2 2 7M11 12l-4 3M14 14l4-2"/>',
    pen: '<path d="m15 5 4 4-9.5 9.5L5 19l.5-4.5L15 5Z"/><path d="m13 7 4 4"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.arrow}</svg>`;
}
function greeting() { const hour = new Date().getHours(); const time = hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening'; return `${time}${state.name ? `, ${esc(state.name)}` : ''}.`; }
function dayNumber() { return Math.max(1, (state.streak || 0) + 1); }
function adaptiveCopy() { if (state.energy <= 2) return 'A softer shape today. Keep the next block small.'; if (state.blockers) return `Holding ${esc(state.blockers)} lightly. The plan can bend.`; return 'A fixed day, with enough room to be human.'; }
function weekDays() {
  const base = new Date(); const monday = new Date(base); monday.setDate(base.getDate() - ((base.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday); date.setDate(monday.getDate() + index); const key = date.toISOString().slice(0, 10);
    return { key, label: date.toLocaleDateString([], { weekday: 'short' }).slice(0, 2), num: date.getDate(), today: key === today(), won: state.history.some(item => item.date === key && item.won) || key === state.lastCountedDate };
  });
}

function journalDay(offset = 0) {
  const value = new Date();
  value.setDate(value.getDate() - offset);
  return value.toISOString().slice(0, 10);
}
function journalOffset(date) {
  const start = new Date(`${today()}T00:00:00`);
  const target = new Date(`${date}T00:00:00`);
  return Math.min(90, Math.max(0, Math.round((start - target) / 86400000)));
}
function selectedJournalDate() { return journalDay(journalOffset(state.journalDate || today())); }
function setJournalDate(date) { state.journalDate = journalDay(journalOffset(date)); save(); render(); }
function dayDots(blocks = state.blocks, activeIndex = currentIndex()) {
  return `<div class="day-dots" aria-label="Day progress">${blocks.map((block, index) => `<i class="${block.done ? 'done' : ''} ${index === activeIndex && !block.done ? 'current' : ''}" aria-hidden="true"></i>`).join('')}</div>`;
}

// Goal Pot is intentionally a replayed ledger. There is no persisted running balance to edit.
const GOAL_COMPLETION_RATE = .70;
const GOAL_PACES = {
  sprint: { label: 'Sprint', factor: .6, note: 'A little sooner' },
  steady: { label: 'Steady', factor: 1, note: 'The usual pace' },
  gentle: { label: 'Gentle', factor: 1.6, note: 'More breathing room' }
};
function currencyCode() {
  const candidate = String(state.currencyCode || state.goal?.currencyCode || 'INR').toUpperCase();
  try { new Intl.NumberFormat(undefined, { style: 'currency', currency: candidate }); return candidate; } catch { return 'INR'; }
}
function money(value, code = currencyCode()) {
  const amount = Number(value) || 0;
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: code, maximumFractionDigits: amount && Math.abs(amount) < 1 ? 2 : 0 }).format(amount); }
  catch { return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(amount); }
}
function goalIsActive(goal = state.goal) { return Boolean(goal && String(goal.name || '').trim() && Number(goal.price) > 0); }
function goalDefaultDays(price) {
  const value = Number(price) || 0;
  if (value < 1500) return 7;
  if (value < 8000) return 30;
  if (value < 25000) return 90;
  if (value < 60000) return 180;
  return 365;
}
function goalDays(price, pace = 'steady') {
  const factor = GOAL_PACES[pace]?.factor || 1;
  return Math.min(365, Math.max(7, Math.round(goalDefaultDays(price) * factor / 7) * 7));
}
function roundedPerBlock(value) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value < 1) return Math.round(value * 100) / 100;
  if (value < 100) return Math.round(value);
  return Math.round(value / 5) * 5;
}
function addCalendarDays(date, days) {
  const result = new Date(`${date}T12:00:00`);
  result.setDate(result.getDate() + Math.max(0, Math.ceil(days)));
  return result;
}
function goalPlan(goal = state.goal, blocksPerDay = Math.max(1, state.blocks.length || 7)) {
  const price = Math.max(0, Number(goal?.price) || 0);
  const pace = GOAL_PACES[goal?.pace] ? goal.pace : 'steady';
  const targetDays = goalDays(price, pace);
  const rawPerBlock = price / Math.max(1, targetDays * blocksPerDay * GOAL_COMPLETION_RATE);
  const perBlock = roundedPerBlock(rawPerBlock);
  const honestDays = perBlock > 0 ? price / (perBlock * blocksPerDay * GOAL_COMPLETION_RATE) : 0;
  const start = goal?.startedAt ? String(goal.startedAt).slice(0, 10) : today();
  return {
    price, pace, targetDays, blocksPerDay, perBlock, honestDays,
    projectedDate: addCalendarDays(start, honestDays),
    capped: targetDays >= 365 && goalDefaultDays(price) * (GOAL_PACES[pace]?.factor || 1) > 365
  };
}
function streakMultiplierFor(days = 0) {
  const count = Math.max(0, Number(days) || 0);
  if (count >= 28) return 1.25;
  if (count >= 14) return 1.12;
  if (count >= 7) return 1.05;
  return 1;
}
function nextMultiplierCopy(days = state.streak || 0) {
  const count = Math.max(0, Number(days) || 0);
  if (count < 7) return `${7 - count} kept day${7 - count === 1 ? '' : 's'} to 1.05x`;
  if (count < 14) return `${14 - count} kept day${14 - count === 1 ? '' : 's'} to 1.12x`;
  if (count < 28) return `${28 - count} kept day${28 - count === 1 ? '' : 's'} to 1.25x`;
  return 'The steady maximum is here.';
}
function historyDay(date = today(), create = false) {
  let record = state.history.find(item => item?.date === date);
  if (!record && create) { record = { date, won: false, goalEvents: [], transfers: [] }; state.history.push(record); }
  if (record) {
    record.goalEvents = Array.isArray(record.goalEvents) ? record.goalEvents : [];
    record.transfers = Array.isArray(record.transfers) ? record.transfers : [];
  }
  return record;
}
function potFromHistory(history = state.history, goal = state.goal, activeStreak = state.streak) {
  if (!goalIsActive(goal)) return { total: 0, todayEarned: 0, streakMultiplier: 1, projectedDate: null, remaining: 0, perBlock: 0, transferred: 0, transferPending: 0, ledger: [] };
  const currentPlan = goalPlan(goal);
  const days = new Map();
  (Array.isArray(history) ? history : []).forEach(record => {
    if (!record?.date) return;
    const row = days.get(record.date) || { date: record.date, events: [], transfers: [] };
    row.events.push(...(Array.isArray(record.goalEvents) ? record.goalEvents : []));
    row.transfers.push(...(Array.isArray(record.transfers) ? record.transfers : []));
    days.set(record.date, row);
  });
  let total = 0;
  let transferred = 0;
  const ledger = [...days.values()].sort((a, b) => String(b.date).localeCompare(String(a.date))).map(row => {
    const events = row.events.filter(event => event && event.blockId);
    const base = events.reduce((sum, event) => sum + (Number(event.perBlock) || 0) * (event.window === 'late' ? .5 : 1) * Math.min(1.25, Math.max(1, Number(event.multiplier) || 1)), 0);
    const blocksPerDay = Math.max(1, ...events.map(event => Number(event.blocksPerDay) || currentPlan.blocksPerDay));
    const capRate = Math.max(0, ...events.map(event => Number(event.perBlock) || 0), currentPlan.perBlock);
    const bonus = events.length / blocksPerDay >= GOAL_COMPLETION_RATE ? base * .25 : 0;
    const earned = Math.min(base + bonus, blocksPerDay * capRate * 1.25);
    const moved = row.transfers.reduce((sum, transfer) => sum + Math.max(0, Number(transfer?.amount) || 0), 0);
    total += earned;
    transferred += moved;
    return { date: row.date, earned, base, bonus, events: events.length, transferred: moved };
  });
  const remaining = Math.max(0, currentPlan.price - total);
  const futureDays = currentPlan.perBlock > 0 ? remaining / (currentPlan.perBlock * currentPlan.blocksPerDay * GOAL_COMPLETION_RATE) : 0;
  return {
    total, todayEarned: ledger.find(row => row.date === today())?.earned || 0,
    streakMultiplier: streakMultiplierFor(activeStreak), projectedDate: addCalendarDays(today(), futureDays),
    remaining, perBlock: currentPlan.perBlock, transferred: Math.min(transferred, total),
    transferPending: Math.max(0, total - transferred), ledger
  };
}
function computePot() { return potFromHistory(state.history, state.goal, state.streak); }
function recentGoalWeek() {
  const cutoff = new Date(`${today()}T12:00:00`); cutoff.setDate(cutoff.getDate() - 6);
  return computePot().ledger.filter(row => new Date(`${row.date}T12:00:00`) >= cutoff).reduce((sum, row) => sum + row.earned, 0);
}
function recordGoalEarning(blockId, live) {
  if (!goalIsActive() || !blockId) return 0;
  const record = historyDay(today(), true);
  if (record.goalEvents.some(event => event.blockId === blockId)) return 0;
  const before = computePot().total;
  const plan = goalPlan();
  record.goalEvents.push({
    blockId, window: live ? 'live' : 'late', perBlock: plan.perBlock,
    blocksPerDay: plan.blocksPerDay, multiplier: streakMultiplierFor(Math.max(1, (state.streak || 0) + 1)), at: new Date().toISOString()
  });
  return Math.max(0, computePot().total - before);
}
function formatGoalDate(date) { return date ? date.toLocaleDateString([], { day: 'numeric', month: 'short' }) : ''; }
function goalPreview(goal) {
  if (!goalIsActive(goal)) return { perBlock: 0, date: null, text: 'Add a name and price to see the honest pace.' };
  const plan = goalPlan(goal);
  return { perBlock: plan.perBlock, date: plan.projectedDate, text: `Each block moves you ${money(plan.perBlock)}. At your usual pace, ${formatGoalDate(plan.projectedDate)}.` };
}
function runGoalPotSelfCheck() {
  const assert = (condition, message) => { if (!condition) throw new Error(`Goal Pot check failed: ${message}`); };
  const goal = { name: 'PlayStation 5', price: 54990, pace: 'steady', currencyCode: 'INR', startedAt: today() };
  const plan = goalPlan(goal, 7);
  assert(plan.perBlock === 62, 'steady 54,990 / 7 blocks should round to 62');
  assert(Math.abs(plan.honestDays - 181.01) < .1, 'honest horizon should use the rounded value');
  const live = { date: today(), goalEvents: [{ blockId: 'a', window: 'live', perBlock: 62, blocksPerDay: 7, multiplier: 1 }] };
  const late = { date: today(), goalEvents: [{ blockId: 'b', window: 'late', perBlock: 62, blocksPerDay: 7, multiplier: 1 }] };
  assert(potFromHistory([live], goal, 0).total === 62, 'live completion earns v');
  assert(potFromHistory([late], goal, 0).total === 31, 'late completion earns half v');
  const five = { date: today(), goalEvents: Array.from({ length: 5 }, (_, index) => ({ blockId: `f${index}`, window: 'live', perBlock: 62, blocksPerDay: 7, multiplier: 1 })) };
  const four = { date: today(), goalEvents: Array.from({ length: 4 }, (_, index) => ({ blockId: `q${index}`, window: 'live', perBlock: 62, blocksPerDay: 7, multiplier: 1 })) };
  assert(potFromHistory([five], goal, 0).total === 387.5, 'five of seven grants the day bonus');
  assert(potFromHistory([four], goal, 0).total === 248, 'four of seven does not grant the day bonus');
  const capped = { date: today(), goalEvents: Array.from({ length: 7 }, (_, index) => ({ blockId: `c${index}`, window: 'live', perBlock: 62, blocksPerDay: 7, multiplier: 1.25 })) };
  assert(potFromHistory([capped], goal, 28).total === 7 * 62 * 1.25, 'daily cap keeps a full day below its ceiling');
  assert(streakMultiplierFor(400) === 1.25, 'multiplier cap');
  const keptTotal = potFromHistory([five], goal, 28).total;
  assert(streakMultiplierFor(0) === 1 && potFromHistory([five], goal, 0).total === keptTotal, 'a broken streak leaves past money intact');
  assert(potFromHistory([{ ...five, pot: 999999 }], goal, 0).total === keptTotal, 'stored pot field is ignored');
  return { ok: true, perBlock: plan.perBlock, honestDays: plan.honestDays, cap: streakMultiplierFor(400) };
}
window.dayOneGoalPotSelfCheck = runGoalPotSelfCheck;

function onbDots() { return `<div class="onb-dots">${[1, 2, 3, 4, 5].map(step => `<span class="onb-dot ${step === (state.onbStep || 1) ? 'active' : ''}"></span>`).join('')}</div>`; }
function onbHead() { return `<div class="onb-head"><div class="onb-wordmark">DAY ONE</div>${onbDots()}</div>`; }
function onbPills(key, values) { return values.map(value => { const selected = key === 'wake' ? String(state[key]).replace(/^0/, '') === value : key === 'focus' ? focusDisplayLabel() === value : state[key] === value; return `<button class="q-pill ${selected ? 'selected' : ''}" data-onb-choice="${key}" data-value="${esc(value)}">${esc(value)}</button>`; }).join(''); }
function onbSchedule() { if (!state.blocks.length) state.blocks = generateBlocks(); return state.blocks.map((block, index) => `<div class="onb-row rise d${Math.min(5, index + 1)}"><span class="hue" style="background:hsl(${24 + index * 34} 65% 65%)"></span><time>${block.time}</time><span>${esc(block.name)}</span></div>`).join(''); }
function onboardingGoalDraft() {
  const draft = state.goalDraft || state.goal || {};
  return { name: String(draft.name || ''), price: Math.max(0, Number(draft.price) || 0), pace: GOAL_PACES[draft.pace] ? draft.pace : 'steady', currencyCode: currencyCode(), startedAt: today() };
}
function goalPaceCards(draft = onboardingGoalDraft()) {
  return Object.entries(GOAL_PACES).map(([pace, details]) => {
    const plan = goalPlan({ ...draft, pace });
    const active = draft.pace === pace;
    return `<button class="goal-pace-card ${active ? 'selected' : ''}" data-goal-pace="${pace}" aria-pressed="${active}"><span>${details.label}</span><strong>${draft.price ? formatGoalDate(plan.projectedDate) : 'Choose a price'}</strong><small>${details.note}</small></button>`;
  }).join('');
}
function goalOnboardingPreview(draft = onboardingGoalDraft()) {
  const preview = goalPreview(draft);
  return `<p class="goal-preview ${goalIsActive(draft) ? 'ready' : ''}" data-goal-preview>${esc(preview.text)}</p>`;
}
function onboardingView() {
  const step = state.onbStep || 1; const head = onbHead();
  if (step === 1) return `<div class="onb-view v-onb1">${head}<div class="onb-content"><div class="onb-eyebrow rise d1">A personal reset</div><h1 class="onb-title rise d2">Try this for one week.<br><em>You'll forget all the cheap distraction.</em></h1><p class="onb-sub rise d3">A fixed day, block by block. You don't plan anything each morning. You just show up.</p></div><div class="onb-actions rise d4"><button class="pill-btn" data-onb-next="2">Let's set it up →</button></div></div>`;
  if (step === 2) return `<div class="onb-view v-onb2">${head}<div class="onb-content"><h1 class="onb-title small rise d1">Shape it around <em>your life.</em></h1><p class="onb-sub rise d2">Three questions. The whole day, meals included, gets built from your answers.</p><div class="q-group rise d3"><label class="q-label">When do you get up?</label><div class="q-pills">${onbPills('wake', ['5:00', '5:40', '6:30', '7:30'])}</div></div><div class="q-group rise d4"><label class="q-label">What's the main thing right now?</label><div class="q-pills">${onbPills('focus', ['Building projects', 'Job hunt', 'Study', 'Getting fit'])}</div></div><div class="q-group rise d5"><label class="q-label">What do you eat?</label><div class="q-pills">${onbPills('meal', ['Vegetarian', 'Egg is fine', 'Non-veg', 'Vegan'])}</div></div></div><div class="onb-actions"><button class="pill-btn" data-onb-next="3">Build my day →</button></div></div>`;
  if (step === 3) return `<div class="onb-view v-onb3">${head}<div class="onb-content"><h1 class="onb-title small rise d1">Here's your day.</h1><p class="onb-sub rise d2">Up at ${esc(state.wake)}, built around ${esc(focusDisplayLabel().toLowerCase())}.</p><div class="onb-sched">${onbSchedule()}</div></div><div class="onb-actions"><button class="pill-btn" data-onb-next="4">Use this plan →</button><button class="pill-btn ghost" data-onb-next="2">Let me adjust the blocks</button></div></div>`;
  return `<div class="onb-view v-onb4">${head}<div class="onb-content"><h1 class="onb-title small rise d1">One last thing.</h1><input class="name-input rise d2" id="onb-name" maxlength="18" placeholder="Your name" value="${esc(state.name)}"><div class="notif-card rise d3"><div class="bell-tile">◇</div><div><strong>Each block calls you.</strong><span>Turn on notifications so the schedule speaks first.</span></div><button class="try-call" data-notif>Turn on notifications</button></div></div><div class="onb-actions"><button class="pill-btn rise d4" data-finish="today">Start Day 1 now →</button><button class="onb-inline rise d5" data-finish="tomorrow">Or begin tomorrow morning</button></div></div>`;
}

function onboardingViewV3() {
  const step = state.onbStep || 1;
  const head = onbHead();
  if (step === 1) return `<div class="onb-view v-onb1">${head}<div class="onb-content"><div class="onb-eyebrow rise d1">A personal reset</div><h1 class="onb-title rise d2">Try this for one week.<br><em>You'll forget all the cheap distraction.</em></h1><p class="onb-sub rise d3">A fixed day, block by block. You do not plan each morning. You just show up.</p></div><div class="onb-actions rise d4"><button class="pill-btn" data-onb-next="2">Let's set it up &rarr;</button></div></div>`;
  if (step === 2) return `<div class="onb-view v-onb2">${head}<div class="onb-content"><h1 class="onb-title small rise d1">Shape it around <em>your life.</em></h1><p class="onb-sub rise d2">Three questions. The whole day, meals included, gets built from your answers.</p><div class="q-group rise d3"><label class="q-label">When do you get up?</label><div class="q-pills">${onbPills('wake', ['5:00', '5:40', '6:30', '7:30'])}</div></div><div class="q-group rise d4"><label class="q-label">What's the main thing right now?</label><div class="q-pills">${onbPills('focus', ['Building projects', 'Job hunt', 'Study', 'Getting fit'])}</div></div><div class="q-group rise d5"><label class="q-label">What do you eat?</label><div class="q-pills">${onbPills('meal', ['Vegetarian', 'Egg is fine', 'Non-veg', 'Vegan'])}</div></div></div><div class="onb-actions"><button class="pill-btn" data-onb-next="3">Build my day &rarr;</button></div></div>`;
  if (step === 3) return `<div class="onb-view v-onb3">${head}<div class="onb-content"><h1 class="onb-title small rise d1">Here's your day.</h1><p class="onb-sub rise d2">Up at ${esc(state.wake)}, built around ${esc(focusDisplayLabel().toLowerCase())}.</p><div class="onb-sched">${onbSchedule()}</div></div><div class="onb-actions"><button class="pill-btn" data-onb-next="4">Use this plan &rarr;</button><button class="pill-btn ghost" data-onb-next="2">Let me adjust the blocks</button></div></div>`;
  if (step === 4) {
    const draft = onboardingGoalDraft();
    return `<div class="onb-view v-onb4 goal-onboarding">${head}<div class="onb-content"><div class="onb-eyebrow rise d1">A real thing, made possible</div><h1 class="onb-title small rise d2">What are you working toward?</h1><p class="onb-sub rise d3">A small amount follows each completed block. You make the actual transfer when you are ready.</p><div class="goal-fields rise d3"><input class="goal-input" id="onb-goal-name" maxlength="42" placeholder="A lens, new shoes, a book" value="${esc(draft.name)}"><input class="goal-input goal-price-input" id="onb-goal-price" type="number" min="1" step="1" inputmode="decimal" placeholder="Price" value="${draft.price || ''}"></div><div class="goal-presets rise d4">${[['PlayStation 5', 54990], ['A lens', 18000], ['New shoes', 6500], ['A book', 900]].map(([name, price]) => `<button data-goal-preset="${esc(name)}" data-goal-price="${price}">${esc(name)}</button>`).join('')}</div><div class="goal-pace-label rise d4">CHOOSE THE PACE</div><div class="goal-pace-options rise d4" data-goal-pace-options>${goalPaceCards(draft)}</div>${goalOnboardingPreview(draft)}</div><div class="onb-actions rise d5"><button class="pill-btn" data-goal-next>Keep this in view &rarr;</button><button class="onb-inline" data-goal-skip>Skip for now</button></div></div>`;
  }
  return `<div class="onb-view v-onb5">${head}<div class="onb-content"><h1 class="onb-title small rise d1">One last thing.</h1><input class="name-input rise d2" id="onb-name" maxlength="18" placeholder="Your name" value="${esc(state.name)}"><div class="notif-card rise d3"><div class="bell-tile">&#9671;</div><div><strong>Each block calls you.</strong><span>Turn on notifications so the schedule speaks first.</span></div><button class="try-call" data-notif>Turn on notifications</button></div></div><div class="onb-actions"><button class="pill-btn rise d4" data-finish="today">Start Day 1 now &rarr;</button><button class="onb-inline rise d5" data-finish="tomorrow">Or begin tomorrow morning</button></div></div>`;
}

function goalDateValue(date) { return date instanceof Date ? new Date(date) : new Date(`${String(date).slice(0, 10)}T12:00:00`); }
function goalDateKey(date) { return goalDateValue(date).toISOString().slice(0, 10); }
function goalDayDifference(from, to) { return Math.max(0, Math.round((goalDateValue(to) - goalDateValue(from)) / 86400000)); }
function goalChartModel(pot = computePot(), plan = goalPlan(), goal = state.goal, asOfDate = today()) {
  const start = goal?.startedAt ? goalDateKey(goal.startedAt) : today();
  const asOf = goalDateKey(asOfDate);
  const earnedByDate = new Map(pot.ledger.map(row => [row.date, row.earned]));
  const actualDays = goalDayDifference(start, asOf) + 1;
  let running = 0;
  const actual = Array.from({ length: actualDays }, (_, index) => {
    const date = addCalendarDays(start, index); const key = goalDateKey(date); running += earnedByDate.get(key) || 0;
    return { date: key, total: running, earned: earnedByDate.get(key) || 0 };
  });
  const plannedDaily = plan.perBlock * plan.blocksPerDay * GOAL_COMPLETION_RATE;
  const observedDaily = actual.length > 1 && pot.total > 0 ? pot.total / actual.length : plannedDaily;
  const projectionDays = Math.max(0, Math.ceil(Math.max(0, plan.price - pot.total) / Math.max(1, observedDaily)));
  const projectedDate = addCalendarDays(asOf, projectionDays);
  return { start, asOf, actual, projectionDays, projectedDate, price: plan.price, total: pot.total, todayEarned: pot.todayEarned, reached: pot.total >= plan.price && plan.price > 0 };
}

function goalChartDiagnostics() {
  const goal = { name: 'PlayStation 5', price: 54990, pace: 'steady', currencyCode: 'INR', startedAt: goalDateKey(addCalendarDays(today(), -2)) };
  const plan = goalPlan(goal, 7); const event = index => ({ blockId: `chart-${index}`, window: 'live', perBlock: plan.perBlock, blocksPerDay: 7, multiplier: 1 });
  const start = goal.startedAt; const keptDate = goalDateKey(addCalendarDays(start, 1)); const missedDate = today();
  const keptHistory = [{ date: start, goalEvents: Array.from({ length: 7 }, (_, index) => event(index)), transfers: [] }, { date: keptDate, goalEvents: Array.from({ length: 7 }, (_, index) => event(index + 7)), transfers: [] }];
  const beforePot = potFromHistory(keptHistory, goal, 0); const beforeModel = goalChartModel(beforePot, plan, goal, keptDate);
  const missedPot = potFromHistory([...keptHistory, { date: missedDate, goalEvents: [], transfers: [] }], goal, 0); const missedModel = goalChartModel(missedPot, plan, goal, missedDate);
  const dayOnePot = potFromHistory([], goal, 0); const dayOneModel = goalChartModel(dayOnePot, plan, goal, start);
  return { endpoint: formatGoalDate(beforeModel.projectedDate), axisEndpoint: formatGoalDate(beforeModel.projectedDate), dayOne: { actualPoints: dayOneModel.actual.length, projection: formatGoalDate(dayOneModel.projectedDate) }, missed: { before: beforePot.total, after: missedPot.total, beforeArrival: formatGoalDate(beforeModel.projectedDate), afterArrival: formatGoalDate(missedModel.projectedDate), flat: missedModel.actual.at(-1).total === missedModel.actual.at(-2).total } };
}
window.dayOneGoalChartDiagnostics = goalChartDiagnostics;
function goalPath(points) { return points.map((point, index) => `${index ? 'L' : 'M'}${point[0].toFixed(1)} ${point[1].toFixed(1)}`).join(' '); }
function goalChartSvg(model, { width, height, compact = false, id = 'goal-main' }) {
  const pad = compact ? { top: 4, right: 3, bottom: 3, left: 3 } : { top: 28, right: 3, bottom: 15, left: 3 };
  const x0 = pad.left; const x1 = width - pad.right; const y0 = height - pad.bottom; const y1 = pad.top;
  const span = Math.max(1, model.actual.length - 1 + model.projectionDays);
  const x = index => x0 + (x1 - x0) * Math.min(1, index / span);
  const y = value => y0 - (y0 - y1) * Math.min(1, Math.max(0, value / Math.max(1, model.price)));
  const actualPoints = model.actual.map((row, index) => [x(index), y(row.total)]);
  const last = actualPoints.at(-1) || [x0, y0]; const projectionEnd = [x(span), y(model.price)];
  const actualPath = actualPoints.length > 1 && (!compact || model.actual.length >= 3) ? goalPath(actualPoints) : '';
  const area = actualPath && model.total > 0 ? `${actualPath} L${last[0].toFixed(1)} ${y0} L${actualPoints[0][0].toFixed(1)} ${y0} Z` : '';
  const marker = !compact && model.actual.length > 1 ? `<g class="goal-chart-marker"><circle cx="${last[0]}" cy="${last[1]}" r="4.5"/><g transform="translate(${Math.max(x0, Math.min(x1 - 58, last[0] - 29))},${Math.max(2, last[1] - 34)})"><rect width="58" height="22" rx="10"/><path d="M25 22 L29 27 L33 22 Z"/><text x="29" y="15" text-anchor="middle">${esc(money(model.total))}</text></g></g>` : '';
  const target = compact ? '' : `<line class="goal-chart-target" x1="${x0}" y1="${y(model.price)}" x2="${x1}" y2="${y(model.price)}"/><text class="goal-chart-target-label" x="${x0}" y="${y(model.price) - 8}">${esc(`${money(model.price)} · ${state.goal?.name || ''}`.toUpperCase())}</text>`;
  const reached = model.reached && !compact ? `<circle class="goal-chart-reached" cx="${last[0]}" cy="${last[1]}" r="7"/>` : '';
  return `<svg class="goal-chart ${compact ? 'goal-chart-spark' : 'goal-chart-main'}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${compact ? 'Recent goal savings trend' : 'Goal savings growth and projected arrival'}"><defs><linearGradient id="goal-fill-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#b9aef2" stop-opacity=".40"/><stop offset="55%" stop-color="#b9aef2" stop-opacity=".16"/><stop offset="100%" stop-color="#b9aef2" stop-opacity="0"/></linearGradient></defs>${target}<line class="goal-chart-baseline" x1="${x0}" y1="${y0}" x2="${x1}" y2="${y0}"/>${area ? `<path class="goal-chart-area" d="${area}" fill="url(#goal-fill-${id})"/>` : ''}${actualPath ? `<path class="goal-chart-actual" pathLength="1" d="${actualPath}"/>` : ''}<path class="goal-chart-projection" d="M${last[0].toFixed(1)} ${last[1].toFixed(1)} L${projectionEnd[0].toFixed(1)} ${projectionEnd[1].toFixed(1)}"/>${marker}${reached}</svg>`;
}
function goalAxis(model) {
  const midpoint = addCalendarDays(today(), Math.round(model.projectionDays / 2));
  return `<div class="goal-chart-axis"><span>${formatGoalDate(goalDateValue(model.start))}</span><span>today</span><span>${formatGoalDate(midpoint)}</span><span>${formatGoalDate(model.projectedDate)}</span></div>`;
}
function goalDeltaPill(amount, label = 'today') { return `<span class="goal-delta-pill">+${money(amount)} ${label}<svg width="14" height="11" viewBox="0 0 14 11" fill="none" aria-hidden="true"><path d="M1 9.5 5 5l2.6 2.2 4.8-5.4M9.2 1.6h3.6V5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`; }
function goalStripView() {
  if (!goalIsActive()) return '';
  const pot = computePot(); const model = goalChartModel(pot, goalPlan());
  return `<button class="goal-strip" data-nav="goal" aria-label="Open your goal pot"><span class="goal-strip-copy"><small>WORKING TOWARD</small><strong>${esc(state.goal.name)}</strong><em>${money(pot.total)} of ${money(model.price)} &middot; ${formatGoalDate(model.projectedDate)}</em></span>${goalChartSvg(model, { width: 96, height: 40, compact: true, id: 'strip' })}<span class="goal-strip-arrow">&rsaquo;</span></button>`;
}

function goalView() {
  const pot = computePot(); const plan = goalPlan(); const model = goalChartModel(pot, plan); const ledger = pot.ledger.slice(0, 10);
  const transferLabel = pot.transferPending > 0 ? `I've set aside ${money(pot.transferPending)}` : 'Everything recorded is set aside';
  const planCopy = model.actual.length < 2 ? `The plan, so far. On this pace, ${formatGoalDate(model.projectedDate)}.` : `of ${money(plan.price)} · on this pace, ${formatGoalDate(model.projectedDate)}`;
  return `<main class="goal-page"><div class="goal-orb goal-orb-a"></div><div class="goal-orb goal-orb-b"></div><header class="goal-top"><span>DAY ONE</span><button class="icon-btn" data-nav="today" aria-label="Back to today">&times;</button></header><div class="goal-content"><div class="goal-kicker">WORKING TOWARD</div><h1>${esc(state.goal?.name || 'A quiet goal')}</h1><strong class="goal-pot-number">${money(pot.total)}</strong>${goalDeltaPill(pot.todayEarned)}<p class="goal-arrival">${planCopy}</p><section class="goal-chart-wrap">${goalChartSvg(model, { width: 350, height: 196, id: 'main' })}${goalAxis(model)}</section><div class="goal-chart-legend"><span><i></i>kept</span><span><i></i>if you keep this pace</span></div><section class="goal-compact-stats"><div><span>THIS WEEK</span><strong>${money(recentGoalWeek())}</strong></div><div><span>STREAK RATE</span><strong>${pot.streakMultiplier.toFixed(2)}x</strong><small>${nextMultiplierCopy()}</small></div></section><section class="goal-transfer"><div><span>ACTUALLY SET ASIDE</span><strong>${money(pot.transferred)}</strong><small>${pot.transferPending > 0 ? `${money(pot.transferPending)} is ready for your own transfer.` : 'Your ledger and your real set-aside amount agree.'}</small></div><button class="goal-transfer-btn ${pot.transferPending > 0 ? '' : 'done'}" data-goal-transfer ${pot.transferPending > 0 ? '' : 'disabled'}>${transferLabel}</button></section><section class="goal-ledger"><div class="goal-ledger-head"><span>THE LEDGER</span><small>Completed blocks only</small></div>${ledger.length ? ledger.map(row => `<div class="goal-ledger-row"><div><strong>${new Date(`${row.date}T12:00:00`).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}</strong><span>${row.events} block${row.events === 1 ? '' : 's'}${row.bonus ? ' &middot; day bonus' : ''}</span></div><em>+${money(row.earned)}</em></div>`).join('') : `<p class="goal-ledger-empty">The first completed block will make the first honest line here.</p>`}</section>${plan.capped ? `<p class="goal-year-note">This pace reaches a year. A smaller first goal may feel more useful.</p>` : ''}</div></main>`;
}

function todayView() {
  const blocks = state.blocks; const total = blocks.length || 7; const done = blocks.filter(block => block.done).length; const index = Math.max(0, currentIndex());
  const openTasks = state.tasks.filter(task => !task.done).length; const upcoming = blocks.filter((item, itemIndex) => itemIndex > index && !item.done).slice(0, 3);
  const block = blocks[index] || { id: 'b0', name: 'Wake and reset', time: state.wake, firstMove: 'Put both feet on the floor.' };
  const won = total > 0 && done / total >= .7;
  // ponytail: hero card used to label every block "Up next" and count down to tomorrow.
  const hero = blockTiming(index); const heroLabel = hero.label; const heroTime = hero.time;
  const opening = state.morningSeenDate === today()
    ? `<button class="opening-strip settled" data-morning-open><span>THE DAY IS OPEN</span><strong>${esc(state.intention || 'One useful thing at a time.')}</strong><i>›</i></button>`
    : '<button class="opening-strip" data-morning-open><span>OPEN THE DAY</span><strong>Choose one clear line before the noise.</strong><i>›</i></button>';
  const memory = `<button class="memory-strip" data-nav="letter"><span>THE BOOK REMEMBERS</span><strong>${esc(memoryLine())}</strong><i>›</i></button>`;
  return `<main class="today-page"><div class="today-orb orb-a"></div><div class="today-orb orb-b"></div><header class="today-top"><div class="today-brand">DAY ONE</div><div class="today-tools"><button class="streak-pill" data-streak><span class="icon flame">${icon('flame')}</span><strong>DAY ${dayNumber()}</strong><span class="save-shield">${icon('shield')}<small>${state.graceUsed ? 0 : 1}</small></span></button><button class="icon-btn" data-calm>${icon('moon')}</button><button class="icon-btn" data-nav="settings">${icon('gear')}</button></div></header><div class="today-content">${opening}<div class="today-date">${new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</div><h1 class="today-greeting">${greeting()}</h1><section class="today-hero"><div><strong class="done-number">${done}</strong><span class="done-total">/ ${total}</span><p>blocks done today</p></div><button class="icon-btn calendar-btn" data-schedule>${icon('calendar')}</button></section><section class="week-row">${weekDays().map(day => `<div class="week-day ${day.today ? 'current' : ''} ${day.won ? 'won' : ''}"><span>${day.label}</span><i>${day.won ? icon('check') : day.num}</i></div>`).join('')}</section>${won ? `<div class="day-won"><span>${icon('check')}</span><span>${state.name ? `${esc(state.name)}, you kept the shape.` : 'You kept the shape of the day.'}</span></div>` : ''}<button class="block-card" data-open-block="${block.id}"><span class="block-orb" style="--hue:${(index * 38 + 24) % 360}"></span><span class="block-card-copy"><small>${heroLabel}</small><strong>${esc(block.name)}</strong><span>${esc(block.firstMove)}</span></span><span class="block-time">${block.time}<em>${heroTime}</em></span></button><p class="adaptive-note">${adaptiveCopy()}</p><section class="journey-section"><div class="section-label"><span>THE DAY</span><strong>${done} of ${total}</strong></div><div class="journey-chips">${blocks.map((item, itemIndex) => `<button class="journey-chip ${item.done ? 'done' : ''} ${itemIndex === index && !item.done ? 'now' : ''}" data-open-block="${item.id}"><i style="--hue:${(itemIndex * 38 + 24) % 360}"></i></button>`).join('')}</div></section><section class="ribbon-section"><div class="section-label"><span>YOUR SHAPE</span><button class="text-action" data-schedule>View schedule ${icon('arrow')}</button></div><div class="day-ribbon">${blocks.map((item, itemIndex) => `<button class="ribbon-row ${item.done ? 'done' : ''} ${itemIndex === index && !item.done ? 'now' : ''}" data-open-block="${item.id}"><time>${item.time}</time><span class="ribbon-line"></span><strong>${esc(item.name)}</strong><em>${item.done ? 'done' : itemIndex === index ? (hero.live ? 'now' : 'next') : itemIndex < index ? 'held' : 'ahead'}</em></button>`).join('')}</div></section><section class="mini-grid"><button class="mini-stat" data-nav="tasks">${icon('note')}<strong>${openTasks}</strong><span>tasks open</span></button><div class="mini-stat">${icon('dish')}<strong>${esc(state.meal)}</strong><span>today's dish</span></div><button class="mini-stat" data-nav="journal">${icon('pen')}<strong>${state.journal.length}</strong><span>notes</span></button></section>${memory}${upcoming.length ? `<section class="upcoming"><div class="section-label"><span>COMING UP</span><strong>${upcoming.length} ${upcoming.length === 1 ? 'block' : 'blocks'}</strong></div>${upcoming.map(item => `<button class="up-row" data-open-block="${item.id}"><span class="up-dot"></span><time>${item.time}</time><strong>${esc(item.name)}</strong>${icon('arrow')}</button>`).join('')}</section>` : ''}<button class="close-day-strip" data-close-day><span>CLOSE THE DAY</span><strong>Leave one line, then let it go.</strong><i>›</i></button></div></main>`;
}


function tasksView() {
  const loose = state.tasks.filter(task => !task.blockId);
  const groups = state.blocks.map((block, index) => ({ block, index, tasks: state.tasks.filter(task => task.blockId === block.id) })).filter(group => group.tasks.length);
  const sorted = tasks => [...tasks].sort((a, b) => Number(a.done) - Number(b.done));
  const taskRows = (tasks, hue, unassigned = false) => sorted(tasks).map(task => `<div class="task-swipe" data-task-swipe><button class="task-delete-reveal" aria-label="Remove ${esc(task.text)}" data-delete-task="${task.id}">Remove</button><div class="task-row ${task.done ? 'done' : ''}" data-task-swipe-row><button class="task-check" style="--task-hue:${hue}" aria-label="${task.done ? 'Mark incomplete' : 'Mark complete'}: ${esc(task.text)}" data-toggle-task="${task.id}"><span>✓</span></button><span class="task-copy">${esc(task.text)}</span>${unassigned ? `<button class="task-assign" data-open-task-assign="${task.id}">Assign</button>` : ''}</div></div>`).join('');
  const open = state.tasks.filter(task => !task.done).length;
  const pickerTask = state.tasks.find(task => task.id === state.taskAssignId);
  const picker = pickerTask ? `<div class="task-assign-sheet" role="dialog" aria-label="Assign task to a block"><div><span>GIVE IT A BLOCK</span><strong>${esc(pickerTask.text)}</strong></div><button class="task-sheet-close" aria-label="Close assignment" data-close-task-assign>×</button><div class="task-block-options">${state.blocks.map((block, index) => `<button data-assign-task="${pickerTask.id}" data-block-id="${block.id}"><i style="--task-hue:${(index * 38 + 24) % 360}"></i><span>${esc(block.name)}</span><small>${block.time}</small></button>`).join('')}</div></div>` : '';
  const groupCards = groups.map(({ block, index, tasks }) => {
    const done = tasks.filter(task => task.done).length;
    const hue = (index * 38 + 24) % 360;
    return `<section class="task-group task-card" style="--task-hue:${hue}"><div class="task-group-head"><div><i></i><time>${block.time}</time><strong>${esc(block.name)}</strong></div><small>${done} of ${tasks.length}</small></div><div class="task-list">${taskRows(tasks, hue)}</div></section>`;
  }).join('');
  const unassigned = loose.length ? `<section class="task-group task-card task-card-unassigned"><div class="task-group-head"><div><i></i><strong>Unassigned</strong></div><small>${loose.length} open</small></div><p>Give each loose end a place to land.</p><div class="task-list">${taskRows(loose, 32, true)}</div></section>` : '';
  const body = state.tasks.length ? `${groupCards}${unassigned}` : `<div class="tasks-empty"><strong>Give the day one thing to hold.</strong><span>Add a small task, then let a block carry it.</span></div>`;
  return `<main class="tasks-page"><div class="tasks-blob"></div><header class="tasks-top"><div class="today-brand">DAY ONE</div><button class="icon-btn" aria-label="Back to today" data-nav="today">×</button></header><div class="tasks-content"><div class="task-kicker">THE DAY, IN PIECES</div><div class="tasks-hero"><h1 class="pg-title">Tasks.</h1><span>${open} open today</span></div><p class="tasks-sub">Give each one a block. The block does the rest.</p><div class="task-add"><input id="task-new" placeholder="Add a task" maxlength="80"><button aria-label="Add task" data-add-task>+</button></div><div class="task-groups">${body}</div><div class="task-secondary-actions"><button data-split-tasks>Split the rest into blocks</button><button data-send-calendar>Send the day to my calendar</button></div></div>${picker}</main>`;
}

function liveView() {
  const block = state.blocks.find(item => item.id === state.activeBlock) || state.blocks[currentIndex()] || {};
  const index = Math.max(0, state.blocks.findIndex(item => item.id === block.id));
  const percent = block.done ? 100 : Math.min(94, Math.max(8, (index + 1) * 13));
  const circumference = 691;
  const minutes = block.done ? 0 : blockTiming(index).remaining;
  return `<main class="live-page" style="--live-hue:${(index * 38 + 24) % 360}"><div class="live-blob live-a"></div><div class="live-blob live-b"></div><div class="vignette"></div><header class="live-top"><div><span>${esc(block.name || 'CURRENT BLOCK')}</span><strong>${esc(block.time || '')}</strong></div><button data-nav="today">×</button></header><div class="live-center"><div class="live-ring"><svg viewBox="0 0 252 252"><circle class="ring-track" cx="126" cy="126" r="110"></circle><circle class="ring-fill" cx="126" cy="126" r="110" style="stroke-dasharray:${circumference};stroke-dashoffset:${circumference - circumference * percent / 100}"></circle></svg><div class="live-minutes"><strong data-live-minutes>${minutes}</strong><span>minutes left</span></div></div><div class="live-lines"><p>${esc(block.firstMove || 'Meet the next small thing.')}</p><p>No catching up. Just this block.</p></div><section class="lt-card"><div class="live-card-label">THE PLAN FOR THIS BLOCK</div><label class="live-task"><input type="checkbox" data-live-plan="${esc(block.id || '')}" ${block.planDone ? 'checked' : ''}><span>Start with the first move</span></label></section><section class="fm-card"><span>FIRST MOVE. JUST START</span><strong>${esc(block.firstMove || 'Choose the smallest next action.')}</strong><button data-shuffle-move>another ↻</button></section>${index === 0 ? `<section class="meal-card"><div class="live-card-label">TODAY'S BREAKFAST · ALREADY DECIDED</div><h3>${esc(state.meal)}</h3><p>Toast, eggs, and one warm thing. Enough to begin.</p><div class="meal-facts"><span>8 min</span><span>22g protein</span><span>3 things in the pan</span></div></section>` : ''}</div><div class="live-bottom"><button class="live-done" data-live-done>${block.done ? 'Write the journal' : 'Mark done ✓'}</button><button class="live-back" data-nav="today">← today</button></div></main>`;
}

function liveViewWithGoalCredit() {
  const flash = state.goalEarnedFlash;
  const credit = flash?.blockId === state.activeBlock && flash.amount > 0
    ? `<span class="goal-earn-float" aria-live="polite">+${money(flash.amount)}</span>` : '';
  return liveView().replace('<div class="live-bottom">', `${credit}<div class="live-bottom">`);
}

function checkinView() {
  const answered = Boolean(state.checkinAnswered);
  const source = state.checkin?.source === 'gpt-5.6' ? 'GPT-5.6' : 'OFFLINE';
  return `<main class="checkin-page"><div class="ci-wash"></div><div class="ci-blob"></div><header class="ci-top"><span>DAY ONE</span><button data-nav="today">×</button></header><div class="ci-content"><div class="ci-tag">CHECK-IN · ${source}</div><h1 class="ci-q">${esc(state.checkin?.question || fallbackQuestions[0])}</h1><div class="ci-answers">${['Yes', 'Partly', 'Not today'].map(answer => `<button class="${state.checkinAnswer === answer ? 'selected' : ''}" data-ci-answer="${answer}">${answer}</button>`).join('')}</div>${answered ? `<section class="ci-follow"><div>WHAT GOT IN THE WAY?</div><div class="ci-chips">${['Time moved', 'Low energy', 'A person needed me', 'I lost the thread'].map(blocker => `<button class="${state.checkinBlocker === blocker ? 'selected' : ''}" data-ci-blocker="${blocker}">${blocker}</button>`).join('')}</div></section><section class="proof-block"><div class="proof-head"><span>PROOF · private</span><strong>${state.proof || state.proofSkipped ? state.proof ? 'Saved' : 'Skipped' : 'Photo first'}</strong></div><button class="proof-camera" data-proof-open>${state.proof ? 'Proof saved' : 'Snap the proof'}</button><button class="proof-skip" data-proof-skip>can't photograph this one, skip it</button></section><textarea class="ci-input" id="ci-note" placeholder="add a note (optional)">${esc(state.checkinNote || '')}</textarea>` : ''}</div><div class="ci-bottom"><button class="ci-log ${answered && (state.proof || state.proofSkipped) ? '' : 'off'}" data-ci-log>Log it →</button></div></main>`;
}

function celebrateView() { return `<main class="celebrate-page"><div class="celebrate-blob"></div><div class="celebrate-content"><div class="cel-t">${state.dayWon ? 'Kept the promise.' : 'Done.'}</div><p class="cel-s">${state.dayWon ? 'The shape held. That is worth keeping.' : 'One block met, one promise kept small.'}</p><button class="cel-hint" data-celebrate-next>tap to continue</button></div></main>`; }
function streakCardView() { const count = state.streak || 0; return `<main class="streak-card-page tier-${count >= 21 ? 't3' : count >= 14 ? 't2' : 'base'}"><div class="sc-bg"></div><div class="sc-wm">DAY ONE</div><section class="sc-card"><div class="sc-date">${new Date().toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}</div><h1>${count >= 21 ? 'The rhythm is yours.' : count >= 14 ? 'Two weeks, kept gently.' : 'You came back.'}</h1><div class="medal"><div class="medal-orbit"></div><strong>${count}</strong><span>DAYS</span></div><div class="sc-stat"><strong>${count}</strong><span>day streak</span></div><p>Consistency is not a perfect line. It is the choice to return.</p><div class="sc-row"><span>Best day this week</span><strong>${Math.max(1, Math.min(7, count % 8 || 1))} blocks</strong></div><div class="sc-actions"><button data-share-card>Share</button><button data-nav="today">Keep going</button></div></section></main>`; }
function schedulePageView() { return `<main class="schedule-page"><div class="schedule-blob"></div><header class="page-top"><span>DAY ONE</span><button data-nav="today">×</button></header><div class="page-content"><h1 class="pg-title">The schedule.</h1><p>Tap a block to change it. The day always stays full.</p><div class="sc-list">${state.blocks.map((block, index) => `<div class="sc-edit-row"><i style="--hue:${index * 38 + 24}"></i><input data-sc-time="${block.id}" type="time" value="${block.time}"><input data-sc-name="${block.id}" value="${esc(block.name)}"><button data-sc-save="${block.id}">Save</button></div>`).join('')}</div><button class="add-btn" data-add-block>Add a block</button></div></main>`; }
function statsPageView() {
  const total = state.blocks.length || 7;
  const done = state.blocks.filter(block => block.done).length;
  const score = Math.round(done / total * 100);
  const blockers = state.journal.flatMap(entry => String(entry.blockers || '').split(',').map(value => value.trim()).filter(Boolean));
  const counts = blockers.reduce((all, blocker) => ({ ...all, [blocker]: (all[blocker] || 0) + 1 }), {});
  const blockerRows = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const potLine = goalIsActive() ? `${money(recentGoalWeek())} moved into the ledger for ${state.goal.name} this week.` : '';
  const story = [done ? `${done} block${done === 1 ? '' : 's'} found a place today.` : 'There is still room to begin with one small block.', state.journal.length ? `${state.journal.length} kept line${state.journal.length === 1 ? '' : 's'} make the week easier to remember.` : 'The book is ready for the first honest line.', state.energy <= 2 ? 'A softer pace is part of the plan.' : 'The next useful thing is enough for now.', potLine].filter(Boolean);
  return `<main class="stats-page"><div class="stats-blob"></div><header class="page-top"><span>DAY ONE</span></header><div class="page-content"><div class="task-kicker">THE WEEK, IN WORDS</div><h1 class="pg-title">This week.</h1><section class="score-card"><div class="score-ring" style="--score:${score}"><strong>${score}</strong><span>TODAY</span></div><div><h2>${score >= 70 ? 'The shape held.' : 'There is still a door open.'}</h2><p>Small completions count when they make the next one easier.</p></div></section><section class="week-story"><strong>What the week says</strong><p>${story.map(line => `<span>${esc(line)}</span>`).join('')}</p></section><div class="split-stats"><div><strong>${state.streak}</strong><span>Days kept<br>without pressure</span></div><div><strong>${done}</strong><span>Deep work<br>protected today</span></div><div><strong>${state.journal.length}</strong><span>Notes<br>kept this week</span></div></div><div class="task-kicker">WHAT GOT IN THE WAY</div><div class="kill-list">${blockerRows.length ? blockerRows.map(([name, count]) => `<div><span>${esc(name)}</span><i style="width:${Math.max(16, Math.round(count / blockers.length * 100))}%"></i></div>`).join('') : '<p class="stats-empty">No blockers logged this week.</p>'}</div><section class="tip-card"><span>TOMORROW</span><strong>Leave one clear door open before bed.</strong></section><button class="weekly-letter-link" data-nav="letter"><span>WEEKLY LETTER</span><strong>Read what the week is trying to tell you.</strong><i>›</i></button><div class="heatmap"><div class="task-kicker">TWELVE WEEKS</div><div>${Array.from({ length: 84 }, (_, index) => `<i class="heat-${index % 5}"></i>`).join('')}</div><small>less&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;more</small></div></div></main>`;
}
function settingsPageView() {
  const permission = 'Notification' in window ? Notification.permission : 'unsupported';
  const notificationsOn = permission === 'granted' && state.notificationsEnabled !== false;
  const alarmsOn = state.backgroundAlarms === true;
  const soundsOn = state.sounds !== false;
  const toggle = (on, label, data) => `<button class="ios-toggle ${on ? 'on' : ''}" type="button" role="switch" aria-label="${label}" aria-checked="${on}" ${data}><i></i></button>`;
  return `<main class="settings-page"><div class="settings-blob"></div><header class="page-top"><span>DAY ONE</span><button aria-label="Back to today" data-nav="today">×</button></header><div class="page-content"><h1 class="pg-title">Settings.</h1><section class="settings-section"><h2>REMINDERS</h2><div class="set-group"><div class="set-row"><span><b>Notifications</b><small>Calls when a block begins</small></span>${toggle(notificationsOn, 'Notifications', 'data-settings-notifications')}</div><div class="set-row"><span><b>Test the call</b><small>Make sure the voice arrives</small></span><button class="row-action" data-settings-test>Ring it</button></div><div class="set-row"><span><b>Background alarms</b><small>Keep time when the app is away</small></span>${toggle(alarmsOn, 'Background alarms', 'data-settings-alarm')}</div></div></section><section class="settings-section"><h2>YOUR DATA</h2><div class="set-group"><div class="set-row"><span><b>Backup</b><small>Export stays local and private</small></span><button class="row-action" data-export>Export</button></div><div class="set-row"><span><b>Calendar</b><small>Copy the shape of today</small></span><button class="row-action" data-calendar>Send</button></div></div></section><section class="settings-section"><h2>APPEARANCE</h2><div class="set-group"><div class="set-row"><span><b>Theme</b><small>How DAY ONE feels at night</small></span><div class="seg">${['auto', 'light', 'dark'].map(theme => `<button class="${state.theme === theme ? 'selected' : ''}" data-theme="${theme}">${theme[0].toUpperCase() + theme.slice(1)}</button>`).join('')}</div></div><div class="set-row"><span><b>Accent</b><small>One color for the day</small></span><div class="swatches">${['iris', 'ember', 'forest', 'ocean', 'honey'].map(accent => `<button class="swatch ${state.accent === accent ? 'selected' : ''}" data-accent="${accent}" aria-label="${accent} accent"></button>`).join('')}</div></div><div class="set-row"><span><b>Sounds</b><small>Small arpeggios at the edge</small></span>${toggle(soundsOn, 'Sounds', 'data-sounds')}</div><div class="set-row"><span><b>Live block style</b><small>Choose the amount of presence</small></span><div class="style-seg"><button class="${state.liveStyle !== 'subtle' ? 'selected' : ''}" data-live-style="bold">Bold</button><button class="${state.liveStyle === 'subtle' ? 'selected' : ''}" data-live-style="subtle">Subtle</button></div></div></div></section><section class="settings-section"><h2>ABOUT</h2><div class="set-group"><div class="set-row"><span><b>Load demo</b><small>Seed fourteen days of history</small></span><button class="row-action" data-load-demo>Load</button></div><div class="set-row"><span><b>Change name / plan</b><small>${esc(state.name || 'Your profile')}</small></span><button class="row-action" data-nav="onboarding">Change</button></div></div></section><button class="settings-footer" data-backend-check>Service connection</button></div></main>`;
}

function settingsPageViewV3() {
  const permission = 'Notification' in window ? Notification.permission : 'unsupported';
  const notificationsOn = permission === 'granted' && state.notificationsEnabled !== false;
  const alarmsOn = state.backgroundAlarms === true;
  const soundsOn = state.sounds !== false;
  const toggle = (on, label, data) => `<button class="ios-toggle ${on ? 'on' : ''}" type="button" role="switch" aria-label="${label}" aria-checked="${on}" ${data}><i></i></button>`;
  return `<main class="settings-page"><div class="settings-blob"></div><header class="page-top"><span>DAY ONE</span><button aria-label="Back to today" data-nav="today">&times;</button></header><div class="page-content"><h1 class="pg-title">Settings.</h1><section class="settings-section"><h2>REMINDERS</h2><div class="set-group"><div class="set-row"><span><b>Notifications</b><small>Calls when a block begins</small></span>${toggle(notificationsOn, 'Notifications', 'data-settings-notifications')}</div><div class="set-row"><span><b>Test the call</b><small>Make sure the voice arrives</small></span><button class="row-action" data-settings-test>Ring it</button></div><div class="set-row"><span><b>Background alarms</b><small>Keep time when the app is away</small></span>${toggle(alarmsOn, 'Background alarms', 'data-settings-alarm')}</div></div></section><section class="settings-section"><h2>YOUR DATA</h2><div class="set-group"><div class="set-row"><span><b>Backup</b><small>Export stays local and private</small></span><button class="row-action" data-export>Export</button></div><div class="set-row"><span><b>Calendar</b><small>Copy the shape of today</small></span><button class="row-action" data-calendar>Send</button></div><div class="set-row currency-row"><span><b>Currency</b><small>Formats your Goal Pot ledger</small></span><div><input id="goal-currency" maxlength="3" inputmode="text" value="${esc(currencyCode())}" aria-label="Currency code"><button class="row-action" data-save-currency>Save</button></div></div></div></section><section class="settings-section"><h2>APPEARANCE</h2><div class="set-group"><div class="set-row"><span><b>Theme</b><small>How DAY ONE feels at night</small></span><div class="seg">${['auto', 'light', 'dark'].map(theme => `<button class="${state.theme === theme ? 'selected' : ''}" data-theme="${theme}">${theme[0].toUpperCase() + theme.slice(1)}</button>`).join('')}</div></div><div class="set-row"><span><b>Accent</b><small>One color for the day</small></span><div class="swatches">${['iris', 'ember', 'forest', 'ocean', 'honey'].map(accent => `<button class="swatch ${state.accent === accent ? 'selected' : ''}" data-accent="${accent}" aria-label="${accent} accent"></button>`).join('')}</div></div><div class="set-row"><span><b>Sounds</b><small>Small arpeggios at the edge</small></span>${toggle(soundsOn, 'Sounds', 'data-sounds')}</div><div class="set-row"><span><b>Live block style</b><small>Choose the amount of presence</small></span><div class="style-seg"><button class="${state.liveStyle !== 'subtle' ? 'selected' : ''}" data-live-style="bold">Bold</button><button class="${state.liveStyle === 'subtle' ? 'selected' : ''}" data-live-style="subtle">Subtle</button></div></div></div></section><section class="settings-section"><h2>ABOUT</h2><div class="set-group"><div class="set-row"><span><b>Load demo</b><small>Seed fourteen days of history</small></span><button class="row-action" data-load-demo>Load</button></div><div class="set-row"><span><b>Change name / plan</b><small>${esc(state.name || 'Your profile')}</small></span><button class="row-action" data-nav="onboarding">Change</button></div></div></section><button class="settings-footer" data-backend-check>Service connection</button></div></main>`;
}

function memoryLine() { const entries = state.journal.filter(entry => entry.note?.trim()); if (!entries.length) return 'A small record will start here when you keep one honest line.'; const entry = entries.at(-1); return `From ${entry.date === today() ? 'today' : 'recently'} · “${String(entry.note).slice(0, 86)}${String(entry.note).length > 86 ? '…' : ''}”`; }
function weeklyLetter() { const completed = state.blocks.filter(block => block.done).length; const proof = state.journal.length ? `You left ${state.journal.length} small proof${state.journal.length === 1 ? '' : 's'} in the book. ` : 'The book is ready for its first honest line. '; return { title: completed >= 4 ? 'The shape held.' : completed ? 'You kept a door open.' : 'The day can still begin small.', body: `${state.intention ? `You kept returning to “${state.intention}.” ` : ''}${proof}${state.energy <= 2 ? 'You protected a gentler pace without turning it into a failure.' : 'You gave the day a shape without overfilling it.'}` }; }
function morningView() { const block = state.blocks[currentIndex()] || {}; return `<main class="ritual-page morning-page"><div class="ritual-orb"></div><header class="ritual-top"><span>DAY ONE</span><span>OPEN THE DAY</span></header><div class="ritual-content"><div class="ritual-kicker">MORNING, ONE BREATH AT A TIME</div><h1>Before the day gets loud.</h1><p>Choose the one thing that would make today feel true. The rest can wait.</p><label class="ritual-label" for="morning-intention">One clear line</label><input id="morning-intention" class="ritual-input" maxlength="96" placeholder="Be present for the first useful thing" value="${esc(state.intention || '')}"><div class="ritual-next"><span>NEXT</span><strong>${esc(block.name || 'Your first useful thing')}</strong><small>${block.time || state.wake}</small></div><button class="ritual-primary" data-morning-continue>Begin gently</button><button class="ritual-quiet" data-nav="today">Not now</button></div></main>`; }
function closeDayView() { const done = state.blocks.filter(block => block.done).length; return `<main class="ritual-page close-page"><div class="ritual-orb"></div><header class="ritual-top"><span>DAY ONE</span><span>CLOSE THE DAY</span></header><div class="ritual-content"><div class="ritual-kicker">LEAVE IT LIGHTER</div><h1>The day is allowed to end.</h1><p>${done} of ${state.blocks.length || 7} blocks are held. That is a record, not a verdict.</p><div class="close-picks">${['Enough', 'Tender', 'Unfinished'].map(feeling => `<button class="${state.closeFeeling === feeling ? 'selected' : ''}" data-close-feeling="${feeling}">${feeling}</button>`).join('')}</div><label class="ritual-label" for="close-note">One line to carry forward</label><input id="close-note" class="ritual-input close-note" maxlength="180" placeholder="What mattered, plainly?" value="${esc(state.closeNote || '')}"><button class="ritual-primary" data-close-save>Keep this day</button><button class="ritual-quiet" data-nav="today">Return to today</button></div></main>`; }
function rescueView() { const started = state.rescueStartedAt || Date.now(); const left = Math.max(0, 10 - Math.floor((Date.now() - started) / 60000)); return `<main class="ritual-page rescue-page"><div class="ritual-orb"></div><header class="ritual-top"><span>DAY ONE</span><span>THE SMALLER DOOR</span></header><div class="ritual-content"><div class="rescue-count">${left}</div><div class="rescue-caption">minutes to return</div><h1>Just make the next ten minutes real.</h1><p>No backlog. No catching up. Put both feet down, open the smallest useful thing, and stay with it.</p><div class="rescue-first"><span>FIRST MOVE</span><strong>Open the document and write one line.</strong></div><button class="ritual-primary" data-rescue-finish>I came back</button><button class="ritual-quiet" data-nav="today">Back to today</button></div></main>`; }
function letterView() { const letter = weeklyLetter(); const back = state.letterFrom || 'today'; return `<main class="letter-page"><div class="letter-blob"></div><header class="page-top"><span>DAY ONE</span><button data-letter-close>×</button></header><article class="weekly-letter"><div class="letter-stamp">A NOTE FROM THIS WEEK</div><h1>${esc(letter.title)}</h1><p>${esc(letter.body)}</p><div class="letter-rule"></div><div class="letter-caption">A SMALL MEMORY</div><blockquote>${esc(memoryLine())}</blockquote><div class="letter-proof">${state.journal.slice(-3).reverse().map(entry => `<span>${esc(entry.block || 'A block')}</span>`).join('') || 'Your first kept line will live here.'}</div><button class="letter-return" data-nav="${back}">Carry this into tomorrow</button></article></main>`; }

function journalComposeViewV2() {
  const mood = state.jMood || '';
  const moods = { Rough: ['#8FA0E8', '&#9788;'], Meh: ['#8FB6D6', '&#8722;'], Okay: ['#EFC98E', '&#9728;'], Good: ['#F6BC96', '&#10022;'], Alive: ['#93C78E', '&#8767;'] };
  return `<main class="journal-compose-page" style="--mood-aura:${moods[mood]?.[0] || '#d8cef0'}"><div class="j-aura"></div><header class="j-top"><button aria-label="Close journal" data-nav="journal">&times;</button><span>THE JOURNAL</span></header><div class="j-content"><h1>${esc(state.jPrompt || 'What felt true today?')}</h1><div class="j-ready"><span>OR JUST TAP A LINE</span><div>${["What's on my mind", 'A highlight', 'A small win'].map(line => `<button data-j-chip="${esc(line)}">${line}</button>`).join('')}</div></div><section class="mood-picker"><span>how does it feel?</span><div class="moods ${mood ? 'has-selected' : ''}">${Object.entries(moods).map(([value, [color, glyph]]) => `<button class="mood-tile ${mood === value ? 'selected' : ''}" style="--mood:${color}" data-j-mood="${value}"><i>${glyph}</i><strong>${value}</strong></button>`).join('')}</div></section><textarea class="j-text" id="j-text" placeholder="write it plainly. nobody reads this but you.">${esc(state.jText || '')}</textarea></div><div class="j-bottom"><button class="j-save ${mood || state.jText ? '' : 'off'}" data-j-save>Keep this</button><button class="j-skip" data-nav="journal">not now</button></div></main>`;
}
function journalListViewV2() {
  const entries = state.journal || [];
  const date = selectedJournalDate();
  const current = new Date(`${date}T00:00:00`);
  const dayEntries = entries.filter(entry => entry.date === date).slice().reverse();
  const month = current.toLocaleDateString([], { month: 'long' });
  const wonDays = new Set(entries.filter(entry => entry.answer === 'Yes').map(entry => entry.date)).size;
  const moodLabel = { Yes: 'Good', Partly: 'Okay', 'Not today': 'Rough' };
  const moods = entries.map(entry => moodLabel[entry.answer] || entry.answer).filter(Boolean);
  const mostly = moods.sort((a, b) => moods.filter(value => value === b).length - moods.filter(value => value === a).length)[0] || 'Unwritten';
  const rail = Array.from({ length: 28 }, (_, offset) => { const item = new Date(); item.setDate(item.getDate() - offset); const key = item.toISOString().slice(0, 10); return { item, key, selected: key === date, marked: entries.some(entry => entry.date === key) }; }).reverse();
  const pageLines = dayEntries.length ? dayEntries.slice(0, 3).map(entry => `<div class="book-line"><i></i><strong>${esc(entry.block || 'Journal')}</strong><em>${esc(entry.answer || 'Okay')}</em></div>`).join('') : '<p class="book-empty">The page stayed blank.<br>The book remembers the gaps too.</p>';
  const pagePhotos = dayEntries.filter(entry => entry.photo).slice(0, 2).map(entry => `<img src="${esc(entry.photo)}" alt="Proof from ${esc(entry.block || 'the day')}" loading="lazy">`).join('');
  const cards = dayEntries.length ? dayEntries.map(entry => { const mood = entry.answer || 'Okay'; const category = entry.block === 'Journal' ? 'REFLECTION' : entry.block?.includes('Close') ? 'REFLECTION' : 'GROWTH'; const timestamp = entryTimestamp(entry); const photo = entry.photo ? `<img class="journal-proof-photo" src="${esc(entry.photo)}" alt="Proof from ${esc(entry.block || 'the day')}" loading="lazy">` : ''; return `<article class="journal-card"><div class="journal-card-top"><span class="entry-tile mood-${mood}">${category === 'GROWTH' ? '&#8767;' : '&#9728;'}</span><div class="entry-meta"><span>${category}</span>${timestamp ? `<time>${timestamp}</time>` : ''}</div></div><strong>${esc(entry.block || 'A kept line')}</strong>${entry.question ? `<p class="entry-question">${esc(entry.question)}</p>` : ''}<p class="entry-answer ${entry.note ? '' : 'mood-only'}">${entry.note ? esc(entry.note) : esc(mood)}</p>${photo}</article>`; }).join('') : '<div class="journal-empty">No entry for this day yet. A blank page still belongs in the book.</div>';
  return `<main class="jlist-page"><div class="jlist-blob"></div><header class="jlist-top"><div><strong>DAY ONE</strong><span>THE JOURNAL</span></div><button class="fab-sm" aria-label="Compose journal entry" data-nav="jcompose">+</button></header><div class="jlist-content"><section class="j-insights"><div class="j-insights-head"><h1>${month}</h1><button data-j-see-all>See all &#8250;</button></div><div class="j-insight-stats"><div><span>ENTRIES</span><strong>${entries.length}</strong></div><div><span>DAYS WON</span><strong>${wonDays}</strong></div><div><span>MOSTLY FELT</span><strong>${esc(mostly)}</strong></div></div></section><section class="journal-stack" data-j-stack aria-label="Journal day stack"><div class="stack-peek left"></div><article class="book-page"><div class="book-date"><strong>${current.getDate()}</strong><span>${current.toLocaleDateString([], { month: 'long' })} &middot; ${current.toLocaleDateString([], { weekday: 'long' })}</span></div><div class="book-index">${current.getDate()} / ${new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate()}</div>${pageLines}${pagePhotos ? `<div class="book-photo-strip">${pagePhotos}</div>` : ''}<footer>${dayEntries.length} OF ${Math.max(11, entries.length)} &middot; ${dayEntries.length ? 'DAY RECORDED' : 'A QUIET PAGE'}</footer></article><div class="stack-peek right"></div></section><section class="journal-day-group"><button class="journal-date-head" data-j-date="${date}">${date === today() ? 'Today' : current.toLocaleDateString([], { weekday: 'long' })}, ${current.toLocaleDateString([], { month: 'short', day: 'numeric' })}<span>&#8250;</span></button>${cards}</section><div class="strap" data-j-rail>${rail.map(({ item, key, selected, marked }) => `<button class="${selected ? 'selected' : ''} ${marked ? 'marked' : ''} ${item.getDay() === 1 ? 'monday' : ''}" data-j-date="${key}" aria-label="${item.toLocaleDateString([], { month: 'long', day: 'numeric' })}"><strong>${item.getDate()}</strong><i></i></button>`).join('')}</div></div></main>`;
}

function calmViewV2() {
  const blockIndex = currentIndex();
  const block = state.blocks[blockIndex] || state.blocks[0] || {};
  const timing = blockTiming(blockIndex);
  const start = timeToMinutes(block.time || '00:00');
  const end = timeToMinutes(state.blocks[blockIndex + 1]?.time || formatTime(start + 50));
  const duration = Math.max(25, end > start ? end - start : 50);
  const progress = timing.live ? Math.max(8, Math.min(96, Math.round((duration - timing.remaining) / duration * 100))) : block.done ? 100 : 12;
  const holds = state.holds || [];
  const energy = Number(state.energy || 3);
  const recap = energy <= 2
    ? 'A softer plan is enough today. Protect the essential and let the rest wait.'
    : 'Your day is holding its shape. Keep the next useful thing close.';
  return `<main class="calm-page ${energy <= 2 ? 'calm-gentle' : ''}">
    <div class="calm-blob calm-a"></div><div class="calm-blob calm-b"></div>
    <header class="calm-top"><span>DAY ONE</span><button class="calm-close" data-nav="today" aria-label="Close calm layer">&times;</button></header>
    <section class="calm-hero"><p class="eyebrow">THE CALM LAYER</p><h1>Make room for the day you want.</h1><p>A private, useful layer for focus, recovery, and the little interruptions a real day brings.</p></section>
    <section class="calm-activity"><div><span>${timing.live ? 'ON NOW' : 'NEXT UP'}</span><strong>${esc(block.name || 'Your next block')}</strong><small>${esc(timing.time || block.time || 'Soon')}</small></div><button class="calm-secondary-pill" data-open-block="${esc(block.id || '')}">Open</button><i style="--progress:${progress}%"></i></section>
    <section class="calm-section"><h2>TODAY'S INTENTION</h2><p class="calm-section-copy">One clear line for the shape you want today.</p><label class="calm-label" for="intention">What would make today worthwhile?</label><div class="intention-row"><input id="intention" maxlength="100" value="${esc(state.intention || '')}" placeholder="Be present for the first useful thing"><button class="calm-quiet-action" data-save-intention>Save</button></div></section>
    <section class="calm-section"><h2>RECOVERY</h2><fieldset class="energy-field"><legend>How much room do you have today?</legend><div class="energy-scale">${[1,2,3,4,5].map(n => `<button class="${energy === n ? 'selected' : ''}" data-calm-energy="${n}" aria-pressed="${energy === n}">${n}</button>`).join('')}</div></fieldset><p class="calm-help">This stays on this phone. It gently changes the suggestion, never your worth.</p></section>
    <section class="calm-section"><h2>MAKE ROOM</h2><p class="calm-section-copy">Protect the parts of the day that are fixed.</p><div class="hold-form"><label class="calm-field-label" for="hold-name">What is fixed?</label><input id="hold-name" maxlength="60" value="${esc(state.holdDraft || '')}" placeholder="A meeting, pickup, appointment"><div class="calm-time-fields"><label for="hold-start">Starts<input id="hold-start" type="text" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" value="12:00" aria-label="Hold start time"></label><label for="hold-end">Ends<input id="hold-end" type="text" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" value="13:00" aria-label="Hold end time"></label></div><button class="calm-secondary-pill" data-protect-hold>Protect this time</button></div><div class="hold-list">${holds.length ? holds.map((hold, index) => `<div class="hold-item"><span>${esc(hold.name)}</span><small>${esc(hold.start)}&ndash;${esc(hold.end)}</small><button data-remove-hold="${index}" aria-label="Remove ${esc(hold.name)}">&times;</button></div>`).join('') : '<p class="calm-empty">Nothing fixed yet. Give the day its edges.</p>'}</div><button class="calm-quiet-action" data-rebalance>Rebalance flexible blocks</button></section>
    <section class="calm-recap"><span>ON THIS PHONE</span><strong>${recap}</strong></section>
    <section class="calm-section"><h2>WHEN THE DAY SLIPS</h2><p class="calm-section-copy">No guilt. Just a smaller door.</p><button class="calm-primary-pill" data-rescue>Start a 10-minute rescue</button></section>
    <section class="calm-section"><h2>CLOSE THE DAY</h2><p class="calm-section-copy">Leave it lighter when you are ready.</p><button class="calm-secondary-pill" data-close-day>Close today gently</button></section>
    <section class="calm-section calm-handoffs"><h2>APPLE HANDOFFS</h2><p class="calm-section-copy">Focus, Calendar, Watch, and Quiet Hour are kept ready for a future handoff.</p><p class="calm-foot">Live Activity, Health, and Focus stay private to this device.</p></section>
  </main>`;
}

function todayViewWithDots() {
  return todayView()
    .replace('</h1><section class="today-hero">', `</h1>${goalStripView()}<section class="today-hero">`)
    .replace('<section class="week-row">', `${dayDots()}<section class="week-row">`);
}

function tasksViewWithDiscipline() {
  const open = state.tasks.filter(task => !task.done).length;
  const completeNote = state.tasks.length && state.tasks.length <= 3 && !open ? '<p class="tasks-complete-note">That is the whole list. Good.</p>' : '';
  const openCopy = open ? `${open} open today` : 'all done today';
  return tasksView()
    .replace(/<span>\d+ open today<\/span>/, `<span>${openCopy}</span>`)
    .replace('</div><div class="task-secondary-actions">', `${completeNote}</div><div class="task-secondary-actions">`);
}

function statsHistoryRecord(date) { return state.history.find(record => record.date === date) || { date, won: false, goalEvents: [] }; }
function dayKeptCount(date) {
  const record = statsHistoryRecord(date); const events = Array.isArray(record.goalEvents) ? record.goalEvents.length : 0;
  if (events) return Math.min(7, events); if (record.won) return 7;
  return Math.min(7, state.journal.filter(entry => entry.date === date).length);
}
function dayEntries(date) { return state.journal.filter(entry => entry.date === date).slice().sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0)); }
function dayOpener(date) {
  const kept = dayKeptCount(date); const note = dayEntries(date).find(entry => entry.note)?.note;
  if (note) return note; if (!kept) return 'The page stayed blank.';
  return ['A day that held its shape.', 'Started with the smallest useful thing.', 'Quiet work still moved the day forward.'][date.charCodeAt(date.length - 1) % 3];
}
function feedPhoto(date) {
  const kept = dayKeptCount(date); const photo = dayEntries(date).find(entry => entry.photo)?.photo;
  if (!photo || kept < 4) return '';
  const seed = date.split('-').reduce((sum, part) => sum + Number(part), 0);
  return seed % 3 === 0 ? photo : '';
}
function blockNames() { return (state.blocks || []).map(block => ({ name: block.name || 'A block', time: block.time || '', first: block.firstMove || block.line || block.description || 'The smallest next action.' })); }
function storyEvents(date) {
  const entries = dayEntries(date); const kept = dayKeptCount(date); const names = blockNames();
  const events = entries.map(entry => ({ time: entryTimestamp(entry), name: entry.block || 'A kept line', first: 'The block made room for one useful thing.', note: entry.note || '', photo: entry.photo || '', mood: entry.answer || '' }));
  for (let index = events.length; index < kept; index += 1) { const block = names[index] || { name: 'A kept block', time: '', first: 'The next useful thing.' }; events.push({ time: block.time, name: block.name, first: block.first, note: '', photo: '', mood: '' }); }
  return { kept: events, missed: names.slice(kept).concat(Array.from({ length: Math.max(0, 7 - kept - names.length) }, (_, index) => ({ name: `Block ${kept + names.length + index + 1}`, time: '', first: '' }))) };
}
function storyEventMarkup(event, missed = false) {
  return `<article class="story-entry${missed ? ' story-missed' : ''}"><div class="story-time">${esc(event.time || '—')}</div><div class="story-entry-body"><span class="story-dot"></span><div><strong>${esc(event.name)}</strong>${event.first ? `<small>${esc(event.first)}</small>` : ''}${event.note ? `<p>${esc(event.note)}</p>` : ''}${event.photo ? `<figure><img src="${esc(event.photo)}" alt="Proof from ${esc(event.name)}" loading="lazy"><figcaption>Proof from this block</figcaption></figure>` : ''}${event.mood ? `<span class="story-mood">${esc(event.mood)}</span>` : ''}${missed ? '<small>Not kept. The day still counted.</small>' : ''}</div></div></article>`;
}
function statsDayCells() {
  const dates = Array.from({ length: 84 }, (_, index) => journalDay(83 - index)); const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S']; let grid = '';
  for (let row = 0; row < 7; row += 1) { grid += `<span class="heat-weekday">${labels[row]}</span>`; for (let column = 0; column < 12; column += 1) { const date = dates[column * 7 + row]; const record = statsHistoryRecord(date); const entries = dayEntries(date); const effort = (record.goalEvents || []).length; const intensity = Math.min(4, effort ? Math.max(1, Math.round(effort / 2)) : record.won ? 2 : entries.length ? 1 : 0); const selected = (state.statsDate || today()) === date ? ' selected' : ''; grid += `<button class="heat-cell heat-${intensity}${selected}" data-stats-day="${date}" aria-label="Open ${new Date(`${date}T12:00:00`).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })} day story"><span></span></button>`; } }
  const months = Array.from({ length: 12 }, (_, column) => { const date = new Date(`${dates[column * 7]}T12:00:00`); const previous = column ? new Date(`${dates[(column - 1) * 7]}T12:00:00`) : null; return `<span>${!previous || date.getMonth() !== previous.getMonth() ? date.toLocaleDateString([], { month: 'short' }) : ''}</span>`; }).join('');
  return `<div class="heat-grid">${grid}</div><div class="heat-month-row"><span></span>${months}</div>`;
}
function statsPreviewView(date) {
  const day = new Date(`${date}T12:00:00`); const entries = dayEntries(date); const kept = dayKeptCount(date); const photo = entries.find(entry => entry.photo)?.photo || ''; return `<button class="stats-day-preview" data-story-preview="${date}"><div class="preview-date"><strong>${day.getDate()}</strong><span>${day.toLocaleDateString([], { month: 'short', weekday: 'long' })}</span></div><p>${esc(dayOpener(date))}</p>${photo ? `<img src="${esc(photo)}" alt="Proof from ${esc(date)}" loading="lazy">` : ''}<footer><span>${kept} / 7 blocks kept</span><span>${entries.filter(entry => entry.note).length} lines written &rsaquo;</span></footer></button>`;
}
function dayStoryView() {
  const date = state.statsDate || today(); const day = new Date(`${date}T12:00:00`); const kept = dayKeptCount(date); const entries = dayEntries(date); const dayState = kept >= 4 ? 'Held' : kept ? 'In progress' : 'Quiet'; const events = storyEvents(date); const timeline = events.kept.map(event => storyEventMarkup(event)).join('') + events.missed.map(event => storyEventMarkup(event, true)).join('');
  return `<main class="day-story-page"><header class="day-story-top"><span>THE JOURNAL</span><button aria-label="Close day story" data-story-close>&times;</button></header><div class="day-story-content"><div class="story-date-hero"><strong>${day.getDate()}</strong><span>${day.toLocaleDateString([], { month: 'long' }).toUpperCase()}<br>${day.toLocaleDateString([], { weekday: 'long' }).toUpperCase()}</span></div><p class="story-opener">${esc(dayOpener(date))}</p><section class="story-summary"><div><span>BLOCKS KEPT</span><strong>${kept} / 7</strong></div><div><span>DAY</span><strong>${dayState}</strong></div><div><span>LINES WRITTEN</span><strong>${entries.filter(entry => entry.note).length}</strong></div></section><section class="story-timeline"><div class="story-section-label">THE DAY, AS IT HAPPENED</div><div class="story-spine">${timeline || '<p class="story-empty">The page stayed blank.</p>'}</div></section><button class="story-close-action" data-story-close>Back to this week</button></div></main>`;
}

function statsPageViewDiscipline() {
  const total = state.blocks.length || 7;
  const done = state.blocks.filter(block => block.done).length;
  const score = Math.round(done / total * 100);
  const blockers = state.journal.flatMap(entry => String(entry.blockers || '').split(',').map(value => value.trim()).filter(Boolean));
  const counts = blockers.reduce((all, blocker) => ({ ...all, [blocker]: (all[blocker] || 0) + 1 }), {});
  const blockerRows = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const potLine = goalIsActive() ? `${money(recentGoalWeek())} moved into the ledger for ${state.goal.name} this week.` : '';
  const story = [done ? `${done} block${done === 1 ? '' : 's'} found a place today.` : 'There is still room to begin with one small block.', state.journal.length ? `${state.journal.length} kept line${state.journal.length === 1 ? '' : 's'} make the week easier to remember.` : 'The book is ready for the first honest line.', state.energy <= 2 ? 'A softer pace is part of the plan.' : 'The next useful thing is enough for now.', potLine].filter(Boolean);
  return `<main class="stats-page"><div class="stats-blob"></div><header class="page-top"><span>DAY ONE</span></header><div class="page-content"><div class="task-kicker">THE WEEK, IN WORDS</div><h1 class="pg-title">This week.</h1><section class="score-card"><div class="score-progress"><strong>${score}</strong><span>today</span>${dayDots()}</div><div><h2>${score >= 70 ? 'The shape held.' : 'There is still a door open.'}</h2><p>Small completions count when they make the next one easier.</p></div></section><section class="week-story"><strong>What the week says</strong><p>${story.map(line => `<span>${esc(line)}</span>`).join('')}</p></section><div class="split-stats"><div><strong>${state.streak}</strong><span>Days kept<br>without pressure</span></div><div><strong>${done}</strong><span>Deep work<br>protected today</span></div><div><strong>${state.journal.length}</strong><span>Notes<br>kept this week</span></div></div><div class="task-kicker">WHAT GOT IN THE WAY</div><div class="kill-list">${blockerRows.length ? blockerRows.map(([name, count]) => `<div><span>${esc(name)}</span><i style="width:${Math.max(16, Math.round(count / blockers.length * 100))}%"></i></div>`).join('') : '<p class="stats-empty">No blockers logged this week.</p>'}</div><section class="tip-card"><span>TOMORROW</span><strong>Leave one clear door open before bed.</strong></section><button class="weekly-letter-link" data-nav="letter"><span>WEEKLY LETTER</span><strong>Read what the week is trying to tell you.</strong><i>›</i></button><div class="heatmap"><div class="task-kicker">TWELVE WEEKS</div><div class="heat-grid">${statsDayCells()}</div><small>less&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;more · tap a day to open its story</small></div></div></main>`;
}

function journalListViewDiscipline() {
  const entries = state.journal || [];
  const date = selectedJournalDate();
  const current = new Date(`${date}T00:00:00`);
  const month = current.toLocaleDateString([], { month: 'long' });
  const monthKey = date.slice(0, 7);
  const monthEntries = entries.filter(entry => entry.date?.startsWith(monthKey));
  const moodMap = { yes: 'Good', partly: 'Okay', 'not really': 'Rough', 'not today': 'Rough' };
  const monthMoods = monthEntries.map(entry => moodMap[String(entry.answer || '').toLowerCase()] || entry.mood || entry.answer).filter(Boolean);
  const mostly = monthMoods.sort((a, b) => monthMoods.filter(value => value === b).length - monthMoods.filter(value => value === a).length)[0] || 'unwritten';
  const dayEntries = entries.filter(entry => entry.date === date).slice().reverse();
  const rail = Array.from({ length: 28 }, (_, offset) => { const item = new Date(); item.setDate(item.getDate() - offset); const key = item.toISOString().slice(0, 10); return { item, key, selected: key === date, marked: entries.some(entry => entry.date === key) }; }).reverse();
  const pageLines = dayEntries.length ? dayEntries.slice(0, 3).map(entry => `<div class="book-line"><i></i><strong>${esc(entry.block || 'Journal')}</strong><em>${esc(entry.answer || 'Okay')}</em></div>`).join('') : '<p class="book-empty">The page stayed blank.<br>The book remembers the gaps too.</p>';
  const cards = dayEntries.length ? dayEntries.map(entry => { const category = entry.block === 'Journal' || entry.block?.includes('Close') ? 'REFLECTION' : 'GROWTH'; const timestamp = entryTimestamp(entry); const photo = entry.photo ? `<img class="journal-proof-photo" src="${esc(entry.photo)}" alt="Proof from ${esc(entry.block || 'the day')}" loading="lazy">` : ''; return `<article class="journal-card"><div class="journal-card-top"><span class="entry-tile">${category === 'GROWTH' ? '&#8767;' : '&#9728;'}</span><div class="entry-meta"><span>${category}</span>${timestamp ? `<time>${timestamp}</time>` : ''}</div></div><strong>${esc(entry.block || 'A kept line')}</strong>${entry.question ? `<p class="entry-question">${esc(entry.question)}</p>` : ''}<p class="entry-answer">${entry.note ? esc(entry.note) : esc(entry.answer || 'Okay')}</p>${photo}</article>`; }).join('') : '<div class="journal-empty">No entry for this day yet. A blank page still belongs in the book.</div>';
  const summary = `${month} · ${monthEntries.length} ${monthEntries.length === 1 ? 'entry' : 'entries'} · mostly ${String(mostly).toLowerCase()}`;
  return `<main class="jlist-page"><header class="jlist-top"><div><strong>DAY ONE</strong><span>THE JOURNAL</span></div><button class="fab-sm" aria-label="Compose journal entry" data-nav="jcompose">+</button></header><div class="jlist-content"><div class="journal-summary"><span>${esc(summary)}</span><button data-j-see-all>See all</button></div><section class="journal-stack" data-j-stack aria-label="Journal day stack"><div class="stack-peek left"></div><article class="book-page"><div class="book-date"><strong>${current.getDate()}</strong><span>${current.toLocaleDateString([], { month: 'long' })} · ${current.toLocaleDateString([], { weekday: 'long' })}</span></div>${pageLines}<footer>${dayEntries.length ? 'DAY RECORDED' : 'A QUIET PAGE'}</footer></article><div class="stack-peek right"></div></section><section class="journal-day-group"><button class="journal-date-head" data-j-date="${date}">${date === today() ? 'Today' : current.toLocaleDateString([], { weekday: 'long' })}, ${current.toLocaleDateString([], { month: 'short', day: 'numeric' })}<span>›</span></button>${cards}</section><div class="strap" data-j-rail>${rail.map(({ item, key, selected, marked }) => `<button class="${selected ? 'selected' : ''} ${marked ? 'marked' : ''} ${item.getDay() === 1 ? 'monday' : ''}" data-j-date="${key}" aria-label="${item.toLocaleDateString([], { month: 'long', day: 'numeric' })}"><strong>${item.getDate()}</strong><i></i></button>`).join('')}</div></div></main>`;
}

function statsPageViewDiscipline() {
  const total = state.blocks.length || 7; const done = state.blocks.filter(block => block.done).length; const score = Math.round(done / total * 100); const selectedDate = state.statsDate || today();
  const story = done ? `${done} block${done === 1 ? '' : 's'} found a place today.` : 'There is still room to begin with one small block.';
  return `<main class="stats-page"><div class="stats-blob"></div><header class="page-top"><span>DAY ONE</span></header><div class="page-content"><div class="task-kicker">THE WEEK, IN WORDS</div><h1 class="pg-title">This week.</h1><section class="score-card"><div class="score-progress"><strong>${score}</strong><span>today</span>${dayDots()}</div><div><h2>${score >= 70 ? 'The shape held.' : 'There is still a door open.'}</h2><p>Small completions count when they make the next one easier.</p></div></section><section class="week-story"><strong>What the week says</strong><p><span>${esc(story)}</span><span>${state.journal.length ? `${state.journal.length} lines make the week easier to remember.` : 'The book is ready for the first honest line.'}</span><span>${state.energy <= 2 ? 'A softer pace is part of the plan.' : 'The next useful thing is enough for now.'}</span></p></section><div class="split-stats"><div><strong>${state.streak}</strong><span>Days kept<br>without pressure</span></div><div><strong>${done}</strong><span>Deep work<br>protected today</span></div><div><strong>${state.journal.length}</strong><span>Notes<br>kept this week</span></div></div><div class="task-kicker">WHAT GOT IN THE WAY</div><div class="kill-list"><p class="stats-empty">No blockers logged this week.</p></div><section class="tip-card"><span>TOMORROW</span><strong>Leave one clear door open before bed.</strong></section><div class="heatmap"><div class="task-kicker">TWELVE WEEKS</div>${statsDayCells()}<small>quiet&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;full · tap a day to open its story</small></div>${statsPreviewView(selectedDate)}</div></main>`;
}

function journalFeedView() {
  const dates = Array.from({ length: 21 }, (_, offset) => journalDay(20 - offset));
  const rows = dates.map(date => {
    const day = new Date(`${date}T12:00:00`); const entries = dayEntries(date); const kept = dayKeptCount(date); const photo = feedPhoto(date); const quiet = !kept;
    const dots = Array.from({ length: 7 }, (_, index) => `<i class="${index < kept ? 'on' : ''}"></i>`).join('');
    return `<button class="journal-feed-row${quiet ? ' quiet' : ''}" data-j-story-date="${date}"><span class="feed-date"><strong>${day.getDate()}</strong><small>${day.toLocaleDateString([], { weekday: 'short' }).toUpperCase()}</small></span><span class="feed-story"><span class="feed-line">${esc(dayOpener(date))}</span>${photo ? `<img src="${esc(photo)}" alt="Proof from ${esc(date)}" loading="lazy">` : ''}<span class="feed-dots">${dots}</span></span></button>`;
  }).join('');
  const month = new Date(`${dates.at(-1)}T12:00:00`).toLocaleDateString([], { month: 'long' });
  return `<main class="jlist-page journal-story-feed"><header class="jlist-top"><div><strong>DAY ONE</strong><span>THE JOURNAL</span></div><button class="fab-sm" aria-label="Compose journal entry" data-nav="jcompose">+</button></header><div class="jlist-content"><div class="journal-feed-heading"><span>${month} · ${dates.length} days</span><strong>What stayed with you.</strong></div><section class="journal-feed" aria-label="Journal by day">${rows}</section></div></main>`;
}
function journalListViewDiscipline() { return journalFeedView(); }

function journalComposeSheet() {
  const mood = state.jMood || '';
  const moods = { Rough: '#8FA0E8', Meh: '#8FB6D6', Okay: '#EFC98E', Good: '#F6BC96', Alive: '#93C78E' };
  return `<section class="sheet journal-compose-page" role="dialog" aria-modal="true" aria-label="Journal"><header class="sheet-head"><span>THE JOURNAL</span><button aria-label="Close journal" data-sheet-dismiss>&times;</button></header><div class="j-content"><h1>${esc(state.jPrompt || 'What felt true today?')}</h1><div class="j-ready"><span>OR JUST TAP A LINE</span><div>${["What's on my mind", 'A highlight', 'A small win'].map(line => `<button data-j-chip="${esc(line)}">${line}</button>`).join('')}</div></div><section class="mood-picker"><span>how does it feel?</span><div class="moods">${Object.entries(moods).map(([value, color]) => `<button class="mood-tile ${mood === value ? 'selected' : ''}" style="--mood:${color}" data-j-mood="${value}"><i></i><strong>${value}</strong></button>`).join('')}</div></section><textarea class="j-text" id="j-text" placeholder="write it plainly. nobody reads this but you.">${esc(state.jText || '')}</textarea></div><div class="j-bottom"><button class="j-save ${mood || state.jText ? '' : 'off'}" data-j-save>Keep this</button><button class="j-skip" data-sheet-dismiss>not now</button></div></section>`;
}

function closeDaySheet() {
  const done = state.blocks.filter(block => block.done).length;
  return `<section class="sheet close-page" role="dialog" aria-modal="true" aria-label="Close the day"><header class="sheet-head"><span>CLOSE THE DAY</span><button aria-label="Close sheet" data-sheet-dismiss>&times;</button></header><div class="sheet-content"><div class="ritual-kicker">LEAVE IT LIGHTER</div><h1>The day is allowed to end.</h1><p>${done} of ${state.blocks.length || 7} blocks are held. That is a record, not a verdict.</p>${dayDots()}<div class="close-picks">${['Enough', 'Tender', 'Unfinished'].map(feeling => `<button class="${state.closeFeeling === feeling ? 'selected' : ''}" data-close-feeling="${feeling}">${feeling}</button>`).join('')}</div><label class="ritual-label" for="close-note">One line to carry forward</label><input id="close-note" class="ritual-input close-note" maxlength="180" placeholder="What mattered, plainly?" value="${esc(state.closeNote || '')}"><button class="ritual-primary" data-close-save>Keep this day</button><button class="ritual-quiet" data-sheet-dismiss>Return to today</button></div></section>`;
}

function checkinViewDiscipline() {
  const answered = Boolean(state.checkinAnswered);
  const source = state.checkin?.source === 'gpt-5.6' ? 'GPT-5.6' : 'OFFLINE';
  return `<main class="checkin-page"><div class="ci-wash"></div><div class="ci-content"><div class="ci-tag">${source}</div><h1 class="ci-q">${esc(state.checkin?.question || fallbackQuestions[0])}</h1><div class="ci-answers">${['Yes', 'Not really'].map(answer => `<button class="${state.checkinAnswer === answer ? 'selected' : ''}" data-ci-answer="${answer}">${answer}</button>`).join('')}</div>${answered ? `<textarea class="ci-input ci-note-reveal" id="ci-note" placeholder="add a note (optional)">${esc(state.checkinNote || '')}</textarea><div class="ci-bottom"><button class="ci-log" data-ci-log>Log it</button></div>` : ''}</div></main>`;
}

const sheetBaseViews = { jcompose: 'journal', close: 'today' };

const screens = {
  onboarding: onboardingViewV3, today: todayViewWithDots, calm: calmViewV2, tasks: tasksViewWithDiscipline, live: liveViewWithGoalCredit,
  checkin: checkinViewDiscipline, celebrate: celebrateView, streak: streakCardView, journal: journalListViewDiscipline,
  jcompose: journalComposeSheet, schedule: schedulePageView, stats: statsPageViewDiscipline, daystory: dayStoryView, settings: settingsPageViewV4,
  morning: morningView, close: closeDaySheet, rescue: rescueView, letter: letterView, goal: goalView
};

const coreNavViews = new Set(['today', 'journal', 'stats', 'tasks']);
function coreNav(activeView = state.view) {
  const items = [['today', 'Today'], ['journal', 'Journal'], ['stats', 'Stats'], ['tasks', 'Tasks']];
  return `<nav class="core-nav" aria-label="Main navigation">${items.map(([view, label]) => `<button class="${activeView === view ? 'active' : ''}" data-nav="${view}">${label}</button>`).join('')}</nav>`;
}
function applyAppearance() { document.documentElement.dataset.appearanceTheme = state.theme || 'auto'; document.documentElement.dataset.appearanceAccent = state.accent || 'iris'; document.documentElement.classList.toggle('gentle', Number(state.energy) <= 2); }
function recoverTransientView() { if (['checkin', 'celebrate'].includes(state.view)) { state.view = 'today'; state.checkinAnswered = false; save(); } }
function render() {
  applyAppearance();
  clearInterval(timer);
  const viewChanged = lastRenderedView !== state.view;
  const sheetBase = sheetBaseViews[state.view];
  const displayView = sheetBase || state.view;
  document.documentElement.classList.toggle('live-surface', displayView === 'live');
  document.body.classList.toggle('live-surface', displayView === 'live');
  document.documentElement.dataset.onboardingMotion = state.view === 'onboarding' ? (state.onbMotion || 'boot') : '';
  const view = screens[state.view] || screens.today;
  const markup = sheetBase
    ? `${screens[sheetBase]()}<div class="sheet-backdrop ${viewChanged ? 'sheet-enter' : ''}" data-sheet-dismiss></div>${view().replace('class="sheet ', `class="sheet ${viewChanged ? 'sheet-enter ' : ''}`)}`
    : view().replace(/<(main|div) class="/, `<$1 class="${viewChanged ? 'screen-enter ' : ''}`);
  document.querySelector('#app').innerHTML = coreNavViews.has(displayView) ? `${markup}${coreNav(displayView)}` : markup;
  if (displayView === 'today') {
    document.querySelector('[data-streak]')?.setAttribute('aria-label', 'Open streak');
    document.querySelector('[data-calm]')?.setAttribute('aria-label', 'Open calm');
    document.querySelector('[data-schedule]')?.setAttribute('aria-label', 'Open schedule');
    document.querySelector('[data-nav="settings"]')?.setAttribute('aria-label', 'Open settings');
  }
  wire();
  if (viewChanged) window.scrollTo(0, 0);
  lastRenderedView = state.view;
  if (displayView === 'today' || state.view === 'live' || state.view === 'rescue') timer = setInterval(updateClock, 1000);
}
function updateClock() {
  const block = state.blocks[currentIndex()];
  const timerEl = document.querySelector('.block-time em');
  if (timerEl && block) timerEl.textContent = blockTiming(currentIndex()).time;
  const minutesEl = document.querySelector('[data-live-minutes]');
  if (minutesEl && block) { const timing = blockTiming(currentIndex()); minutesEl.textContent = block.done ? 0 : timing.remaining; }
  const rescueEl = document.querySelector('.rescue-count');
  if (rescueEl) { const seconds = Math.max(0, 600 - Math.floor((Date.now() - (state.rescueStartedAt || Date.now())) / 1000)); rescueEl.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }
}

async function completeBlock(id) {
  if (completingBlock) return;
  const index = state.blocks.findIndex(item => item.id === id);
  const block = state.blocks[index]; if (!block) return;
  completingBlock = true;
  const timing = blockTiming(index);
  const earned = recordGoalEarning(id, timing.live);
  block.done = true;
  state.activeBlock = id;
  state.goalEarnedFlash = earned > 0 ? { blockId: id, amount: earned } : null;
  state.checkin = { question: fallbackQuestions[Math.floor(Math.random() * fallbackQuestions.length)], source: 'offline' };
  save(); render();
  if (state.goalEarnedFlash && !matchMedia('(prefers-reduced-motion: reduce)').matches) await new Promise(resolve => setTimeout(resolve, 560));
  state.goalEarnedFlash = null;
  try {
    const response = await fetch(API_ENDPOINT, { method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ block: block.name, focus: state.focus, energy: state.energy, blockers: state.blockers, streak: state.streak, time: new Date().toISOString() }) });
    if (response.ok) { const data = await response.json(); if (data.question) state.checkin = { question: data.question, source: data.source === 'gpt-5.6' ? 'gpt-5.6' : 'offline' }; }
  } catch {}
  state.view = 'checkin'; save(); render();
  completingBlock = false;
}
function completeCheckin() {
  const block = state.blocks.find(item => item.id === state.activeBlock);
  state.journal.push({ date: today(), createdAt: new Date().toISOString(), block: block?.name || 'Block', question: state.checkin?.question || '', answer: state.checkinAnswer || 'Partly', energy: state.energy, blockers: state.checkinBlocker || '', note: document.querySelector('#ci-note')?.value || '' });
  const ratio = state.blocks.filter(item => item.done).length / state.blocks.length;
  historyDay(today(), true).won = ratio >= .7;
  if (ratio >= .7 && state.lastCountedDate !== today()) { state.streak = Math.max(1, state.streak + 1); state.lastCountedDate = today(); }
  state.checkinAnswered = false; state.checkinAnswer = ''; state.checkinBlocker = ''; state.proof = false; state.proofSkipped = false; state.dayWon = ratio >= .7; state.view = 'celebrate'; save(); render();
}
function loadDemo() {
  const notes = ['Made the first useful thing smaller.', 'A walk untangled the afternoon.', 'Protected the quiet hour.', 'Did not need to finish everything.', 'Came back after drifting.'];
  const moods = ['Good', 'Alive', 'Okay', 'Good', 'Meh'];
  const demoPhoto = index => {
    const scenes = [
      ['#f6c58f', '#8fa0e8', '#f7e6c7', 'morning light'], ['#93c78e', '#b9aef2', '#f4d6b5', 'outside again'],
      ['#8fb6d6', '#efc98e', '#f8eee3', 'one useful hour'], ['#f6bc96', '#8fa0e8', '#eee4d4', 'the quiet desk'],
      ['#b9aef2', '#93c78e', '#f6d8bd', 'a small return'], ['#efc98e', '#8fb6d6', '#f7eee3', 'afternoon walk'],
      ['#f6bc96', '#93c78e', '#efe1cf', 'kept the promise']
    ];
    const [a, b, paper, label] = scenes[index % scenes.length];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 460"><defs><linearGradient id="sky" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient><filter id="soft"><feGaussianBlur stdDeviation="18"/></filter></defs><rect width="720" height="460" rx="34" fill="${paper}"/><rect x="28" y="28" width="664" height="404" rx="24" fill="url(#sky)"/><circle cx="560" cy="104" r="76" fill="#fff8ed" opacity=".48" filter="url(#soft)"/><path d="M28 318 Q170 250 292 320 T520 298 T692 278 V432 H28Z" fill="#1a1815" opacity=".18"/><path d="M118 352 Q250 245 410 334 T616 280" fill="none" stroke="#fff8ed" stroke-width="9" stroke-linecap="round" opacity=".72"/><circle cx="190" cy="278" r="44" fill="#fff8ed" opacity=".68"/><rect x="80" y="66" width="180" height="42" rx="21" fill="#fff8ed" opacity=".86"/><text x="104" y="93" font-family="Arial,sans-serif" font-size="19" letter-spacing="3" fill="#1a1815">${label.toUpperCase()}</text></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  };
  const blocks = state.blocks.length ? state.blocks : generateBlocks();
  const dayAt = index => new Date(Date.now() - index * 86400000);
  state.blocks = blocks;
  state.streak = 14; state.intention = 'Make room for the first useful thing.'; state.morningSeenDate = today(); state.demoMode = true; state.lastCountedDate = today();
  if (!goalIsActive()) state.goal = { name: 'PlayStation 5', price: 54990, pace: 'steady', currencyCode: currencyCode(), startedAt: today() };
  state.history = Array.from({ length: 14 }, (_, index) => ({ date: dayAt(index).toISOString().slice(0, 10), won: index !== 4 && index !== 9, goalEvents: [], transfers: [] }));
  if (goalIsActive()) {
    state.goal = { ...state.goal, startedAt: state.history.at(-1).date };
    const plan = goalPlan(); const kept = [5, 6, 4, 0, 3, 5, 6, 5, 0, 4, 6, 5, 6, 5];
    state.history.forEach((record, index) => {
      const count = kept[index] || 0;
      record.goalEvents = Array.from({ length: count }, (_, eventIndex) => ({ blockId: `demo-goal-${record.date}-${eventIndex}`, window: 'live', perBlock: plan.perBlock, blocksPerDay: plan.blocksPerDay, multiplier: streakMultiplierFor(Math.max(1, 14 - index)) }));
    });
  }
  state.journal = Array.from({ length: 14 }, (_, index) => ({ date: dayAt(index).toISOString().slice(0, 10), createdAt: dayAt(index).toISOString(), block: blocks[(index + 2) % blocks.length]?.name || 'Deep study', answer: index % 4 === 0 ? 'Partly' : 'Yes', mood: moods[index % moods.length], note: notes[index % notes.length], photo: demoPhoto(index) }));
  state.tasks = [
    { id: 'demo-task-1', text: 'Sketch the opening screen', blockId: blocks[2]?.id || null, done: true },
    { id: 'demo-task-2', text: 'Write the first useful paragraph', blockId: blocks[2]?.id || null, done: false },
    { id: 'demo-task-3', text: 'Send the follow-up', blockId: blocks[4]?.id || null, done: false },
    { id: 'demo-task-4', text: 'Choose tomorrow\'s first move', blockId: null, done: false }
  ];
  state.holds = [{ name: 'Lunch with a friend', start: '13:00', end: '14:00' }];
  save(); render();
}
function resetApp() {
  if (!state.resetAppConfirm) { state.resetAppConfirm = true; render(); return; }
  state = { ...defaults, onbMotion: 'boot' };
  save(); render();
}

function settingsPageViewV4() {
  const resetLabel = state.resetAppConfirm ? 'Confirm reset' : 'Reset';
  const featureGuide = '<section class="settings-section submission-guide"><h2>HOW DAY ONE WORKS</h2><div class="set-group"><div class="submission-note"><b>Plan once. Show up block by block.</b><p>Live focus keeps one next move in view. Check-ins turn progress into a journal. Calm makes room for real life. Streaks, weekly patterns, and the optional Goal Pot make the return visible.</p></div></div></section>';
  return settingsPageViewV3()
    .replace('data-load-demo>Load</button>', `data-load-demo>${state.demoMode ? 'Reload' : 'Load'}</button>`)
    .replace('<section class="settings-section"><h2>ABOUT</h2>', `${featureGuide}<section class="settings-section"><h2>ABOUT</h2>`)
    .replace('</div></section><button class="settings-footer"', `<div class="set-row reset-app-row"><span><b>Reset app</b><small>Erase this device and restart onboarding</small></span><button class="row-action ${state.resetAppConfirm ? 'confirm' : ''}" data-reset-app>${resetLabel}</button></div></div></section><button class="settings-footer"`);
}
async function checkBackend() { const button = document.querySelector('[data-backend-check]'); state.backendStatus = 'checking'; if (button) button.textContent = 'Checking service…'; try { const response = await fetch(API_ENDPOINT, { method: 'GET', cache: 'no-store' }); const body = response.ok ? await response.json().catch(() => ({})) : {};
    // ponytail: health said "connected" even with no API key, while every check-in fell back to offline.
    state.backendStatus = !response.ok ? 'unavailable' : body.key === false ? 'nokey' : 'connected'; } catch { state.backendStatus = 'unavailable'; } if (button) button.textContent = state.backendStatus === 'connected' ? 'Service connected' : state.backendStatus === 'nokey' ? 'Service reachable · no API key' : 'Service unavailable'; save(); }
function requestNotifications() { if (!('Notification' in window)) { state.notificationStatus = 'unsupported'; save(); render(); return; } Notification.requestPermission().then(permission => { state.notificationStatus = permission; save(); render(); }).catch(() => {}); }
function exportData() { const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })); link.download = 'day-one-export.json'; link.click(); URL.revokeObjectURL(link.href); }
function exportTodayCalendar(button) {
  const pad = value => String(value).padStart(2, '0');
  const stamp = value => `${value.getFullYear()}${pad(value.getMonth() + 1)}${pad(value.getDate())}T${pad(value.getHours())}${pad(value.getMinutes())}00`;
  const escapeIcs = value => String(value || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const blocks = [...state.blocks].filter(block => /^\d{1,2}:\d{2}$/.test(block.time || '')).sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
  const date = today();
  const events = blocks.map((block, index) => {
    const start = new Date(`${date}T${block.time}:00`);
    const next = blocks[index + 1] ? new Date(`${date}T${blocks[index + 1].time}:00`) : new Date(start.getTime() + 60 * 60 * 1000);
    const end = next > start ? next : new Date(start.getTime() + 60 * 60 * 1000);
    return ['BEGIN:VEVENT', `UID:dayone-${date}-${block.id || index}@dayone.local`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, `SUMMARY:${escapeIcs(block.name)}`, 'END:VEVENT'].join('\r\n');
  });
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DAY ONE//Daily plan//EN', 'CALSCALE:GREGORIAN', ...events, 'END:VCALENDAR', ''].join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = 'dayone-today.ics'; link.hidden = true;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
  button.textContent = 'Ready';
  setTimeout(() => { if (button.isConnected) button.textContent = button.hasAttribute('data-send-calendar') ? 'Send the day to my calendar' : 'Send'; }, 1200);
}

function dismissSheet() {
  const base = sheetBaseViews[state.view];
  if (!base) return;
  const finish = () => { state.view = base; save(); render(); };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sheet = document.querySelector('.sheet');
  const backdrop = document.querySelector('.sheet-backdrop');
  if (!sheet || reduced) { finish(); return; }
  sheet.classList.add('is-closing');
  backdrop?.classList.add('is-closing');
  setTimeout(finish, 320);
}

function readOnboardingGoalDraft() {
  const current = onboardingGoalDraft();
  const nameInput = document.querySelector('#onb-goal-name');
  const priceInput = document.querySelector('#onb-goal-price');
  return {
    ...current,
    name: nameInput ? nameInput.value.trim() : current.name,
    price: priceInput ? Math.max(0, Number(priceInput.value) || 0) : current.price
  };
}
function refreshGoalOnboardingPreview() {
  const draft = readOnboardingGoalDraft();
  state.goalDraft = draft;
  save();
  const options = document.querySelector('[data-goal-pace-options]');
  if (options) options.innerHTML = goalPaceCards(draft);
  const preview = document.querySelector('[data-goal-preview]');
  if (preview) preview.outerHTML = goalOnboardingPreview(draft);
  bindGoalOnboardingControls();
}
function bindGoalOnboardingControls() {
  document.querySelectorAll('[data-goal-pace]').forEach(button => button.onclick = () => {
    const draft = readOnboardingGoalDraft();
    draft.pace = button.dataset.goalPace;
    state.goalDraft = draft;
    refreshGoalOnboardingPreview();
  });
  document.querySelectorAll('[data-goal-preset]').forEach(button => button.onclick = () => {
    const name = button.dataset.goalPreset || '';
    const price = Number(button.dataset.goalPrice) || 0;
    const nameInput = document.querySelector('#onb-goal-name');
    const priceInput = document.querySelector('#onb-goal-price');
    if (nameInput) nameInput.value = name;
    if (priceInput) priceInput.value = price;
    state.goalDraft = { ...readOnboardingGoalDraft(), name, price };
    refreshGoalOnboardingPreview();
  });
  document.querySelectorAll('#onb-goal-name, #onb-goal-price').forEach(input => input.oninput = refreshGoalOnboardingPreview);
}

function wire() {
  document.querySelectorAll('[data-nav]').forEach(button => button.onclick = () => { if (button.dataset.nav === 'onboarding') { state.onbStep = 1; state.onbMotion = 'boot'; state.onboarded = false; } if (button.dataset.nav === 'letter') state.letterFrom = state.view; state.view = button.dataset.nav; save(); render(); });
  document.querySelectorAll('[data-sheet-dismiss]').forEach(button => button.onclick = dismissSheet);
  document.querySelectorAll('[data-onb-next]').forEach(button => button.onclick = () => { state.onbStep = Number(button.dataset.onbNext); state.onbMotion = 'step'; if (state.onbStep === 3) state.blocks = generateBlocks(); save(); render(); });
  bindGoalOnboardingControls();
  document.querySelectorAll('[data-goal-next]').forEach(button => button.onclick = () => { const draft = readOnboardingGoalDraft(); state.goal = goalIsActive(draft) ? { name: draft.name, price: draft.price, pace: draft.pace, currencyCode: currencyCode(), startedAt: state.goal?.startedAt || today() } : null; state.goalDraft = null; state.onbStep = 5; state.onbMotion = 'step'; save(); render(); });
  document.querySelectorAll('[data-goal-skip]').forEach(button => button.onclick = () => { state.goal = null; state.goalDraft = null; state.onbStep = 5; state.onbMotion = 'step'; save(); render(); });
  document.querySelectorAll('[data-onb-choice]').forEach(button => button.onclick = () => { const key = button.dataset.onbChoice; if (key === 'focus') state.focusLabel = button.dataset.value; else state[key] = button.dataset.value; document.querySelectorAll(`[data-onb-choice="${key}"]`).forEach(choice => choice.classList.toggle('selected', choice.dataset.value === (key === 'focus' ? focusDisplayLabel() : state[key]))); save(); });
  document.querySelectorAll('[data-finish]').forEach(button => button.onclick = () => { state.name = document.querySelector('#onb-name')?.value || state.name; state.startDate = button.dataset.finish === 'tomorrow' ? new Date(Date.now() + 86400000).toISOString().slice(0, 10) : today(); state.preview = button.dataset.finish === 'tomorrow'; state.onboarded = true; state.blocks = state.blocks.length ? state.blocks : generateBlocks(); state.view = 'morning'; save(); render(); });
  document.querySelectorAll('[data-open-block]').forEach(button => button.onclick = () => { if (!button.dataset.openBlock) return; state.activeBlock = button.dataset.openBlock; state.view = 'live'; save(); render(); });
  document.querySelectorAll('[data-calm], [data-streak], [data-schedule]').forEach(button => button.onclick = () => { state.view = button.hasAttribute('data-calm') ? 'calm' : button.hasAttribute('data-streak') ? 'streak' : 'schedule'; save(); render(); });
  document.querySelectorAll('[data-live-done]').forEach(button => button.onclick = () => { const block = state.blocks.find(item => item.id === state.activeBlock); if (block?.done) state.view = 'jcompose'; else completeBlock(state.activeBlock); if (block?.done) { save(); render(); } });
  document.querySelectorAll('[data-shuffle-move]').forEach(button => button.onclick = () => { const block = state.blocks.find(item => item.id === state.activeBlock); if (block) { const moves = ['Open the document and write one line.', 'Put both feet on the floor.', 'Choose the smallest next action.', 'Set a 25-minute timer.']; block.firstMove = moves[Math.floor(Math.random() * moves.length)]; save(); render(); } });
  document.querySelectorAll('[data-live-plan]').forEach(input => input.onchange = () => { const block = state.blocks.find(item => item.id === input.dataset.livePlan); if (block) { block.planDone = input.checked; save(); } });
  document.querySelectorAll('[data-ci-answer]').forEach(button => button.onclick = () => { state.checkinNote = document.querySelector('#ci-note')?.value || state.checkinNote || ''; state.checkinAnswered = true; state.checkinAnswer = button.dataset.ciAnswer; save(); render(); });
  document.querySelectorAll('[data-ci-blocker]').forEach(button => button.onclick = () => { state.checkinNote = document.querySelector('#ci-note')?.value || state.checkinNote || ''; state.checkinBlocker = button.dataset.ciBlocker; save(); render(); });
  document.querySelector('#ci-note')?.addEventListener('input', event => { state.checkinNote = event.target.value; save(); });
  document.querySelectorAll('[data-proof-skip]').forEach(button => button.onclick = () => { state.checkinNote = document.querySelector('#ci-note')?.value || state.checkinNote || ''; state.proofSkipped = true; save(); render(); });
  document.querySelectorAll('[data-proof-open]').forEach(button => button.onclick = () => { state.checkinNote = document.querySelector('#ci-note')?.value || state.checkinNote || ''; const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'; input.onchange = () => { if (input.files?.[0]) { state.proof = true; save(); render(); } }; input.click(); });
  document.querySelectorAll('[data-ci-log]').forEach(button => button.onclick = () => { if (!button.classList.contains('off')) completeCheckin(); });
  document.querySelectorAll('[data-celebrate-next]').forEach(button => button.onclick = () => { state.view = 'today'; save(); render(); });
  document.querySelectorAll('[data-morning-open]').forEach(button => button.onclick = () => { state.view = 'morning'; render(); });
  document.querySelectorAll('[data-morning-continue]').forEach(button => button.onclick = () => { state.intention = document.querySelector('#morning-intention')?.value.trim() || state.intention; state.morningSeenDate = today(); state.view = 'today'; save(); render(); });
  document.querySelectorAll('[data-close-day]').forEach(button => button.onclick = () => { state.view = 'close'; render(); });
  document.querySelectorAll('[data-close-feeling]').forEach(button => button.onclick = () => { state.closeNote = document.querySelector('#close-note')?.value || state.closeNote || ''; state.closeFeeling = button.dataset.closeFeeling; save(); render(); });
  document.querySelector('#close-note')?.addEventListener('input', event => { state.closeNote = event.target.value; save(); });
  document.querySelectorAll('[data-close-save]').forEach(button => button.onclick = () => { state.closeNote = document.querySelector('#close-note')?.value.trim() || state.closeNote; if (state.closeNote) state.journal.push({ date: today(), createdAt: new Date().toISOString(), block: 'Close the day', answer: state.closeFeeling || 'Enough', note: state.closeNote }); state.closedDate = today(); state.view = 'today'; save(); render(); });
  document.querySelectorAll('[data-rescue]').forEach(button => button.onclick = () => { state.rescueStartedAt = Date.now(); state.view = 'rescue'; save(); render(); });
  document.querySelectorAll('[data-rescue-finish]').forEach(button => button.onclick = () => { state.rescueStartedAt = 0; state.journal.push({ date: today(), createdAt: new Date().toISOString(), block: '10-minute rescue', answer: 'Returned', note: 'I used the smaller door.' }); state.view = 'celebrate'; save(); render(); });
  document.querySelectorAll('[data-calm-energy]').forEach(button => button.onclick = () => { state.intention = document.querySelector('#intention')?.value || state.intention || ''; state.holdDraft = document.querySelector('#hold-name')?.value || state.holdDraft || ''; state.energy = Number(button.dataset.calmEnergy); save(); applyAppearance(); render(); });
  document.querySelectorAll('[data-save-intention]').forEach(button => button.onclick = () => { state.intention = document.querySelector('#intention')?.value || ''; save(); render(); });
  document.querySelectorAll('[data-protect-hold]').forEach(button => button.onclick = () => { const name = document.querySelector('#hold-name')?.value.trim(); const start = document.querySelector('#hold-start')?.value || '12:00'; const end = document.querySelector('#hold-end')?.value || '13:00'; if (name) { state.holds.push({ name, start, end }); state.holdDraft = ''; save(); render(); } });
  document.querySelectorAll('[data-remove-hold]').forEach(button => button.onclick = () => { state.holds.splice(Number(button.dataset.removeHold), 1); save(); render(); });
  document.querySelectorAll('[data-rebalance]').forEach(button => button.onclick = () => { state.blocks = generateBlocks(); save(); render(); });
  document.querySelectorAll('[data-add-task]').forEach(button => button.onclick = () => { const input = document.querySelector('#task-new'); if (input?.value.trim()) { const task = { id: `t${Date.now()}`, text: input.value.trim(), blockId: null, done: false }; state.tasks.push(task); state.taskAssignId = task.id; save(); render(); } });
  document.querySelectorAll('[data-toggle-task]').forEach(button => button.onclick = () => { const task = state.tasks.find(item => item.id === button.dataset.toggleTask); if (task) { task.done = !task.done; save(); render(); } });
  document.querySelectorAll('[data-delete-task]').forEach(button => button.onclick = event => { event.stopPropagation(); state.tasks = state.tasks.filter(task => task.id !== button.dataset.deleteTask); save(); render(); });
  document.querySelectorAll('[data-open-task-assign]').forEach(button => button.onclick = () => { state.taskAssignId = button.dataset.openTaskAssign; save(); render(); });
  document.querySelectorAll('[data-close-task-assign]').forEach(button => button.onclick = () => { state.taskAssignId = ''; save(); render(); });
  document.querySelectorAll('[data-assign-task]').forEach(button => button.onclick = () => { const task = state.tasks.find(item => item.id === button.dataset.assignTask); if (task) { task.blockId = button.dataset.blockId; state.taskAssignId = ''; save(); render(); } });
  document.querySelectorAll('[data-task-swipe]').forEach(swipe => { const row = swipe.querySelector('[data-task-swipe-row]'); let startX = 0; let deltaX = 0; swipe.onpointerdown = event => { startX = event.clientX; deltaX = 0; row.setPointerCapture?.(event.pointerId); }; swipe.onpointermove = event => { if (!startX) return; deltaX = Math.min(0, Math.max(-88, event.clientX - startX)); swipe.classList.toggle('is-revealing', deltaX < -6); row.style.transform = `translateX(${deltaX}px)`; }; const release = () => { if (!startX) return; const revealed = deltaX < -42; swipe.classList.remove('is-revealing'); swipe.classList.toggle('is-revealed', revealed); row.style.transform = revealed ? 'translateX(-76px)' : ''; startX = 0; }; swipe.onpointerup = release; swipe.onpointercancel = release; });
  document.querySelectorAll('[data-split-tasks]').forEach(button => button.onclick = () => { state.tasks.filter(task => !task.blockId).forEach((task, index) => task.blockId = state.blocks[index % Math.max(1, state.blocks.length)]?.id || null); save(); render(); });
  document.querySelectorAll('[data-sc-save]').forEach(button => button.onclick = () => { const block = state.blocks.find(item => item.id === button.dataset.scSave); if (block) { block.time = document.querySelector(`[data-sc-time="${block.id}"]`).value; block.name = document.querySelector(`[data-sc-name="${block.id}"]`).value; save(); render(); } });
  document.querySelectorAll('[data-add-block]').forEach(button => button.onclick = () => { state.blocks.push({ id: `b${Date.now()}`, name: 'New block', time: '18:00', done: false, firstMove: 'Choose the smallest next action.' }); save(); render(); });
  document.querySelectorAll('[data-stats-day]').forEach(button => button.onclick = () => { state.statsDate = button.dataset.statsDay; state.view = 'daystory'; save(); render(); });
  document.querySelectorAll('[data-j-story-date], [data-story-preview]').forEach(button => button.onclick = () => { state.statsDate = button.dataset.jStoryDate || button.dataset.storyPreview; state.view = 'daystory'; save(); render(); });
  document.querySelectorAll('[data-story-close]').forEach(button => button.onclick = () => { state.view = 'stats'; save(); render(); });
  document.querySelectorAll('[data-j-mood]').forEach(button => button.onclick = () => { state.jText = document.querySelector('#j-text')?.value || state.jText || ''; state.jMood = button.dataset.jMood; save(); render(); });
  document.querySelectorAll('[data-j-chip]').forEach(button => button.onclick = () => { const current = document.querySelector('#j-text')?.value || state.jText || ''; state.jText = current ? `${current}\n${button.dataset.jChip}` : button.dataset.jChip; save(); render(); document.querySelector('#j-text')?.focus(); });
  document.querySelectorAll('[data-j-save]').forEach(button => button.onclick = () => { if (button.classList.contains('off')) return; state.jText = document.querySelector('#j-text')?.value || state.jText; state.journal.push({ date: today(), createdAt: new Date().toISOString(), block: 'Journal', answer: state.jMood || 'Okay', note: state.jText }); state.jMood = ''; state.jText = ''; state.view = 'journal'; save(); render(); });
  document.querySelectorAll('[data-j-date]').forEach(button => button.onclick = () => setJournalDate(button.dataset.jDate));
  document.querySelectorAll('[data-j-see-all]').forEach(button => button.onclick = () => { const latest = state.journal.at(-1)?.date || today(); setJournalDate(latest); document.querySelector('.journal-day-group')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); });
  const rail = document.querySelector('[data-j-rail]');
  rail?.querySelector('.selected')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  const stack = document.querySelector('[data-j-stack]');
  if (stack) { let startX = 0; let deltaX = 0; stack.onpointerdown = event => { startX = event.clientX; deltaX = 0; stack.setPointerCapture?.(event.pointerId); stack.classList.add('dragging'); }; stack.onpointermove = event => { if (!stack.classList.contains('dragging')) return; deltaX = event.clientX - startX; stack.style.setProperty('--drag-x', `${Math.max(-96, Math.min(96, deltaX))}px`); }; stack.onpointerup = () => { stack.classList.remove('dragging'); stack.style.removeProperty('--drag-x'); if (Math.abs(deltaX) > 54) { const next = journalOffset(selectedJournalDate()) + (deltaX < 0 ? 1 : -1); setJournalDate(journalDay(Math.min(90, Math.max(0, next)))); } }; stack.onpointercancel = stack.onpointerup; }
  document.querySelectorAll('[data-load-demo]').forEach(button => button.onclick = loadDemo);
  document.querySelectorAll('[data-reset-app]').forEach(button => button.onclick = resetApp);
  document.querySelectorAll('[data-export]').forEach(button => button.onclick = exportData);
  document.querySelectorAll('[data-backend-check]').forEach(button => button.onclick = checkBackend);
  document.querySelectorAll('[data-letter-close]').forEach(button => button.onclick = () => { state.view = state.letterFrom || 'today'; save(); render(); });
  document.querySelectorAll('[data-notif]').forEach(button => button.onclick = requestNotifications);
  document.querySelectorAll('[data-settings-notifications]').forEach(button => button.onclick = () => { if (('Notification' in window ? Notification.permission : 'unsupported') === 'granted') { state.notificationsEnabled = state.notificationsEnabled === false; save(); render(); } else requestNotifications(); });
  document.querySelectorAll('[data-settings-test]').forEach(button => button.onclick = () => { if ('Notification' in window && Notification.permission === 'granted') new Notification('DAY ONE', { body: 'Your next block is ready when you are.' }); else requestNotifications(); });
  document.querySelectorAll('[data-settings-alarm]').forEach(button => button.onclick = () => { state.backgroundAlarms = !state.backgroundAlarms; save(); render(); });
  document.querySelectorAll('[data-save-currency]').forEach(button => button.onclick = () => { const input = document.querySelector('#goal-currency'); const candidate = String(input?.value || '').trim().toUpperCase(); try { new Intl.NumberFormat(undefined, { style: 'currency', currency: candidate }); state.currencyCode = candidate; save(); render(); } catch { if (input) { input.setCustomValidity('Use a valid three-letter currency code.'); input.reportValidity(); } } });
  document.querySelectorAll('[data-goal-transfer]').forEach(button => button.onclick = () => { const pot = computePot(); if (pot.transferPending <= 0) return; historyDay(today(), true).transfers.push({ amount: pot.transferPending, at: new Date().toISOString() }); save(); render(); });
  document.querySelectorAll('button[data-theme]').forEach(button => button.onclick = () => { state.theme = button.dataset.theme; save(); applyAppearance(); render(); });
  document.querySelectorAll('button[data-accent]').forEach(button => button.onclick = () => { state.accent = button.dataset.accent; save(); applyAppearance(); render(); });
  document.querySelectorAll('[data-sounds]').forEach(button => button.onclick = () => { state.sounds = state.sounds === false; save(); render(); });
  document.querySelectorAll('[data-live-style]').forEach(button => button.onclick = () => { state.liveStyle = button.dataset.liveStyle || (state.liveStyle === 'bold' ? 'subtle' : 'bold'); save(); render(); });
  document.querySelectorAll('[data-send-calendar], [data-calendar]').forEach(button => button.onclick = () => exportTodayCalendar(button));
  document.querySelectorAll('[data-share-card]').forEach(button => button.onclick = () => { if (navigator.share) navigator.share({ title: 'DAY ONE', text: 'I kept showing up.' }).catch(() => {}); else button.textContent = 'Shared'; });
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
applyAppearance();
recoverTransientView();
render();
