import { API_ERROR_MESSAGES, type ApiErrorCode } from "@tavern/core";
import { raw } from "hono/html";
import type { FC, PropsWithChildren } from "hono/jsx";

export interface QuestSummary {
  id: string;
  title: string;
  deadline: string;
  submissionCount: number;
}

export interface QuestView {
  quest: {
    id: string;
    title: string;
    description: string;
    status: "active" | "settled";
    deadline: string;
    createdAt: string;
  };
  submissions: Array<{
    id: string;
    content: string;
    authorName: string;
    votes: number;
    createdAt: string;
  }>;
}

const CSS = `
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,"Noto Sans TC",sans-serif;background:#faf7f2;color:#2b2420;line-height:1.6}
header{background:#5c3a21;padding:12px 16px}
header a{color:#fff;text-decoration:none;font-weight:700;font-size:1.1rem}
main{max-width:640px;margin:0 auto;padding:16px}
.card{background:#fff;border:1px solid #e5ddd3;border-radius:12px;padding:16px;margin-bottom:16px}
h1{font-size:1.35rem;margin:0 0 8px}
h2{font-size:1.1rem;margin:0 0 12px}
.deadline{color:#8a5a2b;font-size:.9rem;margin:0 0 12px}
.prompt{white-space:pre-wrap;background:#f4efe7;border-radius:8px;padding:12px;margin:0 0 12px}
textarea,input[type=text]{width:100%;padding:10px;border:1px solid #cbb99f;border-radius:8px;font:inherit;margin-bottom:12px}
textarea{min-height:7rem}
button{background:#5c3a21;color:#fff;border:0;border-radius:8px;padding:12px 20px;font-size:1rem;cursor:pointer;width:100%}
button.secondary{background:#fff;color:#5c3a21;border:1px solid #5c3a21}
.flash{padding:10px 12px;border-radius:8px;margin-bottom:16px}
.flash-ok{background:#e6f4e6;border:1px solid #9ac79a}
.flash-err{background:#fbeaea;border:1px solid #d9a0a0}
.entry{display:flex;gap:10px;border-top:1px solid #eee;padding:12px 0;align-items:flex-start}
.entry:first-of-type{border-top:0;padding-top:0}
.entry-body{flex:1;min-width:0}
.entry-author{font-weight:700;font-size:.95rem}
.entry-content{white-space:pre-wrap;margin:4px 0}
.votes{color:#5c3a21;font-weight:700;white-space:nowrap}
.quest-link{display:block;color:inherit;text-decoration:none}
.quest-link h2{color:#5c3a21}
.muted{color:#7a6f63}
.cf-turnstile{margin-bottom:12px}
form{margin:0}
label.field{display:block;font-size:.95rem}
`;

export const Layout: FC<PropsWithChildren<{ title: string; withTurnstile?: boolean }>> = (
  props,
) => (
  <html lang="zh-Hant">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="description" content="任務酒館:出題、派你的 AI 參賽、投票選出最強作品。" />
      <title>{props.title}</title>
      <style>{raw(CSS)}</style>
      {props.withTurnstile ? (
        <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
      ) : null}
    </head>
    <body>
      <header>
        <a href="/">任務酒館</a>
      </header>
      <main>{props.children}</main>
    </body>
  </html>
);

const dateFormat = new Intl.DateTimeFormat("zh-TW", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Taipei",
});

export function formatDeadline(iso: string, now: Date): string {
  const deadline = new Date(iso);
  const remainMs = deadline.getTime() - now.getTime();
  const label = `截止:${dateFormat.format(deadline)}`;
  if (remainMs <= 0) return `${label}(已截止)`;
  const days = Math.ceil(remainMs / 86_400_000);
  return `${label}(剩 ${days} 天)`;
}

export const HomePage: FC<{ quests: QuestSummary[]; now: Date }> = ({ quests, now }) => (
  <Layout title="任務酒館">
    <h1>進行中的擂台</h1>
    {quests.length === 0 ? (
      <p class="muted">目前沒有進行中的擂台,晚點再來看看!</p>
    ) : (
      quests.map((q) => (
        <div class="card">
          <a class="quest-link" href={`/quests/${q.id}`}>
            <h2>{q.title}</h2>
            <p class="deadline">{formatDeadline(q.deadline, now)}</p>
            <p class="muted">{q.submissionCount} 件參賽作品</p>
          </a>
        </div>
      ))
    )}
  </Layout>
);

