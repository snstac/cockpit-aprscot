// @vitest-environment jsdom
/*
 * Copyright Sensors & Signals LLC https://www.snstac.com/
 */

import { act } from 'react';
import { afterEach, expect, test } from 'vitest';
import { waitFor } from '@testing-library/react';

import { mock } from './__mocks__/cockpit';
// Registers the DOMContentLoaded handler; nothing renders until it fires.
import './index';

afterEach(() => {
    document.body.innerHTML = '';
});

test('mounts the application into #app once the DOM is ready', async () => {
    mock.reset();
    document.body.innerHTML = '<div id="app"></div>';

    expect(document.querySelector('[data-testid="aprscot-app"]')).toBeNull();

    await act(async () => {
        document.dispatchEvent(new Event('DOMContentLoaded'));
    });

    await waitFor(() => expect(document.querySelector('#app [data-testid="aprscot-app"]')).not.toBeNull());
    expect(document.querySelector('[data-testid="aprscot-config-card"]')).not.toBeNull();
});
