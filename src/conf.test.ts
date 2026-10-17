/*
 * Copyright Sensors & Signals LLC https://www.snstac.com/
 */

import { describe, expect, test } from 'vitest';

import { CONF_PARAMS } from './conf';

function accepts(key: string, value: string): boolean {
    const def = CONF_PARAMS[key];
    if (def.validation && !def.validation.test(value))
        return false;
    if (def.type === 'number' && def.range && value !== '') {
        const num = Number(value);
        if (isNaN(num) || num < def.range[0] || num > def.range[1])
            return false;
    }
    if (def.type === 'enum' && def.options && !def.options.includes(value))
        return false;
    return true;
}

describe('CONF_PARAMS schema', () => {
    test.each(Object.entries(CONF_PARAMS))('%s default value is valid for its own definition', (key, def) => {
        // Empty defaults are allowed for optional fields (the UI skips validation for them).
        if (def.defaultValue === '' && def.required !== true)
            return;
        expect(accepts(key, def.defaultValue)).toBe(true);
    });

    test.each(Object.entries(CONF_PARAMS))('%s has a description and consistent type metadata', (_key, def) => {
        expect(def.description.length).toBeGreaterThan(0);
        if (def.type === 'enum')
            expect(def.options?.length).toBeGreaterThan(0);
        if (def.range) {
            expect(def.type).toBe('number');
            expect(def.range[0]).toBeLessThan(def.range[1]);
        }
    });

    test('COT_URL is the only required parameter', () => {
        const required = Object.entries(CONF_PARAMS).filter(([, d]) => d.required === true)
                .map(([k]) => k);
        expect(required).toEqual(['COT_URL']);
    });

    test('covers every path the TLS upload card can install', () => {
        for (const key of ['PYTAK_TLS_CLIENT_CERT', 'PYTAK_TLS_CLIENT_KEY', 'PYTAK_TLS_CLIENT_CAFILE'])
            expect(CONF_PARAMS[key]?.type).toBe('path');
    });
});

describe('CONF_PARAMS validation', () => {
    const cases: Array<[string, string[], string[]]> = [
        [
            'COT_URL',
            [
                'udp+wo://239.2.3.1:6969', 'udp://10.0.0.1:4242', 'tcp://tak:8087', 'tls://tak.example:8089',
                'http://h', 'https://h/x', 'file:///tmp/cot.xml', 'log://stdout', 'tcp+wo://h:1',
                'udp+broadcast://255.255.255.255:6969',
            ],
            ['', 'tak:8087', 'ftp://tak:21', 'udp://', 'udp://has space:1', 'UDP://h:1'],
        ],
        ['KISS_HOST', ['', 'localhost', '127.0.0.1', 'dire-wolf.local', 'tnc_1'], ['has space', 'host:8001', 'a/b']],
        ['KISS_PORT', ['1', '8001', '65535'], ['0', '65536', '123456', '-1', 'abc', '80.5']],
        ['APRSIS_CALLSIGN', ['SUNSET', 'N0CALL-9', 'a1'], ['', 'TOOLONGCALL', 'N0 CALL', 'N0CALL_1']],
        ['APRSIS_PASSCODE', ['-1', '0', '12345'], ['', 'abc', '1.5', '--1']],
        ['APRSIS_FILTER', ['m/50', 'r/37.7/-122.4/100 t/p', ''], []],
        ['APRSIS_HOST', ['rotate.aprs.net', 'noam.aprs2.net'], ['', 'host name', 'host:14580']],
        ['APRSIS_PORT', ['14580', '1', '65535'], ['0', '65536', 'x']],
        ['COT_STALE', ['1', '3600', '604800'], ['0', '604801', '-5', '1.5']],
        ['COT_TYPE', ['a-f-G-I-U-T-r', 'a-n-G'], ['', 'a', 'A-f-G', 'a--G', 'a-f G']],
        ['SENSOR_LAT', ['', '0', '90', '-90', '89.999', '-33.8688', '90.000'], ['91', '-90.5', '100', '1e3', 'N37']],
        ['SENSOR_LON', ['', '0', '180', '-180', '179.99', '151.2093', '-180.0'], ['181', '-180.1', '999', '1000']],
        ['TAK_PROTO', ['0', '1', '2'], ['', '3', '01', 'xml']],
        ['PYTAK_TLS_CLIENT_CERT', ['', '/etc/aprscot/tls/client.crt'], ['relative/path.pem', '/etc/has space.pem']],
        ['PYTAK_TLS_CLIENT_KEY', ['', '/etc/aprscot/tls/client.key'], ['client.key']],
        ['PYTAK_TLS_CLIENT_CAFILE', ['', '/etc/aprscot/tls/ca.crt'], ['ca.crt', ' /etc/ca.crt']],
        ['DEBUG', ['', 'true', 'false', 'TRUE', '0', '1'], ['yes', '2', 'on']],
    ];

    test('has a case table entry for every parameter', () => {
        expect(cases.map(([k]) => k).sort()).toEqual(Object.keys(CONF_PARAMS).sort());
    });

    describe.each(cases)('%s', (key, valid, invalid) => {
        test.each(valid)('accepts %j', value => {
            expect(accepts(key, value)).toBe(true);
        });
        if (invalid.length) {
            test.each(invalid)('rejects %j', value => {
                expect(accepts(key, value)).toBe(false);
            });
        }
    });
});
