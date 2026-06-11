// Shared API utility functions used by panel and other renderer windows.

function parseApiKeys(value) {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : String(value);
  return raw
    .split(/[\r\n,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getPrimaryApiKeys(settings) {
  const rawKey = settings.apiKey || settings.openaiKey || '';
  return parseApiKeys(rawKey);
}

function getPrimaryApiKey(settings) {
  return getPrimaryApiKeys(settings)[0] || '';
}

function getApiProvider(apiKey) {
  return apiKey.startsWith('gsk_') ? 'groq' : 'openai';
}

function getApiBaseUrl(provider) {
  return provider === 'groq'
    ? 'https://api.groq.com/openai/v1'
    : 'https://api.openai.com/v1';
}

function getProviderTokenField(provider) {
  return provider === 'groq' ? 'max_completion_tokens' : 'max_tokens';
}

function capitalizeProvider(provider) {
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

function isApiKeyRetryableError(status, message) {
  if (!message) return false;
  const normalized = String(message).toLowerCase();
  return (
    status === 429 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    /rate limit|quota|insufficient_quota|over limit|too many requests|throttl|exceeded|invalid api key|invalid_request_error|authorization|unauthorized|forbidden|expired/i.test(normalized)
  );
}

async function runProviderChatCompletion(provider, apiKey, body) {
  const keys = Array.isArray(apiKey) ? apiKey : parseApiKeys(apiKey);
  if (!keys.length) {
    throw new Error(`No ${capitalizeProvider(provider)} API key is configured.`);
  }

  const errors = [];
  for (const key of keys) {
    try {
      const response = await fetch(getApiBaseUrl(provider) + '/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const responseText = await response.text();
        let errorMessage = responseText;
        try {
          const parsed = JSON.parse(responseText);
          if (parsed?.error?.message) {
            errorMessage = parsed.error.message;
          }
        } catch (e) {
          // ignore parse failures
        }

        if (isApiKeyRetryableError(response.status, errorMessage)) {
          errors.push(`Key failed (${response.status}): ${errorMessage}`);
          continue;
        }

        throw new Error(`${capitalizeProvider(provider)} API failed (${response.status}): ${errorMessage}`);
      }

      return await response.json();
    } catch (error) {
      const message = error?.message || String(error);
      if (isApiKeyRetryableError(0, message)) {
        errors.push(`Key failed: ${message}`);
        continue;
      }
      throw error;
    }
  }

  throw new Error(`All ${capitalizeProvider(provider)} keys failed. ${errors.join(' | ')}`);
}
