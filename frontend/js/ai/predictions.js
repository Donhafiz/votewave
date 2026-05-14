class AIPredictionEngine {
  generate(results) {
    const totalVotes = results.reduce(
      (sum, candidate) => sum + candidate.votes,
      0
    );

    const predictions = results.map(candidate => {
      const percentage = (
        (candidate.votes / totalVotes) * 100
      ).toFixed(1);

      return {
        name: candidate.name,
        probability: percentage
      };
    });

    this.render(predictions);
  }

  render(predictions) {
    const container = document.getElementById("aiPredictions");

    if (!container) return;

    container.innerHTML = predictions.map(item => `
      <div class="prediction-card">
        <h4>${item.name}</h4>
        <p>${item.probability}% projected win probability</p>
      </div>
    `).join("");
  }
}

window.aiPredictionEngine = new AIPredictionEngine();