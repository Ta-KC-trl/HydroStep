/* ============================================
   HydroStep — Background Service Worker
   ============================================ */

const ALARM_NAME = "hydrostep-hourly";

// ── Helpers ──────────────────────────────────
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

async function getSettings() {
  const res = await chrome.storage.local.get('settings');
  return res.settings || { startHour: 9, endHour: 21, waterGoal: 8, stepsGoal: 10 };
}

async function isWorkingHour() {
  const settings = await getSettings();
  const hour = new Date().getHours();
  return hour >= settings.startHour && hour < settings.endHour;
}

// ── Install / Start-up ──────────────────────
chrome.runtime.onInstalled.addListener(() => {
  resetSmartTimer();
  initDay();
});

chrome.runtime.onStartup.addListener(() => {
  initDay();
});

async function initDay() {
  const key = todayKey();
  const data = await chrome.storage.local.get(key);
  if (!data[key]) {
    await chrome.storage.local.set({
      [key]: {
        glasses: 0,
        stepsCompleted: [],
        date: key
      }
    });
  }
}

// ── Smart Timer Logic ────────────────────────
function resetSmartTimer() {
  // Clear existing alarm and create a new one exactly 60 minutes from now
  chrome.alarms.clear(ALARM_NAME, () => {
    chrome.alarms.create(ALARM_NAME, {
      delayInMinutes: 60,
      periodInMinutes: 60 // fallback if they miss it, it pings every hour
    });
  });
}

// Listen for popup actions (Drink / Steps) to reset timer smartly
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "resetTimer") {
    resetSmartTimer();
    console.log("HydroStep: Smart Timer reset to 60 minutes from now.");
  }
});

// ── Alarm Handler ────────────────────────────
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  const working = await isWorkingHour();
  if (!working) return;

  await initDay();

  const settings = await getSettings();
  const key = todayKey();
  const stored = await chrome.storage.local.get(key);
  const today = stored[key] || { glasses: 0, stepsCompleted: [] };

  const remainingWater = settings.waterGoal - today.glasses;
  const hour = new Date().getHours();
  const hoursLeft = settings.endHour - hour;

  let waterMsg = remainingWater > 0
    ? `💧 ${remainingWater} glass${remainingWater > 1 ? 'es' : ''} left today — keep sipping!`
    : `✅ You've hit your water goal — great job!`;

  chrome.notifications.create(`hydrostep-${Date.now()}`, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "HydroStep Reminder",
    message: `${waterMsg}\n👟 Time to take 100 steps! (${hoursLeft}h of work left)`,
    priority: 2
  });
});
