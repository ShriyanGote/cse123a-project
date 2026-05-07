const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const EXPO_MAX_CHUNK_SIZE = 100;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function shouldRetry(error) {
  const statusCode = Number(error?.statusCode);
  return Number.isFinite(statusCode) && RETRYABLE_STATUS_CODES.has(statusCode);
}

async function sendChunk(messages) {
  const response = await fetch(EXPO_PUSH_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messages),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const error = new Error(
      `Expo push request failed (${response.status}): ${text || response.statusText}`
    );
    error.statusCode = response.status;
    throw error;
  }

  const body = await response.json();
  return Array.isArray(body?.data) ? body.data : [];
}

async function sendChunkWithRetry(messages) {
  const maxAttempts = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await sendChunk(messages);
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !shouldRetry(error)) break;
      await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
    }
  }

  throw lastError ?? new Error("Expo push request failed.");
}

export async function sendExpoPushNotifications(notifications) {
  if (!Array.isArray(notifications) || notifications.length === 0) {
    return { tickets: [], invalidTokens: [], failures: [] };
  }

  const tickets = [];
  const failures = [];
  const invalidTokenSet = new Set();
  const chunks = chunkArray(notifications, EXPO_MAX_CHUNK_SIZE);

  for (const chunk of chunks) {
    let data;
    try {
      data = await sendChunkWithRetry(
        chunk.map((notification) => ({
          to: notification.to,
          title: notification.title,
          body: notification.body,
          data: notification.data,
          sound: "default",
          priority: "high",
        }))
      );
    } catch (error) {
      failures.push({
        message: error?.message ?? "Expo send request failed.",
      });
      continue;
    }

    for (let i = 0; i < chunk.length; i += 1) {
      const ticket = data[i];
      const current = chunk[i];
      tickets.push({ token: current.to, ticket });
      if (ticket?.status === "error") {
        failures.push({
          token: current.to,
          message: ticket?.message ?? "Expo ticket error",
          details: ticket?.details ?? null,
        });
        if (ticket?.details?.error === "DeviceNotRegistered") {
          invalidTokenSet.add(current.to);
        }
      }
    }
  }

  return {
    tickets,
    invalidTokens: Array.from(invalidTokenSet),
    failures,
  };
}
