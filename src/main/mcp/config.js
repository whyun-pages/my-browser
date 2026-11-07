// MCP 接口的配置：开关、端口、令牌，保存在用户数据目录的 mcp.json。
// 转接脚本（stdio-bridge.js）也会读这个文件，所以字段名要保持稳定。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CONFIG_FILE = 'mcp.json';
const DEFAULT_PORT = 17345;

class ConfigError extends Error {
    constructor(message, code) {
        super(message);
        this.code = code;
    }
}

function generateToken() {
    return crypto.randomBytes(32).toString('base64url');
}

function isValidPort(port) {
    return Number.isInteger(port) && port >= 1024 && port <= 65535;
}

class McpConfig {
    /**
     * @param {string} dir 配置所在目录，一般是 app.getPath('userData')
     */
    constructor(dir) {
        this.file = path.join(dir, CONFIG_FILE);
        this.data = { enabled: false, port: DEFAULT_PORT, token: '' };
        /** 读取失败的原因；有值时拒绝写入，避免覆盖用户手改坏的文件 */
        this.loadError = null;
    }

    /**
     * 读取配置。文件不存在视为默认值；内容损坏时记下错误并保持关闭，不覆盖原文件。
     */
    load() {
        this.loadError = null;
        let text;
        try {
            text = fs.readFileSync(this.file, 'utf8');
        } catch (e) {
            if (e.code === 'ENOENT') {
                return this.data;
            }
            this.loadError = new ConfigError(`无法读取 ${this.file}：${e.message}`, 'read_failed');
            this.data.enabled = false;
            return this.data;
        }
        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch (e) {
            this.loadError = new ConfigError(`${this.file} 不是有效的 JSON：${e.message}`, 'corrupt');
            this.data.enabled = false;
            return this.data;
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            this.loadError = new ConfigError(`${this.file} 的内容应为 JSON 对象`, 'corrupt');
            this.data.enabled = false;
            return this.data;
        }
        const port = parsed.port === undefined ? DEFAULT_PORT : parsed.port;
        if (!isValidPort(port)) {
            this.loadError = new ConfigError(`${this.file} 中的端口 ${JSON.stringify(parsed.port)} 无效，应为 1024–65535 的整数`, 'corrupt');
            this.data.enabled = false;
            return this.data;
        }
        if (parsed.token !== undefined && (typeof parsed.token !== 'string' || parsed.token.length < 16)) {
            this.loadError = new ConfigError(`${this.file} 中的令牌无效，删除 token 字段后会重新生成`, 'corrupt');
            this.data.enabled = false;
            return this.data;
        }
        this.data = {
            enabled: parsed.enabled === true,
            port,
            token: parsed.token || '',
        };
        return this.data;
    }

    /**
     * 原子写入：先写临时文件再改名，写失败时原文件保持不变。
     */
    save() {
        if (this.loadError) {
            throw this.loadError;
        }
        const dir = path.dirname(this.file);
        fs.mkdirSync(dir, { recursive: true });
        const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
        const text = JSON.stringify(this.data, null, 2) + '\n';
        try {
            // 令牌是凭据：在支持权限位的系统上只允许当前用户读写
            fs.writeFileSync(tmp, text, { encoding: 'utf8', mode: 0o600 });
            fs.renameSync(tmp, this.file);
        } catch (e) {
            fs.rmSync(tmp, { force: true });
            throw new ConfigError(`无法保存 ${this.file}：${e.message}`, 'write_failed');
        }
    }

    /**
     * 修改开关并保存；首次开启时生成令牌。保存失败时内存状态回滚。
     */
    setEnabled(enabled) {
        if (this.loadError) {
            throw this.loadError;
        }
        const prev = { ...this.data };
        this.data.enabled = !!enabled;
        if (this.data.enabled && !this.data.token) {
            this.data.token = generateToken();
        }
        try {
            this.save();
        } catch (e) {
            this.data = prev;
            throw e;
        }
        return this.data;
    }
}

module.exports = { McpConfig, ConfigError, DEFAULT_PORT, CONFIG_FILE };
