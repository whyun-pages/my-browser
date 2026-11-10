// 用临时用户数据目录启动真实应用，供集成测试使用，不读写真实浏览器会话。
// 用法：electron test/mcp/launch-app.js <userDataDir>
//
// 设置环境变量 MYBROWSER_TEST_CONTROL_PORT 时，额外在 127.0.0.1 上开一个测试控制端口：
// POST /shell  {code}        在浏览器界面（外壳页面）里执行 code，模拟用户操作
// POST /window {op}          minimize / restore / reload / cover / uncover / quit
//                            cover 用一个置顶的不透明窗口盖住主窗口，模拟浏览器被其他程序挡住
// POST /capture {file}       把窗口截图保存为 PNG
// POST /key {url, keyCode, modifiers}
//                            向地址包含 url 的网页视图发送真实按键（keyDown / char / keyUp），模拟焦点在网页里时按快捷键
// Windows 上 Electron 主进程读不到 stdin，所以用 HTTP 而不是标准输入。
const path = require('path');
const http = require('http');
const { app, BrowserWindow } = require('electron');

const dir = process.argv.find((arg, i) => i >= 2 && !arg.startsWith('-'));
if (!dir) {
    console.error('usage: electron test/mcp/launch-app.js <userDataDir>');
    process.exit(2);
}
app.setPath('userData', path.resolve(dir));
require('../../src/main/main.js');

const controlPort = Number(process.env.MYBROWSER_TEST_CONTROL_PORT || 0);
/** @type {BrowserWindow | null} */
let cover = null;

function readJson(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
            } catch (e) {
                reject(e);
            }
        });
        req.on('error', reject);
    });
}

if (controlPort) {
    app.whenReady().then(() => {
        http.createServer(async (req, res) => {
            const send = (status, body) => {
                res.writeHead(status, { 'content-type': 'application/json' });
                res.end(JSON.stringify(body));
            };
            try {
                const body = await readJson(req);
                const win = BrowserWindow.getAllWindows().find((w) => w !== cover);
                if (!win) {
                    send(503, { ok: false, error: 'no window' });
                    return;
                }
                if (req.url === '/shell') {
                    const value = await win.webContents.executeJavaScript(String(body.code));
                    send(200, { ok: true, value });
                } else if (req.url === '/window') {
                    if (body.op === 'quit') {
                        // 正常退出（和用户关窗口一样），让 localStorage 等数据落盘
                        send(200, { ok: true });
                        setTimeout(() => app.quit(), 50);
                        return;
                    } else if (body.op === 'reload') {
                        win.webContents.reload();
                    } else if (body.op === 'cover') {
                        if (!cover || cover.isDestroyed()) {
                            const b = win.getBounds();
                            cover = new BrowserWindow({
                                x: b.x - 50, y: b.y - 50, width: b.width + 100, height: b.height + 100,
                                frame: false, show: false, backgroundColor: '#336699',
                            });
                            await cover.loadURL('about:blank');
                        }
                        // 像用户切到另一个程序那样：盖住主窗口并拿走焦点
                        cover.show();
                        cover.focus();
                        // 等系统计算遮挡状态
                        await new Promise((r) => setTimeout(r, 1500));
                    } else if (body.op === 'uncover') {
                        if (cover && !cover.isDestroyed()) cover.destroy();
                        cover = null;
                    } else if (['minimize', 'restore'].includes(body.op)) {
                        win[body.op]();
                    } else {
                        send(400, { ok: false, error: 'unknown op' });
                        return;
                    }
                    send(200, { ok: true });
                } else if (req.url === '/key') {
                    const { webContents } = require('electron');
                    const guest = webContents.getAllWebContents().find((wc) => wc.getType() === 'webview'
                        && wc.hostWebContents === win.webContents && wc.getURL().includes(String(body.url)));
                    if (!guest) {
                        send(404, { ok: false, error: 'webview not found' });
                        return;
                    }
                    const modifiers = body.modifiers || [];
                    guest.focus();
                    guest.sendInputEvent({ type: 'keyDown', keyCode: body.keyCode, modifiers });
                    guest.sendInputEvent({ type: 'char', keyCode: body.keyCode, modifiers });
                    guest.sendInputEvent({ type: 'keyUp', keyCode: body.keyCode, modifiers });
                    send(200, { ok: true });
                } else if (req.url === '/capture') {
                    // 截取整个窗口，写到指定路径
                    const image = await win.webContents.capturePage();
                    require('fs').writeFileSync(String(body.file), image.toPNG());
                    send(200, { ok: true, value: image.getSize() });
                } else {
                    send(404, { ok: false, error: 'not found' });
                }
            } catch (e) {
                send(500, { ok: false, error: String(e && e.message) });
            }
        }).listen(controlPort, '127.0.0.1');
    });
}
