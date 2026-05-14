class LiveResultsEngine {
  constructor() {
    this.candidates = [];
  }

  updateResults(results) {
    this.candidates = results;

    this.render();
  }

  render() {
    const container = document.getElementById("liveResultsContainer");

    if (!container) return;

    container.innerHTML = "";

    this.candidates.forEach(candidate => {
      const percent = candidate.percentage || 0;

      container.innerHTML += `
        <div class="candidate-result-card">
          <div class="candidate-header">
            <h3>${candidate.name}</h3>
            <span>${candidate.votes} votes</span>
          </div>

          <div class="progress-bar">
            <div 
              class="progress-fill"
              style="width:${percent}%"
            ></div>
          </div>

          <div class="candidate-footer">
            <span>${percent}%</span>
          </div>
        </div>
      `;
    });
  }
}

window.liveResultsEngine = new LiveResultsEngine();