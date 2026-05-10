class Broker {
  constructor(partitions = 4) {
    this.partitions = new Map();
    this.partitionCount = partitions;

    for (let i = 0; i < partitions; i++) {
      this.partitions.set(i, []);
    }
  }

  publish(topic, key, payload) {
    const partition = this._getPartition(key);

    const event = {
      topic,
      key,
      payload,
      timestamp: Date.now(),
      offset: this.partitions.get(partition).length,
    };

    this.partitions.get(partition).push(event);

    return event;
  }

  consume(partition, offset = 0) {
    return this.partitions.get(partition).slice(offset);
  }

  _getPartition(key) {
    let hash = 0;

    if (!key) return 0;

    for (let i = 0; i < key.length; i++) {
      hash += key.charCodeAt(i);
    }

    return hash % this.partitionCount;
  }
}

module.exports = Broker;