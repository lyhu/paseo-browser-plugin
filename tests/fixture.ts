import { createServer } from "node:http";
import { WebSocketServer } from "ws";

export async function startFixture() {
  const server = createServer((req, res) => {
    if (req.url === "/noise") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(`<body style="margin:0"><canvas width="1280" height="800"></canvas><script>
        const c=document.querySelector('canvas').getContext('2d'), image=c.createImageData(1280,800);
        let seed=1; for(let i=0;i<image.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)|0;image.data[i]=seed&255;image.data[i+1]=(seed>>>8)&255;image.data[i+2]=(seed>>>16)&255;image.data[i+3]=255;}
        c.putImageData(image,0,0);document.title='Large frame ready';
      </script>`);
      return;
    }
    if (req.url === "/broken") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(`<title>Broken page</title><script>throw new Error("fixture application failed")</script>`);
      return;
    }
    if (req.url === "/events") {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write("data: ready\n\n");
      req.on("close", () => res.end());
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><meta charset="utf-8"><title>Loading</title>
      <style>body{margin:0;height:2200px;background:#f0f5ff;font:22px sans-serif}button,input{position:absolute;left:20px;width:240px;height:40px;font:20px sans-serif}#click{top:20px}#text{top:80px}#popup{top:140px}h1{margin-left:300px}</style>
      <h1>Remote browser verification</h1><button id="click">Click and save login</button><input id="text"><button id="popup">Open popup</button>
      <script>
      let clicks=0, ws='waiting', sse='waiting';
      const refresh=()=>document.title='click:'+clicks+'|text:'+document.querySelector('#text').value+'|ws:'+ws+'|sse:'+sse+'|scroll:'+Math.round(scrollY)+'|saved:'+localStorage.getItem('saved');
      document.querySelector('#click').onclick=()=>{clicks++;localStorage.setItem('saved','yes');document.cookie='saved=yes;path=/';refresh()};
      document.querySelector('#text').oninput=refresh;
      document.querySelector('#popup').onclick=()=>window.open('/popup','_blank');
      const socket=new WebSocket('ws://'+location.host+'/socket'); socket.onopen=()=>socket.send('echo'); socket.onmessage=e=>{ws=e.data;refresh()};
      const events=new EventSource('/events');events.onmessage=e=>{sse=e.data;refresh()};
      window.onscroll=refresh; refresh();
      </script>`);
  });
  const sockets = new WebSocketServer({ server, path: "/socket" });
  sockets.on("connection", (socket) => socket.on("message", (data, isBinary) => socket.send(data, { binary: isBinary })));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("Fixture did not start");
  return {
    url: `http://127.0.0.1:${addr.port}`,
    async close() {
      for (const socket of sockets.clients) socket.terminate();
      sockets.close(); server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
