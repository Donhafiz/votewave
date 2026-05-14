/**
 * =========================================================
 * frontend/js/realtime/socket.js
 * FULL UPDATED VERSION — PHASE 4D
 * =========================================================
 */

import { io } from "socket.io-client";

/**
 * =========================================================
 * SOCKET INSTANCE
 * =========================================================
 */

export const socket = io(
  "http://localhost:3001",
  {
    transports: ["websocket"],
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 2000
  }
);

/**
 * =========================================================
 * ELECTION CHANNELS
 * =========================================================
 */

class ElectionChannels {
  constructor(socketInstance) {
    this.socket = socketInstance;
  }

  joinElection(electionId) {
    this.socket.emit(
      "join:election",
      electionId
    );

    console.log(
      `[VoteWave] Joined election room: ${electionId}`
    );
  }

  leaveElection(electionId) {
    this.socket.emit(
      "leave:election",
      electionId
    );

    console.log(
      `[VoteWave] Left election room: ${electionId}`
    );
  }

  subscribeToRegion(region) {
    this.socket.emit(
      "join:region",
      region
    );

    console.log(
      `[VoteWave] Joined region room: ${region}`
    );
  }

  unsubscribeFromRegion(region) {
    this.socket.emit(
      "leave:region",
      region
    );

    console.log(
      `[VoteWave] Left region room: ${region}`
    );
  }
}

/**
 * =========================================================
 * REALTIME MANAGER
 * =========================================================
 */

class RealtimeManager {
  constructor() {
    this.socket = socket;

    this.channels =
      new ElectionChannels(
        this.socket
      );

    this.isConnected = false;
  }

  /**
   * CONNECT
   */
  connect() {
    this.socket.connect();

    this.registerCoreEvents();

    console.log(
      "[VoteWave] Realtime initialized"
    );
  }

