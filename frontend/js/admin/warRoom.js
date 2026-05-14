/**
 * =========================================================
 * VoteWave War Room
 * =========================================================
 */

class WarRoom {
  constructor() {
    this.activityFeed = [];
  }

  pushActivity(activity) {
    this.activityFeed.unshift(
      activity
    );

    if (
      this.activityFeed.length > 50
    ) {
      this.activityFeed.pop();
    }

    this.render();
  }

  render() {
    const container =
      document.getElementById(
        "warRoomFeed"
      );

    if (!container) return;

    container.innerHTML = "";

    this.activityFeed.forEach(
      (activity) => {
        const item =
          document.createElement("div");

        item.className =
          "warroom-item";

        item.innerHTML = `
          <div class="warroom-time">
            ${new Date(
              activity.timestamp
            ).toLocaleTimeString()}
          </div>

          <div class="warroom-message">
            ${activity.message}
          </div>
        `;

        container.appendChild(item);
      }
    );
  }
}

window.warRoom =
  new WarRoom();