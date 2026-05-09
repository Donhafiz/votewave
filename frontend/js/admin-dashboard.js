let activityChart;
let statusChart;

// 🔴 SOCKET CONNECTION (REAL-TIME LAYER)
const socket = io();

document.addEventListener("DOMContentLoaded", () => {
  initDashboard();
  initRealtime();
});

/* ================= INIT ================= */
function initDashboard() {
  loadStats();
  initCharts();
}

/* ================= REAL-TIME ================= */
function initRealtime() {
  socket.on("connect", () => {
    console.log("🟢 Dashboard connected to real-time server");
  });

  // 🔥 MAIN LIVE DASHBOARD UPDATE EVENT
  socket.on("dashboard:update", (data) => {
    console.log("Live update:", data);

    if (data.totalVotes !== undefined) {
      animateNumber("totalVotes", data.totalVotes);
    }

    if (data.activeElections !== undefined) {
      animateNumber("activeElections", data.activeElections);
    }

    if (data.totalUsers !== undefined) {
      animateNumber("totalUsers", data.totalUsers);
    }

    if (data.totalElections !== undefined) {
      animateNumber("totalElections", data.totalElections);
    }

    if (data.activity) {
      addActivityItem(data.activity);
    }

    showToast("Dashboard updated live", "success");
  });
}

/* ================= ANIMATION ================= */
function animateNumber(elementId, newValue, duration = 800) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const startValue = parseInt(el.textContent) || 0;
  const startTime = performance.now();

  function update(currentTime) {
    const progress = Math.min((currentTime - startTime) / duration, 1);

    const value = Math.floor(startValue + (newValue - startValue) * progress);
    el.textContent = value.toLocaleString();

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

/* ================= TOAST ================= */
function showToast(message, type = "info") {
  let container = document.getElementById("toastContainer");

  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    container.style.position = "fixed";
    container.style.top = "20px";
    container.style.right = "20px";
    container.style.zIndex = "9999";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");

  toast.textContent = message;
  toast.style.padding = "12px 16px";
  toast.style.marginTop = "10px";
  toast.style.borderRadius = "8px";
  toast.style.color = "#fff";
  toast.style.fontSize = "14px";
  toast.style.boxShadow = "0 10px 25px rgba(0,0,0,0.2)";
  toast.style.opacity = "0";
  toast.style.transform = "translateY(-10px)";
  toast.style.transition = "0.3s ease";

  if (type === "success") toast.style.background = "#2ed573";
  else if (type === "error") toast.style.background = "#ff6b6b";
  else toast.style.background = "#6366f1";

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  }, 50);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-10px)";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/* ================= LOAD STATS ================= */
async function loadStats() {
  try {
    const res = await fetch("/api/admin/dashboard");
    const data = await res.json();

    const stats = data?.stats || fallbackStats();

    setText("totalElections", stats.totalElections);
    setText("activeElections", stats.activeElections);
    setText("totalUsers", stats.totalUsers);
    setText("totalVotes", stats.totalVotes);

    updateCharts(stats);

  } catch (err) {
    console.log("Using fallback dashboard data");

    const stats = fallbackStats();

    setText("totalElections", stats.totalElections);
    setText("activeElections", stats.activeElections);
    setText("totalUsers", stats.totalUsers);
    setText("totalVotes", stats.totalVotes);

    updateCharts(stats);
  }
}

/* ================= CHARTS ================= */
function initCharts() {
  const ctx1 = document.getElementById("activityChart");
  const ctx2 = document.getElementById("statusChart");

  if (ctx1) {
    activityChart = new Chart(ctx1, {
      type: "bar",
      data: {
        labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
        datasets: [{
          data: [10, 30, 20, 40, 60, 50],
          backgroundColor: "#ff6b6b"
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } }
      }
    });
  }

  if (ctx2) {
    statusChart = new Chart(ctx2, {
      type: "doughnut",
      data: {
        labels: ["Active", "Completed", "Upcoming"],
        datasets: [{
          data: [3, 5, 2],
          backgroundColor: ["#2ed573", "#64748b", "#ffa726"]
        }]
      },
      options: {
        responsive: true
      }
    });
  }
}

function updateCharts(stats) {
  if (activityChart && stats.activity) {
    activityChart.data.datasets[0].data = stats.activity;
    activityChart.update();
  }

  if (statusChart && stats.status) {
    statusChart.data.datasets[0].data = stats.status;
    statusChart.update();
  }
}

/* ================= HELPERS ================= */
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = value ?? 0;
  }
}

function fallbackStats() {
  return {
    totalElections: 12,
    activeElections: 3,
    totalUsers: 2450,
    totalVotes: 5230,
    activity: [10, 20, 30, 40, 50, 60],
    status: [3, 5, 2]
  };
}

/* ================= LIVE FEED ================= */
function addActivityItem(activity) {
  const container = document.getElementById("activityFeed");
  if (!container) return;

  const item = document.createElement("div");

  item.style.padding = "10px";
  item.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
  item.style.color = "#cbd5e1";
  item.style.fontSize = "13px";

  item.innerHTML = `
    <strong>${activity.title}</strong><br/>
    <small>${new Date(activity.time).toLocaleTimeString()}</small>
  `;

  container.prepend(item);
}