const COPY_SCRIPT = `
var btn=document.getElementById("copy-btn");
if(btn){btn.addEventListener("click",function(){
  var text=document.getElementById("prompt-text").innerText;
  function done(){btn.textContent="已複製!";setTimeout(function(){btn.textContent="複製題目";},2000);}
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(done);}
  else{var ta=document.createElement("textarea");ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand("copy");document.body.removeChild(ta);done();}
});}
`;

export const FLASH_OK: Record<string, string> = {
  submitted: "作品已送出,參賽成功!",
  voted: "投票成功!",
};

export function flashError(code: string): string {
  return API_ERROR_MESSAGES[code as ApiErrorCode] ?? "發生未知的錯誤,請再試一次";
}

export const QuestPage: FC<{
  view: QuestView;
  now: Date;
  siteKey: string;
  ok?: string;
  err?: string;
}> = ({ view, now, siteKey, ok, err }) => {
  const { quest, submissions } = view;
  const open = quest.status === "active" && new Date(quest.deadline).getTime() > now.getTime();

  return (
    <Layout title={`${quest.title} — 任務酒館`} withTurnstile={open}>
      {ok && FLASH_OK[ok] ? <p class="flash flash-ok">{FLASH_OK[ok]}</p> : null}
      {err ? <p class="flash flash-err">{flashError(err)}</p> : null}

      <div class="card">
        <h1>{quest.title}</h1>
        <p class="deadline">{formatDeadline(quest.deadline, now)}</p>
        <p class="prompt" id="prompt-text">
          {quest.description}
        </p>
        {open ? (
          <button type="button" class="secondary" id="copy-btn">
            複製題目
          </button>
        ) : (
          <p class="muted">這個擂台已經結束,不能再參賽或投票。</p>
        )}
      </div>

      <div class="card">
        <h2>參賽作品({submissions.length})</h2>
        {submissions.length === 0 ? (
          <p class="muted">還沒有作品,搶頭香!</p>
        ) : open ? (
          <form method="post" action={`/quests/${quest.id}/votes`}>
            {submissions.map((s) => (
              <label class="entry">
                <input type="radio" name="submissionId" value={s.id} required />
                <span class="entry-body">
                  <span class="entry-author">{s.authorName}</span>
                  <span class="entry-content">{s.content}</span>
                </span>
                <span class="votes">{s.votes} 票</span>
              </label>
            ))}
            <div class="cf-turnstile" data-sitekey={siteKey}></div>
            <button type="submit">投下這一票</button>
          </form>
        ) : (
          submissions.map((s) => (
            <div class="entry">
              <span class="entry-body">
                <span class="entry-author">{s.authorName}</span>
                <span class="entry-content">{s.content}</span>
              </span>
              <span class="votes">{s.votes} 票</span>
            </div>
          ))
        )}
      </div>

      {open ? (
        <div class="card">
          <h2>我要參賽</h2>
          <p class="muted">把題目貼給你的 AI,再把它的回答貼回來就完成參賽。</p>
          <form method="post" action={`/quests/${quest.id}/submissions`}>
            <label class="field">
              AI 的回答
              <textarea name="content" maxlength={2000} required placeholder="把 AI 的回答貼在這裡"></textarea>
            </label>
            <label class="field">
              你的暱稱(選填)
              <input type="text" name="displayName" maxlength={50} placeholder="匿名冒險者" />
            </label>
            <div class="cf-turnstile" data-sitekey={siteKey}></div>
            <button type="submit">送出參賽</button>
          </form>
        </div>
      ) : null}

      {open ? <script>{raw(COPY_SCRIPT)}</script> : null}
    </Layout>
  );
};

export const NotFoundPage: FC = () => (
  <Layout title="找不到擂台 — 任務酒館">
    <div class="card">
      <h1>找不到這個擂台</h1>
      <p class="muted">
        它可能已經下架,或網址打錯了。<a href="/">回公告板看看其他擂台</a>。
      </p>
    </div>
  </Layout>
);
