const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export async function fetchAPI(endpoint, options = {}) {
  const url = API_URL ? `${API_URL}${endpoint}` : endpoint;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  return response.json();
}
