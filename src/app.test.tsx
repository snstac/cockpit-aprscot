// @vitest-environment jsdom
/*
 * Copyright Sensors & Signals LLC https://www.snstac.com/
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { mock } from './__mocks__/cockpit';
import { Application } from './app';

const CONFIG_FILE = '/etc/default/aprscot';

function renderApp() {
    return render(<Application />);
}

function input(key: string): HTMLInputElement | HTMLSelectElement {
    return document.getElementById(`envvar-input-${key}`) as HTMLInputElement | HTMLSelectElement;
}

async function save() {
    fireEvent.click(screen.getByRole('button', { name: 'Validate & Save' }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Validate & Save' }) as HTMLButtonElement).disabled).toBe(false));
}

beforeEach(() => {
    mock.reset();
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe('TLS upload', () => {
    test('persists an uploaded CA bundle path to the config file', async () => {
        mock.state.files.set(CONFIG_FILE, 'COT_URL=tls://tak.example:8089\n');
        renderApp();
        await waitFor(() => expect((input('COT_URL') as HTMLInputElement).value).toBe('tls://tak.example:8089'));

        fireEvent.click(screen.getByRole('button', { name: 'Expand TLS upload' }));
        const tlsCard = screen.getByTestId('aprscot-tls-card');
        const caInput = tlsCard.querySelector('input[name="tls-ca"]') as HTMLInputElement;
        fireEvent.change(caInput, {
            target: { files: [new File(['-----BEGIN CERTIFICATE-----\n'], 'ca.pem', { type: 'text/plain' })] },
        });
        fireEvent.submit(caInput.form!);
        await waitFor(() => expect(mock.state.files.get('/etc/aprscot/tls/ca.crt')).toBeDefined());
        await waitFor(() => expect(screen.getByText(/unsaved changes/)).toBeTruthy());

        await save();

        expect(screen.getByText('Configuration saved.')).toBeTruthy();
        expect(mock.state.files.get(CONFIG_FILE)).toMatch(/^PYTAK_TLS_CLIENT_CAFILE=\/etc\/aprscot\/tls\/ca\.crt$/m);
    });
});

describe('sensor position validation', () => {
    test.each([
        ['SENSOR_LAT', '91'],
        ['SENSOR_LAT', '-90.5'],
        ['SENSOR_LON', '181'],
        ['SENSOR_LON', '-999'],
    ])('rejects out-of-range %s=%s', async (key, value) => {
        renderApp();
        fireEvent.change(input(key), { target: { value } });
        expect(await screen.findByText('Invalid value')).toBeTruthy();
    });

    test.each([
        ['SENSOR_LAT', '90'],
        ['SENSOR_LAT', '-33.8688'],
        ['SENSOR_LON', '-180'],
        ['SENSOR_LON', '151.2093'],
        // zero-padded values were accepted before the range check and may be in existing files
        ['SENSOR_LAT', '-05.5'],
        ['SENSOR_LON', '045.123'],
    ])('accepts in-range %s=%s', async (key, value) => {
        renderApp();
        fireEvent.change(input(key), { target: { value } });
        await waitFor(() => expect(screen.getByText(/unsaved changes/)).toBeTruthy());
        expect(screen.queryByText(/Value must be between|Invalid value/)).toBeNull();
    });
});

type Handler = (args: string[]) => string | Error | 'pending';

/** Route spawn calls: the service/status card polling gets fixed output, everything else goes to `rest`. */
function onSpawn(rest: Handler) {
    mock.state.spawnHandler = args => {
        if (args[0] === 'systemctl' && args[1] === 'status')
            return 'aprscot.service - APRS to TAK gateway\n   Active: active (running)';
        return rest(args);
    };
}

async function loaded(file: string) {
    mock.state.files.set(CONFIG_FILE, file);
    const view = renderApp();
    // The initial read has settled once the form reflects the file and is clean.
    await waitFor(() => expect(mock.state.watchers.length).toBeGreaterThan(0));
    await new Promise(resolve => setTimeout(resolve, 0));
    return view;
}

function written(): string {
    return mock.state.files.get(CONFIG_FILE) ?? '';
}