  /**
   * =========================================================
   * REGISTER EVENTS
   * =========================================================
   */
  registerCoreEvents() {
    /**
     * CONNECT
     */
    this.socket.on(
      "connect",
      () => {
        this.isConnected = true;

        console.log(
          `[VoteWave] CONNECTED: ${this.socket.id}`
        );

        this.showNotification({
          title:
            "Realtime Connected",
          message:
            "Live election stream active"
        });
      }
    );

    /**
     * DISCONNECT
     */
    this.socket.on(
      "disconnect",
      (reason) => {
        this.isConnected = false;

        console.log(
          `[VoteWave] DISCONNECTED: ${reason}`
        );

        this.showNotification({
          title:
            "Realtime Disconnected",
          message:
            "Attempting reconnect..."
        });
      }
    );

    /**
     * =====================================================
     * LIVE RESULTS STREAM
     * =====================================================
     */
    this.socket.on(
      "results:update",
      (payload) => {
        console.log(
          "[VoteWave] results:update",
          payload
        );

        if (
          !payload?.results
        ) {
          return;
        }

        /**
         * GLOBAL EVENT
         */
        window.dispatchEvent(
          new CustomEvent(
            "resultsUpdate",
            {
              detail:
                payload.results
            }
          )
        );

        /**
         * RESULTS ENGINE
         */
        if (
          window.liveResultsEngine
        ) {
          window.liveResultsEngine.updateResults(
            payload.results
          );
        }

        /**
         * AI INSIGHTS
         */
        if (
          window.aiPredictionEngine
        ) {
          window.aiPredictionEngine.generate(
            payload.results
          );
        }

        /**
         * CHARTS
         */
        if (
          window.resultsChart &&
          typeof window
            .resultsChart
            .render ===
            "function"
        ) {
          window.resultsChart.render(
            payload.results
          );
        }

        /**
         * WAR ROOM
         */
        if (
          window.warRoom
        ) {
          window.warRoom.pushActivity(
            {
              timestamp:
                Date.now(),
              message:
                "National results updated"
            }
          );
        }
      }
    );

    /**
     * =====================================================
     * LIVE VOTE STREAM
     * =====================================================
     */
    this.socket.on(
      "vote:cast",
      (payload) => {
        console.log(
          "[VoteWave] vote:cast",
          payload
        );

        /**
         * TOTAL VOTES
         */
        const total =
          document.getElementById(
            "totalVotes"
          );

        if (
          total &&
          payload?.totalVotes !==
            undefined
        ) {
          total.textContent =
            Number(
              payload.totalVotes
            ).toLocaleString();
        }

        /**
         * WAR ROOM ACTIVITY
         */
        if (
          window.warRoom
        ) {
          window.warRoom.pushActivity(
            {
              timestamp:
                Date.now(),
              message: `
                Vote received for
                ${
                  payload.candidateName ||
                  "Unknown Candidate"
                }
                in
                ${
                  payload.region ||
                  "Unknown Region"
                }
              `
            }
          );
        }

        /**
         * LIVE COUNTER
         */
        const liveCounter =
          document.getElementById(
            "liveVoteCounter"
          );

        if (
          liveCounter
        ) {
          liveCounter.textContent =
            Number(
              payload.totalVotes ||
                0
            ).toLocaleString();
        }
      }
    );

    /**
     * =====================================================
     * REGION TURNOUT
     * =====================================================
     */
    this.socket.on(
      "region:turnout",
      (payload) => {
        console.log(
          "[VoteWave] region turnout",
          payload
        );

        if (
          window.heatmapEngine &&
          payload?.regions
        ) {
          window.heatmapEngine.render(
            payload.regions
          );
        }
      }
    );

    /**
     * =====================================================
     * AUDIT EVENTS
     * =====================================================
     */
    this.socket.on(
      "audit:event",
      (event) => {
        console.log(
          "[VoteWave] audit:event",
          event
        );

        if (
          window.observerFeed
        ) {
          window.observerFeed.push(
            event
          );
        }

        if (
          window.warRoom
        ) {
          window.warRoom.pushActivity(
            {
              timestamp:
                Date.now(),
              message:
                event.message ||
                "Audit activity detected"
            }
          );
        }
      }
    );

    /**
     * =====================================================
     * NOTIFICATIONS
     * =====================================================
     */
    this.socket.on(
      "notification",
      (data) => {
        console.log(
          "[VoteWave] notification",
          data
        );

        this.showNotification(
          data
        );
      }
    );

    /**
     * =====================================================
     * SYSTEM HEALTH
     * =====================================================
     */
    this.socket.on(
      "system:health",
      (health) => {
        console.log(
          "[VoteWave] system health",
          health
        );

        const latency =
          document.getElementById(
            "systemLatency"
          );

        if (
          latency &&
          health?.latency !==
            undefined
        ) {
          latency.textContent =
            `${health.latency}ms`;
        }
      }
    );

    /**
     * =====================================================
     * FRAUD ALERTS
     * =====================================================
     */
    this.socket.on(
      "fraud:detected",
      (payload) => {
        console.warn(
          "[VoteWave] fraud detected",
          payload
        );

        this.showNotification(
          {
            title:
              "Fraud Alert",
            message:
              payload?.message ||
              "Suspicious voting activity detected"
          }
        );

        if (
          window.warRoom
        ) {
          window.warRoom.pushActivity(
            {
              timestamp:
                Date.now(),
              message:
                "Fraud detection triggered"
            }
          );
        }
      }
    );

    /**
     * =====================================================
     * CONNECTION ERROR
     * =====================================================
     */
    this.socket.on(
      "connect_error",
      (error) => {
        console.error(
          "[VoteWave] connection error",
          error.message
        );
      }
    );
  }

  /**
   * =========================================================
   * NOTIFICATION UI
   * =========================================================
   */
  showNotification(
    data = {}
  ) {
    const container =
      document.getElementById(
        "notificationContainer"
      );

    if (!container) {
      return;
    }

    const el =
      document.createElement(
        "div"
      );

    el.className =
      "live-notification";

    el.innerHTML = `
      <strong>
        ${
          data.title ||
          "VoteWave"
        }
      </strong>

      <p>
        ${
          data.message ||
          ""
        }
      </p>
    `;

    container.appendChild(
      el
    );

    setTimeout(() => {
      el.remove();
    }, 4000);
  }

  /**
   * =========================================================
   * DISCONNECT
   * =========================================================
   */
  disconnect() {
    this.socket.disconnect();

    console.log(
      "[VoteWave] Manual disconnect"
    );
  }
}

/**
 * =========================================================
 * GLOBAL INSTANCE
 * =========================================================
 */

window.realtimeManager =
  new RealtimeManager();

/**
 * =========================================================
 * AUTO CONNECT
 * =========================================================
 */

window.addEventListener(
  "DOMContentLoaded",
  () => {
    window.realtimeManager.connect();
  }
);