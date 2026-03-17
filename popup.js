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
let tempSettings = { startHour: 9, endHour: 21, waterGoal: 2000, stepsGoal: 10, theme: 'system', notifs: 'sound' };

async function getSettings() {
  const res = await chrome.storage.local.get('settings');
  let settings = res.settings || { startHour: 9, endHour: 21, waterGoal: 2000, stepsGoal: 10, theme: 'system', notifs: 'sound' };
  if (settings.theme === undefined) settings.theme = 'system';
  if (settings.notifs === undefined) settings.notifs = 'sound';
  if (settings.waterGoal < 50) settings.waterGoal = settings.waterGoal * 250; // migration
  return settings;
}

async function saveSettings(settings) {
  await chrome.storage.local.set({ settings });
}

async function getStreak() {
  const res = await chrome.storage.local.get(['currentStreak', 'lastGoalDate', 'graceWeekKey']);
  return { streak: res.currentStreak || 0, lastDate: res.lastGoalDate || null, graceWeek: res.graceWeekKey || null };
}

async function setStreak(streak, date, graceWeekStr) {
  const obj = { currentStreak: streak, lastGoalDate: date };
  if (graceWeekStr !== undefined) obj.graceWeekKey = graceWeekStr;
  await chrome.storage.local.set(obj);
}

async function getTodayData() {
  const key = todayKey();
  const result = await chrome.storage.local.get(key);
  let data = result[key];
  if (!data) {
    data = { waterMl: 0, waterHistory: [], stepsCompleted: [], date: key };
    await chrome.storage.local.set({ [key]: data });
  } else if (data.glasses !== undefined && data.waterMl === undefined) {
    data.waterMl = data.glasses * 250;
    data.waterHistory = Array(data.glasses).fill(250);
    delete data.glasses;
    await chrome.storage.local.set({ [key]: data });
  }
  return data;
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
  
  const waterMet = (today.waterMl || (today.glasses ? today.glasses * 250 : 0)) >= settings.waterGoal;
  const stepsMet = today.stepsCompleted.length >= settings.stepsGoal;
  
  if (waterMet && stepsMet) {
    const tKey = todayKey();
    if (streakInfo.lastDate !== tKey) {
      
      const yesterdayD = new Date(); yesterdayD.setDate(yesterdayD.getDate() - 1);
      const yesterdayK = `${yesterdayD.getFullYear()}-${String(yesterdayD.getMonth()+1).padStart(2,'0')}-${String(yesterdayD.getDate()).padStart(2,'0')}`;
      
      const dayBeforeD = new Date(); dayBeforeD.setDate(dayBeforeD.getDate() - 2);
      const dayBeforeK = `${dayBeforeD.getFullYear()}-${String(dayBeforeD.getMonth()+1).padStart(2,'0')}-${String(dayBeforeD.getDate()).padStart(2,'0')}`;
      
      if (streakInfo.lastDate === yesterdayK) {
        await setStreak(streakInfo.streak + 1, tKey, streakInfo.graceWeek);
        showToast('🔥 Daily goals met! Streak updated!');
      } else if (streakInfo.lastDate === dayBeforeK) {
        // Evaluate grace logic
        const currentWeekKey = getWeekKey();
        if (streakInfo.graceWeek !== currentWeekKey) {
          await setStreak(streakInfo.streak + 1, tKey, currentWeekKey);
          showToast('🛡️ Streak saved! Grace day applied!');
        } else {
          await setStreak(1, tKey, null);
          showToast('🔥 Goals met! Streak initialized.');
        }
      } else {
        await setStreak(1, tKey, null);
        showToast('🔥 Goals met! Streak initialized.');
      }
      renderStreak(); // update UI
    }
  }
}

