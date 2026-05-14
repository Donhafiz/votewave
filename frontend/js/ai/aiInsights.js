/**
 * =========================================================
 * VoteWave AI Insights Engine
 * =========================================================
 */

class AIPredictionEngine {
  constructor() {
    this.lastPrediction = null;
  }

  generate(results) {
    if (
      !results ||
      !results.candidates
    ) {
      return;
    }

    const ranked =
      [...results.candidates].sort(
        (a, b) => b.votes - a.votes
      );

    const leader = ranked[0];
    const second = ranked[1];

    let confidence = 50;

    if (leader && second) {
      confidence =
        50 +
        (
          (leader.votes -
            second.votes) /
          leader.votes
        ) *
          100;
    }

    const prediction = {
      projectedWinner:
        leader?.name || "Unknown",
      confidence:
        confidence.toFixed(1),
      margin:
        leader && second
          ? leader.votes -
            second.votes
          : 0
    };

    this.lastPrediction =
      prediction;

    this.render(prediction);
  }

  render(prediction) {
    const winner =
      document.getElementById(
        "aiProjectedWinner"
      );

    const confidence =
      document.getElementById(
        "aiConfidence"
      );

    const margin =
      document.getElementById(
        "aiMargin"
      );

    if (winner) {
      winner.textContent =
        prediction.projectedWinner;
    }

    if (confidence) {
      confidence.textContent =
        `${prediction.confidence}%`;
    }

    if (margin) {
      margin.textContent =
        Number(
          prediction.margin
        ).toLocaleString();
    }
  }
}

window.aiPredictionEngine =
  new AIPredictionEngine();