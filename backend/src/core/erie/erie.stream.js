/**
 * STREAM PROCESSOR
 * - Handles real-time vote ingestion
 * - Prepares data for ML + analytics
 */

async function processStreamEvent(event) {
  const enrichedEvent = {
    ...event,
    timestamp: Date.now(),
    processedBy: process.pid,
  };

  // In production: push to Redis Streams or Kafka
  console.log("🌊 Stream processed:", enrichedEvent.electionId);

  return enrichedEvent;
}

module.exports = { processStreamEvent };