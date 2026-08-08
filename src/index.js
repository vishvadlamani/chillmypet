const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>chill my pet</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0;
    min-height: 100vh;
    display: grid;
    place-content: center;
    gap: 0.75rem;
    text-align: center;
    font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
    background: Canvas;
    color: CanvasText;
  }
  h1 { margin: 0; font-size: clamp(1.75rem, 6vw, 3rem); letter-spacing: -0.02em; }
  p { margin: 0; opacity: 0.7; }
</style>
</head>
<body>
  <h1>chill my pet</h1>
  <p>Coming soon.</p>
</body>
</html>`;

export default {
  async fetch(request) {
    const { pathname } = new URL(request.url);

    if (pathname === "/health") {
      return Response.json({ status: "ok" });
    }

    return new Response(PAGE, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
};
