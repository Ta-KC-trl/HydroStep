/* ============================================
   HydroStep — Popup Logic
   ============================================ */

const WATER_RING_CIRCUMFERENCE = 2 * Math.PI * 68; // ~427
const STEPS_RING_CIRCUMFERENCE = 2 * Math.PI * 50; // ~314

// ── Helpers ──────────────────────────────────
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function yesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dateLabel(key) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return { day: d, month: months[dt.getMonth()], weekday: dt.toLocaleDateString('en', { weekday: 'short' }) };
}

function showToast(msg) {
  let t = document.querySelector('.toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

// ── Inject SVG gradient (needed for ring stroke) ─
function injectGradient() {
  const svg = document.querySelector('.ring-svg');
  if(!svg) return;
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  
  // Water Gradient (Blue)
  const lg1 = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
  lg1.id = 'ring-gradient';
  lg1.setAttribute('x1', '0%'); lg1.setAttribute('y1', '0%');
  lg1.setAttribute('x2', '100%'); lg1.setAttribute('y2', '100%');
  const s1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  s1.setAttribute('offset', '0%'); s1.setAttribute('stop-color', '#0A84FF');
  const s2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  s2.setAttribute('offset', '100%'); s2.setAttribute('stop-color', '#64D2FF');
  lg1.appendChild(s1); lg1.appendChild(s2);
  defs.appendChild(lg1);

  // Steps Gradient (Purple)
  const lg2 = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
  lg2.id = 'steps-gradient';
  lg2.setAttribute('x1', '0%'); lg2.setAttribute('y1', '0%');
  lg2.setAttribute('x2', '100%'); lg2.setAttribute('y2', '100%');
  const s3 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  s3.setAttribute('offset', '0%'); s3.setAttribute('stop-color', '#BF5AF2'); // Apple Purple
  const s4 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  s4.setAttribute('offset', '100%'); s4.setAttribute('stop-color', '#E0B0FF'); 
  lg2.appendChild(s3); lg2.appendChild(s4);
  defs.appendChild(lg2);
  
  svg.prepend(defs);
}

// ── Data Layer ───────────────────────────────
let tempSettings = { startHour: 9, endHour: 21, waterGoal: 8, stepsGoal: 10 };

async function getSettings() {
  const res = await chrome.storage.local.get('settings');
  return res.settings || { startHour: 9, endHour: 21, waterGoal: 8, stepsGoal: 10 };
}

async function saveSettings(settings) {
  await chrome.storage.local.set({ settings });
}

async function getStreak() {
  const res = await chrome.storage.local.get(['currentStreak', 'lastGoalDate']);
  return { streak: res.currentStreak || 0, lastDate: res.lastGoalDate || null };
}

async function setStreak(streak, date) {
  await chrome.storage.local.set({ currentStreak: streak, lastGoalDate: date });
}

async function getTodayData() {
  const key = todayKey();
  const result = await chrome.storage.local.get(key);
  if (!result[key]) {
    const init = { glasses: 0, stepsCompleted: [], date: key };
    await chrome.storage.local.set({ [key]: init });
    return init;
  }
  return result[key];
}

async function saveTodayData(data) {
  const key = todayKey();
  await chrome.storage.local.set({ [key]: data });
}

async function getYesterdayData() {
  const key = yesterdayKey();
  const result = await chrome.storage.local.get(key);
  return result[key] || null;
}

async function getHistory(days = 7) {
  const keys = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  const result = await chrome.storage.local.get(keys);
  return keys.map(k => result[k] ? { ...result[k], _key: k } : null).filter(Boolean);
}

// ── Logic ────────────────────────────────────

async function checkAndUpdateStreak() {
  const settings = await getSettings();
  const today = await getTodayData();
  const streakInfo = await getStreak();
  
  const waterMet = today.glasses >= settings.waterGoal;
  const stepsMet = today.stepsCompleted.length >= settings.stepsGoal;
  
  if (waterMet && stepsMet) {
    const tKey = todayKey();
    if (streakInfo.lastDate !== tKey) {
      // Met goals for the first time today
      if (streakInfo.lastDate === yesterdayKey()) {
        await setStreak(streakInfo.streak + 1, tKey);
      } else {
        await setStreak(1, tKey);
      }
      showToast('🔥 Daily goals met! Streak updated!');
      renderStreak(); // update UI
    }
  }
}

function notifyBackgroundToResetTimer() {
  chrome.runtime.sendMessage({ action: "resetTimer" });
}

// ── UI Updates ───────────────────────────────
function updateRing(glasses, goal) {
  const el = document.getElementById('ring-fill-water');
  const offset = WATER_RING_CIRCUMFERENCE - (glasses / goal) * WATER_RING_CIRCUMFERENCE;
  el.style.strokeDashoffset = Math.max(offset, 0);

  document.getElementById('water-count').textContent = glasses;
  document.getElementById('water-goal').textContent = goal;

  const card = document.querySelector('.ring-card');
  if (glasses >= goal) {
    card.classList.add('complete');
  } else {
    card.classList.remove('complete');
  }
}

function updateSteps(stepsArr, goal) {
  const count = stepsArr.length;
  // Update inner ring
  const el = document.getElementById('ring-fill-steps');
  const offset = STEPS_RING_CIRCUMFERENCE - (count / goal) * STEPS_RING_CIRCUMFERENCE;
  el.style.strokeDashoffset = Math.max(offset, 0);

  // Update text label
  document.getElementById('steps-done').textContent = count;
  document.getElementById('steps-goal').textContent = goal;
}

async function updateComparison(todayGlasses) {
  const yesterday = await getYesterdayData();
  const iconEl = document.getElementById('compare-icon');
  const textEl = document.getElementById('compare-text');

  if (!yesterday) {
    iconEl.textContent = '—';
    iconEl.className = 'compare-icon';
    textEl.textContent = 'No data from yesterday';
    return;
  }

  const diff = todayGlasses - yesterday.glasses;

  if (diff > 0) {
    iconEl.textContent = '↑';
    iconEl.className = 'compare-icon up';
    textEl.textContent = `${diff} more than yesterday — keep it up! 🎉`;
  } else if (diff < 0) {
    iconEl.textContent = '↓';
    iconEl.className = 'compare-icon down';
    textEl.textContent = `${Math.abs(diff)} fewer than yesterday — drink up! 💪`;
  } else {
    iconEl.textContent = '=';
    iconEl.className = 'compare-icon same';
    textEl.textContent = `Same as yesterday (${yesterday.glasses}) — stay consistent! ✨`;
  }
}

async function renderStreak() {
  const streakInfo = await getStreak();
  // If streak was lost (lastDate is older than yesterday and not today), visual streak is 0
  let displayStreak = streakInfo.streak;
  if (streakInfo.lastDate && streakInfo.lastDate !== todayKey() && streakInfo.lastDate !== yesterdayKey()) {
    displayStreak = 0;
  }
  document.getElementById('streak-count').textContent = displayStreak;
}

async function renderHistory() {
  const list = document.getElementById('history-list');
  const records = await getHistory(7);
  const settings = await getSettings(); // use current settings for past bars

  if (records.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📊</div>
        <p>No history yet — start tracking today!</p>
      </div>`;
    return;
  }

  list.innerHTML = records.map(r => {
    const label = dateLabel(r._key);
    const stepCount = r.stepsCompleted ? r.stepsCompleted.length : 0;
    const waterPct = Math.min((r.glasses / settings.waterGoal) * 100, 100);
    const stepsPct = Math.min((stepCount / settings.stepsGoal) * 100, 100);

    return `
    <div class="history-item">
      <div class="history-date">
        <span class="history-day">${label.day}</span>
        <span class="history-month">${label.month}</span>
      </div>
      <div class="history-stats">
        <div class="history-stat">
          <span class="history-stat-icon">💧</span>
          <div class="history-bar-wrap"><div class="history-bar water" style="width:${waterPct}%"></div></div>
          <span class="history-value">${r.glasses}/${settings.waterGoal}</span>
        </div>
        <div class="history-stat">
          <span class="history-stat-icon">👟</span>
          <div class="history-bar-wrap"><div class="history-bar steps" style="width:${stepsPct}%"></div></div>
          <span class="history-value">${stepCount}/${settings.stepsGoal}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

function formatAmPm(hour) {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  return hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
}

function updateStepperUI() {
  document.getElementById('start-val').textContent = formatAmPm(tempSettings.startHour);
  document.getElementById('end-val').textContent = formatAmPm(tempSettings.endHour);
  document.getElementById('water-val').textContent = tempSettings.waterGoal;
  document.getElementById('steps-val').textContent = tempSettings.stepsGoal;
}

async function populateSettingsForm() {
  tempSettings = await getSettings();
  updateStepperUI();
}

// ── Event Handlers ───────────────────────────
async function onDrinkWater() {
  const settings = await getSettings();
  const data = await getTodayData();
  
  if (data.glasses >= settings.waterGoal) {
    showToast(`🎉 You already hit ${settings.waterGoal} glasses!`);
    return;
  }
  
  data.glasses += 1;
  await saveTodayData(data);
  updateRing(data.glasses, settings.waterGoal);
  updateComparison(data.glasses);
  
  notifyBackgroundToResetTimer();
  await checkAndUpdateStreak();

  if (data.glasses >= settings.waterGoal) {
    showToast('🎉 Goal complete — amazing!');
  } else {
    showToast(`💧 Glass ${data.glasses} logged!`);
  }
}

async function onUndoWater() {
  const settings = await getSettings();
  const data = await getTodayData();
  if (data.glasses <= 0) {
    showToast('No glasses to remove!');
    return;
  }
  data.glasses -= 1;
  await saveTodayData(data);
  updateRing(data.glasses, settings.waterGoal);
  updateComparison(data.glasses);
  showToast(`Removed a glass. ${data.glasses} left.`);
}

async function onStepsDone() {
  const settings = await getSettings();
  const data = await getTodayData();
  const now = new Date();
  const hourKey = `${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}`;

  data.stepsCompleted.push(hourKey);
  await saveTodayData(data);
  updateSteps(data.stepsCompleted, settings.stepsGoal);
  showToast(`👟 Steps logged!`);
  
  notifyBackgroundToResetTimer();
  await checkAndUpdateStreak();
}

async function onUndoSteps() {
  const settings = await getSettings();
  const data = await getTodayData();
  if (data.stepsCompleted.length === 0) {
    showToast('No steps to remove!');
    return;
  }
  data.stepsCompleted.pop();
  await saveTodayData(data);
  updateSteps(data.stepsCompleted, settings.stepsGoal);
  showToast(`Removed a step session.`);
}

async function onSaveSettings() {
  await saveSettings(tempSettings);
  showToast('⚙️ Settings Saved!');
  
  // Refresh UI
  const data = await getTodayData();
  updateRing(data.glasses, tempSettings.waterGoal);
  updateSteps(data.stepsCompleted, tempSettings.stepsGoal);
  await checkAndUpdateStreak();
}

// ── Tab Switching ────────────────────────────
function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active');

      if (tab.dataset.tab === 'history') {
        renderHistory();
      } else if (tab.dataset.tab === 'settings') {
        populateSettingsForm();
      }
    });
  });
}

