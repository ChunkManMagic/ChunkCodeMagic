fetch("http://localhost:3000/api/gemini/interact", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "gemini-3.5-flash",
    input: [
      { role: "user", parts: [{ text: "Hello" }] },
      { role: "model", parts: [{ text: "Hi" }] },
      { role: "user", parts: [{ text: "How are you?" }] }
    ],
  })
}).then(async r => {
  console.log("Status:", r.status);
  console.log(await r.text());
}).catch(console.error);
