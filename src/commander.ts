export class Commander {
    aliasMap: Map<string, string> = new Map();
    hookMap: Set<string> = new Set();
    script: any = null;

    // Flags accepted by `call` to suppress the agent-side return-value log.
    private readonly silentCallFlags = new Set(["--silent", "-s", "--no-log"]);
    private readonly silentCallSentinel = "__pixel_silent__";

    // Add index signature to allow string-based method access
    [key: string]: any;

    apply(command:string, ...args:string[]): string {
        if (!this[command]) return "command not found";
        return this[command](...args);
    }

    init(script: any): void {
        this.script = script;
    }

    dispose(): void {
        this.script = null;
    }

    alias(tar: string, str: string): string {
        str = this.aliasMap.get(str) || str;
        if(this.aliasMap.has(tar)) return "alias already exists";
        this.aliasMap.set(tar, str);
        return `aliased ${tar} -> ${str}`;
    }

    list(tar: string): string {
        if(!tar) return "need at least one argument";
        switch (tar) {
            case "alias":
                if(!this.aliasMap.size) return "no aliases";
                return Array.from(this.aliasMap.entries()).map(([key, value]) => `${key} -> ${value}`).join("\n");
            case "hook":
                if(!this.hookMap.size) return "no hooks";
                return Array.from(this.hookMap.values()).map(key => `${key}`).join("\n");
            default:
                return "need at least one argument";
        }
    }

    search(str: string): string {
        if(!this.script) return "script not initialized";
        if(!str) return "need at least one argument";
        this.script.post(["search", str]);
        return `searched ${str}`;
    }

    rem(tar: string, ...args: string[]): string {
        if(!tar) return "need at least one argument";
        switch (tar) {
            case "alias":
                args.forEach(arg => this.aliasMap.delete(arg));
                return "removed aliases";
            default:
                return "need at least one argument";
        }
    }

    hook(tar: string): string {
        if(!this.script) return "script not initialized";
        if(!tar) return "need at least one argument";
        tar = this.aliasMap.get(tar) || tar;
        if(this.hookMap.has(tar)) return "hook already exists";
        this.hookMap.add(tar);
        this.script.post(["hook", tar]);
        return `hooked ${tar}`;
    }

    unhook(): string {
        if(!this.script) return "script not initialized";
        if(!this.hookMap.size) return "no hooks";
        this.hookMap.clear();
        this.script.post(["unhook"]);
        return "unhooked all";
    }

    call(tar: string, ...args: string[]): string {
        if(!this.script) return "script not initialized";
        if(!tar) return "need at least one argument";
        tar = this.aliasMap.get(tar) || tar;
        const silent = args.some(arg => this.silentCallFlags.has(arg));
        const callArgs = args
            .filter(arg => !this.silentCallFlags.has(arg))
            .map(arg => this.aliasMap.get(arg) || arg);
        const payload = silent
            ? ["call", tar, this.silentCallSentinel, ...callArgs]
            : ["call", tar, ...callArgs];
        this.script.post(payload);
        return `called ${tar} -> ${callArgs.join(" ")}${silent ? " (silent log)" : ""}`;
    }

    read(tar: string, type: string = "uint32"): string {
        if(!this.script) return "script not initialized";
        if(!tar) return "need at least one argument";
        tar = this.aliasMap.get(tar) || tar;
        this.script.post(["read", tar, type]);
        return `read ${tar} (${type})`;
    }

    write(tar: string, value: string, type: string = "uint32"): string {
        if(!this.script) return "script not initialized";
        if(!tar) return "need at least one argument";
        if(!value) return "need at least one argument";
        tar = this.aliasMap.get(tar) || tar;
        this.script.post(["write", tar, type, value]);
        return `wrote ${tar} -> ${value} (${type})`;
    }
}