// ── Init ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  injectGradient();
  setupTabs();

  const settings = await getSettings();
  const data = await getTodayData();
  
  updateRing(data.glasses, settings.waterGoal);
  updateSteps(data.stepsCompleted, settings.stepsGoal);
  await updateComparison(data.glasses);
  await renderStreak();

  // Buttons
  document.getElementById('btn-drink').addEventListener('click', onDrinkWater);
  document.getElementById('btn-undo').addEventListener('click', onUndoWater);
  document.getElementById('btn-steps').addEventListener('click', onStepsDone);
  document.getElementById('btn-undo-steps').addEventListener('click', onUndoSteps);
  document.getElementById('btn-save-settings').addEventListener('click', onSaveSettings);

  // Steppers
  document.getElementById('start-dec').addEventListener('click', () => { if (tempSettings.startHour > 0) { tempSettings.startHour--; updateStepperUI(); }});
  document.getElementById('start-inc').addEventListener('click', () => { if (tempSettings.startHour < 23) { tempSettings.startHour++; updateStepperUI(); }});
  
  document.getElementById('end-dec').addEventListener('click', () => { if (tempSettings.endHour > 0) { tempSettings.endHour--; updateStepperUI(); }});
  document.getElementById('end-inc').addEventListener('click', () => { if (tempSettings.endHour < 23) { tempSettings.endHour++; updateStepperUI(); }});
  
  document.getElementById('water-dec').addEventListener('click', () => { if (tempSettings.waterGoal > 1) { tempSettings.waterGoal--; updateStepperUI(); }});
  document.getElementById('water-inc').addEventListener('click', () => { if (tempSettings.waterGoal < 50) { tempSettings.waterGoal++; updateStepperUI(); }});
  
  document.getElementById('steps-dec').addEventListener('click', () => { if (tempSettings.stepsGoal > 1) { tempSettings.stepsGoal--; updateStepperUI(); }});
  document.getElementById('steps-inc').addEventListener('click', () => { if (tempSettings.stepsGoal < 24) { tempSettings.stepsGoal++; updateStepperUI(); }});
});
