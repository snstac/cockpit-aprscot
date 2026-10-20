// @vitest-environment jsdom
/*
 * Copyright Sensors & Signals LLC https://www.snstac.com/
 */

import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

// Shipped to /usr/share/metainfo by nfpm.yaml and read by `make po/aprscot.pot`.
const METAINFO = 'com.snstac.cockpit_aprscot.metainfo.xml';

describe('AppStream metainfo', () => {
    const doc = new DOMParser().parseFromString(readFileSync(METAINFO, 'utf-8'), 'application/xml');

    test('is well-formed XML', () => {
        expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    });

    test('describes the aprscot Cockpit add-on', () => {
        expect(doc.documentElement.tagName).toBe('component');
        expect(doc.querySelector('component > id')?.textContent).toBe('com.snstac.cockpit_aprscot');
        expect(doc.querySelector('launchable[type="cockpit-manifest"]')?.textContent).toBe('aprscot');
    });
});

describe('index.html', () => {
    test('is titled for APRSCOT', () => {
        const doc = new DOMParser().parseFromString(readFileSync('src/index.html', 'utf-8'), 'text/html');
        expect(doc.title).toBe('APRSCOT - APRS to TAK Gateway');
    });
});
