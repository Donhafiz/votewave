class ElectionChannels {
  constructor(socket) {
    this.socket = socket;
  }

  joinElection(electionId) {
    this.socket.emit("join-election", electionId);

    console.log(`Joined election channel: ${electionId}`);
  }

  leaveElection(electionId) {
    this.socket.emit("leave-election", electionId);

    console.log(`Left election channel: ${electionId}`);
  }

  subscribe() {
    this.socket.on("candidate-update", (data) => {
      this.updateCandidateResults(data);
    });

    this.socket.on("turnout-update", (data) => {
      this.updateTurnout(data);
    });

    this.socket.on("audit-event", (data) => {
      this.updateAuditFeed(data);
    });

    this.socket.on("notification", (data) => {
      this.showNotification(data);
    });
  }

  updateCandidateResults(data) {
    const candidateElement = document.querySelector(
      `[data-candidate="${data.candidateId}"] .candidate-votes`
    );

    if (candidateElement) {
      candidateElement.textContent = data.votes;
    }
  }

  updateTurnout(data) {
    const turnout = document.getElementById("liveTurnout");

    if (turnout) {
      turnout.textContent = `${data.turnout}%`;
    }
  }

  updateAuditFeed(data) {
    const feed = document.getElementById("auditFeed");

    if (!feed) return;

    const item = document.createElement("div");

    item.className = "audit-item";

    item.innerHTML = `
      <strong>${data.type}</strong>
      <p>${data.message}</p>
      <small>${new Date().toLocaleTimeString()}</small>
    `;

    feed.prepend(item);
  }

  showNotification(data) {
    const container = document.getElementById("notificationContainer");

    if (!container) return;

    const notification = document.createElement("div");

    notification.className = "live-notification";

    notification.innerHTML = `
      <strong>${data.title}</strong>
      <p>${data.message}</p>
    `;

    container.appendChild(notification);

    setTimeout(() => {
      notification.remove();
    }, 4000);
  }
}

window.ElectionChannels = ElectionChannels;