function logsPre(): string {
    const btn = screen.getByRole('button', { name: 'Show Logs' });
    const pre = btn.parentElement!.nextElementSibling as HTMLElement;
    return pre.textContent ?? '';
}

describe('loading the configuration file', () => {
    test('shows values from disk, unquoting them, and defaults for missing keys', async () => {
        mock.state.files.set(CONFIG_FILE, [
            '# aprscot settings',
            'COT_URL=tcp://tak.example:8087',
            'APRSIS_FILTER="r/37.7/-122.4/100 t/p"',
            "APRSIS_CALLSIGN='N0CALL'",
            '',
        ].join('\n'));
        renderApp();

        await waitFor(() => expect(input('COT_URL').value).toBe('tcp://tak.example:8087'));
        expect(input('APRSIS_FILTER').value).toBe('r/37.7/-122.4/100 t/p');
        expect(input('APRSIS_CALLSIGN').value).toBe('N0CALL');
        expect(input('APRSIS_HOST').value).toBe('rotate.aprs.net');
        expect(input('DEBUG').value).toBe('false');
        expect(screen.queryByText(/unsaved changes/)).toBeNull();
    });

    test('renders field metadata: required marker, defaults, ranges and options', async () => {
        renderApp();
        const label = document.querySelector('label[for="envvar-input-KISS_PORT"]')!;
        expect(label.textContent).toContain('Default: 8001 (Range: 1 - 65535)');
        const proto = document.querySelector('label[for="envvar-input-TAK_PROTO"]')!;
        expect(proto.textContent).toContain('(Options: 0, 1, 2)');
        const cot = document.querySelector('label[for="envvar-input-COT_URL"]')!;
        expect(cot.textContent).toContain('Required');
        expect((input('KISS_PORT') as HTMLInputElement).type).toBe('number');
        expect((input('KISS_PORT') as HTMLInputElement).min).toBe('1');
        expect((input('KISS_PORT') as HTMLInputElement).max).toBe('65535');
        expect((input('COT_URL') as HTMLInputElement).type).toBe('text');
        expect(input('TAK_PROTO').tagName).toBe('SELECT');
        expect(input('DEBUG').tagName).toBe('SELECT');
    });

    test('a read failure shows a warning and falls back to defaults', async () => {
        mock.state.readErrors.set(CONFIG_FILE, new Error('Permission denied'));
        renderApp();

        expect(await screen.findByText('Failed to read configuration file: Permission denied.')).toBeTruthy();
        expect(input('COT_URL').value).toBe('udp+wo://239.2.3.1:6969');
    });

    test('a non-Error read rejection is reported as text', async () => {
        mock.state.readErrors.set(CONFIG_FILE, 'not found' as unknown as Error);
        renderApp();

        expect(await screen.findByText('Failed to read configuration file: not found.')).toBeTruthy();
    });

    test('reloads when the file changes on disk and the form is clean', async () => {
        await loaded('COT_URL=tcp://one:8087\n');
        await waitFor(() => expect(input('COT_URL').value).toBe('tcp://one:8087'));

        mock.externalWrite(CONFIG_FILE, 'COT_URL=tcp://two:8087\n');

        await waitFor(() => expect(input('COT_URL').value).toBe('tcp://two:8087'));
    });

    test('keeps unsaved edits when the file changes on disk', async () => {
        await loaded('COT_URL=tcp://one:8087\n');
        await waitFor(() => expect(input('COT_URL').value).toBe('tcp://one:8087'));
        fireEvent.change(input('APRSIS_CALLSIGN'), { target: { value: 'EDITED' } });

        mock.externalWrite(CONFIG_FILE, 'COT_URL=tcp://two:8087\n');
        await new Promise(resolve => setTimeout(resolve, 20));

        expect(input('COT_URL').value).toBe('tcp://one:8087');
        expect(input('APRSIS_CALLSIGN').value).toBe('EDITED');
        expect(screen.getByText(/unsaved changes/)).toBeTruthy();
    });

    test('keeps unsaved edits when a re-read fails', async () => {
        await loaded('COT_URL=tcp://one:8087\n');
        await waitFor(() => expect(input('COT_URL').value).toBe('tcp://one:8087'));
        fireEvent.change(input('APRSIS_CALLSIGN'), { target: { value: 'EDITED' } });

        mock.state.readErrors.set(CONFIG_FILE, new Error('gone'));
        mock.externalWrite(CONFIG_FILE, '');
        await new Promise(resolve => setTimeout(resolve, 20));

        expect(screen.queryByText(/Failed to read configuration file/)).toBeNull();
        expect(input('APRSIS_CALLSIGN').value).toBe('EDITED');
    });

    test('removes the file watcher on unmount', async () => {
        const view = await loaded('');
        expect(mock.activeWatchers(CONFIG_FILE)).toBe(1);

        view.unmount();

        expect(mock.activeWatchers(CONFIG_FILE)).toBe(0);
    });
});

