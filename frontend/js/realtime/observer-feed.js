class ObserverFeed {
  constructor() {
    this.events = [];
  }

  push(event) {
    this.events.unshift(event);

    this.render();
  }

  render() {
    const container = document.getElementById("observerFeed");

    if (!container) return;

    container.innerHTML = this.events.map(event => `
      <div class="observer-event">
        <div class="observer-event-top">
          <strong>${event.type}</strong>
          <span>${event.time}</span>
        </div>

        <p>${event.message}</p>
      </div>
    `).join("");
  }
}

window.observerFeed = new ObserverFeed();