class ResultsChart {
  constructor() {
    this.chart = null;
  }

  render(results) {
    const canvas = document.getElementById("resultsChart");

    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    const labels = results.map(item => item.name);
    const votes = results.map(item => item.votes);

    if (this.chart) {
      this.chart.destroy();
    }

    this.chart = new Chart(ctx, {
      type: "bar",

      data: {
        labels,

        datasets: [
          {
            label: "Votes",
            data: votes,
            borderWidth: 1
          }
        ]
      },

      options: {
        responsive: true,
        plugins: {
          legend: {
            labels: {
              color: "#ffffff"
            }
          }
        },

        scales: {
          y: {
            ticks: {
              color: "#ffffff"
            }
          },

          x: {
            ticks: {
              color: "#ffffff"
            }
          }
        }
      }
    });
  }
}

window.resultsChart = new ResultsChart();