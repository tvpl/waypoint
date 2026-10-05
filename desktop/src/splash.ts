/** Shown while the local server starts (a second or two), in the app's colors and logo. */
export function splashHtml(dark: boolean): string {
  const bg = dark ? "#0e0f12" : "#f5f5f2";
  const ink = dark ? "#ececf1" : "#17171c";
  const muted = dark ? "#9c9ea9" : "#686973";
  const tile = dark ? "#ececf1" : "#17171c";
  const glyph = dark ? "#0e0f12" : "#f5f5f2";
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Waypoint</title>
<style>
  html,body{margin:0;height:100%;background:${bg};color:${ink};font:13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-user-select:none;user-select:none}
  body{display:grid;place-items:center;-webkit-app-region:drag}
  .wrap{display:flex;flex-direction:column;align-items:center;gap:18px;animation:in .4s cubic-bezier(.2,.8,.2,1)}
  .logo{width:56px;height:56px;border-radius:15px;background:${tile};display:grid;place-items:center}
  .name{font-size:17px;font-weight:600;letter-spacing:-.01em}
  .bar{width:120px;height:3px;border-radius:3px;background:${muted}33;overflow:hidden}
  .bar i{display:block;width:40%;height:100%;border-radius:3px;background:${muted};animation:slide 1.1s ease-in-out infinite}
  @keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}
  @keyframes in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
</style></head><body><div class="wrap">
  <div class="logo"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="${glyph}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H12a3 3 0 0 0 3-3V9a3 3 0 0 1 3-3"/></svg></div>
  <div class="name">Waypoint</div>
  <div class="bar"><i></i></div>
</div></body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}
