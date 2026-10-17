// @vitest-environment jsdom
/*
 * Copyright Sensors & Signals LLC https://www.snstac.com/
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
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
    ])('accepts in-range %s=%s', async (key, value) => {
        renderApp();
        fireEvent.change(input(key), { target: { value } });
        await waitFor(() => expect(screen.getByText(/unsaved changes/)).toBeTruthy());
        expect(screen.queryByText(/Value must be between|Invalid value/)).toBeNull();
    });
});