function getWeekKey() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay() + 1); // Get Monday of this week
  return `week-${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function notifyBackgroundToResetTimer() {
  chrome.runtime.sendMessage({ action: "resetTimer" });
}

// ── UI Updates ───────────────────────────────
function updateRing(currentMl, goalMl) {
  const el = document.getElementById('ring-fill-water');
  const offset = WATER_RING_CIRCUMFERENCE - (currentMl / goalMl) * WATER_RING_CIRCUMFERENCE;
  el.style.strokeDashoffset = Math.max(offset, 0);

  document.getElementById('water-count').textContent = currentMl;
  document.getElementById('water-goal').textContent = goalMl;

  const card = document.querySelector('.ring-card');
  if (currentMl >= goalMl) {
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

async function updateComparison(todayMl) {
  const yesterday = await getYesterdayData();
  const iconEl = document.getElementById('compare-icon');
  const textEl = document.getElementById('compare-text');

  if (!yesterday) {
    iconEl.textContent = '—';
    iconEl.className = 'compare-icon';
    textEl.textContent = 'No data from yesterday';
    return;
  }

  let yMl = yesterday.waterMl || (yesterday.glasses ? yesterday.glasses * 250 : 0);
  const diff = todayMl - yMl;

  if (diff > 0) {
    iconEl.textContent = '↑';
    iconEl.className = 'compare-icon up';
    textEl.textContent = `${diff}ml more than yesterday — keep it up! 🎉`;
  } else if (diff < 0) {
    iconEl.textContent = '↓';
    iconEl.className = 'compare-icon down';
    textEl.textContent = `${Math.abs(diff)}ml fewer than yesterday — drink up! 💪`;
  } else {
    iconEl.textContent = '=';
    iconEl.className = 'compare-icon same';
    textEl.textContent = `Same as yesterday (${yMl}ml) — stay consistent! ✨`;
  }
}

async function renderStreak() {
  const streakInfo = await getStreak();
  // Valid states for keeping visual streak: tKey, yesterdayK, or (dayBeforeK IF grace week not used)
  let displayStreak = streakInfo.streak;
  const tKey = todayKey();
  const yesterdayD = new Date(); yesterdayD.setDate(yesterdayD.getDate() - 1);
  const yesterdayK = `${yesterdayD.getFullYear()}-${String(yesterdayD.getMonth()+1).padStart(2,'0')}-${String(yesterdayD.getDate()).padStart(2,'0')}`;
  
  const dayBeforeD = new Date(); dayBeforeD.setDate(dayBeforeD.getDate() - 2);
  const dayBeforeK = `${dayBeforeD.getFullYear()}-${String(dayBeforeD.getMonth()+1).padStart(2,'0')}-${String(dayBeforeD.getDate()).padStart(2,'0')}`;

  const currentW = getWeekKey();

  if (streakInfo.lastDate && streakInfo.lastDate !== tKey && streakInfo.lastDate !== yesterdayK) {
    if (streakInfo.lastDate === dayBeforeK && streakInfo.graceWeek !== currentW) {
      // The streak visually survives today because they CAN earn it with a grace day.
    } else {
      displayStreak = 0;
    }
  }
  document.getElementById('streak-count').textContent = displayStreak;
}

async function renderAwards() {
  const streakInfo = await getStreak();
  if (streakInfo.streak >= 7) {
    document.getElementById('award-streak-7').classList.remove('locked');
  }
  if (streakInfo.streak >= 30) {
    document.getElementById('award-streak-30').classList.remove('locked');
  }
  
  // Calculate lifetime water (up to 365 days max for local storage lookup speeds)
  const records = await getHistory(365);
  let totalMl = 0;
  records.forEach(r => {
    let histMl = r.waterMl || 0;
    if (r.glasses !== undefined && r.waterMl === undefined) histMl = r.glasses * 250;
    totalMl += histMl;
  });
  
  if (totalMl >= 100000) { // 100 liters = 100,000 ml
    document.getElementById('award-water-100').classList.remove('locked');
  }
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
    
    let histMl = r.waterMl || 0;
    if (r.glasses !== undefined && r.waterMl === undefined) histMl = r.glasses * 250;
    
    const waterPct = Math.min((histMl / settings.waterGoal) * 100, 100);
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
          <span class="history-value">${histMl}/${settings.waterGoal}</span>
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

function applyTheme(themeVal) {
  let isLight = false;
  if (themeVal === 'light') {
    isLight = true;
  } else if (themeVal === 'system') {
    isLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  }
  document.body.classList.toggle('light-theme', isLight);
}

function updateStepperUI() {
  document.getElementById('start-val').textContent = formatAmPm(tempSettings.startHour);
  document.getElementById('end-val').textContent = formatAmPm(tempSettings.endHour);
  document.getElementById('water-val').textContent = tempSettings.waterGoal;
  document.getElementById('steps-val').textContent = tempSettings.stepsGoal;
  document.getElementById('set-theme').value = tempSettings.theme;
  document.getElementById('set-notifs').value = tempSettings.notifs;
  
  applyTheme(tempSettings.theme);
}

async function populateSettingsForm() {
  tempSettings = await getSettings();
  updateStepperUI();
}

// ── Event Handlers ───────────────────────────
async function onDrinkWater(ml) {
  const settings = await getSettings();
  const data = await getTodayData();
  
  if (data.waterMl >= settings.waterGoal) {
    showToast(`🎉 You already hit ${settings.waterGoal}ml!`);
    return;
  }
  
  data.waterMl = (data.waterMl || 0) + ml;
  if (!data.waterHistory) data.waterHistory = [];
  data.waterHistory.push(ml);

  await saveTodayData(data);
  updateRing(data.waterMl, settings.waterGoal);
  updateComparison(data.waterMl);
  
  notifyBackgroundToResetTimer();
  await checkAndUpdateStreak();

  if (data.waterMl >= settings.waterGoal) {
    showToast('🎉 Goal complete — amazing!');
  } else {
    showToast(`💧 ${ml}ml logged!`);
  }
}

async function onUndoWater() {
  const settings = await getSettings();
  const data = await getTodayData();
  if (data.waterMl <= 0) {
    showToast('No water to remove!');
    return;
  }
  
  let removedMl = 250;
  if (data.waterHistory && data.waterHistory.length > 0) {
    removedMl = data.waterHistory.pop();
  }
  
  data.waterMl = Math.max(0, data.waterMl - removedMl);
  await saveTodayData(data);
  updateRing(data.waterMl, settings.waterGoal);
  updateComparison(data.waterMl);
  showToast(`Removed ${removedMl}ml. ${data.waterMl}ml left.`);
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
  updateRing(data.waterMl, tempSettings.waterGoal);
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
      } else if (tab.dataset.tab === 'awards') {
        renderAwards();
      }
    });
  });
}

async function checkWeeklySummary() {
  const d = new Date();
  if (d.getDay() === 1) { // 1 = Monday
    const key = `week-${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const res = await chrome.storage.local.get(key);
    if (!res[key]) {
      const records = await getHistory(7);
      if (records.length > 0) {
        let totalWater = 0;
        let totalSteps = 0;
        records.forEach(r => {
          let histMl = r.waterMl || 0;
          if (r.glasses !== undefined && r.waterMl === undefined) histMl = r.glasses * 250;
          totalWater += histMl;
          totalSteps += (r.stepsCompleted ? r.stepsCompleted.length : 0);
        });
        const avgWater = Math.round(totalWater / records.length);
        
        document.getElementById('avg-water').textContent = avgWater + 'ml';
        document.getElementById('total-steps-week').textContent = totalSteps;
        document.getElementById('weekly-modal').showModal();
        
        document.getElementById('btn-close-summary').onclick = () => {
          document.getElementById('weekly-modal').close();
          chrome.storage.local.set({ [key]: true });
        };
      } else {
        chrome.storage.local.set({ [key]: true });
      }
    }
  }
}

