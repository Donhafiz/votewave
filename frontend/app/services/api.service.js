const API_BASE = "http://localhost:3001";

export async function get(url) {
  const res = await fetch(API_BASE + url);
  return res.json();
}

export async function post(url, body) {
  const res = await fetch(API_BASE + url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  return res.json();
}