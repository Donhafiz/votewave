/**
 * =========================================================
 * VoteWave Live Results Engine
 * =========================================================
 */

class LiveResultsEngine {
  constructor() {
    this.results = {
      totalVotes: 0,
      candidates: [],
      regions: []
    };
  }

  /**
   * UPDATE RESULTS
   */
  updateResults(payload) {
    if (!payload) return;

    this.results = payload;

    this.renderLeaderboard();

    this.renderNationalStats();

    this.renderRegionalBreakdown();

    console.log(
      "[VoteWave] Results Engine Updated"
    );
  }

  /**
   * SORT CANDIDATES
   */
  getRankedCandidates() {
    return [...this.results.candidates].sort(
      (a, b) => b.votes - a.votes
    );
  }

  /**
   * NATIONAL TOTALS
   */
  renderNationalStats() {
    const totalVotes =
      document.getElementById("totalVotes");

    if (totalVotes) {
      totalVotes.textContent =
        Number(
          this.results.totalVotes || 0
        ).toLocaleString();
    }
  }

  /**
   * LEADERBOARD
   */
  renderLeaderboard() {
    const container =
      document.getElementById(
        "candidateLeaderboard"
      );

    if (!container) return;

    container.innerHTML = "";

    const ranked =
      this.getRankedCandidates();

    ranked.forEach((candidate, index) => {
      const row =
        document.createElement("div");

      row.className =
        "candidate-leaderboard-row";

      row.innerHTML = `
        <div class="candidate-rank">
          #${index + 1}
        </div>

        <div class="candidate-name">
          ${candidate.name}
        </div>

        <div class="candidate-votes">
          ${Number(
            candidate.votes
          ).toLocaleString()}
        </div>

        <div class="candidate-percent">
          ${candidate.percentage}%
        </div>
      `;

      container.appendChild(row);
    });
  }

  /**
   * REGIONAL RESULTS
   */
  renderRegionalBreakdown() {
    const container =
      document.getElementById(
        "regionalBreakdown"
      );

    if (!container) return;

    container.innerHTML = "";

    if (
      !Array.isArray(
        this.results.regions
      )
    ) {
      return;
    }

    this.results.regions.forEach(
      (region) => {
        const el =
          document.createElement("div");

        el.className = "region-card";

        el.innerHTML = `
          <h3>${region.name}</h3>
          <p>
            Turnout:
            ${region.turnout}%
          </p>
          <p>
            Votes:
            ${Number(
              region.totalVotes
            ).toLocaleString()}
          </p>
        `;

        container.appendChild(el);
      }
    );
  }
}

window.liveResultsEngine =
  new LiveResultsEngine();