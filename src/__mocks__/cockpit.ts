/*
 * Copyright Sensors & Signals LLC https://www.snstac.com/
 *
 * In-memory stand-in for the `cockpit` module, used only by the unit tests
 * (vitest.config.ts aliases `cockpit` to this file). It models just the API
 * surface this plugin and @snstac/cockpit-shared touch: gettext, file()
 * read/replace/watch, spawn() as a promise with stream/done/fail/close, and
 * dbus() calls for the service card.
 */

type SuperuserMode = 'require' | 'try' | null | undefined;
type Callback = (...args: unknown[]) => void;

export interface FakeProcess extends Promise<string> {
    stream(cb: (data: string) => void): FakeProcess;
    done(cb: Callback): FakeProcess;
    fail(cb: Callback): FakeProcess;
    close(problem?: string): void;
}

/** What a spawn handler returns: output, an Error to reject with, or 'pending' to never settle. */
export type SpawnResult = string | Error | 'pending';
export type SpawnHandler = (args: string[], options?: { superuser?: SuperuserMode }) => SpawnResult;

export interface SpawnCall {
    args: string[];
    options?: { superuser?: SuperuserMode; err?: string };
    /** Push data to stream() callbacks of this process. */
    emit(data: string): void;
    /** Settle the process successfully, firing done(). */
    finish(output?: string): void;
    /** Reject the process, firing fail(). */
    error(err: Error): void;
    closed: boolean;
}

interface FileWatcher {
    path: string;
    cb: Callback;
    removed: boolean;
}

const state = {
    files: new Map<string, string>(),
    readErrors: new Map<string, Error>(),
    replaceErrors: new Map<string, Error>(),
    watchers: [] as FileWatcher[],
    spawnHandler: ((): SpawnResult => '') as SpawnHandler,
    spawnCalls: [] as SpawnCall[],
    dbusProperties: {} as Record<string, unknown>,
    dbusError: null as Error | null,
};

function makeProcess(args: string[], options?: SpawnCall['options']): FakeProcess {
    const streamCbs: Array<(data: string) => void> = [];
    const doneCbs: Callback[] = [];
    const failCbs: Callback[] = [];
    let settle!: (v: string) => void;
    let reject!: (e: Error) => void;
    const promise = new Promise<string>((resolve, rej) => {
        settle = resolve;
        reject = rej;
    });
    // Callers that only use stream/done/fail must not trigger an unhandled rejection.
    promise.catch(() => {});

    const call: SpawnCall = {
        args,
        ...(options ? { options } : {}),
        closed: false,
        emit: data => streamCbs.forEach(cb => cb(data)),
        finish: (output = '') => {
            settle(output);
            doneCbs.forEach(cb => cb(output));
        },
        error: err => {
            reject(err);
            failCbs.forEach(cb => cb(err));
        },
    };
    state.spawnCalls.push(call);

    const proc = promise as FakeProcess;
    proc.stream = cb => { streamCbs.push(cb); return proc };
    proc.done = cb => { doneCbs.push(cb); return proc };
    proc.fail = cb => { failCbs.push(cb); return proc };
    proc.close = () => { call.closed = true };

    const result = state.spawnHandler(args, options);
    if (result instanceof Error)
        queueMicrotask(() => call.error(result));
    else if (result !== 'pending')
        queueMicrotask(() => call.finish(result));
    return proc;
}

function notifyWatchers(path: string): void {
    for (const w of state.watchers) {
        if (!w.removed && w.path === path)
            w.cb(state.files.get(path) ?? null);
    }
}

const cockpit = {
    gettext: (message: string): string => message,

    file(path: string, _options?: { superuser?: SuperuserMode }) {
        return {
            async read(): Promise<string> {
                const err = state.readErrors.get(path);
                if (err)
                    throw err;
                return state.files.get(path) ?? '';
            },
            async replace(content: string | null): Promise<void> {
                const err = state.replaceErrors.get(path);
                if (err)
                    throw err;
                if (content === null)
                    state.files.delete(path);
                else
                    state.files.set(path, content);
            },
            watch(cb: Callback) {
                const w: FileWatcher = { path, cb, removed: false };
                state.watchers.push(w);
                return { remove: () => { w.removed = true } };
            },
        };
    },

    spawn(args: string[], options?: SpawnCall['options']): FakeProcess {
        return makeProcess(args, options);
    },

    dbus(_name: string | null, _options?: { superuser?: SuperuserMode }) {
        return {
            async call(_path: string, _iface: string, _method: string, callArgs?: unknown[]): Promise<unknown[]> {
                if (state.dbusError)
                    throw state.dbusError;
                const prop = String((callArgs ?? [])[1]);
                return [{ v: state.dbusProperties[prop] }];
            },
            close: () => {},
        };
    },
};

/** Test-only controls for the fake. */
export const mock = {
    state,
    reset(): void {
        state.files.clear();
        state.readErrors.clear();
        state.replaceErrors.clear();
        state.watchers = [];
        state.spawnHandler = () => '';
        state.spawnCalls = [];
        state.dbusProperties = {
            ActiveState: 'active',
            SubState: 'running',
            LoadState: 'loaded',
            UnitFileState: 'enabled',
        };
        state.dbusError = null;
    },
    /** Write a file as if changed outside the page, and fire its watchers. */
    externalWrite(path: string, content: string): void {
        state.files.set(path, content);
        notifyWatchers(path);
    },
    activeWatchers(path: string): number {
        return state.watchers.filter(w => !w.removed && w.path === path).length;
    },
    callsFor(command: string): SpawnCall[] {
        return state.spawnCalls.filter(c => c.args[0] === command);
    },
};

mock.reset();

export default cockpit;