describe('validation', () => {
    test.each([
        ['COT_URL', '', 'Invalid value'],
        ['COT_URL', 'tak.example:8087', 'Invalid value'],
        ['APRSIS_CALLSIGN', 'WAY-TOO-LONG', 'Invalid value'],
        ['KISS_PORT', '70000', 'Value must be between 1 and 65535'],
        ['COT_STALE', '0', 'Value must be between 1 and 604800'],
    ])('%s=%j shows %j', async (key, value, message) => {
        renderApp();
        fireEvent.change(input(key), { target: { value } });
        expect(await screen.findByText(message)).toBeTruthy();
    });

    test('clears an error once the value is fixed', async () => {
        renderApp();
        fireEvent.change(input('KISS_PORT'), { target: { value: '0' } });
        expect(await screen.findByText(/Value must be between/)).toBeTruthy();
        fireEvent.change(input('KISS_PORT'), { target: { value: '8001' } });
        await waitFor(() => expect(screen.queryByText(/Value must be between/)).toBeNull());
    });

    test('optional fields may be left empty', async () => {
        renderApp();
        fireEvent.change(input('APRSIS_HOST'), { target: { value: '' } });
        fireEvent.change(input('KISS_PORT'), { target: { value: '' } });
        await waitFor(() => expect(screen.getByText(/unsaved changes/)).toBeTruthy());
        expect(screen.queryByText(/Invalid value|Value must be between/)).toBeNull();
    });

    test('blocks saving while any field is invalid, including untouched ones from disk', async () => {
        const original = 'COT_URL=not-a-url\n';
        await loaded(original);
        await waitFor(() => expect(input('COT_URL').value).toBe('not-a-url'));

        await save();

        expect(screen.getByText('Fix validation errors before saving.')).toBeTruthy();
        expect(screen.getByText('Invalid value')).toBeTruthy();
        expect(written()).toBe(original);
    });
});

