/* ============================================
   TAKCTRL - Hydro step - Popup Logic
   ============================================ */

document.addEventListener('DOMContentLoaded', async () => {
  // --- UI Elements ---
  const tabButtons = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.panel');
  
  const waterCountEl = document.getElementById('water-count');
  const waterGoalEl = document.getElementById('water-goal');
  const walkDoneEl = document.getElementById('walk-done');
  const walkGoalEl = document.getElementById('walk-goal');
  const streakCountEl = document.getElementById('streak-count');

  const waterProgressRing = document.getElementById('water-progress');
  const walkProgressRing = document.getElementById('walk-progress');

  const btnDrink = document.getElementById('btn-drink');
  const btnWalk = document.getElementById('btn-walk');
  const btnSave = document.getElementById('save');

  const inputWaterTime = document.getElementById('waterTime');
  const inputWalkTime = document.getElementById('walkTime');
  const inputWaterGoal = document.getElementById('waterGoal');
  const inputWalkGoal = document.getElementById('walkGoal');

  // --- State ---
  let state = {
    water: 0,
    walk: 0,
    waterGoal: 8,
    walkGoal: 10,
    waterInterval: 30,
    walkInterval: 60,
    streak: 0,
    lastUpdate: ''
  };

  // --- Load Data ---
  async function loadData() {
    const data = await chrome.storage.sync.get(['water', 'walk', 'settings', 'streak', 'lastUpdate']);
    
    // Default or stored settings
    const settings = data.settings || { waterInterval: 30, walkInterval: 60, waterGoal: 8, walkGoal: 10 };
    
    // Check if it's a new day to reset counts
    const today = new Date().toDateString();
    if (data.lastUpdate !== today) {
      state.water = 0;
      state.walk = 0;
      state.lastUpdate = today;
      await chrome.storage.sync.set({ water: 0, walk: 0, lastUpdate: today });
    } else {
      state.water = data.water || 0;
      state.walk = data.walk || 0;
    }

    state.waterInterval = settings.waterInterval || 30;
    state.walkInterval = settings.walkInterval || 60;
    state.waterGoal = settings.waterGoal || 8;
    state.walkGoal = settings.walkGoal || 10;
    state.streak = data.streak || 0;

    updateUI();
    populateSettings();
  }

  function updateUI() {
    waterCountEl.textContent = state.water;
    waterGoalEl.textContent = state.waterGoal;
    walkDoneEl.textContent = state.walk;
    walkGoalEl.textContent = state.walkGoal;
    streakCountEl.textContent = state.streak;

    // Update Progress Rings
    // Max stroke-dashoffset is 283 (circumference for r=45)
    const waterOffset = 283 - (Math.min(state.water / state.waterGoal, 1) * 283);
    const walkOffset = 283 - (Math.min(state.walk / state.walkGoal, 1) * 283);

    waterProgressRing.style.strokeDashoffset = waterOffset;
    walkProgressRing.style.strokeDashoffset = walkOffset;
    
    // Change health tip based on progress
    const tipEl = document.getElementById('health-tip');
    if (state.water >= state.waterGoal && state.walk >= state.walkGoal) {
      tipEl.textContent = "🏆 Daily goals crushed! You're an elite developer.";
    } else if (state.water >= state.waterGoal) {
      tipEl.textContent = "💧 Hydrated like a pro. Keep those steps coming!";
    } else if (state.walk >= state.walkGoal) {
      tipEl.textContent = "👟 Movement master! Don't forget your 100ml.";
    }
  }

  function populateSettings() {
    inputWaterTime.value = state.waterInterval;
    inputWalkTime.value = state.walkInterval;
    inputWaterGoal.value = state.waterGoal;
    inputWalkGoal.value = state.walkGoal;
  }

  // --- Handlers ---
  btnDrink.addEventListener('click', async () => {
    state.water++;
    await chrome.storage.sync.set({ water: state.water });
    updateUI();
  });

  btnWalk.addEventListener('click', async () => {
    state.walk++;
    await chrome.storage.sync.set({ walk: state.walk });
    updateUI();
  });

  btnSave.addEventListener('click', async () => {
    const settings = {
      waterInterval: parseInt(inputWaterTime.value),
      walkInterval: parseInt(inputWalkTime.value),
      waterGoal: parseInt(inputWaterGoal.value),
      walkGoal: parseInt(inputWalkGoal.value)
    };

    state.waterInterval = settings.waterInterval;
    state.walkInterval = settings.walkInterval;
    state.waterGoal = settings.waterGoal;
    state.walkGoal = settings.walkGoal;

    await chrome.storage.sync.set({ settings });
    
    // Notify background to update alarms
    chrome.runtime.sendMessage({ action: "updateAlarms" });

    btnSave.textContent = "Settings Saved!";
    btnSave.classList.add('saved');
    setTimeout(() => {
      btnSave.textContent = "Save Settings";
      btnSave.classList.remove('saved');
    }, 2000);

    updateUI();
  });

  // --- Tabs ---
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      
      btn.classList.add('active');
      const target = btn.getAttribute('data-tab');
      document.getElementById(`panel-${target}`).classList.add('active');
    });
  });

  // --- Initial Load ---
  loadData();
});
