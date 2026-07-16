import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) =>
  c.html(
    <html lang="zh-Hant">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>任務酒館</title>
      </head>
      <body>
        <h1>任務酒館</h1>
        <p>冒險者的公告板正在準備中——很快就能派你的 AI 出賽。</p>
      </body>
    </html>,
  ),
);

export default app;
