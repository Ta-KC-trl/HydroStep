/* ============================================
   TAKCTRL - Hydro step - Background logic
   ============================================ */

const WATER_ALARM = "waterReminder";
const WALK_ALARM = "walkReminder";

// Initial Setup
chrome.runtime.onInstalled.addListener(() => {
  console.log("TAKCTRL - Hydro step installed!");
  setupAlarms();
});

// Setup/Update Alarms
async function setupAlarms() {
  const data = await chrome.storage.sync.get(['settings']);
  const settings = data.settings || { waterInterval: 30, walkInterval: 60 };

  const waterTime = settings.waterInterval || 30;
  const walkTime = settings.walkInterval || 60;

  // Clear existing alarms
  chrome.alarms.clearAll(() => {
    // Create new ones
    chrome.alarms.create(WATER_ALARM, {
      delayInMinutes: waterTime,
      periodInMinutes: waterTime
    });

    chrome.alarms.create(WALK_ALARM, {
      delayInMinutes: walkTime,
      periodInMinutes: walkTime
    });
    
    console.log(`TAKCTRL: Alarms set - Water: ${waterTime}m, Walk: ${walkTime}m`);
  });
}

// Alarm Listener
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === WATER_ALARM) {
    showNotification(
      "💧 TAKCTRL - Time to Drink!",
      "Hydration is key to productivity. Take a sip of water now."
    );
  } else if (alarm.name === WALK_ALARM) {
    showNotification(
      "👟 TAKCTRL - Time to Move!",
      "You've been sitting for a while. Stand up and take 100 steps."
    );
  }
});

// Notification Helper
function showNotification(title, message) {
  chrome.notifications.create(`takctrl-${Date.now()}`, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: title,
    message: message,
    priority: 2
  });
}

// Message Listener (for setting updates)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "updateAlarms") {
    setupAlarms();
  }
});
