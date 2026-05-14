class NationalResultsEngine {
  constructor() {
    this.results = [];
  }

  update(data) {
    this.results = data;

    this.renderNationalSummary();
    this.renderLeadingCandidate();
    resultsChart.render(data);
  }

  renderNationalSummary() {
    const totalVotes = this.results.reduce(
      (sum, candidate) => sum + candidate.votes,
      0
    );

    const element = document.getElementById("nationalVotes");

    if (element) {
      element.textContent = totalVotes.toLocaleString();
    }
  }

  renderLeadingCandidate() {
    const leader = [...this.results]
      .sort((a, b) => b.votes - a.votes)[0];

    if (!leader) return;

    const element = document.getElementById("leadingCandidate");

    if (element) {
      element.innerHTML = `
        <h2>${leader.name}</h2>
        <p>${leader.votes.toLocaleString()} votes</p>
      `;
    }
  }
}

window.nationalResultsEngine = new NationalResultsEngine();