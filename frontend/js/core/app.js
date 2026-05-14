class VoteWaveApp {
  constructor() {
    this.initialize();
  }

  initialize() {
    console.log("VoteWave Initialized");

    this.initializeNavigation();
    this.initializeRealtime();
    this.initializeTheme();
  }

  initializeNavigation() {
    const links = document.querySelectorAll("[data-route]");

    links.forEach(link => {
      link.addEventListener("click", (e) => {
        e.preventDefault();

        const route = link.dataset.route;

        window.location.href = route;
      });
    });
  }

  initializeRealtime() {
    if (window.io) {
      console.log("Realtime engine ready");
    }
  }

  initializeTheme() {
    document.body.classList.add("theme-dark");
  }
}

window.VoteWaveApp = new VoteWaveApp();