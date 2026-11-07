const { BookmarksIPC } = require('./bookmarks.ipc');
const { WindowIPC } = require('./window.ipc');
const { WebviewHandlerIPC } = require('./webview-handler.ipc');
const { McpIPC } = require('./mcp.ipc');

class Rpcs {
    constructor(rpcOptions) {
        this.rpcOptions = rpcOptions;
        this.instances = [
            new BookmarksIPC(this.rpcOptions),
            new WindowIPC(this.rpcOptions),
            new WebviewHandlerIPC(this.rpcOptions),
            new McpIPC(this.rpcOptions),
        ]
    }
    resetRpcOptions(rpcOptions) {
        this.rpcOptions = rpcOptions;
        this.instances.forEach(instance => {
            instance.resetRpcOptions(rpcOptions);
        });
    }
}

exports.Rpcs = Rpcs;