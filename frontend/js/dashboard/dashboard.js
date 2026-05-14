/**
 * =========================================================
 * LIVE RESULTS EVENT LISTENER
 * frontend/js/dashboard/dashboard.js
 * =========================================================
 */

window.addEventListener("resultsUpdate", (event) => {
  try {
    const results = event.detail;

    if (!results) {
      console.warn(
        "[VoteWave] Empty realtime results payload"
      );

      return;
    }

    console.log(
      "[VoteWave] Live results received:",
      results
    );

    /**
     * =====================================================
     * TOTAL VOTES
     * =====================================================
     */
    const totalVotesElement =
      document.getElementById("totalVotes");

    if (
      totalVotesElement &&
      results.totalVotes !== undefined
    ) {
      totalVotesElement.textContent =
        Number(results.totalVotes).toLocaleString();
    }

    /**
     * =====================================================
     * CANDIDATE RESULTS
     * =====================================================
     */
    if (
      Array.isArray(results.candidates)
    ) {
      results.candidates.forEach((candidate) => {
        /**
         * Candidate vote element
         * Example:
         * <span id="candidate-john-votes"></span>
         */

        const voteElement =
          document.getElementById(
            `candidate-${candidate.id}-votes`
          );

        if (voteElement) {
          voteElement.textContent =
            Number(candidate.votes).toLocaleString();
        }

        /**
         * Candidate percentage
         */

        const percentageElement =
          document.getElementById(
            `candidate-${candidate.id}-percent`
          );

        if (percentageElement) {
          percentageElement.textContent =
            `${candidate.percentage}%`;
        }
      });
    }

    /**
     * =====================================================
     * UPDATE CHARTS
     * =====================================================
     */
    if (
      window.resultsChart &&
      typeof window.resultsChart.render ===
        "function"
    ) {
      window.resultsChart.render(results);
    }

    /**
     * =====================================================
     * UPDATE AI PREDICTIONS
     * =====================================================
     */
    if (
      window.aiPredictionEngine &&
      typeof window.aiPredictionEngine.generate ===
        "function"
    ) {
      window.aiPredictionEngine.generate(
        results
      );
    }

    /**
     * =====================================================
     * UPDATE LIVE ENGINE
     * =====================================================
     */
    if (
      window.liveResultsEngine &&
      typeof window.liveResultsEngine
        .updateResults === "function"
    ) {
      window.liveResultsEngine.updateResults(
        results
      );
    }

  } catch (error) {
    console.error(
      "[VoteWave] Failed to process realtime results",
      error
    );
  }
});