class AdminDashboard {
  constructor() {
    this.loadDashboard();
  }

  loadDashboard() {
    this.loadStatistics();
    this.loadRecentActivity();
  }

  loadStatistics() {
    const stats = {
      elections: 12,
      voters: 45210,
      votes: 38900,
      turnout: "86%"
    };

    this.renderStats(stats);
  }

  renderStats(stats) {
    const elections = document.getElementById("statElections");
    const voters = document.getElementById("statVoters");
    const votes = document.getElementById("statVotes");
    const turnout = document.getElementById("statTurnout");

    if (elections) elections.textContent = stats.elections;
    if (voters) voters.textContent = stats.voters;
    if (votes) votes.textContent = stats.votes;
    if (turnout) turnout.textContent = stats.turnout;
  }

  loadRecentActivity() {
    console.log("Recent activity loaded");
  }
}

window.adminDashboard = new AdminDashboard();