describe('saving', () => {
    test('rewrites known keys in place, preserves comments and unknown lines, and appends new keys', async () => {
        await loaded([
            '# managed by hand',
            'COT_URL=udp://10.0.0.1:6969',
            'export KISS_HOST=direwolf',
            'UNRELATED_VAR=keep me',
            '',
        ].join('\n'));
        await waitFor(() => expect(input('KISS_HOST').value).toBe('direwolf'));

        fireEvent.change(input('COT_URL'), { target: { value: 'tls://tak.example:8089' } });
        fireEvent.change(input('APRSIS_FILTER'), { target: { value: 'r/37.7/-122.4/100 t/p' } });
        fireEvent.change(input('DEBUG'), { target: { value: 'true' } });
        fireEvent.change(input('TAK_PROTO'), { target: { value: '1' } });
        expect(screen.getByText(/unsaved changes/)).toBeTruthy();

        await save();

        expect(screen.getByText('Configuration saved.')).toBeTruthy();
        expect(written()).toBe([
            '# managed by hand',
            'COT_URL=tls://tak.example:8089',
            'export KISS_HOST=direwolf',
            'UNRELATED_VAR=keep me',
            '',
            '# Added by Cockpit APRSCOT',
            'APRSIS_FILTER="r/37.7/-122.4/100 t/p"',
            'TAK_PROTO=1',
            'DEBUG=true',
            '',
        ].join('\n'));
        expect(screen.queryByText(/unsaved changes/)).toBeNull();
        expect(mock.callsFor('systemctl').filter(c => c.args[1] === 'restart')).toHaveLength(0);
    });

    test('an unchanged file that already ends in a newline is written back unchanged', async () => {
        const original = '# x\nCOT_URL=udp://10.0.0.1:6969\n';
        await loaded(original);
        await waitFor(() => expect(input('COT_URL').value).toBe('udp://10.0.0.1:6969'));

        await save();

        expect(written()).toBe(original);
    });

    test('a missing file gets the required key and a trailing newline', async () => {
        renderApp();
        await waitFor(() => expect(mock.state.watchers.length).toBeGreaterThan(0));

        await save();

        expect(written()).toBe('\n# Added by Cockpit APRSCOT\nCOT_URL=udp+wo://239.2.3.1:6969\n');
    });

    test('shows the write error when replacing the file fails', async () => {
        await loaded('');
        mock.state.replaceErrors.set(CONFIG_FILE, new Error('Read-only file system'));

        await save();

        expect(screen.getByText('Failed to update configuration file: Read-only file system')).toBeTruthy();
    });

    test('shows a non-Error write failure as text', async () => {
        await loaded('');
        mock.state.replaceErrors.set(CONFIG_FILE, 'EACCES' as unknown as Error);

        await save();

        expect(screen.getByText('Failed to update configuration file: EACCES')).toBeTruthy();
    });

    test('restarts the service after saving when requested', async () => {
        onSpawn(() => '');
        await loaded('');
        fireEvent.click(document.getElementById('aprscot-save-restart')!);

        await save();

        const restarts = mock.callsFor('systemctl').filter(c => c.args[1] === 'restart');
        expect(restarts.map(c => c.args)).toEqual([['systemctl', 'restart', 'aprscot']]);
        expect(restarts[0].options?.superuser).toBe('try');
        expect(screen.getByText('Configuration saved and service restarted.')).toBeTruthy();
    });

    test('reports a failed restart but keeps the saved file', async () => {
        onSpawn(args => (args[1] === 'restart' ? new Error('Unit aprscot.service not found.') : ''));
        await loaded('');
        fireEvent.click(document.getElementById('aprscot-save-restart')!);

        await save();

        expect(screen.getByText('Saved, but restart failed: Unit aprscot.service not found.')).toBeTruthy();
        expect(written()).toContain('COT_URL=udp+wo://239.2.3.1:6969');
    });

    test('reports a non-Error restart failure as text', async () => {
        onSpawn(args => (args[1] === 'restart' ? 'pending' : ''));
        await loaded('');
        fireEvent.click(document.getElementById('aprscot-save-restart')!);

        fireEvent.click(screen.getByRole('button', { name: 'Validate & Save' }));
        await waitFor(() => expect(mock.callsFor('systemctl').some(c => c.args[1] === 'restart')).toBe(true));
        expect(screen.getByRole('button', { name: 'Saving…' })).toBeTruthy();
        mock.callsFor('systemctl').find(c => c.args[1] === 'restart')!.error('exit 5' as unknown as Error);

        expect(await screen.findByText('Saved, but restart failed: exit 5')).toBeTruthy();
    });

    test('the toast can be dismissed', async () => {
        await loaded('');
        await save();
        expect(screen.getByText('Configuration saved.')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

        expect(screen.queryByText('Configuration saved.')).toBeNull();
    });
});

describe('TLS paths', () => {
    test('installing a client certificate and key fills and saves their paths', async () => {
        await loaded('COT_URL=tls://tak.example:8089\n');
        fireEvent.click(screen.getByRole('button', { name: 'Expand TLS upload' }));
        const card = screen.getByTestId('aprscot-tls-card');
        const cert = card.querySelector('input[name="tls-cert"]') as HTMLInputElement;
        const key = card.querySelector('input[name="tls-key"]') as HTMLInputElement;
        fireEvent.change(cert, { target: { files: [new File(['CERT'], 'c.pem')] } });
        fireEvent.change(key, { target: { files: [new File(['KEY'], 'k.pem')] } });
        fireEvent.submit(cert.form!);

        await waitFor(() => expect(input('PYTAK_TLS_CLIENT_CERT').value).toBe('/etc/aprscot/tls/client.crt'));
        expect(input('PYTAK_TLS_CLIENT_KEY').value).toBe('/etc/aprscot/tls/client.key');
        expect(input('PYTAK_TLS_CLIENT_CAFILE').value).toBe('');
        expect(mock.state.files.get('/etc/aprscot/tls/client.crt')).toBe('CERT');

        await save();

        expect(written()).toContain('PYTAK_TLS_CLIENT_CERT=/etc/aprscot/tls/client.crt\n');
        expect(written()).toContain('PYTAK_TLS_CLIENT_KEY=/etc/aprscot/tls/client.key\n');
        expect(written()).not.toContain('PYTAK_TLS_CLIENT_CAFILE');
    });
});

describe('cards', () => {
    test('the configuration card collapses and expands', async () => {
        renderApp();
        expect(input('COT_URL')).not.toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Collapse configuration' }));
        expect(input('COT_URL')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Expand configuration' }));
        expect(input('COT_URL')).not.toBeNull();
    });

    test('the advanced card shows the raw file contents', async () => {
        await loaded('# raw\nCOT_URL=tcp://raw:1\n');
        expect(screen.queryByText(/Raw Configuration File Contents/)).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Expand advanced' }));

        const heading = screen.getByText(/Raw Configuration File Contents/);
        await waitFor(() => expect(heading.nextElementSibling!.textContent).toBe('# raw\nCOT_URL=tcp://raw:1\n'));

        fireEvent.click(screen.getByRole('button', { name: 'Collapse advanced' }));
        expect(screen.queryByText(/Raw Configuration File Contents/)).toBeNull();
    });

    test('the debug card collapses again', async () => {
        renderApp();
        fireEvent.click(screen.getByRole('button', { name: 'Expand debug' }));
        expect(screen.getByRole('button', { name: 'Show Logs' })).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Collapse debug' }));
        expect(screen.queryByRole('button', { name: 'Show Logs' })).toBeNull();
    });
});

describe('status output', () => {
    test('shows systemctl status and polls it every 4 seconds until unmounted', async () => {
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
        onSpawn(() => '');
        const view = renderApp();
        fireEvent.click(screen.getByRole('button', { name: 'Expand debug' }));

        expect(await screen.findByText(/Active: active \(running\)/)).toBeTruthy();
        const statusCalls = () => mock.callsFor('systemctl').filter(c => c.args[1] === 'status');
        expect(statusCalls()).toHaveLength(1);
        expect(statusCalls()[0].args).toEqual(['systemctl', 'status', 'aprscot', '--no-pager']);

        vi.advanceTimersByTime(4000);
        expect(statusCalls()).toHaveLength(2);

        view.unmount();
        vi.advanceTimersByTime(8000);
        expect(statusCalls()).toHaveLength(2);
    });

    test('shows a failure message when systemctl status fails', async () => {
        mock.state.spawnHandler = args => (args[1] === 'status' ? new Error('exit 3') : '');
        renderApp();
        fireEvent.click(screen.getByRole('button', { name: 'Expand debug' }));

        expect(await screen.findByText('Failed to get status output.')).toBeTruthy();
    });

    test('ignores a status result that arrives after unmount', async () => {
        mock.state.spawnHandler = args => (args[1] === 'status' ? 'pending' : '');
        const view = renderApp();
        fireEvent.click(screen.getByRole('button', { name: 'Expand debug' }));
        const call = mock.callsFor('systemctl').find(c => c.args[1] === 'status')!;
        expect(screen.getByText('Loading...')).toBeTruthy();

        view.unmount();
        call.finish('late');
        await Promise.resolve();
        expect(document.body.textContent).not.toContain('late');
    });
});

describe('service logs', () => {
    function openDebug() {
        renderApp();
        fireEvent.click(screen.getByRole('button', { name: 'Expand debug' }));
    }

    test('starts with a placeholder', () => {
        openDebug();
        expect(logsPre()).toBe('No logs to display.');
    });

    test('Show Logs displays today\'s journal for the unit', async () => {
        onSpawn(args => (args[0] === 'journalctl' ? 'Oct 17 aprscot[1]: started\n' : ''));
        openDebug();

        fireEvent.click(screen.getByRole('button', { name: 'Show Logs' }));

        await waitFor(() => expect(logsPre()).toBe('Oct 17 aprscot[1]: started\n'));
        expect(mock.callsFor('journalctl')[0].args).toEqual(['journalctl', '-u', 'aprscot', '--no-pager', '--since', 'today']);
    });

    test('Show Logs reports an empty journal', async () => {
        onSpawn(() => '');
        openDebug();
        fireEvent.click(screen.getByRole('button', { name: 'Show Logs' }));
        await waitFor(() => expect(logsPre()).toBe('No logs found for this service.'));
    });

    test('Show Logs reports a journalctl failure', async () => {
        onSpawn(args => (args[0] === 'journalctl' ? new Error('denied') : ''));
        openDebug();
        fireEvent.click(screen.getByRole('button', { name: 'Show Logs' }));
        await waitFor(() => expect(logsPre()).toBe('Failed to retrieve service logs.'));
    });

    test('Follow Logs streams output; Stop Following closes the process', async () => {
        onSpawn(args => (args[0] === 'journalctl' ? 'pending' : ''));
        openDebug();

        fireEvent.click(screen.getByRole('button', { name: 'Follow Logs' }));
        const follow = mock.callsFor('journalctl')[0];
        expect(follow.args).toEqual(['journalctl', '-u', 'aprscot', '-f', '--no-pager']);
        follow.emit('line 1\n');
        follow.emit('line 2\n');
        await waitFor(() => expect(logsPre()).toBe('line 1\nline 2\n'));

        fireEvent.click(screen.getByRole('button', { name: 'Follow Logs' }));
        await waitFor(() => expect(logsPre()).toBe('Already following logs.'));
        expect(mock.callsFor('journalctl')).toHaveLength(1);

        fireEvent.click(screen.getByRole('button', { name: 'Stop Following' }));
        await waitFor(() => expect(logsPre()).toBe('Stopped following logs.'));
        expect(follow.closed).toBe(true);

        fireEvent.click(screen.getByRole('button', { name: 'Stop Following' }));
        await waitFor(() => expect(logsPre()).toBe('Not currently following logs.'));
    });

    test('a follow process that ends lets a new one start', async () => {
        onSpawn(args => (args[0] === 'journalctl' ? 'pending' : ''));
        openDebug();
        fireEvent.click(screen.getByRole('button', { name: 'Follow Logs' }));
        mock.callsFor('journalctl')[0].finish();

        fireEvent.click(screen.getByRole('button', { name: 'Stop Following' }));
        await waitFor(() => expect(logsPre()).toBe('Not currently following logs.'));
        fireEvent.click(screen.getByRole('button', { name: 'Follow Logs' }));
        expect(mock.callsFor('journalctl')).toHaveLength(2);
    });

    test('a failing follow process reports the failure and can be restarted', async () => {
        onSpawn(args => (args[0] === 'journalctl' ? 'pending' : ''));
        openDebug();
        fireEvent.click(screen.getByRole('button', { name: 'Follow Logs' }));
        mock.callsFor('journalctl')[0].error(new Error('journal gone'));

        await waitFor(() => expect(logsPre()).toBe('Failed to follow logs.'));
        fireEvent.click(screen.getByRole('button', { name: 'Follow Logs' }));
        expect(mock.callsFor('journalctl')).toHaveLength(2);
    });

    test('closes a running follow process on unmount', () => {
        onSpawn(args => (args[0] === 'journalctl' ? 'pending' : ''));
        const view = renderApp();
        fireEvent.click(screen.getByRole('button', { name: 'Expand debug' }));
        fireEvent.click(screen.getByRole('button', { name: 'Follow Logs' }));
        const follow = mock.callsFor('journalctl')[0];

        view.unmount();

        expect(follow.closed).toBe(true);
    });
});
