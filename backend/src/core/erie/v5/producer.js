const axios = require("axios");

class Producer {
  constructor(leaderUrl) {
    this.leader = leaderUrl;
  }

  async send(topic, key, payload) {
    const res = await axios.post(`${this.leader}/produce`, {
      topic,
      key,
      payload,
    });

    return res.data;
  }
}

module.exports = Producer;