class HeatmapEngine {
  render(regions) {
    const container = document.getElementById("heatmapGrid");

    if (!container) return;

    container.innerHTML = "";

    regions.forEach(region => {
      const card = document.createElement("div");

      card.className = "heatmap-card";

      card.innerHTML = `
        <h4>${region.name}</h4>
        <p>${region.turnout}% turnout</p>
      `;

      container.appendChild(card);
    });
  }
}

window.heatmapEngine = new HeatmapEngine();