// ── Init ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  chrome.action.setBadgeText({ text: '' });
  injectGradient();
  setupTabs();

  const settings = await getSettings();
  applyTheme(settings.theme);
  const data = await getTodayData();
  
  updateRing(data.waterMl, settings.waterGoal);
  updateSteps(data.stepsCompleted, settings.stepsGoal);
  await updateComparison(data.waterMl);
  await renderStreak();

  // Buttons
  document.querySelectorAll('.btn-drink').forEach(btn => {
    btn.addEventListener('click', (e) => onDrinkWater(parseInt(e.target.dataset.ml, 10)));
  });
  
  // Refresh UI early calls to init settings
  (async () => {
    const s = await getSettings();
    const d = await getTodayData();
    updateRing(d.waterMl, s.waterGoal);
  })();

  document.getElementById('btn-undo').addEventListener('click', onUndoWater);
  document.getElementById('btn-steps').addEventListener('click', onStepsDone);
  document.getElementById('btn-undo-steps').addEventListener('click', onUndoSteps);
  document.getElementById('btn-save-settings').addEventListener('click', onSaveSettings);

  // Advanced Settings
  document.getElementById('set-theme').addEventListener('change', (e) => {
    tempSettings.theme = e.target.value;
    applyTheme(tempSettings.theme);
  });
  document.getElementById('set-notifs').addEventListener('change', (e) => {
    tempSettings.notifs = e.target.value;
  });
  document.getElementById('btn-calc-goal').addEventListener('click', () => {
    const w = parseFloat(document.getElementById('set-weight').value);
    if (!w || isNaN(w)) return showToast('Please enter a valid weight');
    tempSettings.waterGoal = Math.round((w * 35) / 50) * 50; // nearest 50ml
    updateStepperUI();
    showToast('Calculated! Save to apply.');
  });

  // Steppers
  document.getElementById('start-dec').addEventListener('click', () => { if (tempSettings.startHour > 0) { tempSettings.startHour--; updateStepperUI(); }});
  document.getElementById('start-inc').addEventListener('click', () => { if (tempSettings.startHour < 23) { tempSettings.startHour++; updateStepperUI(); }});
  
  document.getElementById('end-dec').addEventListener('click', () => { if (tempSettings.endHour > 0) { tempSettings.endHour--; updateStepperUI(); }});
  document.getElementById('end-inc').addEventListener('click', () => { if (tempSettings.endHour < 23) { tempSettings.endHour++; updateStepperUI(); }});
  
  document.getElementById('water-dec').addEventListener('click', () => { if (tempSettings.waterGoal > 100) { tempSettings.waterGoal -= 100; updateStepperUI(); }});
  document.getElementById('water-inc').addEventListener('click', () => { if (tempSettings.waterGoal < 10000) { tempSettings.waterGoal += 100; updateStepperUI(); }});
  
  document.getElementById('steps-dec').addEventListener('click', () => { if (tempSettings.stepsGoal > 1) { tempSettings.stepsGoal--; updateStepperUI(); }});
  document.getElementById('steps-inc').addEventListener('click', () => { if (tempSettings.stepsGoal < 24) { tempSettings.stepsGoal++; updateStepperUI(); }});

  await checkWeeklySummary();
});
