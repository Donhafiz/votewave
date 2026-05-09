class RetryGuard {
  static async execute(fn, retries = 3) {
    let lastError;

    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        await new Promise((r) => setTimeout(r, 500 * (i + 1)));
      }
    }

    throw lastError;
  }
}

module.exports = RetryGuard;