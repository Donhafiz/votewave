const stats = {
  elections: 128,
  voters: 84231,
  votes: 43211,
  integrity: 99.98
};

function animateCounter(element, target) {

  let current = 0;

  const increment = target / 50;

  const timer = setInterval(() => {

    current += increment;

    if (current >= target) {

      current = target;

      clearInterval(timer);

    }

    element.textContent = Math.floor(current).toLocaleString();

  }, 20);

}

function initializeStats() {

  const elections = document.getElementById('stat-elections');

  const voters = document.getElementById('stat-voters');

  const votes = document.getElementById('stat-votes');

  if (elections) animateCounter(elections, stats.elections);

  if (voters) animateCounter(voters, stats.voters);

  if (votes) animateCounter(votes, stats.votes);

}

function simulateRealtimeUpdates() {

  setInterval(() => {

    stats.votes += Math.floor(Math.random() * 20);

    stats.voters += Math.floor(Math.random() * 10);

    document.getElementById('stat-votes').textContent =
      stats.votes.toLocaleString();

    document.getElementById('stat-voters').textContent =
      stats.voters.toLocaleString();

    addActivity(
      'New vote recorded',
      'Realtime voting update received'
    );

  }, 5000);

}

function addActivity(title, description) {

  const feed = document.getElementById('activity-feed');

  if (!feed) return;

  const item = document.createElement('div');

  item.className = 'activity-item';

  item.innerHTML = `
    <h4>${title}</h4>
    <p>${description}</p>
    <span>${new Date().toLocaleTimeString()}</span>
  `;

  feed.prepend(item);

}

window.addEventListener('DOMContentLoaded', () => {

  initializeStats();

  simulateRealtimeUpdates();

});