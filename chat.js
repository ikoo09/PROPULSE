async function askGemini(payload) {

  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();

  if (!response.ok) {
    console.error(text);
    throw new Error(text);
  }

  return JSON.parse(text);
}