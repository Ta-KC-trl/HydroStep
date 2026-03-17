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
  
  let currentGlasses = today.glasses || 0;
  if (today.waterMl !== undefined && today.glasses === undefined) currentGlasses = Math.round(today.waterMl / 250);

  const remainingWater = settings.waterGoal - currentGlasses;
  const hour = new Date().getHours();
  const hoursLeft = settings.endHour - hour;

  let waterMsg = remainingWater > 0
    ? `💧 ${remainingWater} cups left today — keep sipping!`
    : `✅ You've hit your water goal — great job!`;

  const stepMessages = [
    "You're doing great! Take a quick 100-step walk to recharge. 👟",
    "Time to stretch those legs! 100 steps can boost your focus instantly.",
    "A quick walk changes everything. Get your 100 steps in! 🌟",
    "Keep the momentum going! Stand up and take 100 fresh steps.",
    "Your body will thank you. 100 steps away from the screen! ✨",
    "Movement is energy. Take 100 steps and come back stronger! 🚀",
    "Reset your mind with a quick 100-step stroll around the room."
  ];
  const randStepMsg = stepMessages[Math.floor(Math.random() * stepMessages.length)];

  if (settings.notifs === 'badge') {
    chrome.action.setBadgeText({ text: "!" });
    chrome.action.setBadgeBackgroundColor({ color: "#FF9F0A" });
    return;
  }

  const notifOptions = {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "HydroStep Reminder",
    message: `${waterMsg}\n\n${randStepMsg}`,
    priority: 2
  };

  if (settings.notifs === 'silent') {
    notifOptions.silent = true;
  }

  chrome.notifications.create(`hydrostep-${Date.now()}`, notifOptions);
});
